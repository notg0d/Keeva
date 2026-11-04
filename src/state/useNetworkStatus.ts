import { useQuery } from '@tanstack/react-query';
import { useConfig } from './ConfigContext';
import { useVault } from './VaultContext';

export function useNetworkStatus() {
  const { config } = useConfig();
  const { service, header } = useVault();
  const scope = [config.tatumApiType, config.tatumRpcUrl, config.memwalServerUrl, config.memwalAccountId, header?.vaultId];
  const telemetry = useQuery({ queryKey: ['network', ...scope], queryFn: ({ signal }) => service!.rpc.getNetworkTelemetry(signal),
    enabled: !!service, refetchInterval: 30_000, staleTime: 45_000, retry: false });
  const health = useQuery({ queryKey: ['storage-health', ...scope], queryFn: () => service!.memwal.health(),
    enabled: !!service, refetchInterval: 30_000, staleTime: 45_000, retry: false });
  return { telemetry, health, networkLive: !!service && telemetry.isSuccess && !telemetry.isStale,
    storageLive: !!service && health.isSuccess && !health.isStale && ['ok', 'healthy'].includes(health.data.status) };
}
