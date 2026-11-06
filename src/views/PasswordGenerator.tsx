import { useCallback, useEffect, useId, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import CopyButton from '../components/CopyButton';
import PasswordOptions from '../components/PasswordOptions';
import { defaultPasswordRules, generatePassword, type GeneratedPassword, type PasswordRules } from '../crypto/passwordGenerator';
import { errorMessage } from '../lib/errors';

export default function PasswordGenerator({ onUsePassword }: {
  onUsePassword: (generated: GeneratedPassword) => void;
}) {
  const id = useId();
  const [rules, setRules] = useState<PasswordRules>({ ...defaultPasswordRules });
  const [generated, setGenerated] = useState<GeneratedPassword>();
  const [show, setShow] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const regenerate = useCallback(() => {
    setMessage(''); setError('');
    try { setGenerated(generatePassword(rules)); }
    catch (cause) { setGenerated(undefined); setError(errorMessage(cause)); }
  }, [rules]);
  useEffect(() => { regenerate(); }, [regenerate]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') setShow(false); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); };
  }, []);
  const bits = generated?.entropyBits ?? 0;
  const strength = bits >= 128 ? 'Very strong' : bits >= 80 ? 'Strong' : bits >= 60 ? 'Moderate' : 'Weak';
  return <section className="password-generator" aria-labelledby={`${id}-title`}>
    <div className="page-heading"><div><span className="eyebrow">FRESH KEYS. LESS WORRY.</span><h1 id={`${id}-title`}>Password generator</h1>
      <p className="muted">A fresh, random password. Made privately, right in your browser.</p></div>
      <span className="badge secure"><LockKeyhole size={13} />Generated locally</span></div>
    <div className="generator-layout"><div className="panel generator-panel">
      <div className="card-topline"><span className="icon-tile secure"><KeyRound size={19} /></span><span className="eyebrow">A NEW PASSWORD, JUST FOR YOU</span><ShieldCheck size={18} className="secure" /></div>
      <div className="generator-output"><label htmlFor={`${id}-password`}>Your new password</label>
        <div className="input-action"><input id={`${id}-password`} className="mono" type={show ? 'text' : 'password'} readOnly value={generated?.password ?? ''}
          placeholder="Your password will appear here" autoComplete="off" autoCapitalize="off" spellCheck={false}
          onFocus={(event) => event.target.select()} />
          <button type="button" disabled={!generated} aria-label={show ? 'Hide generated password' : 'Show generated password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <div className="generator-resistance">{generated ? <><span className={`inline-icon ${bits >= 80 ? 'secure' : 'warning'}`}><ShieldCheck size={14} />{strength}</span><span className="small muted mono">{Math.floor(bits)} bits of entropy</span></> : <span className="small muted">Choose valid options to generate a password.</span>}</div>
      </div>
      <div className="actions generator-actions"><button type="button" className="primary" onClick={regenerate}><RefreshCw size={16} />Generate new password</button>
        <CopyButton value={generated?.password ?? ''} disabled={!generated} label="Copy password" description="Copy generated password" onMessage={setMessage} /></div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <p className="small muted generator-feedback" role="status">{message || 'Passwords are not saved or sent to a server.'}</p>
      <PasswordOptions rules={rules} onChange={setRules} />
      {generated && bits < 80 && <p className="notice warning">For account passwords, use at least 16 characters and more character types when the site allows it.</p>}
      <div className="generator-use"><button type="button" disabled={!generated} onClick={() => { if (generated) onUsePassword(generated); }}>Use in new credential<ArrowRight size={15} /></button>
        <p className="small muted">Nothing is saved until you encrypt and commit the credential.</p></div>
    </div><aside className="panel generator-aside"><span className="icon-tile secure"><ShieldCheck size={22} /></span><h3>Random by design.<br />Private by default.</h3>
      <p className="muted">Browser cryptography supplies the randomness. No predictable patterns. No server-side generation.</p>
      <ol className="process-list"><li><span>01</span><div><strong>Make it long</strong><p>Start with 24 characters. More length makes random passwords harder to guess.</p></div></li>
        <li><span>02</span><div><strong>Keep it unique</strong><p>Generate a different password for every account. Never reuse an old one.</p></div></li>
        <li><span>03</span><div><strong>Store it safely</strong><p>Save it in your encrypted vault before leaving this page.</p></div></li></ol>
      <div className="card-footnote"><LockKeyhole size={13} />Clipboard clearing is attempted after 30 seconds. Browser permissions may prevent it.</div>
    </aside></div>
  </section>;
}
