import { MemWal } from '@mysten-incubation/memwal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { z } from 'zod';
import { configSchema, type VaultConfig } from '../config/vaultConfig';
import { fromHex, toHex, utf8 } from '../lib/encoding';
import { invariant } from '../lib/errors';
import { fetchJson } from '../lib/http';
import { TatumSuiClient } from './tatumSuiClient';

export function createMemwal(config: VaultConfig): MemWal {
  configSchema.parse(config);
  return MemWal.create({ key: config.memwalPrivateKey, accountId: config.memwalAccountId,
    namespace: config.memwalNamespace, serverUrl: config.memwalServerUrl.replace(/\/$/, ''),
    requestTimeoutMs: 30_000, recallTimeoutMs: 60_000, preflightTimeoutMs: 10_000 });
}

export async function assertRelayerMainnet(config: VaultConfig): Promise<void> {
  const deployment = z.object({ network: z.string(), packageId: z.string() }).parse(
    await fetchJson(`${config.memwalServerUrl.replace(/\/$/, '')}/config`));
  invariant(deployment.network === 'mainnet', 'RELAYER_NETWORK', 'The Walrus relayer must be configured for Mainnet.');
}

export async function verifyDelegate(config: VaultConfig, memwal: MemWal, wallet?: string): Promise<string> {
  const publicKey = await memwal.getPublicKeyHex();
  invariant(publicKey === config.memwalAgentId.replace(/^0x/, '').toLowerCase(), 'AGENT_MISMATCH', 'Agent ID must match the configured delegate private key.');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const path = '/api/whoami';
  const bodyHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array())));
  const canonical = `${timestamp}.GET.${path}.${bodyHash}.${nonce}.${config.memwalAccountId}`;
  const privateBytes = fromHex(config.memwalPrivateKey);
  let signature: string;
  try { signature = toHex(await Ed25519Keypair.fromSecretKey(privateBytes).sign(utf8.encode(canonical))); }
  finally { privateBytes.fill(0); }
  const identity = z.object({ account_id: z.string(), owner: z.string() }).parse(await fetchJson(
    `${config.memwalServerUrl.replace(/\/$/, '')}${path}`, { headers: {
      'x-public-key': publicKey, 'x-agent-id': publicKey, 'x-account-id': config.memwalAccountId,
      'x-signature': signature, 'x-timestamp': timestamp, 'x-nonce': nonce,
    } }));
  invariant(identity.account_id.toLowerCase() === config.memwalAccountId.toLowerCase(), 'ACCOUNT_MISMATCH', 'The delegate resolved to a different memory account.');
  if (wallet) invariant(identity.owner.toLowerCase() === wallet.toLowerCase(), 'WALLET_OWNER', 'Connect the wallet that owns the configured Walrus Memory account.');
  return identity.owner;
}

export async function testVaultConnectivity(config: VaultConfig, wallet?: string) {
  const memwal = createMemwal(config);
  try {
    const [health, telemetry, , owner] = await Promise.all([
      memwal.health(), new TatumSuiClient(config.tatumApiKey).getNetworkTelemetry(),
      assertRelayerMainnet(config), verifyDelegate(config, memwal, wallet),
    ]);
    invariant(health.status === 'ok', 'RELAYER_HEALTH', 'The Walrus relayer is not healthy.');
    return { health, telemetry, owner, checkedAt: new Date().toISOString() };
  } finally { memwal.destroy(); }
}
