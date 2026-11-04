import { useEffect, useRef, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Settings2, X } from 'lucide-react';
import { configSchema, hasProtectedGateway, saveVaultConfig, unlockGateway, type VaultConfig } from '../config/vaultConfig';
import { errorMessage } from '../lib/errors';
import { testVaultConnectivity } from '../services/memwalGateway';
import { useConfig } from '../state/ConfigContext';
import { useVault } from '../state/VaultContext';

const fields: Array<{ key: keyof Pick<VaultConfig, 'tatumApiKey' | 'memwalPrivateKey' | 'memwalAccountId' | 'memwalAgentId' | 'memwalServerUrl' | 'memwalNamespace'>; label: string; secret?: boolean }> = [
  { key: 'tatumApiKey', label: 'Tatum API key', secret: true },
  { key: 'memwalPrivateKey', label: 'MemWal delegate private key', secret: true },
  { key: 'memwalAccountId', label: 'Walrus Memory Account Object ID' },
  { key: 'memwalAgentId', label: 'Active Agent ID · delegate public key' },
  { key: 'memwalServerUrl', label: 'Walrus relayer URL' },
  { key: 'memwalNamespace', label: 'Vault namespace' },
];

export default function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { config, setConfig } = useConfig();
  const { lock } = useVault();
  const account = useCurrentAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(config);
  const [devicePassphrase, setDevicePassphrase] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setStatus('');
    try { await operation(); } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const validate = (): VaultConfig | null => {
    const parsed = configSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(' ')); return null; }
    return parsed.data;
  };

  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="section-heading"><h2 id="settings-title"><Settings2 size={20} />Vault &amp; Gateway Settings</h2>
      <button type="button" aria-label="Close settings" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <p className="muted">Configure your Mainnet account and its authorized delegate. Vault encryption keys remain in the browser.</p>
    <form onSubmit={(event) => { event.preventDefault(); const parsed = validate(); if (!parsed) return;
      void run(async () => { const saved = await saveVaultConfig(parsed, remember ? devicePassphrase : undefined);
        lock(); setConfig(saved); setDevicePassphrase(''); onClose(); }); }}>
      <fieldset disabled={busy}>
        {hasProtectedGateway() && <section className="inset">
          <label>Device protection passphrase<input type="password" autoComplete="off" value={devicePassphrase} onChange={(event) => setDevicePassphrase(event.target.value)} /></label>
          <button type="button" onClick={() => void run(async () => {
            const secrets = await unlockGateway(devicePassphrase); setDraft({ ...draft, ...secrets }); setStatus('Saved gateway credentials decrypted locally.');
          })}>Unlock saved gateway credentials</button>
        </section>}
        {fields.map(({ key, label, secret }) => <label key={key}>{label}
          <input type={secret ? 'password' : key === 'memwalServerUrl' ? 'url' : 'text'} autoComplete="off" spellCheck={false}
            value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value.trim() })} required />
        </label>)}
        <label>Automatic lock after inactivity · minutes<input type="number" min={1} max={60} value={draft.autoLockMinutes}
          onChange={(event) => setDraft({ ...draft, autoLockMinutes: Number(event.target.value) })} /></label>
        <label>Recognized audit event types · one per line<textarea rows={3} value={draft.auditEventTypes.join('\n')}
          onChange={(event) => setDraft({ ...draft, auditEventTypes: event.target.value.split('\n').filter(Boolean) })} spellCheck={false} /></label>
        <p className="muted">Use full package::module::Event types from your deployed contracts. Transaction signatures and event recognition are reported separately.</p>
        <label className="check-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Encrypt gateway credentials on this device</label>
        {remember && <label>Device protection passphrase · at least 14 characters<input type="password" autoComplete="new-password" minLength={14}
          required value={devicePassphrase} onChange={(event) => setDevicePassphrase(event.target.value)} /></label>}
        <p className="muted">Public settings are saved locally. Gateway secrets stay in this session unless device encryption is enabled. The device passphrase is separate from the master vault passphrase.</p>
        <div className="actions"><button type="button" onClick={() => {
          const parsed = validate(); if (!parsed) return;
          void run(async () => { const result = await testVaultConnectivity(parsed, account?.address);
            setStatus(`Mainnet verified · epoch ${result.telemetry.epoch} · Walrus ${result.health.status} · delegate authorized for ${result.owner}`); });
        }}>Test Vault Connectivity</button><button className="primary" type="submit">Save configuration</button></div>
      </fieldset>
    </form>
    {busy && <p role="status">Processing gateway configuration…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {status && <p className="success wrap" role="status">{status}</p>}
  </dialog>;
}
