// server/workers/suggest.ts — Rule-based Suggestion Engine (Phase 1.5, No AI)
import db, { getSetting } from '../db.js';
import { genId, haversine } from '../utils.js';

interface SuggestionRow {
  id: string;
  kind: string;
  payload: string;
  status: string;
  created_at: number;
}

/**
 * Check if a suggestion with the exact matching key payload fields already exists
 * (pending, accepted, or dismissed) to guarantee idempotency (DR10).
 */
function suggestionExists(kind: string, keyChecker: (p: any) => boolean): boolean {
  const existing = db.prepare('SELECT payload FROM suggestions WHERE kind = ?').all(kind) as Array<{
    payload: string;
  }>;
  for (const row of existing) {
    try {
      const parsed = JSON.parse(row.payload);
      if (keyChecker(parsed)) return true;
    } catch {
      // skip invalid payload
    }
  }
  return false;
}

/**
 * Runs rule-based suggestion scans (FR-1004 / Section 8.9 / 9.6).
 */
export function runSuggestionScan(): { added: number } {
  let addedCount = 0;
  const now = Date.now();

  const insertStmt = db.prepare(`
    INSERT INTO suggestions (id, kind, payload, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `);

  // ── Rule 1: Topic Collection Membership (FR-1004 / AC-21) ───────────
  // When photos categorized matching an existing topic collection are not yet members
  const topicCollections = db
    .prepare('SELECT id, name, type, note FROM collections WHERE type = \'topic\'')
    .all() as Array<{ id: string; name: string; type: string; note: string }>;

  for (const coll of topicCollections) {
    // Find categories mentioned in collection name or note (e.g. อาหาร, บรรยากาศ, ฯลฯ)
    const matchingCats = db
      .prepare(`
        SELECT DISTINCT pc.photo_id, pc.cat, p.filename, p.taken_at
        FROM photo_cats pc
        JOIN photos p ON pc.photo_id = p.id
        WHERE (? LIKE '%' || pc.cat || '%' OR ? LIKE '%' || pc.cat || '%')
          AND pc.photo_id NOT IN (
            SELECT photo_id FROM collection_photos WHERE collection_id = ?
          )
        ORDER BY p.taken_at DESC
        LIMIT 20
      `)
      .all(coll.name, coll.note, coll.id) as Array<{
        photo_id: string;
        cat: string;
        filename: string;
        taken_at: number | null;
      }>;

    for (const match of matchingCats) {
      const alreadySuggested = suggestionExists('collection_topic', (p) => {
        return p.collection_id === coll.id && p.photo_id === match.photo_id;
      });

      if (!alreadySuggested) {
        const payload = {
          collection_id: coll.id,
          collection_name: coll.name,
          photo_id: match.photo_id,
          photo_filename: match.filename,
          category: match.cat,
          title: `เพิ่มรูปเข้าเรื่องราว "${coll.name}"`,
          reason: `รูป "${match.filename}" ติดแท็กหมวด "${match.cat}" ตรงกับเรื่องราวนี้`,
        };

        insertStmt.run(genId(), 'collection_topic', JSON.stringify(payload), now);
        addedCount++;
      }
    }
  }

  // ── Rule 2: Suggest Creating New Collection for Category Milestones ─
  // If user has >= 5 photos in a category but no collection exists for that category yet
  const catCounts = db
    .prepare(`
      SELECT cat, COUNT(*) as count
      FROM photo_cats
      GROUP BY cat
      HAVING count >= 5
    `)
    .all() as Array<{ cat: string; count: number }>;

  for (const { cat, count } of catCounts) {
    // Check if a collection already has this category name
    const collExists = db
      .prepare('SELECT id FROM collections WHERE name LIKE ?')
      .get(`%${cat}%`);

    if (!collExists) {
      const alreadySuggested = suggestionExists('collection_create', (p) => p.category === cat);
      if (!alreadySuggested) {
        const samplePhotos = db
          .prepare(`
            SELECT photo_id FROM photo_cats
            WHERE cat = ?
            LIMIT 10
          `)
          .all(cat) as Array<{ photo_id: string }>;

        const photoIds = samplePhotos.map((s) => s.photo_id);
        const payload = {
          category: cat,
          title: `สร้างคอลเลกชันเรื่องราว "${cat}"`,
          suggested_name: `เรื่องราว ${cat} 2026`,
          photo_ids: photoIds,
          reason: `คุณมีรูปหมวดหมู่ "${cat}" ถึง ${count} รูป อยากสร้างเป็นเรื่องราวรวมไว้ไหม?`,
        };

        insertStmt.run(genId(), 'collection_create', JSON.stringify(payload), now);
        addedCount++;
      }
    }
  }

  // ── Rule 3: Place GPS Matching (Algorithm 8.7 / FR-1202 / AC-24) ───
  const placesWithGps = db
    .prepare('SELECT id, name, lat, lon, radius_m FROM places WHERE lat IS NOT NULL AND lon IS NOT NULL')
    .all() as Array<{ id: string; name: string; lat: number; lon: number; radius_m: number }>;

  if (placesWithGps.length > 0) {
    const unlinkedGpsPhotos = db
      .prepare(`
        SELECT p.id, p.filename, p.lat, p.lon, p.taken_at
        FROM photos p
        WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
          AND p.id NOT IN (SELECT photo_id FROM photo_places)
        ORDER BY p.taken_at DESC
        LIMIT 100
      `)
      .all() as Array<{ id: string; filename: string; lat: number; lon: number; taken_at: number | null }>;

    const autoLinkSetting = getSetting('auto_link_places') === '1';

    for (const photo of unlinkedGpsPhotos) {
      let nearestPlace: { id: string; name: string; distM: number } | null = null;

      for (const place of placesWithGps) {
        const distKm = haversine(
          { lat: photo.lat, lon: photo.lon },
          { lat: place.lat, lon: place.lon }
        );
        const distM = distKm * 1000;
        if (distM <= place.radius_m) {
          if (!nearestPlace || distM < nearestPlace.distM) {
            nearestPlace = { id: place.id, name: place.name, distM };
          }
        }
      }

      if (nearestPlace) {
        if (autoLinkSetting) {
          // Auto-link with source 'gps-confirmed' (FR-1202 / AC-24)
          db.prepare(`
            INSERT OR REPLACE INTO photo_places (photo_id, place_id, source)
            VALUES (?, ?, 'gps-confirmed')
          `).run(photo.id, nearestPlace.id);

          // If this place is a project place with an auto-created collection, also link to collection
          const linkedColl = db
            .prepare('SELECT id FROM collections WHERE place_id = ? LIMIT 1')
            .get(nearestPlace.id) as { id: string } | undefined;
          if (linkedColl) {
            db.prepare(`
              INSERT OR IGNORE INTO collection_photos (collection_id, photo_id, added_by, added_at)
              VALUES (?, ?, 'rule', ?)
            `).run(linkedColl.id, photo.id, now);
          }
        } else {
          // Emit suggestion { kind: 'place_link' }
          const alreadySuggested = suggestionExists('place_link', (p) => {
            return p.place_id === nearestPlace!.id && p.photo_id === photo.id;
          });

          if (!alreadySuggested) {
            const payload = {
              place_id: nearestPlace.id,
              place_name: nearestPlace.name,
              photo_id: photo.id,
              photo_filename: photo.filename,
              distance_m: Math.round(nearestPlace.distM),
              title: `ผูกรูปภาพกับสถานที่ "${nearestPlace.name}"`,
              reason: `รูป "${photo.filename}" ถ่ายห่างจาก "${nearestPlace.name}" เพียง ${Math.round(nearestPlace.distM)} เมตร`,
            };

            insertStmt.run(genId(), 'place_link', JSON.stringify(payload), now);
            addedCount++;
          }
        }
      }
    }
  }

  return { added: addedCount };
}
