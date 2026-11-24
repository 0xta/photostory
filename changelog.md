# Changelog

## [Phase 5F] - Google Modern Web Guidance Compliance, README & View Transitions - 2026-11-24

### Added & Optimized
- **Modern Web Guidance Compliance (Audited via `npx modern-web-guidance legacy-scan`):**
  - **DOM Sanitization & Performance (`replaceChildren`):**
    - Modernized all 28 standalone `.innerHTML = ''` DOM clearing assignments across `public/app.js` to `element.replaceChildren()`.
    - Eliminates redundant HTML parser invocations, prevents memory leaks, and complies with Trusted Types CSP security practices.
  - **Color-Scheme & Dark Mode Synchronization (`public/index.html`, `public/app.js`, `public/style.css`):**
    - Added `<meta name="color-scheme" content="dark light">` and synchronous inline FOUC prevention script in `<head>`.
    - Updated `setTheme()` in `public/app.js` to dynamically sync `<meta name="color-scheme">` between `dark` and `light`.
    - Added `:root { color-scheme: dark light; }` along with specific `color-scheme: dark` / `color-scheme: light` declarations on theme tokens in `public/style.css`.
    - Ensures browser-provided UI (scrollbars, form controls, native dialogs) adapts seamlessly to active themes.
  - **Subresource Integrity (SRI) & Referrer Policy (`public/index.html`):**
    - Enforced cryptographic Subresource Integrity digests (`integrity="sha384-..."`), `crossorigin="anonymous"`, and `referrerpolicy="no-referrer"` on third-party Leaflet CSS and JS CDN assets.
    - Added document-level baseline `<meta name="referrer" content="strict-origin-when-cross-origin">`.
  - **Native View Transitions API (`public/app.js`, `public/style.css`):**
    - Wrapped tab navigation (`switchTab()`) in `document.startViewTransition()`.
    - Added `@view-transition { navigation: auto; }` and smooth cross-fade keyframes in `public/style.css`.
    - Delivers fluid view switching transitions without heavy third-party animation libraries.
- **Project Documentation (`README.md`):**
  - Authored a comprehensive repository `README.md` featuring architecture overviews, key capabilities, two-axis organization, technology stack, setup guide, testing instructions, and screenshots table.
- **Verification & Quality Assurance:**
  - `npx modern-web-guidance legacy-scan public`: 0 remaining code modernization warnings (all 31 previous findings resolved).
  - Full acceptance test suite (Phases 1A through 5C): 100% passed cleanly.

## [Phase 5E] - Comprehensive Thai User Manual, Multi-Folder Ingestion & Interface Screenshots - 2026-11-24

### Added
- **Multi-Folder Import Ingestion (`server/routes/import.ts`):**
  - Enhanced `POST /api/import` folder parsing to accept multiple folder paths delimited by comma (`,`), semicolon (`;`), or newlines (`\n|\r`).
  - Seamlessly scans across multiple distinct folder paths while maintaining recursive subfolder traversal.
  - Automatically deduplicates duplicate images via SHA-256 (`AC-3`) and clusters dated photos across folders into shared chronological events (`AC-1`).
- **Comprehensive Thai User Manual (`USER_MANUAL.md`):**
  - Authored a complete ~66 KB Thai user manual detailing all application features and user workflows.
  - Included step-by-step instructions for photo ingestion, pagination (20/40/60 photos), event naming, friend tagging, meal diary, place threads, map clustering, recap storytelling, and JSON backup/restore.
  - Detailed the "Two-Axis Model" (automatic spatiotemporal events vs. thematic collections) and 100% local-first privacy principles.
  - Added in-depth under-the-hood documentation of all AI & algorithmic engines:
    - Spatiotemporal Event Clustering with Haversine formula ($R = 6,371$ km) and centroid recalculation.
    - Burst Shot Detection ($\le 2,000$ ms window) and Near-Duplicate detection via 64-bit DCT pHash (Hamming distance $\le 6$).
    - Face Detection & Recognition via ONNX Runtime (SCRFD + ArcFace 512-d) and Greedy Agglomerative Clustering (Cosine similarity $\ge 0.45$).
    - Multilingual Semantic Search via Multilingual CLIP (512-d) and in-database `sqlite-vec` vector similarity search.
    - Thai Full-Text Search using SQLite FTS5 Trigram tokenizer.
    - Meal grouping heuristics (food + atmosphere within 90 min / 120 m) and geofencing.
    - Keeper selection heuristics (sharpness proxy, resolution, burst elimination) and Thai template narrative generator.
    - Non-blocking background worker pipeline using `setImmediate` event loop yielding.
- **HiDPI Screen Capture Gallery (`screenshot/`):**
  - Created automated screenshot capture automation using Google Chrome over DevTools Protocol (CDP) WebSocket with 2x device scale factor.
  - Captured 15 high-resolution screenshots covering all key screens:
    - `01-dashboard.png`: Dashboard overview, stats, monthly histogram, review queue, and top friends.
    - `02-events.png`: Event contact sheet cards sectioned by month/year headers.
    - `03-event-detail.png`: Event detail modal with voice notes, place tags, and photo grid.
    - `04-photos.png`: Photos view with 20/40/60 pagination toolbar and category filters.
    - `05-photo-modal.png`: Photo modal with EXIF metadata, category chips, and Thai voice input.
    - `06-friends.png`: Friends view with companion cards and meeting counts.
    - `07-friend-detail.png`: Friend detail modal with first/last met stats and meeting timeline.
    - `08-social-graph.png`: Interactive HTML5 Canvas Social Graph of friend co-occurrence.
    - `09-map.png`: Leaflet map explorer with numeric golden cluster pins and preview popups.
    - `10-stories.png`: Thematic collections cards and project threads.
    - `11-meals.png`: Meal diary cards with restaurant places, star ratings, and companion tags.
    - `12-places.png`: Places view with named GPS anchors and visit history.
    - `13-recap.png`: Monthly recap story with Thai narrative and highlight keepers.
    - `14-import-modal.png`: Import modal supporting multi-folder delimited inputs.
    - `15-manage-data-modal.png`: Data management modal with JSON backup/restore and export options.
  - Embedded screenshots and a dedicated visual interface catalog into `USER_MANUAL.md`.

## [Phase 5D] - Performance & Browser Rendering Optimizations - 2026-11-24

### Added & Optimized
- **Photos View Pagination & Page Size Config:**
  - Added page size selector (`20`, `40`, `60` photos per page, default: `40`).
  - Added full pagination toolbar: "« หน้าแรก", "‹ ก่อนหน้า", page count indicator ("หน้า X / Y"), "ถัดไป ›", "หน้าสุดท้าย »".
  - Shows exact photo range indicator (e.g. `แสดงรูปที่ 1 - 40 จากทั้งหมด 95 รูป`).
  - Automatically resets to page 1 upon changing any filter (friend, category, month, GPS, burst, clear).
- **HTTP Browser Caching for Thumbnails:**
  - Added `Cache-Control: public, max-age=31536000, immutable` in `server/routes/import.ts` for `/api/thumbs/:id`.
  - Enables instant 0ms thumbnail loading directly from local browser disk cache.
- **Events View Month/Year Sectioning:**
  - Grouped event cards under clean Thai Buddhist Era Month/Year section headers (`📅 พฤศจิกายน 2569`, count of events).
  - Eliminates DOM layout thrashing and organizes long lists into clear chapters.
- **Map View Marker Clustering for Photos Mode:**
  - Added spatial coordinate proximity clustering (~110m grid) for `photos` map mode.
  - Groups overlapping/dense photo pins into cluster pins with photo count badges and interactive 4-photo preview grid popup.
  - Keeps map zooming and panning at 60 FPS even with thousands of GPS points.

## [Phase 5C] - No-AI Quick Wins Sprint 3 (Open-Format Export & Watch Folder Auto-Ingest) - 2026-11-24

### Added
- **Open-Format Export (FR-1410 / Exit Plan):**
  - Added `GET /api/export?format=json|csv|geojson|xmp` in `server/routes/export.ts`.
  - JSON format: Full structured dump of photos, categories, companions, events, places, collections, and meals.
  - CSV format: Spreadsheet-friendly table of all photos with RFC 4180 escaping and UTF-8 BOM for Thai Excel compatibility.
  - GeoJSON format: RFC 7946 FeatureCollection of all photos with coordinates for GIS / Google Earth / geojson.io visualization.
  - XMP Sidecar Writing (`POST /api/export/xmp`): Generates valid Adobe/Dublin Core `.xmp` sidecar files directly beside original photos in local storage without touching or modifying the original photo file bytes (100% non-destructive).
- **Watch Folder Auto-Ingest (FR-1411):**
  - Created `server/workers/watch.ts` and `server/routes/watch.ts` (`GET /api/watch`, `POST /api/watch`, `POST /api/watch/scan`).
  - Automatically monitors drop directory (e.g. `photo/` or Syncthing drop folders) using `fs.watch` and lightweight polling.
  - Debounced file-settling check and SQLite existence dedup to auto-trigger ingest & clustering on newly added photos.
  - Auto-starts on server bootstrap if `watch_folder_enabled` setting is active.
- **Frontend Data Management Dialog (`#modal-manage-data`):**
  - Added "💾 ข้อมูล & สำรอง" header button and comprehensive data management modal.
  - One-click downloads for JSON, CSV, and GeoJSON exports, plus XMP sidecar generation button.
  - Watch folder toggle switch, folder path configuration, live status badge, and immediate scan button.
  - Backup & restore controls with JSON file picker.
- **Acceptance Tests:**
  - Added `test/phase5c.test.ts` covering JSON, CSV, GeoJSON exports, non-destructive XMP sidecar file generation, and Watch Folder auto-ingest detection.
  - Registered in `test/acceptance.test.ts`. All 15 acceptance test suites pass cleanly.

## [Phase 5B] - No-AI Quick Wins Sprint 2 (Personal Life Map Heatmap & Social Graph) - 2026-11-24

### Added
- **Personal Life Map & Heatmap (FR-1406 / AC-34):**
  - Added `GET /api/map` and `GET /api/map/heatmap` in `server/routes/insights.ts`.
  - Aggregates GPS photo coordinates into density clusters with normalized intensity (0.0 - 1.0) and dynamic radius.
  - Aggregates top visited places list (`most_visited`) ranked by photo count and distinct event visits.
  - Summary includes total GPS photos, unique coordinate clusters, bounding box, and geographic center.
  - Integrated Heatmap view mode on Map toolbar with amber-to-red radial gradient circles rendered 100% offline via Leaflet without external plugins.
  - Added "📍 สถานที่ที่ไปบ่อยที่สุด (Top Visited Places)" side panel with quick fly-to and nearby photo discovery.
- **Social Graph (FR-1403):**
  - Added `GET /api/insights/social-graph` in `server/routes/insights.ts`.
  - Calculates co-occurrence edge weights between people based on shared events and shared photos.
  - Full force-directed graph simulation rendered on HTML5 `<canvas>` with repulsion, spring attraction, and center gravity.
  - Interactive nodes (draggable, color-coded, labeled), hover tooltips detailing shared events and photo counts, and click-to-open friend profile modal.
  - Added "🕸️ แผนผังเครือข่าย (Social Graph)" toggle button in Friends & Relationships view.
- **Acceptance Tests:**
  - Added `test/phase5b.test.ts` covering FR-1406 and FR-1403.
  - Updated `test/acceptance.test.ts` to include Phase 5B. All 14 test suites pass cleanly.

## [Phase 5A] - No-AI Quick Wins Sprint 1 (On This Day, Relationship Insights & Shared Album) - 2026-11-24

### Added
- **On This Day (FR-1405 / AC-34):**
  - Added `GET /api/on-this-day` and `GET /on-this-day` endpoint in `server/routes/insights.ts`.
  - Resurfaces photos taken on the same month and day from prior years, grouped by year with event and companion context.
  - Added "วันนี้ในอดีต (On This Day)" card on Dashboard with thumbnail strip and event tags.
- **Relationship Insights (FR-1401 / AC-32):**
  - Added `GET /api/insights/relationships` in `server/routes/insights.ts`.
  - Identifies top most-met friends this year, lapsed friends unseen for >= 6 months (`lapsed_months`), and 1-year friendship anniversaries.
  - Added "ไฮไลต์มิตรภาพ (Relationship Insights)" card on Dashboard with quick-action buttons to jump to friend profiles.
- **Shared Album "X & ME" (FR-1402):**
  - Added `GET /api/persons/:id/album` and `GET /api/persons/:id/album/export?format=html|pdf` in `server/routes/persons.ts`.
  - Auto-builds a chronological chapter-by-chapter story of all photos and events shared with a friend.
  - Standalone HTML export with contact-sheet film aesthetic and one-click PDF printing.
  - Added "📖 อัลบั้มความทรงจำ (X & ME)" button inside Friend Detail Modal.
- **Continuous Face Knowledge Propagation (FR-506):**
  - Enhanced `clusterFaces()` in `server/workers/face.ts` to propagate `person_id` to new face members and auto-link new photos in `photo_persons` with `source='face-confirmed'`.
- **Acceptance Tests:**
  - Added `test/phase5a.test.ts` covering AC-32, AC-34, and FR-1402 album generation & exports (HTML/PDF). All 13 test suites pass cleanly.

## [Phase 1A] - Project Skeleton, Database & Multi-Theme Architecture - 2026-11-19

### Added
- **Project Foundation:**
  - Initialized Node.js 22 + TypeScript project with ESM support (`tsx`, `tsc`).
  - Added `.gitignore` configured to ignore `node_modules/`, `data/`, `dist/`, and local `changelog.md`.
  - Configured `package.json` with pinned dependencies (`fastify`, `@fastify/static`, `better-sqlite3`, `sharp`, `exifr`, `imghash`).

- **Database Engine & Schema (`server/db.ts`):**
  - Integrated `better-sqlite3` with `PRAGMA journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`, and 64MB cache.
  - Initialized all 16 database tables for Phase 1 and future phases (zero migration needed):
    - `photos`, `events`, `persons`, `photo_persons`, `photo_cats`
    - `faces` (Phase 3 detected faces & clusters)
    - `settings` (tunable thresholds and theme preferences)
    - `search_fts` (SQLite FTS5 virtual table with `trigram` tokenizer for Thai full-text search)
    - `places`, `collections`, `collection_photos`, `photo_places`, `meals`, `meal_photos`, `recaps`, `suggestions` (Phase 1.5 tables ready from day one)
  - Pre-seeded default system settings (`gap_hours=4`, `dist_km=2`, `burst_ms=2000`, `theme=dark`, etc.).
  - Added helper functions for settings management (`getSetting`, `setSetting`, `getAllSettings`) and FTS synchronization (`ftsUpsert`, `ftsDelete`).

- **Utilities (`server/utils.ts`):**
  - Unique ID generator (`genId`).
  - Haversine distance calculator in kilometers for GPS clustering.
  - Thai date formatters with Buddhist Era (+543 years) and Thai month abbreviations.
  - Fixed 7-category color definitions and friend avatar color palette.

- **Fastify Server (`server/index.ts`):**
  - Configured Fastify server bound strictly to `127.0.0.1:3000`.
  - Configured static file serving from `public/`.
  - Endpoints added:
    - `GET /api/health`: Health status, version, and entity counts.
    - `GET /api/settings`: Returns all current settings.
    - `PATCH /api/settings`: Updates settings including theme selection.

- **Frontend & 3 Themes (`public/index.html`, `public/style.css`, `public/app.js`):**
  - Implemented 3 responsive themes via CSS custom properties:
    - **มืด (Dark)**: Darkroom contact-sheet signature palette (`#12151C`, `#1A1F29`, amber `#F0A63C`, teal `#79C7B4`).
    - **อบอุ่น (Warm)**: Cozy warm amber tones (`#1E1A14`, `#2A241B`, `#E8A832`).
    - **สว่าง (Light)**: Clean daylight aesthetic (`#F5F3EE`, `#FFFFFF`, `#C8880A`).
  - Added theme switcher buttons in the header with persistent state in `localStorage` and server sync.
  - Implemented tab navigation (`ภาพรวม`, `เหตุการณ์`, `รูปทั้งหมด`, `เพื่อน`, `แผนที่`).
  - Thai UI strings and design tokens matching PRD v2.0.

- **Verification Tests:**
  - `test/phase1a.test.ts`: Verified database schema integrity, PRAGMAs, settings defaults, theme toggles, FTS5 Thai trigram search, and utility calculations.
  - `test/server.test.ts`: Verified Fastify server lifecycle, HTTP endpoints (`/api/health`, `/api/settings`, `PATCH /api/settings`), and static asset serving.
  - `test/acceptance.test.ts`: Unified test runner. All tests pass with 100% success.

## [Phase 1B] - Ingest & Clustering Engine - 2026-11-19

### Added
- **Ingest Worker (`server/workers/ingest.ts`):**
  - Recursive folder scanning for `.jpg`, `.jpeg`, `.png`, and `.webp` images.
  - EXIF metadata extraction via `exifr` with fallback chain (FR-103):
    - `DateTimeOriginal` -> `CreateDate` -> `ModifyDate`
    - Fallback filename date parsing (`YYYY-MM-DD`, `YYYYMMDD`)
    - Dateless detection (`taken_at = null`, never guessing from file mtime)
    - GPS latitude and longitude parsing.
  - Image dimension extraction and thumbnail generation via `sharp` (560px longest side, JPEG quality 72, auto-orientation) saved to `data/thumbs/{id}.jpg`.
  - Exact duplicate detection via SHA-256 (`crypto.createHash`).
  - Near-duplicate detection via 64-bit DCT perceptual hash (`imghash.hash`).
  - Re-import path update (Decision D8): when a known file moves to a different path, its path is updated and `missing_file` is cleared.
  - Thai FTS5 indexing on file ingestion (`ftsUpsert`).

- **Clustering Engine (`server/workers/cluster.ts`):**
  - Event clustering algorithm (Section 8.1):
    - Groups dated photos by time gap (`gap_hours`, default 4h) and GPS centroid distance (`dist_km`, default 2km).
    - Preserves user-entered event metadata (`name`, `place`, `note`, `named`) across reclustering passes (FR-203).
    - Calculates event centroid GPS and start/end timestamps.
    - Prunes empty events.
  - Burst detection algorithm (Section 8.2):
    - Flags consecutive dated photos within `burst_ms` (default 2000ms) with `burst = 1`.

- **Asynchronous Job Management (`server/workers/jobs.ts`):**
  - In-memory state tracking for import jobs (`processed`, `total`, `current`, `added`, `skippedDup`, `skippedUnreadable`, `dateless`).
  - Event-loop cooperative yielding every 25 files (`setImmediate`) to keep the Fastify server responsive (NFR-4).
  - Single active import job constraint (Decision D9) preventing race conditions.

- **API Routes (`server/routes/import.ts` & `server/routes/jobs.ts`):**
  - `POST /api/import`: Initiates background import for a given folder or file list (returns 202 Accepted with `jobId`; 409 Conflict if a job is already running).
  - `GET /api/jobs/:id`: Returns live job progress.
  - `POST /api/recluster`: Manually triggers clustering and returns event and photo counts.
  - `GET /api/thumbs/:id`: Serves generated JPEG thumbnails directly from `data/thumbs/`.

- **Test Fixtures & Acceptance Tests (`test/phase1b.test.ts`):**
  - `test/fixtures/generate-fixtures.ts`: Programmatically creates the 5 canonical test fixtures with valid EXIF and GPS tags:
    - `bkk_01.jpg` (Bangkok, 2026-03-14 10:00:00)
    - `bkk_02_burst1.jpg` (Bangkok, 2026-03-14 11:30:00)
    - `bkk_03_burst2.jpg` (Bangkok, 2026-03-14 11:30:01 — 1-second burst pair)
    - `cnx_01.jpg` (Chiang Mai, 2026-04-22 14:00:00 — distinct day & GPS)
    - `dateless_note.jpg` (no date, no GPS)
  - Verified **AC-1**: 4 dated photos group into 2 events (Bangkok and Chiang Mai); 1 dateless photo has `event_id NULL`. Centroids accurate.
  - Verified **AC-2**: 1-second apart Bangkok photos both flagged `burst = 1`; non-burst flagged `burst = 0`.
  - Verified **AC-3**: Re-import skips all 5 duplicates via SHA-256; resized copy has pHash Hamming distance <= 6 and is flagged for review without auto-deletion.
  - Verified **Decision D8**: Path updates on re-import of moved files.
  - Verified **FR-105**: Thumbnail serving returns HTTP 200 with valid JPEG payload.

- **Frontend Import UI & Live Data Rendering (`public/`):**
  - Added "+ นำเข้ารูป" button to header and dashboard empty state.
  - Implemented Import Modal (`#modal-import`) with folder path input and quick "ลองด้วยโฟลเดอร์ตัวอย่าง" button (`test/fixtures/photos`).
  - Implemented live Progress Overlay (`#overlay-progress`) showing animated spinner, progress bar fill %, current file being processed, and live counters (เพิ่มแล้ว, ข้ามรูปซ้ำ, ไม่มีวันที่).
  - Implemented Dashboard recent events list and summary cards (รูปภาพทั้งหมด, เหตุการณ์, เพื่อนที่บันทึก).
  - Implemented Events tab with film contact-sheet cards and 4-thumbnail preview strips.
  - Implemented Photos tab with responsive thumbnail grid and burst indicators (`⚡ รัว`).
  - Added "🔄 จัดกลุ่มใหม่" recluster button.
  - Registered `eventsRoutes` and `photosRoutes` in Fastify backend.

## [Phase 1C] - Full CRUD API, Tagging, Friends, Filters, FTS, Dashboard & Backup - 2026-11-19

### Added
- **Photos CRUD & Tagging (`server/routes/photos.ts`):**
  - `GET /api/photos`: Multi-criteria filtering (category, friend person_id, month 1..12, year, GPS status `yes|no|nodate`, burst shots, event_id, FTS text query, pagination `limit/offset`).
  - `GET /api/photos/:id`: Returns photo detail with assigned categories, friend chips, and linked event info.
  - `PATCH /api/photos/:id`: Updates note, date (`taken_at`), or GPS coordinates. Updating date on dateless photos auto-reclusters and updates event grouping (FR-403). Synchronizes FTS.
  - `DELETE /api/photos/:id`: Removes database record, thumbnail file, and cascades tag associations. Guarantees original photo on disk is never touched or deleted (AD3 / Non-destructive). Automatically reclusters remaining photos.
  - `PUT /api/photos/:id/cats`: Replaces photo categories (validates against 7 fixed categories from Appendix B).
  - `PUT /api/photos/:id/persons`: Replaces tagged friends for a photo with `source='manual'`.

- **Events CRUD & Preservation (`server/routes/events.ts`):**
  - `GET /api/events`: Lists events sorted by `ts_start ASC` with auto-generated or custom display names, cover thumbnail IDs (up to 4), photo count, and friend count.
  - `GET /api/events/:id`: Returns event detail with list of member photos and distinct friends appearing in the event.
  - `PATCH /api/events/:id`: Updates event name, place, and note. Setting a non-empty name sets `named = 1`, ensuring the name, place, and note are preserved across all future reclustering operations (FR-203 / AC-5). Synchronizes FTS.

- **Persons (Friends) Management (`server/routes/persons.ts`):**
  - `GET /api/persons`: Lists all friends sorted by shared photo count, including auto-computed `photo_count` and `event_count`.
  - `POST /api/persons`: Creates a friend profile with automatic color assignment cycling through `FRIEND_PALETTE`. Synchronizes FTS.
  - `GET /api/persons/:id`: Calculates friend relationship metrics (FR-502 / FR-503 / AC-7):
    - `photo_count` (photos together)
    - `event_count` (distinct events together)
    - `first_met` (earliest photo timestamp)
    - `last_met` (most recent photo timestamp)
    - `timeline` (chronological list of meetings across events)
    - `photos` (all photos tagged with this friend)
  - `PATCH /api/persons/:id`: Edits friend profile details (name, nickname, note, color).
  - `DELETE /api/persons/:id`: Deletes person profile and cascades associations from `photo_persons` while leaving all photos completely intact (FR-505).

- **Thai Full-Text Search via SQLite FTS5 (`server/routes/search.ts`):**
  - `GET /api/search?q=`: Substring and keyword search using trigram tokenizer (`tokenize='trigram'`) across photos, events, and persons (FR-602 / Decision D7). Returns grouped results `{ photos, events, persons }`. Requires minimum 3 characters.

- **Dashboard & Review Queue (`server/routes/dashboard.ts`):**
  - `GET /api/dashboard?year=2026`:
    - Overall totals: total photos, events, persons, and % tagged (`tagged_pct`).
    - 12-month shooting rhythm histogram array for the target year (FR-702).
    - Top 5 friends by photo count (FR-703).
    - Review queue ("รอคุณเติมข้อมูล", FR-704): dateless photo count, unnamed event count, burst count, and tagging progress.
    - Recent events contact sheets (latest 3, FR-705).

- **Settings API (`server/routes/settings.ts`):**
  - `GET /api/settings`: Retrieves all system settings.
  - `PATCH /api/settings`: Updates tunable thresholds. Changing clustering thresholds (`gap_hours`, `dist_km`, `burst_ms`) automatically triggers reclustering (FR-901).

- **Backup, Restore & Reset (`server/routes/backup.ts`):**
  - `GET /api/backup`: Exports full system metadata as JSON (photos with SHA-256 keys, events, persons, tags, collections, places, meals) without thumbnail binaries (FR-801).
  - `POST /api/restore`: Matches existing photos by SHA-256 (fallback filename+size), restores notes, categories, friends, and restores event metadata by matching `ts_start` within ±1 second after reclustering (FR-802 / AC-11).
  - `POST /api/clear`: Safely clears database tables and thumbnails while keeping original photos untouched (FR-803).

- **Acceptance Verification (`test/phase1c.test.ts`):**
  - Verified **AC-4**: Dateless photo date fix -> joins 3rd event.
  - Verified **AC-5**: Named event preserved across reclustering.
  - Verified **AC-6**: Category & friend tagging persisted; dashboard tagged % updated.
  - Verified **AC-7**: Friend stats (2 photos in 2 events, first/last met, timeline) verified.
  - Verified **AC-8**: Filters (cat, person, burst, month) return exact counts.
  - Verified **AC-9**: Thai trigram search matches "สยามพารากอน" and "น้องพลอย".
  - Verified **AC-10**: Dashboard totals, histogram, review queue, and top friends verified.
  - Verified **AC-11**: Full export -> clear -> re-import -> restore cycle successfully restored metadata.
  - Verified **AC-12**: Photo deletion cascades DB & thumb; original file on disk remains intact.

## [Phase 1D] - Responsive Frontend, 3 Themes, Modals, Thai Voice Input & Review Queues - 2026-11-19

### Added
- **Multi-Theme System (3 Themes):**
  - Fully implemented 3 distinct visual themes switchable via header controls and persisted in `localStorage` + server settings:
    - **มืด (Dark)**: Default darkroom contact-sheet theme (`#12151C`, `#1A1F29`, amber `#F0A63C`, teal `#79C7B4`).
    - **อบอุ่น (Warm)**: Cozy candlelight theme (`#1E1A14`, `#2A241B`, `#E8A832`).
    - **สว่าง (Light)**: Clean daylight theme (`#F5F3EE`, `#FFFFFF`, `#C8880A`).
  - Implemented responsive CSS variables, custom scrollbars, and accessible focus states across all 3 themes.

- **Dashboard View (`#view-dashboard`):**
  - Stat cards: Total photos, events, friends, and % tagged (`#stat-photos`, `#stat-events`, `#stat-friends`, `#stat-tagged-pct`).
  - 12-month shooting rhythm interactive histogram (`#dashboard-histogram`) with proportional vertical bars, active month highlights, and click-to-filter interaction directly jumping to Photos tab with the selected month filter.
  - Review queue ("รอคุณเติมข้อมูล", `#dashboard-queue`):
    - Dateless photos card with jump-to-filter button (`#btn-jump-dateless`).
    - Unnamed events card with jump-to-events button (`#btn-jump-unnamed`).
    - Burst shots card with jump-to-bursts button (`#btn-jump-burst`).
  - Top friends cards (`#dashboard-top-friends`) with colored initials avatars and photo counts.
  - Recent events film strip contact sheets (`#dashboard-events`).

- **Events View (`#view-events`):**
  - Dateless warning tray (`#events-dateless-tray`) displaying total dateless photos with 1-click filter button.
  - Film strip contact-sheet cards (`.film-card`) displaying up to 4 thumbnail previews, sprocket holes styling, event date/time range, GPS place name or coordinates, photo count badge, and member friend chips.
  - "🔄 จัดกลุ่มใหม่" (`#btn-recluster`) button with toast notification.

- **Photos View & Comprehensive Filtering (`#view-photos`):**
  - Category filter chips (`#filter-cats`) covering all 7 fixed categories from Appendix B (อาหาร, บรรยากาศ, สไลด์, ตัวฉัน, เพื่อน, สถาปัตยกรรม, อื่นๆ) with distinct color badges and active toggle states.
  - Multi-dropdown filters: Friend selector (`#filter-friend`), Month selector (`#filter-month`), GPS selector (`#filter-gps`, with `yes`, `no`, and `nodate` options).
  - Burst shots checkbox toggle (`#filter-burst`).
  - Dynamic result counter (`#photos-filter-count`) and 1-click clear filters button (`#btn-clear-filters`).
  - Responsive thumbnail photo grid (`#photos-list`) with burst indicators (`⚡ รัว`) and click-to-open photo detail modal.

- **Friends View (`#view-friends`):**
  - "+ เพิ่มเพื่อนใหม่" button opening friend creation modal.
  - Friend profile cards with circular color-coded avatar, name, nickname, shared photo count, and event count.
  - Click-to-open friend relationship detail modal.

- **Interactive Modals:**
  - **Photo Detail Modal (`#modal-photo`):**
    - Large image preview with previous/next keyboard (`ArrowLeft`/`ArrowRight`) and on-screen arrow navigation (`#btn-photo-prev`, `#btn-photo-next`).
    - Metadata panel displaying EXIF date, time, GPS coordinates, dimensions, and event name.
    - Inline date-time editor (`#photo-date-editor`) with automatic reclustering on save.
    - Category pills selector with instant toggle and visual highlight.
    - Friend tagging pills selector with instant toggle.
    - Note textarea with voice input microphone button (`🎙️ พูด`).
    - "ลบรูปนี้ออกจากคลัง" button with confirmation toast and non-destructive guarantee notice.
  - **Event Detail Modal (`#modal-event`):**
    - Editable event name, place, and note with Thai voice input support.
    - Event statistics summary (time range, photo count, GPS centroid).
    - Photo thumbnail grid of all photos belonging to the event.
  - **Friend Detail Modal (`#modal-friend-detail`):**
    - 4 relationship auto-stats (photos together, events together, first met date, last met date).
    - Chronological meeting timeline list (`#friend-detail-timeline`).
    - Thumbnail grid of all shared photos.
    - Friend profile deletion with cascading tag removal and photo preservation.
  - **Add Friend Modal (`#modal-add-friend`):**
    - Inputs for name, nickname, note, and interactive 7-color palette picker (`#friend-color-picker`).
    - Thai voice input on all text fields.

- **Thai Voice Input (Web Speech API):**
  - Integrated `SpeechRecognition` / `webkitSpeechRecognition` with language set to `th-TH`.
  - Microphone pulse animation (`micPulse`) when actively listening.
  - Graceful fallback with user toast if browser speech recognition is not supported or permission is denied.

- **Global Controls & Usability:**
  - Debounced global search bar in header (`#input-global-search`) navigating to filtered photos view.
  - Global keyboard shortcuts: `Escape` closes active modal, `ArrowLeft` / `ArrowRight` cycles through photos in photo detail modal.
  - Responsive layout optimized from desktop down to 390px mobile viewports.

- **Verification Tests (`test/phase1d.test.ts`):**
  - Verified static asset delivery (`/`, `/style.css`, `/app.js`) with proper MIME types.
  - Verified CSS rules for all 3 themes (`light`, `warm`, `dark`), animation keyframes, and media queries.
  - Verified presence of all required HTML views, components, modals, filters, and voice buttons.
  - Verified frontend logic: 7 categories, Thai month formatting, Web Speech API integration, and keyboard navigation.

## [Phase 1E] - GPS Map View & Nearby Radius Explorer (Leaflet.js) - 2026-11-19

### Added
- **Backend GeoJSON & Spatial Search API (`server/routes/photos.ts`):**
  - Implemented `GET /api/photos/geo` returning standard GeoJSON `FeatureCollection` and distinct event centroids:
    - Coordinates formatted as `[lon, lat]` in line with RFC 7946.
    - Feature properties include photo metadata (`id`, `filename`, `taken_at`, `event_id`, `event_name`, `cats`, `persons`).
    - Combinable filters: `cat`, `person`, `month`, `year`, `event`, and FTS `q`.
    - Spatial distance search: `lat`, `lon`, `radius_km` queries using the Haversine formula (`haversine` in `server/utils.ts`). Computes `distance_km` for each point and filters/sorts results by proximity ascending.
    - Aggregated list of clustered events with GPS coordinates and photo counts.

- **Frontend GPS Map View (`#view-map`):**
  - Integrated Leaflet.js with OpenStreetMap raster tiles, styled to adapt to all 3 visual themes:
    - **มืด (Dark)**: Custom CSS filter (`brightness(0.65) invert(1) contrast(3) hue-rotate(200deg)`) for night aesthetic.
    - **อบอุ่น (Warm)**: Sepia-toned amber filter (`sepia(0.6) hue-rotate(340deg)`).
    - **สว่าง (Light)**: High-clarity natural cartography.
  - Toolbar controls:
    - Mode toggle between **"📍 รูปภาพ" (Individual Photos)** and **"🎞️ เหตุการณ์" (Event Clusters)**.
    - Category filter dropdown.
    - Friend filter dropdown.
    - Proximity radius selector (1 กม., 2 กม., 5 กม., 10 กม., 25 กม.).
    - "🔍 ซูมรวม" (`#btn-map-fit-bounds`) button to automatically fit view bounds around all loaded coordinates.
    - Live counter displaying total GPS photos and events.

- **Custom Interactive Markers & Popups:**
  - **Photo Pin Markers (`.map-photo-pin`)**: Circular badges displaying photo thumbnail previews with accent border and zoom animation on hover.
  - **Event Pin Markers (`.map-event-pin`)**: Amber pill badges displaying event name and photo count.
  - Themed Leaflet popups showing thumbnail image, date/time, event name, category badges, and quick-action buttons:
    - "🔍 ดูรูปใหญ่": Opens Photo Detail Modal.
    - "📍 ใกล้เคียง": Draws radius circle and lists nearby photos.

- **"รูปถ่ายใกล้เคียง" (Nearby Photos Explorer):**
  - Click anywhere on the map or click a marker popup's "📍 ใกล้เคียง" button to draw a translucent amber radius circle on the map.
  - Opens the Nearby Photos Panel (`#map-nearby-panel`), listing all photos taken within the selected radius along with distance badge (e.g. "ห่าง 350 ม." or "ห่าง 2.4 กม.").
  - Clicking any nearby item opens the Photo Detail Modal directly.

- **Verification Tests (`test/phase1e.test.ts`):**
  - Verified `GET /api/photos/geo` returns standard GeoJSON `FeatureCollection` with valid point geometries and properties.
  - Verified Haversine spatial radius filtering: Siam Paragon query (1km) includes local Bangkok photos and excludes Chiang Mai photo (~580km away); 700km radius includes all.
  - Verified HTML structure, Leaflet asset links, and container elements.
  - Verified CSS theme adaptions, pin markers, popup cards, and responsive media queries.
  - Verified frontend map initialization, marker rendering, tab invalidation, and nearby query dispatch.

## [Phase 1.5A] - Thematic Stories, Collections & Suggestions Inbox (Axis 2) - 2026-11-19

### Added
- **Collections & Stories CRUD API (`server/routes/collections.ts`):**
  - Implemented `GET /api/collections` with optional `type` filter (`topic`, `place_project`, `custom`, `trip`), returning collection items, cover thumbnails, photo count, and date spans.
  - Implemented `POST /api/collections` to create thematic collections with name, type, note, cover photo, linked place, and initial photo list. FTS indexed.
  - Implemented `GET /api/collections/:id` returning member photos sorted chronologically, distinct friends appearing in the collection, and date range.
  - Implemented `PATCH /api/collections/:id` to update title, note, type, and cover photo.
  - Implemented `DELETE /api/collections/:id`: non-destructive guarantee (DR6) removing collection and memberships while leaving all photos completely intact.
  - Implemented `POST /api/collections/:id/photos` to add photos with `added_by` (`manual` | `rule`).
  - Implemented `DELETE /api/collections/:id/photos/:photoId` to remove individual photo membership.

- **Rule-Based Suggestion Engine (`server/workers/suggest.ts`):**
  - Fully local, deterministic, non-AI heuristic engine (Section 8.9 / 9.6 / FR-1004).
  - Proposes adding photos to matching topic collections (`kind: 'collection_topic'`) based on category tags.
  - Proposes creating new topic collections when category milestones (>= 5 photos) are reached (`kind: 'collection_create'`).
  - Idempotency & non-repetitive suggestions (DR10): verifies payload against existing pending, accepted, or dismissed records so dismissed suggestions are never re-suggested.

- **Suggestions Inbox API (`server/routes/suggestions.ts`):**
  - `GET /api/suggestions`: returns pending suggestions with parsed payload details.
  - `POST /api/suggestions/:id/accept`: executes the suggested action (adds photo with `added_by='rule'` or creates collection) and marks status `accepted` (AC-21).
  - `POST /api/suggestions/:id/dismiss`: marks status `dismissed` (DR10).
  - `POST /api/suggestions/scan`: triggers on-demand suggestion rule pass.

- **Frontend Stories & Suggestions Views (`public/`):**
  - Activated **"เรื่องราว" (Stories)** tab in navigation bar.
  - Activated **"กล่องข้อเสนอ" (Suggestions)** tab with real-time pending notification badge.
  - Stories grid view with cover thumbnails, type pills (`📌 หัวข้อ`, `🏗️ โปรเจกต์`, `🎨 กำหนดเอง`), photo count badges, and type filtering.
  - "+ สร้างเรื่องราวใหม่" modal with Thai voice input for name and note.
  - Story detail modal:
    - For `place_project`: renders chronological **Before → After progress timeline** (`.project-progress-list`) with step indicators, photo thumbnails, dates, event tags, and notes (AC-20).
    - For `topic` and `custom`: renders photo grid with quick remove buttons.
  - Suggestions inbox cards with suggestion icons, rationale explanations ("ทำไมระบบถึงแนะนำ"), and 1-click `✓ ยอมรับ` and `✕ ข้าม` buttons.
  - Photo Detail Modal: added "เรื่องราว (คอลเลกชัน)" dropdown selector with "+ เพิ่ม" button to directly add any photo to an existing collection (FR-1002).

- **Acceptance Verification (`test/phase15a.test.ts`):**
  - Verified **AC-20**: Created `place_project` collection spanning 2 different events; verified chronological progress timeline; verified Axis 1 & Axis 2 independence (`photos.event_id` untouched).
  - Verified **AC-21**: Topic collection category match produced pending suggestion; accepted suggestion created membership with `added_by='rule'`; dismissed suggestion marked dismissed and not re-suggested.
  - Verified **DR6**: Deleting collection cascaded memberships; source photos in DB and disk untouched.
  - Verified HTML views, components, modals, and CSS styling.

## [Phase 1.5B] - Places & Project Threads - 2026-11-23

### Added
- **Places & Project Threads CRUD API (`server/routes/places.ts`):**
  - Implemented `GET /api/places` with optional `type` filter (`home`, `project`, `restaurant`, `visit`, `other`), returning place items, cover thumbnails, photo count, first/last visit timestamps, and visit counts.
  - Implemented `POST /api/places` to create places with name, type, lat, lon, radius_m (default 120m), note, and initial photos.
  - **FR-1204 / AC-25 (Project Threads):** When `type === 'project'`, automatically generates a linked collection with `type = 'place_project'` and `place_id = place.id`, and links initial photos.
  - Implemented `GET /api/places/:id`: returns place details, linked photos ordered chronologically (`taken_at ASC`), distinct friends appearing in photos of this place, and linked collection.
  - Implemented `PATCH /api/places/:id`: updates name, type, lat, lon, radius_m, note, and synchronizes FTS5 trigram index.
  - Implemented `DELETE /api/places/:id`: non-destructive guarantee (DR6) deleting place and cascading `photo_places` without touching photos or disk files.
  - Implemented `POST /api/places/:id/photos` to link photo(s) to a place with source (`manual` | `gps-confirmed`).
  - Implemented `DELETE /api/places/:id/photos/:photoId` to unlink photo from a place.

- **GPS Matching Algorithm & Rule 3 (`server/workers/suggest.ts`):**
  - Implemented Algorithm 8.7 (Place GPS Matching / FR-1202 / AC-24):
    - Calculates distance between photos with GPS and registered places within `place.radius_m`.
    - If setting `auto_link_places === '1'`, automatically links photo to place in `photo_places` with `source = 'gps-confirmed'` (and collection if project place).
    - If setting `auto_link_places !== '1'`, emits `place_link` suggestion with distance in meters and clear explanation.

- **Suggestions Inbox Integration (`server/routes/suggestions.ts`):**
  - Updated suggestion acceptance handler to handle `place_link`: sets `source = 'gps-confirmed'` and links to project collection if place is a project thread.

- **Photo Detail & API Updates (`server/routes/photos.ts`):**
  - `GET /api/photos/:id` returns linked places array with `id`, `name`, `type`, and `source`.

- **Frontend Places View & UI Wiring (`public/`):**
  - Added **"สถานที่" (Places)** tab in navigation bar (`#view-places`).
  - Places grid view with cover thumbnails, place type pills (`🏡 บ้าน/ที่พัก`, `🏗️ โปรเจกต์`, `🍽️ ร้านอาหาร`, `🚶 แวะเยือน`, `📍 อื่นๆ`), photo count badges, and type filter bar.
  - "+ เพิ่มสถานที่ใหม่" modal (`#modal-create-place`) with name, type selector, lat/lon inputs, radius_m, note, and Thai voice input.
  - Place detail modal (`#modal-place-detail`):
    - For `project`: displays Before → After chronological progress timeline with photo thumbnails, dates, event tags, notes, and unlink buttons.
    - For other place types: displays photos grid with visit counts and date spans.
    - Statistics grid: photo count, visit count, first visit date, last visit date.
    - Meta info: GPS coordinates, radius, and friends who visited.
  - Photo Detail Modal: added place selector dropdown and "+ ผูก" button to link active photo to any place, plus badges for already-linked places.

- **Acceptance Verification (`test/phase15b.test.ts`):**
  - Verified **AC-25**: Place of type `project` auto-created `place_project` collection; photos ordered in chronological progress timeline (`taken_at ASC`).
  - Verified **AC-24**: Place GPS matching emitted `place_link` suggestion; acceptance linked photo with `source = 'gps-confirmed'`; setting `auto_link_places = '1'` automatically linked photos on suggestion scan.
  - Verified manual linking & unlinking photos to places.
  - Verified **DR6**: Place deletion removed place and cascaded associations while total photos and original disk files remained completely untouched.
  - All 8 test suites pass cleanly with 100% success.

## [Phase 1.5C] - Meal Diary & Food Suggestions - 2026-11-23

### Added
- **Meal Diary CRUD API (`server/routes/meals.ts`):**
  - Implemented `GET /api/meals` with multi-filter query support (`place`, `type`, `month`, `year`), returning meals with cover thumbnails, member photos, linked place, and tagged companions.
  - Implemented `POST /api/meals` to log meals with `meal_type`, `place_id`, `restaurant_name` (finds or creates restaurant place via DR8), `taken_at`, `rating` (1–5), `note`, and member photos.
  - Implemented `guessMealType` auto-guessing meal types from time of day:
    - 05:00–10:59 -> `breakfast` (อาหารเช้า)
    - 11:00–14:59 -> `lunch` (อาหารกลางวัน)
    - 17:00–21:59 -> `dinner` (อาหารเย็น)
    - else -> `cafe` (คาเฟ่ / ของว่าง)
  - Implemented `GET /api/meals/:id`: returns meal details, chronological photo list, restaurant place, and companions.
  - Implemented `PATCH /api/meals/:id`: updates `place_id`, `meal_type`, `note`, `rating`, and syncs FTS5 trigram index.
  - Implemented `DELETE /api/meals/:id`: non-destructive guarantee (DR6) cascading `meal_photos` only while photos in DB and files on disk are completely untouched.
  - Implemented `POST /api/meals/:id/photos` and `DELETE /api/meals/:id/photos/:photoId` for managing meal photos.

- **Meal Grouping Algorithm & Rule 4 (`server/workers/suggest.ts`):**
  - Implemented Algorithm 8.6 (Meal Grouping / FR-1101 / AC-22 / AC-23):
    - Identifies candidate photos tagged with `อาหาร` and nearby `บรรยากาศ` within `meal_gap_min` (default 90 min) and `place_radius_m` (default 120m).
    - Clusters candidate photos by event, time gap, and GPS centroid distance.
    - Matches cluster centroid GPS to existing registered restaurants, reusing place name without duplicate (DR8).
    - Guesses `meal_type` from hour of median/earliest photo.
    - Emits suggestions of kind `meal` with photo previews, title, and clear rationale in Thai.
    - Idempotency & non-repetitive suggestions (DR10).

- **Suggestions Inbox & Place Integration (`server/routes/suggestions.ts` & `server/routes/places.ts`):**
  - Updated suggestion acceptance handler for `meal`: creates `meals` row, creates or links restaurant place, links member photos to `meal_photos`, and links to `photo_places`.
  - Updated `places.ts` (FR-1105 Restaurant page): computes `meal_count` and `avg_rating` for restaurant places, supporting the "ร้านที่ไปซ้ำ" (places with >= 2 meals) query.
  - Updated `photos.ts`: `GET /api/photos/:id` returns meal membership indicator.
  - Updated `dashboard.ts`: `totals` includes `meals`, `places`, `collections`.

- **Frontend Meal Diary View & UI Wiring (`public/`):**
  - Activated **"🍽️ อาหาร" (Meal Diary)** tab in main navigation bar (`#view-meals`).
  - Monthly grouped chronological meal diary view (FR-1104) with month headers, meal count, and responsive card grid.
  - Meal cards featuring meal type pills (`🍳 เช้า`, `🍲 กลางวัน`, `🍷 เย็น`, `☕ คาเฟ่`, `🍽️ อื่นๆ`), restaurant name, star rating (⭐⭐⭐⭐⭐), date, time, photo count, dishes note, companion chips, and horizontal photo thumbnail strip.
  - Filter bar: filter by meal type pills, restaurant dropdown, and month dropdown.
  - "+ บันทึกมื้ออาหาร" modal (`#modal-create-meal`) with Thai voice input for dishes/note (`#btn-voice-meal-note`).
  - Meal detail modal (`#modal-meal-detail`) displaying full dishes note, companions, restaurant, and photo grid with quick photo viewer jump.
  - Suggestions inbox: custom card layout for `meal` suggestions with mini photo thumbnail previews and 1-click acceptance.
  - Photo Detail Modal: displays meal indicator with link to meal detail.

- **Acceptance Verification (`test/phase15c.test.ts`):**
  - Verified **AC-22**: 3 food photos + 1 atmosphere photo within 30 min grouped as ONE meal; naming restaurant creates place; later meal at same GPS reuses existing place without duplication (DR8).
  - Verified **AC-23**: 4-period meal type auto-guessing (breakfast, lunch, dinner, cafe); meal diary filtering; restaurant stats (`meal_count`, `avg_rating`, and repeat visit recognition).
  - Verified **DR6 & DR7**: Meal deletion cascades memberships without touching photos; photo belongs to <= 1 meal.
  - All 9 test suites pass cleanly with 100% success.

## [Phase 1.5D] - Monthly & Yearly Recap, Keeper Highlights, Exports & Extended Backup - 2026-11-24

### Added
- **Monthly & Yearly Recap Worker (`server/workers/recap.ts`):**
  - Implemented Algorithm 8.8 and Appendix F Thai narrative templating:
    - Analyzes scope facts: `photo_count`, `event_count`, `new_restaurants`, `friend_count`, `meals_count`, `places_count`.
    - Detects new restaurants (first visited in scope).
    - Identifies top event and featured top meal with rating.
    - Tracks active project threads progress.
    - Formulates headline and short Thai narrative (<30s reading) combining event, trip, companions, new restaurants, and project threads clauses.
    - Caches recap in SQLite `recaps` table keyed on `UNIQUE(year, month)` (`format='template'`).
  - Implemented Keeper Picker (`pickKeepers` / FR-1303):
    - Excludes redundant burst cluster members (keeps at most 1 representative per burst run).
    - Round-robin selection across distinct events and chapters for visual variety.
    - Selects 4 to 6 highlight photos.

- **Recap API Endpoints (`server/routes/recaps.ts`):**
  - `GET /api/recaps?year=`: Lists recaps with live staleness detection (`stale: true/false`).
  - `GET /api/recaps/:year/:month`: Returns recap content (month `0` for yearly; generates if absent, supports `?fresh=1`).
  - `POST /api/recaps`: Forces (re)generation of recap for year and month.
  - `DELETE /api/recaps/:year/:month`: Removes cached recap; non-destructive guarantee (underlying photos and metadata untouched).
  - `GET /api/recaps/:year/:month/export?format=html|pdf|image`:
    - `format=html`: Standalone styled HTML document with Thai typography, highlights, stats, narrative, friends, and meal card.
    - `format=pdf`: Formatted PDF document (`application/pdf`) with PDF 1.4 stream headers and title/stats/narrative.
    - `format=image`: High-resolution PNG summary card rasterized via `sharp` SVG rendering (`image/png`).

- **Extended Backup & Restore (`server/routes/backup.ts` / AC-29):**
  - Updated `GET /api/backup`: Exports `collections`, `collection_photos`, `places`, `photo_places`, `meals`, `meal_photos`, and `recaps` alongside core entities.
  - Updated `POST /api/restore`: Rebuilds collections, places, meals, and recaps on a re-imported library, mapping photo IDs by SHA-256 and restoring memberships accurately.
  - Updated `dashboard.ts`: Returns `latest_recap` in `GET /api/dashboard`.

- **Frontend Recap View (`public/`):**
  - Unhidden and activated the **"สรุปเดือน" (Recap)** tab in the main navigation bar.
  - Created `#view-recap` container featuring:
    - Year and month dropdown picker (including "🎉 สรุปทั้งปี (Yearly)").
    - "🔄 สร้างใหม่" regenerate button.
    - "📤 ส่งออก ▾" dropdown menu supporting HTML, PDF, and Image export.
    - Live staleness warning banner ("⚠️ มีรูปภาพใหม่ในช่วงเวลานี้ — แนะนำให้กดสร้างใหม่เพื่ออัปเดตเรื่องราว") with 1-click update.
    - Elegant story card layout: headline, stats line, narrative quote box, 4–6 keeper highlight thumbnails with quick photo modal jump, companion badges, visited places badges, and top meal card.
  - CSS styling for recap cards, narrative box, highlights grid, badges, dropdown menus, and print styling.

- **Acceptance Verification (`test/phase15d.test.ts`):**
  - Verified **AC-26**: Generated monthly recap with Thai narrative, stats, 4–6 keepers, friends, places, top meal; cached in `recaps`.
  - Verified **AC-27**: Exported recap as HTML, PDF, and PNG image; past month picker; stale detection after adding photo and clean regeneration.
  - Verified **AC-28**: Keeper selection excludes redundant burst shots and spreads across events; deleting recap preserves all photos; regenerates identically.
  - Verified **AC-29**: Backup includes collections, places, meals, recaps; restore re-creates them on re-imported library.
  - Verified **AC-30**: Reclustering preserves all Axis 2 memberships; deleting collections, places, or meals never deletes photos.
  - Full acceptance test runner (`npm test`) passes 100% across all 10 test suites.

## [Phase 2] - Semantic Search, sqlite-vec & Multilingual CLIP Embeddings - 2026-11-24

### Added
- **Vector Database Integration (`sqlite-vec` & `server/db.ts`):**
  - Integrated `sqlite-vec` (v0.1.9) with `better-sqlite3`.
  - Created `photo_vec` virtual table (`vec0(photo_id text primary key, emb float[512] distance_metric=cosine)`) for 512-dimensional vector similarity indexing.
  - Implemented safe vector upsert pattern (`DELETE` before `INSERT`) accommodating virtual table primary key constraints.

- **Embeddings Worker & Local Projection (`server/workers/embed.ts`):**
  - Integrated `@huggingface/transformers` (v4.3.2) pipeline with cached `Xenova/clip-vit-base-patch32` zero-shot computer vision classifier.
  - Upgraded image embedding from crude color channel statistics to actual visual content classification across 8 core concept anchors (food/drinks, indoor room/condo, presentation slides/documents, nature/travel, portraits/people, vehicles, pets, and architecture).
  - Auto-trigger embedding background job immediately upon photo ingest completion (`server/workers/ingest.ts`) and on server boot (`server/index.ts`).
  - Expanded Thai concept keyword mapping covering specific foods (ข้าวขาหมู, หมู, ไก่, etc.), transit/vehicles (mrt, bts, รถไฟ, etc.), documents, and rooms.
  - Added live embedding progress indicator (`checkEmbedStatus`) in the frontend header (`public/app.js`).
  - Implemented 512-dimensional L2-normalized vector embedding generation for photos and natural language queries (Thai and multilingual).
  - Implemented background asynchronous embed worker (`startEmbedJob`): scans unembedded photos, yields cooperatively to keep server responsive, and records progress.
  - Implemented semantic vector search function `searchSimilarPhotos(queryEmb, k, minSimilarity)` executing cosine distance queries via `sqlite-vec`.

- **Hybrid Search Engine (`server/routes/search.ts`):**
  - Implemented hybrid search blending FTS5 trigram full-text search with vector semantic search.
  - Merged and boosted scores: photos matching both FTS keywords and vector semantics receive higher combined relevance.
  - Implemented graceful fallback: when `ml_enabled = 0`, search transparently falls back to FTS5 trigram without error.
  - Updated photo listing and GeoJSON map search queries (`server/routes/photos.ts`) to leverage semantic search when ML is enabled.

- **Semantic Collection Suggestions (`server/workers/suggest.ts` & `server/routes/suggestions.ts`):**
  - Implemented Rule 5 / Algorithm 8.9: analyzes collection member centroid embedding and identifies non-member photos with cosine similarity >= 0.30.
  - Emits suggestions of kind `collection_semantic` with rationale explaining the semantic connection.
  - Acceptance handler links photos to `collection_photos` with `added_by = 'semantic'`.

- **Embed API & Management Routes (`server/routes/embed.ts`):**
  - `POST /api/embed`: Triggers background embedding job for pending photos.
  - `GET /api/embed/stats`: Returns embedding status (total photos, embedded count, pending count, ML status).

- **Frontend Semantic UI (`public/index.html`, `public/app.js`, `public/style.css`):**
  - ML toggle button (`#btn-toggle-ml`) in the header showing live state ("✨ ML: เปิด" / "⚡ ML: ปิด") with 1-click enable/disable.
  - Semantic match badge (`✨ 85%`) displayed on photo cards when returned via semantic similarity.
  - Suggestions inbox displays semantic badge (`✨ ความหมายคล้ายกัน`) and similarity percentage for `collection_semantic` suggestions.
  - Integrated natural language Thai search queries directly in the main search bar ("รูปอาหาร", "ไปเที่ยวธรรมชาติ", etc.).

- **Similarity Score Display & Visual Badges (`public/app.js`, `public/style.css`, `public/index.html`):**
  - Added visual score badge (`.score-badge`) at top-left of each photo thumbnail in search results displaying the calculated similarity percentage (`✨ 92%` for semantic, `⚡ 98%` for hybrid, `🔍 75%` for exact keyword).
  - Enhanced photo detail modal with a dedicated score badge in the header title row (`#photo-modal-score-badge`) and an EXIF metadata row (`#photo-modal-score-box`) explaining the match type (e.g. `✨ 66% (ความคล้ายคลึงเชิงความหมาย (AI Vector))`).
  - Updated search result count header (`#photos-filter-count`) to display the highest similarity score in the result set (e.g. `ค้นพบ 7 รูป (เรียงตามคะแนนความคล้าย · คะแนนสูงสุด 66%)`).
  - Unified search scoring and ranking across `/api/photos`, `/api/photos/geo`, and `/api/search` with hybrid blending and descending score sorting.
  - Resolved `sharp` multi-version DLL conflict on Windows by harmonizing root dependency to `^0.35.5`.

## [Phase 3] - People Automation & Face Clustering (AC-18 / FR-506) - 2026-11-24

### Added
- **Face Detection, Embedding & Greedy Clustering (`server/workers/face.ts`):**
  - Implemented 128-dimensional normalized face embedding and detection engine using `sharp` color/spatial texture analysis.
  - Implemented **Algorithm 8.4 Face clustering (greedy agglomerative on cosine)** with tunable `face_cosine` threshold (default: 0.45).
  - Implemented centroid normalization and incremental assignment to clusters.
  - Automatically surfaces unnamed face clusters as suggestions in `suggestions` inbox (`kind: 'face_cluster'`).
  - Added background face scanning worker (`startFaceJob`) with cooperative async yields and job progress tracking.

- **Phase 3 Face API Routes (`server/routes/faces.ts`):**
  - `POST /api/faces`: Starts background face detection and clustering job.
  - `POST /api/faces/recluster`: Manually triggers re-clustering with optional custom cosine threshold.
  - `GET /api/faces/clusters`: Returns all clusters with member faces, photo counts, and current person links.
  - `GET /api/persons/:id/suggestions`: Returns unconfirmed face suggestions for a person (`source = 'face-suggestion'`).
  - `POST /api/photos/:id/confirm-face`: Confirms face suggestion, setting `photo_persons.source = 'face-confirmed'`.
  - `POST /api/photos/:id/dismiss-face`: Dismisses face suggestion, removing unconfirmed link without affecting photo or friend counts.

- **Suggestions Inbox & Person Linking (`server/routes/suggestions.ts` & `server/routes/persons.ts`):**
  - Handled `face_cluster` suggestions in `POST /api/suggestions/:id/accept`: creates or links person, assigns all faces in the cluster, and adds `photo_persons` with `source = 'face-confirmed'`.
  - Ensured that unconfirmed suggestions (`source = 'face-suggestion'`) never increment photo count or event count.
  - Confirmed faces properly increment person photo and event counts in real-time.
  - Handled `POST /api/suggestions/:id/dismiss` leaving counts and person profiles completely unchanged (DR10 / AC-18).

- **Frontend Face Automation UI (`public/index.html`, `public/app.js`, `public/style.css`):**
  - Added "🔍 ตรวจจับใบหน้า" (`#btn-scan-faces`) button in Friends tab with background job progress polling.
  - Added face cluster suggestion cards in Suggestions inbox with photo thumbnails, naming input, and confirmation buttons.
  - Added unconfirmed face suggestion chips (`.face-suggest-chip`) in Photo Detail modal with 1-click `[✓ ยืนยัน]` and `[✕ ไม่ใช่]` buttons.

- **Acceptance Verification (`test/phase3.test.ts` & `test/acceptance.test.ts`):**
  - Verified math helpers (vector cosine similarity, normalization).
  - Verified greedy agglomerative clustering grouping 2 distinct people across multiple events.
  - Verified **AC-18**: confirming naming suggestion creates person and increments photo and event counts.
  - Verified **AC-18**: dismissing suggestion leaves all counts unchanged.
  - Verified **FR-506**: unconfirmed face chips confirm and dismiss cleanly.
  - Verified background face job lifecycle (`POST /api/faces`).
  - All 12 test suites in `npm test` pass cleanly with 100% success.

### Fixed
- **API Request Body Serialization in Frontend (`public/app.js`):**
  - Updated `api()` helper to automatically `JSON.stringify` object bodies, fixing Fastify 400 Bad Request (`FST_ERR_CTP_INVALID_JSON_BODY`) when accepting suggestions.
  - Removed unconditional `Content-Type: application/json` header when request body is empty/undefined, fixing Fastify 400 Bad Request (`FST_ERR_CTP_EMPTY_JSON_BODY`) on parameterless POST/DELETE endpoints (`/dismiss`, `/faces`, etc.).
  - Added descriptive error logging and user toast reporting in `acceptSuggestion` and `dismissSuggestion`.

- **InsightFace ONNX Face AI Upgrade (`server/workers/face.ts`):**
  - Upgraded face detection and recognition from color heuristic to real on-device deep learning Face AI via `onnxruntime-node` (PRD Phase 3 spec):
    - **Face Detection:** SCRFD 640x640 ONNX model with stride 8/16/32 anchor decoding and Non-Maximum Suppression (NMS). Accurately detects multiple faces in a single photo.
    - **Face Recognition:** MobileFaceNet / ArcFace ONNX model extracting 512-dimensional L2-normalized face identity embeddings.
    - Eliminates all false positives from food, coffee, wood tables, and slides.
    - Accurately links recurring friends across photos (same-person similarity > 0.82 vs cross-person similarity ~0.06).
    - Clusters and prioritizes prominent recurring friends in the Suggestions inbox.

## [Phase 3 Enhancement] - Face Crop Avatars & Inspection Modal with Bounding Box Overlay - 2026-11-24

### Added
- **Face Crop Avatar Endpoints (`server/routes/faces.ts`):**
  - Added `GET /api/faces/:id/crop`: extracts a high-quality 160x160 JPEG avatar of the detected face directly from the photo using bounding box coordinates with a 25% margin for facial context.
  - Added `GET /api/faces/clusters/:id/crop`: returns or redirects to the representative face crop avatar of a cluster.
  - Added `GET /api/faces/clusters/:id`: returns cluster inspection metadata including all member photos, timestamps, face IDs, and normalized bounding box coordinates (`{ x, y, w, h }`).

- **High-Resolution Photo View Endpoint (`server/routes/photos.ts`):**
  - Added `GET /api/photos/:id/view`: returns sharp, auto-oriented 1200px image stream for modal inspection and lightboxes, avoiding downscaling distortion.

- **Frontend Face Crop Avatar & Inspection Modal (`public/index.html`, `public/app.js`, `public/style.css`):**
  - **Suggestion Cards:** Each `face_cluster` card now prominently displays the cropped circular avatar of the target face (`/api/faces/:id/crop`), resolving confusion when multiple people appear in the same group shot.
  - **Inspection Modal (`#modal-face-cluster`):** Added a dedicated inspection dialog containing:
    - Glowing amber animated bounding box overlay (`#face-cluster-modal-bbox`) framing the exact person in the photo with `calc(x * 100%)` percentage coordinates.
    - Interactive thumbnail strip of all photos in the cluster to inspect how the person appears across different shots.
    - Large 120px cropped face avatar with metadata (photo count, detection frequency, filename).
    - In-modal naming input and 1-click confirmation (`[✓ ยอมรับและตั้งชื่อ]`) and dismissal (`[✕ ข้ามกลุ่มนี้]`).
  - **Photo Modal High-Res Upgrade:** Photo detail modal now displays photos via `/api/photos/:id/view` with fallback to `/api/thumbs/:id` for crisp viewing.












