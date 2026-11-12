import { expect, test } from 'vitest';
import { createClient, GitHubError, mapLimit } from '../../src/github/client.js';

type FakeFetch = typeof fetch & { calls: number; requests: { url: string; init: RequestInit }[] };

/** A fake fetch that returns the given responses in order and counts calls. */
function scripted(responses: (Response | Error)[]): FakeFetch {
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    f.calls++;
    f.requests.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('no more scripted responses');
    if (next instanceof Error) throw next;
    return next;
  }) as FakeFetch;
  f.calls = 0;
  f.requests = [];
  return f;
}

const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const tick = () => new Promise((r) => setTimeout(r, 0));

test('sends a bearer token and the ghflex user agent to the GraphQL endpoint', async () => {
  const f = scripted([res(200, { data: { viewer: { login: 'Sezos' } } })]);
  await createClient('tok_secret', { fetch: f }).query('query{viewer{login}}', { a: 1 });
  const { url, init } = f.requests[0];
  expect(url).toBe('https://api.github.com/graphql');
  expect(init.method).toBe('POST');
  const headers = new Headers(init.headers);
  expect(headers.get('authorization')).toBe('bearer tok_secret');
  expect(headers.get('user-agent')).toBe('ghflex');
  expect(JSON.parse(String(init.body))).toEqual({ query: 'query{viewer{login}}', variables: { a: 1 } });
});

test('retries 502 then succeeds', async () => {
  const f = scripted([res(502), res(502), res(200, { data: { viewer: { login: 'Sezos' } } })]);
  const c = createClient('tok_secret', { fetch: f, baseDelayMs: 0 });
  await expect(c.query('query{viewer{login}}')).resolves.toEqual({ data: { viewer: { login: 'Sezos' } }, errors: [] });
  expect(f.calls).toBe(3);
});

test('gives up after 3 attempts with a server error', async () => {
  const c = createClient('tok_secret', { fetch: scripted([res(502), res(503), res(504)]), baseDelayMs: 0 });
  await expect(c.query('q')).rejects.toMatchObject({ kind: 'server' });
});

test('network failures are retried, then reported as network errors', async () => {
  const f = scripted([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')]);
  const err = await createClient('t', { fetch: f, baseDelayMs: 0 })
    .query('q')
    .catch((e) => e);
  expect(err).toBeInstanceOf(GitHubError);
  expect(err.kind).toBe('network');
  expect(f.calls).toBe(3);
});

test('401 is auth and not retried; token never in message', async () => {
  const f = scripted([res(401, { message: 'Bad credentials' })]);
  const err = await createClient('tok_secret', { fetch: f })
    .query('q')
    .catch((e) => e);
  expect(err.kind).toBe('auth');
  expect(f.calls).toBe(1);
  expect(err.message).not.toContain('tok_secret');
});

test('rate limited', async () => {
  const f = scripted([res(403, {}, { 'x-ratelimit-remaining': '0' })]);
  await expect(createClient('t', { fetch: f }).query('q')).rejects.toMatchObject({ kind: 'rate_limit' });
  const g = scripted([res(403, {}, { 'retry-after': '60' })]);
  await expect(createClient('t', { fetch: g }).query('q')).rejects.toMatchObject({ kind: 'rate_limit' });
});

test('REVIEW FOCUS: partial data with FORBIDDEN errors is returned, not thrown', async () => {
  const body = {
    data: { r0: null, r1: { name: 'ok' } },
    errors: [{ type: 'FORBIDDEN', message: 'SAML', path: ['r0'] }],
  };
  const out = await createClient('t', { fetch: scripted([res(200, body)]) }).query('q');
  expect(out.data).toEqual({ r0: null, r1: { name: 'ok' } });
  expect(out.errors[0].type).toBe('FORBIDDEN');
});

test('a response with errors and no data at all throws', async () => {
  const body = { data: null, errors: [{ message: 'Parse error on "}"' }] };
  await expect(createClient('t', { fetch: scripted([res(200, body)]) }).query('q')).rejects.toMatchObject({
    kind: 'server',
  });
});

test('mapLimit caps concurrency and keeps order', async () => {
  let live = 0;
  let peak = 0;
  const r = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    live++;
    peak = Math.max(peak, live);
    await tick();
    live--;
    return n * 2;
  });
  expect(r).toEqual([2, 4, 6, 8, 10, 12]);
  expect(peak).toBe(2);
});

test('REVIEW: a 200 response carrying a RATE_LIMITED error is a rate_limit error, not data', async () => {
  const body = { data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] };
  await expect(createClient('t', { fetch: scripted([res(200, body)]) }).query('q')).rejects.toMatchObject({
    kind: 'rate_limit',
  });
  const partial = { data: { r0: null }, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] };
  await expect(createClient('t', { fetch: scripted([res(200, partial)]) }).query('q')).rejects.toMatchObject({
    kind: 'rate_limit',
  });
});
