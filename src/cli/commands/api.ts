// src/cli/commands/api.ts
// far api —— 启动 FAR-Lab REST API server（Fastify）。
//
// 前端（frontend/）默认连 http://localhost:3000/api/v1（api_client.ts·spec 24）。
// 本命令让全栈一键可跑：`pnpm api`（或 `far api`）起后端，`cd frontend && npm run dev` 起前端。
//
// 默认离线 demo 模式：jwtSecret=null（匿名·无需凭据）+ in-memory DB + 自动种子 demo 裁决
// （C-ASTRO-0001 UNTESTED·legacy 路径不注入统计→R6 不触发），前端启动即见真实裁决数据。生产用 --persist/--protected。

import { startServer } from '../../api/server.ts';
import { openFarDb } from '../../db/open.ts';
import { buildDemoChain } from '../../far_proof/demo_chain.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { resolveRuntimeGateway } from '../../llm_gateway/runtime_gateway.ts';
import { AgentEventBus } from '../../agent_loop/events.ts';

/** Input parameters for operations involving api args. */
export interface ApiArgs {
  readonly port: number;
  readonly host: string;
  readonly dbPath: string;
  readonly seedDemo: boolean;
  readonly jwtSecret: string | null;
}

/**
 * parse api args.
 */
export function parseApiArgs(argv: readonly string[]): ApiArgs {
  let port = 3000;
  let host = '127.0.0.1';
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
    if (a === '--host') {
      host = argv[++i] ?? host;
      continue;
    }
    if (a === '--db') {
      dbPath = argv[++i] ?? dbPath;
      continue;
    }
    if (a === '--persist') {
      dbPath = argv[++i] ?? './FAR-Lab.db';
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
      // FIX-R6-001: 拒绝空/缺失 secret（"" 会致 HS256 空 key 可伪造 admin JWT·F-R6-09-01）。
      // 非空字符串才启用受保护模式；空/缺失 → null（offline 匿名，由 --protected opt-in 控制）。
      jwtSecret =
        typeof process.env.FAR_JWT_SECRET === 'string' && process.env.FAR_JWT_SECRET.length > 0
          ? process.env.FAR_JWT_SECRET
          : null;
      continue;
    }
    throw new Error(`far api: unknown argument "${a}"`);
  }
  if (process.env.PORT !== undefined) {
    const v = parseInt(process.env.PORT, 10);
    if (Number.isFinite(v) && v > 0) port = v;
  }
  return { port, host, dbPath, seedDemo, jwtSecret };
}

/**
 * run api.
 */
export async function runApi(argv: readonly string[]): Promise<number> {
  const args = parseApiArgs(argv);
  // SECURITY（深度对抗轮·fail-closed）：非 loopback 绑定且未启用受保护模式（--protected / FAR_JWT_SECRET）
  // 时拒绝启动。demo 匿名模式（jwtSecret=null）会让任何能访问该端口的请求者匿名写入信任账本
  // （POST /hypothesize 会 append evidence + 跑 verdict kernel）。loopback 默认安全（仅本机）；
  // 一旦 --host 0.0.0.0 / 局域网 IP / 公网，必须显式 --protected 配置 JWT，否则攻击者可投毒账本。
  const isLoopback = args.host === '127.0.0.1' || args.host === 'localhost' || args.host === '::1';
  if (!isLoopback && args.jwtSecret === null) {
    throw new Error(
      `far api: refusing to start in anonymous (open) mode on non-loopback host "${args.host}". ` +
        `Anonymous mode allows unauthenticated writes to the trust ledger (POST /hypothesize). ` +
        `Bind to 127.0.0.1 (default), or set --protected with FAR_JWT_SECRET to require JWT auth.`,
    );
  }
  const db = openFarDb(args.dbPath);
  if (args.seedDemo) {
    buildDemoChain(db);
  }
  const gitCommitSha = resolveGitCommitSha();
  // WS-A.1：运行期解析真实 LLM 网关（FAR_DASHSCOPE_API_KEY/DASHSCOPE_API_KEY 存在 →
  // competition_aliyun_qwen 真实推理；否则 null → server 内 LLM 端点 503 fail-closed（无静默回放）。
  // 模型中立：解析在 llm_gateway 层（本文件无 Qwen/DashScope 字面量）。
  const runtimeGateway = resolveRuntimeGateway(process.env);
  // P0-4 事件流：默认注入 AgentEventBus → /api/v1/events/stream 注册且 hypothesize
  // 运行事件实时推送（此前 far api 不注入 → Events 页在标准全栈部署下永远
  // connecting + console 每 3s 刷 404）。
  const eventBus = new AgentEventBus();
  const app = await startServer(
    { db, gitCommitSha, jwtSecret: args.jwtSecret, eventBus, ...(runtimeGateway === null ? {} : { gateway: runtimeGateway }) },
    args.port,
    args.host,
  );
  const base = `http://localhost:${args.port}`;
  const mode = args.jwtSecret === null ? 'open (anonymous)' : 'protected (jwt)';
  const llm = runtimeGateway === null ? 'not configured (LLM endpoints fail closed 503)' : 'competition_aliyun_qwen (real HTTP·billing applies)';
  process.stderr.write(
    [
      '',
      '  FAR-Lab API server',
      '  ─────────────────────────────────────────────────',
      `  mode     : ${mode}`,
      `  llm      : ${llm}`,
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
