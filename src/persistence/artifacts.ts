import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../shared/crypto.js';
import type { ArtifactStore } from '../shared/ports.js';

/** Best-effort removal of an orphaned put-temp: ENOENT is the happy path, any other
 *  cleanup failure is made visible on stderr but never masks the primary error. */
const removeOrphanTemp = (p: string): void => {
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`far-artifacts: orphan temp cleanup failed (${path.basename(p)}): ${e.message}\n`);
    }
  }
};

/** Content-addressed immutable artifact area: artifacts/<2-hex>/<sha256>. Collision => hard error (never overwrite). */
export const openArtifactStore = (rootDir: string): ArtifactStore => {
  const root = path.resolve(rootDir);
  fs.mkdirSync(root, { recursive: true });
  const HASH_RE = /^[0-9a-f]{64}$/;
  // Hash-format gate on the shared resolver (Wave-G WP2): path() previously accepted
  // any string, so a malformed ref could path-join outside the content-addressed layout.
  const resolveHash = (ref: string): string => {
    const hash = ref.startsWith('sha256:') ? ref.slice(7) : ref;
    if (!HASH_RE.test(hash)) throw new Error(`artifact ref is not a sha256 hash: ${ref}`);
    return hash;
  };
  const pathOf = (hash: string) => path.join(root, hash.slice(0, 2), hash);

  return {
    async put(payload) {
      const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
      const hash = sha256Hex(buf);
      const file = pathOf(hash);
      if (fs.existsSync(file)) {
        const existing = fs.readFileSync(file);
        if (!existing.equals(buf)) {
          throw new Error(`artifact hash collision refused: ${hash} exists with different content`);
        }
      } else {
        // Atomic landing (reliability 2026-08-24): writeFileSync('wx') directly at the
        // content-addressed path is NOT crash-atomic — a process death mid-write leaves
        // a truncated blob that get() would silently return as the artifact (only the
        // bundle-verify path hashes content; fullText/revise-archive readers trust it).
        // Write a temp sibling, then rename into place: same-directory rename(2) is
        // atomic on POSIX and NTFS, so readers see either the old state or the complete
        // blob — never a partial one.
        const tmp = path.join(path.dirname(file), `.${hash}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        try {
          fs.writeFileSync(tmp, buf, { flag: 'wx' });
        } catch (e) {
          removeOrphanTemp(tmp); // ENOSPC/EPERM can leave a partial temp behind
          throw e;
        }
        try {
          // Concurrent put of the same content racing between our existsSync and this
          // rename: the target is replaced with byte-identical content (same hash), so
          // the collision-refusal semantics above are preserved either way.
          fs.renameSync(tmp, file);
        } catch (e) {
          removeOrphanTemp(tmp); // best effort — the primary failure below wins
          throw e;
        }
      }
      return { ref: `sha256:${hash}`, hash, size: buf.length };
    },
    async get(ref) {
      let hash: string;
      try {
        hash = resolveHash(ref);
      } catch {
        return null; // malformed ref = absent artifact (not an FS error)
      }
      try {
        return fs.readFileSync(pathOf(hash), 'utf8');
      } catch (e) {
        // Only genuine absence maps to null; an unreadable-but-present artifact
        // (permissions, EMFILE, encoding) must surface as an error — verify reports
        // it as unreadable instead of silently treating it as missing.
        if (e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    path: (ref) => pathOf(resolveHash(ref)),
  };
};
