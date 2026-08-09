#!/usr/bin/env node
/**
 * test_numbers_check —— 测试数字 SSOT 对拍脚本（阶段 7 P0-8 · AT15/SA13 修复）。
 *
 * 背景（findings AT15/SA13）：测试数字 8+ 处散落于文档（AGENTS.md:10 声称 2278 tests，
 * 实测 2474——漂移 196），无单一来源 → 文档-实测必然漂移。
 * 本脚本：
 *   1. 解析 node --test spec 输出（`ℹ tests N / pass N / fail N / skipped N` 行）。
 *   2. `--check <file>`：与 AGENTS.md:10 的声称（"N tests passing (a pass / b fail / c skip"）
 *      比对——漂移即 FAIL（exit 1）。
 *   3. 无参数：仅打印实测数字（供回写）。
 *
 * 用法:
 *   pnpm test > out.txt; node scripts/test_numbers_check.mjs --from-file out.txt
 *   node scripts/test_numbers_check.mjs --from-file out.txt --check
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let fromFile = null;
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from-file') {
      fromFile = argv[i + 1];
      i += 1;
    } else if (a === '--check') {
      check = true;
    }
  }
  return { fromFile, check };
}

/** 解析 node --test spec 输出 → { tests, pass, fail, skipped }。 */
export function parseTestNumbers(text) {
  const grab = (label) => {
    const m = new RegExp(`ℹ\\s+${label}\\s+(\\d+)`).exec(text);
    return m !== null ? Number(m[1]) : null;
  };
  const tests = grab('tests');
  const pass = grab('pass');
  const fail = grab('fail');
  const skipped = grab('skipped');
  if (tests === null || pass === null || fail === null || skipped === null) {
    throw new Error(
      'test_numbers_check: cannot parse node --test spec output (missing ℹ tests/pass/fail/skipped lines)',
    );
  }
  return { tests, pass, fail, skipped };
}

/** 提取 AGENTS.md:10 声称数字（"N tests passing (a pass / b fail / c skip"）。 */
export function extractClaimedNumbers(text) {
  const m = /(\d+)\s+tests passing\s+\((\d+)\s+pass\s*\/\s*(\d+)\s+fail\s*\/\s*(\d+)\s+skip/.exec(text);
  if (m === null) {
    throw new Error('test_numbers_check: AGENTS.md claim pattern not found');
  }
  return { tests: Number(m[1]), pass: Number(m[2]), fail: Number(m[3]), skipped: Number(m[4]) };
}

// CLI 入口（import.meta.main：仅作为命令行主入口时执行——被测试 import 时不触发）。
if (import.meta.main) {
  const { fromFile, check } = parseArgs();
  if (fromFile === null) {
    console.error(
      'usage: node scripts/test_numbers_check.mjs --from-file <spec-output.txt> [--check]',
    );
    process.exit(2);
  }

  const specText = readFileSync(fromFile, 'utf8');
  const actual = parseTestNumbers(specText);

  if (!check) {
    console.log(
      `test_numbers_check: actual tests=${actual.tests} pass=${actual.pass} fail=${actual.fail} skipped=${actual.skipped}`,
    );
    process.exit(0);
  }

  // --check：与 AGENTS.md:10 声称比对（数字 SSOT 断言）。
  const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
  let claimed;
  try {
    claimed = extractClaimedNumbers(agents);
  } catch (err) {
    console.error(`test_numbers_check FAIL: ${err.message}`);
    process.exit(1);
  }

  const drift =
    claimed.tests !== actual.tests ||
    claimed.pass !== actual.pass ||
    claimed.fail !== actual.fail ||
    claimed.skipped !== actual.skipped;

  if (drift) {
    console.error(
      `test_numbers_check FAIL: AGENTS.md claims ${claimed.tests} tests (${claimed.pass} pass / ` +
        `${claimed.fail} fail / ${claimed.skipped} skip) but actual is ${actual.tests} tests ` +
        `(${actual.pass} pass / ${actual.fail} fail / ${actual.skipped} skip) — update AGENTS.md:10 ` +
        `to the actual numbers (SSOT = script output).`,
    );
    process.exit(1);
  }

  console.log(
    `test_numbers_check: ok — AGENTS.md ${actual.tests} tests (${actual.pass} pass / ${actual.fail} fail / ${actual.skipped} skip) matches actual`,
  );
}
