import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { analyzeVault } from '../services/securityAuditService';
import type { AuditTransactionVerification } from '../services/tatumSuiClient';
import { useVault } from '../state/VaultContext';
import type { Credential } from '../types/vault';
import { errorMessage } from '../lib/errors';

export default function SecurityAudit({ onEdit }: { onEdit: (credential: Credential) => void }) {
  const { snapshot, execute, busy } = useVault();
  const [matrix, setMatrix] = useState<Awaited<ReturnType<typeof analyzeVault>> | null>(null);
  const [error, setError] = useState('');
  const [digest, setDigest] = useState('');
  const [verification, setVerification] = useState<AuditTransactionVerification | null>(null);
  useEffect(() => {
    let active = true; setMatrix(null);
    void analyzeVault(snapshot!.credentials).then((value) => { if (active) setMatrix(value); })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [snapshot]);
  return <section><h1><ShieldCheck size={24} />Security Audit &amp; Health Matrix</h1>
    <p className="muted">Reuse hashes and password-resistance analysis are calculated locally. Rotation is due after 90 days.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {matrix === null ? <p role="status">Analyzing decrypted vault records…</p> : <>
      <div className="metrics"><div className="panel"><strong>{matrix.filter((item) => item.weak).length}</strong>Weak credentials</div>
        <div className="panel"><strong>{matrix.filter((item) => item.reused).length}</strong>Reused secrets</div>
        <div className="panel"><strong>{matrix.filter((item) => item.rotationDue).length}</strong>Rotation due</div></div>
      <div className="table-wrap panel"><table><thead><tr><th>Credential</th><th>Resistance</th><th>Reuse</th><th>Age</th><th>Action</th></tr></thead>
        <tbody>{matrix.map((item) => <tr key={item.revision}><td>{item.siteName}</td><td className={item.weak ? 'warning' : 'secure'}>{item.weak ? 'Review required' : 'Strong'}</td>
          <td className={item.reused ? 'warning' : ''}>{item.reused ? 'Reused' : 'Unique in vault'}</td><td className={item.rotationDue ? 'warning' : ''}>{item.ageDays} days</td>
          <td><button disabled={snapshot!.conflicts.includes(item.id)} onClick={() => onEdit(snapshot!.credentials.find((credential) => credential.revision === item.revision)!)}>Review &amp; rotate</button></td></tr>)}</tbody></table>
        {!matrix.length && <p>No password-bearing credentials are stored.</p>}</div>
    </>}
    <section className="panel"><h2>Onchain transaction verification</h2>
      <p className="muted">Verifies transaction digest, sender and sponsor signatures. Checkpoint inclusion and event contents are attested by the configured RPC; validator certificates are not verified here.</p>
      <form onSubmit={(event) => { event.preventDefault(); setVerification(null); void execute(async (service) => {
        const result = await service.verifyAndRecordTransaction(digest.trim()); setVerification(result);
      }); }}><label>Transaction digest<input required autoComplete="off" spellCheck={false} value={digest} onChange={(event) => setDigest(event.target.value)} /></label>
        <button disabled={busy} type="submit">Verify &amp; store encrypted audit record</button></form>
      {verification && <div className="inset"><p className="secure">Transaction bytes and signatures verified</p>
        <p>Checkpoint {verification.checkpoint} · {verification.recognizedEvents.length} recognized contract events</p>
        <p className="muted">A successful transaction check does not establish that credential sharing or recovery occurred.</p>
        <details><summary>RPC-reported events</summary><pre>{JSON.stringify(verification.events, null, 2)}</pre></details></div>}
    </section>
    <section className="panel"><h2>Encrypted audit history</h2><p className="muted">Writes contain their credential revision and audit record in the same authenticated blob.</p>
      {snapshot!.auditEvents.length ? <ol className="audit-list">{snapshot!.auditEvents.map((event) => <li key={event.id}>
        <strong>{event.action}</strong><time>{new Date(event.occurredAt).toLocaleString()}</time>
        <span className="muted wrap">Agent {event.agentId}</span>
        {event.transactionDigest && <span className="wrap">Transaction {event.transactionDigest}</span>}
      </li>)}</ol> : <p>No stored audit records.</p>}
    </section>
  </section>;
}
