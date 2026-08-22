import path from 'node:path';
import fs from 'node:fs';
import { sha256Hex } from '../shared/crypto.js';
import type { ArtifactStore } from '../shared/ports.js';

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
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, buf, { flag: 'wx' });
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
