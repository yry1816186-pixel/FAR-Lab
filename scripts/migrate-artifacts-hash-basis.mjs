// One-shot migration: re-store W1 source artifacts under the volatile-excluded canonical
// payload (the basis bundle sourceArtifactHashes address). Data-preserving: reads existing
// full-payload artifacts, prunes per family, re-puts under the pruned hash.
// Usage: node scripts/migrate-artifacts-hash-basis.mjs <runId>
import fs from 'node:fs';
import path from 'node:path';

const runId = process.argv[2];
if (!runId) { console.error('usage: node scripts/migrate-artifacts-hash-basis.mjs <runId>'); process.exit(2); }

const { createApp } = await import('../dist/app/composition.js');
const { excludeVolatile } = await import('../dist/sources/snapshot.js');
const { canonicalJson } = await import('../dist/shared/crypto.js');

const app = await createApp();
const docs = app.store.listObjects('source_document', runId);
console.log(`run ${runId}: ${docs.length} source documents`);

// index every artifact file by its full content hash
const artifactsRoot = path.join(app.dataDir, 'artifacts');
const byHash = new Map();
for (const dir of fs.readdirSync(artifactsRoot)) {
  const d = path.join(artifactsRoot, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    const buf = fs.readFileSync(path.join(d, f));
    const { createHash } = await import('node:crypto');
    byHash.set(createHash('sha256').update(buf).digest('hex'), buf.toString('utf8'));
  }
}
console.log(`artifact store: ${byHash.size} files indexed`);

let migrated = 0;
for (const doc of docs) {
  // find the full-payload artifact whose pruned form hashes to doc.contentHash
  let found = null;
  for (const content of byHash.values()) {
    try {
      const parsed = JSON.parse(content);
      for (const family of ['openalex', 'arxiv', 'crossref']) {
        const { createHash } = await import('node:crypto');
        const h = createHash('sha256').update(canonicalJson(excludeVolatile(family, parsed))).digest('hex');
        if (h === doc.contentHash) { found = { family, content: canonicalJson(excludeVolatile(family, parsed)) }; break; }
      }
      if (found) break;
    } catch { /* not JSON */ }
  }
  if (found) {
    await app.artifacts.put(found.content);
    migrated++;
  } else {
    console.error(`MISS: ${doc.id} (${doc.family}) contentHash=${doc.contentHash.slice(0, 16)}… no prunable artifact found`);
  }
}
console.log(`migrated ${migrated}/${docs.length}`);
app.close();
process.exitCode = migrated === docs.length ? 0 : 1;
