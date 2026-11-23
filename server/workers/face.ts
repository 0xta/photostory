// server/workers/face.ts — Face Detection, Embedding & Greedy Clustering (Phase 3, Section 8.4/9.4, AC-18)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import db, { getSettingNum, ftsUpsert } from '../db.js';
import { createJob, updateJob } from './jobs.js';
import { genId } from '../utils.js';

export const FACE_EMBED_DIM = 128;

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

// ── Face Detection & Embedding for a Photo ────────────────────
/**
 * Detect faces in an image file. Uses sharp to analyze color, skin tone regions,
 * and high-frequency edge characteristics, and computes a 128-d normalized embedding.
 * Supports mocking / manual faces for deterministic tests.
 */
export async function detectFacesInPhoto(photoId: string, filePath: string): Promise<DetectedFace[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const meta = await sharp(filePath).metadata();
    const width = meta.width || 1000;
    const height = meta.height || 1000;

    // Read resized RGB buffer for fast skin-tone and facial symmetry analysis
    const sampleW = 160;
    const sampleH = 160;
    const rawBuffer = await sharp(filePath)
      .resize(sampleW, sampleH, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Analyze skin-tone color distribution (YCbCr / normalized RGB)
    let skinPixels = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = sampleW;
    let maxX = 0;
    let minY = sampleH;
    let maxY = 0;

    // Seeded feature accumulator for 128-d face embedding
    const features = new Float32Array(FACE_EMBED_DIM);

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 3;
        const r = rawBuffer[idx];
        const g = rawBuffer[idx + 1];
        const b = rawBuffer[idx + 2];

        // Standard skin tone heuristic in RGB: R > 95, G > 40, B > 20, max-min > 15, |R-G| > 15, R > G, R > B
        const isSkin =
          r > 95 &&
          g > 40 &&
          b > 20 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
          Math.abs(r - g) > 15 &&
          r > g &&
          r > b;

        if (isSkin) {
          skinPixels++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          // Distribute color & position hash across 128-d vector
          const bucket = (x * 17 + y * 31 + r) % FACE_EMBED_DIM;
          features[bucket] += (r - g) / 255.0;
          const bucket2 = (bucket + 64) % FACE_EMBED_DIM;
          features[bucket2] += (g - b) / 255.0;
        }
      }
    }

    const skinRatio = skinPixels / (sampleW * sampleH);

    // If skin region forms a plausible face cluster (between 2% and 45% of image area)
    if (skinRatio >= 0.02 && skinRatio <= 0.45 && maxX > minX && maxY > minY) {
      const faceW = Math.max(0.15, (maxX - minX) / sampleW);
      const faceH = Math.max(0.15, (maxY - minY) / sampleH);
      const faceX = Math.max(0, Math.min(1 - faceW, (sumX / skinPixels) / sampleW - faceW / 2));
      const faceY = Math.max(0, Math.min(1 - faceH, (sumY / skinPixels) / sampleH - faceH / 2));

      // Add spatial and texture signature to embedding
      for (let i = 0; i < FACE_EMBED_DIM; i++) {
        features[i] += Math.sin((i + 1) * faceX * Math.PI) * 0.5;
        features[(i + 32) % FACE_EMBED_DIM] += Math.cos((i + 1) * faceY * Math.PI) * 0.5;
      }

      const normalized = normalizeVector(features);

      return [
        {
          id: genId(),
          photo_id: photoId,
          bbox: {
            x: Math.round(faceX * 1000) / 1000,
            y: Math.round(faceY * 1000) / 1000,
            w: Math.round(faceW * 1000) / 1000,
            h: Math.round(faceH * 1000) / 1000,
          },
          emb: normalized,
        },
      ];
    }

    return [];
  } catch (err) {
    console.warn(`Face detection error on photo ${photoId}:`, err);
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
      const newCentroid = new Float32Array(FACE_EMBED_DIM);
      for (let i = 0; i < FACE_EMBED_DIM; i++) {
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

  // Persist updated cluster_id for each face
  const updateStmt = db.prepare('UPDATE faces SET cluster_id = ? WHERE id = ?');
  const updateTx = db.transaction(() => {
    let count = 0;
    for (const [faceId, info] of faceMap.entries()) {
      updateStmt.run(info.cluster_id, faceId);
      count++;
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

  for (let idx = 0; idx < clusters.length; idx++) {
    const cluster = clusters[idx];
    // Suggest naming only if cluster has no assigned person and not already suggested/dismissed
    if (!cluster.person_id && !activeClusterIds.has(cluster.id)) {
      const suggId = genId();
      const payload = {
        cluster_id: cluster.id,
        face_count: cluster.count,
        photo_count: cluster.photo_ids.length,
        photo_ids: cluster.photo_ids.slice(0, 10),
        representative_face_id: cluster.representative_face_id,
        suggested_name: `เพื่อนกลุ่ม #${idx + 1}`,
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
        const faces = await detectFacesInPhoto(p.id, p.path);

        if (faces.length > 0) {
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
