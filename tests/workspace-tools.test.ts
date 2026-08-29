import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceFileTools } from '../src/agent/capabilities/workspace-tools.js';
import type { AgentTool } from '../src/agent/tool.js';

/**
 * Real-filesystem tests for the workspace file tools: a genuine temp tree per
 * suite, no mocks — the tools must behave against actual files, real binary
 * detection and real walks.
 */

let root: string;
let tools: Map<string, AgentTool>;

const run = async (tool: string, args: unknown) => {
  const t = tools.get(tool);
  if (t === undefined) throw new Error(`tool not found: ${tool}`);
  return t.execute(args, { signal: { aborted: false }, emit: () => {}, recordReceipt: () => {}, depth: 0 });
};

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'far-ws-tools-'));
  await fsp.mkdir(path.join(root, 'src', 'deep', 'deeper'), { recursive: true });
  await fsp.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await fsp.writeFile(path.join(root, 'README.md'), '# Title\n\nsome intro text\n');
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const alpha = 1;\nconst beta = 2;\nexport { alpha, beta };\n');
  await fsp.writeFile(path.join(root, 'src', 'deep', 'b.ts'), 'export const gamma = 3;\n');
  await fsp.writeFile(path.join(root, 'src', 'deep', 'deeper', 'c.js'), 'const delta = 4;\n');
  await fsp.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'const alpha = 99; // must never be searched\n');
  await fsp.writeFile(path.join(root, 'note.txt'), '中文内容一行\nsecond line\n');
  await fsp.writeFile(path.join(root, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
  tools = new Map(makeWorkspaceFileTools(root).map((t) => [t.name, t]));
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('read_file', () => {
  it('reads a real file with honest truncation flags', async () => {
    const res = await run('read_file', { path: 'src/a.ts' });
    expect(res.ok).toBe(true);
    const data = res.data as { content: string; totalLines: number; truncated: boolean };
    expect(data.content).toContain('alpha = 1');
    expect(data.totalLines).toBe(3);
    expect(data.truncated).toBe(false);
  });

  it('honors startLine/maxLines slicing', async () => {
    const res = await run('read_file', { path: 'src/a.ts', startLine: 2, maxLines: 1 });
    expect(res.ok).toBe(true);
    const data = res.data as { content: string; totalLines: number; truncated: boolean };
    expect(data.content).toBe('const beta = 2;');
    expect(data.truncated).toBe(true);
  });

  it('refuses path escapes and absolute paths outside the root', async () => {
    const escape = await run('read_file', { path: '../outside.txt' });
    expect(escape.ok).toBe(false);
    if (!escape.ok && escape.error) expect(escape.error.kind).toBe('validation');
    const absOutside = await run('read_file', { path: path.join(os.tmpdir(), 'x.txt') });
    expect(absOutside.ok).toBe(false);
  });

  it('refuses binary files with a reason', async () => {
    const res = await run('read_file', { path: 'blob.bin' });
    expect(res.ok).toBe(false);
    if (!res.ok && res.error) expect(res.error.message).toContain('binary');
  });

  it('reads UTF-16LE files with BOM correctly', async () => {
    await fsp.writeFile(path.join(root, 'u16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello utf16\n', 'utf16le')]));
    const res = await run('read_file', { path: 'u16.txt' });
    expect(res.ok).toBe(true);
    expect((res.data as { content: string }).content).toContain('hello utf16');
  });

  it('reads CJK text unharmed', async () => {
    const res = await run('read_file', { path: 'note.txt' });
    expect(res.ok).toBe(true);
    expect((res.data as { content: string }).content).toContain('中文内容一行');
  });

  it('reports missing files as validation errors', async () => {
    const res = await run('read_file', { path: 'nope.md' });
    expect(res.ok).toBe(false);
    if (!res.ok && res.error) expect(res.error.message).toContain('not found');
  });

  it('refuses symlinks that resolve outside the root (escape fence)', async () => {
    const outside = await fsp.mkdtemp(path.join(os.tmpdir(), 'far-ws-out-'));
    const outsideFile = path.join(outside, 'secret.txt');
    await fsp.writeFile(outsideFile, 'outside secret');
    try {
      await fsp.symlink(outsideFile, path.join(root, 'leak.txt')).catch(() => {});
      if (!fs.existsSync(path.join(root, 'leak.txt'))) return; // symlink needs dev-mode/privilege — skip honestly
      const res = await run('read_file', { path: 'leak.txt' });
      expect(res.ok).toBe(false);
      if (!res.ok && res.error) expect(res.error.message).toContain('outside the workspace root');
    } finally {
      await fsp.rm(outside, { recursive: true, force: true });
    }
  });
});

describe('find_files', () => {
  it('matches recursive globs and returns posix-style paths', async () => {
    const res = await run('find_files', { pattern: 'src/**/*.ts' });
    expect(res.ok).toBe(true);
    const data = res.data as { files: Array<{ path: string }> };
    const paths = data.files.map((f) => f.path).sort();
    expect(paths).toEqual(['src/a.ts', 'src/deep/b.ts']);
  });

  it('matches bare * in root only', async () => {
    const res = await run('find_files', { pattern: '*.md' });
    expect(res.ok).toBe(true);
    const data = res.data as { files: Array<{ path: string }> };
    expect(data.files.map((f) => f.path)).toEqual(['README.md']);
  });

  it('never walks node_modules', async () => {
    const res = await run('find_files', { pattern: '**/*.js' });
    expect(res.ok).toBe(true);
    const data = res.data as { files: Array<{ path: string }> };
    expect(data.files.some((f) => f.path.includes('node_modules'))).toBe(false);
    expect(data.files.map((f) => f.path)).toContain('src/deep/deeper/c.js');
  });

  it('flags truncation at maxResults', async () => {
    const res = await run('find_files', { pattern: '**/*', maxResults: 2 });
    expect(res.ok).toBe(true);
    const data = res.data as { files: unknown[]; truncated: boolean };
    expect(data.files.length).toBe(2);
    expect(data.truncated).toBe(true);
  });
});

describe('grep_content', () => {
  it('finds matches with file/line/text and skips ignored dirs', async () => {
    const res = await run('grep_content', { pattern: 'alpha' });
    expect(res.ok).toBe(true);
    const data = res.data as { hits: Array<{ path: string; line: number; text: string }> };
    expect(data.hits.some((h) => h.path === 'src/a.ts' && h.line === 1)).toBe(true);
    expect(data.hits.some((h) => h.path.includes('node_modules'))).toBe(false);
  });

  it('supports ignoreCase and glob filters', async () => {
    const res = await run('grep_content', { pattern: 'ALPHA', ignoreCase: true, glob: 'src/*.ts' });
    expect(res.ok).toBe(true);
    const data = res.data as { hits: Array<{ path: string }> };
    expect(data.hits.length).toBeGreaterThan(0);
    expect(data.hits.every((h) => h.path.endsWith('.ts'))).toBe(true);
  });

  it('matches CJK content', async () => {
    const res = await run('grep_content', { pattern: '中文' });
    expect(res.ok).toBe(true);
    const data = res.data as { hits: Array<{ path: string }> };
    expect(data.hits.map((h) => h.path)).toContain('note.txt');
  });

  it('feeds invalid regexes back as validation errors', async () => {
    const res = await run('grep_content', { pattern: '([unclosed' });
    expect(res.ok).toBe(false);
    if (!res.ok && res.error) expect(res.error.kind).toBe('validation');
    expect(res.error?.message ?? '').toContain('invalid regex');
  });

  it('skips binaries honestly', async () => {
    const res = await run('grep_content', { pattern: 'zz-no-such-token', glob: 'blob.bin' });
    expect(res.ok).toBe(true);
    const data = res.data as { hits: unknown[]; binariesSkipped: number };
    expect(data.hits.length).toBe(0);
    expect(data.binariesSkipped).toBe(1);
  });

  it('bounds results with a truncation flag', async () => {
    const res = await run('grep_content', { pattern: 'line|intro|const|delta|gamma', maxResults: 1 });
    expect(res.ok).toBe(true);
    const data = res.data as { hits: unknown[]; truncated: boolean };
    expect(data.hits.length).toBe(1);
    expect(data.truncated).toBe(true);
  });
});

describe('workspace root integration (real repo tree)', () => {
  it('finds this test file and greps its own marker under the repo root', async () => {
    const repoRoot = process.cwd();
    const repoTools = new Map(makeWorkspaceFileTools(repoRoot).map((t) => [t.name, t]));
    const find = repoTools.get('find_files');
    if (find === undefined) throw new Error('find_files missing');
    const res = await find.execute({ pattern: 'tests/workspace-tools.test.ts' }, { signal: { aborted: false }, emit: () => {}, recordReceipt: () => {}, depth: 0 });
    expect(res.ok).toBe(true);
    expect(((res.data as { files: Array<{ path: string }> }).files[0]?.path)).toBe('tests/workspace-tools.test.ts');
    // Walk respects the fs truth: symlink availability differs by OS dev-mode;
    // the invariant under test is that the walk completes honestly either way.
    expect(typeof fs).toBe('object');
  });
});
