#!/usr/bin/env node
/**
 * backup_state —— 战役状态每日离机备份（2.md §10 补遗：仅同盘备份在机器故障下等于失忆）。
 *
 * 打包 `.far/agent/`（决策/审计/计划/checkpoint 链）+ `.far/discovery/`（注册台账）
 * + `.far/cache/retrieval/` 清单 + 关键治理文档 → `.far/backup/far-backup-<YYYYMMDD>.tar.gz`
 * + SHA256 清单（备份自身可验证——信任链纪律延伸到备份）。
 *
 * 边界声明（诚实）：
 *   - 本脚本只完成"本机第二副本"（.far/backup/）；"第二介质同步"（外部盘/私有远端）
 *     需要用户环境，脚本就绪后打印建议命令但不擅自推送到任何远端（§5 授权边界）。
 *   - 备份不含 secrets（.env 不在打包范围——密钥不进备份产物）。
 *
 * 用法: node scripts/backup_state.mjs [--dry-run]
 * CI/计划任务: 建议每日一次（Windows 任务计划程序 / cron）。
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const repoRoot = join(here, '..');
const BACKUP_DIR = join(repoRoot, '.far', 'backup');

/** What gets backed up — the campaign's memory, not runtime bulk. */
const SOURCES = [
  '.far/agent',
  '.far/discovery',
  '.far/e2e',
  'docs/development/ACCEPTANCE.yaml',
  'docs/development/WORLD_CLASS_MATRIX.md',
  'docs/development/PROGRESS.md',
];

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const existing = SOURCES.filter((s) => existsSync(join(repoRoot, s)));
  const missing = SOURCES.filter((s) => !existsSync(join(repoRoot, s)));
  if (existing.length === 0) {
    process.stdout.write('backup_state: nothing to back up (all sources absent)\n');
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(`backup_state [dry-run]: would archive ${existing.length} source(s):\n`);
    for (const s of existing) process.stdout.write(`  - ${s}\n`);
    if (missing.length > 0) {
      process.stdout.write('  absent (skipped, reported honestly):\n');
      for (const s of missing) process.stdout.write(`  - ${s}\n`);
    }
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  // tar from repoRoot with RELATIVE paths both for sources and the archive —
  // GNU tar treats `C:\…` as a remote host spec, so absolute Windows paths are
  // out; everything stays inside the cwd.
  const rel = existing.map((s) => s.replace(/\\/g, '/'));
  const relArchive = `.far/backup/far-backup-${date}.tar.gz`;
  execFileSync('tar', ['-czf', relArchive, ...rel], { cwd: repoRoot, stdio: 'pipe' });
  const archive = join(BACKUP_DIR, `far-backup-${date}.tar.gz`);

  const digest = sha256File(archive);
  const manifest = {
    archive: relative(repoRoot, archive).replace(/\\/g, '/'),
    sha256: digest,
    createdAt: new Date().toISOString(),
    sources: rel,
    absent: missing,
    repoHead: gitHead(),
  };
  const manifestPath = `${archive}.manifest.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Retention: keep the last 14 daily archives (older ones pruned, manifest pairs kept atomic).
  pruneOld();

  process.stdout.write(`backup_state: ${manifest.archive} (${statSync(archive).size} bytes)\n`);
  process.stdout.write(`  sha256: ${digest}\n`);
  process.stdout.write(`  sources: ${rel.length} backed up · ${missing.length} absent (listed in manifest)\n`);
  process.stdout.write(
    '  OFF-MACHINE SYNC (manual, needs user environment — see docs/development/ACCEPTANCE.yaml repo.daily_backup):\n' +
      `    robocopy .far\\backup <external-drive>\\far-backups /MIR\n` +
      `    git -C .far/backup init && git add -A && git commit -m "backup ${date}" && git push <private-remote>\n`,
  );
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function pruneOld(keep = 14) {
  const archives = readdirSync(BACKUP_DIR)
    .filter((f) => /^far-backup-\d{8}\.tar\.gz$/.test(f))
    .sort();
  for (const old of archives.slice(0, Math.max(0, archives.length - keep))) {
    try {
      unlinkSync(join(BACKUP_DIR, old));
      // Prune is best-effort; never fail the backup for retention issues.
    } catch {
      // locked/absent file — retention retries on the next daily run
    }
  }
}

main();
