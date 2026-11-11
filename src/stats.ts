import type { Day, Repo } from './types.js';

const DAY_MS = 86_400_000;

/** Current streak (an empty last day doesn't break it — today isn't over) and best streak. */
export function streaks(calendar: Day[]): { current: number; best: number } {
  let i = calendar.length - 1;
  if (i >= 0 && calendar[i].count === 0) i--;
  let current = 0;
  while (i >= 0 && calendar[i].count > 0) {
    current++;
    i--;
  }
  let best = 0;
  let run = 0;
  for (const d of calendar) {
    run = d.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best };
}

export function busiestDay(calendar: Day[]): Day | null {
  let top: Day | null = null;
  for (const d of calendar) if (d.count > 0 && (!top || d.count > top.count)) top = d;
  return top;
}

const TOP_LANGUAGES = 6;

/** Primary languages by repo count (forks and unknown languages excluded), top 6 plus "Other". */
export function languageStack(repos: Repo[]): { name: string; repos: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const r of repos) {
    if (r.isFork || !r.primaryLanguage) continue;
    counts.set(r.primaryLanguage, (counts.get(r.primaryLanguage) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const pct = (n: number) => Math.round((n * 100) / total);
  const out = sorted.slice(0, TOP_LANGUAGES).map(([name, n]) => ({ name, repos: n, pct: pct(n) }));
  const other = sorted.slice(TOP_LANGUAGES).reduce((a, [, n]) => a + n, 0);
  if (other) out.push({ name: 'Other', repos: other, pct: pct(other) });
  return out;
}

export function activeRepos(repos: Repo[], now: Date, days = 30): number {
  const cutoff = now.getTime() - days * DAY_MS;
  return repos.filter((r) => Date.parse(r.pushedAt) >= cutoff).length;
}
