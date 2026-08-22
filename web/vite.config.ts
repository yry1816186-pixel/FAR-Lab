import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev proxy: /api -> local FAR-Lab HTTP API (parallel API group, port 8787).
 * Build output: web/dist (git-ignored; same as root convention).
 * Tailwind v4 (D-060 phase-5): CSS-first — tokens live in styles.css @theme,
 * utilities available for new surfaces; legacy BEM classes coexist by design.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // citation-js's sync-fetch/node-fetch are Node-only (URL-input paths we
      // never take — FAR-Lab passes string payloads only): stub them so no
      // Node polyfills enter the browser bundle.
      'sync-fetch': fileURLToPath(new URL('./src/stubs/sync-fetch.ts', import.meta.url)),
      'node-fetch': fileURLToPath(new URL('./src/stubs/node-fetch.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
