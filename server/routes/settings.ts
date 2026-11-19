// server/routes/settings.ts — Settings CRUD and threshold change recluster trigger
import { FastifyPluginAsync } from 'fastify';
import { getAllSettings, setSetting } from '../db.js';
import { runClustering } from '../workers/cluster.js';

const CLUSTERING_KEYS = new Set(['gap_hours', 'dist_km', 'burst_ms']);

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/settings
  app.get('/api/settings', async () => {
    return getAllSettings();
  });

  // PATCH /api/settings (FR-901)
  app.patch<{ Body: Record<string, string | number> }>('/api/settings', async (req) => {
    const body = req.body || {};
    let shouldRecluster = false;

    for (const [key, val] of Object.entries(body)) {
      setSetting(key, String(val));
      if (CLUSTERING_KEYS.has(key)) {
        shouldRecluster = true;
      }
    }

    if (shouldRecluster) {
      runClustering();
    }

    return getAllSettings();
  });
};
