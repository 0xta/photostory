// server/routes/backup.ts — Metadata JSON backup, restore, and clear
import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import db, { THUMBS_DIR, ftsUpsert } from '../db.js';
import { runClustering } from '../workers/cluster.js';

export const backupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/backup (FR-801, AC-29)
  app.get('/api/backup', async (_req, reply) => {
    const photos = db.prepare('SELECT * FROM photos').all();
    const events = db.prepare('SELECT * FROM events').all();
    const persons = db.prepare('SELECT * FROM persons').all();
    const photoPersons = db.prepare('SELECT * FROM photo_persons').all();
    const photoCats = db.prepare('SELECT * FROM photo_cats').all();
    const collections = db.prepare('SELECT * FROM collections').all();
    const collectionPhotos = db.prepare('SELECT * FROM collection_photos').all();
    const places = db.prepare('SELECT * FROM places').all();
    const photoPlaces = db.prepare('SELECT * FROM photo_places').all();
    const meals = db.prepare('SELECT * FROM meals').all();
    const mealPhotos = db.prepare('SELECT * FROM meal_photos').all();
    const recaps = db.prepare('SELECT * FROM recaps').all();

    const backupData = {
      version: '2.0',
      exported_at: Date.now(),
      photos,
      events,
      persons,
      photo_persons: photoPersons,
      photo_cats: photoCats,
      collections,
      collection_photos: collectionPhotos,
      places,
      photo_places: photoPlaces,
      meals,
      meal_photos: mealPhotos,
      recaps,
    };

    reply.header('Content-Disposition', `attachment; filename="story-backup-${Date.now()}.json"`);
    return backupData;
  });

  // POST /api/restore (FR-802 / AC-11 / AC-29)
  app.post<{ Body: any }>('/api/restore', async (req, reply) => {
    const backup = req.body as any;
    if (!backup || !Array.isArray(backup.photos)) {
      return reply.status(400).send({ error: 'Invalid backup JSON format' });
    }

    let matchedPhotos = 0;
    let personsRestored = 0;
    let eventsRestored = 0;
    let collectionsRestored = 0;
    let placesRestored = 0;
    let mealsRestored = 0;

    const restoreTx = db.transaction(() => {
      // 1. Restore persons
      if (Array.isArray(backup.persons)) {
        const insertPerson = db.prepare(`
          INSERT OR REPLACE INTO persons (id, name, nick, note, color, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const p of backup.persons) {
          insertPerson.run(p.id, p.name, p.nick || '', p.note || '', p.color || '#E56B50', p.created_at || Date.now());
          const ftsText = [p.name, p.nick, p.note].filter(Boolean).join(' ');
          ftsUpsert('person', p.id, ftsText);
          personsRestored++;
        }
      }

      // 2. Restore photo metadata matched by sha256
      const findPhotoBySha = db.prepare('SELECT id FROM photos WHERE sha256 = ?');
      const updatePhoto = db.prepare('UPDATE photos SET note = ?, taken_at = ? WHERE id = ?');
      const insertCat = db.prepare('INSERT OR IGNORE INTO photo_cats (photo_id, cat) VALUES (?, ?)');
      const insertPerson = db.prepare(
        'INSERT OR IGNORE INTO photo_persons (photo_id, person_id, source) VALUES (?, ?, ?)'
      );

      const oldToNewPhotoId = new Map<string, string>();

      for (const p of backup.photos) {
        let currentId: string | undefined;
        if (p.sha256) {
          const current = findPhotoBySha.get(p.sha256) as { id: string } | undefined;
          if (current) currentId = current.id;
        }
        if (!currentId && p.id) {
          const byId = db.prepare('SELECT id FROM photos WHERE id = ?').get(p.id) as { id: string } | undefined;
          if (byId) currentId = byId.id;
        }
        if (currentId) {
          oldToNewPhotoId.set(p.id, currentId);
          updatePhoto.run(p.note || '', p.taken_at, currentId);
          if (p.note) {
            ftsUpsert('photo', currentId, `${p.filename} ${p.note}`.trim());
          }
          matchedPhotos++;
        }
      }

      // 3. Restore tags (categories and persons)
      if (Array.isArray(backup.photo_cats)) {
        for (const pc of backup.photo_cats) {
          const newPhotoId = oldToNewPhotoId.get(pc.photo_id);
          if (newPhotoId) {
            insertCat.run(newPhotoId, pc.cat);
          }
        }
      }

      if (Array.isArray(backup.photo_persons)) {
        for (const pp of backup.photo_persons) {
          const newPhotoId = oldToNewPhotoId.get(pp.photo_id);
          if (newPhotoId) {
            insertPerson.run(newPhotoId, pp.person_id, pp.source || 'manual');
          }
        }
      }

      // 4. Restore places & photo_places (AC-29)
      if (Array.isArray(backup.places)) {
        const insertPlace = db.prepare(`
          INSERT OR REPLACE INTO places (id, name, type, lat, lon, radius_m, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const pl of backup.places) {
          insertPlace.run(
            pl.id,
            pl.name,
            pl.type || 'other',
            pl.lat ?? null,
            pl.lon ?? null,
            pl.radius_m ?? 120,
            pl.note || '',
            pl.created_at || Date.now()
          );
          const ftsText = [pl.name, pl.note].filter(Boolean).join(' ');
          ftsUpsert('place', pl.id, ftsText);
          placesRestored++;
        }
      }

      if (Array.isArray(backup.photo_places)) {
        const insertPhotoPlace = db.prepare(`
          INSERT OR IGNORE INTO photo_places (photo_id, place_id, source)
          VALUES (?, ?, ?)
        `);
        for (const pp of backup.photo_places) {
          const newPhotoId = oldToNewPhotoId.get(pp.photo_id);
          if (newPhotoId) {
            insertPhotoPlace.run(newPhotoId, pp.place_id, pp.source || 'manual');
          }
        }
      }

      // 5. Restore collections & collection_photos (AC-29)
      if (Array.isArray(backup.collections)) {
        const insertCollection = db.prepare(`
          INSERT OR REPLACE INTO collections (id, name, type, note, cover_photo_id, place_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of backup.collections) {
          const mappedCover = c.cover_photo_id ? (oldToNewPhotoId.get(c.cover_photo_id) || c.cover_photo_id) : null;
          insertCollection.run(
            c.id,
            c.name,
            c.type || 'topic',
            c.note || '',
            mappedCover,
            c.place_id || null,
            c.created_at || Date.now()
          );
          ftsUpsert('collection', c.id, c.name);
          collectionsRestored++;
        }
      }

      if (Array.isArray(backup.collection_photos)) {
        const insertCollPhoto = db.prepare(`
          INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const cp of backup.collection_photos) {
          const newPhotoId = oldToNewPhotoId.get(cp.photo_id);
          if (newPhotoId) {
            insertCollPhoto.run(cp.collection_id, newPhotoId, cp.added_by || cp.source || 'manual', cp.added_at || Date.now());
          }
        }
      }

      // 6. Restore meals & meal_photos (AC-29)
      if (Array.isArray(backup.meals)) {
        const insertMeal = db.prepare(`
          INSERT OR REPLACE INTO meals (id, place_id, event_id, meal_type, note, rating, taken_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of backup.meals) {
          insertMeal.run(
            m.id,
            m.place_id || null,
            m.event_id || null,
            m.meal_type || 'other',
            m.note || '',
            m.rating ?? null,
            m.taken_at || null,
            m.created_at || Date.now()
          );
          const ftsText = [m.meal_type, m.note].filter(Boolean).join(' ');
          ftsUpsert('meal', m.id, ftsText);
          mealsRestored++;
        }
      }

      if (Array.isArray(backup.meal_photos)) {
        const insertMealPhoto = db.prepare(`
          INSERT OR IGNORE INTO meal_photos (meal_id, photo_id)
          VALUES (?, ?)
        `);
        for (const mp of backup.meal_photos) {
          const newPhotoId = oldToNewPhotoId.get(mp.photo_id);
          if (newPhotoId) {
            insertMealPhoto.run(mp.meal_id, newPhotoId);
          }
        }
      }

      // 7. Restore recaps (AC-29)
      if (Array.isArray(backup.recaps)) {
        const insertRecap = db.prepare(`
          INSERT OR REPLACE INTO recaps (id, year, month, content, format, generated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const r of backup.recaps) {
          insertRecap.run(r.id, r.year, r.month ?? null, r.content, r.format || 'template', r.generated_at || Date.now());
        }
      }
    });

    restoreTx();

    // 8. Recluster to form events
    runClustering();

    // 9. Restore event metadata by matching ts_start (+-1s / 1000ms)
    if (Array.isArray(backup.events)) {
      const allCurrentEvents = db.prepare('SELECT * FROM events').all() as any[];
      const updateEvent = db.prepare(`
        UPDATE events
        SET name = ?, place = ?, note = ?, named = ?
        WHERE id = ?
      `);

      for (const oldEv of backup.events) {
        if (!oldEv.ts_start) continue;
        const matched = allCurrentEvents.find(
          (cur) => Math.abs(cur.ts_start - oldEv.ts_start) <= 1000
        );
        if (matched) {
          const isNamed = oldEv.name && oldEv.name.trim() !== '' ? 1 : (oldEv.named || 0);
          updateEvent.run(oldEv.name || '', oldEv.place || '', oldEv.note || '', isNamed, matched.id);
          const ftsText = [oldEv.name, oldEv.place, oldEv.note].filter(Boolean).join(' ');
          ftsUpsert('event', matched.id, ftsText);
          eventsRestored++;
        }
      }
    }

    return {
      matched: matchedPhotos,
      matched_photos: matchedPhotos,
      persons_restored: personsRestored,
      events_restored: eventsRestored,
      collections_restored: collectionsRestored,
      places_restored: placesRestored,
      meals_restored: mealsRestored,
    };
  });

  // POST /api/clear (FR-803: clears database and thumbnails, never touches original files)
  app.post('/api/clear', async () => {
    // 1. Delete all thumbnails from disk
    if (fs.existsSync(THUMBS_DIR)) {
      const files = fs.readdirSync(THUMBS_DIR);
      for (const f of files) {
        try {
          fs.unlinkSync(path.join(THUMBS_DIR, f));
        } catch {}
      }
    }

    // 2. Clear tables
    const clearTx = db.transaction(() => {
      db.prepare('DELETE FROM photo_persons').run();
      db.prepare('DELETE FROM photo_cats').run();
      db.prepare('DELETE FROM collection_photos').run();
      db.prepare('DELETE FROM photo_places').run();
      db.prepare('DELETE FROM meal_photos').run();
      db.prepare('DELETE FROM meals').run();
      db.prepare('DELETE FROM collections').run();
      db.prepare('DELETE FROM places').run();
      db.prepare('DELETE FROM recaps').run();
      db.prepare('DELETE FROM suggestions').run();
      db.prepare('DELETE FROM faces').run();
      db.prepare('DELETE FROM photos').run();
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM persons').run();
      db.prepare('DELETE FROM search_fts').run();
    });

    clearTx();

    return { ok: true };
  });
};
