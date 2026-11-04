import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, TransactionDataBuilder } from '@mysten/sui/transactions';
import { toBase64 } from '../src/lib/encoding';
import { loadVaultConfig } from '../src/config/vaultConfig';
import { TatumGraphqlClient } from '../src/services/tatumGraphqlClient';
import { TatumSuiClient } from '../src/services/tatumSuiClient';

const endpoint = 'https://gateway.test/account/graphql';
const genesis = '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S';
const network = { chainIdentifier: genesis, checkpoint: { sequenceNumber: 100, networkTotalTransactions: 250,
  epoch: { epochId: 2, referenceGasPrice: '1000' } } };
type Request = { query: string; variables: Record<string, unknown> };
const page = (hasNextPage = false, endCursor: string | null = null) => ({ hasNextPage, endCursor });

function intercept(reply: (request: Request) => unknown, inspect?: (url: string, init: RequestInit) => void) {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    inspect?.(url, init);
    const request = JSON.parse(String(init.body)).payload as Request;
    requests.push(request);
    return Response.json(reply(request));
  });
  return requests;
}

async function signedTransaction() {
  const sender = Ed25519Keypair.generate();
  const sponsor = Ed25519Keypair.generate();
  const transaction = new Transaction();
  transaction.setSender(sender.toSuiAddress()); transaction.setGasOwner(sponsor.toSuiAddress());
  transaction.setGasBudget(10_000_000); transaction.setGasPrice(1000); transaction.setGasPayment([]);
  transaction.setExpiration({ None: true });
  const bytes = await transaction.build();
  const signatures = await Promise.all([sender, sponsor].map(async (key) => ({ signatureBytes: (await key.signTransaction(bytes)).signature })));
  const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
  return { sender, sponsor, bytes, digest, transaction: { digest, transactionBcs: toBase64(bytes), signatures,
    effects: { digest, status: 'SUCCESS', checkpoint: { sequenceNumber: 100 }, events: { nodes: [], pageInfo: page() } } } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Tatum GraphQL transport', () => {
  it('routes the configured endpoint and key through the same-origin backend and reads its response fields', async () => {
    const apiKey = crypto.randomUUID();
    const requests = intercept(() => ({ data: network }), (url, init) => {
      expect(url).toBe('/api/tatum');
      expect(JSON.parse(String(init.body))).toMatchObject({ endpoint, apiKey, apiType: 'graphql' });
      expect(Object.fromEntries(new Headers(init.headers))).toEqual({ 'content-type': 'application/json' });
      expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    });
    const client = new TatumSuiClient(apiKey, endpoint, 'graphql');
    expect(await client.getNetworkTelemetry()).toMatchObject({ chainIdentifier: '35834a8a', epoch: '2', gasPrice: '1000',
      totalTransactionBlocks: '250', checkpointHeight: '100' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.variables).toEqual({});
    await expect(client.call('sui_getChainIdentifier')).rejects.toMatchObject({ code: 'RPC_PROTOCOL' });
    expect(requests).toHaveLength(1);
  });

  it('surfaces actionable backend errors and identifies a missing backend', async () => {
    const client = new TatumGraphqlClient(crypto.randomUUID(), endpoint);
    vi.stubGlobal('fetch', async () => Response.json({ error: { code: 'TATUM_INTERFACE', message: 'Tatum rejected this GraphQL endpoint (-16401).' } }, { status: 502 }));
    await expect(client.assertMainnet()).rejects.toMatchObject({ code: 'TATUM_INTERFACE', message: expect.stringContaining('-16401') });
    vi.stubGlobal('fetch', async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(client.assertMainnet()).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });

  it('reports the recovered endpoint and reuses it for subsequent verification requests', async () => {
    const resolved = 'https://resolved.gateway.tatum.io/graphql';
    const endpoints: string[] = [];
    intercept(() => ({ data: network, connection: { endpoint: resolved, recovered: true } }), (_url, init) => {
      endpoints.push(JSON.parse(String(init.body)).endpoint);
    });
    const client = new TatumGraphqlClient(crypto.randomUUID(), endpoint);
    expect((await client.getNetworkTelemetry()).endpoint).toBe(resolved);
    await client.assertMainnet();
    expect(endpoints).toEqual([endpoint, resolved]);
  });

  it.each([
    { data: network, errors: [{ message: 'Incomplete result' }] },
    { data: null },
    { result: null, error: { code: -16401 } },
    { data: { ...network, chainIdentifier: '11111111111111111111111111111111' } },
    { data: { ...network, chainIdentifier: '9'.repeat(44) } },
    { data: { ...network, checkpoint: { ...network.checkpoint, sequenceNumber: Number.MAX_SAFE_INTEGER + 1 } } },
    { data: { ...network, checkpoint: { ...network.checkpoint, epoch: { epochId: 2 } } } },
  ])('rejects partial, malformed, incompatible, or wrong-chain data %#', async (response) => {
    intercept(() => response);
    await expect(new TatumGraphqlClient(crypto.randomUUID(), endpoint).getNetworkTelemetry()).rejects.toThrow();
  });

  it('verifies real sender/sponsor signatures and follows event and checkpoint pages', async () => {
    const record = await signedTransaction();
    const event = (sequence: number) => ({ sequenceNumber: sequence, transaction: { digest: record.digest },
      sender: { address: record.sender.toSuiAddress() }, contents: { type: { repr: '0x2::event::Changed' }, json: {} } });
    const requests = intercept(({ query, variables }) => {
      if (query.includes('KeevaChain')) return { data: { chainIdentifier: genesis } };
      if (query.includes('KeevaAudit')) return { data: { transaction: { ...record.transaction, effects: { ...record.transaction.effects,
        events: { nodes: [event(variables.after ? 1 : 0)], pageInfo: variables.after ? page() : page(true, 'event-next') } } } } };
      return { data: { checkpoint: { sequenceNumber: 100, transactions: {
        nodes: [{ digest: variables.after ? record.digest : genesis }], pageInfo: variables.after ? page() : page(true, 'checkpoint-next'),
      } } } };
    });
    const result = await new TatumSuiClient(crypto.randomUUID(), endpoint, 'graphql').verifyVaultAuditTransaction(record.digest,
      { wallet: record.sender.toSuiAddress(), eventTypes: ['0x2::event::Changed'] });
    expect(result).toMatchObject({ digest: record.digest, transactionSignaturesVerified: true, transactionDigestVerified: true,
      signers: [record.sender.toSuiAddress(), record.sponsor.toSuiAddress()], checkpointInclusion: 'rpc-attested', eventAuthenticity: 'rpc-attested' });
    expect(result.events.map((event) => event.id.eventSeq)).toEqual(['0', '1']);
    expect(result.recognizedEvents).toHaveLength(2);
    expect(requests.filter(({ query }) => query.includes('KeevaAudit')).map(({ variables }) => variables.after)).toEqual([null, 'event-next']);
    expect(requests.filter(({ query }) => query.includes('KeevaCheckpoint')).map(({ variables }) => variables.after)).toEqual([null, 'checkpoint-next']);
  });

  it.each(['bytes', 'signature', 'sponsor', 'wallet'] as const)('rejects invalid transaction evidence: %s', async (kind) => {
    const record = await signedTransaction();
    if (kind === 'bytes') {
      const changed = Uint8Array.from(record.bytes); changed[0] = changed[0]! ^ 1;
      record.transaction.transactionBcs = toBase64(changed);
    }
    if (kind === 'signature') {
      const changed = Uint8Array.from(record.bytes); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
      record.transaction.signatures[0] = { signatureBytes: (await record.sender.signTransaction(changed)).signature };
    }
    if (kind === 'sponsor') record.transaction.signatures.pop();
    intercept(({ query }) => query.includes('KeevaChain') ? { data: { chainIdentifier: genesis } } : { data: { transaction: record.transaction } });
    await expect(new TatumSuiClient(crypto.randomUUID(), endpoint, 'graphql').verifyVaultAuditTransaction(record.digest,
      { wallet: kind === 'wallet' ? record.sponsor.toSuiAddress() : record.sender.toSuiAddress() })).rejects.toThrow();
  });

  it.each(['sequence', 'reference', 'contents', 'cursor', 'evidence'] as const)('rejects inconsistent event pages: %s', async (kind) => {
    const record = await signedTransaction();
    intercept(({ variables }) => {
      const event = { sequenceNumber: kind === 'sequence' ? 1 : variables.after ? 1 : 0,
        transaction: { digest: kind === 'reference' ? genesis : record.digest }, sender: { address: record.sender.toSuiAddress() },
        contents: { type: { repr: '0x2::event::Changed' }, json: kind === 'contents' ? undefined : {} } };
      return { data: { transaction: { ...record.transaction,
        transactionBcs: variables.after && kind === 'evidence' ? toBase64(new Uint8Array([1])) : record.transaction.transactionBcs,
        effects: { ...record.transaction.effects, events: { nodes: [event], pageInfo: page(true, 'same-cursor') } } } } };
    });
    await expect(new TatumGraphqlClient(crypto.randomUUID(), endpoint).getAuditTransaction(record.digest)).rejects.toThrow();
  });

  it.each(['absent', 'cursor', 'checkpoint'] as const)('rejects unverifiable checkpoint membership: %s', async (kind) => {
    const requests = intercept(() => ({ data: { checkpoint: { sequenceNumber: kind === 'checkpoint' ? 101 : 100,
      transactions: { nodes: [{ digest: genesis }], pageInfo: kind === 'cursor' ? page(true, 'same-cursor') : page() } } } }));
    await expect(new TatumGraphqlClient(crypto.randomUUID(), endpoint).assertCheckpointContains('100', '9'.repeat(44))).rejects.toThrow();
    expect(requests).toHaveLength(kind === 'cursor' ? 2 : 1);
  });

  it('keeps new endpoints blank and preserves older saved JSON-RPC configuration', () => {
    vi.stubEnv('VITE_TATUM_RPC_URL', ''); vi.stubEnv('VITE_TATUM_API_TYPE', 'graphql');
    let stored: string | null = null;
    vi.stubGlobal('localStorage', { getItem: () => stored });
    const initial = loadVaultConfig();
    expect(initial).toMatchObject({ tatumRpcUrl: '', tatumApiType: 'graphql' });
    const { tatumApiType: _apiType, ...previous } = initial;
    stored = JSON.stringify({ ...previous, tatumRpcUrl: endpoint });
    expect(loadVaultConfig()).toMatchObject({ tatumRpcUrl: endpoint, tatumApiType: 'json-rpc' });
    stored = JSON.stringify({ ...previous, tatumRpcUrl: endpoint, tatumApiType: 'graphql' });
    expect(loadVaultConfig()).toMatchObject({ tatumRpcUrl: endpoint, tatumApiType: 'graphql' });
  });
});
