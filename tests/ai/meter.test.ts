import { expect, test } from 'vitest';
import { computeMeter } from '../../src/ai/meter.js';
import type { CommitRecord } from '../../src/types.js';

type Kind = 'you' | 'mixed' | 'agent';

function c(
  repo: string,
  kind: Kind,
  date = '2026-11-05T00:00:00Z',
  byUser = true,
  aiName = 'Claude Opus 5.5',
): CommitRecord {
  const human = { authorName: 'Badral', authorEmail: 'b@x.com', authorLogin: 'Sezos' };
  const bot = {
    authorName: 'copilot-swe-agent[bot]',
    authorEmail: '1+Copilot@users.noreply.github.com',
    authorLogin: null,
  };
  return {
    repo,
    committedDate: date,
    byUser,
    ...(kind === 'agent' ? bot : human),
    message: kind === 'mixed' ? `feat: x\n\nCo-Authored-By: ${aiName} <noreply@anthropic.com>` : 'feat: x',
  };
}

test('per-repo and overall percentages', () => {
  const m = computeMeter([
    c('o/a', 'mixed'),
    c('o/a', 'mixed'),
    c('o/a', 'mixed'),
    c('o/a', 'you'),
    c('o/b', 'agent', undefined, false),
    c('o/b', 'you'),
  ]);
  expect(m.perRepo.get('o/a')).toMatchObject({ total: 4, ai: 3, pct: 75 });
  expect(m.perRepo.get('o/b')).toMatchObject({ total: 2, ai: 1, pct: 50 });
  expect(m.overall).toEqual({ total: 6, ai: 4, pct: 67 });
});

test('sidekick is the most frequent AI name', () => {
  const cursor: CommitRecord = {
    ...c('o/a', 'you'),
    message: 'feat: y\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>',
  };
  const sample = [cursor, c('o/a', 'mixed'), c('o/b', 'mixed'), c('o/b', 'you')];
  expect(computeMeter(sample).sidekick).toBe('Claude Opus 5.5');
});

test('sidekick ties go to the name seen first', () => {
  const sample = [
    c('o/a', 'mixed', undefined, true, 'Claude Sonnet 5.5'),
    c('o/a', 'mixed', undefined, true, 'Claude Opus 5.5'),
  ];
  expect(computeMeter(sample).sidekick).toBe('Claude Sonnet 5.5');
});

test('no commits: zeros, no NaN, no sidekick', () => {
  expect(computeMeter([])).toEqual({ perRepo: new Map(), overall: { total: 0, ai: 0, pct: 0 }, sidekick: null });
});

test('lastUserCommit ignores agent commits', () => {
  const m = computeMeter([c('o/a', 'you', '2026-11-01T00:00:00Z'), c('o/a', 'agent', '2026-11-10T00:00:00Z', false)]);
  expect(m.perRepo.get('o/a')?.lastUserCommit).toBe('2026-11-01T00:00:00Z');
});

test('lastUserCommit is the newest of several user commits, whatever their order', () => {
  const m = computeMeter([
    c('o/a', 'you', '2026-11-03T00:00:00Z'),
    c('o/a', 'you', '2026-11-09T00:00:00Z'),
    c('o/a', 'you', '2026-11-01T00:00:00Z'),
  ]);
  expect(m.perRepo.get('o/a')?.lastUserCommit).toBe('2026-11-09T00:00:00Z');
});
