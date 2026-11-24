// test/phase5b.test.ts — Phase 5B Acceptance Tests (FR-1406 Life Map Heatmap & FR-1403 Social Graph)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db from '../server/db.js';

console.log('🧪 Starting Phase 5B Acceptance Tests (Personal Life Map Heatmap & Social Graph)...\n');

async function runTests() {
  await app.ready();

  // Cleanup existing test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM photo_cats WHERE photo_id LIKE 'test_p5b_%'").run();

  const now = Date.now();

  // ── Seed Persons ──────────────────────────────────────────────
  // Person 1: Alice (ปรางค์)
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5b_pr1', 'ปรางค์ ศิริพร', 'ปรางค์', '#79C7B4', ?)
  `).run(now);

  // Person 2: Bob (เบิร์ด)
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5b_pr2', 'ธงชัย เบิร์ด', 'เบิร์ด', '#8FB8E8', ?)
  `).run(now);

  // Person 3: Charlie (เดี่ยว - ไม่เคยเจอกับคนอื่น)
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5b_pr3', 'เดี่ยว คนเดียว', 'เดี่ยว', '#F0A63C', ?)
  `).run(now);

  // ── Seed Events ───────────────────────────────────────────────
  // Event 1: Chiang Mai Trip (18.7883, 98.9853) - Alice & Bob attend together
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5b_ev1', 'ทริปเชียงใหม่กับเพื่อน', 'เชียงใหม่', ?, ?)
  `).run(now - 86400000 * 10, now - 86400000 * 9);

  // Event 2: Bangkok Cafe (13.7563, 100.5018) - Alice & Bob attend together
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5b_ev2', 'คาเฟ่กรุงเทพฯ', 'อารีย์', ?, ?)
  `).run(now - 86400000 * 5, now - 86400000 * 4);

  // Event 3: Solo event for Charlie (7.8804, 98.3923) - Phuket
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5b_ev3', 'ทริปภูเก็ตคนเดียว', 'ภูเก็ต', ?, ?)
  `).run(now - 86400000 * 2, now - 86400000 * 1);

  // ── Seed Photos ───────────────────────────────────────────────
  // Photos at Chiang Mai (3 photos with GPS)
  for (let i = 1; i <= 3; i++) {
    db.prepare(`
      INSERT INTO photos (id, path, filename, taken_at, lat, lon, event_id, added_at)
      VALUES ('test_p5b_p' || ?, 'test/cm_' || ? || '.jpg', 'cm_' || ? || '.jpg', ?, 18.7883, 98.9853, 'test_p5b_ev1', ?)
    `).run(i, i, i, now - 86400000 * 10 + i * 1000, now);

    db.prepare(`INSERT INTO photo_cats (photo_id, cat) VALUES ('test_p5b_p' || ?, 'travel')`).run(i);

    // Photos 1 and 2 have BOTH Alice and Bob
    if (i <= 2) {
      db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p' || ?, 'test_p5b_pr1', 'manual')`).run(i);
      db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p' || ?, 'test_p5b_pr2', 'manual')`).run(i);
    } else {
      // Photo 3 only Alice
      db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p' || ?, 'test_p5b_pr1', 'manual')`).run(i);
    }
  }

  // Photos at Bangkok Cafe (5 photos with GPS - higher frequency)
  for (let i = 4; i <= 8; i++) {
    db.prepare(`
      INSERT INTO photos (id, path, filename, taken_at, lat, lon, event_id, added_at)
      VALUES ('test_p5b_p' || ?, 'test/bkk_' || ? || '.jpg', 'bkk_' || ? || '.jpg', ?, 13.7563, 100.5018, 'test_p5b_ev2', ?)
    `).run(i, i, i, now - 86400000 * 5 + i * 1000, now);

    db.prepare(`INSERT INTO photo_cats (photo_id, cat) VALUES ('test_p5b_p' || ?, 'cafe')`).run(i);

    // Alice & Bob in photo 4
    if (i === 4) {
      db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p' || ?, 'test_p5b_pr1', 'manual')`).run(i);
      db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p' || ?, 'test_p5b_pr2', 'manual')`).run(i);
    }
  }

  // Photo 9: Charlie in Phuket
  db.prepare(`
    INSERT INTO photos (id, path, filename, taken_at, lat, lon, event_id, added_at)
    VALUES ('test_p5b_p9', 'test/phuket.jpg', 'phuket.jpg', ?, 7.8804, 98.3923, 'test_p5b_ev3', ?)
  `).run(now - 86400000 * 2, now);
  db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5b_p9', 'test_p5b_pr3', 'manual')`).run();
  db.prepare(`INSERT INTO photo_cats (photo_id, cat) VALUES ('test_p5b_p9', 'travel')`).run();

  // ─────────────────────────────────────────────────────────────
  // Test 1: FR-1406 (Personal Life Map & Heatmap API)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: FR-1406 (Personal Life Map / Heatmap API endpoints)');
  const mapRes = await app.inject({
    method: 'GET',
    url: '/api/map',
  });

  assert.equal(mapRes.statusCode, 200);
  const mapData = JSON.parse(mapRes.body);

  // Check structure
  assert.ok(Array.isArray(mapData.heatmap), 'mapData must contain heatmap array');
  assert.ok(Array.isArray(mapData.most_visited), 'mapData must contain most_visited array');
  assert.ok(mapData.summary, 'mapData must contain summary');

  // Check heatmap points
  assert.ok(mapData.heatmap.length >= 2, 'Should have clusters for Bangkok, Chiang Mai, Phuket');
  const bkkHeat = mapData.heatmap.find((h: any) => Math.abs(h.lat - 13.756) < 0.01);
  assert.ok(bkkHeat, 'Bangkok heat cluster must exist');
  assert.equal(bkkHeat.count, 5, 'Bangkok cluster should have 5 photos');
  assert.ok(bkkHeat.intensity > 0 && bkkHeat.intensity <= 1.0, 'Cluster intensity must be between 0 and 1.0');

  // Check summary
  assert.ok(mapData.summary.total_gps_photos >= 9, 'Total GPS photos should be >= 9');
  assert.ok(mapData.summary.bounds, 'Summary bounds must be calculated');
  assert.ok(mapData.summary.center, 'Summary center must be calculated');

  // Check most visited places
  const bkkPlace = mapData.most_visited.find((p: any) => Math.abs(p.lat - 13.756) < 0.01);
  assert.ok(bkkPlace, 'Bangkok test place must be in most visited places');
  assert.equal(bkkPlace.photo_count, 5, 'Bangkok test place has 5 photos');
  assert.equal(bkkPlace.name, 'อารีย์', 'Top visited place name is correctly picked from event place');

  // Verify /api/map/heatmap alias returns identical heatmap
  const heatmapAliasRes = await app.inject({
    method: 'GET',
    url: '/api/map/heatmap',
  });
  assert.equal(heatmapAliasRes.statusCode, 200);
  const aliasData = JSON.parse(heatmapAliasRes.body);
  assert.equal(aliasData.heatmap.length, mapData.heatmap.length);

  // Check category filter
  const filterCafeRes = await app.inject({
    method: 'GET',
    url: '/api/map?cat=cafe',
  });
  const filterCafeData = JSON.parse(filterCafeRes.body);
  assert.ok(filterCafeData.summary.total_gps_photos >= 5, 'Filtered by cafe must count at least 5 photos');
  console.log('✓ FR-1406 Life Map & Heatmap correctly aggregates GPS coordinates, frequency, and top places.');

  // ─────────────────────────────────────────────────────────────
  // Test 2: FR-1403 (Social Graph API & Co-occurrence Calculation)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: FR-1403 (Social Graph API & co-occurrence weight calculation)');
  const graphRes = await app.inject({
    method: 'GET',
    url: '/api/insights/social-graph',
  });

  assert.equal(graphRes.statusCode, 200);
  const graphData = JSON.parse(graphRes.body);

  assert.ok(Array.isArray(graphData.nodes), 'graphData must have nodes array');
  assert.ok(Array.isArray(graphData.edges), 'graphData must have edges array');

  // Check nodes contain test persons
  const nodeAlice = graphData.nodes.find((n: any) => n.id === 'test_p5b_pr1');
  const nodeBob = graphData.nodes.find((n: any) => n.id === 'test_p5b_pr2');
  const nodeCharlie = graphData.nodes.find((n: any) => n.id === 'test_p5b_pr3');

  assert.ok(nodeAlice, 'Alice must be a node in the graph');
  assert.ok(nodeBob, 'Bob must be a node in the graph');
  assert.ok(nodeCharlie, 'Charlie must be a node in the graph');

  assert.equal(nodeAlice.name, 'ปรางค์ ศิริพร');
  assert.ok(nodeAlice.photo_count >= 4, 'Alice appears in 4 test photos');
  assert.ok(nodeAlice.event_count >= 2, 'Alice appears in 2 test events');

  // Check edges
  // Alice & Bob have 2 shared events (Chiang Mai + Bangkok Cafe) and 3 shared photos
  const edgeAliceBob = graphData.edges.find(
    (e: any) =>
      (e.source === 'test_p5b_pr1' && e.target === 'test_p5b_pr2') ||
      (e.source === 'test_p5b_pr2' && e.target === 'test_p5b_pr1')
  );

  assert.ok(edgeAliceBob, 'Edge between Alice and Bob must exist');
  assert.ok(edgeAliceBob.weight >= 2, `Edge weight between Alice and Bob should be >= 2 (got ${edgeAliceBob.weight})`);
  assert.ok(edgeAliceBob.shared_photos_count >= 3, `Shared photos count should be >= 3 (got ${edgeAliceBob.shared_photos_count})`);
  const eventNames = edgeAliceBob.shared_events.map((e: any) => e.name);
  assert.ok(
    eventNames.includes('ทริปเชียงใหม่กับเพื่อน') &&
      eventNames.includes('คาเฟ่กรุงเทพฯ'),
    'Shared events list must contain event names'
  );

  // Charlie never met Alice or Bob — verify no false edges
  const edgeCharlie = graphData.edges.find(
    (e: any) => e.source === 'test_p5b_pr3' || e.target === 'test_p5b_pr3'
  );
  assert.ok(!edgeCharlie, 'Charlie must not have any co-occurrence edges');
  console.log('✓ FR-1403 Social Graph correctly computes co-occurrence weights, shared events, and node statistics.');

  // ── Cleanup ──────────────────────────────────────────────────
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5b_%'").run();
  db.prepare("DELETE FROM photo_cats WHERE photo_id LIKE 'test_p5b_%'").run();

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 5B ACCEPTANCE TESTS PASSED (FR-1403 & FR-1406)');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 5B Tests Failed:', err);
  process.exit(1);
});
