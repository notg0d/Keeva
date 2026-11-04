import { useMemo, useState } from 'react';
import { FileKey2, Pencil, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import CopyButton from '../components/CopyButton';
import VaultOverview from '../components/VaultOverview';
import type { View } from '../components/WorkspaceShell';
import { passwordStrength } from '../services/securityAuditService';
import { useVault } from '../state/VaultContext';
import type { Credential } from '../types/vault';

export default function VaultInventory({ onEdit, onCreate, onNavigate }: { onEdit: (credential: Credential) => void; onCreate: () => void; onNavigate: (view: View) => void }) {
  const { snapshot, service, busy, execute } = useVault();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const credentials = snapshot!.credentials;
  const categories = [...new Set(credentials.map((item) => item.category))].sort();
  const visible = useMemo(() => credentials.filter((item) => (!category || item.category === category) &&
    (!searchIds || searchIds.has(item.revision))), [credentials, category, searchIds]);
  return <section>
    <div className="page-heading"><div><span className="eyebrow">A LITTLE PEACE OF MIND</span><h1>Vault overview</h1><p className="muted">Your credentials. Your infrastructure. Your control.</p></div>
      <div className="actions"><button disabled={busy} onClick={() => void execute((current) => current.synchronize())}><RefreshCw size={15} className={busy ? 'spin' : ''} />Synchronize</button>
        <button className="primary" onClick={onCreate}><Plus size={17} />Add vault item</button></div></div>
    <VaultOverview onNavigate={onNavigate} />
    <div className="section-heading inventory-heading"><h2>Credential inventory<span className="count-badge">{credentials.length}</span></h2><span className="muted small">Search stays on your device</span></div>
    <form className="search-bar" onSubmit={(event) => { event.preventDefault(); void execute(async () => {
      const matches = await service!.searchVault(query); setSearchIds(new Set(matches.map((item) => item.revision)));
    }); }}>
      <label className="grow"><span className="sr-only">Search decrypted metadata locally</span><span className="search-input"><Search size={17} /><input placeholder="Search your vault…" value={query} onChange={(event) => { setQuery(event.target.value); setSearchIds(null); }} maxLength={1000} autoComplete="off" /></span></label>
      <button disabled={busy} type="submit"><Search size={16} />Search vault</button>
      <label><span className="sr-only">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}
      </select></label>
    </form>
    {!visible.length && <div className="panel empty"><FileKey2 size={28} /><h2>{credentials.length ? 'No matching credentials' : 'Your vault is ready'}</h2>
      <p className="muted">{credentials.length ? 'Adjust the search or category filter.' : 'Give your first credential, secure note, or API key a private home.'}</p>{!credentials.length && <button className="primary" onClick={onCreate}><Plus size={16} />Create your first item</button>}</div>}
    <div className="credential-grid">{visible.map((item) => {
      const strength = item.kind !== 'note' ? passwordStrength(item.password, [item.username, item.siteName]) : null;
      const aged = item.kind !== 'note' && Date.now() - Date.parse(item.lastRotated) > 90 * 86_400_000;
      return <article className="panel credential-card" key={item.revision}>
        <div className="credential-top"><span className="credential-avatar" aria-hidden="true">{item.siteName.charAt(0).toUpperCase()}</span><ShieldCheck size={17} className="secure" /></div>
        <h2>{item.siteName}</h2>
        <p>{item.username || (item.kind === 'note' ? 'Secure note' : 'No username stored')}</p>
        <div className="tags"><span>{item.category}</span><span>{item.kind}</span>
          {strength && <span className={strength.weak ? 'warning' : 'secure'}>{['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][strength.score]}</span>}
          {aged && <span className="warning">Rotation due</span>}</div>
        {snapshot!.conflicts.includes(item.id) && <p className="warning">Concurrent revision · review encrypted history</p>}
        <p className="muted small">Rotated {new Date(item.lastRotated).toLocaleDateString()}</p>
        <div className="actions">
          {item.username && <CopyButton value={item.username} label="Username" description={`Copy username for ${item.siteName}`} />}
          <CopyButton value={item.kind === 'note' ? item.notes : item.password} label={item.kind === 'note' ? 'Note' : 'Secret'} description={`Copy secret for ${item.siteName}`} />
          <button disabled={snapshot!.conflicts.includes(item.id)} onClick={() => onEdit(item)}><Pencil size={15} />Edit</button>
        </div>
      </article>;
    })}</div>
  </section>;
}
