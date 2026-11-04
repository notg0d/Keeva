import type { VaultConfig } from '../config/vaultConfig';
import { invariant, VaultError } from '../lib/errors';

export async function requestTatum(endpoint: string, apiKey: string, apiType: VaultConfig['tatumApiType'], payload: unknown, signal?: AbortSignal): Promise<unknown> {
  invariant(endpoint.trim() && apiKey.trim(), 'GATEWAY_REQUIRED', 'Configure your Tatum endpoint URL and API key first.');
  const response = await fetch('/api/tatum', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store',
    redirect: 'error', referrerPolicy: 'no-referrer',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
    body: JSON.stringify({ endpoint, apiKey, apiType, payload }),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new VaultError('BACKEND_UNAVAILABLE', 'Keeva’s Tatum backend is unavailable. Restart npm run dev, or serve the production app with npm start.');
  }
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result ? result.error : undefined;
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' &&
      'message' in error && typeof error.message === 'string') throw new VaultError(error.code, error.message);
    throw new VaultError('BACKEND_ERROR', `The Tatum backend returned HTTP ${response.status}.`);
  }
  return result;
}
