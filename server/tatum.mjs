import { Kind, parse } from 'graphql';
import { setTimeout as wait } from 'node:timers/promises';

const methods = new Set(['sui_getChainIdentifier', 'sui_getLatestSuiSystemState', 'suix_getLatestSuiSystemState',
  'sui_getReferenceGasPrice', 'suix_getReferenceGasPrice', 'sui_getTotalTransactionBlocks',
  'sui_getLatestCheckpointSequenceNumber', 'sui_getTransactionBlock', 'sui_getCheckpoint', 'sui_verifyZkLoginSignature']);

export class TatumError extends Error {
  constructor(code, message, status = 502, retryAfter = undefined, providerCode = undefined) {
    super(message); this.name = 'TatumError'; this.code = code; this.status = status; this.retryAfter = retryAfter; this.providerCode = providerCode;
  }
}

export function validateConnection(endpoint, apiKey) {
  let url;
  try { url = new URL(endpoint); } catch { throw new TatumError('TATUM_ENDPOINT', 'Enter your full HTTPS Tatum endpoint URL.', 400); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.gateway.tatum.io') || url.port ||
    url.username || url.password || url.search || url.hash) {
    throw new TatumError('TATUM_ENDPOINT', 'Use an HTTPS *.gateway.tatum.io endpoint without a custom port, URL credentials, query parameters, or fragments.', 400);
  }
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiKey)) {
    throw new TatumError('TATUM_KEY', 'Enter your Tatum API key in its separate field.', 400);
  }
}

function providerMessage(value, apiKey) {
  return String(value ?? '').replaceAll(apiKey, '[redacted]').replaceAll(encodeURIComponent(apiKey), '[redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500);
}

async function readResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new TatumError('TATUM_RESPONSE', 'Tatum returned an empty response. Check the endpoint URL.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw new TatumError('TATUM_RESPONSE_SIZE', 'The Tatum response exceeded the supported size.');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new TatumError('TATUM_RESPONSE', 'Tatum returned invalid JSON. Check that the URL is an API endpoint.'); }
  } finally { await reader.cancel().catch(() => {}); }
}

async function postTatum(endpoint, apiKey, payload, fetcher, signal) {
  validateConnection(endpoint, apiKey);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  try {
    let response;
    for (let attempt = 0; ; attempt++) {
      response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(payload),
      });
      if (response.status !== 429 || attempt >= 2) break;
      const retryAfter = response.headers.get('retry-after');
      const delay = retryAfter === null ? 1000 * (attempt + 1) : /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
      if (!Number.isFinite(delay) || delay > 5000) break;
      await response.body?.cancel();
      await wait(delay, undefined, { signal: deadline });
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new TatumError('TATUM_AUTH',
        `Tatum returned HTTP ${response.status}. Check that the API key has Sui Mainnet access for this endpoint.`, response.status);
      if (response.status === 429) {
        const delay = response.headers.get('retry-after');
        throw new TatumError('TATUM_RATE_LIMIT', 'Tatum returned HTTP 429. Retry after the provider rate limit resets.', 429,
          delay && /^\d{1,6}$/.test(delay) ? delay : undefined);
      }
      throw new TatumError('TATUM_HTTP', `Tatum returned HTTP ${response.status}. Check the endpoint and service availability.`);
    }
    return await readResponse(response);
  } catch (error) {
    if (error instanceof TatumError) throw error;
    if (signal?.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new TatumError('TATUM_TIMEOUT', 'The Tatum request timed out or was cancelled. Retry when the gateway is available.', 504);
    }
    throw new TatumError('TATUM_NETWORK', 'The backend could not reach this Tatum endpoint. Check its hostname, TLS certificate, and availability.');
  }
}

export async function queryTatum(query, variables = {}, { endpoint, apiKey, fetcher = fetch, signal, operationName } = {}) {
  let document;
  try { document = parse(query, { maxTokens: 10_000 }); }
  catch { throw new TatumError('TATUM_QUERY', 'The GraphQL query is invalid.', 400); }
  const operations = document.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  if (operations.length !== 1 || operations[0].operation !== 'query' ||
    document.definitions.some((definition) => ![Kind.OPERATION_DEFINITION, Kind.FRAGMENT_DEFINITION].includes(definition.kind))) {
    throw new TatumError('TATUM_QUERY', 'The Tatum backend accepts one read-only GraphQL operation per request.', 400);
  }
  const result = await postTatum(endpoint, apiKey, { query, variables, ...(operationName ? { operationName } : {}) }, fetcher, signal);
  if (result?.error) {
    const code = typeof result.error.code === 'number' ? ` (${result.error.code})` : '';
    throw new TatumError('TATUM_INTERFACE', `Tatum rejected this GraphQL endpoint${code}. Enter the full Sui Mainnet GraphQL URL advertised by your gateway, including /graphql when provided.`,
      502, undefined, result.error.code);
  }
  if (Array.isArray(result?.errors) && result.errors.length) {
    const details = result.errors.slice(0, 3).map((error) => {
      const code = /^[A-Z0-9_]{1,80}$/.test(error?.extensions?.code ?? '') ? ` [${error.extensions.code}]` : '';
      return `${providerMessage(error?.message, apiKey)}${code}`;
    }).filter(Boolean).join(' · ');
    throw new TatumError('TATUM_GRAPHQL', `Tatum GraphQL: ${details || 'The query was rejected.'}`);
  }
  if (!result?.data || typeof result.data !== 'object' || Array.isArray(result.data) ||
    (result.errors !== undefined && !Array.isArray(result.errors))) {
    throw new TatumError('TATUM_RESPONSE', 'Tatum returned no complete GraphQL data. Check the full endpoint URL and selected interface.');
  }
  return result.data;
}

export async function queryTatumResolved(query, variables = {}, options = {}) {
  const { recoveryEndpoint, ...connection } = options;
  try {
    return { data: await queryTatum(query, variables, connection), endpoint: connection.endpoint, recovered: false };
  } catch (error) {
    if (!(error instanceof TatumError) || error.code !== 'TATUM_INTERFACE' || ![-16401, -16405].includes(error.providerCode) ||
      !recoveryEndpoint || recoveryEndpoint === connection.endpoint) throw error;
    validateConnection(recoveryEndpoint, connection.apiKey);
    return { data: await queryTatum(query, variables, { ...connection, endpoint: recoveryEndpoint }), endpoint: recoveryEndpoint, recovered: true };
  }
}

export async function queryTatumRpc(payload, { endpoint, apiKey, fetcher = fetch, signal } = {}) {
  if (payload?.jsonrpc !== '2.0' || typeof payload.id !== 'string' || !methods.has(payload.method) || !Array.isArray(payload.params)) {
    throw new TatumError('TATUM_METHOD', 'This Sui JSON-RPC read method is not supported by the Tatum backend.', 400);
  }
  const result = await postTatum(endpoint, apiKey, payload, fetcher, signal);
  if (result?.jsonrpc !== '2.0' || result.id !== payload.id || (!result.error && result.result === undefined)) {
    throw new TatumError('TATUM_INTERFACE', 'Tatum returned an incompatible JSON-RPC response. Check the endpoint and selected interface.');
  }
  return result.error ? { jsonrpc: '2.0', id: result.id, error: { code: result.error.code } }
    : { jsonrpc: '2.0', id: result.id, result: result.result };
}
