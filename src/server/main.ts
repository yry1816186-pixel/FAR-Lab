#!/usr/bin/env node
import { createApp } from '../app/composition.js';
import { createApiServer } from './api.js';

/**
 * HTTP API entrypoint (node dist/server/main.js). Env: PORT (default 8787),
 * HOST (default 127.0.0.1), FARLAB_DATA_DIR (default .far-run — shared with the CLI).
 * Graceful shutdown: SIGINT/SIGTERM -> server.close + db.close.
 */

const parsePort = (): number => {
  const raw = process.env.PORT;
  if (raw === undefined) return 8787;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    process.stderr.write(`far-server: invalid PORT "${raw}" (must be an integer 0-65535)\n`);
    process.exit(2);
  }
  return n;
};

const port = parsePort();
const host = process.env.HOST ?? '127.0.0.1';

const app = await createApp(process.env.FARLAB_DATA_DIR ? { dataDir: process.env.FARLAB_DATA_DIR } : {});
const api = createApiServer(app, { port, host, automations: { enabled: process.env.FARLAB_AUTOMATIONS !== 'off' } });

try {
  const actualPort = await api.start();
  process.stdout.write(
    `far-lab api listening on http://${host}:${actualPort} (api base: /api/v1, data: ${app.dataDir})\n`,
  );
} catch (e) {
  process.stderr.write(`far-server: failed to listen on ${host}:${port}: ${e instanceof Error ? e.message : String(e)}\n`);
  app.close();
  process.exit(1);
}

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`far-server: ${signal} received — closing server and database\n`);
  void api.stop().then(() => {
    app.close();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
