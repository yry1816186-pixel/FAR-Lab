// src/cli/commands/api.ts
// far api —— 启动 FAR-Chain REST API server（Fastify）。
//
// 前端（frontend/）默认连 http://localhost:3000/api/v1（api_client.ts·spec 24）。
// 本命令让全栈一键可跑：`pnpm api`（或 `far api`）起后端，`cd frontend && npm run dev` 起前端。
//
// 默认离线 demo 模式：jwtSecret=null（匿名·无需凭据）+ in-memory DB + 自动种子 demo 裁决
// （C-ASTRO-0001 UNTESTED·legacy 路径不注入统计→R6 不触发），前端启动即见真实裁决数据。生产用 --persist/--protected。

import Database from 'better-sqlite3';
import { startServer } from '../../api/server.ts';
import { runMigrations } from '../../db/migrator.ts';
import { buildDemoChain } from '../../far_proof/demo_chain.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';

export interface ApiArgs {
  readonly port: number;
  readonly dbPath: string;
  readonly seedDemo: boolean;
  readonly jwtSecret: string | null;
}

export function parseApiArgs(argv: readonly string[]): ApiArgs {
  let port = 3000;
  let dbPath = ':memory:';
  let seedDemo = true;
  let jwtSecret: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') {
      const v = parseInt(argv[++i] ?? '', 10);
      if (Number.isFinite(v) && v > 0) port = v;
      continue;
    }
    if (a === '--db') {
      dbPath = argv[++i] ?? dbPath;
      continue;
    }
    if (a === '--persist') {
      dbPath = argv[++i] ?? './far-chain.db';
      continue;
    }
    if (a === '--no-seed') {
      seedDemo = false;
      continue;
    }
    if (a === '--jwt-secret') {
      jwtSecret = argv[++i] ?? null;
      continue;
    }
    if (a === '--protected') {
      jwtSecret = process.env.FAR_JWT_SECRET ?? null;
      continue;
    }
    throw new Error(`far api: unknown argument "${a}"`);
  }
  if (process.env.PORT !== undefined) {
    const v = parseInt(process.env.PORT, 10);
    if (Number.isFinite(v) && v > 0) port = v;
  }
  return { port, dbPath, seedDemo, jwtSecret };
}

export async function runApi(argv: readonly string[]): Promise<number> {
  const args = parseApiArgs(argv);
  const db = new Database(args.dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  if (args.seedDemo) {
    buildDemoChain(db);
  }
  const gitCommitSha = resolveGitCommitSha();
  const app = await startServer({ db, gitCommitSha, jwtSecret: args.jwtSecret }, args.port);
  const base = `http://localhost:${args.port}`;
  const mode = args.jwtSecret === null ? 'offline (anonymous · demo)' : 'protected (jwt)';
  process.stderr.write(
    [
      '',
      '  FAR-Chain API server',
      '  ─────────────────────────────────────────────────',
      `  mode     : ${mode}`,
      `  database : ${args.dbPath}${args.seedDemo ? '  +  demo seed (C-ASTRO-0001 UNTESTED)' : ''}`,
      `  commit   : ${gitCommitSha.slice(0, 12)}`,
      '',
      `  ▶ listening on   ${base}`,
      `    health         ${base}/health`,
      `    openapi        ${base}/documentation/json`,
      `    api v1 root    ${base}/api/v1/verdict`,
      '',
      '  frontend connects here (frontend/src/lib/api_client.ts → localhost:3000).',
      '  press Ctrl+C to stop.',
      '',
    ].join('\n'),
  );
  void app;
  return 0;
}
