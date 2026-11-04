import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { clearLocalConfiguration, configSchema, hasProtectedGateway, loadVaultConfig, saveVaultConfig, unlockGateway, WALLET_GATEWAY_PREFIX, type VaultConfig } from '../src/config/vaultConfig';
import { forgetWalletGateway, hasAnyWalletGateway, hasWalletGateway, saveWalletGateway, unlockWalletGateway } from '../src/config/walletGateway';
import { fromBase64, toBase64, text, toHex } from '../src/lib/encoding';

class BrowserStorage implements Storage {
  private entries = new Map<string, string>();
  get length() { return this.entries.size; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, String(value)); }
  removeItem(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
}

function configuration(): VaultConfig {
  const delegate = Ed25519Keypair.generate();
  return { tatumApiType: 'graphql', tatumRpcUrl: 'https://sui-mainnet.gateway.tatum.io/graphql',
    tatumApiKey: crypto.randomUUID(), memwalPrivateKey: toHex(decodeSuiPrivateKey(delegate.getSecretKey()).secretKey),
    memwalAccountId: Ed25519Keypair.generate().toSuiAddress(), memwalAgentId: toHex(delegate.getPublicKey().toRawBytes()),
    memwalServerUrl: 'https://relayer.memory.walrus.xyz', memwalNamespace: `vault-${crypto.randomUUID()}`, autoLockMinutes: 5, auditEventTypes: [] };
}

describe('encrypted gateway persistence', () => {
  let storage: BrowserStorage;
  beforeEach(() => { storage = new BrowserStorage(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('location', { origin: 'https://keeva.test' }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('restores keys and their settings with the same wallet after reload, without storing private material', async () => {
    const wallet = Ed25519Keypair.generate();
    const config = configuration();
    let signature = '';
    const sign = vi.fn(async (message: Uint8Array<ArrayBuffer>) => {
      const visibleMessage = text.decode(message);
      expect(visibleMessage).toContain('https://keeva.test'); expect(visibleMessage).toContain(wallet.toSuiAddress());
      expect(visibleMessage).not.toContain(config.tatumApiKey); expect(visibleMessage).not.toContain(config.memwalPrivateKey);
      const result = await wallet.signPersonalMessage(message); signature = result.signature; return result;
    });
    await saveWalletGateway(config, wallet.toSuiAddress(), sign);
    expect(hasWalletGateway(wallet.toSuiAddress())).toBe(true); expect(hasAnyWalletGateway()).toBe(true);
    const persisted = [...Array(storage.length)].map((_, index) => storage.getItem(storage.key(index)!)).join('');
    expect(persisted).not.toContain(config.tatumApiKey); expect(persisted).not.toContain(config.memwalPrivateKey); expect(persisted).not.toContain(signature);
    const reloaded = loadVaultConfig();
    expect(reloaded.tatumApiKey).toBe(''); expect(reloaded.memwalPrivateKey).toBe(''); expect(reloaded.memwalNamespace).toBe(config.memwalNamespace);
    expect(await unlockWalletGateway(wallet.toSuiAddress(), sign)).toEqual(config);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(hasWalletGateway(Ed25519Keypair.generate().toSuiAddress())).toBe(false);
  });

  it('keeps separate wallet profiles and restores each profile’s original public settings', async () => {
    const first = Ed25519Keypair.generate(), second = Ed25519Keypair.generate();
    const firstConfig = configuration(), secondConfig = configuration();
    await saveWalletGateway(firstConfig, first.toSuiAddress(), message => first.signPersonalMessage(message));
    await saveWalletGateway(secondConfig, second.toSuiAddress(), message => second.signPersonalMessage(message));
    expect(loadVaultConfig().memwalNamespace).toBe(secondConfig.memwalNamespace);
    expect(await unlockWalletGateway(first.toSuiAddress(), message => first.signPersonalMessage(message))).toEqual(firstConfig);
    expect(await unlockWalletGateway(second.toSuiAddress(), message => second.signPersonalMessage(message))).toEqual(secondConfig);
    forgetWalletGateway(first.toSuiAddress());
    expect(hasWalletGateway(first.toSuiAddress())).toBe(false); expect(hasWalletGateway(second.toSuiAddress())).toBe(true);
  });

  it('remembers keys during incomplete setup without marking the vault ready', async () => {
    const wallet = Ed25519Keypair.generate(), sign = (message: Uint8Array<ArrayBuffer>) => wallet.signPersonalMessage(message);
    const config = { ...configuration(), memwalPrivateKey: '', memwalAccountId: '', memwalAgentId: '' };
    await saveWalletGateway(config, wallet.toSuiAddress(), sign);
    const restored = await unlockWalletGateway(wallet.toSuiAddress(), sign);
    expect(restored).toEqual(config); expect(configSchema.safeParse(restored).success).toBe(false);
    await saveVaultConfig(config, crypto.randomUUID());
    expect(hasProtectedGateway()).toBe(true);
  });

  it('rejects another wallet and copied wallet/origin envelopes before requesting a signature', async () => {
    const wallet = Ed25519Keypair.generate(), other = Ed25519Keypair.generate();
    const key = WALLET_GATEWAY_PREFIX + wallet.toSuiAddress();
    await saveWalletGateway(configuration(), wallet.toSuiAddress(), message => wallet.signPersonalMessage(message));
    const raw = storage.getItem(key)!;
    const sign = vi.fn(message => wallet.signPersonalMessage(message));
    storage.setItem(WALLET_GATEWAY_PREFIX + other.toSuiAddress(), raw);
    await expect(unlockWalletGateway(other.toSuiAddress(), sign)).rejects.toThrow('different wallet');
    vi.stubGlobal('location', { origin: 'https://elsewhere.test' });
    await expect(unlockWalletGateway(wallet.toSuiAddress(), sign)).rejects.toThrow('different wallet or application origin');
    expect(sign).not.toHaveBeenCalled();
  });

  it('verifies the signer and requires deterministic Ed25519 protection', async () => {
    const wallet = Ed25519Keypair.generate(), other = Ed25519Keypair.generate();
    await expect(saveWalletGateway(configuration(), wallet.toSuiAddress(), message => other.signPersonalMessage(message))).rejects.toThrow();
    const differentScheme = Secp256k1Keypair.generate();
    await expect(saveWalletGateway(configuration(), differentScheme.toSuiAddress(), message => differentScheme.signPersonalMessage(message))).rejects.toThrow('deterministic Ed25519');
    expect(storage.length).toBe(0);
  });

  it('authenticates ciphertext and key-derivation metadata', async () => {
    const wallet = Ed25519Keypair.generate(), sign = (message: Uint8Array<ArrayBuffer>) => wallet.signPersonalMessage(message);
    await saveWalletGateway(configuration(), wallet.toSuiAddress(), sign);
    const key = WALLET_GATEWAY_PREFIX + wallet.toSuiAddress(), raw = storage.getItem(key)!;
    const envelope = JSON.parse(raw);
    const ciphertext = fromBase64(envelope.payload.ciphertext); ciphertext[0] = ciphertext[0]! ^ 1;
    storage.setItem(key, JSON.stringify({ ...envelope, payload: { ...envelope.payload, ciphertext: toBase64(ciphertext) } }));
    await expect(unlockWalletGateway(wallet.toSuiAddress(), sign)).rejects.toThrow('Unable to authenticate');
    storage.setItem(key, JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, salt: toBase64(crypto.getRandomValues(new Uint8Array(32))) } }));
    await expect(unlockWalletGateway(wallet.toSuiAddress(), sign)).rejects.toThrow('Unable to authenticate');
  });

  it('rejects malformed or weakened encrypted profiles without asking the wallet to sign', async () => {
    const wallet = Ed25519Keypair.generate(), key = WALLET_GATEWAY_PREFIX + wallet.toSuiAddress();
    await saveWalletGateway(configuration(), wallet.toSuiAddress(), message => wallet.signPersonalMessage(message));
    const envelope = JSON.parse(storage.getItem(key)!);
    const sign = vi.fn(message => wallet.signPersonalMessage(message));
    storage.setItem(key, JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, iterations: 1 } }));
    await expect(unlockWalletGateway(wallet.toSuiAddress(), sign)).rejects.toThrow();
    storage.setItem(key, '{');
    await expect(unlockWalletGateway(wallet.toSuiAddress(), sign)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });

  it('preserves previous settings on cancelled signing, stale wallet operations, and storage failure', async () => {
    const wallet = Ed25519Keypair.generate(), config = configuration();
    const sign = (message: Uint8Array<ArrayBuffer>) => wallet.signPersonalMessage(message);
    await saveWalletGateway(config, wallet.toSuiAddress(), sign);
    const key = WALLET_GATEWAY_PREFIX + wallet.toSuiAddress(), raw = storage.getItem(key), settings = storage.getItem('keeva.settings.v1');
    await expect(saveWalletGateway(configuration(), wallet.toSuiAddress(), async () => { throw new Error('Wallet request declined.'); })).rejects.toThrow('declined');
    let active = true;
    await expect(saveWalletGateway(configuration(), wallet.toSuiAddress(), async message => { active = false; return sign(message); }, () => {
      if (!active) throw new Error('Wallet changed.');
    })).rejects.toThrow('Wallet changed');
    const originalWrite = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((entryKey, value) => {
      if (entryKey === key) throw new DOMException('Storage is full.', 'QuotaExceededError');
      originalWrite(entryKey, value);
    });
    await expect(saveWalletGateway(configuration(), wallet.toSuiAddress(), sign)).rejects.toThrow('Browser settings could not be saved');
    expect(storage.getItem(key)).toBe(raw); expect(storage.getItem('keeva.settings.v1')).toBe(settings);
  });

  it('does not restore an encrypted copy replaced while the wallet request was pending', async () => {
    const wallet = Ed25519Keypair.generate(), sign = (message: Uint8Array<ArrayBuffer>) => wallet.signPersonalMessage(message);
    await saveWalletGateway(configuration(), wallet.toSuiAddress(), sign);
    await expect(unlockWalletGateway(wallet.toSuiAddress(), async message => {
      storage.removeItem(WALLET_GATEWAY_PREFIX + wallet.toSuiAddress()); return sign(message);
    })).rejects.toThrow('changed while unlocking');
  });

  it('retains existing passphrase protection during ordinary settings saves and supports earlier encrypted copies', async () => {
    const config = configuration(), passphrase = crypto.randomUUID();
    await saveVaultConfig(config, passphrase);
    const protectedCopy = storage.getItem('keeva.gateway.v1');
    expect(hasProtectedGateway()).toBe(true);
    expect(await unlockGateway(passphrase)).toEqual({ tatumApiKey: config.tatumApiKey, memwalPrivateKey: config.memwalPrivateKey });
    await saveVaultConfig({ ...config, autoLockMinutes: 10 });
    expect(storage.getItem('keeva.gateway.v1')).toBe(protectedCopy);
    await expect(unlockGateway(crypto.randomUUID())).rejects.toThrow('Unable to authenticate');
    expect(protectedCopy).not.toContain(config.tatumApiKey); expect(protectedCopy).not.toContain(config.memwalPrivateKey);
  });

  it('forgets only gateway configuration and leaves unrelated browser storage alone', async () => {
    const first = Ed25519Keypair.generate(), second = Ed25519Keypair.generate();
    await saveWalletGateway(configuration(), first.toSuiAddress(), message => first.signPersonalMessage(message));
    await saveWalletGateway(configuration(), second.toSuiAddress(), message => second.signPersonalMessage(message));
    await saveVaultConfig(configuration(), crypto.randomUUID());
    storage.setItem('keeva.pending.v1', crypto.randomUUID());
    clearLocalConfiguration();
    expect(hasAnyWalletGateway()).toBe(false); expect(hasProtectedGateway()).toBe(false);
    expect(storage.getItem('keeva.settings.v1')).toBeNull(); expect(storage.getItem('keeva.pending.v1')).not.toBeNull();
  });
});
