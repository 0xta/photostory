# PRD — "เรื่องราว 2026" (My Story 2026)
## Local-First Personal Photo Journal · Node.js Backend

| | |
|---|---|
| **Document version** | 2.0 |
| **Status** | Ready for implementation |
| **Audience** | Coding agent / engineer implementing the system |
| **Language of this doc** | English (implementation language). **All user-facing UI text is Thai** — see Appendix A. |
| **Reference prototype** | `reference/prototype.html` (working browser-only prototype; reuse its UI/UX and Thai copy) |

> How to read this doc: Sections 1–3 define intent and constraints. Sections 4–9 are the build spec (data, API, algorithms, workers, frontend). Section 10 covers the frontend. Section 11 lists non-functional requirements. Section 12 is the acceptance checklist. Section 13 is the phased delivery plan. Section 14 holds appendices (exact Thai strings, colors, constants, glossary). **Read Section 1.1 (the two-axis model) first — it is the conceptual backbone of v2.0.**

### Changelog
- **v2.0** — Added the **thematic-stories layer** (collections, meal diary, place/project threads) as a second organizing axis alongside auto-events; added **monthly & yearly recap** (template-based short stories); added **Phase 1.5** (stories + recap, no AI) and **Phase 5** (future value-add features: relationship insights, slide OCR knowledge base, on-this-day, personal map, social graph, auto best-shot, local-LLM Q&A, shared albums, open-format export, watch-folder). New schema (collections, places, meals, recaps), API, algorithms, workers, acceptance tests AC-20…AC-31, and Thai strings.
- **v1.0** — Initial Phase 1–4 spec (foundation, semantic search, faces, offline voice).

---

## 1. Overview & Problem

A single user (the owner) takes ~5,000 photos/year on a phone: food and drinks at every meal (sometimes the restaurant atmosphere too), event atmospheres, conference slides, self-portraits, photos with new friends, rooms/places (a condo being decorated, houses visited), and beautiful buildings/homes kept as memories. Over a decade this reaches ~50,000 photos. The owner wants to **organize these into a personal story** — grouped by event, tagged by category, linked to friend profiles that automatically count "how many times have I photographed with this person," **and gathered into thematic stories** (a meal diary, a condo-decoration progress thread, a log of houses visited) **with a short, easy-to-read monthly recap.**

The system runs **entirely on the owner's personal notebook (laptop)**. It is **local-first**: originals and all data stay on the machine; nothing is uploaded. It must work **without any cloud AI API** (zero paid API calls). Optional on-device ML (CLIP embeddings, face clustering, Whisper speech, OCR, a small local LLM) may be added in later phases, but the core must be fully functional with rules + EXIF alone.

### 1.1 The Two-Axis Model (conceptual backbone)

The system organizes photos along **two independent axes**. Do not conflate them.

```
AXIS 1 — EVENTS (automatic, time/GPS)            [Phase 1]
   "14 Mar · Tech Conference", "22 Apr · Chiang Mai trip"
   = what happened, when, where. Clustered from EXIF, no owner input needed.
   A photo belongs to exactly ONE event (or none if dateless).

AXIS 2 — STORIES / COLLECTIONS (thematic, span events)   [Phase 1.5]
   "ตกแต่งคอนโด 2026", "มื้ออาหารของฉัน", "บ้านที่ไปเยี่ยม", "สไลด์ที่สนใจ"
   = one ongoing topic accumulated across months and across many events.
   A photo may belong to MANY collections. Membership is manual + rule/semantic
   suggestions the owner confirms.
```

A single photo lives on both axes at once: e.g. a condo-kitchen photo belongs to the event "12 Jun · at the condo" **and** to the collection "ตกแต่งคอนโด 2026" (which renders as a before→after progress timeline).

**Specialized collection types** (built on the generic collection mechanism):
- **Meal diary** — sub-unit is a *meal* (food + drink + atmosphere of one restaurant visit), with a named *place* (restaurant) reused across visits.
- **Place / project thread** — a named GPS anchor (my condo, a friend's house) that gathers photos into a timeline; a condo becomes a decoration-progress story, houses visited become a visit log.
- **Topic album** — generic subject collection (slides by topic, architecture, etc.).

**Recap** is an output layer that reads both axes (events + collections + persons + places + keepers + notes) and renders a short Thai story per month/year. It needs no AI (template-based); a local LLM may optionally polish the prose.

### Goals
- G1. Ingest thousands of photos and auto-group them into **events** using EXIF timestamp + GPS (no AI).
- G2. Let the owner fill missing metadata (event name, place, note, dateless photos, friend names) **quickly, including by Thai voice input**.
- G3. Maintain **friend profiles** and auto-compute co-occurrence stats (photos together, events together, first/last met, timeline).
- G4. Provide fast **search & filter** (category, friend, month, GPS status, burst) and Thai full-text search.
- G5. Be **durable and portable**: SQLite single-file DB, JSON metadata backup/restore, originals never modified.
- G6. Scale to 50,000+ photos on commodity laptop hardware (CPU-only acceptable).
- G7. Let the owner build **thematic stories/collections** that span events — a meal diary, place/project threads (condo progress, houses visited), and topic albums — with rule/semantic suggestions (no AI required).
- G8. Auto-group food+drink+atmosphere photos into **meals** tied to named **places** (restaurants), reusable across visits.
- G9. Generate a **short, easy-to-read monthly recap** (and yearly recap) as a Thai story from existing data, template-based with optional local-LLM polish; exportable as HTML/PDF/image.

### Non-Goals
- N1. No multi-user, no auth, no cloud sync, no sharing/public links.
- N2. No photo editing (crop/filter/rotate) of originals.
- N3. No mobile native app (responsive web UI only).
- N4. No mandatory internet dependency. First load may fetch CDN assets, but an offline build is a Phase-4 goal.
- N5. No cloud AI API calls at any phase. On-device models only.

### Guiding Principles (from the owner)
1. **Local-first** — data never leaves the machine by default.
2. **EXIF is the source of truth** for date/GPS; prefer it over any guess.
3. **AI is the last resort** — rules/algorithms first; on-device ML only where rules fail, and always as a *suggestion* layer, never a hard dependency.
4. **Non-destructive** — never alter or delete original files automatically. Deleting in-app removes only the DB record/thumbnail.
5. **Human fills gaps briefly** — a review queue that is finishable in one sitting; voice makes each item a ~5-second task.
6. **Sustainable rhythm** — support a 15-min/month maintenance ritual.

## 2. Users & Primary Use Cases

**Single user = the owner.** No roles/permissions. The UI is Thai.

| # | Use case | Priority |
|---|---|---|
| UC1 | Import a month/folder of photos; system reads EXIF and auto-groups into events | P0 |
| UC2 | See a dashboard: totals, monthly shooting histogram, top friends, "needs your input" queue | P0 |
| UC3 | Open an event, name it (type or Thai voice), set place + note | P0 |
| UC4 | Open a photo, tag category + friends, add a note (voice), fix a missing date | P0 |
| UC5 | Add a friend profile (voice name), then see auto counts + timeline of meetings | P0 |
| UC6 | Filter/search all photos by category, friend, month, GPS, burst; Thai text search | P0 |
| UC7 | Review burst shots and suspected duplicates; keep the best, remove the rest from library | P1 |
| UC8 | Backup metadata to JSON; restore on another machine | P1 |
| UC9 | Semantic search in Thai ("รูปอาหารตอนกลางคืน") via on-device CLIP | P2 (Phase 2) |
| UC10 | Auto-suggest which friend appears in a photo via on-device face clustering | P2 (Phase 3) |
| UC11 | Fully offline Thai voice via whisper.cpp | P3 (Phase 4) |
| UC12 | Create a thematic collection ("ตกแต่งคอนโด 2026"); add photos manually or accept suggestions; view as a timeline | P1 (Phase 1.5) |
| UC13 | Food/drink/atmosphere photos auto-group into a **meal**; name the restaurant once, reuse on later visits; browse meal diary | P1 (Phase 1.5) |
| UC14 | Pin a named place (condo/house); photos near it link automatically; condo shows decoration progress, houses show a visit log | P1 (Phase 1.5) |
| UC15 | Read an auto-generated **monthly recap** as a short Thai story; export HTML/PDF/image; browse past months | P1 (Phase 1.5) |
| UC16 | Yearly recap / photo-book of the year's keepers and stories | P2 (Phase 5) |
| UC17 | Relationship insights: most-met friends this year, friends not seen in 6 months, friendship anniversaries | P2 (Phase 5) |
| UC18 | Search slide content (OCR) — "which event had the OKR slide?" → link back to event/date/place | P2 (Phase 5) |
| UC19 | "On this day" memory resurfacing; personal life map / heatmap of places | P2 (Phase 5) |
| UC20 | Ask questions about my own life in Thai via a local LLM (RAG over notes/events/OCR) | P3 (Phase 5) |

P0 = must ship in Phase 1. P1 = ship in Phase 1 or Phase 1.5 (stories/recap, still no AI). P2 = Phase 2/3/5. P3 = Phase 4/5 (optional, heavier). All later-phase schema/hooks exist from day one so no migration is needed.

## 3. Technology Stack (Locked)

The owner has explicitly chosen **Node.js** (no Python). Do not substitute the runtime or introduce Python.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Node.js 22 LTS**, ESM modules | Single process: `node server/index.js` |
| Language | JavaScript (ESM) or TypeScript | TS preferred for the server; keep build simple (`tsc` or run via `tsx`). No heavy framework. |
| HTTP API | **Fastify** | Lightweight, built-in schema validation. Serves the static frontend too. |
| Database | **better-sqlite3** | Synchronous API suits local single-user workloads. Enable `PRAGMA journal_mode=WAL`. |
| Vector index | **sqlite-vec** (loadable extension) | Phase 2. Lives in the same SQLite file. |
| Full-text | **SQLite FTS5**, `tokenize='trigram'` | Required for Thai substring search (unicode61 cannot segment Thai). |
| Image processing | **sharp** | Thumbnails, resize, raw pixel access for pHash. |
| EXIF | **exifr** | Same library as the prototype. |
| Perceptual hash | **imghash** or custom DCT pHash via sharp | For resize/chat-resistant duplicate detection. |
| Hashing | Node `crypto` (sha256) | Exact-duplicate detection. |
| ML — embeddings (Phase 2) | **@huggingface/transformers** (Transformers.js) | Multilingual CLIP ONNX, e.g. `jina-clip-v2`. CPU/WASM. |
| ML — faces (Phase 3) | **onnxruntime-node** + InsightFace (buffalo_l) | Detection + embedding. Greedy clustering in JS. |
| ML — speech (Phase 4) | **whisper.cpp** sidecar binary (optional) | Default voice stays browser Web Speech API (free). |
| ML — OCR (Phase 5) | **tesseract.js** or PaddleOCR (ONNX) | Slide text extraction, on-device. |
| ML — aesthetic (Phase 5) | **NIMA** (ONNX via onnxruntime-node) | Best-shot keeper scoring, on-device. |
| ML — local LLM (Phase 5) | **Ollama / llama.cpp** + Thai-capable model (Qwen2.5 / Typhoon) | Life Q&A (RAG) + recap polish + captions. On-device, no cloud API. |
| PDF/export (Phase 1.5+) | a PDF lib (e.g. pdfkit) or headless render; canvas raster for image | Recap/album export. |
| Frontend | Vanilla JS single-file UI (from prototype) | Replace IndexedDB layer with `fetch()` to the API. No React/Vue. |

### Dependency policy
- Prefer prebuilt binaries. `better-sqlite3` and `sharp` ship prebuilds; document the one-time build-tools fallback for unusual machines.
- Pin versions in `package.json`. Provide `npm install && npm start` as the only setup.
- **No cloud AI SDKs.** All models run on-device.

## 4. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser (Thai UI, from prototype)                          │
│  public/index.html  — fetch() → REST API                    │
│  Voice: Web Speech API (th-TH) [Phase 4: whisper sidecar]   │
└───────────────▲────────────────────────────────────────────┘
                │ HTTP (localhost only)
┌───────────────┴────────────────────────────────────────────┐
│  Fastify server (server/index.js)                           │
│  ├─ routes/   photos · events · persons · collections ·     │
│  │            places · meals · recaps · search ·            │
│  │            import · backup · settings · thumbs           │
│  ├─ db.js     better-sqlite3 + sqlite-vec + FTS5 (WAL)      │
│  └─ workers/  ingest · cluster · suggest · recap ·          │
│               embed(P2) · faces(P3) · ocr/bestshot(P5)      │
└───────────────┬────────────────────────────────────────────┘
                │ reads paths, writes DB + thumbnails
┌───────────────┴────────────────────────────────────────────┐
│  Filesystem                                                 │
│  originals/  → owner's existing folders (SCAN-IN-PLACE,     │
│                never copied/moved/modified)                 │
│  data/story.db, data/thumbs/, data/recaps/  → app-owned     │
└────────────────────────────────────────────────────────────┘
```

### Key architectural decisions
- **AD1. Scan-in-place.** Import records the absolute `path` of each original; it does NOT copy originals into a library. Thumbnails are generated into `data/thumbs/`. This keeps the DB small and respects the owner's existing folder layout.
- **AD2. Single SQLite file is the source of truth** for all metadata, tags, persons, events, collections, places, meals, vectors, and the FTS index. Backup = copy one file (plus a JSON export for portability).
- **AD3. Originals are immutable.** The app never writes to, moves, renames, or deletes an original file. "Delete photo" removes only the DB row + thumbnail.
- **AD4. Workers are resumable batch jobs.** Ingest/embed/faces/ocr run as idempotent jobs that can be interrupted and resumed; they never block the API event loop (use worker threads or chunked async with `setImmediate` yields).
- **AD5. Localhost only.** Bind to `127.0.0.1`. No external network calls except optional first-load CDN assets (frontend) and optional model downloads (Phase 2+), which must be cacheable for offline use.
- **AD6. ML is a suggestion layer.** Embeddings/face clusters/OCR produce *suggestions* the owner confirms. Core organization (events, collections, meals, places, counts, recap, search-by-filter) must work with ML disabled.
- **AD7. Two axes are independent.** Events (axis 1) are auto-clustered and a photo has ≤1 event. Collections (axis 2) are thematic and a photo may have many. Reclustering events must never destroy collection membership; collection membership changes must never alter events.
- **AD8. Recap is a derived, cached output.** Recaps are generated from current data and cached in `recaps`; they regenerate on demand or when underlying data changes. They are never the source of truth — deleting a recap loses nothing.

## 5. Data Model (SQLite)

All IDs are TEXT (e.g. `Date.now().toString(36) + random`). Timestamps are INTEGER Unix **milliseconds**. Coordinates are REAL degrees. Enable WAL and foreign keys on every connection.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Originals are referenced by path, never stored as BLOB.
CREATE TABLE photos (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL,            -- absolute path to original (scan-in-place)
  filename   TEXT NOT NULL,
  sha256     TEXT,                     -- exact-duplicate key
  phash      TEXT,                     -- perceptual hash (near-duplicate key)
  taken_at   INTEGER,                  -- EXIF ms; NULL if unknown
  lat        REAL, lon REAL,           -- EXIF GPS; NULL if absent
  w          INTEGER, h INTEGER,       -- original pixel dimensions
  size       INTEGER,                  -- original file bytes
  event_id   TEXT REFERENCES events(id) ON DELETE SET NULL,
  note       TEXT NOT NULL DEFAULT '',
  burst      INTEGER NOT NULL DEFAULT 0,  -- 1 if part of a burst group
  added_at   INTEGER NOT NULL,
  missing_file INTEGER NOT NULL DEFAULT 0 -- 1 if original no longer found on disk
);
CREATE INDEX idx_photos_taken  ON photos(taken_at);
CREATE INDEX idx_photos_event  ON photos(event_id);
CREATE INDEX idx_photos_sha    ON photos(sha256);
CREATE INDEX idx_photos_phash  ON photos(phash);

CREATE TABLE events (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL DEFAULT '',   -- '' = auto-named, awaiting owner input
  place    TEXT NOT NULL DEFAULT '',
  note     TEXT NOT NULL DEFAULT '',
  ts_start INTEGER, ts_end INTEGER,
  lat REAL, lon REAL,                  -- centroid of member GPS
  named    INTEGER NOT NULL DEFAULT 0  -- 1 once owner sets a name (preserve on recluster)
);
CREATE INDEX idx_events_start ON events(ts_start);

CREATE TABLE persons (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  nick   TEXT NOT NULL DEFAULT '',
  note   TEXT NOT NULL DEFAULT '',
  color  TEXT NOT NULL DEFAULT '#E56B50',
  created_at INTEGER NOT NULL
);

-- Many-to-many tags
CREATE TABLE photo_persons (
  photo_id  TEXT REFERENCES photos(id)  ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  source    TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'face-suggestion' | 'face-confirmed'
  PRIMARY KEY (photo_id, person_id)
);
CREATE TABLE photo_cats (
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  cat      TEXT NOT NULL,               -- one of the 7 fixed categories (Appendix B)
  PRIMARY KEY (photo_id, cat)
);

-- Phase 3: detected faces
CREATE TABLE faces (
  id        TEXT PRIMARY KEY,
  photo_id  TEXT REFERENCES photos(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  bbox      TEXT,                       -- JSON [x,y,w,h] normalized 0..1
  emb       BLOB,                       -- face embedding (float32 LE)
  cluster_id TEXT                       -- greedy-cluster label before naming
);
CREATE INDEX idx_faces_photo  ON faces(photo_id);
CREATE INDEX idx_faces_person ON faces(person_id);

-- Tunable settings (thresholds etc.)
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
-- defaults: gap_hours=4, dist_km=2, burst_ms=2000, phash_hamming=6, face_cosine=0.45

-- Thai full-text search (trigram). Contentless-style external content table.
CREATE VIRTUAL TABLE search_fts USING fts5(
  kind,            -- 'photo' | 'event' | 'person'
  ref_id,          -- id of the source row
  text,            -- concatenated searchable text (note, filename, name, place)
  tokenize = 'trigram'
);

-- Phase 2: vector index (same file). Dimension depends on chosen CLIP model.
CREATE VIRTUAL TABLE photo_vec USING vec0(
  photo_id TEXT PRIMARY KEY,
  emb FLOAT[512]    -- adjust to model output dim (jina-clip-v2 = 512)
);

-- ===== Axis 2: thematic stories (Phase 1.5) =====

-- Named GPS anchors: my condo, a friend's house, a restaurant, a visited place.
CREATE TABLE places (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  lat REAL, lon REAL,                  -- anchor coordinate (nullable for non-GPS places)
  radius_m INTEGER NOT NULL DEFAULT 120,  -- match radius for auto-linking photos
  type   TEXT NOT NULL DEFAULT 'other',   -- 'home'|'project'|'visit'|'restaurant'|'other'
  note   TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Generic thematic collection (axis 2). Specialized types reuse this table.
CREATE TABLE collections (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  type   TEXT NOT NULL DEFAULT 'topic',   -- 'meal_diary'|'place_project'|'topic'|'custom'
  note   TEXT NOT NULL DEFAULT '',
  cover_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,  -- for place_project / meal_diary
  created_at INTEGER NOT NULL
);
CREATE TABLE collection_photos (
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  photo_id      TEXT REFERENCES photos(id)      ON DELETE CASCADE,
  added_by      TEXT NOT NULL DEFAULT 'manual',  -- 'manual'|'rule'|'semantic'
  added_at      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, photo_id)
);
CREATE INDEX idx_collphotos_photo ON collection_photos(photo_id);

-- Link a photo to a named place (auto-suggested by GPS proximity, owner confirms).
CREATE TABLE photo_places (
  photo_id TEXT REFERENCES photos(id)  ON DELETE CASCADE,
  place_id TEXT REFERENCES places(id)  ON DELETE CASCADE,
  source   TEXT NOT NULL DEFAULT 'manual',  -- 'manual'|'gps-suggestion'|'gps-confirmed'
  PRIMARY KEY (photo_id, place_id)
);

-- A meal = food + drink + atmosphere of one restaurant visit (sub-unit of meal_diary).
CREATE TABLE meals (
  id        TEXT PRIMARY KEY,
  place_id  TEXT REFERENCES places(id) ON DELETE SET NULL,  -- the restaurant
  event_id  TEXT REFERENCES events(id) ON DELETE SET NULL,
  taken_at  INTEGER,                       -- meal start (min member taken_at)
  meal_type TEXT NOT NULL DEFAULT 'other', -- 'breakfast'|'lunch'|'dinner'|'cafe'|'other'
  note      TEXT NOT NULL DEFAULT '',      -- dishes / comments
  rating    INTEGER,                       -- 1..5, nullable
  created_at INTEGER NOT NULL
);
CREATE TABLE meal_photos (
  meal_id  TEXT REFERENCES meals(id)  ON DELETE CASCADE,
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (meal_id, photo_id)
);
CREATE INDEX idx_meals_place ON meals(place_id);
CREATE INDEX idx_meals_taken ON meals(taken_at);

-- Cached monthly/yearly recap (derived output, regenerable).
CREATE TABLE recaps (
  id         TEXT PRIMARY KEY,
  year       INTEGER NOT NULL,
  month      INTEGER,                      -- 1..12 for monthly; NULL for yearly
  content    TEXT NOT NULL,                -- JSON: stats + narrative + highlight photo ids
  format     TEXT NOT NULL DEFAULT 'template',  -- 'template'|'llm'
  generated_at INTEGER NOT NULL,
  UNIQUE(year, month)
);

-- Pending suggestions inbox (rule/semantic/face/gps), owner confirms or dismisses.
CREATE TABLE suggestions (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,                   -- 'collection'|'meal'|'place'|'face'
  payload TEXT NOT NULL,                   -- JSON describing the suggestion
  status  TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'accepted'|'dismissed'
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_suggestions_status ON suggestions(status);
```

> **Schema phasing:** `places`, `collections`, `collection_photos`, `photo_places`, `meals`, `meal_photos`, `recaps`, `suggestions` are created in Phase 1 (empty) so Phase 1.5 needs no migration. `photo_vec` is created in Phase 2; `faces` in Phase 3. FTS `kind` extends to `'collection'|'place'|'meal'` in Phase 1.5.

### Data rules
- **DR1.** A photo with `taken_at IS NULL` has `event_id NULL` and appears in the "dateless" queue. Setting a date triggers reclustering.
- **DR2.** `events.name=''` means auto-generated display name (Appendix C formula). `named=1` once the owner types/speaks a name; reclustering must preserve name/place/note of matched events.
- **DR3.** Deleting a person removes their `photo_persons` rows (cascade) but never touches photos. Deleting a photo cascades tags/faces and removes its thumbnail file.
- **DR4.** FTS index is kept in sync on every write to photo note/filename, event name/place/note, person name/nick/note, collection name/note, place name/note, meal note (rebuild that row's `search_fts` entry).
- **DR5.** `missing_file=1` is set when a scan finds the original path gone; such photos are excluded from thumbnail serving but retained for metadata until the owner purges them.
- **DR6.** Axis independence (AD7): reclustering events never deletes `collection_photos`, `meal_photos`, or `photo_places` rows. Deleting a photo cascades all its axis-2 memberships. Deleting a collection/place/meal cascades only its membership rows, never photos.
- **DR7.** A photo may belong to many collections but to ≤1 meal (a meal is a single visit). Meal membership is suggested by the meal-grouping algorithm (8.6) and confirmed by the owner.
- **DR8.** `places` are reusable named anchors. When a new meal/photo GPS falls within `radius_m` of an existing place, suggest linking to it (reuse the restaurant name) rather than creating a duplicate place.
- **DR9.** `recaps` are derived caches (AD8). Regenerate on demand (`POST /recaps`) or mark stale when underlying photos/events/collections/persons change. Deleting a recap loses no source data.
- **DR10.** `suggestions` are non-destructive proposals. Accepting applies the change (e.g. adds a `collection_photos` row with `added_by='rule'`); dismissing sets `status='dismissed'` and never re-suggests the identical payload. Nothing is auto-applied without confirmation except trivially-safe auto-linking the owner has enabled in settings.

## 6. Functional Requirements

Requirement IDs are stable; acceptance tests (Section 12) reference them.

### 6.1 Import / Ingest
- **FR-101** Accept import by (a) multi-file selection, (b) whole-folder selection, (c) drag-and-drop, and (d) a server-side folder path scan (`POST /import {folder}`). Recurse subfolders for (b)/(d).
- **FR-102** Accept JPEG, PNG, WebP. Skip non-images. For HEIC/HEIF that sharp cannot decode, skip and report a count (do not crash).
- **FR-103** For each image extract EXIF: `taken_at` from `DateTimeOriginal → CreateDate → ModifyDate`; `lat/lon` from GPS. If no EXIF date, fall back to a date pattern in the filename (e.g. `2026-03-14`, `20260314`); else leave `taken_at NULL`. Never use file mtime as a date (unreliable).
- **FR-104** Compute `sha256` (exact dup) and `phash` (near dup). Skip exact duplicates already in DB (same sha256). Flag near-duplicates (pHash Hamming ≤ `phash_hamming`, default 6) for review — do NOT auto-delete.
- **FR-105** Generate a thumbnail: longest side 560px, JPEG quality ~0.72, saved to `data/thumbs/{id}.jpg`. Store original `w/h/size`.
- **FR-106** Show import progress (processed/total, current filename) and a final summary: added, skipped-duplicate, skipped-unreadable, dateless count.
- **FR-107** Import is idempotent and resumable: re-importing the same folder adds nothing new (sha256 check) and does not duplicate rows.
- **FR-108** After import completes, run clustering (FR-201) automatically.

### 6.2 Event Clustering
- **FR-201** Group dated photos into events by the algorithm in Section 8.1 (time-gap + GPS-distance). Thresholds read from `settings` (defaults 4h / 2km).
- **FR-202** Mark bursts: consecutive dated photos ≤ `burst_ms` (default 2000ms) apart get `burst=1` (Section 8.2).
- **FR-203** Preserve owner-entered event fields across reclustering: match new clusters to existing events by member-photo overlap; carry over `name/place/note/named` (Section 8.1 step 4).
- **FR-204** Dateless photos (`taken_at NULL`) are never clustered; they sit in the dateless queue.
- **FR-205** Recompute event `ts_start/ts_end` and GPS centroid on every recluster. Remove events that end up with zero photos.
- **FR-206** Changing a photo's date (FR-403) or deleting a photo triggers recluster.

### 6.3 Events
- **FR-301** List events as contact-sheet cards (cover thumbnails, frame range, date range, GPS, photo count, place, distinct-friend count). Sort by `ts_start`.
- **FR-302** Event detail: editable name, place, note (each with a voice mic button); read-only EXIF summary (date range, time range, centroid GPS, photo/burst counts); friend chips; photo grid.
- **FR-303** Auto display name when `name=''`: `ช่วงที่ {index} · {DD Mon}` (Appendix C). Show a "รอตั้งชื่อ" badge until named.

### 6.4 Photos & Tagging
- **FR-401** Photo grid with lazy-loaded thumbnails; category color dots + friend dot overlays; burst badge.
- **FR-402** Photo modal: large thumbnail, EXIF panel (date/time, GPS, dimensions, burst warning), category chips (7 fixed, multi-select), friend chips (multi-select) + "add new friend", note field (voice), date-time editor, delete button, prev/next navigation (buttons + ArrowLeft/ArrowRight), Esc to close.
- **FR-403** Editing a date for a dateless photo sets `taken_at`, then reclusters (FR-206) and reports the new event assignment.
- **FR-404** Toggling a category/friend writes immediately (optimistic UI) and persists via API.
- **FR-405** Delete photo: confirm dialog clarifying "original file is NOT deleted"; removes DB row + thumbnail + cascaded tags/faces; reclusters.

### 6.5 Persons (Friends)
- **FR-501** CRUD person profiles: name (required), nick, note, color. Voice input on name/nick/note.
- **FR-502** Person detail auto-stats: **photos together** (count of `photo_persons`), **events together** (distinct events of those photos), **first met** (min `taken_at`), **last met** (max `taken_at`).
- **FR-503** Person timeline: events where they appear, each with date, event name, photo count, place.
- **FR-504** Person photo grid: all photos tagged with them.
- **FR-505** Delete person: confirm; removes tag associations (cascade) but keeps photos. Stats recompute automatically.
- **FR-506** (Phase 3) Face suggestions appear as unconfirmed chips the owner can accept (→ `source='face-confirmed'`) or dismiss.

### 6.6 Search & Filter
- **FR-601** Filter all photos by: category, friend, month (1–12), GPS status (has/none/dateless), burst-only. Combinable; show filtered/total count; clear-filters action.
- **FR-602** Thai full-text search via FTS5 trigram across photo notes/filenames, event names/places/notes, person names/nicks/notes. Return mixed results grouped by kind, each linking to its detail.
- **FR-603** (Phase 2) Semantic search: embed the Thai query with multilingual CLIP, cosine top-K against `photo_vec`, blend with FTS results (hybrid). Works with ML disabled → falls back to FTS only.

### 6.7 Dashboard & Review Queue
- **FR-701** Dashboard stats: total photos, total events, total persons, % tagged (has ≥1 category or friend).
- **FR-702** Monthly histogram for the target year (12 bars); clicking a bar filters photos to that month.
- **FR-703** Top friends by photo count (top 5), each linking to person detail.
- **FR-704** "รอคุณเติมข้อมูล" queue: dateless photos (→ dateless filter), unnamed events (→ events), burst photos (→ burst filter), tagging progress. Each item has a jump-to action.
- **FR-705** Recent events (latest 3) as contact-sheet cards.

### 6.8 Backup & Portability
- **FR-801** Export metadata JSON: persons, events, photos (without thumbnail blobs). Include `sha256` as the stable matching key.
- **FR-802** Restore from JSON on a machine that already imported the same originals: match photos by `sha256` (fallback filename+size), restore tags/notes/date; restore persons; restore event names/places/notes by matching `ts_start` (±1s) after recluster.
- **FR-803** "Clear all app data" wipes DB tables + thumbnails (originals untouched), with confirmation.

### 6.9 Settings
- **FR-901** Expose thresholds (`gap_hours`, `dist_km`, `burst_ms`, `phash_hamming`, `face_cosine`, `place_radius_m`, `meal_gap_min`, `auto_link_places`) via `settings` table + `GET/PATCH /settings`. Changing clustering thresholds triggers recluster.

### 6.10 Thematic Stories / Collections (Phase 1.5)
- **FR-1001** CRUD collections: name (required, voice), type (`meal_diary`/`place_project`/`topic`/`custom`), note (voice), cover photo, optional linked place. List as cards (cover, name, type badge, photo count, date span).
- **FR-1002** Add/remove photos to a collection manually (from photo modal "เพิ่มเข้าเรื่องราว" picker, or from collection detail "เพิ่มรูป"). Membership is many-to-many; a photo can be in multiple collections.
- **FR-1003** Collection detail renders by type: `place_project` → chronological progress timeline (before→after); `meal_diary` → meals grouped by place/date; `topic`/`custom` → photo grid + optional timeline. Show stats (photo count, date span, places, friends appearing).
- **FR-1004** **Rule suggestions** (no AI): propose adding a photo to a collection when its category matches a topic collection, or its GPS links to the collection's place. Surface in the suggestions inbox; owner accepts/dismisses (DR10).
- **FR-1005** **Semantic suggestions** (Phase 2+, optional): propose photos whose CLIP vector is close to the collection's centroid vector. Suggestion-only.
- **FR-1006** Deleting a collection removes only membership rows (cascade), never photos (DR6).

### 6.11 Meal Diary (Phase 1.5)
- **FR-1101** Auto-group food + drink + atmosphere photos into a **meal**: within an event, photos categorized `อาหาร` (and `บรรยากาศ` at the same place/time) cluster by GPS proximity + time gap (`meal_gap_min`, default 90 min) → one meal (algorithm 8.6). Suggest, owner confirms.
- **FR-1102** A meal links to a **place** (restaurant). If GPS matches an existing place within `radius_m`, reuse it (DR8); else prompt to name a new restaurant place (voice).
- **FR-1103** Meal fields: restaurant (place), meal type (`breakfast`/`lunch`/`dinner`/`cafe`/`other` — auto-guess from time of day, owner can change), date, note/dishes (voice), rating (1–5), companions (friends from member photos), photos.
- **FR-1104** Meal diary view: chronological list of meals grouped by month, each card showing restaurant, date, type, thumbnail strip, rating, companions. Filter by restaurant / meal type / month.
- **FR-1105** Restaurant page: all meals at that place, visit count, first/last visit, average rating, map pin, photo grid. "ร้านที่ไปซ้ำ" = places with ≥2 meals.
- **FR-1106** Personal food map (Phase 5): plot restaurant places on a map, sized by visit count.

### 6.12 Places & Project Threads (Phase 1.5)
- **FR-1201** CRUD named places: name (voice), type (`home`/`project`/`visit`/`restaurant`/`other`), GPS anchor (set from a photo's GPS or manually), match radius, note (voice).
- **FR-1202** **GPS auto-link suggestion**: a photo within `radius_m` of a place → suggest linking (`photo_places`, source `gps-suggestion`); owner confirms → `gps-confirmed`. If `auto_link_places` setting is on, auto-confirm (still non-destructive, reversible).
- **FR-1203** Place detail: timeline of linked photos/events, visit count, first/last visit, friends appearing, photo grid, map pin. For `project` type (e.g. condo) render a **progress timeline** (chronological, before→after) with optional milestone notes.
- **FR-1204** A `place_project` collection wraps a place to present it as a story (e.g. "ตกแต่งคอนโด 2026"); creating a project place can auto-create its collection.
- **FR-1205** Houses visited (`visit` type) form a visit log: each place card shows when visited, with whom, notes, photos.

### 6.13 Monthly & Yearly Recap (Phase 1.5)
- **FR-1301** Generate a **monthly recap** for any month with data: a short, easy-to-read Thai story built from that month's events, collections activity, top friends, places/restaurants, meals, and keeper photos. Template-based, **no AI required** (algorithm 8.8).
- **FR-1302** Recap structure (Appendix F template): headline stats (photos, events, new restaurants, friends met) → 2–4 sentence narrative → 4–6 highlight photos (keepers) → friends appeared (with counts) → places visited → a featured meal. Keep it short (readable in <30s).
- **FR-1303** Keeper selection for highlights: prefer non-burst, owner-favorited (if favorites exist), else highest-quality heuristic (Phase 5 aesthetic score) or first sharp photo per event. No AI required for the baseline.
- **FR-1304** Recap view: readable card in-app; browse past months (month picker); regenerate button; export as **HTML / PDF / shareable image**. Cache in `recaps` (DR9); mark stale on data change.
- **FR-1305** **Yearly recap** (Phase 5): aggregate the year's 12 monthly recaps + top events/collections/friends/places into a year story / photo-book outline; export PDF/HTML album.
- **FR-1306** **Optional local-LLM polish** (Phase 5): send the template facts to a local LLM (Ollama/llama.cpp) to rewrite the narrative as nicer Thai prose; store with `format='llm'`. Never required; template is the default and always available offline. No cloud API.

### 6.14 Future Value-Add Features (Phase 5, specified for hooks)
These leverage the accumulated DB; all remain local-first and suggestion/output-oriented. Schema hooks noted; implement only when the phase is reached.
- **FR-1401 Relationship insights:** most-met friends this year; friends not seen in N months (default 6) → "should reach out"; friendship anniversaries (1 year since first met). Derived from `photo_persons` + `taken_at`. No AI.
- **FR-1402 Shared album "X & ME":** auto-build an album of all photos with a given friend; export HTML/PDF to gift them. Uses existing person tags.
- **FR-1403 Social graph:** nodes = persons, edges = shared events (weight = co-occurrence count); visualize communities (work friends vs travel friends). Derived from `photo_persons`. No AI.
- **FR-1404 Slide OCR knowledge base:** OCR slide-category photos on-device (tesseract.js / PaddleOCR ONNX) → store text (new `photo_text` table) → index FTS + vector → search "which event had the OKR slide?" → link to event/date/place. Add `photo_text(photo_id, text, source)`.
- **FR-1405 On this day:** resurface photos from the same day in prior years (+ their events/friends). Cheap, high emotional value. No AI.
- **FR-1406 Personal life map / heatmap:** all GPS events/places on a map, heat by frequency; most-visited places. Uses existing GPS. No AI.
- **FR-1407 Auto best-shot:** aesthetic scoring (NIMA ONNX) + sharpness → suggest keeper per burst/event; duplicate-cleanup dashboard from pHash + vector groups. Suggestion-only.
- **FR-1408 Local-LLM life Q&A:** RAG over notes/events/OCR/places with a local Thai-capable LLM (Ollama/llama.cpp, e.g. Qwen2.5 / Typhoon) → "ปีที่แล้วไปเชียงใหม่กับใคร กินอะไร". On-device, no cloud API. Optional, heaviest.
- **FR-1409 Auto-caption (optional):** small local VLM (e.g. Qwen2.5-VL via llama.cpp) generates Thai captions → enrich FTS + accessibility + recap narration. Heaviest; do last.
- **FR-1410 Open-format export / exit plan:** export JSON/CSV/GeoJSON; optionally write tags back to XMP sidecar files (never modify originals' pixels) so metadata survives outside the app.
- **FR-1411 Watch folder / auto-ingest:** watch a drop folder (and optional Syncthing from phone) → auto ingest+cluster+suggest on new files. Voice journal: record a Thai voice note per event → whisper → event note.

## 7. REST API Specification

Base: `http://127.0.0.1:{PORT}/api` (default PORT 3000). JSON bodies. Errors: `{ "error": "message" }` with appropriate HTTP status (400 validation, 404 not found, 500 internal). All list endpoints support `?limit=&offset=` where noted.

### Import & jobs
| Method · Path | Body / Query | Returns |
|---|---|---|
| `POST /import` | `{ folder?: string, files?: [path] }` | `{ jobId }` — starts async ingest+cluster |
| `GET /jobs/:id` | — | `{ status: 'running'\|'done'\|'error', processed, total, current, added, skippedDup, skippedUnreadable, dateless, error? }` |
| `POST /recluster` | — | `{ events: n, photos: n }` |

Frontend polls `GET /jobs/:id` (~500ms) for the progress overlay. File-picker/drag-drop imports upload files to a temp dir then call the same ingest path; folder-scan imports pass `folder` directly.

### Photos
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /photos` | `?cat=&person=&month=&gps=yes\|no\|nodate&burst=1&q=&limit=&offset=` | `{ total, items: [Photo] }` |
| `GET /photos/:id` | — | `Photo` (with `cats:[], friends:[personId], event`) |
| `PATCH /photos/:id` | `{ note?, taken_at?, lat?, lon? }` | updated `Photo`; date change triggers recluster |
| `DELETE /photos/:id` | — | `{ ok: true }` (DB+thumb only) |
| `PUT /photos/:id/cats` | `{ cats: [string] }` | `{ cats }` (replaces set) |
| `PUT /photos/:id/persons` | `{ persons: [personId] }` | `{ persons }` (replaces set, source='manual') |
| `GET /thumbs/:id` | — | `image/jpeg` (thumbnail bytes; 404 if missing_file) |

`Photo` shape: `{ id, filename, path, taken_at, lat, lon, w, h, size, event_id, note, burst, cats:[], friends:[], missing_file }`.

### Events
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /events` | `?limit=&offset=` | `{ total, items: [Event] }` sorted by ts_start |
| `GET /events/:id` | — | `Event` + `photos:[Photo]` + `friends:[Person]` |
| `PATCH /events/:id` | `{ name?, place?, note? }` | updated `Event` (sets named=1 if name non-empty) |

`Event` shape: `{ id, name, place, note, ts_start, ts_end, lat, lon, named, photo_count, friend_count, cover_ids:[≤4] }`.

### Persons
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /persons` | — | `{ items: [Person + {photo_count, event_count}] }` |
| `POST /persons` | `{ name, nick?, note?, color? }` | created `Person` |
| `GET /persons/:id` | — | `Person` + stats `{photo_count, event_count, first_met, last_met}` + `timeline:[Event]` + `photos:[Photo]` |
| `PATCH /persons/:id` | `{ name?, nick?, note?, color? }` | updated `Person` |
| `DELETE /persons/:id` | — | `{ ok: true }` |

### Collections (Phase 1.5)
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /collections` | `?type=&limit=&offset=` | `{ total, items: [Collection + {photo_count, date_span}] }` |
| `POST /collections` | `{ name, type?, note?, place_id?, cover_photo_id? }` | created `Collection` |
| `GET /collections/:id` | — | `Collection` + `photos:[Photo]` + `timeline` (for place_project) + `meals` (for meal_diary) + stats |
| `PATCH /collections/:id` | `{ name?, note?, type?, cover_photo_id?, place_id? }` | updated `Collection` |
| `DELETE /collections/:id` | — | `{ ok: true }` (memberships only) |
| `PUT /collections/:id/photos` | `{ add:[photoId], remove:[photoId] }` | `{ photo_count }` |
| `GET /collections/:id/suggestions` | — | rule/semantic candidate photos to add |

### Places (Phase 1.5)
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /places` | `?type=` | `{ items: [Place + {photo_count, visit_count}] }` |
| `POST /places` | `{ name, type?, lat?, lon?, radius_m?, note? }` | created `Place` |
| `GET /places/:id` | — | `Place` + `timeline:[Event]` + `photos:[Photo]` + `meals:[Meal]` + stats `{visit_count, first_visit, last_visit}` |
| `PATCH /places/:id` · `DELETE /places/:id` | fields / — | updated / `{ ok: true }` |
| `PUT /places/:id/photos` | `{ add:[photoId], remove:[photoId] }` | `{ photo_count }` (source manual) |

### Meals (Phase 1.5)
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /meals` | `?place=&type=&month=&year=` | `{ total, items: [Meal + {place, photo_count, companions}] }` |
| `POST /meals` | `{ place_id?, event_id?, meal_type?, note?, rating?, photos:[photoId] }` | created `Meal` |
| `GET /meals/:id` | — | `Meal` + `photos:[Photo]` + `place` + `companions:[Person]` |
| `PATCH /meals/:id` | `{ place_id?, meal_type?, note?, rating? }` | updated `Meal` |
| `DELETE /meals/:id` | — | `{ ok: true }` (memberships only) |
| `POST /meals/suggest` | `{ event_id? }` | `{ jobId }` — run meal-grouping (8.6), emit suggestions |

### Recaps (Phase 1.5)
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /recaps` | `?year=` | `{ items: [{year, month, generated_at, stale}] }` |
| `GET /recaps/:year/:month` | month=`0` for yearly | `Recap` content JSON (generate if absent) |
| `POST /recaps` | `{ year, month?, format?: 'template'\|'llm' }` | `{ jobId }` — (re)generate; `format:'llm'` requires local LLM (Phase 5) |
| `GET /recaps/:year/:month/export` | `?format=html\|pdf\|image` | rendered file download |

### Suggestions inbox (Phase 1.5)
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /suggestions` | `?kind=&status=pending` | `{ items: [Suggestion] }` |
| `POST /suggestions/:id/accept` | — | applies the proposal, `{ ok: true }` |
| `POST /suggestions/:id/dismiss` | — | `{ ok: true }` (won't re-suggest identical payload) |

### Search, dashboard, settings, backup
| Method · Path | Body / Query | Returns |
|---|---|---|
| `GET /search` | `?q=` | `{ photos:[], events:[], persons:[], collections:[], places:[], meals:[] }` (FTS; +semantic in Phase 2) |
| `GET /dashboard` | `?year=2026` | `{ totals:{photos,events,persons,collections,places,meals,tagged_pct}, months:[12], top_friends:[], queue:{dateless,unnamed,burst,tagged_pct,pending_suggestions}, recent_events:[3], latest_recap }` |
| `GET /settings` · `PATCH /settings` | `{ key:value }` | settings map; clustering keys trigger recluster |
| `GET /backup` | — | JSON download (persons, events, collections, places, meals, photos w/o blobs) |
| `POST /restore` | backup JSON | `{ matched, persons_restored, events_restored, collections_restored, places_restored, meals_restored }` |
| `POST /clear` | — | `{ ok: true }` (wipes app data) |

### Phase 2/3 (stub now, implement later)
| Method · Path | Purpose |
|---|---|
| `POST /embed` | start CLIP embedding job → `{ jobId }` |
| `POST /faces` | start face detect+cluster job → `{ jobId }` |
| `GET /persons/:id/suggestions` | unconfirmed face-suggestion chips |
| `POST /photos/:id/confirm-face` | `{ person_id }` accept a suggestion |

### Phase 5 (stub now, implement later)
| Method · Path | Purpose |
|---|---|
| `GET /insights/relationships` | most-met / lapsed / anniversaries (FR-1401) |
| `GET /persons/:id/album` | shared "X & ME" album + export (FR-1402) |
| `GET /insights/social-graph` | nodes/edges of co-occurrence (FR-1403) |
| `POST /ocr` · `GET /search?q=&slides=1` | slide OCR job + slide-text search (FR-1404) |
| `GET /on-this-day` | prior-year same-day memories (FR-1405) |
| `GET /map` | GPS events/places heatmap data (FR-1406) |
| `POST /bestshot` | aesthetic keeper suggestions (FR-1407) |
| `POST /ask` | local-LLM RAG life Q&A (FR-1408) |
| `GET /export` | `?format=json\|csv\|geojson\|xmp` open-format export (FR-1410) |
| `POST /watch` | configure watch-folder auto-ingest (FR-1411) |

## 8. Algorithms (Exact Specifications)

### 8.1 Event clustering (time-gap + GPS-distance)
Inputs: dated photos sorted ascending by `taken_at`; settings `gap_hours` (4), `dist_km` (2).

```
clusters = []; cur = null
for p in dated_photos_sorted:
    if cur is not null:
        prev = cur.photos.last
        farTime = (p.taken_at - cur.lastTs) > gap_hours*3600*1000
        farGps  = p.hasGPS and cur.hasGPS and
                  haversine(p, cur.centroid) > dist_km
        if farTime or farGps:
            clusters.push(cur); cur = null
    if cur is null:
        cur = { photos:[], lastTs:p.taken_at, centroid:null, n:0, sumLat:0, sumLon:0 }
    cur.photos.push(p); cur.lastTs = p.taken_at
    if p.hasGPS:
        cur.n++; cur.sumLat+=p.lat; cur.sumLon+=p.lon
        cur.centroid = { lat:cur.sumLat/cur.n, lon:cur.sumLon/cur.n }
if cur: clusters.push(cur)
```

Then **preserve owner data** (FR-203):
```
oldEventOfPhoto = map photo.id -> photo.event_id (before recluster)
usedEvents = {}
for c in clusters:
    ev = first existing event found via any member photo's old event_id
         that is not already in usedEvents
    if ev is null: ev = newEvent()
    mark ev used
    ev.ts_start = c.photos.first.taken_at
    ev.ts_end   = c.photos.last.taken_at
    ev.lat/lon  = c.centroid (or null)
    assign ev.id to every photo in c
dateless photos -> event_id = null
delete events with zero photos
persist events + photo.event_id
```
Haversine (km), R=6371:
```
dLat=rad(b.lat-a.lat); dLon=rad(b.lon-a.lon)
h=sin(dLat/2)^2 + cos(rad(a.lat))*cos(rad(b.lat))*sin(dLon/2)^2
return 2*R*asin(sqrt(h))
```

### 8.2 Burst detection
Within the sorted dated stream, if `p.taken_at - prev.taken_at <= burst_ms` (2000), set `burst=1` on both `p` and `prev`. Reset all `burst=0` before each recluster pass. (Chain bursts naturally mark every member.)

### 8.3 Duplicate detection
- **Exact:** same `sha256` already present → skip on import (FR-104/107).
- **Near:** pHash Hamming distance ≤ `phash_hamming` (6) → flag for review, never auto-delete. pHash = DCT-based 64-bit perceptual hash (use `imghash` or compute via sharp grayscale 32×32 → DCT → top-left 8×8 → median threshold). Compare against existing hashes; at 50k rows a linear Hamming scan is acceptable (<50ms); optionally bucket by hash prefix.

### 8.4 Face clustering (Phase 3, greedy agglomerative on cosine)
Inputs: face embeddings (normalized float32), threshold `face_cosine` (0.45, tunable).
```
clusters = []   // each: { id, centroid(normalized), count, member_face_ids }
for face_emb in all_faces:
    best = argmax over clusters of cosine(face_emb, cluster.centroid)
    if best exists and cosine >= face_cosine:
        add face to best; centroid = normalize(mean of members); count++
    else:
        new cluster { id:uid(), centroid:face_emb, count:1 }
    face.cluster_id = chosen cluster id
```
Then surface each cluster as a **suggestion**: "group of N faces — who is this?" Owner names it once → create/link `persons` row → set `faces.person_id` and add `photo_persons` rows with `source='face-suggestion'` (owner confirms → `'face-confirmed'`). Cosine = dot product of normalized vectors. Recompute incrementally on new faces; full recluster on demand.

### 8.5 Semantic search (Phase 2)
- Image side: embed each photo thumbnail with multilingual CLIP (e.g. `jina-clip-v2`, 512-d), L2-normalize, store in `photo_vec`.
- Query side: embed the Thai query text with the same model's text encoder, normalize.
- Rank by cosine (via sqlite-vec `MATCH` + distance), take top-K (e.g. 60). Hybrid: merge with FTS5 trigram results, de-dup by photo id, weight semantic slightly higher when query is natural language vs. exact keyword.
- **Fallback:** if no embeddings exist or ML disabled, return FTS-only results (FR-603).

### 8.6 Meal grouping (Phase 1.5, no AI)
Goal: cluster food/drink/atmosphere photos of one restaurant visit into a meal.
```
candidates = photos with cat 'อาหาร' OR ('บรรยากาศ' AND same-place/time as a food photo)
group candidates within each event by:
    sort by taken_at
    start new meal when gap > meal_gap_min (default 90) OR
         GPS distance from current meal centroid > place_radius_m (default 120m)
for each meal group:
    place = nearest existing place within radius_m (reuse restaurant, DR8)
            else null → prompt owner to name a new restaurant place
    meal_type = guess from taken_at hour:
        5–10 breakfast · 11–14 lunch · 17–21 dinner · else cafe/other
    emit suggestion { kind:'meal', photos, place_id?, meal_type }
owner confirms → create meals + meal_photos rows
```
Atmosphere-only photos (no food nearby) are not forced into meals; they may still link to the place via 8.7.

### 8.7 Place GPS matching (Phase 1.5, no AI)
```
for each photo with GPS not yet linked to a place:
    for each place with GPS:
        if haversine(photo, place) <= place.radius_m:
            emit suggestion { kind:'place', photo_id, place_id }
            (if settings.auto_link_places: auto-create photo_places source 'gps-confirmed')
            break   // nearest match wins; prefer smallest distance if multiple
```
Reuse the Haversine from 8.1. Matching is O(photos × places); at 50k photos / few hundred places this is fine, optionally bucket places by geohash prefix. Suggestions are non-destructive (DR10).

### 8.8 Recap generation (Phase 1.5, template-based, no AI)
```
input: year, month (NULL = yearly)
scope = photos/events/collections/meals/places/persons within [month start, end]
facts = {
  photo_count, event_count,
  new_restaurants = places(type restaurant) first visited in scope,
  meals_count, top_meal (highest rating or most photos),
  friends = persons appearing in scope, sorted by photo count,
  places_visited = distinct places in scope,
  collections_active = collections with new photos in scope,
  highlights = pick_keepers(scope, 4..6)   // FR-1303
}
narrative = fill Thai template (Appendix F) with facts   // 2–4 sentences
content = { stats:facts, narrative, highlight_ids, friends, places, top_meal }
upsert recaps(year, month, content, format='template')
```
**Keeper picker (baseline, no AI):** exclude burst members except one representative per burst; prefer owner favorites if present; else pick the first photo per event with largest dimension / sharpest proxy (file size per pixel); spread across distinct events/collections for variety. Phase 5 may replace the proxy with a NIMA aesthetic score.
**Optional LLM polish (Phase 5):** pass `facts` (not raw photos) to a local LLM with a Thai prompt to rewrite `narrative`; store `format='llm'`. Template remains the offline default.

### 8.9 Collection auto-suggestion (Phase 1.5 rules; Phase 2 semantic)
- **Rule (no AI):** for each `topic` collection with a category mapping, suggest photos whose `photo_cats` match; for `place_project`/`meal_diary` collections linked to a place, suggest photos linked to that place (8.7). Emit `suggestions{kind:'collection'}`.
- **Semantic (Phase 2):** collection centroid = mean of member photo vectors (normalized); suggest unmembered photos with cosine ≥ threshold (e.g. 0.3, tunable). Suggestion-only; owner confirms (DR10).

## 9. Worker Pipelines

All workers are **idempotent, resumable, non-blocking**. Run heavy CPU work in `worker_threads` (or chunk with `setImmediate` yields) so the API stays responsive. Track job state in memory (or a `jobs` table) exposed via `GET /jobs/:id`.

### 9.1 Ingest worker (Phase 1)
```
for each candidate file:
    if sha256 already in photos: skip (dup)
    read EXIF (exifr) → taken_at (fallback chain FR-103), lat/lon
    sharp → metadata (w,h), thumbnail 560px q0.72 → data/thumbs/{id}.jpg
    compute phash
    insert photos row (event_id=null initially)
    update job counters; yield every ~25 files
after all: run cluster worker (8.1/8.2); update FTS for new rows
```
- Failure on one file (corrupt/unsupported) → increment `skippedUnreadable`, continue.
- Re-running on the same folder is a no-op for existing sha256 (FR-107).

### 9.2 Cluster worker (Phase 1)
Implements 8.1 + 8.2, preserves named-event fields, recomputes centroids/ranges, prunes empty events, writes `photo.event_id`. Triggered after ingest, on date edit, on photo delete, on threshold change.

### 9.3 Embed worker (Phase 2)
```
load multilingual CLIP ONNX once (cache model files locally for offline)
for each photo without a photo_vec row:
    embed thumbnail → normalize → insert photo_vec
    checkpoint progress; resumable (skip already-embedded)
```
Batch size tuned to RAM; CPU acceptable (~10–30 img/s). 5,000 photos ≈ a few minutes.

### 9.4 Face worker (Phase 3)
```
load InsightFace ONNX (det + recognition) once
for each photo without faces rows:
    detect faces → bbox + embedding → insert faces
run greedy clustering (8.4) over all embeddings
emit suggestions (clusters without a named person)
```
Resumable; re-cluster on demand or when new faces arrive.

### 9.5 Speech (Phase 4, optional)
Default: browser Web Speech API (`th-TH`), no server work. Offline option: `whisper.cpp` sidecar; frontend records audio (MediaRecorder) → `POST /transcribe` → sidecar returns Thai text → fills the field. Keep Web Speech as the zero-install default.

### 9.6 Suggestion worker (Phase 1.5, no AI)
Runs meal grouping (8.6), place GPS matching (8.7), and collection rule suggestions (8.9) after ingest/recluster and on demand (`POST /meals/suggest`, etc.). Emits rows into `suggestions` (status `pending`). Idempotent: skip payloads already pending/accepted/dismissed (DR10). Never auto-applies except `auto_link_places` (reversible). Non-blocking (chunked yields).

### 9.7 Recap worker (Phase 1.5)
Implements 8.8. Triggered by `POST /recaps` or lazily on `GET /recaps/:year/:month` when absent/stale. Renders export files (HTML always; PDF via a headless render or a PDF lib; image via canvas/server-side raster) into `data/recaps/`. Marks `recaps` stale when source data changes (a lightweight trigger on photo/event/collection/person writes). Template path needs no model; LLM path (Phase 5) calls the local LLM sidecar.

### 9.8 OCR / best-shot workers (Phase 5, on-device)
- **OCR (FR-1404):** for `สไลด์`-category photos, run tesseract.js / PaddleOCR ONNX → store `photo_text` → index FTS + (optionally) embed text into a text-vector table for semantic slide search. Resumable; cache model locally.
- **Best-shot (FR-1407):** run NIMA ONNX aesthetic score + sharpness proxy over burst/near-dup groups → emit keeper suggestions. Suggestion-only.
- **Local LLM (FR-1408/1306):** Ollama/llama.cpp sidecar; RAG retrieves relevant notes/events/OCR/place facts (FTS + vector) → Thai answer / recap polish. On-device, no cloud API. Heaviest; gate behind an explicit enable setting.

## 10. Frontend Requirements

**Reuse the prototype** (`reference/prototype.html`) for layout, visual design, and Thai copy. The main change is replacing the IndexedDB data layer with `fetch()` calls to the REST API (Section 7). Keep it a single-file vanilla-JS app (no React/Vue/build step required).

### 10.1 Views (tabs)
Phase 1 tabs (from prototype):
- **ภาพรวม (Dashboard):** stats cards, monthly histogram (clickable bars), top friends, review queue, recent events, latest recap teaser. (FR-701…705)
- **เหตุการณ์ (Events):** contact-sheet card grid → event detail (editable name/place/note with voice, EXIF panel, friend chips, photo grid). Dateless-photo tray with date fix. (FR-301…303)
- **รูปทั้งหมด (Photos):** filter bar (category/friend/month/GPS/burst) + grid + photo modal. (FR-401…405, 601)
- **เพื่อน (Friends):** person cards with counts → person detail (stats, timeline, photo grid), add/edit/delete with voice. (FR-501…505)

Phase 1.5 adds:
- **เรื่องราว (Stories/Collections):** collection cards (cover, type badge, counts) → detail rendered by type (progress timeline / meals / grid); create with voice; add photos; accept suggestions. (FR-1001…1006)
- **มื้ออาหาร (Meal Diary):** chronological meal cards grouped by month (restaurant, type, thumb strip, rating, companions); filters; restaurant page with visit history; meal editor (voice note, rating, type). (FR-1101…1105)
- **สถานที่ (Places):** place cards by type → place detail (timeline / progress for projects / visit log); pin GPS from a photo; auto-link suggestions. (FR-1201…1205)
- **สรุปเดือน (Recap):** readable monthly story card; month picker to browse past months; regenerate; export HTML/PDF/image. (FR-1301…1304)
- **กล่องข้อเสนอ (Suggestions inbox):** pending meal/place/collection/face suggestions with accept/dismiss; reachable from dashboard queue badge. (DR10)

Photo modal gains: "เพิ่มเข้าเรื่องราว" (collection picker), "ผูกสถานที่" (place picker), meal membership indicator. Keep the existing category/friend/note/date controls.

Phase 5 adds (when reached): relationship-insights panel, social-graph view, slide-search toggle, on-this-day card, life-map view, shared-album export, life-Q&A box. These are additive panels/views, not a redesign.

### 10.2 Visual design (keep from prototype)
- Dark "darkroom contact-sheet" theme. Tokens: bg `#12151C`, panel `#1A1F29`, panel2 `#222836`, line `#2C3342`, ink `#EDE7DA`, muted `#8B93A3`, amber `#F0A63C`, teal `#79C7B4`, coral `#E56B50`.
- Fonts: **Chakra Petch** (display), **IBM Plex Sans Thai** (body), **IBM Plex Mono** (EXIF/data).
- Signature: event cards styled as film contact sheets (sprocket-hole strips, monospace EXIF caption, amber frame numbers `FR 001–010`).
- Category colors and friend palette: Appendix B.

### 10.3 Interaction & accessibility
- Voice mic button (🎙) beside every free-text field (event name/place/note, photo note, person name/nick/note, collection name/note, place name/note, meal note). Use Web Speech API `lang='th-TH'`; pulse animation while recording; hide mic if unsupported; toast on mic-permission denial. (FR-302/402/501/1001/1201/1103)
- Photo modal: prev/next buttons + ArrowLeft/ArrowRight; Esc closes; backdrop click closes.
- Responsive down to 390px width (no horizontal overflow); with 8+ tabs, use a horizontally scrollable tab bar (or a "more" overflow menu) on mobile.
- Visible keyboard focus; respect `prefers-reduced-motion`.
- Lazy-load thumbnails (`loading="lazy"`).
- All user-facing strings in Thai (Appendix A). Empty states are invitations to act, errors are specific and in the app's voice.

### 10.4 Data-layer swap
- Replace IndexedDB CRUD with API calls; keep optimistic UI for tag toggles (revert on error + toast).
- Import: file-picker/drag-drop uploads to server temp then `POST /import`; folder-scan uses `POST /import {folder}`. Poll `GET /jobs/:id` for the progress overlay.
- Thumbnails served from `GET /thumbs/:id` (not object URLs).
- Add a global search box (FR-602) hitting `GET /search`.

## 11. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | **Scale** | 50,000 photos, 5,000 events, 500 persons without degradation |
| NFR-2 | **Import speed** | ≥ 20 photos/s on a modern laptop CPU (EXIF+thumb+hash), excluding ML |
| NFR-3 | **Filter/search latency** | < 200ms for filtered grid and FTS query at 50k rows |
| NFR-4 | **API responsiveness** | workers never block the event loop > 50ms; UI stays interactive during import/embed |
| NFR-5 | **Memory** | idle server < 200MB; during ML phases < 1.5GB (model-dependent) |
| NFR-6 | **Data safety** | originals never modified/moved/deleted by the app; DB uses WAL; writes are transactional |
| NFR-7 | **Portability** | whole app state = `data/story.db` + `data/thumbs/`; metadata also exportable as JSON |
| NFR-8 | **Privacy** | bind 127.0.0.1; no telemetry; no cloud AI calls; models cached locally |
| NFR-9 | **Offline** | Phase 1 works offline after first asset load; Phase 4 fully offline incl. voice |
| NFR-10 | **Setup** | `npm install && npm start` only; document one-time native-build fallback |
| NFR-11 | **Resumability** | import/embed/faces jobs survive restart and resume without duplicating work |
| NFR-12 | **Cross-platform** | macOS, Windows, Linux (Node 22 + prebuilt natives) |
| NFR-13 | **Recap generation** | template monthly recap < 1s at 50k rows; export HTML < 2s; PDF/image < 10s |
| NFR-14 | **Suggestion throughput** | meal/place/collection suggestion pass over 5k new photos < 30s (no AI); never blocks API |
| NFR-15 | **Axis-2 scale** | 1,000 collections, 2,000 places, 10,000 meals without degradation; membership queries indexed |

### Error handling & edge cases
- Missing original on disk → `missing_file=1`, exclude from thumb serving, keep metadata (DR5).
- Corrupt/unsupported image → skip + count, never crash the job.
- No EXIF date → dateless queue (never guess from mtime).
- No GPS → cluster by time only; event centroid null; show "ไม่มี GPS".
- Empty library → friendly empty state with import + demo-data actions.
- Duplicate import → no-op (sha256).
- ML disabled/unavailable → core features unaffected; semantic search falls back to FTS.

## 12. Acceptance Checklist

The implementation is done when all P0/P1 items pass. Tests reference FR IDs. Use a fixture set of JPEGs with known EXIF (the prototype's test approach: 3 same-event Bangkok shots incl. a 1-second burst pair, 1 different-day Chiang Mai shot, 1 dateless image).

### Phase 1 (must pass)
- [ ] **AC-1 (FR-103/201):** Import the 5 fixtures → 4 dated photos form **2 events** (3 Bangkok + 1 Chiang Mai); 1 dateless photo has `event_id NULL`. GPS read correctly.
- [ ] **AC-2 (FR-202):** The two Bangkok shots 1s apart are both `burst=1`.
- [ ] **AC-3 (FR-104/107):** Re-import the same files → 0 added (sha256 dedup). A resized copy of an existing photo is flagged near-dup (pHash) but NOT auto-deleted.
- [ ] **AC-4 (FR-403/206):** Set a date on the dateless photo → it joins/creates the correct event; event count updates.
- [ ] **AC-5 (FR-203):** Name an event, then recluster → name/place/note preserved (`named=1`).
- [ ] **AC-6 (FR-404):** Toggle category + friend on a photo → persists across reload; dashboard tagged-% updates.
- [ ] **AC-7 (FR-502/503):** Tag a friend across 2 events → person detail shows correct photo count, event count, first/last met, and timeline.
- [ ] **AC-8 (FR-601):** Filters (cat/friend/month/GPS/burst) combine correctly; counts match.
- [ ] **AC-9 (FR-602):** Thai FTS search (e.g. a Thai word in an event name or note) returns the right row via trigram.
- [ ] **AC-10 (FR-701…705):** Dashboard totals, 12-month histogram, top friends, review queue, recent events all correct; histogram bar click filters month.
- [ ] **AC-11 (FR-801/802):** Export JSON → clear → re-import originals → restore → tags/persons/event names restored (matched by sha256).
- [ ] **AC-12 (FR-405):** Delete photo removes DB row + thumbnail + cascades; **original file still exists on disk**; recluster runs.
- [ ] **AC-13 (FR-302/402/501):** Voice mic fills a Thai text field (Chrome, mic permitted); graceful fallback when unsupported.
- [ ] **AC-14 (NFR-3/4):** At 50k seeded rows, filter + FTS < 200ms; UI responsive during a running import job.
- [ ] **AC-15 (10.3):** No horizontal overflow at 390px; keyboard nav + Esc work; reduced-motion respected.
- [ ] **AC-16 (NFR-6/8):** Server binds 127.0.0.1 only; no outbound AI calls; originals byte-identical before/after import.

### Phase 2 (semantic)
- [ ] **AC-17 (FR-603):** Embed fixtures; Thai natural-language query returns semantically relevant photos; with ML disabled, search falls back to FTS without error.

### Phase 3 (faces)
- [ ] **AC-18 (FR-506/8.4):** Face job detects faces, clusters them, surfaces a naming suggestion; confirming links person + increments counts; dismissing leaves counts unchanged.

### Phase 4 (offline voice)
- [ ] **AC-19 (9.5):** With network disabled, whisper sidecar transcribes Thai audio into a field; Web Speech remains the default when online.

### Phase 1.5 (stories / meals / places / recap — no AI)
- [ ] **AC-20 (FR-1001/1002/1003):** Create a `place_project` collection, add photos from 2 different events → detail shows a chronological progress timeline spanning both events; photo belongs to its original event AND the collection (axis independence).
- [ ] **AC-21 (FR-1004/DR10):** A photo categorized to match a topic collection appears as a pending suggestion; accepting adds membership (`added_by='rule'`); dismissing hides it and it is not re-suggested.
- [ ] **AC-22 (FR-1101/1102/8.6):** Import 3 food photos + 1 atmosphere photo at the same GPS within 30 min → suggested as ONE meal; naming the restaurant creates a place; a later meal at the same GPS reuses that place (no duplicate).
- [ ] **AC-23 (FR-1103/1104/1105):** Meal type auto-guessed from time (e.g. 12:00 → lunch); meal diary groups by month; restaurant page shows visit count, first/last visit, avg rating; "ร้านที่ไปซ้ำ" lists places with ≥2 meals.
- [ ] **AC-24 (FR-1202/8.7):** A photo within `radius_m` of a named place yields a GPS-link suggestion; confirming sets `gps-confirmed`; with `auto_link_places` on it links automatically and is reversible.
- [ ] **AC-25 (FR-1203/1204):** A `project` place (condo) renders a before→after progress timeline; creating it auto-creates a `place_project` collection.
- [ ] **AC-26 (FR-1301/1302/8.8):** Generate a monthly recap for a month with data → short Thai narrative + correct stats + 4–6 highlight photos + friends/places/top meal; readable in-app; cached in `recaps`.
- [ ] **AC-27 (FR-1304):** Export recap as HTML (always), PDF, and image; browse a past month via picker; regenerate after adding a photo updates the recap (stale → fresh).
- [ ] **AC-28 (FR-1303/DR9):** Highlights exclude redundant burst members and spread across events; deleting a recap loses no source data; recap regenerates identically from the same data.
- [ ] **AC-29 (FR-801/802 extended):** Backup now includes collections/places/meals; restore on a re-imported library rebuilds memberships and named places/meals correctly.
- [ ] **AC-30 (DR6/AD7):** Reclustering events (e.g. threshold change) preserves all collection/meal/place memberships; deleting a collection/place/meal never deletes photos.
- [ ] **AC-31 (NFR-13/14):** At 50k seeded rows, template recap < 1s and a suggestion pass over 5k photos < 30s; API stays responsive during both.

### Phase 5 (future value-add)
- [ ] **AC-32 (FR-1401):** Relationship insights correctly list most-met friends this year, friends unseen ≥6 months, and a 1-year friendship anniversary.
- [ ] **AC-33 (FR-1404):** OCR a slide photo containing "OKR"; searching "OKR" returns that photo linked to its event/date/place.
- [ ] **AC-34 (FR-1405/1406):** On-this-day surfaces prior-year same-day photos; life map plots GPS events/places with frequency heat.
- [ ] **AC-35 (FR-1408/1306):** With a local LLM enabled, a Thai life question returns a grounded answer citing events/notes; recap LLM polish produces Thai prose; with LLM disabled, template recap and FTS search still work (no cloud calls).

## 13. Phased Delivery Plan

Each phase is independently usable. Build Phase 1 completely, then Phase 1.5 (still no AI), before starting Phase 2. Schema and API stubs for all later phases exist from day one (Sections 5/7) so no migration is needed.

### Phase 1 — Foundation (no AI) · P0/P1
Fastify + better-sqlite3 (WAL, FTS5 trigram) + full schema (incl. empty axis-2 tables). Ingest worker (EXIF, sharp thumbs, sha256/pHash dedup). Cluster worker (time/GPS/burst, preserve named events). All CRUD routes + dashboard + search + backup/restore + settings. Port prototype UI to the API. **Exit: AC-1…AC-16 pass.**

### Phase 1.5 — Thematic stories & recap (no AI) · P1
Collections (CRUD + membership + rule suggestions), meal diary (meal grouping 8.6 + restaurant places), places/project threads (GPS matching 8.7 + progress timeline), suggestions inbox, monthly recap (template 8.8 + HTML/PDF/image export). New views: Stories, Meal Diary, Places, Recap, Suggestions. Extend FTS/backup/dashboard. **Exit: AC-20…AC-31 pass.** Still zero AI calls.

### Phase 2 — Semantic search · P2
sqlite-vec extension + `photo_vec`. Embed worker (multilingual CLIP ONNX, cached for offline). Hybrid FTS+vector `/search`. Semantic collection suggestions (8.9). **Exit: AC-17 passes.**

### Phase 3 — People automation · P2
onnxruntime-node + InsightFace. Face worker (detect/embed/greedy-cluster). Suggestion UI + confirm/dismiss. Auto co-occurrence counts from confirmed faces. **Exit: AC-18 passes.**

### Phase 4 — Fully offline · P3
whisper.cpp sidecar + `/transcribe`. Bundle exifr/fonts/models locally; remove all CDN/runtime network needs. **Exit: AC-19 passes; app runs with network disabled.**

### Phase 5 — Value-add on the accumulated DB · P2/P3
Implement in this order (cheap → heavy): (a) no-AI wins — on-this-day, yearly recap/photo-book, relationship insights, shared albums, social graph, life map, open-format export, watch-folder; (b) on-device ML — slide OCR knowledge base, auto best-shot (NIMA); (c) optional local LLM — life Q&A (RAG) + recap polish + auto-caption. Each sub-feature is independent and gated by settings. **Exit: AC-32…AC-35 pass (for the sub-features implemented).** No cloud AI at any point.

### Suggested project structure
```
photo-story/
├── package.json            # pinned deps; scripts: start, dev, ingest, suggest, recap, test
├── server/
│   ├── index.js            # Fastify bootstrap, static public/, 127.0.0.1
│   ├── db.js               # connection, schema, migrations, FTS sync helpers
│   ├── routes/             # photos, events, persons, collections, places, meals,
│   │                       # recaps, suggestions, search, import, backup, settings, thumbs
│   └── workers/            # ingest, cluster, suggest, recap,
│                           # embed(P2), faces(P3), transcribe(P4), ocr/bestshot/llm(P5)
├── public/
│   └── index.html          # ported prototype UI + API adapter + Phase 1.5 views
├── data/                   # story.db, thumbs/, recaps/ (gitignored, auto-created)
└── test/                   # fixtures + acceptance tests (AC-*)
```

### Definition of Done (per phase)
- All phase acceptance checks pass.
- `npm install && npm start` works on a clean machine (document native-build fallback).
- No cloud AI calls; originals untouched; server localhost-only; axis independence preserved (AD7).
- README (Thai) covers setup, usage, backup/restore, troubleshooting, and the new stories/meals/places/recap features.

## 14. Appendices

### Appendix A — Thai UI strings (use verbatim)
| Key | Thai text |
|---|---|
| App title | เรื่องราว 2026 |
| Tabs | ภาพรวม · เหตุการณ์ · รูปทั้งหมด · เพื่อน |
| Import button | + นำเข้ารูป |
| Empty title | เริ่มบันทึกเรื่องราวของคุณ |
| Empty body | นำเข้ารูปจากมือถือหรือโฟลเดอร์ — ระบบจะอ่านวันที่และ GPS จากไฟล์ แล้วจัดกลุ่มเป็นเหตุการณ์ให้อัตโนมัติ ทุกอย่างประมวลผลในเครื่องคุณ ไม่มีการอัปโหลด ไม่ใช้ AI API |
| Demo button | ลองด้วยข้อมูลตัวอย่าง |
| Folder button | เลือกทั้งโฟลเดอร์ |
| Drop hint | วางรูปเพื่อนำเข้า |
| Dashboard heading | เรื่องราวปี 2026 ของคุณ |
| Stats labels | รูปภาพทั้งหมด · เหตุการณ์ (จัดอัตโนมัติ) · เพื่อนที่บันทึก · ติดแท็กแล้ว |
| Histogram heading | จังหวะการถ่ายรายเดือน |
| Top friends heading | เพื่อนที่ถ่ายด้วยบ่อยสุด |
| Queue heading | รอคุณเติมข้อมูล |
| Recent events heading | เหตุการณ์ล่าสุด |
| Event name label | ชื่อเหตุการณ์ |
| Place label | สถานที่ |
| Note label | บันทึก / บันทึกช่วยจำ |
| Unnamed badge | รอตั้งชื่อ |
| Category section | หมวดหมู่ |
| Friends-in-photo section | เพื่อนในรูป |
| Date section | วันที่–เวลา |
| Dateless warning | ไม่มีวันที่ใน EXIF / (ช่วยเติมที) |
| Burst warning | ⚡ รัวช็อต — เก็บใบที่ดีที่สุดใบเดียวพอ |
| Delete photo | ลบรูปนี้ |
| Delete confirm | ลบรูปนี้ออกจากคลัง? (ไฟล์ต้นฉบับในเครื่องคุณไม่หาย) |
| Add friend | + เพิ่มเพื่อนใหม่ |
| Friend stats | รูปที่ถ่ายด้วยกัน · เหตุการณ์ที่เจอ · เจอครั้งแรก · เจอล่าสุด |
| Friend timeline | ไทม์ไลน์ที่เจอกัน |
| No GPS | ไม่มี GPS |
| Voice listening toast | กำลังฟัง… พูดได้เลย |
| Mic permission toast | โปรดอนุญาตใช้ไมโครโฟนในเบราว์เซอร์ |
| Import progress title | กำลังอ่านฟิล์ม… |
| Import privacy hint | อ่านวันที่ + GPS จาก EXIF ในเครื่องของคุณ ไม่มีการอัปโหลด |
| Stories tab | เรื่องราว |
| Meal diary tab | มื้ออาหาร |
| Places tab | สถานที่ |
| Recap tab | สรุปเดือน |
| Suggestions inbox | กล่องข้อเสนอ |
| New collection | + สร้างเรื่องราวใหม่ |
| Collection name label | ชื่อเรื่องราว |
| Collection types | บันทึกมื้ออาหาร · สถานที่/โปรเจกต์ · หัวข้อ · กำหนดเอง |
| Add to story | เพิ่มเข้าเรื่องราว |
| Link place | ผูกสถานที่ |
| Progress timeline | ไทม์ไลน์ความคืบหน้า |
| New meal | + บันทึกมื้อใหม่ |
| Restaurant label | ร้าน |
| Meal type label | มื้อ |
| Meal types | เช้า · กลางวัน · เย็น · คาเฟ่ · อื่นๆ |
| Rating label | คะแนน |
| Dishes note | เมนู / บันทึก |
| Repeat restaurants | ร้านที่ไปซ้ำ |
| Visit count | ไป {n} ครั้ง |
| New place | + ปักหมุดสถานที่ใหม่ |
| Place types | บ้านฉัน · โปรเจกต์ · เยี่ยมชม · ร้าน · อื่นๆ |
| Set GPS from photo | ตั้งพิกัดจากรูปนี้ |
| Houses visited | บ้านที่ไปเยี่ยม |
| Monthly recap heading | สรุปเดือน{เดือน} {พ.ศ.} |
| Recap regenerate | สร้างใหม่ |
| Recap export | ส่งออก HTML / PDF / รูป |
| Recap stats line | {n} รูป · {n} เหตุการณ์ · {n} ร้านใหม่ · เจอเพื่อน {n} คน |
| Suggestion accept | ยอมรับ |
| Suggestion dismiss | ข้าม |
| Meal suggestion | รวม {n} รูปเป็นมื้อที่ร้านนี้? |
| Place suggestion | รูปนี้อยู่ใกล้ "{ชื่อสถานที่}" — ผูกเข้าด้วยกัน? |
| Collection suggestion | เพิ่มรูปนี้เข้าเรื่องราว "{ชื่อ}"? |
| On this day | วันนี้เมื่อปีก่อน |
| Relationship insights | สายสัมพันธ์ |
| Lapsed friends | เพื่อนที่หายไปนาน — ควรนัดเจอ? |
| Anniversary | ครบ {n} ปีที่รู้จัก |
| Life map | แผนที่ชีวิต |
| Ask my life | ถามเรื่องราวของฉัน |
| Slide search | ค้นเนื้อหาสไลด์ |

### Appendix B — Categories & colors
Fixed 7 categories (multi-select per photo):
| Category (Thai) | Color |
|---|---|
| อาหาร | #F0A63C |
| บรรยากาศ | #79C7B4 |
| สไลด์ | #8FB8E8 |
| ตัวฉัน | #E56B50 |
| เพื่อน | #D98BC0 |
| สถาปัตยกรรม | #B8A6E8 |
| อื่นๆ | #8B93A3 |

Friend avatar palette (cycle): `#E56B50, #79C7B4, #F0A63C, #8FB8E8, #D98BC0, #B8A6E8, #A8C97F`.

### Appendix C — Constants & formulas
- **Thai month abbreviations:** `["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]`
- **Date display:** `{D} {Mon} {YYYY+543}` (Buddhist era). Short: `{DD} {Mon}`. Time: `HH:MM` 24h.
- **GPS display:** `{abs(lat).toFixed(4)}{N|S} {abs(lon).toFixed(4)}{E|W}`; null → "ไม่มี GPS".
- **Auto event name:** `ช่วงที่ {1-based index} · {DD Mon}` of `ts_start`.
- **Frame numbers:** `FR {start}–{end}` using 1-based global photo indices (3-digit pad).
- **Default settings:** `gap_hours=4`, `dist_km=2`, `burst_ms=2000`, `phash_hamming=6`, `face_cosine=0.45`, `place_radius_m=120`, `meal_gap_min=90`, `auto_link_places=false`, `semantic_coll_cosine=0.30`, `lapsed_months=6`.
- **Thumbnail:** longest side 560px, JPEG q≈0.72.
- **Target year:** 2026 (configurable; histogram uses this year).
- **ID format:** `Date.now().toString(36) + Math.random().toString(36).slice(2,8)`.
- **Collection types:** `meal_diary | place_project | topic | custom`.
- **Place types:** `home | project | visit | restaurant | other`.
- **Meal types:** `breakfast | lunch | dinner | cafe | other`; time-of-day guess: 05–10 breakfast, 11–14 lunch, 17–21 dinner, else cafe/other.
- **Suggestion kinds:** `collection | meal | place | face`; statuses `pending | accepted | dismissed`.
- **Membership sources:** collection `manual | rule | semantic`; place `manual | gps-suggestion | gps-confirmed`; person `manual | face-suggestion | face-confirmed`.
- **Recap:** monthly `month=1..12`, yearly `month=NULL`; highlight count 4–6; formats `template | llm`; exports `html | pdf | image`.

### Appendix D — Glossary
- **Event (axis 1):** an auto-clustered chapter of photos (time/place proximity). A photo has ≤1 event.
- **Collection / Story (axis 2):** a thematic grouping that spans events (meal diary, place/project thread, topic album). A photo may have many.
- **Place:** a named GPS anchor (my condo, a friend's house, a restaurant) reused across visits; photos near it auto-link.
- **Meal:** food + drink + atmosphere photos of one restaurant visit; sub-unit of a meal diary, tied to a restaurant place.
- **Project thread:** a `place_project` collection over a `project` place (e.g. condo decoration) rendered as a before→after progress timeline.
- **Recap:** a derived, cached short Thai story (monthly/yearly) built from both axes; template-based, optional local-LLM polish.
- **Suggestion:** a non-destructive proposal (meal/place/collection/face) the owner accepts or dismisses; never auto-applied destructively.
- **Burst:** consecutive shots ≤2s apart; owner keeps the best one.
- **Keeper:** the best photo chosen from a burst/near-dup group; used for recap highlights.
- **Gap queue / review queue:** the "รอคุณเติมข้อมูล" list of items needing owner input.
- **Scan-in-place:** referencing originals by path without copying them.
- **Suggestion layer:** ML/rule output that the owner confirms; core features work without it.
- **Axis independence (AD7):** events and collections are separate; changing one never destroys the other.

### Appendix E — Reference prototype
`reference/prototype.html` is a working browser-only implementation (IndexedDB) of the Phase-1 UX. Use it as the visual/interaction source of truth and for Thai copy. It already demonstrates: EXIF import, time/GPS clustering, burst flagging, dedup, category/friend tagging, person stats + timeline, filters, dashboard, backup, voice fields, and demo data. The Node build replaces its data layer with the API in Section 7 and adds server-side durability, pHash dedup, FTS5, the axis-2 stories layer (Phase 1.5), and (later) ML. The prototype does NOT yet contain stories/meals/places/recap UI — build those per Sections 6.10–6.13 and 10.1, matching the prototype's visual language.

### Appendix F — Monthly recap template (Thai, fill the braces)
Keep it short (readable in <30s). Baseline is pure string templating; no AI. Example skeleton:

```
 headline:  "สรุปเดือน{เดือนเต็ม} {พ.ศ.}"
 stats:     "{photo_count} รูป · {event_count} เหตุการณ์ · {new_restaurants} ร้านใหม่ · เจอเพื่อน {friend_count} คน"
 narrative: "เดือนนี้คุณ{event_clause}{trip_clause}{project_clause}{food_clause}"
            // event_clause:  "ไปงาน {top_event_name}"
            // trip_clause:   "ทริป {place} กับ {friends}" (if a multi-person event exists)
            // project_clause:"{project_name} คืบหน้าไป {n} จุด" (if a project collection had new photos)
            // food_clause:   "ลองร้านใหม่ {n} ร้าน" (if new restaurants > 0)
 highlights: [4–6 keeper photo ids, spread across events/collections]
 friends:   "👥 เจอ: {name}({count}) …" (top 3–5)
 places:    "📍 ไป: {place names}"
 top_meal:  "🍜 มื้อเด่น: {restaurant} — {note/rating}" (if any)
```
- Omit any clause whose data is absent (never print empty braces).
- Buddhist era year = Gregorian + 543. Full Thai month names for the headline; abbreviations elsewhere (Appendix C).
- Yearly recap aggregates the 12 monthly narratives + year totals + top events/collections/friends/places into a longer story / photo-book outline.
- LLM polish (Phase 5) rewrites only `narrative` from the same facts; all other fields stay structured.

---
*End of PRD v2.0.*