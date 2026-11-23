// test/phase15d.test.ts — Phase 1.5D Recap & Extended Backup Verification Test Suite
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db from '../server/db.js';
import { pickKeepers, generateRecap } from '../server/workers/recap.js';
import { runClustering } from '../server/workers/cluster.js';

console.log('🧪 Starting Phase 1.5D Verification Tests (Recap & Extended Backup)...\n');

async function runTests() {
  await app.ready();

  // Cleanup test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM collections WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM places WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM meals WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM recaps WHERE year = 2026 AND (month = 11 OR month = 10 OR month IS NULL)").run();

  // ── Setup Nov 2026 Test Data ──────────────────────────────────
  const nov1 = new Date('2026-11-05T10:00:00Z').getTime();
  const nov2 = new Date('2026-11-12T14:00:00Z').getTime();
  const nov3 = new Date('2026-11-20T19:00:00Z').getTime();

  // 1. Friend
  db.prepare(`
    INSERT OR REPLACE INTO persons (id, name, nick, color, created_at)
    VALUES ('test_friend_somchai', 'สมชาย สายลุย', 'ชาย', '#3b82f6', ?)
  `).run(Date.now());

  // 2. Place & Restaurant
  db.prepare(`
    INSERT OR REPLACE INTO places (id, name, type, lat, lon, radius_m, created_at)
    VALUES ('test_place_cafe', 'ร้านกาแฟริมน้ำ อารีย์', 'restaurant', 13.78, 100.54, 100, ?)
  `).run(Date.now());

  // 3. Events
  db.prepare(`
    INSERT OR REPLACE INTO events (id, name, place, ts_start, ts_end, named)
    VALUES ('test_ev_recap1', 'เวิร์กช็อปเทคโนโลยี 2026', 'สยามพารากอน', ?, ?, 1)
  `).run(nov1, nov1 + 3600000);

  db.prepare(`
    INSERT OR REPLACE INTO events (id, name, place, ts_start, ts_end, named)
    VALUES ('test_ev_recap2', 'ทริปคาเฟ่อารีย์', 'อารีย์', ?, ?, 1)
  `).run(nov2, nov2 + 3600000);

  // 4. Photos (6 photos in Nov 2026)
  const testPhotos = [
    { id: 'test_rc_p1', fn: 'recap_1.jpg', ts: nov1, ev: 'test_ev_recap1', burst: 0 },
    { id: 'test_rc_p2', fn: 'recap_2.jpg', ts: nov1 + 60000, ev: 'test_ev_recap1', burst: 0 },
    { id: 'test_rc_p3', fn: 'recap_3.jpg', ts: nov2, ev: 'test_ev_recap2', burst: 0 },
    { id: 'test_rc_p4', fn: 'recap_4.jpg', ts: nov2 + 60000, ev: 'test_ev_recap2', burst: 0 },
    { id: 'test_rc_p5', fn: 'recap_5.jpg', ts: nov3, ev: null, burst: 0 },
    { id: 'test_rc_p6', fn: 'recap_6.jpg', ts: nov3 + 60000, ev: null, burst: 0 },
  ];

  for (const p of testPhotos) {
    db.prepare(`
      INSERT OR REPLACE INTO photos (id, path, filename, sha256, taken_at, event_id, burst, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, 'test/' + p.fn, p.fn, 'sha_' + p.id, p.ts, p.ev, p.burst, Date.now());
  }

  // Tag person to p1 & p3
  db.prepare('INSERT OR IGNORE INTO photo_persons (photo_id, person_id, source) VALUES (?, ?, ?)').run('test_rc_p1', 'test_friend_somchai', 'manual');
  db.prepare('INSERT OR IGNORE INTO photo_persons (photo_id, person_id, source) VALUES (?, ?, ?)').run('test_rc_p3', 'test_friend_somchai', 'manual');

  // Link place to p3 & p4
  db.prepare('INSERT OR IGNORE INTO photo_places (photo_id, place_id, source) VALUES (?, ?, ?)').run('test_rc_p3', 'test_place_cafe', 'manual');
  db.prepare('INSERT OR IGNORE INTO photo_places (photo_id, place_id, source) VALUES (?, ?, ?)').run('test_rc_p4', 'test_place_cafe', 'manual');

  // Meal at cafe
  db.prepare(`
    INSERT OR REPLACE INTO meals (id, place_id, meal_type, rating, note, taken_at, created_at)
    VALUES ('test_rc_m1', 'test_place_cafe', 'cafe', 5, 'กาแฟดริปอร่อยมาก บรรยากาศดี', ?, ?)
  `).run(nov2, Date.now());
  db.prepare('INSERT OR IGNORE INTO meal_photos (meal_id, photo_id) VALUES (?, ?)').run('test_rc_m1', 'test_rc_p3');
  db.prepare('INSERT OR IGNORE INTO meal_photos (meal_id, photo_id) VALUES (?, ?)').run('test_rc_m1', 'test_rc_p4');

  // ── 1. AC-26: Monthly recap generation (FR-1301/1302/8.8) ────
  console.log('Test 1: AC-26 (Monthly recap generation -> Thai narrative + stats + keepers + friends/places/top meal)');
  const resRecap = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/11',
  });
  assert.equal(resRecap.statusCode, 200);
  const recapData = JSON.parse(resRecap.body);

  assert.equal(recapData.year, 2026);
  assert.equal(recapData.month, 11);
  assert.ok(recapData.content, 'Recap content must be present');
  assert.match(recapData.content.headline, /สรุปเดือนพฤศจิกายน 2569/);
  assert.ok(recapData.content.narrative.length > 20, 'Narrative must be non-empty Thai prose');
  assert.match(recapData.content.narrative, /บันทึกความทรงจำ/);
  assert.equal(recapData.content.facts.photo_count, 6);
  assert.ok(recapData.content.facts.friend_count >= 1);
  assert.ok(recapData.content.highlights.length >= 4 && recapData.content.highlights.length <= 6, 'Keepers count must be 4..6');
  assert.ok(recapData.content.friends.length >= 1, 'Somchai must appear in friends');
  assert.equal(recapData.content.friends[0].name, 'สมชาย สายลุย');
  assert.ok(recapData.content.top_meal, 'Top meal should be present');
  assert.equal(recapData.content.top_meal.place_name, 'ร้านกาแฟริมน้ำ อารีย์');

  // Verify cached in SQLite recaps table
  const cachedRecap = db.prepare('SELECT * FROM recaps WHERE year = 2026 AND month = 11').get() as any;
  assert.ok(cachedRecap, 'Recap must be cached in recaps table');
  console.log('✓ AC-26: Generated monthly recap with headline, narrative, 4-6 keepers, friends, places, top meal; cached.');

  // ── 2. AC-27: Recap exports & stale regeneration (FR-1304) ────
  console.log('Test 2: AC-27 (Export recap as HTML, PDF, image; stale detection on adding photo)');
  // 2a. HTML Export
  const resHtml = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/11/export?format=html',
  });
  assert.equal(resHtml.statusCode, 200);
  assert.match(resHtml.headers['content-type'] || '', /text\/html/);
  assert.ok(resHtml.body.includes('สรุปเดือนพฤศจิกายน 2569'));
  assert.ok(resHtml.body.includes('สมชาย สายลุย'));

  // 2b. PDF Export
  const resPdf = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/11/export?format=pdf',
  });
  assert.equal(resPdf.statusCode, 200);
  assert.match(resPdf.headers['content-type'] || '', /application\/pdf/);
  const pdfRaw = resPdf.rawPayload;
  assert.ok(pdfRaw.subarray(0, 5).toString('ascii').startsWith('%PDF-'), 'PDF buffer must start with %PDF-');

  // 2c. Image Export
  const resImg = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/11/export?format=image',
  });
  assert.equal(resImg.statusCode, 200);
  assert.match(resImg.headers['content-type'] || '', /image\/png/);
  const imgRaw = resImg.rawPayload;
  // PNG magic bytes: 0x89 0x50 0x4E 0x47
  assert.equal(imgRaw[0], 0x89);
  assert.equal(imgRaw[1], 0x50);
  assert.equal(imgRaw[2], 0x4E);
  assert.equal(imgRaw[3], 0x47);

  // 2d. Month picker / browse past month
  const resPastMonth = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/10',
  });
  assert.equal(resPastMonth.statusCode, 200);
  const pastMonthData = JSON.parse(resPastMonth.body);
  assert.equal(pastMonthData.month, 10);

  // 2e. Stale detection: Initially not stale
  const resCheckFresh = await app.inject({ method: 'GET', url: '/api/recaps/2026/11' });
  assert.equal(JSON.parse(resCheckFresh.body).stale, false);

  // Add a new photo in Nov 2026
  db.prepare(`
    INSERT INTO photos (id, path, filename, taken_at, added_at)
    VALUES ('test_rc_p7', 'test/recap_7.jpg', 'recap_7.jpg', ?, ?)
  `).run(nov1 + 120000, Date.now());

  // Check now stale!
  const resCheckStale = await app.inject({ method: 'GET', url: '/api/recaps/2026/11' });
  assert.equal(JSON.parse(resCheckStale.body).stale, true, 'Recap must be marked stale after adding photo');

  // Force regenerate
  const resRegen = await app.inject({
    method: 'POST',
    url: '/api/recaps',
    payload: { year: 2026, month: 11 },
  });
  assert.equal(resRegen.statusCode, 200);
  const regenData = JSON.parse(resRegen.body);
  assert.equal(regenData.recap.content.facts.photo_count, 7, 'Fresh recap must count the new photo');

  const resCheckFreshAgain = await app.inject({ method: 'GET', url: '/api/recaps/2026/11' });
  assert.equal(JSON.parse(resCheckFreshAgain.body).stale, false, 'Recap must be fresh after regeneration');
  console.log('✓ AC-27: Exported as HTML, PDF, PNG image; browsed past month; stale detection & regenerate verified.');

  // ── 3. AC-28: Keeper selection & Recap durability (FR-1303, DR9)
  console.log('Test 3: AC-28 (Keepers exclude burst duplicates & spread across events; deleting recap loses no photo data)');

  const mockCandidatePhotos = [
    // Event A: burst cluster (p1, p2, p3 all burst=1)
    { id: 'b1', filename: 'b1.jpg', taken_at: 1000, event_id: 'evA', burst: 1 },
    { id: 'b2', filename: 'b2.jpg', taken_at: 2000, event_id: 'evA', burst: 1 },
    { id: 'b3', filename: 'b3.jpg', taken_at: 3000, event_id: 'evA', burst: 1 },
    // Event B
    { id: 'b4', filename: 'b4.jpg', taken_at: 10000, event_id: 'evB', burst: 0 },
    { id: 'b5', filename: 'b5.jpg', taken_at: 11000, event_id: 'evB', burst: 0 },
    // Event C
    { id: 'b6', filename: 'b6.jpg', taken_at: 20000, event_id: 'evC', burst: 0 },
    // Event D
    { id: 'b7', filename: 'b7.jpg', taken_at: 30000, event_id: 'evD', burst: 0 },
  ];

  const keepers = pickKeepers(mockCandidatePhotos, 4, 6);
  assert.ok(keepers.length >= 4 && keepers.length <= 6);

  // Redundant burst members b2 and b3 must be excluded!
  const keeperIds = keepers.map((k) => k.id);
  assert.ok(keeperIds.includes('b1'), 'Should include representative b1');
  assert.ok(!keeperIds.includes('b2'), 'Should exclude burst duplicate b2');
  assert.ok(!keeperIds.includes('b3'), 'Should exclude burst duplicate b3');

  // Verify spread across distinct events
  const keeperEvents = new Set(keepers.map((k) => k.event_id));
  assert.ok(keeperEvents.size >= 3, 'Keepers must be spread across at least 3 distinct events');

  // Deleting recap loses no source data
  const photoCountBefore = (db.prepare("SELECT COUNT(*) as c FROM photos WHERE id LIKE 'test_%'").get() as any).c;
  const resDel = await app.inject({
    method: 'DELETE',
    url: '/api/recaps/2026/11',
  });
  assert.equal(resDel.statusCode, 200);

  const photoCountAfter = (db.prepare("SELECT COUNT(*) as c FROM photos WHERE id LIKE 'test_%'").get() as any).c;
  assert.equal(photoCountBefore, photoCountAfter, 'Deleting recap must not delete any photos');

  // Regenerates identically
  const resRegenIdentical = await app.inject({
    method: 'GET',
    url: '/api/recaps/2026/11',
  });
  assert.equal(resRegenIdentical.statusCode, 200);
  assert.equal(JSON.parse(resRegenIdentical.body).content.facts.photo_count, 7);
  console.log('✓ AC-28: Burst exclusion verified; distinct event spread verified; recap deletion preserves all photos.');

  // ── 4. AC-29: Extended Backup & Restore (FR-801/802 extended) ──
  console.log('Test 4: AC-29 (Backup includes collections, places, meals, recaps; restore recreates them)');

  // Create a project collection
  db.prepare(`
    INSERT OR REPLACE INTO collections (id, name, type, note, created_at)
    VALUES ('test_coll_prj', 'โครงการตกแต่งคอนโด 2026', 'place_project', 'โครงการตกแต่ง', ?)
  `).run(Date.now());
  db.prepare('INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_at) VALUES (?, ?, ?)').run(
    'test_coll_prj', 'test_rc_p1', Date.now()
  );

  // 4a. Export backup
  const resBackup = await app.inject({ method: 'GET', url: '/api/backup' });
  assert.equal(resBackup.statusCode, 200);
  const backupJson = JSON.parse(resBackup.body);

  assert.ok(Array.isArray(backupJson.collections), 'Backup must include collections');
  assert.ok(Array.isArray(backupJson.collection_photos), 'Backup must include collection_photos');
  assert.ok(Array.isArray(backupJson.places), 'Backup must include places');
  assert.ok(Array.isArray(backupJson.photo_places), 'Backup must include photo_places');
  assert.ok(Array.isArray(backupJson.meals), 'Backup must include meals');
  assert.ok(Array.isArray(backupJson.meal_photos), 'Backup must include meal_photos');
  assert.ok(Array.isArray(backupJson.recaps), 'Backup must include recaps');

  // 4b. Clear
  const resClear = await app.inject({ method: 'POST', url: '/api/clear' });
  assert.equal(resClear.statusCode, 200);
  assert.equal((db.prepare('SELECT COUNT(*) as c FROM collections').get() as any).c, 0);
  assert.equal((db.prepare('SELECT COUNT(*) as c FROM places').get() as any).c, 0);
  assert.equal((db.prepare('SELECT COUNT(*) as c FROM meals').get() as any).c, 0);

  // Simulate re-importing the library photos (AC-29)
  for (const p of testPhotos) {
    db.prepare(`
      INSERT OR REPLACE INTO photos (id, path, filename, sha256, taken_at, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(p.id, 'test/' + p.fn, p.fn, 'sha_' + p.id, p.ts, Date.now());
  }

  // 4c. Restore
  const resRestore = await app.inject({
    method: 'POST',
    url: '/api/restore',
    payload: backupJson,
  });
  assert.equal(resRestore.statusCode, 200);
  const restoreSummary = JSON.parse(resRestore.body);
  assert.ok(restoreSummary.collections_restored >= 1, 'Collections must be restored');
  assert.ok(restoreSummary.places_restored >= 1, 'Places must be restored');
  assert.ok(restoreSummary.meals_restored >= 1, 'Meals must be restored');

  // Verify places, meals, collections in DB
  const restoredPlace = db.prepare("SELECT * FROM places WHERE id = 'test_place_cafe'").get();
  assert.ok(restoredPlace, 'Test place must be restored');
  const restoredMeal = db.prepare("SELECT * FROM meals WHERE id = 'test_rc_m1'").get();
  assert.ok(restoredMeal, 'Test meal must be restored');
  const restoredColl = db.prepare("SELECT * FROM collections WHERE id = 'test_coll_prj'").get();
  assert.ok(restoredColl, 'Test collection must be restored');
  console.log('✓ AC-29: Backup exported & restored collections, places, meals, and recaps successfully.');

  // ── 5. AC-30: Reclustering preserves Axis 2 & deletion safety (DR6/AD7)
  console.log('Test 5: AC-30 (Reclustering preserves all Axis 2 memberships; deleting Axis 2 items never deletes photos)');

  // Recluster
  runClustering();

  // Verify memberships are still intact
  const collPhotosCount = (db.prepare("SELECT COUNT(*) as c FROM collection_photos WHERE collection_id = 'test_coll_prj'").get() as any).c;
  assert.equal(collPhotosCount, 1, 'Collection photo membership preserved after recluster');

  const placePhotosCount = (db.prepare("SELECT COUNT(*) as c FROM photo_places WHERE place_id = 'test_place_cafe'").get() as any).c;
  assert.equal(placePhotosCount, 2, 'Place photo membership preserved after recluster');

  const mealPhotosCount = (db.prepare("SELECT COUNT(*) as c FROM meal_photos WHERE meal_id = 'test_rc_m1'").get() as any).c;
  assert.equal(mealPhotosCount, 2, 'Meal photo membership preserved after recluster');

  // Deleting Axis 2 items never deletes photos
  const totalPhotosBefore = (db.prepare('SELECT COUNT(*) as c FROM photos').get() as any).c;

  await app.inject({ method: 'DELETE', url: '/api/collections/test_coll_prj' });
  await app.inject({ method: 'DELETE', url: '/api/meals/test_rc_m1' });
  await app.inject({ method: 'DELETE', url: '/api/places/test_place_cafe' });

  const totalPhotosAfter = (db.prepare('SELECT COUNT(*) as c FROM photos').get() as any).c;
  assert.equal(totalPhotosBefore, totalPhotosAfter, 'Deleting collection, meal, or place must NEVER delete photos');
  console.log('✓ AC-30: Reclustering preserved memberships; deletion of collections/places/meals never deleted photos.');

  // Cleanup
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_%'").run();
  db.prepare("DELETE FROM recaps WHERE year = 2026 AND (month = 11 OR month = 10 OR month IS NULL)").run();

  console.log('\n🎉 ALL PHASE 1.5D VERIFICATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 1.5D Tests Failed:', err);
  process.exit(1);
});
