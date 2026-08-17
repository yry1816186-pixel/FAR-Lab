/** Shared filesystem-boundary rules for persistent research runs. */

import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

/**
 * Research-run identifiers are also directory names. Generated ULIDs and the
 * historical stable ids used by replay/evaluation fit this ASCII subset.
 */
export const RESEARCH_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class InvalidResearchRunIdError extends Error {
  constructor() {
    super('research run id must be 1..128 ASCII letters, digits, dot, underscore, or hyphen, starting with a letter or digit');
    this.name = 'InvalidResearchRunIdError';
  }
}

/** Reject path separators, dot segments, empty ids, control chars, and oversized names. */
export function assertValidResearchRunId(runId: string): void {
  if (!RESEARCH_RUN_ID_PATTERN.test(runId)) {
    throw new InvalidResearchRunIdError();
  }
}

/** Error codes Windows can raise while AV/indexers hold a freshly-written file. */
const TRANSIENT_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Max sync retry attempts before the in-place fallback (worst-case wait about 0.6s). */
const RENAME_RETRIES = 5;

/**
 * Rename with Windows-resilient retries. After transient locks exhaust all
 * attempts, copy the already-written temporary content in place. Atomicity is
 * lost in that last-resort branch, but a torn JSON file still fails loudly on
 * its next structurally validated load.
 */
export function renameWithRetry(
  from: string,
  to: string,
  tryRename: (src: string, dest: string) => void = renameSync,
  sleep: (ms: number) => void = (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  },
): void {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RENAME_RETRIES; attempt += 1) {
    try {
      tryRename(from, to);
      return;
    } catch (err) {
      lastError = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !TRANSIENT_RENAME_CODES.has(code)) {
        throw err;
      }
      if (attempt < RENAME_RETRIES) {
        sleep(20 * 2 ** attempt);
      }
    }
  }
  writeFileSync(to, readFileSync(from, 'utf8'), 'utf8');
  try {
    rmSync(from, { force: true });
  } catch {
    // Cleanup is best-effort; the uniquely named temporary file is not reused.
  }
  void lastError;
}
