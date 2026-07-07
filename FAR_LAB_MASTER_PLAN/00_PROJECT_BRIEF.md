# 00 项目总述

> 作用域：本章是 `FAR_LAB_MASTER_PLAN/` 的项目身份与定位总述。术语语义、命名主名、禁用词、路径约定的权威在 `APPENDIX_F_GLOSSARY.md`；类型字段权威在 `APPENDIX_A_TYPES.md`；canonical 字节规则权威在 `APPENDIX_C_CANONICAL.md`。本章与三者冲突时，改本章，不改附录。
> 自包含纪律：本章所有内容已完整并入 `FAR_LAB_MASTER_PLAN/`。文中引用的 `01_PROJECT_FACTS` / `06_REDEFINED_PROJECT_VISION` / `44_VISION_V2` / `45_COMPETITIVE_TEARDOWN` / `86_GRAND_PRIZE_ARGUMENT` 等 FINAL_PACKAGE 编号仅作来源溯源（`08_TRACEABILITY_MATRIX.md` 旧编号 → 新位置映射），物理档案已退役，离线备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`。
> 状态纪律：每个能力描述带一个状态标签（`IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`），与 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3、`APPENDIX_F_GLOSSARY.md` §5 完全一致。测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 外部竞品发布时间一律不手填。

---

## 1. 项目身份

### 1.1 主名与角色

| 维度 | 口径 |
|---|---|
| 系统主名 | `FAR-Chain`（FAR = Falsification-Anchored Research） |
| 项目集主名 | `真研 FAR-Lab`（中英混排为正式写法，对应英文 `FAR-Lab`） |
| 系统定位 | AI4S 科学声明的 **claim-level verification layer**（声明级证据验真层） |
| 项目集定位 | 承载 FAR-Chain 系统及其周边（DomainPack、FAR-Bench、demo、答辩、开源治理）的工程组织 |
| 历史名（RETIRED） | `FAR-Lab Ψ` / `FAR-Chain Ω` / `Proof-Carrying AI Scientist OS` / `Proof-Carrying Scientific Agent Operating System` —— 思想吸收为增量层，名字已收敛，不再作正式身份（`APPENDIX_F_GLOSSARY.md` §1.2、§4.1） |

FAR-Chain / 真研 FAR-Lab 面向 AI4S 的核心问题不是"AI 能不能产生更多科学想法"，而是"AI 产生的科学声明能不能带着证据进入真实科研世界"。

系统角色（七步流水线，与 `02_ARCHITECTURE.md` §1 主链路一致）：

1. 接收 AI agent、科研工作台、workflow、notebook 或人工团队提出的科学声明（`Claim`，字段权威见 `APPENDIX_A_TYPES.md` §1）；
2. 将声明编译为 `FEC`（Falsification Evidence Contract · 可证伪证据契约）；编译失败时只能进入 `UNTESTED` 或阻断，禁止输出 `CONFIRMED` / `REFUTED`（编译失败码见 `APPENDIX_F_GLOSSARY.md` §2.2）；
3. 在 evidence run **之前**冻结数据、工作流、统计计划、执行环境和判断规则（`ProtocolFreeze`，F8 预登记铁律）；
4. 运行测量或导入测量结果（`Measurement`）；
5. 通过确定性五值裁决内核（`Deterministic Verdict Kernel`）输出 `Evidence-Bound Verdict`（全程 deterministic，LLM 不得作为最终裁决者，F3）；
6. 封装为 `ProofEnvelope`（V2 schemaVersion = `"far.proof_envelope.v2"`）与 `Trust Receipt`；
7. 支持第三方在自己的机器上独立重算（`independent recomputation`），发现篡改、范围降级和证据不足。

一句话：

> FAR-Chain 是 AI4S claim 的 claim-level verification layer。

V2 叙事口径（进攻性诚实，锚定 `44_VISION_V2`）：叙事主语从"我们（防御性克制）"翻转为"你（可亲手验证）"，但**不放宽任何 DO_NOT_CLAIM 边界**。"可验证（Verifiable）"在 FAR-Chain 中精确指——过程可信证据可机器检验、verdict 由机械规则产出、跨语言字节一致、反 theater 物理护栏；**绝不指**证明科学结论为真、证明 AI 是对的、找出"最准的模型"、通才科研系统（详见 `APPENDIX_F_GLOSSARY.md` §1.3）。

### 1.2 赛事与参赛合规锚定（来源 `01_PROJECT_FACTS` §1，状态 `NEEDS_EXTERNAL_VERIFICATION`）

| 事实 | 值 | 来源 / 状态 |
|---|---|---|
| 赛事编号 | XH-202619 | `01_PROJECT_FACTS` §1 / NEEDS_EXTERNAL_VERIFICATION（PDF 前复核） |
| 赛事全称 | 《基于国产开源大模型的 AI Scientist 的研发与应用》 | 同上 |
| 锁定方向 | 方向一A：科学问题的假设生成（非 1B 数据分析） | `02_CONSTRAINTS_AND_RED_LINES` §1 §4 |
| 评分三维 | 科学价值 40 / 技术深度 30 / 应用潜力 30 | `02_CONSTRAINTS_AND_RED_LINES` §1 §3 |
| 参赛 profile | `competition_aliyun_qwen`（锁 Qwen + 百炼/DashScope） | `01_PROJECT_FACTS` §1 |
| 参赛基座快照 | `COMPETITION_MODEL_SNAPSHOT='qwen3.7-max-2026-05-20'` | `01_PROJECT_FACTS` §1 / 竞赛周 day-0 须 GET /v1/models 实测复核 |

> 命门（`06_REDEFINED_PROJECT_VISION` §0、§4.2）：项目本质是可靠性基础设施，不产出新科学发现 → 科学价值 40 分面临 6-12 分 novelty 压力。补救战略见 §5.4。

---

## 2. 项目不是什么

FAR-Chain 不做以下定位（所有"是 X"的替代定位都是禁用口径，见 `APPENDIX_F_GLOSSARY.md` §4.1、§6）：

| 不是 | 原因 |
|---|---|
| 通用 AI Scientist | 不负责包办科学发现全流程，只负责声明级证据验真；刻意保持中等自动能力（C16） |
| 通用 coding agent | agent 做事，FAR 验证科学声明能否经受证据契约 |
| 通用 workflow runner | Nextflow、Snakemake、CWL 已负责运行，FAR 负责裁决绑定（`86` §5） |
| 普通 provenance viewer | PROV、RO-Crate 记录过程，FAR 使用记录做 evidence-bound verdict，并输出 proof receipt（`86` §4） |
| 普通 hash ledger | hash 只证明字节是否变化，FAR 的 proofHash 还绑定 FEC、统计计划、verdict trace、ledger root 与 claim graph dependencies（`86` §2） |
| 普通 benchmark | FAR-Bench 是验真协议和攻击套件（verification protocol / attack corpus），不是泛 AI4S 排行榜（C13） |
| 普通 reproducibility tool | 复现重跑结果；FAR 裁决证据是否满足预注册可证伪条件，并把 `UNTESTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` 作为一等状态（`86` §3） |
| 科学真理机器 | 系统只能判断是否满足冻结契约，不能替代同行评审和后续科学确认（D1） |
| 全自动无人系统 | 运行时科研流程可自动化，但密钥授权 / 控制台截图 / 报名提交 / 凭证核验 / GPU 配置须人工，须诚实标注（D4） |

### 2.1 DO_NOT_CLAIM 7 条（绝对禁称已实现，来源 `02_CONSTRAINTS_AND_RED_LINES` §7.1）

1. 完全自动发现新天文规律；
2. 已实现 eval-ring 物理隔离；
3. FAR-Bench 是通用 benchmark；
4. LLM 可作最终科学裁判；
5. 证明科学结论绝对为真；
6. 全流程绝对无人参与；
7. 无真实百炼调用也声称参赛 profile 已闭环。

### 2.2 不允许假绿 6 条（来源 `02_CONSTRAINTS_AND_RED_LINES` §7.2）

1. 纯 fixture mock 代替真实 `appendRecord`；
2. 未真实跑百炼却声称 `request_id` 已验证；
3. 未导出 proof 却显示 passed；
4. LLM 自评代替 verdict protocol；
5. 图表无数据绑定；
6. `source_anchor` 指向不可访问来源。

---

## 3. 目标用户

| 用户 | 需要 FAR 解决什么 | 对应旗舰能力（FI-1 ~ FI-8，状态见 §6.2） |
|---|---|---|
| AI4S 参赛评委 | 本机重算，不再只看参赛者演示；2 秒独立重算套件根 | FI-1 `far` CLI / FI-6 WASM verifier |
| 科研 PI / 审稿人 | 快速判断 claim 是否有证据、是否偏离协议、是否被篡改 | FI-2 Arena / anti-theater 裁决 |
| AI Scientist 开发者 | 给模型输出附带可验证 trust receipt | ProofEnvelope / `.far-proof` bundle |
| 数据 / 工作流平台 | 把已有 provenance 转成可裁决证据 | AI4S Adapter Layer |
| 企业或实验室合规团队 | 检查科学声明的证据链、范围和责任边界 | Honesty Wall / `scope` tracking |
| 跨模型可靠性研究者 | 标出模型间一致性盲区（不排座次，守 V2-2） | FI-3 跨模型法庭 |

---

## 4. 核心卖点

四条核心卖点构成项目护城河。每条给出精确语义边界与状态标签，避免被读成 overclaim。

### 4.1 Falsification-Oriented（可证伪导向）

生成 claim 时必须生成可被推翻的条件。漂亮但不可证伪的假设不是 FAR 的目标产物。

- 入口约束：每个 `Claim` 必须能被编译为 `FEC`——可测、可反驳、可冻结、可绑定证据、可由第三方重算、缺证据时能诚实降级。不可证伪的 claim 在 FEC 编译阶段 fail-closed（`APPENDIX_F_GLOSSARY.md` §2.1）。
- FEC 三件套硬约束（F7）：每个 claim 进链必须同时有 `source_anchor + repro_hash + FalsificationSpec`，任一缺失**硬 throw（非 fallback）**（`APPENDIX_F_GLOSSARY.md` §2.2）。
- 编译失败码（FEC fail-closed 时只能进入 `UNTESTED` 或阻断）：`FEC_NOT_COMPILABLE` / `SCOPE_UNBOUNDED` / `METRIC_MISSING` / `THRESHOLD_MISSING` / `EVIDENCE_REQUIREMENT_MISSING` / `STAT_PLAN_MISSING` / `PROTOCOL_INCOMPLETE`。
- 状态：`DESIGN_LOCKED`（FEC V2 = mandatory，绑定 statistical plan + evidence requirements；V1 = optional contract，状态 `PARTIAL`，工程升级任务见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md`）。

### 4.2 Tamper-Evident（篡改可检测）

`ProofEnvelope` 与证据链必须让篡改可检测。**口径是 tamper-evident（篡改可检测），不是 tamper-proof（物理不可改）。**

- 机制：append-only hash chain（`call_records` / `evidence_log` / `repro_runs` 禁 UPDATE/DELETE，SQLite trigger ABORT）+ Merkle root + inclusion proof + external anchor（`gitCommitSha` / crossref DOI）。
- 物理护栏边界（R6 精确化，反 D2）：DB 层 trigger 防 UPDATE/DELETE，但 **DROP TRIGGER 可绕过 DB 层防护**，靠 external anchor 兜底为 tamper-evident **非 tamper-proof**；前置编造由五值裁决 + BreakerProbe 留痕**约束**（非拦截）。
- 表述红线（`APPENDIX_F_GLOSSARY.md` §6.1 D2）：禁止说"物理拦截 / 物理隔离 / 物理不可篡改"。正确表述："篡改可检测（tamper-evident）；trigger 防 UPDATE/DELETE 但 DROP TRIGGER 可绕过，靠 external anchor 兜底"。
- 状态：`IMPLEMENTED_VERIFIED`（append-only 链 + trigger 物理拦截 `FAIL`+`CONFIRMED` 已实测为绿）；external anchor 兜底的**不可绕过性**为 `DESIGN_LOCKED`（不声称物理不可改）。

### 4.3 Independently Re-computable（可独立重算）

评委、审稿人或第三方应能在自己的机器上重算 proof head、verdict trace 和关键 hash。重算失败应给出结构化差异。

- 第一卖点（`44_VISION_V2` §5.1）：`Your Laptop Is The Verifier`——你能证明这条 AI 科学声明的过程可信，无需信任 FAR-Chain 团队或参赛者演示机。
- 独立验证等级（L1 ~ L6）：L1 同仓库 Node 重算 / L2 Python 独立实现 / L3 Browser Web Crypto / L4 Rust/Go/WASM / L5 第三方维护 verifier / L6 形式化验证核心 invariant。
- 跨语言纪律（守 D8）：相同 sealed envelope 在 TS / Python / browser 中 hash 一致；当前已验证语言和字段范围须显式声明（4 字段白名单 + 数值类已实证；`1e-7` 科学计数法鸿沟诚实披露，按 `NUMERIC_KNOWN_DIVERGENCE` 归 RED，待 RFC 8785 JCS 迁移 V3）。
- 重算失败纪律：给出结构化 diff report（`04_PROOF_ENVELOPE_AND_VERIFIER.md` §8），非简单 "FAIL"。
- 状态：L1/L2/L3 `IMPLEMENTED_VERIFIED`；L4 Rust/Go/WASM full verifier / L5 第三方 verifier 生态 / L6 形式化验证为 `ROADMAP`。
- 术语替代：用 `independently re-computable` 替代旧口径 `reproducible / auditable`（避免软词撞车和语义过宽）。

### 4.4 Evidence-Bound Verdict（证据绑定裁决）

裁决绑定证据契约、数据、统计计划和执行痕迹。自然语言解释不能改变裁决。

#### 4.4.1 五值裁决（唯一合法 verdict enum，禁第六值）

```typescript
type VerdictKind =
  | "CONFIRMED"        // 冻结 FEC 下证据满足支持条件，且无更高优先级问题；bounded support，非科学真理（守 D1）
  | "REFUTED"          // 冻结证据契约下存在足够反证
  | "INCONCLUSIVE"     // 证据冲突、功效不足、假设不满足或结果落在不确定区
  | "DEGRADED_SCOPE"   // 证据覆盖范围比 claim 窄，或数据/环境漂移导致只能支持较小范围
  | "UNTESTED";        // 不能执行测试、FEC 不完整、数据缺失、协议未冻结或关键证据不存在
```

> 历史口径（RETIRED）：4 值枚举 `ACCEPTED/REJECTED/DEGRADED/UNTESTED` 已废弃。`ACCEPTED → CONFIRMED`（bounded support 非"证实"），`REJECTED → REFUTED`，`DEGRADED → DEGRADED_SCOPE`。

#### 4.4.2 裁决优先级（决策树锁定，F2）

```text
DEGRADED_SCOPE
  > REFUTED
  > INCONCLUSIVE
  > CONFIRMED
  > UNTESTED
```

`DEGRADED_SCOPE` 必须在 `CONFIRMED` 前判定。优先级在任何语言实现、任何 verifier、任何 demo 中保持一致。

#### 4.4.3 deterministic verdict kernel 伪代码（来源 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §7，缩略示意）

```text
function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput {
  // 1. UNTESTED 守门（F1）：FEC 不完整 / 数据缺失 / 协议未冻结 / 关键证据不存在
  if (!input.fecFrozen || input.requiredEvidenceMissing || input.keyEvidenceAbsent) {
    return { verdict: "UNTESTED", reasonCodes: [...], untestedReason: <非空> };
  }

  // 2. DEGRADED_SCOPE（scope laundering / scope drift）—— 必须在 CONFIRMED 前判定
  if (input.scopeCoverage.narrowerThanClaim || input.datasetDrift || input.environmentDrift) {
    return { verdict: "DEGRADED_SCOPE", reasonCodes: [...], scopeSlipText: <非空> };
  }

  // 3. REFUTED：冻结证据契约下存在足够反证（统计证据满足反驳方向）
  if (input.statisticalReport.effectiveDirection === "refutes"
      && input.statisticalReport.sufficientEvidence) {
    return { verdict: "REFUTED", reasonCodes: [...] };
  }

  // 4. INCONCLUSIVE：证据冲突 / 功效不足 / 假设不满足 / seed cherry-picking 被捕获
  if (input.statisticalReport.conflict
      || input.powerPlan.underpowered
      || input.assumptionsViolated
      || input.antiTheaterFindings.includes("seed_cherry_picking")) {
    return { verdict: "INCONCLUSIVE", reasonCodes: [...] };
  }

  // 5. CONFIRMED：bounded support（非证明为真，守 D1 / C9）
  if (input.statisticalReport.effectiveDirection === "supports"
      && input.statisticalReport.sufficientEvidence
      && input.powerPlan.adequate
      && input.antiTheaterFindings.isEmpty()) {
    return { verdict: "CONFIRMED", reasonCodes: [...] };
  }

  // 兜底：永不静默升 CONFIRMED
  return { verdict: "INCONCLUSIVE", reasonCodes: ["FALLBACK_NO_RULE_FIRED"] };
}
```

kernel 每次输出 `inputHashes`（写入 `ProofEnvelope`），使第三方可重算；全程 deterministic，无 LLM 自评（F3）；LLM 只能辅助解释和候选生成。

- 状态：`DESIGN_LOCKED`（语义冻结；工程升级为 metric-first deterministic kernel 的任务见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §7）。
- 反 theater 物理护栏：FAIL+CONFIRMED 被 SQLite trigger ABORT，**伪绿不可能落库**；`UNTESTED` 时 `untested_reason` 强制非空，`DEGRADED_SCOPE` 时 `scope_slip_text` 强制非空（F1）。

---

## 5. 竞争策略

FAR-Chain 不与大模型、科研工作台和 workflow 生态正面争夺"谁更会做科学"。它选择更窄、更硬的位置：

> 当任何系统声称"我发现了 X"或"证据支持 Y"时，FAR-Chain 问：这个声明能否被编译为可证伪契约，能否绑定证据，能否被独立重算，能否在证据不足时诚实降级。

这使项目在竞赛和产品中都避免散焦：不复制完整科研平台，只做科学声明进入可信世界前的最后一道可验证闸门。

### 5.1 三条差异化（不可放弃的护城河，来源 `06_REDEFINED_PROJECT_VISION` §3.1）

**D1. 补缺位维度，不拼自动能力。**
Sakana AI Scientist / co-scientist / Robin 在"自动科研能力"上已很强（甚至发 Nature）；FAR-Chain **刻意保持中等自动能力**（C16），专攻它们都缺的"proof-carrying 可靠性层"。不与它们比"谁能自动写论文"，补的是"让 AI 的每个科研声明可被机器检验"。

**D2. runtime / 基础设施视角，非 benchmark 视角。**
Propose-Critique-Falsify / CORE-Bench / ScienceAgentBench 是 benchmark 视角——测"AI Scientist 能不能自我证伪/复现"；FAR-Chain 是 runtime/基础设施视角——给**任何** AI 科研流程套上可证伪绑定 + 信任根 + ProofEnvelope。前者是"考试"，后者是"基础设施"，视角正交，非重复。

**D3. 国产基座专项合规。**
`competition_aliyun_qwen` profile 锁 Qwen/百炼，是上述所有竞品（均基于 GPT/Claude/Gemini）都没有的维度。对"基于国产开源大模型的 AI Scientist"赛题（XH-202619），这是硬命中。

### 5.2 一张定位表（写进 PDF，来源 `06_REDEFINED_PROJECT_VISION` §3.2 / `45` §1.2）

| 维度 | Sakana v2 | co-scientist | POPPER | Propose-Critique-Falsify | Right to History | **FAR-Chain** |
|---|---|---|---|---|---|---|
| 视角 | 自动科研系统 | 协作科研 | 可证伪方法 | benchmark | 通用 agent 主权 | **reliability 基础设施** |
| 自动能力 | 强 | 强 | 弱（专攻） | 弱（测） | n/a | **中（刻意）** |
| 可证伪绑定（FEC） | ✗ | ✗ | ✓ | ✓ | ✗ | **✓** |
| append-only 信任根 | ✗ | ✗ | ✗ | ✗ | ✓ | **✓** |
| ProofEnvelope 导出 | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** |
| 国产基座（Qwen） | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** |
| 反 theater 五值裁决 | ✗ | ✗ | △ | △ | ✗ | **✓** |

> 头号差异化对象（`45` §1，状态 `NEEDS_EXTERNAL_VERIFICATION`）：Right to History（arXiv:2602.20214，Jing Zhang, 2026）是 2026 年新出现、与 FAR-Chain L0 信任根高度同构的工作。**差异化硬度分级**：主声称只承重硬差异 5 维（① 定位：科研声明专用 profile；② 焦点：可证伪性裁决；③ 裁决：5 值 anti-theater；④ 证伪绑定：FEC 三件套；⑤ 基座：国产 Qwen 合规）；跨语言字节相等 / 三重导出为加分项（须配 CI 实测 + `1e-7` 鸿沟诚实披露，不靠"R2H 未声称"撑首创性）。**PDF 前 W2 查新验收门**：打开 arXiv:2602.20214 原文核作者/机构/摘要全文。

### 5.3 价值主张三维（对应评分 40/30/30，来源 `06_REDEFINED_PROJECT_VISION` §4）

| 评分维度 | 分 | FAR-Chain 价值主张 | 命中证据 |
|---|---|---|---|
| 科学价值 | 40 | "据我们所知，首个面向 AI Scientist 的 proof-carrying 可证伪科研闭环"（`UNVERIFIED_PRIOR_ART` · PDF 前须前沿查新确认优先级，`45` §4）——**方法学创新**（非科学发现）；把"AI 科研声明是否可证伪/可复现"变成机器可检问题 | 复现危机实证 + Refutability Gap（`28` §3 数据点须 PDF 前核原出处） |
| 技术深度 | 30 | append-only hash chain + TS/Python byte-equal canonicalHash + 反 theater 5 枚举裁决 + FEC 三件套 + `.far-proof` 机器可检证明包——编译器级严谨的科研信任根 | T1-T12 信任根红线 + F1-F12 反 theater |
| 应用潜力 | 30 | `.far-proof` 三重出口（RO-Crate + PROV-O + OpenTelemetry）+ 开源（Apache-2.0 / 三制品 / SBOM）+ 多域可扩展（天文 / 生信 / 社科）+ Web Cockpit + 国产基座合规 | AI4S Adapter Layer |

### 5.4 novelty 命门补救战略（来源 `06_REDEFINED_PROJECT_VISION` §7）

**病**：项目本质是可靠性基础设施，不产出新科学发现 → novelty=0 → 科学价值 40 分被压 6-12 分。

**补救（固化叙事，写进 `28` abstract / 演讲稿）**：

1. **重定义 novelty**：不赌"发现新规律"的科学新颖性，赌"让 AI 科研声明可被机器检验"的**方法新颖性**。在"AI 加剧复现危机"（`28` §3 引用须 PDF 前核原出处）的背景下，"可证伪/篡改可检测/可独立复算的 AI 科研"本身就是稀缺创新。
2. **ProbeAtlas 作为 novelty 替代出口**：用**确定性方法**测量国产基座（Qwen）的可靠性规律——这是"元科学发现"（用可信方法研究 AI Scientist 本身的可靠性）。**但 p<0.05 必须真实测出**（F8 预登记：N=30 / R=3 / Bonferroni α'=0.0125 / seed=42），不得伪造。
3. **诚实即加分**：Honesty Wall + DO_NOT_CLAIM + 含 `UNTESTED` 的可信链——在"AI 伪科研"泛滥的背景下，"我们诚实标注哪些没验证"本身就是评委加分项。**含 30% UNTESTED 的可信链 > 100% CONFIRMED 的含伪证链。**

### 5.5 答辩话术（来源 `86_GRAND_PRIZE_ARGUMENT` §9，最高答辩口径）

> 我们不替科学结论盖终局真理章。我们检验一条 AI 生成的科学声明，是否通过了预先冻结的可证伪证据契约；它用哪些数据、哪些工作流、哪些统计规则、哪些执行痕迹得到这个裁决；以及评委能否在自己的电脑上独立重算并发现任何篡改。

---

## 6. 成功标准

项目达到 P0 成功时，必须能演示一个完整闭环：

1. 输入一个科学声明（`Claim`）；
2. 编译或加载 `FEC`（可证伪证据契约）；
3. 冻结数据、workflow、统计计划和 scope（`ProtocolFreeze`，必须在 evidence run 之前）；
4. 运行测量或导入结果（`Measurement`）；
5. 输出五值 verdict 和 rule trace（由 deterministic kernel 产出，非 LLM 自评）；
6. 生成 `ProofEnvelope`（V2 schemaVersion `far.proof_envelope.v2`）；
7. 在干净环境运行 `far verify`；
8. 修改任意 verdict-critical 字段后验证失败，并给出结构化 diff report；
9. 解释为什么是该 verdict，而不是简单通过或失败（rule trace + reason codes）。

### 6.1 成功分层（来源 `06_REDEFINED_PROJECT_VISION` §8）

| 层级 | 目标 | 关键判据 |
|---|---|---|
| 最低成功（一等奖保底） | 首里程碑全部落地 | fresh-clone 可跑 + CI 全绿 + 1 个真实可信 TESS demo；day-1 实测 E1/E2/E4/E6 至少闭环；PDF/答辩无 DO_NOT_CLAIM 违规、无未核实引用、无过度声明 |
| 目标成功（特等奖） | 首里程碑 + 完整交付核心 | ProbeAtlas 真实测出结果 + UQ-Witness + Integrity Firewall + SciIR 收敛；fresh-clone CI 全绿 + cross_lang R2 通过 + golden 真实；评委能现场 fresh-clone 跑通并验证一条 claim 的完整信任链；差异化（D1/D2/D3）在 PDF/演讲/答辩中清晰且不夸大 |
| 长期成功（开源+论文） | 路线图清晰 + 至少 1 篇论文 | 开源社区采纳（github stars / 外部 PR）；`.far-proof` 成为 AI 科研可信性的事实标准之一（愿景） |

### 6.2 八大旗舰能力（FI-1 ~ FI-8，来源 `44_VISION_V2` §6 / `45` §3，状态以 `far status --json` 与 CI 为准）

| FI | 角色 | 状态（规划口径） |
|---|---|---|
| FI-1 `far` CLI | "30 秒装起来用"——产品化的存在证明 | `IMPLEMENTED_VERIFIED`（**核心 17 子命令全落地**·见 05 §9.2：status / verify / verify-golden / export receipt / export far-proof / bench run / fec compile / fec freeze / fsm advance / demo / api / **ask / stream / repl / replay / court / arena / init** + `@far-chain/cli` 包）。剩余 `ROADMAP`：真实多模型 court/arena（凭据门）+ 形式化验证器 + 真实 OS sandbox（V2） |
| FI-2 Arena | "看 AI 抓 AI 作弊"——诚实最戏剧化的时刻 | `PARTIAL`（anti-theater harness 已有；竞技场产品化辩论为 `ROADMAP`） |
| FI-3 Court（跨模型法庭） | "标出 AI 可靠性盲区"——真新颖性（只标盲区，不排座次，守 V2-2） | `ROADMAP` |
| FI-4 DomainPack | "不只是一个天文 demo"——平台体量 | `ROADMAP`（TESS 公开数据 demo 为示范 DomainPack） |
| FI-5 Bench-125 | "125 题，浏览器可验"——可验证广度（守 C13 不横向比较） | `ROADMAP` |
| FI-6 WASM verifier | "2 秒，无服务端"——技术深度硬证据 | `PARTIAL`（browser verifier 已有；全验一条 proof 为 `ROADMAP`） |
| FI-7 TimeMachine | "如果数据不同会怎样"——研究深度（fork 反事实重跑） | `ROADMAP` |
| FI-8 叙事轴 | 统领——把以上每一个变成"你"的体验 | `DESIGN_LOCKED`（V2 叙事口径已冻结，见 §1.1 V2 叙事） |

> 状态纪律：上表状态为规划口径，进入开发前仍须由 `far status --json`、CI 和代码审计重新确认。**禁止手填裸数字**（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品发布时间）。

### 6.3 失败定义（须避免，来源 `06_REDEFINED_PROJECT_VISION` §8.4）

- 规范再好但未落地实现（PPT 项目）；
- 为 demo 效果牺牲反 theater（F1）/ 跳过 cross_lang（T1）；
- 任何 DO_NOT_CLAIM 违规（伪科研指控）；
- snapshot 下线未迁移（参赛 profile 失效）；
- 被认定与 Propose-Critique-Falsify / Right to History 重复（差异化不清）。

---

## 7. 最终总论证（Grand Prize Argument）

> 来源：`86_FINAL_NATIONAL_GRAND_PRIZE_ARGUMENT`。本节是把项目身份、卖点、差异化收束为一句话答辩的最终论证。

### 7.1 不是普通 X 的七连（一一锚定 FAR 的不同）

| FAR 不是 | 它与普通 X 的本质不同 |
|---|---|
| 不是普通 agent | 普通 agent 负责行动；FAR 负责行动产物的 claim-level verification。Claude Code/Codex/opencode 主问"agent 能不能做事"；FAR 主问"科学声明是否经得起证据、统计和独立重算"（`86` §1） |
| 不是普通 hash | 普通 hash 只能发现字节变化。FAR 的 proofHash 绑定：FEC、dataset/workflow/experiment binding、statistical plan、execution trace、deterministic verdict trace、anti-theater findings、claim graph dependencies（`86` §2） |
| 不是普通复现 | 复现重跑结果；FAR 裁决证据是否满足预注册可证伪条件，并把 `UNTESTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` 作为一等状态（`86` §3） |
| 不是普通 provenance | PROV/RO-Crate 记录过程；FAR 使用这些记录做 evidence-bound verdict，并输出 proof receipt（`86` §4） |
| 不是普通 workflow | CWL/Nextflow/Snakemake 运行流程；FAR 验证 workflow 结果是否满足 frozen FEC（`86` §5） |
| 不是普通科研平台 | Claude Science/Biomni 强在工具生态；FAR 不复制工具生态，只做 trust layer（`86` §6） |
| 不是科学真理机器 | 系统只能判断是否满足冻结契约，不能替代同行评审和后续科学确认（D1） |

### 7.2 八个硬创新（来源 `86_GRAND_PRIZE_ARGUMENT` §7）

1. **FEC**：自然语言假设到可证伪证据契约（F7 三件套硬约束）；
2. **Evidence-Bound Verdict**：证据绑定五值裁决（deterministic kernel，无 LLM 自评）；
3. **Protocol Freeze**：预注册式统计计划锁定（F8 ProbeAtlas 预登记）；
4. **ProofEnvelope**：科学声明 trust receipt（V2 schemaVersion `far.proof_envelope.v2`，非真理证明）；
5. **Independent Re-computation**：评委本机重算（L1-L6 等级，`Your Laptop Is The Verifier`）；
6. **Anti-Theater Harness**：反科研剧场红队（至少 10 类攻击：label-only evidence / LLM reviewer override / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / metric swapping / seed cherry-picking / workflow digest mismatch / natural-language verdict mismatch）；
7. **Claim Graph**：证据漂移影响传播（DAG 方案 B 应用层防环，T5）；
8. **AI4S Adapter Layer**：接入而不替代科研生态（守 D2：runtime 非 benchmark）。

### 7.3 特等奖理由（来源 `86_GRAND_PRIZE_ARGUMENT` §10）

> FAR-Chain 把 AI4S 赛道从"AI 能不能生成科学想法"推进到"AI 生成的科学想法能不能带着证据进入真实科研世界"。这不是泛平台扩张，而是在科学验真窄缝里做深：可证伪、篡改可检测、可独立重算、拒绝假绿。

### 7.4 诚实即护城河（来源 `44_VISION_V2` §4 / `APPENDIX_F_GLOSSARY.md` §3.5）

一个敢在交付前自爆数字漂移 / 路径虚构 / 反向 over-claim 的项目，比把这些藏起来的项目在诚信维度更强——**"诚实本身是反-theater 项目最强的护城河演示"**。进攻叙事的弹药，恰恰是四条"绝不指"边界全部为真——"我能让你验证过程可信，并且我老实告诉你我不能证明结论为真"本身就是一个比任何 overclaim 都有力的卖点。

---

## 8. 与其他文档的关系

| 文档 | 与本章的关系 |
|---|---|
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | 路径事实、文档优先级 P0-P3、状态标签 taxonomy、status dump 规范、当前能力口径权威 |
| `02_ARCHITECTURE.md` | 主链路流水线、四层交付分区（Core Trust Root / Falsification Layer / Evidence Layer / Verification Layer）权威 |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | `FecContract` / `decideFiveValueVerdict` / anti-theater rules / verdict golden vectors 权威 |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | `ProofEnvelopeV2` / `proofHash` / `.far-proof` bundle / diff report 权威 |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | TESS Hero Demo / FAR-Bench（verification protocol / attack corpus）权威 |
| `06_ROADMAP_AND_DOD.md` | 首里程碑 / 完整交付 / 路线图分层与 DoD 权威 |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用口径改写对照、LLM 使用边界、Ask Layer 权威 |
| `APPENDIX_A_TYPES.md` | 全部 verdict-critical 与传输类型字段权威 |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化字节规则权威 |
| `APPENDIX_F_GLOSSARY.md` | 术语语义、命名主名/弃用名、状态标签 taxonomy、禁用词、路径约定权威 |
| `08_TRACEABILITY_MATRIX.md` | 旧 FINAL_PACKAGE 编号 → 新位置映射（来源溯源，物理档案已退役） |

---

## 9. FINAL_PACKAGE 归档声明（自包含纪律）

> 本节满足"FINAL_PACKAGE 即将被删除，禁止写'详见 FINAL_PACKAGE/X'作为有效依赖"的自包含铁律。

**物理档案状态**：`FINAL_PACKAGE/`（旧 `00`-`86` + `_digest`）是**已归档历史口径**，物理档案已退役。离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

**本章的自包含声明**：

- 本章所有内容已**完整并入** `FAR_LAB_MASTER_PLAN`（不再依赖 FINAL_PACKAGE 作为有效事实源）；
- 本章中引用的 `01_PROJECT_FACTS` / `06_REDEFINED_PROJECT_VISION` / `44_VISION_V2` / `45_COMPETITIVE_TEARDOWN` / `86_GRAND_PRIZE_ARGUMENT` / `02_CONSTRAINTS_AND_RED_LINES` / `28_FINAL_COMPETITION_ABSTRACT` 等 FINAL_PACKAGE 编号，仅作**来源溯源**（`08_TRACEABILITY_MATRIX.md` 旧编号 → 新位置映射），**不作为有效依赖**；
- 任何"详见 FINAL_PACKAGE/X"在本章中均已被改写为：要么内容完整并入本章，要么显式标注为"已归档历史口径·备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`"；
- 若读者需要查阅 FINAL_PACKAGE 原文做历史溯源，路径是 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。

**来源溯源映射**（本章核心内容的旧 FINAL_PACKAGE 来源）：

| 本章章节 | 旧 FINAL_PACKAGE 来源（已归档） | 并入方式 |
|---|---|---|
| §1 项目身份 | `01_PROJECT_FACTS`、`06_REDEFINED_PROJECT_VISION`、`44_VISION_V2` | 完整并入 |
| §2 项目不是什么 | `86_GRAND_PRIZE_ARGUMENT`、`02_CONSTRAINTS_AND_RED_LINES` | 完整并入 |
| §3 目标用户 | `44_VISION_V2`、`86_GRAND_PRIZE_ARGUMENT` | 完整并入 |
| §4 核心卖点 | `06_REDEFINED_PROJECT_VISION`、`44_VISION_V2`、`02_CONSTRAINTS_AND_RED_LINES` | 完整并入 |
| §5 竞争策略 | `06_REDEFINED_PROJECT_VISION`、`45_COMPETITIVE_TEARDOWN`、`28_FINAL_COMPETITION_ABSTRACT` | 完整并入 |
| §6 成功标准 | `06_REDEFINED_PROJECT_VISION`、`44_VISION_V2` | 完整并入 |
| §7 最终总论证 | `86_GRAND_PRIZE_ARGUMENT`、`44_VISION_V2` | 完整并入 |
