// server/routes/backup.ts — Metadata JSON backup, restore, and clear
import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import db, { THUMBS_DIR, ftsUpsert } from '../db.js';
import { runClustering } from '../workers/cluster.js';

export const backupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/backup (FR-801)
  app.get('/api/backup', async (_req, reply) => {
    const photos = db.prepare('SELECT * FROM photos').all();
    const events = db.prepare('SELECT * FROM events').all();
    const persons = db.prepare('SELECT * FROM persons').all();
    const photoPersons = db.prepare('SELECT * FROM photo_persons').all();
    const photoCats = db.prepare('SELECT * FROM photo_cats').all();
    const collections = db.prepare('SELECT * FROM collections').all();
    const places = db.prepare('SELECT * FROM places').all();
    const meals = db.prepare('SELECT * FROM meals').all();

    const backupData = {
      version: '2.0',
      exported_at: Date.now(),
      photos,
      events,
      persons,
      photo_persons: photoPersons,
      photo_cats: photoCats,
      collections,
      places,
      meals,
    };

    reply.header('Content-Disposition', `attachment; filename="story-backup-${Date.now()}.json"`);
    return backupData;
  });

  // POST /api/restore (FR-802 / AC-11)
  app.post<{ Body: any }>('/api/restore', async (req, reply) => {
    const backup = req.body as any;
    if (!backup || !Array.isArray(backup.photos)) {
      return reply.status(400).send({ error: 'Invalid backup JSON format' });
    }

    let matchedPhotos = 0;
    let personsRestored = 0;
    let eventsRestored = 0;

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
        if (!p.sha256) continue;
        const current = findPhotoBySha.get(p.sha256) as { id: string } | undefined;
        if (current) {
          oldToNewPhotoId.set(p.id, current.id);
          updatePhoto.run(p.note || '', p.taken_at, current.id);
          if (p.note) {
            ftsUpsert('photo', current.id, `${p.filename} ${p.note}`.trim());
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
    });

    restoreTx();

    // 4. Recluster to form events
    runClustering();

    // 5. Restore event metadata by matching ts_start (+-1s / 1000ms)
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
      matched_photos: matchedPhotos,
      persons_restored: personsRestored,
      events_restored: eventsRestored,
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
