// server/routes/watch.ts — Watch Folder API endpoints (FR-1411)
import { FastifyPluginAsync } from 'fastify';
import { getWatchStatus, startWatchFolder, stopWatchFolder, checkNewFilesAndIngest } from '../workers/watch.js';

interface WatchRequestBody {
  enabled: boolean;
  folder?: string;
}

export const watchRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/watch
  app.get('/api/watch', async () => {
    return getWatchStatus();
  });

  // POST /api/watch
  app.post<{ Body: WatchRequestBody }>('/api/watch', async (req, reply) => {
    const { enabled, folder } = req.body || {};

    if (enabled) {
      const res = startWatchFolder(folder);
      if (!res.success) {
        return reply.status(400).send({ error: res.message, ...getWatchStatus() });
      }
    } else {
      stopWatchFolder(true);
    }

    return getWatchStatus();
  });

  // POST /api/watch/scan
  app.post('/api/watch/scan', async () => {
    const count = await checkNewFilesAndIngest();
    return {
      new_photos_found: count,
      ...getWatchStatus(),
    };
  });
};
