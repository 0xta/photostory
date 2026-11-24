// server/routes/export.ts — Open-Format Export & XMP Sidecar Writing (FR-1410)
import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export const exportRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/export?format=json|csv|geojson|xmp
  app.get<{ Querystring: { format?: string } }>('/api/export', async (req, reply) => {
    const format = (req.query.format || 'json').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);

    // ── 1. JSON Export (Complete Structured Metadata) ─────────────────
    if (format === 'json') {
      const photos = db.prepare(`
        SELECT p.*, e.name as event_name, e.place as event_place
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        ORDER BY p.taken_at ASC
      `).all() as any[];

      const allPhotoCats = db.prepare('SELECT photo_id, cat FROM photo_cats').all() as any[];
      const catMap = new Map<string, string[]>();
      for (const row of allPhotoCats) {
        if (!catMap.has(row.photo_id)) catMap.set(row.photo_id, []);
        catMap.get(row.photo_id)!.push(row.cat);
      }

      const allPhotoPersons = db.prepare(`
        SELECT pp.photo_id, pr.id as person_id, pr.name, pr.nick
        FROM photo_persons pp
        JOIN persons pr ON pp.person_id = pr.id
      `).all() as any[];
      const personMap = new Map<string, Array<{ id: string; name: string; nick: string }>>();
      for (const row of allPhotoPersons) {
        if (!personMap.has(row.photo_id)) personMap.set(row.photo_id, []);
        personMap.get(row.photo_id)!.push({ id: row.person_id, name: row.name, nick: row.nick });
      }

      const enrichedPhotos = photos.map((p) => ({
        ...p,
        taken_at_iso: p.taken_at ? new Date(p.taken_at).toISOString() : null,
        categories: catMap.get(p.id) || [],
        persons: personMap.get(p.id) || [],
      }));

      const events = db.prepare('SELECT * FROM events ORDER BY ts_start ASC').all();
      const persons = db.prepare('SELECT * FROM persons ORDER BY name ASC').all();
      const places = db.prepare('SELECT * FROM places ORDER BY name ASC').all();
      const collections = db.prepare('SELECT * FROM collections ORDER BY created_at ASC').all();
      const meals = db.prepare('SELECT * FROM meals ORDER BY created_at ASC').all();

      const exportData = {
        app: 'เรื่องราว 2026 (Photostory)',
        version: '2.0',
        exported_at: Date.now(),
        exported_at_iso: new Date().toISOString(),
        stats: {
          total_photos: enrichedPhotos.length,
          total_events: events.length,
          total_persons: persons.length,
          total_places: places.length,
          total_collections: collections.length,
          total_meals: meals.length,
        },
        photos: enrichedPhotos,
        events,
        persons,
        places,
        collections,
        meals,
      };

      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="photostory-export-${dateStr}.json"`);
      return exportData;
    }

    // ── 2. CSV Export (Spreadsheet-friendly) ──────────────────────────
    if (format === 'csv') {
      const photos = db.prepare(`
        SELECT p.*, e.name as event_name, e.place as event_place
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        ORDER BY p.taken_at ASC
      `).all() as any[];

      const headers = [
        'id',
        'filename',
        'path',
        'taken_at_epoch',
        'taken_at_iso',
        'latitude',
        'longitude',
        'width',
        'height',
        'burst',
        'event_id',
        'event_name',
        'event_place',
        'categories',
        'persons',
        'note',
      ];

      const lines = [headers.join(',')];

      for (const p of photos) {
        const cats = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?').all(p.id).map((r: any) => r.cat).join('; ');
        const persons = db.prepare(`
          SELECT pr.name FROM photo_persons pp
          JOIN persons pr ON pp.person_id = pr.id
          WHERE pp.photo_id = ?
        `).all(p.id).map((r: any) => r.name).join('; ');

        const row = [
          toCsvField(p.id),
          toCsvField(p.filename),
          toCsvField(p.path),
          toCsvField(p.taken_at),
          toCsvField(p.taken_at ? new Date(p.taken_at).toISOString() : ''),
          toCsvField(p.lat),
          toCsvField(p.lon),
          toCsvField(p.w),
          toCsvField(p.h),
          toCsvField(p.burst || 0),
          toCsvField(p.event_id),
          toCsvField(p.event_name),
          toCsvField(p.event_place),
          toCsvField(cats),
          toCsvField(persons),
          toCsvField(p.note),
        ];
        lines.push(row.join(','));
      }

      const csvContent = '\uFEFF' + lines.join('\r\n'); // Add UTF-8 BOM for Excel compatibility
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="photostory-photos-${dateStr}.csv"`);
      return reply.send(csvContent);
    }

    // ── 3. GeoJSON Export (GIS / Map exploration) ─────────────────────
    if (format === 'geojson') {
      const photos = db.prepare(`
        SELECT p.*, e.name as event_name, e.place as event_place
        FROM photos p
        LEFT JOIN events e ON p.event_id = e.id
        WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
        ORDER BY p.taken_at ASC
      `).all() as any[];

      const features = photos.map((p) => {
        const cats = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?').all(p.id).map((r: any) => r.cat);
        const persons = db.prepare(`
          SELECT pr.name FROM photo_persons pp
          JOIN persons pr ON pp.person_id = pr.id
          WHERE pp.photo_id = ?
        `).all(p.id).map((r: any) => r.name);

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [p.lon, p.lat],
          },
          properties: {
            id: p.id,
            filename: p.filename,
            path: p.path,
            taken_at: p.taken_at,
            taken_at_iso: p.taken_at ? new Date(p.taken_at).toISOString() : null,
            event_id: p.event_id,
            event_name: p.event_name,
            event_place: p.event_place,
            categories: cats,
            persons: persons,
            note: p.note || '',
          },
        };
      });

      const geoJson = {
        type: 'FeatureCollection',
        crs: {
          type: 'name',
          properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
        },
        features,
      };

      reply.header('Content-Type', 'application/geo+json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="photostory-map-${dateStr}.geojson"`);
      return geoJson;
    }

    // ── 4. XMP Sidecar Generation trigger ─────────────────────────────
    if (format === 'xmp') {
      const result = await generateXmpSidecars();
      return result;
    }

    return reply.status(400).send({ error: `Unsupported export format: ${format}. Use json, csv, geojson, or xmp.` });
  });

  // POST /api/export/xmp
  app.post('/api/export/xmp', async () => {
    return generateXmpSidecars();
  });
};

/**
 * Generate Adobe/Dublin Core XMP sidecar files next to photos without modifying original image files.
 */
export async function generateXmpSidecars(): Promise<{
  status: string;
  total_photos: number;
  generated_count: number;
  skipped_count: number;
  message: string;
}> {
  const photos = db.prepare(`
    SELECT p.*, e.name as event_name, e.place as event_place
    FROM photos p
    LEFT JOIN events e ON p.event_id = e.id
  `).all() as any[];

  let generated = 0;
  let skipped = 0;

  for (const p of photos) {
    if (!p.path) {
      skipped++;
      continue;
    }

    const resolvedPhotoPath = path.resolve(p.path);
    if (!fs.existsSync(resolvedPhotoPath)) {
      skipped++;
      continue;
    }

    // Sidecar filename: e.g. "photo/20261118_143000.xmp"
    const parsed = path.parse(resolvedPhotoPath);
    const xmpPath = path.join(parsed.dir, `${parsed.name}.xmp`);

    const cats = db.prepare('SELECT cat FROM photo_cats WHERE photo_id = ?').all(p.id).map((r: any) => r.cat);
    const persons = db.prepare(`
      SELECT pr.name FROM photo_persons pp
      JOIN persons pr ON pp.person_id = pr.id
      WHERE pp.photo_id = ?
    `).all(p.id).map((r: any) => r.name);

    const tags = Array.from(new Set([...cats, ...persons, p.event_place].filter(Boolean)));
    const title = p.event_name || p.filename;
    const note = p.note || '';
    const isoDate = p.taken_at ? new Date(p.taken_at).toISOString() : '';

    const xmpContent = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Photostory XMP 1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li>
    </rdf:Alt>
   </dc:title>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(note)}</rdf:li>
    </rdf:Alt>
   </dc:description>
   <dc:subject>
    <rdf:Bag>
${tags.map((t) => `     <rdf:li>${escapeXml(t)}</rdf:li>`).join('\n')}
    </rdf:Bag>
   </dc:subject>
   ${isoDate ? `<xmp:CreateDate>${isoDate}</xmp:CreateDate>` : ''}
   ${isoDate ? `<photoshop:DateCreated>${isoDate}</photoshop:DateCreated>` : ''}
   ${title ? `<photoshop:Headline>${escapeXml(title)}</photoshop:Headline>` : ''}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;

    try {
      // Non-destructive: write sidecar file, never touch or alter original photo
      fs.writeFileSync(xmpPath, xmpContent, 'utf-8');
      generated++;
    } catch (err) {
      console.warn(`Failed to write XMP for ${p.path}:`, err);
      skipped++;
    }
  }

  return {
    status: 'ok',
    total_photos: photos.length,
    generated_count: generated,
    skipped_count: skipped,
    message: `เขียนไฟล์ XMP Sidecar เรียบร้อยแล้ว ${generated} ไฟล์ (ข้าม ${skipped} ไฟล์ที่ไม่พบบนดิสก์)`,
  };
}
