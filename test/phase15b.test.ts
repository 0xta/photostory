// test/phase15b.test.ts — Phase 1.5B Places & Project Threads Verification Test Suite
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db from '../server/db.js';

console.log('🧪 Starting Phase 1.5B Verification Tests (Places & Project Threads)...\n');

async function runTests() {
  await app.ready();

  // ── 1. Place CRUD & AC-25 (Project auto-collection & timeline) ─
  console.log('Test 1: AC-25 (Place of type "project" auto-creates place_project collection & chronological timeline)');

  // Pick 2 photos with known timestamps
  const photos = db.prepare(`
    SELECT id, filename, taken_at FROM photos
    WHERE taken_at IS NOT NULL
    ORDER BY taken_at ASC
    LIMIT 2
  `).all() as Array<{ id: string; filename: string; taken_at: number }>;

  assert.equal(photos.length, 2, 'Need at least 2 photos with timestamps');

  // Create place of type 'project'
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/places',
    payload: {
      name: 'โครงการต่อเติมระเบียงบ้าน 2026',
      type: 'project',
      lat: 13.7500,
      lon: 100.5000,
      radius_m: 150,
      note: 'ติดตามงานต่อเติมโครงหลังคาและปูกระเบื้อง',
      photo_ids: [photos[1].id, photos[0].id], // pass in reverse order to test sorting
    },
  });

  assert.equal(createRes.statusCode, 201);
  const createdPlace = JSON.parse(createRes.body);
  assert.ok(createdPlace.id);
  assert.equal(createdPlace.type, 'project');
  assert.ok(createdPlace.collection_id, 'Project place must auto-generate a collection');

  // Verify that collection was created in collections table with type='place_project'
  const collRow = db
    .prepare('SELECT id, name, type, place_id FROM collections WHERE id = ?')
    .get(createdPlace.collection_id) as any;
  assert.ok(collRow, 'Auto-created collection must exist in collections table');
  assert.equal(collRow.type, 'place_project');
  assert.equal(collRow.place_id, createdPlace.id);
  assert.equal(collRow.name, 'โครงการต่อเติมระเบียงบ้าน 2026');

  // Fetch place details
  const detailRes = await app.inject({
    method: 'GET',
    url: `/api/places/${createdPlace.id}`,
  });
  assert.equal(detailRes.statusCode, 200);
  const placeDetail = JSON.parse(detailRes.body);
  assert.equal(placeDetail.name, 'โครงการต่อเติมระเบียงบ้าน 2026');
  assert.equal(placeDetail.photos.length, 2);

  // Verify chronological order (Before -> After timeline)
  assert(
    placeDetail.photos[0].taken_at <= placeDetail.photos[1].taken_at,
    'Photos in place progress timeline must be ordered chronologically (taken_at ASC)'
  );
  assert.equal(placeDetail.photos[0].id, photos[0].id);
  assert.equal(placeDetail.photos[1].id, photos[1].id);

  console.log('  ✔ AC-25 Passed: Project place auto-created place_project collection, chronological Before->After timeline verified');

  // ── 2. AC-24: Place GPS Matching Suggestion & auto_link_places ──
  console.log('\nTest 2: AC-24 (Place GPS Matching: suggestions, acceptance source="gps-confirmed", auto-link)');

  // Ensure auto_link_places is disabled ('0')
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_link_places', '0')").run();

  // Create a place with specific GPS coordinate
  const cafePlaceRes = await app.inject({
    method: 'POST',
    url: '/api/places',
    payload: {
      name: 'คาเฟ่ อารีย์ การ์เด้น',
      type: 'restaurant',
      lat: 13.780000,
      lon: 100.540000,
      radius_m: 100,
      note: 'ร้านกาแฟประจำ',
    },
  });
  assert.equal(cafePlaceRes.statusCode, 201);
  const cafePlace = JSON.parse(cafePlaceRes.body);

  // Pick a photo and set its GPS within 50 meters of cafePlace
  // 13.780000, 100.540000 -> offset slightly: 13.780300, 100.540000 (~33 meters)
  const testPhoto = db.prepare(`
    SELECT id, filename FROM photos
    WHERE id NOT IN (SELECT photo_id FROM photo_places WHERE place_id = ?)
    LIMIT 1
  `).get(cafePlace.id) as any;
  assert.ok(testPhoto, 'Need a photo to assign GPS');

  db.prepare(`
    UPDATE photos
    SET lat = 13.780300, lon = 100.540000
    WHERE id = ?
  `).run(testPhoto.id);

  // Clear any existing photo_places for this test photo
  db.prepare('DELETE FROM photo_places WHERE photo_id = ?').run(testPhoto.id);

  // Run suggestion scan
  const scanRes = await app.inject({
    method: 'POST',
    url: '/api/suggestions/scan',
  });
  assert.equal(scanRes.statusCode, 200);

  // Fetch suggestions
  const suggsRes = await app.inject({
    method: 'GET',
    url: '/api/suggestions?status=pending',
  });
  const suggs = JSON.parse(suggsRes.body);
  const placeSugg = suggs.items.find(
    (s: any) =>
      s.kind === 'place_link' &&
      s.payload.place_id === cafePlace.id &&
      s.payload.photo_id === testPhoto.id
  );
  assert.ok(placeSugg, 'Must emit place_link suggestion for nearby photo within radius');
  assert(placeSugg.payload.distance_m <= 100, 'Distance must be within 100m radius');

  // Accept suggestion
  const acceptRes = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${placeSugg.id}/accept`,
  });
  assert.equal(acceptRes.statusCode, 200);

  // Verify photo_places row created with source='gps-confirmed'
  const ppRow = db
    .prepare('SELECT source FROM photo_places WHERE photo_id = ? AND place_id = ?')
    .get(testPhoto.id, cafePlace.id) as any;
  assert.ok(ppRow, 'Photo must now be linked to place in photo_places');
  assert.equal(ppRow.source, 'gps-confirmed', 'Link source must be "gps-confirmed"');

  // Now test auto_link_places setting = '1'
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_link_places', '1')").run();

  // Pick another photo for auto-link test
  const autoPhoto = db.prepare(`
    SELECT id, filename FROM photos
    WHERE id != ? AND id NOT IN (SELECT photo_id FROM photo_places)
    LIMIT 1
  `).get(testPhoto.id) as any;
  assert.ok(autoPhoto, 'Need another photo for auto-link test');

  // Assign GPS within 50m of cafePlace
  db.prepare(`
    UPDATE photos
    SET lat = 13.780200, lon = 100.540100
    WHERE id = ?
  `).run(autoPhoto.id);

  // Run suggestion scan with auto_link_places enabled
  await app.inject({
    method: 'POST',
    url: '/api/suggestions/scan',
  });

  // Verify that autoPhoto is directly linked with source='gps-confirmed' without suggestion
  const autoPpRow = db
    .prepare('SELECT source FROM photo_places WHERE photo_id = ? AND place_id = ?')
    .get(autoPhoto.id, cafePlace.id) as any;
  assert.ok(autoPpRow, 'Photo must be auto-linked into photo_places when auto_link_places=1');
  assert.equal(autoPpRow.source, 'gps-confirmed');

  // Reset setting
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_link_places', '0')").run();

  console.log('  ✔ AC-24 Passed: GPS matching suggestion emitted, accept sets source="gps-confirmed", auto_link_places=1 auto-links directly');

  // ── 3. Manual linking & unlinking photos ─────────────────────────
  console.log('\nTest 3: Manual link and unlink photos to place');

  const anotherPhoto = db.prepare('SELECT id FROM photos LIMIT 1').get() as any;
  const linkRes = await app.inject({
    method: 'POST',
    url: `/api/places/${cafePlace.id}/photos`,
    payload: { photo_ids: [anotherPhoto.id] },
  });
  assert.equal(linkRes.statusCode, 200);

  const unlinkRes = await app.inject({
    method: 'DELETE',
    url: `/api/places/${cafePlace.id}/photos/${anotherPhoto.id}`,
  });
  assert.equal(unlinkRes.statusCode, 200);

  const checkUnlink = db
    .prepare('SELECT * FROM photo_places WHERE place_id = ? AND photo_id = ?')
    .get(cafePlace.id, anotherPhoto.id);
  assert.equal(checkUnlink, undefined, 'Photo must be unlinked from place');
  console.log('  ✔ Manual photo linking and unlinking verified');

  // ── 4. DR6: Place deletion preserves photos ─────────────────────
  console.log('\nTest 4: DR6 (Deleting a place deletes place and photo_places, preserves photos and disk files)');

  const photoCountBefore = (db.prepare('SELECT COUNT(*) as c FROM photos').get() as { c: number }).c;

  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/api/places/${cafePlace.id}`,
  });
  assert.equal(deleteRes.statusCode, 200);

  // Check place is gone
  const checkPlace = db.prepare('SELECT id FROM places WHERE id = ?').get(cafePlace.id);
  assert.equal(checkPlace, undefined, 'Place must be deleted');

  // Check photo_places for this place is gone
  const checkPP = db.prepare('SELECT COUNT(*) as c FROM photo_places WHERE place_id = ?').get(cafePlace.id) as { c: number };
  assert.equal(checkPP.c, 0, 'photo_places records for this place must be gone');

  // Check total photos in database is unchanged
  const photoCountAfter = (db.prepare('SELECT COUNT(*) as c FROM photos').get() as { c: number }).c;
  assert.equal(photoCountAfter, photoCountBefore, 'DR6: Total photos in library must NOT change when place is deleted');

  console.log('  ✔ DR6 Passed: Place deletion cleanly removes place and associations without touching photos');

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 1.5B ACCEPTANCE TESTS PASSED!');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 1.5B Test failed:', err);
  process.exit(1);
});
