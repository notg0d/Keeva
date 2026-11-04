import { Activity, ArrowUpRight, Database, Radio } from 'lucide-react';
import { useNetworkStatus } from '../state/useNetworkStatus';
import { useVault } from '../state/VaultContext';
import { useConfig } from '../state/ConfigContext';
import { errorMessage } from '../lib/errors';
import { StatusDot } from './Motion';

export default function NetworkCards() {
  const { service } = useVault();
  const { config } = useConfig();
  const { telemetry, health, networkLive, storageLive } = useNetworkStatus();
  const writes = (health.data as { writes?: string } | undefined)?.writes;
  return <>
    <article className="panel bento-card network-card">
      <div className="card-topline"><span className="icon-tile network"><Activity size={18} /></span><span className="eyebrow">SUI NETWORK</span><StatusDot live={networkLive} tone="network" /></div>
      <div className="metric-value">{!service ? 'Not connected' : telemetry.isError ? 'Unavailable' : telemetry.data ? <>{telemetry.data.latencyMs}<span className="metric-unit">ms</span></> : 'Connecting…'}</div>
      <p className="muted small">{!service ? 'Configure Tatum to read Mainnet telemetry.' : 'Mainnet API round-trip latency'}</p>
      {service && telemetry.data && <dl className="compact-data"><div><dt>Epoch</dt><dd>{telemetry.data.epoch}</dd></div><div><dt>Gas</dt><dd>{telemetry.data.gasPrice} MIST</dd></div>
        <div><dt>Checkpoint</dt><dd>{telemetry.data.checkpointHeight}</dd></div><div><dt>Transaction blocks</dt><dd>{telemetry.data.totalTransactionBlocks}</dd></div></dl>}
      {service && telemetry.error && <p className="error small wrap">{errorMessage(telemetry.error)}</p>}
      <div className="card-footnote"><Radio size={13} /><span>{service && telemetry.data ? `${!networkLive ? 'Last reading' : 'Observed'} ${new Date(telemetry.data.observedAt).toLocaleTimeString()}` : 'Readings begin after vault unlock'}</span></div>
    </article>
    <article className="panel bento-card storage-card">
      <div className="card-topline"><span className="icon-tile storage"><Database size={18} /></span><span className="eyebrow">WALRUS MEMORY</span><StatusDot live={storageLive} tone="storage" /></div>
      <div className="metric-value">{!service ? 'Awaiting setup' : health.isError ? 'Unavailable' : health.data?.status ?? 'Connecting…'}</div>
      <p className="muted small">{!service ? 'Decentralized storage for encrypted records.' : 'Status reported by your storage relayer'}</p>
      {service && <dl className="compact-data"><div><dt>Active agent</dt><dd title={config.memwalAgentId}>{config.memwalAgentId.slice(0, 12)}…</dd></div></dl>}
      {service && health.data?.write_ready === false && <p className="warning small">Writes unavailable</p>}
      {service && writes && ['paused', 'degraded'].includes(writes) && <p className="warning small">Walrus writes {writes}</p>}
      {service && health.error && <p className="error small wrap">{errorMessage(health.error)}</p>}
      <div className="card-footnote"><ArrowUpRight size={13} /><span>{service && health.dataUpdatedAt ? `Observed ${new Date(health.dataUpdatedAt).toLocaleTimeString()}` : 'Ciphertext-only persistence'}</span></div>
    </article>
  </>;
}
