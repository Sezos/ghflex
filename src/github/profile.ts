import type { Day, Profile } from '../types.js';
import { GitHubError, type GraphQLClient } from './client.js';

export type Target = { kind: 'viewer' } | { kind: 'user'; login: string };

/** Builds the query wrapper for the viewer or a named user (login passed as a variable). */
export function rootFor(target: Target, extraVars = '') {
  if (target.kind === 'viewer') {
    return {
      header: extraVars ? `query(${extraVars})` : 'query',
      field: 'viewer',
      key: 'viewer' as const,
      vars: {} as Record<string, unknown>,
    };
  }
  return {
    header: `query($login: String!${extraVars ? `, ${extraVars}` : ''})`,
    field: 'user(login: $login)',
    key: 'user' as const,
    vars: { login: target.login } as Record<string, unknown>,
  };
}

export function notFound(target: Target): GitHubError {
  const login = target.kind === 'user' ? target.login : 'you';
  return new GitHubError('not_found', `No GitHub user named '${login}'.`);
}

/** Just the node id and login — cheap enough to fetch first so the commit scan can start right away. */
export async function fetchIdentity(client: GraphQLClient, target: Target): Promise<Pick<Profile, 'id' | 'login'>> {
  const r = rootFor(target);
  const { data } = await client.query<Record<string, { id: string; login: string } | null>>(
    `${r.header} { ${r.field} { id login } }`,
    r.vars,
  );
  const node = data[r.key];
  if (!node) throw notFound(target);
  return { id: node.id, login: node.login };
}

interface ProfileNode {
  id: string;
  login: string;
  name: string | null;
  createdAt: string;
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: number;
      weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
    };
  };
}

type YearTotals = Record<string, { contributionCalendar: { totalContributions: number } }>;

export async function fetchProfile(client: GraphQLClient, target: Target, now: Date): Promise<Profile> {
  const r = rootFor(target);
  const { data } = await client.query<Record<string, ProfileNode | null>>(
    `${r.header} { ${r.field} { id login name createdAt contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`,
    r.vars,
  );
  const node = data[r.key];
  if (!node) throw notFound(target);

  const calendar: Day[] = node.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const firstYear = new Date(node.createdAt).getUTCFullYear();
  const thisYear = now.getUTCFullYear();
  const aliases: string[] = [];
  for (let y = firstYear; y <= thisYear; y++) {
    const to = y === thisYear ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    aliases.push(
      `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${to}") { contributionCalendar { totalContributions } }`,
    );
  }
  const years = await client.query<Record<string, YearTotals | null>>(
    `${r.header} { ${r.field} { ${aliases.join(' ')} } }`,
    r.vars,
  );
  const totals = years.data[r.key] ?? {};
  const allTimeTotal = Object.values(totals).reduce(
    (sum, y) => sum + (y?.contributionCalendar.totalContributions ?? 0),
    0,
  );

  return {
    id: node.id,
    login: node.login,
    name: node.name,
    createdAt: node.createdAt,
    calendar,
    pastYearTotal: node.contributionsCollection.contributionCalendar.totalContributions,
    allTimeTotal,
  };
}
