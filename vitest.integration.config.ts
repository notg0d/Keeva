import { defineConfig, loadEnv } from 'vite';

Object.assign(process.env, loadEnv('integration', process.cwd(), ''));

export default defineConfig({
  test: { include: ['tests/**/*.integration.test.ts'], testTimeout: 120_000 },
});
