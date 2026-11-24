// server/routes/faces.ts — Face Detection, Clustering & Confirmation API (Phase 3, Section 7/9.4, AC-18)
import fs from 'node:fs';
import { FastifyPluginAsync } from 'fastify';
import sharp from 'sharp';
import db from '../db.js';
import { startFaceJob, clusterFaces } from '../workers/face.js';

export const facesRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/faces — start face detect + cluster job (Section 7)
  app.post('/api/faces', async () => {
    const jobId = await startFaceJob();
    return { jobId };
  });

  // POST /api/faces/recluster — trigger re-clustering
  app.post<{ Body?: { threshold?: number } }>('/api/faces/recluster', async (req) => {
    const threshold = req.body?.threshold;
    const res = clusterFaces(threshold);
    return { ok: true, clusters: res.clusters, updated: res.updatedCount };
  });

  // GET /api/faces/:id/crop — cropped avatar thumbnail of a specific face
  app.get<{ Params: { id: string } }>('/api/faces/:id/crop', async (req, reply) => {
    const face = db
      .prepare(`
        SELECT f.id, f.bbox, p.path
        FROM faces f
        JOIN photos p ON f.photo_id = p.id
        WHERE f.id = ?
      `)
      .get(req.params.id) as { id: string; bbox: string; path: string } | undefined;

    if (!face || !fs.existsSync(face.path)) {
      return reply.status(404).send({ error: 'Face or photo file not found' });
    }

    try {
      const bbox = JSON.parse(face.bbox || '{}');
      const meta = await sharp(face.path).metadata();
      const origW = meta.width || 1000;
      const origH = meta.height || 1000;

      // Add 25% margin around face for hair/chin/context
      const marginX = (bbox.w || 0.1) * 0.25;
      const marginY = (bbox.h || 0.1) * 0.25;
      const left = Math.max(0, Math.round(((bbox.x || 0) - marginX) * origW));
      const top = Math.max(0, Math.round(((bbox.y || 0) - marginY) * origH));
      const width = Math.min(origW - left, Math.round(((bbox.w || 0.1) + marginX * 2) * origW));
      const height = Math.min(origH - top, Math.round(((bbox.h || 0.1) + marginY * 2) * origH));

      const buf = await sharp(face.path)
        .extract({ left, top, width: Math.max(15, width), height: Math.max(15, height) })
        .resize(160, 160, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toBuffer();

      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.type('image/jpeg').send(buf);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to crop face' });
    }
  });

  // GET /api/faces/clusters/:id — inspect a face cluster with all member photos and bounding boxes
  app.get<{ Params: { id: string } }>('/api/faces/clusters/:id', async (req, reply) => {
    const clusterId = req.params.id;
    const faces = db
      .prepare(`
        SELECT
          f.id as face_id,
          f.photo_id,
          f.bbox,
          p.filename,
          p.taken_at
        FROM faces f
        JOIN photos p ON f.photo_id = p.id
        WHERE f.cluster_id = ?
        ORDER BY p.taken_at ASC
      `)
      .all(clusterId) as any[];

    if (faces.length === 0) {
      return reply.status(404).send({ error: 'Cluster not found' });
    }

    const members = faces.map((f) => {
      let parsedBbox = { x: 0, y: 0, w: 0, h: 0 };
      try {
        parsedBbox = JSON.parse(f.bbox);
      } catch {}

      return {
        face_id: f.face_id,
        photo_id: f.photo_id,
        filename: f.filename,
        taken_at: f.taken_at,
        bbox: parsedBbox,
        crop_url: `/api/faces/${f.face_id}/crop`,
        thumb_url: `/api/thumbs/${f.photo_id}`,
      };
    });

    return {
      cluster_id: clusterId,
      face_count: faces.length,
      photo_count: new Set(faces.map((f) => f.photo_id)).size,
      members,
    };
  });

  // GET /api/faces/clusters/:id/crop — representative face crop avatar of a cluster
  app.get<{ Params: { id: string } }>('/api/faces/clusters/:id/crop', async (req, reply) => {
    const clusterId = req.params.id;
    const face = db
      .prepare(`
        SELECT f.id
        FROM faces f
        WHERE f.cluster_id = ?
        LIMIT 1
      `)
      .get(clusterId) as { id: string } | undefined;

    if (!face) {
      return reply.status(404).send({ error: 'No faces found in cluster' });
    }
    return reply.redirect(`/api/faces/${face.id}/crop`);
  });

  // GET /api/faces/clusters — list all clusters
  app.get('/api/faces/clusters', async () => {
    const clusters = db
      .prepare(`
        SELECT
          f.cluster_id as id,
          COUNT(f.id) as face_count,
          COUNT(DISTINCT f.photo_id) as photo_count,
          f.person_id,
          p.name as person_name,
          p.color as person_color,
          GROUP_CONCAT(DISTINCT f.photo_id) as sample_photo_ids
        FROM faces f
        LEFT JOIN persons p ON f.person_id = p.id
        WHERE f.cluster_id IS NOT NULL
        GROUP BY f.cluster_id
        ORDER BY face_count DESC
      `)
      .all() as any[];

    const items = clusters.map((c) => ({
      ...c,
      sample_photo_ids: c.sample_photo_ids ? c.sample_photo_ids.split(',').slice(0, 5) : [],
    }));

    return { total: items.length, items };
  });

  // GET /api/persons/:id/suggestions — unconfirmed face-suggestion chips (Section 7)
  app.get<{ Params: { id: string } }>('/api/persons/:id/suggestions', async (req, reply) => {
    const person = db.prepare('SELECT id, name FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    const unconfirmed = db
      .prepare(`
        SELECT
          p.id as photo_id, p.filename, p.taken_at,
          pp.source,
          f.bbox
        FROM photo_persons pp
        JOIN photos p ON pp.photo_id = p.id
        LEFT JOIN faces f ON f.photo_id = p.id AND f.person_id = pp.person_id
        WHERE pp.person_id = ? AND pp.source = 'face-suggestion'
        ORDER BY p.taken_at ASC
      `)
      .all(person.id);

    return { person, suggestions: unconfirmed };
  });

  // POST /api/photos/:id/confirm-face — accept a suggestion (Section 7 / AC-18)
  app.post<{
    Params: { id: string };
    Body: { person_id: string };
  }>('/api/photos/:id/confirm-face', async (req, reply) => {
    const { person_id } = req.body || {};
    if (!person_id) {
      return reply.status(400).send({ error: 'person_id is required' });
    }

    const photoId = req.params.id;

    // Confirm face suggestion -> source becomes 'face-confirmed' (FR-506 / AC-18)
    db.prepare(`
      INSERT OR REPLACE INTO photo_persons (photo_id, person_id, source)
      VALUES (?, ?, 'face-confirmed')
    `).run(photoId, person_id);

    // Update faces table person_id
    db.prepare(`
      UPDATE faces SET person_id = ? WHERE photo_id = ?
    `).run(person_id, photoId);

    return { ok: true, photo_id: photoId, person_id, source: 'face-confirmed' };
  });

  // POST /api/photos/:id/dismiss-face — dismiss an unconfirmed face suggestion (Section 7 / AC-18)
  app.post<{
    Params: { id: string };
    Body: { person_id: string };
  }>('/api/photos/:id/dismiss-face', async (req, reply) => {
    const { person_id } = req.body || {};
    if (!person_id) {
      return reply.status(400).send({ error: 'person_id is required' });
    }

    const photoId = req.params.id;

    // Delete unconfirmed suggestion from photo_persons (leaves confirmed / manual intact)
    db.prepare(`
      DELETE FROM photo_persons
      WHERE photo_id = ? AND person_id = ? AND source = 'face-suggestion'
    `).run(photoId, person_id);

    return { ok: true, dismissed: true, photo_id: photoId, person_id };
  });
};
