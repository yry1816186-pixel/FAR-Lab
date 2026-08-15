// check-supply-chain.mjs — Supply-chain hardening gate
//
// Enforces:
//   1. Every direct dependency (dependencies + devDependencies) in package.json is
//      pinned to an EXACT version (no ^ or ~ ranges).
//   2. The pnpm-lock.yaml `specifier` for each direct dep matches the exact version
//      declared in package.json (lockfile is the dependency ground truth).
//   3. pnpm.overrides entries are exact-pinned as well (no floating ranges).
//
// Exit code 1 + error list on violation so CI blocks the PR (like pi's pre-commit
// lockfile gate and shrinkwrap allowlist).
//
// Run: node scripts/check-supply-chain.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

const errors = [];
const exactRe = /^\d+(\.\d+){1,2}$/; // semver exact like 11.2.0 (no prerelease handling needed here)
const rangeRe = /^[\^~]/;

function checkExact(name, spec, where) {
  if (typeof spec !== 'string') return;
  if (rangeRe.test(spec)) {
    errors.push(`${where} "${name}": "${spec}" is a range — pin to exact version`);
  } else if (!exactRe.test(spec) && !spec.startsWith('file:')) {
    errors.push(`${where} "${name}": "${spec}" is not a plain exact version`);
  }
}

const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
for (const [name, spec] of Object.entries(allDeps)) {
  checkExact(name, spec, 'dependency');
}

for (const [name, spec] of Object.entries(pkg.pnpm?.overrides ?? {})) {
  checkExact(name, spec, 'pnpm.overrides');
}

// Lockfile specifier ↔ package.json exact-version consistency.
// In pnpm-lock.yaml importers.<workspace>.dependencies|devDependencies each entry has:
//   specifier: <declared spec>
//   version: <resolved>
// For exact pins the specifier must equal the declared exact version.
const importerRe = /^  \.:$/m;
const importerIdx = lock.search(importerRe);
if (importerIdx === -1) {
  errors.push('pnpm-lock.yaml: root importer block not found');
} else {
  const importer = lock.slice(importerIdx);
  for (const [name, spec] of Object.entries(allDeps)) {
    const entryRe = new RegExp(
      `^      '?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?:\\s*$\\n        specifier: (.+)$`,
      'm',
    );
    const m = importer.match(entryRe);
    if (!m) {
      errors.push(`lockfile: no entry for "${name}" in root importer`);
      continue;
    }
    const lockSpec = m[1].replace(/['"]/g, '');
    if (lockSpec !== spec) {
      errors.push(`lockfile specifier mismatch for "${name}": package.json="${spec}" lockfile="${lockSpec}"`);
    }
  }
}

if (errors.length > 0) {
  console.error(`[supply-chain] ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('[supply-chain] OK: all direct deps + overrides exact-pinned, lockfile specifiers consistent.');
