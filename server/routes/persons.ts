// server/routes/persons.ts — Persons (Friends) CRUD, auto-stats, timeline, and Shared Album "X & ME" (FR-1402)
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert, ftsDelete } from '../db.js';
import { genId, FRIEND_PALETTE, autoEventName, formatThaiDate } from '../utils.js';

interface PersonBody {
  name: string;
  nick?: string;
  note?: string;
  color?: string;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createAlbumPdfBuffer(title: string, subtitle: string, stats: string, events: string[]): Buffer {
  const cleanTitle = title.replace(/[()\\]/g, '');
  const cleanSub = subtitle.replace(/[()\\]/g, '');
  const cleanStats = stats.replace(/[()\\]/g, '');

  const textLines = [
    `BT /F1 20 Tf 50 780 Td (${cleanTitle}) Tj ET`,
    `BT /F1 12 Tf 50 755 Td (${cleanSub}) Tj ET`,
    `BT /F1 11 Tf 50 730 Td (${cleanStats}) Tj ET`,
  ];

  let y = 690;
  for (const ev of events.slice(0, 15)) {
    const cleanEv = ev.replace(/[()\\]/g, '').slice(0, 90);
    textLines.push(`BT /F1 10 Tf 50 ${y} Td (${cleanEv}) Tj ET`);
    y -= 25;
  }

  const streamContent = textLines.join('\n') + '\n';
  const streamBuf = Buffer.from(streamContent, 'utf-8');

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamBuf.length} >>
stream
${streamContent}endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000315 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
400
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

function renderSharedAlbumHtml(person: any, stats: any, chapters: any[]): string {
  const firstMetStr = stats.first_met ? formatThaiDate(stats.first_met) : '-';
  const lastMetStr = stats.last_met ? formatThaiDate(stats.last_met) : '-';
  const daysKnownStr = stats.days_known !== null ? `${stats.days_known} วัน` : '-';
  const nickBadge = person.nick ? `<span class="nick-tag">(${escapeXml(person.nick)})</span>` : '';

  const chaptersHtml = chapters
    .map(
      (ch) => `
    <div class="chapter-card">
      <div class="chapter-header">
        <div class="chapter-title">
          <span class="sprocket">🎞️</span>
          <h3>${escapeXml(ch.event_name)}</h3>
          ${ch.place ? `<span class="chapter-place">📍 ${escapeXml(ch.place)}</span>` : ''}
        </div>
        <div class="chapter-date">${ch.date_str} (${ch.photos.length} รูป)</div>
      </div>
      <div class="photo-grid">
        ${ch.photos
          .map(
            (p: any) => `
          <div class="photo-card">
            <div class="photo-thumb-wrap">
              <img src="/api/thumbs/${p.id}" alt="${escapeXml(p.filename)}" loading="lazy" />
            </div>
            ${p.note ? `<div class="photo-note">${escapeXml(p.note)}</div>` : ''}
            <div class="photo-meta">${p.time_str}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ความทรงจำระหว่างเรา — ${escapeXml(person.name)} & ME</title>
  <style>
    :root {
      --bg: #12151B;
      --card-bg: #1A1E27;
      --text: #EDE7DA;
      --text-muted: #8E95A5;
      --accent: ${person.color || '#F0A63C'};
      --border: #2D3342;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "IBM Plex Sans Thai", sans-serif;
      padding: 32px 16px;
      line-height: 1.6;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    .album-header {
      background: linear-gradient(135deg, rgba(240, 166, 60, 0.12), rgba(34, 40, 54, 0.8));
      border: 1px solid var(--border);
      border-top: 4px solid var(--accent);
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 32px;
      position: relative;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .person-title {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--accent);
      color: #12151B;
      font-size: 28px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #FFF;
    }
    .nick-tag {
      font-size: 18px;
      color: var(--text-muted);
      font-weight: normal;
      margin-left: 8px;
    }
    .btn-print {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn-print:hover {
      background: var(--accent);
      color: #12151B;
      border-color: var(--accent);
    }
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px dashed var(--border);
    }
    .stat-box {
      background: rgba(0, 0, 0, 0.25);
      border-radius: 8px;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-val {
      font-size: 20px;
      font-weight: bold;
      color: var(--accent);
    }
    .chapter-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .chapter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 8px;
    }
    .chapter-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chapter-title h3 {
      font-size: 18px;
      color: #FFF;
    }
    .chapter-place {
      font-size: 13px;
      color: var(--accent);
      background: rgba(240, 166, 60, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .chapter-date {
      font-size: 13px;
      color: var(--text-muted);
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .photo-card {
      background: #14171E;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .photo-thumb-wrap {
      width: 100%;
      aspect-ratio: 4/3;
      background: #0D0F13;
      overflow: hidden;
    }
    .photo-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .photo-thumb-wrap img:hover {
      transform: scale(1.05);
    }
    .photo-note {
      padding: 8px 10px;
      font-size: 13px;
      color: var(--text);
      flex-grow: 1;
    }
    .photo-meta {
      padding: 4px 10px 8px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }
    .footer {
      text-align: center;
      padding: 32px 0 16px;
      color: var(--text-muted);
      font-size: 13px;
      border-top: 1px solid var(--border);
      margin-top: 48px;
    }
    @media print {
      body { background: #FFF; color: #111; }
      .album-header, .chapter-card, .photo-card { border-color: #DDD; background: #FFF; color: #111; box-shadow: none; }
      .btn-print { display: none; }
      .stat-val { color: #D97706; }
      .photo-grid { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="album-header">
      <div class="header-top">
        <div class="person-title">
          <div class="avatar">${escapeXml(person.name.charAt(0))}</div>
          <div>
            <h1>${escapeXml(person.name)} ${nickBadge} & ME</h1>
            <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">
              อัลบั้มบันทึกความทรงจำและมิตรภาพที่บันทึกร่วมกัน
            </p>
          </div>
        </div>
        <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
      </div>
      <div class="stats-bar">
        <div class="stat-box">
          <div class="stat-label">รูปถ่ายร่วมกัน</div>
          <div class="stat-val">${stats.photo_count} รูป</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">เหตุการณ์ที่ไปด้วยกัน</div>
          <div class="stat-val">${stats.event_count} ครั้ง</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">พบกันครั้งแรก</div>
          <div class="stat-val" style="font-size: 16px;">${firstMetStr}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">พบกันล่าสุด</div>
          <div class="stat-val" style="font-size: 16px;">${lastMetStr}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">มิตรภาพยาวนาน</div>
          <div class="stat-val">${daysKnownStr}</div>
        </div>
      </div>
    </div>

    <div class="timeline-chapters">
      ${chaptersHtml || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">ยังไม่มีรูปภาพร่วมกัน</p>'}
    </div>

    <div class="footer">
      สร้างโดย <strong>เรื่องราว 2026</strong> — Local-First Personal Journal
    </div>
  </div>
</body>
</html>`;
}

export const personsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/persons
  app.get('/api/persons', async () => {
    const items = db
      .prepare(`
        SELECT
          pr.id, pr.name, pr.nick, pr.note, pr.color, pr.created_at,
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count
        FROM persons pr
        LEFT JOIN photo_persons pp ON pr.id = pp.person_id AND pp.source != 'face-suggestion'
        LEFT JOIN photos p ON pp.photo_id = p.id AND p.event_id IS NOT NULL
        GROUP BY pr.id
        ORDER BY photo_count DESC, pr.name ASC
      `)
      .all();

    return { items };
  });

  // POST /api/persons
  app.post<{ Body: PersonBody }>('/api/persons', async (req, reply) => {
    const { name, nick = '', note = '', color } = req.body || {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const count = (
      db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
    ).c;
    const assignedColor = color || FRIEND_PALETTE[count % FRIEND_PALETTE.length];

    const id = genId();
    const createdAt = Date.now();

    db.prepare(`
      INSERT INTO persons (id, name, nick, note, color, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), nick.trim(), note.trim(), assignedColor, createdAt);

    // Update FTS
    const ftsText = [name.trim(), nick.trim(), note.trim()].filter(Boolean).join(' ');
    ftsUpsert('person', id, ftsText);

    const created = db.prepare('SELECT * FROM persons WHERE id = ?').get(id);
    return reply.status(201).send(created);
  });

  // GET /api/persons/:id (stats, timeline, photo grid) — FR-502 / FR-503 / AC-7
  app.get<{ Params: { id: string } }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    // Auto-stats: photos together, events together, first met, last met
    const stats = db
      .prepare(`
        SELECT
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count,
          MIN(p.taken_at) as first_met,
          MAX(p.taken_at) as last_met
        FROM photo_persons pp
        JOIN photos p ON pp.photo_id = p.id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion' AND p.taken_at IS NOT NULL
      `)
      .get(person.id) as any;

    // Timeline of events where they appear
    const timelineEvents = db
      .prepare(`
        SELECT DISTINCT
          e.id, e.name, e.place, e.note, e.ts_start, e.ts_end, e.lat, e.lon, e.named,
          (
            SELECT COUNT(*)
            FROM photos p2
            JOIN photo_persons pp2 ON p2.id = pp2.photo_id
            WHERE p2.event_id = e.id AND pp2.person_id = ? AND pp2.source != 'face-suggestion'
          ) as photo_count
        FROM events e
        JOIN photos p ON e.id = p.event_id
        JOIN photo_persons pp ON p.id = pp.photo_id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion'
        ORDER BY e.ts_start ASC
      `)
      .all(person.id, person.id) as any[];

    const timeline = timelineEvents.map((ev, index) => ({
      ...ev,
      displayName:
        ev.name && ev.name.trim() !== ''
          ? ev.name
          : ev.ts_start
          ? autoEventName(index + 1, ev.ts_start)
          : 'เหตุการณ์',
    }));

    // Photos tagged with this person
    const photos = db
      .prepare(`
        SELECT p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.event_id, p.note
        FROM photos p
        JOIN photo_persons pp ON p.id = pp.photo_id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion'
        ORDER BY p.taken_at ASC
      `)
      .all(person.id);

    return {
      ...person,
      stats: {
        photo_count: stats.photo_count || 0,
        event_count: stats.event_count || 0,
        first_met: stats.first_met ?? null,
        last_met: stats.last_met ?? null,
      },
      timeline,
      photos,
    };
  });

  // PATCH /api/persons/:id
  app.patch<{
    Params: { id: string };
    Body: Partial<PersonBody>;
  }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    const { name, nick, note, color } = req.body || {};

    const newName = name !== undefined ? name.trim() : person.name;
    const newNick = nick !== undefined ? nick.trim() : person.nick;
    const newNote = note !== undefined ? note.trim() : person.note;
    const newColor = color !== undefined ? color : person.color;

    db.prepare(`
      UPDATE persons
      SET name = ?, nick = ?, note = ?, color = ?
      WHERE id = ?
    `).run(newName, newNick, newNote, newColor, person.id);

    // Update FTS
    const ftsText = [newName, newNick, newNote].filter(Boolean).join(' ');
    ftsUpsert('person', person.id, ftsText);

    const updated = db.prepare('SELECT * FROM persons WHERE id = ?').get(person.id);
    return updated;
  });

  // DELETE /api/persons/:id (FR-505: removes tag associations, never touches photos)
  app.delete<{ Params: { id: string } }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(req.params.id);
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
    ftsDelete('person', req.params.id);

    return { ok: true };
  });

  // ── FR-1402: Shared Album "X & ME" ────────────────────────────
  const albumHandler = async (req: any, reply: any) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    // Query all photos with this person
    const photos = db
      .prepare(`
        SELECT
          p.id, p.filename, p.path, p.taken_at, p.lat, p.lon, p.burst, p.event_id, p.note,
          e.name as event_name, e.place as event_place, e.ts_start as event_ts_start
        FROM photos p
        JOIN photo_persons pp ON p.id = pp.photo_id
        LEFT JOIN events e ON p.event_id = e.id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion'
        ORDER BY p.taken_at ASC
      `)
      .all(person.id) as any[];

    // Calculate stats
    let firstMet: number | null = null;
    let lastMet: number | null = null;
    const eventIds = new Set<string>();

    for (const p of photos) {
      if (p.taken_at !== null) {
        if (firstMet === null || p.taken_at < firstMet) firstMet = p.taken_at;
        if (lastMet === null || p.taken_at > lastMet) lastMet = p.taken_at;
      }
      if (p.event_id) eventIds.add(p.event_id);
    }

    const daysKnown =
      firstMet !== null && lastMet !== null
        ? Math.max(1, Math.round((lastMet - firstMet) / (24 * 3600 * 1000)))
        : null;

    // Group into chapters by event
    const chapterMap = new Map<
      string,
      { event_id: string; event_name: string; place: string | null; date_str: string; photos: any[] }
    >();

    for (const p of photos) {
      const key = p.event_id || 'no_event';
      if (!chapterMap.has(key)) {
        const evName =
          p.event_name && p.event_name.trim()
            ? p.event_name
            : p.taken_at
            ? formatThaiDate(p.taken_at)
            : 'ความทรงจำร่วมกัน';
        const dateStr = p.taken_at ? formatThaiDate(p.taken_at) : '-';
        chapterMap.set(key, {
          event_id: p.event_id || '',
          event_name: evName,
          place: p.event_place || null,
          date_str: dateStr,
          photos: [],
        });
      }
      chapterMap.get(key)!.photos.push({
        id: p.id,
        filename: p.filename,
        taken_at: p.taken_at,
        note: p.note,
        time_str: p.taken_at
          ? new Date(p.taken_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
          : '',
      });
    }

    const chapters = Array.from(chapterMap.values());

    const stats = {
      photo_count: photos.length,
      event_count: eventIds.size,
      first_met: firstMet,
      last_met: lastMet,
      days_known: daysKnown,
    };

    return {
      person,
      stats,
      chapters,
      photos,
      export_urls: {
        html: `/api/persons/${person.id}/album/export?format=html`,
        pdf: `/api/persons/${person.id}/album/export?format=pdf`,
      },
    };
  };

  app.get('/api/persons/:id/album', albumHandler);
  app.get('/persons/:id/album', albumHandler);

  // GET /api/persons/:id/album/export?format=html|pdf
  const exportAlbumHandler = async (req: any, reply: any) => {
    const albumData = await albumHandler(req, reply);
    if (reply.sent) return;

    const format = ((req.query?.format as string) || 'html').toLowerCase();
    const { person, stats, chapters } = albumData;
    const filenameBase = `${person.name}_and_ME`;

    if (format === 'pdf') {
      const eventTitles = chapters.map(
        (c: any) => `* ${c.event_name} (${c.date_str}) - ${c.photos.length} photos`
      );
      const pdfBuf = createAlbumPdfBuffer(
        `${person.name} & ME`,
        `Memories & Friendship Shared Album`,
        `Photos: ${stats.photo_count} | Events: ${stats.event_count} | Days: ${stats.days_known ?? '-'}`,
        eventTitles
      );

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filenameBase)}.pdf"`)
        .send(pdfBuf);
    }

    // HTML export
    const html = renderSharedAlbumHtml(person, stats, chapters);
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(filenameBase)}.html"`)
      .send(html);
  };

  app.get('/api/persons/:id/album/export', exportAlbumHandler);
  app.get('/persons/:id/album/export', exportAlbumHandler);
};
