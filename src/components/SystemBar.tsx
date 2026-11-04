import { ConnectButton } from '@mysten/dapp-kit';
import { ChevronRight, LockKeyhole, Settings2 } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { useNetworkStatus } from '../state/useNetworkStatus';
import { StatusDot } from './Motion';

export default function SystemBar({ openSettings, pageLabel }: { openSettings: () => void; pageLabel: string }) {
  const { snapshot, lock } = useVault();
  const { networkLive } = useNetworkStatus();
  return <header className="system-bar">
    <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{pageLabel}</strong></div>
    <div className="actions"><span className="network-chip"><StatusDot live={networkLive} tone="network" />Sui Mainnet</span>
      {snapshot && <><ConnectButton /><button className="icon-button" onClick={lock} aria-label="Lock vault" title="Lock vault"><LockKeyhole size={16} /></button></>}<button className="icon-button" onClick={openSettings} aria-label="Open gateway settings"><Settings2 size={17} /></button></div>
  </header>;
}
