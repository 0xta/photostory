// server/routes/jobs.ts — Job status endpoint
import { FastifyPluginAsync } from 'fastify';
import { getJob } from '../workers/jobs.js';

export const jobsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    return job;
  });
};
