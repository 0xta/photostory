// test/phase5a.test.ts — Phase 5A Acceptance Tests (FR-1401, FR-1402, FR-1405, AC-32, AC-34)
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import app from '../server/index.js';
import db from '../server/db.js';

console.log('🧪 Starting Phase 5A Acceptance Tests (On-This-Day, Relationship Insights & Shared Album)...\n');

async function runTests() {
  await app.ready();

  // Cleanup test fixtures
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5a_%'").run();

  const now = Date.now();

  // ── Seed Persons ──────────────────────────────────────────────
  // 1. Somchai: top friend in 2026
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5a_pr1', 'สมชาย สายลุย', 'ชาย', '#79C7B4', ?)
  `).run(now);

  // 2. Lapsed Friend: met once in Jan 2026 (> 6 months before Nov 2026)
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5a_pr2', 'เพื่อนเก่า ไม่เจอนาน', 'เก่า', '#F0A63C', ?)
  `).run(now);

  // 3. Anniversary Friend: first met 1 year ago on Nov 24, 2025
  db.prepare(`
    INSERT INTO persons (id, name, nick, color, created_at)
    VALUES ('test_p5a_pr3', 'เพื่อนครบรอบ 1 ปี', 'แอนนี่', '#8FB8E8', ?)
  `).run(now);

  // ── Seed Events ───────────────────────────────────────────────
  // Event 1: Prior year (Nov 24, 2025)
  const ts2025 = new Date('2025-11-24T10:00:00.000Z').getTime();
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5a_ev1', 'ทริปเขาใหญ่เมื่อปีก่อน', 'เขาใหญ่', ?, ?)
  `).run(ts2025, ts2025 + 3600000);

  // Event 2: January 2026 (Jan 10, 2026)
  const tsJan2026 = new Date('2026-01-10T12:00:00.000Z').getTime();
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5a_ev2', 'มีตติ้งปีใหม่', 'กรุงเทพฯ', ?, ?)
  `).run(tsJan2026, tsJan2026 + 3600000);

  // Event 3: November 2026 (Nov 15, 2026)
  const tsNov2026 = new Date('2026-11-15T15:00:00.000Z').getTime();
  db.prepare(`
    INSERT INTO events (id, name, place, ts_start, ts_end)
    VALUES ('test_p5a_ev3', 'ปาร์ตี้ส่งท้ายปี 2026', 'สยาม', ?, ?)
  `).run(tsNov2026, tsNov2026 + 3600000);

  // ── Seed Photos ───────────────────────────────────────────────
  // Photo 1: Prior year (Nov 24, 2025) — with Anniversary friend
  db.prepare(`
    INSERT INTO photos (id, path, filename, taken_at, event_id, added_at)
    VALUES ('test_p5a_p1', 'test/otd2025.jpg', 'otd2025.jpg', ?, 'test_p5a_ev1', ?)
  `).run(ts2025, now);
  db.prepare(`
    INSERT INTO photo_persons (photo_id, person_id, source)
    VALUES ('test_p5a_p1', 'test_p5a_pr3', 'manual')
  `).run();

  // Photo 2: Jan 2026 — with Lapsed friend
  db.prepare(`
    INSERT INTO photos (id, path, filename, taken_at, event_id, added_at)
    VALUES ('test_p5a_p2', 'test/jan2026.jpg', 'jan2026.jpg', ?, 'test_p5a_ev2', ?)
  `).run(tsJan2026, now);
  db.prepare(`
    INSERT INTO photo_persons (photo_id, person_id, source)
    VALUES ('test_p5a_p2', 'test_p5a_pr2', 'manual')
  `).run();

  // Photos 3, 4, 5: Nov 2026 — with Somchai (3 photos)
  for (let i = 3; i <= 5; i++) {
    db.prepare(`
      INSERT INTO photos (id, path, filename, taken_at, event_id, note, added_at)
      VALUES ('test_p5a_p' || ?, 'test/somchai_' || ? || '.jpg', 'somchai_' || ? || '.jpg', ?, 'test_p5a_ev3', 'สนุกมากกับสมชาย', ?)
    `).run(i, i, i, tsNov2026 + i * 1000, now);
    db.prepare(`
      INSERT INTO photo_persons (photo_id, person_id, source)
      VALUES ('test_p5a_p' || ?, 'test_p5a_pr1', 'manual')
    `).run(i);
  }

  // ─────────────────────────────────────────────────────────────
  // Test 1: AC-34 (FR-1405 On This Day)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: AC-34 (FR-1405 On This Day resurfaces prior-year photos)');
  const otdRes = await app.inject({
    method: 'GET',
    url: '/api/on-this-day?date=2026-11-24',
  });

  assert.equal(otdRes.statusCode, 200);
  const otdData = JSON.parse(otdRes.body);

  assert.equal(otdData.month_day, '11-24');
  assert.ok(otdData.total_photos >= 1, 'Should find at least 1 photo from 11-24 in prior years');
  assert.ok(otdData.groups.length >= 1, 'Should have at least 1 year group');

  const group2025 = otdData.groups.find((g: any) => g.year === 2025);
  assert.ok(group2025, 'Group for 2025 must exist');
  assert.equal(group2025.years_ago, 1, 'Years ago should be 1');
  assert.ok(
    group2025.photos.some((p: any) => p.id === 'test_p5a_p1'),
    'Photo test_p5a_p1 must be in 2025 group'
  );
  assert.ok(
    group2025.events.some((e: any) => e.name === 'ทริปเขาใหญ่เมื่อปีก่อน'),
    'Event name should be attached'
  );
  console.log('✓ AC-34 (On-This-Day) correctly surfaced 1-year ago memory with event context.');

  // ─────────────────────────────────────────────────────────────
  // Test 2: AC-32 (FR-1401 Relationship Insights)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 2: AC-32 (FR-1401 Relationship Insights: most-met, lapsed, anniversary)');
  const relRes = await app.inject({
    method: 'GET',
    url: '/api/insights/relationships?year=2026&as_of=2026-11-24',
  });

  assert.equal(relRes.statusCode, 200);
  const relData = JSON.parse(relRes.body);

  // Check most-met friend in 2026
  assert.ok(relData.most_met.length >= 1, 'Should list most-met friends this year');
  const topFriend = relData.most_met[0];
  assert.equal(topFriend.id, 'test_p5a_pr1', 'Somchai should be #1 most-met friend');
  assert.ok(topFriend.photo_count >= 3, 'Somchai has at least 3 photos');

  // Check lapsed friend (unseen >= 6 months)
  assert.ok(relData.lapsed.length >= 1, 'Should identify lapsed friends unseen >= 6 months');
  const lapsedFriend = relData.lapsed.find((f: any) => f.id === 'test_p5a_pr2');
  assert.ok(lapsedFriend, 'Lapsed friend must be in lapsed list');
  assert.ok(lapsedFriend.months_unseen >= 6, `Unseen months must be >= 6 (got ${lapsedFriend.months_unseen})`);

  // Check 1-year friendship anniversary
  assert.ok(relData.anniversaries.length >= 1, 'Should find friendship anniversaries');
  const annivFriend = relData.anniversaries.find((f: any) => f.id === 'test_p5a_pr3');
  assert.ok(annivFriend, 'Anniversary friend must be present');
  assert.equal(annivFriend.years, 1, 'Must be a 1-year friendship anniversary');
  console.log('✓ AC-32 correctly listed most-met friend, lapsed friend (>= 6 mos), and 1-year anniversary.');

  // ─────────────────────────────────────────────────────────────
  // Test 3: FR-1402 (Shared Album "X & ME" JSON Endpoint)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 3: FR-1402 (Shared Album "X & ME" API)');
  const albumRes = await app.inject({
    method: 'GET',
    url: '/api/persons/test_p5a_pr1/album',
  });

  assert.equal(albumRes.statusCode, 200);
  const albumData = JSON.parse(albumRes.body);

  assert.equal(albumData.person.name, 'สมชาย สายลุย');
  assert.ok(albumData.stats.photo_count >= 3, 'Stats photo_count must match');
  assert.ok(albumData.chapters.length >= 1, 'Must contain chronological chapters');
  assert.ok(albumData.export_urls.html.includes('/album/export?format=html'), 'HTML export URL present');
  assert.ok(albumData.export_urls.pdf.includes('/album/export?format=pdf'), 'PDF export URL present');
  console.log('✓ FR-1402 Shared Album JSON returns complete stats, chapters, and export links.');

  // ─────────────────────────────────────────────────────────────
  // Test 4: FR-1402 (Shared Album HTML Export)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 4: FR-1402 (Shared Album HTML Export)');
  const htmlExportRes = await app.inject({
    method: 'GET',
    url: '/api/persons/test_p5a_pr1/album/export?format=html',
  });

  assert.equal(htmlExportRes.statusCode, 200);
  assert.ok(htmlExportRes.headers['content-type']?.includes('text/html'), 'Must return HTML Content-Type');
  assert.ok(htmlExportRes.body.includes('สมชาย สายลุย'), 'HTML contains person name');
  assert.ok(htmlExportRes.body.includes('& ME'), 'HTML contains "& ME" branding');
  assert.ok(htmlExportRes.body.includes('ปาร์ตี้ส่งท้ายปี 2026'), 'HTML contains event chapter');
  console.log('✓ FR-1402 Shared Album HTML export renders standalone giftable web page.');

  // ─────────────────────────────────────────────────────────────
  // Test 5: FR-1402 (Shared Album PDF Export)
  // ─────────────────────────────────────────────────────────────
  console.log('\nTest 5: FR-1402 (Shared Album PDF Export)');
  const pdfExportRes = await app.inject({
    method: 'GET',
    url: '/api/persons/test_p5a_pr1/album/export?format=pdf',
  });

  assert.equal(pdfExportRes.statusCode, 200);
  assert.ok(pdfExportRes.headers['content-type']?.includes('application/pdf'), 'Must return PDF Content-Type');
  assert.ok(pdfExportRes.rawPayload.slice(0, 5).toString('ascii') === '%PDF-', 'PDF stream begins with %PDF-');
  console.log('✓ FR-1402 Shared Album PDF export returns valid PDF stream.');

  // ── Cleanup ──────────────────────────────────────────────────
  db.prepare("DELETE FROM photos WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM events WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM persons WHERE id LIKE 'test_p5a_%'").run();
  db.prepare("DELETE FROM photo_persons WHERE photo_id LIKE 'test_p5a_%'").run();

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 5A ACCEPTANCE TESTS PASSED (AC-32 & AC-34)');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 5A Tests Failed:', err);
  process.exit(1);
});
