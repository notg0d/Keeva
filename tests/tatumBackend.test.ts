import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createAppServer } from '../server/app.mjs';
import { queryTatumResolved } from '../server/tatum.mjs';

const nativeFetch = globalThis.fetch;
const endpoint = 'https://unit.gateway.tatum.io/account/graphql';
const recoveryEndpoint = 'https://recovery.gateway.tatum.io/graphql';
const apiKey = crypto.randomUUID();
const payload = { query: 'query KeevaChain { chainIdentifier }', variables: {} };
let origin: string;
let directory: string;
let server: ReturnType<typeof createAppServer>;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'keeva-server-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Keeva</title>');
  server = createAppServer({ distDir: directory, recoveryEndpoint });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

const post = (body: unknown, headers: Record<string, string> = {}) => nativeFetch(`${origin}/api/tatum`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body),
});
const connection = () => ({ endpoint, apiKey, apiType: 'graphql', payload });

describe('SubSense-style Tatum backend', () => {
  it('forwards the exact per-request connection, using only the Tatum headers', async () => {
    const outbound: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      outbound.push({ url, headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(String(init.body)) });
      expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit' });
      return Response.json({ data: { chainIdentifier: '35834a8a' } });
    });
    const response = await post(connection(), { Cookie: 'private=1', Authorization: 'Bearer private' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({ data: { chainIdentifier: '35834a8a' }, connection: { endpoint, apiType: 'graphql', recovered: false } });
    const otherKey = crypto.randomUUID();
    await post({ ...connection(), endpoint: 'https://other.gateway.tatum.io/graphql', apiKey: otherKey });
    expect(outbound).toEqual([
      { url: endpoint, headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: payload },
      { url: 'https://other.gateway.tatum.io/graphql', headers: { 'content-type': 'application/json', 'x-api-key': otherKey }, body: payload },
    ]);
  });

  it.each(['', 'http://unit.gateway.tatum.io/graphql', 'https://127.0.0.1/graphql', 'https://unit.gateway.tatum.io.evil.test/graphql',
    'https://unit.gateway.tatum.io:8443/graphql', 'https://key@unit.gateway.tatum.io/graphql', 'https://unit.gateway.tatum.io/graphql?key=private'])
    ('rejects unsupported destinations before contacting them: %s', async (url) => {
      let requests = 0;
      vi.stubGlobal('fetch', async () => { requests++; return Response.json({}); });
      const response = await post({ ...connection(), endpoint: url });
      expect(response.status).toBe(400); expect(requests).toBe(0);
    });

  it('rejects partial results and returns redacted provider diagnostics', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ data: { chainIdentifier: 'partial' },
      errors: [{ message: `Page size is too large: 100 > 50. Credential ${apiKey}` }] }));
    const response = await post(connection());
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result.error).toMatchObject({ code: 'TATUM_GRAPHQL', message: expect.stringContaining('100 > 50') });
    expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  it('distinguishes an incompatible gateway from GraphQL schema errors', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: -16401, message: 'Invalid Request' }, result: null }));
    const response = await post(connection());
    expect(await response.json()).toMatchObject({ error: { code: 'TATUM_INTERFACE', message: expect.stringContaining('-16401') } });
  });

  it('recovers a rejected route only through the explicitly configured endpoint and reports the selected URL', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return url === endpoint ? Response.json({ error: { code: -16401 }, result: null }) : Response.json({ data: { chainIdentifier: '35834a8a' } });
    });
    const response = await post(connection());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { chainIdentifier: '35834a8a' }, connection: { endpoint: recoveryEndpoint, apiType: 'graphql', recovered: true } });
    expect(urls).toEqual([endpoint, recoveryEndpoint]);
  });

  it('does not choose another gateway when route recovery is not configured', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return Response.json({ error: { code: -16401 }, result: null }); };
    await expect(queryTatumResolved(payload.query, {}, { endpoint, apiKey, fetcher })).rejects.toMatchObject({ code: 'TATUM_INTERFACE' });
    expect(calls).toBe(1);
  });

  it.each([401, 403, 'partial', 'permission'])('does not change endpoints for an authorization or data error: %s', async (kind) => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (typeof kind === 'number') return new Response('', { status: kind });
      return kind === 'partial' ? Response.json({ data: {}, errors: [{ message: 'Field unavailable' }] }) : Response.json({ error: { code: -16403 } });
    });
    const response = await post(connection());
    expect(response.ok).toBe(false); expect(urls).toEqual([endpoint]);
  });

  it.each([401, 403, 429])('preserves provider authorization/rate-limit status %s', async (status) => {
    vi.stubGlobal('fetch', async () => new Response('', { status, headers: { 'Retry-After': '10' } }));
    const response = await post(connection());
    expect(response.status).toBe(status);
    if (status === 429) expect(response.headers.get('retry-after')).toBe('10');
  });

  it('retries a rate-limited read within the shared deadline and stops after two retries', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '0' } }) : Response.json({ data: { chainIdentifier: '35834a8a' } });
    });
    expect((await post(connection())).status).toBe(200); expect(calls).toBe(2);
    calls = 0;
    vi.stubGlobal('fetch', async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '0' } }); });
    expect((await post(connection())).status).toBe(429); expect(calls).toBe(3);
  });

  it.each(['mutation Write { executeTransaction { __typename } }', 'subscription Watch { __typename }',
    'query First { __typename } mutation Second { __typename }'])('rejects non-read-only operations', async (query) => {
    let requests = 0;
    vi.stubGlobal('fetch', async () => { requests++; return Response.json({}); });
    const response = await post({ ...connection(), payload: { query } });
    expect(response.status).toBe(400); expect(requests).toBe(0);
  });

  it('preserves JSON-RPC method errors for the client’s canonical-method fallback', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { id } = JSON.parse(String(init.body));
      return Response.json({ jsonrpc: '2.0', id, error: { code: -16405 } });
    });
    const response = await post({ ...connection(), apiType: 'json-rpc',
      payload: { jsonrpc: '2.0', id: '1', method: 'sui_getReferenceGasPrice', params: [] } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: '1', error: { code: -16405 } });
    const denied = await post({ ...connection(), apiType: 'json-rpc',
      payload: { jsonrpc: '2.0', id: '2', method: 'sui_executeTransactionBlock', params: [] } });
    expect(denied.status).toBe(400);
  });

  it('rejects cross-origin requests, malformed JSON, and oversized bodies', async () => {
    expect((await post(connection(), { Origin: 'https://other.test' })).status).toBe(403);
    const invalid = await nativeFetch(`${origin}/api/tatum`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(invalid.status).toBe(400);
    expect((await post({ ...connection(), extra: 'x'.repeat(256 * 1024) })).status).toBe(413);
  });

  it('serves the app with security headers and keeps unknown API routes out of the SPA fallback', async () => {
    const index = await nativeFetch(origin);
    expect(index.status).toBe(200); expect(index.headers.get('x-frame-options')).toBe('DENY');
    expect(index.headers.get('cache-control')).toBe('no-store');
    expect(await index.text()).toContain('<title>Keeva</title>');
    expect((await nativeFetch(`${origin}/api/unknown`)).status).toBe(404);
    expect((await nativeFetch(`${origin}/.env`)).status).toBe(404);
    expect((await nativeFetch(`${origin}/assets/missing.js`)).status).toBe(404);
  });
});
