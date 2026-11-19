// server/routes/collections.ts — Collections / Stories CRUD API (Phase 1.5A)
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert, ftsDelete } from '../db.js';
import { genId } from '../utils.js';

interface CreateCollectionBody {
  name: string;
  type?: 'topic' | 'place_project' | 'custom' | 'trip';
  note?: string;
  cover_photo_id?: string;
  place_id?: string;
  photo_ids?: string[];
}

interface UpdateCollectionBody {
  name?: string;
  type?: 'topic' | 'place_project' | 'custom' | 'trip';
  note?: string;
  cover_photo_id?: string | null;
  place_id?: string | null;
}

export const collectionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/collections
  app.get<{ Querystring: { type?: string } }>('/api/collections', async (req) => {
    const { type } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
      conditions.push('c.type = ?');
      params.push(type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const items = db
      .prepare(`
        SELECT
          c.id, c.name, c.type, c.note, c.cover_photo_id, c.place_id, c.created_at,
          (SELECT COUNT(*) FROM collection_photos cp WHERE cp.collection_id = c.id) as photo_count,
          (
            SELECT p.id FROM collection_photos cp
            JOIN photos p ON cp.photo_id = p.id
            WHERE cp.collection_id = c.id
            ORDER BY cp.added_at DESC
            LIMIT 1
          ) as latest_photo_id,
          (
            SELECT MIN(p.taken_at) FROM collection_photos cp
            JOIN photos p ON cp.photo_id = p.id
            WHERE cp.collection_id = c.id AND p.taken_at IS NOT NULL
          ) as ts_min,
          (
            SELECT MAX(p.taken_at) FROM collection_photos cp
            JOIN photos p ON cp.photo_id = p.id
            WHERE cp.collection_id = c.id AND p.taken_at IS NOT NULL
          ) as ts_max
        FROM collections c
        ${whereClause}
        ORDER BY c.created_at DESC
      `)
      .all(...params) as any[];

    // Ensure cover_photo_id fallback
    for (const item of items) {
      if (!item.cover_photo_id && item.latest_photo_id) {
        item.cover_photo_id = item.latest_photo_id;
      }
    }

    return { total: items.length, items };
  });

  // POST /api/collections
  app.post<{ Body: CreateCollectionBody }>('/api/collections', async (req, reply) => {
    const { name, type = 'topic', note = '', cover_photo_id = null, place_id = null, photo_ids = [] } =
      req.body || {};

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const id = genId();
    const now = Date.now();

    const insertColl = db.transaction(() => {
      db.prepare(`
        INSERT INTO collections (id, name, type, note, cover_photo_id, place_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), type, note.trim(), cover_photo_id, place_id, now);

      if (Array.isArray(photo_ids) && photo_ids.length > 0) {
        const insertPhoto = db.prepare(`
          INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
          VALUES (?, ?, 'manual', ?)
        `);
        for (const pid of photo_ids) {
          insertPhoto.run(id, pid, now);
        }
      }
    });

    insertColl();
    ftsUpsert('collection', id, `${name} ${note}`);

    return reply.status(201).send({
      id,
      name: name.trim(),
      type,
      note: note.trim(),
      cover_photo_id,
      place_id,
      created_at: now,
      photo_count: photo_ids.length,
    });
  });

  // GET /api/collections/:id
  app.get<{ Params: { id: string } }>('/api/collections/:id', async (req, reply) => {
    const coll = db
      .prepare(`
        SELECT
          c.id, c.name, c.type, c.note, c.cover_photo_id, c.place_id, c.created_at,
          (SELECT COUNT(*) FROM collection_photos cp WHERE cp.collection_id = c.id) as photo_count
        FROM collections c
        WHERE c.id = ?
      `)
      .get(req.params.id) as any;

    if (!coll) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    // Get member photos with event and metadata, sorted chronologically by taken_at
    const photos = db
      .prepare(`
        SELECT
          p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.note, p.event_id,
          e.name as event_name, e.place as event_place,
          cp.added_by, cp.added_at
        FROM collection_photos cp
        JOIN photos p ON cp.photo_id = p.id
        LEFT JOIN events e ON p.event_id = e.id
        WHERE cp.collection_id = ?
        ORDER BY CASE WHEN p.taken_at IS NULL THEN 1 ELSE 0 END, p.taken_at ASC, cp.added_at ASC
      `)
      .all(coll.id) as any[];

    // Extract distinct friends appearing in these collection photos
    const photoIds = photos.map((p) => p.id);
    let friends: any[] = [];
    if (photoIds.length > 0) {
      friends = db
        .prepare(`
          SELECT DISTINCT pe.id, pe.name, pe.color
          FROM photo_persons pp
          JOIN persons pe ON pp.person_id = pe.id
          WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
        `)
        .all(...photoIds);
    }

    // Set fallback cover if null
    if (!coll.cover_photo_id && photos.length > 0) {
      coll.cover_photo_id = photos[0].id;
    }

    return {
      ...coll,
      photos,
      friends,
      date_span: {
        min: photos.find((p) => p.taken_at)?.taken_at || null,
        max: photos.slice().reverse().find((p) => p.taken_at)?.taken_at || null,
      },
    };
  });

  // PATCH /api/collections/:id
  app.patch<{
    Params: { id: string };
    Body: UpdateCollectionBody;
  }>('/api/collections/:id', async (req, reply) => {
    const coll = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id) as any;
    if (!coll) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    const { name, type, note, cover_photo_id, place_id } = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push(note.trim());
    }
    if (cover_photo_id !== undefined) {
      updates.push('cover_photo_id = ?');
      params.push(cover_photo_id);
    }
    if (place_id !== undefined) {
      updates.push('place_id = ?');
      params.push(place_id);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE collections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id) as any;
    ftsUpsert('collection', updated.id, `${updated.name} ${updated.note}`);

    return updated;
  });

  // DELETE /api/collections/:id (DR6: deletes collection & memberships, never deletes photos)
  app.delete<{ Params: { id: string } }>('/api/collections/:id', async (req, reply) => {
    const coll = db.prepare('SELECT id FROM collections WHERE id = ?').get(req.params.id);
    if (!coll) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
    ftsDelete('collection', req.params.id);

    return { ok: true };
  });

  // POST /api/collections/:id/photos (Add photos to collection)
  app.post<{
    Params: { id: string };
    Body: { photo_ids: string[]; added_by?: 'manual' | 'rule' };
  }>('/api/collections/:id/photos', async (req, reply) => {
    const coll = db.prepare('SELECT id, cover_photo_id FROM collections WHERE id = ?').get(req.params.id) as any;
    if (!coll) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    const { photo_ids = [], added_by = 'manual' } = req.body || {};
    const now = Date.now();

    const insertPhotos = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const pid of photo_ids) {
        stmt.run(coll.id, pid, added_by, now);
      }

      // If no cover photo, set the first added photo as cover
      if (!coll.cover_photo_id && photo_ids.length > 0) {
        db.prepare('UPDATE collections SET cover_photo_id = ? WHERE id = ?').run(photo_ids[0], coll.id);
      }
    });

    insertPhotos();

    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM collection_photos WHERE collection_id = ?')
      .get(coll.id) as { c: number };

    return { ok: true, added: photo_ids.length, total: countRow.c };
  });

  // DELETE /api/collections/:id/photos/:photoId (Remove photo from collection)
  app.delete<{
    Params: { id: string; photoId: string };
  }>('/api/collections/:id/photos/:photoId', async (req, reply) => {
    const res = db
      .prepare('DELETE FROM collection_photos WHERE collection_id = ? AND photo_id = ?')
      .run(req.params.id, req.params.photoId);

    // If removed photo was cover, clear it or re-pick
    db.prepare(`
      UPDATE collections
      SET cover_photo_id = (
        SELECT photo_id FROM collection_photos WHERE collection_id = ? LIMIT 1
      )
      WHERE id = ? AND cover_photo_id = ?
    `).run(req.params.id, req.params.id, req.params.photoId);

    return { ok: true, removed: res.changes > 0 };
  });
};
