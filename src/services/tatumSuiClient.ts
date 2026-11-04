import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, TransactionDataBuilder } from '@mysten/sui/transactions';
import { verifyTransactionSignature } from '@mysten/sui/verify';
import { z } from 'zod';
import { MAINNET_CHAIN_ID, TATUM_RPC_URL } from '../config/vaultConfig';
import { fromBase64 } from '../lib/encoding';
import { invariant, VaultError } from '../lib/errors';
import { fetchJson } from '../lib/http';

const integerString = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(String);
const eventSchema = z.object({
  id: z.object({ txDigest: z.string(), eventSeq: z.string() }),
  type: z.string(), sender: z.string(), parsedJson: z.unknown(),
});
export interface NetworkTelemetry {
  epoch: string; gasPrice: string; totalTransactionBlocks: string;
  checkpointHeight: string; chainIdentifier: string; latencyMs: number; observedAt: string;
}
export interface AuditTransactionVerification {
  digest: string; sender: string; signers: string[]; checkpoint: string;
  transactionSignaturesVerified: true; transactionDigestVerified: true;
  checkpointInclusion: 'rpc-attested'; events: z.infer<typeof eventSchema>[];
  recognizedEvents: z.infer<typeof eventSchema>[]; eventAuthenticity: 'rpc-attested';
  observedAt: string;
}

export class RpcError extends VaultError {
  constructor(public readonly rpcCode: number) {
    super('RPC_ERROR', `Sui RPC rejected the request (${rpcCode}). Check gateway permissions and method availability.`);
  }
}

export class TatumSuiClient {
  readonly sdk: SuiJsonRpcClient;
  constructor(private readonly apiKey: string) {
    this.sdk = new SuiJsonRpcClient({ network: 'mainnet', transport: {
      request: <T,>({ method, params, signal }: { method: string; params: unknown[]; signal?: AbortSignal }) =>
        this.call(method, params, signal) as Promise<T>,
    } });
  }

  async call(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<unknown> {
    invariant(this.apiKey.trim(), 'GATEWAY_REQUIRED', 'Configure the Tatum API key first.');
    const id = crypto.randomUUID();
    const response = z.object({ jsonrpc: z.literal('2.0'), id: z.string(), result: z.unknown().optional(),
      error: z.object({ code: z.number() }).optional() }).parse(await fetchJson(TATUM_RPC_URL, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }));
    invariant(response.id === id, 'RPC_ID', 'The gateway returned an unmatched response.');
    if (response.error) throw new RpcError(response.error.code);
    invariant(response.result !== undefined, 'RPC_RESULT', 'The gateway returned an incomplete response.');
    return response.result;
  }

  private async systemCall(method: string, canonical: string, signal?: AbortSignal): Promise<unknown> {
    try { return await this.call(method, [], signal); }
    catch (error) {
      if (error instanceof RpcError && error.rpcCode === -32601) return this.call(canonical, [], signal);
      throw error;
    }
  }

  async assertMainnet(signal?: AbortSignal): Promise<string> {
    const chain = z.string().parse(await this.call('sui_getChainIdentifier', [], signal));
    invariant(chain === MAINNET_CHAIN_ID, 'CHAIN_MISMATCH', 'The gateway is not connected to Sui Mainnet.');
    return chain;
  }

  async getNetworkTelemetry(signal?: AbortSignal): Promise<NetworkTelemetry> {
    const started = performance.now();
    const [system, gas, transactions, checkpoint, chainIdentifier] = await Promise.all([
      this.systemCall('sui_getLatestSuiSystemState', 'suix_getLatestSuiSystemState', signal),
      this.systemCall('sui_getReferenceGasPrice', 'suix_getReferenceGasPrice', signal),
      this.call('sui_getTotalTransactionBlocks', [], signal),
      this.call('sui_getLatestCheckpointSequenceNumber', [], signal), this.assertMainnet(signal),
    ]);
    return { epoch: z.object({ epoch: integerString }).parse(system).epoch,
      gasPrice: integerString.parse(gas), totalTransactionBlocks: integerString.parse(transactions),
      checkpointHeight: integerString.parse(checkpoint), chainIdentifier,
      latencyMs: Math.round(performance.now() - started), observedAt: new Date().toISOString() };
  }

  async verifyVaultAuditTransaction(txDigest: string, policy: { wallet?: string; eventTypes?: string[] } = {}): Promise<AuditTransactionVerification> {
    invariant(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txDigest), 'DIGEST_FORMAT', 'Enter a valid Sui transaction digest.');
    await this.assertMainnet();
    const tx = z.object({ digest: z.string(), rawTransaction: z.string().min(1),
      transaction: z.object({ txSignatures: z.array(z.string()).min(1) }),
      effects: z.object({ status: z.object({ status: z.literal('success') }), transactionDigest: z.string() }),
      checkpoint: integerString, events: z.array(eventSchema),
    }).parse(await this.call('sui_getTransactionBlock', [txDigest, {
      showInput: true, showRawInput: true, showEffects: true, showEvents: true,
    }]));
    const bytes = fromBase64(tx.rawTransaction);
    invariant(tx.digest === txDigest && tx.effects.transactionDigest === txDigest &&
      TransactionDataBuilder.getDigestFromBytes(bytes) === txDigest,
    'DIGEST_MISMATCH', 'The transaction bytes do not match the requested digest.');
    const transaction = Transaction.from(bytes).getData();
    const sender = transaction.sender;
    invariant(sender, 'SENDER_REQUIRED', 'The transaction sender is missing.');
    if (policy.wallet) invariant(sender.toLowerCase() === policy.wallet.toLowerCase(), 'AUDIT_OWNER', 'The transaction was not sent by the connected vault wallet.');
    const signers = await Promise.all(tx.transaction.txSignatures.map(async (signature) =>
      (await verifyTransactionSignature(bytes, signature, { client: this.sdk })).toSuiAddress()));
    invariant(signers.includes(sender), 'SIGNATURE_REQUIRED', 'The transaction sender signature could not be verified.');
    if (transaction.gasData.owner) invariant(signers.includes(transaction.gasData.owner), 'SPONSOR_SIGNATURE', 'The gas owner signature could not be verified.');
    const checkpoint = z.object({ sequenceNumber: integerString, transactions: z.array(z.string()) })
      .parse(await this.call('sui_getCheckpoint', [tx.checkpoint]));
    invariant(checkpoint.sequenceNumber === tx.checkpoint && checkpoint.transactions.includes(txDigest),
      'CHECKPOINT_MISMATCH', 'The gateway did not report this transaction in the expected checkpoint.');
    invariant(tx.events.every((event) => event.id.txDigest === txDigest), 'EVENT_MISMATCH', 'Event transaction references do not match.');
    return { digest: txDigest, sender, signers, checkpoint: tx.checkpoint,
      transactionSignaturesVerified: true, transactionDigestVerified: true,
      checkpointInclusion: 'rpc-attested', events: tx.events,
      recognizedEvents: tx.events.filter((event) => policy.eventTypes?.includes(event.type)),
      eventAuthenticity: 'rpc-attested', observedAt: new Date().toISOString() };
  }
}
