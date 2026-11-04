import { queryTatumResolved, queryTatumRpc, TatumError } from './tatum.mjs';

const maxRequestBytes = 256 * 1024;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxRequestBytes) { reject(new TatumError('REQUEST_SIZE', 'The gateway request is too large.', 413)); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > maxRequestBytes) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new TatumError('REQUEST_JSON', 'Send a valid JSON gateway request.', 400)); }
    });
    request.on('error', reject);
  });
}

function send(response, status, body, retryAfter) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) });
  response.end(JSON.stringify(body));
}

/** @param {import('node:http').IncomingMessage} request @param {import('node:http').ServerResponse} response */
export async function handleTatumRequest(request, response, { recoveryEndpoint = '' } = {}) {
  if (request.url?.split('?')[0] !== '/api/tatum') return false;
  const controller = new AbortController();
  const cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.on('close', cancel);
  try {
    if (request.method !== 'POST') throw new TatumError('REQUEST_METHOD', 'Use POST for Tatum gateway requests.', 405);
    const origin = request.headers.origin;
    if ((origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.host)) ||
      (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
      throw new TatumError('REQUEST_ORIGIN', 'Gateway requests must originate from this Keeva application.', 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
      throw new TatumError('REQUEST_TYPE', 'Send a JSON gateway request.', 415);
    }
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['endpoint', 'apiKey', 'apiType', 'payload'].includes(key)) ||
      !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw new TatumError('REQUEST_FIELDS', 'The Tatum gateway request is incomplete.', 400);
    }
    const options = { endpoint: body.endpoint, apiKey: body.apiKey, signal: controller.signal };
    if (body.apiType === 'graphql') {
      const { query, variables = {}, operationName } = body.payload;
      if (typeof query !== 'string' || !variables || typeof variables !== 'object' || Array.isArray(variables) ||
        (operationName !== undefined && typeof operationName !== 'string')) {
        throw new TatumError('TATUM_QUERY', 'The GraphQL request is incomplete.', 400);
      }
      const result = await queryTatumResolved(query, variables, { ...options, operationName, recoveryEndpoint });
      send(response, 200, { data: result.data, connection: { endpoint: result.endpoint, apiType: 'graphql', recovered: result.recovered } });
    } else if (body.apiType === 'json-rpc') {
      send(response, 200, await queryTatumRpc(body.payload, options));
    } else throw new TatumError('TATUM_INTERFACE', 'Select GraphQL or JSON-RPC for the Tatum connection.', 400);
  } catch (error) {
    const failure = error instanceof TatumError ? error : new TatumError('GATEWAY_ERROR', 'The backend could not complete the gateway request.');
    if (!response.destroyed) send(response, failure.status, { error: { code: failure.code, message: failure.message } }, failure.retryAfter);
  } finally { response.off('close', cancel); }
  return true;
}

export function createTatumMiddleware(options = {}) {
  return (request, response, next) => {
    void handleTatumRequest(request, response, options).then((handled) => { if (!handled) next(); }, next);
  };
}
