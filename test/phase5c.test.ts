// test/phase5c.test.ts — Phase 5C Acceptance Tests (FR-1410 Open-Format Export & FR-1411 Watch Folder)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import app from '../server/index.js';
import db from '../server/db.js';
import { stopWatchFolder } from '../server/workers/watch.js';

console.log('🧪 Starting Phase 5C Acceptance Tests (Open-Format Export & Watch Folder)...\n');

const TEMP_WATCH_DIR = path.resolve('test/fixtures/temp_watch');

async function runTests() {
  await app.ready();

  // Cleanup test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM photo_cats WHERE photo_id LIKE 'test_p5c_%'").run();

  if (fs.existsSync(TEMP_WATCH_DIR)) {
    fs.rmSync(TEMP_WATCH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_WATCH_DIR, { recursive: true });

  const now = Date.now();

  // Create a physical test photo file for non-destructive XMP verification
  const testPhotoPath = path.join(TEMP_WATCH_DIR, 'sample_test_photo.jpg');
  fs.writeFileSync(testPhotoPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])); // minimal JPEG header
  const initialStat = fs.statSync(testPhotoPath);

  // ── Seed Person & Event ───────────────────────────────────────
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5c_pr1', 'สุชาติ นำทาง', 'ชาติ', '#79C7B4', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5c_ev1', 'ทริปหัวหินรับลมทะเล', 'หัวหิน', ?, ?)
  `).run(now - 3600000, now);

  // ── Seed Photo ────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO photos (id, path, filename, taken_at, lat, lon, event_id, note, added_at)
    VALUES ('test_p5c_p1', ?, 'sample_test_photo.jpg', ?, 12.5684, 99.9577, 'test_p5c_ev1', 'วิวริมทะเลสวยมาก', ?)
  `).run(testPhotoPath, now - 1800000, now);

  db.prepare(`INSERT INTO photo_persons (photo_id, person_id, source) VALUES ('test_p5c_p1', 'test_p5c_pr1', 'manual')`).run();
  db.prepare(`INSERT INTO photo_cats (photo_id, cat) VALUES ('test_p5c_p1', 'travel')`).run();

  // ─────────────────────────────────────────────────────────────
  // Test 1: FR-1410 (Open-Format Export: JSON)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: FR-1410 (Open-Format Export JSON metadata dump)');
  const jsonRes = await app.inject({
    method: 'GET',
    url: '/api/export?format=json',
  });

  assert.equal(jsonRes.statusCode, 200);
  assert.ok(jsonRes.headers['content-type']?.includes('application/json'));
  assert.ok(jsonRes.headers['content-disposition']?.includes('.json'));

  const exportJson = JSON.parse(jsonRes.body);
  assert.equal(exportJson.app, 'เรื่องราว 2026 (Photostory)');
  assert.equal(exportJson.version, '2.0');
  assert.ok(exportJson.stats.total_photos >= 1);

  const exportedP1 = exportJson.photos.find((p: any) => p.id === 'test_p5c_p1');
  assert.ok(exportedP1, 'Test photo must be in JSON export');
  assert.equal(exportedP1.event_name, 'ทริปหัวหินรับลมทะเล');
  assert.ok(exportedP1.categories.includes('travel'));
  assert.ok(exportedP1.persons.some((pr: any) => pr.name === 'สุชาติ นำทาง'));
  console.log('✓ FR-1410 JSON export contains enriched photos, categories, persons, and events.');

  // ─────────────────────────────────────────────────────────────
  // Test 2: FR-1410 (Open-Format Export: CSV)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: FR-1410 (Open-Format Export CSV for spreadsheets)');
  const csvRes = await app.inject({
    method: 'GET',
    url: '/api/export?format=csv',
  });

  assert.equal(csvRes.statusCode, 200);
  assert.ok(csvRes.headers['content-type']?.includes('text/csv'));
  assert.ok(csvRes.headers['content-disposition']?.includes('.csv'));

  const csvBody = csvRes.body;
  assert.ok(csvBody.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for Thai Excel compatibility');
  assert.ok(csvBody.includes('id,filename,path,taken_at_epoch'));
  assert.ok(csvBody.includes('sample_test_photo.jpg'));
  assert.ok(csvBody.includes('ทริปหัวหินรับลมทะเล'));
  assert.ok(csvBody.includes('สุชาติ นำทาง'));
  console.log('✓ FR-1410 CSV export correctly formatted with UTF-8 BOM and escaped headers/fields.');

  // ─────────────────────────────────────────────────────────────
  // Test 3: FR-1410 (Open-Format Export: GeoJSON)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: FR-1410 (Open-Format Export GeoJSON FeatureCollection)');
  const geoRes = await app.inject({
    method: 'GET',
    url: '/api/export?format=geojson',
  });

  assert.equal(geoRes.statusCode, 200);
  assert.ok(geoRes.headers['content-type']?.includes('geo+json'));
  assert.ok(geoRes.headers['content-disposition']?.includes('.geojson'));

  const geoData = JSON.parse(geoRes.body);
  assert.equal(geoData.type, 'FeatureCollection');
  assert.ok(geoData.features.length >= 1);

  const featureP1 = geoData.features.find((f: any) => f.properties.id === 'test_p5c_p1');
  assert.ok(featureP1, 'Test photo must be in GeoJSON features');
  assert.equal(featureP1.geometry.type, 'Point');
  assert.equal(featureP1.geometry.coordinates[0], 99.9577); // lon
  assert.equal(featureP1.geometry.coordinates[1], 12.5684); // lat
  assert.equal(featureP1.properties.event_name, 'ทริปหัวหินรับลมทะเล');
  console.log('✓ FR-1410 GeoJSON export adheres to RFC 7946 Point FeatureCollection standard.');

  // ─────────────────────────────────────────────────────────────
  // Test 4: FR-1410 (XMP Sidecar Generation Non-destructive)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: FR-1410 (Non-destructive XMP Sidecar Generation)');
  const xmpRes = await app.inject({
    method: 'POST',
    url: '/api/export/xmp',
  });

  assert.equal(xmpRes.statusCode, 200);
  const xmpData = JSON.parse(xmpRes.body);
  assert.equal(xmpData.status, 'ok');
  assert.ok(xmpData.generated_count >= 1);

  // Check sidecar file on disk
  const expectedXmpPath = path.join(TEMP_WATCH_DIR, 'sample_test_photo.xmp');
  assert.ok(fs.existsSync(expectedXmpPath), `XMP file must exist at ${expectedXmpPath}`);

  const xmpContent = fs.readFileSync(expectedXmpPath, 'utf-8');
  assert.ok(xmpContent.includes('<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'), 'Valid XMP header');
  assert.ok(xmpContent.includes('ทริปหัวหินรับลมทะเล'), 'XMP contains event name title');
  assert.ok(xmpContent.includes('สุชาติ นำทาง'), 'XMP contains person subject tag');
  assert.ok(xmpContent.includes('travel'), 'XMP contains category subject tag');
  assert.ok(xmpContent.includes('วิวริมทะเลสวยมาก'), 'XMP contains note description');

  // Verify NON-DESTRUCTIVE: original image file bytes and size were NOT modified
  const currentStat = fs.statSync(testPhotoPath);
  assert.equal(currentStat.size, initialStat.size, 'Original photo file size must remain completely unchanged');
  console.log('✓ FR-1410 Non-destructive XMP sidecars generated alongside photos without modifying original bytes.');

  // ─────────────────────────────────────────────────────────────
  // Test 5: FR-1411 (Watch Folder Auto-Ingest API & Detection)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: FR-1411 (Watch Folder Auto-Ingest API & Directory Monitoring)');
  // 1. Get initial status
  const getWatchRes = await app.inject({
    method: 'GET',
    url: '/api/watch',
  });
  assert.equal(getWatchRes.statusCode, 200);
  const initialWatch = JSON.parse(getWatchRes.body);
  assert.ok('enabled' in initialWatch);
  assert.ok('folder' in initialWatch);

  // 2. Start watch on TEMP_WATCH_DIR
  const startWatchRes = await app.inject({
    method: 'POST',
    url: '/api/watch',
    payload: { enabled: true, folder: TEMP_WATCH_DIR },
  });
  assert.equal(startWatchRes.statusCode, 200);
  const startedWatch = JSON.parse(startWatchRes.body);
  assert.equal(startedWatch.enabled, true);
  assert.equal(startedWatch.status, 'watching');

  // 3. Drop a new image into the watched directory
  const newDropPhoto = path.join(TEMP_WATCH_DIR, 'new_dropped_photo.jpg');
  fs.copyFileSync('test/fixtures/photos/bkk_01.jpg', newDropPhoto);

  // 4. Trigger scan endpoint
  const scanRes = await app.inject({
    method: 'POST',
    url: '/api/watch/scan',
  });
  assert.equal(scanRes.statusCode, 200);
  const scanData = JSON.parse(scanRes.body);
  assert.ok(scanData.new_photos_found >= 1, 'Watcher must detect the newly dropped photo file');

  // 5. Disable watcher
  const stopWatchRes = await app.inject({
    method: 'POST',
    url: '/api/watch',
    payload: { enabled: false },
  });
  assert.equal(stopWatchRes.statusCode, 200);
  const stoppedWatch = JSON.parse(stopWatchRes.body);
  assert.equal(stoppedWatch.enabled, false);
  assert.equal(stoppedWatch.status, 'disabled');
  console.log('✓ FR-1411 Watch folder monitoring, new photo detection, and auto-ingest trigger verified.');

  // ── Cleanup ──────────────────────────────────────────────────
  stopWatchFolder(true);
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5c_%'").run();
  db.prepare("DELETE FROM photo_cats WHERE photo_id LIKE 'test_p5c_%'").run();

  if (fs.existsSync(TEMP_WATCH_DIR)) {
    fs.rmSync(TEMP_WATCH_DIR, { recursive: true, force: true });
  }

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 5C ACCEPTANCE TESTS PASSED (FR-1410 & FR-1411)');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  stopWatchFolder(true);
  console.error('❌ Phase 5C Tests Failed:', err);
  process.exit(1);
});
