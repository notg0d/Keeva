import { utf8 } from '../lib/encoding';
import { invariant, VaultError } from '../lib/errors';
import type { Credential } from '../types/vault';

export interface PasswordBreachFinding {
  revision: string; status: 'breached' | 'not-found' | 'unavailable'; occurrences?: number;
}
export interface PasswordBreachReport {
  findings: PasswordBreachFinding[]; checkedAt: string; error?: string;
}
export interface BreachScanProgress { completed: number; total: number }

const rangeEndpoint = 'https://api.pwnedpasswords.com/range/';
const maxResponseBytes = 512 * 1024;

async function passwordHash(password: string): Promise<string> {
  // SHA-1 is required by HIBP's lookup protocol, not used for vault encryption or storage.
  const bytes = utf8.encode(password);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
    try { return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase(); }
    finally { digest.fill(0); }
  } finally { bytes.fill(0); }
}

async function readRange(response: Response, signal: AbortSignal): Promise<Map<string, number>> {
  const length = Number(response.headers.get('content-length'));
  invariant(!Number.isFinite(length) || length <= maxResponseBytes, 'BREACH_RESPONSE', 'The breach service returned an oversized response. No safety conclusion was made.');
  invariant(response.headers.get('content-type')?.toLowerCase().startsWith('text/plain') && response.body,
    'BREACH_RESPONSE', 'The breach service returned an invalid response. No safety conclusion was made.');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let body = ''; let size = 0;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      invariant(size <= maxResponseBytes, 'BREACH_RESPONSE', 'The breach service returned an oversized response. No safety conclusion was made.');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
  const counts = new Map<string, number>();
  invariant(body.trim().length > 0, 'BREACH_RESPONSE', 'The breach service returned an empty response. No safety conclusion was made.');
  // Validate the complete response before treating an absent suffix as "not found".
  for (const line of body.trim().split(/\r?\n/)) {
    const match = /^([A-Fa-f0-9]{35}):(\d+)$/.exec(line);
    invariant(match, 'BREACH_RESPONSE', 'The breach service returned an invalid response. No safety conclusion was made.');
    const suffix = match[1]!.toUpperCase(); const count = Number(match[2]);
    invariant(Number.isSafeInteger(count) && !counts.has(suffix), 'BREACH_RESPONSE', 'The breach service returned invalid counts. No safety conclusion was made.');
    counts.set(suffix, count);
  }
  return counts;
}

async function fetchRange(prefix: string, signal: AbortSignal): Promise<Map<string, number>> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  try {
    const response = await fetch(rangeEndpoint + prefix, {
      method: 'GET', headers: { 'Add-Padding': 'true', Accept: 'text/plain' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: requestSignal,
    });
    if (response.status !== 200 || response.redirected) {
      await response.body?.cancel().catch(() => {});
      throw new VaultError('BREACH_HTTP', response.status === 429
        ? 'Have I Been Pwned is rate-limiting checks. Wait before scanning again.'
        : `The breach service returned HTTP ${response.status}. Unchecked passwords remain unknown.`);
    }
    try { return await readRange(response, requestSignal); }
    finally { await response.body?.cancel().catch(() => {}); }
  } catch (cause) {
    signal.throwIfAborted();
    if (cause instanceof VaultError) throw cause;
    const timedOut = requestSignal.reason instanceof DOMException && requestSignal.reason.name === 'TimeoutError'
      || cause instanceof DOMException && cause.name === 'TimeoutError';
    throw new VaultError('BREACH_UNAVAILABLE', timedOut
      ? 'The breach lookup timed out. Try scanning again later.'
      : 'Could not reach or read the breach service. Check your connection and try again.', { cause });
  }
}

export async function scanPasswordBreaches(credentials: Credential[], options: {
  signal?: AbortSignal; onProgress?: (progress: BreachScanProgress) => void;
} = {}): Promise<PasswordBreachReport> {
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const passwords = credentials.filter((item) => item.kind === 'login' && item.password.length > 0);
  const ranges = new Map<string, Array<{ revision: string; suffix: string }>>();
  const findings = new Map<string, PasswordBreachFinding>();
  let completed = 0; let error: string | undefined;
  options.onProgress?.({ completed, total: passwords.length });
  if (passwords.length) invariant(typeof globalThis.crypto?.subtle?.digest === 'function', 'BREACH_CRYPTO', 'Secure browser cryptography is required for breach checks. Use HTTPS or localhost.');
  try {
    for (const credential of passwords) {
      signal.throwIfAborted();
      const hash = await passwordHash(credential.password);
      signal.throwIfAborted();
      const prefix = hash.slice(0, 5);
      const entries = ranges.get(prefix) ?? [];
      entries.push({ revision: credential.revision, suffix: hash.slice(5) }); ranges.set(prefix, entries);
    }
    // Sequential, deduplicated prefix requests avoid bursts and do not retain a lookup cache.
    for (const [prefix, entries] of ranges) {
      signal.throwIfAborted();
      if (!error) {
        try {
          const counts = await fetchRange(prefix, signal);
          signal.throwIfAborted();
          for (const entry of entries) {
            const occurrences = counts.get(entry.suffix) ?? 0;
            findings.set(entry.revision, { revision: entry.revision, status: occurrences > 0 ? 'breached' : 'not-found', occurrences });
          }
          completed += entries.length; options.onProgress?.({ completed, total: passwords.length });
          counts.clear();
        } catch (cause) {
          signal.throwIfAborted();
          error = cause instanceof VaultError ? cause.message : 'The breach scan could not be completed.';
        }
      }
      // Stop on the first provider failure. Never label failed or remaining checks as clean.
      if (error) for (const entry of entries) findings.set(entry.revision, { revision: entry.revision, status: 'unavailable' });
    }
    signal.throwIfAborted();
    return { findings: passwords.map((item) => findings.get(item.revision)!), checkedAt: new Date().toISOString(), error };
  } finally { ranges.clear(); findings.clear(); }
}
