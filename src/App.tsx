import { lazy, Suspense, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import Initialization from './components/Initialization';
import SettingsDrawer from './components/SettingsDrawer';
import WorkspaceShell, { type View } from './components/WorkspaceShell';
import { PageTransition } from './components/Motion';
import SmoothScroll from './components/SmoothScroll';
import { useVault } from './state/VaultContext';
import type { Credential } from './types/vault';
import type { GeneratedPassword } from './crypto/passwordGenerator';

const VaultInventory = lazy(() => import('./views/VaultInventory'));
const CredentialComposer = lazy(() => import('./views/CredentialComposer'));
const SecurityAudit = lazy(() => import('./views/SecurityAudit'));
const BlobExplorer = lazy(() => import('./views/BlobExplorer'));
const PasswordGenerator = lazy(() => import('./views/PasswordGenerator'));

function VaultWorkspace({ openSettings }: { openSettings: () => void }) {
  const { snapshot, service, busy, execute } = useVault();
  const [view, setView] = useState<View>('inventory');
  const [edit, setEdit] = useState<Credential>();
  const [generated, setGenerated] = useState<GeneratedPassword>();
  const changeView = (value: View) => { setEdit(undefined); setGenerated(undefined); setView(value); };
  const onEdit = (credential: Credential) => { setEdit(credential); setGenerated(undefined); setView('composer'); };
  const onUsePassword = (password: GeneratedPassword) => { setEdit(undefined); setGenerated(password); setView('composer'); };
  return <WorkspaceShell openSettings={openSettings} view={view} onChange={changeView}>
    {service!.hasPendingWrite() && <div className="notice warning"><p>An encrypted write is awaiting confirmation. Retry the same operation to retain its idempotency key.</p>
      <button disabled={busy} onClick={() => void execute((current) => current.retryPendingWrite())}>Resume encrypted write</button></div>}
    {!!snapshot!.conflicts.length && <p className="notice warning">Concurrent credential revisions detected. Conflicting revisions remain visible and cannot be overwritten.</p>}
    <Suspense fallback={<p className="loading-state" role="status"><LoaderCircle size={18} className="spin" />Loading vault tools…</p>}>
      <AnimatePresence mode="wait" initial={false}><PageTransition key={view}>
        {view === 'inventory' && <VaultInventory onEdit={onEdit} onCreate={() => changeView('composer')} onNavigate={changeView} />}
        {view === 'composer' && <CredentialComposer key={edit?.revision ?? 'new'} credential={edit} generated={generated} onDone={() => changeView('inventory')} />}
        {view === 'generator' && <PasswordGenerator onUsePassword={onUsePassword} />}
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
    <SmoothScroll screen={snapshot ? 'vault' : 'login'} />
    {snapshot ? <VaultWorkspace openSettings={() => setSettings(true)} /> :
      <Initialization openSettings={() => setSettings(true)} />}
    {settings && <SettingsDrawer onClose={() => setSettings(false)} />}
  </MotionConfig>;
}
