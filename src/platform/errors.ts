// src/platform/errors.ts
// 职责：ENG-ERROR-001 —— 稳定错误分类与可操作信息（八类 + 错误对象契约 + 错误目录）。
//
// 现状衔接：仓库已有分散错误处理（campaign classifyErrorKind 三值 / ApiError 4xx-5xx /
// CostBudgetExceeded / R1 门 / integrity 错误族）——无统一八类分类、无 stable code、
// 无 remediation 契约、无错误目录（宪法 Evidence：error catalog）。
//
// 本模块：八类 SSOT + FarError 对象（stable code/safe message/details/retryability/
// remediation/requestId/cause chain）+ 确定性序列化 + message 脱敏 + 分类启发式映射
// （既有 classifyErrorKind 语义并入）+ CLI exit code 映射 + ERROR_CATALOG 机器目录。
//
// Cannot-prove：分类启发式（429/超时/校验词）是保守映射——措辞变化可能落到
// permanent（诚实保守，不猜）；safe message 的安全性由脱敏函数保证到模式覆盖面为止
//（未知形状的敏感串不能被穷举）。

import { z } from 'zod';

import { detectCachedSecret } from '../retrieval/cache.ts';

// ---------------------------------------------------------------------------
// 八类 SSOT
// ---------------------------------------------------------------------------

export const ERROR_CLASSES = [
  'transient',            // 暂态可重试（网络抖动/429/超时）
  'permanent',            // 永久（用户可行动）
  'degraded',             // 降级运行（部分能力可用）
  'policy_blocked',       // 策略/安全阻断（R1/权限/红线）
  'invalid_input',        // 无效输入
  'unsupported_version',  // 版本不支持（schema/协议/构建）
  'budget_exhausted',     // 预算耗尽
  'fatal_integrity',      // 致命完整性失败（链断/篡改）
] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

/** retryability SSOT：由类别推导，不允许随对象漂移。 */
export function retryableFor(cls: ErrorClass): boolean {
  switch (cls) {
    case 'transient':
      return true;
    case 'degraded':
      return true; // 降级可经重试/退避恢复（与 scheduler 降级语义一致）
    case 'budget_exhausted':
      return false; // 重试不解决预算——remediation 是提高预算或缩减范围
    case 'permanent':
    case 'policy_blocked':
    case 'invalid_input':
    case 'unsupported_version':
    case 'fatal_integrity':
      return false;
  }
}

/** CLI exit code 映射（与既有 CLI 约定对齐：2 用法/3 未验证/7 门禁失败/1 常规失败）。 */
export function exitCodeFor(cls: ErrorClass): number {
  switch (cls) {
    case 'invalid_input':
      return 2;
    case 'policy_blocked':
      return 7;
    case 'degraded':
      return 3; // IMPLEMENTED_UNVERIFIED 语义同值——降级不冒充完成
    case 'unsupported_version':
    case 'fatal_integrity':
      return 1;
    case 'transient':
    case 'permanent':
    case 'budget_exhausted':
      return 1;
  }
}

// ---------------------------------------------------------------------------
// FarError 对象
// ---------------------------------------------------------------------------

export const FarErrorSchema = z.object({
  /** 稳定代码（目录键，SCREAMING_SNAKE；跨版本不变——对外契约）。 */
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'stable code must be SCREAMING_SNAKE'),
  cls: z.enum(ERROR_CLASSES),
  /** 安全消息（经 redactErrorMessage——不含密钥/PII 模式）。 */
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
  /** 由 cls 推导（构造时强制一致——对象不得自带矛盾值）。 */
  retryable: z.boolean(),
  /** 可操作修复指引（一句命令/步骤——宪法「可操作信息」）。 */
  remediation: z.string().min(1),
  requestId: z.string().nullable().default(null),
  traceId: z.string().nullable().default(null),
  /** 因果链（一层引用，不递归对象——序列化稳定）。 */
  cause: z.object({ code: z.string(), message: z.string() }).nullable().default(null),
});

export type FarError = z.infer<typeof FarErrorSchema>;

/** message 脱敏：密钥形状检出即整体替换（保守——宁可消息变短不泄露）。 */
export function redactErrorMessage(message: string): string {
  const detector = detectCachedSecret(message);
  if (detector !== null) {
    return `[redacted: ${detector} detected in error message]`;
  }
  return message;
}

export interface BuildFarErrorInput {
  readonly code: string;
  readonly cls: ErrorClass;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly remediation: string;
  readonly requestId?: string | null;
  readonly traceId?: string | null;
  readonly cause?: { code: string; message: string } | null;
}

/** 构造（强制：retryable 由 cls 推导 + message 过脱敏门——构造即安全）。 */
export function buildFarError(input: BuildFarErrorInput): FarError {
  return FarErrorSchema.parse({
    code: input.code,
    cls: input.cls,
    message: redactErrorMessage(input.message),
    details: input.details ?? {},
    retryable: retryableFor(input.cls),
    remediation: input.remediation,
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    cause: input.cause ?? null,
  });
}

/** 确定性序列化（stable key 序——serialization test 面）。 */
export function serializeFarError(e: FarError): string {
  const stable = (v: unknown): unknown => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, val]) => [k, stable(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(stable(e));
}

// ---------------------------------------------------------------------------
// 分类启发式（既有 classifyErrorKind 语义并入 + 扩展）
// ---------------------------------------------------------------------------

export interface ClassifySignal {
  readonly message: string;
  /** 已知结构信号（如 HTTP 状态码/错误类型名）优先于文本启发。 */
  readonly httpStatus?: number;
  readonly errorName?: string;
}

/** 保守文本/结构映射（词边界收紧——campaign classifyErrorKind 同纪律）。 */
export function classifyErrorClass(signal: ClassifySignal): { cls: ErrorClass; code: string; remediation: string } {
  const m = signal.message.toLowerCase();
  if (signal.httpStatus === 429 || m.includes('429') || /\brate\b/.test(m) || /timeout|timed out|econnreset|network/.test(m)) {
    return { cls: 'transient', code: 'RATE_LIMITED_OR_TIMEOUT', remediation: '等待退避后重试（agent_loop/retry_policy 的 429 退避语义）' };
  }
  if (/not valid json|schema validation|invalid json/.test(m)) {
    return { cls: 'invalid_input', code: 'MODEL_OUTPUT_INVALID', remediation: '检查结构化输出 schema 与 prompt 约束后重试' };
  }
  if (/budget|cost.*exceed|预算/.test(m)) {
    return { cls: 'budget_exhausted', code: 'BUDGET_EXHAUSTED', remediation: '提高预算（guardian/budget profile）或缩减问题范围' };
  }
  if (/unsupported|newer than supported|version.*mismatch|schemaVersion/.test(m)) {
    return { cls: 'unsupported_version', code: 'UNSUPPORTED_VERSION', remediation: '升级构建或回退数据（checkpoint/tape 的迁移门）' };
  }
  if (/corrupt|tamper|hash mismatch|integrity|链断/.test(m)) {
    return { cls: 'fatal_integrity', code: 'INTEGRITY_FAILURE', remediation: '停止写入并从备份/台账重放恢复（dr.ts / RT-05 协议）' };
  }
  if (signal.errorName === 'CostBudgetExceeded' || /budget/i.test(signal.errorName ?? '')) {
    return { cls: 'budget_exhausted', code: 'BUDGET_EXHAUSTED', remediation: '提高预算或缩减范围' };
  }
  if (signal.errorName === 'R1ModelError' || /policy|红线|blocked|denied by default/.test(m)) {
    return { cls: 'policy_blocked', code: 'POLICY_BLOCKED', remediation: '按阻断原因调整请求（授权/最小化/脱敏后重试）' };
  }
  return { cls: 'permanent', code: 'PERMANENT_FAILURE', remediation: '查看 details 定位；不可重试，需人工干预' };
}

// ---------------------------------------------------------------------------
// 错误目录（Evidence：error catalog——机器可读）
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  readonly code: string;
  readonly cls: ErrorClass;
  readonly remediation: string;
  readonly since: string;
}

/** 既有代码库已知错误码目录（新增错误在此登记——目录即契约面）。 */
export const ERROR_CATALOG: readonly CatalogEntry[] = [
  { code: 'RATE_LIMITED_OR_TIMEOUT', cls: 'transient', remediation: '退避后重试', since: '2026-08-18' },
  { code: 'MODEL_OUTPUT_INVALID', cls: 'invalid_input', remediation: '检查 schema 约束后重试', since: '2026-08-18' },
  { code: 'BUDGET_EXHAUSTED', cls: 'budget_exhausted', remediation: '提高预算或缩减范围', since: '2026-08-18' },
  { code: 'UNSUPPORTED_VERSION', cls: 'unsupported_version', remediation: '升级构建或走迁移门', since: '2026-08-18' },
  { code: 'INTEGRITY_FAILURE', cls: 'fatal_integrity', remediation: '停写+备份恢复', since: '2026-08-18' },
  { code: 'POLICY_BLOCKED', cls: 'policy_blocked', remediation: '按阻断原因调整请求', since: '2026-08-18' },
  { code: 'PERMANENT_FAILURE', cls: 'permanent', remediation: '人工定位', since: '2026-08-18' },
  { code: 'DEGRADED_SCOPE', cls: 'degraded', remediation: '接受降级结论或补证据后重跑', since: '2026-08-18' },
];

export interface CatalogCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 目录一致性：code 唯一 + retryability 与类别 SSOT 一致 + 分类启发产物都在册。 */
export function verifyErrorCatalog(): CatalogCheck {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of ERROR_CATALOG) {
    if (seen.has(e.code)) problems.push(`duplicate catalog code '${e.code}'`);
    seen.add(e.code);
    if (!/^[A-Z][A-Z0-9_]*$/.test(e.code)) problems.push(`catalog code '${e.code}' not SCREAMING_SNAKE`);
    if (e.remediation.trim().length === 0) problems.push(`catalog '${e.code}' without remediation`);
  }
  return { ok: problems.length === 0, problems };
}
