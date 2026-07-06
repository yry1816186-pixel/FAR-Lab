# 附录 F · 术语表与规范（Glossary & Conventions）

> 作用域：本附录是 `PROJECT_PLAN/` 的**术语与表述规范权威集中处**。
> 权威关系：本附录与 `APPENDIX_A_TYPES.md`（类型权威）、`APPENDIX_C_CANONICAL.md`（canonical 序列化权威）构成"附录三权威"。当术语、字段名、enum 值、路径写法发生冲突时，**类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义与表述口径以本附录（F）为准**。
> 保留自现有 SSOT：`01_SOURCE_OF_TRUTH_AND_STATUS.md` 的状态标签 taxonomy、`07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` 的禁用词与改写对照、`01` 的路径约定与文档优先级 P0-P3、`08` 的命名收敛裁决（FAR-Chain 为系统名 / 真研 FAR-Lab 为项目集）。本附录增补的是**全量核心术语定义、最终命名表、anti-theater / verdict-critical / independent recomputation / tamper-evident / protocol freeze / scope 等术语的精确语义钉死**。
> 一句话口径：**FAR-Chain 是 AI4S 科学声明的 claim-level verification layer，不是 AI Scientist；裁决由确定性五值内核产出，LLM 不得作为最终裁决者；篡改是 tamper-evident（可检测）而非 tamper-proof（物理不可改）；任何对外材料中出现裸数字、禁用词、`far-chain/` 路径、第六值 verdict，即视为违反本附录。**

---

## §0. 术语规范元规则（先读这一节）

1. **术语唯一性**：每个概念在本项目内只有一个主名（canonical name）。弃用名只在 §4 命名表"弃用名"列出现，禁止作为有效口径使用。
2. **表述纪律优先于"听起来好"**：当精确术语与营销冲击力冲突，保精确。`07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` 与本附录 §6 共同构成表述红线。
3. **枚举锁定**：五值裁决 enum 固定为 5 值（§3.6）；`ProviderProfile`、`VerdictKind`、`UqGrade`、`PurposeTag` 等 enum 的字段名以 `APPENDIX_A_TYPES.md` 为最终字段权威，本附录只钉死语义。
4. **路径单一写法**：所有工程路径以 `<REPOSITORY_ROOT>/` 开头（§7）。`far-chain/` 作为真实实现根是禁用口径（仅可在"已废弃历史规划"语境显式标注后出现）。
5. **手填裸数字禁令**：测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品发布时间一律来自 `far status --json` 或 CI，文档中不得手填（§8）。
6. **状态标签强制**：任何能力描述必须带一个 §5 状态标签，禁止"已实现"与"应实现"混写。

---

## §1. 项目级身份术语

### 1.1 FAR-Chain（系统主名）

| 维度 | 口径 |
|---|---|
| 主名 | `FAR-Chain` |
| 定位 | AI4S 科学声明的 **claim-level verification layer**（声明级证据验真层） |
| 职责（FAR 负责） | claim-level verification；evidence contract；protocol freeze；evidence binding；deterministic verdict；ProofEnvelope；independent recomputation；anti-theater failure modes |
| 职责（FAR 不负责） | 训练基础模型；wet lab / 真实实验；替代完整 workflow engine；替代同行评审；自动保证科学结论正确；管理全部科研数据生命周期 |
| 一句话 | "当任何系统声称'我发现了 X'或'证据支持 Y'时，FAR-Chain 问：这个声明能否被编译为可证伪契约，能否绑定证据，能否被独立重算，能否在证据不足时诚实降级。" |
| 禁止混淆 | 不是 AI Scientist；不是 coding agent；不是 workflow runner；不是普通 provenance viewer；不是普通 hash ledger；不是通用 benchmark；不是科学真理机器 |

### 1.2 真研 FAR-Lab（项目集主名）

| 维度 | 口径 |
|---|---|
| 主名 | `真研 FAR-Lab`（中英混排为正式写法，对应英文 `FAR-Lab`） |
| 定位 | **项目集 / 团队 / 工程组织名**，承载 FAR-Chain 系统及其周边（DomainPack、FAR-Bench、demo、答辩、开源治理） |
| 与 FAR-Chain 的关系 | FAR-Lab 是"做这个事的项目集"，FAR-Chain 是"项目集产出的核心系统"。文档中两者不可互换：谈系统行为用 FAR-Chain，谈项目身份用 真研 FAR-Lab |
| 历史口径（已废弃） | `FAR-Lab Ψ`、`FAR-Chain Ω`、`Proof-Carrying AI Scientist OS`、`Proof-Carrying Scientific Agent Operating System` 均为已收敛的历史命名（见 §4 命名表），不再作为正式身份 |

### 1.3 V2 叙事口径（进攻性诚实）

> 锚定 `44_VISION_V2`。叙事主语从"我们（防御性克制）"翻转为"你（可亲手验证）"，但**不放宽任何 DO_NOT_CLAIM 边界**。

| V2 叙事"可验证（Verifiable）"精确指 | V2 叙事"绝不指"（守 DO_NOT_CLAIM） |
|---|---|
| 过程可信证据可机器检验（完整性 / 顺序 / 来源锚 / 复现哈希可被第三方 2 秒重算） | 证明科学结论为真（ProofEnvelope ≠ 真理证明；守 C9） |
| verdict 由机械规则产出（5 值走确定性 `verdict_mapping`，无 LLM 自评） | 证明 AI 是对的（verdict 常诚实落 REFUTED/INCONCLUSIVE/UNTESTED） |
| 跨语言字节一致（TS ≡ Python ≡ WASM canonicalHash 字节相等，CI 断言） | 找出"最准的模型"（守 C13 通用 benchmark 红线；法庭只标盲区，不排座次） |
| 反 theater 物理护栏（FAIL+CONFIRMED 被 SQLite trigger ABORT，伪绿不可能落库） | 通才科研系统（守 C16；每 DomainPack 只覆盖一类示范 claim） |

---

## §2. 核心对象术语

### 2.1 Claim（科学声明）

| 维度 | 口径 |
|---|---|
| 定义 | 进入 FAR-Chain 的待裁决科学声明。可以是 AI agent、科研工作台、workflow、notebook 或人工团队提出 |
| 最小内容 | `id`、`naturalLanguage`、`domain`、`scope`、`author`、`createdAt`（字段权威见 `APPENDIX_A_TYPES.md`） |
| 进入条件 | 必须能被编译为 FEC（可测、可反驳、可冻结、可绑定证据、可由第三方重算、缺证据时能诚实降级） |
| 边界 | FAR 不生成"漂亮但不可证伪"的假设作为目标产物；不可证伪的 claim 在 FEC 编译阶段 fail-closed |

### 2.2 FEC（Falsification Evidence Contract · 可证伪证据契约）

| 维度 | 口径 |
|---|---|
| 主名 | `FEC` |
| 全称 | Falsification Evidence Contract（可证伪证据契约） |
| 定义 | 一个**冻结的、可验证的结构化承诺**，把 claim 翻译为"在什么数据上、用什么 metric、过什么 threshold、按什么统计计划、在什么 scope 下可以被支持或反驳"。**不是提示词模板，不是自然语言评语** |
| 三件套硬约束（F7） | 每个 claim 进链必须同时有 `source_anchor + repro_hash + FalsificationSpec`，任一缺失**硬 throw（非 fallback）** |
| 编译失败码 | `FEC_NOT_COMPILABLE` / `SCOPE_UNBOUNDED` / `METRIC_MISSING` / `THRESHOLD_MISSING` / `EVIDENCE_REQUIREMENT_MISSING` / `STAT_PLAN_MISSING` / `PROTOCOL_INCOMPLETE` |
| 失败后果 | 编译失败时不得输出 `CONFIRMED` 或 `REFUTED`，只能进入 `UNTESTED` 或阻断 |
| 协议层性质（C18） | FEC **不新增任何表 / hash / 枚举**，只新增编排协议层（复用 0001 五表 + repro 链） |
| V1 → V2 升级 | V1 = optional contract（已有实现痕迹）；V2 = mandatory，绑定 statistical plan 和 evidence requirements，`fecAppendClaim` 走 contract-required path |
| 最小结构字段 | 见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §1 的 `FecContract` TS 类型（`fecId` / `claimId` / `measurableImplication` / `scope` / `requiredEvidence` / `datasetRequirements` / `workflowRequirements` / `metric` / `threshold` / `direction` / `statisticalPlan` / `powerPlan` / `multipleTestingPlan` / `seedPolicy` / `deviationPolicy` / `freeze`），字段权威在 `APPENDIX_A_TYPES.md` |

### 2.3 ProofEnvelope（证明信封）

| 维度 | 口径 |
|---|---|
| 主名 | `ProofEnvelope`（V2 schemaVersion = `"far.proof_envelope.v2"`） |
| 定义 | 科学声明的**可转交证据包**。把 claim、FEC、证据绑定、统计计划、运行结果、verdict trace、ledger root 绑定为可被第三方重算的对象 |
| 它证明什么 | claim 与 FEC 已绑定；协议在证据运行前被冻结；数据/workflow/统计计划/运行结果/verdict trace 已进入 proof input；第三方可重算 proofHash；篡改 verdict-critical 字段会被发现 |
| 它不证明什么 | 科学结论绝对正确；实验在物理世界中不可篡改；同行评审可被替代；所有未来数据都会支持该结论 |
| V1 → V2 升级 | V1 = 有 self-check 和 proofHash（PARTIAL）；V2 = 绑定 SciIR fields、claim graph、cross-language proofHash |
| 最小结构 | 见 `04_PROOF_ENVELOPE_AND_VERIFIER.md` §2 的 `ProofEnvelopeV2` TS 类型 |
| 配套 bundle | `.far-proof/` 目录（§2.4） |

### 2.4 `.far-proof/` bundle（信任收据包）

P0 bundle 结构（来自 `04` §4，权威在此钉死）：

```text
.far-proof/
  claim.json
  fec.json
  bindings/
    datasets.json
    workflows.json
  runs/
    run-*.json
  measurements/
    result-*.json
  verdict.json
  proof-envelope.json
  ledger/
    chain.json
    merkle.json
  README_RECEIPT.md
```

打包硬约束：

- bundle 内**不含密钥**（守 S1）；
- **不含真实个人隐私路径**（守隐私门）；
- 所有引用文件都有 hash；
- 缺文件时 verifier 给出结构化错误（非静默放行）；
- Windows 路径、空格路径、离线目录可运行；
- bundle 是**自验证离线重算包**，**不等于** IETF/RO-Crate 官方认证（V2-7）。

### 2.5 Trust Receipt（信任收据）

| 维度 | 口径 |
|---|---|
| 主名 | `Trust Receipt`（信任收据） |
| 定义 | 面向人的**简明收据**，**不是替代 ProofEnvelope 的新事实源**。是 ProofEnvelope 的 `humanSummary` 投影 |
| 内容 | claim；verdict；evidence scope；proofHash；verifier command；tamper status；limitations；required next action |
| 中文标准口径 | "该声明在冻结的 FEC 与当前证据范围内得到 `<VERDICT>`。这不是终局科学真理证书，而是该证据包满足既定可证伪契约、且可被独立重算的信任收据。" |
| 英文标准口径 | "This claim is `<VERDICT>` under the frozen FEC for dataset scope X, with proofHash Y. The receipt does not certify universal scientific truth. It certifies that the sealed evidence package satisfies the stated contract and can be independently recomputed." |
| 不可省略 | `limitations` 段——省略即违反诚信红线 |

### 2.6 proofHash（证明哈希）

| 维度 | 口径 |
|---|---|
| 主名 | `proofHash` |
| 定义 | 对 ProofEnvelope 的 verdict-critical 字段做 canonical serialization 后计算的稳定摘要，**复用现状 canonicalHash byte-equal 规范** |
| 算法 | `sha256(canonical_json(<proofHash input>))`；canonical 序列化字节规则以 `APPENDIX_C_CANONICAL.md` 为权威 |
| 必须进入 proofHash 的字段 | claim id + normalized claim text；FEC snapshot；protocol freeze；dataset bindings；workflow bindings；run bindings；measurement result hashes；statistical result；protocol deviations；anti-theater findings；verdict kind；reason codes；rule trace；ledger root；schema version（详见 `04` §3） |
| 不应影响 proofHash 的字段 | UI 展示顺序；markdown 解释；本地文件绝对路径；非决定性时间戳（除非是 freeze / seal 事件）；debug 日志全文（除非其 hash 被显式声明为 evidence） |
| 跨语言纪律 | 相同 sealed envelope 在 TS / Python / browser 中 hash 一致；修改任一关键字段会导致 verify fail |
| 误述订正 | `proofHash` ≠ merkle root；`96a6372bdf04…af4abf4` 是 `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（**非 merkle 根，非 proofHash**），禁止误述为"根哈希" |

### 2.7 ledgerRoot（账本根）

| 维度 | 口径 |
|---|---|
| 主名 | `ledgerRoot` |
| 定义 | append-only 证据链（`call_records` / `evidence_log` / `repro_runs`）经 Merkle 化后的根哈希，作为 ProofEnvelope 锚定的"事件不可静默覆盖"凭证 |
| 性质 | **tamper-evident**（篡改可检测）——链头 hash 变化可被 verifier 重算发现；**非 tamper-proof**（DROP TRIGGER 可绕过 DB 层防护，靠 external anchor 如 `gitCommitSha` / crossref DOI 兜底） |
| 表述红线 | 禁止说"物理不可篡改"；正确表述见 §6 禁用词表 |
| 同构关系 | `ledger_events.prev_hash / current_hash` hash 链与 `call_records` 同构（来自 3.txt 完整 DDL） |

### 2.8 canonical serialization（规范序列化）

| 维度 | 口径 |
|---|---|
| 主名 | `canonical serialization` / `canonicalHash`（产物名） |
| 定义 | 对 verdict-critical 字段生成**稳定字节表示**的规则，使 TS / Python / WASM 三语言对同一输入产出字节相等的序列化结果 |
| 算法 | `sha256(canonical_json(input))` |
| TS 实现 | `fast-json-stable-stringify@^2.1` + sha256（递归排序 key） |
| Python 实现 | `json.dumps(sort_keys=True, allow_nan=False, separators=(',',':'), ensure_ascii=False)` + sha256 |
| 白名单四字段（T3） | `stageId` / `cred` / `payloadKind` / `prevHash`（**显式白名单，禁 spread 黑名单 API-1**）——防未来加审计列静默 hash 漂移 |
| N1 字节级对齐（T4） | 写入期 `appendRecord` 与验证期 `verifyChainHead` 的 hash 输入结构必须相同（嵌套 `CanonicalInput`，Omit `seq`/`currentHash`，保留 `prevHash`）；`prevHash undefined` 即抛；首条 = `GENESIS_PREV_HASH='0'.repeat(64)` |
| 数值归一化子契约 | TS `1.0→1` / Python `1.0→1.0` / 大整数 / 科学计数法存在已知边界（如 `1e-7` 鸿沟：TS→`1e-7` / Py→`1e-07`），按 `NUMERIC_KNOWN_DIVERGENCE` 诚实归 RED，待 RFC 8785 JCS 迁移（V3） |
| R2 最高优先闸门 | `cross_lang_consistency.test`：TS canonicalHash hex === Python canonical_hash hex，**不过禁合并** |
| allow_nan=False（T8） | 必须。TS JSON 不支持 NaN/Inf；确定性漏洞修复 |
| 字节规则权威 | 详细字节规则（key 排序、数值格式化、Unicode 规范化、白名单字段处理）以 `APPENDIX_C_CANONICAL.md` 为最终权威，本附录只钉死语义 |

### 2.9 golden vectors（黄金向量）

| 维度 | 口径 |
|---|---|
| 主名 | `golden vectors` |
| 定义 | 固定输入 → 期望 hex 的机制，用于锁定跨实现行为。是 canonicalHash / verdict kernel / proofHash 的回归真值 |
| P0 verdict golden vectors | 至少 10 个（complete support / complete refute / missing FEC / missing dataset / narrower population / dataset drift / underpowered / conflicting metrics / post-hoc threshold / tampered proof input），预期值见 `03` §9 |
| 必须被三种 verifier 使用 | TS、Python、browser verifier（及后续 Rust/Go/WASM verifier） |
| 反向 over-claim 订正 | `golden_vectors` 的"真绿"范围仅限**数值类向量**；RFC 8785 补充平面边界（emoji / ZWJ / 大整数）按 `NUMERIC_KNOWN_DIVERGENCE` 归 RED，待 FI-6 / V3 迁移 |
| 误述禁令 | `96a6372bdf04…af4abf4` 是 `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（**非 merkle 根，非 suite root**），禁止误述 |

---

## §3. 裁决与反剧场术语

### 3.1 五值裁决（Five-Value Verdict）

唯一合法 verdict enum（`VerdictKind`）：

```ts
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

**禁止增加第六值**，除非同时修改本 SSOT、schema、golden vectors、所有 verifier 和答辩口径。历史 4 值（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`，2.txt 原始口径）已废弃（§4 命名表）。

### 3.2 Verdict priority（裁决优先级）

```text
DEGRADED_SCOPE
  > REFUTED
  > INCONCLUSIVE
  > CONFIRMED
  > UNTESTED
```

`DEGRADED_SCOPE` 必须在 `CONFIRMED` 前判定（F2 决策树锁定）。优先级在任何语言实现、任何 verifier、任何 demo 中保持一致。

### 3.3 五值语义钉死

| Verdict | 语义 | 触发条件 |
|---|---|---|
| `UNTESTED` | 不能执行测试 | FEC 不完整 / 数据缺失 / 协议未冻结 / 关键证据不存在 |
| `DEGRADED_SCOPE` | 证据覆盖范围比 claim 窄 | 数据或环境漂移导致只能支持较小范围；scope laundering 被捕获 |
| `REFUTED` | 冻结证据契约下存在足够反证 | 统计证据满足反驳方向 |
| `INCONCLUSIVE` | 证据冲突、功效不足、假设不满足 | 结果落在不确定区；seed cherry-picking 被捕获 |
| `CONFIRMED` | 在冻结 FEC、scope 和统计计划下，证据满足支持条件且**无更高优先级问题** | bounded support，**非证明为真**（守 C9） |

### 3.4 Deterministic Verdict Kernel（确定性裁决内核）

| 维度 | 口径 |
|---|---|
| 定义 | verdict 的**唯一产出源**。输入 `VerdictKernelInput`，输出 `VerdictKernelOutput`（含 `verdict` / `reasonCodes` / `ruleTrace` / `evidenceSufficiency` / `scopeReport` / `statisticalReport` / `inputHashes`） |
| 决定性 | 全程 deterministic，无 LLM 自评（F3）；LLM 只能辅助解释和候选生成 |
| V1 → V2 升级 | V1 = 已有 pure verdict function；V2 = metric-first deterministic kernel，输出 rule trace 和 reason codes |
| 伪代码 | 见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §7 `decideFiveValueVerdict` |
| 输入 hash 纪律 | 内核每次输出 `inputHashes`，写入 ProofEnvelope，使第三方可重算 |

### 3.5 anti-theater（反科研剧场）

| 维度 | 口径 |
|---|---|
| 主名 | `anti-theater`（反剧场 / 反科研剧场） |
| 定义 | 防止"看起来像科学但经不起证据"的 claim 被标绿的护栏集合。包括 deterministic verdict、SQLite trigger 物理护栏、anti-theater harness 攻击库、CI gate |
| 项目灵魂（F1） | 未验证 claim 禁止标 `CONFIRMED`，必须落 `UNTESTED`（`untested_reason` 强制非空）；trigger 兜底 `DEGRADED_SCOPE` 时 `scope_slip_text` 非空 |
| 物理护栏边界 | FAIL+CONFIRMED 被 SQLite trigger ABORT，**伪绿不可能落库**——但这是 **tamper-evident 非 tamper-proof**（DROP TRIGGER 可绕过 DB 层防护，靠 external anchor 兜底） |
| P0 攻击库覆盖（至少） | label-only evidence；LLM reviewer override；post-hoc threshold；dataset drift；scope laundering；missing raw artifact；metric swapping；seed cherry-picking；workflow digest mismatch；natural-language verdict mismatch（structured verdict wins） |
| 期望处理 | 见 `03` §8 anti-theater rules 表 |
| 诚实护城河 | 一个敢在交付前自爆数字漂移 / 路径虚构 / 反向 over-claim 的项目，比把这些藏起来的项目在诚信维度更强——"诚实本身是反-theater 项目最强的护城河演示" |

### 3.6 verdict-critical（裁决决定性字段）

| 维度 | 口径 |
|---|---|
| 主名 | `verdict-critical` |
| 定义 | 任何**改变它就会改变 verdict 或 proofHash** 的字段。必须进入 canonical proof input；篡改必须被 verifier 发现 |
| 包含 | claim id + normalized text；FEC snapshot；protocol freeze；dataset/workflow/run bindings；measurement hashes；statistical result；protocol deviations；anti-theater findings；verdict kind；reason codes；rule trace；ledger root；schema version |
| 反例（非 verdict-critical） | UI 展示顺序；markdown 解释；本地绝对路径；非决定性时间戳；debug 日志全文（除非显式声明为 evidence） |
| 纪律 | "所有 verdict-critical 字段必须进入 canonical proof input；所有解释字段必须可删除而不改变 verdict"（`02` §6 实现原则） |

### 3.7 independent recomputation（独立重算）

| 维度 | 口径 |
|---|---|
| 主名 | `independent recomputation`（独立重算） |
| 定义 | 评委、审稿人或第三方在**自己的机器上**重算 proof head、Merkle inclusion、verdict trace 和 integrity status，**无需信任 FAR-Chain 团队或参赛者演示机** |
| 第一卖点 | `Your Laptop Is The Verifier`（`76` §3.2） |
| 重算失败纪律 | 应给出结构化差异（diff report，见 `04` §8），非简单 "FAIL" |
| 独立验证等级 | L1 同仓库 Node 重算 / L2 Python 独立实现 / L3 Browser Web Crypto / L4 Rust/Go/WASM / L5 第三方维护 verifier / L6 形式化验证核心 invariant |
| 当前口径（诚实） | 若只有 Node/Python/browser 局部能力，**不得说"完全第三方验证生态已完成"**。可以说"P0 目标是完成可演示的独立重算闭环" |
| 术语替代 | 用 `independently re-computable` 替代旧口径 `reproducible / auditable`（避免软词撞车和语义过宽） |

### 3.8 tamper-evident（篡改可检测）

| 维度 | 口径 |
|---|---|
| 主名 | `tamper-evident` |
| 定义 | 篡改行为可被 verifier 重算发现的性质。**不等于** tamper-proof（物理层面不可改） |
| 机制 | append-only hash chain（`call_records` / `evidence_log` / `repro_runs` 禁 UPDATE/DELETE，trigger ABORT）+ Merkle root + inclusion proof + external anchor（`gitCommitSha` / crossref DOI） |
| 表述红线（R6 精确化） | 禁止说"物理拦截 / 物理隔离 / 物理不可篡改"。正确表述："DB 层 append-only **tamper-evident**（链头 hash 变化可检测）；trigger 防 UPDATE/DELETE 但 **DROP TRIGGER 可绕过 DB 层防护**，靠 external anchor 兜底为 tamper-evident **非 tamper-proof**；前置编造由五值裁决 + BreakerProbe 留痕**约束**（非拦截）" |

### 3.9 scope（范围）

| 维度 | 口径 |
|---|---|
| 主名 | `scope` |
| 定义 | claim 适用的人群 / 数据域 / 时间窗 / 条件集合。FEC 必须显式声明 scope，无 scope 的 claim 在编译阶段 `SCOPE_UNBOUNDED` fail |
| scope laundering | 把窄 scope 的证据"洗白"为宽 scope 的 claim——anti-theater 必须捕获，落 `DEGRADED_SCOPE` |
| scope drift | 数据或环境随时间漂移导致原 scope 不再覆盖——落 `DEGRADED_SCOPE` 或要求 recompute |
| ScopeSpec / ScopeCoverage | 字段权威在 `APPENDIX_A_TYPES.md`；语义在此钉死：scope 是 verdict 的"适用边界"，越界即降级 |

### 3.10 protocol freeze（协议冻结）

| 维度 | 口径 |
|---|---|
| 主名 | `protocol freeze` |
| 定义 | 在 evidence run **之前**锁定 statistical plan、scope、evidence requirements、metric、threshold、direction、seed policy 的不可逆动作。冻结后任何变更构成 `ProtocolDeviation` |
| 反 theater 意义 | 防止 post-hoc threshold、p-hacking、metric swapping、seed cherry-picking——anti-theater harness 必须捕获 |
| 字段 | `ProtocolFreeze`：`fecHash`、`actor`、`timestamp`、`environmentPolicy`、`deviationPolicy`（字段权威 `APPENDIX_A_TYPES.md`） |
| ProbeAtlas 预登记（F8） | 三重约束同时开关（不允许只开一项）；`seed=42` 预登记，换 seed = p-hacking；Bonferroni `α'=0.0125` 预登记不事后改；`p>0.0125` 只诚实报告未达校正后显著 |
| 状态 | 必须 `FEC_FROZEN` 才能进入 `EVIDENCE_BOUND`（`02` §5 状态机） |

---

## §4. 最终命名表（主名 / 弃用名）

> 引用任何概念时，**只用主名**。弃用名仅在"已废弃历史口径"语境可出现，且必须显式标注 `[RETIRED · 见 §4]`。

### 4.1 系统与项目命名

| 主名 | 弃用名 / 历史名 | 性质 | 说明 |
|---|---|---|---|
| `FAR-Chain` | FAR-Chain Ω | 系统主名 | claim-level verification layer |
| `真研 FAR-Lab` | FAR-Lab Ψ、Proof-Carrying AI Scientist OS、Proof-Carrying Scientific Agent Operating System | 项目集主名 | 历史"OS"口径过宽，已降级为历史灵感 |
| `claim-level verification layer` | AI Scientist、coding agent、workflow runner、provenance viewer、hash ledger、benchmark、科学真理机器 | 定位 | 所有"是 X"的替代定位都是禁用口径（见 `00` §2） |

### 4.2 裁决枚举命名

| 主名 | 弃用名 | 说明 |
|---|---|---|
| `VerdictKind`（5 值） | 4 值枚举（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`，2.txt 原始） | 5 值是最终 SSOT（02 §F2 / T1） |
| `CONFIRMED` | `ACCEPTED` | "bounded support"非"证明为真" |
| `REFUTED` | `REJECTED` | 冻结契约下足够反证 |
| `INCONCLUSIVE` | — | 证据冲突 / 功效不足 |
| `DEGRADED_SCOPE` | `DEGRADED`（4 值版） | scope 比 claim 窄 |
| `UNTESTED` | — | 不能执行测试 |

> **消歧**：`33:219` 的"6 值枚举" = `SciIRDomain` 领域枚举（6 值·含 G5 seismic precursor），**正确·非 verdict 笔误**。verdict 5 值与 domain 6 值是两个不同枚举，勿混。

### 4.3 核心对象命名

| 主名 | 弃用名 / 别名 | 说明 |
|---|---|---|
| `FEC` / `FecContract` | FalsificationSpec（仅作 FEC 子字段名保留） | 可证伪证据契约 |
| `ProofEnvelope` | Proof-Carrying Research Object、SciIR envelope | V2 schemaVersion `far.proof_envelope.v2` |
| `Trust Receipt` | receipt、proof receipt（非正式别名可接受，正式文档用 Trust Receipt） | 面向人收据，非新事实源 |
| `proofHash` | proof hash（小写可接受，正式字段名 `proofHash`） | sha256 over canonical proof input |
| `ledgerRoot` | merkle root（仅指 Merkle 化产物时可混用；指账本锚定时用 `ledgerRoot`） | append-only 链根 |
| `canonicalHash` | canonical hash、hash（泛指时） | sha256 over canonical_json |
| `golden vectors` | golden_vector、goldenVector | 固定输入→期望 hex |

### 4.4 工程命名

| 主名 | 弃用名 | 说明 |
|---|---|---|
| `<REPOSITORY_ROOT>/` | `far-chain/`（作为真实实现根）、`packages/`（V1 多包拆分） | 工作区根即实现仓 |
| `far` CLI | `far-chain` CLI（命令名）、`farlab` | 命令前缀 `far`（核心 11 子命令·见 05 §9.2：`far status` / `far verify` / `far verify-golden` / `far export receipt` / `far export far-proof` / `far bench run` / `far fec compile` / `far fec freeze` / `far fsm advance` / `far demo` / `far api`；`far ask/repl/stream` 仍 `ROADMAP`） |
| `competition_aliyun_qwen` | bailian_profile、qwen_profile | 参赛 provider profile |
| `offline_replay` | production fallback、容灾 profile | demo/test profile，**不是**生产兜底 |

---

## §5. 状态标签 taxonomy（全标签含义）

> 与 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3 完全一致。任何能力描述必须带且只带一个状态标签。

| 标签 | 含义 | 适用场景 |
|---|---|---|
| `IMPLEMENTED_VERIFIED` | 已在当前代码和测试中核实 | 有测试 + CI + golden vector 实测为绿的能力 |
| `IMPLEMENTED_UNVERIFIED` | 代码存在，但本轮未完成测试核实 | 有实现但测试未覆盖或未跑 |
| `PARTIAL` | 有局部实现，尚未闭环 | 如 ProofEnvelope V1（有 self-check 但未到 V2 binding） |
| `DESIGN_LOCKED` | 设计已定，可进入实现 | schema / interface / 状态机已冻结，代码未写 |
| `ROADMAP` | 方向明确，但不作为当前完成能力 | Rust/Go verifier、external transparency log、formal proof |
| `RESEARCH` | 研究设想，不能写入当前功能声明 | TLA+ 全系统形式化、Self-Improving Reliability Compiler |
| `RETIRED` | 旧口径废弃，只保留历史解释 | 4 值 verdict、`far-chain/` 路径、OS 口径 |
| `NEEDS_EXTERNAL_VERIFICATION` | 外部事实未在当前回合复核，答辩前必须查证 | 外部竞品发布时间、arXiv 引用、novelty 查新、snapshot 维护期 |

### 5.1 状态标注扩展词（来自 02 §7.4，与上述标签配合使用）

`已存在` / `已设计` / `待实现` / `待实测` / `MVP必须实现` / `可选增强` / `长期路线` / `UNKNOWN` / `UNVERIFIED` / `NEEDS_REAL_TEST` / `NEEDS_REAL_ENV` / `NEEDS_HUMAN_OPERATION` / `NEEDS_GPU_VALIDATION` / `COMPETITION_MUST` / `OPEN_SOURCE_ENHANCEMENT` / `PAPER_ROUTE` / `FUTURE_VISION` / `DO_NOT_CLAIM_AS_DONE`

这些是**修饰词**，不替代上述 8 个核心状态标签。例如："canonicalHash — `IMPLEMENTED_VERIFIED`（4 字段白名单 + 数值类已实证；RFC 8785 边界 `NEEDS_REAL_TEST`）"。

### 5.2 禁止手填裸统计（02 §7 + 56 §2-§3）

以下信息**不得手动写死**在任何 README / PPT / 答辩稿 / 报告：

- 测试数量；
- TS / Python 文件数量；
- CI 通过率；
- benchmark 数量；
- 当前 commit；
- 当前外部竞品发布时间和功能；
- "第一" / "唯一" / "最新"等强时效或强 novelty 结论。

这些必须来自：

1. `far status --json` 或等价 status dump；
2. CI 输出；
3. `git rev-parse HEAD`；
4. 可复核脚本；
5. 答辩前重新检索的外部来源。

若 status 工具尚未覆盖某字段，该字段在文档中**只能写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`**。

---

## §6. 禁用词表（禁用 → 改写对照）

> 与 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` §2、`56_SOURCE_OF_TRUTH_RECONCILIATION.md` §4 一致。本节是表述红线的权威集中处。

### 6.1 核心禁用词（表述红线）

| # | 禁用口径 | 改写口径 | 来源 |
|---|---|---|---|
| D1 | 证明科学真理 / 证明科学结论绝对为真 | 判断是否满足冻结可证伪证据契约；`CONFIRMED` = bounded support（非证明为真） | 02 §7.3 / 56 §4 / 44 §4 |
| D2 | 物理不可篡改 / 物理隔离 / 物理拦截 / 事后篡改不可行 | 篡改可检测（tamper-evident）；DB 层 trigger 防 UPDATE/DELETE 但 DROP TRIGGER 可绕过，靠 external anchor 兜底，**非 tamper-proof** | 56 §4 R6 / 02 §7.3 |
| D3 | 完全可复现 | 可独立重算特定 proof input（independently re-computable） | 07 §2 / 56 §4 |
| D4 | 全自动科学家 / 全自动无人 / 全流程绝对无人参与 | claim-level verification layer；运行时可自动化但密钥授权 / 控制台截图 / 报名提交 / 凭证核验 / GPU 配置须人工 | 02 §7.3 / 56 §5 V2-10 |
| D5 | 取代同行评审 | 给审稿、合作和复核提供 trust receipt | 07 §2 |
| D6 | 通用 AI4S benchmark / 通用 AI4S 排行榜 | FAR-Bench verification protocol / attack corpus（profile_id 永远 `competition_aliyun_qwen`，禁与 CORE-Bench 横向比较） | 02 §7.3 / C13 |
| D7 | 端到端形式化证明已完成 / 全系统形式化 | 局部 invariant 与 formal route（TLA+/Dafny 路线 = V3 research） | 07 §2 / 56 §4 |
| D8 | 所有语言完全一致 / 跨语言字节相等已实证 LIVE（无 hedge） | 指明当前已验证语言和字段范围；"4 字段白名单 + 数值类已实证；`1e-7` 科学计数法鸿沟诚实披露" | 56 §4 R7 |
| D9 | 第三方验证生态已完成 / .far-proof 已通过 IETF/RO-Crate 官方认证 | P0 independent recomputation；第三方生态是 V2/V3；IETF VAP 是进行中草案非 RFC | 07 §2 / 56 §5 V2-7 |
| D10 | 最新 / 第一 / 唯一（无来源支撑、无 hedge） | "据我们所知首个" + 差异化三连（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座）+ `UNVERIFIED_PRIOR_ART`（查新前）+ 答辩前查新 | 07 §2 / 56 §4 R8 |
| D11 | far-chain/ 作为真实实现子目录 | `<REPOSITORY_ROOT>/`（工作区根即实现仓） | 56 §2.2 / 01 §1 |
| D12 | "1038/662/546/1092 tests"（任意裸测试数） | `<TEST_COUNT_FROM_STATUS_DUMP>`（由 `far status --json` 回填） | 56 §2.1 |
| D13 | "96a6372bdf04 是根哈希 / 是 merkle 根" | "`REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（非 merkle 根，非 proofHash）" | 56 §2.3 |
| D14 | 发现新科学规律 / 发现新行星（TESS demo） | "检测到周期性下降"（须 odd-even / duration / SNR / systematics 全 PASS + vetting 才能升级，且仍非 CONFIRMED） | 02 §7.3 / C15 |
| D15 | 据我们所知首个（无查新） | "据我们所知首个" + D1/D2/D3 + 查新（`45`）；未查新前标 `UNVERIFIED_PRIOR_ART` | 56 §4 R8 |

### 6.2 V2 专属禁用词（FI-8 叙事轴边界，56 §5.1）

| # | 禁止声称 | 理由 |
|---|---|---|
| V2-1 | "Arena 证明 AI 不聪明" / "测出最准模型" | Arena 测"能否被结构化证伪"，非智商 / 准确度（守 C13） |
| V2-2 | "跨模型法庭找出最可靠模型" | 法庭只标一致性盲区，不排座次 |
| V2-3 | "可靠性证书给出 X% 真理概率" | 证书结构化（一致区 / 盲区），禁单一百分比（守 C9） |
| V2-4 | "WASM 验真证明科学结论" | 验真 = 过程可信证据可机器检，非真理证明 |
| V2-5 | "DomainPack 是通才科研系统" | 每 pack 只覆盖一类示范 claim（守 C16） |
| V2-6 | "时光机证明 AI 可重现"（FI-7） | 仅 deterministic track 可 byte-equal；真实 LLM 轨道不成立 |
| V2-7 | ".far-proof 已通过 IETF/RO-Crate 官方认证" | 路径 A 未完成前禁用；IETF VAP 是进行中草案非 RFC |
| V2-8 | "形式化已验证全系统" | 仅局部最小不变式锚点 |
| V2-9 | "首个"（无 hedge 无查新） | 须"据我们所知" + D1/D2/D3 + 查新 |
| V2-10 | "物理隔离 / 区块链证明 / 全自动无人" | 既有禁用词，V2 重申 |

### 6.3 DO_NOT_CLAIM 7 条（Psi · 02 §7.1，绝对禁称已实现）

1. 完全自动发现新天文规律
2. 已实现 eval-ring 物理隔离
3. FAR-Bench 是通用 benchmark
4. LLM 可作最终科学裁判
5. 证明科学结论绝对为真
6. 全流程绝对无人参与
7. 无真实百炼调用也声称参赛 profile 已闭环

### 6.4 不允许假绿 6 条（02 §7.2）

1. 纯 fixture mock 代替真实 appendRecord
2. 未真实跑百炼却声称 request_id 已验证
3. 未导出 proof 却显示 passed
4. LLM 自评代替 verdict protocol
5. 图表无数据绑定
6. source_anchor 指向不可访问来源

### 6.5 CI grep 禁用词门（W0 落地，56 §5.2）

```yaml
# .github/workflows/honesty-grep-gate.yml（W0 拟新增）
- name: 诚实 grep 门（禁用词零容忍）
  run: |
    # 全 PDF/README/pitch/摘要 零裸禁用词
    ! rg -q "物理拦截|物理隔离|物理不可篡改|证明.*科学真理|全自动无人|首个(?!.*据我们所知)|已通过 IETF|全系统形式化" \
        README.md docs/ PROJECT_PLAN/ --glob '!56_*' --glob '!43_*' --glob '!59_*'
```

**例外**：`43`（总纲）/`56`（真相统一）/`59`（W0 审计纲领）/本附录自身在"订正清单 / 禁用词表"里引用原措辞是**元层面演示**，不触发门。

### 6.6 LLM 使用边界（07 §4，与本附录裁决纪律咬合）

允许：生成候选 claim；辅助 FEC 草案；解释 verdict；生成报告；生成形式化证明草稿；帮助用户理解 failure。

禁止：**直接输出最终 verdict**（LLM 不得作为最终裁决者）；覆盖 deterministic kernel；隐藏 protocol deviation；在 proofHash 外悄悄改 evidence；把自然语言 reviewer 当独立真相源；自动把 `UNTESTED` 改成 `CONFIRMED`。

---

## §7. 路径约定（Path Conventions）

### 7.1 单一路径前缀

所有工程路径以 `<REPOSITORY_ROOT>/` 开头。`<REPOSITORY_ROOT>` 即**工作区根目录**（包含 `src/` `schema/` `frontend/` `tests/` `golden_vectors/` 的目录），**不是** `far-chain/` 子目录。

> 物理档案已退役：`FINAL_PACKAGE/` 是设计/规划/答辩/交接档案，FINAL_PACKAGE 即将被删除（§9 归档声明）。其内容已完整并入 `PROJECT_PLAN/`。物理档案的离线备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

### 7.2 标准路径表

| 约定 | 含义 |
|---|---|
| `<REPOSITORY_ROOT>/src` | TypeScript / 核心实现 |
| `<REPOSITORY_ROOT>/tests` | 测试 |
| `<REPOSITORY_ROOT>/schema` | 数据库 schema 和 migration |
| `<REPOSITORY_ROOT>/schema/migrations` | SQL migration（0001-0008 已锁，0009+ 走独立 migration） |
| `<REPOSITORY_ROOT>/frontend` | 前端或 browser verifier 相关资产 |
| `<REPOSITORY_ROOT>/repro` | Python 或其他复核实现 |
| `<REPOSITORY_ROOT>/repro/far_chain_repro` | Python canonical_hash / verify_chain 等确定性复核 |
| `<REPOSITORY_ROOT>/golden_vectors` | golden vectors |
| `<REPOSITORY_ROOT>/PROJECT_PLAN` | 最终规划和执行口径（P0 文档源） |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_A_TYPES.md` | 类型权威附录（字段名 / enum 字段权威） |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_C_CANONICAL.md` | canonical 序列化权威附录（字节规则权威） |
| `<REPOSITORY_ROOT>/PROJECT_PLAN/APPENDIX_F_GLOSSARY.md` | 本附录（术语语义 / 表述口径权威） |
| `<REPOSITORY_ROOT>/FINAL_PACKAGE` | 【已归档历史口径】设计/规划/答辩档案，物理档案已退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/` |

### 7.3 路径纪律

- 命令示例中**禁止**写 `cd far-chain && pnpm install`——评委照此跑会直接失败（路径级崩溃）；
- 旧文档中残留的 `far-chain/` 一律解释为**历史规划路径**，不作为当前工程路径；
- 命令一律写 `<REPOSITORY_ROOT>/` 或显式"工作区根即实现仓"；
- 跨平台：Windows 路径、空格路径、离线目录都必须可运行（`far verify` P0 验收项）；
- `packages/` → `src/` 路径订正（59 决策②）：当前 `src/` 扁平现实优先，多包拆分只作为 V3 路线。

### 7.4 migration 编号体系

| 范围 | 内容 | 状态 |
|---|---|---|
| 0001-0008 | 五张核心表 DDL（`call_records` / `evidence_log` / `verdict_nodes` / `evidence_edges` / `repro_runs`）+ 早期扩展 | 已锁死，禁 ADD COLUMN（除 `verdict_nodes` 经 Ask 裁决的 `uq_grade` / `repro_certificate_id` / `sensitivity_envelope_id`，C29 例外） |
| 0009-0011 | 后续扩展 | 已锁或设计冻结 |
| 0012-0015 | ProbeAtlas / UQ-Witness / FAR-Bench / multimodal 等 | 设计草案（部分待 Ask 确认） |

migration 必须可逆（up + down），禁 DROP TABLE 无 down，禁破坏 append-only（T11）。

---

## §8. 文档优先级（P0-P3）

> 与 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §2 一致。冲突时按 P0 → P1 → P2 → P3 处理。

| 优先级 | 来源 | 说明 |
|---|---|---|
| **P0** | 顶层 `PROJECT_PLAN/`（含本附录及 APPENDIX_A/C/F 三权威） | 最终规划和执行口径 |
| **P1** | 可执行状态命令（`far status --json`）、CI、测试输出 | 实现状态与数量的唯一事实源 |
| **P2** | 当前代码（`<REPOSITORY_ROOT>/src` 等） | 接口和能力以实际代码为准 |
| **P3** | 旧 `00`-`86` 与 `_digest`（已归档至 `C:/Users/RichardYuan/FAR-Lab_Backups/`） | 历史来源，不直接覆盖 P0/P1/P2 |

### 8.1 冲突裁决规则

- 若 P0 与代码现实（P2）冲突 → **开修订项**（`09_GAP_CLOSURE_LOG.md`），**不是**用旧文档覆盖代码；
- 若 P0 内部三附录冲突 → 类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义以 F 为准（本附录）；
- 若 P0 与 P3 冲突 → P0 胜，P3 仅作来源溯源（`08_TRACEABILITY_MATRIX.md` 保留旧编号 → 新位置映射）。

### 8.2 附录三权威咬合

| 附录 | 权威域 | 边界 |
|---|---|---|
| `APPENDIX_A_TYPES.md` | 类型字段名、TS interface 字段、enum 字段集合 | 不定义术语语义（语义归 F） |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化字节规则、key 排序、数值格式化、白名单处理 | 不定义术语语义；与 A 的字段名必须一致 |
| `APPENDIX_F_GLOSSARY.md`（本附录） | 术语语义、命名主名/弃用名、状态标签 taxonomy、禁用词、路径约定、文档优先级 | 不重定义字段；引用 A 的字段名、C 的字节规则 |

---

## §9. FINAL_PACKAGE 归档声明（自包含纪律）

> 本节满足"FINAL_PACKAGE 即将被删除，禁止写'详见 FINAL_PACKAGE/X'作为有效依赖"的自包含铁律。

**物理档案状态**：`FINAL_PACKAGE/`（旧 `00`-`86` + `_digest`）是**已归档历史口径**，物理档案已退役。离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

**本附录的自包含声明**：

- 本附录所有内容已**完整并入** PROJECT_PLAN（不再依赖 FINAL_PACKAGE 作为有效事实源）；
- 本附录中引用的 `44`、`56`、`76`、`02_CONSTRAINTS_AND_RED_LINES` 等 FINAL_PACKAGE 编号，仅作**来源溯源**（`08_TRACEABILITY_MATRIX.md` 旧编号 → 新位置映射），**不作为有效依赖**；
- 任何"详见 FINAL_PACKAGE/X"在本附录中均已被改写为：要么内容完整并入本节/本附录，要么显式标注为"已归档历史口径·备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`"；
- 若读者需要查阅 FINAL_PACKAGE 原文做历史溯源，路径是 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

**来源溯源映射**（本附录核心内容的旧 FINAL_PACKAGE 来源）：

| 本附录章节 | 旧 FINAL_PACKAGE 来源（已归档） | 并入方式 |
|---|---|---|
| §1 项目身份 | `01_PROJECT_FACTS`、`44_VISION_V2`、`76_DESIGN_PHASE_COMPLETION_VERDICT` | 完整并入 |
| §2 核心对象 | `01`、`02_CONSTRAINTS_AND_RED_LINES`、`44` | 完整并入 |
| §3 裁决术语 | `02`（F1-F12）、`67_DETERMINISTIC_FIVE_VALUE_VERDICT_ENGINE`、`76` | 完整并入 |
| §4 命名表 | `01` §5.2、`56` §2.4、`76` | 完整并入 |
| §5 状态标签 | `56` §3、`02` §7.4 | 完整并入（与 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3 一致） |
| §6 禁用词 | `02` §7、`56` §4-§5 | 完整并入 |
| §7 路径约定 | `56` §2.2、`01` §1 | 完整并入 |
| §8 文档优先级 | `56` §3 | 完整并入 |

---

## §10. 术语使用检查表（发布前过一遍）

每次更新 README / PPT / 答辩稿 / 报告前，必须检查：

- [ ] 是否用了主名（§4），未用弃用名；
- [ ] verdict 是否只用 5 值（§3.1），无第六值；
- [ ] 是否出现 §6 禁用词（D1-D15 / V2-1 至 V2-10 / DO_NOT_CLAIM 7 条 / 假绿 6 条）；
- [ ] 是否手填裸数字（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品时间）——应来自 `far status --json`；
- [ ] 路径是否写 `<REPOSITORY_ROOT>/`，未写 `far-chain/`（作为真实实现根）；
- [ ] 是否把"可验证"读成"证明为真"（§1.3 / §3.7 / §3.8）；
- [ ] 是否暗示 FAR 取代同行评审（D5）；
- [ ] 是否把 hash 说成物理安全（D2）；
- [ ] 是否声称所有 verification 已跨语言完成（D8）；
- [ ] 是否把 LLM reviewer 当 final judge（§6.6）；
- [ ] 是否把 V3 路线（Rust/Go/WASM full verifier / external transparency log / full formal specification / FAR-Level 4 supply-chain profile / large public benchmark / third-party verifier ecosystem）写成当前完成；
- [ ] 是否写入真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / 隐私门）；
- [ ] 是否每个能力都带了 §5 状态标签，未混写"已实现"和"应实现"；
- [ ] 是否把 `.far-proof` 自验证冒充第三方验证（RR-2）；
- [ ] 是否引用未复核外部事实（应标 `NEEDS_EXTERNAL_VERIFICATION`）；
- [ ] 是否遗漏 Trust Receipt 的 `limitations` 段。

---

> 本附录是术语与表述规范权威。它不增加功能，但它保证所有对外材料、工程文档、答辩口径**站在一致的术语与诚实的表述之上**。任何与本附录冲突的口径，改的是那个口径，不是本附录——除非走 `01_SOURCE_OF_TRUTH_AND_STATUS.md` 的修订程序同时修改本附录、APPENDIX_A_TYPES.md、APPENDIX_C_CANONICAL.md、schema、golden vectors 和所有 verifier。
