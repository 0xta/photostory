// server/routes/search.ts — Thai Full-Text Search via SQLite FTS5 (Trigram)
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';
import { autoEventName } from '../utils.js';

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/search?q=
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req) => {
    const q = req.query.q?.trim() || '';

    // Decision D7: Minimum 3 characters for trigram tokenization
    if (q.length < 3) {
      return { photos: [], events: [], persons: [] };
    }

    const matches = db
      .prepare('SELECT kind, ref_id FROM search_fts WHERE search_fts MATCH ? LIMIT 100')
      .all(q) as Array<{ kind: string; ref_id: string }>;

    const photoIds = matches.filter((m) => m.kind === 'photo').map((m) => m.ref_id);
    const eventIds = matches.filter((m) => m.kind === 'event').map((m) => m.ref_id);
    const personIds = matches.filter((m) => m.kind === 'person').map((m) => m.ref_id);

    // Fetch photos
    let photos: any[] = [];
    if (photoIds.length > 0) {
      const placeholders = photoIds.map(() => '?').join(',');
      photos = db
        .prepare(`
          SELECT id, filename, taken_at, lat, lon, burst, note
          FROM photos
          WHERE id IN (${placeholders})
        `)
        .all(...photoIds);
    }

    // Fetch events
    let events: any[] = [];
    if (eventIds.length > 0) {
      const placeholders = eventIds.map(() => '?').join(',');
      events = db
        .prepare(`
          SELECT id, name, place, note, ts_start, ts_end, lat, lon,
            (SELECT COUNT(*) FROM photos WHERE event_id = events.id) as photo_count
          FROM events
          WHERE id IN (${placeholders})
        `)
        .all(...eventIds) as any[];

      events = events.map((ev, index) => ({
        ...ev,
        displayName:
          ev.name && ev.name.trim() !== ''
            ? ev.name
            : ev.ts_start
            ? autoEventName(index + 1, ev.ts_start)
            : 'เหตุการณ์',
      }));
    }

    // Fetch persons
    let persons: any[] = [];
    if (personIds.length > 0) {
      const placeholders = personIds.map(() => '?').join(',');
      persons = db
        .prepare(`
          SELECT id, name, nick, color,
            (SELECT COUNT(*) FROM photo_persons WHERE person_id = persons.id) as photo_count
          FROM persons
          WHERE id IN (${placeholders})
        `)
        .all(...personIds);
    }

    return { photos, events, persons };
  });
};
