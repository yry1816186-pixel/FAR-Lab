#!/usr/bin/env node
// FAR-Lab 基线缓存 —— 变更驱动的基线复用判定。
//
// 解决痛点：原 SessionStart 起手式每次会话都强制全量跑
//   `pnpm run typecheck && pnpm run lint && pnpm test`（~3255 用例，分钟级）。
// 本脚本用「内容指纹」判定基线是否仍然有效：只有 HEAD、依赖清单、或
// src/tests/scripts 工作树发生变更时才需要重跑；否则复用上次实跑证据。
//
// 指纹要素（任一变化 ⇒ fresh=false，需重跑）：
//   1. HEAD commit 哈希
//   2. package.json + pnpm-lock.yaml 的 sha256（依赖拓扑）
//   3. src/ tests/ scripts/ 下是否存在未提交变更（git status --porcelain）
//
// 缓存落位：.far/state/baseline-cache.json（gitignored 运行区，不进 hygiene 门禁）。
//
// 用法：
//   node scripts/baseline_cache.mjs check
//     → stdout JSON { fresh, fingerprint, reason, cached? }
//       fresh=true  → 可复用上次基线，跳过全量重跑
//       fresh=false → 需重跑（reason 说明触发变更）
//   node scripts/baseline_cache.mjs store
//     → 从 stdin 读 JSON { typecheck, lint, test, testCount, demo, at }
//       以「当前指纹」为键写入缓存（重跑完成后调用）
//   node scripts/baseline_cache.mjs get
//     → 输出当前指纹对应的缓存记录；无则 { fresh:false }
//
// 决策契约：本脚本是「判定器」不是「执行器」——它只回答"要不要重跑"，
// 跑不跑由调用方（SessionStart hook / agent）决定并如实记录证据。

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.ZCODE_PROJECT_DIR
  || process.env.CLAUDE_PROJECT_DIR
  || path.resolve(scriptDir, '..');

const CACHE_PATH = path.join(projectDir, '.far', 'state', 'baseline-cache.json');

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

function sha256Of(relPath) {
  const abs = path.join(projectDir, relPath);
  if (!existsSync(abs)) return 'absent';
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

/** 工作树中与代码正确性相关的未提交变更文件列表（新增/修改/删除）。 */
function codeDirty() {
  const st = git('status --porcelain');
  if (!st) return { dirty: false, paths: [] };
  const lines = st.split('\n').filter(Boolean);
  const relevant = lines
    .map((l) => l.slice(3).trim())
    .filter((p) => /^(src|tests|scripts)\//.test(p) || /^(package\.json|pnpm-lock\.yaml)$/.test(p));
  return { dirty: relevant.length > 0, paths: relevant };
}

/** 对变更文件列表做内容聚合哈希（只读磁盘，含未提交修改；删除的文件用路径占位）。
 *  未跟踪路径在 porcelain 中以目录形式出现（如 `src/vendor/`）——readFileSync 对
 *  目录抛 EISDIR 会直接打断会话起手式，故目录展开为其包含的常规文件再哈希。 */
function dirtyContentHash(paths) {
  const h = createHash('sha256');
  const files = [];
  for (const p of [...new Set(paths)].sort()) {
    const abs = path.join(projectDir, p);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      for (const f of git(`ls-files --others --exclude-standard "${p}"`).split('\n').filter(Boolean)) {
        files.push(f);
      }
    } else {
      files.push(p);
    }
  }
  for (const p of files.sort()) {
    h.update(p);
    h.update('\0');
    const abs = path.join(projectDir, p);
    if (existsSync(abs) && !statSync(abs).isDirectory()) {
      h.update(readFileSync(abs));
    } else {
      h.update('<deleted>');
    }
    h.update('\0');
  }
  return h.digest('hex');
}

/**
 * 计算当前基线指纹。
 * 材料 = HEAD（已提交内容代理） + 依赖清单 sha + 未提交变更文件的内容哈希。
 * 因此：工作树干净/回到上次 store 状态 → 指纹一致 → 可复用；真正改了代码 → 指纹变 → 重跑。
 */
function fingerprint() {
  const head = git('rev-parse HEAD');
  const pkg = sha256Of('package.json');
  const lock = sha256Of('pnpm-lock.yaml');
  const cd = codeDirty();
  const dirtyHash = dirtyContentHash(cd.paths);
  const material = [head, pkg, lock, dirtyHash].join('|');
  return {
    hash: createHash('sha256').update(material).digest('hex'),
    head,
    pkgSha: pkg.slice(0, 12),
    lockSha: lock.slice(0, 12),
    codeDirty: cd,
  };
}

function readCache() {
  try {
    const raw = readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(obj) {
  writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function cmdCheck() {
  const fp = fingerprint();
  const cache = readCache();
  const hit = cache[fp.hash];
  let result;
  if (hit) {
    // 指纹命中（HEAD+依赖+未提交变更内容都一致）⇒ 复用
    result = { fresh: true, fingerprint: fp, reason: 'fingerprint-hit (HEAD+依赖+工作树代码内容未变)', cached: hit };
  } else if (fp.codeDirty.dirty) {
    result = { fresh: false, fingerprint: fp, reason: `code-changed: ${fp.codeDirty.paths.join(', ') || '(unknown)'}`, cached: null };
  } else {
    result = { fresh: false, fingerprint: fp, reason: 'no-cache-for-fingerprint (首次或依赖/HEAD 已变更)', cached: null };
  }
  process.stdout.write(JSON.stringify(result));
}

function cmdStore() {
  const fp = fingerprint();
  let payload = {};
  try {
    const raw = readFileSync(0, 'utf8') || '{}';
    payload = JSON.parse(raw);
  } catch { /* 保持 {} */ }
  const cache = readCache();
  cache[fp.hash] = {
    ...payload,
    storedHead: fp.head,
    storedAt: new Date().toISOString(),
  };
  writeCache(cache);
  process.stdout.write(JSON.stringify({ ok: true, fingerprint: fp, stored: cache[fp.hash] }));
}

function cmdGet() {
  const fp = fingerprint();
  const cache = readCache();
  const hit = cache[fp.hash];
  process.stdout.write(JSON.stringify(hit ? { fresh: true, fingerprint: fp, cached: hit } : { fresh: false, fingerprint: fp, cached: null }));
}

const sub = process.argv[2] || 'check';
if (sub === 'check') cmdCheck();
else if (sub === 'store') cmdStore();
else if (sub === 'get') cmdGet();
else {
  process.stderr.write(`[baseline_cache] 未知子命令: ${sub}（支持 check|store|get）\n`);
  process.exit(2);
}
