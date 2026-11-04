import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { z } from 'zod';
import { cipherSchema, createKdf, decryptJson, deriveMasterKey, encryptJson, kdfSchema } from '../crypto/vaultCrypto';
import { fromBase64, utf8 } from '../lib/encoding';
import { invariant, VaultError } from '../lib/errors';
import { gatewaySettingsSchema, MAINNET_CHAIN_ID, persistVaultConfig, WALLET_GATEWAY_PREFIX, type VaultConfig } from './vaultConfig';

export type GatewaySigner = (message: Uint8Array<ArrayBuffer>) => Promise<{ signature: string }>;
const envelopeSchema = z.object({
  format: z.literal('keeva.gateway.wallet.v1'),
  wallet: z.string().regex(/^0x[0-9a-f]{64}$/), origin: z.url(),
  kdf: kdfSchema.extend({ method: z.literal('wallet') }), payload: cipherSchema,
}).strict();
type WalletGatewayEnvelope = z.infer<typeof envelopeSchema>;
type WalletGatewayScope = Omit<WalletGatewayEnvelope, 'payload'>;

function walletAddress(address: string): string {
  return z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Use a full Sui wallet address.').parse(address).toLowerCase();
}

function storageKey(address: string): string { return WALLET_GATEWAY_PREFIX + walletAddress(address); }

export function hasWalletGateway(address?: string): boolean {
  try { return !!address && localStorage.getItem(storageKey(address)) !== null; } catch { return false; }
}

export function hasAnyWalletGateway(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      if (localStorage.key(index)?.startsWith(WALLET_GATEWAY_PREFIX)) return true;
    }
  } catch { return false; }
  return false;
}

function context(scope: WalletGatewayScope): string {
  return JSON.stringify([scope.format, scope.origin, MAINNET_CHAIN_ID, scope.wallet,
    scope.kdf.algorithm, scope.kdf.method, scope.kdf.iterations, scope.kdf.salt]);
}

async function walletKey(scope: WalletGatewayScope, sign: GatewaySigner, assertActive: () => void): Promise<CryptoKey> {
  const message = utf8.encode(`Keeva private gateway key derivation v1\n${context(scope)}\nKeep this signature private. It unlocks saved API and delegate keys on this device.\nThis is not a transaction and does not grant spending permission.`);
  assertActive();
  const { signature } = await sign(message);
  assertActive();
  invariant(parseSerializedSignature(signature).signatureScheme === 'ED25519', 'WALLET_SCHEME',
    'Wallet-protected gateways require deterministic Ed25519 signatures. Choose device passphrase protection with this wallet.');
  await verifyPersonalMessageSignature(message, signature, { address: scope.wallet });
  assertActive();
  const bytes = fromBase64(signature);
  try {
    const key = await deriveMasterKey(bytes, scope.kdf);
    assertActive();
    return key;
  } finally { bytes.fill(0); }
}

export async function saveWalletGateway(config: VaultConfig, address: string, sign: GatewaySigner,
  assertActive: () => void = () => {}): Promise<VaultConfig> {
  const parsed = gatewaySettingsSchema.parse(config);
  const scope: WalletGatewayScope = { format: 'keeva.gateway.wallet.v1', wallet: walletAddress(address),
    origin: location.origin, kdf: { ...createKdf('wallet'), method: 'wallet' } };
  const key = await walletKey(scope, sign, assertActive);
  const payload = await encryptJson(key, parsed, context(scope));
  assertActive();
  persistVaultConfig(parsed, { key: storageKey(address), value: JSON.stringify({ ...scope, payload }) });
  return parsed;
}

export async function unlockWalletGateway(address: string, sign: GatewaySigner,
  assertActive: () => void = () => {}): Promise<VaultConfig> {
  let raw: string | null;
  try { raw = localStorage.getItem(storageKey(address)); }
  catch (cause) { throw new VaultError('LOCAL_STORAGE', 'Saved gateway settings cannot be read. Enable site storage and retry.', { cause }); }
  invariant(raw && raw.length <= 2_100_000, 'GATEWAY_MISSING', 'No readable gateway configuration is saved for this wallet on this browser.');
  const envelope = envelopeSchema.parse(JSON.parse(raw));
  invariant(envelope.wallet === walletAddress(address) && envelope.origin === location.origin, 'GATEWAY_SCOPE',
    'Saved gateways belong to a different wallet or application origin.');
  const key = await walletKey(envelope, sign, assertActive);
  const config = gatewaySettingsSchema.parse(await decryptJson(key, envelope.payload, context(envelope)));
  assertActive();
  invariant(localStorage.getItem(storageKey(address)) === raw, 'GATEWAY_CHANGED', 'Saved gateways changed while unlocking. Retry with the current saved configuration.');
  return config;
}

export function forgetWalletGateway(address: string): void { localStorage.removeItem(storageKey(address)); }
