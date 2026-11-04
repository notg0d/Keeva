import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { SuiClientProvider, WalletProvider, lightTheme, type Theme } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import '@fontsource-variable/dm-sans';
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
  backgroundColors: { primaryButton: '#d6f5bf', primaryButtonHover: '#e7fcdc', outlineButtonHover: '#d9e6d5',
    modalOverlay: 'rgba(12,26,21,.7)', modalPrimary: '#f0f4ec', modalSecondary: '#e2ebdc', iconButton: 'transparent',
    iconButtonHover: '#d9e6d5', dropdownMenu: '#f0f4ec', dropdownMenuSeparator: '#ccd8c7', walletItemSelected: '#d6e6cc', walletItemHover: '#e2ebdc' },
  borderColors: { outlineButton: '#bacbb2' }, colors: { primaryButton: '#152c23', outlineButton: '#152c23', iconButton: '#152c23',
    body: '#152c23', bodyMuted: '#53664e', bodyDanger: '#a23342' },
  typography: { fontFamily: '"DM Sans Variable", sans-serif', fontStyle: 'normal', lineHeight: '1.5', letterSpacing: '0' },
};

function Providers() {
  const { config } = useConfig();
  const networks = useMemo(() => ({ mainnet: new TatumSuiClient(config.tatumApiKey, config.tatumRpcUrl, config.tatumApiType).sdk }),
    [config.tatumApiKey, config.tatumRpcUrl, config.tatumApiType]);
  return <SuiClientProvider networks={networks} network="mainnet"><WalletProvider autoConnect theme={walletTheme} storageKey="keeva.wallet">
    <VaultProvider><App /></VaultProvider>
  </WalletProvider></SuiClientProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><ConfigProvider><Providers /></ConfigProvider></QueryClientProvider></ErrorBoundary></React.StrictMode>,
);
