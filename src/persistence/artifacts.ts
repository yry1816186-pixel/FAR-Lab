import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
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

  /**
   * Collision check for the streaming path: the target exists under `hash`, so it
   * CLAIMS that digest — byte-identity is proven by re-hashing it (a full compare
   * would defeat the point of streaming). Different content under a taken hash is
   * refused exactly like the buffer path.
   */
  const streamEqualsHash = async (file: string, hash: string): Promise<boolean> => {
    const h = createHash('sha256');
    for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
    return h.digest('hex') === hash;
  };

  return {
    async put(payload) {
      const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
      // One implementation of landing semantics (FA-DAT-01): the buffer path is a
      // single-chunk streaming put — collision refusal and atomic rename cannot drift.
      return this.putStream!((async function* () { yield buf; })());
    },
    async putStream(source) {
      const hash = createHash('sha256');
      let size = 0;
      // The final shard path depends on the FULL digest, unknown until the stream
      // ends — stage in an anonymous temp at the store root, then rename into place.
      const tmp = path.join(root, `.incoming-${process.pid}-${randomBytes(6).toString('hex')}`);
      const out = fs.createWriteStream(tmp, { flags: 'wx' });
      try {
        for await (const chunk of source) {
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          hash.update(b);
          size += b.length;
          // Node convention: the write callback receives null on success (and an
          // Error only on failure) — both null and undefined mean "write ok".
          await new Promise<void>((resolve, reject) => {
            out.write(b, (err) => (err === undefined || err === null ? resolve() : reject(err)));
          });
        }
        await new Promise<void>((resolve, reject) => {
          out.end((err?: Error | null) => (err === undefined || err === null ? resolve() : reject(err)));
        });
      } catch (e) {
        out.destroy();
        removeOrphanTemp(tmp); // failed source/write leaves no partial blob behind
        throw e;
      }
      const hex = hash.digest('hex');
      const file = pathOf(hex);
      if (fs.existsSync(file)) {
        removeOrphanTemp(tmp);
        if (!(await streamEqualsHash(file, hex))) {
          throw new Error(`artifact hash collision refused: ${hex} exists with different content`);
        }
        // Byte-identical content already landed — this put is a no-op.
        return { ref: `sha256:${hex}`, hash: hex, size };
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        // Atomic landing (reliability 2026-08-24): a same-directory rename(2) is atomic
        // on POSIX and NTFS, so readers see either the old state or the complete blob —
        // never a partial one. A concurrent put of the same content racing between the
        // existsSync and this rename replaces the target with byte-identical bytes
        // (same hash), so collision-refusal semantics hold either way.
        fs.renameSync(tmp, file);
      } catch (e) {
        removeOrphanTemp(tmp); // best effort — the primary failure below wins
        throw e;
      }
      return { ref: `sha256:${hex}`, hash: hex, size };
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
