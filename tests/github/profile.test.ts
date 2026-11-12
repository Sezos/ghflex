import { expect, test } from 'vitest';
import { fetchIdentity, fetchProfile } from '../../src/github/profile.js';
import { fetchOwnedRepos } from '../../src/github/repos.js';
import { NOW } from '../fixtures/cards.js';
import { fakeClient, type Handler } from './fake-client.js';

function weeks() {
  // two weeks, newest last
  return [
    { contributionDays: ['2026-11-01', '2026-11-02'].map((date) => ({ date, contributionCount: 1 })) },
    {
      contributionDays: ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'].map((date) => ({
        date,
        contributionCount: 2,
      })),
    },
  ];
}

function viewerProfile(o: { createdAt: string; years: Record<string, number> }): Handler {
  return (q) => {
    if (q.includes('weeks')) {
      return {
        viewer: {
          id: 'U_1',
          login: 'Sezos',
          name: 'Badral',
          createdAt: o.createdAt,
          contributionsCollection: { contributionCalendar: { totalContributions: 818, weeks: weeks() } },
        },
      };
    }
    if (q.includes('y20')) {
      const viewer = Object.fromEntries(
        Object.entries(o.years).map(([k, v]) => [k, { contributionCalendar: { totalContributions: v } }]),
      );
      return { viewer };
    }
    return undefined;
  };
}

const node = (i: number, extra: Record<string, unknown> = {}) => ({
  nameWithOwner: `o/r${i}`,
  name: `r${i}`,
  isPrivate: false,
  isFork: false,
  pushedAt: '2026-11-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
  primaryLanguage: { name: 'Dart' },
  ...extra,
});

const reposPage = (nodes: unknown[], hasNextPage: boolean, endCursor: string | null) => ({
  repositories: { pageInfo: { hasNextPage, endCursor }, nodes },
});

test('viewer profile flattens calendar and sums yearly totals', async () => {
  const p = await fetchProfile(
    fakeClient([viewerProfile({ createdAt: '2024-03-23T13:12:27Z', years: { y2024: 100, y2025: 400, y2026: 818 } })]),
    { kind: 'viewer' },
    NOW,
  );
  expect(p).toMatchObject({ id: 'U_1', login: 'Sezos', name: 'Badral', pastYearTotal: 818, allTimeTotal: 1318 });
  expect(p.calendar).toHaveLength(6);
  expect(p.calendar[0]).toEqual({ date: '2026-11-01', count: 1 });
  expect(p.calendar[0].date < (p.calendar.at(-1)?.date ?? '')).toBe(true);
});

test('yearly totals query asks for one alias per year from creation to now', async () => {
  const c = fakeClient([viewerProfile({ createdAt: '2024-03-23T13:12:27Z', years: { y2024: 1, y2025: 1, y2026: 1 } })]);
  await fetchProfile(c, { kind: 'viewer' }, NOW);
  const yearly = c.queries.find((q) => q.includes('y20')) ?? '';
  expect(yearly.match(/y\d{4}:/g)).toEqual(['y2024:', 'y2025:', 'y2026:']);
});

test('peek profile passes the login as a variable', async () => {
  const c = fakeClient([
    (q, vars) =>
      q.includes('weeks') && vars?.login === 'mia'
        ? {
            user: {
              id: 'U_mia',
              login: 'mia',
              name: null,
              createdAt: '2026-01-01T00:00:00Z',
              contributionsCollection: { contributionCalendar: { totalContributions: 5, weeks: weeks() } },
            },
          }
        : undefined,
    (q) => (q.includes('y20') ? { user: { y2026: { contributionCalendar: { totalContributions: 5 } } } } : undefined),
  ]);
  expect(await fetchProfile(c, { kind: 'user', login: 'mia' }, NOW)).toMatchObject({
    login: 'mia',
    name: null,
    allTimeTotal: 5,
  });
});

test('REVIEW FOCUS: unknown user or org login → not_found with friendly message', async () => {
  await expect(
    fetchProfile(fakeClient([() => ({ user: null })]), { kind: 'user', login: 'vercel' }, NOW),
  ).rejects.toMatchObject({
    kind: 'not_found',
    message: "No GitHub user named 'vercel'.",
  });
});

test('owned repos paginate and map language names', async () => {
  const page1: Handler = (q, vars) =>
    q.includes('repositories') && !vars?.after
      ? {
          viewer: reposPage(
            Array.from({ length: 100 }, (_, i) => node(i)),
            true,
            'c1',
          ),
        }
      : undefined;
  const page2: Handler = (q, vars) =>
    q.includes('repositories') && vars?.after === 'c1'
      ? {
          viewer: reposPage(
            Array.from({ length: 50 }, (_, i) => node(100 + i, { primaryLanguage: null })),
            false,
            null,
          ),
        }
      : undefined;
  const repos = await fetchOwnedRepos(fakeClient([page1, page2]), { kind: 'viewer' });
  expect(repos).toHaveLength(150);
  expect(repos[0]).toEqual({
    nameWithOwner: 'o/r0',
    name: 'r0',
    isPrivate: false,
    isFork: false,
    pushedAt: '2026-11-01T00:00:00Z',
    primaryLanguage: 'Dart',
  });
  expect(repos[149].primaryLanguage).toBeNull();
});

test('empty repos without pushedAt fall back to createdAt', async () => {
  const c = fakeClient([() => ({ viewer: reposPage([node(1, { pushedAt: null })], false, null) })]);
  expect((await fetchOwnedRepos(c, { kind: 'viewer' }))[0].pushedAt).toBe('2025-01-01T00:00:00Z');
});

test('peek drops private repos even if the API returns them', async () => {
  const c = fakeClient([
    (q, vars) =>
      vars?.login === 'mia' && q.includes('privacy: PUBLIC')
        ? { user: reposPage([node(1), node(2, { isPrivate: true }), node(3)], false, null) }
        : undefined,
  ]);
  const repos = await fetchOwnedRepos(c, { kind: 'user', login: 'mia' });
  expect(repos.map((r) => r.name)).toEqual(['r1', 'r3']);
});

test('fetchIdentity returns just id and login, for the viewer or a user', async () => {
  const c = fakeClient([
    (q) => (q.includes('viewer { id login }') ? { viewer: { id: 'U_1', login: 'Sezos' } } : undefined),
    (q, vars) =>
      q.includes('user(login: $login) { id login }') && vars?.login === 'mia'
        ? { user: { id: 'U_mia', login: 'mia' } }
        : undefined,
  ]);
  expect(await fetchIdentity(c, { kind: 'viewer' })).toEqual({ id: 'U_1', login: 'Sezos' });
  expect(await fetchIdentity(c, { kind: 'user', login: 'mia' })).toEqual({ id: 'U_mia', login: 'mia' });
});

test('fetchIdentity: unknown user is not_found', async () => {
  await expect(
    fetchIdentity(fakeClient([() => ({ user: null })]), { kind: 'user', login: 'ghost-xyz' }),
  ).rejects.toMatchObject({
    kind: 'not_found',
    message: "No GitHub user named 'ghost-xyz'.",
  });
});
