// src/cli/paths.ts — re-export the shared bundle-aware root + 跨平台路径工具（P0-1）.
// src/cli/commands/* 通过 '../paths.ts' 解析到此文件；保持与顶层 src/paths.ts 单一事实来源。
export {
  PACKAGE_ROOT,
  PATH_SEP,
  toPosixPath,
  toNativePath,
  safeJoin,
  isSubPath,
  crossPlatformTmpDir,
  crossPlatformHomeDir,
} from '../paths.ts';
