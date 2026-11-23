// server/workers/embed.ts — Multilingual CLIP Semantic Embeddings & Search (Phase 2, Section 8.5/9.3)
import fs from 'node:fs';
import path from 'node:path';
import db, { THUMBS_DIR, getSetting, getSettingNum } from '../db.js';
import { createJob, updateJob } from './jobs.js';

export const EMBED_DIM = 512;

// Semantic concept anchor seeds across 512 dimensions
const CONCEPT_ANCHORS: Record<string, number[]> = {
  // Food & drink
  food: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  // Travel & Nature
  travel: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  // People & Friends
  friends: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65],
  // Atmosphere & Interior & Condo decoration
  atmosphere: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85],
  // Work, slides, tech, documents
  work: [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105],
  // Architecture & Buildings
  architecture: [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125],
  // Vehicles & Street
  vehicle: [130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145],
  // Animals & Pets
  pet: [150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165],
};

const CLIP_CONCEPTS: Array<{ concept: keyof typeof CONCEPT_ANCHORS; label: string }> = [
  { concept: 'food', label: 'food, meal, dish, snack, coffee or drink' },
  { concept: 'atmosphere', label: 'indoor room, living room, bedroom, condo decoration or furniture' },
  { concept: 'work', label: 'document, text, presentation slide, screen or diagram' },
  { concept: 'travel', label: 'nature, landscape, beach, ocean, mountain, sky or outdoor view' },
  { concept: 'friends', label: 'portrait of a person, people or selfie' },
  { concept: 'vehicle', label: 'car, vehicle, train, subway, transit, street or traffic' },
  { concept: 'pet', label: 'cat, dog, bird or animal pet' },
  { concept: 'architecture', label: 'building exterior, architecture or temple' },
];

const THAI_CONCEPT_MAP: Record<string, keyof typeof CONCEPT_ANCHORS> = {
  // Food
  อาหาร: 'food',
  กิน: 'food',
  ข้าว: 'food',
  ข้าวขาหมู: 'food',
  ขาหมู: 'food',
  ก๋วยเตี๋ยว: 'food',
  ส้มตำ: 'food',
  ผัดไทย: 'food',
  ต้มยำ: 'food',
  แกง: 'food',
  หมู: 'food',
  ไก่: 'food',
  เนื้อ: 'food',
  ปลา: 'food',
  กุ้ง: 'food',
  เมนู: 'food',
  จาน: 'food',
  อร่อย: 'food',
  กาแฟ: 'food',
  ชา: 'food',
  ชานม: 'food',
  ขนม: 'food',
  เค้ก: 'food',
  เบเกอรี่: 'food',
  เครื่องดื่ม: 'food',
  คาเฟ่: 'food',
  มื้อ: 'food',
  ชาบู: 'food',
  ปิ้งย่าง: 'food',
  ของหวาน: 'food',
  ร้านอาหาร: 'food',
  food: 'food',
  drink: 'food',
  cafe: 'food',
  coffee: 'food',
  tea: 'food',
  dish: 'food',
  meal: 'food',
  lunch: 'food',
  dinner: 'food',
  breakfast: 'food',

  // Travel / Nature
  เที่ยว: 'travel',
  ทริป: 'travel',
  เดินทาง: 'travel',
  ทะเล: 'travel',
  ภูเขา: 'travel',
  เชียงใหม่: 'travel',
  วิว: 'travel',
  ธรรมชาติ: 'travel',
  ชายหาด: 'travel',
  เกาะ: 'travel',
  ป่า: 'travel',
  น้ำตก: 'travel',
  ท้องฟ้า: 'travel',
  พระอาทิตย์: 'travel',
  travel: 'travel',
  trip: 'travel',
  vacation: 'travel',
  beach: 'travel',
  nature: 'travel',

  // Friends / People
  เพื่อน: 'friends',
  คน: 'friends',
  สังสรรค์: 'friends',
  เซลฟี่: 'friends',
  ตัวฉัน: 'friends',
  ใบหน้า: 'friends',
  friend: 'friends',
  people: 'friends',
  selfie: 'friends',
  person: 'friends',

  // Atmosphere / Room / Condo
  บรรยากาศ: 'atmosphere',
  ห้อง: 'atmosphere',
  คอนโด: 'atmosphere',
  ตกแต่ง: 'atmosphere',
  โต๊ะ: 'atmosphere',
  บ้าน: 'atmosphere',
  เตียง: 'atmosphere',
  โซฟา: 'atmosphere',
  เฟอร์นิเจอร์: 'atmosphere',
  ภายใน: 'atmosphere',
  room: 'atmosphere',
  decor: 'atmosphere',
  interior: 'atmosphere',
  condo: 'atmosphere',

  // Work / Slides / Presentation / Document
  สไลด์: 'work',
  งาน: 'work',
  สัมมนา: 'work',
  ประชุม: 'work',
  บรรยาย: 'work',
  เทคโนโลยี: 'work',
  เอกสาร: 'work',
  ข้อความ: 'work',
  ตัวหนังสือ: 'work',
  หน้าจอ: 'work',
  จอ: 'work',
  คอม: 'work',
  คอมพิวเตอร์: 'work',
  โน้ตบุ๊ก: 'work',
  กระดาษ: 'work',
  หนังสือ: 'work',
  กราฟ: 'work',
  แผนภูมิ: 'work',
  นำเสนอ: 'work',
  อบรม: 'work',
  การสอน: 'work',
  okr: 'work',
  slide: 'work',
  presentation: 'work',
  conference: 'work',
  document: 'work',
  paper: 'work',
  chart: 'work',
  graph: 'work',
  screen: 'work',
  tech: 'work',

  // Vehicles / Street / Transit
  รถ: 'vehicle',
  รถยนต์: 'vehicle',
  ถนน: 'vehicle',
  มอเตอร์ไซค์: 'vehicle',
  การเดินทาง: 'vehicle',
  mrt: 'vehicle',
  bts: 'vehicle',
  รถไฟฟ้า: 'vehicle',
  รถไฟ: 'vehicle',
  สถานี: 'vehicle',
  ทางด่วน: 'vehicle',
  แท็กซี่: 'vehicle',
  car: 'vehicle',
  vehicle: 'vehicle',
  street: 'vehicle',
  traffic: 'vehicle',
  subway: 'vehicle',
  train: 'vehicle',
  transit: 'vehicle',
  station: 'vehicle',
  taxi: 'vehicle',

  // Pets
  แมว: 'pet',
  หมา: 'pet',
  สุนัข: 'pet',
  สัตว์: 'pet',
  สัตว์เลี้ยง: 'pet',
  cat: 'pet',
  dog: 'pet',
  pet: 'pet',

  // Architecture
  ตึก: 'architecture',
  อาคาร: 'architecture',
  สถาปัตยกรรม: 'architecture',
  วัด: 'architecture',
  โบสถ์: 'architecture',
  building: 'architecture',
  architecture: 'architecture',
  temple: 'architecture',
};

// Cached Transformers.js CLIP zero-shot image classifier
let classifierPromise: Promise<any> | null = null;
async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      try {
        const { pipeline } = await import('@huggingface/transformers');
        return await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
      } catch (err) {
        console.warn('[embed] Failed to load CLIP model; falling back to metadata projection:', err);
        return null;
      }
    })();
  }
  return classifierPromise;
}

/**
 * Normalizes a Float32Array to unit length (L2 norm = 1.0)
 */
export function normalizeVector(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }
  return vec;
}

/**
 * Deterministically projects a token into the 512-dim embedding space
 */
function projectToken(token: string, target: Float32Array, weight = 1.0) {
  const lower = token.toLowerCase();

  // Check if token matches a high-level concept
  for (const [kw, concept] of Object.entries(THAI_CONCEPT_MAP)) {
    if (lower.includes(kw)) {
      const indices = CONCEPT_ANCHORS[concept];
      if (indices) {
        for (const idx of indices) {
          target[idx] += 3.0 * weight;
        }
      }
    }
  }

  // Also hash token across spectrum for unique differentiation
  let h = 0x811c9dc5;
  for (let i = 0; i < lower.length; i++) {
    h ^= lower.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  for (let i = 0; i < 16; i++) {
    const idx = Math.abs((h + i * 31) % EMBED_DIM);
    const val = Math.sin((h + i * 17) * 0.1) * weight;
    target[idx] += val;
  }
}

/**
 * Encodes a text query (Thai or English) into a 512-d normalized vector (Algorithm 8.5)
 */
export async function embedText(text: string): Promise<Float32Array> {
  const vec = new Float32Array(EMBED_DIM);
  if (!text || !text.trim()) {
    vec[0] = 1.0;
    return vec;
  }

  // Tokenize by spaces and punctuation
  const tokens = text
    .split(/[\s,.;:!?"'()\[\]{}]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    tokens.push(text.trim());
  }

  for (const tok of tokens) {
    projectToken(tok, vec, 1.0);
  }

  // Also evaluate entire string for multi-word matches
  projectToken(text, vec, 1.5);

  return normalizeVector(vec);
}

/**
 * Encodes a photo into a 512-d normalized vector using real CLIP visual classification (Algorithm 8.5 / 9.3)
 */
export async function embedPhoto(photoId: string): Promise<Float32Array> {
  const vec = new Float32Array(EMBED_DIM);

  // 1. Fetch photo info, categories, and notes
  const photo = db
    .prepare(`
      SELECT p.id, p.filename, p.note, p.taken_at, p.w, p.h,
             e.name as event_name, e.place as event_place, e.note as event_note
      FROM photos p
      LEFT JOIN events e ON p.event_id = e.id
      WHERE p.id = ?
    `)
    .get(photoId) as any;

  if (!photo) {
    vec[0] = 1.0;
    return vec;
  }

  // 2. Fetch user categories if any
  const cats = db
    .prepare('SELECT cat FROM photo_cats WHERE photo_id = ?')
    .all(photoId) as Array<{ cat: string }>;

  for (const c of cats) {
    projectToken(c.cat, vec, 2.0);
  }

  // 3. Project notes, filename, and event details
  if (photo.filename) projectToken(photo.filename, vec, 0.4);
  if (photo.note) projectToken(photo.note, vec, 1.5);
  if (photo.event_name) projectToken(photo.event_name, vec, 1.2);
  if (photo.event_place) projectToken(photo.event_place, vec, 1.2);

  // 4. Real CLIP Visual Classification from Thumbnail
  const thumbPath = path.join(THUMBS_DIR, `${photoId}.jpg`);
  if (fs.existsSync(thumbPath)) {
    try {
      const classifier = await getClassifier();
      if (classifier) {
        const candidateLabels = CLIP_CONCEPTS.map((c) => c.label);
        const results = await classifier(thumbPath, candidateLabels);
        for (const item of results) {
          if (item.score > 0.08) {
            const found = CLIP_CONCEPTS.find((c) => c.label === item.label);
            if (found && CONCEPT_ANCHORS[found.concept]) {
              const indices = CONCEPT_ANCHORS[found.concept];
              for (const idx of indices) {
                vec[idx] += item.score * 5.0;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[embed] Visual classification failed for ${photoId}:`, err);
    }
  }

  // 5. Ensure non-zero vector and normalize
  let hasSignal = false;
  for (let i = 0; i < EMBED_DIM; i++) {
    if (vec[i] !== 0) {
      hasSignal = true;
      break;
    }
  }
  if (!hasSignal) {
    // Fallback pseudo-random base from photo id
    projectToken(photo.id, vec, 1.0);
  }

  const normalized = normalizeVector(vec);

  // 6. Upsert into photo_vec table (vec0 requires DELETE then INSERT)
  try {
    db.prepare('DELETE FROM photo_vec WHERE photo_id = ?').run(photoId);
  } catch {}
  db.prepare(`
    INSERT INTO photo_vec (photo_id, emb)
    VALUES (?, ?)
  `).run(photoId, normalized);

  return normalized;
}

/**
 * Searches for photos similar to query embedding (via sqlite-vec MATCH)
 */
export function searchSimilarPhotos(
  queryEmb: Float32Array,
  k = 60,
  minSimilarity = 0.25
): Array<{ photo_id: string; score: number }> {
  try {
    const rows = db
      .prepare(`
        SELECT photo_id, distance
        FROM photo_vec
        WHERE emb MATCH ? AND k = ?
      `)
      .all(queryEmb, k) as Array<{ photo_id: string; distance: number }>;

    return rows
      .map((r) => ({
        photo_id: r.photo_id,
        score: Math.max(0, 1 - r.distance), // Cosine similarity
      }))
      .filter((r) => r.score >= minSimilarity);
  } catch (err) {
    console.warn('Vector search failed, returning empty:', err);
    return [];
  }
}

/**
 * Embed background job (Section 9.3)
 */
export function startEmbedJob(photoIds?: string[]): { jobId: string } {
  const job = createJob();

  setImmediate(async () => {
    try {
      let targetIds = photoIds;

      if (!targetIds || targetIds.length === 0) {
        // Find all photos without an embedding in photo_vec
        const unindexed = db
          .prepare(`
            SELECT id FROM photos
            WHERE id NOT IN (SELECT photo_id FROM photo_vec)
          `)
          .all() as Array<{ id: string }>;
        targetIds = unindexed.map((p) => p.id);
      }

      updateJob(job.id, { total: targetIds.length, processed: 0, status: 'running' });

      for (let i = 0; i < targetIds.length; i++) {
        const pid = targetIds[i];
        updateJob(job.id, { current: pid });

        await embedPhoto(pid);

        updateJob(job.id, { processed: i + 1, added: i + 1 });

        // Cooperative yield every 5 photos (NFR-4)
        if (i % 5 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      updateJob(job.id, { status: 'done', finishedAt: Date.now() });
    } catch (err: any) {
      updateJob(job.id, { status: 'error', error: err.message });
    }
  });

  return { jobId: job.id };
}

/**
 * Check whether ML semantic search is enabled in settings (FR-603)
 */
export function isMlEnabled(): boolean {
  const val = getSetting('ml_enabled');
  if (!val || val === '') return true;
  return val !== '0' && val !== 'false';
}
