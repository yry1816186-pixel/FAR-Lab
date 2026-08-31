import { fileURLToPath } from 'node:url';
import { defaultClientConditions, defineConfig } from 'vite';
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
    // ONNX Runtime publishes an explicit external-wasm condition. Dictation
    // already points at version-matched /models/ort assets; selecting the
    // default bundled export would copy a second 23.5MB binary into every web
    // build even when the optional Whisper model is not installed.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
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
    // The committed budget checker uses Vite's module graph instead of
    // filename guesses to distinguish cold-shell and optional capability
    // chunks. The manifest is also useful release provenance.
    manifest: true,
    // Public release artifacts must not ship source trees or double their
    // weight. Debug maps belong in a separately controlled observability
    // artifact if/when one is introduced.
    sourcemap: false,
  },
  // ES-module workers: the ASR worker dynamically imports transformers.js,
  // which splits into multiple chunks — impossible under the iife default.
  worker: {
    format: 'es',
  },
});
