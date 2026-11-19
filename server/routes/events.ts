// server/routes/events.ts — Events list, detail, and update
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert } from '../db.js';
import { autoEventName } from '../utils.js';

interface UpdateEventBody {
  name?: string;
  place?: string;
  note?: string;
}

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/events
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/api/events', async (req) => {
    const { limit = '100', offset = '0' } = req.query;

    const countRow = db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number };

    const events = db
      .prepare(`
        SELECT
          e.id, e.name, e.place, e.note, e.ts_start, e.ts_end, e.lat, e.lon, e.named,
          (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) as photo_count,
          (SELECT COUNT(DISTINCT pp.person_id) FROM photos p JOIN photo_persons pp ON p.id = pp.photo_id WHERE p.event_id = e.id) as friend_count
        FROM events e
        ORDER BY e.ts_start ASC
        LIMIT ? OFFSET ?
      `)
      .all(Number(limit), Number(offset)) as any[];

    // Add cover thumbnails and default display name
    const getCoversStmt = db.prepare(
      'SELECT id FROM photos WHERE event_id = ? ORDER BY taken_at ASC LIMIT 4'
    );

    const items = events.map((ev, index) => {
      const covers = (getCoversStmt.all(ev.id) as Array<{ id: string }>).map((c) => c.id);
      const displayName =
        ev.name && ev.name.trim() !== ''
          ? ev.name
          : ev.ts_start
          ? autoEventName(index + 1, ev.ts_start)
          : `ช่วงที่ ${index + 1}`;

      return {
        ...ev,
        displayName,
        cover_ids: covers,
      };
    });

    return { total: countRow.c, items };
  });

  // GET /api/events/:id
  app.get<{ Params: { id: string } }>('/api/events/:id', async (req, reply) => {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!ev) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const photos = db
      .prepare(
        'SELECT id, filename, taken_at, lat, lon, burst, note FROM photos WHERE event_id = ? ORDER BY taken_at ASC'
      )
      .all(ev.id) as any[];

    const getCatsStmt = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?');
    for (const p of photos) {
      p.cats = (getCatsStmt.all(p.id) as Array<{ cat: string }>).map((c) => c.cat);
    }

    const friends = db
      .prepare(`
        SELECT DISTINCT pr.id, pr.name, pr.nick, pr.color
        FROM photos p
        JOIN photo_persons pp ON p.id = pp.photo_id
        JOIN persons pr ON pp.person_id = pr.id
        WHERE p.event_id = ?
      `)
      .all(ev.id);

    const displayName =
      ev.name && ev.name.trim() !== ''
        ? ev.name
        : ev.ts_start
        ? autoEventName(1, ev.ts_start)
        : 'เหตุการณ์';

    return { ...ev, displayName, photos, friends };
  });

  // PATCH /api/events/:id (name, place, note) — FR-302 / AC-5
  app.patch<{
    Params: { id: string };
    Body: UpdateEventBody;
  }>('/api/events/:id', async (req, reply) => {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
    if (!ev) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const { name, place, note } = req.body || {};

    const newName = name !== undefined ? name : ev.name;
    const newPlace = place !== undefined ? place : ev.place;
    const newNote = note !== undefined ? note : ev.note;
    const isNamed = newName && newName.trim() !== '' ? 1 : ev.named;

    db.prepare(`
      UPDATE events
      SET name = ?, place = ?, note = ?, named = ?
      WHERE id = ?
    `).run(newName, newPlace, newNote, isNamed, ev.id);

    // Update FTS
    const ftsText = [newName, newPlace, newNote].filter(Boolean).join(' ');
    ftsUpsert('event', ev.id, ftsText);

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(ev.id) as any;
    return updated;
  });
};
