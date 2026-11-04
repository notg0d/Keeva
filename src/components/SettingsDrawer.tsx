import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../state/useReducedMotion';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { ArrowRight, LoaderCircle, LockKeyhole, Settings2, X } from 'lucide-react';
import { spring } from './Motion';
import { configSchema, gatewaySettingsSchema, type VaultConfig } from '../config/vaultConfig';
import { errorMessage } from '../lib/errors';
import { testVaultConnectivity } from '../services/memwalGateway';
import { TatumSuiClient } from '../services/tatumSuiClient';
import { useConfig } from '../state/ConfigContext';
import { useVault } from '../state/VaultContext';
import SettingsHelp, { type SettingsHelpContent } from './SettingsHelp';
import GatewayUnlock from './GatewayUnlock';
import GatewayWalletConnect from './GatewayWalletConnect';
import { useGateway, type GatewayProtection } from '../state/GatewayContext';

const walrusSetupUrl = 'https://memory.walrus.xyz/';
const delegateGuideUrl = 'https://docs.wal.app/walrus-memory/contract/delegate-key-management';
const tatumSuiGuideUrl = 'https://docs.tatum.io/reference/rpc-sui';
const fields: Array<{ key: keyof Pick<VaultConfig, 'tatumRpcUrl' | 'tatumApiKey' | 'memwalPrivateKey' | 'memwalAccountId' | 'memwalAgentId' | 'memwalServerUrl' | 'memwalNamespace'>; label: string; secret?: boolean; help: SettingsHelpContent }> = [
  { key: 'tatumRpcUrl', label: 'Tatum endpoint URL · Sui Mainnet', help: {
    text: 'Copy the full Sui Mainnet URL from Tatum for your selected interface. Keep the API key in its separate field, not in the URL.',
    links: [{ href: 'https://dashboard.tatum.io/chains/sui', label: 'Get a Sui endpoint' },
      { href: 'https://dashboard.tatum.io/gateways', label: 'Manage Tatum gateways' }],
  } },
  { key: 'tatumApiKey', label: 'Tatum API key', secret: true, help: {
    text: 'Sign in to Tatum and copy the Mainnet API key authorized for your gateway.',
    links: [{ href: 'https://dashboard.tatum.io/api-keys', label: 'Get your Tatum API key' },
      { href: 'https://docs.tatum.io/docs/compromised-auth-api-keys', label: 'API key guide' }],
  } },
  { key: 'memwalPrivateKey', label: 'MemWal delegate private key', secret: true, help: {
    text: 'Create and register an Ed25519 delegate for your Walrus Memory account. Enter its 64-character hex private key, not your Sui wallet private key.',
    links: [{ href: walrusSetupUrl, label: 'Set up a delegate key' },
      { href: delegateGuideUrl, label: 'Delegate key guide' }],
  } },
  { key: 'memwalAccountId', label: 'Walrus Memory Account Object ID', help: {
    text: 'Set up Walrus Memory with the same Mainnet wallet you will connect in Keeva. Copy your memory account object ID, not your wallet address.',
    links: [{ href: walrusSetupUrl, label: 'Get your memory account ID' },
      { href: 'https://docs.wal.app/walrus-memory/getting-started/quick-start#generate-your-account-id-and-delegate-key', label: 'Account setup guide' }],
  } },
  { key: 'memwalAgentId', label: 'Active Agent ID · delegate public key', help: {
    text: 'Use the same registered delegate’s 32-byte public key in hex. This is your Agent ID, not its Sui address.',
    links: [{ href: delegateGuideUrl + '#1-generate-a-delegate-keypair', label: 'Find the delegate public key' }],
  } },
  { key: 'memwalServerUrl', label: 'Walrus relayer URL', help: {
    text: 'Keep the prefilled Mainnet relayer, or obtain an HTTPS URL from your relayer operator. It must serve your memory account’s deployment.',
    links: [{ href: 'https://docs.wal.app/walrus-memory/relayer/public-relayer#walrus-foundation-hosted-endpoints', label: 'Find Mainnet relayer URLs' },
      { href: 'https://docs.wal.app/walrus-memory/relayer/self-hosting', label: 'Self-hosting guide' }],
  } },
  { key: 'memwalNamespace', label: 'Vault namespace', help: {
    text: 'Choose your own name using letters, digits, underscores, or hyphens. Keep the existing namespace when reopening or restoring a vault; no provider issues this value.',
    links: [{ href: 'https://docs.wal.app/walrus-memory/fundamentals/concepts/memory-space#namespace', label: 'Namespace guide' }],
  } },
];

export default function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { config } = useConfig();
  const { lock } = useVault();
  const gateway = useGateway();
  const account = useCurrentAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(config);
  const [devicePassphrase, setDevicePassphrase] = useState('');
  const [protection, setProtection] = useState<GatewayProtection>(() => gateway.protection ?? (gateway.savedWallet || !gateway.savedPassphrase ? 'wallet' : 'passphrase'));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const reduce = useReducedMotion();
  const close = () => setClosing(true);
  const working = busy || gateway.busy;

  useEffect(() => { setDraft(config); setDevicePassphrase(''); }, [config]);
  useEffect(() => { if (gateway.protection) setProtection(gateway.protection); }, [gateway.protection]);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, []);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setStatus('');
    try { await operation(); } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const validate = (complete = true): VaultConfig | null => {
    const parsed = (complete ? configSchema : gatewaySettingsSchema).safeParse({ ...draft, auditEventTypes: draft.auditEventTypes.map((type) => type.trim()).filter(Boolean) });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(' ')); return null; }
    return parsed.data;
  };

  return <motion.dialog ref={dialog} className="settings-dialog" data-lenis-prevent data-closing={closing} aria-labelledby="settings-title"
    initial={{ x: reduce ? 0 : '100%', opacity: reduce ? 0 : 1 }} animate={{ x: closing && !reduce ? '100%' : 0, opacity: closing ? 0 : 1 }}
    transition={reduce ? { duration: 0 } : spring} onAnimationComplete={() => { if (closing) onClose(); }}
    onCancel={(event) => { event.preventDefault(); if (!working) close(); }}>
    <div className="drawer-heading"><span className="icon-tile"><Settings2 size={20} /></span><div><span className="eyebrow">WORKSPACE CONFIGURATION</span><h2 id="settings-title">Vault &amp; Gateway Settings</h2></div>
      <button className="icon-button" type="button" aria-label="Close settings" disabled={working} onClick={close}><X size={18} /></button></div>
    <p className="muted">Configure your Mainnet account and its authorized delegate. Vault encryption keys remain in the browser.</p>
    <form onSubmit={(event) => { event.preventDefault(); const parsed = validate(false); if (!parsed) return;
      void gateway.save(parsed, protection, devicePassphrase).then((saved) => {
        if (saved) { lock(); setDevicePassphrase(''); close(); }
      }); }}>
      <fieldset disabled={working}>
        <GatewayUnlock />
        <div className="form-section-label">01 <span>Gateway connection</span></div>
        <div className="settings-field"><label htmlFor="setting-tatumApiType">Tatum interface</label>
        <select id="setting-tatumApiType" aria-describedby="help-tatumApiType" value={draft.tatumApiType} onChange={(event) => setDraft({ ...draft, tatumApiType: event.target.value as VaultConfig['tatumApiType'] })}>
          <option value="graphql">GraphQL</option><option value="json-rpc">JSON-RPC</option>
        </select>
        <SettingsHelp id="help-tatumApiType" text={draft.tatumApiType === 'graphql'
          ? 'Enter the full Sui Mainnet GraphQL endpoint URL, including /graphql when provided by Tatum, and your API key.'
          : 'Enter a Sui Mainnet endpoint that advertises JSON-RPC methods, and your API key.'}
          links={[{ href: tatumSuiGuideUrl, label: 'Tatum Sui interface guide' }]} /></div>
        {fields.map(({ key, label, secret, help }) => <div className="settings-field" key={key}>
          <label htmlFor={`setting-${key}`}><span className="inline-icon">{label}{secret && <LockKeyhole size={12} className="muted" aria-hidden="true" />}</span></label>
          <input id={`setting-${key}`} aria-describedby={`help-${key}`} type={secret ? 'password' : key === 'memwalServerUrl' || key === 'tatumRpcUrl' ? 'url' : 'text'} autoComplete="off" spellCheck={false}
            value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value.trim() })} />
          <SettingsHelp id={`help-${key}`} {...help} />
        </div>)}
        <p className="muted">Tatum requests run through Keeva’s backend using this endpoint and key. The key is used per request and is not stored on the server.</p>
        <p className="muted">You can save your keys before every gateway field is complete. Connectivity checks and vault access still require the complete setup.</p>
        <button type="button" onClick={() => {
          const parsed = configSchema.pick({ tatumApiType: true, tatumRpcUrl: true, tatumApiKey: true }).safeParse({
            tatumApiType: draft.tatumApiType, tatumRpcUrl: draft.tatumRpcUrl, tatumApiKey: draft.tatumApiKey,
          });
          if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(' ')); return; }
          void run(async () => {
            const { tatumApiKey, tatumRpcUrl, tatumApiType } = parsed.data;
            const telemetry = await new TatumSuiClient(tatumApiKey, tatumRpcUrl, tatumApiType).getNetworkTelemetry();
            if (telemetry.endpoint) setDraft((current) => ({ ...current, tatumRpcUrl: telemetry.endpoint! }));
            setStatus(`Tatum backend connected · Sui Mainnet · epoch ${telemetry.epoch} · checkpoint ${telemetry.checkpointHeight}. Using ${telemetry.endpoint ?? tatumRpcUrl}. Save configuration to apply these settings.`);
          });
        }}>Test Tatum connection</button>
        <div className="form-section-label">02 <span>Session &amp; audit preferences</span></div>
        <div className="settings-field"><label htmlFor="setting-autoLockMinutes">Automatic lock after inactivity · minutes</label>
          <input id="setting-autoLockMinutes" aria-describedby="help-autoLockMinutes" type="number" min={1} max={60} value={draft.autoLockMinutes}
            onChange={(event) => setDraft({ ...draft, autoLockMinutes: Number(event.target.value) })} />
          <SettingsHelp id="help-autoLockMinutes" text="Choose a local inactivity timeout from 1 to 60 minutes. No provider configuration is needed." /></div>
        <div className="settings-field"><label htmlFor="setting-auditEventTypes">Recognized audit event types · one per line</label>
          <textarea id="setting-auditEventTypes" aria-describedby="help-auditEventTypes" rows={3} value={draft.auditEventTypes.join('\n')}
            onChange={(event) => setDraft({ ...draft, auditEventTypes: event.target.value.split('\n') })} spellCheck={false} />
          <SettingsHelp id="help-auditEventTypes" text="Copy full package::module::Event types from your deployed contracts or their transaction events. Leave blank if you have none. Transaction signatures and event recognition are reported separately."
            links={[{ href: 'https://docs.sui.io/guides/developer/sui-101/using-events', label: 'Find Sui event types' }]} /></div>
        <div className="form-section-label">03 <span>Remember your gateways</span></div>
        <div className="settings-field"><label htmlFor="setting-gatewayProtection">Save API key and delegate key</label>
          <select id="setting-gatewayProtection" aria-describedby="help-gatewayProtection" value={protection} onChange={(event) => {
            setProtection(event.target.value as GatewayProtection); setDevicePassphrase('');
          }}>
            <option value="wallet">Encrypted · unlock with wallet</option>
            <option value="passphrase">Encrypted · unlock with passphrase</option>
            <option value="session">This session only</option>
          </select>
          <SettingsHelp id="help-gatewayProtection" text={protection === 'wallet'
            ? 'Enter your keys once. Save with your Mainnet wallet, then approve a private message after refresh to restore them. Requires deterministic Ed25519 signatures; your signature stays private and is never stored or sent to a server.'
            : protection === 'passphrase' ? 'Save encrypted keys under a separate device passphrase. After refresh, enter only this passphrase, not your API or delegate keys.'
            : 'Keys remain in memory until refresh. Existing encrypted copies are kept unless you explicitly forget them below.'} />
        </div>
        {protection === 'wallet' && <div className="gateway-wallet-choice">
          {gateway.walletAddress ? <p className="muted wrap">Saved configuration will be bound to wallet {gateway.walletAddress}.</p>
            : <><p className="muted">Connect the Mainnet wallet you want to recognize on your next visit.</p><GatewayWalletConnect /></>}
        </div>}
        {protection === 'passphrase' && <label>Device protection passphrase · at least 14 characters<input type="password" autoComplete="new-password" minLength={14}
          required value={devicePassphrase} onChange={(event) => setDevicePassphrase(event.target.value)} /></label>}
        <p className="muted">Public settings are saved locally. Only encrypted gateway keys are retained. Master vault keys and decrypted vault contents are never saved. Device protection does not unlock your vault.</p>
        {(gateway.savedWallet || gateway.savedPassphrase) && <div className="actions gateway-forget">
          {gateway.savedWallet && <button className="text-button" type="button" onClick={() => {
            if (window.confirm('Forget the encrypted gateway configuration saved for this wallet on this browser? Vault records will not be changed.')) gateway.forget('wallet');
          }}>Forget this wallet’s saved gateways</button>}
          {gateway.savedPassphrase && <button className="text-button" type="button" onClick={() => {
            if (window.confirm('Forget the gateway credentials protected by your device passphrase on this browser? Vault records will not be changed.')) gateway.forget('passphrase');
          }}>Forget passphrase-protected gateways</button>}
        </div>}
        <div className="actions"><button type="button" onClick={() => {
          const parsed = validate(); if (!parsed) return;
           void run(async () => { const result = await testVaultConnectivity(parsed, account?.address);
            if (result.telemetry.endpoint) setDraft((current) => ({ ...current, tatumRpcUrl: result.telemetry.endpoint! }));
            setStatus(`Mainnet verified · epoch ${result.telemetry.epoch} · Walrus ${result.health.status} · delegate authorized for ${result.owner}. Save configuration to apply these settings.`); });
        }}>Test Vault Connectivity</button><button className="primary" type="submit">Save configuration<ArrowRight size={15} /></button></div>
      </fieldset>
    </form>
    {busy && <p className="loading-state" role="status"><LoaderCircle size={16} className="spin" />Processing gateway configuration…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {status && <p className="success wrap" role="status">{status}</p>}
  </motion.dialog>;
}
