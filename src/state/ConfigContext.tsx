import { createContext, useContext, useState, type ReactNode } from 'react';
import { loadVaultConfig, type VaultConfig } from '../config/vaultConfig';

const ConfigContext = createContext<{ config: VaultConfig; setConfig: (config: VaultConfig) => void } | null>(null);
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(loadVaultConfig);
  return <ConfigContext.Provider value={{ config, setConfig }}>{children}</ConfigContext.Provider>;
}
export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('ConfigProvider is required.');
  return context;
}
