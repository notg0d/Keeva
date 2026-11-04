export const DEFAULT_MEMWAL_SERVER_URL = 'https://relayer.memory.walrus.xyz';
export const MEMWAL_PROXY_PATH = '/gateway/walrus';

export function memwalTransportUrl(serverUrl: string, browserOrigin = typeof window === 'undefined' ? undefined : window.location.origin): string {
  const url = new URL(serverUrl);
  const normalized = url.href.replace(/\/+$/, '');
  if (browserOrigin && normalized === DEFAULT_MEMWAL_SERVER_URL) return `${browserOrigin}${MEMWAL_PROXY_PATH}`;
  return normalized;
}
