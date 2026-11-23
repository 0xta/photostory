// server/routes/faces.ts — Face Detection, Clustering & Confirmation API (Phase 3, Section 7/9.4, AC-18)
import { FastifyPluginAsync } from 'fastify';
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
    const res = db
      .prepare(`
        INSERT OR REPLACE INTO photo_persons (photo_id, person_id, source)
        VALUES (?, ?, 'face-confirmed')
      `)
      .run(photoId, person_id);

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
