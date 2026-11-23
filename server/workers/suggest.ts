// server/workers/suggest.ts — Rule & Semantic Suggestion Engine (Phase 1.5 & Phase 2)
import db, { getSetting } from '../db.js';
import { genId, haversine } from '../utils.js';
import { guessMealType } from '../routes/meals.js';
import { isMlEnabled, normalizeVector, EMBED_DIM } from './embed.js';
import { clusterFaces } from './face.js';

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

  // ── Rule 4: Meal Grouping (Algorithm 8.6 / FR-1101 / AC-22 / AC-23) ─
  const mealGapMin = Number(getSetting('meal_gap_min') || '90');
  const mealGapMs = mealGapMin * 60 * 1000;
  const placeRadiusM = Number(getSetting('place_radius_m') || '120');

  // Candidate photos: category 'อาหาร' OR ('บรรยากาศ' in same event/time)
  // Not already in meal_photos
  const foodPhotos = db
    .prepare(`
      SELECT p.id, p.filename, p.taken_at, p.lat, p.lon, p.event_id, pc.cat
      FROM photos p
      JOIN photo_cats pc ON p.id = pc.photo_id
      WHERE pc.cat = 'อาหาร'
        AND p.taken_at IS NOT NULL
        AND p.id NOT IN (SELECT photo_id FROM meal_photos)
      ORDER BY p.taken_at ASC
    `)
    .all() as Array<{
      id: string;
      filename: string;
      taken_at: number;
      lat: number | null;
      lon: number | null;
      event_id: string | null;
      cat: string;
    }>;

  const atmospherePhotos = db
    .prepare(`
      SELECT p.id, p.filename, p.taken_at, p.lat, p.lon, p.event_id, pc.cat
      FROM photos p
      JOIN photo_cats pc ON p.id = pc.photo_id
      WHERE pc.cat = 'บรรยากาศ'
        AND p.taken_at IS NOT NULL
        AND p.id NOT IN (SELECT photo_id FROM meal_photos)
        AND p.id NOT IN (SELECT photo_id FROM photo_cats WHERE cat = 'อาหาร')
      ORDER BY p.taken_at ASC
    `)
    .all() as Array<{
      id: string;
      filename: string;
      taken_at: number;
      lat: number | null;
      lon: number | null;
      event_id: string | null;
      cat: string;
    }>;

  // An atmosphere photo is included if within mealGapMs of any food photo
  // and (if both have GPS) within placeRadiusM
  const matchingAtmos = atmospherePhotos.filter((atmos) => {
    return foodPhotos.some((food) => {
      const timeDiff = Math.abs(atmos.taken_at - food.taken_at);
      if (timeDiff > mealGapMs) return false;
      if (atmos.lat != null && atmos.lon != null && food.lat != null && food.lon != null) {
        const distKm = haversine({ lat: atmos.lat, lon: atmos.lon }, { lat: food.lat, lon: food.lon });
        if (distKm * 1000 > placeRadiusM) return false;
      }
      return true;
    });
  });

  // Combine candidates and sort by taken_at
  const allCandidates = [...foodPhotos, ...matchingAtmos].sort((a, b) => a.taken_at - b.taken_at);

  // Group candidates into clusters by time gap and GPS distance
  const mealGroups: Array<typeof allCandidates> = [];
  let currentGroup: typeof allCandidates = [];

  for (const photo of allCandidates) {
    if (currentGroup.length === 0) {
      currentGroup.push(photo);
      continue;
    }

    const prevPhoto = currentGroup[currentGroup.length - 1];
    const eventChanged = Boolean(photo.event_id && prevPhoto.event_id && photo.event_id !== prevPhoto.event_id);
    const timeDiff = photo.taken_at - prevPhoto.taken_at;

    let gpsDistanceExceeded = false;
    if (photo.lat != null && photo.lon != null) {
      const photosWithGps = currentGroup.filter((p) => p.lat != null && p.lon != null);
      if (photosWithGps.length > 0) {
        const cLat = photosWithGps.reduce((s, p) => s + p.lat!, 0) / photosWithGps.length;
        const cLon = photosWithGps.reduce((s, p) => s + p.lon!, 0) / photosWithGps.length;
        const distKm = haversine({ lat: photo.lat, lon: photo.lon }, { lat: cLat, lon: cLon });
        if (distKm * 1000 > placeRadiusM) {
          gpsDistanceExceeded = true;
        }
      }
    }

    if (eventChanged || timeDiff > mealGapMs || gpsDistanceExceeded) {
      mealGroups.push(currentGroup);
      currentGroup = [photo];
    } else {
      currentGroup.push(photo);
    }
  }

  if (currentGroup.length > 0) {
    mealGroups.push(currentGroup);
  }

  // Filter groups: must have at least one 'อาหาร' photo
  const validMealGroups = mealGroups.filter((g) => g.some((p) => p.cat === 'อาหาร'));

  // All places for restaurant / place reuse (DR8)
  const allPlaces = db
    .prepare('SELECT id, name, lat, lon, radius_m, type FROM places')
    .all() as Array<{ id: string; name: string; lat: number | null; lon: number | null; radius_m: number; type: string }>;

  for (const group of validMealGroups) {
    const photoIds = group.map((p) => p.id);

    // Check if any photo in this group is already in an existing meal suggestion
    const alreadySuggested = suggestionExists('meal', (p) => {
      const existingIds = p.photo_ids || [];
      return photoIds.some((id) => existingIds.includes(id));
    });

    if (alreadySuggested) continue;

    // Determine centroid GPS of group
    const gpsPhotos = group.filter((p) => p.lat != null && p.lon != null);
    let matchedPlace: { id: string; name: string } | null = null;

    if (gpsPhotos.length > 0) {
      const cLat = gpsPhotos.reduce((s, p) => s + p.lat!, 0) / gpsPhotos.length;
      const cLon = gpsPhotos.reduce((s, p) => s + p.lon!, 0) / gpsPhotos.length;

      let bestDist = Infinity;
      for (const place of allPlaces) {
        if (place.lat != null && place.lon != null) {
          const distKm = haversine({ lat: cLat, lon: cLon }, { lat: place.lat, lon: place.lon });
          const distM = distKm * 1000;
          if (distM <= (place.radius_m || 120)) {
            // Prefer restaurants, then smallest distance
            const score = (place.type === 'restaurant' ? 0 : 1000) + distM;
            if (score < bestDist) {
              bestDist = score;
              matchedPlace = { id: place.id, name: place.name };
            }
          }
        }
      }
    }

    const firstTakenAt = group[0].taken_at;
    const mealType = guessMealType(firstTakenAt);

    const mealTypeTh =
      mealType === 'breakfast'
        ? 'อาหารเช้า'
        : mealType === 'lunch'
        ? 'อาหารกลางวัน'
        : mealType === 'dinner'
        ? 'อาหารเย็น'
        : 'ของว่าง/คาเฟ่';

    const title = matchedPlace
      ? `บันทึกมื้อ${mealTypeTh}ที่ "${matchedPlace.name}" (${group.length} รูป)`
      : `บันทึกมื้อ${mealTypeTh}ใหม่ (${group.length} รูป)`;

    const reason = matchedPlace
      ? `ตรวจพบรูปอาหารและบรรยากาศ ${group.length} รูป ในบริเวณร้าน "${matchedPlace.name}"`
      : `ตรวจพบรูปอาหารและบรรยากาศ ${group.length} รูป ถ่ายในช่วงเวลาใกล้เคียงกัน (${mealTypeTh})`;

    const payload = {
      photo_ids: photoIds,
      photo_count: group.length,
      place_id: matchedPlace ? matchedPlace.id : null,
      place_name: matchedPlace ? matchedPlace.name : null,
      suggested_restaurant: matchedPlace ? matchedPlace.name : null,
      meal_type: mealType,
      taken_at: firstTakenAt,
      event_id: group[0].event_id || null,
      title,
      reason,
    };

    insertStmt.run(genId(), 'meal', JSON.stringify(payload), now);
    addedCount++;
  }

  // ── Rule 5: Semantic Collection Suggestions (Algorithm 8.9 / Phase 2) ─
  if (isMlEnabled()) {
    try {
      const semanticThreshold = Number(getSetting('semantic_coll_cosine') || '0.30');
      const allTopicCollections = db
        .prepare("SELECT id, name FROM collections WHERE type = 'topic'")
        .all() as Array<{ id: string; name: string }>;

      for (const coll of allTopicCollections) {
        // Fetch embeddings of member photos
        const memberVecRows = db
          .prepare(`
            SELECT pv.emb FROM collection_photos cp
            JOIN photo_vec pv ON cp.photo_id = pv.photo_id
            WHERE cp.collection_id = ?
          `)
          .all(coll.id) as Array<{ emb: any }>;

        if (memberVecRows.length > 0) {
          // Compute collection centroid = mean of member photo vectors (normalized)
          const centroid = new Float32Array(EMBED_DIM);
          for (const row of memberVecRows) {
            const v =
              row.emb instanceof Float32Array
                ? row.emb
                : new Float32Array(row.emb.buffer, row.emb.byteOffset, row.emb.byteLength / 4);
            for (let i = 0; i < EMBED_DIM; i++) {
              centroid[i] += v[i];
            }
          }
          normalizeVector(centroid);

          // In sqlite-vec, distance = 1 - cosine
          const maxDistance = 1 - semanticThreshold;
          const candidates = db
            .prepare(`
              SELECT photo_id, distance
              FROM photo_vec
              WHERE emb MATCH ? AND k = 15
            `)
            .all(centroid) as Array<{ photo_id: string; distance: number }>;

          for (const cand of candidates) {
            if (cand.distance <= maxDistance) {
              // Check if already in collection
              const isMember = db
                .prepare('SELECT 1 FROM collection_photos WHERE collection_id = ? AND photo_id = ?')
                .get(coll.id, cand.photo_id);

              if (!isMember) {
                const alreadySuggested = suggestionExists('collection_semantic', (p) => {
                  return p.collection_id === coll.id && p.photo_id === cand.photo_id;
                });

                if (!alreadySuggested) {
                  const photo = db
                    .prepare('SELECT filename FROM photos WHERE id = ?')
                    .get(cand.photo_id) as { filename: string } | undefined;

                  const similarityPct = Math.round((1 - cand.distance) * 100);
                  const payload = {
                    collection_id: coll.id,
                    collection_name: coll.name,
                    photo_id: cand.photo_id,
                    photo_filename: photo?.filename || cand.photo_id,
                    similarity: similarityPct,
                    title: `เพิ่มรูปเข้าเรื่องราว "${coll.name}" (แนะนำจากความคล้ายคลึง)`,
                    reason: `รูป "${photo?.filename}" มีลักษณะภาพใกล้เคียงกับเรื่องราวนี้ (${similarityPct}% ความคล้าย)`,
                  };

                  insertStmt.run(genId(), 'collection_semantic', JSON.stringify(payload), now);
                  addedCount++;
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Semantic collection suggestions skipped:', err);
    }
  }

  // ── Rule 5: Face Clusters (Algorithm 8.4 / Phase 3) ─────────
  try {
    const faceRes = clusterFaces();
  } catch (err) {
    console.warn('Face clustering suggestion scan skipped:', err);
  }

  return { added: addedCount };
}
