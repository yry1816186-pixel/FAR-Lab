# Research Integrity — 学术诚信与报告规范声明（阶段 7 1126 落地）

> 本文档是 FAR-Lab 的学术诚信/报告规范声明（`docs/concepts/research-integrity.md`）。
> 依据：RE1-rcr.md（负责任的科研行为审查）、EG4-reporting-guidelines.md（报告规范）、
> DC1-joss-2026-readiness.md（编辑政策就绪度）。每项声明标注"已实现/部分/未实现"，
> 不夸大（AGENTS.md §7 诚实边界）。

## 1. 这是什么

FAR-Lab 是 **claim 级科学声明验证工具**：输入 claim + 证据，输出确定性五值 verdict
（CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED）。本文档声明
项目在**学术诚信与报告规范**维度的立场与现状——面向期刊投稿、基金评审与竞赛评委。

## 2. 负责任科研行为（RCR，对标 ORI RCR Framework）

| 维度 | 现状 | 证据 |
|------|------|------|
| 数据保留 | **已实现**：call_records 哈希链 append-only + 五类 tamper 检测 + 保留原语（audit_lineage.ts 六原语含 legal-hold） | evidence-ledger.md / audit_lineage.ts:105-193 |
| 数据共享 | **部分**：.far-proof 可移植包（含 RO-Crate/PROV-O/README_REPLAY）可复算；无独立数据仓库（零 DOI——外部授权 BLOCKED） | far-proof.md / DX3-01 |
| 结果可复现 | **已实现**：确定性内核（R0-R9 无 LLM 判官）+ suiteIntegrityRoot 逐字节复算 + GV 14/14 零漂移 + 双构建哈希一致 | determinism.md / SA13 |
| 作者责任 | **部分**：单维护者（bus factor=1）；开发全程 AI 编码代理（195/195 commits）——AI 使用披露见 §5 | MAINTAINERS.md / DD1 |
| 撤回/更正 | **已实现**：supersedeVerdict + lifecycle_events 哈希链 + retraction-notice.md 三支柱 | retraction-notice.md / BA3-3 |
| 利益冲突 | **未实现**：无 COI 声明文档（单人项目现实，EI1-02 登记） | EI1-domain-expert-review.md |

## 3. 报告规范（对标 PRISMA / CONSORT）

**声明**：FAR-Lab 是**单研究验证层**，非系统评价/临床试验工具——PRISMA 2020 与
CONSORT 的完整报告清单**大部分不适用**（EG2-systematic-review.md 核心定位声明）。
适用的等价物：

- **验证方法披露**：verdict 五值定义 + R0-R9 规则路径 + cannotProveStatement（内核
  输出含"本裁决不能证明什么"诚实边界）——verdict.md
- **证据分级披露**：GRADE 式 evidenceQualityTier（studyDesign + Cochrane RoB 7 维
  聚合）——evidence-grading.md
- **评估报告卡**：benchmark_report.json（30 problems / 28 domains / suiteIntegrityRoot
  / schemaVersion 2）——EA3-evaluation-report-card.md
- **局限声明**：docs/design/27_SUSTAINABILITY 等 10+ 处 cannotProve 边界

**待补**：PRISMA/CONSORT 自查表（"哪些条目适用/不适用及理由"）——V2 路线项。

## 4. 署名与贡献（对标 ICMJE 四标准 / CRediT Taxonomy）

**现状**：CITATION.cff（version 1.1.0 + commit 锚定 + 真实作者——P0-7 修复）。
**未实现**：CRediT 贡献者角色声明、ICMJE 署名四标准文档——V2 登记（RE1-G3 Medium）。

## 5. AI 使用披露（对标 ICMJE/COPE/JOSS 2026/pyOpenSci）

**现状（诚实声明）**：
- 本仓库 **195/195 commits 由 AI 编码代理（Claude Code AI）编写**（git log 实测）；
  人类维护者负责需求、验收与发布（MAINTAINERS.md）。
- README 曾无 AI 披露段（DD1-01 High）——**本声明即披露起点**；README 增补属 P1 施工。
- 运行时：LLM（Qwen 系列）仅作证据生成器；verdict 裁决由确定性内核完成
  （no_llm_final_judge_scan 强制）——AT11 反剧场 PASS。

**JOSS 2026 预审状态（Critical，DC1-01）**：仓库仅 3 周公开历史（2026-07-19 起），
不满足 JOSS "6 个月公开开发历史"硬性要求——最早 2027-01-19 可提交；禁止改写历史。

## 6. 伦理（对标 COPE）

- 论文工厂检测/图像取证：**不在范围**（产品定位=验证 claim 而非检测造假论文）——
  DW1-paper-mill-detection.md 边界声明
- 数据伦理：benchmark 数据集（demo_seeds 32 种子）为合成/公开论文复现素材，无人类
  受试者数据；隐私面见 docs/design/21（无 PII 收集）
- 双用途：验证工具可被用于增强信任（正面）或规避审查（滥用）——AGENTS.md 安全
  红线已声明

## 7. cannotProve（本声明不能证明什么）

1. 本声明**不构成**期刊投稿合规保证——具体期刊要求以投稿时为准
2. 作者责任披露**不替代**人类逐 PR 审校证据（DD1-02 登记：需先建人类审校记录）
3. 单维护者项目的独立性声明**不替代**第三方独立评估（EI2 外部验证 V2）
4. RCR 完整性**不证明**验证结论的科学正确性（verdict 是"证据是否支持 claim"的
   确定性判断，非"claim 是否为真"）

## 8. 治理节奏

| 项 | 频率 | 责任 |
|----|------|------|
| 本声明复核 | 每季度 + 每次重大发布 | 维护者 |
| RCR/披露状态更新 | 随 PROGRESS.md 检查点 | 维护者 |
| JOSS 就绪度复查 | 2026-12（提交窗口前） | 维护者 |

*声明完成时间: 2026-08-10 · 依据: RE1/EG2/EG4/DC1/DD1/EI1 findings 实测状态*
