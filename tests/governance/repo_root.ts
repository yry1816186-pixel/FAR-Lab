// tests/governance/repo_root.ts — 可移植仓库根定位（fileURLToPath 推导，
// 不依赖 cwd——Windows/POSIX/CI 同一路径）。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
