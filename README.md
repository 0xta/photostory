# 🎞️ เรื่องราว 2026 (Photostory)

> **Local-First Personal Photo Journal & AI-Powered Memory Archive**  
> 100% on-device processing, zero cloud subscription, zero telemetry, and built on the Modern Web Platform.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-Better--SQLite3%20%2B%20sqlite--vec-003B57?logo=sqlite&logoColor=white)](https://github.com/asg017/sqlite-vec)
[![Web Guidance](https://img.shields.io/badge/Modern_Web_Guidance-Compliant-4285F4?logo=googlechrome&logoColor=white)](https://github.com/GoogleChrome/modern-web-guidance)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

---

## 🌟 Overview (ภาพรวม)

**เรื่องราว 2026 (Photostory)** is an AI-powered, local-first personal photo journal designed to turn thousands of photos into meaningful personal stories. Unlike commercial cloud photo services, Photostory processes every byte on your local machine—photos never leave your disk, embeddings are computed locally, and personal relationships remain strictly private.

Built using clean vanilla **HTML5 / CSS3 / ES2024** and conforming to [Google Chrome's Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance), Photostory delivers a blisteringly fast 60 FPS user experience with zero frontend framework bloat.

📖 **คู่มือการใช้งานภาษาไทยฉบับสมบูรณ์ (Full Thai Manual):** ดูได้ที่ [`USER_MANUAL.md`](USER_MANUAL.md)  
🔌 **REST API Documentation:** เอกสารอ้างอิง REST API ทั้งหมดของระบบ ดูได้ที่ [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)

---

## 🚀 Key Features

### 1. Spatiotemporal Clustering & Smart Ingestion (Axis 1)
- **Automatic EXIF Parsing:** Extracts timestamp, GPS coordinates, camera dimensions, and orientation using `exifr`.
- **Haversine Spatiotemporal Grouping:** Clusters photos into discrete real-world events based on time proximity ($\le 2$ hours) and geographic distance ($\le 500$ meters) with iterative centroid recalculation.
- **Burst Shot Detection:** Automatically identifies and tags rapid burst sequences ($\le 2$ seconds apart).
- **Perceptual Hashing (pHash):** 64-bit Discrete Cosine Transform (DCT) near-duplicate detection (Hamming distance $\le 6$) to prevent album cluttering while preserving originals.
- **Multi-Folder Ingestion:** Supports batch scanning across multiple paths (delimited by commas, semicolons, or newlines) with subfolder recursion.
- **Watch Folder Auto-Ingest:** Real-time directory monitoring with non-blocking auto-import.

### 2. Thematic Stories, Places & Meal Diary (Axis 2)
- **Thematic Collections (Stories):** User-curated and rule-based collections that exist independently from chronological events (Two-Axis Architecture).
- **Places & Project Threads:** Geofenced geographic anchors (`home`, `work`, `travel`, `project`) with Before/After progress timelines.
- **Automated Meal Diary:** Heuristic clustering for dining experiences (combines food and atmosphere photos within 90 minutes and 120 meters) with restaurant history and rating tracking.

### 3. Local-First AI & Smart Search
- **Multilingual Semantic Search:** On-device Multilingual CLIP (512-dimension vector embeddings) powered by Hugging Face Transformers.
- **In-Database Vector Similarity:** Powered by `sqlite-vec` running directly within SQLite for sub-millisecond similarity scoring.
- **Thai Full-Text Search (FTS5):** SQLite FTS5 with trigram tokenization for searching Thai titles, descriptions, companion names, and locations.
- **People & Face Recognition:** Local ONNX inference (SCRFD face detection + ArcFace 512-d embeddings) paired with Greedy Agglomerative Clustering (cosine similarity $\ge 0.45$) and social graph analysis.

### 4. Modern Web Standards & High Performance
Conforms to **Google Chrome's Modern Web Guidance**:
- **View Transitions API:** Smooth cross-fade view switching across tabs without third-party animation libraries.
- **Safe DOM Operations:** Complete transition from `.innerHTML = ""` to `element.replaceChildren()` across all views to prevent memory overhead and comply with Trusted Types CSP.
- **Native Color-Scheme & Theme Sync:** Dynamic synchronization with `<meta name="color-scheme">` across 3 themes (Darkroom Dark, Cozy Warm, Daylight Clean) preventing FOUC and styling browser-native UI controls.
- **Subresource Integrity (SRI):** Cryptographic verification (`sha384`), `crossorigin="anonymous"`, and `referrerpolicy="no-referrer"` on third-party dependencies (Leaflet).
- **Infinite Virtualization & Pagination:** Configurable pagination (20, 40, 60 photos per page) with immutable browser HTTP caching for thumbnails.
- **Spatial Map Clustering:** Leaflet-based GPS coordinate clustering into interactive badge markers.

### 5. Memory Resurfacing & Data Ownership
- **On This Day:** Automatically surfaces memorable moments from previous years on today's calendar date.
- **Monthly Recap Generator:** Generates highlights narrative stories with automated keeper photo selection.
- **Open-Format Export:** Lossless export to JSON, CSV (UTF-8 with BOM), GeoJSON (RFC 7946), and non-destructive Adobe XMP sidecars.
- **Lossless Backup & Restore:** Complete offline database archive and restoration.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Runtime & Server** | Node.js (>= 22.0.0), Fastify 5.2, TypeScript 5.7, `tsx` |
| **Database & Search** | SQLite 3 via `better-sqlite3`, `sqlite-vec` (vector extension), SQLite FTS5 (trigram) |
| **Image Processing** | Sharp 0.35, `exifr` 7.1, `imghash` 1.1 (DCT pHash) |
| **On-Device AI** | Hugging Face `@huggingface/transformers` (Multilingual CLIP 512-d), ONNX Runtime (SCRFD + ArcFace) |
| **Frontend** | Modern Vanilla HTML5 / CSS3 / ES2024 (Zero build step, View Transitions API, CSS Custom Properties, Subgrid) |
| **Mapping** | Leaflet 1.9.4 (secured with Subresource Integrity) |

---

## 📦 Getting Started

### Prerequisites
- **Node.js**: version `22.0.0` or higher
- **npm**: version `10.0.0` or higher
- **C/C++ Build Tools**: Required for compiling native modules (`better-sqlite3`, `sqlite-vec`)
  - **Windows:** Visual Studio C++ Build Tools (`npm install -g windows-build-tools` or Visual Studio Installer)
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential`, `python3`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/0xta/photostory.git
   cd photostory
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   # Development mode with live reload
   npm run dev

   # Or standard production start
   npm start
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000) (or the port displayed in your terminal).

---

## 🧪 Testing & Validation

Photostory includes a comprehensive automated test suite verifying all end-to-end acceptance criteria (Phases 1A through 5C):

```bash
# Run full acceptance test suite
npm test
```

### Modern Web Guidance Audit

To verify the codebase against the latest web standards:

```bash
npx modern-web-guidance legacy-scan public
```

---

## 📸 Screenshots Gallery

| Screen | Description |
| :--- | :--- |
| **Dashboard** | Overview of photo counts, spatiotemporal events, 12-month rhythm histogram, and On-This-Day memories. |
| **Photos & Filters** | Gallery with 20/40/60 pagination, category pills, friend tags, and photo detail modal with EXIF data. |
| **Leaflet Map** | Interactive GPS map with coordinate clustering and thumbnail preview popups. |
| **Social Graph** | HTML5 Canvas relationship graph calculating co-occurrence frequencies between companions. |
| **Monthly Recap** | Curated story chapters with automated keeper selection and Thai narrative generators. |

*(See [`screenshot/`](screenshot/) and [`USER_MANUAL.md`](USER_MANUAL.md) for full HiDPI interface previews)*

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
