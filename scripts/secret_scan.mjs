#!/usr/bin/env node
/**
 * secret_scan —— 代码库/产物 secret 泄露扫描（CORE-SECRETS-001 / CORE-PUBLIC-001）。
 *
 * 确定性正则扫描（零依赖·不引 trufflehog：供应链最小化），三类模式：
 *   1. 赋值型泄露：API_KEY=... / token: ... / password = ...（右侧值高熵或非占位）
 *   2. 已知 key 形状：sk-…（32+）/ ghp_… / github_pat_… / AKIA…（AWS）/ PEM 私钥头
 *   3. .env 值内联：process.env 形状豁免（引用不是泄露）——引用与赋值区分是本扫描器的判别力核心
 *
 * 免检区：tests/fixtures 中的显式占位值（sk-test-* / ghp_test_* 等已声明假值）、
 * node_modules / .far（私有层不入公开扫描面）/ .git / .cache（第三方运行时二进制缓存，
 * 如 playwright 浏览器——gitignored，二进制内含厂商遥测 key 字符串属误报源，与 node_modules 同类）。
 * 用法：node scripts/secret_scan.mjs [--root <dir>] [--fail-on-hit]
 * 退出码：0 无命中 / 1 命中（--fail-on-hit）/ 2 参数错误。
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const KEY_SHAPES = [
  { name: 'openai-style-key', re: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { name: 'github-pat', re: /\b(?:ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'pem-private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

/** 赋值型：NAME = 'value' / "name": "value"。值必须非空且非显式占位。 */
const ASSIGN_RE = /\b([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\b\s*[:=]\s*['"]([^'"]{8,})['"]/g;
const PLACEHOLDER_VALUES = new Set([
  'test', 'placeholder', 'changeme', 'dummy', 'fixture', 'redacted', 'your-key-here', 'xxx', 'example',
]);
const PLACEHOLDER_PREFIXES = ['sk-test-', 'ghp_test_', 'sk-ant-test', 'test-', 'fake-', 'mock-'];

/** 引用型豁免：右侧是 process.env.X / config 引用，不是泄露。 */
const REFERENCE_VALUES = [/process\.env\./i, /\$\{/];

const SKIP_DIRS = new Set(['node_modules', '.git', '.far', '.cache', 'dist', 'coverage', '.venv', '.python-deps', '__pycache__']);
const SKIP_FILES = new Set(['secret_scan.mjs', 'package-lock.json', 'pnpm-lock.yaml', 'uv.lock']);
const SKIP_SUFFIX = ['.lock', '.min.js'];

function isPlaceholder(value) {
  const v = value.toLowerCase();
  if (PLACEHOLDER_VALUES.has(v)) return true;
  // URL 是文档引用不是密钥（doc 注释里 NAME  https://… 的模式）
  if (value.includes('://')) return true;
  // 尖括号占位：<your-token-here> 一类
  if (value.startsWith('<') && value.endsWith('>')) return true;
  return PLACEHOLDER_PREFIXES.some((p) => v.startsWith(p));
}

function isReference(value) {
  return REFERENCE_VALUES.some((re) => re.test(value));
}

function* walk(root, dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(root, full);
    } else {
      if (SKIP_FILES.has(entry) || SKIP_SUFFIX.some((s) => entry.endsWith(s))) continue;
      yield { full, rel: rel.split(sep).join('/') };
    }
  }
}

export function scanText(text, sourceLabel) {
  const findings = [];
  for (const { name, re } of KEY_SHAPES) {
    const m = re.exec(text);
    if (m !== null) {
      // 已知形状出现在测试夹具路径下由调用方豁免；这里统一报，豁免交给免检区判断
      findings.push({ source: sourceLabel, kind: `key-shape:${name}`, match: `${m[0].slice(0, 8)}…` });
    }
  }
  for (const m of text.matchAll(ASSIGN_RE)) {
    const name = m[1];
    const value = m[2];
    if (isPlaceholder(value) || isReference(value)) continue;
    findings.push({ source: sourceLabel, kind: `assignment:${name}`, match: `${value.slice(0, 6)}…` });
  }
  return findings;
}

function main() {
  const argv = process.argv.slice(2);
  let root = '.';
  const failOnHit = argv.includes('--fail-on-hit');
  const rootIdx = argv.indexOf('--root');
  if (rootIdx !== -1) {
    root = argv[rootIdx + 1];
    if (root === undefined) {
      console.error('secret_scan: --root requires a directory');
      process.exit(2);
    }
  }
  if (!existsSync(root)) {
    console.error(`secret_scan: root missing: ${root}`);
    process.exit(2);
  }
  const findings = [];
  for (const { full, rel } of walk(root, root)) {
    // 免检区 2：显式测试夹具目录（声明的假值面）
    if (/(^|\/)(tests?|fixtures?|__tests__)\//.test(rel) && !/\.github\//.test(rel)) continue;
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    findings.push(...scanText(text, rel));
  }
  if (findings.length > 0) {
    console.error(`secret_scan: FAIL — ${findings.length} finding(s)`);
    for (const f of findings) {
      console.error(`  [${f.kind}] ${f.source}: ${f.match}`);
    }
    process.exit(failOnHit ? 1 : 0);
  }
  console.log('secret_scan: PASS — 0 finding(s)');
  process.exit(0);
}

// 被 import 时不自动执行（测试走 scanText）
if (process.argv[1] !== undefined && process.argv[1].endsWith('secret_scan.mjs')) {
  main();
}
