// server/workers/face.ts — Face Detection, Embedding & Greedy Clustering (Phase 3, Section 8.4/9.4, AC-18)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import ort from 'onnxruntime-node';
import db, { getSettingNum } from '../db.js';
import { createJob, updateJob } from './jobs.js';
import { genId } from '../utils.js';

export const FACE_EMBED_DIM = 512;

export interface FaceBBox {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  w: number; // 0..1 normalized
  h: number; // 0..1 normalized
}

export interface DetectedFace {
  id: string;
  photo_id: string;
  bbox: FaceBBox;
  emb: Float32Array;
  cluster_id?: string;
  person_id?: string;
}

export interface FaceCluster {
  id: string;
  centroid: Float32Array;
  count: number;
  member_face_ids: string[];
  photo_ids: string[];
  representative_face_id: string;
  person_id?: string;
}

// ── Models Management ─────────────────────────────────────────
const MODELS_DIR = path.join(process.cwd(), 'data', 'models', 'faces');
const DET_MODEL_PATH = path.join(MODELS_DIR, 'det.onnx');
const REC_MODEL_PATH = path.join(MODELS_DIR, 'rec.onnx');

const DET_URL = 'https://huggingface.co/immich-app/buffalo_s/resolve/main/detection/model.onnx';
const REC_URL = 'https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx';

let detSession: ort.InferenceSession | null = null;
let recSession: ort.InferenceSession | null = null;
let modelInitPromise: Promise<{ det: ort.InferenceSession; rec: ort.InferenceSession } | null> | null = null;

async function downloadFileIfMissing(url: string, dest: string): Promise<void> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) {
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download model from ${url}: HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
}

export async function getFaceModels(): Promise<{ det: ort.InferenceSession; rec: ort.InferenceSession } | null> {
  if (detSession && recSession) {
    return { det: detSession, rec: recSession };
  }
  if (!modelInitPromise) {
    modelInitPromise = (async () => {
      try {
        await downloadFileIfMissing(DET_URL, DET_MODEL_PATH);
        await downloadFileIfMissing(REC_URL, REC_MODEL_PATH);

        detSession = await ort.InferenceSession.create(DET_MODEL_PATH, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        });
        recSession = await ort.InferenceSession.create(REC_MODEL_PATH, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        });
        return { det: detSession, rec: recSession };
      } catch (err) {
        console.warn('[faces] Failed to load InsightFace ONNX models; using fallback:', err);
        return null;
      }
    })();
  }
  return modelInitPromise;
}

// ── Math Helpers ──────────────────────────────────────────────
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export function normalizeVector(v: Float32Array | number[]): Float32Array {
  const res = new Float32Array(v.length);
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) {
    sumSq += v[i] * v[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) {
      res[i] = v[i] / norm;
    }
  }
  return res;
}

// Non-Maximum Suppression (NMS)
interface RawBox {
  score: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function nms(boxes: RawBox[], iouThreshold = 0.4): RawBox[] {
  boxes.sort((a, b) => b.score - a.score);
  const selected: RawBox[] = [];
  while (boxes.length > 0) {
    const current = boxes.shift()!;
    selected.push(current);
    boxes = boxes.filter((box) => {
      const x1 = Math.max(current.x1, box.x1);
      const y1 = Math.max(current.y1, box.y1);
      const x2 = Math.min(current.x2, box.x2);
      const y2 = Math.min(current.y2, box.y2);
      const w = Math.max(0, x2 - x1);
      const h = Math.max(0, y2 - y1);
      const inter = w * h;
      const area1 = (current.x2 - current.x1) * (current.y2 - current.y1);
      const area2 = (box.x2 - box.x1) * (box.y2 - box.y1);
      const union = area1 + area2 - inter;
      return union > 0 ? inter / union < iouThreshold : true;
    });
  }
  return selected;
}

// ── Face Detection & ArcFace Embedding for a Photo ─────────────
/**
 * Detect faces in an image file using InsightFace SCRFD and compute 512-d ArcFace embeddings.
 * Supports multiple faces per photo cleanly (1 photo -> N faces).
 */
export async function detectFacesInPhoto(photoId: string, filePath: string): Promise<DetectedFace[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const models = await getFaceModels();
    if (!models) {
      return [];
    }

    const { det, rec } = models;
    const meta = await sharp(filePath).metadata();
    const origW = meta.width || 1000;
    const origH = meta.height || 1000;

    // SCRFD expects 640x640 with black letterboxing
    const targetW = 640;
    const targetH = 640;
    const scale = Math.min(targetW / origW, targetH / origH);
    const scaledW = Math.round(origW * scale);
    const scaledH = Math.round(origH * scale);
    const padX = (targetW - scaledW) / 2;
    const padY = (targetH - scaledH) / 2;

    const { data } = await sharp(filePath)
      .resize(targetW, targetH, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Normalize CHW: (pixel - 127.5) / 128.0
    const inputData = new Float32Array(3 * targetW * targetH);
    for (let i = 0; i < targetW * targetH; i++) {
      inputData[i] = (data[i * 3] - 127.5) / 128.0;
      inputData[targetW * targetH + i] = (data[i * 3 + 1] - 127.5) / 128.0;
      inputData[2 * targetW * targetH + i] = (data[i * 3 + 2] - 127.5) / 128.0;
    }

    const tensor = new ort.Tensor('float32', inputData, [1, 3, targetH, targetW]);
    const out = await det.run({ 'input.1': tensor });

    // SCRFD strides: 8, 16, 32
    const strides = [
      { stride: 8, scoreKey: '443', bboxKey: '446' },
      { stride: 16, scoreKey: '468', bboxKey: '471' },
      { stride: 32, scoreKey: '493', bboxKey: '496' },
    ];

    const scoreThreshold = 0.5;
    const candidates: RawBox[] = [];

    for (const { stride, scoreKey, bboxKey } of strides) {
      if (!out[scoreKey] || !out[bboxKey]) continue;
      const scores = out[scoreKey].data as Float32Array;
      const bboxes = out[bboxKey].data as Float32Array;
      const featH = targetH / stride;
      const featW = targetW / stride;

      for (let y = 0; y < featH; y++) {
        for (let x = 0; x < featW; x++) {
          for (let a = 0; a < 2; a++) {
            const idx = (y * featW + x) * 2 + a;
            const score = scores[idx];
            if (score >= scoreThreshold) {
              const cx = x * stride;
              const cy = y * stride;
              const l = bboxes[idx * 4];
              const t = bboxes[idx * 4 + 1];
              const r = bboxes[idx * 4 + 2];
              const b = bboxes[idx * 4 + 3];

              const x1 = Math.max(0, (cx - l * stride - padX) / scale);
              const y1 = Math.max(0, (cy - t * stride - padY) / scale);
              const x2 = Math.min(origW, (cx + r * stride - padX) / scale);
              const y2 = Math.min(origH, (cy + b * stride - padY) / scale);

              // Minimum face dimension: at least 25 pixels
              if (x2 - x1 >= 25 && y2 - y1 >= 25) {
                candidates.push({ score, x1, y1, x2, y2 });
              }
            }
          }
        }
      }
    }

    const finalBoxes = nms(candidates);
    if (finalBoxes.length === 0) {
      return [];
    }

    const detectedFaces: DetectedFace[] = [];

    for (const box of finalBoxes) {
      const boxW = box.x2 - box.x1;
      const boxH = box.y2 - box.y1;

      // Expand margin by 10% for facial context
      const marginX = boxW * 0.1;
      const marginY = boxH * 0.1;

      const left = Math.max(0, Math.round(box.x1 - marginX));
      const top = Math.max(0, Math.round(box.y1 - marginY));
      const right = Math.min(origW, Math.round(box.x2 + marginX));
      const bottom = Math.min(origH, Math.round(box.y2 + marginY));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      try {
        const cropped = await sharp(filePath)
          .extract({ left, top, width, height })
          .resize(112, 112, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer();

        // MobileFaceNet / ArcFace input: [1, 3, 112, 112], (pixel - 127.5) / 127.5
        const recInput = new Float32Array(3 * 112 * 112);
        for (let i = 0; i < 112 * 112; i++) {
          recInput[i] = (cropped[i * 3] - 127.5) / 127.5;
          recInput[112 * 112 + i] = (cropped[i * 3 + 1] - 127.5) / 127.5;
          recInput[2 * 112 * 112 + i] = (cropped[i * 3 + 2] - 127.5) / 127.5;
        }

        const recTensor = new ort.Tensor('float32', recInput, [1, 3, 112, 112]);
        const recOut = await rec.run({ 'input.1': recTensor });
        const rawEmb = recOut['516'].data as Float32Array;

        const emb = normalizeVector(rawEmb);

        detectedFaces.push({
          id: genId(),
          photo_id: photoId,
          bbox: {
            x: Math.round((box.x1 / origW) * 1000) / 1000,
            y: Math.round((box.y1 / origH) * 1000) / 1000,
            w: Math.round((boxW / origW) * 1000) / 1000,
            h: Math.round((boxH / origH) * 1000) / 1000,
          },
          emb,
        });
      } catch (cropErr) {
        console.warn(`[faces] Failed to crop face in photo ${photoId}:`, cropErr);
      }
    }

    return detectedFaces;
  } catch (err) {
    console.warn(`[faces] Detection error on photo ${photoId}:`, err);
    return [];
  }
}

// ── Algorithm 8.4: Greedy Agglomerative Face Clustering ────────
/**
 * Clusters all detected face embeddings using greedy agglomerative clustering on cosine similarity.
 * Threshold is face_cosine from settings (default: 0.45).
 */
export function clusterFaces(threshold?: number): {
  clusters: FaceCluster[];
  updatedCount: number;
} {
  const faceCosine = threshold ?? (getSettingNum('face_cosine') || 0.45);

  const faceRows = db
    .prepare('SELECT id, photo_id, person_id, bbox, emb, cluster_id FROM faces')
    .all() as Array<{
    id: string;
    photo_id: string;
    person_id: string | null;
    bbox: string;
    emb: Buffer;
    cluster_id: string | null;
  }>;

  if (faceRows.length === 0) {
    return { clusters: [], updatedCount: 0 };
  }

  const clusters: Array<{
    id: string;
    centroid: Float32Array;
    count: number;
    member_face_ids: string[];
    photo_ids: string[];
    person_id?: string;
  }> = [];

  const faceMap = new Map<string, { cluster_id: string }>();

  for (const row of faceRows) {
    const emb = new Float32Array(row.emb.buffer, row.emb.byteOffset, row.emb.byteLength / 4);

    let bestClusterIdx = -1;
    let bestCosine = -1;

    for (let c = 0; c < clusters.length; c++) {
      const sim = cosineSimilarity(emb, clusters[c].centroid);
      if (sim > bestCosine) {
        bestCosine = sim;
        bestClusterIdx = c;
      }
    }

    if (bestClusterIdx >= 0 && bestCosine >= faceCosine) {
      // Add to existing cluster and update centroid (normalize mean of members)
      const target = clusters[bestClusterIdx];
      const newCentroid = new Float32Array(emb.length);
      for (let i = 0; i < emb.length; i++) {
        newCentroid[i] = target.centroid[i] * target.count + emb[i];
      }
      target.centroid = normalizeVector(newCentroid);
      target.count++;
      target.member_face_ids.push(row.id);
      if (!target.photo_ids.includes(row.photo_id)) {
        target.photo_ids.push(row.photo_id);
      }
      if (row.person_id && !target.person_id) {
        target.person_id = row.person_id;
      }
      faceMap.set(row.id, { cluster_id: target.id });
    } else {
      // Create new cluster
      const newClusterId = genId();
      clusters.push({
        id: newClusterId,
        centroid: normalizeVector(emb),
        count: 1,
        member_face_ids: [row.id],
        photo_ids: [row.photo_id],
        person_id: row.person_id || undefined,
      });
      faceMap.set(row.id, { cluster_id: newClusterId });
    }
  }

  // Persist updated cluster_id and propagate person_id for each face
  const updateStmt = db.prepare('UPDATE faces SET cluster_id = ?, person_id = ? WHERE id = ?');
  const insertPpStmt = db.prepare(`
    INSERT OR REPLACE INTO photo_persons (photo_id, person_id, source)
    VALUES (?, ?, 'face-confirmed')
  `);

  const updateTx = db.transaction(() => {
    let count = 0;
    const clusterById = new Map<string, (typeof clusters)[0]>();
    for (const c of clusters) {
      clusterById.set(c.id, c);
    }

    for (const [faceId, info] of faceMap.entries()) {
      const c = clusterById.get(info.cluster_id);
      const personId = c?.person_id || null;
      updateStmt.run(info.cluster_id, personId, faceId);
      count++;
    }

    // Auto-link photos of identified clusters to photo_persons
    for (const c of clusters) {
      if (c.person_id) {
        for (const pid of c.photo_ids) {
          insertPpStmt.run(pid, c.person_id);
        }
      }
    }

    return count;
  });

  const updatedCount = updateTx();

  // Pick representative face for each cluster (closest to centroid)
  const fullClusters: FaceCluster[] = clusters.map((c) => {
    let repId = c.member_face_ids[0];
    let maxSim = -1;
    for (const fid of c.member_face_ids) {
      const fRow = faceRows.find((r) => r.id === fid);
      if (fRow) {
        const emb = new Float32Array(fRow.emb.buffer, fRow.emb.byteOffset, fRow.emb.byteLength / 4);
        const sim = cosineSimilarity(emb, c.centroid);
        if (sim > maxSim) {
          maxSim = sim;
          repId = fid;
        }
      }
    }
    return {
      ...c,
      representative_face_id: repId,
    };
  });

  // Sort clusters descending so prominent recurring people come first
  clusters.sort(
    (a, b) => (b.photo_ids.length * 100 + b.count) - (a.photo_ids.length * 100 + a.count)
  );

  // Surface unnamed clusters as suggestions in suggestions inbox
  emitFaceClusterSuggestions(fullClusters);

  return { clusters: fullClusters, updatedCount };
}

// ── Emit Suggestions for Unnamed Clusters ─────────────────────
export function emitFaceClusterSuggestions(clusters: FaceCluster[]): number {
  const insertStmt = db.prepare(`
    INSERT INTO suggestions (id, kind, payload, status, created_at)
    VALUES (?, 'face_cluster', ?, 'pending', ?)
  `);

  const existingSuggestions = db
    .prepare("SELECT payload FROM suggestions WHERE kind = 'face_cluster' AND status != 'dismissed'")
    .all() as Array<{ payload: string }>;

  const activeClusterIds = new Set<string>();
  for (const row of existingSuggestions) {
    try {
      const p = JSON.parse(row.payload);
      if (p.cluster_id) activeClusterIds.add(p.cluster_id);
    } catch {}
  }

  let added = 0;
  const now = Date.now();

  const sortedClusters = [...clusters].sort(
    (a, b) => (b.photo_ids.length * 100 + b.count) - (a.photo_ids.length * 100 + a.count)
  );

  for (let idx = 0; idx < sortedClusters.length; idx++) {
    const cluster = sortedClusters[idx];
    // In larger libraries, prioritize recurring people (>= 2 faces or photos)
    if (sortedClusters.length > 5 && cluster.count < 2 && cluster.photo_ids.length < 2) {
      continue;
    }

    // Suggest naming only if cluster has no assigned person and not already suggested/dismissed
    if (!cluster.person_id && !activeClusterIds.has(cluster.id)) {
      const suggId = genId();
      const faceCount = cluster.photo_ids.length || cluster.count;
      const groupName = `เพื่อนกลุ่ม #${idx + 1}`;
      const payload = {
        title: `พบกลุ่มใบหน้า "${groupName}" (${faceCount} รูป)`,
        reason: `ตรวจพบใบหน้าบุคคลเดียวกันในรูปภาพ ${faceCount} รูป กรุณาพิมพ์ชื่อเพื่อนแล้วกดยอมรับเพื่อจัดเก็บความสัมพันธ์`,
        cluster_id: cluster.id,
        face_count: cluster.count,
        photo_count: cluster.photo_ids.length,
        photo_ids: cluster.photo_ids.slice(0, 10),
        representative_face_id: cluster.representative_face_id,
        suggested_name: groupName,
      };

      try {
        insertStmt.run(suggId, JSON.stringify(payload), now);
        added++;
      } catch (err) {
        console.warn('Failed to insert face cluster suggestion:', err);
      }
    }
  }

  return added;
}

// ── Asynchronous Background Face Job (Section 9.4 / AC-18) ─────
export async function startFaceJob(): Promise<string> {
  const job = createJob();
  const jobId = job.id;

  setImmediate(async () => {
    try {
      updateJob(jobId, { status: 'running', processed: 0, total: 100 });

      // Scan photos that have no faces recorded
      const photos = db
        .prepare(`
          SELECT p.id, p.path
          FROM photos p
          WHERE p.id NOT IN (SELECT DISTINCT photo_id FROM faces)
          ORDER BY p.taken_at ASC
        `)
        .all() as Array<{ id: string; path: string }>;

      const total = photos.length;
      let detectedCount = 0;

      const insertFaceStmt = db.prepare(`
        INSERT INTO faces (id, photo_id, bbox, emb)
        VALUES (?, ?, ?, ?)
      `);

      for (let i = 0; i < total; i++) {
        const p = photos[i];
        const photoExists = db.prepare('SELECT 1 FROM photos WHERE id = ?').get(p.id);
        if (!photoExists) continue;

        const faces = await detectFacesInPhoto(p.id, p.path);

        if (faces.length > 0) {
          const stillExists = db.prepare('SELECT 1 FROM photos WHERE id = ?').get(p.id);
          if (!stillExists) continue;

          const insertTx = db.transaction(() => {
            for (const f of faces) {
              const embBuf = Buffer.from(f.emb.buffer, f.emb.byteOffset, f.emb.byteLength);
              insertFaceStmt.run(f.id, f.photo_id, JSON.stringify(f.bbox), embBuf);
              detectedCount++;
            }
          });
          insertTx();
        }

        if ((i + 1) % 10 === 0 || i === total - 1) {
          updateJob(jobId, { processed: i + 1, total, added: detectedCount });
        }

        // Cooperative yield
        if (i % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Run greedy clustering and suggestions
      const { clusters } = clusterFaces();

      updateJob(jobId, {
        status: 'done',
        processed: total,
        total,
        added: detectedCount,
        finishedAt: Date.now(),
      });
    } catch (err: any) {
      console.error('Face job failed:', err);
      updateJob(jobId, { status: 'error', error: err?.message || String(err), finishedAt: Date.now() });
    }
  });

  return jobId;
}
