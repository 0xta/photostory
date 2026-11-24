// server/routes/insights.ts — Insights & On-This-Day (FR-1401, FR-1405, AC-32, AC-34)
import { FastifyPluginAsync } from 'fastify';
import db, { getSetting, getSettingNum } from '../db.js';
import { autoEventName } from '../utils.js';

export const insightsRoutes: FastifyPluginAsync = async (app) => {
  // ── FR-1405 / AC-34: On This Day (วันนี้ในอดีต) ────────────────
  // GET /api/on-this-day?date=YYYY-MM-DD
  const onThisDayHandler = async (req: any) => {
    let dateStr = req.query?.date as string | undefined;
    let targetDate: Date;

    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      targetDate = new Date(y, m - 1, d);
    } else {
      targetDate = new Date();
    }

    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const monthDay = `${m}-${d}`;
    const curYear = targetDate.getFullYear();

    // Query all photos where month and day match, but year is different (past years)
    const photos = db
      .prepare(`
        SELECT
          p.id, p.filename, p.path, p.taken_at, p.lat, p.lon, p.event_id, p.note, p.burst,
          e.name as event_name, e.place as event_place,
          CAST(strftime('%Y', datetime(p.taken_at / 1000, 'unixepoch')) AS INTEGER) as photo_year
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        WHERE p.taken_at IS NOT NULL
          AND strftime('%m-%d', datetime(p.taken_at / 1000, 'unixepoch')) = ?
          AND CAST(strftime('%Y', datetime(p.taken_at / 1000, 'unixepoch')) AS INTEGER) < ?
        ORDER BY p.taken_at DESC
      `)
      .all(monthDay, curYear) as Array<{
        id: string;
        filename: string;
        path: string;
        taken_at: number;
        lat: number | null;
        lon: number | null;
        event_id: string | null;
        note: string | null;
        burst: number;
        event_name: string | null;
        event_place: string | null;
        photo_year: number;
      }>;

    // Attach categories and friends for each photo
    const getCatsStmt = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?');
    const getFriendsStmt = db.prepare(`
      SELECT pr.id, pr.name, pr.nick, pr.color
      FROM photo_persons pp
      JOIN persons pr ON pp.person_id = pr.id
      WHERE pp.photo_id = ? AND pp.source != 'face-suggestion'
    `);

    // Group photos by year
    const yearMap = new Map<number, any[]>();
    for (const p of photos) {
      const cats = (getCatsStmt.all(p.id) as Array<{ cat: string }>).map((c) => c.cat);
      const friends = getFriendsStmt.all(p.id);
      const photoObj = {
        ...p,
        cats,
        friends,
      };

      if (!yearMap.has(p.photo_year)) {
        yearMap.set(p.photo_year, []);
      }
      yearMap.get(p.photo_year)!.push(photoObj);
    }

    const groups = Array.from(yearMap.entries())
      .sort(([y1], [y2]) => y2 - y1)
      .map(([year, yearPhotos]) => {
        // Collect distinct events in this year group
        const eventMap = new Map<string, { id: string; name: string; place: string | null }>();
        for (const yp of yearPhotos) {
          if (yp.event_id && !eventMap.has(yp.event_id)) {
            eventMap.set(yp.event_id, {
              id: yp.event_id,
              name: yp.event_name || 'เหตุการณ์',
              place: yp.event_place || null,
            });
          }
        }

        return {
          year,
          years_ago: curYear - year,
          photos: yearPhotos,
          events: Array.from(eventMap.values()),
        };
      });

    return {
      date: `${curYear}-${monthDay}`,
      month_day: monthDay,
      total_photos: photos.length,
      groups,
    };
  };

  app.get('/api/on-this-day', onThisDayHandler);
  app.get('/on-this-day', onThisDayHandler);

  // ── FR-1401 / AC-32: Relationship Insights (สถิติเพื่อน) ────────
  // GET /api/insights/relationships?year=2026&as_of=YYYY-MM-DD
  const relationshipsHandler = async (req: any) => {
    const defaultYear = getSetting('target_year') || '2026';
    const targetYear = parseInt(req.query?.year || defaultYear, 10);
    const lapsedMonthsThreshold = getSettingNum('lapsed_months') || 6;

    let asOfTs = Date.now();
    if (req.query?.as_of) {
      const parsed = Date.parse(req.query.as_of);
      if (!isNaN(parsed)) asOfTs = parsed;
    }

    // 1. Most-met friends this year (top friends by photo & event count in target year)
    const mostMetRows = db
      .prepare(`
        SELECT
          pr.id, pr.name, pr.nick, pr.note, pr.color,
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count
        FROM persons pr
        JOIN photo_persons pp ON pr.id = pp.person_id AND pp.source != 'face-suggestion'
        JOIN photos p ON pp.photo_id = p.id
        WHERE p.taken_at IS NOT NULL
          AND CAST(strftime('%Y', datetime(p.taken_at / 1000, 'unixepoch')) AS INTEGER) = ?
        GROUP BY pr.id
        ORDER BY photo_count DESC, event_count DESC, pr.name ASC
        LIMIT 10
      `)
      .all(targetYear) as Array<{
        id: string;
        name: string;
        nick: string;
        note: string;
        color: string;
        photo_count: number;
        event_count: number;
      }>;

    // 2. All persons with their overall first_met and last_met
    const personStats = db
      .prepare(`
        SELECT
          pr.id, pr.name, pr.nick, pr.note, pr.color,
          COUNT(DISTINCT pp.photo_id) as total_photos,
          COUNT(DISTINCT p.event_id) as total_events,
          MIN(p.taken_at) as first_met,
          MAX(p.taken_at) as last_met
        FROM persons pr
        JOIN photo_persons pp ON pr.id = pp.person_id AND pp.source != 'face-suggestion'
        JOIN photos p ON pp.photo_id = p.id
        WHERE p.taken_at IS NOT NULL
        GROUP BY pr.id
      `)
      .all() as Array<{
        id: string;
        name: string;
        nick: string;
        note: string;
        color: string;
        total_photos: number;
        total_events: number;
        first_met: number | null;
        last_met: number | null;
      }>;

    // 3. Lapsed friends (friends unseen >= lapsed_months from asOfTs)
    // 1 month approx = 30.4375 days = 2,629,800,000 ms
    const msPerMonth = 30.4375 * 24 * 3600 * 1000;
    const lapsedCutoff = asOfTs - lapsedMonthsThreshold * msPerMonth;

    const lapsedFriends = personStats
      .filter((p) => p.last_met !== null && p.last_met <= lapsedCutoff)
      .map((p) => {
        const diffMs = asOfTs - (p.last_met || 0);
        const monthsUnseen = Math.floor(diffMs / msPerMonth);
        return {
          ...p,
          months_unseen: monthsUnseen,
        };
      })
      .sort((a, b) => (a.last_met || 0) - (b.last_met || 0));

    // 4. Friendship anniversaries (e.g. 1-year anniversary of first_met)
    // Criteria: first_met exists, at least 1 year ago, and month/day is within ~14 days of asOfTs
    const asOfDate = new Date(asOfTs);
    const anniversaries = personStats
      .filter((p) => {
        if (!p.first_met) return false;
        const firstDate = new Date(p.first_met);
        const yearDiff = asOfDate.getFullYear() - firstDate.getFullYear();
        if (yearDiff < 1) return false;

        // Compare month & day of first_met with asOfDate
        const firstMetThisYear = new Date(asOfDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()).getTime();
        const diffDays = Math.abs(asOfTs - firstMetThisYear) / (24 * 3600 * 1000);
        return diffDays <= 14; // Within +/- 14 days of anniversary
      })
      .map((p) => {
        const firstDate = new Date(p.first_met!);
        const years = asOfDate.getFullYear() - firstDate.getFullYear();
        return {
          ...p,
          years,
          first_met_date: firstDate.toISOString().slice(0, 10),
        };
      })
      .sort((a, b) => b.years - a.years);

    return {
      year: targetYear,
      lapsed_threshold_months: lapsedMonthsThreshold,
      most_met: mostMetRows,
      lapsed: lapsedFriends,
      anniversaries,
    };
  };

  app.get('/api/insights/relationships', relationshipsHandler);
  app.get('/insights/relationships', relationshipsHandler);

  // ── FR-1403: Social Graph (แผนผังเครือข่ายเพื่อน) ────────────────
  const socialGraphHandler = async () => {
    // 1. Fetch nodes (Persons)
    const persons = db
      .prepare(`
        SELECT
          pr.id, pr.name, pr.nick, pr.color, pr.note,
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count
        FROM persons pr
        LEFT JOIN photo_persons pp ON pr.id = pp.person_id AND pp.source != 'face-suggestion'
        LEFT JOIN photos p ON pp.photo_id = p.id
        GROUP BY pr.id
        ORDER BY photo_count DESC, pr.name ASC
      `)
      .all() as any[];

    // 2. Fetch shared photos
    const sharedPhotos = db
      .prepare(`
        SELECT
          pp1.person_id as p1,
          pp2.person_id as p2,
          COUNT(DISTINCT pp1.photo_id) as shared_photos
        FROM photo_persons pp1
        JOIN photo_persons pp2 ON pp1.photo_id = pp2.photo_id AND pp1.person_id < pp2.person_id
        WHERE pp1.source != 'face-suggestion' AND pp2.source != 'face-suggestion'
        GROUP BY pp1.person_id, pp2.person_id
      `)
      .all() as Array<{ p1: string; p2: string; shared_photos: number }>;

    const sharedPhotoMap = new Map<string, number>();
    for (const sp of sharedPhotos) {
      sharedPhotoMap.set(`${sp.p1}__${sp.p2}`, sp.shared_photos);
    }

    // 3. Fetch shared events
    const sharedEventsRows = db
      .prepare(`
        SELECT
          pp1.person_id as p1,
          pp2.person_id as p2,
          p1.event_id,
          e.name as event_name,
          e.place as event_place,
          e.ts_start
        FROM photo_persons pp1
        JOIN photos p1 ON pp1.photo_id = p1.id
        JOIN photo_persons pp2 ON pp1.person_id < pp2.person_id
        JOIN photos p2 ON pp2.photo_id = p2.id AND p1.event_id = p2.event_id
        LEFT JOIN events e ON p1.event_id = e.id
        WHERE p1.event_id IS NOT NULL
          AND pp1.source != 'face-suggestion'
          AND pp2.source != 'face-suggestion'
        GROUP BY pp1.person_id, pp2.person_id, p1.event_id
        ORDER BY e.ts_start ASC
      `)
      .all() as Array<{
        p1: string;
        p2: string;
        event_id: string;
        event_name: string | null;
        event_place: string | null;
        ts_start: number | null;
      }>;

    // Group shared events by pair
    const pairMap = new Map<
      string,
      {
        source: string;
        target: string;
        shared_events: Array<{ id: string; name: string; place: string | null; ts_start: number | null }>;
        shared_photos_count: number;
        weight: number;
      }
    >();

    for (const row of sharedEventsRows) {
      const key = `${row.p1}__${row.p2}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          source: row.p1,
          target: row.p2,
          shared_events: [],
          shared_photos_count: sharedPhotoMap.get(key) || 0,
          weight: 0,
        });
      }
      const pair = pairMap.get(key)!;
      pair.shared_events.push({
        id: row.event_id,
        name: row.event_name || 'เหตุการณ์',
        place: row.event_place || null,
        ts_start: row.ts_start,
      });
      pair.weight = pair.shared_events.length;
    }

    // Also include pairs that share photos but whose event_id was null
    for (const sp of sharedPhotos) {
      const key = `${sp.p1}__${sp.p2}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          source: sp.p1,
          target: sp.p2,
          shared_events: [],
          shared_photos_count: sp.shared_photos,
          weight: Math.max(1, Math.round(sp.shared_photos / 2)),
        });
      }
    }

    const edges = Array.from(pairMap.values()).sort(
      (a, b) => b.weight - a.weight || b.shared_photos_count - a.shared_photos_count
    );

    return {
      nodes: persons,
      edges,
      stats: {
        total_nodes: persons.length,
        total_edges: edges.length,
        active_connections: edges.filter((e) => e.weight > 0).length,
      },
    };
  };

  app.get('/api/insights/social-graph', socialGraphHandler);
  app.get('/insights/social-graph', socialGraphHandler);

  // ── FR-1406 / AC-34: Personal Life Map & Heatmap (แผนที่ชีวิต) ────
  const mapHandler = async (req: any) => {
    const yearParam = req.query?.year;
    const catParam = req.query?.cat;

    const conditions: string[] = ['p.lat IS NOT NULL', 'p.lon IS NOT NULL'];
    const params: any[] = [];

    if (yearParam) {
      conditions.push("CAST(strftime('%Y', datetime(p.taken_at / 1000, 'unixepoch')) AS INTEGER) = ?");
      params.push(parseInt(yearParam, 10));
    }
    if (catParam) {
      conditions.push('p.id IN (SELECT photo_id FROM photo_cats WHERE cat = ?)');
      params.push(catParam);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 1. Grouped coordinate frequency for heatmap
    const heatRows = db
      .prepare(`
        SELECT
          ROUND(p.lat, 4) as lat,
          ROUND(p.lon, 4) as lon,
          COUNT(*) as count
        FROM photos p
        ${whereClause}
        GROUP BY ROUND(p.lat, 4), ROUND(p.lon, 4)
        ORDER BY count DESC
      `)
      .all(...params) as Array<{ lat: number; lon: number; count: number }>;

    let maxCount = 1;
    for (const h of heatRows) {
      if (h.count > maxCount) maxCount = h.count;
    }

    const heatmap = heatRows.map((h) => ({
      lat: h.lat,
      lon: h.lon,
      count: h.count,
      intensity: Math.min(1.0, Math.round((h.count / maxCount) * 100) / 100),
    }));

    // 2. Most-visited places
    const mostVisited = db
      .prepare(`
        SELECT
          COALESCE(pl.name, e.place, 'จุดพิกัด ' || ROUND(p.lat, 3) || ', ' || ROUND(p.lon, 3)) as name,
          ROUND(p.lat, 3) as lat,
          ROUND(p.lon, 3) as lon,
          COUNT(DISTINCT p.id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count,
          MIN(p.taken_at) as first_visit,
          MAX(p.taken_at) as last_visit
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        LEFT JOIN photo_places pp ON p.id = pp.photo_id
        LEFT JOIN places pl ON pp.place_id = pl.id
        ${whereClause}
        GROUP BY ROUND(p.lat, 3), ROUND(p.lon, 3)
        ORDER BY photo_count DESC
        LIMIT 10
      `)
      .all(...params) as any[];

    // 3. Events with GPS
    const gpsEvents = db
      .prepare(`
        SELECT
          e.id, e.name, e.place, e.lat, e.lon, e.ts_start, e.ts_end,
          (SELECT COUNT(*) FROM photos WHERE event_id = e.id) as photo_count
        FROM events e
        WHERE e.lat IS NOT NULL AND e.lon IS NOT NULL
        ORDER BY photo_count DESC
      `)
      .all() as any[];

    // 4. Bounds and center
    let minLat = 90,
      maxLat = -90,
      minLon = 180,
      maxLon = -180;
    let sumLat = 0,
      sumLon = 0,
      totalGps = 0;

    for (const h of heatRows) {
      if (h.lat < minLat) minLat = h.lat;
      if (h.lat > maxLat) maxLat = h.lat;
      if (h.lon < minLon) minLon = h.lon;
      if (h.lon > maxLon) maxLon = h.lon;
      sumLat += h.lat * h.count;
      sumLon += h.lon * h.count;
      totalGps += h.count;
    }

    const center = totalGps > 0 ? [sumLat / totalGps, sumLon / totalGps] : [13.7563, 100.5018]; // Default Bangkok

    return {
      heatmap,
      most_visited: mostVisited,
      events: gpsEvents,
      summary: {
        total_gps_photos: totalGps,
        unique_points: heatRows.length,
        total_gps_events: gpsEvents.length,
        max_heat: maxCount,
        bounds:
          totalGps > 0
            ? { min_lat: minLat, max_lat: maxLat, min_lon: minLon, max_lon: maxLon }
            : null,
        center,
      },
    };
  };

  app.get('/api/map', mapHandler);
  app.get('/map', mapHandler);
  app.get('/api/map/heatmap', mapHandler);
};
