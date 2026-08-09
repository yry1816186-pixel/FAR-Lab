#!/usr/bin/env node
/**
 * generate_openapi.mjs — R-15 契约基础设施：从 Fastify 实例导出 OpenAPI 3.0 JSON。
 *
 * 契约 SSOT：src/api/routes/v2_receipts_schemas.ts（zod schema）→ Fastify route schema → app.swagger()。
 * 本脚本把运行时 swagger 产物落盘为 schema/openapi.json，作为前端 mock 生成器与契约漂移检测的源。
 *
 * 机制：构建 buildServer（in-memory DB + migrations，offline 模式·jwtSecret=null）→ app.swagger()
 *   → 确定性序列化（2 空格缩进 + 末尾换行）→ 写 schema/openapi.json。不监听端口、不发 HTTP 请求。
 *
 * 确定性：swagger 输出来自静态 route schema + 静态 openapi.info（无时间戳/无 host），同代码树产出字节稳定，
 *   支持 --check 漂移门禁（CI 阻断「route schema 改了但 openapi.json 忘记重生成」的契约漂移）。
 *
 * 用法：
 *   node scripts/generate_openapi.mjs            生成/覆盖 schema/openapi.json
 *   node scripts/generate_openapi.mjs --check    漂移检查：重算与盘上字节比对，drift → exit 1
 *   node scripts/generate_openapi.mjs --out <p>  指定输出路径（测试用）
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言 / 桩代码。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { buildServer } from '../src/api/server.ts';
import { runMigrations } from '../src/db/migrator.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(REPO_ROOT, 'schema', 'openapi.json');

/**
 * 构建 OpenAPI 3.0 spec（in-memory DB·offline·不监听）。
 * DB 仅用于满足 buildServer 的路由注册依赖；swagger 导出不触发任何 DB 查询。
 */
async function buildOpenApiSpec() {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  try {
    const app = await buildServer({
      db,
      gitCommitSha: 'openapi-gen',
      jwtSecret: null,
      logger: false,
    });
    try {
      // app.swagger() 须在 ready 后调用（插件 spec 钩子在 ready 阶段挂载）；inject 隐式触发 ready，直接调用则需显式 await。
      await app.ready();
      return app.swagger();
    } finally {
      await app.close();
    }
  } finally {
    db.close();
  }
}

/**
 * 确定性序列化：2 空格缩进 + 末尾换行（字节稳定，支持 --check 比对）。
 */
function serializeSpec(spec) {
  return JSON.stringify(spec, null, 2) + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1] === undefined) {
    throw new Error('--out requires a value');
  }
  const outPath = outIdx !== -1 ? args[outIdx + 1] : DEFAULT_OUT;

  const spec = await buildOpenApiSpec();
  const content = serializeSpec(spec);

  if (check) {
    if (!existsSync(outPath)) {
      console.log('[DRIFT] openapi.json: missing on disk (run: node scripts/generate_openapi.mjs)');
      return 1;
    }
    const onDisk = readFileSync(outPath, 'utf8');
    if (onDisk === content) {
      console.log('[OK] openapi.json');
      return 0;
    }
    console.log('[DRIFT] openapi.json: on-disk differs from server swagger output (rerun: node scripts/generate_openapi.mjs)');
    return 1;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf8');
  console.log(`[GEN] ${outPath}`);
  return 0;
}

// 仅在直接执行时运行 main（被 import 时不运行，便于单测 buildOpenApiSpec/serializeSpec）。
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { buildOpenApiSpec, serializeSpec, DEFAULT_OUT };
