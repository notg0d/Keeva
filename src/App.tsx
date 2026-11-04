import { lazy, Suspense, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import Initialization from './components/Initialization';
import SettingsDrawer from './components/SettingsDrawer';
import WorkspaceShell, { type View } from './components/WorkspaceShell';
import { PageTransition } from './components/Motion';
import { useVault } from './state/VaultContext';
import type { Credential } from './types/vault';

const VaultInventory = lazy(() => import('./views/VaultInventory'));
const CredentialComposer = lazy(() => import('./views/CredentialComposer'));
const SecurityAudit = lazy(() => import('./views/SecurityAudit'));
const BlobExplorer = lazy(() => import('./views/BlobExplorer'));

function VaultWorkspace({ openSettings }: { openSettings: () => void }) {
  const { snapshot, service, busy, execute } = useVault();
  const [view, setView] = useState<View>('inventory');
  const [edit, setEdit] = useState<Credential>();
  const changeView = (value: View) => { setEdit(undefined); setView(value); };
  const onEdit = (credential: Credential) => { setEdit(credential); setView('composer'); };
  return <WorkspaceShell openSettings={openSettings} view={view} onChange={changeView}>
    {service!.hasPendingWrite() && <div className="notice warning"><p>An encrypted write is awaiting confirmation. Retry the same operation to retain its idempotency key.</p>
      <button disabled={busy} onClick={() => void execute((current) => current.retryPendingWrite())}>Resume encrypted write</button></div>}
    {!!snapshot!.conflicts.length && <p className="notice warning">Concurrent credential revisions detected. Conflicting revisions remain visible and cannot be overwritten.</p>}
    <Suspense fallback={<p className="loading-state" role="status"><LoaderCircle size={18} className="spin" />Loading vault tools…</p>}>
      <AnimatePresence mode="wait" initial={false}><PageTransition key={view}>
        {view === 'inventory' && <VaultInventory onEdit={onEdit} onCreate={() => changeView('composer')} onNavigate={changeView} />}
        {view === 'composer' && <CredentialComposer key={edit?.revision ?? 'new'} credential={edit} onDone={() => changeView('inventory')} />}
        {view === 'audit' && <SecurityAudit onEdit={onEdit} />}
        {view === 'storage' && <BlobExplorer />}
      </PageTransition></AnimatePresence>
    </Suspense>
  </WorkspaceShell>;
}

export default function App() {
  const { snapshot } = useVault();
  const [settings, setSettings] = useState(false);
  return <MotionConfig reducedMotion="user">
    {snapshot ? <VaultWorkspace openSettings={() => setSettings(true)} /> :
      <WorkspaceShell openSettings={() => setSettings(true)}><Initialization openSettings={() => setSettings(true)} /></WorkspaceShell>}
    {settings && <SettingsDrawer onClose={() => setSettings(false)} />}
  </MotionConfig>;
}
