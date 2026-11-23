// server/routes/places.ts — Places & Project Threads CRUD API (Phase 1.5B)
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert, ftsDelete } from '../db.js';
import { genId, haversine } from '../utils.js';

interface CreatePlaceBody {
  name: string;
  type?: 'home' | 'project' | 'visit' | 'restaurant' | 'other';
  lat?: number | null;
  lon?: number | null;
  radius_m?: number;
  note?: string;
  photo_ids?: string[];
}

interface UpdatePlaceBody {
  name?: string;
  type?: 'home' | 'project' | 'visit' | 'restaurant' | 'other';
  lat?: number | null;
  lon?: number | null;
  radius_m?: number;
  note?: string;
}

export const placesRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/places
  app.get<{ Querystring: { type?: string } }>('/api/places', async (req) => {
    const { type } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
      conditions.push('pl.type = ?');
      params.push(type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const items = db
      .prepare(`
        SELECT
          pl.id, pl.name, pl.lat, pl.lon, pl.radius_m, pl.type, pl.note, pl.created_at,
          (SELECT COUNT(*) FROM photo_places pp WHERE pp.place_id = pl.id) as photo_count,
          (
            SELECT p.id FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id
            ORDER BY p.taken_at DESC
            LIMIT 1
          ) as latest_photo_id,
          (
            SELECT MIN(p.taken_at) FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as first_visit,
          (
            SELECT MAX(p.taken_at) FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as last_visit,
          (
            SELECT COUNT(DISTINCT date(datetime(p.taken_at / 1000, 'unixepoch')))
            FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as visit_count
        FROM places pl
        ${whereClause}
        ORDER BY pl.created_at DESC
      `)
      .all(...params) as any[];

    return { total: items.length, items };
  });

  // POST /api/places
  app.post<{ Body: CreatePlaceBody }>('/api/places', async (req, reply) => {
    const {
      name,
      type = 'other',
      lat = null,
      lon = null,
      radius_m = 120,
      note = '',
      photo_ids = [],
    } = req.body || {};

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Place name is required' });
    }

    const id = genId();
    const now = Date.now();
    let autoCollectionId: string | null = null;

    const insertPlace = db.transaction(() => {
      // 1. Insert place
      db.prepare(`
        INSERT INTO places (id, name, lat, lon, radius_m, type, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name.trim(), lat, lon, radius_m, type, note.trim(), now);

      // 2. Link initial photos if provided
      if (Array.isArray(photo_ids) && photo_ids.length > 0) {
        const insertPhotoPlace = db.prepare(`
          INSERT OR IGNORE INTO photo_places (photo_id, place_id, source)
          VALUES (?, ?, 'manual')
        `);
        for (const pid of photo_ids) {
          insertPhotoPlace.run(pid, id);
        }
      }

      // 3. FR-1204 / AC-25: If type is 'project', auto-create a place_project collection!
      if (type === 'project') {
        autoCollectionId = genId();
        db.prepare(`
          INSERT INTO collections (id, name, type, note, place_id, created_at)
          VALUES (?, ?, 'place_project', ?, ?, ?)
        `).run(autoCollectionId, name.trim(), note.trim(), id, now);

        if (Array.isArray(photo_ids) && photo_ids.length > 0) {
          const insertCollPhoto = db.prepare(`
            INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
            VALUES (?, ?, 'manual', ?)
          `);
          for (const pid of photo_ids) {
            insertCollPhoto.run(autoCollectionId, pid, now);
          }
        }
      }
    });

    insertPlace();
    ftsUpsert('place', id, `${name} ${note}`);

    return reply.status(201).send({
      id,
      name: name.trim(),
      type,
      lat,
      lon,
      radius_m,
      note: note.trim(),
      created_at: now,
      collection_id: autoCollectionId,
      photo_count: photo_ids.length,
    });
  });

  // GET /api/places/:id
  app.get<{ Params: { id: string } }>('/api/places/:id', async (req, reply) => {
    const place = db
      .prepare(`
        SELECT
          pl.id, pl.name, pl.lat, pl.lon, pl.radius_m, pl.type, pl.note, pl.created_at,
          (SELECT COUNT(*) FROM photo_places pp WHERE pp.place_id = pl.id) as photo_count,
          (
            SELECT MIN(p.taken_at) FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as first_visit,
          (
            SELECT MAX(p.taken_at) FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as last_visit,
          (
            SELECT COUNT(DISTINCT date(datetime(p.taken_at / 1000, 'unixepoch')))
            FROM photo_places pp
            JOIN photos p ON pp.photo_id = p.id
            WHERE pp.place_id = pl.id AND p.taken_at IS NOT NULL
          ) as visit_count
        FROM places pl
        WHERE pl.id = ?
      `)
      .get(req.params.id) as any;

    if (!place) {
      return reply.status(404).send({ error: 'Place not found' });
    }

    // Get linked photos sorted chronologically
    const photos = db
      .prepare(`
        SELECT
          p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.note, p.event_id,
          e.name as event_name, e.place as event_place,
          pp.source
        FROM photo_places pp
        JOIN photos p ON pp.photo_id = p.id
        LEFT JOIN events e ON p.event_id = e.id
        WHERE pp.place_id = ?
        ORDER BY CASE WHEN p.taken_at IS NULL THEN 1 ELSE 0 END, p.taken_at ASC
      `)
      .all(place.id) as any[];

    // Extract distinct friends appearing in photos of this place
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

    // Find linked place_project collection (if any)
    const linkedCollection = db
      .prepare('SELECT id, name, type FROM collections WHERE place_id = ? LIMIT 1')
      .get(place.id) as any;

    return {
      ...place,
      photos,
      friends,
      linked_collection: linkedCollection || null,
    };
  });

  // PATCH /api/places/:id
  app.patch<{
    Params: { id: string };
    Body: UpdatePlaceBody;
  }>('/api/places/:id', async (req, reply) => {
    const place = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id) as any;
    if (!place) {
      return reply.status(404).send({ error: 'Place not found' });
    }

    const { name, type, lat, lon, radius_m, note } = req.body || {};
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
    if (lat !== undefined) {
      updates.push('lat = ?');
      params.push(lat);
    }
    if (lon !== undefined) {
      updates.push('lon = ?');
      params.push(lon);
    }
    if (radius_m !== undefined) {
      updates.push('radius_m = ?');
      params.push(radius_m);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push(note.trim());
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE places SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM places WHERE id = ?').get(req.params.id) as any;
    ftsUpsert('place', updated.id, `${updated.name} ${updated.note}`);

    return updated;
  });

  // DELETE /api/places/:id (DR6: deletes place and cascades photo_places, never deletes photos)
  app.delete<{ Params: { id: string } }>('/api/places/:id', async (req, reply) => {
    const place = db.prepare('SELECT id FROM places WHERE id = ?').get(req.params.id);
    if (!place) {
      return reply.status(404).send({ error: 'Place not found' });
    }

    db.prepare('DELETE FROM places WHERE id = ?').run(req.params.id);
    ftsDelete('place', req.params.id);

    return { ok: true };
  });

  // POST /api/places/:id/photos (Link photo(s) to place)
  app.post<{
    Params: { id: string };
    Body: { photo_ids: string[]; source?: string };
  }>('/api/places/:id/photos', async (req, reply) => {
    const place = db.prepare('SELECT id FROM places WHERE id = ?').get(req.params.id);
    if (!place) {
      return reply.status(404).send({ error: 'Place not found' });
    }

    const { photo_ids = [], source = 'manual' } = req.body || {};

    const linkPhotos = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO photo_places (photo_id, place_id, source)
        VALUES (?, ?, ?)
      `);
      for (const pid of photo_ids) {
        stmt.run(pid, req.params.id, source);
      }
    });

    linkPhotos();

    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM photo_places WHERE place_id = ?')
      .get(req.params.id) as { c: number };

    return { ok: true, linked: photo_ids.length, total: countRow.c };
  });

  // DELETE /api/places/:id/photos/:photoId (Unlink photo from place)
  app.delete<{
    Params: { id: string; photoId: string };
  }>('/api/places/:id/photos/:photoId', async (req) => {
    const res = db
      .prepare('DELETE FROM photo_places WHERE place_id = ? AND photo_id = ?')
      .run(req.params.id, req.params.photoId);

    return { ok: true, removed: res.changes > 0 };
  });
};
