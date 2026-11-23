// server/workers/jobs.ts — In-memory job state tracker
import { genId } from '../utils.js';

export interface JobState {
  id: string;
  kind?: string;
  status: 'running' | 'done' | 'error';
  processed: number;
  total: number;
  current: string;
  added: number;
  skippedDup: number;
  skippedUnreadable: number;
  dateless: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, JobState>();

export function createJob(kind: string = 'import'): JobState {
  const id = genId();
  const job: JobState = {
    id,
    kind,
    status: 'running',
    processed: 0,
    total: 0,
    current: '',
    added: 0,
    skippedDup: 0,
    skippedUnreadable: 0,
    dateless: 0,
    startedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<JobState>): JobState | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates);
  return job;
}

export function hasActiveJob(kind: string = 'import'): boolean {
  for (const job of jobs.values()) {
    if (job.status === 'running' && (job.kind === kind || !job.kind)) {
      return true;
    }
  }
  return false;
}
