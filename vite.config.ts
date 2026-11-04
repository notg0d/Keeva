import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type ProxyOptions } from 'vite';
import { createTatumMiddleware } from './server/gateway.mjs';

const walrusProxy: ProxyOptions = {
  target: 'https://relayer.memory.walrus.xyz',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/gateway\/walrus/, '') || '/',
  configure(proxy) {
    proxy.on('proxyReq', (request) => {
      request.removeHeader('cookie');
      request.removeHeader('authorization');
    });
    proxy.on('proxyRes', (response) => {
      delete response.headers['set-cookie'];
      response.headers['cache-control'] = 'no-store';
    });
  },
};
const proxy = { '^/gateway/walrus(?:/|$)': walrusProxy };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const tatumMiddleware = createTatumMiddleware({ recoveryEndpoint: env.TATUM_GRAPHQL_RECOVERY_URL || '' });
  return {
  plugins: [react(), tailwindcss(), { name: 'keeva-tatum-backend',
    configureServer(server) { server.middlewares.use(tatumMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(tatumMiddleware); },
  }],
  server: { port: 5173, strictPort: true, proxy },
  preview: { proxy },
  build: { sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.integration.test.ts'] },
  };
});
