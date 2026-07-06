#!/usr/bin/env node
// packages/cli/bin/far.mjs
// @far-chain/cli 入口 —— 转发到根 src/cli/far.ts（node 24 原生 type-stripping 跑 .ts）。
//
// 设计理由：项目无 dist build（tsconfig noEmit · node 24 直接跑 .ts）。本 wrapper 用 spawn
// 调根 far.ts，使 packages/cli 作为独立包名（@far-chain/cli）可被 workspace 引用 / 链接，
// 而运行时逻辑单一来源（根 src/cli/far.ts，避免双份维护）。
//
// 独立发布（脱离 monorepo）：需将根 src/ 一并打包（files 增 ../../src），或引入 tsc build
// 产出 dist。当前为 monorepo workspace 模式（pnpm install 后 packages/cli 链接根）。

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootFarTs = resolve(here, '../../../src/cli/far.ts');

const result = spawnSync(process.execPath, [rootFarTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
