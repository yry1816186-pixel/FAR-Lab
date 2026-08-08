// src/paths.ts
// Repo-root resolution + 跨平台路径工具（P0-1：Windows/Linux/macOS 统一路径语义）。
//
// src/paths.ts lives at depth 1 (src/), so dirname×2 reaches the repo root. The CLI runs
// source-distributed (node src/cli/far.ts; Node 24 native type-stripping), so import.meta.url
// is always src/paths.ts and PACKAGE_ROOT is always the repo root.

import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

/** Constant: PACKAGE_ROOT. */
export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** 当前平台路径分隔符（'\' on Windows / '/' elsewhere）。 */
export const PATH_SEP: string = sep;

/**
 * 统一为 POSIX 风格路径（'\' → '/'）。
 * 用于报告/日志/哈希/比较：同一文件在三平台产出同一字符串，不随平台分隔符漂移。
 * 例：'domains\\a\\b.json' → 'domains/a/b.json'；POSIX 输入原样返回。
 */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 转换为当前平台原生路径（POSIX '/' → 平台分隔符）。
 * Windows 上 'a/b/c' → 'a\\b\\c'；POSIX 上原样。
 */
export function toNativePath(p: string): string {
  if (sep === '/') return p;
  return p.replace(/\//g, sep);
}

/**
 * 安全拼接：拒绝任何含 '..' 目录穿越的段（fail-closed）。
 * 用于将用户输入/外部路径拼到可信根目录之下。
 * @throws 当任何 segment 为绝对路径或含 '..' 段时。
 */
export function safeJoin(root: string, ...segments: readonly string[]): string {
  for (const s of segments) {
    if (s.length === 0) continue;
    if (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s)) {
      throw new Error(`safeJoin: absolute path segment rejected: ${JSON.stringify(s)}`);
    }
    const norm = toPosixPath(s);
    if (norm.split('/').some((part) => part === '..')) {
      throw new Error(`safeJoin: directory traversal segment rejected: ${JSON.stringify(s)}`);
    }
  }
  return join(root, ...segments);
}

/**
 * child 是否位于 parent 目录之内（规范化后比较）。
 * 用于防目录穿越的包含性检查；两者相同返回 true。
 */
export function isSubPath(parent: string, child: string): boolean {
  const p = toPosixPath(parent).replace(/\/+$/, '');
  const c = toPosixPath(child).replace(/\/+$/, '');
  if (c === p) return true;
  return c.startsWith(`${p}/`);
}

/** 跨平台临时目录（os.tmpdir：Windows %TEMP% / POSIX /tmp）。永不硬编码 '/tmp'。 */
export function crossPlatformTmpDir(): string {
  return tmpdir();
}

/** 跨平台用户主目录（os.homedir）。 */
export function crossPlatformHomeDir(): string {
  return homedir();
}
