import { expect, test } from 'vitest';
import { activeRepos, busiestDay, languageStack, streaks } from '../src/stats.js';
import type { Repo } from '../src/types.js';

const cal = (counts: number[]) =>
  counts.map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));

const repo = (name: string, lang: string | null, extra: Partial<Repo> = {}): Repo => ({
  nameWithOwner: `o/${name}`,
  name,
  isPrivate: false,
  isFork: false,
  pushedAt: '2026-11-01T00:00:00Z',
  primaryLanguage: lang,
  ...extra,
});

const fixtureRepos: Repo[] = [
  ...['a', 'b', 'c', 'd'].map((n) => repo(`ts-${n}`, 'TypeScript')),
  ...['a', 'b', 'c'].map((n) => repo(`dart-${n}`, 'Dart')),
  ...['a', 'b'].map((n) => repo(`js-${n}`, 'JavaScript')),
  repo('html', 'HTML'),
  repo('css', 'CSS'),
  repo('cpp', 'C++'),
  repo('go', 'Go'),
  repo('rust', 'Rust'),
  repo('forked', 'TypeScript', { isFork: true }),
  repo('nolang', null),
];

const reposPushed = (dates: string[]) => dates.map((d, i) => repo(`r${i}`, 'Go', { pushedAt: d }));

test('current streak skips an empty today', () =>
  expect(streaks(cal([0, 1, 2, 0, 3, 4, 5, 0]))).toEqual({ current: 3, best: 3 }));

test('broken streak', () => expect(streaks(cal([1, 1, 1, 1, 0, 0, 0]))).toEqual({ current: 0, best: 4 }));

test('empty calendar', () => expect(streaks([])).toEqual({ current: 0, best: 0 }));

test('busiest day: max, first on ties, null when no activity', () => {
  expect(busiestDay(cal([1, 5, 5, 2]))).toEqual({ date: '2026-01-02', count: 5 });
  expect(busiestDay(cal([0, 0]))).toBeNull();
  expect(busiestDay([])).toBeNull();
});

test('language stack: forks and null languages excluded, top 6 plus Other, ties by name, pct of counted repos', () => {
  // 14 counted repos: TS×4, Dart×3, JS×2, then five 1-repo languages tied → C++, CSS, Go by name; HTML + Rust → Other
  const s = languageStack(fixtureRepos);
  expect(s.map((x) => x.name)).toEqual(['TypeScript', 'Dart', 'JavaScript', 'C++', 'CSS', 'Go', 'Other']);
  expect(s[0]).toEqual({ name: 'TypeScript', repos: 4, pct: 29 }); // 4/14
  expect(s[6]).toEqual({ name: 'Other', repos: 2, pct: 14 }); // 2/14
});

test('language stack is empty when nothing is counted', () => {
  expect(languageStack([repo('x', null), repo('y', 'Go', { isFork: true })])).toEqual([]);
});

test('active repos within 30 days', () => {
  expect(
    activeRepos(reposPushed(['2026-11-10T00:00:00Z', '2026-10-01T00:00:00Z']), new Date('2026-11-11T06:00:00Z')),
  ).toBe(1);
});
