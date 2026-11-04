import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { generatePassword, type PasswordRules } from '../crypto/passwordGenerator';
import { errorMessage } from '../lib/errors';
import { passwordStrength } from '../services/securityAuditService';
import { useVault } from '../state/VaultContext';
import type { Credential, CredentialInput } from '../types/vault';

export default function CredentialComposer({ credential, onDone }: { credential?: Credential; onDone: () => void }) {
  const { execute, busy, setMessage } = useVault();
  const [form, setForm] = useState<CredentialInput>({ kind: credential?.kind ?? 'login', siteName: credential?.siteName ?? '',
    username: credential?.username ?? '', password: credential?.password ?? '', notes: credential?.notes ?? '',
    category: credential?.category ?? '', lastRotated: credential?.lastRotated ?? new Date().toISOString() });
  const [rules, setRules] = useState<PasswordRules>({ length: 24, lowercase: true, uppercase: true, digits: true, symbols: true });
  const [show, setShow] = useState(false);
  const [entropy, setEntropy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const strength = passwordStrength(form.password, [form.siteName, form.username]);
  const update = <K extends keyof CredentialInput>(key: K, value: CredentialInput[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  return <section><div className="page-heading"><div><span className="eyebrow">MAKE ROOM FOR SOMETHING PRIVATE</span><h1>{credential ? 'Update encrypted item' : 'Create encrypted item'}</h1>
    <p className="muted">A safer home for your digital essentials.</p></div><button onClick={onDone}><ArrowLeft size={15} />Back to vault</button></div>
    <div className="composer-layout"><div className="panel composer"><div className="card-topline"><span className="icon-tile secure"><KeyRound size={19} /></span><h2>Credential details</h2><span className="badge secure"><LockKeyhole size={12} />Local encryption</span></div>
    <form onSubmit={(event) => {
      event.preventDefault(); setError(''); setShow(false);
      void execute((service) => service.storeEncryptedCredential(form, credential ? { id: credential.id, revision: credential.revision } : undefined)).then((result) => {
        if (!result) return;
        setForm({ ...form, password: '', notes: '', username: '' });
        setMessage('Encrypted credential and audit record committed to Walrus.'); onDone();
      });
    }}>
      <fieldset disabled={busy}>
        <div className="form-grid"><label>Item type<select value={form.kind} onChange={(event) => update('kind', event.target.value as CredentialInput['kind'])}>
          <option value="login">Login credential</option><option value="api-key">API key</option><option value="note">Secure note</option>
        </select></label><label>Category<input required maxLength={80} value={form.category} onChange={(event) => update('category', event.target.value)} autoComplete="off" /></label></div>
        <label>Site or item name<input required maxLength={160} value={form.siteName} onChange={(event) => update('siteName', event.target.value)} autoComplete="off" /></label>
        {form.kind !== 'note' && <>
          <label>Username or account<input maxLength={320} value={form.username} onChange={(event) => update('username', event.target.value)} autoComplete="off" /></label>
          <label>{form.kind === 'api-key' ? 'API key' : 'Password'}<div className="input-action"><input type={show ? 'text' : 'password'} required maxLength={4096} autoComplete="new-password"
            spellCheck={false} value={form.password} onChange={(event) => { setEntropy(null); setForm({ ...form, password: event.target.value, lastRotated: new Date().toISOString() }); }} />
            <button type="button" aria-label={show ? 'Hide secret' : 'Show secret'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <div className="strength-track" aria-hidden="true">{[0, 1, 2, 3, 4].map((level) => <span key={level} className={form.password && level <= strength.score ? strength.weak ? 'strength-warning' : 'strength-secure' : ''} />)}</div>
          <p className={`small ${!form.password ? 'muted' : strength.weak ? 'warning' : 'secure'}`}>{!form.password ? 'Enter a secret to calculate its resistance.' : `Resistance: ${['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][strength.score]}`}
            {form.password && entropy !== null && ` · ${Math.floor(entropy)} bits of generated entropy`}</p>
          <details className="inset"><summary>Cryptographic password generator</summary>
            <label>Length<input type="number" min={8} max={128} value={rules.length} onChange={(event) => setRules({ ...rules, length: Number(event.target.value) })} /></label>
            <div className="actions">{(['lowercase', 'uppercase', 'digits', 'symbols'] as const).map((name) =>
              <label className="check-label" key={name}><input type="checkbox" checked={rules[name]} onChange={(event) => setRules({ ...rules, [name]: event.target.checked })} />{name}</label>)}</div>
            <button type="button" onClick={() => { try {
              const generated = generatePassword(rules); setEntropy(generated.entropyBits);
              setForm({ ...form, password: generated.password, lastRotated: new Date().toISOString() }); setError('');
            } catch (cause) { setError(errorMessage(cause)); } }}><RefreshCw size={16} />Generate password</button>
          </details>
          <label>Last rotated<input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.lastRotated.slice(0, 10)}
            onChange={(event) => { if (event.target.value) update('lastRotated', new Date(`${event.target.value}T00:00:00.000Z`).toISOString()); }} /></label>
        </>}
        <label>Secure notes<textarea rows={5} required={form.kind === 'note'} maxLength={12_000} value={form.notes} onChange={(event) => update('notes', event.target.value)} autoComplete="off" /></label>
        <div className="actions form-actions"><button className="primary" type="submit"><LockKeyhole size={15} />Encrypt &amp; commit to Walrus<ArrowRight size={15} /></button><button type="button" onClick={onDone}>Cancel</button></div>
      </fieldset>
      {busy && <p className="loading-state" role="status"><LoaderCircle size={16} className="spin" />Encrypting or waiting for the confirmed Walrus storage receipt…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </form></div><aside className="panel composer-aside"><span className="icon-tile secure"><ShieldCheck size={22} /></span><h2>Private at every step.</h2>
      <p className="muted">The credential, category, and audit record are encrypted before being committed to Walrus.</p>
      <ol className="process-list"><li><span>01</span><div><strong>Encrypt locally</strong><p>AES-256-GCM in your browser.</p></div></li><li><span>02</span><div><strong>Store on Walrus</strong><p>Only ciphertext leaves your device.</p></div></li><li><span>03</span><div><strong>Confirm the receipt</strong><p>View the indexed blob in your vault.</p></div></li></ol>
      <div className="card-footnote"><LockKeyhole size={13} />Your master key stays with you</div></aside></div>
  </section>;
}
