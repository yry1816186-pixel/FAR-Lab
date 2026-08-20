// frontend/e2e/a11y-scan.mjs — 工作台无障碍快速扫描（axe-core，CPS-5/BL-4 剩余项）
// 用法：先 `node ../src/cli/far.ts api --port 3196`，再 `node e2e/a11y-scan.mjs`
/* eslint-disable no-undef */
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = 'http://localhost:3196';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
let totalViolations = 0;
for (const path of ['/', '/evidence', '/verify', '/missions']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  console.log(`${path}: ${results.violations.length} violations (${serious.length} serious/critical)`);
  for (const v of serious.slice(0, 5)) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
  }
  totalViolations += serious.length;
}
await browser.close();
console.log(`TOTAL serious/critical: ${totalViolations}`);
process.exit(totalViolations > 0 ? 1 : 0);
