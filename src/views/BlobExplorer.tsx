import { Database, Download, ExternalLink } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { useConfig } from '../state/ConfigContext';

export default function BlobExplorer() {
  const { snapshot, execute, busy, setMessage } = useVault();
  const { config } = useConfig();
  return <section><div className="section-heading"><div><h1><Database size={24} />Walrus Storage &amp; Blob Explorer</h1>
    <p className="muted">{snapshot!.blobs.length} indexed blobs · namespace {config.memwalNamespace}</p></div>
    <div className="actions"><button disabled={busy} onClick={() => void execute(async (service) => {
      const result = await service.restoreVaultIndex(); setMessage(`Restored ${result.restored} records across ${result.namespaces} discovered namespaces. ${result.failed} failed.${result.truncated ? ' Recovery is incomplete.' : ''}`);
    })}>Restore vault index</button><button disabled={busy} onClick={() => void execute(async (service) => {
      const blob = await service.exportEncryptedBackup();
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `keeva-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click(); queueMicrotask(() => URL.revokeObjectURL(url));
      setMessage('Encrypted backup exported. Retain it with your vault unlock material stored separately.');
    }, false)}><Download size={16} />Encrypted backup</button></div></div>
    <p className="muted">Record namespaces use opaque identifiers. Restore covers namespaces discoverable by the relayer; its source limits can restrict recovery. Expiration is reported only when supplied by storage.</p>
    <div className="table-wrap panel"><table><thead><tr><th>Blob ID</th><th>Namespace</th><th>Stored</th><th>Bytes</th><th>Retention</th><th>Inspect</th></tr></thead>
      <tbody>{snapshot!.blobs.map((blob) => <tr key={blob.blobId}><td className="mono wrap storage">{blob.blobId}</td>
        <td className="mono wrap">{blob.namespace}</td><td>{new Date(blob.createdAt).toLocaleString()}</td><td>{blob.size.toLocaleString()}</td>
        <td>{blob.expiresAt ? new Date(blob.expiresAt).toLocaleString() : blob.endEpoch !== null ? `Through epoch ${blob.endEpoch}` : 'Not reported'}</td>
        <td><a target="_blank" rel="noopener noreferrer" href={`https://walruscan.com/mainnet/blob/${encodeURIComponent(blob.blobId)}`} aria-label={`Inspect blob ${blob.blobId}`}><ExternalLink size={17} /></a></td></tr>)}</tbody></table></div>
    <p className="muted">Last complete synchronization: {new Date(snapshot!.synchronizedAt).toLocaleString()}</p>
  </section>;
}
