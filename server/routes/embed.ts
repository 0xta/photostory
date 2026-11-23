// server/routes/embed.ts — CLIP Embeddings API (Phase 2)
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';
import { startEmbedJob, isMlEnabled } from '../workers/embed.js';

export const embedRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/embed (FR-603 / Section 7)
  app.post<{ Body: { photo_ids?: string[]; force?: boolean } }>('/api/embed', async (req) => {
    const { photo_ids, force } = req.body || {};
    let targets = photo_ids;
    if (force) {
      const all = db.prepare('SELECT id FROM photos').all() as Array<{ id: string }>;
      targets = all.map((p) => p.id);
    }
    const { jobId } = startEmbedJob(targets);
    return { jobId };
  });

  // GET /api/embed/stats
  app.get('/api/embed/stats', async () => {
    const totalPhotos = (
      db.prepare('SELECT COUNT(*) as c FROM photos').get() as { c: number }
    ).c;

    let embeddedPhotos = 0;
    try {
      embeddedPhotos = (
        db.prepare('SELECT COUNT(*) as c FROM photo_vec').get() as { c: number }
      ).c;
    } catch {}

    return {
      total_photos: totalPhotos,
      embedded_photos: embeddedPhotos,
      pending: Math.max(0, totalPhotos - embeddedPhotos),
      ml_enabled: isMlEnabled(),
    };
  });
};
