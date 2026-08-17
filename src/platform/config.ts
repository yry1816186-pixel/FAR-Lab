// src/platform/config.ts
// 职责：ENG-CONFIG-001 —— 单一 typed 配置 schema 与来源谱系。
//
// 宪法优先级（高→低）：explicit runtime argument > CLI > environment > config file >
// safe default。约束：敏感字段 mask；未知字段按兼容策略处理；配置变化进入 run
// provenance；实验功能默认 OFF；默认值变化需要行为/成本/风险 diff。
//
// 现状衔接：仓库 env 消费散落 20+ 处（FAR_DASHSCOPE_API_KEY/FAR_RETRIEVAL_CACHE/
// FAR_RESEARCH_RUNS_DIR/…）无 typed schema、无来源谱系、无 mask。本模块建立 SSOT
// 规格表（既有 env 键收编）+ 优先级解析器 + provenance 导出（masked）+ 未知键门。
//
// Cannot-prove：解析器证明「按层优先级取值且敏感值在 provenance 中被 mask」；
// 不证明运行时各消费点都已改走本模块（迁移是渐进的——规格表先行收编事实）。

import { z } from 'zod';

export const CONFIG_LAYERS = ['runtime-arg', 'cli', 'env', 'file', 'default'] as const;
export type ConfigLayer = (typeof CONFIG_LAYERS)[number];

export const CONFIG_TYPES = ['string', 'number', 'boolean'] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];

export const ConfigSpecSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'config key must be ENV_STYLE_UPPER'),
  type: z.enum(CONFIG_TYPES),
  /** safe default（最低层——显式安全，不藏隐式值）。 */
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
  /** 敏感键（provenance 中 mask）。 */
  sensitive: z.boolean().default(false),
  /** 实验功能：默认必须 OFF（宪法）——只能由 runtime-arg/CLI 显式开启。 */
  experimental: z.boolean().default(false),
  description: z.string().min(1),
});

export type ConfigSpec = z.infer<typeof ConfigSpecSchema>;

/** 既有 env 键收编（src/ 实测 grep 2026-08-18；新增键在此登记）。 */
export const CONFIG_SPECS: readonly ConfigSpec[] = [
  { key: 'FAR_DASHSCOPE_API_KEY', type: 'string', defaultValue: '', sensitive: true, experimental: false, description: 'DashScope 模型凭据（缺失时 LLM 端点 fail-closed）' },
  { key: 'FAR_RETRIEVAL_CACHE', type: 'boolean', defaultValue: true, sensitive: false, experimental: false, description: '检索缓存开关（VCR 层）' },
  { key: 'FAR_RETRIEVAL_CACHE_DIR', type: 'string', defaultValue: '.far/cache/retrieval', sensitive: false, experimental: false, description: '检索缓存根目录' },
  { key: 'FAR_RESEARCH_RUNS_DIR', type: 'string', defaultValue: '.far/research-runs', sensitive: false, experimental: false, description: '研究 run 存储根' },
  { key: 'FAR_RESEARCH_MEMORY', type: 'boolean', defaultValue: true, sensitive: false, experimental: false, description: '研究记忆（memory store）开关' },
  { key: 'FAR_SESSION_RECORD', type: 'boolean', defaultValue: false, sensitive: false, experimental: true, description: '会话录制（实验——默认 OFF，仅 runtime-arg/CLI 可开）' },
  { key: 'PORT', type: 'number', defaultValue: 3000, sensitive: false, experimental: false, description: 'API 服务端口' },
  { key: 'CROSSREF_MAILTO', type: 'string', defaultValue: '', sensitive: false, experimental: false, description: 'Crossref 礼貌池邮箱' },
  { key: 'OPENALEX_MAILTO', type: 'string', defaultValue: '', sensitive: false, experimental: false, description: 'OpenAlex 礼貌池邮箱' },
];

export interface ConfigLayerValues {
  readonly runtimeArg?: Record<string, unknown>;
  readonly cli?: Record<string, unknown>;
  readonly env?: Record<string, unknown>;
  readonly file?: Record<string, unknown>;
}

export interface ResolvedConfigEntry {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly source: ConfigLayer;
}

export interface ConfigResolveViolation {
  readonly key: string;
  readonly layer: ConfigLayer;
  readonly message: string;
}

export interface ConfigResolveResult {
  readonly entries: readonly ResolvedConfigEntry[];
  readonly violations: readonly ConfigResolveViolation[];
}

function coerce(raw: unknown, spec: ConfigSpec): { ok: true; value: string | number | boolean } | { ok: false; message: string } {
  if (spec.type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    if (raw === 'true' || raw === '1' || raw === 1) return { ok: true, value: true };
    if (raw === 'false' || raw === '0' || raw === 0) return { ok: true, value: false };
    return { ok: false, message: `expected boolean, got '${String(raw)}'` };
  }
  if (spec.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    if (Number.isFinite(n)) return { ok: true, value: n };
    return { ok: false, message: `expected number, got '${String(raw)}'` };
  }
  if (typeof raw === 'string') return { ok: true, value: raw };
  return { ok: false, message: `expected string, got '${typeof raw}'` };
}

/** 按宪法优先级解析全部规格键（invalid config = violation 列名，fail-closed 由调用方执行）。 */
export function resolveConfig(
  specs: readonly ConfigSpec[] = CONFIG_SPECS,
  layers: ConfigLayerValues,
): ConfigResolveResult {
  const entries: ResolvedConfigEntry[] = [];
  const violations: ConfigResolveViolation[] = [];
  for (const spec of specs) {
    const ordered: readonly [ConfigLayer, Record<string, unknown> | undefined][] = [
      ['runtime-arg', layers.runtimeArg],
      ['cli', layers.cli],
      ['env', layers.env],
      ['file', layers.file],
    ];
    let resolved: ResolvedConfigEntry | undefined;
    for (const [layer, values] of ordered) {
      const raw = values?.[spec.key];
      if (raw === undefined) continue;
      const coerced = coerce(raw, spec);
      if (!coerced.ok) {
        violations.push({ key: spec.key, layer, message: coerced.message });
        continue;
      }
      // 实验开关宪法约束：experimental 键只能被最高两层显式开启——env/file 提供的
      // 「开启值」降级为默认 OFF（实验功能默认 OFF 是红线，不是偏好）
      if (
        spec.experimental &&
        coerced.value === true &&
        layer !== 'runtime-arg' &&
        layer !== 'cli'
      ) {
        violations.push({
          key: spec.key,
          layer,
          message: 'experimental feature cannot be enabled from env/file — use explicit runtime arg or CLI (constitution: 默认 OFF)',
        });
        continue;
      }
      resolved = { key: spec.key, value: coerced.value, source: layer };
      break;
    }
    if (resolved === undefined) {
      resolved = { key: spec.key, value: spec.defaultValue, source: 'default' };
    }
    entries.push(resolved);
  }
  return { entries, violations };
}

// ---------------------------------------------------------------------------
// 未知键门（兼容策略：默认 reject——显式收紧）
// ---------------------------------------------------------------------------

export function checkUnknownKeys(
  providedKeys: readonly string[],
  specs: readonly ConfigSpec[] = CONFIG_SPECS,
): readonly string[] {
  const known = new Set(specs.map((s) => s.key));
  return providedKeys.filter((k) => !known.has(k));
}

// ---------------------------------------------------------------------------
// 来源谱系（provenance——敏感 mask；同层同值 → 同谱系，可复现）
// ---------------------------------------------------------------------------

export interface ConfigProvenanceEntry {
  readonly key: string;
  readonly source: ConfigLayer;
  /** 敏感值一律 '***'（长度也不泄露）；非敏感为解析值。 */
  readonly value: string | number | boolean;
  readonly sensitive: boolean;
}

export function configProvenance(resolved: ConfigResolveResult, specs: readonly ConfigSpec[] = CONFIG_SPECS): readonly ConfigProvenanceEntry[] {
  const byKey = new Map(specs.map((s) => [s.key, s]));
  return resolved.entries.map((e) => {
    const spec = byKey.get(e.key);
    const sensitive = spec?.sensitive ?? false;
    return {
      key: e.key,
      source: e.source,
      value: sensitive ? '***' : e.value,
      sensitive,
    };
  });
}

/** 默认值 diff 面（宪法：默认值变化需要行为/成本/风险 diff——机器可比对两组规格）。 */
export function diffConfigSpecs(before: readonly ConfigSpec[], after: readonly ConfigSpec[]): readonly { key: string; change: string }[] {
  const beforeMap = new Map(before.map((s) => [s.key, s]));
  const changes: { key: string; change: string }[] = [];
  for (const a of after) {
    const b = beforeMap.get(a.key);
    if (b === undefined) {
      changes.push({ key: a.key, change: `added (default=${String(a.defaultValue)})` });
    } else if (b.defaultValue !== a.defaultValue || b.experimental !== a.experimental) {
      changes.push({ key: a.key, change: `default ${String(b.defaultValue)}→${String(a.defaultValue)}${b.experimental !== a.experimental ? ` / experimental ${b.experimental}→${a.experimental}` : ''}` });
    }
  }
  for (const b of before) {
    if (!after.some((a) => a.key === b.key)) {
      changes.push({ key: b.key, change: 'removed' });
    }
  }
  return changes;
}
