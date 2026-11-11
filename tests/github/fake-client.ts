import type { GraphQLClient, GraphQLErrorItem } from '../../src/github/client.js';

/** Wrap a handler result to return partial data with GraphQL errors. */
export class PartialResult {
  constructor(
    public data: unknown,
    public errors: GraphQLErrorItem[],
  ) {}
}

/** Thrown from a handler to simulate a request-level failure (e.g. a persistent 502). */
export type Handler = (q: string, vars?: Record<string, unknown>) => unknown | undefined;

export type FakeClient = GraphQLClient & { queries: string[]; vars: (Record<string, unknown> | undefined)[] };

/** A GraphQL client whose answers come from handlers: the first non-undefined result wins. */
export function fakeClient(handlers: Handler[]): FakeClient {
  const client: FakeClient = {
    queries: [],
    vars: [],
    async query<T>(q: string, vars?: Record<string, unknown>) {
      client.queries.push(q);
      client.vars.push(vars);
      for (const h of handlers) {
        const r = h(q, vars);
        if (r === undefined) continue;
        if (r instanceof PartialResult) return { data: r.data as T, errors: r.errors };
        return { data: r as T, errors: [] };
      }
      throw new Error(`fakeClient: no handler for query:\n${q}\nvars: ${JSON.stringify(vars)}`);
    },
  };
  return client;
}
