import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * FAR-Lab web workbench build config.
 *
 * Dev proxy: the app talks to the API same-origin (`/api/*`, probes). In dev,
 * vite forwards those prefixes to the local FAR-Lab API server (:3000,
 * `pnpm api`). In production a reverse proxy owns the same routes — the app
 * itself never hardcodes an origin (VITE_API_BASE_URL overrides for
 * cross-origin deployments).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
      '/ready': { target: 'http://localhost:3000', changeOrigin: true },
      '/metrics': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Deterministic output: no build-time timestamps or random values are
    // injected anywhere in the app, so two builds of one commit are identical
    // (CI reproducible_build gate hashes dist twice and diffs).
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
    css: false,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'], // e2e 由 playwright 跑（test:e2e）
  },
});
