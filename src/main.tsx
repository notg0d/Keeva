import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { SuiClientProvider, WalletProvider, lightTheme, type Theme } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import './styles.css';
import App from './App';
import { ConfigProvider, useConfig } from './state/ConfigContext';
import { VaultProvider } from './state/VaultContext';
import { TatumSuiClient } from './services/tatumSuiClient';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({ defaultOptions: {
  queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
  mutations: { retry: false, gcTime: 0 },
} });

const walletTheme: Theme = { ...lightTheme,
  backgroundColors: { primaryButton: '#18181b', primaryButtonHover: '#27272a', outlineButtonHover: '#27272a',
    modalOverlay: 'rgba(0,0,0,.75)', modalPrimary: '#18181b', modalSecondary: '#09090b', iconButton: 'transparent',
    iconButtonHover: '#27272a', dropdownMenu: '#18181b', dropdownMenuSeparator: '#27272a', walletItemSelected: '#27272a', walletItemHover: '#27272a' },
  borderColors: { outlineButton: '#3f3f46' }, colors: { primaryButton: '#f4f4f5', outlineButton: '#f4f4f5', iconButton: '#f4f4f5',
    body: '#f4f4f5', bodyMuted: '#a1a1aa', bodyDanger: '#fda4af' },
};

function Providers() {
  const { config } = useConfig();
  const networks = useMemo(() => ({ mainnet: new TatumSuiClient(config.tatumApiKey).sdk }), [config.tatumApiKey]);
  return <SuiClientProvider networks={networks} network="mainnet"><WalletProvider autoConnect theme={walletTheme} storageKey="keeva.wallet">
    <VaultProvider><App /></VaultProvider>
  </WalletProvider></SuiClientProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><ConfigProvider><Providers /></ConfigProvider></QueryClientProvider></ErrorBoundary></React.StrictMode>,
);
