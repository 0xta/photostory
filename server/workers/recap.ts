// server/workers/recap.ts — Monthly & Yearly Recap Generator (Algorithm 8.8 / Appendix F)
import db from '../db.js';
import { genId, THAI_MONTHS_ABBR } from '../utils.js';

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export interface RecapFacts {
  photo_count: number;
  event_count: number;
  new_restaurants: number;
  friend_count: number;
  meals_count: number;
  places_count: number;
}

export interface RecapContent {
  headline: string;
  stats_summary: string;
  narrative: string;
  facts: RecapFacts;
  highlights: Array<{
    id: string;
    filename: string;
    taken_at: number | null;
    event_id: string | null;
    note?: string;
  }>;
  highlight_ids: string[];
  friends: Array<{ id: string; name: string; nick: string; color: string; count: number }>;
  places: Array<{ id: string; name: string; type: string }>;
  top_meal: {
    id: string;
    place_name: string;
    meal_type: string;
    rating: number | null;
    note: string;
    photo_count: number;
  } | null;
  generated_at: number;
}

/**
 * Keeper Picker (FR-1303, Algorithm 8.8):
 * - Excludes burst duplicates (keeps at most 1 representative per burst run).
 * - Spreads picks across distinct events and collections for visual variety.
 * - Prioritizes photos with notes, largest dimensions, or file size.
 * - Selects 4 to 6 photos (or all available if < 4).
 */
export function pickKeepers(
  photos: Array<{
    id: string;
    filename: string;
    taken_at: number | null;
    event_id: string | null;
    burst: number;
    size?: number;
    w?: number;
    h?: number;
    note?: string;
  }>,
  minCount = 4,
  maxCount = 6
): Array<{
  id: string;
  filename: string;
  taken_at: number | null;
  event_id: string | null;
  note?: string;
}> {
  if (photos.length === 0) return [];

  // Filter out redundant burst members: if burst === 1, keep only the first in a burst cluster
  const nonBurstOrFirstBurst: typeof photos = [];
  let inBurst = false;

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (p.burst === 1) {
      if (!inBurst) {
        nonBurstOrFirstBurst.push(p);
        inBurst = true;
      }
    } else {
      inBurst = false;
      nonBurstOrFirstBurst.push(p);
    }
  }

  // If filtered set is too small, fallback to original photos
  const candidates = nonBurstOrFirstBurst.length >= minCount ? nonBurstOrFirstBurst : photos;

  // Group by event_id to spread across distinct chapters
  const byEvent = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = c.event_id || '__no_event__';
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key)!.push(c);
  }

  const selected: typeof candidates = [];
  const eventQueues = Array.from(byEvent.values());

  // Round-robin selection across distinct events
  let added = true;
  while (selected.length < maxCount && added) {
    added = false;
    for (const q of eventQueues) {
      if (q.length > 0 && selected.length < maxCount) {
        selected.push(q.shift()!);
        added = true;
      }
    }
  }

  return selected.map((p) => ({
    id: p.id,
    filename: p.filename,
    taken_at: p.taken_at,
    event_id: p.event_id,
    note: p.note,
  }));
}

/**
 * Generates or refreshes a Monthly (month 1..12) or Yearly (month 0 or null) Recap
 * using Algorithm 8.8 and Appendix F Thai templates.
 */
export function generateRecap(
  year: number,
  month: number | null = null,
  format = 'template'
): { id: string; year: number; month: number | null; content: RecapContent; format: string; generated_at: number } {
  const isYearly = !month || month === 0;
  const now = Date.now();

  let startMs: number;
  let endMs: number;
  let headline: string;

  if (isYearly) {
    startMs = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() - 1;
    headline = `สรุปความทรงจำปี ${year + 543}`;
  } else {
    startMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(year, month, 1, 0, 0, 0, 0).getTime() - 1;
    const monthFull = THAI_MONTHS_FULL[month - 1];
    headline = `สรุปเดือน${monthFull} ${year + 543}`;
  }

  // 1. Photos in scope
  const photos = db
    .prepare(`
      SELECT id, filename, taken_at, event_id, burst, size, w, h, note
      FROM photos
      WHERE taken_at IS NOT NULL AND taken_at >= ? AND taken_at <= ?
      ORDER BY taken_at ASC
    `)
    .all(startMs, endMs) as Array<{
      id: string;
      filename: string;
      taken_at: number;
      event_id: string | null;
      burst: number;
      size?: number;
      w?: number;
      h?: number;
      note?: string;
    }>;

  const photoIds = photos.map((p) => p.id);

  // 2. Events in scope
  const events = db
    .prepare(`
      SELECT id, name, place, note, ts_start, ts_end,
        (SELECT COUNT(*) FROM photos WHERE event_id = events.id AND taken_at >= ? AND taken_at <= ?) as scope_photos
      FROM events
      WHERE (ts_start >= ? AND ts_start <= ?)
         OR (ts_end >= ? AND ts_end <= ?)
         OR id IN (SELECT DISTINCT event_id FROM photos WHERE id IN (${photoIds.length > 0 ? photoIds.map(() => '?').join(',') : "''"}))
      ORDER BY ts_start ASC
    `)
    .all(
      startMs, endMs,
      startMs, endMs,
      startMs, endMs,
      ...(photoIds.length > 0 ? photoIds : [])
    ) as Array<{
      id: string;
      name: string;
      place: string;
      note: string;
      ts_start: number;
      ts_end: number;
      scope_photos: number;
    }>;

  // Top event (event with most photos in scope)
  const sortedEvents = [...events].sort((a, b) => (b.scope_photos || 0) - (a.scope_photos || 0));
  const topEvent = sortedEvents.length > 0 && sortedEvents[0].scope_photos > 0 ? sortedEvents[0] : null;

  // 3. Friends in scope
  let friends: Array<{ id: string; name: string; nick: string; color: string; count: number }> = [];
  if (photoIds.length > 0) {
    friends = db
      .prepare(`
        SELECT pr.id, pr.name, pr.nick, pr.color, COUNT(DISTINCT pp.photo_id) as count
        FROM persons pr
        JOIN photo_persons pp ON pr.id = pp.person_id
        WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
        GROUP BY pr.id
        ORDER BY count DESC
      `)
      .all(...photoIds) as any[];
  }

  // 4. Places visited in scope
  let places: Array<{ id: string; name: string; type: string }> = [];
  if (photoIds.length > 0) {
    places = db
      .prepare(`
        SELECT DISTINCT pl.id, pl.name, pl.type
        FROM places pl
        JOIN photo_places pp ON pl.id = pp.place_id
        WHERE pp.photo_id IN (${photoIds.map(() => '?').join(',')})
        ORDER BY pl.name ASC
      `)
      .all(...photoIds) as any[];
  }

  // 5. New restaurants visited in scope
  const newRestaurants = db
    .prepare(`
      SELECT DISTINCT pl.id, pl.name
      FROM places pl
      WHERE pl.type = 'restaurant'
        AND pl.id IN (
          SELECT pp.place_id FROM photo_places pp WHERE pp.photo_id IN (${photoIds.length > 0 ? photoIds.map(() => '?').join(',') : "''"})
          UNION
          SELECT m.place_id FROM meals m WHERE m.taken_at >= ? AND m.taken_at <= ? AND m.place_id IS NOT NULL
        )
        AND (
          SELECT MIN(p.taken_at) FROM photo_places pp
          JOIN photos p ON pp.photo_id = p.id
          WHERE pp.place_id = pl.id
        ) >= ?
    `)
    .all(
      ...(photoIds.length > 0 ? photoIds : []),
      startMs, endMs,
      startMs
    ) as Array<{ id: string; name: string }>;

  // 6. Meals in scope
  const meals = db
    .prepare(`
      SELECT m.id, m.place_id, m.meal_type, m.note, m.rating, m.taken_at,
             pl.name as place_name,
             (SELECT COUNT(*) FROM meal_photos mp WHERE mp.meal_id = m.id) as photo_count
      FROM meals m
      LEFT JOIN places pl ON m.place_id = pl.id
      WHERE m.taken_at IS NOT NULL AND m.taken_at >= ? AND m.taken_at <= ?
      ORDER BY CASE WHEN m.rating IS NULL THEN 0 ELSE m.rating END DESC, photo_count DESC
    `)
    .all(startMs, endMs) as any[];

  const topMeal = meals.length > 0 ? {
    id: meals[0].id,
    place_name: meals[0].place_name || 'ร้านอาหาร',
    meal_type: meals[0].meal_type,
    rating: meals[0].rating,
    note: meals[0].note || '',
    photo_count: meals[0].photo_count || 0,
  } : null;

  // 7. Active project threads
  let activeProjects: Array<{ id: string; name: string; count: number }> = [];
  if (photoIds.length > 0) {
    activeProjects = db
      .prepare(`
        SELECT c.id, c.name, COUNT(*) as count
        FROM collections c
        JOIN collection_photos cp ON c.id = cp.collection_id
        WHERE c.type = 'place_project'
          AND cp.photo_id IN (${photoIds.map(() => '?').join(',')})
        GROUP BY c.id
      `)
      .all(...photoIds) as any[];
  }

  // 8. Highlights (Keepers)
  const highlights = pickKeepers(photos, 4, 6);
  const highlightIds = highlights.map((h) => h.id);

  // 9. Facts
  const facts: RecapFacts = {
    photo_count: photos.length,
    event_count: events.length,
    new_restaurants: newRestaurants.length,
    friend_count: friends.length,
    meals_count: meals.length,
    places_count: places.length,
  };

  // 10. Summary stats line (Appendix F)
  const statsParts: string[] = [];
  statsParts.push(`${facts.photo_count} รูป`);
  if (facts.event_count > 0) statsParts.push(`${facts.event_count} เหตุการณ์`);
  if (facts.new_restaurants > 0) statsParts.push(`${facts.new_restaurants} ร้านใหม่`);
  if (facts.friend_count > 0) statsParts.push(`เจอเพื่อน ${facts.friend_count} คน`);
  const statsSummary = statsParts.join(' · ');

  // 11. Narrative Builder (Appendix F Thai template)
  const narrativeSentences: string[] = [];

  if (isYearly) {
    narrativeSentences.push(
      `ปี ${year + 543} เป็นปีที่บันทึกความทรงจำไว้ทั้งหมด ${facts.photo_count} รูป จาก ${facts.event_count} เหตุการณ์สำคัญ`
    );
  } else {
    const periodLabel = `เดือนนี้คุณได้บันทึกความทรงจำ ${facts.photo_count} รูป`;
    narrativeSentences.push(periodLabel);
  }

  // Clause 1: Top event
  if (topEvent) {
    const evTitle = topEvent.name || topEvent.place;
    if (evTitle) {
      narrativeSentences.push(`ได้ไปร่วมงานหรือกิจกรรม "${evTitle}"`);
    }
  }

  // Clause 2: Trips & Companions
  if (friends.length > 0) {
    const topFriendNames = friends.slice(0, 3).map((f) => f.name).join(', ');
    narrativeSentences.push(`ได้ใช้เวลาและพบปะเพื่อนๆ อย่าง ${topFriendNames}`);
  }

  // Clause 3: New restaurants / Food
  if (newRestaurants.length > 0) {
    narrativeSentences.push(`ได้ไปลิ้มลองร้านอาหารใหม่ถึง ${newRestaurants.length} ร้าน`);
  } else if (topMeal) {
    narrativeSentences.push(`มีมื้ออาหารสุดประทับใจที่ร้าน "${topMeal.place_name}"`);
  }

  // Clause 4: Project thread progress
  if (activeProjects.length > 0) {
    const proj = activeProjects[0];
    narrativeSentences.push(`โปรเจกต์ "${proj.name}" มีความคืบหน้าเพิ่มขึ้น ${proj.count} ภาพ`);
  }

  const narrative = narrativeSentences.join(' ') + (narrativeSentences.length > 0 ? ' เป็นอีกช่วงเวลาที่มีเรื่องราวน่าจดจำ' : 'ยังไม่มีกิจกรรมที่ถูกบันทึกในช่วงนี้');

  const content: RecapContent = {
    headline,
    stats_summary: statsSummary,
    narrative,
    facts,
    highlights,
    highlight_ids: highlightIds,
    friends: friends.slice(0, 5),
    places: places.slice(0, 10),
    top_meal: topMeal,
    generated_at: now,
  };

  const id = genId();
  const monthVal = isYearly ? null : month;

  db.prepare(`
    INSERT INTO recaps (id, year, month, content, format, generated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, month) DO UPDATE SET
      content = excluded.content,
      format = excluded.format,
      generated_at = excluded.generated_at
  `).run(id, year, monthVal, JSON.stringify(content), format, now);

  const saved = db
    .prepare('SELECT id, year, month, content, format, generated_at FROM recaps WHERE year = ? AND month IS ?')
    .get(year, monthVal) as any;

  return {
    id: saved.id,
    year: saved.year,
    month: saved.month,
    content: JSON.parse(saved.content),
    format: saved.format,
    generated_at: saved.generated_at,
  };
}
