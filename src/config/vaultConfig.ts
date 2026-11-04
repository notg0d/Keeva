import { z } from 'zod';
import { createKdf, decryptJson, deriveMasterKey, encryptJson, kdfSchema, cipherSchema } from '../crypto/vaultCrypto';
import { utf8 } from '../lib/encoding';
import { VaultError } from '../lib/errors';
import { DEFAULT_MEMWAL_SERVER_URL } from './gatewayRoutes';

export const MAINNET_CHAIN_ID = '35834a8a';
const SETTINGS_KEY = 'keeva.settings.v1';
const SECRETS_KEY = 'keeva.gateway.v1';
export const WALLET_GATEWAY_PREFIX = 'keeva.gateway.wallet.v1:';
const objectId = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Use a full 32-byte Sui object ID.');
const publicSchema = z.object({
  tatumApiType: z.enum(['graphql', 'json-rpc']).optional(),
  tatumRpcUrl: z.string().optional(),
  memwalAccountId: z.string(), memwalAgentId: z.string(), memwalServerUrl: z.string(),
  memwalNamespace: z.string(), autoLockMinutes: z.number().int().min(1).max(60),
  auditEventTypes: z.array(z.string()),
});
export const configSchema = publicSchema.extend({
  tatumApiType: z.enum(['graphql', 'json-rpc']).default('graphql'),
  tatumRpcUrl: z.url({ error: 'Enter a valid Tatum endpoint URL.' }).refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.gateway.tatum.io') && !url.port &&
      !url.username && !url.password && !url.search && !url.hash;
  }, 'Use an HTTPS *.gateway.tatum.io endpoint without a custom port, URL credentials, query parameters, or fragments.'),
  tatumApiKey: z.string().trim().regex(/^[\x21-\x7e]{1,512}$/, 'Enter a valid Tatum API key.'),
  memwalPrivateKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Use a 64-character hex delegate private key.'),
  memwalAccountId: objectId,
  memwalAgentId: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/, 'Use the delegate public key in hex.'),
  memwalServerUrl: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'The relayer must use HTTPS without URL credentials or query parameters.'),
  memwalNamespace: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/, 'Use 1–120 letters, digits, underscores, or hyphens.'),
  auditEventTypes: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}::[A-Za-z_][\w]*::[A-Za-z_][\w]*$/)),
}).strict();
export type VaultConfig = z.infer<typeof configSchema>;
export const gatewaySettingsSchema = configSchema.extend({
  tatumRpcUrl: configSchema.shape.tatumRpcUrl.or(z.literal('')),
  tatumApiKey: configSchema.shape.tatumApiKey.or(z.literal('')),
  memwalPrivateKey: configSchema.shape.memwalPrivateKey.or(z.literal('')),
  memwalAccountId: configSchema.shape.memwalAccountId.or(z.literal('')),
  memwalAgentId: configSchema.shape.memwalAgentId.or(z.literal('')),
});

export function loadVaultConfig(): VaultConfig {
  const env = import.meta.env;
  const defaults: VaultConfig = {
    tatumApiType: env.VITE_TATUM_API_TYPE === 'json-rpc' ? 'json-rpc' : 'graphql',
    tatumRpcUrl: env.VITE_TATUM_RPC_URL ?? '',
    tatumApiKey: env.VITE_TATUM_API_KEY ?? '', memwalPrivateKey: env.VITE_MEMWAL_PRIVATE_KEY ?? '',
    memwalAccountId: env.VITE_MEMWAL_ACCOUNT_ID ?? '', memwalAgentId: env.VITE_MEMWAL_AGENT_ID ?? '',
    memwalServerUrl: env.VITE_MEMWAL_SERVER_URL || DEFAULT_MEMWAL_SERVER_URL,
    memwalNamespace: env.VITE_MEMWAL_NAMESPACE || 'vaultos-production',
    autoLockMinutes: 5, auditEventTypes: [],
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const saved = publicSchema.parse(JSON.parse(raw));
    return { ...defaults, ...saved, tatumRpcUrl: saved.tatumRpcUrl ?? defaults.tatumRpcUrl,
      tatumApiType: saved.tatumApiType ?? 'json-rpc' };
  } catch { return defaults; }
}

export function hasProtectedGateway(): boolean {
  try { return localStorage.getItem(SECRETS_KEY) !== null; } catch { return false; }
}

export function persistVaultConfig(config: VaultConfig, protectedEntry?: { key: string; value: string }): void {
  const { tatumApiKey: _apiKey, memwalPrivateKey: _privateKey, ...publicSettings } = gatewaySettingsSchema.parse(config);
  let previousSettings: string | null | undefined;
  try {
    previousSettings = localStorage.getItem(SETTINGS_KEY);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings));
    if (protectedEntry) localStorage.setItem(protectedEntry.key, protectedEntry.value);
  } catch (cause) {
    try {
      if (previousSettings === null) localStorage.removeItem(SETTINGS_KEY);
      else if (previousSettings !== undefined) localStorage.setItem(SETTINGS_KEY, previousSettings);
    } catch { /* Keep the original storage failure. */ }
    throw new VaultError('LOCAL_STORAGE', 'Browser settings could not be saved. Enable site storage and retry.', { cause });
  }
}

export async function saveVaultConfig(config: VaultConfig, devicePassphrase?: string, assertActive: () => void = () => {}): Promise<VaultConfig> {
  const parsed = gatewaySettingsSchema.parse(config);
  const { tatumApiKey, memwalPrivateKey } = parsed;
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
  assertActive();
  persistVaultConfig(parsed, protectedSecrets ? { key: SECRETS_KEY, value: protectedSecrets } : undefined);
  return parsed;
}

export async function unlockGateway(devicePassphrase: string): Promise<Pick<VaultConfig, 'tatumApiKey' | 'memwalPrivateKey'>> {
  const envelope = z.object({ kdf: kdfSchema, payload: cipherSchema }).parse(JSON.parse(localStorage.getItem(SECRETS_KEY) ?? 'null'));
  const bytes = utf8.encode(devicePassphrase);
  try {
    const key = await deriveMasterKey(bytes, envelope.kdf);
    return gatewaySettingsSchema.pick({ tatumApiKey: true, memwalPrivateKey: true }).parse(await decryptJson(key, envelope.payload, 'keeva:gateway:v1'));
  } finally { bytes.fill(0); }
}

export function clearLocalConfiguration(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(SECRETS_KEY);
  const walletKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(WALLET_GATEWAY_PREFIX)) walletKeys.push(key);
  }
  for (const key of walletKeys) localStorage.removeItem(key);
}

export function forgetProtectedGateway(): void { localStorage.removeItem(SECRETS_KEY); }

export function isConfigurationStorageKey(key: string | null): boolean {
  return key === null || key === SETTINGS_KEY || key === SECRETS_KEY || key.startsWith(WALLET_GATEWAY_PREFIX);
}
