// server/routes/photos.ts — Photos full CRUD and filtering
import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import db, { THUMBS_DIR, ftsUpsert, ftsDelete } from '../db.js';
import { runClustering } from '../workers/cluster.js';
import { haversine } from '../utils.js';

interface GeoQuery {
  cat?: string;
  person?: string;
  month?: string;
  year?: string;
  event?: string;
  q?: string;
  lat?: string;
  lon?: string;
  radius_km?: string;
}

interface PhotosQuery {
  cat?: string;
  person?: string;
  month?: string;
  year?: string;
  gps?: 'yes' | 'no' | 'nodate';
  burst?: string;
  event?: string;
  q?: string;
  limit?: string;
  offset?: string;
}

export const photosRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/photos
  app.get<{ Querystring: PhotosQuery }>('/api/photos', async (req) => {
    const {
      cat,
      person,
      month,
      year,
      gps,
      burst,
      event,
      q,
      limit = '100',
      offset = '0',
    } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (cat) {
      conditions.push('p.id IN (SELECT photo_id FROM photo_cats WHERE cat = ?)');
      params.push(cat);
    }

    if (person) {
      conditions.push('p.id IN (SELECT photo_id FROM photo_persons WHERE person_id = ?)');
      params.push(person);
    }

    if (month) {
      const monthNum = parseInt(month, 10);
      conditions.push(
        'p.taken_at IS NOT NULL AND CAST(strftime(\'%m\', datetime(p.taken_at / 1000, \'unixepoch\')) AS INTEGER) = ?'
      );
      params.push(monthNum);
    }

    if (year) {
      const yearNum = parseInt(year, 10);
      conditions.push(
        'p.taken_at IS NOT NULL AND CAST(strftime(\'%Y\', datetime(p.taken_at / 1000, \'unixepoch\')) AS INTEGER) = ?'
      );
      params.push(yearNum);
    }

    if (gps === 'yes') {
      conditions.push('p.lat IS NOT NULL');
    } else if (gps === 'no') {
      conditions.push('p.lat IS NULL AND p.taken_at IS NOT NULL');
    } else if (gps === 'nodate') {
      conditions.push('p.taken_at IS NULL');
    }

    if (burst === '1') {
      conditions.push('p.burst = 1');
    }

    if (event) {
      conditions.push('p.event_id = ?');
      params.push(event);
    }

    if (q && q.trim().length >= 3) {
      conditions.push(
        'p.id IN (SELECT ref_id FROM search_fts WHERE kind = \'photo\' AND search_fts MATCH ?)'
      );
      params.push(q.trim());
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
      .all(...params, Number(limit), Number(offset)) as any[];

    // Enrich items with cats and friends
    const getCatsStmt = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?');
    const getPersonsStmt = db.prepare(`
      SELECT pr.id, pr.name, pr.nick, pr.color
      FROM photo_persons pp
      JOIN persons pr ON pp.person_id = pr.id
      WHERE pp.photo_id = ?
    `);

    for (const item of items) {
      item.cats = (getCatsStmt.all(item.id) as Array<{ cat: string }>).map((c) => c.cat);
      item.friends = getPersonsStmt.all(item.id);
    }

    return { total: countRow.c, items };
  });

  // GET /api/photos/geo (GeoJSON FeatureCollection + Events + Nearby query)
  app.get<{ Querystring: GeoQuery }>('/api/photos/geo', async (req) => {
    const { cat, person, month, year, event, q, lat, lon, radius_km } = req.query;

    const conditions: string[] = ['p.lat IS NOT NULL', 'p.lon IS NOT NULL'];
    const params: any[] = [];

    if (cat) {
      conditions.push('p.id IN (SELECT photo_id FROM photo_cats WHERE cat = ?)');
      params.push(cat);
    }
    if (person) {
      conditions.push('p.id IN (SELECT photo_id FROM photo_persons WHERE person_id = ?)');
      params.push(person);
    }
    if (month) {
      conditions.push(
        'p.taken_at IS NOT NULL AND CAST(strftime(\'%m\', datetime(p.taken_at / 1000, \'unixepoch\')) AS INTEGER) = ?'
      );
      params.push(parseInt(month, 10));
    }
    if (year) {
      conditions.push(
        'p.taken_at IS NOT NULL AND CAST(strftime(\'%Y\', datetime(p.taken_at / 1000, \'unixepoch\')) AS INTEGER) = ?'
      );
      params.push(parseInt(year, 10));
    }
    if (event) {
      conditions.push('p.event_id = ?');
      params.push(event);
    }
    if (q && q.trim().length >= 3) {
      conditions.push(
        'p.id IN (SELECT ref_id FROM search_fts WHERE kind = \'photo\' AND search_fts MATCH ?)'
      );
      params.push(q.trim());
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = db
      .prepare(`
        SELECT
          p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.note, p.event_id,
          e.name as event_name, e.place as event_place
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        ${whereClause}
        ORDER BY p.taken_at ASC
      `)
      .all(...params) as any[];

    // Fetch tags for these photos efficiently
    const catsRows = db
      .prepare('SELECT photo_id, cat FROM photo_cats')
      .all() as { photo_id: string; cat: string }[];
    const catsMap: Record<string, string[]> = {};
    for (const r of catsRows) {
      if (!catsMap[r.photo_id]) catsMap[r.photo_id] = [];
      catsMap[r.photo_id].push(r.cat);
    }

    const personsRows = db
      .prepare(`
        SELECT pp.photo_id, pe.id, pe.name, pe.color
        FROM photo_persons pp
        JOIN persons pe ON pp.person_id = pe.id
      `)
      .all() as { photo_id: string; id: string; name: string; color: string }[];
    const personsMap: Record<string, any[]> = {};
    for (const r of personsRows) {
      if (!personsMap[r.photo_id]) personsMap[r.photo_id] = [];
      personsMap[r.photo_id].push({ id: r.id, name: r.name, color: r.color });
    }

    const queryLat = lat ? parseFloat(lat) : null;
    const queryLon = lon ? parseFloat(lon) : null;
    const maxRadius = radius_km ? parseFloat(radius_km) : null;

    let features = rows.map((p) => {
      let distanceKm: number | null = null;
      if (queryLat !== null && queryLon !== null && !isNaN(queryLat) && !isNaN(queryLon)) {
        distanceKm = haversine({ lat: queryLat, lon: queryLon }, { lat: p.lat, lon: p.lon });
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [p.lon, p.lat],
        },
        properties: {
          id: p.id,
          filename: p.filename,
          taken_at: p.taken_at,
          event_id: p.event_id,
          event_name: p.event_name,
          event_place: p.event_place,
          burst: p.burst,
          note: p.note,
          cats: catsMap[p.id] || [],
          persons: personsMap[p.id] || [],
          distance_km: distanceKm !== null ? Math.round(distanceKm * 100) / 100 : undefined,
        },
      };
    });

    if (maxRadius !== null && !isNaN(maxRadius) && queryLat !== null && queryLon !== null) {
      features = features.filter(
        (f) => f.properties.distance_km !== undefined && f.properties.distance_km <= maxRadius
      );
      features.sort(
        (a, b) => (a.properties.distance_km ?? 0) - (b.properties.distance_km ?? 0)
      );
    }

    // Also fetch distinct events with centroids
    const events = db
      .prepare(`
        SELECT
          e.id, e.name, e.place, e.lat, e.lon, e.ts_start, e.ts_end,
          (SELECT COUNT(*) FROM photos WHERE event_id = e.id) as photo_count
        FROM events e
        WHERE e.lat IS NOT NULL AND e.lon IS NOT NULL
        ORDER BY e.ts_start ASC
      `)
      .all() as any[];

    return {
      type: 'FeatureCollection',
      features,
      events,
      total: features.length,
    };
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

    const friends = db.prepare(`
      SELECT pr.id, pr.name, pr.nick, pr.color
      FROM photo_persons pp
      JOIN persons pr ON pp.person_id = pr.id
      WHERE pp.photo_id = ?
    `).all(photo.id);

    let event: any = null;
    if (photo.event_id) {
      event = db.prepare('SELECT id, name, place, note, ts_start, ts_end FROM events WHERE id = ?').get(photo.event_id);
    }

    const places = db
      .prepare(`
        SELECT pl.id, pl.name, pl.type, pp.source
        FROM photo_places pp
        JOIN places pl ON pp.place_id = pl.id
        WHERE pp.photo_id = ?
      `)
      .all(photo.id);

    return { ...photo, cats, friends, event, places };
  });

  // PATCH /api/photos/:id (note, taken_at, lat, lon)
  app.patch<{
    Params: { id: string };
    Body: { note?: string; taken_at?: number | null; lat?: number | null; lon?: number | null };
  }>('/api/photos/:id', async (req, reply) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as any;
    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }

    const { note, taken_at, lat, lon } = req.body || {};
    let dateChanged = false;

    if (note !== undefined) {
      db.prepare('UPDATE photos SET note = ? WHERE id = ?').run(note, photo.id);
      ftsUpsert('photo', photo.id, `${photo.filename} ${note}`.trim());
    }

    if (taken_at !== undefined) {
      if (photo.taken_at !== taken_at) {
        dateChanged = true;
      }
      db.prepare('UPDATE photos SET taken_at = ? WHERE id = ?').run(taken_at, photo.id);
    }

    if (lat !== undefined || lon !== undefined) {
      const newLat = lat !== undefined ? lat : photo.lat;
      const newLon = lon !== undefined ? lon : photo.lon;
      db.prepare('UPDATE photos SET lat = ?, lon = ? WHERE id = ?').run(newLat, newLon, photo.id);
      dateChanged = true;
    }

    if (dateChanged) {
      runClustering();
    }

    const updated = db.prepare('SELECT * FROM photos WHERE id = ?').get(photo.id) as any;
    const cats = (
      db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?').all(photo.id) as Array<{ cat: string }>
    ).map((r) => r.cat);
    const friends = db.prepare(`
      SELECT pr.id, pr.name, pr.nick, pr.color
      FROM photo_persons pp
      JOIN persons pr ON pp.person_id = pr.id
      WHERE pp.photo_id = ?
    `).all(photo.id);

    return { ...updated, cats, friends };
  });

  // DELETE /api/photos/:id (AD3 / FR-405: DB + thumbnail only, original file NEVER touched)
  app.delete<{ Params: { id: string } }>('/api/photos/:id', async (req, reply) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as any;
    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }

    // Delete thumbnail file
    const thumbPath = path.join(THUMBS_DIR, `${photo.id}.jpg`);
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath);
      } catch (err) {
        console.error('Failed to delete thumbnail:', err);
      }
    }

    // Delete DB record (cascades photo_persons, photo_cats, faces)
    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
    ftsDelete('photo', photo.id);

    // Recluster
    runClustering();

    return { ok: true };
  });

  // PUT /api/photos/:id/cats
  app.put<{
    Params: { id: string };
    Body: { cats: string[] };
  }>('/api/photos/:id/cats', async (req, reply) => {
    const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }

    const { cats = [] } = req.body || {};

    const updateCats = db.transaction(() => {
      db.prepare('DELETE FROM photo_cats WHERE photo_id = ?').run(req.params.id);
      const insertCat = db.prepare('INSERT INTO photo_cats (photo_id, cat) VALUES (?, ?)');
      for (const cat of cats) {
        insertCat.run(req.params.id, cat);
      }
    });

    updateCats();

    return { cats };
  });

  // PUT /api/photos/:id/persons
  app.put<{
    Params: { id: string };
    Body: { persons: string[] };
  }>('/api/photos/:id/persons', async (req, reply) => {
    const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) {
      return reply.status(404).send({ error: 'Photo not found' });
    }

    const { persons = [] } = req.body || {};

    const updatePersons = db.transaction(() => {
      db.prepare('DELETE FROM photo_persons WHERE photo_id = ?').run(req.params.id);
      const insertPerson = db.prepare(
        'INSERT INTO photo_persons (photo_id, person_id, source) VALUES (?, ?, ?)'
      );
      for (const personId of persons) {
        insertPerson.run(req.params.id, personId, 'manual');
      }
    });

    updatePersons();

    return { persons };
  });
};
