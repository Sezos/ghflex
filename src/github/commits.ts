import { isAgentAuthor } from '../ai/classify.js';
import type { CommitRecord, Profile, Repo, ScanResult } from '../types.js';
import { GitHubError, type GraphQLClient, mapLimit } from './client.js';
import { notFound, type Target } from './profile.js';
import { REPO_FIELDS, type RepoNode, toRepo } from './repos.js';

export const WINDOW_DAYS = 90;
export const MAX_REPOS = 60;
export const BATCH_SIZE = 5;
export const PAGE_SIZE = 100;
export const CONCURRENCY = 6;
/** A repo's AI % comes from at most this many pages of the user's most recent commits. */
export const MAX_PAGES = 3;

const DAY_MS = 86_400_000;

type Who = Pick<Profile, 'id' | 'login'>;

/**
 * 'user': the user's own commits (author-filtered, paginated up to MAX_PAGES).
 * 'agents': one unfiltered page of an owned repo, used only to spot AI agent commits.
 */
interface Job {
  repo: Repo;
  mode: 'user' | 'agents';
  after: string | null;
  page: number;
}

interface CommitNode {
  message: string;
  committedDate: string;
  parents: { totalCount: number };
  author: { name: string | null; email: string | null; user: { id: string; login: string } | null } | null;
}

interface HistoryNode {
  defaultBranchRef: {
    target: {
      history?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (CommitNode | null)[] };
    } | null;
  } | null;
}

// ---------- candidates ----------

interface RepoPage {
  repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (RepoNode | null)[] };
}

function capRepos(inWindow: Repo[]): { repos: Repo[]; capped: boolean } {
  return { repos: inWindow.slice(0, MAX_REPOS), capped: inWindow.length > MAX_REPOS };
}

/** Every repo the viewer can push to (owned, collaborator, org), newest push first, inside the window. */
async function selfCandidates(client: GraphQLClient, since: string) {
  const q = `query($after: String) { viewer { repositories(first: 100, after: $after, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) { pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`;
  const inWindow: Repo[] = [];
  let after: string | null = null;
  let done = false;
  while (!done) {
    const res: { data: { viewer: RepoPage } } = await client.query<{ viewer: RepoPage }>(q, { after });
    const page: RepoPage['repositories'] = res.data.viewer.repositories;
    for (const n of page.nodes) {
      if (!n) continue;
      const repo = toRepo(n);
      if (repo.pushedAt < since) {
        done = true;
        break;
      }
      inWindow.push(repo);
      if (inWindow.length > MAX_REPOS) {
        done = true;
        break;
      }
    }
    if (!page.pageInfo.hasNextPage) done = true;
    after = page.pageInfo.endCursor;
  }
  return capRepos(inWindow);
}

/** Public repos a user committed to in the window, plus their public owned repos pushed in the window. */
async function peekCandidates(client: GraphQLClient, login: string, ownedRepos: Repo[], since: string, now: Date) {
  const q = `query($login: String!) { user(login: $login) { contributionsCollection(from: "${since}", to: "${now.toISOString()}") { commitContributionsByRepository(maxRepositories: 100) { repository { ${REPO_FIELDS} } } } } }`;
  const { data } = await client.query<{
    user: { contributionsCollection: { commitContributionsByRepository: { repository: RepoNode | null }[] } } | null;
  }>(q, { login });
  if (!data.user) throw notFound({ kind: 'user', login });

  const byName = new Map<string, Repo>();
  for (const c of data.user.contributionsCollection.commitContributionsByRepository) {
    if (c.repository) byName.set(c.repository.nameWithOwner, toRepo(c.repository));
  }
  for (const r of ownedRepos) if (r.pushedAt >= since && !byName.has(r.nameWithOwner)) byName.set(r.nameWithOwner, r);

  const repos = [...byName.values()]
    .filter((r) => !r.isPrivate)
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  return capRepos(repos);
}

// ---------- history ----------

function historyQuery(jobs: Job[], who: Who, since: string): string {
  const fields =
    'pageInfo { hasNextPage endCursor } nodes { message committedDate parents { totalCount } author { name email user { id login } } }';
  const parts = jobs.map((job, i) => {
    const [owner, name] = job.repo.nameWithOwner.split('/');
    const args = [`first: ${PAGE_SIZE}`, `since: ${JSON.stringify(since)}`];
    if (job.after) args.push(`after: ${JSON.stringify(job.after)}`);
    if (job.mode === 'user') args.push(`author: {id: ${JSON.stringify(who.id)}}`);
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { defaultBranchRef { target { ... on Commit { history(${args.join(', ')}) { ${fields} } } } } }`;
  });
  return `query { ${parts.join(' ')} }`;
}

interface BatchResult {
  commits: CommitRecord[];
  next: Job[];
}

async function fetchBatch(client: GraphQLClient, jobs: Job[], who: Who, since: string): Promise<BatchResult> {
  const { data } = await client.query<Record<string, HistoryNode | null>>(historyQuery(jobs, who, since));
  const out: BatchResult = { commits: [], next: [] };
  jobs.forEach((job, i) => {
    const history = data[`r${i}`]?.defaultBranchRef?.target?.history;
    if (!history) return; // forbidden (SAML), deleted, or empty repo
    for (const n of history.nodes) {
      if (!n || n.parents.totalCount > 1) continue;
      const authorName = n.author?.name ?? '';
      const authorEmail = n.author?.email ?? '';
      const authorLogin = n.author?.user?.login ?? null;
      const byUser = n.author?.user?.id === who.id;
      // user pages keep the user's commits; the agents page keeps only AI agent commits (no double counting)
      const keep = job.mode === 'user' ? byUser : !byUser && isAgentAuthor({ authorName, authorEmail, authorLogin });
      if (!keep) continue;
      out.commits.push({
        repo: job.repo.nameWithOwner,
        message: n.message,
        authorName,
        authorEmail,
        authorLogin,
        committedDate: n.committedDate,
        byUser,
      });
    }
    if (job.mode === 'user' && job.page < MAX_PAGES && history.pageInfo.hasNextPage && history.pageInfo.endCursor) {
      out.next.push({ ...job, after: history.pageInfo.endCursor, page: job.page + 1 });
    }
  });
  return out;
}

/** On a persistent server error, halve the batch and retry; a single repo that still fails is skipped. */
async function fetchResilient(client: GraphQLClient, jobs: Job[], who: Who, since: string): Promise<BatchResult> {
  try {
    return await fetchBatch(client, jobs, who, since);
  } catch (e) {
    if (!(e instanceof GitHubError) || e.kind !== 'server') throw e;
    if (jobs.length === 1) return { commits: [], next: [] };
    const mid = Math.ceil(jobs.length / 2);
    const [a, b] = await Promise.all([
      fetchResilient(client, jobs.slice(0, mid), who, since),
      fetchResilient(client, jobs.slice(mid), who, since),
    ]);
    return { commits: [...a.commits, ...b.commits], next: [...a.next, ...b.next] };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Commits by the user (plus AI agents in their own repos) on default branches in the last 90 days. */
export async function scanCommits(
  client: GraphQLClient,
  target: Target,
  profile: Who,
  ownedRepos: Repo[],
  now: Date,
): Promise<ScanResult> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
  const { repos, capped } =
    target.kind === 'viewer'
      ? await selfCandidates(client, since)
      : await peekCandidates(client, target.login, ownedRepos, since, now);

  const login = profile.login.toLowerCase();
  let pending: Job[] = repos.flatMap((repo): Job[] => {
    const owned = repo.nameWithOwner.split('/')[0].toLowerCase() === login;
    const user: Job = { repo, mode: 'user', after: null, page: 1 };
    return owned ? [user, { repo, mode: 'agents', after: null, page: 1 }] : [user];
  });

  const commits: CommitRecord[] = [];
  while (pending.length) {
    const results = await mapLimit(chunk(pending, BATCH_SIZE), CONCURRENCY, (jobs) =>
      fetchResilient(client, jobs, profile, since),
    );
    pending = results.flatMap((r) => r.next);
    for (const r of results) commits.push(...r.commits);
  }

  return { commits, scannedRepos: repos, capped };
}
