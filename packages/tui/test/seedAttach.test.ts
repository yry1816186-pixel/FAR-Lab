/**
 * Seed-attachment tests (node:test, temp files — deterministic).
 * Run: node --experimental-strip-types --test test/seedAttach.test.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSeedFile, SEED_TEXT_MAX } from '../src/seedAttach.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-seed-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('readSeedFile: text file becomes a seed with filename title + full text', () => {
  const file = path.join(tmp, 'notes.md');
  fs.writeFileSync(file, '# 摘要\n结论：X 与 Y 相关。');
  const seed = readSeedFile(file);
  assert.equal(seed.title, 'notes.md');
  assert.deepEqual(seed.identifiers, []);
  assert.match(seed.text, /X 与 Y 相关/);
});

test('readSeedFile: missing file fails with the actionable cause', () => {
  assert.throws(() => readSeedFile(path.join(tmp, 'nope.txt')), /附件不可读/);
});

test('readSeedFile: directory is refused honestly', () => {
  assert.throws(() => readSeedFile(tmp), /不是普通文件/);
});

test('readSeedFile: oversized text is refused (50k contract)', () => {
  const big = path.join(tmp, 'big.txt');
  fs.writeFileSync(big, 'x'.repeat(SEED_TEXT_MAX + 1));
  assert.throws(() => readSeedFile(big), /超过 50000 字符/);
});

test('readSeedFile: empty path is refused', () => {
  assert.throws(() => readSeedFile('   '), /附件路径为空/);
});
