import { ConnectButton } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, LockKeyhole, Settings2 } from 'lucide-react';
import { errorMessage } from '../lib/errors';
import { useConfig } from '../state/ConfigContext';
import { useVault } from '../state/VaultContext';

export default function SystemBar({ openSettings }: { openSettings: () => void }) {
  const { config } = useConfig();
  const { service, lock } = useVault();
  const telemetry = useQuery({ queryKey: ['network', config.memwalAccountId], queryFn: ({ signal }) => service!.rpc.getNetworkTelemetry(signal),
    enabled: !!service, refetchInterval: 30_000, staleTime: 15_000, retry: false });
  const health = useQuery({ queryKey: ['storage-health', config.memwalServerUrl, config.memwalAccountId], queryFn: () => service!.memwal.health(),
    enabled: !!service, refetchInterval: 30_000, staleTime: 15_000, retry: false });
  return <header className="system-bar">
    <div className="section-heading"><a href="#" className="brand" aria-label="Keeva home"><LockKeyhole size={22} />Keeva</a>
      <div className="actions"><ConnectButton /><button onClick={openSettings}><Settings2 size={16} />Settings</button>
        {service && <button onClick={lock}><LockKeyhole size={16} />Lock vault</button>}</div></div>
    {service && <><div className="telemetry">
      <span className="network"><Activity size={15} />Sui Mainnet</span>
      {telemetry.data && <><span>Epoch {telemetry.data.epoch}</span><span>Gas {telemetry.data.gasPrice} MIST</span>
        <span>Checkpoint {telemetry.data.checkpointHeight}</span><span>{telemetry.data.totalTransactionBlocks} transaction blocks</span>
        <span>{telemetry.data.latencyMs} ms</span></>}
      {telemetry.isPending && <span>Reading network state…</span>}
      <span className="storage"><Database size={15} />Walrus {health.isError ? 'unreachable' : health.data?.status ?? 'connecting'}</span>
      {health.data?.write_ready === false && <span className="warning">Writes unavailable</span>}
      {health.data && ['paused', 'degraded'].includes((health.data as unknown as { writes: string }).writes) && <span className="warning">Walrus writes {(health.data as unknown as { writes: string }).writes}</span>}
      <span className="agent" title={config.memwalAgentId}>Agent {config.memwalAgentId.slice(0, 12)}…</span>
    </div>
      {telemetry.error && <p className="error" role="status">Network telemetry unavailable. {errorMessage(telemetry.error)}</p>}
      {health.error && <p className="error" role="status">Storage health unavailable. {errorMessage(health.error)}</p>}
      {telemetry.data && <p className="muted small">Network observed {new Date(telemetry.data.observedAt).toLocaleTimeString()}{telemetry.isError ? ' · last successful reading' : ''}</p>}
    </>}
  </header>;
}
