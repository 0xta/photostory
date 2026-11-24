# 📖 Photostory REST API Documentation
> **เรื่องราว 2026 (Photostory)** — Complete Local REST API Reference  
> เอกสารอ้างอิง API ทั้งหมดที่ระบบ Photostory ใช้งาน สำหรับนักพัฒนาและการเชื่อมต่อภายนอก

---

## 📑 สารบัญ (Table of Contents)

1. [ภาพรวมของสถาปัตยกรรม (Architecture & Overview)](#1-ภาพรวมของสถาปัตยกรรม-architecture--overview)
2. [รูปแบบ Background Job & Polling](#2-รูปแบบ-background-job--polling)
3. [รหัสสถานะ HTTP (HTTP Status Codes)](#3-รหัสสถานะ-http-http-status-codes)
4. [หมวดหมู่ API (API Endpoints by Group)](#4-หมวดหมู่-api-api-endpoints-by-group)
   - [4.1 ระบบและแดชบอร์ด (System & Dashboard)](#41-ระบบและแดชบอร์ด-system--dashboard)
   - [4.2 นำเข้ารูปภาพและภาพขนาดย่อ (Import & Thumbnails)](#42-นำเข้ารูปภาพและภาพขนาดย่อ-import--thumbnails)
   - [4.3 จัดการรูปภาพ (Photos Management)](#43-จัดการรูปภาพ-photos-management)
   - [4.4 เหตุการณ์ / ไทม์ไลน์ (Events & Timeline)](#44-เหตุการณ์--ไทม์ไลน์-events--timeline)
   - [4.5 เพื่อนและบุคคล (Persons & Friends)](#45-เพื่อนและบุคคล-persons--friends)
   - [4.6 อัลบั้มร่วมกัน X & ME (Shared Album)](#46-อัลบั้มร่วมกัน-x--me-shared-album)
   - [4.7 ระบบตรวจจับและจัดกลุ่มใบหน้า (Face Recognition & Clustering)](#47-ระบบตรวจจับและจัดกลุ่มใบหน้า-face-recognition--clustering)
   - [4.8 คอลเลกชันและเรื่องราว (Collections & Stories)](#48-คอลเลกชันและเรื่องราว-collections--stories)
   - [4.9 สถานที่และโปรเจกต์ (Places & Locations)](#49-สถานที่และโปรเจกต์-places--locations)
   - [4.10 ไดอารี่อาหาร (Meals & Food Diary)](#410-ไดอารี่อาหาร-meals--food-diary)
   - [4.11 สรุปความทรงจำและไฮไลต์ (Recaps & Highlights)](#411-สรุปความทรงจำและไฮไลต์-recaps--highlights)
   - [4.12 ข้อมูลเชิงลึกและแผนที่ชีวิต (Insights & Life Map)](#412-ข้อมูลเชิงลึกและแผนที่ชีวิต-insights--life-map)
   - [4.13 ค้นหาไฮบริดและ CLIP Embeddings (Search & Embeddings)](#413-ค้นหาไฮบริดและ-clip-embeddings-search--embeddings)
   - [4.14 กล่องข้อเสนออัตโนมัติ (Suggestions Inbox)](#414-กล่องข้อเสนออัตโนมัติ-suggestions-inbox)
   - [4.15 ตรวจจับโฟลเดอร์อัตโนมัติ (Watch Folder)](#415-ตรวจจับโฟลเดอร์อัตโนมัติ-watch-folder)
   - [4.16 ส่งออกข้อมูลเปิดและ XMP Sidecar (Open Export & XMP)](#416-ส่งออกข้อมูลเปิดและ-xmp-sidecar-open-export--xmp)
   - [4.17 สำรองข้อมูลและกู้คืน (Backup & Restore)](#417-สำรองข้อมูลและกู้คืน-backup--restore)
   - [4.18 การตั้งค่าระบบ (Settings & Config)](#418-การตั้งค่าระบบ-settings--config)

---

## 1. ภาพรวมของสถาปัตยกรรม (Architecture & Overview)

- **Base URL:** `http://127.0.0.1:3000` (หรือพอร์ตที่กำหนดผ่าน environment variable `PORT`)
- **โปรโตคอล:** HTTP/1.1 RESTful API
- **การยืนยันตัวตน (Authentication):** ไม่จำเป็นต้องระบุ Token (Local-first Single-User ออกแบบให้รันบนเครื่องผู้ใช้หรือเครือข่ายส่วนตัวอย่างปลอดภัย)
- **Header เริ่มต้น:**
  - `Content-Type: application/json` สำหรับ Request และ Response ส่วนใหญ่
  - `Cache-Control: public, max-age=31536000, immutable` สำหรับภาพขนาดย่อ (`/api/thumbs/:id`)
  - `Content-Type: image/jpeg` สำหรับภาพถ่ายเต็มขนาดและภาพหน้าตัด (Crop)
  - `Content-Type: text/html` หรือ `application/pdf` สำหรับรายงานสรุปและอัลบั้มร่วมกัน

---

## 2. รูปแบบ Background Job & Polling

สำหรับกระบวนการที่ใช้เวลาประมวลผลสูง (เช่น Ingest นำเข้ารูปภาพ, Face Detection ตรวจจับใบหน้า, CLIP Vector Embedding) เซิร์ฟเวอร์จะคืนค่า `202 Accepted` พร้อมรหัสงาน `{ jobId: "..." }` ทันที จากนั้นไคลเอนต์จะเรียก Polling ตรวจสอบสถานะงานผ่าน:

```
GET /api/jobs/:id
```

สถานะงาน (`status`):
- `queued`: อยู่ในคิวรอประมวลผล
- `running`: กำลังประมวลผล (มี `progress: 0.0 - 1.0` และ `detail: string`)
- `done`: ประมวลผลเสร็จสิ้น
- `error`: เกิดข้อผิดพลาด (มีฟิลด์ `error: string`)

---

## 3. รหัสสถานะ HTTP (HTTP Status Codes)

| Status Code | ความหมาย | คำอธิบาย |
|-------------|----------|----------|
| `200 OK` | สำเร็จ | คำขอสำเร็จและส่งข้อมูลผลลัพธ์กลับมา |
| `201 Created` | สร้างสำเร็จ | สร้าง Resource ใหม่ในฐานข้อมูลเรียบร้อยแล้ว |
| `202 Accepted` | รับเข้าคิวงาน | รับงานประมวลผลแบบ Background Job เรียบร้อยแล้ว |
| `400 Bad Request` | ข้อมูลไม่ถูกต้อง | ข้อมูล Request body หรือ Query parameters ไม่ถูกต้อง |
| `404 Not Found` | ไม่พบข้อมูล | ไม่พบ Resource หรือไฟล์ที่ต้องการ |
| `409 Conflict` | ทำงานซ้ำซ้อน | มีงาน Background Job อื่นกำลังทำงานอยู่ |
| `500 Server Error` | เกิดข้อผิดพลาดภายใน | ข้อผิดพลาดทางเทคนิคที่ฝั่งเซิร์ฟเวอร์ |

---

## 4. หมวดหมู่ API (API Endpoints by Group)

### 4.1 ระบบและแดชบอร์ด (System & Dashboard)

#### `GET /api/health`
ตรวจสอบสถานะการทำงานของเซิร์ฟเวอร์ พร้อมจำนวนภาพและเหตุการณ์เบื้องต้น

- **Response `200 OK`**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "phase": "2.0",
  "counts": {
    "photos": 95,
    "events": 16,
    "persons": 6
  }
}
```

---

#### `GET /api/dashboard`
ดึงข้อมูลสรุปสำหรับหน้าแรก (Dashboard): ยอดรวม, กราฟฮิสโตแกรมรายเดือน, เพื่อนที่เจอบ่อย, คิวรอเติมข้อมูล, และสรุปล่าสุด

- **Query Parameters**:
  - `year` *(optional, string)*: ปี ค.ศ. ที่ต้องการดูสถิติ (เช่น `2026`, ค่าเริ่มต้นคือปีที่ตั้งไว้ใน Settings)
- **Response `200 OK`**:
```json
{
  "totals": {
    "photos": 95,
    "events": 16,
    "persons": 6,
    "collections": 2,
    "places": 5,
    "meals": 8,
    "tagged_pct": 74
  },
  "histogram": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 95, 0],
  "top_friends": [
    { "id": "p1", "name": "สมชาย", "nick": "ชาย", "color": "#E56B50", "photo_count": 28 }
  ],
  "review_queue": {
    "dateless": 0,
    "unnamed_events": 2,
    "burst_photos": 4,
    "pending_suggestions": 15
  },
  "recent_events": [
    {
      "id": "ev_01",
      "name": "ไปกินข้าวสยาม",
      "displayName": "ไปกินข้าวสยาม",
      "place": "Siam Paragon",
      "ts_start": 1795000000000,
      "photo_count": 12,
      "friend_count": 3,
      "cover_ids": ["ph_01", "ph_02"]
    }
  ],
  "latest_recap": null
}
```

---

#### `GET /api/jobs/:id`
ตรวจสอบสถานะและเปอร์เซ็นต์ความคืบหน้าของ Background Job

- **Path Parameters**:
  - `id` *(string, required)*: รหัสงาน Job ID
- **Response `200 OK`**:
```json
{
  "id": "job_1732448000000",
  "status": "running",
  "progress": 0.65,
  "detail": "กำลังดึงข้อมูล EXIF: 62/95 ภาพ",
  "total": 95,
  "current": 62,
  "created_at": 1732448000000
}
```
- **Error `404 Not Found`**: `{ "error": "Job not found" }`

---

### 4.2 นำเข้ารูปภาพและภาพขนาดย่อ (Import & Thumbnails)

#### `POST /api/import`
เริ่มกระบวนการนำเข้ารูปภาพจากโฟลเดอร์บนเครื่อง หรือจากรายการไฟล์เฉพาะเจาะจง (Non-destructive: ไม่แก้ไขไฟล์ต้นฉบับ)

- **Request Body**:
```json
{
  "folder": "D:/Photos/2026",
  "files": []
}
```
*หรือส่งเฉพาะรายการไฟล์:*
```json
{
  "files": [
    "D:/Photos/2026/IMG_0001.JPG",
    "D:/Photos/2026/IMG_0002.JPG"
  ]
}
```
- **Response `202 Accepted`**:
```json
{
  "jobId": "job_1732448000000"
}
```
- **Error `400 Bad Request`**: `{ "error": "Folder not found: ..." }`
- **Error `409 Conflict`**: `{ "error": "An import job is already running" }`

---

#### `POST /api/recluster`
สั่งประมวลผลจัดกลุ่มรูปภาพเป็นเหตุการณ์ใหม่ (Clustering) ตามเงื่อนไขเวลาและพิกัด GPS ปัจจุบัน

- **Response `200 OK`**:
```json
{
  "events_created": 16,
  "photos_clustered": 95
}
```

---

#### `GET /api/thumbs/:id`
ดึงภาพขนาดย่อ (Thumbnail JPEG ความละเอียด 400px WebP/JPEG) ที่สร้างไว้ล่วงหน้าอย่างรวดเร็ว

- **Path Parameters**:
  - `id` *(string, required)*: รหัสรูปภาพ (`photo_id`)
- **Headers**:
  - Response: `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`
- **Error `404 Not Found`**: `{ "error": "Thumbnail not found" }`

---

### 4.3 จัดการรูปภาพ (Photos Management)

#### `GET /api/photos`
ดึงรายการรูปภาพในระบบ พร้อมตัวกรองครบวงจรและการแบ่งหน้า (Pagination)

- **Query Parameters**:
  - `cat` *(optional, string)*: กรองตามหมวดหมู่ (เช่น `food`, `cat`, `dog`, `travel`)
  - `person` *(optional, string)*: กรองตามรหัสบุคคล (`person_id`)
  - `month` *(optional, string)*: กรองตามเดือน (1-12)
  - `year` *(optional, string)*: กรองตามปี ค.ศ. (เช่น `2026`)
  - `gps` *(optional, string)*: `yes` (เฉพาะภาพที่มี GPS), `no` (ไม่มี GPS), `nodate` (ไม่มีวันที่)
  - `burst` *(optional, string)*: `1` (เฉพาะภาพถ่ายรัว), `0` (เฉพาะภาพเดี่ยว)
  - `event` *(optional, string)*: กรองตามรหัสเหตุการณ์ (`event_id`)
  - `q` *(optional, string)*: คำค้นหา FTS5 หรือชื่อไฟล์
  - `limit` *(optional, number, default: 100)*: จำนวนภาพต่อหน้า
  - `offset` *(optional, number, default: 0)*: ลำดับภาพเริ่มต้น
- **Response `200 OK`**:
```json
{
  "total": 95,
  "photos": [
    {
      "id": "ph_01",
      "filename": "20261118_143000.jpg",
      "taken_at": 1795000000000,
      "lat": 13.7469,
      "lon": 100.5349,
      "burst": 0,
      "note": "กินข้าวเที่ยงกับเพื่อน",
      "event_id": "ev_01",
      "cats": ["food"],
      "persons": [
        { "id": "p1", "name": "สมชาย", "nick": "ชาย", "color": "#E56B50" }
      ]
    }
  ]
}
```

---

#### `GET /api/photos/geo`
ดึงเฉพาะรูปภาพที่มีพิกัด GPS สำหรับแสดงผลบนแผนที่หรือคลัสเตอร์หมุด

- **Query Parameters**: คล้ายกับ `/api/photos` พร้อมรองรับ:
  - `lat`, `lon` *(optional, number)*: พิกัดกึ่งกลาง
  - `radius_km` *(optional, number)*: รัศมีการค้นหาเป็นกิโลเมตร
- **Response `200 OK`**: รายการรูปภาพที่มี `lat`, `lon` ไม่เป็น null

---

#### `GET /api/photos/:id`
ดึงข้อมูลรายละเอียดของภาพเดี่ยว พร้อมประวัติแท็ก หมวดหมู่ ใบหน้าที่ตรวจพบ และเหตุการณ์ที่สังกัด

- **Path Parameters**:
  - `id` *(string, required)*: รหัสรูปภาพ
- **Response `200 OK`**: รายละเอียดเต็มของภาพพร้อมข้อมูล EXIF และรายชื่อเพื่อน
- **Error `404 Not Found`**: `{ "error": "Photo not found" }`

---

#### `GET /api/photos/:id/view`
ส่งสตรีมไฟล์รูปภาพต้นฉบับเต็มขนาด สำหรับแสดงผลในหน้าต่างดูภาพความละเอียดสูง (Lightbox)

- **Headers**: `Content-Type: image/jpeg` หรือชนิดไฟล์เดิม
- **Error `404 Not Found`**: `{ "error": "Photo file not found on disk" }`

---

#### `GET /api/photos/:id/thumb`
Route Alias ชี้ตรงไปยัง `/api/thumbs/:id` สำหรับดึงภาพขนาดย่อ

---

#### `PATCH /api/photos/:id`
แก้ไขข้อมูลคำบรรยาย (Note), วันที่ถ่าย (`taken_at`), หรือพิกัดภูมิศาสตร์ (`lat`, `lon`)  
*(หากมีการเปลี่ยนวันที่หรือพิกัด ระบบจะสั่ง Re-clustering อัตโนมัติ)*

- **Request Body**:
```json
{
  "note": "เที่ยวทะเลบางแสนช่วงเย็น",
  "taken_at": 1795012345000,
  "lat": 13.2844,
  "lon": 100.9123
}
```
- **Response `200 OK`**: อ็อบเจกต์รูปภาพหลังอัปเดต

---

#### `DELETE /api/photos/:id`
ลบรูปภาพออกจากฐานข้อมูล Photostory และลบภาพ Thumbnail  
> **คำเตือนเรื่องความปลอดภัย:** ระบบจะ **ไม่แตะต้องหรือลบไฟล์ต้นฉบับของผู้ใช้บนดิสก์เด็ดขาด** (Non-destructive)

- **Response `200 OK`**: `{ "ok": true }`

---

#### `PUT /api/photos/:id/cats`
อัปเดตหมวดหมู่ทั้งหมดของรูปภาพ (เช่น `food`, `cat`, `dog`, `night`)

- **Request Body**:
```json
{
  "cats": ["food", "cafe"]
}
```
- **Response `200 OK`**: `{ "cats": ["food", "cafe"] }`

---

#### `PUT /api/photos/:id/persons`
กำหนดรายชื่อเพื่อนที่อยู่ในรูปภาพด้วยตนเอง (Manual tagging)

- **Request Body**:
```json
{
  "persons": ["p1", "p2"]
}
```
- **Response `200 OK`**: `{ "persons": ["p1", "p2"] }`

---

### 4.4 เหตุการณ์ / ไทม์ไลน์ (Events & Timeline)

#### `GET /api/events`
ดึงรายการกลุ่มเหตุการณ์ทั้งหมด พร้อมภาพหน้าปกและจำนวนเพื่อนที่เข้าร่วม

- **Query Parameters**:
  - `limit` *(optional, default: 100)*: จำนวนเหตุการณ์
  - `offset` *(optional, default: 0)*: จุดเริ่มต้น
- **Response `200 OK`**:
```json
{
  "total": 16,
  "items": [
    {
      "id": "ev_01",
      "name": "ทริปหัวหิน",
      "displayName": "ทริปหัวหิน",
      "place": "Hua Hin Beach",
      "note": "ทริปประจำปี",
      "ts_start": 1795000000000,
      "ts_end": 1795086400000,
      "lat": 12.5684,
      "lon": 99.9577,
      "named": 1,
      "photo_count": 42,
      "friend_count": 4,
      "cover_ids": ["ph_01", "ph_02", "ph_03", "ph_04"]
    }
  ]
}
```

---

#### `GET /api/events/:id`
ดึงรายละเอียดของเหตุการณ์เดี่ยว รายชื่อเพื่อน และรูปภาพทั้งหมดในเหตุการณ์นั้น

- **Response `200 OK`**:
```json
{
  "id": "ev_01",
  "name": "ทริปหัวหิน",
  "displayName": "ทริปหัวหิน",
  "place": "Hua Hin Beach",
  "photos": [ ... ],
  "friends": [ ... ]
}
```

---

#### `PATCH /api/events/:id`
แก้ไขชื่อเหตุการณ์, สถานที่, หรือบันทึกโน้ต

- **Request Body**:
```json
{
  "name": "งานวันเกิดสมชาย",
  "place": "สยามพารากอน",
  "note": "จัดปาร์ตี้เซอร์ไพรส์"
}
```
- **Response `200 OK`**: อ็อบเจกต์เหตุการณ์ที่อัปเดตแล้ว

---

#### `DELETE /api/events/:id`
ลบเหตุการณ์ (รูปภาพภายในเหตุการณ์จะถูกปลด `event_id` ให้เป็น null โดยไม่ลบรูปภาพ)

- **Response `200 OK`**: `{ "ok": true }`

---

### 4.5 เพื่อนและบุคคล (Persons & Friends)

#### `GET /api/persons`
ดึงรายชื่อเพื่อนทั้งหมด พร้อมสถิติจำนวนรูปภาพ, จำนวนเหตุการณ์, วันที่เจอกันครั้งแรก และล่าสุด

- **Response `200 OK`**:
```json
{
  "total": 6,
  "items": [
    {
      "id": "p1",
      "name": "สมชาย ใจดี",
      "nick": "ชาย",
      "note": "เพื่อนมัธยม",
      "color": "#E56B50",
      "photo_count": 28,
      "event_count": 5,
      "first_met": 1767225600000,
      "last_met": 1795000000000
    }
  ]
}
```

---

#### `POST /api/persons`
เพิ่มบุคคลใหม่เข้าสู่ระบบ

- **Request Body**:
```json
{
  "name": "วิภาดา สุขใจ",
  "nick": "วิ",
  "note": "เพื่อนร่วมงาน",
  "color": "#4E79A7"
}
```
- **Response `201 Created`**: อ็อบเจกต์บุคคลที่สร้างขึ้นใหม่

---

#### `GET /api/persons/:id`
ดึงรายละเอียดเพื่อนคนเดียว พร้อมรูปภาพทั้งหมด และสถิติเชิงลึก

- **Response `200 OK`**: ข้อมูลเพื่อนพร้อมรายการรูปภาพที่สังกัด

---

#### `PATCH /api/persons/:id`
แก้ไขชื่อ, ชื่อเล่น, โน้ต, หรือสีประจำตัวของเพื่อน

- **Request Body**:
```json
{
  "name": "วิภาดา สุขใจ (วิ)",
  "nick": "วิ",
  "color": "#F28E2B"
}
```
- **Response `200 OK`**: ข้อมูลเพื่อนที่อัปเดตแล้ว

---

#### `DELETE /api/persons/:id`
ลบเพื่อนออกจากระบบ (ปลดแท็กบุคคลออกจากรูปภาพและคลัสเตอร์ใบหน้าโดยไม่ลบภาพ)

- **Response `200 OK`**: `{ "ok": true }`

---

### 4.6 อัลบั้มร่วมกัน X & ME (Shared Album)

#### `GET /api/persons/:id/album`
ดึงข้อมูลสำหรับหน้าอัลบั้มแห่งความทรงจำร่วมกันระหว่างผู้ใช้กับเพื่อนคนนั้น โดยจัดแบ่งเป็นบท (Chapters) ตามเหตุการณ์

- **Response `200 OK`**:
```json
{
  "person": { "id": "p1", "name": "สมชาย", "nick": "ชาย" },
  "stats": {
    "photo_count": 28,
    "event_count": 5,
    "days_known": 320,
    "first_met": 1767225600000,
    "last_met": 1795000000000
  },
  "chapters": [
    {
      "event_id": "ev_01",
      "event_name": "ไปกินข้าวสยาม",
      "place": "Siam Paragon",
      "date_str": "18 พ.ย. 2026",
      "photos": [ ... ]
    }
  ],
  "export_urls": {
    "html": "/api/persons/p1/album/export?format=html",
    "pdf": "/api/persons/p1/album/export?format=pdf"
  }
}
```

---

#### `GET /api/persons/:id/album/export`
ส่งออกอัลบั้มร่วมกันในรูปแบบไฟล์เอกสารพร้อมแชร์ให้เพื่อน

- **Query Parameters**:
  - `format` *(optional, string, default: `html`)*: `html` หรือ `pdf`
- **Response**:
  - หากเลือก `html`: ส่งไฟล์ Standalone HTML สวยงามพร้อมรูปภาพและสไตล์
  - หากเลือก `pdf`: ดาวน์โหลดเอกสาร PDF `สมชาย_and_ME.pdf`

---

### 4.7 ระบบตรวจจับและจัดกลุ่มใบหน้า (Face Recognition & Clustering)

#### `POST /api/faces`
เริ่ม Background Job ตรวจจับใบหน้าในรูปภาพทั้งหมด และจัดกลุ่มใบหน้าที่คล้ายกันเข้าเป็นกลุ่มคลัสเตอร์ (DBSCAN / Face Clustering)

- **Response `202 Accepted`**:
```json
{
  "jobId": "job_face_1732448100"
}
```

---

#### `POST /api/faces/recluster`
สั่งจัดกลุ่มคลัสเตอร์ใบหน้าใหม่โดยกำหนดเกณฑ์ความคล้าย (Threshold)

- **Request Body**:
```json
{
  "threshold": 0.55
}
```
- **Response `200 OK`**:
```json
{
  "ok": true,
  "clusters": 8,
  "updated": 130
}
```

---

#### `GET /api/faces/:id/crop`
ดึงภาพครอบตัดเฉพาะใบหน้า (Avatar Thumbnail 160x160 JPEG) พร้อมขอบเพิ่มความชัด 25%

- **Headers**: `Content-Type: image/jpeg`

---

#### `GET /api/faces/clusters`
ดึงรายการกลุ่มใบหน้าทั้งหมดที่ตรวจพบในระบบ

- **Response `200 OK`**:
```json
{
  "total": 8,
  "items": [
    {
      "id": "cluster_01",
      "face_count": 24,
      "photo_count": 18,
      "person_id": "p1",
      "person_name": "สมชาย",
      "person_color": "#E56B50",
      "sample_photo_ids": ["ph_01", "ph_04"]
    }
  ]
}
```

---

#### `GET /api/faces/clusters/:id`
ดึงภาพถ่ายและพิกัด Bounding Box ทั้งหมดที่อยู่ในคลัสเตอร์ใบหน้านี้

- **Response `200 OK`**:
```json
{
  "cluster_id": "cluster_01",
  "face_count": 24,
  "photo_count": 18,
  "members": [
    {
      "face_id": "fc_01",
      "photo_id": "ph_01",
      "bbox": { "x": 0.25, "y": 0.18, "w": 0.12, "h": 0.16 },
      "crop_url": "/api/faces/fc_01/crop"
    }
  ]
}
```

---

#### `GET /api/faces/clusters/:id/crop`
ดึงภาพ Crop ตัวแทนใบหน้าของกลุ่มคลัสเตอร์

---

#### `GET /api/persons/:id/suggestions`
ดึงรายการภาพที่มีใบหน้าต้องสงสัยว่าเป็นเพื่อนคนนี้แต่ยังไม่ได้รับการยืนยัน (Unconfirmed Face Suggestions)

- **Response `200 OK`**: รายการภาพที่ AI เสนอแนะว่าอาจเป็นเพื่อนคนนี้

---

#### `POST /api/photos/:id/confirm-face`
กดยืนยันว่าใบหน้าที่ตรวจพบในรูปนี้คือเพื่อนคนดังกล่าว (เปลี่ยนสถานะเป็น `face-confirmed`)

- **Request Body**:
```json
{
  "person_id": "p1"
}
```
- **Response `200 OK`**: `{ "ok": true, "photo_id": "ph_01", "person_id": "p1", "source": "face-confirmed" }`

---

#### `POST /api/photos/:id/dismiss-face`
ปฏิเสธข้อเสนอแนะใบหน้าในรูปภาพ

- **Request Body**:
```json
{
  "person_id": "p1"
}
```
- **Response `200 OK`**: `{ "ok": true, "dismissed": true }`

---

### 4.8 คอลเลกชันและเรื่องราว (Collections & Stories)

#### `GET /api/collections`
ดึงรายการคอลเลกชัน / เรื่องราวทั้งหมด

- **Query Parameters**:
  - `type` *(optional, string)*: กรองประเภท (`topic`, `place_project`, `custom`, `trip`)
- **Response `200 OK`**: รายการคอลเลกชันพร้อมภาพหน้าปกและช่วงเวลา

---

#### `POST /api/collections`
สร้างคอลเลกชันเรื่องราวใหม่

- **Request Body**:
```json
{
  "name": "สร้างบ้านใหม่ 2026",
  "type": "place_project",
  "note": "บันทึกความคืบหน้างานก่อสร้าง",
  "cover_photo_id": "ph_01",
  "photo_ids": ["ph_01", "ph_02"]
}
```
- **Response `201 Created`**: ข้อมูลคอลเลกชันที่สร้างใหม่

---

#### `GET /api/collections/:id`
ดึงรายละเอียดคอลเลกชันและภาพถ่ายทั้งหมดที่อยู่ในคอลเลกชัน

---

#### `PATCH /api/collections/:id`
แก้ไขชื่อ, ประเภท, บันทึกโน้ต, หรือเปลี่ยนภาพหน้าปก

---

#### `DELETE /api/collections/:id`
ลบคอลเลกชัน (รูปภาพเดิมยังคงอยู่ ไม่ถูกลบ)

---

#### `POST /api/collections/:id/photos`
เพิ่มรูปภาพเข้าสู่คอลเลกชัน

- **Request Body**:
```json
{
  "photo_ids": ["ph_03", "ph_04"],
  "added_by": "manual"
}
```

---

#### `DELETE /api/collections/:id/photos/:photoId`
นำรูปภาพออกจากคอลเลกชัน

---

### 4.9 สถานที่และโปรเจกต์ (Places & Locations)

#### `GET /api/places`
ดึงรายการสถานที่ทั้งหมดในระบบ (บ้าน, ร้านอาหาร, โปรเจกต์, ที่เที่ยว)

- **Query Parameters**:
  - `type` *(optional, string)*: `home`, `project`, `visit`, `restaurant`, `other`

---

#### `POST /api/places`
สร้างสถานที่ใหม่ พร้อมกำหนดพิกัด GPS และรัศมีทำการ (Geofence Radius)

- **Request Body**:
```json
{
  "name": "บ้านสวนชลบุรี",
  "type": "home",
  "lat": 13.3611,
  "lon": 100.9847,
  "radius_m": 150,
  "note": "บ้านพักตากอากาศ",
  "photo_ids": []
}
```

---

#### `GET /api/places/:id`
ดึงรายละเอียดสถานที่ ประวัติการมาเยือน และรูปภาพที่ถ่าย ณ สถานที่นี้

---

#### `PATCH /api/places/:id`
แก้ไขชื่อ, พิกัด, หรือรัศมีของสถานที่

---

#### `DELETE /api/places/:id`
ลบสถานที่

---

#### `POST /api/places/:id/photos`
ผูกรูปภาพเข้ากับสถานที่ด้วยตนเอง

- **Request Body**:
```json
{
  "photo_ids": ["ph_01", "ph_02"],
  "source": "manual"
}
```

---

#### `DELETE /api/places/:id/photos/:photoId`
ปลดรูปภาพออกจากสถานที่

---

### 4.10 ไดอารี่อาหาร (Meals & Food Diary)

#### `GET /api/meals`
ดึงรายการมื้ออาหารทั้งหมดที่บันทึกไว้ จัดเรียงตามเวลา

- **Query Parameters**:
  - `type` *(optional, string)*: `breakfast`, `lunch`, `dinner`, `cafe`, `other`
  - `place` *(optional, string)*: รหัสสถานที่
  - `month` *(optional, string)*: เดือน (1-12)
  - `year` *(optional, string)*: ปี (เช่น `2026`)
- **Response `200 OK`**:
```json
{
  "total": 8,
  "items": [
    {
      "id": "meal_01",
      "place_name": "ร้านส้มตำเจ๊แดง",
      "meal_type": "lunch",
      "taken_at": 1795000000000,
      "note": "ส้มตำปูปลาร้าอร่อยมาก",
      "rating": 5,
      "photo_count": 3,
      "companions": [
        { "id": "p1", "name": "สมชาย" }
      ]
    }
  ]
}
```

---

#### `POST /api/meals`
บันทึกมื้ออาหารใหม่

- **Request Body**:
```json
{
  "restaurant_name": "เจ๊แดง คาเฟ่",
  "meal_type": "cafe",
  "note": "กาแฟดริปกับเค้กส้ม",
  "rating": 5,
  "photo_ids": ["ph_05", "ph_06"]
}
```
- **Response `201 Created`**: ข้อมูลมื้ออาหารใหม่

---

#### `GET /api/meals/:id`
ดึงรายละเอียดมื้ออาหารและภาพถ่ายทั้งหมดของมื้อนั้น

---

#### `PATCH /api/meals/:id`
แก้ไขประเภทมื้ออาหาร, รีวิวโน้ต, หรือคะแนนดาว (1-5)

---

#### `DELETE /api/meals/:id`
ลบบันทึกมื้ออาหาร (รูปภาพยังคงอยู่ในระบบ ไม่ถูกลบ)

---

#### `POST /api/meals/:id/photos`
เพิ่มรูปภาพอาหารเข้าสู่มื้อที่บันทึกไว้

---

#### `DELETE /api/meals/:id/photos/:photoId`
นำรูปภาพออกจากมื้ออาหาร

---

### 4.11 สรุปความทรงจำและไฮไลต์ (Recaps & Highlights)

#### `GET /api/recaps`
ดึงประวัติการสรุปความทรงจำทั้งหมด (รายเดือน และประจำปี)

- **Query Parameters**:
  - `year` *(optional, string)*: กรองตามปี
- **Response `200 OK`**: รายการสรุปและสถานะว่าข้อมูลเก่าแล้วหรือไม่ (`stale`)

---

#### `GET /api/recaps/:year/:month`
ดึงข้อมูลสรุปความทรงจำของเดือนและปีที่ระบุ (หากยังไม่เคยสร้าง ระบบจะคำนวณและประมวลผลให้ทันทีแบบอัตโนมัติ)

- **Path Parameters**:
  - `year` *(number)*: ปี ค.ศ. (เช่น `2026`)
  - `month` *(number)*: เดือน (1-12, หรือใส่ `0` สำหรับสรุปภาพรวมตลอดทั้งปี)
- **Query Parameters**:
  - `fresh` *(optional, string)*: ใส่ `1` หากต้องการบังคับให้ระบบคำนวณใหม่แทนการอ่านแคชเดิม
- **Response `200 OK`**:
```json
{
  "id": "recap_2026_11",
  "year": 2026,
  "month": 11,
  "content": {
    "title": "ความทรงจำ พฤศจิกายน 2026",
    "facts": {
      "photo_count": 95,
      "event_count": 16,
      "friend_count": 6,
      "place_count": 5
    },
    "top_places": [ ... ],
    "highlights": [
      {
        "id": "ph_01",
        "thumb_url": "/api/thumbs/ph_01",
        "caption": "ช่วงเวลาสำคัญ"
      }
    ]
  },
  "stale": false
}
```

---

#### `POST /api/recaps`
สั่งประมวลผลสร้าง Recap ใหม่ตามปีและเดือนที่กำหนด

- **Request Body**:
```json
{
  "year": 2026,
  "month": 11,
  "format": "template"
}
```

---

#### `DELETE /api/recaps/:year/:month`
ลบแคชของบทสรุปเพื่อให้ระบบประมวลผลใหม่

---

#### `GET /api/recaps/:year/:month/export`
ส่งออกบทสรุปความทรงจำในรูปแบบต่างๆ

- **Query Parameters**:
  - `format` *(optional, string, default: `html`)*: `html`, `pdf`, หรือ `image`
- **Response**: สตรีมเอกสารตามฟอร์แมตที่เลือก พร้อมแชร์ลงโซเชียลมีเดียหรือพิมพ์ลงกระดาษ

---

### 4.12 ข้อมูลเชิงลึกและแผนที่ชีวิต (Insights & Life Map)

#### `GET /api/on-this-day`
ดึงรูปภาพ "วันนี้ในอดีต" (On This Day) ที่ถ่ายในวันและเดือนเดียวกันแต่เกิดขึ้นในปีก่อนๆ

- **Query Parameters**:
  - `date` *(optional, string)*: วันที่ในรูปแบบ `YYYY-MM-DD` (ค่าเริ่มต้นคือวันที่ปัจจุบัน)
- **Response `200 OK`**:
```json
{
  "date": "2026-11-24",
  "month_day": "11-24",
  "total_photos": 14,
  "groups": [
    {
      "year": 2025,
      "years_ago": 1,
      "photos": [ ... ],
      "events": [ ... ]
    }
  ]
}
```

---

#### `GET /api/insights/relationships`
ดึงสถิติความสัมพันธ์กับเพื่อน: เพื่อนที่เจอบ่อยที่สุดในปีนี้, เพื่อนที่ไม่ได้เจอกันนานเกินเกณฑ์ (Lapsed Friends), และวันครบรอบมิตรภาพ (Anniversaries)

- **Query Parameters**:
  - `year` *(optional, string)*: ปีเป้าหมาย (เช่น `2026`)
  - `as_of` *(optional, string)*: วันที่ใช้อ้างอิงคำนวณ (ค่าเริ่มต้นคือปัจจุบัน)
- **Response `200 OK`**:
```json
{
  "year": 2026,
  "lapsed_threshold_months": 6,
  "most_met": [
    { "id": "p1", "name": "สมชาย", "photo_count": 28, "event_count": 5 }
  ],
  "lapsed": [
    { "id": "p3", "name": "กานต์", "months_unseen": 8, "last_met": 1775000000000 }
  ],
  "anniversaries": [
    { "id": "p2", "name": "เมย์", "years": 2, "first_met_date": "2024-11-20" }
  ]
}
```

---

#### `GET /api/insights/social-graph`
ดึงกราฟความสัมพันธ์เครือข่ายเพื่อน (Social Graph) สำหรับเรนเดอร์แผนผังแบบ Force-directed Graph (Node: บุคคล, Edge: ภาพถ่ายร่วมกันหรือเหตุการณ์ร่วมกัน)

- **Response `200 OK`**:
```json
{
  "nodes": [
    { "id": "p1", "name": "สมชาย", "photo_count": 28, "color": "#E56B50" },
    { "id": "p2", "name": "เมย์", "photo_count": 19, "color": "#4E79A7" }
  ],
  "edges": [
    { "source": "p1", "target": "p2", "shared_photos_count": 12, "weight": 3 }
  ],
  "stats": {
    "total_nodes": 6,
    "total_edges": 8,
    "active_connections": 8
  }
}
```

---

#### `GET /api/map` หรือ `GET /api/map/heatmap`
ดึงข้อมูลสำหรับเรนเดอร์แผนที่ชีวิต (Personal Life Map): พิกัดคลัสเตอร์ Heatmap, สถานที่ที่ไปบ่อยที่สุด (Most-visited), และจุดกึ่งกลางแผนที่

- **Query Parameters**:
  - `year` *(optional, string)*: กรองตามปี
  - `cat` *(optional, string)*: กรองตามหมวดหมู่ (เช่น `food`, `travel`)
- **Response `200 OK`**:
```json
{
  "heatmap": [
    { "lat": 13.7469, "lon": 100.5349, "count": 28, "intensity": 1.0 }
  ],
  "most_visited": [
    { "name": "Siam Paragon", "lat": 13.746, "lon": 100.534, "photo_count": 28 }
  ],
  "events": [ ... ],
  "summary": {
    "total_gps_photos": 95,
    "unique_points": 12,
    "center": [13.7563, 100.5018]
  }
}
```

---

### 4.13 ค้นหาไฮบริดและ CLIP Embeddings (Search & Embeddings)

#### `GET /api/search`
ระบบค้นหาอัจฉริยะแบบไฮบริด (Hybrid Search) รวมการค้นหาข้อความภาษาไทย SQLite FTS5 Trigram เข้ากับการค้นหาความหมายผ่าน Semantic Vector Search (CLIP Embeddings)

- **Query Parameters**:
  - `q` *(string, required)*: คำค้นหา (เช่น `"กินส้มตำกับเพื่อน"`, `"ทะเล"`, `"วันเกิด"`)
- **Response `200 OK`**:
```json
{
  "photos": [
    {
      "id": "ph_01",
      "filename": "20261118_143000.jpg",
      "note": "ส้มตำปูปลาร้า",
      "semantic_score": 0.88,
      "thumb_url": "/api/thumbs/ph_01"
    }
  ],
  "events": [ ... ],
  "persons": [ ... ]
}
```

---

#### `POST /api/embed`
เริ่มคำนวณและบันทึกเวกเตอร์ CLIP Embeddings สำหรับรูปภาพที่ยังไม่ได้สร้างเวกเตอร์ (หรือสั่งคำนวณใหม่ทั้งหมด)

- **Request Body**:
```json
{
  "photo_ids": ["ph_01", "ph_02"],
  "force": false
}
```
- **Response `200 OK`**: `{ "jobId": "job_emb_1732448200" }`

---

#### `GET /api/embed/stats`
ตรวจสอบสถิติการสร้างเวกเตอร์ของรูปภาพในระบบ

- **Response `200 OK`**:
```json
{
  "total_photos": 95,
  "embedded_photos": 95,
  "pending": 0,
  "ml_enabled": true
}
```

---

### 4.14 กล่องข้อเสนออัตโนมัติ (Suggestions Inbox)

#### `GET /api/suggestions`
ดึงรายการข้อเสนอแนะอัจฉริยะที่ระบบตรวจพบ (เช่น รูปถ่ายที่ร้านอาหาร, กิจกรรมที่มีเพื่อนร่วมทริป, คลัสเตอร์ที่ควรตั้งชื่อ)

- **Query Parameters**:
  - `status` *(optional, string, default: `pending`)*: `pending`, `accepted`, หรือ `dismissed`
- **Response `200 OK`**:
```json
{
  "total": 15,
  "items": [
    {
      "id": "sug_01",
      "kind": "meal",
      "status": "pending",
      "created_at": 1732448000000,
      "payload": {
        "event_id": "ev_01",
        "place_name": "เจ๊แดง คาเฟ่",
        "suggested_type": "lunch",
        "photo_ids": ["ph_01", "ph_02"]
      }
    }
  ]
}
```

---

#### `POST /api/suggestions/scan`
สั่งให้ AI สแกนวิเคราะห์รูปภาพและเหตุการณ์เพื่อค้นหาข้อเสนอแนะใหม่ๆ ทันที

- **Response `200 OK`**:
```json
{
  "ok": true,
  "added": 3,
  "pending_total": 18
}
```

---

#### `POST /api/suggestions/:id/accept`
ยอมรับข้อเสนอแนะ (ระบบจะแปลงข้อเสนอให้เป็นข้อมูลจริง เช่น บันทึกลงไดอารี่อาหาร หรือสร้างสถานที่ใหม่)

- **Path Parameters**: `id` - รหัสข้อเสนอแนะ
- **Request Body**: ข้อมูลปรับปรุงเพิ่มเติมก่อนบันทึกจริง (optional)
- **Response `200 OK`**: `{ "ok": true, "accepted": true }`

---

#### `POST /api/suggestions/:id/dismiss`
ปฏิเสธและซ่อนข้อเสนอแนะนี้ออกจากกล่องข้อความ

- **Response `200 OK`**: `{ "ok": true, "dismissed": true }`

---

### 4.15 ตรวจจับโฟลเดอร์อัตโนมัติ (Watch Folder)

#### `GET /api/watch`
ตรวจสอบสถานะของระบบตรวจจับโฟลเดอร์อัตโนมัติ (Folder Watcher)

- **Response `200 OK`**:
```json
{
  "enabled": true,
  "folder": "D:/Photos/Incoming",
  "active": true
}
```

---

#### `POST /api/watch`
เปิด/ปิด หรือเปลี่ยนโฟลเดอร์ที่ต้องการให้ระบบเฝ้าดูไฟล์ใหม่

- **Request Body**:
```json
{
  "enabled": true,
  "folder": "D:/Photos/Incoming"
}
```
- **Response `200 OK`**: สถานะปัจจุบันหลังการปรับปรุง

---

#### `POST /api/watch/scan`
สั่งให้ระบบสแกนตรวจสอบไฟล์รูปภาพใหม่ในโฟลเดอร์ที่เฝ้าดูอยู่ทันทีโดยไม่ต้องรอรอบเวลา

- **Response `200 OK`**:
```json
{
  "new_photos_found": 4,
  "enabled": true,
  "folder": "D:/Photos/Incoming"
}
```

---

### 4.16 ส่งออกข้อมูลเปิดและ XMP Sidecar (Open Export & XMP)

#### `GET /api/export`
ส่งออกข้อมูลทั้งหมดของ Photostory ในฟอร์แมตมาตรฐานเปิด (No Vendor Lock-in)

- **Query Parameters**:
  - `format` *(optional, string, default: `json`)*:
    - `json`: ข้อมูลเมทาดาทาครบทุกตารางแบบสมบูรณ์
    - `csv`: ข้อมูลรูปภาพสำหรับเปิดด้วย Excel หรือ Google Sheets
    - `geojson`: ข้อมูลพิกัดภูมิศาสตร์ในรูปแบบ GeoJSON สำหรับเปิดใน QGIS / Map tools
    - `xmp`: สั่งสร้างไฟล์ Adobe XMP Sidecar
- **Response**: สตรีมไฟล์แนบดาวน์โหลดพร้อมกำหนดชื่อไฟล์ตามวันที่

---

#### `POST /api/export/xmp`
สร้างไฟล์ `.xmp` ประกบข้างไฟล์รูปภาพเดิมบนดิสก์ของผู้ใช้ (Non-destructive: เขียนไฟล์แยกข้างเคียง ไม่แก้ไขไบต์ของไฟล์ภาพเดิม) เพื่อให้โปรแกรมอย่าง Adobe Lightroom, Apple Photos, หรือ Digikam อ่านแท็กและบุคคลได้

- **Response `200 OK`**:
```json
{
  "status": "ok",
  "total_photos": 95,
  "generated_count": 95,
  "skipped_count": 0,
  "message": "เขียนไฟล์ XMP Sidecar เรียบร้อยแล้ว 95 ไฟล์ (ข้าม 0 ไฟล์ที่ไม่พบบนดิสก์)"
}
```

---

### 4.17 สำรองข้อมูลและกู้คืน (Backup & Restore)

#### `GET /api/backup`
ดาวน์โหลดไฟล์สำรองข้อมูล JSON (`story-backup-<timestamp>.json`) ที่รวมข้อมูลรูปภาพ, พิกัด, เหตุการณ์, บุคคล, ไดอารี่อาหาร และสถานที่ครบถ้วน

- **Headers**: `Content-Disposition: attachment; filename="story-backup-....json"`

---

#### `POST /api/restore`
กู้คืนข้อมูลเมทาดาทาจากไฟล์สำรองข้อมูล JSON โดยจับคู่รูปภาพเดิมผ่านแฮช `SHA-256`

- **Request Body**: ข้อมูล JSON จากการสำรองข้อมูล
- **Response `200 OK`**:
```json
{
  "ok": true,
  "matched_photos": 95,
  "persons_restored": 6,
  "events_restored": 16,
  "places_restored": 5,
  "meals_restored": 8
}
```

---

#### `POST /api/clear`
ล้างข้อมูลในฐานข้อมูล (สำหรับกรณีต้องการทดสอบหรือรีเซ็ตระบบใหม่ทั้งหมด)

- **Response `200 OK`**: `{ "ok": true, "message": "Database cleared successfully" }`

---

### 4.18 การตั้งค่าระบบ (Settings & Config)

#### `GET /api/settings`
ดึงค่าคอนฟิกทั้งหมดของระบบ (เช่น เกณฑ์เวลาจัดกลุ่ม, เกณฑ์ระยะทาง, ปีเป้าหมาย)

- **Response `200 OK`**:
```json
{
  "gap_hours": "3",
  "dist_km": "5",
  "burst_ms": "2000",
  "target_year": "2026",
  "lapsed_months": "6",
  "ml_enabled": "1"
}
```

---

#### `PATCH /api/settings`
อัปเดตการตั้งค่าระบบ *(หากมีการเปลี่ยนค่า `gap_hours`, `dist_km` หรือ `burst_ms` ระบบจะสั่ง Re-clustering อัตโนมัติทันที)*

- **Request Body**:
```json
{
  "gap_hours": "4",
  "dist_km": "10",
  "target_year": "2026"
}
```
- **Response `200 OK`**: อ็อบเจกต์การตั้งค่าทั้งหมดหลังอัปเดต

---

## 5. ตัวอย่างการเรียกใช้งาน (Code Examples)

### ตัวอย่างการดึงข้อมูลรูปภาพด้วย JavaScript `fetch`
```javascript
// ดึงภาพถ่าย 50 ภาพแรกในปี 2026 ที่มีพิกัด GPS
const res = await fetch('/api/photos?year=2026&gps=yes&limit=50');
if (res.ok) {
  const data = await res.json();
  console.log(`พบรูปภาพทั้งหมด ${data.total} ภาพ`);
  data.photos.forEach(photo => {
    console.log(`- ${photo.filename} (${new Date(photo.taken_at).toLocaleString()})`);
  });
}
```

### ตัวอย่างการส่งคำสั่ง Ingest ด้วย cURL
```bash
curl -X POST http://127.0.0.1:3000/api/import \
  -H "Content-Type: application/json" \
  -d '{"folder": "D:/Photos/2026"}'
```

---

*เอกสารฉบับนี้อัปเดตล่าสุดตามโค้ดสถาปัตยกรรม Fastify ของโครงการ เรื่องราว 2026 (Photostory)*
