/**
 * repro_anchor —— LLM 调用环境锚（DIGEST G3 闭合·2026-08-06）。
 *
 * 背景：G3 阻塞——CLI loop 在 production profile（competition_aliyun_qwen）下无
 * reproHashProvider → REPRO_BRIDGE_NOT_CONFIGURED（禁伪造 hash 进生产 evidence_log·红线）。
 * 七分量 calc_bridge（repro/far_chain_repro/calc_bridge.py·09 spec §2）是「实验计算路径」
 * 语义：CalcSpec.code_hash=op 实现源码 hash / input_hash=输入数据 hash / env_hash=
 * conda-lock+CPU arch——agent_loop 路径不跑实验（纯 LLM 文献投票·无 op 无实验输入），
 * 接七分量属语义错配（无 op 可哈希）。
 *
 * 本模块为「LLM 调用路径」定义轻量环境锚（invocation environment anchor）：
 *   确定性采集调用环境的可复现性相关分量（模型快照 / 活跃模型 / 运行环境），
 *   TS 原生计算（零 Python 依赖·零子进程·跨平台确定性）。
 *
 * 与既有机制的关系：
 *   - sandbox 执行指纹（computeSandboxReproFingerprint）——正交（那是跑完实验的产物指纹）
 *   - 七分量 calc_bridge——互补（实验路径仍用 calc_bridge·本锚是 LLM 调用路径专属）
 *
 * 诚实边界（反幻觉）：环境锚不是实验复现哈希——它不声称可复现任何实验计算；
 *   它锚定「这次 LLM 调用发生在什么模型/环境中」，供证据链审计追溯
 *   （cred.reproHash 语义在 LLM 路径 = 调用环境指纹·文档化裁决 2026-08-06）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { hashCanonicalJson } from '../evidence_log/hasher.ts';

/** 环境锚输入（LLM 调用环境的可复现性相关分量·全必填·禁缺省占位）。 */
export interface LlmEnvironmentAnchorInput {
  /** 模型快照（模型身份冻结·snapshot.ts 常量·防 env 覆盖漂移）。 */
  readonly modelSnapshot: string;
  /** 活跃模型 profile 列表（排序后·gateway.registeredProfiles()）。 */
  readonly activeModelIds: readonly string[];
  /** Node 运行时版本（process.version·调用环境分量）。 */
  readonly nodeVersion: string;
  /** git commit SHA（代码版本分量·显式传入可测·禁 process.env 直读）。 */
  readonly gitCommitSha: string;
}

/**
 * 计算 LLM 调用环境锚（64-hex sha256·确定性）。
 *
 * 输入经 canonicalJson 规范化（sort_keys + 紧凑分隔符）→ sha256——
 * 与 evidence_log 哈希链同 canonical 基线（cross-lang 对拍覆盖同一 canonical 引擎）。
 *
 * 确定性与可审计：同环境 → 同锚（跨进程·跨平台）；任一环境分量变化 → 锚变化
 * （换模型/换 node 版本/换代码版本 → 证据链可追溯环境变更）。
 */
export function computeLlmEnvironmentAnchor(input: LlmEnvironmentAnchorInput): string {
  const sortedModelIds = [...input.activeModelIds].sort();
  return hashCanonicalJson({
    anchorKind: 'far.llm_invocation_environment.v1',
    modelSnapshot: input.modelSnapshot,
    activeModelIds: sortedModelIds,
    nodeVersion: input.nodeVersion,
    gitCommitSha: input.gitCommitSha,
  });
}

/**
 * 构造 reproHashProvider（ReproHashProvider 接口适配·G3 闭合）。
 *
 * 输入签名含 stageId/payloadKind/response，但环境锚与单次调用的响应内容无关
 * （锚定的是调用环境·非调用结果）——provider 忽略入参返回环境锚。
 * 同一 run 内所有 stage 共用同一锚（确定性·可审计）。
 */
export function createLlmEnvironmentAnchorProvider(input: LlmEnvironmentAnchorInput): () => string {
  const anchor = computeLlmEnvironmentAnchor(input);
  return () => anchor;
}
