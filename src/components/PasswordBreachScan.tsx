import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, ScanSearch, ShieldCheck } from 'lucide-react';
import { scanPasswordBreaches, type BreachScanProgress, type PasswordBreachReport } from '../services/passwordBreachService';
import { errorMessage } from '../lib/errors';
import type { Credential } from '../types/vault';

export default function PasswordBreachScan({ credentials, conflicts, disabled, onEdit }: {
  credentials: Credential[]; conflicts: string[]; disabled: boolean; onEdit: (credential: Credential) => void;
}) {
  const request = useRef<AbortController | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BreachScanProgress>({ completed: 0, total: 0 });
  const [result, setResult] = useState<{ source: Credential[]; report: PasswordBreachReport }>();
  const [error, setError] = useState('');
  const passwords = credentials.filter((item) => item.kind === 'login' && item.password.length > 0);
  const report = result?.source === credentials ? result.report : undefined;
  useEffect(() => {
    setResult(undefined); setError(''); setRunning(false); setProgress({ completed: 0, total: 0 });
    const hide = () => { if (document.visibilityState === 'hidden') request.current?.abort(); };
    const leave = () => { request.current?.abort(); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave);
    return () => {
      request.current?.abort(); request.current = undefined;
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave);
    };
  }, [credentials]);
  const start = () => {
    if (disabled || request.current || !passwords.length) return;
    const controller = new AbortController(); request.current = controller;
    setRunning(true); setResult(undefined); setError('');
    const active = () => request.current === controller && !controller.signal.aborted && document.visibilityState === 'visible';
    void scanPasswordBreaches(credentials, { signal: controller.signal, onProgress: (value) => { if (active()) setProgress(value); } })
      .then((value) => { if (active()) setResult({ source: credentials, report: value }); })
      .catch((cause: unknown) => { if (active()) setError(errorMessage(cause)); })
      .finally(() => { if (request.current === controller) { request.current = undefined; setRunning(false); } });
  };
  const exposed = report?.findings.filter((item) => item.status === 'breached').length ?? 0;
  const unknown = report?.findings.filter((item) => item.status === 'unavailable').length ?? 0;
  return <section className="panel breach-scan" aria-labelledby="breach-scan-title">
    <div className="card-topline"><span className="icon-tile network"><ScanSearch size={18} /></span><span className="eyebrow">OPTIONAL · PASSWORD BREACH CHECK</span><span className="badge">K-anonymity lookup</span></div>
    <h2 id="breach-scan-title">Check for known password exposure</h2>
    <p className="muted">Scan saved login passwords against <a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Have I Been Pwned’s Pwned Passwords</a>. API keys and secure notes are excluded.</p>
    <div className="inset breach-privacy"><ShieldCheck size={19} className="secure" /><div><strong>A partial hash. Never your password.</strong>
      <p className="muted small">By scanning, you send only the first five characters of each password’s SHA-1 hash to the breach service. Matches are checked locally using padded responses. Passwords, full hashes, usernames, and site names are never sent. The provider can see your IP address and request timing. No API key is needed.</p></div></div>
    <div className="actions"><button type="button" className="primary" disabled={disabled || running || !passwords.length} onClick={start}><ScanSearch size={16} />{report ? 'Scan passwords again' : 'Scan passwords'}</button>
      {running && <button type="button" onClick={() => { request.current?.abort(); request.current = undefined; setRunning(false); setError('Scan cancelled. No results from this run were retained.'); }}>Cancel scan</button>}
      <span className="small muted">{passwords.length} login password{passwords.length === 1 ? '' : 's'} · Results stay in this session</span></div>
    {running && <p className="loading-state" role="status"><LoaderCircle size={16} className="spin" />Checked {progress.completed} of {progress.total} login passwords…</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    {report && <>
      <p className={exposed || unknown ? 'warning' : 'muted'} role="status">{exposed} password{exposed === 1 ? '' : 's'} found in leaked datasets · {report.findings.length - exposed - unknown} not found · {unknown} unchecked.</p>
      <p className="small muted">Last scan: <time dateTime={report.checkedAt}>{new Date(report.checkedAt).toLocaleString()}</time></p>
      {report.error && <p className="notice warning" role="alert">Scan incomplete. {report.error}</p>}
      <div className="table-wrap panel" tabIndex={0} role="region" aria-label="Password breach scan results"><table><thead><tr><th>Credential</th><th>Breach lookup</th><th>Action</th></tr></thead>
        <tbody>{report.findings.map((finding) => {
          const credential = passwords.find((item) => item.revision === finding.revision)!;
          return <tr key={finding.revision}><td>{credential.siteName}</td><td className={finding.status === 'breached' ? 'warning' : 'muted'}>
            {finding.status === 'breached' ? <><span className="inline-icon"><CircleAlert size={14} />Found in leaked datasets</span><span className="breach-occurrences small">Seen {finding.occurrences!.toLocaleString()} times</span></> : finding.status === 'not-found' ? 'Not found in this dataset' : 'Unknown · check unavailable'}</td>
            <td>{finding.status === 'breached' ? <button disabled={disabled || conflicts.includes(credential.id)} onClick={() => onEdit(credential)}>Review &amp; rotate</button> : '—'}</td></tr>;
        })}</tbody></table></div>
    </>}
    {!running && !report && !error && <p className="small muted" role="status">{passwords.length ? 'No breach scan has been run. Start a scan when you’re ready.' : 'Add a login credential to scan its password.'}</p>}
    <p className="small muted breach-disclaimer">A match means the password appears in known leaked data, not that this specific account was breached. “Not found” is not proof of safety. Replace exposed passwords everywhere they are used with new, unique passwords.</p>
  </section>;
}
