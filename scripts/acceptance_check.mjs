#!/usr/bin/env node
/**
 * acceptance_check —— ACCEPTANCE.yaml 验收台账的机器门（2.md §20 补遗/§19 锚点 08-20）。
 *
 * 校验三层：
 *   1. 结构：合法状态枚举（DONE/PARTIAL/PENDING）、字段齐全、id 唯一、批次号合法。
 *   2. 证据指针存在性：DONE 项的证据串里引用的仓库内路径（src/ tests/ scripts/ docs/
 *      .far/agent/）必须真实存在（外部证据 PR#/命令/路径描述跳过）。
 *   3. 一致性红线：PARTIAL 必须有 note（差距声明）；DONE 必须有 evidence（无证据不得标 DONE）。
 *
 * exit 0 = 台账可信；exit 1 = 台账不可信（逐条打印）。
 * 用法: node scripts/acceptance_check.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const repoRoot = join(here, '..');
const LEDGER = join(repoRoot, 'docs', 'development', 'ACCEPTANCE.yaml');

const VALID_STATUS = new Set(['DONE', 'PARTIAL', 'PENDING']);
const BATCH_RE = /^b\d+$/;
/** Repo-relative roots whose existence we can actually check. */
const CHECKABLE_ROOTS = ['src/', 'tests/', 'scripts/', 'docs/', '.far/agent/', '.far/research-runs/'];

function main() {
  if (!existsSync(LEDGER)) {
    fail([`ledger missing: ${LEDGER}`]);
  }
  const text = readFileSync(LEDGER, 'utf8');
  const problems = [];

  // Minimal purpose-built parser: items live under `items:` as `  - id: ...`
  // blocks with `key: value` fields (string values may be quoted or bare).
  const lines = text.split(/\r?\n/);
  let inItems = false;
  const items = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^items:\s*$/.test(line)) {
      inItems = true;
      continue;
    }
    if (!inItems) continue;
    const itemMatch = /^ {2}- (\w+): (.+)$/.exec(line);
    if (itemMatch) {
      if (current !== null) items.push(current);
      current = { [itemMatch[1]]: strip(itemMatch[2]) };
      continue;
    }
    const fieldMatch = /^ {4}(\w+): ?(.*)$/.exec(line);
    if (fieldMatch && current !== null) {
      current[fieldMatch[1]] = strip(fieldMatch[2]);
    }
  }
  if (current !== null) items.push(current);

  if (items.length === 0) {
    problems.push('no items parsed — ledger structure unrecognized');
  }

  const seenIds = new Set();
  for (const item of items) {
    const id = item['id'];
    if (typeof id !== 'string' || id.length === 0) {
      problems.push(`item without id: ${JSON.stringify(item).slice(0, 80)}`);
      continue;
    }
    if (seenIds.has(id)) problems.push(`duplicate id: ${id}`);
    seenIds.add(id);

    const status = item['status'];
    if (!VALID_STATUS.has(status ?? '')) {
      problems.push(`${id}: illegal status "${status}" (valid: ${[...VALID_STATUS].join('/')})`);
    }
    const batch = item['last_updated_batch'];
    if (typeof batch !== 'string' || !BATCH_RE.test(batch)) {
      problems.push(`${id}: illegal last_updated_batch "${batch}"`);
    }
    if (status === 'DONE' && (item['evidence'] ?? '').trim() === '') {
      problems.push(`${id}: DONE without evidence — never mark done evidence-free`);
    }
    if (status === 'PARTIAL' && (item['note'] ?? '').trim() === '') {
      problems.push(`${id}: PARTIAL without a gap note (honesty: name the gap)`);
    }
    // Evidence-pointer existence: every repo path mentioned must exist.
    if (status !== 'PENDING') {
      for (const path of extractRepoPaths(item['evidence'] ?? '')) {
        if (!existsSync(join(repoRoot, path))) {
          problems.push(`${id}: evidence path does not exist: ${path}`);
        }
      }
    }
  }

  const done = items.filter((i) => i['status'] === 'DONE').length;
  const partial = items.filter((i) => i['status'] === 'PARTIAL').length;
  const pending = items.filter((i) => i['status'] === 'PENDING').length;
  process.stdout.write(
    `acceptance_check: ${items.length} items (DONE ${done} · PARTIAL ${partial} · PENDING ${pending})\n`,
  );

  if (problems.length > 0) {
    for (const p of problems) process.stdout.write(`  [FAIL] ${p}\n`);
    process.exit(1);
  }
  process.stdout.write('acceptance_check: PASS (structure + evidence pointers + honesty rules)\n');
}

function strip(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

/** Pull repo-relative directory/file references out of an evidence string. */
function extractRepoPaths(evidence) {
  const out = [];
  // Match `<root>...` up to the first non-path character (CJK, parens,
  // semicolons…). EVERY extracted path must exist — evidence that points at
  // nothing fails the gate (that is the point of the gate).
  const re = new RegExp(`((?:${CHECKABLE_ROOTS.map(escapeRe).join('|')})[\\w./-]+)`, 'g');
  for (const m of evidence.matchAll(re)) {
    const path = m[1].replace(/[.,;)]+$/, '');
    if (path.length > 0) out.push(path);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(messages) {
  for (const m of messages) process.stdout.write(`  [FAIL] ${m}\n`);
  process.exit(1);
}

main();
