// server/routes/meals.ts — Meal Diary CRUD API (Phase 1.5C)
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert, ftsDelete } from '../db.js';
import { genId } from '../utils.js';

export function guessMealType(ms: number | null): 'breakfast' | 'lunch' | 'dinner' | 'cafe' | 'other' {
  if (!ms) return 'other';
  const d = new Date(ms);
  const hour = d.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'cafe';
}

interface CreateMealBody {
  place_id?: string | null;
  restaurant_name?: string;
  event_id?: string | null;
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'cafe' | 'other';
  taken_at?: number | null;
  note?: string;
  rating?: number | null;
  photo_ids?: string[];
}

interface UpdateMealBody {
  place_id?: string | null;
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'cafe' | 'other';
  note?: string;
  rating?: number | null;
}

export const mealsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/meals
  app.get<{
    Querystring: {
      place?: string;
      type?: string;
      month?: string;
      year?: string;
    };
  }>('/api/meals', async (req) => {
    const { place, type, month, year } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (place) {
      conditions.push('m.place_id = ?');
      params.push(place);
    }

    if (type) {
      conditions.push('m.meal_type = ?');
      params.push(type);
    }

    if (month && month.trim() !== '') {
      conditions.push("CAST(strftime('%m', datetime(m.taken_at / 1000, 'unixepoch')) AS INTEGER) = ?");
      params.push(parseInt(month, 10));
    }

    if (year && year.trim() !== '') {
      conditions.push("CAST(strftime('%Y', datetime(m.taken_at / 1000, 'unixepoch')) AS INTEGER) = ?");
      params.push(parseInt(year, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const meals = db
      .prepare(`
        SELECT
          m.id, m.place_id, m.event_id, m.taken_at, m.meal_type, m.note, m.rating, m.created_at,
          pl.name as place_name, pl.lat as place_lat, pl.lon as place_lon,
          e.name as event_name,
          (SELECT COUNT(*) FROM meal_photos mp WHERE mp.meal_id = m.id) as photo_count,
          (
            SELECT p.id FROM meal_photos mp
            JOIN photos p ON mp.photo_id = p.id
            WHERE mp.meal_id = m.id
            ORDER BY p.taken_at ASC
            LIMIT 1
          ) as cover_photo_id
        FROM meals m
        LEFT JOIN places pl ON m.place_id = pl.id
        LEFT JOIN events e ON m.event_id = e.id
        ${whereClause}
        ORDER BY CASE WHEN m.taken_at IS NULL THEN 1 ELSE 0 END, m.taken_at DESC
      `)
      .all(...params) as any[];

    // Fetch companions and photo_ids for each meal
    const items = meals.map((meal) => {
      const photos = db
        .prepare(`
          SELECT p.id, p.filename, p.taken_at
          FROM meal_photos mp
          JOIN photos p ON mp.photo_id = p.id
          WHERE mp.meal_id = ?
          ORDER BY p.taken_at ASC
        `)
        .all(meal.id) as Array<{ id: string; filename: string; taken_at: number }>;

      const photoIds = photos.map((p) => p.id);

      let companions: any[] = [];
      if (photoIds.length > 0) {
        companions = db
          .prepare(`
            SELECT DISTINCT pe.id, pe.name, pe.nick, pe.color
            FROM photo_persons pp
            JOIN persons pe ON pp.person_id = pe.id
            WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
          `)
          .all(...photoIds);
      }

      return {
        ...meal,
        photo_ids: photoIds,
        photos,
        companions,
      };
    });

    return { total: items.length, items };
  });

  // POST /api/meals
  app.post<{ Body: CreateMealBody }>('/api/meals', async (req, reply) => {
    let {
      place_id = null,
      restaurant_name,
      event_id = null,
      meal_type,
      taken_at = null,
      note = '',
      rating = null,
      photo_ids = [],
    } = req.body || {};

    const now = Date.now();

    // If restaurant_name is provided without place_id, find or create restaurant place (DR8)
    if (restaurant_name && restaurant_name.trim() && !place_id) {
      const cleanName = restaurant_name.trim();
      const existingPlace = db
        .prepare("SELECT id FROM places WHERE name = ? AND type = 'restaurant' LIMIT 1")
        .get(cleanName) as { id: string } | undefined;

      if (existingPlace) {
        place_id = existingPlace.id;
      } else {
        place_id = genId();
        db.prepare(`
          INSERT INTO places (id, name, type, radius_m, note, created_at)
          VALUES (?, ?, 'restaurant', 120, 'สร้างจากไดอารี่อาหาร', ?)
        `).run(place_id, cleanName, now);
        ftsUpsert('place', place_id, cleanName);
      }
    }

    // Determine taken_at and event_id from photo_ids if not explicitly given
    if ((!taken_at || !event_id) && photo_ids.length > 0) {
      const firstPhoto = db
        .prepare('SELECT taken_at, event_id FROM photos WHERE id = ?')
        .get(photo_ids[0]) as { taken_at: number | null; event_id: string | null } | undefined;

      if (firstPhoto) {
        if (!taken_at && firstPhoto.taken_at) {
          taken_at = firstPhoto.taken_at;
        }
        if (!event_id && firstPhoto.event_id) {
          event_id = firstPhoto.event_id;
        }
      }
    }

    // Auto-guess meal_type if not specified or 'other'
    if (!meal_type || meal_type === 'other') {
      meal_type = guessMealType(taken_at);
    }

    const id = genId();

    const insertMeal = db.transaction(() => {
      db.prepare(`
        INSERT INTO meals (id, place_id, event_id, taken_at, meal_type, note, rating, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, place_id, event_id, taken_at, meal_type, (note || '').trim(), rating, now);

      if (photo_ids.length > 0) {
        const insertMp = db.prepare('INSERT OR IGNORE INTO meal_photos (meal_id, photo_id) VALUES (?, ?)');
        for (const pid of photo_ids) {
          insertMp.run(id, pid);
        }

        // Also link photos to place if place_id exists
        if (place_id) {
          const insertPp = db.prepare(`
            INSERT OR IGNORE INTO photo_places (photo_id, place_id, source)
            VALUES (?, ?, 'manual')
          `);
          for (const pid of photo_ids) {
            insertPp.run(pid, place_id);
          }
        }
      }
    });

    insertMeal();

    // FTS sync
    const placeRow = place_id ? (db.prepare('SELECT name FROM places WHERE id = ?').get(place_id) as any) : null;
    const placeName = placeRow?.name || '';
    ftsUpsert('meal', id, `${meal_type} ${placeName} ${note || ''}`);

    return reply.status(201).send({
      id,
      place_id,
      event_id,
      taken_at,
      meal_type,
      note: (note || '').trim(),
      rating,
      created_at: now,
      photo_count: photo_ids.length,
    });
  });

  // GET /api/meals/:id
  app.get<{ Params: { id: string } }>('/api/meals/:id', async (req, reply) => {
    const meal = db
      .prepare(`
        SELECT
          m.id, m.place_id, m.event_id, m.taken_at, m.meal_type, m.note, m.rating, m.created_at,
          pl.name as place_name, pl.lat as place_lat, pl.lon as place_lon, pl.type as place_type,
          e.name as event_name, e.place as event_place
        FROM meals m
        LEFT JOIN places pl ON m.place_id = pl.id
        LEFT JOIN events e ON m.event_id = e.id
        WHERE m.id = ?
      `)
      .get(req.params.id) as any;

    if (!meal) {
      return reply.status(404).send({ error: 'Meal not found' });
    }

    const photos = db
      .prepare(`
        SELECT p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.note, p.event_id
        FROM meal_photos mp
        JOIN photos p ON mp.photo_id = p.id
        WHERE mp.meal_id = ?
        ORDER BY p.taken_at ASC
      `)
      .all(meal.id) as any[];

    const photoIds = photos.map((p) => p.id);
    let companions: any[] = [];
    if (photoIds.length > 0) {
      companions = db
        .prepare(`
          SELECT DISTINCT pe.id, pe.name, pe.nick, pe.color
          FROM photo_persons pp
          JOIN persons pe ON pp.person_id = pe.id
          WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
        `)
        .all(...photoIds);
    }

    return {
      ...meal,
      photos,
      companions,
      photo_count: photos.length,
    };
  });

  // PATCH /api/meals/:id
  app.patch<{
    Params: { id: string };
    Body: UpdateMealBody;
  }>('/api/meals/:id', async (req, reply) => {
    const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id) as any;
    if (!meal) {
      return reply.status(404).send({ error: 'Meal not found' });
    }

    const { place_id, meal_type, note, rating } = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];

    if (place_id !== undefined) {
      updates.push('place_id = ?');
      params.push(place_id);
    }
    if (meal_type !== undefined) {
      updates.push('meal_type = ?');
      params.push(meal_type);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push((note || '').trim());
    }
    if (rating !== undefined) {
      updates.push('rating = ?');
      params.push(rating);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE meals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id) as any;
    const placeRow = updated.place_id
      ? (db.prepare('SELECT name FROM places WHERE id = ?').get(updated.place_id) as any)
      : null;
    ftsUpsert('meal', updated.id, `${updated.meal_type} ${placeRow?.name || ''} ${updated.note || ''}`);

    return updated;
  });

  // DELETE /api/meals/:id (DR6: deletes meal and cascades meal_photos only, never touches photos)
  app.delete<{ Params: { id: string } }>('/api/meals/:id', async (req, reply) => {
    const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(req.params.id);
    if (!meal) {
      return reply.status(404).send({ error: 'Meal not found' });
    }

    db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
    ftsDelete('meal', req.params.id);

    return { ok: true };
  });

  // POST /api/meals/:id/photos
  app.post<{
    Params: { id: string };
    Body: { photo_ids: string[] };
  }>('/api/meals/:id/photos', async (req, reply) => {
    const meal = db.prepare('SELECT id, place_id FROM meals WHERE id = ?').get(req.params.id) as any;
    if (!meal) {
      return reply.status(404).send({ error: 'Meal not found' });
    }

    const { photo_ids = [] } = req.body || {};
    const linkPhotos = db.transaction(() => {
      const stmt = db.prepare('INSERT OR IGNORE INTO meal_photos (meal_id, photo_id) VALUES (?, ?)');
      for (const pid of photo_ids) {
        stmt.run(req.params.id, pid);
      }

      if (meal.place_id) {
        const placeStmt = db.prepare('INSERT OR IGNORE INTO photo_places (photo_id, place_id, source) VALUES (?, ?, "manual")');
        for (const pid of photo_ids) {
          placeStmt.run(pid, meal.place_id);
        }
      }
    });

    linkPhotos();

    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM meal_photos WHERE meal_id = ?')
      .get(req.params.id) as { c: number };

    return { ok: true, linked: photo_ids.length, total: countRow.c };
  });

  // DELETE /api/meals/:id/photos/:photoId
  app.delete<{
    Params: { id: string; photoId: string };
  }>('/api/meals/:id/photos/:photoId', async (req) => {
    const res = db
      .prepare('DELETE FROM meal_photos WHERE meal_id = ? AND photo_id = ?')
      .run(req.params.id, req.params.photoId);

    return { ok: true, removed: res.changes > 0 };
  });
};
