import { statSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * D-031 guard: the CLI executes compiled dist/ — a src commit without a rebuild silently
 * runs STALE behavior (live incident 2026-08-22: run_tvan8a died on a 3-value enum that
 * had been fixed in src 30s after the last build). research start/resume refuse to run
 * when any src/*.ts is newer than its dist counterpart (or the counterpart is missing);
 * fail-visible beats silently executing stale compiled code. False positives (e.g. a
 * git checkout refreshing src mtimes) cost one `npm run build`.
 */
export const staleDistFiles = (root = process.cwd()): string[] => {
  const srcRoot = join(root, 'src');
  const distRoot = join(root, 'dist');
  // Distributed trees (packaged desktop sidecar, clean-clone release packs)
  // ship dist without src: with no source to compare against there is no
  // staleness to guard — the D-031 risk ("src edited, dist not rebuilt")
  // cannot exist without src.
  try {
    readdirSync(srcRoot);
  } catch {
    return [];
  }
  const stale: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      const rel = relative(srcRoot, srcPath).replace(/\.ts$/, '.js');
      const distPath = resolve(distRoot, rel);
      let distMtimeMs: number;
      try {
        distMtimeMs = statSync(distPath).mtimeMs;
      } catch {
        stale.push(`${rel} (missing in dist)`);
        continue;
      }
      if (statSync(srcPath).mtimeMs > distMtimeMs) stale.push(rel);
    }
  };
  walk(srcRoot);
  return stale;
};
