import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Database, Fingerprint, LayoutGrid, LockKeyhole, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { useConfig } from '../state/ConfigContext';
import { useVault } from '../state/VaultContext';
import SystemBar from './SystemBar';
import { spring } from './Motion';

export type View = 'inventory' | 'composer' | 'audit' | 'storage';
const views = [{ id: 'inventory', label: 'Vault overview', icon: LayoutGrid }, { id: 'composer', label: 'Add credential', icon: Plus },
  { id: 'audit', label: 'Security audit', icon: ShieldCheck }, { id: 'storage', label: 'Walrus storage', icon: Database }] as const;

export default function WorkspaceShell({ children, openSettings, view, onChange }: {
  children: ReactNode; openSettings: () => void; view?: View; onChange?: (view: View) => void;
}) {
  const { snapshot, lock, error, message, setMessage } = useVault();
  const { config } = useConfig();
  const reduce = useReducedMotion();
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="workspace-rail">
      <a href="#main-content" className="brand" aria-label="Keeva home"><span className="brand-mark"><Fingerprint size={23} /></span>keeva<span className="brand-period">.</span></a>
      <div className="workspace-identity"><span className="identity-icon"><LockKeyhole size={16} /></span><div><strong>Personal workspace</strong><span>Sui Mainnet</span></div><span className="small muted">01</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Vault navigation">{views.map(({ id, label, icon: Icon }) => <button key={id}
        aria-label={label} aria-current={view === id ? 'page' : undefined} disabled={!onChange} onClick={() => onChange?.(id)} title={!onChange ? 'Unlock your vault to continue' : label}>
        {view === id && <motion.span className="nav-selection" layoutId="nav-selection" transition={reduce ? { duration: 0 } : spring} />}
        <Icon size={18} /><span>{label}</span>{!onChange && <LockKeyhole size={12} className="nav-lock" />}
      </button>)}</nav>
      <div className="rail-bottom">
        <div className="session-card"><ShieldCheck size={20} className={snapshot ? 'secure' : 'muted'} /><strong>{snapshot ? 'Vault unlocked' : 'Your privacy, by design.'}</strong>
          <p>{snapshot ? 'Keys are held in this browser session.' : 'Your credentials are encrypted before they leave your device.'}</p>
          <span className="mono small">AES-256-GCM <ArrowUpRight size={12} /></span></div>
        <button className="rail-action" onClick={openSettings} aria-label="Gateway settings" title="Gateway settings"><Settings2 size={17} />Gateway settings</button>
        {snapshot && <button className="rail-action" onClick={lock} aria-label="Lock vault" title="Lock vault"><LockKeyhole size={17} />Lock vault</button>}
        <div className="rail-footer"><span className="storage">◇</span><span className="truncate" title={config.memwalNamespace}>{config.memwalNamespace}</span></div>
      </div>
    </aside>
    <div className="workspace-body"><SystemBar openSettings={openSettings} pageLabel={views.find((item) => item.id === view)?.label ?? 'Getting started'} />
      <main id="main-content" tabIndex={-1}>
        {error && <div role="alert" className="notice error">{error}</div>}
        {message && <motion.div key={message} initial={{ opacity: 0, scale: reduce ? 1 : .96 }} animate={{ opacity: 1, scale: reduce ? 1 : [.96, 1.012, 1] }} transition={reduce ? { duration: 0 } : { duration: .32 }} className="notice feedback-notice">
          <span role="status">{message}</span><button className="text-button" onClick={() => setMessage('')} aria-label="Dismiss notification">Dismiss</button></motion.div>}
        {children}
      </main>
      <footer className="workspace-footer"><span><LockKeyhole size={12} />Client-side encryption</span><span>Built on Sui <span className="footer-divider">/</span> Stored on Walrus</span></footer>
    </div>
  </div>;
}
