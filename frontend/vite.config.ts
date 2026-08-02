/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config — React + path alias @/ -> src/ + Vitest (jsdom)
// API backend default: http://localhost:3000 (spec 24 API gateway)
export default defineConfig({
  plugins: [react()],
  // Dev + dependency pre-bundling use esbuild; the default dev target ('modules' = es2020)
  // forces esbuild to down-level destructuring (lucide-react's createLucideIcon), which
  // esbuild cannot do — raising a dev-only transform error. Pin esbuild to es2022 to
  // match the build target and down-level nothing.
  esbuild: { target: 'es2022' },
  // Dependency pre-bundling (optimizeDeps) has its OWN esbuild target — vite 5 defaults
  // it to 'modules' (es2020), which forces esbuild to down-level lucide-react's
  // destructuring and fails. Pin it to es2022 so pre-bundling down-levels nothing
  // (matches build.target + the top-level esbuild target above).
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
  },
  // 2026 交付物目标现代浏览器（chrome/edge/firefox/safari 近 2 版）——esbuild 对低目标
  // （es2020/modules）需降级 destructuring 但不支持，188 errors。es2022 不降级原生语法，构建通过。
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Vendor chunking: split large stable dependencies into independently-
        // cacheable chunks so they survive app-code deploys and load in parallel.
        // d3 (~280kB) is isolated so it never enters the initial bundle — it only
        // loads when the user navigates to a Viz or Ablation route (React.lazy).
        // (reactflow was removed as an unused dependency 2026-08-02 — tree-shaking
        // drops nothing extra since no source imports it.)
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-d3': ['d3'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
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
