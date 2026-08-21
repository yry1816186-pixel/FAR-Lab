import path from 'node:path';
import fs from 'node:fs';
import { sha256Hex } from '../shared/crypto.js';
import type { ArtifactStore } from '../shared/ports.js';

/** Content-addressed immutable artifact area: artifacts/<2-hex>/<sha256>. Collision => hard error (never overwrite). */
export const openArtifactStore = (rootDir: string): ArtifactStore => {
  const root = path.resolve(rootDir);
  fs.mkdirSync(root, { recursive: true });
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
      const hash = ref.startsWith('sha256:') ? ref.slice(7) : ref;
      if (!/^[0-9a-f]{64}$/.test(hash)) return null;
      try {
        return fs.readFileSync(pathOf(hash), 'utf8');
      } catch {
        return null;
      }
    },
    path: (ref) => pathOf(ref.startsWith('sha256:') ? ref.slice(7) : ref),
  };
};
