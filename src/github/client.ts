export type ErrorKind = 'auth' | 'not_found' | 'rate_limit' | 'network' | 'server';

export class GitHubError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface GraphQLErrorItem {
  type?: string;
  message: string;
  path?: (string | number)[];
}

export interface GraphQLClient {
  query<T>(q: string, vars?: Record<string, unknown>): Promise<{ data: T; errors: GraphQLErrorItem[] }>;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const ENDPOINT = 'https://api.github.com/graphql';
const RETRY_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createClient(token: string, o: ClientOptions = {}): GraphQLClient {
  const doFetch = o.fetch ?? fetch;
  const attempts = o.attempts ?? 3;
  const baseDelay = o.baseDelayMs ?? 500;
  const timeoutMs = o.timeoutMs ?? 20_000;

  async function once(body: string): Promise<Response> {
    return doFetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'user-agent': 'ghflex',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  return {
    async query<T>(q: string, vars?: Record<string, unknown>) {
      const body = JSON.stringify(vars ? { query: q, variables: vars } : { query: q });
      let last: GitHubError = new GitHubError('server', 'GitHub API request failed');

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) await sleep(baseDelay * 3 ** (attempt - 1));
        let res: Response;
        try {
          res = await once(body);
        } catch {
          last = new GitHubError('network', "Couldn't reach GitHub. Check your internet connection and try again.");
          continue;
        }

        if (RETRY_STATUS.has(res.status)) {
          last = new GitHubError(
            'server',
            `GitHub is having trouble right now (HTTP ${res.status}). Try again in a minute.`,
          );
          continue;
        }
        if (res.status === 401) {
          throw new GitHubError(
            'auth',
            'GitHub rejected your token (401). Log in again with `gh auth login`, or run `ghflex --logout` if you saved one.',
          );
        }
        if (res.status === 403 || res.status === 429) {
          if (
            res.headers.get('x-ratelimit-remaining') === '0' ||
            res.headers.has('retry-after') ||
            res.status === 429
          ) {
            throw new GitHubError('rate_limit', 'GitHub rate limit hit. Wait a few minutes and try again.');
          }
          throw new GitHubError(
            'auth',
            'GitHub refused the request (403). Your token may be missing the `repo` and `read:user` scopes.',
          );
        }
        if (!res.ok) throw new GitHubError('server', `GitHub API error (HTTP ${res.status}).`);

        const json = (await res.json()) as { data?: T | null; errors?: GraphQLErrorItem[] };
        const errors = json.errors ?? [];
        if (json.data === null || json.data === undefined) {
          throw new GitHubError('server', `GitHub API error: ${errors[0]?.message ?? 'empty response'}`);
        }
        return { data: json.data, errors };
      }
      throw last;
    },
  };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping result order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
