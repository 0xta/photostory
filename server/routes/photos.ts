// server/routes/photos.ts — Photos list and detail
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';

export const photosRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/photos
  app.get<{
    Querystring: {
      event?: string;
      burst?: string;
      gps?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/photos', async (req) => {
    const { event, burst, gps, limit = '100', offset = '0' } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (event) {
      conditions.push('p.event_id = ?');
      params.push(event);
    }

    if (burst === '1') {
      conditions.push('p.burst = 1');
    }

    if (gps === 'yes') {
      conditions.push('p.lat IS NOT NULL');
    } else if (gps === 'no') {
      conditions.push('p.lat IS NULL AND p.taken_at IS NOT NULL');
    } else if (gps === 'nodate') {
      conditions.push('p.taken_at IS NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db
      .prepare(`SELECT COUNT(*) as c FROM photos p ${whereClause}`)
      .get(...params) as { c: number };

    const items = db
      .prepare(`
        SELECT
          p.id, p.path, p.filename, p.taken_at, p.lat, p.lon, p.w, p.h, p.size,
          p.event_id, p.note, p.burst, p.missing_file
        FROM photos p
        ${whereClause}
        ORDER BY (CASE WHEN p.taken_at IS NULL THEN 1 ELSE 0 END), p.taken_at ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, Number(limit), Number(offset));

    return { total: countRow.c, items };
  });

  // GET /api/photos/:id
  app.get<{ Params: { id: string } }>('/api/photos/:id', async (req, reply) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as any;
    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }
    const cats = (
      db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?').all(photo.id) as Array<{ cat: string }>
    ).map((r) => r.cat);
    return { ...photo, cats };
  });
};
