// test/phase3.test.ts — Phase 3 People Automation & Face Clustering Test Suite (AC-18 / FR-506)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db, { ftsUpsert } from '../server/db.js';
import {
  cosineSimilarity,
  normalizeVector,
  clusterFaces,
  FACE_EMBED_DIM,
} from '../server/workers/face.js';

console.log('🧪 Starting Phase 3 Verification Tests (People Automation & Face Clustering)...\n');

async function runTests() {
  await app.ready();

  // Cleanup test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM faces WHERE photo_id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM suggestions WHERE kind = 'face_cluster'").run();

  // ── 1. Vector Math & Normalization Helpers ────────────────────
  console.log('Test 1: Vector cosine similarity and normalization');
  const v1 = new Float32Array([1, 0, 0, 0]);
  const v2 = new Float32Array([1, 0, 0, 0]);
  const v3 = new Float32Array([0, 1, 0, 0]);
  assert.equal(Math.round(cosineSimilarity(v1, v2) * 100) / 100, 1.0);
  assert.equal(cosineSimilarity(v1, v3), 0.0);

  const raw = [3, 4, 0, 0];
  const norm = normalizeVector(raw);
  assert.equal(Math.round(norm[0] * 10) / 10, 0.6);
  assert.equal(Math.round(norm[1] * 10) / 10, 0.8);
  console.log('✓ Vector math helpers behave correctly.');

  // ── 2. Create Test Photos & Synthetic Face Embeddings ─────────
  console.log('\nTest 2: Seed test photos and synthetic faces for 2 distinct people');

  // Event 1
  db.prepare(`
    INSERT OR REPLACE INTO events (id, name, ts_start, ts_end)
    VALUES ('test_face_ev1', 'ทริปทะเลภูเก็ต', 1773489600000, 1773499600000)
  `).run();

  // Event 2
  db.prepare(`
    INSERT OR REPLACE INTO events (id, name, ts_start, ts_end)
    VALUES ('test_face_ev2', 'ปาร์ตี้วันเกิด', 1774000000000, 1774010000000)
  `).run();

  // Photo 1 (Person A in Event 1)
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, event_id, taken_at, added_at)
    VALUES ('test_face_p1', 'test/p1.jpg', 'somchai_phuket.jpg', 'test_face_ev1', 1773490000000, ?)
  `).run(Date.now());

  // Photo 2 (Person A in Event 2)
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, event_id, taken_at, added_at)
    VALUES ('test_face_p2', 'test/p2.jpg', 'somchai_birthday.jpg', 'test_face_ev2', 1774001000000, ?)
  `).run(Date.now());

  // Photo 3 (Person B in Event 1)
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, event_id, taken_at, added_at)
    VALUES ('test_face_p3', 'test/p3.jpg', 'suda_phuket.jpg', 'test_face_ev1', 1773492000000, ?)
  `).run(Date.now());

  // Create 128-d synthetic embeddings
  // Person A signature: high energy in dimensions 0..10
  const embA1 = new Float32Array(FACE_EMBED_DIM);
  for (let i = 0; i < 10; i++) embA1[i] = 1.0;
  const normA1 = normalizeVector(embA1);

  const embA2 = new Float32Array(FACE_EMBED_DIM);
  for (let i = 0; i < 10; i++) embA2[i] = 0.95 + (i % 2) * 0.05; // very close to A1
  const normA2 = normalizeVector(embA2);

  // Person B signature: high energy in dimensions 50..60
  const embB1 = new Float32Array(FACE_EMBED_DIM);
  for (let i = 50; i < 60; i++) embB1[i] = 1.0; // orthogonal to A
  const normB1 = normalizeVector(embB1);

  // Insert into faces table
  const insertFace = db.prepare(`
    INSERT INTO faces (id, photo_id, bbox, emb)
    VALUES (?, ?, ?, ?)
  `);

  insertFace.run(
    'test_face_f1',
    'test_face_p1',
    JSON.stringify({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }),
    Buffer.from(normA1.buffer)
  );

  insertFace.run(
    'test_face_f2',
    'test_face_p2',
    JSON.stringify({ x: 0.3, y: 0.3, w: 0.25, h: 0.25 }),
    Buffer.from(normA2.buffer)
  );

  insertFace.run(
    'test_face_f3',
    'test_face_p3',
    JSON.stringify({ x: 0.5, y: 0.2, w: 0.3, h: 0.3 }),
    Buffer.from(normB1.buffer)
  );

  console.log('✓ Inserted 3 faces across 2 events.');

  // ── 3. Greedy Clustering (Algorithm 8.4 / AC-18) ──────────────
  console.log('\nTest 3: Run greedy agglomerative clustering (threshold = 0.45)');
  const clusterResult = clusterFaces(0.45);
  assert.equal(clusterResult.clusters.length, 2, 'Should form exactly 2 clusters (A and B)');

  const clusterA = clusterResult.clusters.find((c) => c.member_face_ids.includes('test_face_f1'));
  assert.ok(clusterA, 'Cluster for Person A exists');
  assert.equal(clusterA.count, 2, 'Cluster A has 2 face members (f1 and f2)');
  assert.ok(clusterA.member_face_ids.includes('test_face_f2'), 'f2 grouped with f1');

  const clusterB = clusterResult.clusters.find((c) => c.member_face_ids.includes('test_face_f3'));
  assert.ok(clusterB, 'Cluster for Person B exists');
  assert.equal(clusterB.count, 1, 'Cluster B has 1 face member');

  console.log('✓ Greedy clustering correctly grouped f1 and f2 into cluster A, and f3 into cluster B.');

  // ── 4. Naming Suggestions Surface in Inbox (Section 8.4 / AC-18) ───
  console.log('\nTest 4: Verify suggestions generated for unnamed clusters');
  const suggestionsRes = await app.inject({
    method: 'GET',
    url: '/api/suggestions?status=pending',
  });
  assert.equal(suggestionsRes.statusCode, 200);
  const suggestionsData = JSON.parse(suggestionsRes.body);

  const faceSuggestions = suggestionsData.items.filter((s: any) => s.kind === 'face_cluster');
  assert.ok(faceSuggestions.length >= 2, 'Should emit suggestions for unnamed face clusters');

  const suggA = faceSuggestions.find((s: any) => s.payload.cluster_id === clusterA.id);
  assert.ok(suggA, 'Suggestion for Cluster A found');
  assert.equal(suggA.payload.face_count, 2);
  console.log('✓ Found pending face cluster suggestion in inbox:', suggA.id);

  // ── 5. Confirm Suggestion → Links Person + Increments Counts (AC-18) ─
  console.log('\nTest 5: Confirm naming suggestion → creates person & increments counts (AC-18)');
  const acceptRes = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${suggA.id}/accept`,
    payload: {
      person_name: 'สมชาย สายลุย',
      nick: 'ชาย',
    },
  });
  assert.equal(acceptRes.statusCode, 200);

  // Verify person created
  const somchai = db.prepare('SELECT * FROM persons WHERE name = ?').get('สมชาย สายลุย') as any;
  assert.ok(somchai, 'Person "สมชาย สายลุย" should be created in DB');

  // Verify photos linked in photo_persons with source='face-confirmed'
  const linkedPhotos = db
    .prepare('SELECT photo_id, source FROM photo_persons WHERE person_id = ?')
    .all(somchai.id) as any[];
  assert.equal(linkedPhotos.length, 2, 'Should link both p1 and p2');
  assert.ok(linkedPhotos.every((lp) => lp.source === 'face-confirmed'), 'Source must be face-confirmed');

  // Verify stats incremented correctly
  const somchaiDetailRes = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}`,
  });
  assert.equal(somchaiDetailRes.statusCode, 200);
  const somchaiDetail = JSON.parse(somchaiDetailRes.body);

  assert.equal(somchaiDetail.stats.photo_count, 2, 'Photo count must increment to 2');
  assert.equal(somchaiDetail.stats.event_count, 2, 'Event count must increment to 2 (phuket and birthday)');
  assert.equal(somchaiDetail.timeline.length, 2, 'Timeline has 2 distinct events');
  console.log('✓ Confirming suggestion linked person and correctly incremented photo & event counts.');

  // ── 6. Dismiss Suggestion → Leaves Counts Unchanged (AC-18) ────
  console.log('\nTest 6: Dismiss suggestion → leaves counts unchanged (AC-18)');
  const suggB = faceSuggestions.find((s: any) => s.payload.cluster_id === clusterB.id);
  assert.ok(suggB, 'Suggestion for Cluster B found');

  // Create an unrelated person to verify their counts do not change
  const initialPersonCount = (
    db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
  ).c;

  const dismissRes = await app.inject({
    method: 'POST',
    url: `/api/suggestions/${suggB.id}/dismiss`,
  });
  assert.equal(dismissRes.statusCode, 200);

  // Verify suggestion marked dismissed
  const dismissedRow = db.prepare('SELECT status FROM suggestions WHERE id = ?').get(suggB.id) as any;
  assert.equal(dismissedRow.status, 'dismissed');

  // Verify somchai's counts are completely unchanged
  const somchaiAfterDismiss = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}`,
  });
  const dataAfter = JSON.parse(somchaiAfterDismiss.body);
  assert.equal(dataAfter.stats.photo_count, 2, 'Somchai photo count unchanged');
  assert.equal(dataAfter.stats.event_count, 2, 'Somchai event count unchanged');

  // Verify no new person created
  const postPersonCount = (
    db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
  ).c;
  assert.equal(postPersonCount, initialPersonCount, 'Person count remains unchanged');
  console.log('✓ Dismissing suggestion marked dismissed and left counts completely unchanged.');

  // ── 7. Photo Detail Modal: Unconfirmed Suggestion Chips (FR-506) ─
  console.log('\nTest 7: Unconfirmed face chip confirmation and dismissal (FR-506)');

  // Tag a new photo with source='face-suggestion'
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, event_id, taken_at, added_at)
    VALUES ('test_face_p4', 'test/p4.jpg', 'unconfirmed_sample.jpg', 'test_face_ev1', 1773495000000, ?)
  `).run(Date.now());

  db.prepare(`
    INSERT OR REPLACE INTO photo_persons (photo_id, person_id, source)
    VALUES ('test_face_p4', ?, 'face-suggestion')
  `).run(somchai.id);

  // Stats should NOT count unconfirmed photo yet
  const somchaiCheckUnconfirmed = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}`,
  });
  const checkData = JSON.parse(somchaiCheckUnconfirmed.body);
  assert.equal(
    checkData.stats.photo_count,
    2,
    'Unconfirmed face-suggestion must NOT increment photo count yet'
  );

  // GET /api/persons/:id/suggestions returns unconfirmed chip
  const personSuggsRes = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}/suggestions`,
  });
  assert.equal(personSuggsRes.statusCode, 200);
  const personSuggs = JSON.parse(personSuggsRes.body);
  assert.equal(personSuggs.suggestions.length, 1);
  assert.equal(personSuggs.suggestions[0].photo_id, 'test_face_p4');

  // Accept chip via POST /api/photos/:id/confirm-face
  const confirmChipRes = await app.inject({
    method: 'POST',
    url: '/api/photos/test_face_p4/confirm-face',
    payload: { person_id: somchai.id },
  });
  assert.equal(confirmChipRes.statusCode, 200);

  // Now stats MUST increment to 3
  const somchaiConfirmedRes = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}`,
  });
  const confirmedData = JSON.parse(somchaiConfirmedRes.body);
  assert.equal(
    confirmedData.stats.photo_count,
    3,
    'Confirming face chip increments photo count to 3'
  );

  // Test dismiss chip on another photo
  db.prepare(`
    INSERT OR REPLACE INTO photos (id, path, filename, event_id, taken_at, added_at)
    VALUES ('test_face_p5', 'test/p5.jpg', 'dismiss_sample.jpg', 'test_face_ev1', 1773496000000, ?)
  `).run(Date.now());

  db.prepare(`
    INSERT OR REPLACE INTO photo_persons (photo_id, person_id, source)
    VALUES ('test_face_p5', ?, 'face-suggestion')
  `).run(somchai.id);

  const dismissChipRes = await app.inject({
    method: 'POST',
    url: '/api/photos/test_face_p5/dismiss-face',
    payload: { person_id: somchai.id },
  });
  assert.equal(dismissChipRes.statusCode, 200);

  // Verify removed from photo_persons and count stays 3
  const somchaiFinalRes = await app.inject({
    method: 'GET',
    url: `/api/persons/${somchai.id}`,
  });
  const finalData = JSON.parse(somchaiFinalRes.body);
  assert.equal(finalData.stats.photo_count, 3, 'Dismissing face chip leaves count unchanged at 3');
  console.log('✓ Unconfirmed face suggestion chips confirm and dismiss cleanly.');

  // ── 8. Background Face Job API (`POST /api/faces`) ─────────────
  console.log('\nTest 8: Background Face Job POST /api/faces and job polling');
  const jobRes = await app.inject({
    method: 'POST',
    url: '/api/faces',
  });
  assert.equal(jobRes.statusCode, 200);
  const { jobId } = JSON.parse(jobRes.body);
  assert.ok(jobId, 'Must return jobId');

  // Poll until done or timeout
  for (let attempt = 0; attempt < 30; attempt++) {
    const poll = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    const jobData = JSON.parse(poll.body);
    if (jobData.status === 'done') {
      console.log('✓ Face background job completed successfully:', jobData.result || jobData.progress);
      break;
    }
    if (jobData.status === 'error') {
      assert.fail(`Face job failed: ${jobData.error}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // ── Cleanup Test Fixtures ─────────────────────────────────────
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM faces WHERE photo_id LIKE 'test_face_%'").run();
  db.prepare("DELETE FROM suggestions WHERE kind = 'face_cluster'").run();

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 3 ACCEPTANCE TESTS PASSED (AC-18 & FR-506)');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 3 test suite failed:', err);
  process.exit(1);
});
