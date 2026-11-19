// server/workers/cluster.ts — Event clustering (8.1) and burst detection (8.2)
import db, { getSettingNum, ftsUpsert } from '../db.js';
import { haversine, genId } from '../utils.js';

export interface ClusterResult {
  events: number;
  photos: number;
}

interface PhotoRecord {
  id: string;
  taken_at: number;
  lat: number | null;
  lon: number | null;
  event_id: string | null;
}

interface ClusterGroup {
  photos: PhotoRecord[];
  lastTs: number;
  centroid: { lat: number; lon: number } | null;
  n: number;
  sumLat: number;
  sumLon: number;
}

/**
 * Recluster all dated photos into events based on time-gap and GPS-distance.
 * Also detects bursts (consecutive dated photos <= burst_ms apart).
 * Dateless photos (taken_at IS NULL) get event_id = NULL.
 * Preserves owner-entered event fields (name, place, note, named).
 */
export function runClustering(): ClusterResult {
  const gapHours = getSettingNum('gap_hours') || 4;
  const distKm = getSettingNum('dist_km') || 2;
  const burstMs = getSettingNum('burst_ms') || 2000;
  const gapMs = gapHours * 3600 * 1000;

  // 1. Fetch all photos sorted by taken_at
  const photos = db
    .prepare('SELECT id, taken_at, lat, lon, event_id FROM photos ORDER BY taken_at ASC')
    .all() as PhotoRecord[];

  // Map old event assignments to preserve user edits
  const oldEventOfPhoto = new Map<string, string | null>();
  for (const p of photos) {
    oldEventOfPhoto.set(p.id, p.event_id);
  }

  // Reset bursts and dateless photos' event_id
  db.prepare('UPDATE photos SET burst = 0').run();
  db.prepare('UPDATE photos SET event_id = NULL WHERE taken_at IS NULL').run();

  const datedPhotos = photos.filter((p) => p.taken_at != null && p.taken_at > 0);

  // 2. Burst detection (Algorithm 8.2)
  if (datedPhotos.length > 1) {
    const burstPhotoIds = new Set<string>();
    for (let i = 1; i < datedPhotos.length; i++) {
      const prev = datedPhotos[i - 1];
      const cur = datedPhotos[i];
      if (cur.taken_at - prev.taken_at <= burstMs) {
        burstPhotoIds.add(prev.id);
        burstPhotoIds.add(cur.id);
      }
    }
    if (burstPhotoIds.size > 0) {
      const setBurstStmt = db.prepare('UPDATE photos SET burst = 1 WHERE id = ?');
      const updateBursts = db.transaction((ids: string[]) => {
        for (const id of ids) {
          setBurstStmt.run(id);
        }
      });
      updateBursts(Array.from(burstPhotoIds));
    }
  }

  // 3. Cluster dated photos (Algorithm 8.1)
  const clusters: ClusterGroup[] = [];
  let cur: ClusterGroup | null = null;

  for (const p of datedPhotos) {
    const hasGps = p.lat != null && p.lon != null;

    if (cur !== null) {
      const farTime = p.taken_at - cur.lastTs > gapMs;
      let farGps = false;
      if (hasGps && cur.centroid !== null) {
        const dist = haversine(
          { lat: p.lat!, lon: p.lon! },
          cur.centroid
        );
        if (dist > distKm) {
          farGps = true;
        }
      }

      if (farTime || farGps) {
        clusters.push(cur);
        cur = null;
      }
    }

    if (cur === null) {
      cur = {
        photos: [],
        lastTs: p.taken_at,
        centroid: null,
        n: 0,
        sumLat: 0,
        sumLon: 0,
      };
    }

    cur.photos.push(p);
    cur.lastTs = p.taken_at;

    if (hasGps) {
      cur.n++;
      cur.sumLat += p.lat!;
      cur.sumLon += p.lon!;
      cur.centroid = {
        lat: cur.sumLat / cur.n,
        lon: cur.sumLon / cur.n,
      };
    }
  }

  if (cur !== null) {
    clusters.push(cur);
  }

  // 4. Match clusters to existing events and preserve fields (FR-203)
  const usedEvents = new Set<string>();
  const getEventStmt = db.prepare('SELECT * FROM events WHERE id = ?');
  const insertEventStmt = db.prepare(`
    INSERT INTO events (id, name, place, note, ts_start, ts_end, lat, lon, named)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateEventStmt = db.prepare(`
    UPDATE events
    SET ts_start = ?, ts_end = ?, lat = ?, lon = ?
    WHERE id = ?
  `);
  const assignPhotoStmt = db.prepare('UPDATE photos SET event_id = ? WHERE id = ?');

  const reclusterTx = db.transaction(() => {
    for (const c of clusters) {
      let matchedEventId: string | null = null;

      // Find first existing event via member photos' previous event_id
      for (const p of c.photos) {
        const oldId = oldEventOfPhoto.get(p.id);
        if (oldId && !usedEvents.has(oldId)) {
          const ev = getEventStmt.get(oldId);
          if (ev) {
            matchedEventId = oldId;
            break;
          }
        }
      }

      const tsStart = c.photos[0].taken_at;
      const tsEnd = c.photos[c.photos.length - 1].taken_at;
      const lat = c.centroid?.lat ?? null;
      const lon = c.centroid?.lon ?? null;

      if (!matchedEventId) {
        matchedEventId = genId();
        insertEventStmt.run(
          matchedEventId,
          '',
          '',
          '',
          tsStart,
          tsEnd,
          lat,
          lon,
          0
        );
      } else {
        updateEventStmt.run(tsStart, tsEnd, lat, lon, matchedEventId);
      }

      usedEvents.add(matchedEventId);

      // Assign all member photos to this event
      for (const p of c.photos) {
        assignPhotoStmt.run(matchedEventId, p.id);
      }
    }

    // Prune events that have 0 photos
    const emptyEvents = db
      .prepare(`
        SELECT id FROM events
        WHERE id NOT IN (SELECT DISTINCT event_id FROM photos WHERE event_id IS NOT NULL)
      `)
      .all() as Array<{ id: string }>;

    const deleteEventStmt = db.prepare('DELETE FROM events WHERE id = ?');
    for (const ev of emptyEvents) {
      deleteEventStmt.run(ev.id);
    }
  });

  reclusterTx();

  // 5. Update FTS for events
  const allEvents = db
    .prepare('SELECT id, name, place, note FROM events')
    .all() as Array<{ id: string; name: string; place: string; note: string }>;
  for (const ev of allEvents) {
    const text = [ev.name, ev.place, ev.note].filter(Boolean).join(' ');
    ftsUpsert('event', ev.id, text);
  }

  const eventCount = (
    db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }
  ).c;

  return {
    events: eventCount,
    photos: photos.length,
  };
}
