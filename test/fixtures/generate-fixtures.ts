// test/fixtures/generate-fixtures.ts — Generates 5 mock JPEGs with EXIF for AC-1..AC-3
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import piexif from 'piexifjs';

export const FIXTURES_DIR = path.resolve('test/fixtures/photos');

// Helper to convert decimal degrees to EXIF rational format [[deg, 1], [min, 1], [sec*100, 100]]
function degToExifRational(deg: number): [[number, number], [number, number], [number, number]] {
  const d = Math.floor(Math.abs(deg));
  const minFloat = (Math.abs(deg) - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

async function createJpegWithExif(opts: {
  width: number;
  height: number;
  color: { r: number; g: number; b: number };
  dateStr?: string; // format 'YYYY:MM:DD HH:MM:SS'
  lat?: number;
  lon?: number;
}): Promise<Buffer> {
  const baseJpeg = await sharp({
    create: {
      width: opts.width,
      height: opts.height,
      channels: 3,
      background: opts.color,
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const exifObj: any = {
    '0th': {},
    Exif: {},
    GPS: {},
  };

  let hasExif = false;

  if (opts.dateStr) {
    exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] = opts.dateStr;
    exifObj.Exif[piexif.ExifIFD.DateTimeDigitized] = opts.dateStr;
    hasExif = true;
  }

  if (opts.lat != null && opts.lon != null) {
    exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = opts.lat >= 0 ? 'N' : 'S';
    exifObj.GPS[piexif.GPSIFD.GPSLatitude] = degToExifRational(opts.lat);
    exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = opts.lon >= 0 ? 'E' : 'W';
    exifObj.GPS[piexif.GPSIFD.GPSLongitude] = degToExifRational(opts.lon);
    hasExif = true;
  }

  if (!hasExif) {
    return baseJpeg;
  }

  const exifBytes = piexif.dump(exifObj);
  const jpegWithExif = Buffer.from(
    piexif.insert(exifBytes, baseJpeg.toString('binary')),
    'binary'
  );
  return jpegWithExif;
}

export async function generateFixtures(): Promise<string[]> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const files: Array<{
    name: string;
    color: { r: number; g: number; b: number };
    dateStr?: string;
    lat?: number;
    lon?: number;
  }> = [
    // 1. Bangkok 1 — 2026-03-14 10:00:00
    {
      name: 'bkk_01.jpg',
      color: { r: 220, g: 50, b: 50 },
      dateStr: '2026:03:14 10:00:00',
      lat: 13.7563,
      lon: 100.5018,
    },
    // 2. Bangkok 2 — 2026-03-14 11:30:00 (burst shot 1)
    {
      name: 'bkk_02_burst1.jpg',
      color: { r: 50, g: 200, b: 50 },
      dateStr: '2026:03:14 11:30:00',
      lat: 13.7564,
      lon: 100.5019,
    },
    // 3. Bangkok 3 — 2026-03-14 11:30:01 (burst shot 2, 1s apart)
    {
      name: 'bkk_03_burst2.jpg',
      color: { r: 50, g: 50, b: 220 },
      dateStr: '2026:03:14 11:30:01',
      lat: 13.7564,
      lon: 100.5019,
    },
    // 4. Chiang Mai 1 — 2026-04-22 14:00:00 (different day & place)
    {
      name: 'cnx_01.jpg',
      color: { r: 230, g: 200, b: 40 },
      dateStr: '2026:04:22 14:00:00',
      lat: 18.7883,
      lon: 98.9853,
    },
    // 5. Dateless 1 — no EXIF date, no GPS
    {
      name: 'dateless_note.jpg',
      color: { r: 180, g: 60, b: 180 },
    },
  ];

  const generatedPaths: string[] = [];

  for (const f of files) {
    const outPath = path.join(FIXTURES_DIR, f.name);
    const buf = await createJpegWithExif({
      width: 400,
      height: 300,
      color: f.color,
      dateStr: f.dateStr,
      lat: f.lat,
      lon: f.lon,
    });
    fs.writeFileSync(outPath, buf);
    generatedPaths.push(outPath);
  }

  return generatedPaths;
}

// Allow direct execution
if (process.argv[1]?.includes('generate-fixtures')) {
  generateFixtures().then((paths) => {
    console.log(`Generated ${paths.length} fixture photos in ${FIXTURES_DIR}`);
  });
}
