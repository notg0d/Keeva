import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { forgetProtectedGateway, hasProtectedGateway, isConfigurationStorageKey, loadVaultConfig, saveVaultConfig, unlockGateway, type VaultConfig } from '../config/vaultConfig';
import { forgetWalletGateway, hasAnyWalletGateway, hasWalletGateway, saveWalletGateway, unlockWalletGateway, type GatewaySigner } from '../config/walletGateway';
import { errorMessage, invariant, VaultError } from '../lib/errors';
import { useConfig } from './ConfigContext';

export type GatewayProtection = 'wallet' | 'passphrase' | 'session';
interface GatewayContextValue {
  walletAddress?: string; savedWallet: boolean; savedAnyWallet: boolean; savedPassphrase: boolean;
  unlockedWallet: boolean; unlockedPassphrase: boolean;
  protection: GatewayProtection | null; busy: boolean; error: string; status: string;
  save: (config: VaultConfig, protection: GatewayProtection, passphrase?: string) => Promise<boolean>;
  unlockWallet: () => Promise<boolean>; unlockPassphrase: (passphrase: string) => Promise<boolean>;
  forget: (protection: 'wallet' | 'passphrase') => void;
}
const GatewayContext = createContext<GatewayContextValue | null>(null);
const withoutSecrets = (config: VaultConfig): VaultConfig => ({ ...config, tatumApiKey: '', memwalPrivateKey: '' });

export function GatewayProvider({ children }: { children: ReactNode }) {
  const { config, setConfig } = useConfig();
  const account = useCurrentAccount();
  const walletAddress = account?.chains.includes('sui:mainnet') ? account.address.toLowerCase() : undefined;
  const signing = useSignPersonalMessage({ gcTime: 0, retry: false });
  const identity = useRef({ address: walletAddress, version: 0 });
  if (identity.current.address !== walletAddress) identity.current = { address: walletAddress, version: identity.current.version + 1 };
  const previousWallet = useRef(walletAddress);
  const mounted = useRef(false);
  const pending = useRef<object | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [protection, setProtection] = useState<GatewayProtection | null>(null);
  const [unlockedWallet, setUnlockedWallet] = useState(false);
  const [unlockedPassphrase, setUnlockedPassphrase] = useState(false);
  const [, refreshStorage] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; identity.current.version++; };
  }, []);
  useEffect(() => {
    if (previousWallet.current && previousWallet.current !== walletAddress) {
      setConfig(withoutSecrets(config)); setProtection(null); setError(''); setStatus(''); setBusy(false); pending.current = null;
      setUnlockedWallet(false); setUnlockedPassphrase(false);
    }
    previousWallet.current = walletAddress;
  }, [walletAddress, config, setConfig]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || !isConfigurationStorageKey(event.key)) return;
      identity.current.version++; pending.current = null; setBusy(false);
      setConfig(withoutSecrets(loadVaultConfig())); setProtection(null); setError('');
      setUnlockedWallet(false); setUnlockedPassphrase(false);
      setStatus('Saved configuration changed in another tab. Unlock the current saved gateways again.');
      refreshStorage((version) => version + 1);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [setConfig]);

  const run = async (operation: (assertActive: () => void) => Promise<VaultConfig>, nextProtection: GatewayProtection) => {
    if (pending.current) return false;
    const token = {}; pending.current = token;
    const version = identity.current.version;
    const address = walletAddress;
    const active = () => mounted.current && version === identity.current.version && address === identity.current.address;
    const assertActive = () => invariant(active(), 'GATEWAY_SESSION_CHANGED', 'The wallet or saved configuration changed. Retry with your current wallet.');
    setBusy(true); setError(''); setStatus('');
    try {
      assertActive();
      const next = await operation(assertActive);
      assertActive();
      setConfig(next); setProtection(nextProtection); refreshStorage((value) => value + 1);
      if (nextProtection === 'wallet') setUnlockedWallet(true);
      if (nextProtection === 'passphrase') setUnlockedPassphrase(true);
      setStatus(nextProtection === 'session' ? 'Gateway settings applied to this session. Existing encrypted copies were kept.' : 'Saved gateway credentials unlocked locally for this session.');
      return true;
    } catch (cause) { if (active()) setError(errorMessage(cause)); return false; }
    finally { if (pending.current === token) { pending.current = null; if (mounted.current) setBusy(false); } }
  };
  const sign: GatewaySigner = async (message) => {
    invariant(account && walletAddress, 'WALLET_REQUIRED', 'Connect the Mainnet wallet you want to use for saved gateways.');
    try { return await signing.mutateAsync({ message, account, chain: 'sui:mainnet' }); }
    catch (cause) {
      if (cause instanceof Error && /reject|declin|cancel/i.test(cause.message)) {
        throw new VaultError('WALLET_DECLINED', 'The wallet request was declined. Your saved gateways were not changed. Retry when you are ready.', { cause });
      }
      throw cause;
    }
    finally { signing.reset(); }
  };
  const save: GatewayContextValue['save'] = (next, mode, passphrase) => run(async (assertActive) => {
    if (mode === 'wallet') {
      invariant(walletAddress, 'WALLET_REQUIRED', 'Connect your Mainnet wallet to save encrypted gateways, or choose device passphrase protection.');
      invariant(!hasWalletGateway(walletAddress) || unlockedWallet, 'GATEWAY_LOCKED',
        'Unlock this wallet’s saved gateways before updating them. If the saved copy cannot be recovered, explicitly forget it first.');
      return saveWalletGateway(next, walletAddress, sign, assertActive);
    }
    if (mode === 'passphrase') invariant(!hasProtectedGateway() || unlockedPassphrase, 'GATEWAY_LOCKED',
      'Unlock your passphrase-protected gateways before updating them. If the saved copy cannot be recovered, explicitly forget it first.');
    if (mode === 'passphrase') invariant(passphrase && passphrase.length >= 14, 'DEVICE_PASSPHRASE', 'Use at least 14 characters for device protection.');
    const saved = await saveVaultConfig(next, mode === 'passphrase' ? passphrase : undefined, assertActive);
    return saved;
  }, mode);
  const unlockWallet = () => run(async (assertActive) => {
    invariant(walletAddress, 'WALLET_REQUIRED', 'Connect the Mainnet wallet used to save your gateways.');
    return unlockWalletGateway(walletAddress, sign, assertActive);
  }, 'wallet');
  const unlockPassphrase = (passphrase: string) => run(async (assertActive) => {
    const secrets = await unlockGateway(passphrase);
    assertActive();
    return { ...config, ...secrets };
  }, 'passphrase');
  const forget: GatewayContextValue['forget'] = (mode) => {
    if (pending.current) return;
    try {
      if (mode === 'wallet') { invariant(walletAddress, 'WALLET_REQUIRED', 'Connect the wallet whose saved gateways you want to forget.'); forgetWalletGateway(walletAddress); setUnlockedWallet(false); }
      else { forgetProtectedGateway(); setUnlockedPassphrase(false); }
      setStatus('Encrypted gateway copy removed from this browser. Vault records were not changed.'); setError('');
      refreshStorage((value) => value + 1); if (mode === protection) setProtection(null);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <GatewayContext.Provider value={{ walletAddress, savedWallet: hasWalletGateway(walletAddress), savedAnyWallet: hasAnyWalletGateway(),
    savedPassphrase: hasProtectedGateway(), unlockedWallet, unlockedPassphrase, protection, busy, error, status, save, unlockWallet, unlockPassphrase, forget }}>{children}</GatewayContext.Provider>;
}

export function useGateway() {
  const context = useContext(GatewayContext);
  if (!context) throw new Error('GatewayProvider is required.');
  return context;
}
