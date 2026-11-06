import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanPasswordBreaches } from '../src/services/passwordBreachService';
import type { Credential } from '../src/types/vault';

const knownHash = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
const otherSuffix = 'A'.repeat(35);
function credential(password: string, kind: Credential['kind'] = 'login'): Credential {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), revision: crypto.randomUUID(), parentRevision: null, kind,
    siteName: 'Private site', username: 'private@example.com', password, notes: 'Private notes', category: 'Personal',
    createdAt: now, updatedAt: now, lastRotated: now, blobId: crypto.randomUUID() };
}
function range(body: string, headers: HeadersInit = {}) {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}
async function hash(password: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))),
    (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('private password breach scanning', () => {
  it('sends only the five-character SHA-1 prefix, with padding and no credentials or referrer', async () => {
    const fetcher = vi.fn().mockResolvedValue(range(`${otherSuffix}:0\r\n${knownHash.slice(5)}:12345\r\n`));
    vi.stubGlobal('fetch', fetcher);
    const item = credential('password');
    const result = await scanPasswordBreaches([item]);
    expect(result.findings).toEqual([{ revision: item.revision, status: 'breached', occurrences: 12345 }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', headers: { 'Add-Padding': 'true', Accept: 'text/plain' } });
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const request = JSON.stringify(fetcher.mock.calls);
    expect(request).not.toContain(knownHash);
    expect(request).not.toContain(knownHash.slice(5));
    expect(request).not.toContain(item.username);
    expect(request).not.toContain(item.siteName);
    expect(request).not.toContain(item.notes);
    const report = JSON.stringify(result);
    expect(report).not.toContain(knownHash);
    expect(report).not.toContain(item.password);
    expect(report).not.toContain(item.username);
    expect(result.error).toBeUndefined();
  });

  it('deduplicates reused passwords, preserves every revision, and reports progress', async () => {
    const fetcher = vi.fn().mockResolvedValue(range(`${knownHash.slice(5)}:42`));
    vi.stubGlobal('fetch', fetcher);
    const first = credential('password'); const second = credential('password');
    const progress = vi.fn();
    const result = await scanPasswordBreaches([first, second], { onProgress: progress });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.findings.map((item) => item.revision)).toEqual([first.revision, second.revision]);
    expect(result.findings.every((item) => item.status === 'breached' && item.occurrences === 42)).toBe(true);
    expect(progress.mock.calls).toEqual([[{ completed: 0, total: 2 }], [{ completed: 2, total: 2 }]]);
  });

  it('deduplicates different passwords sharing a prefix while matching suffixes independently', async () => {
    const first = credential('first private password'); const second = credential('second private password');
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const one = Uint8Array.from({ length: 20 }, (_, index) => index < 3 ? 0xaa : 0x11);
    const two = Uint8Array.from({ length: 20 }, (_, index) => index < 3 ? 0xaa : 0x22);
    digest.mockResolvedValueOnce(one.buffer).mockResolvedValueOnce(two.buffer);
    const suffix = Array.from(one, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(5).toUpperCase();
    const fetcher = vi.fn().mockResolvedValue(range(`${suffix}:3`));
    vi.stubGlobal('fetch', fetcher);
    const result = await scanPasswordBreaches([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.findings).toEqual([{ revision: first.revision, status: 'breached', occurrences: 3 },
      { revision: second.revision, status: 'not-found', occurrences: 0 }]);
  });

  it('treats absent suffixes and zero-count padding as not found, not as known exposure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(range(`${otherSuffix}:99`))
      .mockResolvedValueOnce(range(`${knownHash.slice(5).toLowerCase()}:0\r\n${otherSuffix}:99\r\n`));
    vi.stubGlobal('fetch', fetcher);
    const item = credential('password');
    expect((await scanPasswordBreaches([item])).findings[0]).toMatchObject({ status: 'not-found', occurrences: 0 });
    expect((await scanPasswordBreaches([item])).findings[0]).toMatchObject({ status: 'not-found', occurrences: 0 });
  });

  it('skips API keys, notes, and empty passwords without making requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await scanPasswordBreaches([credential('api-secret', 'api-key'), credential('', 'note'), credential('')]);
    expect(result.findings).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('hashes complete unmodified UTF-8 passwords, including spaces and long Unicode text', async () => {
    const password = '  🔐機密' + 'a'.repeat(300) + '  ';
    const expected = await hash(password);
    const fetcher = vi.fn().mockResolvedValue(range(`${expected.slice(5)}:7`)); vi.stubGlobal('fetch', fetcher);
    const result = await scanPasswordBreaches([credential(password)]);
    expect(fetcher.mock.calls[0]![0]).toBe(`https://api.pwnedpasswords.com/range/${expected.slice(0, 5)}`);
    expect(result.findings[0]).toMatchObject({ status: 'breached', occurrences: 7 });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(password);
  });

  it.each([404, 429, 500, 204])('keeps HTTP %s failures unknown and stops further requests', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status })); vi.stubGlobal('fetch', fetcher);
    const result = await scanPasswordBreaches([credential('password'), credential('different password')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.findings.every((item) => item.status === 'unavailable' && item.occurrences === undefined)).toBe(true);
    expect(result.error).toMatch(status === 429 ? /rate-limiting/ : new RegExp(`HTTP ${status}`));
  });

  it.each(['', ' \r\n', '<html>error</html>', `${otherSuffix}:1\r\ntruncated`, `${otherSuffix}:-1`, `${otherSuffix}:1.5`,
    `${otherSuffix}:9007199254740992`, `${otherSuffix}:1\r\n${otherSuffix}:2`, `${'A'.repeat(34)}:1`])('rejects malformed or incomplete range data %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(range(body)));
    const result = await scanPasswordBreaches([credential('password')]);
    expect(result.findings[0]?.status).toBe('unavailable');
    expect(result.error).toBeTruthy();
  });

  it('validates trailing data even when the sought suffix was already found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(range(`${knownHash.slice(5)}:10\r\ninvalid`)));
    expect((await scanPasswordBreaches([credential('password')])).findings[0]?.status).toBe('unavailable');
  });

  it('rejects non-text, oversized advertised, and oversized streamed responses', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(range(`${otherSuffix}:1`, { 'Content-Type': 'text/html' }))
      .mockResolvedValueOnce(range(`${otherSuffix}:1`, { 'Content-Length': '524289' }))
      .mockResolvedValueOnce(range('A'.repeat(524289)));
    vi.stubGlobal('fetch', fetcher);
    for (let index = 0; index < 3; index++) {
      expect((await scanPasswordBreaches([credential('password')])).findings[0]?.status).toBe('unavailable');
    }
  });

  it('retains completed findings but does not call uncompleted passwords safe after failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(range(`${knownHash.slice(5)}:20`))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetcher);
    const result = await scanPasswordBreaches([credential('password'), credential('second password'), credential('third password')]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.findings.map((item) => item.status)).toEqual(['breached', 'unavailable', 'unavailable']);
    expect(result.error).toContain('breach service');
  });

  it('does not leak provider diagnostics in errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`Request failed for ${knownHash} private@example.com`)));
    const result = await scanPasswordBreaches([credential('password')]);
    expect(JSON.stringify(result)).not.toContain(knownHash);
    expect(result.error).not.toContain('private@example.com');
  });

  it('reports timeouts as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Expired', 'TimeoutError')));
    const result = await scanPasswordBreaches([credential('password')]);
    expect(result.findings[0]?.status).toBe('unavailable');
    expect(result.error).toContain('timed out');
  });

  it('makes no requests for an already aborted scan', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(scanPasswordBreaches([credential('password')], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts an in-flight lookup and never returns a stale report', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      controller.abort();
    }));
    vi.stubGlobal('fetch', fetcher);
    await expect(scanPasswordBreaches([credential('password'), credential('other')], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels streamed response reads when the vault locks or navigation aborts', async () => {
    const controller = new AbortController(); const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull() { controller.abort(); }, cancel: cancelled }, { highWaterMark: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'text/plain' } })));
    await expect(scanPasswordBreaches([credential('password')], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toHaveBeenCalled();
  });

  it('does not start the next request if cancellation occurs after a completed prefix', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(range(`${knownHash.slice(5)}:4`)); vi.stubGlobal('fetch', fetcher);
    await expect(scanPasswordBreaches([credential('password'), credential('other')], { signal: controller.signal,
      onProgress: (progress) => { if (progress.completed) controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed when secure browser hashing is unavailable', async () => {
    const item = credential('password');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('crypto', undefined);
    await expect(scanPasswordBreaches([item])).rejects.toThrow('Secure browser cryptography is required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not retain a prefix cache between scans or alter vault credentials', async () => {
    const item = Object.freeze(credential('password'));
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(range(`${knownHash.slice(5)}:4`)));
    vi.stubGlobal('fetch', fetcher);
    await scanPasswordBreaches([item]); await scanPasswordBreaches([item]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(item.password).toBe('password');
  });
});
