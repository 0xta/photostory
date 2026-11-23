// server/routes/recaps.ts — Monthly & Yearly Recap Routes (Phase 1.5D)
import { FastifyPluginAsync } from 'fastify';
import sharp from 'sharp';
import db from '../db.js';
import { generateRecap, THAI_MONTHS_FULL, RecapContent } from '../workers/recap.js';

function createPdfBuffer(title: string, stats: string, narrative: string): Buffer {
  const cleanTitle = title.replace(/[()\\]/g, '');
  const cleanStats = stats.replace(/[()\\]/g, '');
  const cleanNarrative = narrative.replace(/[()\\]/g, '');

  const textLines = [
    `BT /F1 18 Tf 50 780 Td (${cleanTitle}) Tj ET`,
    `BT /F1 12 Tf 50 750 Td (${cleanStats}) Tj ET`,
    `BT /F1 10 Tf 50 710 Td (${cleanNarrative.slice(0, 100)}) Tj ET`,
    cleanNarrative.length > 100
      ? `BT /F1 10 Tf 50 690 Td (${cleanNarrative.slice(100, 200)}) Tj ET`
      : '',
  ].filter(Boolean).join('\n');

  const streamContent = textLines + '\n';
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

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createImageBuffer(content: RecapContent): Promise<Buffer> {
  const headline = escapeXml(content.headline);
  const stats = escapeXml(content.stats_summary);
  const narrative = escapeXml(content.narrative);

  // SVG representation rendered as PNG via sharp
  const svg = `<svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="100%" stop-color="#27272a"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" rx="16" fill="url(#bg)"/>
  <rect x="24" y="24" width="752" height="452" rx="12" fill="none" stroke="#3f3f46" stroke-width="2"/>
  
  <text x="48" y="70" fill="#f43f5e" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" letter-spacing="1">PHOTOSTORY 2026</text>
  <text x="48" y="115" fill="#fafafa" font-family="system-ui, sans-serif" font-size="28" font-weight="bold">${headline}</text>
  <text x="48" y="150" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="16">${stats}</text>
  
  <rect x="48" y="180" width="704" height="150" rx="8" fill="#27272a" stroke="#3f3f46" stroke-width="1"/>
  <text x="68" y="220" fill="#e4e4e7" font-family="system-ui, sans-serif" font-size="16" width="660">
    <tspan x="68" dy="0">${narrative.slice(0, 60)}</tspan>
    <tspan x="68" dy="28">${narrative.slice(60, 120)}</tspan>
    <tspan x="68" dy="28">${narrative.slice(120, 180)}</tspan>
  </text>
  
  <text x="48" y="380" fill="#f43f5e" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">ไฮไลต์รูปถ่าย:</text>
  <text x="48" y="410" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="14">${content.highlights.length} ภาพคัดสรรยอดเยี่ยมประจำช่วงเวลา</text>
  
  <text x="752" y="450" text-anchor="end" fill="#71717a" font-family="system-ui, sans-serif" font-size="12">เรื่องราว 2026 — Local-First Personal Journal</text>
</svg>`;

  return await sharp(Buffer.from(svg, 'utf-8')).png().toBuffer();
}

function renderHtmlRecap(content: RecapContent): string {
  const highlightsHtml = content.highlights
    .map(
      (h) => `
      <div class="highlight-item">
        <img src="/api/photos/${h.id}/thumb" alt="${escapeXml(h.filename)}" loading="lazy" />
        <div class="highlight-note">${escapeXml(h.note || h.filename)}</div>
      </div>
    `
    )
    .join('');

  const friendsHtml =
    content.friends.length > 0
      ? `<div class="section">
          <h3>👥 เพื่อนที่พบเจอ</h3>
          <div class="badge-list">
            ${content.friends.map((f) => `<span class="badge badge-friend" style="border-left: 3px solid ${f.color || '#E56B50'}">${escapeXml(f.name)} (${f.count})</span>`).join('')}
          </div>
        </div>`
      : '';

  const placesHtml =
    content.places.length > 0
      ? `<div class="section">
          <h3>📍 สถานที่ที่ไปเยือน</h3>
          <div class="badge-list">
            ${content.places.map((p) => `<span class="badge badge-place">${escapeXml(p.name)}</span>`).join('')}
          </div>
        </div>`
      : '';

  const topMealHtml = content.top_meal
    ? `<div class="section top-meal-card">
        <h3>🍽️ มื้อเด่นประจำช่วงเวลา</h3>
        <p><strong>${escapeXml(content.top_meal.place_name)}</strong> — ${escapeXml(content.top_meal.meal_type)} ${content.top_meal.rating ? `⭐ ${content.top_meal.rating}/5` : ''}</p>
        ${content.top_meal.note ? `<p class="meal-note">${escapeXml(content.top_meal.note)}</p>` : ''}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${escapeXml(content.headline)} — เรื่องราว 2026</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #18181b;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #f43f5e;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --border: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --accent: #e11d48;
      }
    }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Prompt', 'Sarabun', 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
    }
    .recap-container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    }
    .header {
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      color: var(--accent);
    }
    .stats-summary {
      font-size: 15px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .narrative-box {
      background: rgba(244, 63, 94, 0.06);
      border-left: 4px solid var(--accent);
      padding: 16px 20px;
      border-radius: 8px;
      margin-bottom: 28px;
      font-size: 16px;
      line-height: 1.7;
    }
    .section {
      margin-top: 24px;
    }
    .section h3 {
      font-size: 18px;
      margin-bottom: 12px;
      color: var(--text);
    }
    .badge-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      font-size: 13px;
    }
    .top-meal-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }
    .highlights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .highlight-item {
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: var(--bg);
    }
    .highlight-item img {
      width: 100%;
      height: 160px;
      object-fit: cover;
      display: block;
    }
    .highlight-note {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .recap-container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
      .highlight-item { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="recap-container">
    <div class="header">
      <h1>${escapeXml(content.headline)}</h1>
      <div class="stats-summary">${escapeXml(content.stats_summary)}</div>
    </div>

    <div class="narrative-box">
      ${escapeXml(content.narrative)}
    </div>

    <div class="section">
      <h3>⭐ ภาพไฮไลต์ประจำเดือน (${content.highlights.length} ภาพ)</h3>
      <div class="highlights-grid">
        ${highlightsHtml}
      </div>
    </div>

    ${friendsHtml}
    ${placesHtml}
    ${topMealHtml}

    <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); text-align: right; font-size: 12px; color: var(--text-muted);">
      เรื่องราว 2026 — Local-First Personal Photo Journal
    </footer>
  </div>
</body>
</html>`;
}

function checkRecapStale(year: number, month: number | null, photoCountInFacts: number): boolean {
  const isYearly = !month || month === 0;
  let startMs: number;
  let endMs: number;

  if (isYearly) {
    startMs = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() - 1;
  } else {
    startMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    endMs = new Date(year, month, 1, 0, 0, 0, 0).getTime() - 1;
  }

  const row = db
    .prepare('SELECT COUNT(*) as c FROM photos WHERE taken_at IS NOT NULL AND taken_at >= ? AND taken_at <= ?')
    .get(startMs, endMs) as { c: number };

  return row.c !== photoCountInFacts;
}

export const recapsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/recaps?year=
  app.get<{ Querystring: { year?: string } }>('/api/recaps', async (req) => {
    let recaps: any[];
    if (req.query.year) {
      const yearNum = Number(req.query.year);
      recaps = db
        .prepare('SELECT id, year, month, content, format, generated_at FROM recaps WHERE year = ? ORDER BY month ASC')
        .all(yearNum);
    } else {
      recaps = db
        .prepare('SELECT id, year, month, content, format, generated_at FROM recaps ORDER BY year DESC, month ASC')
        .all();
    }

    const items = recaps.map((r) => {
      let factsCount = 0;
      try {
        const parsed = JSON.parse(r.content);
        factsCount = parsed.facts?.photo_count ?? 0;
      } catch {}
      const stale = checkRecapStale(r.year, r.month, factsCount);
      return {
        id: r.id,
        year: r.year,
        month: r.month,
        generated_at: r.generated_at,
        format: r.format,
        stale,
      };
    });

    return { items };
  });

  // GET /api/recaps/:year/:month
  app.get<{ Params: { year: string; month: string }; Querystring: { fresh?: string } }>(
    '/api/recaps/:year/:month',
    async (req) => {
      const year = Number(req.params.year);
      const rawMonth = Number(req.params.month);
      const month = rawMonth === 0 ? null : rawMonth;
      const forceFresh = req.query.fresh === '1';

      let row = !forceFresh
        ? (db
            .prepare('SELECT id, year, month, content, format, generated_at FROM recaps WHERE year = ? AND month IS ?')
            .get(year, month) as any)
        : null;

      if (!row) {
        const generated = generateRecap(year, month);
        return {
          id: generated.id,
          year: generated.year,
          month: generated.month,
          content: generated.content,
          format: generated.format,
          generated_at: generated.generated_at,
          stale: false,
        };
      }

      const content: RecapContent = JSON.parse(row.content);
      const stale = checkRecapStale(year, month, content.facts?.photo_count ?? 0);

      return {
        id: row.id,
        year: row.year,
        month: row.month,
        content,
        format: row.format,
        generated_at: row.generated_at,
        stale,
      };
    }
  );

  // POST /api/recaps
  app.post<{ Body: { year: number; month?: number; format?: string } }>('/api/recaps', async (req) => {
    const { year, month, format } = req.body || {};
    const monthVal = month === 0 || month === undefined ? null : month;
    const recap = generateRecap(year, monthVal, format || 'template');
    return { ok: true, recap };
  });

  // DELETE /api/recaps/:year/:month
  app.delete<{ Params: { year: string; month: string } }>('/api/recaps/:year/:month', async (req) => {
    const year = Number(req.params.year);
    const rawMonth = Number(req.params.month);
    const month = rawMonth === 0 ? null : rawMonth;
    db.prepare('DELETE FROM recaps WHERE year = ? AND month IS ?').run(year, month);
    return { ok: true };
  });

  // GET /api/recaps/:year/:month/export?format=html|pdf|image
  app.get<{ Params: { year: string; month: string }; Querystring: { format?: string } }>(
    '/api/recaps/:year/:month/export',
    async (req, reply) => {
      const year = Number(req.params.year);
      const rawMonth = Number(req.params.month);
      const month = rawMonth === 0 ? null : rawMonth;
      const format = (req.query.format || 'html').toLowerCase();

      // Retrieve or generate recap
      let row = db
        .prepare('SELECT id, year, month, content, format, generated_at FROM recaps WHERE year = ? AND month IS ?')
        .get(year, month) as any;

      let content: RecapContent;
      if (!row) {
        const generated = generateRecap(year, month);
        content = generated.content;
      } else {
        content = JSON.parse(row.content);
      }

      const monthLabel = month ? String(month).padStart(2, '0') : 'yearly';
      const filenameBase = `recap-${year}-${monthLabel}`;

      if (format === 'image' || format === 'png') {
        const pngBuf = await createImageBuffer(content);
        reply
          .header('Content-Type', 'image/png')
          .header('Content-Disposition', `attachment; filename="${filenameBase}.png"`)
          .send(pngBuf);
        return;
      }

      if (format === 'pdf') {
        const pdfBuf = createPdfBuffer(content.headline, content.stats_summary, content.narrative);
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`)
          .send(pdfBuf);
        return;
      }

      // Default: HTML
      const html = renderHtmlRecap(content);
      reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filenameBase}.html"`)
        .send(html);
    }
  );
};
