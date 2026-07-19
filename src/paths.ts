// src/paths.ts
// Repo-root resolution, shared across all modules (cli, db, math, …).
//
// src/paths.ts lives at depth 1 (src/), so dirname×2 reaches the repo root. The CLI runs
// source-distributed (node src/cli/far.ts; Node 24 native type-stripping), so import.meta.url
// is always src/paths.ts and PACKAGE_ROOT is always the repo root.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
