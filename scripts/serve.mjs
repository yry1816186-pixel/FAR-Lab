/**
 * FAR-Lab API + web workbench standalone launcher (risk-item 7 release-packaging slice).
 *
 * Serves the HTTP API (createApiServer, 33-test contract in tests/api.test.ts) and,
 * when web/dist exists, the React workbench with SPA fallback. Runs on dist — refuses
 * to start on a stale build (D-031 guard parity with the CLI).
 *
 * Usage: node scripts/serve.mjs            (env: PORT=3196, model-provider envs as usual)
 */
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();

// Reuse the compiled D-031 guard (src/cli/dist-freshness.ts) — path-correct src->dist mapping.
const { staleDistFiles } = await import('../dist/cli/dist-freshness.js');
const stale = (() => {
  try { return staleDistFiles(cwd); } catch { return ['(dist missing — run npm run build)']; }
})();
if (stale.length > 0) {
  console.error(`far-serve: dist is stale/missing (${stale.slice(0, 3).join(', ')}${stale.length > 3 ? ' …' : ''}) — run npm run build first (D-031).`);
  process.exit(3);
}

const { createApp } = await import('../dist/app/composition.js');
const { createApiServer } = await import('../dist/server/api.js');

const port = Number(process.env.PORT ?? 3196);
// FARLAB_DATA_DIR mirrors the production entrypoint (dist/server/main.js) so a
// dev server can run against an isolated workspace instead of ./far-run.
const app = await createApp(process.env.FARLAB_DATA_DIR !== undefined ? { dataDir: process.env.FARLAB_DATA_DIR } : {});
// Automations engine on for the dev server too (FARLAB_AUTOMATIONS=off to disable),
// same default as the production entrypoint (dist/server/main.js).
const api = createApiServer(app, { port, automations: { enabled: process.env.FARLAB_AUTOMATIONS !== 'off' } });
let actualPort;
try {
  actualPort = await api.start();
} catch (e) {
  if (e instanceof Error && e.code === 'EADDRINUSE') {
    console.error(`far-serve: port ${port} is already in use — another FAR-Lab server (or other process) is listening on it. Stop that process or set PORT=<other>.`);
    process.exit(4);
  }
  throw e;
}
const webDist = resolve(cwd, 'web', 'dist');
const hasWeb = (() => { try { statSync(resolve(webDist, 'index.html')); return true; } catch { return false; } })();
console.log(`FAR-Lab API listening on http://127.0.0.1:${actualPort}`);
console.log(hasWeb ? `web workbench served from ${webDist}` : 'web workbench NOT built (web/dist absent — API only)');

const shutdown = async () => {
  await api.stop();
  app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
