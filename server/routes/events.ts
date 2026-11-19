// server/routes/events.ts — Events list and detail
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';
import { autoEventName } from '../utils.js';

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/events
  app.get('/api/events', async () => {
    const events = db
      .prepare(`
        SELECT
          e.id, e.name, e.place, e.note, e.ts_start, e.ts_end, e.lat, e.lon, e.named,
          (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) as photo_count,
          (SELECT COUNT(DISTINCT pp.person_id) FROM photos p JOIN photo_persons pp ON p.id = pp.photo_id WHERE p.event_id = e.id) as friend_count
        FROM events e
        ORDER BY e.ts_start ASC
      `)
      .all() as any[];

    // Add cover thumbnails and default display name
    const getCoversStmt = db.prepare(
      'SELECT id FROM photos WHERE event_id = ? ORDER BY taken_at ASC LIMIT 4'
    );

    const items = events.map((ev, index) => {
      const covers = (getCoversStmt.all(ev.id) as Array<{ id: string }>).map((c) => c.id);
      const displayName = ev.name && ev.name.trim() !== ''
        ? ev.name
        : (ev.ts_start ? autoEventName(index + 1, ev.ts_start) : `ช่วงที่ ${index + 1}`);

      return {
        ...ev,
        displayName,
        cover_ids: covers,
      };
    });

    return { total: items.length, items };
  });

  // GET /api/events/:id
  app.get<{ Params: { id: string } }>('/api/events/:id', async (req, reply) => {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!ev) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const photos = db
      .prepare('SELECT id, filename, taken_at, lat, lon, burst, note FROM photos WHERE event_id = ? ORDER BY taken_at ASC')
      .all(ev.id);

    return { ...ev, photos };
  });
};
