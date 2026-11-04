import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../state/useReducedMotion';
import { ArrowUpRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useConfig } from '../state/ConfigContext';
import { useVault } from '../state/VaultContext';
import SystemBar from './SystemBar';
import Brand from './Brand';

export type View = 'inventory' | 'composer' | 'audit' | 'storage';
const views = [{ id: 'inventory', label: 'Vault overview' }, { id: 'composer', label: 'Add credential' },
  { id: 'audit', label: 'Security audit' }, { id: 'storage', label: 'Walrus storage' }] as const;

export default function WorkspaceShell({ children, openSettings, view, onChange }: {
  children: ReactNode; openSettings: () => void; view?: View; onChange?: (view: View) => void;
}) {
  const { snapshot, lock, error, message, setMessage } = useVault();
  const { config } = useConfig();
  const reduce = useReducedMotion();
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="workspace-rail">
      <Brand />
      <div className="rail-navigation"><div className="nav-label">YOUR WORKSPACE</div>
      <nav aria-label="Vault navigation">{views.map(({ id, label }, index) => <button key={id}
        aria-label={label} aria-current={view === id ? 'page' : undefined} disabled={!onChange} onClick={() => onChange?.(id)} title={!onChange ? 'Unlock your vault to continue' : label}>
        <span className="nav-index">0{index + 1}</span><span>{label}</span><ArrowUpRight size={15} className="nav-arrow" />
      </button>)}</nav>
      <div className="rail-utilities"><button className="rail-action" onClick={openSettings}>Gateway settings<ArrowUpRight size={14} /></button>
        {snapshot && <button className="rail-action" onClick={lock}>Lock vault<LockKeyhole size={13} /></button>}</div></div>
      <div className="rail-bottom">
        <div className="session-card"><ShieldCheck size={18} className="secure" /><strong>{snapshot ? 'Your vault is open.' : 'Your vault is locked.'}</strong>
          <p>{snapshot ? 'Your keys stay in this browser session.' : 'Unlock to access your private space.'}</p></div>
        <div className="rail-footer"><span className="truncate" title={config.memwalNamespace}>{config.memwalNamespace}</span><span>SUI MAINNET</span></div>
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
