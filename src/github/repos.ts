import type { Repo } from '../types.js';
import type { GraphQLClient } from './client.js';
import { notFound, rootFor, type Target } from './profile.js';

export interface RepoNode {
  nameWithOwner: string;
  name: string;
  isPrivate: boolean;
  isFork: boolean;
  pushedAt: string | null;
  createdAt: string;
  primaryLanguage: { name: string } | null;
}

export const REPO_FIELDS = 'nameWithOwner name isPrivate isFork pushedAt createdAt primaryLanguage { name }';

export function toRepo(n: RepoNode): Repo {
  return {
    nameWithOwner: n.nameWithOwner,
    name: n.name,
    isPrivate: n.isPrivate,
    isFork: n.isFork,
    pushedAt: n.pushedAt ?? n.createdAt,
    primaryLanguage: n.primaryLanguage?.name ?? null,
  };
}

interface RepoPage {
  repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (RepoNode | null)[] };
}

/** Every repo the target owns, newest push first. Peek mode only ever returns public repos. */
export async function fetchOwnedRepos(client: GraphQLClient, target: Target): Promise<Repo[]> {
  const r = rootFor(target, '$after: String');
  const privacy = target.kind === 'user' ? 'privacy: PUBLIC, ' : '';
  const q = `${r.header} { ${r.field} { repositories(first: 100, after: $after, ${privacy}ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) { pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`;

  const repos: Repo[] = [];
  let after: string | null = null;
  do {
    const res: { data: Record<string, RepoPage | null> } = await client.query<Record<string, RepoPage | null>>(q, {
      ...r.vars,
      after,
    });
    const page: RepoPage | null = res.data[r.key];
    if (!page) throw notFound(target);
    for (const n of page.repositories.nodes) if (n) repos.push(toRepo(n));
    after = page.repositories.pageInfo.hasNextPage ? page.repositories.pageInfo.endCursor : null;
  } while (after);

  return target.kind === 'user' ? repos.filter((x) => !x.isPrivate) : repos;
}
