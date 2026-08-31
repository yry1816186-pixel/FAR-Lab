#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const DEFAULT_SHELL_BUDGET_BYTES = 10_000_000;

const REQUIRED_DYNAMIC_SOURCES = [
  'src/utils/InlineMathFragment.tsx',
  'src/utils/pdfCollect.ts',
  'node_modules/pdfjs-dist/build/pdf.mjs',
  'node_modules/xlsx/xlsx.mjs',
  'src/components/detail/viz/RadarCompare.tsx',
];

const posix = (value) => value.split(path.sep).join('/');

function filesBelow(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) out.push(posix(path.relative(root, full)));
    }
  };
  visit(root);
  return out.sort();
}

function bytesOf(root, rel) {
  return statSync(path.join(root, rel)).size;
}

function addManifestClosure(manifest, key, files, seen) {
  if (seen.has(key)) return;
  seen.add(key);
  const chunk = manifest[key];
  if (chunk === undefined) return;
  if (typeof chunk.file === 'string') files.add(chunk.file);
  for (const css of chunk.css ?? []) files.add(css);
  for (const imported of chunk.imports ?? []) addManifestClosure(manifest, imported, files, seen);
}

/** Inspect one completed Vite dist without trusting hashed filenames. */
export function inspectBundle(distDir, { shellBudgetBytes = DEFAULT_SHELL_BUDGET_BYTES } = {}) {
  const errors = [];
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { status: 'FAIL', errors: ['missing Vite manifest: .vite/manifest.json'] };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = filesBelow(distDir);
  const sizes = new Map(files.map((file) => [file, bytesOf(distDir, file)]));
  const shellFiles = files.filter((file) => !file.startsWith('models/'));
  const shellBytes = shellFiles.reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);

  const maps = files.filter((file) => file.endsWith('.map'));
  if (maps.length > 0) errors.push(`source maps shipped: ${maps.join(', ')}`);
  const misplacedWasm = files.filter((file) => file.endsWith('.wasm') && !file.startsWith('models/'));
  if (misplacedWasm.length > 0) errors.push(`ORT/wasm outside optional models/: ${misplacedWasm.join(', ')}`);
  if (shellBytes >= shellBudgetBytes) {
    errors.push(`application shell ${shellBytes} bytes exceeds <${shellBudgetBytes} budget`);
  }

  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry === true);
  if (entries.length !== 1) errors.push(`expected exactly one browser entry, found ${entries.length}`);
  const initialFiles = new Set(['index.html']);
  const initialKeys = new Set();
  for (const [key] of entries) addManifestClosure(manifest, key, initialFiles, initialKeys);

  const optionalFiles = new Set();
  const directOptionalFiles = new Set();
  for (const source of REQUIRED_DYNAMIC_SOURCES) {
    const chunk = manifest[source];
    if (chunk === undefined) {
      errors.push(`missing optional manifest source: ${source}`);
      continue;
    }
    if (chunk.isDynamicEntry !== true) errors.push(`optional source is not dynamic: ${source}`);
    if (typeof chunk.file === 'string') directOptionalFiles.add(chunk.file);
    for (const css of chunk.css ?? []) directOptionalFiles.add(css);
    for (const asset of chunk.assets ?? []) directOptionalFiles.add(asset);
    const closureKeys = new Set();
    const closureFiles = new Set();
    addManifestClosure(manifest, source, closureFiles, closureKeys);
    for (const file of closureFiles) if (!initialFiles.has(file)) optionalFiles.add(file);
    for (const file of directOptionalFiles) optionalFiles.add(file);
  }

  const legacyPdf = Object.keys(manifest).filter((key) => key.includes('pdfjs-dist/legacy/'));
  if (legacyPdf.length > 0) errors.push(`legacy pdfjs browser runtime emitted: ${legacyPdf.join(', ')}`);
  const modernPdf = Object.keys(manifest).filter((key) => key === 'node_modules/pdfjs-dist/build/pdf.mjs');
  if (modernPdf.length !== 1) errors.push(`expected one modern pdfjs runtime, found ${modernPdf.length}`);

  const workerOptionals = files.filter((file) =>
    /(^|\/)assets\/(?:asr-worker|transformers\.web|pdf\.worker\.min)-/.test(file));
  for (const file of workerOptionals) {
    directOptionalFiles.add(file);
    optionalFiles.add(file);
  }
  if (!workerOptionals.some((file) => file.includes('/asr-worker-'))) errors.push('ASR worker asset missing');
  if (!workerOptionals.some((file) => file.includes('/transformers.web-'))) errors.push('transformers ASR runtime asset missing');

  const optionalInInitial = [...directOptionalFiles].filter((file) => initialFiles.has(file)).sort();
  if (optionalInInitial.length > 0) {
    errors.push(`optional assets entered initial closure: ${optionalInInitial.join(', ')}`);
  }

  const existingInitialFiles = [...initialFiles].filter((file) => sizes.has(file)).sort();
  const initialRawBytes = existingInitialFiles.reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
  const initialGzipBytes = existingInitialFiles.reduce(
    (sum, file) => sum + gzipSync(readFileSync(path.join(distDir, file))).byteLength,
    0,
  );
  const optionalRawBytes = [...optionalFiles]
    .filter((file) => sizes.has(file))
    .reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
  const optionalAssets = [...optionalFiles]
    .filter((file) => sizes.has(file))
    .map((file) => ({ file, bytes: sizes.get(file) ?? 0 }))
    .sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  const largestShellAssets = shellFiles
    .map((file) => ({ file, bytes: sizes.get(file) ?? 0 }))
    .sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file))
    .slice(0, 10);

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    budget: { shellBytes, shellBudgetBytes },
    initial: { rawBytes: initialRawBytes, gzipBytes: initialGzipBytes, files: existingInitialFiles },
    optional: { rawBytes: optionalRawBytes, fileCount: optionalAssets.length, largestAssets: optionalAssets.slice(0, 10) },
    largestShellAssets,
    errors,
  };
}

function main() {
  const distDir = path.resolve(process.cwd(), process.argv[2] ?? 'dist');
  const budgetArg = process.argv[3];
  let options = undefined;
  if (budgetArg !== undefined) {
    const shellBudgetBytes = Number(budgetArg);
    if (!Number.isFinite(shellBudgetBytes)) {
      process.stderr.write(`invalid budget (expected a number, got: ${budgetArg})\n`);
      process.exitCode = 2;
      return;
    }
    options = { shellBudgetBytes };
  }
  const report = inspectBundle(distDir, options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
