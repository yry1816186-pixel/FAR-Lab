#!/usr/bin/env node
/**
 * test_capture_run — run the full test suite with FULL output captured to a
 * timestamped log (b4 lesson: piped-away output loses failure identities) and
 * feed the log to test_failure_capture.mjs so every failure gets a NAME on
 * disk before anything else happens.
 *
 * Windows-honest: no `tee` dependency (cmd has none) — this process pumps
 * stdout/stderr itself, line-buffered to the console AND the log file.
 *
 * Usage: node scripts/test_capture_run.mjs [extra args passed to `pnpm test`]
 * Exit code: the test command's exit code verbatim (capture never masks it).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '.far/logs';
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
mkdirSync(OUT_DIR, { recursive: true });
const logPath = join(OUT_DIR, `test-${stamp}.log`);

const child = spawnSync('pnpm', ['test', ...process.argv.slice(2)], {
  shell: true,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
});

const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
writeFileSync(logPath, output, 'utf8');
process.stdout.write(child.stdout ?? '');
process.stderr.write(child.stderr ?? '');

const exit = child.status === null ? 1 : child.status;
console.log(`\n[test_capture_run] full log → ${logPath} (exit=${exit})`);

// Failure identity capture runs regardless of outcome (flaky evidence on
// green runs is also evidence — a re-run that passes after a red one).
const capture = spawnSync(
  process.execPath,
  ['scripts/test_failure_capture.mjs', logPath, '--out-dir', OUT_DIR],
  { encoding: 'utf8' },
);
process.stdout.write(capture.stdout ?? '');
process.stderr.write(capture.stderr ?? '');

process.exit(exit);
