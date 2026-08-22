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
