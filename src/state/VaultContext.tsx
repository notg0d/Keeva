import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { configSchema } from '../config/vaultConfig';
import { errorMessage, invariant } from '../lib/errors';
import { secureClipboard } from '../services/clipboardService';
import { VaultStorageService, type UnlockMaterial } from '../services/vaultStorageService';
import type { VaultHeader, VaultSnapshot } from '../types/vault';
import { useConfig } from './ConfigContext';

interface VaultContextValue {
  service: VaultStorageService | null; snapshot: VaultSnapshot | null;
  header: VaultHeader | null | undefined; busy: boolean; error: string; message: string;
  ready: boolean; inspect: () => Promise<void>; lock: () => void;
  open: (material: UnlockMaterial, initialize: boolean) => Promise<void>;
  execute: <T>(operation: (service: VaultStorageService) => Promise<T>, refresh?: boolean) => Promise<T | undefined>;
  setMessage: (message: string) => void;
}
const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const signing = useSignPersonalMessage({ gcTime: 0, retry: false });
  const session = useRef<VaultStorageService | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const [service, setService] = useState<VaultStorageService | null>(null);
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [header, setHeader] = useState<VaultHeader | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const ready = configSchema.safeParse(config).success && !!account?.chains.includes('sui:mainnet');

  const lock = useCallback(() => {
    generation.current++;
    session.current?.lock(); session.current = null;
    pending.current = false;
    setService(null); setSnapshot(null); setHeader(undefined); setBusy(false); setError(''); setMessage('');
    queryClient.getMutationCache().clear();
    void secureClipboard.clear(setMessage);
  }, [queryClient]);

  useEffect(() => { lock(); return () => { session.current?.lock(); session.current = null; }; }, [account?.address, config, lock]);

  useEffect(() => {
    if (!snapshot) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(lock, config.autoLockMinutes * 60_000); };
    const hide = () => { if (document.visibilityState === 'hidden') lock(); };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, reset, { passive: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', lock);
    reset();
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, reset);
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', lock);
    };
  }, [snapshot, config.autoLockMinutes, lock]);

  const getService = () => {
    invariant(ready && account, 'SETUP_REQUIRED', 'Configure the gateways and connect a Mainnet wallet first.');
    if (!session.current) session.current = new VaultStorageService(config, account.address);
    return session.current;
  };

  const execute: VaultContextValue['execute'] = async (operation, refresh = true) => {
    if (pending.current) return undefined;
    const version = generation.current;
    pending.current = true; setBusy(true); setError('');
    try {
      const current = getService();
      const result = await operation(current);
      if (version !== generation.current) return undefined;
      if (refresh && snapshot) {
        const next = await current.synchronize();
        if (version !== generation.current) return undefined;
        setSnapshot(next);
      }
      return result;
    } catch (cause) {
      if (version === generation.current) setError(errorMessage(cause));
      return undefined;
    } finally {
      if (version === generation.current) { pending.current = false; setBusy(false); }
    }
  };

  const inspect = async () => {
    const result = await execute((current) => current.inspect(), false);
    if (result !== undefined) setHeader(result);
  };

  const open = async (material: UnlockMaterial, initialize: boolean) => {
    if (pending.current) return;
    const version = generation.current;
    const result = await execute(async (current) => {
      const sign = async (message: Uint8Array<ArrayBuffer>) => {
        try { return await signing.mutateAsync({ message }); }
        finally { signing.reset(); queryClient.getMutationCache().clear(); }
      };
      return initialize ? current.initialize(material, sign) : current.unlock(material, sign);
    }, false);
    if (version !== generation.current) return;
    if (document.visibilityState !== 'visible') { lock(); return; }
    if (result && session.current) { setSnapshot(result); setService(session.current); }
    else if (!snapshot) { session.current?.lock(); session.current = null; }
  };

  return <VaultContext.Provider value={{ service, snapshot, header, busy, error, message, ready,
    inspect, lock, open, execute, setMessage }}>{children}</VaultContext.Provider>;
}
export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('VaultProvider is required.');
  return context;
}
