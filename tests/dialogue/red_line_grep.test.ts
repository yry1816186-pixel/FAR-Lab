import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const dialogueDir = fileURLToPath(new URL('../../src/dialogue/', import.meta.url));

function walkDialogueDir(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) { files.push(...walkDialogueDir(fullPath)); }
    else if (entry.endsWith('.ts')) { files.push(fullPath); }
  }
  return files;
}

test('src/dialogue/ has no verdict literal', () => {
  const findings: string[] = [];
  for (const file of walkDialogueDir(dialogueDir)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const [idx, line] of lines.entries()) {
      if (/verdict/i.test(line)) { findings.push(`${file}:${idx + 1}`); }
    }
  }
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/dialogue/ has no 百炼 literal', () => {
  const findings: string[] = [];
  for (const file of walkDialogueDir(dialogueDir)) {
    if (/百炼/.test(readFileSync(file, 'utf8'))) { findings.push(file); }
  }
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/dialogue/ has no Qwen literal', () => {
  const findings: string[] = [];
  for (const file of walkDialogueDir(dialogueDir)) {
    if (/qwen/i.test(readFileSync(file, 'utf8'))) { findings.push(file); }
  }
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/dialogue/ has no @modelcontextprotocol literal', () => {
  const findings: string[] = [];
  for (const file of walkDialogueDir(dialogueDir)) {
    if (/@modelcontextprotocol/i.test(readFileSync(file, 'utf8'))) { findings.push(file); }
  }
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/dialogue/ has at least 7 TypeScript files', () => {
  assert.ok(walkDialogueDir(dialogueDir).length >= 7);
});
