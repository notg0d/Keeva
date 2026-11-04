import { VaultError } from './errors';

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
  const response = await fetch(url, { ...init, signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) {
    const detail = response.status === 401 || response.status === 403 ? 'Gateway authorization was rejected.'
      : response.status === 429 ? 'Gateway rate limit reached. Retry after the provider limit resets.'
      : `Gateway returned HTTP ${response.status}.`;
    throw new VaultError('HTTP_ERROR', detail);
  }
  return response.json() as Promise<unknown>;
}
