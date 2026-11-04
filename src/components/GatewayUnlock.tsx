import { useEffect, useId, useState } from 'react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { useGateway } from '../state/GatewayContext';

export default function GatewayUnlock() {
  const gateway = useGateway();
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const passphraseId = useId();
  const unlockPassphrase = () => {
    if (gateway.busy || !passphrase) return;
    const material = passphrase; setPassphrase(''); void gateway.unlockPassphrase(material);
  };
  const saved = gateway.savedAnyWallet || gateway.savedPassphrase;
  const lockedWallet = gateway.savedAnyWallet && !gateway.unlockedWallet;
  const lockedPassphrase = gateway.savedPassphrase && !gateway.unlockedPassphrase;
  useEffect(() => { setPassphrase(''); }, [gateway.walletAddress]);
  if (!saved && !gateway.error && !gateway.status) return null;
  return <section className="gateway-unlock" aria-label="Saved gateway access">
    {saved && (lockedWallet || lockedPassphrase) && <>
      <p className="small"><KeyRound size={14} aria-hidden="true" />Your gateway credentials are saved encrypted on this browser.</p>
      {lockedWallet && <>
        <p className="muted small">{gateway.savedWallet
          ? 'Your wallet is recognized. Approve a private message to restore your keys and settings. No transaction or fee.'
          : gateway.walletAddress ? 'No saved gateways match this wallet. Connect the wallet you used before, or configure this wallet.'
          : 'Connect the wallet you used to save your gateways, then unlock them here.'}</p>
        {gateway.savedWallet && <button type="button" disabled={gateway.busy} onClick={() => void gateway.unlockWallet()}>Unlock saved gateways with wallet</button>}
      </>}
      {lockedPassphrase && <>
        {!usePassphrase && <button className="text-button" type="button" disabled={gateway.busy} onClick={() => setUsePassphrase(true)}>Use saved device passphrase</button>}
        {usePassphrase && <div className="gateway-passphrase">
          <label htmlFor={passphraseId}>Device protection passphrase</label>
          <input id={passphraseId} type="password" autoComplete="current-password" value={passphrase} disabled={gateway.busy}
            onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); unlockPassphrase(); }
            }} />
          <button type="button" disabled={gateway.busy || !passphrase} onClick={unlockPassphrase}>Unlock saved gateways</button>
        </div>}
      </>}
    </>}
    {gateway.busy && <p className="loading-state small" role="status"><LoaderCircle size={14} className="spin" />Waiting for wallet or local encryption…</p>}
    {gateway.error && <p className="error small" role="alert">{gateway.error}</p>}
    {gateway.status && <p className="success small" role="status">{gateway.status}</p>}
  </section>;
}
