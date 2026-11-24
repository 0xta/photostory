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
};
