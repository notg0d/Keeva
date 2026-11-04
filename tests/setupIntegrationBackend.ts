import { afterAll, beforeAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createAppServer } from '../server/app.mjs';

const server = createAppServer();
const nativeFetch = globalThis.fetch;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal('fetch', ((input, init) => nativeFetch(input === '/api/tatum' ? `${origin}/api/tatum` : input, init)) as typeof fetch);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
