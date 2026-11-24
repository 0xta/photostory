// server/index.ts — Fastify bootstrap
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import DB to ensure schema is initialized on startup
import db, { getSetting } from './db.js';
import { jobsRoutes } from './routes/jobs.js';
import { importRoutes } from './routes/import.js';
import { eventsRoutes } from './routes/events.js';
import { photosRoutes } from './routes/photos.js';
import { personsRoutes } from './routes/persons.js';
import { searchRoutes } from './routes/search.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { settingsRoutes } from './routes/settings.js';
import { backupRoutes } from './routes/backup.js';
import { collectionsRoutes } from './routes/collections.js';
import { suggestionsRoutes } from './routes/suggestions.js';
import { placesRoutes } from './routes/places.js';
import { mealsRoutes } from './routes/meals.js';
import { recapsRoutes } from './routes/recaps.js';
import { embedRoutes } from './routes/embed.js';
import { facesRoutes } from './routes/faces.js';
import { insightsRoutes } from './routes/insights.js';
import { exportRoutes } from './routes/export.js';
import { watchRoutes } from './routes/watch.js';
import { startEmbedJob } from './workers/embed.js';
import { startWatchFolder } from './workers/watch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : true });

// ── Register routes ─────────────────────────────────────────────
app.register(jobsRoutes);
app.register(importRoutes);
app.register(eventsRoutes);
app.register(photosRoutes);
app.register(personsRoutes);
app.register(searchRoutes);
app.register(dashboardRoutes);
app.register(settingsRoutes);
app.register(backupRoutes);
app.register(collectionsRoutes);
app.register(suggestionsRoutes);
app.register(placesRoutes);
app.register(mealsRoutes);
app.register(recapsRoutes);
app.register(embedRoutes);
app.register(facesRoutes);
app.register(insightsRoutes);
app.register(exportRoutes);
app.register(watchRoutes);

// ── Serve static frontend ───────────────────────────────────────
app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', async () => {
  const photoCount = (
    db.prepare('SELECT COUNT(*) as c FROM photos').get() as { c: number }
  ).c;
  const eventCount = (
    db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }
  ).c;
  const personCount = (
    db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
  ).c;
  return {
    status: 'ok',
    version: '0.1.0',
    phase: '2.0',
    counts: { photos: photoCount, events: eventCount, persons: personCount },
  };
});

// ── Start ───────────────────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`\n🎞️  เรื่องราว 2026 — running at http://127.0.0.1:${PORT}`);
    console.log(`📁  Database: data/story.db`);
    console.log(`🖼️  Thumbnails: data/thumbs/\n`);

    // Auto-embed any unembedded photos in background
    try {
      const unindexed = db
        .prepare('SELECT COUNT(*) as c FROM photos WHERE id NOT IN (SELECT photo_id FROM photo_vec)')
        .get() as { c: number };
      if (unindexed && unindexed.c > 0) {
        console.log(`✨ [startup] Found ${unindexed.c} unembedded photos; starting background embedding...`);
        startEmbedJob();
      }
    } catch (embErr) {
      console.warn('Startup embedding check skipped:', embErr);
    }

    // Auto-start watch folder if enabled (FR-1411)
    try {
      if (getSetting('watch_folder_enabled') === 'true') {
        const watchFolder = getSetting('watch_folder_path') || 'photo';
        const res = startWatchFolder(watchFolder);
        if (res.success) {
          console.log(`👀 [startup] Watch folder active on: ${watchFolder}`);
        }
      }
    } catch (watchErr) {
      console.warn('Startup watch folder check skipped:', watchErr);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.env.NODE_ENV !== 'test') {
  start();
}

export default app;
