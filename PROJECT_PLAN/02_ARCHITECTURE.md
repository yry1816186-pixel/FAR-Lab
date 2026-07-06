# 02 最终系统架构

> 作用域：本章定义 FAR-Chain / FAR-Lab 的**架构总线、四层交付分区、模块边界、核心数据对象、状态机、实现原则与架构验收**。
> 跨文档一致性：类型名 / 字段名 / enum 值以 `APPENDIX_A_TYPES.md` 为权威；canonical 序列化与 hash 算法以 `APPENDIX_C_CANONICAL.md` 为权威；术语语义以 `APPENDIX_F_GLOSSARY.md` 为权威。冲突时以三附录为准。
> 状态纪律：所有模块标注状态标签（`IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`）；禁止手填裸数字（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit）；未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`，与 `01` §3-§4 一致。
> 禁用词：本章内「证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark 或排行榜 / `far-chain/`（作为真实实现路径）/ 最新·第一·唯一（无来源支撑）」**不得作为有效口径**，仅在「禁用 / 历史 / 修正」语境出现并显式标注。当前实现根一律写 `<REPOSITORY_ROOT>/`。
> 历史口径与来源溯源：旧编号（`03_EXISTING_ARCHITECTURE` / `07_FINAL_ARCHITECTURE` / `38` / `54` / `75` 等）来自 `FINAL_PACKAGE/`，其物理档案已退役，离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。本章只把旧文档的**深度内容**并入，旧编号仅作来源溯源，不作为有效依赖。

---

## 0. 架构现状一句话

FAR-Chain 是一个**双语言（TS 主运行时 + Python 确定性镜像）、单信任根（append-only hash chain）、四层交付分区（Core Trust Root / Falsification / Proof&Verification / Product&Ecosystem）**的可信科研 Agent 基础设施——把「AI 科研声明是否可信」从「靠人判断」变成「机器可检」，且绝不以牺牲诚实换取演示效果。

> 历史口径：旧文档（`03_EXISTING_ARCHITECTURE` §0 / `07_FINAL_ARCHITECTURE` §0）曾以「双语言 + 单信任根 + 六阶段科研闭环 + Core/Competition 分层 + 三柱 + UQ-Witness 元创新轴」一句话概括，并把架构描述为「十五层同时必达」。当前 SSOT 将其收敛为**四层交付分区**以避免散焦，十五层编号仅作为模块全景矩阵保留（见 §2.5）。

---

## 1. 架构总线

### 1.1 主链路

FAR-Chain 的主链路（端到端数据流）：

```text
Claim
  -> FEC compile / load
  -> protocol freeze
  -> evidence binding (dataset / workflow / experiment-run)
  -> measurement run / import
  -> statistical evaluation
  -> deterministic five-value verdict (rule trace)
  -> ProofEnvelope seal (proofHash)
  -> independent verification (TS / Python / Browser / CLI)
  -> Trust Receipt
```

**铁律**：每一步都必须产生结构化记录。自然语言解释只能作为附属字段，不能改变 `hash`、`verdict` 或 `protocol state`。

### 1.2 单向信任流（无捷径）

```text
所有 LLM 调用
  -> 必经唯一 provider 出口 callBailianForCred（Competition adapter 漏斗）
  -> 必落 call_records（append-only hash chain）
  -> 才能进 evidence_log
  -> 才能产 deterministic verdict
  -> 才能进 evidence_graph / ProofEnvelope
  -> 才能被 FEC 编排导出
```

**无捷径**：任何绕过 `call_records` 的 LLM 输出不得作为裁决输入（F3 反 theater 跨层投影）。

### 1.3 反 theater 注入点（全链路）

| 注入点 | 机制 |
|---|---|
| stage3 hypothesis GATE | `falsifiabilityGate` 硬阻断不可证伪 claim，不进 evidence 阶段 |
| stage6 feedback | 禁 LLM 产 `CONFIRMED` verdict |
| verdict kernel | deterministic 决策树优先级锁定（`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`） |
| Integrity Firewall | 6 条核心 RULE（CIT/DATA/STAT/HARK/JUDGE/SCOPE）确定性降级 |
| FEC 三件套 | `sourceAnchor + reproHash + falsificationSpec` 缺一 throw |
| `no_llm_final_judge_scan` | CI grep 命中 `createdBy === 'llm'` 即 hard fail |
| Honesty Wall | 展示 `knownFailures` / scope 缩窄 / 降级路径 |

### 1.4 主链路与信任根的咬合（不新增算法铁律）

所有升级增量接入必须遵守：**新增独立 migration（≥0016，不改 0001 五表）/ 新增 adapter（不污染 Core 模型中立）/ 新增编排协议（不新增 hash 算法）**。任何要改 `0001` 五表 DDL、`canonicalHash` 算法（四字段白名单）或 `VerdictKind` 五枚举的提案 = 否决。

---

## 2. 四层交付分区

为避免旧文档「十五层同时必达」的散焦，本规划将架构分为四个交付分区。模块全景（含十五层映射）见 §2.5。

### 2.1 Core Trust Root（L0 信任根基座）

必须稳定、窄、可测试。所有 hash / chain / enum / DDL 在此冻结。

| 模块 | 责任 | 状态 |
|---|---|---|
| canonical serialization | 对 verdict-critical 字段生成稳定字节表示（递归字典序 key、UTF-8、无空格、四字段白名单） | `IMPLEMENTED_VERIFIED`（TS / Python byte-equal，`cross_lang_consistency` 守卫） |
| append-only evidence log | 记录不可静默覆盖的事件（`call_records` / `evidence_log` / `ledger_events`） | `IMPLEMENTED_VERIFIED`（SQLite trigger `no_update` / `no_delete` `:memory:` 实测） |
| hash chain / Merkle root | 让篡改可检测（`verifyChainHead` / `merkleRoot` / inclusion proof） | hash chain `IMPLEMENTED_VERIFIED`；Merkle `IMPLEMENTED_VERIFIED`；公开 transparency log `ROADMAP`（V3） |
| golden vectors | 固定跨实现行为（canonical / chain / merkle / proof envelope / verdict trace 五套，含 mutation vectors） | `REPRO_CONTEXT_FIXTURE` 单向量 `IMPLEMENTED_VERIFIED`；浮点数值域边界 `NUMERIC_KNOWN_DIVERGENCE`（§8 of APPENDIX_C） |
| migration runner | 保证 schema 变更可追踪（0001 五表锁死，0016+ 增量） | `IMPLEMENTED_VERIFIED`（0001-0011 已锁） |
| verifyChainHead / appendRecord | 写入期 hash + 验证期重算（嵌套 CanonicalInput，Omit `seq`/`currentHash`，保留 `prevHash`） | `IMPLEMENTED_VERIFIED` |

> **冻结资产红线**（任何一项被改 = 信任根重写）：`0001` 五表 DDL（T10）、`canonicalHash` 算法 sha256 + 四字段白名单（T3/T8）、`VerdictKind` 五枚举（F2）、append-only trigger 铁律（T2）、N1 字节级对齐（T4）、Core 模型中立（C1）。

> **诚实边界**：所有「信任根」声称都应读作 **tamper-evident**（可检测篡改），不是 **tamper-proof**（物理不可篡改，禁用词）。SQLite trigger 防 UPDATE/DELETE 为绿；防 DROP TRIGGER / DROP TABLE / 物理篡改 db 文件 = **否**，靠 external anchor（`gitCommitSha` / crossref DOI / V3 公开 transparency log）兜底。详见 `APPENDIX_C` §11。

### 2.2 Falsification Layer（L1-L3 中的证伪子链）

项目灵魂层。把抽象 claim 编译成可测、可冻结、可反驳、可降级的 FEC，并产出 deterministic verdict。

| 模块 | 责任 | 状态 |
|---|---|---|
| FEC compiler / loader | 把 claim 转为可测契约（`FecContract`）；编译失败 → `FEC_NOT_COMPILABLE` → `UNTESTED` | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| protocol freezer | 锁定统计计划、scope 和 evidence requirements（`ProtocolFreeze.frozenBy === "deterministic_freezer"`，禁 LLM 冻结） | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| evidence binder | 绑定 dataset、workflow、experiment-run（`contentHash` / `schemaHash` / `statsFingerprint` / `scopeCoverage`） | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| measurement runner / importer | 运行或接收测量结果（`MeasurementResult`，`rawArtifactHashes` 缺失 → label-only evidence → `UNTESTED`） | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| statistical evaluator | 输出 effect、p、CI、power、correction 等结构化结果（`StatisticalResult`） | `DESIGN_LOCKED`（MVP `PARTIAL`） |
| deterministic verdict kernel | 输出五值 verdict、reason codes 和 rule trace（`VerdictKernelOutput`） | `DESIGN_LOCKED`；当前 `decideVerdict()` `PARTIAL`（已覆盖五值但规则浅） |
| anti-theater harness | 10 类攻击检测（label-only / LLM-override / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / metric swapping / seed cherry-picking / workflow digest mismatch / NL-verdict mismatch） | `DESIGN_LOCKED`（规则集见 `03` §8、`APPENDIX_E`） |
| integrity firewall（L9） | 6 条核心 RULE 确定性降级（CIT/DATA/STAT/HARK/JUDGE/SCOPE），`ProofCheck` 产出 | `DESIGN_LOCKED`（首里程碑 6 条；完整交付补至 12 类） |

### 2.3 Proof and Verification Layer（L5/L12）

把内部裁决变成可转交、可重算对象。

| 模块 | 责任 | 状态 |
|---|---|---|
| ProofEnvelope V2 | 结构化封装 claim、FEC、证据、verdict 和 roots（`schemaVersion: "far.proof_envelope.v2"`） | `DESIGN_LOCKED`；V1 `PARTIAL`，P0 须升级 V2 proofHash binding |
| proofHash | 对 verdict-critical 字段生成稳定摘要（白名单 §2.2 of APPENDIX_C，篡改任一 VC 字段必变） | TS/Python/Browser `IMPLEMENTED_VERIFIED`；Rust/Go/WASM `ROADMAP` |
| `far verify` / `far export receipt` / `far export far-proof` / `far bench run` | CLI 验证 bundle、envelope、chain，生成 Trust Receipt DOC 投影，导出 V1 `.far-proof` self-verifiable bundle，并运行 6-seed demo benchmark profile（`far bench run --json --generated-at <iso>`） | `IMPLEMENTED_VERIFIED`（**17 子命令全落地**·见 05 §9.2：status / verify / verify-golden / export receipt / export far-proof / bench run / fec compile / fec freeze / fsm advance / demo / api / **ask / stream / repl / replay / court / arena / init** + `@far-chain/cli` 包）；剩余 `ROADMAP`：真实多模型 court/arena（凭据门）+ 外部 RO-Crate/PROV-O 认证（V2） |
| Python verifier | 独立语言复核（`canonical_hash` + `verifyChainHead` + ProofEnvelope V2 `proofHash` byte-equal） | `IMPLEMENTED_VERIFIED` |
| Browser verifier | 面向评委的可视化验真与 tamper demo（Web Crypto） | Merkle/Suite + ProofEnvelope V2 proofHash `IMPLEMENTED_VERIFIED`；raw evidence / RO-Crate 外部认证不在此路径内 |
| diff report | 说明哪一个字段导致验证失败（落 `APPENDIX_C` §7 verdict-critical 字段表的一行） | `DESIGN_LOCKED` |
| Merkle ledger（L12） | 本地 append-only proof ledger（`ledger_events` 同构 `call_records` + `merkle_roots` + inclusion proof） | `DESIGN_LOCKED`；公开 transparency log `ROADMAP`（V3，非区块链） |
| inclusion proof | 第三方无需整棵树即可验证叶子在 `ledgerRoot` 下 | TS/Python/Browser `IMPLEMENTED_VERIFIED`；非存在性证明 `ROADMAP` |

### 2.4 Product and Ecosystem Layer（L15 + Adapters）

只做接入，不复制生态。

| 模块 | 责任 | 状态 |
|---|---|---|
| workflow adapters | Nextflow、Snakemake、CWL 等证据接入（`WorkflowBinding.engine`） | `ROADMAP`（adapter allowlist + manifest hash） |
| research object adapters | RO-Crate、PROV、Workflow Run Crate 等映射（`.far-proof` 三重出口） | `DESIGN_LOCKED`（首里程碑基本出口；路线图完整合规） |
| ML/data adapters | MLflow、DVC、DataLad、W&B 等结果接入 | `ROADMAP`（V2） |
| FAR-Bench | 验真协议、攻击样例和回归套件（项目内 self-test，**不冒充通用 benchmark** C13） | `ROADMAP`（spec-only，C33） |
| REST API server（`src/api/`） | 对外 HTTP API（Fastify）：`/api/v1/verdict`/`/evidence` + `/health`/`/ready` 探针 + JWT/CORS/rate-limit；`far api` 启动器（默认 offline demo·种子 C-ASTRO 裁决·作为 frontend 网关） | `IMPLEMENTED_VERIFIED`（`src/api/server.ts` + `routes/`·OpenAPI schema 暴露于 `/documentation/json`） |
| Web dashboard（`frontend/`） | React + Vite 仪表盘 9 页（Overview/Viz/Integrity/Leaderboard/HonestyWall/Ablation/Report/DemoMode/About）·d3/reactflow 可视化·Honesty Wall tamper red·连 `localhost:3000` API；`far api` + `npm run dev` 全栈可运行 | `IMPLEMENTED_VERIFIED`（生产构建通过·`demo cockpit` 离线现场演示流程仍 `DESIGN_LOCKED`） |
| `.far-proof` 三重出口 | `ro-crate-metadata.json` + `prov.ttl` + `otel-trace.jsonl` + `proof_envelopes.jsonl` + `repro_runs.jsonl` + `call_records.redacted.jsonl` + `data_manifest.json` + `README_REPLAY.md` + `verify.sh`/`integrity.json`/`.tar.zst` package | V1 self-verifiable export `IMPLEMENTED_VERIFIED`；外部 RO-Crate/PROV-O validator 合规、`sciir.json`、`ledger_events.jsonl` 仍 `ROADMAP` |

### 2.5 模块全景矩阵（十五层映射 · 来源溯源）

> 历史口径：旧 `07_FINAL_ARCHITECTURE` §1 曾定义全局层 L0-L15 SSOT。当前四层交付分区是其**收敛视图**；下表保留旧层号作来源溯源，物理档案已退役，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

| 旧全局层 | 旧模块 | 当前归属（四层分区） | 状态 |
|---|---|---|---|
| L0 | `call_records` + hash chain / `canonicalHash` / `verifyChainHead` / golden vectors / 七分量 | Core Trust Root | `IMPLEMENTED_VERIFIED` |
| L1 | `agent_loop` 六阶段 FSM / `provider` `callBailianForCred` / `assemblePaper` | Falsification（执行子链） | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| L2 | `falsifiability_verdict`(5枚举) / `evidence_graph`(DAG 防环) / `repro_deterministic` / multimodal / causal_DAG / scientific_eval / math_verif / system_prompt | Falsification | `DESIGN_LOCKED`（裁决 `PARTIAL`） |
| L3 | FEC（编排协议·不新增表）/ FAR-Bench / ProbeAtlas / UQ-Witness | Falsification / Product | FEC `DESIGN_LOCKED`；三柱 spec-only（C33） |
| L4 | SciIR（Claim IR 收敛 schema + typechecker） | Falsification（声明编译） | `DESIGN_LOCKED`（待收敛 schema） |
| L5 | ProofEnvelope（`proof_hash` + validator + `.far-proof` 导出） | Proof & Verification | `DESIGN_LOCKED`（V1 `PARTIAL`） |
| L6 | Falsification DSL（YAML 契约 + compiler + `verdict_mapping` 5 路径） | Falsification | `DESIGN_LOCKED`（compiler 待实现） |
| L7 | Causal-Stat Falsification（L7-L1 Evidence + L7-L2 Statistical + L7-L3 Causal ConfoundingGate） | Falsification | `DESIGN_LOCKED`（ConfoundingGate 算法 SSOT 见 36） |
| L8 | Executable Science Harness（`sandbox_runner` + `dataset_resolver` + TESS） | Falsification（测量执行） | `DESIGN_LOCKED`（TESS Hero Demo 必达；GPU `ROADMAP` W6+） |
| L9 | Integrity Firewall（12 类风险 + 6 核心 RULE + trap suite） | Falsification（anti-theater） | `DESIGN_LOCKED`（首里程碑 6 RULE） |
| L10 | Adversarial Science Game（9 角色 + deterministic arbiter，辅助不裁决） | Product（路线图） | `ROADMAP`（W3+，F3 不替代裁决） |
| L11 | Counterfactual Replay + Evidence Sensitivity（`replay_forks` 6 intervention） | Product（路线图） | `ROADMAP`（migration 0021） |
| L12 | Transparent Science Ledger（`ledger_events` + Merkle root + inclusion proof） | Proof & Verification | `DESIGN_LOCKED`（local，不说区块链） |
| L13 | Scientific Memory（7 态生命周期） | Product（研究层） | `RESEARCH`（NEEDS_RESEARCH） |
| L14 | Formal Invariant（TLA+ / Lean / Alloy，只读验证·非 runtime） | Product（路线图） | `ROADMAP`（NEEDS_TOOLCHAIN；F10 不进 runtime 依赖） |
| L15 | Open Science Export + Governance（`.far-proof` 三重出口 + 开源 + Web Cockpit） | Product & Ecosystem | 基本导出 `IMPLEMENTED_VERIFIED`；Web Cockpit（`frontend/` 仪表盘 + `far api` REST server）`IMPLEMENTED_VERIFIED`（见 §2.4）；开源治理 / 外部 RO-Crate 认证仍 `DESIGN_LOCKED`/`ROADMAP` |

> **消歧约定**（来自旧 `07` §1 round12）：引用 L7 内部子层必须写 `L7-L1`/`L7-L2`/`L7-L3`（带 L7 前缀），禁裸写 L1/L2/L3（与全局层 L1=执行 / L2=证据 撞名）。全局 L3（元创新轴·含 UQ-Witness）vs L7-L3（Causal ConfoundingGate）是**不同实体**。

> **V2 产品化接入层**（旧 `54`）：旧文档曾定义 L16+ 产品化暴露层（FI-1 CLI / FI-2 Arena / FI-3 Court / FI-4 DomainPack / FI-5 Bench-125 / FI-6 WASM / FI-7 TimeMachine / FI-8 叙事 / FI-9 验证器 / FI-10 status）。**当前 SSOT**：V2 全部 FI 都有 L4-L15 既有层作根，是「接入/暴露/编排」壳，零改 L0-L3 信任根、零改 L4-L15 已冻结层。状态 `ROADMAP`（packages/ 拆包为 V3 路线图；当前 `<REPOSITORY_ROOT>/src/` 扁平实现）。

---

## 3. 模块边界

### 3.1 FAR 负责

- claim-level verification（声明级验证）；
- evidence contract（FEC 编译、冻结、绑定）；
- protocol freeze（统计计划 / scope / evidence requirements 锁定）；
- evidence binding（dataset / workflow / experiment-run hash 绑定）；
- deterministic verdict（五值裁决 + rule trace）；
- ProofEnvelope（可转交、可重算证据包）；
- independent recomputation（TS / Python / Browser / CLI 第三方重算）；
- anti-theater failure modes（10 类攻击检测 + 6 核心 RULE 降级）；
-篡改可检测（tamper-evident，非 tamper-proof）。

### 3.2 FAR 不负责

- 训练基础模型；
- 替代 wet lab 或真实实验；
- 替代完整 workflow engine（只做 adapter 接入）；
- 替代同行评审；
- 自动保证科学结论正确（`CONFIRMED` = bounded support，非科学真理证书）；
- 管理全部科研数据生命周期；
- 物理级隔离 / 硬件级沙箱（sandbox 仅资源限制 + 禁网 + 版本锁，F4 不声称物理隔离）；
- 解决复现危机（只把 CIT/DATA/STAT 三类风险从不可审计变 runtime 可拦截）。

### 3.3 Core 模型中立红线（C1）

Core 算法层（`canonicalHash` / `verdict_mapping` / `appendRecord` 的哈希与裁决逻辑）**禁出现** Qwen / DashScope / 百炼字面量。Competition adapter（`<REPOSITORY_ROOT>/src/adapters/aliyun_qwen/`）是唯一 Qwen 漏斗。

**CI Grep 守卫**（精确边界）：
- `new OpenAI(` 仅允许出现在 `adapters/aliyun_qwen/client.ts`（C6）；
- Core **算法** grep `qwen|dashscope|bailian` = 0 命中（C1）；但 `evidence_log` / `falsifiability` 核心模块含 `competition_aliyun_qwen` profile 钩子（厂商约束分发点·含 qwen 子串·非算法依赖），CI grep 边界须精确到算法层或排除 profile 钩子文件；
- `dashscopeRequestId` 仅作 adapterMeta / `AliyunQwenCredential` 字段，**不是** core credential 字段名（C4）；
- `no_llm_final_judge_scan`：`VerdictNode.createdBy === 'llm'` → CI hard fail（F3）。

### 3.4 运行时 vs 开发工具边界（宪法 §2）

```text
开发工具域（Claude Code / UltraCode / OpenHands）
  ✅ 可做：写 .ts/.py/.sql 代码、写测试、写文档、跑 typecheck/lint/test、生成 Repro Bundle 模板
  ❌ 禁做：成为参赛运行时主基座的一部分（任何 runtime import 开发工具 = 可复现性自废）
  ❌ 禁做：把开发工具的 MCP/runtime API 编进 <REPOSITORY_ROOT>/ 运行时代码

参赛运行时域（<REPOSITORY_ROOT>/ · fresh-clone 可复现）
  TS 运行时 + Python 确定性镜像 + SQLite（5 核心表 + migration 0016+）+ CI gate
  ★ 运行时科研流程可自动化，但以下须人工（诚实标注）：
    密钥授权 / 控制台截图 / 报名提交 / 凭证核验 / GPU 配置 / CONFIRMED verdict 终审科学背书
```

**强制隔离测试**：fresh-clone 环境（无 Claude Code / 无 `DASHSCOPE_API_KEY`）必须能跑通 core CI 全绿（`offline_replay` profile）（C9）。开发工具的任何痕迹不得进入 `package.json` dependencies / runtime import。

---

## 4. 核心数据对象

核心对象保持少而硬。字段名 / 类型名 / enum 值以 `APPENDIX_A_TYPES.md` 为权威；此处仅列最小内容索引（完整字段见附录 A 对应章节）。

| 对象 | 最小内容 | 附录 A 定位 | verdict-critical |
|---|---|---|---|
| `Claim` | `id` / `naturalLanguage` / `domain`(6值) / `scope` / `author` / `createdAt` / `formalExpression?` / `causalModel?` | §1 | `[VC]` id/domain/scope/createdAt |
| `FecContract` | `fecId` / `claimId` / `measurableImplication` / `scope` / `requiredEvidence[]` / `datasetRequirements[]` / `workflowRequirements[]` / `metric` / `threshold` / `direction` / `statisticalPlan` / `powerPlan?` / `multipleTestingPlan?` / `seedPolicy` / `deviationPolicy` / `freeze` | §1 | 全 `[VC]` |
| `ProtocolFreeze` | `fecHash` / `actor` / `timestamp` / `environmentPolicy` / `deviationPolicyHash` / `frozenBy:"deterministic_freezer"` | §2 | 全 `[VC]`；`timestamp` 不可晚于实验结果时间（HARKing 红线） |
| `DatasetBinding` | `datasetId` / `contentHash` / `schemaHash` / `rowCount?` / `columnFingerprint?` / `statsFingerprint?` / `sourceUri?` / `retrievalTimestamp?` / `license?` / `consentOrPrivacyTag?` / `scopeCoverage` | §3 | `[VC]` contentHash/schemaHash/statsFingerprint/scopeCoverage |
| `WorkflowBinding` | `workflowId` / `workflowHash` / `engine` / `containerDigest?` / `environmentHash` / `commandHash?` / `seedPolicy` / `networkPolicy` | §3 | 全 `[VC]`；digest mismatch → verifier RED |
| `ExperimentRunBinding` | `runId` / `startedAt` / `endedAt?` / `actor` / `inputHashes[]` / `outputHashes[]` / `logHashes[]` / `exitCode?` / `resourceProfile?` / `deviations[]` | §3 | `[VC]`（`startedAt` 须晚于 `ProtocolFreeze.timestamp`） |
| `MeasurementResult` | `measurementId` / `runId` / `metricKey` / `metricValue` / `unit` / `isDeterministic` / `rawArtifactHashes[]` / `stdoutHash?` / `stderrHash?` / `runEnvironment?` / `collectedAt` | §4 | `[VC]`；`rawArtifactHashes` 缺失 → label-only → `UNTESTED` |
| `StatisticalResult` | `testId` / `status` / `effectDirection` / `pValue` / `adjustedPValue` / `effectSizeObserved` / `confidenceInterval` / `assumptionDiagnostics[]` | §4 | `[VC]`；裁决以 `adjustedPValue` 与 `alpha` 比较 |
| `VerdictKernelInput` | `fec` / `datasetBindings[]` / `workflowBindings[]` / `runs[]` / `measurements[]` / `statistics[]` / `protocolDeviations[]` / `antiTheaterFindings[]` / `evidenceSufficiency` / `scopeAssessment` / `contradictionSet[]` | §5 | 全 `[VC]`/`[EV]`；LLM 产出不得作为直接字段 |
| `VerdictKernelOutput` | `verdict` / `reasonCodes[]` / `ruleTrace[]` / `decisiveRuleId` / `evidenceSufficiency` / `scopeReport` / `statisticalReport` / `inputHashes[]` / `humanExplanationTemplateId` / `evidenceSummary` | §5 | `[VC]` verdict/ruleTrace/decisiveRuleId；`humanExplanationTemplateId` `[META]` 不进 proofHash |
| `VerdictRuleTrace` | `ruleId` / `outcome` / `inputs` / `messageCode` / `priority?` | §5 | `[VC]`；改 input 必变 proofHash |
| `ProtocolDeviation` | `deviationId` / `category` / `critical` / `runId?` / `detectedAt` / `beforeHash` / `afterHash` / `description` | §6 | `[VC]`；`critical=true` 命中 `criticalCategories` → `UNTESTED` |
| `AntiTheaterFinding` / `AntiTheaterReport` | `findingId` / `attackKind`(20值：10核心+10扩展，权威全集见 §7 与 `APPENDIX_A` §7) / `outcome` / `hasFail` / `evidenceRef` / `message`；Report: `findings[]` / `hasFail` / `failCount` / `warnCount` / `llmOverrideRejected`（+可选生产元数据 `antiTheaterScore?` / `canSealConfirmed?` / `verdictConstraint?`） | §7 | `[VC]`；`hasFail=true` → kernel 倾向 INCONCLUSIVE/UNTESTED |
| `ProofEnvelopeV2` | `schemaVersion:"far.proof_envelope.v2"` / `envelopeId` / `createdAt` / `claim` / `fecHash` / `fecSnapshot` / `protocolFreeze` / `datasetBindings[]` / `workflowBindings[]` / `experimentRuns[]` / `measurementResults[]` / `statisticalResults[]` / `verdictTrace` / `antiTheaterReport` / `ledgerRoot` / `proofHash` / `signatures?` / `humanSummary?` | §8 | `[VC]` proofHash 白名单见 `APPENDIX_C` §2.2 |
| `SignatureBlock` | `signerId` / `algorithm` / `publicKeyFingerprint` / `signature` / `signedAt` | §8 | `[META]`；对 proofHash 签名，不进 proofHash |
| `TrustReceiptSummary` | `claimSummary` / `verdict` / `evidenceScope` / `proofHash` / `verifierCommand` / `tamperStatus` / `limitations[]` / `requiredNextAction?` | §8 | `[DOC]`；对外口径须含「bounded support，非科学真理证书」 |
| `ActorRef` | `actorId` / `actorKind`(human/ci-bot/deterministic-tool/llm-assistant) / `canIssueVerdict:false` | §9 | `[VC]` `canIssueVerdict` 永远 false（F3 禁 LLM-as-judge，也禁人类手填 verdict） |
| `ResourceProfile` | `cpuCores?` / `gpu?` / `memoryMb?` / `deterministicThreads?` / `seedValue?` / `containerDigest?` | §9 | `[META]`；`deterministicThreads=1` 对齐 repro 七分量 |
| `CausalModel` | `nodes[]` / `edges[]`(3值 edgeKind，无 bidirected) / `controlledConfounders[]` / `unmeasuredConfoundersSuspected[]` | §10 | `[VC]`；`claimType=causal` 时 FEC 校验强制非空 |

### 4.1 数据契约与 migration 编号

> 历史口径：旧 `07_FINAL_ARCHITECTURE` §7 曾列核心表 / 三柱表 / 升级增量表的 migration 编号映射。当前 SSOT 保留其收敛裁决（proof_envelopes.verdict CHECK 统一 5 枚举；Claim IR schema 以 SciIRNode + Psi 字段 + causalModel 合并）。

| migration | 表 | 性质 | 状态 |
|---|---|---|---|
| 0001 | `call_records` / `evidence_log` / `verdict_nodes` / `evidence_edges` / `repro_runs` / `schema_meta` | 5+1 核心表（append-only hash chain，T10 锁死） | `IMPLEMENTED_VERIFIED` |
| 0002-0011 | （现状已锁的具体增补） | 现状已冻结 | `IMPLEMENTED_VERIFIED` |
| 0010 | `integrity_events` / `integrity_rules` | L9 Firewall 事件日志 + 配置（payload_kind 复用 9 值用 `'meta'`，方案 C 不扩枚举） | `DESIGN_LOCKED`（首里程碑 6 RULE 种子） |
| 0012-0015 | `probe_atlas_*` / `uq_witness_*` / `far_bench_*` | 三柱表（C33 spec-only；UQ `uq_grade` 例外 runtime） | `ROADMAP`（spec-only） |
| 0016 | `sciir_objects` | Claim IR 收敛 schema（3.txt 完整 DDL + Psi claim_ir 合并） | `DESIGN_LOCKED`（待实现） |
| 0017 | `proof_envelopes` | ProofEnvelope 持久化（verdict CHECK 统一 5 枚举） | `DESIGN_LOCKED`（待实现） |
| 0018 | `falsifiability_contracts` | L6 Falsification DSL 契约 | `DESIGN_LOCKED`（待实现） |
| 0019 | `trace_events` | 17 TraceEventType + hash chain | `DESIGN_LOCKED`（待实现） |
| 0020 | `verdict_protocols` | 5 kind + 4 errorControl | `DESIGN_LOCKED`（待实现） |
| 0021 | `replay_forks` | L11 反事实干预（6 intervention type） | `DESIGN_LOCKED`（路线图） |
| 0022 | `ledger_events` + `merkle_roots` | L12 本地 proof ledger（同构 call_records） | `DESIGN_LOCKED`（待实现） |
| 0023+ | `source_anchors` / `dataset_snapshots` / ... | 1.txt 17 张去重后的剩余 | `ROADMAP` |

---

## 5. 状态机

### 5.1 完整状态机（DRAFT_CLAIM → VERIFIED）

```text
DRAFT_CLAIM
  -> FEC_PROPOSED        (LLM 辅助编译 measurableImplication，但须过 deterministic validator)
  -> FEC_VALIDATED       (deterministic validator 通过：可测/可反驳/有界 scope/有 metric+threshold+statPlan)
  -> FEC_FROZEN          (ProtocolFreeze.frozenBy === "deterministic_freezer"，timestamp 锁定)
  -> EVIDENCE_BOUND      (DatasetBinding + WorkflowBinding + ExperimentRunBinding 全部 hash 绑定)
  -> MEASUREMENT_READY   (requiredEvidence 全就位，evidenceSufficiency.status !== "missing")
  -> MEASUREMENT_RAN     (SandboxRunResult: exitCode/stdoutHash/artifactTreeHash 落盘)
  -> STATS_EVALUATED     (StatisticalResult: adjustedPValue/effectSize/CI/assumptionDiagnostics 产出)
  -> VERDICT_DECIDED     (VerdictKernelOutput: verdict + ruleTrace + decisiveRuleId)
  -> ENVELOPE_SEALED     (ProofEnvelopeV2.proofHash 计算并写入，append-only)
  -> VERIFIED            (TS/Python/Browser 至少一路独立重算 proofHash + chain 通过)
```

### 5.2 非法跳转处理（不允许静默成功）

任何非法跳转必须变成以下之一，**禁止**静默推进：

| 非法跳转 | 处理 | 落点 |
|---|---|---|
| 跳过 `FEC_FROZEN` 直接 `EVIDENCE_BOUND` | `FEC_NOT_FROZEN` → `UNTESTED` | verdict kernel R1 |
| 跳过 `EVIDENCE_BOUND` 直接 `MEASUREMENT_RAN` | `DATASET_BINDING_MISSING` → `UNTESTED` | verdict kernel R2 |
| `ProtocolFreeze.timestamp` 晚于 `MeasurementResult.collectedAt` | HARKing → 强制 `claimStrength='exploratory'`，verdict 不可 `CONFIRMED` | Integrity Firewall RULE-HARK-001 |
| `MEASUREMENT_RAN` 但 `rawArtifactHashes` 缺失 | label-only evidence → `UNTESTED` | anti-theater `missing-raw-artifact` |
| `ENVELOPE_SEALED` 后篡改任一 verdict-critical 字段 | `proofHash` mismatch → verifier RED → `PROOF_HASH_MISMATCH` | `APPENDIX_C` §7 |
| `VERDICT_DECIDED` 由 LLM 直接产出（`createdBy === 'llm'`） | CI hard fail（RULE-JUDGE-001，fatal 级，不走降级） | F3 铁律 |
| chain hash 断裂（`prevHash`/`currentHash` 不符） | `verifyChainHead` 抛 `ChainIntegrityError` → `LEDGER_ROOT_MISMATCH` | tamper-evident |

### 5.3 状态机不变量（架构验收点）

1. `ProtocolFreeze.timestamp` ≤ 所有 `MeasurementResult.collectedAt` ≤ 所有 `StatisticalResult` 计算时间 ≤ `ProofEnvelopeV2.createdAt`；
2. `fecHash === sha256(canonicalJson(fecSnapshot))`（fast-fail 断言）；
3. `proofHash` 重算前后逐字节相等（Omit 自身 + `envelopeId` + `signatures` + `humanSummary` + recomputation 报告）；
4. 任一 verdict-critical 字段改动必使 `proofHash` 变（白名单见 `APPENDIX_C` §2.2）；
5. `ActorRef.canIssueVerdict === false` 永真（无任何执行者可手填 verdict，verdict 只由 deterministic kernel 产出）。

---

## 6. 实现原则

### 6.1 `src/` 扁平现实优先

`<REPOSITORY_ROOT>/src/` 扁平实现优先，多包拆分（`packages/`）只作为 V3 路线图。模块全景按四层交付分区组织（§2），不强制文件目录与十五层一一对应。

### 6.2 verdict-critical 字段进 canonical proof input

所有 verdict-critical 字段（`[VC]` 标注）必须进入 canonical proof input（`APPENDIX_C` §2.2 白名单）。新增字段默认**不**进 hash，除非显式加入白名单并同步 golden vectors。

### 6.3 解释字段可删除

所有解释字段（`[DOC]` / `[META]` 非裁决部分）必须可删除而不改变 verdict 与 proofHash。`humanExplanationTemplateId` 可进 proofHash（模板 id），但渲染后的自然语言**不进**。

### 6.4 LLM 输出标注来源与信任级别

LLM 输出进入系统时必须标注来源（`ActorRef.actorKind === 'llm-assistant'`）和信任级别（`canIssueVerdict === false`）。LLM 产出的内容不得作为 `VerdictKernelInput` 的直接字段，须经 deterministic 校验降级为 `EvidenceFact`。

### 6.5 FEC 编译 LLM 辅助 + deterministic validator

FEC 编译可由 LLM 辅助生成候选 `measurableImplication`，但冻结前**必须**通过 deterministic validator（8 项检查见 `03` §2）。失败时不得输出 `CONFIRMED` 或 `REFUTED`，默认进入 `UNTESTED` 或阻断。

### 6.6 Production 默认网络关闭

Production 默认 `NetworkPolicy === "off"` 或 `"allowlist"`。`"unrestricted-with-warning"` **不得**被包装成 `"off"`（反 theater：标 OFF 但实际联网 = verifier RED）。`offline_replay` profile 是 demo-day 兜底（零密钥），不得被包装成生产容灾。

### 6.7 Demo profile 与 production profile 分离

Demo profile（cached_fixture / offline_replay）和 production profile 必须分离。`offline_replay` 不得被包装成生产容灾；cached 结果不得冒充在线结果升 `CONFIRMED`（F1 决策树降级纪律）。

### 6.8 seed / alpha / correction 三重同时开关

涉及随机的 workflow 必须声明 `SeedPolicy`（`fixed=true` + `seedValue=42` 默认）。`seed=42` 与 `alpha` / `multipleTestingCorrection` 三重同时开关（任何一项后验修改 → `p_hacking_risk` / `seed_cherry_picking risk`）。`nthread=1` 单线程确定性（BLAS threadpool 显式锁，对齐 repro 七分量）。

### 6.9 不声称物理隔离

sandbox 仅提供「资源限制 + 默认禁网 + 版本锁」，**不提供**进程级逃逸防护、内核级沙箱或硬件隔离（F4）。措辞严禁出现 `strong isolation` / `tamper-proof` / `physically isolated`。正确表述：resource-bounded & network-restricted venv execution。

### 6.10 sandbox 安全清单

- 默认无任意代码执行；workflow/notebook 仅在 sandbox 执行；
- Network 默认 OFF；adapter allowlist + manifest hash；
- 本地绝对路径须规范化为 `<REPOSITORY_ROOT>/` 前缀；
- proof bundle 内无 API key（`call_records.redacted.jsonl`）；
- LLM 输出不能作为最终 verdict（F3）。

---

## 7. 架构验收标准

架构设计通过的标准（每条都可机器验证或 CI 守卫）：

| # | 标准 | 验证方式 |
|---|---|---|
| AC-1 | 任一 claim 能追踪到 FEC | `fecHash` 回指 + `claimId` 反查 |
| AC-2 | 任一 verdict 能追踪到证据、统计计划和 rule trace | `VerdictKernelOutput.ruleTrace[]` + `inputHashes[]` + `decisiveRuleId` |
| AC-3 | 任一 proofHash mismatch 能定位字段 | diff report 落 `APPENDIX_C` §7 verdict-critical 字段表的一行（`CLAIM_HASH_MISMATCH` / `FEC_HASH_MISMATCH` / ... / `LEDGER_ROOT_MISMATCH`） |
| AC-4 | 任一 LLM 参与路径都不能直接写最终 verdict | `no_llm_final_judge_scan` CI grep + `ActorRef.canIssueVerdict === false` 永真 |
| AC-5 | 任一旧口径中的「复现 / 审计 / 证明」都能改写为更具体的「独立重算 / 篡改可检测 / 满足冻结契约」 | `honesty-grep-gate`（禁用词门） |
| AC-6 | TS / Python / Browser 对四字段白名单对象产出 byte-equal hash | `cross_lang_consistency` CI 守卫（R2 最高工程优先门） |
| AC-7 | fresh-clone 环境（无开发工具 / 无 API key）core CI 100% 通过 | `offline_replay` profile CI 全绿（C9） |
| AC-8 | 5 枚举决策树优先级锁定，多规则触发取严 | `applyVerdictConstraint`（F2：`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`） |
| AC-9 | 任一 FEC 编译失败 / 证据缺失 / 临界偏离 → `UNTESTED`（不得静默 `CONFIRMED`） | verdict kernel R1/R2/R3 + Integrity Firewall |
| AC-10 | `CONFIRMED` = bounded support（非科学真理证书），Trust Receipt 须含 limitations | `TrustReceiptSummary.limitations[]` 非空 + `requiredNextAction?` |

---

## 8. 关键接口契约（来源溯源 · 旧 `75` 工程蓝图）

> 历史口径：以下接口签名来自旧 `75_ENGINEERING_IMPLEMENTATION_BLUEPRINT` §2 与旧 `07_FINAL_ARCHITECTURE` §6。当前 SSOT 保留其作为**设计层契约**（`DESIGN_LOCKED`），不声称待实现接口已存在；运行时实现以 `<REPOSITORY_ROOT>/src/` 实际代码为准（P2）。

### 8.1 Core 中立接口（L0-L15 通用 · 禁 Qwen 字面量）

```typescript
// Core 唯一 LLM 出口（模型中立）
callLlm(providerProfile: ProviderProfile, request: CanonicalRequest): Promise<CallResult>;
// ProviderProfile ∈ {competition_aliyun_qwen, research_best_available,
//                    local_open_weights, offline_replay, string}

// Core 信任根（冻结）
canonicalHash(input: CanonicalInput): string;            // sha256(stable-stringify)，四字段白名单
verifyChainHead(records: CallRecord[]): ChainVerificationResult;
appendRecord(rec: CanonicalInput): CallRecord;           // 写入期 hash

// Core 裁决（冻结 5 枚举）
decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput;
// 决策树: DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED

// Core 编排（FEC，不新增表）
fecAppendClaim(claim: SciIRNode, anchor: SourceAnchor, repro: ReproHash,
               spec: FalsificationSpec): FecAppendResult;  // 三件套缺一 throw
```

### 8.2 完整模块接口（设计层契约）

```typescript
export function compileFEC(claim: ClaimCandidate): FecCompileResult;
export function validateFEC(fec: FecContract): ValidationResult;
export function freezeProtocol(fec: FecContract, actor: ActorRef): ProtocolFreeze;
export function bindDataset(input: DatasetBindingInput): DatasetBinding;
export function runMeasurementPlan(input: MeasurementRunInput): MeasurementResult;
export function evaluateStatisticalTest(input: StatisticalEvaluationInput): StatisticalResult;
export function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput;
export function sealProofEnvelopeV2(input: ProofEnvelopeV2Input): ProofEnvelopeV2;
export function verifyEnvelope(input: VerifyEnvelopeInput): VerifyReport;
export function verifyChainHead(input: VerifyChainInput): VerifyReport;
export function diffProofHeads(before: string, after: string): ProofHeadDiff;
export function explainVerdictTrace(trace: VerdictRuleTrace[]): HumanExplanation;
export function runAntiTheaterLint(input: AntiTheaterLintInput): AntiTheaterLintReport;
export function runMutationAttack(caseId: string): AttackReplay;
export function buildClaimGraph(envelopes: ProofEnvelopeV2[]): ClaimGraph;
export function propagateGraphVerdict(graph: ClaimGraph, changedNodeId: string): AggregateVerdict[];
```

### 8.3 CLI 命令（设计层）

```bash
far status [--json] [--db <path>]
far verify --bundle <path> [--mode chain|envelope|full] [--json]
far fec compile --claim claim.json --out fec.json
far fec freeze --fec fec.json --actor reviewer.json
far bind dataset --fec fec.json --path data.csv
far measure run --fec fec.json --binding dataset.json --sandbox offline
far anti-theater lint --bundle .far-proof
far graph impact --bundle .far-proof --changed-node <id>
```

### 8.4 Competition adapter 接口（唯一 Qwen 漏斗）

```typescript
// 仅 competition_aliyun_qwen profile 允许依赖 DashScope/百炼
competition_aliyun_qwen.callForCompetitionCredential(req): Promise<BailianCallResult>;
// BailianCallResult = {data, response, dashscopeRequestId: string|null}
//   dashscopeRequestId === null → throw RequestIdMissingError FATAL
// snapshot.ts（唯一钉版本源）: 'qwen3.7-max-2026-05-20'（NEEDS_EXTERNAL_VERIFICATION，提交前 day-0 复核）
// buildCreateParams: enable_thinking（顶层）+ R1 互斥守卫（thinking ⊥ json_schema）
```

> 模型可插拔为 V2 设计目标（**非 V1 已验证**）：V1 仅 `competition_aliyun_qwen` profile 落地；Court 可换 DeepSeek/GLM/Llama 是 FI-3 目标态，信任根算法一字不改，但切换基座须调整 profile 钩子 + 重算 golden hex（非零改动）。

---

## 9. 部署与运行时拓扑

```text
┌─────────────────── 开发工具域（隔离）───────────────────────────┐
│  Claude Code / UltraCode → 写 .ts/.py/.sql/.md, 跑 typecheck/test │
│  ★ 任何 runtime import 开发工具 = 违宪 §2                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 产出代码
                           ▼
┌─────────────────── FAR-Lab 运行时（fresh-clone 可复现）─────────┐
│                                                                  │
│  ┌─────────────── TS 运行时 (Node 24) ───────────────────────┐  │
│  │ agent_loop + provider + verifyChainHead + canonicalHash    │  │
│  │ + SciIR + ProofEnvelope + Firewall + Harness               │  │
│  │ adapters/aliyun_qwen/ (唯一 Qwen 漏斗)                     │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │ better-sqlite3 (node:24-bookworm-slim)│
│                           ▼                                        │
│  ┌─────────────── SQLite (5 核心表 + migration 0016+) ────────┐  │
│  │ append-only hash chain (trigger ABORT 守卫)                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────── Python 确定性镜像 (repro) ─────────────────┐  │
│  │ canonical_hash + repro_run + threadpool_info(BLAS=1)       │  │
│  │ + TESS(Lightkurve/MAST) + SciPy/statsmodels               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ★ cross_lang byte-equal: TS hash === Python hash (R2 门)        │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────── 三制品齐发（release 红线）───────────────────┐
│  npm @far-chain/harness + PyPI far-chain-repro + OCI ghcr.io     │
│  + Repro Bundle(tar.zst, sevenFactorSnapshot) + CycloneDX SBOM   │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────── CI 12+步 gate（横切验证）────────────────────┐
│  install→typecheck→lint→py_typecheck→test_ts→test_py→           │
│  test_registry→repro_check→cross_lang(R2)→eval_ring_audit(C2)→  │
│  competition_qwen_smoke(条件)→verify_chain_smoke +              │
│  sciir_schema_check/proof_envelope_hash_check/                  │
│  no_llm_final_judge_scan/tess_fixture_replay/...                │
└──────────────────────────────────────────────────────────────────┘
```

**fresh-clone 铁律**：无 Claude Code / 无 `DASHSCOPE_API_KEY` 时，core CI 必须 100% 通过（`offline_replay` profile）（C9）。

---

## 10. 架构决策记录（ADR · 来源溯源）

> 历史口径：以下 ADR 来自旧 `07_FINAL_ARCHITECTURE` §9。当前 SSOT 保留其作为架构决策溯源。

| ADR | 决策 | 理由 | 来源 |
|---|---|---|---|
| ADR-01 | 四层交付分区（收敛旧十五层散焦） | 保护信任根，避免「十五层同时必达」散焦 | 本 §2 |
| ADR-02 | L0-L3 冻结，增量走 ≥0016 migration | T10；改核心表 = 信任根重写 | 旧 07 §2 |
| ADR-03 | verdict 统一 5 枚举（旧 2.txt 4 枚举废弃） | F2 决策树优先级锁定；现状 SSOT | 旧 07 §2 |
| ADR-04 | Claim IR 收敛为单一 schema（SciIRNode 骨架 + Psi 字段 + causalModel） | 解决三版本冲突 | 旧 07 §2 |
| ADR-05 | Core 模型中立，Qwen 仅 adapter | C1；终审失格红线 | 旧 07 §2 |
| ADR-06 | cross_lang R2 为最高工程优先门 | T1；确定性是信任根基石 | 旧 07 §2 |
| ADR-07 | 反 theater（禁 LLM-as-judge，5 枚举决策树）高于 demo 效果 | F1-F3；项目灵魂 | 旧 07 §2 |
| ADR-08 | `.far-proof` 三重出口分层（首里程碑基本 → 路线图完整） | KB overclaim O6；MVP 不堆砌 | 旧 07 §2 |
| ADR-09 | Formal（TLA+/Lean）为路线图非 runtime | F10；fresh-clone 无形式化工具仍跑 core | 旧 07 §2 |
| ADR-10 | Merkle 为 local ledger，不说区块链，公开 = 路线图 | C11；表述红线 | 旧 07 §2 |
| ADR-11 | TESS Demo 不声称新发现 | C15；「周期性下降」≠ `CONFIRMED` | 旧 07 §2 |
| ADR-12 | 命题降调 Proof-Carrying Reliability Infrastructure（去 OS） | 旧 04 O8 / 05 X1；proof 张力 | 旧 07 §2 |

---

## 11. 诚实护栏与已知分叉（本章红线汇总）

| 风险 / 分叉 | 守卫 / 处置 | 状态 |
|---|---|---|
| 信任根被读成「物理不可篡改」 | 全章「信任根」一律读 tamper-evident；`APPENDIX_C` §11 边界矩阵 | 强制（禁用词） |
| `far-chain/` 被当真实实现子目录 | 一律写 `<REPOSITORY_ROOT>/`；旧路径仅作溯源 | 强制（禁用词） |
| 4 值 verdict 残留 | 统一 5 枚举（+ `UNTESTED`）；旧 4 值 `RETIRED` | 强制（ADR-03） |
| 浮点科学计数法跨语言分叉（`1e-7` vs `1e-07`） | 四字段白名单结构性排斥浮点；ProofEnvelope 数值字段须字符串承载或归 RED；V3 迁移 RFC 8785 JCS | `NUMERIC_KNOWN_DIVERGENCE`（`APPENDIX_C` §8） |
| V2 被读成「新架构」 | V2 = L4-L15 产品化暴露壳，零改信任根 | 强制（§2.5） |
| 接入层污染 L0-L15 | CI 守卫：接入层零 `canonicalHash` / 零新 verdict 枚举 / 零厂商字面量进核心算法 | `ROADMAP`（W0 status-dump 实施时界定精确 grep 边界） |
| sandbox 被声称物理隔离 | F4：仅资源限制 + 禁网 + 版本锁 | 强制（§6.9） |
| TESS Demo 声称发现新行星 | C15：M1-M4 全 PASS + vetting 才可考虑 `CONFIRMED`；任一 WARN/FAIL → `INCONCLUSIVE`/`REFUTED` | 强制（ADR-11） |
| MiniBench 被冒充通用 benchmark | C13：项目内 self-test，不与 CORE-Bench 横向比较；recall 全标 `NEEDS_REAL_TEST` | 强制 |
| 数字漂移（测试数 / 文件数 / CI 通过率） | 全章禁手填裸数字，一律来自 `far status --json` 或写 `Pending` / `NEEDS_EXTERNAL_VERIFICATION` | 强制（`01` §4） |
| 模型 snapshot 时效 | 团队 verified_live 但无百炼官方维护期承诺；提交前 day-0 GET `/v1/models` 实测复核 | `NEEDS_EXTERNAL_VERIFICATION` |

---

## 12. 与其他文档的咬合

| 文档 | 关系 |
|---|---|
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | 状态标签、禁手填数字、路径约定（`<REPOSITORY_ROOT>/`）、禁用词 |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | FEC 结构、五值 enum、裁决内核输入输出、anti-theater 规则（本章 §4-§5 引用） |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | ProofEnvelope V2 结构、proofHash 纪律、`.far-proof` bundle、独立验证等级、diff report |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | demo 中篡改演示须真实改 verdict-critical 字段；TESS Demo 不声称新发现 |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用词（物理不可篡改 / 证明科学真理 等）、tamper-evident 措辞 |
| `08_TRACEABILITY_MATRIX.md` | 旧 `far-chain/` 路径废弃、旧 4 值 verdict 废弃、Rust/Go/WASM verifier 降级为 V2/V3；旧编号 → 新位置映射 |
| `APPENDIX_A_TYPES.md` | 字段名 / 类型名 / enum 值权威；本章 §4 数据对象与之对照，冲突时以 A 为准 |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化、proofHash 白名单、Merkle 算法、NUMERIC_KNOWN_DIVERGENCE 权威 |
| `APPENDIX_F_GLOSSARY.md` | 术语语义权威（tamper-evident / bounded support / canonical / proofHash 等） |

---

## 13. 历史口径与已退役内容（仅作溯源）

> 下列口径在历史 `FINAL_PACKAGE` 中出现过，现 `RETIRED`，仅保留溯源。物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

| 历史口径 | 现口径 | 来源（旧编号 → 新位置） |
|---|---|---|
| `far-chain/` 是真实实现子目录 | `<REPOSITORY_ROOT>/` 是当前实现根 | 旧 56 §2.2 / 旧 03 → `01` §1 / `08` §2 |
| 4 值 verdict | 5 值 verdict（+ `UNTESTED`） | 旧 03_EXISTING_ARCHITECTURE §7 → `03` §5 / `APPENDIX_C` §6 |
| 「十五层同时必达」 | 收敛为四层交付分区，十五层仅作模块全景矩阵（§2.5） | 旧 07_FINAL_ARCHITECTURE §1 → 本 §2 |
| 「物理拦截 / physical interception」 | tamper-evident（非 tamper-proof） | 旧 56 §4 R6 → `APPENDIX_C` §11 |
| 跨语言字节相等「已实证 LIVE」（全域） | 四字段白名单已实证；浮点科学计数法已知分叉 | 旧 56 §4 R7 → `APPENDIX_C` §8 |
| 旧 `9f1d2f0c…0000` golden 占位值 | `RETIRED`，被真实 `REPRO_CONTEXT_FIXTURE` expectedHex 取代 | 旧 56 §2.3 → `APPENDIX_B` / `APPENDIX_C` §10 |
| 「Core 目录 grep = 0 命中」字面声称 | 精确化：Core **算法** grep = 0；`evidence_log`/`falsifiability` 含 profile 钩子（含 qwen 子串·非算法依赖） | 旧 59 W0-4 → 本 §3.3 |
| V2 = 新造 L16+ 能力层 | V2 = L4-L15 产品化暴露壳，零改信任根 | 旧 54 → 本 §2.5 |
| Formal（TLA+/Lean/Alloy）为 runtime 依赖 | 只读验证层，非 runtime 依赖（F10） | 旧 07 §2 ADR-09 → 本 §2.5 / §10 |

> 旧编号（如 `03_EXISTING_ARCHITECTURE.md` / `07_FINAL_ARCHITECTURE.md` / `38` / `54` / `75`）作为来源溯源保留；其物理档案随 `FINAL_PACKAGE` 退役，备份见 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。后续维护引用本章与 `APPENDIX_A` / `APPENDIX_C` / `APPENDIX_F` 即可，不再回引旧编号作为有效依赖。

---

## 14. 状态与边界总结

| § | 模块 / 能力 | 状态 | 关键红线 |
|---|---|---|---|
| §1 | 架构总线（主链路 + 单向信任流） | `IMPLEMENTED_VERIFIED`（信任根）/ `DESIGN_LOCKED`（编排） | F3 无捷径 |
| §2.1 | Core Trust Root | `IMPLEMENTED_VERIFIED`（hash/chain）/ `DESIGN_LOCKED`（migration runner） | T3/T8/T10 |
| §2.2 | Falsification Layer | `DESIGN_LOCKED`（实现 `PARTIAL`） | F1/F2/F3 |
| §2.3 | Proof & Verification Layer | `DESIGN_LOCKED`（V1 `PARTIAL`，P0 升 V2） | proofHash 白名单 |
| §2.4 | Product & Ecosystem Layer | `DESIGN_LOCKED`（基本导出）/ `ROADMAP`（adapter / FAR-Bench / 完整合规） | C13 不冒充通用 benchmark |
| §2.5 | 模块全景矩阵（十五层映射） | 来源溯源（旧 07） | 消歧约定（L7-L1/L7-L2/L7-L3 vs 全局 L1/L2/L3） |
| §3 | 模块边界（负责 / 不负责 / Core 中立 / 运行时隔离） | 强制 | C1/C9/宪法 §2 |
| §4 | 核心数据对象（19 对象索引 + migration 编号） | `DESIGN_LOCKED`（字段以 `APPENDIX_A` 为权威） | `[VC]`/`[EV]`/`[META]`/`[DOC]` 标注 |
| §5 | 状态机（DRAFT_CLAIM → VERIFIED + 非法跳转 + 不变量） | `DESIGN_LOCKED` | 5 条不变量 |
| §6 | 实现原则（10 条） | 强制 | F4/F8/三重开关/src 扁平 |
| §7 | 架构验收标准（AC-1..AC-10） | 强制（CI 可验） | 每条可机器验证 |
| §8 | 关键接口契约（Core / 模块 / CLI / adapter） | `DESIGN_LOCKED`（设计层·不声称已实现） | P2 以代码为准 |
| §9 | 部署与运行时拓扑 | `DESIGN_LOCKED`（fresh-clone 铁律） | C9 |
| §10 | ADR（12 条） | 来源溯源（旧 07 §9） | — |
| §11 | 诚实护栏与已知分叉 | 强制 | 11 条红线 |
| §13 | 历史口径与已退役内容 | `RETIRED`（仅溯源） | 备份 `C:/Users/RichardYuan/FAR-Lab_Backups/` |

> 本章冻结「架构总线、四层交付分区、模块边界、数据对象索引、状态机、实现原则、架构验收」七根支柱。任何修改四层分区、五值 enum、proofHash 白名单、`canonicalHash` 四字段白名单或状态机不变量的提议，必须同时修改本章、`APPENDIX_A_TYPES.md`、`APPENDIX_C_CANONICAL.md`、`APPENDIX_F_GLOSSARY.md`、golden vectors、所有 verifier 与答辩口径——否则不成立。
