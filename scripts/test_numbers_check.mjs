#!/usr/bin/env node
// FAR-Lab 测试数 SSOT —— 统计测试资产规模，输出确定性数字。
//
// 之前 AGENTS.md / far-baseline.md 引用本脚本作为「测试数 SSOT」，但脚本缺失（漂移）。
// 本实现分两档，语义诚实、不混淆：
//   1. fileCount  —— 确定性：tests/ 下 .test.ts / .test.mjs 文件数（即时可算，不跑测试）
//   2. caseCount  —— 上次实跑的全量测试用例数（来自 .far/state/baseline-cache.json；
//                     无缓存则输出 null，绝不编造）
//
// 用例数 SSOT 永远是「实跑数字」；本脚本只负责把文件数（下界）与实跑数（缓存）如实呈现。

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.ZCODE_PROJECT_DIR
  || process.env.CLAUDE_PROJECT_DIR
  || path.resolve(scriptDir, '..');

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

function countTestFiles() {
  // 用 git 列出 tests/ 下被跟踪的测试文件（比递归走盘更快，且自动忽略 node_modules 类噪音）。
  const out = git('ls-files tests/');
  if (!out) return 0;
  const files = out.split('\n').filter((f) => /\.(test\.ts|test\.mjs|spec\.ts)$/.test(f));
  return files.length;
}

function cachedCaseCount() {
  try {
    const cachePath = path.join(projectDir, '.far', 'state', 'baseline-cache.json');
    if (!existsSync(cachePath)) return null;
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    const vals = Object.values(cache).filter((v) => v && typeof v.testCount === 'number');
    if (vals.length === 0) return null;
    // 取最新 storedAt 的 testCount
    vals.sort((a, b) => (a.storedAt || '').localeCompare(b.storedAt || ''));
    return vals[vals.length - 1].testCount;
  } catch {
    return null;
  }
}

const fileCount = countTestFiles();
const caseCount = cachedCaseCount();

process.stdout.write(JSON.stringify({
  testFileCount: fileCount,
  lastRunCaseCount: caseCount,
  note: 'caseCount 是上次实跑全量测试的用例数（无缓存=null，绝不编造）；fileCount 是 tests/ 测试文件数（下界，即时可算）。',
}, null, 2) + '\n');
