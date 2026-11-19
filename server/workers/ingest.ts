// server/workers/ingest.ts — Image ingest, EXIF extraction, hashing, and thumbnail generation
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import exifr from 'exifr';
import sharp from 'sharp';
import imghash from 'imghash';
import db, { THUMBS_DIR, ftsUpsert } from '../db.js';
import { genId, parseDateFromFilename } from '../utils.js';
import { updateJob, JobState } from './jobs.js';
import { runClustering } from './cluster.js';

const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Recursively scan directory for supported image files
 */
export function scanDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        fileList.push(path.resolve(fullPath));
      }
    }
  }

  return fileList;
}

/**
 * Compute SHA-256 hash of a file
 */
export function computeSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Ingest process for a list of file paths
 */
export async function processIngest(jobId: string, filePaths: string[]): Promise<void> {
  updateJob(jobId, { total: filePaths.length, status: 'running' });

  const checkShaStmt = db.prepare('SELECT id, path FROM photos WHERE sha256 = ?');
  const updatePathStmt = db.prepare('UPDATE photos SET path = ?, missing_file = 0 WHERE id = ?');
  const insertPhotoStmt = db.prepare(`
    INSERT INTO photos (
      id, path, filename, sha256, phash, taken_at, lat, lon, w, h, size, event_id, note, burst, added_at, missing_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', 0, ?, 0)
  `);

  let added = 0;
  let skippedDup = 0;
  let skippedUnreadable = 0;
  let dateless = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const filename = path.basename(filePath);

    updateJob(jobId, {
      processed: i + 1,
      current: filename,
      added,
      skippedDup,
      skippedUnreadable,
      dateless,
    });

    // Yield event loop every 25 files to keep Fastify responsive
    if (i % 25 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    try {
      if (!fs.existsSync(filePath)) {
        skippedUnreadable++;
        continue;
      }

      const stat = fs.statSync(filePath);
      const sha256 = computeSha256(filePath);

      // Check exact duplicate (FR-104 / Decision D8)
      const existing = checkShaStmt.get(sha256) as { id: string; path: string } | undefined;
      if (existing) {
        if (existing.path !== filePath) {
          updatePathStmt.run(filePath, existing.id);
        }
        skippedDup++;
        continue;
      }

      // Read EXIF with fallback chain (FR-103)
      let takenAt: number | null = null;
      let lat: number | null = null;
      let lon: number | null = null;

      try {
        const exifData = await exifr.parse(filePath, {
          gps: true,
          tiff: true,
          xmp: true,
        });

        if (exifData) {
          const rawDate =
            exifData.DateTimeOriginal ||
            exifData.CreateDate ||
            exifData.ModifyDate;

          if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
            takenAt = rawDate.getTime();
          } else if (typeof rawDate === 'string') {
            const parsed = new Date(rawDate);
            if (!isNaN(parsed.getTime())) {
              takenAt = parsed.getTime();
            }
          }

          if (
            typeof exifData.latitude === 'number' &&
            !isNaN(exifData.latitude) &&
            typeof exifData.longitude === 'number' &&
            !isNaN(exifData.longitude)
          ) {
            lat = exifData.latitude;
            lon = exifData.longitude;
          }
        }
      } catch {
        // EXIF read failed; fallback below
      }

      // Filename date pattern fallback (FR-103)
      if (takenAt == null) {
        takenAt = parseDateFromFilename(filename);
      }

      if (takenAt == null) {
        dateless++;
      }

      // Get image dimensions & generate thumbnail (FR-105)
      const photoId = genId();
      const thumbPath = path.join(THUMBS_DIR, `${photoId}.jpg`);

      const sharpInstance = sharp(filePath);
      const meta = await sharpInstance.metadata();
      const w = meta.width ?? null;
      const h = meta.height ?? null;

      await sharp(filePath)
        .rotate() // auto-orient based on EXIF orientation
        .resize(560, 560, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toFile(thumbPath);

      // Compute perceptual hash (pHash)
      let pHashValue: string | null = null;
      try {
        pHashValue = await imghash.hash(thumbPath);
      } catch {
        // pHash computation fallback if imghash fails on particular format
      }

      // Save to database
      insertPhotoStmt.run(
        photoId,
        filePath,
        filename,
        sha256,
        pHashValue,
        takenAt,
        lat,
        lon,
        w,
        h,
        stat.size,
        Date.now()
      );

      // Add to FTS
      ftsUpsert('photo', photoId, filename);

      added++;
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
      skippedUnreadable++;
    }
  }

  // Auto-run clustering after ingest finishes (FR-108)
  try {
    runClustering();
  } catch (clusterErr) {
    console.error('Error during auto-clustering after ingest:', clusterErr);
  }

  updateJob(jobId, {
    status: 'done',
    processed: filePaths.length,
    added,
    skippedDup,
    skippedUnreadable,
    dateless,
    finishedAt: Date.now(),
  });
}
