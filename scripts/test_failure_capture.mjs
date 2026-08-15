#!/usr/bin/env node
/**
 * test_failure_capture — flaky-test identity capture (b4 lesson: unnamed
 * failures are unclosable; b5 remedy: parse the FULL test log and persist
 * every failing test's NAME + first lines of its error detail).
 *
 * Input format is MEASURED, not guessed (2026-08-15 spec_probe experiment):
 * `pnpm test` runs node's spec reporter —
 *   - summary counts as `ℹ tests N` / `ℹ pass N` / `ℹ fail N` / `ℹ skipped N`
 *   - a trailing analysis section starts with the line `✖ failing tests:`
 *     followed by per-failure blocks:
 *         test at <file>:<line>          (block header)
 *         ✖ <test name> (<duration>ms)   (failure identity)
 *         <indented error detail lines>
 *
 * Usage: node scripts/test_failure_capture.mjs <logfile> [--out-dir .far/logs]
 * Exit codes: 0 = log parsed (0 failures → clean report) · 2 = missing/empty log.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_DETAIL_LINES = 15;

function parseArgs(argv) {
  const logFile = argv.find((a) => !a.startsWith('--'));
  let outDir = '.far/logs';
  const idx = argv.indexOf('--out-dir');
  if (idx !== -1 && argv[idx + 1] !== undefined) outDir = argv[idx + 1];
  return { logFile, outDir };
}

/** Parse the spec-reporter log into counts + named failure blocks. */
export function parseSpecLog(raw) {
  const lines = raw.split(/\r?\n/);
  const counts = {};
  for (const line of lines) {
    const m = line.match(/^[ℹ#] (tests|pass|fail|skipped|cancelled|todo) (\d+)\s*$/u);
    if (m !== null) counts[m[1]] = Number(m[2]);
  }

  const failures = [];
  const marker = lines.findIndex((l) => l.includes('failing tests:'));
  if (marker !== -1) {
    let current = null;
    let detailCount = 0;
    for (let i = marker + 1; i < lines.length; i += 1) {
      const line = lines[i];
      const header = line.match(/^(?:test|suite) at (\S+)/);
      const name = line.match(/^✖ (.+?) \(\d+(?:\.\d+)?(m?s)\)$/u);
      if (header !== null) {
        if (current !== null) failures.push(current);
        current = { at: header[1], name: null, detail: [] };
        detailCount = 0;
        continue;
      }
      if (current !== null && name !== null && current.name === null) {
        current.name = name[1];
        continue;
      }
      if (current !== null) {
        if (line.trim().length === 0) {
          // A blank line inside the analysis section ends the error object —
          // keep scanning; the next `test at` opens the next block.
          continue;
        }
        if (detailCount < MAX_DETAIL_LINES) {
          current.detail.push(line);
          detailCount += 1;
        }
      }
    }
    if (current !== null && current.name !== null) failures.push(current);
    // Header-only trailing blocks (name never arrived) are dropped — an
    // unnamed block cannot be an identity.
    return { counts, failures };
  }

  // Fallback: stream-only logs (no analysis section) — collect unique ✖ names.
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*✖ (.+?) \(\d+(?:\.\d+)?m?s\)$/u);
    if (m !== null && !seen.has(m[1])) {
      seen.add(m[1]);
      failures.push({ at: '(stream)', name: m[1], detail: [] });
    }
  }
  return { counts, failures };
}

function main() {
  const { logFile, outDir } = parseArgs(process.argv.slice(2));
  if (logFile === undefined || !existsSync(logFile) || readFileSync(logFile, 'utf8').trim() === '') {
    process.stderr.write(
      `test_failure_capture: need a non-empty log file (usage: node scripts/test_failure_capture.mjs <logfile>)\n`,
    );
    process.exit(2);
  }
  const raw = readFileSync(logFile, 'utf8');
  const { counts, failures } = parseSpecLog(raw);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `failures-${stamp}.md`);

  const countLine = (key) => (counts[key] !== undefined ? `${key}=${counts[key]}` : `${key}=n/a`);
  const header = [
    `# 测试失败身份档案 · ${now.toISOString()}`,
    ``,
    `- 来源日志: \`${logFile}\``,
    `- 计数: ${countLine('tests')} · ${countLine('pass')} · ${countLine('fail')} · ${countLine('skipped')}`,
    `- 失败身份数: ${failures.length}`,
    ``,
  ].join('\n');

  if (failures.length === 0) {
    writeFileSync(
      outPath,
      header + `## 结论：无失败（clean）\n\n日志中未发现 \`✖\` 失败块——若日志非 spec reporter 格式，计数行为 n/a 即为指示。\n`,
      'utf8',
    );
    console.log(`test_failure_capture: CLEAN — 0 failures (${outPath})`);
    process.exit(0);
  }

  const body = failures
    .map((f, i) => {
      const detail = f.detail.length > 0 ? f.detail.map((l) => `    ${l}`).join('\n') : '    (no detail lines captured)';
      return `## ${i + 1}. ${f.name}\n\n- at: \`${f.at}\`\n\n\`\`\`\n${detail}\n\`\`\`\n`;
    })
    .join('\n');

  writeFileSync(outPath, header + body, 'utf8');
  console.log(`test_failure_capture: ${failures.length} failure(s) identified → ${outPath}`);
  for (const f of failures) console.log(`  ✖ ${f.name}`);
  process.exit(0);
}

// Run as CLI only when invoked directly (import guard for tests).
if (process.argv[1] !== undefined && process.argv[1].replaceAll('\\', '/').endsWith('test_failure_capture.mjs')) {
  main();
}
