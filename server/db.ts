// server/db.ts — Database connection, schema, and helpers
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'node:path';
import fs from 'node:fs';
import { DEFAULT_SETTINGS } from './utils.js';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'story.db');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
const RECAPS_DIR = path.join(DATA_DIR, 'recaps');

// Ensure data directories exist
for (const dir of [DATA_DIR, THUMBS_DIR, RECAPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export { DATA_DIR, DB_PATH, THUMBS_DIR, RECAPS_DIR };

// ── Connection ──────────────────────────────────────────────────
const db: DatabaseType = new Database(DB_PATH);

// Load sqlite-vec extension
try {
  sqliteVec.load(db);
} catch (err) {
  console.warn('sqlite-vec extension could not be loaded:', err);
}

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64 MB

// ── Schema ──────────────────────────────────────────────────────
db.exec(`
  -- ===== Axis 1: core (Phase 1) =====

  CREATE TABLE IF NOT EXISTS photos (
    id         TEXT PRIMARY KEY,
    path       TEXT NOT NULL,
    filename   TEXT NOT NULL,
    sha256     TEXT,
    phash      TEXT,
    taken_at   INTEGER,
    lat        REAL,
    lon        REAL,
    w          INTEGER,
    h          INTEGER,
    size       INTEGER,
    event_id   TEXT REFERENCES events(id) ON DELETE SET NULL,
    note       TEXT NOT NULL DEFAULT '',
    burst      INTEGER NOT NULL DEFAULT 0,
    added_at   INTEGER NOT NULL,
    missing_file INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_photos_taken  ON photos(taken_at);
  CREATE INDEX IF NOT EXISTS idx_photos_event  ON photos(event_id);
  CREATE INDEX IF NOT EXISTS idx_photos_sha    ON photos(sha256);
  CREATE INDEX IF NOT EXISTS idx_photos_phash  ON photos(phash);

  CREATE TABLE IF NOT EXISTS events (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL DEFAULT '',
    place    TEXT NOT NULL DEFAULT '',
    note     TEXT NOT NULL DEFAULT '',
    ts_start INTEGER,
    ts_end   INTEGER,
    lat      REAL,
    lon      REAL,
    named    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_events_start ON events(ts_start);

  CREATE TABLE IF NOT EXISTS persons (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    nick   TEXT NOT NULL DEFAULT '',
    note   TEXT NOT NULL DEFAULT '',
    color  TEXT NOT NULL DEFAULT '#E56B50',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photo_persons (
    photo_id  TEXT REFERENCES photos(id)  ON DELETE CASCADE,
    person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
    source    TEXT NOT NULL DEFAULT 'manual',
    PRIMARY KEY (photo_id, person_id)
  );

  CREATE TABLE IF NOT EXISTS photo_cats (
    photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
    cat      TEXT NOT NULL,
    PRIMARY KEY (photo_id, cat)
  );

  -- Phase 3: detected faces (table created now, populated later)
  CREATE TABLE IF NOT EXISTS faces (
    id        TEXT PRIMARY KEY,
    photo_id  TEXT REFERENCES photos(id) ON DELETE CASCADE,
    person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
    bbox      TEXT,
    emb       BLOB,
    cluster_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_faces_photo  ON faces(photo_id);
  CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id);

  -- Tunable settings
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Thai FTS5 trigram
  CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    kind,
    ref_id,
    text,
    tokenize = 'trigram'
  );

  -- ===== Axis 2: thematic stories (Phase 1.5, tables created now) =====

  CREATE TABLE IF NOT EXISTS places (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    lat    REAL,
    lon    REAL,
    radius_m INTEGER NOT NULL DEFAULT 120,
    type   TEXT NOT NULL DEFAULT 'other',
    note   TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    type   TEXT NOT NULL DEFAULT 'topic',
    note   TEXT NOT NULL DEFAULT '',
    cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
    place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collection_photos (
    collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
    photo_id      TEXT REFERENCES photos(id)      ON DELETE CASCADE,
    added_by      TEXT NOT NULL DEFAULT 'manual',
    added_at      INTEGER NOT NULL,
    PRIMARY KEY (collection_id, photo_id)
  );
  CREATE INDEX IF NOT EXISTS idx_collphotos_photo ON collection_photos(photo_id);

  CREATE TABLE IF NOT EXISTS photo_places (
    photo_id TEXT REFERENCES photos(id)  ON DELETE CASCADE,
    place_id TEXT REFERENCES places(id)  ON DELETE CASCADE,
    source   TEXT NOT NULL DEFAULT 'manual',
    PRIMARY KEY (photo_id, place_id)
  );

  CREATE TABLE IF NOT EXISTS meals (
    id        TEXT PRIMARY KEY,
    place_id  TEXT REFERENCES places(id) ON DELETE SET NULL,
    event_id  TEXT REFERENCES events(id) ON DELETE SET NULL,
    taken_at  INTEGER,
    meal_type TEXT NOT NULL DEFAULT 'other',
    note      TEXT NOT NULL DEFAULT '',
    rating    INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meals_place ON meals(place_id);
  CREATE INDEX IF NOT EXISTS idx_meals_taken ON meals(taken_at);

  CREATE TABLE IF NOT EXISTS meal_photos (
    meal_id  TEXT REFERENCES meals(id)  ON DELETE CASCADE,
    photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
    PRIMARY KEY (meal_id, photo_id)
  );

  CREATE TABLE IF NOT EXISTS recaps (
    id         TEXT PRIMARY KEY,
    year       INTEGER NOT NULL,
    month      INTEGER,
    content    TEXT NOT NULL,
    format     TEXT NOT NULL DEFAULT 'template',
    generated_at INTEGER NOT NULL,
    UNIQUE(year, month)
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id      TEXT PRIMARY KEY,
    kind    TEXT NOT NULL,
    payload TEXT NOT NULL,
    status  TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);

  -- ===== Vector index (Phase 2, sqlite-vec) =====
  CREATE VIRTUAL TABLE IF NOT EXISTS photo_vec USING vec0(
    photo_id TEXT PRIMARY KEY,
    emb FLOAT[512] distance_metric=cosine
  );
`);

// ── Seed default settings ───────────────────────────────────────
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);

const seedSettings = db.transaction(() => {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }
});
seedSettings();

// ── Helper: get setting ─────────────────────────────────────────
export function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? DEFAULT_SETTINGS[key] ?? '';
}

export function getSettingNum(key: string): number {
  return Number(getSetting(key));
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    value
  );
}

// ── FTS sync helpers ────────────────────────────────────────────
export function ftsUpsert(kind: string, refId: string, text: string): void {
  // Delete existing entry first
  db.prepare('DELETE FROM search_fts WHERE kind = ? AND ref_id = ?').run(
    kind,
    refId
  );
  if (text.trim()) {
    db.prepare(
      'INSERT INTO search_fts (kind, ref_id, text) VALUES (?, ?, ?)'
    ).run(kind, refId, text);
  }
}

export function ftsDelete(kind: string, refId: string): void {
  db.prepare('DELETE FROM search_fts WHERE kind = ? AND ref_id = ?').run(
    kind,
    refId
  );
}

// ── Export ───────────────────────────────────────────────────────
export default db;
