import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev proxy: /api -> local FAR-Lab HTTP API (parallel API group, port 8787).
 * Build output: web/dist (git-ignored; same as root convention).
 */
export default defineConfig({
  plugins: [react()],
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
