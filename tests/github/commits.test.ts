import { expect, test } from 'vitest';
import { GitHubError } from '../../src/github/client.js';
import { MAX_PAGES, MAX_REPOS, PAGE_SIZE, scanCommits, WINDOW_DAYS } from '../../src/github/commits.js';
import type { Repo } from '../../src/types.js';
import { NOW } from '../fixtures/cards.js';
import { fakeClient, type Handler, PartialResult } from './fake-client.js';

const DAY = 86_400_000;
const me = { id: 'U_me', login: 'Sezos' };
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

const repoNode = (nameWithOwner: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
  nameWithOwner,
  name: nameWithOwner.split('/')[1],
  isPrivate: false,
  isFork: false,
  pushedAt: iso(daysAgo * DAY),
  createdAt: '2024-01-01T00:00:00Z',
  primaryLanguage: { name: 'TypeScript' },
  ...extra,
});

/** Answers the self-mode candidate query with one page of repo nodes. */
const candidates =
  (nodes: unknown[]): Handler =>
  (q) =>
    q.includes('ORGANIZATION_MEMBER')
      ? { viewer: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } }
      : undefined;

type CommitNode = {
  message: string;
  committedDate: string;
  parents: { totalCount: number };
  author: { name: string; email: string; user: { id: string; login: string } | null };
};

const userCommit = (i: number, extra: Partial<CommitNode> = {}): CommitNode => ({
  message: `feat: ${i}`,
  committedDate: iso(DAY + i * 1000),
  parents: { totalCount: 1 },
  author: { name: 'Badral', email: 'b@x.com', user: { id: 'U_me', login: 'Sezos' } },
  ...extra,
});
const agentCommit = (): CommitNode => ({
  message: 'Fix bug',
  committedDate: iso(DAY),
  parents: { totalCount: 1 },
  author: { name: 'copilot-swe-agent[bot]', email: '198982749+Copilot@users.noreply.github.com', user: null },
});
const teammateCommit = (): CommitNode => ({
  message: 'chore',
  committedDate: iso(DAY),
  parents: { totalCount: 1 },
  author: { name: 'Teammate', email: 't@x.com', user: { id: 'U_other', login: 'other' } },
});

const ALIAS =
  /r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ defaultBranchRef \{ target \{ \.\.\. on Commit \{ history\(([^)]*)\)/g;

type HistoryAnswer =
  | { nodes: CommitNode[]; hasNextPage?: boolean; endCursor?: string | null }
  | 'null-repo'
  | 'no-branch';

/** Answers batched history queries; `fn` gets owner, name, raw history args and the `after` cursor. */
function histories(fn: (owner: string, name: string, args: string, after: string | null) => HistoryAnswer): Handler {
  return (q) => {
    if (!q.includes('history(')) return undefined;
    const data: Record<string, unknown> = {};
    const errors = [];
    for (const m of q.matchAll(ALIAS)) {
      const [, i, owner, name, args] = m;
      const after = /after: "([^"]+)"/.exec(args)?.[1] ?? null;
      const a = fn(owner, name, args, after);
      if (a === 'null-repo') {
        data[`r${i}`] = null;
        errors.push({ type: 'FORBIDDEN', message: 'SAML enforcement', path: [`r${i}`] });
      } else if (a === 'no-branch') {
        data[`r${i}`] = { defaultBranchRef: null };
      } else {
        data[`r${i}`] = {
          defaultBranchRef: {
            target: {
              history: {
                pageInfo: { hasNextPage: a.hasNextPage ?? false, endCursor: a.endCursor ?? null },
                nodes: a.nodes,
              },
            },
          },
        };
      }
    }
    return errors.length ? new PartialResult(data, errors) : data;
  };
}

const owned: Repo[] = [];

test('self candidates stop at the window and cap at 60', async () => {
  const nodes = [
    ...Array.from({ length: 70 }, (_, i) => repoNode(`Sezos/r${i}`, i * 0.5)),
    ...Array.from({ length: 5 }, (_, i) => repoNode(`Sezos/old${i}`, WINDOW_DAYS + 1 + i)),
  ];
  const r = await scanCommits(
    fakeClient([candidates(nodes), histories(() => ({ nodes: [] }))]),
    { kind: 'viewer' },
    me,
    owned,
    NOW,
  );
  expect(r.scannedRepos).toHaveLength(MAX_REPOS);
  expect(r.capped).toBe(true);
  expect(r.scannedRepos.some((x) => x.name.startsWith('old'))).toBe(false);
});

test('not capped when the window holds 60 or fewer repos', async () => {
  const nodes = [repoNode('Sezos/a', 1), repoNode('Sezos/old', WINDOW_DAYS + 5)];
  const r = await scanCommits(
    fakeClient([candidates(nodes), histories(() => ({ nodes: [] }))]),
    { kind: 'viewer' },
    me,
    owned,
    NOW,
  );
  expect(r.scannedRepos.map((x) => x.name)).toEqual(['a']);
  expect(r.capped).toBe(false);
});

test('history window starts 90 days before now', async () => {
  const f = fakeClient([candidates([repoNode('Sezos/a', 1)]), histories(() => ({ nodes: [] }))]);
  await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(f.queries.find((q) => q.includes('history('))).toContain(`since: "${iso(WINDOW_DAYS * DAY)}"`);
});

test('owned repos: user commits from the author-filtered history, agents from one unfiltered page, teammates dropped', async () => {
  const f = fakeClient([
    candidates([repoNode('Sezos/app', 1)]),
    histories((_o, _n, args) =>
      args.includes('author:')
        ? { nodes: [userCommit(1), userCommit(2), userCommit(3)] }
        : {
            // the unfiltered page sees everyone; it claims more pages exist, which must be ignored
            nodes: [userCommit(1), userCommit(2), userCommit(3), agentCommit(), teammateCommit(), teammateCommit()],
            hasNextPage: true,
            endCursor: 'more',
          },
    ),
  ]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits).toHaveLength(4);
  expect(r.commits.filter((c) => c.byUser)).toHaveLength(3);
  expect(r.commits.find((c) => !c.byUser)).toMatchObject({ authorName: 'copilot-swe-agent[bot]', authorLogin: null });
});

test('REVIEW FOCUS: a huge owned repo is never paged through unfiltered', async () => {
  const f = fakeClient([
    candidates([repoNode('Sezos/linux', 1)]),
    histories((_o, _n, args) =>
      args.includes('author:')
        ? { nodes: [userCommit(1)] }
        : { nodes: [teammateCommit(), teammateCommit()], hasNextPage: true, endCursor: 'next' },
    ),
  ]);
  await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  // per-repo history arguments across all (batched) queries
  const unfiltered = f.queries
    .flatMap((q) => [...q.matchAll(ALIAS)].map((m) => m[4]))
    .filter((a) => !a.includes('author:'));
  expect(unfiltered).toHaveLength(1);
  expect(unfiltered[0]).not.toContain('after:');
});

test('non-owned repos use the author filter', async () => {
  const f = fakeClient([
    candidates([repoNode('acme/api', 1)]),
    histories((_o, _n, args) => ({
      nodes: args.includes('author: {id: "U_me"}') ? [userCommit(1), userCommit(2)] : [],
    })),
  ]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits).toHaveLength(2);
  expect(r.commits[0]).toMatchObject({ repo: 'acme/api', byUser: true, authorLogin: 'Sezos' });
});

test('merge commits are excluded', async () => {
  const f = fakeClient([
    candidates([repoNode('Sezos/app', 1)]),
    histories(() => ({
      nodes: [userCommit(1), userCommit(2, { message: 'Merge branch x', parents: { totalCount: 2 } })],
    })),
  ]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits.map((c) => c.message)).toEqual(['feat: 1']);
});

function pagedHistory(total: number): Handler {
  const all = Array.from({ length: total }, (_, i) => userCommit(i));
  return histories((_o, _n, args, after) => {
    expect(args).toContain(`first: ${PAGE_SIZE}`);
    const start = after ? Number(after) : 0;
    const end = start + PAGE_SIZE;
    return { nodes: all.slice(start, end), hasNextPage: end < all.length, endCursor: String(end) };
  });
}

test('history paginates in pages of 100', async () => {
  expect(PAGE_SIZE).toBe(100);
  const f = fakeClient([candidates([repoNode('acme/big', 1)]), pagedHistory(250)]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits).toHaveLength(250);
  expect(f.queries.filter((q) => q.includes('history('))).toHaveLength(3);
});

test('a repo is read for at most 3 pages (its 300 most recent commits)', async () => {
  expect(MAX_PAGES).toBe(3);
  const f = fakeClient([candidates([repoNode('acme/huge', 1)]), pagedHistory(1000)]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits).toHaveLength(MAX_PAGES * PAGE_SIZE);
  expect(f.queries.filter((q) => q.includes('history('))).toHaveLength(MAX_PAGES);
});

test('REVIEW FOCUS: SAML-forbidden (null) repos and empty repos are skipped, others still counted', async () => {
  const f = fakeClient([
    candidates([repoNode('corp/secret', 1), repoNode('Sezos/empty', 1), repoNode('Sezos/app', 1)]),
    histories((_o, name) =>
      name === 'secret' ? 'null-repo' : name === 'empty' ? 'no-branch' : { nodes: [userCommit(1), userCommit(2)] },
    ),
  ]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(r.commits).toHaveLength(2);
  expect(r.commits.every((c) => c.repo === 'Sezos/app')).toBe(true);
});

test('persistent 502 splits the batch and skips only the bad repo', async () => {
  const bad: Handler = (q) => {
    if (q.includes('history(') && q.includes('name: "r3"')) throw new GitHubError('server', 'HTTP 502');
    return undefined;
  };
  const f = fakeClient([
    candidates(Array.from({ length: 5 }, (_, i) => repoNode(`o/r${i}`, 1 + i * 0.1))),
    bad,
    histories(() => ({ nodes: [userCommit(1)] })),
  ]);
  const r = await scanCommits(f, { kind: 'viewer' }, me, owned, NOW);
  expect(new Set(r.commits.map((c) => c.repo))).toEqual(new Set(['o/r0', 'o/r1', 'o/r2', 'o/r4']));
});

test('auth errors are not swallowed by the batch splitting', async () => {
  const f = fakeClient([
    candidates([repoNode('Sezos/app', 1)]),
    (q) => {
      if (q.includes('history(')) throw new GitHubError('auth', 'bad token');
      return undefined;
    },
  ]);
  await expect(scanCommits(f, { kind: 'viewer' }, me, owned, NOW)).rejects.toMatchObject({ kind: 'auth' });
});

test('peek: candidates are public only, from contributions and public owned repos', async () => {
  const mia = { id: 'U_mia', login: 'mia' };
  const miaOwned: Repo[] = [
    {
      nameWithOwner: 'mia/site',
      name: 'site',
      isPrivate: false,
      isFork: false,
      pushedAt: iso(2 * DAY),
      primaryLanguage: 'Go',
    },
  ];
  const f = fakeClient([
    (q, vars) =>
      q.includes('commitContributionsByRepository') && vars?.login === 'mia'
        ? {
            user: {
              contributionsCollection: {
                commitContributionsByRepository: [
                  { repository: repoNode('acme/oss', 1) },
                  { repository: repoNode('acme/internal', 1, { isPrivate: true }) },
                ],
              },
            },
          }
        : undefined,
    histories(() => ({ nodes: [] })),
  ]);
  const r = await scanCommits(f, { kind: 'user', login: 'mia' }, mia, miaOwned, NOW);
  expect(r.scannedRepos.map((x) => x.nameWithOwner).sort()).toEqual(['acme/oss', 'mia/site']);
  expect(f.queries.some((q) => q.includes('internal'))).toBe(false);
});
