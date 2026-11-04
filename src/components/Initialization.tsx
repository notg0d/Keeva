import { useEffect, useState } from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { ArrowRight, Check, Database, Fingerprint, KeyRound, LoaderCircle, LockKeyhole, Settings2, ShieldCheck, Wallet } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { useConfig } from '../state/ConfigContext';
import { configSchema } from '../config/vaultConfig';
import NetworkCards from './NetworkCards';
import { PageTransition } from './Motion';

export default function Initialization({ openSettings }: { openSettings: () => void }) {
  const { ready, inspect, header, busy, open, execute, setMessage } = useVault();
  const account = useCurrentAccount();
  const { config } = useConfig();
  const configured = configSchema.safeParse(config).success;
  const connected = !!account?.chains.includes('sui:mainnet');
  const [method, setMethod] = useState<'passphrase' | 'wallet'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (header) setMethod(header.kdf.method); }, [header]);
  return <PageTransition><section className="initialization">
    <div className="page-heading"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h1>Secure Vault Initialization</h1>
      <p className="muted">A little setup. A space that’s entirely yours.</p></div><span className="badge"><LockKeyhole size={13} />Vault locked</span></div>
    {!window.isSecureContext && <p className="error" role="alert">Open Keeva over HTTPS or localhost to enable browser cryptography and protected clipboard access.</p>}
    <div className="bento-grid setup-grid">
    <article className="panel privacy-card">
      <div className="card-topline"><span className="eyebrow secure">PRIVATE BY DESIGN</span><Fingerprint size={20} className="secure" /></div>
      <h2>Your digital life.<br /><span>Under your key.</span></h2>
      <p className="privacy-description">One place for passwords, API keys, and private notes. Encrypted on your device. Stored across Walrus.</p>
      <div className="vault-illustration" aria-hidden="true"><div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
        <div className="orbit-node node-key"><KeyRound size={19} /></div><div className="orbit-node node-storage"><Database size={18} /></div>
        <div className="vault-core"><div><Fingerprint size={54} strokeWidth={1.2} /></div></div><span className="illustration-caption">YOUR DEVICE · YOUR MASTER KEY</span></div>
      <div className="privacy-features"><span><ShieldCheck size={15} />Local encryption</span><span><Wallet size={15} />Wallet authorization</span><span><Database size={15} />Distributed storage</span></div>
    </article>
    <section className="panel setup-card" aria-labelledby="setup-title">
      <div className="card-topline"><span className="eyebrow">LET’S GET YOU SET UP</span><span className="mono small muted">{Number(configured) + Number(connected)} / 3</span></div>
      <h2 id="setup-title">Your vault starts here</h2><p className="muted small">Connect your infrastructure, then authorize access.</p>
      <ol className="setup-steps">
        <li className={configured ? 'complete' : 'current'}><span className="step-number">{configured ? <Check size={15} /> : '01'}</span><div><h3>Configure your gateways</h3><p>Tatum RPC and your Walrus Memory account.</p>
          <button className={configured ? 'text-button' : 'primary'} onClick={openSettings}><Settings2 size={15} />{configured ? 'Edit gateway configuration' : 'Configure gateways'}<ArrowRight size={14} /></button></div></li>
        <li className={connected ? 'complete' : configured ? 'current' : ''}><span className="step-number">{connected ? <Check size={15} /> : '02'}</span><div><h3>Connect your Sui wallet</h3><p>The wallet that owns your memory account.</p><ConnectButton /></div></li>
        <li className={ready ? 'current' : ''}><span className="step-number">03</span><div><h3>Open your private vault</h3><p>{ready ? 'Inspect storage to unlock or initialize your vault.' : 'Your unlock options appear after connection.'}</p>
          {!ready && <span className="small muted inline-icon"><LockKeyhole size={12} />Awaiting gateway and wallet setup</span>}
          {ready && <button disabled={busy} onClick={() => void inspect()}>Inspect existing vault<ArrowRight size={14} /></button>}</div></li>
      </ol>
    {account && !account.chains.includes('sui:mainnet') && <p className="error">Select a wallet account that supports Sui Mainnet.</p>}
    {ready && <div className="setup-recovery"><button className="text-button" disabled={busy} onClick={() => void execute(async (service) => {
        const result = await service.restoreVaultIndex();
        setMessage(`Restored ${result.restored} indexed records across ${result.namespaces} discovered namespaces. ${result.failed} failed. ${result.truncated ? 'Further recovery is required.' : 'Inspect the vault to check availability.'}`);
       }, false)}>Restore storage index<ArrowRight size={13} /></button></div>}
    {ready && header !== undefined && <form onSubmit={(event) => {
      event.preventDefault(); setError('');
      if (!header && method === 'passphrase' && passphrase !== confirmation) { setError('The master passphrases do not match.'); return; }
      const material = method === 'wallet' ? { method } as const : { method, passphrase } as const;
      setPassphrase(''); setConfirmation(''); void open(material, !header);
    }}>
      <h2>{header ? 'Unlock encrypted vault' : 'Create encrypted vault'}</h2>
      {!header && <p className="muted">No indexed header was found. Restore first if this namespace held an existing vault. Creation commits an encrypted header to Walrus.</p>}
      <fieldset disabled={busy}>
        <label>Master key source<select value={method} disabled={!!header} onChange={(event) => setMethod(event.target.value as typeof method)}>
          <option value="passphrase">Master passphrase + wallet authorization</option><option value="wallet">Private wallet signature · Ed25519</option>
        </select></label>
        {method === 'passphrase' ? <>
          <label>Master passphrase<input type="password" autoComplete={header ? 'current-password' : 'new-password'} required
            minLength={header ? 1 : 14} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label>
          {!header && <label>Confirm master passphrase<input type="password" autoComplete="new-password" required value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)} /></label>}
        </> : <p className="muted">Your wallet signs a vault-specific key-derivation message. That signature is private unlock material and is never sent to storage.</p>}
        <p className="muted">Keep your unlock material available. Keeva cannot recover a lost master key.</p>
        <button className="primary" type="submit">{header ? 'Authorize & unlock vault' : 'Authorize & initialize vault'}</button>
      </fieldset>
    </form>}
    {busy && <p className="loading-state" role="status"><LoaderCircle size={16} className="spin" />Waiting for wallet, cryptography, or storage operations…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    </section>
    <article className="panel bento-card encryption-card"><div className="card-topline"><span className="icon-tile secure"><ShieldCheck size={18} /></span><span className="eyebrow">ENCRYPTION STANDARD</span></div>
      <div className="metric-value">AES-256<span className="metric-unit">GCM</span></div><p className="muted small">Authenticated encryption. Master keys stay in your browser.</p><div className="card-footnote"><LockKeyhole size={13} />Non-extractable keys</div></article>
    <NetworkCards />
    </div>
  </section></PageTransition>;
}
