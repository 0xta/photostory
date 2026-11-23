// test/phase2.test.ts — Phase 2 Semantic Search & Multilingual CLIP Test Suite (AC-17)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db, { ftsUpsert } from '../server/db.js';
import { embedPhoto, embedText, searchSimilarPhotos, isMlEnabled } from '../server/workers/embed.js';

console.log('🧪 Starting Phase 2 Verification Tests (Semantic Search & Multilingual CLIP)...\n');

async function runTests() {
  await app.ready();

  // Cleanup test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_sem_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_sem_%'").run();
  try {
    db.prepare("DELETE FROM photo_vec WHERE photo_id LIKE 'test_sem_%'").run();
  } catch {}
  db.prepare("DELETE FROM suggestions WHERE kind LIKE '%semantic%'").run();
  db.prepare("DELETE FROM collections WHERE id LIKE 'test_sem_%'").run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ml_enabled', '1')").run();

  // ── 1. Vector Database (sqlite-vec) Verification ──────────────
  console.log('Test 1: Verify sqlite-vec integration and photo_vec table');
  const vecVer = db.prepare('SELECT vec_version()').get() as any;
  assert.ok(vecVer && vecVer['vec_version()'], 'sqlite-vec must return valid version');
  console.log('✓ sqlite-vec loaded, version:', vecVer['vec_version()']);

  // ── 2. Embed Fixtures & POST /api/embed (AC-17 / Section 9.3) ──
  console.log('Test 2: Embed fixtures & embedding background job');

  // Insert 3 test photos with distinct visual/conceptual themes
  // Photo 1: Food & drinks
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, taken_at, note, added_at)
    VALUES ('test_sem_food', 'test/food.jpg', 'tom_yum_goong.jpg', 1773489600000, 'ต้มยำกุ้งน้ำข้น รสชาติจัดจ้าน', ?)
  `).run(Date.now());
  db.prepare('INSERT OR REPLACE INTO photo_cats (photo_id, cat) VALUES (?, ?)').run('test_sem_food', 'อาหาร');
  ftsUpsert('photo', 'test_sem_food', 'tom_yum_goong.jpg ต้มยำกุ้งน้ำข้น รสชาติจัดจ้าน');

  // Photo 2: Travel & nature
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, taken_at, note, added_at)
    VALUES ('test_sem_travel', 'test/travel.jpg', 'chiangmai_mountain.jpg', 1776859200000, 'ทริปขึ้นดอยอินทนนท์ ชมทะเลหมอกและธรรมชาติ', ?)
  `).run(Date.now());
  db.prepare('INSERT OR REPLACE INTO photo_cats (photo_id, cat) VALUES (?, ?)').run('test_sem_travel', 'บรรยากาศ');
  ftsUpsert('photo', 'test_sem_travel', 'chiangmai_mountain.jpg ทริปขึ้นดอยอินทนนท์ ชมทะเลหมอกและธรรมชาติ');

  // Photo 3: Tech slide presentation
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, taken_at, note, added_at)
    VALUES ('test_sem_slide', 'test/slide.jpg', 'okr_q1_presentation.jpg', 1773493200000, 'สไลด์สรุปเป้าหมาย OKR ไตรมาสแรกในงานสัมมนา', ?)
  `).run(Date.now());
  db.prepare('INSERT OR REPLACE INTO photo_cats (photo_id, cat) VALUES (?, ?)').run('test_sem_slide', 'สไลด์');
  ftsUpsert('photo', 'test_sem_slide', 'okr_q1_presentation.jpg สไลด์สรุปเป้าหมาย OKR ไตรมาสแรกในงานสัมมนา');

  // Start embedding job via API
  const resEmbed = await app.inject({
    method: 'POST',
    url: '/api/embed',
    payload: { photo_ids: ['test_sem_food', 'test_sem_travel', 'test_sem_slide'] },
  });
  assert.equal(resEmbed.statusCode, 200);
  const { jobId } = JSON.parse(resEmbed.body);
  assert.ok(jobId, 'jobId must be returned');

  // Poll until done
  for (let i = 0; i < 40; i++) {
    const poll = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    const jobData = JSON.parse(poll.body);
    if (jobData.status === 'done') break;
    await new Promise((r) => setTimeout(r, 50));
  }

  // Check stats
  const resStats = await app.inject({ method: 'GET', url: '/api/embed/stats' });
  assert.equal(resStats.statusCode, 200);
  const stats = JSON.parse(resStats.body);
  assert.ok(stats.embedded_photos >= 3, 'Must have at least 3 embedded photos');
  console.log('✓ AC-17 (Embedding): Photos embedded and stored into photo_vec successfully.');

  // ── 3. AC-17: Thai natural-language semantic query (FR-603) ───
  console.log('Test 3: AC-17 (Thai natural-language query returns semantically relevant photos)');

  // 3a. Query food concept: "รูปอาหารตอนกลางคืน"
  const resSearchFood = await app.inject({
    method: 'GET',
    url: '/api/search?q=' + encodeURIComponent('รูปอาหารตอนกลางคืน'),
  });
  assert.equal(resSearchFood.statusCode, 200);
  const foodResult = JSON.parse(resSearchFood.body);

  assert.ok(foodResult.photos.length > 0, 'Must return photos matching food semantic intent');
  assert.ok(foodResult.photos.some((p: any) => p.id === 'test_sem_food'), 'Food test photo should be matched');
  assert.ok(foodResult.photos[0].score > 0.4, 'Score should be high');
  assert.ok(foodResult.photos[0].match_type === 'semantic' || foodResult.photos[0].match_type === 'hybrid');

  // 3b. Query travel concept: "ทริปเที่ยวธรรมชาติ"
  const resSearchTravel = await app.inject({
    method: 'GET',
    url: '/api/search?q=' + encodeURIComponent('ทริปเที่ยวธรรมชาติ'),
  });
  assert.equal(resSearchTravel.statusCode, 200);
  const travelResult = JSON.parse(resSearchTravel.body);

  assert.ok(travelResult.photos.length > 0, 'Must return photos matching travel intent');
  assert.ok(travelResult.photos.some((p: any) => p.id === 'test_sem_travel'), 'Travel test photo should be matched');

  // 3c. Query slide concept: "สไลด์นำเสนอ"
  const resSearchSlide = await app.inject({
    method: 'GET',
    url: '/api/search?q=' + encodeURIComponent('สไลด์นำเสนอ'),
  });
  assert.equal(resSearchSlide.statusCode, 200);
  const slideResult = JSON.parse(resSearchSlide.body);

  assert.ok(slideResult.photos.length > 0, 'Must return photos matching slide intent');
  assert.ok(slideResult.photos.some((p: any) => p.id === 'test_sem_slide'), 'Slide test photo should be matched');
  console.log('✓ AC-17 (Semantic Search): Thai natural language queries accurately ranked semantically.');

  // ── 4. AC-17: Fallback to FTS when ML is disabled ─────────────
  console.log('Test 4: AC-17 (With ML disabled, search falls back to FTS without error)');

  // Disable ML in settings
  const patchRes = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { ml_enabled: '0' },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(isMlEnabled(), false);

  // Search exact keyword: "ต้มยำกุ้ง" (in note)
  const resFtsOnly = await app.inject({
    method: 'GET',
    url: '/api/search?q=' + encodeURIComponent('ต้มยำกุ้ง'),
  });
  assert.equal(resFtsOnly.statusCode, 200);
  const ftsData = JSON.parse(resFtsOnly.body);
  assert.equal(ftsData.ml_used, false);
  assert.ok(ftsData.photos.length >= 1);
  assert.equal(ftsData.photos[0].id, 'test_sem_food');
  assert.equal(ftsData.photos[0].match_type, 'fts');

  // Search natural language that does NOT match FTS keyword: "เมนูของกินรสจัด"
  const resNoMatchFts = await app.inject({
    method: 'GET',
    url: '/api/search?q=' + encodeURIComponent('เมนูของกินรสจัด'),
  });
  assert.equal(resNoMatchFts.statusCode, 200);
  const noMatchData = JSON.parse(resNoMatchFts.body);
  assert.equal(noMatchData.ml_used, false);
  assert.equal(noMatchData.photos.length, 0); // No error, cleanly returns 0 matches!

  // Re-enable ML
  await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { ml_enabled: '1' },
  });
  assert.equal(isMlEnabled(), true);
  console.log('✓ AC-17 (Fallback): Disabling ML safely fell back to FTS keyword search without error.');

  // ── 5. Algorithm 8.9: Semantic Collection Auto-Suggestion ──────
  console.log('Test 5: Algorithm 8.9 (Semantic Collection auto-suggestion based on member centroid)');

  // Create a topic collection with test_sem_food
  const testCollId = 'test_sem_coll_food';
  db.prepare(`
    INSERT OR REPLACE INTO collections (id, name, type, note, created_at)
    VALUES (?, 'เรื่องราว อาหาร 2026', 'topic', 'รวมเมนูอาหารจานโปรด', ?)
  `).run(testCollId, Date.now());

  db.prepare(`
    INSERT OR REPLACE INTO collection_photos (collection_id, photo_id, added_by, added_at)
    VALUES (?, 'test_sem_food', 'manual', ?)
  `).run(testCollId, Date.now());

  // Insert a candidate food photo not yet in collection
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, taken_at, note, added_at)
    VALUES ('test_sem_food2', 'test/coffee.jpg', 'cappuccino_cafe.jpg', 1773500000000, 'กาแฟลาเต้ร้อนกับครัวซองต์เนยสด', ?)
  `).run(Date.now());
  db.prepare('INSERT OR REPLACE INTO photo_cats (photo_id, cat) VALUES (?, ?)').run('test_sem_food2', 'อาหาร');
  await embedPhoto('test_sem_food2');

  // Scan suggestions
  const resScan = await app.inject({
    method: 'POST',
    url: '/api/suggestions/scan',
  });
  assert.equal(resScan.statusCode, 200);

  // Check suggestions inbox
  const resSugg = await app.inject({
    method: 'GET',
    url: '/api/suggestions?status=pending',
  });
  assert.equal(resSugg.statusCode, 200);
  const { items } = JSON.parse(resSugg.body);

  const semanticSugg = items.find(
    (s: any) => s.kind === 'collection_semantic' && s.payload.collection_id === testCollId
  );
  assert.ok(semanticSugg, 'Must emit a collection_semantic suggestion');
  assert.equal(semanticSugg.payload.photo_id, 'test_sem_food2');
  assert.ok(semanticSugg.payload.similarity >= 30, 'Similarity must be >= threshold 30%');

  // Accept suggestion
  const resAccept = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${semanticSugg.id}/accept`,
  });
  assert.equal(resAccept.statusCode, 200);

  // Verify added with source 'semantic'
  const memberRow = db
    .prepare('SELECT * FROM collection_photos WHERE collection_id = ? AND photo_id = ?')
    .get(testCollId, 'test_sem_food2') as any;
  assert.ok(memberRow, 'Photo must be added to collection');
  assert.equal(memberRow.added_by, 'semantic', 'Membership source must be semantic');
  console.log('✓ Algorithm 8.9: Semantic collection suggestion emitted and accepted with added_by="semantic".');

  // Cleanup
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_sem_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_sem_%'").run();
  try {
    db.prepare("DELETE FROM photo_vec WHERE photo_id LIKE 'test_sem_%'").run();
  } catch {}
  db.prepare("DELETE FROM suggestions WHERE kind LIKE '%semantic%'").run();
  db.prepare("DELETE FROM collections WHERE id LIKE 'test_sem_%'").run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ml_enabled', '1')").run();

  console.log('\n🎉 ALL PHASE 2 VERIFICATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 2 Tests Failed:', err);
  process.exit(1);
});
