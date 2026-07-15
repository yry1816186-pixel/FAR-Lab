// src/paths.ts
// Bundle-aware package/repo-root resolution, shared across all modules (cli, db, math, …).
//
// src/paths.ts lives at depth 1 (src/), so dirname×2 reaches the repo root in source mode.
// When esbuild bundles every module into dist/far.js, import.meta.url collapses to dist/far.js,
// and dirname×2 reaches the package root instead. One formula, correct in both modes — no
// bundle-detection branch needed. (src/cli/paths.ts re-exports this for the cli surface.)

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
