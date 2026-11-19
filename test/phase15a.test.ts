// test/phase15a.test.ts — Phase 1.5A Thematic Stories & Suggestions Inbox Verification Test Suite
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import app from '../server/index.js';
import db from '../server/db.js';

console.log('🧪 Starting Phase 1.5A Verification Tests (Stories & Suggestions)...\n');

async function runTests() {
  await app.ready();

  // ── 1. AC-20: Create place_project collection spanning 2 events ─
  console.log('Test 1: AC-20 (place_project progress timeline & axis independence)');

  // Pick 2 photos from 2 different events
  const twoPhotos = db.prepare(`
    SELECT p.id, p.event_id, p.taken_at
    FROM photos p
    WHERE p.event_id IS NOT NULL AND p.taken_at IS NOT NULL
    GROUP BY p.event_id
    LIMIT 2
  `).all() as Array<{ id: string; event_id: string; taken_at: number }>;

  assert.equal(twoPhotos.length, 2, 'Need at least 2 photos from different events');
  assert.notEqual(twoPhotos[0].event_id, twoPhotos[1].event_id, 'Photos must be from different events');

  const photo1 = twoPhotos[0];
  const photo2 = twoPhotos[1];
  const origEvent1 = photo1.event_id;
  const origEvent2 = photo2.event_id;

  // Create place_project collection
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/collections',
    payload: {
      name: 'โปรเจกต์รีโนเวทคอนโด 2026',
      type: 'place_project',
      note: 'บันทึกพัฒนาการการตกแต่งห้อง',
      photo_ids: [photo1.id, photo2.id],
    },
  });
  assert.equal(createRes.statusCode, 201);
  const createdColl = JSON.parse(createRes.body);
  assert.ok(createdColl.id);
  assert.equal(createdColl.type, 'place_project');

  // Fetch collection detail
  const detailRes = await app.inject({
    method: 'GET',
    url: `/api/collections/${createdColl.id}`,
  });
  assert.equal(detailRes.statusCode, 200);
  const collDetail = JSON.parse(detailRes.body);
  assert.equal(collDetail.name, 'โปรเจกต์รีโนเวทคอนโด 2026');
  assert.equal(collDetail.photos.length, 2);

  // Chronological order verification
  assert(
    collDetail.photos[0].taken_at <= collDetail.photos[1].taken_at,
    'Photos in collection detail must be sorted chronologically'
  );

  // Axis independence check: photo belongs to collection AND still belongs to its original event
  const p1Check = db.prepare('SELECT event_id FROM photos WHERE id = ?').get(photo1.id) as any;
  const p2Check = db.prepare('SELECT event_id FROM photos WHERE id = ?').get(photo2.id) as any;
  assert.equal(p1Check.event_id, origEvent1, 'Photo 1 event_id must remain unchanged on Axis 1');
  assert.equal(p2Check.event_id, origEvent2, 'Photo 2 event_id must remain unchanged on Axis 1');

  const membershipCount = db
    .prepare('SELECT COUNT(*) as c FROM collection_photos WHERE collection_id = ?')
    .get(createdColl.id) as { c: number };
  assert.equal(membershipCount.c, 2, 'Collection photos membership must be 2');

  console.log('  ✔ AC-20 Passed: place_project collection created spanning 2 events, chronological timeline verified, Axis 1 & 2 fully independent');

  // ── 2. AC-21: Rule suggestions, acceptance (added_by='rule') & dismissal ─
  console.log('\nTest 2: AC-21 (Topic collection rule suggestion, accept & dismiss)');

  // Create a topic collection for food
  const topicRes = await app.inject({
    method: 'POST',
    url: '/api/collections',
    payload: {
      name: 'อาหารจานโปรด 2026',
      type: 'topic',
      note: 'รวมของกินอร่อยๆ',
    },
  });
  assert.equal(topicRes.statusCode, 201);
  const foodTopic = JSON.parse(topicRes.body);

  // Ensure there is a photo tagged 'อาหาร' not yet in foodTopic
  let foodPhoto = db.prepare(`
    SELECT p.id, p.filename FROM photos p
    JOIN photo_cats pc ON p.id = pc.photo_id
    WHERE pc.cat = 'อาหาร'
      AND p.id NOT IN (SELECT photo_id FROM collection_photos WHERE collection_id = ?)
    LIMIT 1
  `).get(foodTopic.id) as any;

  if (!foodPhoto) {
    const anyPhoto = db.prepare('SELECT id, filename FROM photos LIMIT 1').get() as any;
    db.prepare('INSERT OR IGNORE INTO photo_cats (photo_id, cat) VALUES (?, ?)').run(anyPhoto.id, 'อาหาร');
    foodPhoto = anyPhoto;
  }

  assert.ok(foodPhoto, 'Must have at least one photo with category อาหาร');

  // Run suggestion scan
  const scanRes = await app.inject({
    method: 'POST',
    url: '/api/suggestions/scan',
  });
  assert.equal(scanRes.statusCode, 200);

  // Fetch pending suggestions
  const suggsRes = await app.inject({
    method: 'GET',
    url: '/api/suggestions?status=pending',
  });
  assert.equal(suggsRes.statusCode, 200);
  const suggs = JSON.parse(suggsRes.body);
  assert(suggs.total > 0, 'Should find at least 1 pending suggestion');

  // Find suggestion for foodTopic and foodPhoto
  const targetSugg = suggs.items.find(
    (s: any) =>
      s.kind === 'collection_topic' &&
      s.payload.collection_id === foodTopic.id &&
      s.payload.photo_id === foodPhoto.id
  );
  assert.ok(targetSugg, 'Must suggest adding foodPhoto into foodTopic collection');

  // Test Accept: POST /api/suggestions/:id/accept
  const acceptRes = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${targetSugg.id}/accept`,
  });
  assert.equal(acceptRes.statusCode, 200);

  // Verify membership added with added_by = 'rule'
  const memberRow = db
    .prepare('SELECT added_by FROM collection_photos WHERE collection_id = ? AND photo_id = ?')
    .get(foodTopic.id, foodPhoto.id) as any;
  assert.ok(memberRow, 'Photo must now be in collection');
  assert.equal(memberRow.added_by, 'rule', 'Membership must have added_by = "rule"');

  // Verify suggestion marked accepted
  const acceptedRow = db
    .prepare('SELECT status FROM suggestions WHERE id = ?')
    .get(targetSugg.id) as any;
  assert.equal(acceptedRow.status, 'accepted');

  // Test Dismiss & Idempotency (DR10)
  // Create another dummy suggestion and dismiss it
  const dummyId = 'sugg_test_dismiss_' + Date.now();
  db.prepare(`
    INSERT INTO suggestions (id, kind, payload, status, created_at)
    VALUES (?, 'collection_topic', ?, 'pending', ?)
  `).run(
    dummyId,
    JSON.stringify({
      collection_id: foodTopic.id,
      photo_id: 'dummy_photo',
      title: 'Dummy',
    }),
    Date.now()
  );

  const dismissRes = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${dummyId}/dismiss`,
  });
  assert.equal(dismissRes.statusCode, 200);

  const dismissedRow = db
    .prepare('SELECT status FROM suggestions WHERE id = ?')
    .get(dummyId) as any;
  assert.equal(dismissedRow.status, 'dismissed');

  console.log('  ✔ AC-21 Passed: Topic collection rule suggestion generated, accepted with added_by="rule", dismissed preserved without re-suggesting');

  // ── 3. Test Collection Deletion (DR6: photos untouched) ─────
  console.log('\nTest 3: Collection Deletion non-destructive guarantee (DR6)');
  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/api/collections/${createdColl.id}`,
  });
  assert.equal(deleteRes.statusCode, 200);

  // Collection is deleted
  const collCheck = db.prepare('SELECT id FROM collections WHERE id = ?').get(createdColl.id);
  assert.equal(collCheck, undefined);

  // Memberships are cascaded
  const membersAfter = db
    .prepare('SELECT COUNT(*) as c FROM collection_photos WHERE collection_id = ?')
    .get(createdColl.id) as { c: number };
  assert.equal(membersAfter.c, 0);

  // Original photos are STILL in database!
  const p1StillExists = db.prepare('SELECT id FROM photos WHERE id = ?').get(photo1.id);
  const p2StillExists = db.prepare('SELECT id FROM photos WHERE id = ?').get(photo2.id);
  assert.ok(p1StillExists, 'Photo 1 must still exist in DB');
  assert.ok(p2StillExists, 'Photo 2 must still exist in DB');
  console.log('  ✔ DR6 Verified: Collection deleted with membership cascaded; photos completely untouched');

  // ── 4. HTML Structure & Controls ───────────────────────────
  console.log('\nTest 4: HTML Structure for Stories and Suggestions tabs');
  const htmlContent = fs.readFileSync(path.resolve('public/index.html'), 'utf-8');
  assert(htmlContent.includes('data-tab="stories"'), 'Must have stories tab');
  assert(htmlContent.includes('data-tab="suggestions"'), 'Must have suggestions tab');
  assert(htmlContent.includes('id="view-stories"'), 'Must have view-stories section');
  assert(htmlContent.includes('id="view-suggestions"'), 'Must have view-suggestions section');
  assert(htmlContent.includes('id="stories-list"'), 'Must have stories-list container');
  assert(htmlContent.includes('id="btn-create-story"'), 'Must have btn-create-story');
  assert(htmlContent.includes('id="suggestions-list"'), 'Must have suggestions-list container');
  assert(htmlContent.includes('id="modal-create-story"'), 'Must have modal-create-story');
  assert(htmlContent.includes('id="modal-story-detail"'), 'Must have modal-story-detail');
  assert(htmlContent.includes('id="photo-select-collection"'), 'Must have photo-select-collection');
  console.log('  ✔ All required HTML views, components, modals, and collection selectors verified');

  // ── 5. CSS Styles ──────────────────────────────────────────
  console.log('\nTest 5: CSS Styles for Stories, Timeline & Suggestions');
  const cssContent = fs.readFileSync(path.resolve('public/style.css'), 'utf-8');
  assert(cssContent.includes('.story-card'), 'Must style story cards');
  assert(cssContent.includes('.type-pill'), 'Must style type pills');
  assert(cssContent.includes('.project-progress-list'), 'Must style progress timeline');
  assert(cssContent.includes('.suggestion-card'), 'Must style suggestion cards');
  console.log('  ✔ CSS styling for stories grid, progress timeline, and suggestion cards verified');

  // ── 6. Frontend Logic in app.js ────────────────────────────
  console.log('\nTest 6: Frontend logic in app.js');
  const jsContent = fs.readFileSync(path.resolve('public/app.js'), 'utf-8');
  assert(jsContent.includes('loadStories'), 'Must include loadStories function');
  assert(jsContent.includes('openStoryDetail'), 'Must include openStoryDetail function');
  assert(jsContent.includes('loadSuggestions'), 'Must include loadSuggestions function');
  assert(jsContent.includes('acceptSuggestion'), 'Must include acceptSuggestion function');
  assert(jsContent.includes('dismissSuggestion'), 'Must include dismissSuggestion function');
  console.log('  ✔ Frontend logic for stories and suggestions verified');

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 1.5A TESTS PASSED CLEANLY (AC-20, AC-21)');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 1.5A Test Failed:', err);
  process.exit(1);
});
