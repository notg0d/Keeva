import { useEffect, useRef, useState } from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Database, KeyRound, LoaderCircle, LockKeyhole, Pause, Play, ShieldCheck, Shuffle } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { useConfig } from '../state/ConfigContext';
import { configSchema } from '../config/vaultConfig';
import NetworkCards from './NetworkCards';
import Brand from './Brand';
import HeroTrail from './HeroTrail';
import { useReducedMotion } from '../state/useReducedMotion';

export default function Initialization({ openSettings }: { openSettings: () => void }) {
  const { ready, inspect, header, busy, open, execute, setMessage, error: vaultError, message } = useVault();
  const hero = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [particlesPaused, setParticlesPaused] = useState(false);
  const [particlePattern, setParticlePattern] = useState(0);
  const account = useCurrentAccount();
  const { config } = useConfig();
  const configured = configSchema.safeParse(config).success;
  const connected = !!account?.chains.includes('sui:mainnet');
  const [method, setMethod] = useState<'passphrase' | 'wallet'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (header) setMethod(header.kdf.method); }, [header]);
  return <div className="landing">
    <a className="skip-link" href="#vault-access">Skip to vault login</a>
    <main className="login-page" id="main-content" tabIndex={-1}>
    <section className="login-hero" ref={hero} aria-labelledby="hero-title">
      <HeroTrail hero={hero} paused={particlesPaused} pattern={particlePattern} />
      <header className="hero-header"><Brand /><span className="hero-header-note eyebrow">A LITTLE LESS WORRY. A LOT MORE YOURS.</span>
        <nav aria-label="Welcome navigation"><a href="#privacy" className="hero-nav-link">The Keeva way<ArrowUpRight size={14} /></a><a className="hero-entry" href="#vault-access">Open vault<ArrowUpRight size={17} /></a></nav>
      </header>
      <div className="hero-content">
      <div className="hero-intro">
        <div className="hero-kicker eyebrow"><span />YOUR DIGITAL LIFE, HELD CLOSE.</div>
        <h1 id="hero-title">Your life.<br /><span>Your keys.</span></h1>
        <div className="hero-story">
          <a href="#privacy" className="logo-fan" aria-label="Encrypted locally. Stored on Walrus. Explore Keeva privacy.">
            <span className="fan-card fan-card-back" aria-hidden="true"><Database size={22} /></span>
            <span className="fan-card fan-card-middle" aria-hidden="true"><KeyRound size={22} /></span>
            <span className="fan-card fan-card-front"><img src="/keeva-logo.webp" alt="Keeva’s folded-ribbon padlock" width={752} height={752} /></span>
          </a>
          <div className="hero-description"><p>A private home for your passwords, API keys, and notes. Encrypted on your device. Yours to unlock.</p>
            <a href="#privacy" className="hero-text-link">Privacy, by design<ArrowRight size={16} /></a></div>
        </div>
      </div>
      <section className="setup-card" id="vault-access" tabIndex={-1} aria-labelledby="setup-title" data-pointer-quiet>
      <div className="card-topline"><span className="eyebrow">WELCOME TO YOUR PRIVATE SPACE</span><LockKeyhole size={17} /></div>
      <h2 id="setup-title">Secure Vault<br /> Initialization</h2><p className="muted small">A little setup. A space that’s entirely yours.</p>
      {!window.isSecureContext && <p className="error" role="alert">Open Keeva over HTTPS or localhost to enable browser cryptography and protected clipboard access.</p>}
      {vaultError && <div role="alert" className="notice error">{vaultError}</div>}
      {message && <div className="notice feedback-notice"><span role="status">{message}</span><button className="text-button" onClick={() => setMessage('')}>Dismiss</button></div>}
      <ol className="setup-steps">
        <li className={configured ? 'complete' : 'current'}><span className="step-number">{configured ? <Check size={15} /> : '01'}</span><div><h3>Configure your gateways</h3><p>Tatum API and your Walrus Memory account.</p>
          <button className={configured ? 'text-button' : 'primary hero-action'} onClick={openSettings}>{configured ? 'Edit gateway configuration' : 'Configure gateways'}<ArrowUpRight size={16} /></button></div></li>
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
    <div className="setup-caption"><LockKeyhole size={12} /><span>YOUR MASTER KEY STAYS WITH YOU</span></div>
    </section>
    </div>
    <div className="hero-bottom"><span className="eyebrow">PASSWORDS / API KEYS / PRIVATE NOTES</span><a href="#privacy">A little peace of mind<ArrowDown size={16} /></a>
      {!reduce && <div className="hero-field-controls" role="group" aria-label="Particle animation">
        <button type="button" onClick={() => { setParticlesPaused(false); setParticlePattern((current) => current + 1); }} title="Reshape the vibrating particle field"><Shuffle size={13} />Shift the pattern</button>
        <button type="button" className="field-pause" onClick={() => setParticlesPaused((current) => !current)} aria-label={particlesPaused ? 'Resume particle animation' : 'Pause particle animation'} title={particlesPaused ? 'Resume animation' : 'Pause animation'}>{particlesPaused ? <Play size={13} /> : <Pause size={13} />}</button>
      </div>}
    </div>
    </section>
    <section className="privacy-section" id="privacy" aria-labelledby="privacy-title">
      <div className="privacy-heading"><span className="eyebrow">01 / THE KEEVA WAY</span><h2 id="privacy-title">Keep the keys.<br /><span>Lose the noise.</span></h2><p>Your private life deserves a private space. Keeva brings your essentials together, with encryption that starts right where you are.</p></div>
      <div className="privacy-principles">
        <article><span className="principle-number">01 —</span><KeyRound size={27} strokeWidth={1.25} /><h3>Private from the start.</h3><p>Your credentials are encrypted in your browser before they leave your device. Your master key stays local.</p></article>
        <article><span className="principle-number">02 —</span><Database size={27} strokeWidth={1.25} /><h3>A home beyond one server.</h3><p>Encrypted records live on Walrus. Your Sui wallet authorizes access to the memory account you own.</p></article>
        <article><span className="principle-number">03 —</span><ShieldCheck size={27} strokeWidth={1.25} /><h3>Less trust. More clarity.</h3><p>Search locally, review credential health, and inspect storage receipts. See what’s happening to your vault.</p></article>
      </div>
      <div className="connection-heading"><span className="eyebrow">02 / UNDER THE SURFACE</span><span className="small muted">Connection readings appear when available.</span></div>
      <div className="bento-grid landing-network">
        <article className="panel bento-card encryption-card"><div className="card-topline"><span className="icon-tile secure"><ShieldCheck size={18} /></span><span className="eyebrow">ENCRYPTION STANDARD</span></div>
          <div className="metric-value">AES-256<span className="metric-unit">GCM</span></div><p className="muted small">Authenticated encryption. Master keys stay in your browser.</p><div className="card-footnote"><LockKeyhole size={13} />Non-extractable keys</div></article>
        <NetworkCards />
      </div>
    </section>
    </main>
    <footer className="landing-footer"><div><span className="eyebrow">A SPACE THAT’S ENTIRELY YOURS.</span><a href="#vault-access">Make yourself at home<ArrowUpRight size={20} /></a></div>
      <span className="footer-wordmark" aria-hidden="true">keeva</span><div className="landing-footer-bottom"><span>Keeva · Your life. Your keys.</span><span>Client-encrypted. Wallet-authorized.</span><a href="#main-content">Back to top<ArrowUpRight size={14} /></a></div></footer>
  </div>;
}
