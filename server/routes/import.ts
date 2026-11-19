// server/routes/import.ts — Ingest and Recluster API routes
import fs from 'node:fs';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import { createJob, hasActiveJob } from '../workers/jobs.js';
import { scanDirectory, processIngest } from '../workers/ingest.js';
import { runClustering } from '../workers/cluster.js';
import { THUMBS_DIR } from '../db.js';

interface ImportBody {
  folder?: string;
  files?: string[];
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/import
  app.post<{ Body: ImportBody }>('/api/import', async (req, reply) => {
    if (hasActiveJob()) {
      return reply.status(409).send({ error: 'An import job is already running' });
    }

    const { folder, files } = req.body || {};
    let filePaths: string[] = [];

    if (folder) {
      const resolved = path.resolve(folder);
      if (!fs.existsSync(resolved)) {
        return reply.status(400).send({ error: `Folder not found: ${folder}` });
      }
      filePaths = scanDirectory(resolved);
    } else if (Array.isArray(files) && files.length > 0) {
      filePaths = files.map((f) => path.resolve(f)).filter((f) => fs.existsSync(f));
    } else {
      return reply.status(400).send({ error: 'Please provide folder or files array' });
    }

    const job = createJob();

    // Run ingest in background without blocking API response
    setImmediate(() => {
      processIngest(job.id, filePaths).catch((err) => {
        console.error('Unhandled error in processIngest:', err);
      });
    });

    return reply.status(202).send({ jobId: job.id });
  });

  // POST /api/recluster
  app.post('/api/recluster', async () => {
    return runClustering();
  });

  // GET /api/thumbs/:id
  app.get<{ Params: { id: string } }>('/api/thumbs/:id', async (req, reply) => {
    const thumbFile = path.join(THUMBS_DIR, `${req.params.id}.jpg`);
    if (!fs.existsSync(thumbFile)) {
      return reply.status(404).send({ error: 'Thumbnail not found' });
    }
    const stream = fs.createReadStream(thumbFile);
    return reply.type('image/jpeg').send(stream);
  });
};
