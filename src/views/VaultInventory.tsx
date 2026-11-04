import { useMemo, useState } from 'react';
import { Copy, FileKey2, Pencil, Search, ShieldCheck } from 'lucide-react';
import { errorMessage } from '../lib/errors';
import { secureClipboard } from '../services/clipboardService';
import { passwordStrength } from '../services/securityAuditService';
import { useVault } from '../state/VaultContext';
import type { Credential } from '../types/vault';

export default function VaultInventory({ onEdit, onCreate }: { onEdit: (credential: Credential) => void; onCreate: () => void }) {
  const { snapshot, service, busy, execute, setMessage } = useVault();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const credentials = snapshot!.credentials;
  const categories = [...new Set(credentials.map((item) => item.category))].sort();
  const visible = useMemo(() => credentials.filter((item) => (!category || item.category === category) &&
    (!searchIds || searchIds.has(item.revision))), [credentials, category, searchIds]);
  const copy = async (value: string) => {
    try { await secureClipboard.copy(value, setMessage); } catch (error) { setMessage(errorMessage(error)); }
  };
  return <section>
    <div className="section-heading"><div><h1>Credential Inventory</h1><p className="muted">{credentials.length} current revisions · encrypted on Walrus</p></div>
      <div className="actions"><button disabled={busy} onClick={() => void execute((current) => current.synchronize())}>Synchronize</button>
        <button className="primary" onClick={onCreate}>Add vault item</button></div></div>
    <form className="search-bar" onSubmit={(event) => { event.preventDefault(); void execute(async () => {
      const matches = await service!.searchVault(query); setSearchIds(new Set(matches.map((item) => item.revision)));
    }); }}>
      <label className="grow">Search decrypted metadata locally<input value={query} onChange={(event) => { setQuery(event.target.value); setSearchIds(null); }} maxLength={1000} autoComplete="off" /></label>
      <button disabled={busy} type="submit"><Search size={16} />Search vault</button>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}
      </select></label>
    </form>
    {!visible.length && <div className="panel empty"><FileKey2 size={28} /><h2>{credentials.length ? 'No matching credentials' : 'Your vault is ready'}</h2>
      <p>{credentials.length ? 'Adjust the search or category filter.' : 'Add your first credential, secure note, or API key.'}</p></div>}
    <div className="credential-grid">{visible.map((item) => {
      const strength = item.kind !== 'note' ? passwordStrength(item.password, [item.username, item.siteName]) : null;
      const aged = item.kind !== 'note' && Date.now() - Date.parse(item.lastRotated) > 90 * 86_400_000;
      return <article className="panel credential-card" key={item.revision}>
        <div className="section-heading"><h2>{item.siteName}</h2><ShieldCheck size={18} className="secure" /></div>
        <p>{item.username || (item.kind === 'note' ? 'Secure note' : 'No username stored')}</p>
        <div className="tags"><span>{item.category}</span><span>{item.kind}</span>
          {strength && <span className={strength.weak ? 'warning' : 'secure'}>{['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][strength.score]}</span>}
          {aged && <span className="warning">Rotation due</span>}</div>
        {snapshot!.conflicts.includes(item.id) && <p className="warning">Concurrent revision · review encrypted history</p>}
        <p className="muted small">Rotated {new Date(item.lastRotated).toLocaleDateString()}</p>
        <div className="actions">
          {item.username && <button onClick={() => void copy(item.username)} aria-label={`Copy username for ${item.siteName}`}><Copy size={15} />Username</button>}
          <button onClick={() => void copy(item.kind === 'note' ? item.notes : item.password)} aria-label={`Copy secret for ${item.siteName}`}><Copy size={15} />{item.kind === 'note' ? 'Note' : 'Secret'}</button>
          <button disabled={snapshot!.conflicts.includes(item.id)} onClick={() => onEdit(item)}><Pencil size={15} />Edit</button>
        </div>
      </article>;
    })}</div>
  </section>;
}
