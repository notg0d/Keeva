import { Database, Download, ExternalLink, HardDrive, RefreshCw, ShieldCheck } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { useConfig } from '../state/ConfigContext';

export default function BlobExplorer() {
  const { snapshot, execute, busy, setMessage } = useVault();
  const { config } = useConfig();
  const bytes = snapshot!.blobs.reduce((sum, blob) => sum + blob.size, 0);
  return <section><div className="page-heading"><div><span className="eyebrow">DISTRIBUTED. ENCRYPTED. YOURS.</span><h1>Walrus storage</h1>
    <p className="muted">A transparent view of your encrypted footprint.</p></div>
    <div className="actions"><button disabled={busy} onClick={() => void execute(async (service) => {
      const result = await service.restoreVaultIndex(); setMessage(`Restored ${result.restored} records across ${result.namespaces} discovered namespaces. ${result.failed} failed.${result.truncated ? ' Recovery is incomplete.' : ''}`);
    })}><RefreshCw size={15} className={busy ? 'spin' : ''} />Restore vault index</button><button className="primary" disabled={busy} onClick={() => void execute(async (service) => {
      const blob = await service.exportEncryptedBackup();
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `keeva-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click(); queueMicrotask(() => URL.revokeObjectURL(url));
      setMessage('Encrypted backup exported. Retain it with your vault unlock material stored separately.');
    }, false)}><Download size={16} />Encrypted backup</button></div></div>
    <div className="metrics storage-metrics"><div className="panel bento-card"><div className="card-topline"><Database size={18} className="storage" /><span className="eyebrow">INDEXED BLOBS</span></div><strong>{snapshot!.blobs.length}</strong><span className="small muted">Confirmed storage records</span></div>
      <div className="panel bento-card"><div className="card-topline"><HardDrive size={18} className="storage" /><span className="eyebrow">RECORDED SIZE</span></div><strong>{bytes.toLocaleString()}<span className="metric-unit">bytes</span></strong><span className="small muted">Across indexed blobs</span></div>
      <div className="panel bento-card"><div className="card-topline"><ShieldCheck size={18} className="secure" /><span className="eyebrow">VAULT NAMESPACE</span></div><p className="mono wrap storage">{config.memwalNamespace}</p><span className="small muted">Opaque record identifiers</span></div></div>
    <div className="section-heading inventory-heading"><h2>Blob explorer</h2><span className="badge storage"><Database size={12} />Walrus Mainnet</span></div>
    <p className="muted small">Record namespaces use opaque identifiers. Restore covers namespaces discoverable by the relayer; its source limits can restrict recovery. Expiration is reported only when supplied by storage.</p>
    <div className="table-wrap panel" role="region" aria-label="Indexed storage blobs" tabIndex={0}><table><thead><tr><th>Blob ID</th><th>Namespace</th><th>Stored</th><th>Bytes</th><th>Retention</th><th>Inspect</th></tr></thead>
      <tbody>{snapshot!.blobs.map((blob) => <tr key={blob.blobId}><td className="mono wrap storage">{blob.blobId}</td>
        <td className="mono wrap">{blob.namespace}</td><td>{new Date(blob.createdAt).toLocaleString()}</td><td>{blob.size.toLocaleString()}</td>
        <td>{blob.expiresAt ? new Date(blob.expiresAt).toLocaleString() : blob.endEpoch !== null ? `Through epoch ${blob.endEpoch}` : 'Not reported'}</td>
        <td><a className="icon-button" target="_blank" rel="noopener noreferrer" href={`https://walruscan.com/mainnet/blob/${encodeURIComponent(blob.blobId)}`} aria-label={`Inspect blob ${blob.blobId}`}><ExternalLink size={17} /></a></td></tr>)}</tbody></table>
      {!snapshot!.blobs.length && <div className="empty compact-empty"><Database size={26} /><h2>No indexed blobs</h2><p className="muted">Synchronize or restore your vault index to discover stored records.</p></div>}</div>
    <p className="muted small">Last complete synchronization: {new Date(snapshot!.synchronizedAt).toLocaleString()}</p>
  </section>;
}
