import { useEffect, useState } from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { LockKeyhole, Settings2 } from 'lucide-react';
import { useVault } from '../state/VaultContext';

export default function Initialization({ openSettings }: { openSettings: () => void }) {
  const { ready, inspect, header, busy, open, execute, setMessage } = useVault();
  const account = useCurrentAccount();
  const [method, setMethod] = useState<'passphrase' | 'wallet'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (header) setMethod(header.kdf.method); }, [header]);
  return <section className="panel initialization">
    <LockKeyhole size={30} className="secure" />
    <h1>Secure Vault Initialization</h1>
    <p>Connect the owning Sui wallet, configure your storage gateways, and unlock your client-encrypted vault.</p>
    <div className="actions"><ConnectButton /><button onClick={openSettings}><Settings2 size={16} />Configure gateways</button></div>
    {account && !account.chains.includes('sui:mainnet') && <p className="error">Select a wallet account that supports Sui Mainnet.</p>}
    {ready && <div className="actions"><button disabled={busy} onClick={() => void inspect()}>Inspect existing vault</button>
      <button disabled={busy} onClick={() => void execute(async (service) => {
        const result = await service.restoreVaultIndex();
        setMessage(`Restored ${result.restored} indexed records across ${result.namespaces} discovered namespaces. ${result.failed} failed. ${result.truncated ? 'Further recovery is required.' : 'Inspect the vault to check availability.'}`);
      }, false)}>Restore storage index</button></div>}
    {ready && header !== undefined && <form onSubmit={(event) => {
      event.preventDefault(); setError('');
      if (!header && method === 'passphrase' && passphrase !== confirmation) { setError('The master passphrases do not match.'); return; }
      const material = method === 'wallet' ? { method } as const : { method, passphrase } as const;
      setPassphrase(''); setConfirmation(''); void open(material, !header);
    }}>
      <h2>{header ? 'Unlock encrypted vault' : 'Create encrypted vault'}</h2>
      {!header && <p className="muted">No indexed header was found. Restore first if this namespace held an existing vault. Creation commits an encrypted header to Walrus.</p>}
      <fieldset disabled={busy}>
        <label>Master key source<select value={method} disabled={!!header} onChange={(event) => setMethod(event.target.value as typeof method)}>
          <option value="passphrase">Master passphrase + wallet authorization</option><option value="wallet">Private wallet signature · Ed25519</option>
        </select></label>
        {method === 'passphrase' ? <>
          <label>Master passphrase<input type="password" autoComplete={header ? 'current-password' : 'new-password'} required
            minLength={header ? 1 : 14} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label>
          {!header && <label>Confirm master passphrase<input type="password" autoComplete="new-password" required value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)} /></label>}
        </> : <p className="muted">Your wallet signs a vault-specific key-derivation message. That signature is private unlock material and is never sent to storage.</p>}
        <p className="muted">Keep your unlock material available. Keeva cannot recover a lost master key.</p>
        <button className="primary" type="submit">{header ? 'Authorize & unlock vault' : 'Authorize & initialize vault'}</button>
      </fieldset>
    </form>}
    {busy && <p role="status">Waiting for wallet, cryptography, or storage operations…</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
