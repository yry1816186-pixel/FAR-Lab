/**
 * file_manifest —— 文件系统清单构建（Ed25519 签名/验证共享·确定性·SSOT）。
 *
 * `far sign <dir>` 与 bundle 签名验证必须用【同一份】清单构建逻辑——任何分歧都会
 * 让签名验证失败（或更糟，绕过）。本模块是那份单一来源。
 *
 * 确定性：按相对路径 code-unit 序排序（跨平台一致·不依赖 locale/ICU）。
 * 安全：拒绝 symlink（防 symlink-swap——清单哈希稳定但磁盘内容被换）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { sha256Hex, type ManifestEntry } from './ed25519.ts';

/** code-unit 序比较（确定性·跨平台）——localeCompare 依赖运行时 locale/ICU 会漂移。 */
function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 递归收集目录内全部常规文件的相对路径清单（确定性·拒绝 symlink）。
 * 抛错于 symlink / 非常规非目录条目（fail-closed·防逃逸）。
 */
export function collectFiles(dir: string, base: string, out: ManifestEntry[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => comparePaths(a.name, b.name));
  for (const entry of sorted) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).replace(/\\/g, '/');
    if (entry.isSymbolicLink()) {
      throw new Error(`file_manifest: symlink not allowed (symlink-swap defense): ${rel}`);
    }
    if (entry.isDirectory()) {
      collectFiles(full, base, out);
    } else if (entry.isFile()) {
      out.push({ path: rel, sha256: sha256Hex(readFileSync(full)) });
    } else {
      throw new Error(`file_manifest: unsupported entry: ${rel}`);
    }
  }
}

/**
 * 从路径构建清单：文件 = 单条目（path='file'）；目录 = 递归（按 path 排序）。
 * 与 `far sign` 的签名输入严格同构——签名/验证共用此函数。
 */
export function buildFileManifest(target: string): ManifestEntry[] {
  const st = statSync(target);
  if (st.isFile()) {
    return [{ path: 'file', sha256: sha256Hex(readFileSync(target)) }];
  }
  const entries: ManifestEntry[] = [];
  collectFiles(target, target, entries);
  return entries.sort((a, b) => comparePaths(a.path, b.path));
}
