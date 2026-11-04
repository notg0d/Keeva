import { z } from 'zod';
import { createKdf, decryptJson, deriveMasterKey, encryptJson, kdfSchema, cipherSchema } from '../crypto/vaultCrypto';
import { utf8 } from '../lib/encoding';
import { VaultError } from '../lib/errors';

export const TATUM_RPC_URL = 'https://sui-mainnet.gateway.tatum.io/';
export const MAINNET_CHAIN_ID = '35834a8a';
const SETTINGS_KEY = 'keeva.settings.v1';
const SECRETS_KEY = 'keeva.gateway.v1';
const objectId = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Use a full 32-byte Sui object ID.');
const publicSchema = z.object({
  memwalAccountId: z.string(), memwalAgentId: z.string(), memwalServerUrl: z.string(),
  memwalNamespace: z.string(), autoLockMinutes: z.number().int().min(1).max(60),
  auditEventTypes: z.array(z.string()),
});
export const configSchema = publicSchema.extend({
  tatumApiKey: z.string().trim().min(1, 'Tatum API key is required.'),
  memwalPrivateKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Use a 64-character hex delegate private key.'),
  memwalAccountId: objectId,
  memwalAgentId: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, 'Use the delegate public key in hex.'),
  memwalServerUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'The relayer must use HTTPS without URL credentials or query parameters.'),
  memwalNamespace: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/, 'Use 1–120 letters, digits, underscores, or hyphens.'),
  auditEventTypes: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}::[A-Za-z_][\w]*::[A-Za-z_][\w]*$/)),
}).strict();
export type VaultConfig = z.infer<typeof configSchema>;

export function loadVaultConfig(): VaultConfig {
  const env = import.meta.env;
  const defaults: VaultConfig = {
    tatumApiKey: env.VITE_TATUM_API_KEY ?? '', memwalPrivateKey: env.VITE_MEMWAL_PRIVATE_KEY ?? '',
    memwalAccountId: env.VITE_MEMWAL_ACCOUNT_ID ?? '', memwalAgentId: env.VITE_MEMWAL_AGENT_ID ?? '',
    memwalServerUrl: env.VITE_MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
    memwalNamespace: env.VITE_MEMWAL_NAMESPACE || 'vaultos-production',
    autoLockMinutes: 5, auditEventTypes: [],
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...publicSchema.parse(JSON.parse(raw)) };
  } catch { return defaults; }
}

export function hasProtectedGateway(): boolean {
  try { return localStorage.getItem(SECRETS_KEY) !== null; } catch { return false; }
}

export async function saveVaultConfig(config: VaultConfig, devicePassphrase?: string): Promise<VaultConfig> {
  const parsed = configSchema.parse(config);
  const { tatumApiKey, memwalPrivateKey, ...publicSettings } = parsed;
  let protectedSecrets: string | undefined;
  if (devicePassphrase) {
    if (devicePassphrase.length < 14) throw new VaultError('DEVICE_PASSPHRASE', 'Use at least 14 characters for device protection.');
    const kdf = createKdf('passphrase');
    const bytes = utf8.encode(devicePassphrase);
    try {
      const key = await deriveMasterKey(bytes, kdf);
      protectedSecrets = JSON.stringify({ kdf, payload: await encryptJson(key, { tatumApiKey, memwalPrivateKey }, 'keeva:gateway:v1') });
    } finally { bytes.fill(0); }
  }
  try {
    if (protectedSecrets) localStorage.setItem(SECRETS_KEY, protectedSecrets);
    else localStorage.removeItem(SECRETS_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings));
  } catch (cause) {
    throw new VaultError('LOCAL_STORAGE', 'Browser settings could not be saved. Enable site storage and retry.', { cause });
  }
  return parsed;
}

export async function unlockGateway(devicePassphrase: string): Promise<Pick<VaultConfig, 'tatumApiKey' | 'memwalPrivateKey'>> {
  const envelope = z.object({ kdf: kdfSchema, payload: cipherSchema }).parse(JSON.parse(localStorage.getItem(SECRETS_KEY) ?? 'null'));
  const bytes = utf8.encode(devicePassphrase);
  try {
    const key = await deriveMasterKey(bytes, envelope.kdf);
    return configSchema.pick({ tatumApiKey: true, memwalPrivateKey: true }).parse(await decryptJson(key, envelope.payload, 'keeva:gateway:v1'));
  } finally { bytes.fill(0); }
}

export function clearLocalConfiguration(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(SECRETS_KEY);
}
