// server/utils.ts — shared utilities

/**
 * Generate a unique ID: base36 timestamp + random suffix
 */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Haversine distance between two GPS coordinates in kilometers
 */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Thai month abbreviations (0-indexed)
 */
export const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * Format date to Thai display: "DD Mon พ.ศ." (Buddhist era)
 */
export function formatThaiDate(ms: number): string {
  const d = new Date(ms);
  const day = d.getDate();
  const mon = THAI_MONTHS_ABBR[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${mon} ${year}`;
}

export function formatThaiDateShort(ms: number): string {
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = THAI_MONTHS_ABBR[d.getMonth()];
  return `${day} ${mon}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format GPS for display: "13.7563N 100.5018E"
 */
export function formatGps(lat: number | null, lon: number | null): string | null {
  if (lat == null || lon == null) return null;
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}${latDir} ${Math.abs(lon).toFixed(4)}${lonDir}`;
}

/**
 * Auto event name: "ช่วงที่ {index} · {DD Mon}"
 */
export function autoEventName(index: number, tsStart: number): string {
  return `ช่วงที่ ${index} · ${formatThaiDateShort(tsStart)}`;
}

/**
 * Category definitions (7 fixed)
 */
export const CATEGORIES = [
  { id: 'อาหาร', color: '#F0A63C' },
  { id: 'บรรยากาศ', color: '#79C7B4' },
  { id: 'สไลด์', color: '#8FB8E8' },
  { id: 'ตัวฉัน', color: '#E56B50' },
  { id: 'เพื่อน', color: '#D98BC0' },
  { id: 'สถาปัตยกรรม', color: '#B8A6E8' },
  { id: 'อื่นๆ', color: '#8B93A3' },
] as const;

export const FRIEND_PALETTE = [
  '#E56B50', '#79C7B4', '#F0A63C', '#8FB8E8', '#D98BC0', '#B8A6E8', '#A8C97F',
];

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Record<string, string> = {
  gap_hours: '4',
  dist_km: '2',
  burst_ms: '2000',
  phash_hamming: '6',
  face_cosine: '0.45',
  place_radius_m: '120',
  meal_gap_min: '90',
  auto_link_places: 'false',
  semantic_coll_cosine: '0.30',
  lapsed_months: '6',
  target_year: '2026',
  theme: 'dark',  // 'light' | 'warm' | 'dark'
};
