/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config — React + path alias @/ -> src/ + Vitest (jsdom)
// API backend default: http://localhost:3000 (spec 24 API gateway)
export default defineConfig({
  plugins: [react()],
  // 2026 交付物目标现代浏览器（chrome/edge/firefox/safari 近 2 版）——esbuild 对低目标
  // （es2020/modules）需降级 destructuring 但不支持，188 errors。es2022 不降级原生语法，构建通过。
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // All app endpoints live under /api/v1 (spec 24 §0#2); probes /health + /ready
    // live on the bare root (spec 24 §0#3). The frontend defaults to an absolute
    // base URL (CORS via @fastify/cors); these proxies apply when VITE_API_BASE_URL
    // is set to '' for a same-origin dev setup.
    proxy: {
      '/api/v1': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/ready': 'http://localhost:3000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
});
