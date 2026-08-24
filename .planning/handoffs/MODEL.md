# MODEL PLANE HANDOFF — Model & Inference Plane (lane: model-plane, 2026-08-24)

Mission: 统一、可靠、可观测、可扩展、符合当前赛事要求的 Model & Inference Plane。
范围边界遵守：不重做 Agent Loop（Agent Runtime 是消费者）、不碰 UI / 科学算法所有权。

工作区：`work/model-plane/`（本地 lane 工作区；`work/` 为隔离 lane 惯例不入仓）。
**持久证据（受跟踪、canonical）**：`evidence/W-MP/RESEARCH-competition-2026-08-24.md`
（竞赛核验一手证据）、`evidence/W-MP/DESIGN.md`（架构）、
`evidence/W-MP/gates-2026-08-24.txt`（门禁回执）。
代码：`src/model-plane/`（capabilities / routing / plane / prompts / benchmark）+ 增量改造
providers/http.ts、providers/dashscope.ts、shared/ports.ts、domain/provenance.ts、pipeline/llm.ts。

**门禁证据（2026-08-24）**：vitest 本 lane 36/36；全量 1514 passed / 3 skipped / 0 failed；
tsc 在本 lane 范围 0 错（src/ingest/* 的错误属兄弟在途 lane，未跟踪文件）；eslint 0；
build exit 0；secret-scan PASS；path-hygiene 仅预存 gitignored 产物 WARN。

---

## 1. Qwen / Bailian（竞赛官方路线）— READY-TO-VERIFY，blocker 显式

- **2026-08-24 重新联网核验**（不信旧 ACCEPTANCE）：基座必须 Qwen 系列；必须经
  阿里云百炼调用（或官方推荐 QoderWork/Qoder/秒悟）；必须提供**调用凭证或截图**；
  PDF ≤20 页（两官方页已一致，旧"30 页差异"已消解）；截止 2026-09-05。
  全部逐字引用 + URL 见 `work/model-plane/RESEARCH-competition-2026-08-24.md` §A。
- **canonical production path 已完整落地（代码+验证路径）**：
  - `src/providers/dashscope.ts`：Bailian OpenAI 兼容适配器（fail-closed 无 key），
    结构化输出协商改为 registry 驱动（见 §5）；新 MaaS 端点形态
    `{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 已记录，
    凭据到位时经 `FARLAB_DASHSCOPE_BASE_URL` 指到控制台分配的 workspace 端点。
  - 路由 policy `competition`：非 Qwen 基座 / 非 Bailian 路由全部显式拒绝并给出理由
    （tests/model-plane.test.ts "competition policy" 用例）。
  - 凭证 backbone：receipts 持久化 provider/model/modelVersion/time/usage ——
    满足"调用凭证"的可导出证据。
- **external credential blocker（不得 fake success）**：`B-QWEN-LIVE-ROUTE` 保持 OPEN
  （.control/BLOCKERS.json）。无 DASHSCOPE_API_KEY；live 验证另受 2026-08-23
  no-live-API 指令约束。验证路径已备：填 `.far-run/secrets.env` 的
  `DASHSCOPE_API_KEY=<百炼KEY>` → `node -e "import('./spikes/load-secrets-env.mjs').then(()=>import('./spikes/qwen-route-probe.mjs'))"`。
- 开发路线 zai/GLM 合法但永远不进竞赛路径（competition policy 拒绝）。DeepSeek 全项目禁用。

## 2. Model Capability Registry — IMPLEMENTED

`src/model-plane/capabilities.ts`：18 个 curated 条目（Qwen 全家 + embedding/rerank +
glm-4.6），字段覆盖 text/vision/audio/toolCalling/embedding/rerank、structuredOutput
三档、reasoning、contextTokens(+basis)、streaming/batch、latencyClass、priceRef（仅
参考价，带币种与出处 URL，绝不进成本核算）、region、rateLimits（仅官方公布时）、
knownLimitations、interfaceNotes（如"必须走多模态接口""结构化输出勿设 max_tokens"）、
sourceRefs(url+retrievedAt)。诚实规则：未收录模型 → undefined（= 未验证，路由按能力
门拒绝，绝不猜）；catalog 模块加载即 zod 校验。端点/模型-接口匹配坑（qwen3.8-max 须
走多模态接口等）都已入 interfaceNotes。snapshot 别名（qwen3.7-plus-2026-05-26）可解析。

## 3. Dynamic Routing — IMPLEMENTED

`src/model-plane/routing.ts` + `plane.ts`：11 个任务类（cheap_extraction /
high_quality_reasoning / vision / structured_output / long_context / review / ranking /
coding / embedding / rerank / conversation）。六条硬性质都有实现与测试：
deterministic（纯函数+同名次 tie-break，100 次重复决策一致）、observable（每个候选
accept/reject 理由全量落 RoutingDecision + receipt.routing + onDecision sink）、
budget-aware（上下文溢出门限 75% 窗口；USD 参考价超剩余预算剪枝，未知价绝不静默
通过/拦截）、policy-aware（competition=qwen-only-bailian；deepseek 全模式封禁）、
reproducible（selectedVia 记录确切决策规则）、overridable（override 只能在已接受
路由中表达偏好，绕硬门=显式抛错）。`plane.providerFor(taskClass)` 是 invokeStructured
式消费者的 drop-in 采用缝（ModelProvider 形状）。
**采用路径（下一步，需产品决策）**：pipeline 目前一次 run 固定单一 provider+
failover 链（provider-resolver.ts）；按任务类路由 = 在 composition.ts 组装处把
`resolveRunProvider` 换成 plane 多路由（receipts 已兼容）。未在本 lane 强行接入——
改变 run 的模型选择语义属跨 lane 产品变更。

## 4. Reliability — PRE-EXISTING & VERIFIED（未重建，职责不重叠）

retry×2 + Retry-After 优先 + 抖动指数退避（cap 30s）、corrective re-asks×3（截断感知，
finish_reason=length 禁止补全）、总预算 120s、6 类失败分类、凭证脱敏、显式 failover
链 + 冷却（LiteLLM 语义）、workspace USD 硬顶（fail-closed quota_exceeded）、run 级
token 预算、进程级并发帽 6。流式中断：结构化平面**有意非流式**（设计决策；
Bailian"思考+结构化需流式"记为 known-limitation 而非半支持）。partial output /
malformed / context overflow / quota / unavailable 全部有分类路径与测试（本 lane 补充
的 receipt.params 让每次调用的重试/协商开销可归因）。

## 5. Structured Output — STRENGTHENED

原有 6 层防线（协商传输→fence剥离→内容保持修复→容忍链→纠正重问→截断纪律）之上，
本 lane 把第 1 层从"靠提示词"升级为**能力协商**：`negotiateStructuredOutput` 只在
registry 验证过 json_schema strict 的模型（qwen3.7-plus / qwen3.7-max / qwen3.8-max
家族，官方文档 2026-08-24）放行服务端 schema 强制（`response_format json_schema
strict:true`，http.ts 新传输模式），其余保持 json_object；不可投影 schema（records/
unknowns）一律降级 json_object 绝不 400。dashscope 适配器同时保留"结构化输出不设
max_tokens"官方纪律。测试：tests/model-plane.test.ts 两个离线 fetch-double 用例分别
断言 strict/json_object 两档的线上 body 与 receipt.params.structuredOutput。

## 6. Prompt / Context Infrastructure — ASSET SYSTEM LANDED, STAGE MIGRATION = ADOPTION

`src/model-plane/prompts.ts`：PromptAsset（id/version/text/provenance/fingerprint=
canonicalSha256）+ 注册纪律（同 id 同 version 异文=抛错，改内容必须升版本）+
materializePrompt 严格双向 {{var}} 校验 + planePrompts（先收录 canonical
untrusted-data-rule，文本所有权仍在 src/shared/untrusted.ts，registry 引用不分叉）+
regressionSnapshotEntries（输出与 eval/prompt-snapshot.json 同形，可并入离线回归门）。
现状盘点：stage SYSTEM_PROMPT 常量已有离线快照回归（eval/prompt-regression.mjs，
hash+长度+安全布线+字节确定性 4 层）；上下文包装（describeShape 契约注入）、UNTRUSTED
规则 choke-point、compaction（agent 侧）已有。**采用路径**：stage 提示迁入 registry =
逐 stage 用 definePrompt 包装（内容零变化，指纹接管），由 owning lane 执行。

## 7. Cost / Tokens / Latency — PRE-EXISTING LEDGER + NEW ATTRIBUTION

receipts 唯一权威 → usage-ledger（按 run/workspace 聚合，cached/reasoning token 分类
计账）→ spend-limit USD 硬顶（执法在 provider 边界，fail-closed）。无发明价目表：
成本只在用户申报价格后计算，否则显示 pricing unknown。本 lane 新增：receipt.params
（实发 temperature/maxTokens/structuredOutput 模式/reasoning）+ receipt.routing 使
每次调用的成本动因完全可归因；benchmark 每例记录 latencyMs/transportRetries/
correctiveReasks（routing savings = plane 决策 vs 固定路由基线可从回执推导）。

## 8. Reproducibility — COMPLETED CHAIN

每张 model_call 回执现含：provider、modelId、modelVersion（服务端回显）、**params
（新增）**、**routing（新增）**、usage 全 token 种类、latencyMs、requestHash（负载+
提示）、outputHash、finishReason、transportRetries、correctiveReasks、reasoningGear、
executionMode、at、（bundle 级 codeRevision/environmentFingerprint 已有）。
声明纪律：provider 不保证确定性输出 → FAR-Lab 只声明**调用级可追溯**（同请求字节+
同旋钮+同路由），不声明 bit 级重放。

## 9. Benchmark — HARNESS IMPLEMENTED, LIVE = BLOCKED-live

`src/model-plane/benchmark.ts`：7 套件 21 例，全部确定性夹具+确定性评分（无 LLM
自评）：structured-output(5)、long-context 针芒 30%/80%(2)、scientific-reasoning
金标(4)、retrieval-synthesis id-Jaccard(2)、vision(2, 无已验证视觉能力=可见跳过不计
零分)、tool-selection 精确匹配(4)、ranking 归一化 Kendall-tau(2)。runSuite 逐例留
requestHash/outputHash/latency/receipts；compareModels 按套件排名（分数降序、同名
确定 tie-break、跳过列理由）。**不同模型的性能结论只来自真实执行**——离线 test-stub
运行只证明 harness 机制（tests/model-plane-benchmark.test.ts 12 用例），不产生模型
质量数字；live 对比待 B-QWEN-LIVE-ROUTE 解除后经真实路由执行。

## 未做 / 边界（诚实清单）

- pipeline 全量按任务类路由未接入（产品决策+跨 lane，见 §3 采用路径）。
- stage 提示迁移入 registry 未做（owning lane 执行，见 §6）。
- live 竞赛路线验证、live benchmark、rate-limit 数字、embedding/rerank 单价：BLOCKED/
  UNVERIFIED（凭据缺失；registry 相应字段留空未猜）。
- 兄弟 lane 在途文件（src/ingest/、cli/persistence/api 的在途改动）未触碰。
