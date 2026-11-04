import { useEffect, useState } from 'react';
import { ArrowUpRight, Database, KeyRound, ShieldCheck } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { analyzeVault } from '../services/securityAuditService';
import { errorMessage } from '../lib/errors';
import NetworkCards from './NetworkCards';
import type { View } from './WorkspaceShell';

export default function VaultOverview({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { snapshot } = useVault();
  const [matrix, setMatrix] = useState<Awaited<ReturnType<typeof analyzeVault>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setMatrix(null); setError('');
    void analyzeVault(snapshot!.credentials).then((value) => { if (active) setMatrix(value); })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [snapshot]);
  const review = matrix?.filter((item) => item.weak || item.reused || item.rotationDue).length;
  const bytes = snapshot!.blobs.reduce((sum, blob) => sum + blob.size, 0);
  return <div className="bento-grid overview-grid">
    <article className="panel bento-card vault-summary"><div className="card-topline"><span className="eyebrow secure">YOUR ENCRYPTED VAULT</span><KeyRound size={20} className="secure" /></div>
      <div className="vault-count">{snapshot!.credentials.length}<span>{snapshot!.credentials.length === 1 ? 'credential revision' : 'credential revisions'}</span></div>
      <p className="muted">Private by default. Available when you need them.</p><div className="card-footnote"><ShieldCheck size={14} />AES-256-GCM <span>·</span> Encrypted on Walrus</div>
    </article>
    <article className="panel bento-card"><div className="card-topline"><span className="icon-tile secure"><ShieldCheck size={18} /></span><span className="eyebrow">SECURITY HEALTH</span></div>
      <div className={`metric-value ${review ? 'warning' : ''}`}>{error ? 'Unavailable' : matrix === null ? 'Analyzing…' : !matrix.length ? 'No passwords' : `${review} to review`}</div>
      <p className="muted small">{error || 'Local checks for strength, reuse, and rotation.'}</p><button className="text-button card-link" onClick={() => onNavigate('audit')}>View security audit<ArrowUpRight size={14} /></button>
    </article>
    <article className="panel bento-card"><div className="card-topline"><span className="icon-tile storage"><Database size={18} /></span><span className="eyebrow">STORAGE BLOBS</span></div>
      <div className="metric-value">{snapshot!.blobs.length}<span className="metric-unit">indexed</span></div><p className="muted small mono">{bytes.toLocaleString()} bytes recorded</p>
      <button className="text-button card-link" onClick={() => onNavigate('storage')}>Explore encrypted blobs<ArrowUpRight size={14} /></button>
    </article>
    <NetworkCards />
  </div>;
}
