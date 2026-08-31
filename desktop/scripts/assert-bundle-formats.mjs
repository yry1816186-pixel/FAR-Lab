#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const [rootArg, suffixArg] = process.argv.slice(2);

if (!rootArg || !suffixArg) {
  console.error('usage: node scripts/assert-bundle-formats.mjs <bundle-root> <comma-separated-suffixes>');
  process.exit(2);
}

const root = resolve(rootArg);
const requiredSuffixes = suffixArg.split(',').map((value) => value.trim()).filter(Boolean);
if (requiredSuffixes.length === 0) {
  console.error('at least one non-empty bundle suffix is required');
  process.exit(2);
}

if (!existsSync(root)) {
  console.error(`bundle root does not exist: ${root}`);
  process.exit(1);
}

const files = [];
const pending = [root];
while (pending.length > 0) {
  const directory = pending.pop();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) pending.push(path);
    else if (entry.isFile()) files.push(path);
  }
}

const missing = requiredSuffixes.filter(
  (suffix) => !files.some((path) => path.endsWith(suffix)),
);
if (missing.length > 0) {
  console.error(`missing required bundle suffixes: ${missing.join(', ')}`);
  process.exit(1);
}

const matchedFiles = files
  .filter((path) => requiredSuffixes.some((suffix) => path.endsWith(suffix)))
  .map((path) => relative(root, path))
  .sort();

console.log(JSON.stringify({
  status: 'PASS',
  root,
  requiredSuffixes,
  matchedFiles,
}, null, 2));
