/** Constant: COMPETITION_MODEL_SNAPSHOT. */
export const COMPETITION_MODEL_SNAPSHOT = 'qwen3.7-max-2026-05-20';
/** Constant: MODEL_SNAPSHOT. */
export const MODEL_SNAPSHOT = COMPETITION_MODEL_SNAPSHOT;

/**
 * Vision（VL）目标模型——图表数据提取（figure_extraction）live 腿的指定目标。
 * 状态：[documented_not_verified_live]——百炼模型列表页 2026-08-21 亲读确认在售
 * （qwen3-vl-plus / qwen3-vl-flash），但真实调用未发生（DASHSCOPE_API_KEY 欠费，
 * CPS-3）。live 验证后此注释升级为 verified_live。
 * VL 不支持 json_schema response_format（同日官方文档亲读）——结构化靠客户端 zod。
 */
export const VISION_MODEL_SNAPSHOT = 'qwen3-vl-plus';
/** 轻量 VL 档（低成本高频提取；与 plus 同日文档确认，同样未 live 验证）。 */
export const VISION_MODEL_LITE = 'qwen3-vl-flash';

// 结构化输出安全模型：qwen-max（undated latest）。旧值 qwen-max-2025-09-24 已被 DashScope 下线（2026-07-07 凭据实测 404 The model does not exist）；
// qwen-max 是同族唯一有效替代（/v1/models 实测），与 COMPETITION_MODEL_SNAPSHOT(qwen3.7-max) 不同（R1 路由矩阵两分支保留）。undated 会随官方升级浮动——这是 qwen-max 系列已无有效 dated snapshot 的客观限制。
// ⚠ 2026-08-14 凭据实测修正：对 research_hypotheses 真实 schema（zodToJsonSchema·strict），
//   qwen3.7-max-2026-05-20 返回合法对象（zodOk=true·6176 chars），qwen-max 反而 zodOk=false（2266 chars）。
//   生产 research 层结构化调用实际走 COMPETITION_FALLBACK_CHAIN 首位 qwen3.7-max（adapter 链路径未引用
//   STRUCTURED_SAFE_MODEL 路由；buildCreateParams 的切换仅 smoke/测试路径断言）。
//   "qwen-max = structured-safe" 的标签未被本次实测支持；保留常量与路由矩阵不动（agent_loop 路径契约），
//   如实记录：结构化可靠性取决于模型快照行为而非本标签（诚实边界，不伪装）。
// repro 边界：modelId 不进 canonical hash 白名单 T3（C7·snapshot 切换不破坏既有 proof envelope），仅影响 LLM 路由目标。
/** Constant: STRUCTURED_SAFE_MODEL. */
export const STRUCTURED_SAFE_MODEL = 'qwen-max';

/**
 * Competition endpoint（公开端点·非密钥）。默认字面量与 .env.example:17 一致；
 * 运行时遵循 .env.example 承诺——可由 process.env.COMPETITION_BASE_URL 覆盖。
 *
 * 注意边界：COMPETITION_MODEL_SNAPSHOT 保持字面常量不变（模型身份冻结·红线#2 模型中立·
 * repro_hash 确定性要求模型不可被 env 覆盖）；仅「端点」作为基础设施允许覆盖。
 * env 未设置时回落默认字面量——offline_replay.test.ts:49 字面断言仍成立。
 */
export const COMPETITION_BASE_URL =
  process.env.COMPETITION_BASE_URL ??
  'https://dashscope.aliyuncs.com/compatible-mode/v1';
/** Constant: BASE_URL. */
export const BASE_URL = COMPETITION_BASE_URL;

/** Constant: COMPETITION_MODEL_SNAPSHOT_STATUS. */
export const COMPETITION_MODEL_SNAPSHOT_STATUS =
  '[verified_live: web search confirmed qwen3.7-max-2026-05-20 available on DashScope as of 2026-06-27]';
