import { lazy, Suspense, useState } from 'react';
import { Database, KeyRound, LayoutGrid, ShieldCheck } from 'lucide-react';
import Initialization from './components/Initialization';
import SettingsDrawer from './components/SettingsDrawer';
import SystemBar from './components/SystemBar';
import { useVault } from './state/VaultContext';
import type { Credential } from './types/vault';

const VaultInventory = lazy(() => import('./views/VaultInventory'));
const CredentialComposer = lazy(() => import('./views/CredentialComposer'));
const SecurityAudit = lazy(() => import('./views/SecurityAudit'));
const BlobExplorer = lazy(() => import('./views/BlobExplorer'));
type View = 'inventory' | 'composer' | 'audit' | 'storage';
const views = [{ id: 'inventory', label: 'Vault inventory', icon: LayoutGrid }, { id: 'composer', label: 'Add item', icon: KeyRound },
  { id: 'audit', label: 'Security audit', icon: ShieldCheck }, { id: 'storage', label: 'Walrus storage', icon: Database }] as const;

function VaultWorkspace() {
  const { snapshot, service, busy, execute } = useVault();
  const [view, setView] = useState<View>('inventory');
  const [edit, setEdit] = useState<Credential>();
  const changeView = (value: View) => { setEdit(undefined); setView(value); };
  const onEdit = (credential: Credential) => { setEdit(credential); setView('composer'); };
  return <><nav aria-label="Vault navigation">{views.map(({ id, label, icon: Icon }) =>
    <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => changeView(id)}><Icon size={17} />{label}</button>)}</nav>
    {service!.hasPendingWrite() && <div className="notice warning"><p>An encrypted write is awaiting confirmation. Retry the same operation to retain its idempotency key.</p>
      <button disabled={busy} onClick={() => void execute((current) => current.retryPendingWrite())}>Resume encrypted write</button></div>}
    {!!snapshot!.conflicts.length && <p className="notice warning">Concurrent credential revisions detected. Conflicting revisions remain visible and cannot be overwritten.</p>}
    <Suspense fallback={<p role="status">Loading vault tools…</p>}>
      {view === 'inventory' && <VaultInventory onEdit={onEdit} onCreate={() => changeView('composer')} />}
      {view === 'composer' && <CredentialComposer key={edit?.revision ?? 'new'} credential={edit} onDone={() => changeView('inventory')} />}
      {view === 'audit' && <SecurityAudit onEdit={onEdit} />}
      {view === 'storage' && <BlobExplorer />}
    </Suspense></>;
}

export default function App() {
  const { snapshot, error, message } = useVault();
  const [settings, setSettings] = useState(false);
  return <><SystemBar openSettings={() => setSettings(true)} /><main>
    {error && <div role="alert" className="notice error">{error}</div>}
    {message && <div role="status" className="notice">{message}</div>}
    {snapshot ? <VaultWorkspace /> : <Initialization openSettings={() => setSettings(true)} />}
  </main>{settings && <SettingsDrawer onClose={() => setSettings(false)} />}</>;
}
