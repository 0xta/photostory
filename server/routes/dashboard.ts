// server/routes/dashboard.ts — Dashboard stats, monthly histogram, queue, top friends
import { FastifyPluginAsync } from 'fastify';
import db, { getSetting } from '../db.js';
import { autoEventName } from '../utils.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/dashboard?year=2026
  app.get<{ Querystring: { year?: string } }>('/api/dashboard', async (req) => {
    const defaultYear = getSetting('target_year') || '2026';
    const targetYear = req.query.year || defaultYear;
    const yearNum = parseInt(targetYear, 10);

    // 1. Totals (FR-701)
    const totalPhotos = (
      db.prepare('SELECT COUNT(*) as c FROM photos').get() as { c: number }
    ).c;
    const totalEvents = (
      db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }
    ).c;
    const totalPersons = (
      db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
    ).c;
    const totalCollections = (
      db.prepare('SELECT COUNT(*) as c FROM collections').get() as { c: number }
    ).c;
    const totalPlaces = (
      db.prepare('SELECT COUNT(*) as c FROM places').get() as { c: number }
    ).c;
    const totalMeals = (
      db.prepare('SELECT COUNT(*) as c FROM meals').get() as { c: number }
    ).c;

    const taggedPhotosCount = (
      db
        .prepare(`
          SELECT COUNT(DISTINCT id) as c FROM photos
          WHERE id IN (SELECT photo_id FROM photo_cats)
             OR id IN (SELECT photo_id FROM photo_persons)
        `)
        .get() as { c: number }
    ).c;

    const taggedPct = totalPhotos > 0 ? Math.round((taggedPhotosCount / totalPhotos) * 100) : 0;

    // 2. Monthly histogram for target year (FR-702)
    // 12 bars (Jan=index 0..Dec=index 11)
    const monthsHistogram = new Array(12).fill(0);
    const monthRows = db
      .prepare(`
        SELECT
          CAST(strftime('%m', datetime(taken_at / 1000, 'unixepoch')) AS INTEGER) as m,
          COUNT(*) as count
        FROM photos
        WHERE taken_at IS NOT NULL
          AND CAST(strftime('%Y', datetime(taken_at / 1000, 'unixepoch')) AS INTEGER) = ?
        GROUP BY m
      `)
      .all(yearNum) as Array<{ m: number; count: number }>;

    for (const row of monthRows) {
      if (row.m >= 1 && row.m <= 12) {
        monthsHistogram[row.m - 1] = row.count;
      }
    }

    // 3. Top friends by photo count (top 5) (FR-703)
    const topFriends = db
      .prepare(`
        SELECT pr.id, pr.name, pr.nick, pr.color, COUNT(DISTINCT pp.photo_id) as photo_count
        FROM persons pr
        JOIN photo_persons pp ON pr.id = pp.person_id
        GROUP BY pr.id
        ORDER BY photo_count DESC
        LIMIT 5
      `)
      .all();

    // 4. Review queue: "รอคุณเติมข้อมูล" (FR-704)
    const datelessCount = (
      db.prepare('SELECT COUNT(*) as c FROM photos WHERE taken_at IS NULL').get() as { c: number }
    ).c;

    const unnamedCount = (
      db.prepare("SELECT COUNT(*) as c FROM events WHERE named = 0 OR name = ''").get() as { c: number }
    ).c;

    const burstCount = (
      db.prepare('SELECT COUNT(*) as c FROM photos WHERE burst = 1').get() as { c: number }
    ).c;

    // 5. Recent events (latest 3) (FR-705)
    const recentEvents = db
      .prepare(`
        SELECT
          e.id, e.name, e.place, e.note, e.ts_start, e.ts_end, e.lat, e.lon, e.named,
          (SELECT COUNT(*) FROM photos WHERE event_id = e.id) as photo_count,
          (SELECT COUNT(DISTINCT pp.person_id) FROM photos p JOIN photo_persons pp ON p.id = pp.photo_id WHERE p.event_id = e.id) as friend_count
        FROM events e
        ORDER BY e.ts_start DESC
        LIMIT 3
      `)
      .all() as any[];

    const getCoversStmt = db.prepare(
      'SELECT id FROM photos WHERE event_id = ? ORDER BY taken_at ASC LIMIT 4'
    );

    const recent = recentEvents.map((ev, index) => {
      const covers = (getCoversStmt.all(ev.id) as Array<{ id: string }>).map((c) => c.id);
      const displayName =
        ev.name && ev.name.trim() !== ''
          ? ev.name
          : ev.ts_start
          ? autoEventName(index + 1, ev.ts_start)
          : 'เหตุการณ์';

      return {
        ...ev,
        displayName,
        cover_ids: covers,
      };
    });

    const pendingSuggestionsCount = (
      db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE status = 'pending'").get() as { c: number }
    ).c;

    return {
      totals: {
        photos: totalPhotos,
        events: totalEvents,
        persons: totalPersons,
        collections: totalCollections,
        places: totalPlaces,
        meals: totalMeals,
        tagged_pct: taggedPct,
      },
      target_year: yearNum,
      months: monthsHistogram,
      top_friends: topFriends,
      queue: {
        dateless: datelessCount,
        unnamed: unnamedCount,
        burst: burstCount,
        tagged_pct: taggedPct,
        pending_suggestions: pendingSuggestionsCount,
      },
      recent_events: recent,
    };
  });
};
