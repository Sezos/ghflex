import type { CommitRecord } from '../types.js';
import { classifyCommit } from './classify.js';

export interface RepoMeter {
  repo: string;
  total: number;
  ai: number;
  pct: number;
  lastUserCommit: string | null;
}

export interface MeterResult {
  perRepo: Map<string, RepoMeter>;
  overall: { total: number; ai: number; pct: number };
  sidekick: string | null;
}

const pct = (ai: number, total: number) => (total ? Math.round((ai * 100) / total) : 0);

/** AI-assisted share per repo and overall, plus the most frequent AI co-author ("sidekick"). */
export function computeMeter(commits: CommitRecord[]): MeterResult {
  const perRepo = new Map<string, RepoMeter>();
  const names = new Map<string, number>(); // insertion order = first seen, used for ties
  let total = 0;
  let ai = 0;

  for (const commit of commits) {
    const { bucket, aiName } = classifyCommit(commit);
    const isAi = bucket !== 'you';
    let m = perRepo.get(commit.repo);
    if (!m) {
      m = { repo: commit.repo, total: 0, ai: 0, pct: 0, lastUserCommit: null };
      perRepo.set(commit.repo, m);
    }
    m.total++;
    total++;
    if (isAi) {
      m.ai++;
      ai++;
      if (aiName) names.set(aiName, (names.get(aiName) ?? 0) + 1);
    }
    if (commit.byUser && (!m.lastUserCommit || Date.parse(commit.committedDate) > Date.parse(m.lastUserCommit))) {
      m.lastUserCommit = commit.committedDate;
    }
  }

  for (const m of perRepo.values()) m.pct = pct(m.ai, m.total);

  let sidekick: string | null = null;
  let best = 0;
  for (const [name, n] of names) {
    if (n > best) {
      best = n;
      sidekick = name;
    }
  }

  return { perRepo, overall: { total, ai, pct: pct(ai, total) }, sidekick };
}
