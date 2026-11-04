import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { fromBase58 } from '@mysten/sui/utils';
import { z } from 'zod';
import { MAINNET_CHAIN_ID } from '../config/vaultConfig';
import { toHex } from '../lib/encoding';
import { invariant, VaultError } from '../lib/errors';
import { requestTatum } from './tatumTransport';

const integerString = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(String);
const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const eventSchema = z.object({ sequenceNumber: integerString, transaction: z.object({ digest: z.string() }),
  sender: z.object({ address: z.string() }), contents: z.object({ type: z.object({ repr: z.string().min(1) }), json: z.json() }) });
const transactionSchema = z.object({ digest: z.string(), transactionBcs: z.string().min(1),
  signatures: z.array(z.object({ signatureBytes: z.string().min(1) })).min(1),
  effects: z.object({ digest: z.string(), status: z.literal('SUCCESS'), checkpoint: z.object({ sequenceNumber: integerString }),
    events: z.object({ nodes: z.array(eventSchema), pageInfo: pageInfoSchema }) }) });

export const GRAPHQL_NETWORK_QUERY = `query KeevaNetwork {
  chainIdentifier
  checkpoint { sequenceNumber networkTotalTransactions epoch { epochId referenceGasPrice } }
}`;
export const GRAPHQL_AUDIT_QUERY = `query KeevaAudit($digest: String!, $after: String) {
  transaction(digest: $digest) {
    digest transactionBcs signatures { signatureBytes }
    effects {
      digest status checkpoint { sequenceNumber }
      events(first: 50, after: $after) {
        nodes { sequenceNumber transaction { digest } sender { address } contents { type { repr } json } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
export const GRAPHQL_CHECKPOINT_QUERY = `query KeevaCheckpoint($sequence: UInt53!, $after: String) {
  checkpoint(sequenceNumber: $sequence) {
    sequenceNumber
    transactions(first: 50, after: $after) { nodes { digest } pageInfo { hasNextPage endCursor } }
  }
}`;

function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new VaultError('GRAPHQL_DATA', 'Tatum GraphQL returned incomplete or incompatible Sui data. Check the endpoint schema and requested record.');
  return result.data;
}

export class TatumGraphqlClient {
  readonly sdk: SuiGraphQLClient;
  private activeEndpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.activeEndpoint = endpoint;
    this.sdk = new SuiGraphQLClient({ network: 'mainnet', url: endpoint,
      fetch: async (_input, init) => {
        invariant(endpoint.trim() && apiKey.trim(), 'GATEWAY_REQUIRED', 'Configure your Tatum endpoint URL and API key first.');
        const body = parseResponse(z.object({ data: z.record(z.string(), z.unknown()).nullish(),
          connection: z.object({ endpoint: z.url() }).optional(),
          errors: z.array(z.unknown()).optional() }), await requestTatum(this.activeEndpoint, apiKey, 'graphql',
          JSON.parse(String(init?.body)), init?.signal ?? undefined));
        invariant(!body.errors?.length && body.data, 'GRAPHQL_ERROR', 'Tatum GraphQL rejected the query or returned partial data. Check your endpoint, API key access, and Sui GraphQL schema.');
        if (body.connection) this.activeEndpoint = body.connection.endpoint;
        return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      },
    });
  }

  private async query(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    const response = await this.sdk.query({ query, variables, signal });
    return response.data;
  }

  private mainnet(genesis: string): string {
    invariant(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(genesis), 'CHAIN_RESPONSE', 'The gateway returned an invalid Sui genesis digest.');
    const bytes = fromBase58(genesis);
    invariant(bytes.length === 32 && toHex(bytes.slice(0, 4)) === MAINNET_CHAIN_ID,
      'CHAIN_MISMATCH', 'The gateway is not connected to Sui Mainnet.');
    return MAINNET_CHAIN_ID;
  }

  async assertMainnet(signal?: AbortSignal): Promise<string> {
    const data = await this.query('query KeevaChain { chainIdentifier }', {}, signal);
    return this.mainnet(parseResponse(z.object({ chainIdentifier: z.string() }), data).chainIdentifier);
  }

  async getNetworkTelemetry(signal?: AbortSignal) {
    const started = performance.now();
    const data = await this.query(GRAPHQL_NETWORK_QUERY, {}, signal);
    const result = parseResponse(z.object({ chainIdentifier: z.string(), checkpoint: z.object({
      sequenceNumber: integerString, networkTotalTransactions: integerString,
      epoch: z.object({ epochId: integerString, referenceGasPrice: integerString }),
    }) }), data);
    const chainIdentifier = this.mainnet(result.chainIdentifier);
    return { epoch: result.checkpoint.epoch.epochId, gasPrice: result.checkpoint.epoch.referenceGasPrice,
      totalTransactionBlocks: result.checkpoint.networkTotalTransactions, checkpointHeight: result.checkpoint.sequenceNumber,
      chainIdentifier, endpoint: this.activeEndpoint, latencyMs: Math.round(performance.now() - started), observedAt: new Date().toISOString() };
  }

  async getAuditTransaction(digest: string) {
    const events: Array<{ id: { txDigest: string; eventSeq: string }; type: string; sender: string; parsedJson: unknown }> = [];
    const cursors = new Set<string>();
    let after: string | null = null;
    let first: z.infer<typeof transactionSchema> | undefined;
    for (;;) {
      const data = await this.query(GRAPHQL_AUDIT_QUERY, { digest, after });
      const { transaction: tx } = parseResponse(z.object({ transaction: transactionSchema }), data);
      invariant(tx.digest === digest && tx.effects.digest === digest, 'DIGEST_MISMATCH', 'The returned transaction does not match the requested digest.');
      if (!first) first = tx;
      invariant(tx.transactionBcs === first.transactionBcs && tx.effects.checkpoint.sequenceNumber === first.effects.checkpoint.sequenceNumber &&
        JSON.stringify(tx.signatures) === JSON.stringify(first.signatures), 'TRANSACTION_CHANGED', 'Transaction evidence changed during pagination.');
      for (const event of tx.effects.events.nodes) {
        invariant(event.transaction.digest === digest && BigInt(event.sequenceNumber) === BigInt(events.length),
          'EVENT_MISMATCH', 'Transaction events are missing, duplicated, out of order, or bound to another transaction.');
        events.push({ id: { txDigest: event.transaction.digest, eventSeq: event.sequenceNumber },
          type: event.contents.type.repr, sender: event.sender.address, parsedJson: event.contents.json });
      }
      const page = tx.effects.events.pageInfo;
      if (!page.hasNextPage) break;
      invariant(page.endCursor && !cursors.has(page.endCursor) && tx.effects.events.nodes.length,
        'PAGINATION', 'The gateway returned a non-advancing event cursor.');
      cursors.add(page.endCursor); after = page.endCursor;
    }
    invariant(first, 'TRANSACTION_REQUIRED', 'The gateway did not return the requested transaction.');
    return { digest: first.digest, rawTransaction: first.transactionBcs,
      transaction: { txSignatures: first.signatures.map((entry) => entry.signatureBytes) },
      effects: { status: { status: 'success' as const }, transactionDigest: first.effects.digest },
      checkpoint: first.effects.checkpoint.sequenceNumber, events };
  }

  async assertCheckpointContains(sequenceNumber: string, digest: string): Promise<void> {
    const sequence = Number(sequenceNumber);
    invariant(Number.isSafeInteger(sequence) && sequence >= 0, 'CHECKPOINT_RANGE', 'The checkpoint exceeds the GraphQL integer range.');
    const cursors = new Set<string>();
    let after: string | null = null;
    for (;;) {
      const data = await this.query(GRAPHQL_CHECKPOINT_QUERY, { sequence, after });
      const { checkpoint } = parseResponse(z.object({ checkpoint: z.object({ sequenceNumber: integerString,
        transactions: z.object({ nodes: z.array(z.object({ digest: z.string() })), pageInfo: pageInfoSchema }) }) }), data);
      invariant(checkpoint.sequenceNumber === sequenceNumber, 'CHECKPOINT_MISMATCH', 'The gateway returned a different checkpoint.');
      if (checkpoint.transactions.nodes.some((tx) => tx.digest === digest)) return;
      const page = checkpoint.transactions.pageInfo;
      invariant(page.hasNextPage, 'CHECKPOINT_MISMATCH', 'The gateway did not report this transaction in the expected checkpoint.');
      invariant(page.endCursor && !cursors.has(page.endCursor) && checkpoint.transactions.nodes.length,
        'PAGINATION', 'The gateway returned a non-advancing checkpoint cursor.');
      cursors.add(page.endCursor); after = page.endCursor;
    }
  }
}
