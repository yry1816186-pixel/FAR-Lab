#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { verifyReleaseTag } from './release-artifacts-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
try {
  if (!tag) throw new Error('release tag is required');
  const result = verifyReleaseTag(root, tag);
  const objectType = execFileSync('git', ['cat-file', '-t', `refs/tags/${tag}`], { cwd: root, encoding: 'utf8' }).trim();
  if (objectType !== 'tag') throw new Error(`${tag} must be an annotated tag; observed Git object type ${objectType}`);
  console.log(JSON.stringify({ tag, version: result.version, changelog: 'release-dated', annotated: true }, null, 2));
} catch (error) {
  console.error(`release tag check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
