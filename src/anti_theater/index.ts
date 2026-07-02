/**
 * anti_theater barrel —— 反剧场测试工具公开 API（镜像 src/falsifiability/index.ts 模板）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §3（runAntiTheaterLint 编排器为入口）。
 *
 * 分阶段导出（W3 路线图）：
 *   - W3.1（本阶段）：types / errors / finding_factory / utils / adapters/kernel_adapter。
 *   - W3.2（后续）：lint / score / constraint / detectors（实现后追加 export）。
 *
 * 模型中立（F3/C1）。零容忍合规：无 any / @ts-ignore / 桩。
 */

// ===== 类型层（APPENDIX_A §7 权威存储类型 + 依赖类型 + AttackCase）=====
export type {
  AntiTheaterAttackKind,
  AntiTheaterFinding,
  AntiTheaterFindingExtension,
  AntiTheaterReport,
  AntiTheaterSeverity,
  AntiTheaterVerdictConstraint,
  AttackCase,
  AttackMutation,
  DatasetBindingTrace,
  DatasetFreezeRecord,
  DetectorFinding,
  EvidenceBinding,
  ExperimentRunTrace,
  ExecutionTrace,
  MeasurementTrace,
  NullResultRecord,
  PreregistrationRecord,
  ProofEnvelopeDraft,
  RunRegistry,
  RunRegistryEntry,
  WorkflowBindingTrace,
  WorkflowFreezeRecord,
} from './types.ts';
export {
  ATTACK_ID_TO_KIND,
  attackKindToId,
} from './types.ts';

// ===== 错误层（镜像 falsifiability/errors.ts 子类模式）=====
export {
  AntiTheaterError,
  AntiTheaterInputError,
  AntiTheaterInvariantError,
} from './errors.ts';

// ===== finding 工厂（detector 统一产出）=====
export {
  makeFinding,
} from './finding_factory.ts';
export type {
  MakeFindingInput,
} from './finding_factory.ts';

// ===== 工具函数（detector 共享纯函数）=====
export {
  floatsEqual,
  hasNegativeControl,
  intersection,
} from './utils.ts';

// ===== kernel 投影 adapter（存储型 → VerdictKernelInput.antiTheaterFindings）=====
export {
  toKernelFinding,
  toKernelFindings,
} from './adapters/kernel_adapter.ts';

// ===== 评分（§4·7 桶去重扣分）=====
export {
  SEAL_BLOCK_SCORE_THRESHOLD,
  computeAntiTheaterScore,
} from './score.ts';

// ===== verdict 约束（§3.2·取严 forcedVerdict + blockSeal）=====
export {
  applyVerdictConstraint,
} from './constraint.ts';

// ===== 编排器（§3·runAntiTheaterLint·20 detector 顺序遍历）=====
export {
  runAntiTheaterLint,
} from './lint.ts';

// ===== detectors（§2·20 个 detect_* + DETECTORS 聚合）=====
export {
  DETECTORS,
} from './detectors/index.ts';
export type {
  AntiTheaterDetector,
} from './detectors/index.ts';

// ===== Lint 输入解析器（untrusted JSON → AntiTheaterLintInput 骨架校验·#11b·04 §5.3 L5 verifier）=====
export {
  parseAntiTheaterLintInput,
} from './schemas.ts';
