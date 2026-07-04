// src/cli/commands/verify.ts
// 职责：`far verify` 子命令 —— 第三方独立重算验证器（FI-9 · 04§5）。
// 设计 SSOT：PROJECT_PLAN/04 §5（命令族 + 10 字段 schema + exit code）+ 01 §5（P0 验收：评委本机重算）。
// 运行时 SSOT 以本文件源码 + far verify 实测为准。
//
// 设计（与 SSOT 对齐的裁决·见 plans/jiggly-squishing-tide.md）：
//   - 纯收集器 + IO 壳分层（镜像 status.ts 的 collectStatusDump + runStatus）：
//       verifyEnvelopeV2 / verifyChainHeadResult / checkAntiTheaterReportConsistency /
//       diffAntiTheaterReport / verifyAntiTheaterLint / collectVerifyDump 为纯函数（不 IO·可直接单测），
//       runVerify 负责 IO + 渲染 + exit code。
//   - --envelope <path>：ProofEnvelopeV2 JSON 文件（D1·评委侧最自然输入载体）。
//       parseProofEnvelopeV2 做结构校验（D3·非裸 as·守卫 + 下游 try/catch 安全网）。
//   - --db <path>：evidence_log DB（chain/full 模式·verifyChainHead·L2）。
//   - --mode chain|envelope|full（D2·默认从 flags 推断：仅 --envelope→envelope；仅 --db→chain；两者→full）。
//   - --lint-input <path>（#11b·04 §5.3 L5·加性轴·须配合 --envelope）：
//       AntiTheaterLintInput JSON → parseAntiTheaterLintInput 骨架校验 → runAntiTheaterLint 20-detector 独立重算 →
//       diffAntiTheaterReport 与 envelope 内嵌 antiTheaterReport 深度对比；任何发散 → FAIL。
//       verifiedLevels 透明披露 'antiTheaterLint'（不动 recomputation 三轴·保 §5.2 哈希重算契约）。
//   - exit 0 PASS / 7 FAIL / 2 arg / 1 runtime（D6）。far verify 是 CLI 首个 verdict-bearing 命令（引入 exit 7）。
//   - recomputation.python 调 Python proof_hash.py 镜像重算；browser = not-run（D7·诚实口径·反 overclaim）。
//
// 诚实边界（R2·反 overclaim）：
//   envelope 模式验封存信封自洽（proofHash 重算 + 10 规则 + 内嵌 anti-theater 报告一致性）；
//   --lint-input 提供时独立重算 20 detector 原始证据（#11b），否则不重算。
//   verifier 不校验 lint-input 与 envelope 的语义对齐（评委须自行保证 lint-input 确是封存时那份 input）。
//
// 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量，纯确定性重算。
// 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。untrusted 输入经结构守卫 + try/catch 安全网。

import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runAntiTheaterLint } from '../../anti_theater/lint.ts';
import { parseAntiTheaterLintInput } from '../../anti_theater/schemas.ts';
import type { AntiTheaterLintInput, AntiTheaterReport } from '../../anti_theater/types.ts';
import { hashCanonicalJson } from '../../evidence_log/hasher.ts';
import { verifyChainHead } from '../../evidence_log/verifier.ts';
import { verifyFarProofBundle, type BundleVerifyResult } from '../../far_proof/bundle_verifier.ts';
import { verifyProofHashV2 } from '../../proof_envelope/v2/proof_hash.ts';
import type { ProofCheckResultV2, ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import { summarizeChecksV2, validateProofEnvelopeV2 } from '../../proof_envelope/v2/validator.ts';
import type { ProofCheckOutcome, Verdict } from '../../schema/enums.ts';

// ===== 常量 =====

const HEX64 = /^[0-9a-f]{64}$/;
const PROOF_ENVELOPE_V2_SCHEMA = 'far.proof_envelope.v2';
const VALID_MODES = new Set<string>(['chain', 'envelope', 'full']);
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REPRO_PYTHON_DIR = fileURLToPath(new URL('../../../repro/far_chain_repro/', import.meta.url));
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

/** far verify 模式（04 §5.1·D2）。VALID_MODES 为运行时校验集合（单一来源）。 */
export type VerifyMode = 'chain' | 'envelope' | 'full';

// ===== 公开类型（10 字段 schema · 04 §5.2）=====

export type VerifyStatus = 'PASS' | 'FAIL' | 'WARN';
export type TamperStatus = 'clean' | 'tampered' | 'n/a';
export type ScopeStatus = 'full' | 'degraded' | 'n/a';
export type RecomputeAxis = 'pass' | 'fail' | 'not-run';

/** recomputation 三轴（04 §5.2）：node=TS proofHash 重算；python=Python 镜像；browser=后续 Web Crypto。 */
export interface RecomputationStatus {
  readonly node: RecomputeAxis;
  readonly python: RecomputeAxis;
  readonly browser: RecomputeAxis;
}

/** verifier 实际执行的校验层（04 §5.3 verifiedLevels 子集·透明披露）。 */
export type VerifiedLevel = 'bundle' | 'chain' | 'proofEnvelope' | 'pythonProofHash' | 'antiTheaterLint';

/** far verify 10 字段输出 schema（04 §5.2）。 */
export interface VerifyDump {
  readonly status: VerifyStatus;
  readonly verdict: Verdict | null;
  readonly proofHash: string | null;
  readonly ledgerRoot: string | null;
  readonly tamperStatus: TamperStatus;
  readonly scopeStatus: ScopeStatus;
  readonly recomputation: RecomputationStatus;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly verifiedLevels: readonly VerifiedLevel[];
}

/** envelope 校验结果（纯收集器产物·--explain 渲染用 checks）。 */
export interface EnvelopeVerifyResult {
  readonly proofHashOk: boolean;
  readonly verdict: Verdict;
  readonly proofHash: string;
  readonly ledgerRoot: string;
  readonly tamperStatus: TamperStatus;
  readonly scopeStatus: ScopeStatus;
  readonly checks: readonly ProofCheckResultV2[];
  readonly checkSummary: Record<'PASS' | 'WARN' | 'FAIL' | 'SKIP', number>;
  readonly antiTheaterConsistent: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Python ProofEnvelope proofHash 镜像重算结果（RULE-PE-010 跨语言轴）。 */
export interface PythonProofHashRecomputeResult {
  readonly axis: RecomputeAxis;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** chain 校验结果（包 verifyChainHead）。 */
export interface ChainVerifyResult {
  readonly ok: boolean;
  readonly brokenAtSeq: number | null;
  readonly verifiedCount: number;
}

/** anti-theater lint 重算结果（纯收集器产物·--lint-input 轴·04 §5.3 L5）。 */
export interface LintRecomputeResult {
  /** runAntiTheaterLint + diff 是否成功执行（深层结构损坏/抛错 → false）。 */
  readonly recomputedOk: boolean;
  /** 重算报告（recomputedOk=true 时有值·--explain 渲染用）。 */
  readonly recomputedReport?: AntiTheaterReport;
  /** 与 envelope 内嵌报告的发散列表（统一前缀 'anti-theater lint divergence:'）。 */
  readonly divergences: readonly string[];
  /** 重算执行中产生的 error 消息（parser 错误在 runVerify 外层处理·此处为 runAntiTheaterLint/diff 抛错）。 */
  readonly errors: readonly string[];
}

// ===== 纯收集器（可直接单测·不 IO）=====

/**
 * parseProofEnvelopeV2 —— untrusted JSON → ProofEnvelopeV2 结构校验（D3）。
 * 校验 schemaVersion 守卫 + proofHash 64-hex + 13 VC 字段存在性与 primitive 类型。
 * 深层语义/自洽委托 validateProofEnvelopeV2（10 规则）+ verifyProofHashV2（proofHash 重算）。
 */
export function parseProofEnvelopeV2(
  raw: unknown,
): { readonly ok: true; readonly envelope: ProofEnvelopeV2 } | { readonly ok: false; readonly error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '根节点须为 JSON 对象' };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== PROOF_ENVELOPE_V2_SCHEMA) {
    return {
      ok: false,
      error: `schemaVersion 须为 "${PROOF_ENVELOPE_V2_SCHEMA}"（实际: ${JSON.stringify(obj.schemaVersion)}）— V1 或未知 schema 暂不支持`,
    };
  }
  if (typeof obj.proofHash !== 'string' || !HEX64.test(obj.proofHash)) {
    return { ok: false, error: 'proofHash 须为 64 字符小写 hex' };
  }

  // 13 VC 字段存在性 + primitive 类型（深层语义校验由 validator + proofHash 担保）。
  const structErrors: string[] = [];
  if (!isPlainObject(obj.claim)) structErrors.push('claim 须为对象');
  if (typeof obj.fecHash !== 'string') structErrors.push('fecHash 须为 string');
  if (!isPlainObject(obj.fecSnapshot)) structErrors.push('fecSnapshot 须为对象');
  if (!isPlainObject(obj.protocolFreeze)) structErrors.push('protocolFreeze 须为对象');
  if (!Array.isArray(obj.datasetBindings)) structErrors.push('datasetBindings 须为数组');
  if (!Array.isArray(obj.workflowBindings)) structErrors.push('workflowBindings 须为数组');
  if (!Array.isArray(obj.experimentRuns)) structErrors.push('experimentRuns 须为数组');
  if (!Array.isArray(obj.measurementResults)) structErrors.push('measurementResults 须为数组');
  if (!Array.isArray(obj.statisticalResults)) structErrors.push('statisticalResults 须为数组');
  if (!isPlainObject(obj.verdictTrace)) structErrors.push('verdictTrace 须为对象');
  if (!isPlainObject(obj.antiTheaterReport)) structErrors.push('antiTheaterReport 须为对象');
  if (typeof obj.ledgerRoot !== 'string') structErrors.push('ledgerRoot 须为 string');
  if (structErrors.length > 0) {
    return { ok: false, error: `封存信封结构不完整: ${structErrors.join('; ')}` };
  }

  // 单层 as 经结构守卫保证（零容忍 #1：untrusted 输入不裸 cast）。
  // raw 仍为 unknown → unknown as T 是合法单层断言；上方守卫已保证 13 VC 字段存在与 primitive 类型，
  // 深层字段缺失由 verifyEnvelopeV2 的 try/catch 安全网捕获为 FAIL（非静默错误）。
  return { ok: true, envelope: raw as ProofEnvelopeV2 };
}

/**
 * checkAntiTheaterReportConsistency —— 内嵌 antiTheaterReport 自洽（D4·P0）。
 * 校验 hasFail/failCount/warnCount 与 findings 的 outcome 计数一致（防伪造报告：hasFail=false 却含 FAIL finding）。
 * canSealConfirmed 三重条件依赖 score/block severity，留 #11b 全检测重算时校验。
 */
export function checkAntiTheaterReportConsistency(report: AntiTheaterReport): {
  readonly consistent: boolean;
  readonly warnings: readonly string[];
} {
  const warnings: string[] = [];
  const failCount = report.findings.filter((f) => f.outcome === 'FAIL').length;
  const warnCount = report.findings.filter((f) => f.outcome === 'WARN').length;

  if (report.hasFail !== (failCount > 0)) {
    warnings.push(`antiTheaterReport.hasFail=${report.hasFail} 与 findings 中 FAIL 计数(${failCount})不一致`);
  }
  if (report.failCount !== failCount) {
    warnings.push(`antiTheaterReport.failCount=${report.failCount} 与实际 FAIL 计数(${failCount})不一致`);
  }
  if (report.warnCount !== warnCount) {
    warnings.push(`antiTheaterReport.warnCount=${report.warnCount} 与实际 WARN 计数(${warnCount})不一致`);
  }

  return { consistent: warnings.length === 0, warnings };
}

/**
 * verifyEnvelopeV2 —— envelope 独立重算（L4·RULE-PE-010）+ 10 规则 + 内嵌 anti-theater 自洽。
 * 纯函数（不 IO·不 spawn）。untrusted envelope 的深层字段缺失由 try/catch 安全网捕获为 FAIL。
 */
export function verifyEnvelopeV2(envelope: ProofEnvelopeV2): EnvelopeVerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // proofHash 独立重算（L4·RULE-PE-010）。verifyProofHashV2 内部已 try/catch fecHash/NaN 断言 → 返回 false。
  const proofHashOk = verifyProofHashV2(envelope);

  // 10 规则（含 RULE-PE-007 verdict↔hasFail、RULE-PE-010 independently_recomputable）。
  // validator 假设 in-process 合法结构；untrusted 反序列化 envelope 深层字段缺失可能抛 TypeError，
  // 此处 try/catch 安全网（非掩盖 bug·错误进 errors[]·status FAIL）。
  let checks: readonly ProofCheckResultV2[];
  try {
    checks = validateProofEnvelopeV2(envelope);
  } catch (error) {
    checks = [];
    errors.push(`validator 因结构异常中止: ${errorMessage(error)}`);
  }

  for (const check of checks) {
    if (check.outcome === 'FAIL') {
      errors.push(`${check.ruleId}(${check.ruleName}): ${check.detail}`);
    } else if (check.outcome === 'WARN') {
      warnings.push(`${check.ruleId}(${check.ruleName}): ${check.detail}`);
    }
  }
  if (!proofHashOk) {
    errors.push('proofHash 重算不匹配（封存信封被篡改或 fecHash 与 fecSnapshot 不一致）');
  }

  // anti-theater 内嵌报告自洽（D4·P0：验内嵌报告一致性，非 20-detector 原始重算·#11b）。
  const consistency = checkAntiTheaterReportConsistency(envelope.antiTheaterReport);
  if (!consistency.consistent) {
    errors.push(...consistency.warnings);
  }

  const verdict = envelope.verdictTrace.verdict;
  return {
    proofHashOk,
    verdict,
    proofHash: envelope.proofHash,
    ledgerRoot: envelope.ledgerRoot,
    tamperStatus: proofHashOk ? 'clean' : 'tampered',
    scopeStatus: envelope.verdictTrace.scopeReport.isDegraded ? 'degraded' : 'full',
    checks,
    checkSummary: summarizeChecksV2(checks),
    antiTheaterConsistent: consistency.consistent,
    errors,
    warnings,
  };
}

/**
 * verifyEnvelopeV2WithPython —— 调 repro/far_chain_repro/proof_hash.py 重算 proofHash。
 * 这是 IO/spawn 轴，故不放进 verifyEnvelopeV2 纯收集器；Python 不可用时 not-run + warning。
 */
export function verifyEnvelopeV2WithPython(envelope: ProofEnvelopeV2): PythonProofHashRecomputeResult {
  const pyCode = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(REPRO_PYTHON_DIR)})`,
    'from proof_hash import verify_proof_hash_v2',
    'env = json.loads(sys.stdin.read())',
    'print("true" if verify_proof_hash_v2(env) else "false")',
  ].join('\n');
  const result = spawnSync(PYTHON_CMD, ['-c', pyCode], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(envelope),
    timeout: 10_000,
  });

  if (result.error !== undefined) {
    return {
      axis: 'not-run',
      errors: [],
      warnings: [`Python proofHash verifier not-run: failed to spawn ${PYTHON_CMD}: ${result.error.message}`],
    };
  }
  if (result.status !== 0) {
    return {
      axis: 'fail',
      errors: [`Python proofHash verifier exited ${result.status ?? '?'}: ${tail(`${result.stderr ?? ''}\n${result.stdout ?? ''}`)}`],
      warnings: [],
    };
  }

  const stdout = (result.stdout ?? '').trim();
  if (stdout === 'true') {
    return { axis: 'pass', errors: [], warnings: [] };
  }
  if (stdout === 'false') {
    return {
      axis: 'fail',
      errors: ['Python proofHash verifier reported mismatch'],
      warnings: [],
    };
  }
  return {
    axis: 'fail',
    errors: [`Python proofHash verifier returned unexpected output: ${tail(stdout)}`],
    warnings: [],
  };
}

/** verifyChainHeadResult —— 包 verifyChainHead（L2·call_records 链头验证）。 */
export function verifyChainHeadResult(db: Database.Database): ChainVerifyResult {
  const result = verifyChainHead(db);
  return {
    ok: result.ok,
    brokenAtSeq: result.brokenAtSeq,
    verifiedCount: result.verifiedCount,
  };
}

/**
 * diffAntiTheaterReport —— 重算报告 vs envelope 内嵌报告深度对比（决策 B·#11b）。
 * 按 attackKind 比较 findings outcome map + 4 VC 标量严格相等 + META（仅 embedded 存在才比）。
 * 任何 divergence → consistent:false（L5 verifier：独立重算必须逐位复现否则 FAIL）。
 * 纯函数（不 IO·可直接单测）。
 */
export function diffAntiTheaterReport(
  recomputed: AntiTheaterReport,
  embedded: AntiTheaterReport,
): { readonly consistent: boolean; readonly divergences: readonly string[] } {
  const divergences: string[] = [];

  // 1. attackKind → 最严 outcome map（recomputed 权威·20 detector 顺序固定；同 kind 取严防御 forged 重复）。
  const recomputedMap = buildOutcomeMap(recomputed.findings);
  const embeddedMap = buildOutcomeMap(embedded.findings);
  const allKinds = new Set<string>([...recomputedMap.keys(), ...embeddedMap.keys()]);
  for (const kind of allKinds) {
    const r = recomputedMap.get(kind);
    const e = embeddedMap.get(kind);
    if (r === undefined) {
      divergences.push(
        `anti-theater lint divergence: attackKind '${kind}' missing in recomputed (embedded=${e})`,
      );
    } else if (e === undefined) {
      divergences.push(
        `anti-theater lint divergence: attackKind '${kind}' missing in embedded (recomputed=${r})`,
      );
    } else if (r !== e) {
      divergences.push(
        `anti-theater lint divergence: attackKind '${kind}' outcome mismatch (embedded=${e}, recomputed=${r})`,
      );
    }
  }

  // 2. 4 VC 标量严格相等（findings 聚合自洽性）。
  if (recomputed.hasFail !== embedded.hasFail) {
    divergences.push(
      `anti-theater lint divergence: aggregate hasFail mismatch (embedded=${embedded.hasFail}, recomputed=${recomputed.hasFail})`,
    );
  }
  if (recomputed.failCount !== embedded.failCount) {
    divergences.push(
      `anti-theater lint divergence: aggregate failCount mismatch (embedded=${embedded.failCount}, recomputed=${recomputed.failCount})`,
    );
  }
  if (recomputed.warnCount !== embedded.warnCount) {
    divergences.push(
      `anti-theater lint divergence: aggregate warnCount mismatch (embedded=${embedded.warnCount}, recomputed=${recomputed.warnCount})`,
    );
  }
  if (recomputed.llmOverrideRejected !== embedded.llmOverrideRejected) {
    divergences.push(
      `anti-theater lint divergence: llmOverrideRejected mismatch (embedded=${embedded.llmOverrideRejected}, recomputed=${recomputed.llmOverrideRejected})`,
    );
  }

  // 3. META（仅当 embedded 存在才比·向后兼容早期 envelope predating META）。
  if (embedded.antiTheaterScore !== undefined && recomputed.antiTheaterScore !== embedded.antiTheaterScore) {
    divergences.push(
      `anti-theater lint divergence: antiTheaterScore mismatch (embedded=${embedded.antiTheaterScore}, recomputed=${recomputed.antiTheaterScore})`,
    );
  }
  if (embedded.canSealConfirmed !== undefined && recomputed.canSealConfirmed !== embedded.canSealConfirmed) {
    divergences.push(
      `anti-theater lint divergence: canSealConfirmed mismatch (embedded=${embedded.canSealConfirmed}, recomputed=${recomputed.canSealConfirmed})`,
    );
  }
  if (embedded.verdictConstraint !== undefined) {
    // verdictConstraint 嵌套对象 → canonical hash 字符串比较（避免手写 deep-equal·对 reasonCodes 顺序稳健）。
    const recomputedHash = hashCanonicalJson({ verdictConstraint: recomputed.verdictConstraint });
    const embeddedHash = hashCanonicalJson({ verdictConstraint: embedded.verdictConstraint });
    if (recomputedHash !== embeddedHash) {
      divergences.push(
        `anti-theater lint divergence: verdictConstraint mismatch (embedded=${embeddedHash.slice(0, 8)}, recomputed=${recomputedHash.slice(0, 8)})`,
      );
    }
  }

  return { consistent: divergences.length === 0, divergences };
}

/**
 * verifyAntiTheaterLint —— 跑 runAntiTheaterLint 重算 + 与 envelope 内嵌报告 diff（纯收集器·#11b）。
 * runAntiTheaterLint 与 diff 均包 try/catch 安全网（深层结构损坏 → 重算中止 FAIL·非崩溃）。
 */
export function verifyAntiTheaterLint(
  envelope: ProofEnvelopeV2,
  lintInput: AntiTheaterLintInput,
): LintRecomputeResult {
  try {
    const recomputedReport = runAntiTheaterLint(lintInput);
    const { divergences } = diffAntiTheaterReport(recomputedReport, envelope.antiTheaterReport);
    return { recomputedOk: true, recomputedReport, divergences, errors: [] };
  } catch (error) {
    // runAntiTheaterLint 或 diff 抛错（parseAntiTheaterLintInput 骨架未拦的深层损坏·如 fec.threshold 缺失
    // 触发 detector TypeError）→ 重算中止，recomputedOk=false（dump errors → status FAIL）。
    return {
      recomputedOk: false,
      divergences: [],
      errors: [`anti-theater lint 重算中止: ${errorMessage(error)}`],
    };
  }
}

/**
 * collectVerifyDump —— 合成 10 字段 schema（04 §5.2）。
 * status：任一 error（proofHash 失配/FAIL 规则/anti-theater 不自洽/链断/lint 发散或中止）→ FAIL；
 *         仅 warning → WARN；否则 PASS。
 */
export function collectVerifyDump(
  envelopeResult: EnvelopeVerifyResult | undefined,
  chainResult: ChainVerifyResult | undefined,
  lintResult: LintRecomputeResult | undefined,
  pythonResult: PythonProofHashRecomputeResult | undefined = undefined,
  bundleResult: BundleVerifyResult | undefined = undefined,
): VerifyDump {
  const errors: string[] = [];
  const warnings: string[] = [];
  const verifiedLevels: VerifiedLevel[] = [];

  let verdict: Verdict | null = null;
  let proofHash: string | null = null;
  let ledgerRoot: string | null = null;
  let tamperStatus: TamperStatus = 'n/a';
  let scopeStatus: ScopeStatus = 'n/a';
  let nodeRecompute: RecomputeAxis = 'not-run';
  let pythonRecompute: RecomputeAxis = 'not-run';

  if (bundleResult !== undefined) {
    verifiedLevels.push('bundle');
    if (bundleResult.chainRan) {
      verifiedLevels.push('chain');
      ledgerRoot = bundleResult.chain.chainHead;
    }
    if (bundleResult.proofEnvelopeRan) {
      verifiedLevels.push('proofEnvelope');
    }
    tamperStatus = bundleResult.ok ? 'clean' : 'tampered';
    nodeRecompute = bundleResult.ok ? 'pass' : 'fail';
    errors.push(...bundleResult.errors);
    warnings.push(...bundleResult.warnings);
  }

  if (envelopeResult !== undefined) {
    verifiedLevels.push('proofEnvelope');
    verdict = envelopeResult.verdict;
    proofHash = envelopeResult.proofHash;
    ledgerRoot = envelopeResult.ledgerRoot;
    tamperStatus = envelopeResult.tamperStatus;
    scopeStatus = envelopeResult.scopeStatus;
    nodeRecompute = envelopeResult.proofHashOk ? 'pass' : 'fail';
    errors.push(...envelopeResult.errors);
    warnings.push(...envelopeResult.warnings);
  }

  if (pythonResult !== undefined) {
    pythonRecompute = pythonResult.axis;
    if (pythonResult.axis !== 'not-run') {
      verifiedLevels.push('pythonProofHash');
    }
    errors.push(...pythonResult.errors);
    warnings.push(...pythonResult.warnings);
  }

  if (chainResult !== undefined) {
    verifiedLevels.push('chain');
    if (!chainResult.ok) {
      errors.push(
        `call_records 链断于 seq=${chainResult.brokenAtSeq ?? '?'}（已验证 ${chainResult.verifiedCount} 条）`,
      );
    } else if (envelopeResult === undefined) {
      // chain 模式无 envelope：ledgerRoot 须由 envelope 提供，此处透明披露为 null。
      warnings.push(`chain 验证通过（verifiedCount=${chainResult.verifiedCount}）；ledgerRoot/verdict 须由 envelope 提供`);
    }
  }

  if (lintResult !== undefined) {
    // 04 §5.3 L5 透明披露：发散 + 重算中止均进 errors → status FAIL（独立重算必须逐位复现否则拒绝）。
    verifiedLevels.push('antiTheaterLint');
    errors.push(...lintResult.divergences);
    errors.push(...lintResult.errors);
  }

  const status: VerifyStatus = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';

  return {
    status,
    verdict,
    proofHash,
    ledgerRoot,
    tamperStatus,
    scopeStatus,
    recomputation: { node: nodeRecompute, python: pythonRecompute, browser: 'not-run' },
    errors,
    warnings,
    verifiedLevels,
  };
}

// ===== IO 壳（runVerify·镜像 status.ts）=====

export interface VerifyOptions {
  readonly bundlePath?: string;
  readonly envelopePath?: string;
  readonly dbPath?: string;
  readonly lintInputPath?: string;
  readonly mode: VerifyMode;
  readonly json: boolean;
  readonly explain: boolean;
}

/**
 * runVerify —— IO 编排：载入输入 → 纯收集器 → 渲染 → exit code。
 * @returns 0 PASS / 7 FAIL / 2 arg / 1 runtime（D6）。
 */
export function runVerify(options: VerifyOptions): number {
  const { mode } = options;
  if (options.bundlePath !== undefined) {
    if (options.envelopePath !== undefined || options.dbPath !== undefined || options.lintInputPath !== undefined) {
      process.stderr.write('far verify: --bundle 不能与 --envelope/--db/--lint-input 同时使用\n');
      return 2;
    }
    const bundleResult = verifyFarProofBundle(options.bundlePath, mode);
    const dump = collectVerifyDump(undefined, undefined, undefined, undefined, bundleResult);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
    } else {
      process.stdout.write(renderVerifyHuman(dump, undefined, undefined, options.explain, bundleResult));
    }
    return dump.status === 'FAIL' ? 7 : 0;
  }

  // --lint-input 给定时强制载入+校验 envelope（对比基准在内嵌 antiTheaterReport·须先验基准再对比）。
  const needEnvelope = mode === 'envelope' || mode === 'full' || options.lintInputPath !== undefined;
  const needDb = mode === 'chain' || mode === 'full';

  // --lint-input 须配合 --envelope（对比基准在内嵌 antiTheaterReport）。
  // 提前守卫，避免被 needEnvelope 的通用 "--mode X 需要 --envelope" 消息掩盖（04 §5.3 L5 契约）。
  if (options.lintInputPath !== undefined && options.envelopePath === undefined) {
    process.stderr.write(
      'far verify: --lint-input 须配合 --envelope（需 envelope 内嵌 antiTheaterReport 作对比基准）\n',
    );
    return 2;
  }

  let envelope: ProofEnvelopeV2 | undefined;
  let envelopeResult: EnvelopeVerifyResult | undefined;
  let pythonResult: PythonProofHashRecomputeResult | undefined;
  let chainResult: ChainVerifyResult | undefined;
  let lintResult: LintRecomputeResult | undefined;

  if (needEnvelope) {
    if (options.envelopePath === undefined) {
      process.stderr.write(`far verify: --mode ${mode} 需要 --envelope <path>（ProofEnvelopeV2 JSON）\n`);
      return 2;
    }
    const parsed = loadEnvelopeFile(options.envelopePath);
    if (!parsed.ok) {
      process.stderr.write(`far verify: 载入封存信封失败 — ${parsed.error}\n`);
      return 1;
    }
    envelope = parsed.envelope;
    envelopeResult = verifyEnvelopeV2(envelope);
    pythonResult = verifyEnvelopeV2WithPython(envelope);
  }

  if (needDb) {
    if (options.dbPath === undefined) {
      process.stderr.write(`far verify: --mode ${mode} 需要 --db <path>（evidence_log DB）\n`);
      return 2;
    }
    const chain = verifyDbChain(options.dbPath);
    if (!chain.ok) {
      process.stderr.write(`far verify: 打开/验证 evidence_log DB 失败 — ${chain.error}\n`);
      return 1;
    }
    chainResult = chain.result;
  }

  // --lint-input 轴（04 §5.3 L5·加性·须配合 --envelope）。对比基准在 envelope 内嵌 antiTheaterReport。
  if (options.lintInputPath !== undefined) {
    if (envelope === undefined) {
      process.stderr.write(
        'far verify: --lint-input 须配合 --envelope（需 envelope 内嵌 antiTheaterReport 作对比基准）\n',
      );
      return 2;
    }
    const loaded = loadLintInputFile(options.lintInputPath);
    if (!loaded.ok) {
      process.stderr.write(`far verify: 载入 lint 输入失败 — ${loaded.error}\n`);
      return 1;
    }
    lintResult = verifyAntiTheaterLint(envelope, loaded.input);
  }

  const dump = collectVerifyDump(envelopeResult, chainResult, lintResult, pythonResult);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } else {
    process.stdout.write(renderVerifyHuman(dump, envelopeResult, lintResult, options.explain));
  }

  // PASS/WARN → 0（WARN 为带保留的通过）；FAIL → 7（04 §5.4）。
  return dump.status === 'FAIL' ? 7 : 0;
}

/** loadEnvelopeFile —— 读文件 + JSON.parse + 结构校验（三段失败均产干净 error）。 */
function loadEnvelopeFile(
  path: string,
): { readonly ok: true; readonly envelope: ProofEnvelopeV2 } | { readonly ok: false; readonly error: string } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, error: `读取文件失败(${path}): ${errorMessage(error)}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败: ${errorMessage(error)}` };
  }
  return parseProofEnvelopeV2(raw);
}

/** loadLintInputFile —— 读 AntiTheaterLintInput JSON + JSON.parse + 骨架校验（三段失败均产干净 error）。 */
function loadLintInputFile(
  path: string,
): { readonly ok: true; readonly input: AntiTheaterLintInput } | { readonly ok: false; readonly error: string } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, error: `读取文件失败(${path}): ${errorMessage(error)}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败: ${errorMessage(error)}` };
  }
  return parseAntiTheaterLintInput(raw);
}

/** verifyDbChain —— 打开 readonly DB + verifyChainHead（镜像 status.ts verifyDbChainHead 的 try/finally）。 */
function verifyDbChain(
  dbPath: string,
):
  | { readonly ok: true; readonly result: ChainVerifyResult }
  | { readonly ok: false; readonly error: string } {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const result = verifyChainHeadResult(db);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  } finally {
    db?.close();
  }
}

// ===== 渲染（人类可读·--explain 展开 10 规则表 + anti-theater 重算 findings）=====

function renderVerifyHuman(
  dump: VerifyDump,
  envelopeResult: EnvelopeVerifyResult | undefined,
  lintResult: LintRecomputeResult | undefined,
  explain: boolean,
  bundleResult: BundleVerifyResult | undefined = undefined,
): string {
  const lines: string[] = [
    'FAR-Chain Verify（FI-9 · 第三方独立重算 · 04§5）',
    '════════════════════════════════════════════════════════════',
    `  status               : ${dump.status}`,
    `  verdict              : ${dump.verdict ?? 'n/a'}`,
    `  proofHash            : ${dump.proofHash ?? 'n/a'}`,
    `  ledgerRoot           : ${dump.ledgerRoot ?? 'n/a'}`,
    `  tamperStatus         : ${dump.tamperStatus}`,
    `  scopeStatus          : ${dump.scopeStatus}`,
    `  recomputation.node   : ${dump.recomputation.node}`,
    `  recomputation.python : ${dump.recomputation.python}`,
    `  recomputation.browser: ${dump.recomputation.browser}（Phase 2 / #13 未接入）`,
    `  verifiedLevels       : ${dump.verifiedLevels.length > 0 ? dump.verifiedLevels.join(', ') : 'none'}`,
  ];

  if (lintResult !== undefined) {
    const lintSummary = lintResult.recomputedOk
      ? `重算完成（${lintResult.divergences.length} divergence）`
      : '重算中止（见 errors）';
    lines.push(`  antiTheaterLint      : ${lintSummary}`);
  }

  if (bundleResult !== undefined) {
    const chainSummary =
      bundleResult.mode === 'envelope' || !bundleResult.chainRan
        ? 'not-run'
        : `${bundleResult.chain.ok ? 'pass' : 'fail'} (${bundleResult.chain.verifiedCount} records)`;
    const envelopeSummary =
      bundleResult.mode === 'chain' || !bundleResult.proofEnvelopeRan
        ? 'not-run'
        : `${bundleResult.proofEnvelopeOk ? 'pass' : 'fail'} (${bundleResult.proofEnvelopeCount} checked)`;
    lines.push(
      `  bundle              : ${bundleResult.mode} (${bundleResult.bundlePath})`,
      `  bundle.files        : ${bundleResult.requiredFilesPresent ? 'present' : `missing ${bundleResult.missingFiles.length}`}`,
      `  bundle.chain        : ${chainSummary}`,
      `  bundle.envelopes    : ${envelopeSummary}`,
    );
  }

  if (explain && envelopeResult !== undefined) {
    lines.push('', `  10-rule checks（${envelopeResult.checkSummary.PASS}P/${envelopeResult.checkSummary.WARN}W/${envelopeResult.checkSummary.FAIL}F/${envelopeResult.checkSummary.SKIP}S）:`);
    for (const check of envelopeResult.checks) {
      lines.push(`    [${check.outcome.padEnd(4)}] ${check.ruleId} ${check.ruleName} — ${check.detail}`);
    }
  }

  if (explain && lintResult?.recomputedReport !== undefined) {
    const report = lintResult.recomputedReport;
    lines.push('', `  anti-theater 20-detector 重算（${report.findings.length} findings·vs envelope 内嵌报告）:`);
    for (const finding of report.findings) {
      lines.push(`    [${finding.outcome.padEnd(4)}] ${finding.attackKind} — ${finding.message}`);
    }
  }

  if (dump.errors.length > 0) {
    lines.push('', `  errors (${dump.errors.length}):`);
    for (const e of dump.errors) lines.push(`    - ${e}`);
  }
  if (dump.warnings.length > 0) {
    lines.push('', `  warnings (${dump.warnings.length}):`);
    for (const w of dump.warnings) lines.push(`    - ${w}`);
  }

  // 诚实边界（R2·反 overclaim）。
  lines.push(
    '',
    '  诚实边界：',
    '    - envelope 模式验封存信封自洽（proofHash 重算 + 10 规则 + 内嵌 anti-theater 报告一致性）。',
    '    - --lint-input 提供时独立重算 20 detector 并与内嵌报告深度对比（#11b·L5）；',
    '      未提供时不重算原始证据。verifier 不校验 lint-input 与 envelope 的语义对齐（评委自负）。',
    '    - recomputation.python 由 repro/far_chain_repro/proof_hash.py 镜像重算；Python 不可用时诚实标 not-run。',
    '    - recomputation.browser 仍 not-run（Phase 2 / #13 浏览器 ProofEnvelope verifier 未接入）。',
    '════════════════════════════════════════════════════════════',
    '',
  );
  return lines.join('\n');
}

// ===== 辅助 =====

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** severityRank —— outcome 严重性 rank（FAIL>WARN>PASS>SKIP·同 attackKind 多 finding 取严）。 */
function severityRank(outcome: ProofCheckOutcome): number {
  switch (outcome) {
    case 'FAIL':
      return 3;
    case 'WARN':
      return 2;
    case 'PASS':
      return 1;
    case 'SKIP':
      return 0;
  }
}

/** buildOutcomeMap —— findings → attackKind 最严 outcome map（同 kind 取 severity 高者·防御 forged 重复）。 */
function buildOutcomeMap(
  findings: readonly { readonly attackKind: string; readonly outcome: ProofCheckOutcome }[],
): Map<string, ProofCheckOutcome> {
  const map = new Map<string, ProofCheckOutcome>();
  for (const finding of findings) {
    const existing = map.get(finding.attackKind);
    if (existing === undefined || severityRank(finding.outcome) > severityRank(existing)) {
      map.set(finding.attackKind, finding.outcome);
    }
  }
  return map;
}

/** errorMessage —— unknown → string 缩窄（镜像 status.ts 同名 helper）。 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function tail(text: string, max = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return trimmed.slice(trimmed.length - max);
}

// re-export 供 far.ts runVerifyFromArgs 复用 mode 校验集合（单一来源）。
export { VALID_MODES };
