import { join } from 'node:path';
import { expect, test } from 'vitest';
import { type AppDeps, run } from '../src/app.js';
import { AuthMissingError } from '../src/auth/token.js';
import { NOW, richData } from './fixtures/cards.js';
import { fakeClient, type Handler } from './github/fake-client.js';

type Sink = { buf: string; isTTY: boolean; write(s: string): boolean };
const sink = (): Sink => {
  const s: Sink = {
    buf: '',
    isTTY: false,
    write(x: string) {
      s.buf += x;
      return true;
    },
  };
  return s;
};

type FakeDeps = AppDeps & { stdout: Sink; stderr: Sink; written: string[] };

function fakeDeps(handlers: Handler[], over: Partial<AppDeps> = {}): FakeDeps {
  const written: string[] = [];
  return {
    stdout: sink(),
    stderr: sink(),
    env: {},
    cwd: '/tmp/ghflex-test',
    now: () => NOW,
    random: () => 0,
    getToken: async () => ({ token: 't', source: 'env' }),
    deleteSavedToken: async () => true,
    makeClient: () => fakeClient(handlers),
    renderStory: async () => Buffer.from([0]),
    writeFile: async (p) => {
      written.push(p);
    },
    version: '0.1.0',
    written,
    ...over,
  } as FakeDeps;
}

const ALIAS =
  /r(\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ defaultBranchRef \{ target \{ \.\.\. on Commit \{ history\(([^)]*)\)/g;

/** GraphQL answers that reproduce richData() end to end. */
function richApiResponses(): Handler[] {
  const d = richData();
  const node = (r: (typeof d.ownedRepos)[number]) => ({
    ...r,
    createdAt: '2020-01-01T00:00:00Z',
    primaryLanguage: r.primaryLanguage ? { name: r.primaryLanguage } : null,
  });
  const weeks: { contributionDays: { date: string; contributionCount: number }[] }[] = [];
  for (let i = 0; i < d.profile.calendar.length; i += 7) {
    weeks.push({
      contributionDays: d.profile.calendar.slice(i, i + 7).map((x) => ({ date: x.date, contributionCount: x.count })),
    });
  }
  const page = (nodes: unknown[]) => ({ repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } });
  return [
    (q) => (q.includes('viewer { id login }') ? { viewer: { id: d.profile.id, login: d.profile.login } } : undefined),
    (q) =>
      q.includes('weeks')
        ? {
            viewer: {
              id: d.profile.id,
              login: d.profile.login,
              name: d.profile.name,
              createdAt: d.profile.createdAt,
              contributionsCollection: { contributionCalendar: { totalContributions: d.profile.pastYearTotal, weeks } },
            },
          }
        : undefined,
    (q) =>
      q.includes('y2019:')
        ? { viewer: { y2019: { contributionCalendar: { totalContributions: d.profile.allTimeTotal } } } }
        : undefined,
    (q) => (q.includes('ORGANIZATION_MEMBER') ? { viewer: page(d.scan.scannedRepos.map(node)) } : undefined),
    (q) => (q.includes('ownerAffiliations: OWNER,') ? { viewer: page(d.ownedRepos.map(node)) } : undefined),
    (q) => {
      if (!q.includes('history(')) return undefined;
      const data: Record<string, unknown> = {};
      for (const [, i, owner, name, args] of q.matchAll(ALIAS)) {
        const nodes = args.includes('author:')
          ? d.scan.commits
              .filter((c) => c.repo === `${owner}/${name}`)
              .map((c) => ({
                message: c.message,
                committedDate: c.committedDate,
                parents: { totalCount: 1 },
                author: {
                  name: c.authorName,
                  email: c.authorEmail,
                  user: { id: d.profile.id, login: d.profile.login },
                },
              }))
          : [];
        data[`r${i}`] = {
          defaultBranchRef: { target: { history: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } },
        };
      }
      return data;
    },
  ];
}

test('happy path prints the card with the AI meter and npx ghflex, and exits 0', async () => {
  const d = fakeDeps(richApiResponses());
  expect(await run([], d)).toBe(0);
  expect(d.stdout.buf).toContain('npx ghflex');
  expect(d.stdout.buf).toContain('overall 75% AI-assisted · sidekick Claude Opus 5.5');
  expect(d.stdout.buf).toContain('● physicue-pro-app    Dart  ▰▰▰▰▰▰▰▰▱▱  75% AI       17m');
  expect(d.stderr.buf).toBe('');
});

test('REVIEW FOCUS: piped output has no escape codes', async () => {
  const d = fakeDeps(richApiResponses());
  await run([], d);
  expect(d.stdout.buf).not.toMatch(/\x1b/);
});

test('FORCE_COLOR keeps colors when piped', async () => {
  const d = fakeDeps(richApiResponses(), { env: { FORCE_COLOR: '1' } });
  await run(['--hide-private'], d);
  expect(d.stdout.buf).toContain('\x1b[38;5;');
  expect(d.stdout.buf).not.toContain('physicue-pro-app');
});

test('REVIEW FOCUS: unknown user exits 1 with friendly message, no stack', async () => {
  const d = fakeDeps([() => ({ user: null })]);
  expect(await run(['nobody-here-xyz'], d)).toBe(1);
  expect(d.stderr.buf).toContain("No GitHub user named 'nobody-here-xyz'.");
  expect(d.stderr.buf).not.toContain('    at ');
});

test('missing login exits 1 with the instructions', async () => {
  const d = fakeDeps([], {
    getToken: async () => {
      throw new AuthMissingError('No GitHub login found. Run `gh auth login`.');
    },
  });
  expect(await run([], d)).toBe(1);
  expect(d.stderr.buf).toContain('gh auth login');
});

test('usage error exits 2 and points at --help', async () => {
  const d = fakeDeps([]);
  expect(await run(['--theme', 'pink'], d)).toBe(2);
  expect(d.stderr.buf).toContain('ghflex --help');
});

test('--story writes the PNG to cwd', async () => {
  const d = fakeDeps(richApiResponses());
  expect(await run(['--story'], d)).toBe(0);
  expect(d.written).toEqual([join(d.cwd, 'ghflex-story.png')]);
  expect(d.stdout.buf).toContain('saved ghflex-story.png (1080×1920)');
});

test('--story failure still exits 1 with a message', async () => {
  const d = fakeDeps(richApiResponses(), {
    renderStory: async () => {
      throw new Error('The --story fonts are missing from this install (assets/fonts).');
    },
  });
  expect(await run(['--story'], d)).toBe(1);
  expect(d.stderr.buf).toContain('fonts are missing');
});

test('--logout deletes the saved token', async () => {
  const d = fakeDeps([]);
  expect(await run(['--logout'], d)).toBe(0);
  expect(d.stdout.buf).toMatch(/logged out|no saved token/);
  const none = fakeDeps([], { deleteSavedToken: async () => false });
  await run(['--logout'], none);
  expect(none.stdout.buf).toContain('no saved token');
});

test('--help lists every flag and --version prints the version', async () => {
  const d = fakeDeps([]);
  expect(await run(['--help'], d)).toBe(0);
  for (const flag of ['--banner', '--hide-private', '--story', '--theme', '--fast', '--no-clear', '--logout']) {
    expect(d.stdout.buf).toContain(flag);
  }
  const v = fakeDeps([]);
  expect(await run(['--version'], v)).toBe(0);
  expect(v.stdout.buf).toBe('0.1.0\n');
});

test('REVIEW FOCUS: NO_COLOR on a terminal writes no escape codes at all (no clear, no animation, no spinner)', async () => {
  const d = fakeDeps(richApiResponses(), { env: { NO_COLOR: '1' } });
  d.stdout.isTTY = true;
  d.stderr.isTTY = true;
  expect(await run(['--fast'], d)).toBe(0);
  expect(d.stdout.buf).not.toMatch(/\x1b/);
  expect(d.stderr.buf).not.toMatch(/\x1b/);
  expect(d.stdout.buf).toContain('npx ghflex');
});

test('a normal terminal still gets color, the clear and the reveal', async () => {
  const d = fakeDeps(richApiResponses());
  d.stdout.isTTY = true;
  expect(await run([], d)).toBe(0);
  expect(d.stdout.buf).toContain('\x1b[2J\x1b[H');
  expect(d.stdout.buf).toContain('\x1b[?25l');
});
