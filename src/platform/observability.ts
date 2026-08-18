/**
 * observability — ENG-OBS-001 关键操作结构化可观测性（零遥测立场）。
 *
 * 立场：观测 = 本地结构化日志/台账，绝不引入网络上报。本模块：
 *   - CRITICAL_OPERATIONS：关键操作类型清单（写操作/裁决/发布/外部调用四类）
 *     映射到**真实发射点**（既有资产：campaign 事件台账、审计收据链、
 *     supply-chain 签名、llm_gateway 错误面）——checkEmissionPoints 真实
 *     验证发射点文件存在且含声明的标记；
 *   - StructuredEvent：宪法要求的字段（UTC 时间戳/severity/module/相关性 id
 *     （request|trace|campaign|run|step 至少其一）/model-tool-source/mode/
 *     latencyMs/tokenUsage/错误与降级原因/需求与证据引用）+ safe-fields-only
 *     红线（redactEvent 拒绝密钥形状字段值——sk-/ghp_/PEM 头）；
 *   - correlationId 贯穿检查：verifyEventStream 验证同一 trace 的事件序列
 *     具备单调递增 step 序（贯穿完整性）；
 *   - emitEvent(event, sink)：发射到注入的本地 sink（内存/文件由调用方决定），
 *     本模块自身零网络零磁盘。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 本模块证明「事件结构与发射点存在」，不证明所有关键路径实际都发射了
 *     （发射覆盖率需要调用方纪律 + 代码审查，静态检查测不到漏发）；
 *   - correlationId 贯穿检查只验登记流的内部一致性，不证明 id 与真实请求的
 *     对应关系；
 *   - 零遥测立场无法用代码完全自证（无网络调用是承诺面——secret_scan /
 *     依赖审计是独立防线）。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 关键操作四类（宪法 scope：critical-operation 的操作面分类）。 */
export const CRITICAL_OPERATION_KINDS = ['write', 'verdict', 'release', 'external-call'] as const;
export type CriticalOperationKind = (typeof CRITICAL_OPERATION_KINDS)[number];

/** 相关性 id 载荷：request/trace/campaign/run/step 至少其一（宪法列举）。 */
export interface CorrelationIds {
  readonly requestId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly campaignId?: string | undefined;
  readonly runId?: string | undefined;
  readonly stepId?: string | undefined;
}

export const EVENT_SEVERITIES = ['debug', 'info', 'warn', 'error', 'critical'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

/** 运行 mode（与 src/research/schemas.ts runMode 词汇对齐，不另造词表）。 */
export const EVENT_MODES = ['LIVE', 'RECORDED_REPLAY', 'SYNTHETIC_TEST', 'OFFLINE_DEVELOPMENT', 'NOT_EXECUTED'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

/** 结构化事件（宪法字段全覆盖 + safe-fields-only）。 */
export interface StructuredEvent {
  readonly eventId: string;
  readonly operation: string;
  readonly kind: CriticalOperationKind;
  /** UTC ISO 8601 时间戳（调用方注入——本模块零时钟）。 */
  readonly utcTimestamp: string;
  readonly severity: EventSeverity;
  readonly module: string;
  readonly correlation: CorrelationIds;
  /** 模型/工具/来源（无外部调用 → 'none'——显式而非缺失）。 */
  readonly modelToolSource: string;
  readonly mode: EventMode;
  /** 延迟毫秒（不可得 → null——显式而非缺失）。 */
  readonly latencyMs: number | null;
  /** token/资源计量（不可得 → null）。 */
  readonly tokenUsage: { readonly inputTokens: number; readonly outputTokens: number } | null;
  /** 错误/回退/降级原因（无 → null）。 */
  readonly errorFallbackReason: string | null;
  /** 宪法/需求/证据引用（REQ id 或证据路径）。 */
  readonly requirementRefs: readonly string[];
}

/** 关键操作类型 → 真实发射点（存在性 + mustContain 标记由 checkEmissionPoints 验证）。 */
export interface EmissionPoint {
  readonly path: string;
  readonly mustContain: readonly string[];
}

export const CRITICAL_OPERATIONS: Readonly<Record<CriticalOperationKind, readonly EmissionPoint[]>> = {
  write: [
    { path: 'src/campaign/event_log.ts', mustContain: ['appendCampaignEvent', 'eventHash'] },
    { path: 'src/evidence_log', mustContain: ['hashCanonicalJson'] },
    { path: 'src/db', mustContain: ['better-sqlite3'] },
  ],
  verdict: [
    { path: 'src/falsifiability', mustContain: ['R0'] },
    { path: 'src/proof_envelope', mustContain: ['proofHash'] },
  ],
  release: [
    { path: 'src/release/supply_chain.ts', mustContain: ['signFileManifest'] },
    { path: 'src/audit/verify_receipt.ts', mustContain: ['rotation'] },
  ],
  'external-call': [
    { path: 'src/llm_gateway/gateway.ts', mustContain: ['callLlm'] },
    { path: 'src/platform/errors.ts', mustContain: ['ERROR_CLASSES'] },
  ],
};

export interface EmissionCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 目录 → 其下全部 .ts 文本（确定性排序）；文件 → 自身文本。 */
function collectTexts(full: string): string[] {
  if (statSync(full).isFile()) return [readFileSync(full, 'utf8')];
  return readdirSync(full)
    .sort()
    .filter((n) => n.endsWith('.ts'))
    .map((n) => readFileSync(join(full, n), 'utf8'));
}

/**
 * 验证关键操作的发射点真实存在（文件/目录存在；mustContain 标记真实出现在
 * 文本中——目录形态扫描目录内 .ts 文件）。
 */
export function checkEmissionPoints(repoRoot: string): EmissionCheck {
  const problems: string[] = [];
  for (const [kind, points] of Object.entries(CRITICAL_OPERATIONS)) {
    for (const point of points) {
      const full = join(repoRoot, point.path);
      if (!existsSync(full)) {
        problems.push(`${kind}: emission point missing on disk: ${point.path}`);
        continue;
      }
      if (point.mustContain.length === 0) continue;
      const texts = collectTexts(full);
      for (const marker of point.mustContain) {
        if (!texts.some((t) => t.includes(marker))) {
          problems.push(`${kind}: emission point ${point.path} lacks marker "${marker}"`);
        }
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export interface EventValidation {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** 字段级校验（宪法必填面 + 相关性 id 至少其一 + UTC 形态）。 */
export function validateStructuredEvent(e: StructuredEvent): EventValidation {
  const problems: string[] = [];
  if (e.eventId.trim().length === 0) problems.push('eventId must be non-empty');
  if (e.operation.trim().length === 0) problems.push('operation must be non-empty');
  if (!CRITICAL_OPERATION_KINDS.includes(e.kind)) problems.push(`kind must be one of ${CRITICAL_OPERATION_KINDS.join('|')}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(e.utcTimestamp)) {
    problems.push(`utcTimestamp must be UTC ISO 8601 (…Z), got "${e.utcTimestamp}"`);
  }
  if (!EVENT_SEVERITIES.includes(e.severity)) problems.push(`severity must be one of ${EVENT_SEVERITIES.join('|')}`);
  if (e.module.trim().length === 0) problems.push('module must be non-empty');
  if (!EVENT_MODES.includes(e.mode)) problems.push(`mode must be one of ${EVENT_MODES.join('|')}`);
  const hasCorrelation = [e.correlation.requestId, e.correlation.traceId, e.correlation.campaignId, e.correlation.runId, e.correlation.stepId].some(
    (v) => v !== undefined && v.trim().length > 0,
  );
  if (!hasCorrelation) problems.push('correlation must carry at least one of request/trace/campaign/run/step id');
  if (e.latencyMs !== null && !(e.latencyMs >= 0)) problems.push('latencyMs must be >= 0 or null');
  if (e.tokenUsage !== null && (!(e.tokenUsage.inputTokens >= 0) || !(e.tokenUsage.outputTokens >= 0))) {
    problems.push('tokenUsage counts must be >= 0');
  }
  if (e.requirementRefs.length === 0) problems.push('requirementRefs must be non-empty (REQ id or evidence path)');
  return { ok: problems.length === 0, problems };
}

/** 密钥形状检测（safe-fields-only 红线的机器面）。 */
const SECRET_SHAPES = [/^sk-[A-Za-z0-9]{16,}/, /^ghp_[A-Za-z0-9]{20,}/, /^-----BEGIN [A-Z ]*PRIVATE KEY-----/];

/** 单值密钥形状扫描（递归——safe-fields-only 的字段值面）。 */
export function containsSecretShape(value: string): boolean {
  return SECRET_SHAPES.some((re) => re.test(value.trim()));
}

export interface RedactionResult {
  readonly event: StructuredEvent;
  readonly redacted: readonly string[];
  readonly rejected: readonly string[];
}

/**
 * safe-fields-only 消毒：字符串字段值命中密钥形状 → 替换为 '[REDACTED]' 并
 * 记录 redacted；requirementRefs/correlation 中的密钥形状 = 结构污染（这些
 * 字段不该携带自由文本凭据）→ rejected（fail-closed：事件整体拒绝由调用方
 * 决定，本函数如实上报）。
 */
export function redactEvent(e: StructuredEvent): RedactionResult {
  const redacted: string[] = [];
  const rejected: string[] = [];
  const scrub = (field: string, v: string | null | undefined): string | null | undefined => {
    if (typeof v !== 'string') return v;
    if (containsSecretShape(v)) {
      redacted.push(field);
      return '[REDACTED]';
    }
    return v;
  };
  for (const [k, v] of Object.entries(e.correlation)) {
    if (typeof v === 'string' && containsSecretShape(v)) rejected.push(`correlation.${k}`);
  }
  for (const ref of e.requirementRefs) {
    if (containsSecretShape(ref)) rejected.push('requirementRefs');
  }
  const event: StructuredEvent = {
    ...e,
    operation: scrub('operation', e.operation) ?? e.operation,
    module: scrub('module', e.module) ?? e.module,
    modelToolSource: scrub('modelToolSource', e.modelToolSource) ?? e.modelToolSource,
    errorFallbackReason: scrub('errorFallbackReason', e.errorFallbackReason) ?? null,
  };
  return { event, redacted, rejected };
}

/** 本地 sink 接口（零网络：调用方注入内存数组 / 文件追加器）。 */
export interface EventSink {
  accept(event: StructuredEvent): void;
}

/** 内存 sink（测试与进程内聚合用）。 */
export function inMemorySink(): { sink: EventSink; events: StructuredEvent[] } {
  const events: StructuredEvent[] = [];
  return { sink: { accept: (e) => void events.push(e) }, events };
}

/**
 * 发射一个结构化事件（校验 + 消毒 + sink 注入）。密钥形状出现在结构性字段
 * （correlation/requirementRefs）→ 抛错（fail-closed，不发射）。
 */
export function emitEvent(e: StructuredEvent, sink: EventSink): RedactionResult {
  const validation = validateStructuredEvent(e);
  if (!validation.ok) {
    throw new Error(`emitEvent: refusing structurally invalid event ${e.eventId || '<no-id>'}: ${validation.problems.join('; ')}`);
  }
  const redaction = redactEvent(e);
  if (redaction.rejected.length > 0) {
    throw new Error(`emitEvent: secret-shaped values in structural fields (${redaction.rejected.join(', ')}) — event rejected, fix the producer`);
  }
  sink.accept(redaction.event);
  return redaction;
}

export interface StreamCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * correlationId 贯穿检查：同一 traceId 的事件按出现序必须 stepId 单调递增
 * （贯穿完整性）；跨 trace 的 stepId 互不干涉。事件缺失相关性 id → 结构
 * 问题（由 validateStructuredEvent 管，这里跳过前先验一次）。
 */
export function verifyEventStream(events: readonly StructuredEvent[]): StreamCheck {
  const problems: string[] = [];
  const lastStepByTrace = new Map<string, number>();
  for (const e of events) {
    const v = validateStructuredEvent(e);
    if (!v.ok) {
      problems.push(`${e.eventId}: ${v.problems.join('; ')}`);
      continue;
    }
    const trace = e.correlation.traceId;
    if (trace === undefined) continue; // 无 trace 的事件不参与贯穿判定（campaign/run 独立流）
    const step = Number.parseInt(e.correlation.stepId ?? '', 10);
    if (Number.isNaN(step)) {
      problems.push(`${e.eventId}: trace-correlated event needs a numeric stepId for ordering, got "${e.correlation.stepId}"`);
      continue;
    }
    const last = lastStepByTrace.get(trace);
    if (last !== undefined && step <= last) {
      problems.push(`${e.eventId}: stepId ${step} breaks monotonic ordering in trace ${trace} (previous ${last}) — correlation chain broken`);
    }
    lastStepByTrace.set(trace, step);
  }
  return { ok: problems.length === 0, problems };
}
