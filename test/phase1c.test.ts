// test/phase1c.test.ts — Phase 1C Verification (CRUD API, Tags, Friends, Filters, FTS, Dashboard, Backup, Delete)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import db, { THUMBS_DIR } from '../server/db.js';
import app from '../server/index.js';
import { generateFixtures, FIXTURES_DIR } from './fixtures/generate-fixtures.js';

console.log('🧪 Starting Phase 1C verification tests (AC-4 .. AC-12)...\n');

await app.ready();

// 0. Ensure fresh fixtures & clean DB
db.prepare('DELETE FROM photos').run();
db.prepare('DELETE FROM events').run();
db.prepare('DELETE FROM persons').run();
db.prepare('DELETE FROM photo_persons').run();
db.prepare('DELETE FROM photo_cats').run();
db.prepare('DELETE FROM search_fts').run();
if (fs.existsSync(THUMBS_DIR)) {
  for (const f of fs.readdirSync(THUMBS_DIR)) {
    fs.unlinkSync(path.join(THUMBS_DIR, f));
  }
}

await generateFixtures();

// Import 5 fixtures
const importRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { folder: FIXTURES_DIR },
});
const { jobId } = JSON.parse(importRes.body);
for (let i = 0; i < 40; i++) {
  const poll = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
  const data = JSON.parse(poll.body);
  if (data.status === 'done') break;
  await new Promise((r) => setTimeout(r, 100));
}

const initialPhotos = db.prepare('SELECT * FROM photos ORDER BY filename').all() as any[];
assert.equal(initialPhotos.length, 5);
const initialEvents = db.prepare('SELECT * FROM events').all() as any[];
assert.equal(initialEvents.length, 2, 'Initial 2 events');

// ── AC-4 (FR-403/206): Set date on dateless photo ────────────
const dateless = initialPhotos.find((p) => p.filename === 'dateless_note.jpg');
assert.ok(dateless);
assert.equal(dateless.event_id, null);

// Set date to 2026-05-10 (creates 3rd event)
const newDate = new Date('2026-05-10T15:00:00Z').getTime();
const patchDateRes = await app.inject({
  method: 'PATCH',
  url: `/api/photos/${dateless.id}`,
  payload: { taken_at: newDate, note: 'บันทึกรูปงานเลี้ยง' },
});
assert.equal(patchDateRes.statusCode, 200);

const updatedEvents = db.prepare('SELECT * FROM events').all() as any[];
assert.equal(updatedEvents.length, 3, 'Event count should increase to 3 after dating the photo');

const updatedDateless = db.prepare('SELECT * FROM photos WHERE id = ?').get(dateless.id) as any;
assert.notEqual(updatedDateless.event_id, null, 'Photo should now be assigned to an event');
console.log('✓ AC-4 (Date fix & recluster): Dateless photo dated -> joined new event (3 events total).');

// ── AC-5 (FR-203): Name an event & preserve on recluster ──────
const bkkEvent = updatedEvents.find((e) => e.ts_start < new Date('2026-04-01').getTime());
assert.ok(bkkEvent);

const nameEventRes = await app.inject({
  method: 'PATCH',
  url: `/api/events/${bkkEvent.id}`,
  payload: {
    name: 'งานสัมมนาไอที 2026',
    place: 'สยามพารากอน กรุงเทพฯ',
    note: 'พบเพื่อนเก่าหลายคน บรรยากาศดี',
  },
});
assert.equal(nameEventRes.statusCode, 200);
const namedEvent = JSON.parse(nameEventRes.body);
assert.equal(namedEvent.named, 1);
assert.equal(namedEvent.name, 'งานสัมมนาไอที 2026');

// Trigger recluster via API
const reclusterRes = await app.inject({ method: 'POST', url: '/api/recluster' });
assert.equal(reclusterRes.statusCode, 200);

const afterReclusterEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(bkkEvent.id) as any;
assert.equal(afterReclusterEvent.name, 'งานสัมมนาไอที 2026', 'Name must be preserved');
assert.equal(afterReclusterEvent.place, 'สยามพารากอน กรุงเทพฯ', 'Place must be preserved');
assert.equal(afterReclusterEvent.named, 1, 'named flag must be preserved');
console.log('✓ AC-5 (Event naming & preservation): Named event preserved across reclustering.');

// ── AC-7 (FR-502/503): Person CRUD, auto-stats, and timeline ─
const createPersonRes = await app.inject({
  method: 'POST',
  url: '/api/persons',
  payload: {
    name: 'น้องพลอย',
    nick: 'Ploy',
    note: 'เพื่อนสนิทสมัยมหาลัย',
    color: '#79C7B4',
  },
});
assert.equal(createPersonRes.statusCode, 201);
const ploy = JSON.parse(createPersonRes.body);
assert.ok(ploy.id);
assert.equal(ploy.name, 'น้องพลอย');

// Tag Ploy in 2 different events (1 Bangkok photo, 1 Chiang Mai photo)
const bkkPhoto = initialPhotos.find((p) => p.filename === 'bkk_01.jpg');
const cnxPhoto = initialPhotos.find((p) => p.filename === 'cnx_01.jpg');

await app.inject({
  method: 'PUT',
  url: `/api/photos/${bkkPhoto.id}/persons`,
  payload: { persons: [ploy.id] },
});
await app.inject({
  method: 'PUT',
  url: `/api/photos/${cnxPhoto.id}/persons`,
  payload: { persons: [ploy.id] },
});

// Verify person detail & stats (AC-7)
const personDetailRes = await app.inject({
  method: 'GET',
  url: `/api/persons/${ploy.id}`,
});
assert.equal(personDetailRes.statusCode, 200);
const personDetail = JSON.parse(personDetailRes.body);

assert.equal(personDetail.stats.photo_count, 2, 'Should have 2 photos together');
assert.equal(personDetail.stats.event_count, 2, 'Should have 2 distinct events together');
assert.equal(personDetail.stats.first_met, bkkPhoto.taken_at, 'first_met matches earlier Bangkok shot');
assert.equal(personDetail.stats.last_met, cnxPhoto.taken_at, 'last_met matches later Chiang Mai shot');
assert.equal(personDetail.timeline.length, 2, 'Timeline should contain 2 events');
console.log('✓ AC-7 (Person auto-stats & timeline): 2 photos in 2 events, first_met/last_met computed correctly.');

// ── AC-6 (FR-404): Category tagging & dashboard tagged-% ──────
await app.inject({
  method: 'PUT',
  url: `/api/photos/${bkkPhoto.id}/cats`,
  payload: { cats: ['อาหาร', 'บรรยากาศ'] },
});
const bkkPhotoDetail = JSON.parse(
  (await app.inject({ method: 'GET', url: `/api/photos/${bkkPhoto.id}` })).body
);
assert.deepEqual(bkkPhotoDetail.cats.sort(), ['บรรยากาศ', 'อาหาร']);

// Check dashboard tagged percentage
const dashRes1 = await app.inject({ method: 'GET', url: '/api/dashboard' });
const dash1 = JSON.parse(dashRes1.body);
assert.ok(dash1.totals.tagged_pct > 0, 'Tagged percentage should be > 0%');
console.log(`✓ AC-6 (Tagging): Categories and persons persisted, tagged % = ${dash1.totals.tagged_pct}%.`);

// ── AC-8 (FR-601): Filters ────────────────────────────────────
// Filter by category
const catFilterRes = await app.inject({ method: 'GET', url: '/api/photos?cat=อาหาร' });
const catPhotos = JSON.parse(catFilterRes.body);
assert.equal(catPhotos.total, 1);
assert.equal(catPhotos.items[0].id, bkkPhoto.id);

// Filter by burst
const burstFilterRes = await app.inject({ method: 'GET', url: '/api/photos?burst=1' });
const burstPhotos = JSON.parse(burstFilterRes.body);
assert.equal(burstPhotos.total, 2);

// Filter by person
const personFilterRes = await app.inject({ method: 'GET', url: `/api/photos?person=${ploy.id}` });
const personPhotos = JSON.parse(personFilterRes.body);
assert.equal(personPhotos.total, 2);

// Filter by month (March = 3)
const marchFilterRes = await app.inject({ method: 'GET', url: '/api/photos?month=3' });
const marchPhotos = JSON.parse(marchFilterRes.body);
assert.equal(marchPhotos.total, 3, 'March has 3 Bangkok photos');
console.log('✓ AC-8 (Filters): Combinable filters (cat, person, burst, month) return exact counts.');

// ── AC-9 (FR-602): Thai FTS Search (Trigram) ─────────────────
const ftsSearch1 = JSON.parse(
  (await app.inject({ method: 'GET', url: '/api/search?q=สยามพารากอน' })).body
);
assert.equal(ftsSearch1.events.length, 1, 'Should find Bangkok event via place');
assert.equal(ftsSearch1.events[0].id, bkkEvent.id);

const ftsSearch2 = JSON.parse(
  (await app.inject({ method: 'GET', url: '/api/search?q=น้องพลอย' })).body
);
assert.equal(ftsSearch2.persons.length, 1, 'Should find person via Thai name');
assert.equal(ftsSearch2.persons[0].id, ploy.id);
console.log('✓ AC-9 (Thai FTS5 Trigram): Searched "สยามพารากอน" and "น้องพลอย" returned exact matches.');

// ── AC-10 (FR-701..705): Dashboard Endpoints ──────────────────
const dashboard = JSON.parse((await app.inject({ method: 'GET', url: '/api/dashboard' })).body);
assert.equal(dashboard.totals.photos, 5);
assert.equal(dashboard.totals.events, 3);
assert.equal(dashboard.totals.persons, 1);
assert.equal(dashboard.months[2], 3, 'March has 3 photos');
assert.equal(dashboard.months[3], 1, 'April has 1 photo');
assert.equal(dashboard.months[4], 1, 'May has 1 photo');
assert.equal(dashboard.top_friends[0].name, 'น้องพลอย');
assert.equal(dashboard.queue.dateless, 0, 'No dateless photos left');
assert.equal(dashboard.queue.burst, 2, '2 burst photos in queue');
assert.equal(dashboard.recent_events.length, 3, '3 recent events returned');
console.log('✓ AC-10 (Dashboard): Totals, 12-month histogram, top friends, review queue verified.');

// ── AC-11 (FR-801/802): Backup and Restore ────────────────────
const backupRes = await app.inject({ method: 'GET', url: '/api/backup' });
assert.equal(backupRes.statusCode, 200);
const backupData = JSON.parse(backupRes.body);
assert.equal(backupData.photos.length, 5);
assert.equal(backupData.persons.length, 1);

// Clear app data (FR-803)
const clearRes = await app.inject({ method: 'POST', url: '/api/clear' });
assert.equal(clearRes.statusCode, 200);
assert.equal((db.prepare('SELECT COUNT(*) as c FROM photos').get() as any).c, 0);
assert.equal((db.prepare('SELECT COUNT(*) as c FROM events').get() as any).c, 0);
assert.equal((db.prepare('SELECT COUNT(*) as c FROM persons').get() as any).c, 0);

// Re-import photos
const reimportRes = await app.inject({
  method: 'POST',
  url: '/api/import',
  payload: { folder: FIXTURES_DIR },
});
const { jobId: reimportJobId } = JSON.parse(reimportRes.body);
for (let i = 0; i < 40; i++) {
  const poll = await app.inject({ method: 'GET', url: `/api/jobs/${reimportJobId}` });
  const data = JSON.parse(poll.body);
  if (data.status === 'done') break;
  await new Promise((r) => setTimeout(r, 100));
}

// Restore from backup
const restoreRes = await app.inject({
  method: 'POST',
  url: '/api/restore',
  payload: backupData,
});
assert.equal(restoreRes.statusCode, 200);
const restoreResult = JSON.parse(restoreRes.body);
assert.equal(restoreResult.matched_photos, 5);
assert.equal(restoreResult.persons_restored, 1);

// Verify restored data
const restoredPloy = db.prepare('SELECT * FROM persons WHERE name = ?').get('น้องพลอย') as any;
assert.ok(restoredPloy, 'Person restored');

const restoredBkkEvent = db.prepare("SELECT * FROM events WHERE name = 'งานสัมมนาไอที 2026'").get() as any;
assert.ok(restoredBkkEvent, 'Event name restored');
assert.equal(restoredBkkEvent.place, 'สยามพารากอน กรุงเทพฯ');

const restoredTaggedPhoto = db.prepare(`
  SELECT p.id FROM photos p
  JOIN photo_persons pp ON p.id = pp.photo_id
  WHERE pp.person_id = ?
`).all(restoredPloy.id);
assert.ok(restoredTaggedPhoto.length >= 1, 'Tags restored');
console.log('✓ AC-11 (Backup & Restore): Exported -> Cleared -> Re-imported -> Restored all metadata.');

// ── AC-12 (FR-405): Delete photo removes DB row, original file untouched ─
const photoToDelete = db.prepare('SELECT * FROM photos LIMIT 1').get() as any;
const originalDiskPath = photoToDelete.path;
assert.ok(fs.existsSync(originalDiskPath), 'Original file must exist before delete');

const deleteRes = await app.inject({
  method: 'DELETE',
  url: `/api/photos/${photoToDelete.id}`,
});
assert.equal(deleteRes.statusCode, 200);

// Verify DB row deleted
const photoAfterDelete = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoToDelete.id);
assert.equal(photoAfterDelete, undefined, 'DB row must be deleted');

// Verify thumbnail deleted
const thumbFile = path.join(THUMBS_DIR, `${photoToDelete.id}.jpg`);
assert.equal(fs.existsSync(thumbFile), false, 'Thumbnail file must be deleted');

// CRITICAL: Verify original file still intact on disk!
assert.ok(fs.existsSync(originalDiskPath), 'Original file MUST NOT be deleted (AD3 / Non-destructive)!');
console.log('✓ AC-12 (Delete Photo): DB row and thumb removed, original file STILL ON DISK untouched.');

console.log('\n🎉 All Phase 1C verification tests (AC-4 .. AC-12) PASSED!\n');
