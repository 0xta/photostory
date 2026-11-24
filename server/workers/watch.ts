// server/workers/watch.ts — Watch Folder Auto-Ingest worker (FR-1411)
import fs from 'node:fs';
import path from 'node:path';
import db, { getSetting, setSetting } from '../db.js';
import { scanDirectory, processIngest } from './ingest.js';
import { createJob, hasActiveJob } from './jobs.js';

let watcher: fs.FSWatcher | null = null;
let currentWatchFolder: string | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let lastScanAt: number | null = null;
let isScanning = false;

export function getWatchStatus(): {
  enabled: boolean;
  folder: string;
  status: 'watching' | 'standby' | 'disabled';
  last_scan_at: number | null;
} {
  const enabled = getSetting('watch_folder_enabled') === 'true';
  const folder = getSetting('watch_folder_path') || 'photo';
  return {
    enabled,
    folder,
    status: watcher ? 'watching' : enabled ? 'standby' : 'disabled',
    last_scan_at: lastScanAt,
  };
}

export function startWatchFolder(targetFolder?: string): {
  success: boolean;
  message: string;
  folder: string;
} {
  stopWatchFolder(false); // Stop any existing watcher without clearing enabled setting

  const folder = targetFolder || getSetting('watch_folder_path') || 'photo';
  const resolved = path.resolve(folder);

  if (!fs.existsSync(resolved)) {
    return { success: false, message: `โฟลเดอร์ไม่พบ: ${folder}`, folder };
  }

  setSetting('watch_folder_path', folder);
  setSetting('watch_folder_enabled', 'true');
  currentWatchFolder = resolved;

  try {
    watcher = fs.watch(resolved, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      scheduleScan();
    });

    watcher.on('error', (err) => {
      console.warn('[WatchFolder] Watcher error:', err);
    });

    // Also run periodic poll check every 15 seconds to catch edge cases
    pollInterval = setInterval(() => {
      scheduleScan();
    }, 15000);

    return { success: true, message: `กำลังเฝ้าดูโฟลเดอร์: ${folder}`, folder };
  } catch (err: any) {
    console.error('[WatchFolder] Failed to start watch folder:', err);
    return { success: false, message: err.message || 'ไม่สามารถเฝ้าดูโฟลเดอร์ได้', folder };
  }
}

export function stopWatchFolder(updateSettings = true): { success: boolean; message: string } {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (watcher) {
    try {
      watcher.close();
    } catch {}
    watcher = null;
  }
  currentWatchFolder = null;
  if (updateSettings) {
    setSetting('watch_folder_enabled', 'false');
  }
  return { success: true, message: 'หยุดการเฝ้าดูโฟลเดอร์เรียบร้อย' };
}

function scheduleScan(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    checkNewFilesAndIngest().catch((err) => {
      console.warn('[WatchFolder] Scheduled scan error:', err);
    });
  }, 1500);
}

export async function checkNewFilesAndIngest(): Promise<number> {
  const watchFolder = currentWatchFolder || (getSetting('watch_folder_path') ? path.resolve(getSetting('watch_folder_path')) : null);
  if (!watchFolder || !fs.existsSync(watchFolder)) {
    return 0;
  }
  if (isScanning) {
    return 0;
  }
  if (hasActiveJob()) {
    // An import or face job is already running; wait for next cycle
    return 0;
  }

  isScanning = true;
  lastScanAt = Date.now();

  try {
    const allDiskFiles = scanDirectory(watchFolder);
    if (allDiskFiles.length === 0) return 0;

    // Get all existing photo paths and filenames from DB
    const existing = db.prepare('SELECT path, filename FROM photos').all() as Array<{ path: string; filename: string }>;
    const existingPaths = new Set(existing.map((p) => path.resolve(p.path)));
    const existingFilenames = new Set(existing.map((p) => p.filename));

    const newFiles = allDiskFiles.filter(
      (f) => !existingPaths.has(path.resolve(f)) && !existingFilenames.has(path.basename(f))
    );

    if (newFiles.length === 0) {
      return 0;
    }

    console.log(`[WatchFolder] Detected ${newFiles.length} new photos in ${watchFolder}; starting auto-ingest...`);
    const job = createJob();
    setImmediate(() => {
      processIngest(job.id, newFiles).catch((err) => {
        console.error('[WatchFolder] Auto-ingest failed:', err);
      });
    });

    return newFiles.length;
  } finally {
    isScanning = false;
  }
}
