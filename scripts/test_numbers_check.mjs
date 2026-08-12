#!/usr/bin/env node
/**
 * test_numbers_check —— 测试数字 SSOT 对拍脚本（阶段 7 P0-8 · AT15/SA13 修复）。
 *
 * 背景（findings AT15/SA13）：测试数字 8+ 处散落于文档（AGENTS.md:10 声称 2278 tests，
 * 实测 2474——漂移 196），无单一来源 → 文档-实测必然漂移。
 * 本脚本：
 *   1. 解析 node --test spec 输出（`ℹ tests N / pass N / fail N / skipped N` 行）。
 *   2. `--check`：与 claim 文件的声称（"N tests passing (a pass / b fail / c skip"）
 *      比对——漂移即 FAIL（exit 1）。
 *   3. `--write`：把 claim 文件的声称行回写为实测数字（幂等）。
 *   4. 无 --check/--write：仅打印实测数字。
 *
 * claim 文件位置：
 *   - 默认 `AGENTS.md`（向后兼容）。
 *   - `--claim-file <path>` 覆盖。
 *   注意：AGENTS.md 自 2026-08-10 round 1-5 起被 .gitignore（本地 agent 指令文件，
 *   不进公共仓库）——fresh clone 上不存在，故默认 --check/--write 仅适合本地开发机；
 *   CI 与测试应显式 `--claim-file` 指向一个 tracked 文件，或用临时文件做 hermetic 测试。
 *
 * 用法:
 *   pnpm test > out.txt; node scripts/test_numbers_check.mjs --from-file out.txt
 *   node scripts/test_numbers_check.mjs --from-file out.txt --check
 *   node scripts/test_numbers_check.mjs --from-file out.txt --check --claim-file docs/STATUS.md
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
  let write = false;
  let claimFile = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from-file') {
      fromFile = argv[i + 1];
      i += 1;
    } else if (a === '--claim-file') {
      claimFile = argv[i + 1];
      i += 1;
    } else if (a === '--check') {
      check = true;
    } else if (a === '--write') {
      write = true;
    }
  }
  return { fromFile, check, write, claimFile };
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

/** 提取声称数字（"N tests passing (a pass / b fail / c skip"）。 */
export function extractClaimedNumbers(text) {
  const m = /(\d+)\s+tests passing\s+\((\d+)\s+pass\s*\/\s*(\d+)\s+fail\s*\/\s*(\d+)\s+skip/.exec(text);
  if (m === null) {
    throw new Error('test_numbers_check: claim pattern not found');
  }
  return { tests: Number(m[1]), pass: Number(m[2]), fail: Number(m[3]), skipped: Number(m[4]) };
}

const CLAIM_PATTERN = /(\d+)\s+tests passing\s+\((\d+)\s+pass\s*\/\s*(\d+)\s+fail\s*\/\s*(\d+)\s+skip/;
const CLAIM_REPLACEMENT = (n) =>
  `${n.tests} tests passing (${n.pass} pass / ${n.fail} fail / ${n.skipped} skip`;

// CLI 入口（import.meta.main：仅作为命令行主入口时执行——被测试 import 时不触发）。
if (import.meta.main) {
  const { fromFile, check, write, claimFile } = parseArgs();
  if (fromFile === null) {
    console.error(
      'usage: node scripts/test_numbers_check.mjs --from-file <spec-output.txt> [--check|--write] [--claim-file <path>]',
    );
    process.exit(2);
  }

  const specText = readFileSync(fromFile, 'utf8');
  const actual = parseTestNumbers(specText);
  const claimPath = claimFile !== null ? claimFile : join(repoRoot, 'AGENTS.md');

  // --write（LP-2 持续治理）：把 claim 文件的声称行同步为实测数字（消除人工回写漂移）。
  // 幂等：数字已一致时零改动。
  // 注意：早期版本会顺带重写 tests/scripts/test_numbers_check.test.mjs——那是治理脚本
  // 改写自身测试文件的副作用 bug（测试 finally 还未还原它），已移除。--write 现在只改 claim 文件。
  if (write) {
    if (!existsSync(claimPath)) {
      console.error(`test_numbers_check FAIL: claim file not found: ${claimPath}`);
      process.exit(1);
    }
    const claim = readFileSync(claimPath, 'utf8');
    const claimUpdated = claim.replace(CLAIM_PATTERN, CLAIM_REPLACEMENT(actual));
    if (claimUpdated !== claim) {
      writeFileSync(claimPath, claimUpdated, 'utf8');
      console.log(
        `test_numbers_check: --write updated ${claimPath} → ${actual.tests} tests ` +
          `(${actual.pass} pass / ${actual.fail} fail / ${actual.skipped} skip)`,
      );
    } else {
      console.log(
        `test_numbers_check: --write no change (${claimPath} already ` +
          `${actual.tests} tests (${actual.pass} pass / ${actual.fail} fail / ${actual.skipped} skip))`,
      );
    }
    process.exit(0);
  }

  if (!check) {
    console.log(
      `test_numbers_check: actual tests=${actual.tests} pass=${actual.pass} fail=${actual.fail} skipped=${actual.skipped}`,
    );
    process.exit(0);
  }

  // --check：与 claim 文件的声称行比对（数字 SSOT 断言）。
  if (!existsSync(claimPath)) {
    console.error(
      `test_numbers_check FAIL: claim file not found: ${claimPath}\n` +
        `（默认 AGENTS.md 自 round 1-5 被 .gitignore，fresh clone 上不存在；\n` +
        ` 请用 --claim-file 指向一个 tracked 文件。）`,
    );
    process.exit(1);
  }
  const claim = readFileSync(claimPath, 'utf8');
  let claimed;
  try {
    claimed = extractClaimedNumbers(claim);
  } catch (err) {
    console.error(`test_numbers_check FAIL: ${err.message} (in ${claimPath})`);
    process.exit(1);
  }

  const drift =
    claimed.tests !== actual.tests ||
    claimed.pass !== actual.pass ||
    claimed.fail !== actual.fail ||
    claimed.skipped !== actual.skipped;

  if (drift) {
    console.error(
      `test_numbers_check FAIL: ${claimPath} claims ${claimed.tests} tests (${claimed.pass} pass / ` +
        `${claimed.fail} fail / ${claimed.skipped} skip) but actual is ${actual.tests} tests ` +
        `(${actual.pass} pass / ${actual.fail} fail / ${actual.skipped} skip) — update the claim ` +
        `to the actual numbers (SSOT = script output), or run with --write.`,
    );
    process.exit(1);
  }

  console.log(
    `test_numbers_check: ok — ${claimPath} ${actual.tests} tests (${actual.pass} pass / ` +
      `${actual.fail} fail / ${actual.skipped} skip) matches actual`,
  );
}
