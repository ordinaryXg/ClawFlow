import * as fs from 'fs';
import * as path from 'path';
import {
  SCRAPE_JOBS_FILE_VERSION,
  type ScrapeJobRecord,
  type ScrapeJobsFile,
} from './shared/scrape-jobs';
import * as workspaceService from './workspace-service';

const MAX_JOBS = 200;

export function scrapeJobsStorePath(workspaceRoot: string): string {
  return path.join(workspaceService.clawflowDir(workspaceRoot), 'scrape-jobs.v1.json');
}

/** 相对工作区根，POSIX 风格，供 resolvePathInsideWorkspace 使用 */
export function scrapeArtifactRelPath(jobId: string): string {
  return path.posix.join('.clawflow', 'scrapes', `${jobId}.md`);
}

export async function ensureScrapeArtifactsDir(workspaceRoot: string): Promise<string> {
  const dir = path.join(workspaceService.clawflowDir(workspaceRoot), 'scrapes');
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

function isJobRecord(x: unknown): x is ScrapeJobRecord {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.url === 'string' &&
    (o.status === 'ok' || o.status === 'error')
  );
}

export async function readScrapeJobs(workspaceRoot: string): Promise<ScrapeJobRecord[]> {
  const root = path.resolve(workspaceRoot);
  const fp = scrapeJobsStorePath(root);
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(buf) as unknown;
    if (parsed && typeof parsed === 'object') {
      const jobs = (parsed as ScrapeJobsFile).jobs;
      if (Array.isArray(jobs)) return jobs.filter(isJobRecord);
    }
  } catch {
    /* missing */
  }
  return [];
}

export async function appendScrapeJob(workspaceRoot: string, job: ScrapeJobRecord): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const fp = scrapeJobsStorePath(root);
  await fs.promises.mkdir(workspaceService.clawflowDir(root), { recursive: true });
  const prev = await readScrapeJobs(root);
  const next: ScrapeJobsFile = {
    version: SCRAPE_JOBS_FILE_VERSION,
    jobs: [job, ...prev.filter((j) => j.id !== job.id)].slice(0, MAX_JOBS),
  };
  await fs.promises.writeFile(fp, JSON.stringify(next, null, 2), 'utf-8');
}
