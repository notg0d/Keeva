import { useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { useState } from 'react';
import { errorMessage } from '../lib/errors';

export default function GatewayWalletConnect() {
  const wallets = useWallets().filter(wallet => wallet.chains.includes('sui:mainnet') &&
    ('sui:signPersonalMessage' in wallet.features || 'sui:signMessage' in wallet.features));
  const connecting = useConnectWallet({ gcTime: 0, retry: false });
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  return <div className="gateway-wallet-connect">
    {!choosing && <button type="button" onClick={() => setChoosing(true)}>Connect Wallet</button>}
    {choosing && <div role="group" aria-label="Choose a Mainnet wallet">
      {wallets.map(wallet => <button type="button" key={wallet.name} disabled={connecting.isPending} onClick={() => {
        setError(''); void connecting.mutateAsync({ wallet }).catch(cause => setError(errorMessage(cause))).finally(() => connecting.reset());
      }}>{wallet.name}</button>)}
      {!wallets.length && <p className="muted small">No compatible Mainnet wallet was detected. Install or enable your Sui wallet extension, then return here.</p>}
      <button className="text-button" type="button" disabled={connecting.isPending} onClick={() => setChoosing(false)}>Cancel wallet selection</button>
    </div>}
    {connecting.isPending && <p role="status" className="muted small">Waiting for wallet connection…</p>}
    {error && <p role="alert" className="error small">{error}</p>}
  </div>;
}
