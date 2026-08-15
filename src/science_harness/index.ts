/**
 * Executable Science Harness 公共出口（M3 TESS / spec 12）。
 *
 * 三职责模块（§0 职责分离框图）：
 *   - sandbox_runner：resource-bounded & network-restricted venv 执行（类型层·F4）+ 确定性 hash
 *   - dataset_resolver：3 值数据集解析决策树（绝不伪造·F1）
 *   - tess_harness：C-ASTRO-0001 M1-M4 检验 + verdict_mapping 5 路径（F2 优先级）
 *
 * 诚实边界（F4）：V1 类型层约束（purpose_tag 枚举 + CI 审计断言）。
 *   严禁声称进程级物理隔离 / strong isolation / tamper-proof / physically isolated。
 */

// types
export type {
  CpuSpec,
  MemorySpec,
  SandboxResourceSpec,
  ArtifactManifest,
  SandboxRunResult,
  SandboxExecutionInput,
  SandboxAdapter,
  DatasetResolverKind,
  DatasetRef,
  DatasetResolution,
  DatasetResolutionStatus,
  ScienceCheckOutcome,
  ScienceThreshold,
  ScienceCheck,
  VerdictRoute,
  VerdictMappingResult,
} from './types.ts';
export { RESOURCE_LIMITS } from './types.ts';

// sandbox_runner
export {
  DEFAULT_SEED,
  typeLayerSandboxAdapter,
  validateResourceSpec,
  computeArtifactTreeHash,
  computeSandboxRunResult,
  computeSandboxReproFingerprint,
} from './sandbox_runner.ts';

// dataset_resolver
export {
  DATASET_HOST_WHITELIST,
  resolveDataset,
  datasetStatusToIntegrityFlag,
  isBaselineExempt,
} from './dataset_resolver.ts';

// tess_harness
export {
  C_ASTRO_0001_CLAIM,
  C_ASTRO_CHECK_IDS,
  C_ASTRO_DEFAULT_THRESHOLDS,
  buildCAstroChecks,
  evaluateOutcome,
  mapChecksToVerdict,
  ROUTE_TO_VERDICT,
} from './tess_harness.ts';
export type { CAstroMeasuredValues } from './tess_harness.ts';

// hero_a_harness（hero-A-001 quantitative · 任务 #12）
export {
  HERO_A_001_CLAIM,
  HERO_A_CHECK_IDS,
  HERO_A_DEFAULT_THRESHOLDS,
  buildHeroAChecks,
} from './hero_a_harness.ts';
export type { HeroAMeasuredValues } from './hero_a_harness.ts';

// hero_b_harness（hero-B-002 causal · 任务 #12）
export {
  HERO_B_002_CLAIM,
  HERO_B_CHECK_IDS,
  HERO_B_DEFAULT_THRESHOLDS,
  HERO_B_EXPOSURE,
  HERO_B_OUTCOME,
  HERO_B_EVIDENCE_BASIS,
  HERO_B_CAUSAL_MODEL,
  buildHeroBChecks,
} from './hero_b_harness.ts';
export type { HeroBMeasuredValues } from './hero_b_harness.ts';

// confounding_integration（F6 因果门与 verdict_mapping 集成 · 任务 #12 决策 E）
export { decideVerdictWithConfounding } from './confounding_integration.ts';
