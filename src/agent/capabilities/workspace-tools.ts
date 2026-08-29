import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AgentTool, ToolResult } from '../tool.js';

/**
 * Workspace file tools (extensibility lane): the resident agent's eyes on
 * workspace FILES — bounded read, glob find, and regex grep. The store-backed
 * read tools (list_runs, search_workspace, …) see research objects; these see
 * the actual working tree (source, docs, exports) so file-grounded questions
 * and agent-authored skills can be answered from real files.
 *
 * Discipline:
 * - Root confinement: every path resolves inside `root`; escapes (`..`,
 *   absolute paths outside, symlinks) are rejected before any read.
 * - Bounded scans: file count, depth, per-file size and result count caps with
 *   HONEST truncation flags — never silently complete-looking partial results.
 * - Binary honesty: files sniffed as binary (NUL byte / invalid-UTF-8 ratio)
 *   are skipped with a reason, never returned as mojibake.
 * - No index theater: live directory walks, no persistent "index" that could
 *   drift from disk truth. .gitignore is approximated by a fixed ignore set
 *   (documented) — vendored trees and node_modules stay out of every walk.
 */

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.cache', '.ruff_cache',
  '.playwright-mcp', '.tmp-far-hx-isolated', 'target',
]);

const MAX_WALK_FILES = 20_000;
const MAX_WALK_DEPTH = 16;
const READ_MAX_BYTES = 1024 * 1024;
const GREP_MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface WorkspaceWalkStats {
  filesScanned: number;
  truncated: boolean;
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

/** Resolve a user-supplied path inside `root`; null when it would escape. */
export const resolveInsideRoot = (root: string, rel: string): string | null => {
  const cleaned = rel.trim();
  if (cleaned.length === 0) return null;
  const resolved = path.resolve(root, cleaned);
  const rootNorm = path.resolve(root);
  if (resolved !== rootNorm && !resolved.startsWith(rootNorm + path.sep)) return null;
  return resolved;
};

/** Glob (subset: double-star, `*`, `?`) → anchored RegExp over posix-normalized relative
 * paths. Token-scanned (NOT chained replaces — a replace chain eats the `?` inside the
 * groups it just inserted, which corrupted recursive globs in practice). */
export const globToRegExp = (glob: string): RegExp => {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` (possibly followed by `/`): match any dirs including none.
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
        else { out += '.*'; i += 1; }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
};

/** Recursive bounded walk under `dir`, skipping the ignore set, symlinks and unreadable entries. */
export const walkFiles = async (
  dir: string,
  opts: { onFile: (abs: string, rel: string, sizeBytes: number) => 'continue' | 'stop' },
): Promise<WorkspaceWalkStats> => {
  const stats: WorkspaceWalkStats = { filesScanned: 0, truncated: false };
  const queue: Array<{ abs: string; rel: string; depth: number }> = [{ abs: dir, rel: '', depth: 0 }];
  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(item.abs, { withFileTypes: true });
    } catch {
      continue; // unreadable dir: honest skip, not a walk failure
    }
    for (const entry of entries) {
      if (stats.filesScanned >= MAX_WALK_FILES) { stats.truncated = true; return stats; }
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(item.abs, entry.name);
      const rel = item.rel === '' ? entry.name : `${item.rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (item.depth + 1 > MAX_WALK_DEPTH || DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        queue.push({ abs, rel, depth: item.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const size = await fsp.stat(abs).then((s) => s.size).catch(() => null);
      if (size === null) continue;
      stats.filesScanned += 1;
      if (opts.onFile(abs, rel, size) === 'stop') return stats;
    }
  }
  return stats;
};

/** Decode a buffer honoring UTF-16 BOMs; null when it looks binary. */
export const decodeTextOrBinary = (buf: Buffer): { text: string } | { binary: true } => {
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le') };
    if (buf[0] === 0xfe && buf[1] === 0xff) return { text: buf.subarray(2).swap16().toString('utf16le') };
  }
  if (buf.includes(0)) return { binary: true };
  const text = buf.toString('utf8');
  // Severe mojibake (undecodable UTF-8 sequences) → treat as binary, honestly.
  let bad = 0;
  for (let i = 0; i < text.length && bad < 64; i += 1) {
    if (text.charCodeAt(i) === 0xfffd) bad += 1;
  }
  if (bad >= 64) return { binary: true };
  return { text };
};

export const makeReadFileTool = (root: string): AgentTool => ({
  name: 'read_file',
  description: 'Read a workspace file (text; bounded). Paths are workspace-relative. Returns {path, content, totalLines, truncated}. Binary files and files over 1MB are refused with the reason — use grep_content for targeted lookup instead.',
  inputSchema: z.object({
    path: z.string().min(1).max(500),
    startLine: z.number().int().min(1).max(1_000_000).optional(),
    maxLines: z.number().int().min(1).max(2000).default(400),
  }),
  riskClass: 'read',
  async execute(args): Promise<ToolResult> {
    const { path: rel, startLine, maxLines } = z.object({
      path: z.string().min(1).max(500),
      startLine: z.number().int().min(1).max(1_000_000).optional(),
      maxLines: z.number().int().min(1).max(2000).default(400),
    }).parse(args);
    const abs = resolveInsideRoot(root, rel);
    if (abs === null) return { ok: false, error: { kind: 'validation', message: `path escapes the workspace root: ${rel}` } };
    let stat: fs.Stats;
    try { stat = await fsp.stat(abs); } catch { return { ok: false, error: { kind: 'validation', message: `file not found: ${rel}` } }; }
    if (stat.isDirectory()) return { ok: false, error: { kind: 'validation', message: `path is a directory: ${rel}` } };
    if (stat.size > READ_MAX_BYTES) {
      return { ok: false, error: { kind: 'validation', message: `file is ${stat.size} bytes (over the 1MB read cap): ${rel}` } };
    }
    let buf: Buffer;
    try { buf = await fsp.readFile(abs); } catch (e) {
      return { ok: false, error: { kind: 'execution', message: `unreadable: ${e instanceof Error ? e.message : String(e)}` } };
    }
    const decoded = decodeTextOrBinary(buf);
    if ('binary' in decoded) return { ok: false, error: { kind: 'validation', message: `binary file (refused): ${rel}` } };
    let allLines = decoded.text.split(/\r?\n/);
    // A file ending in a newline yields a phantom empty last element — count real lines.
    if (allLines.length > 1 && allLines[allLines.length - 1] === '') allLines = allLines.slice(0, -1);
    const from = (startLine ?? 1) - 1;
    const slice = allLines.slice(from, from + maxLines);
    const truncated = from + slice.length < allLines.length;
    return {
      ok: true,
      data: { path: toPosix(path.relative(root, abs)), content: slice.join('\n'), totalLines: allLines.length, truncated },
      summary: `${slice.length}/${allLines.length} lines${truncated ? ' (truncated)' : ''}`,
    };
  },
});

export const makeFindFilesTool = (root: string): AgentTool => ({
  name: 'find_files',
  description: 'Find workspace files by glob (supports `**`, `*`, `?`; e.g. `src/**/*.ts`, `*.md`). Bounded walk that skips node_modules/.git/dist/build and symlinks; returns {files:[{path,sizeBytes}], filesScanned, truncated}.',
  inputSchema: z.object({
    pattern: z.string().min(1).max(300),
    maxResults: z.number().int().min(1).max(1000).default(200),
  }),
  riskClass: 'read',
  async execute(args): Promise<ToolResult> {
    const { pattern, maxResults } = z.object({
      pattern: z.string().min(1).max(300),
      maxResults: z.number().int().min(1).max(1000).default(200),
    }).parse(args);
    let re: RegExp;
    try { re = globToRegExp(pattern); } catch {
      return { ok: false, error: { kind: 'validation', message: `invalid glob: ${pattern}` } };
    }
    const files: Array<{ path: string; sizeBytes: number }> = [];
    const stats = await walkFiles(root, {
      onFile: (abs, rel, sizeBytes) => {
        if (!re.test(rel)) return 'continue';
        files.push({ path: rel, sizeBytes });
        return files.length >= maxResults ? 'stop' : 'continue';
      },
    });
    return {
      ok: true,
      data: {
        files,
        filesScanned: stats.filesScanned,
        truncated: files.length >= maxResults || stats.truncated,
        ignoredDirs: [...DEFAULT_IGNORE_DIRS],
      },
      summary: `${files.length} files match '${pattern}'`,
    };
  },
});

export const makeGrepContentTool = (root: string): AgentTool => ({
  name: 'grep_content',
  description: 'Regex search across workspace file CONTENTS (line-level, bounded). Skips binaries and node_modules/.git/dist/build. Optional `glob` filters file paths (`src/**/*.ts`); `ignoreCase` defaults false. Returns {hits:[{path,line,text}], filesSearched, truncated}. Invalid regexes are reported back for fixing.',
  inputSchema: z.object({
    pattern: z.string().min(2).max(500),
    glob: z.string().min(1).max(300).optional(),
    ignoreCase: z.boolean().default(false),
    maxResults: z.number().int().min(1).max(500).default(100),
  }),
  riskClass: 'read',
  async execute(args): Promise<ToolResult> {
    const { pattern, glob, ignoreCase, maxResults } = z.object({
      pattern: z.string().min(2).max(500),
      glob: z.string().min(1).max(300).optional(),
      ignoreCase: z.boolean().default(false),
      maxResults: z.number().int().min(1).max(500).default(100),
    }).parse(args);
    let re: RegExp;
    try { re = new RegExp(pattern, ignoreCase ? 'i' : ''); } catch (e) {
      return { ok: false, error: { kind: 'validation', message: `invalid regex '${pattern}': ${e instanceof Error ? e.message : String(e)}` } };
    }
    const globRe = glob !== undefined ? (() => { try { return globToRegExp(glob); } catch { return null; } })() : null;
    const hits: Array<{ path: string; line: number; text: string }> = [];
    let filesSearched = 0;
    let binariesSkipped = 0;
    let stopped = false;
    const stats = await walkFiles(root, {
      onFile: (abs, rel, sizeBytes) => {
        if (globRe !== null && !globRe.test(rel)) return 'continue';
        if (sizeBytes > GREP_MAX_FILE_BYTES) { binariesSkipped += 1; return 'continue'; }
        let buf: Buffer;
        try { buf = fs.readFileSync(abs); } catch { return 'continue'; }
        const decoded = decodeTextOrBinary(buf);
        if ('binary' in decoded) { binariesSkipped += 1; return 'continue'; }
        filesSearched += 1;
        const lines = decoded.text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (re.test(lines[i]!)) {
            hits.push({ path: rel, line: i + 1, text: lines[i]!.slice(0, 300) });
            if (hits.length >= maxResults) { stopped = true; return 'stop'; }
          }
        }
        return 'continue';
      },
    });
    return {
      ok: true,
      data: {
        hits,
        filesSearched,
        binariesSkipped,
        truncated: stopped || stats.truncated,
      },
      summary: `${hits.length} hits across ${filesSearched} files${stopped ? ' (truncated)' : ''}`,
    };
  },
});

/** All three workspace file tools bound to one root. */
export const makeWorkspaceFileTools = (root: string): AgentTool[] => [
  makeReadFileTool(root),
  makeFindFilesTool(root),
  makeGrepContentTool(root),
];
