/**
 * benchmark 路由 —— Science-125 完整性广度套件的公开 leaderboard 数据端点。
 *
 * 端点：
 *   GET /benchmark → 返回预生成的 BenchmarkReport（benchmark/benchmark_report.json）。
 *
 * 设计（预生成 JSON·非运行时计算）：
 *   - 报告由 scripts/generate_benchmark.ts 在构建/CI 时确定性生成（fresh-clone 可复现）。
 *   - 端点只读 JSON（快·无状态·不跑 seed）——首次读后模块级缓存。
 *   - JSON 不存在 → 503 SERVICE_UNAVAILABLE + 提示运行 generate（诚实·不返回假数据）。
 *   - JSON 损坏 → 500 INTERNAL_ERROR（type guard 校验失败·fail-fast）。
 *
 * 价值（与 /integrity 互补）：
 *   - /integrity/root 是**单运行**的整链 Merkle 根。
 *   - /benchmark 是**跨运行（所有 Science-125 问题）**的套件级聚合根 + 完整性广度榜。
 *
 * 诚实定位（红线）：leaderboard 展示工程完整性广度，非科学结论排名（见 report.honestyNotes）。
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。JSON 用 type guard 收窄。
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from '../../cli/paths.ts';

import { internalError, serviceUnavailable } from '../errors/error_handler.ts';
import type { BenchmarkReport } from '../../benchmark/types.ts';

/**
 * benchmark_report.json 的绝对路径。
 *
 * 路径推导：本文件 src/api/routes/benchmark.ts → 3 个 '..' 回到 far-chain 根 → benchmark/。
 * 用 import.meta.url 解析（不依赖运行时 cwd·fresh-clone 稳健）。
 */
const REPORT_PATH = resolve(PACKAGE_ROOT, 'benchmark', 'benchmark_report.json');

/** 模块级缓存：JSON 由 generate 脚本重写 → 以文件 mtime 失效（变更后自动重读·无需重启进程）。 */
let cachedReport: BenchmarkReport | null = null;
let cachedMtimeMs = -1;

/**
 * type guard：校验 JSON.parse 产物符合 BenchmarkReport 最小 shape。
 *
 * 不做全字段递归校验（报告由 generate 脚本按 BenchmarkReport 序列化·可信源），
 * 只守 3 个关键字段（schemaVersion / entries / suiteIntegrityRoot）防明显损坏。
 * 用 `in` 操作符收窄，无断言（verification.md：unknown + 收窄）。
 */
function isReportShape(value: unknown): value is BenchmarkReport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value;
  return (
    'schemaVersion' in v &&
    (v.schemaVersion === 1 || v.schemaVersion === 2) &&
    'entries' in v &&
    Array.isArray(v.entries) &&
    'suiteIntegrityRoot' in v &&
    typeof v.suiteIntegrityRoot === 'string'
  );
}

/**
 * 读并缓存 benchmark 报告（fail-fast·损坏抛错而非静默 coerce）。
 *
 * @param reportPath 报告路径（默认 REPORT_PATH·测试可注入不存在路径验 503）
 * @throws {ApiError 503} 报告未生成（提示运行 generate）
 * @throws {ApiError 500} 报告 JSON 损坏 / shape 不符
 */
export function loadReport(reportPath: string = REPORT_PATH): BenchmarkReport {
  // mtime 失效：文件未变 → 返回缓存；文件已变（generate 重写）→ 重读。
  // statSync 放最前（文件不存在 → 503，与历史行为一致）。
  let mtimeMs: number;
  try {
    mtimeMs = statSync(reportPath).mtimeMs;
  } catch (err) {
    throw serviceUnavailable(
      'benchmark report not generated; run `pnpm benchmark:generate` then restart the server',
      { path: reportPath, cause: err instanceof Error ? err.message : String(err) },
    );
  }
  if (cachedReport !== null && mtimeMs === cachedMtimeMs) {
    return cachedReport;
  }

  let text: string;
  try {
    text = readFileSync(reportPath, 'utf8');
  } catch (err) {
    throw serviceUnavailable(
      'benchmark report not generated; run `pnpm benchmark:generate` then restart the server',
      { path: reportPath, cause: err instanceof Error ? err.message : String(err) },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw internalError('benchmark report JSON is unparseable (corrupt file)', {
      path: reportPath,
    });
  }

  if (!isReportShape(parsed)) {
    throw internalError('benchmark report JSON does not match expected shape', {
      path: reportPath,
    });
  }

  cachedReport = parsed;
  cachedMtimeMs = mtimeMs;
  return cachedReport;
}

/**
 * 注册 benchmark 路由。
 */
export async function registerBenchmarkRoute(app: FastifyInstance): Promise<void> {
  // GET /benchmark → Science-125 完整性广度套件报告
  app.get('/benchmark', async (_request, reply) => {
    const report = loadReport();
    return reply.code(200).send(report);
  });
}

/**
 * 测试用：重置模块级缓存（隔离各测试·避免报告文件变更后读到旧缓存）。
 */
export function __resetBenchmarkCache(): void {
  cachedReport = null;
  cachedMtimeMs = -1;
}
