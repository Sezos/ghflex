import { type Line, toAnsi } from '../../src/render/spans.js';
import type { CardData, CommitRecord, Day, Profile, Repo } from '../../src/types.js';

export const NOW = new Date('2026-11-11T06:00:00Z');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

export function plain(lines: Line[]): string[] {
  return lines.map((l) => toAnsi(l, { color: false }));
}

/** 371 days (53 weeks) ending on NOW's date. `count(i)` gets the day index, 0 = oldest. */
export function calendar(count: (i: number) => number): Day[] {
  const days: Day[] = [];
  for (let i = 0; i < 371; i++) {
    const d = new Date(NOW.getTime() - (370 - i) * DAY);
    days.push({ date: d.toISOString().slice(0, 10), count: count(i) });
  }
  return days;
}

export function repo(nameWithOwner: string, lang: string | null, extra: Partial<Repo> = {}): Repo {
  return {
    nameWithOwner,
    name: nameWithOwner.split('/')[1],
    isPrivate: false,
    isFork: false,
    pushedAt: ago(60 * DAY),
    primaryLanguage: lang,
    ...extra,
  };
}

const AI_EMAIL: Record<string, string> = {
  'Claude Opus 5.5': 'noreply@anthropic.com',
  'Cursor Agent': 'cursoragent@cursor.com',
};

/** A commit by the user: `ai` names an AI co-author (mixed), or null for a plain commit. */
export function commit(repoName: string, ai: string | null, msAgo: number, login = 'Sezos'): CommitRecord {
  return {
    repo: repoName,
    message: ai ? `feat: work\n\nCo-Authored-By: ${ai} <${AI_EMAIL[ai]}>` : 'feat: work',
    authorName: 'Someone',
    authorEmail: 'me@example.com',
    authorLogin: login,
    committedDate: ago(msAgo),
    byUser: true,
  };
}

function many(n: number, f: (i: number) => CommitRecord): CommitRecord[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

function profile(extra: Partial<Profile>): Profile {
  return {
    id: 'U_sezos',
    login: 'Sezos',
    name: 'Badral',
    createdAt: '2019-03-23T13:12:27Z',
    calendar: calendar((i) => ((i * 37) % 11 < 5 ? 0 : 1 + ((i * 13) % 9) + Math.floor(i / 60))),
    pastYearTotal: 818,
    allTimeTotal: 1590,
    ...extra,
  };
}

/** Like Badral's account. 5 repos with commits in the window (one fill row needed), overall 15/20 = 75% AI. */
export function richData(): CardData {
  const LANGS: [string | null, number][] = [
    ['TypeScript', 32],
    ['Dart', 29],
    ['JavaScript', 19],
    ['HTML', 10],
    ['CSS', 5],
    ['C++', 2],
    ['Wolfram Language', 1],
    [null, 10],
  ];
  const named: Repo[] = [
    repo('Sezos/physicue-pro-app', 'Dart', { isPrivate: true, pushedAt: ago(17 * MIN) }),
    repo('Sezos/hymdral_backend', 'TypeScript', { isPrivate: true, pushedAt: ago(13 * HOUR) }),
    repo('Sezos/vitamin-house', 'TypeScript', { isPrivate: true, pushedAt: ago(2 * DAY) }),
    repo('Sezos/portfolio', 'TypeScript', { isPrivate: true, pushedAt: ago(2 * DAY + HOUR) }),
    repo('Sezos/darts', 'Dart', { pushedAt: ago(5 * DAY) }),
  ];
  // The named repos already use 3 TypeScript + 2 Dart; the 103 filler repos make up the rest of the 108.
  const used: Record<string, number> = { TypeScript: 3, Dart: 2 };
  const pool: (string | null)[] = [];
  for (const [lang, n] of LANGS) for (let k = 0; k < n - (used[lang ?? ''] ?? 0); k++) pool.push(lang);
  const privateFiller = 74 - named.filter((r) => r.isPrivate).length;
  const filler = pool.map((lang, i) =>
    repo(`Sezos/project-${i}`, lang, { isPrivate: i < privateFiller, pushedAt: ago((10 + i * 3) * DAY) }),
  );
  const owned = [...named, ...filler];
  const org = repo('mezorn-com/tetgeleg-admin-api', 'TypeScript', { isPrivate: true, pushedAt: ago(20 * DAY) });

  const commits = [
    commit('Sezos/physicue-pro-app', 'Claude Opus 5.5', 17 * MIN),
    commit('Sezos/physicue-pro-app', 'Claude Opus 5.5', 3 * HOUR),
    commit('Sezos/physicue-pro-app', 'Claude Opus 5.5', 5 * HOUR),
    commit('Sezos/physicue-pro-app', null, 9 * HOUR),
    ...many(5, (i) => commit('Sezos/hymdral_backend', 'Claude Opus 5.5', 13 * HOUR + i * HOUR)),
    ...many(2, (i) => commit('Sezos/hymdral_backend', 'Cursor Agent', 20 * HOUR + i * HOUR)),
    commit('Sezos/hymdral_backend', null, 30 * HOUR),
    ...many(3, (i) => commit('Sezos/vitamin-house', 'Claude Opus 5.5', 2 * DAY + i * HOUR)),
    commit('Sezos/vitamin-house', null, 3 * DAY),
    commit('Sezos/darts', null, 5 * DAY),
    commit('Sezos/darts', null, 6 * DAY),
    commit('mezorn-com/tetgeleg-admin-api', 'Claude Opus 5.5', 20 * DAY),
    commit('mezorn-com/tetgeleg-admin-api', 'Claude Opus 5.5', 21 * DAY),
  ];

  return {
    mode: 'self',
    profile: profile({}),
    ownedRepos: owned,
    scan: { commits, scannedRepos: [...named, org], capped: false, skipped: 0 },
    now: NOW,
  };
}

export function emptyData(): CardData {
  return {
    mode: 'self',
    profile: profile({
      id: 'U_new',
      login: 'newbie',
      name: null,
      createdAt: '2026-11-01T00:00:00Z',
      calendar: calendar(() => 0),
      pastYearTotal: 0,
      allTimeTotal: 0,
    }),
    ownedRepos: [],
    scan: { commits: [], scannedRepos: [], capped: false, skipped: 0 },
    now: NOW,
  };
}

export function longNamesData(): CardData {
  const long = repo('maxalex/a-really-long-repository-name-here', 'Wolfram Language', { pushedAt: ago(4 * HOUR) });
  return {
    mode: 'self',
    profile: profile({ id: 'U_max', login: 'maxalex', name: 'Maximilian Alexander' }),
    ownedRepos: [long, repo('maxalex/x', 'Visual Basic .NET', { pushedAt: ago(40 * DAY) })],
    scan: {
      commits: [
        commit(long.nameWithOwner, 'Claude Opus 5.5', 4 * HOUR, 'maxalex'),
        commit(long.nameWithOwner, null, 400 * DAY, 'maxalex'),
      ],
      scannedRepos: [long],
      capped: false,
      skipped: 0,
    },
    now: NOW,
  };
}

export function peekData(): CardData {
  const owned = Array.from({ length: 34 }, (_, i) =>
    repo(`mia/lib-${i}`, i % 2 ? 'Python' : 'Rust', { pushedAt: ago((1 + i) * DAY) }),
  );
  return {
    mode: 'peek',
    profile: profile({ id: 'U_mia', login: 'mia', name: 'Mia', createdAt: '2021-05-01T00:00:00Z' }),
    ownedRepos: owned,
    scan: {
      commits: [commit('mia/lib-0', null, DAY, 'mia'), commit('mia/lib-1', 'Claude Opus 5.5', 2 * DAY, 'mia')],
      scannedRepos: owned.slice(0, 2),
      capped: false,
      skipped: 0,
    },
    now: NOW,
  };
}
