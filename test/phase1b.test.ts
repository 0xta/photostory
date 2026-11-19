// test/phase1b.test.ts — Phase 1B Verification (AC-1, AC-2, AC-3, Ingest, Clustering, Bursts, Dedup)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import db, { THUMBS_DIR } from '../server/db.js';
import app from '../server/index.js';
import { generateFixtures, FIXTURES_DIR } from './fixtures/generate-fixtures.js';
import { hammingDistance } from '../server/utils.js';

console.log('🧪 Starting Phase 1B verification tests...\n');

// 0. Clean database and thumbs for reproducible test
db.prepare('DELETE FROM photos').run();
db.prepare('DELETE FROM events').run();
db.prepare('DELETE FROM search_fts').run();
if (fs.existsSync(THUMBS_DIR)) {
  for (const f of fs.readdirSync(THUMBS_DIR)) {
    fs.unlinkSync(path.join(THUMBS_DIR, f));
  }
}

// 1. Generate fixtures
const fixturePaths = await generateFixtures();
assert.equal(fixturePaths.length, 5, 'Should generate 5 fixture photos');
console.log('✓ Fixtures ready: 5 photos in', FIXTURES_DIR);

// 2. Test POST /api/import (AC-1)
await app.ready();

const importRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { folder: FIXTURES_DIR },
});
assert.equal(importRes.statusCode, 202, 'Import should return 202 Accepted');
const { jobId } = JSON.parse(importRes.body);
assert.ok(jobId, 'Should return jobId');

// Poll GET /api/jobs/:id until done
let jobStatus = 'running';
let jobData: any = null;
for (let attempt = 0; attempt < 40; attempt++) {
  const pollRes = await app.inject({
    method: 'GET',
    url: `/api/jobs/${jobId}`,
  });
  assert.equal(pollRes.statusCode, 200);
  jobData = JSON.parse(pollRes.body);
  if (jobData.status === 'done' || jobData.status === 'error') {
    jobStatus = jobData.status;
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}

assert.equal(jobStatus, 'done', `Import job should be done, got: ${JSON.stringify(jobData)}`);
assert.equal(jobData.added, 5, 'Should have added 5 photos');
assert.equal(jobData.dateless, 1, 'Should have flagged 1 dateless photo');
assert.equal(jobData.skippedDup, 0, 'No duplicates on first import');
console.log('✓ AC-1 (Import): Ingest job finished, added 5 photos, 1 dateless');

// 3. Verify Database records & Clustering (AC-1)
const allPhotos = db
  .prepare('SELECT id, filename, taken_at, lat, lon, event_id, burst, sha256, phash FROM photos ORDER BY filename')
  .all() as any[];
assert.equal(allPhotos.length, 5, 'Database should contain exactly 5 photos');

const datelessPhoto = allPhotos.find((p) => p.filename === 'dateless_note.jpg');
assert.ok(datelessPhoto, 'Dateless photo should exist');
assert.equal(datelessPhoto.taken_at, null, 'Dateless photo taken_at should be NULL');
assert.equal(datelessPhoto.event_id, null, 'Dateless photo event_id should be NULL');

const events = db.prepare('SELECT * FROM events ORDER BY ts_start ASC').all() as any[];
assert.equal(events.length, 2, `Expected 2 events (Bangkok and Chiang Mai), got ${events.length}`);
console.log(`✓ AC-1 (Clustering): 4 dated photos grouped into ${events.length} events; 1 dateless photo has event_id NULL.`);

// Verify Bangkok event has 3 photos, Chiang Mai event has 1 photo
const bkkEvent = events[0];
const cnxEvent = events[1];
const bkkPhotos = allPhotos.filter((p) => p.event_id === bkkEvent.id);
const cnxPhotos = allPhotos.filter((p) => p.event_id === cnxEvent.id);
assert.equal(bkkPhotos.length, 3, 'Bangkok event should have 3 photos');
assert.equal(cnxPhotos.length, 1, 'Chiang Mai event should have 1 photo');
assert.ok(bkkEvent.lat > 13.75 && bkkEvent.lat < 13.76, 'Bangkok event centroid latitude correct');
assert.ok(cnxEvent.lat > 18.78 && cnxEvent.lat < 18.79, 'Chiang Mai event centroid latitude correct');
console.log('✓ AC-1 (GPS & Event Centroids): Centroids computed correctly.');

// 4. Verify Burst Detection (AC-2)
const burst1 = allPhotos.find((p) => p.filename === 'bkk_02_burst1.jpg');
const burst2 = allPhotos.find((p) => p.filename === 'bkk_03_burst2.jpg');
const nonBurst = allPhotos.find((p) => p.filename === 'bkk_01.jpg');

assert.equal(burst1.burst, 1, 'bkk_02_burst1 should have burst=1');
assert.equal(burst2.burst, 1, 'bkk_03_burst2 should have burst=1');
assert.equal(nonBurst.burst, 0, 'bkk_01 should have burst=0');
console.log('✓ AC-2 (Burst Detection): 1-second apart shots both have burst=1, non-burst has burst=0.');

// 5. Verify Deduplication & Near-dup (AC-3)
// 5a. Re-import same folder -> 0 added, 5 skippedDup
const reimportRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { folder: FIXTURES_DIR },
});
const { jobId: reimportJobId } = JSON.parse(reimportRes.body);

let reimportJob: any = null;
for (let attempt = 0; attempt < 40; attempt++) {
  const poll = await app.inject({
    method: 'GET',
    url: `/api/jobs/${reimportJobId}`,
  });
  reimportJob = JSON.parse(poll.body);
  if (reimportJob.status === 'done') break;
  await new Promise((r) => setTimeout(r, 100));
}
assert.equal(reimportJob.added, 0, 'Re-import should add 0 new photos');
assert.equal(reimportJob.skippedDup, 5, 'Re-import should skip 5 duplicates');
console.log('✓ AC-3 (Exact Duplicate): Re-import skipped 5 files via sha256 dedup.');

// 5b. Near-duplicate detection (pHash Hamming distance)
// Create a resized copy of bkk_01.jpg
const resizedCopyPath = path.join(FIXTURES_DIR, 'bkk_01_resized.jpg');
await sharp(path.join(FIXTURES_DIR, 'bkk_01.jpg'))
  .resize(200, 150)
  .jpeg({ quality: 60 })
  .toFile(resizedCopyPath);

const importResizedRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { files: [resizedCopyPath] },
});
const { jobId: resizedJobId } = JSON.parse(importResizedRes.body);

let resizedJob: any = null;
for (let attempt = 0; attempt < 40; attempt++) {
  const poll = await app.inject({
    method: 'GET',
    url: `/api/jobs/${resizedJobId}`,
  });
  resizedJob = JSON.parse(poll.body);
  if (resizedJob.status === 'done') break;
  await new Promise((r) => setTimeout(r, 100));
}
assert.equal(resizedJob.added, 1, 'Resized copy has different sha256, so added to DB');

const resizedPhoto = db.prepare('SELECT * FROM photos WHERE filename = ?').get('bkk_01_resized.jpg') as any;
assert.ok(resizedPhoto, 'Resized photo record created');
assert.notEqual(resizedPhoto.sha256, nonBurst.sha256, 'Sha256 should be different');

// Check pHash distance between original and resized copy
const dist = hammingDistance(resizedPhoto.phash, nonBurst.phash);
assert.ok(dist <= 6, `pHash Hamming distance should be <= 6 for resized copy, got ${dist}`);
console.log(`✓ AC-3 (Near Duplicate): Resized photo has different sha256 but pHash Hamming dist = ${dist} (<= 6) - NOT auto-deleted.`);

// Cleanup resized copy from disk & DB
fs.unlinkSync(resizedCopyPath);
db.prepare('DELETE FROM photos WHERE id = ?').run(resizedPhoto.id);

// 6. Test Decision D8: Re-import path update
// If a file is moved to a new path (same sha256)
const altFolder = path.resolve('test/fixtures/moved');
fs.mkdirSync(altFolder, { recursive: true });
const movedFile = path.join(altFolder, 'bkk_01_moved.jpg');
fs.copyFileSync(path.join(FIXTURES_DIR, 'bkk_01.jpg'), movedFile);

const moveImportRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { files: [movedFile] },
});
const { jobId: moveJobId } = JSON.parse(moveImportRes.body);
for (let attempt = 0; attempt < 40; attempt++) {
  const poll = await app.inject({ method: 'GET', url: `/api/jobs/${moveJobId}` });
  const d = JSON.parse(poll.body);
  if (d.status === 'done') break;
  await new Promise((r) => setTimeout(r, 100));
}

const updatedPhoto = db.prepare('SELECT path, missing_file FROM photos WHERE id = ?').get(nonBurst.id) as any;
assert.equal(updatedPhoto.path, movedFile, 'Path should be updated to new location (Decision D8)');
assert.equal(updatedPhoto.missing_file, 0, 'missing_file flag should be cleared');
console.log('✓ Decision D8: Moving file to new path updates photos.path and clears missing_file.');

// Restore original path & cleanup altFolder
db.prepare('UPDATE photos SET path = ? WHERE id = ?').run(path.join(FIXTURES_DIR, 'bkk_01.jpg'), nonBurst.id);
fs.unlinkSync(movedFile);
fs.rmdirSync(altFolder);

// 7. Test Thumbnail generation and serving (FR-105)
const thumbRes = await app.inject({
  method: 'GET',
  url: `/api/thumbs/${nonBurst.id}`,
});
assert.equal(thumbRes.statusCode, 200, 'Thumbnail serving should return 200');
assert.equal(thumbRes.headers['content-type'], 'image/jpeg');
assert.ok(thumbRes.rawPayload.length > 500, 'Thumbnail should have image bytes');
console.log('✓ FR-105: Thumbnails generated and served at GET /api/thumbs/:id');

// 8. Test Reclustering endpoint
const reclusterRes = await app.inject({
  method: 'POST',
  url: '/api/recluster',
});
assert.equal(reclusterRes.statusCode, 200);
const reclusterData = JSON.parse(reclusterRes.body);
assert.equal(reclusterData.events, 2);
assert.equal(reclusterData.photos, 5);
console.log('✓ POST /api/recluster triggers clustering and returns count of events and photos.');

console.log('\n🎉 All Phase 1B verification tests (AC-1, AC-2, AC-3) PASSED!\n');
await app.close();
