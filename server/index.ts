// server/index.ts — Fastify bootstrap
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import DB to ensure schema is initialized on startup
import db, { getAllSettings, setSetting } from './db.js';
import { jobsRoutes } from './routes/jobs.js';
import { importRoutes } from './routes/import.js';
import { eventsRoutes } from './routes/events.js';
import { photosRoutes } from './routes/photos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : true });

// ── Register routes ─────────────────────────────────────────────
app.register(jobsRoutes);
app.register(importRoutes);
app.register(eventsRoutes);
app.register(photosRoutes);

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
    phase: '1A',
    counts: { photos: photoCount, events: eventCount, persons: personCount },
  };
});

// ── Settings routes (basic, for theme switching) ────────────────
app.get('/api/settings', async () => {
  return getAllSettings();
});

app.patch('/api/settings', async (req) => {
  const body = req.body as Record<string, string>;
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      setSetting(key, String(value));
    }
  }
  return getAllSettings();
});

// ── Start ───────────────────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    console.log(`\n🎞️  เรื่องราว 2026 — running at http://127.0.0.1:${PORT}`);
    console.log(`📁  Database: data/story.db`);
    console.log(`🖼️  Thumbnails: data/thumbs/\n`);
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
