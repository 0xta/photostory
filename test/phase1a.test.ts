// test/phase1a.test.ts — Phase 1A verification test
import assert from 'node:assert/strict';
import db, { getAllSettings, getSetting, setSetting, ftsUpsert, ftsDelete } from '../server/db.js';
import { autoEventName, formatThaiDate, haversine, CATEGORIES } from '../server/utils.js';

console.log('🧪 Starting Phase 1A verification tests...\n');

// 1. Verify all tables exist in SQLite
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string }>;

const tableNames = new Set(tables.map(t => t.name));
console.log(`✓ Tables found in DB (${tableNames.size}):`, Array.from(tableNames).join(', '));

const expectedTables = [
  'photos',
  'events',
  'persons',
  'photo_persons',
  'photo_cats',
  'faces',
  'settings',
  'search_fts',
  'places',
  'collections',
  'collection_photos',
  'photo_places',
  'meals',
  'meal_photos',
  'recaps',
  'suggestions',
];

for (const expected of expectedTables) {
  assert.ok(tableNames.has(expected), `Missing expected table: ${expected}`);
}
console.log('✓ All 16 core & future-proof tables exist.');

// 2. Verify PRAGMAs (WAL mode, foreign keys)
const journalMode = db.pragma('journal_mode', { simple: true });
assert.equal(String(journalMode).toLowerCase(), 'wal', 'journal_mode should be WAL');

const foreignKeys = db.pragma('foreign_keys', { simple: true });
assert.equal(Number(foreignKeys), 1, 'foreign_keys should be enabled');
console.log('✓ PRAGMAs verified: WAL mode and foreign_keys=ON.');

// 3. Verify settings table seeded with defaults
const settings = getAllSettings();
assert.equal(settings.gap_hours, '4');
assert.equal(settings.dist_km, '2');
assert.equal(settings.burst_ms, '2000');
assert.ok(['dark', 'warm', 'light'].includes(settings.theme), 'Valid theme setting');
console.log('✓ Settings seeded with defaults, initial theme:', settings.theme);

// Test changing theme to 'warm' and 'light'
setSetting('theme', 'warm');
assert.equal(getSetting('theme'), 'warm');
setSetting('theme', 'light');
assert.equal(getSetting('theme'), 'light');
setSetting('theme', 'dark'); // restore
assert.equal(getSetting('theme'), 'dark');
console.log('✓ Theme settings support 3 themes: light, warm, dark.');

// 4. Verify FTS5 with trigram tokenizer
ftsUpsert('event', 'ev-1', 'เที่ยวเชียงใหม่ วัดพระธาตุดอยสุเทพ');
const ftsResult = db
  .prepare("SELECT ref_id FROM search_fts WHERE search_fts MATCH ?")
  .all('เชียงใหม่') as Array<{ ref_id: string }>;

assert.equal(ftsResult.length, 1, 'Should find 1 match for เชียงใหม่');
assert.equal(ftsResult[0].ref_id, 'ev-1');

// Test cleanup
ftsDelete('event', 'ev-1');
const ftsAfterDelete = db
  .prepare("SELECT ref_id FROM search_fts WHERE search_fts MATCH ?")
  .all('เชียงใหม่') as Array<{ ref_id: string }>;
assert.equal(ftsAfterDelete.length, 0, 'Should find 0 matches after delete');
console.log('✓ FTS5 trigram Thai search and deletion verified.');

// 5. Verify utils (Thai date, autoEventName, haversine, categories)
const testDate = new Date('2026-03-14T10:30:00Z').getTime();
const thaiFormatted = formatThaiDate(testDate);
assert.ok(thaiFormatted.includes('มี.ค.'), 'Should contain Thai month abbreviation');
assert.ok(thaiFormatted.includes('2569'), 'Should contain Buddhist year (2026 + 543 = 2569)');

const autoName = autoEventName(1, testDate);
assert.ok(autoName.startsWith('ช่วงที่ 1 · '));

const bkk = { lat: 13.7563, lon: 100.5018 };
const cnx = { lat: 18.7883, lon: 98.9853 };
const dist = haversine(bkk, cnx);
assert.ok(dist > 500 && dist < 700, `Expected BKK-CNX dist ~580km, got ${dist}`);

assert.equal(CATEGORIES.length, 7, 'Should have 7 fixed categories');
console.log('✓ Utilities (Thai dates, Buddhist era, Haversine, 7 categories) verified.');

console.log('\n🎉 All Phase 1A verification tests PASSED!\n');
