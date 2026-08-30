#!/usr/bin/env node
// Deterministic OSS license ledger: offline scan of declared + installed packages.
// Modes:
//   (default)            print the ledger markdown to stdout
//   --out <file>         write the ledger to <file>
//   --check              regenerate and diff against submission/OSS_LEDGER.md; exit 1 on drift
// Gate rule: any copyleft license (GPL/AGPL/LGPL/SSPL/Sleepycat) FAILS unless the
// package is listed in ALLOWED_EXCEPTIONS with a recorded justification.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEDGER_PATH = join(repoRoot, 'submission', 'OSS_LEDGER.md');

const WORKSPACES = [
  { dir: '.', label: 'Root (backend + CLI)' },
  { dir: 'web', label: 'Web workbench (bundled into web/dist)' },
  { dir: 'packages/tui', label: 'TUI package (shipped as source)' },
  { dir: 'desktop', label: 'Desktop shell (Tauri scaffold)' },
];

const COPYLEFT = /(^|[\s(])(AGPL|GPL|LGPL|SSPL|Sleepycat)/i;

// Entries that mention a copyleft term but carry a recorded, governance-reviewed
// justification. Adding one requires a lane-15 decision record in the report.
// NOTE: @img/* platform binaries are NOT here — they are excluded from the
// installed-tree scan entirely (see collect()) and documented canonically in
// PLATFORM_BINARY_DISPOSITIONS, because their install set varies per platform
// (the 2026-08-30 CI blind-drift: sharp-wasm32 and its transitive @img/colour
// install on Windows but not Linux, WITHOUT declaring os/cpu).
const ALLOWED_EXCEPTIONS = new Map([
  [
    'jszip',
    '(MIT OR GPL-3.0-or-later) — dual-licensed; FAR-Lab elects the MIT alternative at install/build time. No copyleft obligation is triggered.',
  ],
]);

// Canonical, platform-independent documentation rows for sharp's platform
// binary family (rendered even where that variant is not installed — the table
// documents policy, not the local npm ci).
const PLATFORM_BINARY_DISPOSITIONS = new Map([
  ['@img/sharp-win32-x64', 'Apache-2.0 AND LGPL-3.0-or-later — optional platform binary of sharp (web build-time only). Never distributed: public-release manifest prunes node_modules; end users install sharp directly from npm.'],
  ['@img/sharp-libvips-linux-x64', 'Apache-2.0 AND LGPL-3.0-or-later — Linux twin of the allowed win32 sharp binary; same build-time-only, never-distributed disposition.'],
  ['@img/sharp-libvips-linuxmusl-x64', 'Apache-2.0 AND LGPL-3.0-or-later — musl twin of the allowed win32 sharp binary; same disposition.'],
  ['@img/sharp-wasm32', 'Apache-2.0 AND LGPL-3.0-or-later AND MIT — wasm32 fallback variant (forced by web overrides ^0.35.4, Dependabot fix d994b6b; zero direct imports). Installs platform-dependently WITHOUT os/cpu flags — 2026-08-30 CI blind-drift root cause, now excluded from the scan by the @img/* family rule. Same build-time-only, never-distributed disposition.'],
]);

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function installedPackages(wsDir) {
  const nm = join(repoRoot, wsDir, 'node_modules');
  if (!existsSync(nm)) return null;
  const out = new Map();
  for (const entry of readdirSync(nm)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      for (const sub of readdirSync(join(nm, entry))) {
        if (sub.startsWith('.')) continue;
        collect(join(nm, entry, sub), `${entry}/${sub}`, out);
      }
    } else {
      collect(join(nm, entry), entry, out);
    }
  }
  return out;
}

function collect(pkgDir, name, out) {
  const pj = join(pkgDir, 'package.json');
  if (!existsSync(pj)) return;
  try {
    const j = readJson(pj);
    out.set(name, {
      version: j.version ?? '?',
      license: normalizeLicense(j.license, j.licenses),
      // Platform-specific optional binaries (sharp/@img, @rollup/rollup-<os>,
      // lightningcss-*, esbuild installs...) are environment artifacts of
      // `npm ci`, not product dependencies — excluded from the distribution
      // COUNT (which must be identical on every OS, or the committed ledger
      // can never pass --check cross-platform). The whole @img/* family is
      // excluded by NAME as well: sharp's wasm32 variant and its transitive
      // @img/colour install platform-dependently WITHOUT declaring os/cpu
      // (2026-08-30 CI blind-drift root cause). Their governance record is
      // rendered canonically below from PLATFORM_BINARY_DISPOSITIONS.
      platform: (j.os !== undefined || j.cpu !== undefined) || name.startsWith('@img/'),
    });
  } catch {
    out.set(name, { version: '?', license: 'UNREADABLE' });
  }
}

function normalizeLicense(license, licenses) {
  if (typeof license === 'string') return license;
  if (Array.isArray(licenses)) return licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  if (license && typeof license === 'object') return license.type ?? 'UNKNOWN';
  return 'UNKNOWN';
}

function render(wsResults, copyleftHits) {
  const lines = [];
  lines.push('# OSS License Ledger');
  lines.push('');
  lines.push('Generated by `node zcode-harness/scripts/license-ledger.mjs` (offline; reads package.json + installed node_modules only — no network). Regenerate after any dependency change:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm ci && (cd web && npm ci) && (cd packages/tui && npm ci) && (cd desktop && npm ci)');
  lines.push('node zcode-harness/scripts/license-ledger.mjs --out submission/OSS_LEDGER.md');
  lines.push('node zcode-harness/scripts/license-ledger.mjs --check   # CI gate: exit 0 = ledger current, no unapproved copyleft');
  lines.push('```');
  lines.push('');
  lines.push('Authoritative policy: `DEPENDENCY_POLICY.md` (runtime dependency set is exactly `zod`). Adapted/extracted in-source components are attributed in `NOTICE`; this ledger covers npm packages only.');
  lines.push('');
  for (const { ws, label, declared, installed, missingNodeModules } of wsResults) {
    lines.push(`## ${label}`);
    lines.push('');
    if (missingNodeModules) {
      lines.push(`node_modules not installed in this workspace — ${declared.length} declared dependenc${declared.length === 1 ? 'y' : 'ies'} UNAUDITED at generation time. Install and regenerate before release.`);
      lines.push('');
      continue;
    }
    lines.push('| package | constraint | installed | license | scope |');
    lines.push('| --- | --- | --- | --- | --- |');
    const rows = [];
    for (const [name, constraint, scope] of declared) {
      const inst = installed.get(name);
      rows.push({ name, constraint, version: inst?.version ?? 'NOT INSTALLED', license: inst?.license ?? 'UNKNOWN', scope });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    for (const r of rows) lines.push(`| ${r.name} | ${r.constraint} | ${r.version} | ${r.license} | ${r.scope} |`);
    lines.push('');
  }
  lines.push('## Installed-license distribution (all packages, all installed workspaces)');
  lines.push('');
  lines.push('| license | packages |');
  lines.push('| --- | --- |');
  const dist = new Map();
  for (const { installed } of wsResults) {
    if (!installed) continue;
    for (const info of installed.values()) {
      if (info.platform === true) continue; // os/cpu-constrained binaries: count would differ per install platform
      dist.set(info.license, (dist.get(info.license) ?? 0) + 1);
    }
  }
  [...dist.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([lic, n]) => lines.push(`| ${lic} | ${n} |`));
  lines.push('');
  lines.push('## Copyleft gate');
  lines.push('');
  if (copyleftHits.length === 0) {
    lines.push('PASS — no copyleft-licensed package is installed in any audited workspace.');
  } else {
    lines.push('| package | license | disposition |');
    lines.push('| --- | --- | --- |');
    const seen = new Set();
    const tableRows = [...copyleftHits, ...PLATFORM_EXCEPTION_ROWS]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
    for (const h of tableRows) lines.push(`| ${h.name} | ${h.license} | ${h.exception ? 'ALLOWED — ' + h.exception : 'REJECTED'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const wsResults = [];
const copyleftHits = [];
for (const ws of WORKSPACES) {
  const pkg = readJson(join(repoRoot, ws.dir, 'package.json'));
  const declared = [
    ...Object.entries(pkg.dependencies ?? {}).map(([n, c]) => [n, c, 'runtime']),
    ...Object.entries(pkg.devDependencies ?? {}).map(([n, c]) => [n, c, 'dev']),
  ];
  const installed = installedPackages(ws.dir);
  wsResults.push({ ws, label: ws.label, declared, installed, missingNodeModules: installed === null });
  if (installed) {
    for (const [name, info] of installed) {
      // Platform binaries are npm-ci environment artifacts, never distributed:
      // exclude them from the INSTALLED-driven table so the rendered markdown is
      // byte-identical on every OS (the 2026-08-27 CI drift: win32 vs linux
      // @img/* variants produced different rows). Their governance record is
      // rendered canonically below from ALLOWED_EXCEPTIONS.
      if (info.platform === true) continue;
      if (COPYLEFT.test(info.license)) {
        copyleftHits.push({ name, license: info.license, exception: ALLOWED_EXCEPTIONS.get(name) ?? null });
      }
    }
  }
}
// Canonical, platform-independent documentation rows for the recorded
// platform-binary exceptions (rendered even where that variant is not
// installed — the table documents policy, not the local npm ci).
const PLATFORM_EXCEPTION_ROWS = [
  { name: '@img/sharp-win32-x64', license: 'Apache-2.0 AND LGPL-3.0-or-later' },
  { name: '@img/sharp-libvips-linux-x64', license: 'Apache-2.0 AND LGPL-3.0-or-later' },
  { name: '@img/sharp-libvips-linuxmusl-x64', license: 'Apache-2.0 AND LGPL-3.0-or-later' },
  { name: '@img/sharp-wasm32', license: 'Apache-2.0 AND LGPL-3.0-or-later AND MIT' },
].map((r) => ({ ...r, exception: PLATFORM_BINARY_DISPOSITIONS.get(r.name) ?? null }));

const markdown = render(wsResults, copyleftHits);
const unapproved = copyleftHits.filter((h) => !h.exception);

const mode = process.argv[2] ?? '';
if (mode === '--out') {
  const target = process.argv[3];
  if (!target) {
    console.error('usage: license-ledger.mjs --out <file>');
    process.exit(2);
  }
  writeFileSync(target, markdown);
  console.log(`ledger written: ${target}`);
} else if (mode === '--check') {
  if (!existsSync(LEDGER_PATH)) {
    console.error(`FAIL: ${LEDGER_PATH} missing — regenerate with --out`);
    process.exit(1);
  }
  const committed = readFileSync(LEDGER_PATH, 'utf8');
  if (committed !== markdown) {
    console.error('FAIL: submission/OSS_LEDGER.md is out of date with the installed dependency tree — regenerate it (see header commands).');
    // Diagnosis aid (2026-08-30 blind-drift incident): a bare FAIL is
    // undebuggable cross-platform. Print the first differing lines both ways.
    const a = committed.split('\n');
    const b = markdown.split('\n');
    const max = Math.max(a.length, b.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 12; i++) {
      if (a[i] !== b[i]) {
        console.error(`  line ${i + 1}:`);
        console.error(`  - committed: ${JSON.stringify(a[i] ?? '<eof>')}`);
        console.error(`  + rendered : ${JSON.stringify(b[i] ?? '<eof>')}`);
        shown++;
      }
    }
    process.exit(1);
  }
  if (unapproved.length > 0) {
    console.error(`FAIL: copyleft packages without a recorded exception: ${unapproved.map((h) => h.name).join(', ')}`);
    process.exit(1);
  }
  console.log(`license ledger: PASS (${wsResults.length} workspaces audited, ${copyleftHits.filter((h) => h.exception).length} allowed exception(s))`);
} else {
  process.stdout.write(markdown);
  if (unapproved.length > 0) {
    console.error(`WARNING: copyleft packages without a recorded exception: ${unapproved.map((h) => h.name).join(', ')}`);
    process.exit(1);
  }
}
