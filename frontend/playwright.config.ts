// frontend/playwright.config.ts — 浏览器端到端（CPS-5）
// 单进程产品模式：`far api` 同时 serve 前端 dist 与 REST API（README 声称）。
// e2e 需要：pnpm --dir frontend run build（或已存在的 dist）+ 本配置文件自动拉起 API。
import { defineConfig } from '@playwright/test';

const API_PORT = 3196;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${API_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node ../src/cli/far.ts api --port ${API_PORT}`,
    url: `http://localhost:${API_PORT}/health`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
