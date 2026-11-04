import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.integration.test.ts'] },
});
