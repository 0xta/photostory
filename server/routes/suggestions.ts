// server/routes/suggestions.ts — Suggestions Inbox API (Phase 1.5A)
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';
import { runSuggestionScan } from '../workers/suggest.js';
import { genId } from '../utils.js';

export const suggestionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/suggestions
  app.get<{ Querystring: { status?: string } }>('/api/suggestions', async (req) => {
    const { status = 'pending' } = req.query;

    const rows = db
      .prepare(`
        SELECT id, kind, payload, status, created_at
        FROM suggestions
        WHERE status = ?
        ORDER BY created_at DESC
      `)
      .all(status) as Array<{
        id: string;
        kind: string;
        payload: string;
        status: string;
        created_at: number;
      }>;

    const items = rows.map((r) => {
      let parsed = {};
      try {
        parsed = JSON.parse(r.payload);
      } catch {
        parsed = {};
      }
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        created_at: r.created_at,
        payload: parsed,
      };
    });

    return { total: items.length, items };
  });

  // POST /api/suggestions/scan
  app.post('/api/suggestions/scan', async () => {
    const res = runSuggestionScan();
    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM suggestions WHERE status = \'pending\'')
      .get() as { c: number };
    return { ok: true, added: res.added, pending_total: countRow.c };
  });

  // POST /api/suggestions/:id/accept (AC-21 / DR10)
  app.post<{ Params: { id: string } }>('/api/suggestions/:id/accept', async (req, reply) => {
    const sugg = db
      .prepare('SELECT * FROM suggestions WHERE id = ?')
      .get(req.params.id) as any;

    if (!sugg) {
      return reply.status(404).send({ error: 'Suggestion not found' });
    }

    let payload: any = {};
    try {
      payload = JSON.parse(sugg.payload);
    } catch {
      payload = {};
    }

    const now = Date.now();

    const applyAction = db.transaction(() => {
      if (sugg.kind === 'collection_topic' && payload.collection_id && payload.photo_id) {
        // Add to collection with added_by='rule' (AC-21)
        db.prepare(`
          INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
          VALUES (?, ?, 'rule', ?)
        `).run(payload.collection_id, payload.photo_id, now);
      } else if (sugg.kind === 'collection_create' && payload.suggested_name) {
        // Create new collection
        const newCollId = genId();
        const photoIds = Array.isArray(payload.photo_ids) ? payload.photo_ids : [];
        const coverId = photoIds[0] || null;

        db.prepare(`
          INSERT INTO collections (id, name, type, note, cover_photo_id, created_at)
          VALUES (?, ?, 'topic', ?, ?, ?)
        `).run(newCollId, payload.suggested_name, payload.reason || '', coverId, now);

        const insertPhoto = db.prepare(`
          INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
          VALUES (?, ?, 'rule', ?)
        `);
        for (const pid of photoIds) {
          insertPhoto.run(newCollId, pid, now);
        }
      } else if (sugg.kind === 'place_link' && payload.place_id && payload.photo_id) {
        // Confirm GPS place link with source='gps-confirmed' (FR-1202 / AC-24)
        db.prepare(`
          INSERT OR REPLACE INTO photo_places (photo_id, place_id, source)
          VALUES (?, ?, 'gps-confirmed')
        `).run(payload.photo_id, payload.place_id);

        // If place has linked collection (e.g. place_project), also link to collection
        const linkedColl = db
          .prepare('SELECT id FROM collections WHERE place_id = ? LIMIT 1')
          .get(payload.place_id) as { id: string } | undefined;
        if (linkedColl) {
          db.prepare(`
            INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
            VALUES (?, ?, 'rule', ?)
          `).run(linkedColl.id, payload.photo_id, now);
        }
      }

      // Mark suggestion as accepted
      db.prepare('UPDATE suggestions SET status = \'accepted\' WHERE id = ?').run(sugg.id);
    });

    applyAction();

    return { ok: true, status: 'accepted' };
  });

  // POST /api/suggestions/:id/dismiss (DR10: hidden and never re-suggested)
  app.post<{ Params: { id: string } }>('/api/suggestions/:id/dismiss', async (req, reply) => {
    const sugg = db
      .prepare('SELECT id FROM suggestions WHERE id = ?')
      .get(req.params.id);

    if (!sugg) {
      return reply.status(404).send({ error: 'Suggestion not found' });
    }

    db.prepare('UPDATE suggestions SET status = \'dismissed\' WHERE id = ?').run(req.params.id);

    return { ok: true, status: 'dismissed' };
  });
};
