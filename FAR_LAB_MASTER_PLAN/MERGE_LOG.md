# MERGE_LOG.md — 合并决策日志（可审计）

> 本日志记录 `FAR_LAB_MASTER_PLAN/` 的逐文件合并决策：哪些原样保留、哪些并入、哪些丢弃，以及每条决策的理由。生成日期 2026-07-07。合并方法论与口径裁决见 `README.md` §0（状态纪律调和）。
>
> **术语说明（防混淆）**：本日志中的「`PROJECT_PLAN/`」指**合并时的工程源文件夹**（即本仓库原 `PROJECT_PLAN/`，承载 00-10 + 附录 A-F + FUSION + DEPTH_LEDGER）；「`11111/`」指**合并时的调研源文件夹**（`11111/far_lab_final_design_plan/`）。两者已于合并后并入 `FAR_LAB_MASTER_PLAN/`。后续决议（见 §6）已将 `FAR_LAB_MASTER_PLAN/` 定为唯一权威主规划，原 `PROJECT_PLAN/` 从工作树移除、全部代码/配置/文档引用迁移至此。

## 0. 合并原则

1. **工程权威不重写**：原 `PROJECT_PLAN/` 的 00-10 + 附录 A-F + FUSION + DEPTH_LEDGER 是 DESIGN_LOCKED，内部交叉引用（如「见 03 §7.1」「APPENDIX_A」）已固化——**原样字节级保留**，避免重命名/重写引入引用断裂或口径漂移。
2. **只并入调研版（11111）的独有价值**：调研版真正独有的是竞赛叙事层（评委视角 / 前沿研究 / 产品定位 / demo / 答辩 / PDF / 视频 / 开源论文 / 本地 Agent 提示词）——这些原 `PROJECT_PLAN/` 没有。
3. **不携带模板填充与弱化重复**：调研版大量文件是 LLM 生成的同文复制 boilerplate（每个模块/阶段/任务/风险/角色正文逐条相同），或对原 `PROJECT_PLAN/` 已有内容的弱化压缩版——携带只会制造冗余、弱化权威、传播 bug。
4. **合并初衷非破坏性**：合并时两套源文件夹（`PROJECT_PLAN/`、`11111/far_lab_final_design_plan/`）原样保留，本目录为新增合并产物。是否以本目录取代 `PROJECT_PLAN/` 当时列为「未决」（见 §6 决议记录）。

## 1. 来自原 `PROJECT_PLAN/` 的文件（20 份，全部 KEEP 原样）

| 文件 | 处理 | 理由 |
|---|---|---|
| `README.md` | **REPLACE**（重写为主规划 README） | 原 README 是 `PROJECT_PLAN/` 内部导航；合并后需统一导航 + 状态纪律调和 + 三路径阅读顺序。权威口径（命名表/五值/P0/红线/W0/路径/优先级）在重写中完整保留并标注来源 |
| `00_PROJECT_BRIEF.md` | KEEP 原样 | 项目身份/目标/卖点，DESIGN_LOCKED |
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | KEEP 原样 | **工程实现状态权威**；合并后仍是状态 SSOT（见 README §0） |
| `02_ARCHITECTURE.md` | KEEP 原样 | 最终架构 L0-L14，DESIGN_LOCKED；调研版 06 是其弱化压缩版（丢弃） |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | KEEP 原样 | FEC/五值裁决内核/anti-theater 规则表，DESIGN_LOCKED |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | KEEP 原样 | ProofEnvelope/proofHash/verifier，DESIGN_LOCKED；调研版 09 是其压缩版（丢弃） |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | KEEP 原样 | AI4S/demo/FAR-Bench，DESIGN_LOCKED；调研版 10 是其压缩版（丢弃） |
| `06_ROADMAP_AND_DOD.md` | KEEP 原样 | W0-W5 路线 + DoD，466 行实质内容；调研版 12 是同文复制 boilerplate（丢弃） |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | KEEP 原样 | 风险/DO_NOT_CLAIM/假绿/答辩红线，DESIGN_LOCKED；调研版 18 是同文复制 boilerplate（丢弃） |
| `08_TRACEABILITY_MATRIX.md` | KEEP 原样 | 旧编号→新位置映射，来源溯源 |
| `09_GAP_CLOSURE_LOG.md` | KEEP 原样 | 缺漏补齐修订项 |
| `10_DEV_ENTRYPOINT.md` | KEEP 原样 | P0 工程闭环入口 + 12 步实施顺序；调研版 13 任务清单是其冗余拆分（丢弃） |
| `APPENDIX_A_TYPES.md` | KEEP 原样 | **类型字段权威**；调研版 08 sciir 与之重叠且含 bug（丢弃） |
| `APPENDIX_B_GOLDEN.md` | KEEP 原样 | golden vectors 规格 |
| `APPENDIX_C_CANONICAL.md` | KEEP 原样 | **canonical 字节规则权威** |
| `APPENDIX_D_PROOF_BUNDLE.md` | KEEP 原样 | `.far-proof` bundle 结构 + open science 导出 |
| `APPENDIX_E_ANTI_THEATER.md` | KEEP 原样 | 反剧场攻击库 |
| `APPENDIX_F_GLOSSARY.md` | KEEP 原样 | **术语语义权威** + 禁用词表 |
| `FUSION_OPEN_SCIENCE_DESIGN.md` | KEEP 原样 | Open Science 范式融合（FUSION-OS-1..14） |
| `DEPTH_LEDGER.md` | KEEP 原样 | 跨窗口深度接线账本 |

**校验**：20 份文件经 `sha256sum` 比对，与原 `PROJECT_PLAN/` 源文件字节一致（除 README 重写外）。

## 2. 来自调研版 11111 的文件（11 份 KEEP → 重编号 20-30）

| 调研版原文件 | → 主规划新编号 | 处理 | 独有价值 |
|---|---|---|---|
| `01_PROJECT_FACT_BASELINE.md` | `20_COMPETITION_FACT_BASELINE.md` | KEEP（加状态纪律调和注） | 事实基线 + 外部比赛/API/标准来源汇总 |
| `02_COMPETITION_ALIGNMENT_AND_JUDGE_VIEW.md` | `21_COMPETITION_AND_JUDGE_VIEW.md` | KEEP | 赛题适配 + 评委质疑表 + 60s 开场 + 与普通 demo 区别 |
| `03_DEEP_RESEARCH_REVIEW.md` | `22_DEEP_RESEARCH_REVIEW.md` | KEEP | 前沿研究综述（Co-Scientist/Robin/AI-Scientist-v2/MCP/RO-Crate/RFC6962…） |
| `04_GAP_AND_OPPORTUNITY.md` | `23_GAP_AND_OPPORTUNITY.md` | KEEP | 全球竞品空白 + 不可替代点 + 砍功能清单 |
| `05_FINAL_PRODUCT_POSITIONING.md` | `24_PRODUCT_POSITIONING.md` | KEEP | 多受众定位（评委/开源/论文/开发者版） |
| `11_HERO_DEMO_AND_COMPETITION_STORY.md` | `25_HERO_DEMO_AND_COMPETITION_STORY.md` | KEEP | Demo A/B/C + TESS 可证伪证据链 + 现场篡改冲击点 |
| `15_COMPETITION_PDF_STRUCTURE.md` | `26_COMPETITION_PDF_STRUCTURE.md` | KEEP | 16 页参赛 PDF 页面骨架 |
| `16_DEFENSE_SCRIPT_AND_QA.md` | `27_DEFENSE_SCRIPT_AND_QA.md` | KEEP | 60s/3min/5min 讲稿 + 10 个尖锐 Q&A |
| `17_DEMO_VIDEO_SCRIPT.md` | `28_DEMO_VIDEO_SCRIPT.md` | KEEP | 11 镜 demo 视频分镜 |
| `14_OPEN_SOURCE_AND_PAPER_ROUTE.md` | `29_OPEN_SOURCE_AND_PAPER_ROUTE.md` | KEEP | 开源仓库结构 + 技术报告大纲 + 论文 title/abstract |
| `20_FINAL_EXECUTION_PROMPT_FOR_LOCAL_AGENT.md` | `30_EXECUTION_PROMPT_FOR_LOCAL_AGENT.md` | KEEP | 可直接复制给本地 Agent 的总执行提示词 |

**编辑说明**：11 份文件内容忠实保留；每份加了一行 provenance header 指明来源与权威关系（不改实质内容）。仅 `20_COMPETITION_FACT_BASELINE` 因直接触及状态纪律，在 §6/§16 加了调和注（指向 README §0），其余保持调研版原口径。

**重编号理由**：用 20-30 段而非塞进 00-10，是为了 (a) 不与原 `PROJECT_PLAN/` 的 00-10 冲突（后者交叉引用已固化），(b) 让「工程骨架层 / 竞赛策略层」两层结构在编号上即可辨识，(c) 调研版文件无来自原 `PROJECT_PLAN/` 的入站引用，重编号零破坏。

## 3. 来自调研版 11111 的文件（12 份 DROP，含理由）

| 调研版原文件 | 处理 | 丢弃理由 / 替代 |
|---|---|---|
| `00_WORKSPACE_MAP.md` | DROP | 描述的是调研版自身的生成过程（输入 `PROJECT_PLAN.zip`、历史 JSON 地图）；合并后其角色由本 `MERGE_LOG` + 主 README 接管 |
| `06_FINAL_SYSTEM_ARCHITECTURE.md` | DROP | 是原 `PROJECT_PLAN/` `02_ARCHITECTURE` 的弱化压缩版（原 `PROJECT_PLAN/` 有 L0-L14 深层架构 + 模块边界，DESIGN_LOCKED）；调研版仅多一张分层 ASCII 图，价值被 02 覆盖 |
| `07_CORE_MODULE_DESIGNS.md` | DROP | **同文复制 boilerplate**：每个模块（FAR-Kernel / Provider Gateway / Competition Qwen Profile / …）正文逐字相同，仅模块名不同；模块清单已被 `02_ARCHITECTURE` 层级覆盖 |
| `08_SCIIR_SCHEMA_PROTOCOLS.md` | DROP | 与权威 `APPENDIX_A_TYPES` 重叠，且**含模板 bug**（如 ClaimNode 示例把 `status` 写成时间戳 `"2026-07-06T00:00:00Z"`、`created_by` 同样错位）。携带 buggy 重复会与权威附录冲突。开放科学导出映射见 `APPENDIX_D_PROOF_BUNDLE` + `FUSION_OPEN_SCIENCE_DESIGN` |
| `09_PROOF_PACKAGE_AND_OPEN_SCIENCE_EXPORT.md` | DROP | 是 `04_PROOF_ENVELOPE_AND_VERIFIER` + `APPENDIX_D` 的压缩版 |
| `10_VALIDATION_AND_EVALUATION_DESIGN.md` | DROP | 是 `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK` 的压缩版 |
| `12_ENGINEERING_ROADMAP.md` | DROP | **同文复制 boilerplate**：W0-W8 每个阶段正文逐字相同，仅标题/目标行不同；原 `PROJECT_PLAN/` `06_ROADMAP_AND_DOD`（466 行实质内容）是权威 |
| `13_LOCAL_AGENT_TASKS.md` | DROP（保留任务标题语义于 10/30） | **同文复制 boilerplate**：T-001..T-NNN 每个任务正文逐字相同（优先级/输入/输出/修改范围/禁止事项/依赖/验收/自测/降级/环境/并行/提示词 全部同文），仅目标行不同；任务语义已被 `10_DEV_ENTRYPOINT`（P0 闭环 + 12 步顺序）与 `30_EXECUTION_PROMPT_FOR_LOCAL_AGENT` 覆盖 |
| `18_RISK_REGISTER_AND_HONEST_BOUNDARIES.md` | DROP | **同文复制 boilerplate**：每个风险行的「修复策略/降级路径」逐字相同；NEEDS_* taxonomy 已在 `01`/`07` 定义；权威风险表在 `07_RISK_REGISTER_AND_DO_NOT_CLAIM` |
| `19_FINAL_SELF_CRITIQUE_AND_FIXLOG.md` | DROP | **纯同文复制**：10 个角色行的「最尖锐质疑/是否成立/修复/方案变化/影响」逐字相同（全是"你是不是只是把很多高级词拼在一起…"）；无增量信息 |
| `FINAL_INDEX.md` | DROP | 调研版内部导航；合并后由主 README 文档索引接管 |
| `README_DELIVERY.md` | DROP | 调研版交付说明（5 行）；合并后由主 README 接管 |

**丢弃决策的复核**：对每个 DROP，已确认 (a) 其独有信息已被保留的文件覆盖，或 (b) 其内容是同文复制无增量，或 (c) 其内容含 bug 会污染权威。详见上表「替代」列。

## 4. 唯一的内容冲突裁决：状态纪律

见 `README.md` §0。摘要：

- 冲突：原 `PROJECT_PLAN/` 说 `IMPLEMENTED_VERIFIED`（仓库实测）；调研版说 `NEEDS_REPO_VALIDATION`（降级）。
- 根因：调研版作者只拿到文档 ZIP，没见到源码仓库，故保守降级。
- 裁决：本主规划处于真实仓库语境（仓库含 `src/` `tests/` `packages/`），调研版降级前提不成立 → **原 `PROJECT_PLAN/` 的实测口径框架胜出**；调研版的 `NEEDS_REPO_VALIDATION` 作为下界护栏保留语义，不覆盖实测结果；任何 `IMPLEMENTED_VERIFIED` 可由 `far status --json` 复核。
- 落地：仅 `20_COMPETITION_FACT_BASELINE` §6/§16 加调和注；其余 20-30 文件保持原口径（它们多不涉及具体实现数字）。

## 5. 合并产物清单

`FAR_LAB_MASTER_PLAN/` 共 **33 份文件**：

- 主 README × 1（重写）
- MERGE_LOG × 1（本文件）
- 工程骨架层 00-10 × 11（原 `PROJECT_PLAN/` 原样）
- 竞赛策略层 20-30 × 11（调研版独有，重编号）
- 附录 A-F × 6（原 `PROJECT_PLAN/` 原样，权威）
- FUSION + DEPTH_LEDGER × 2（原 `PROJECT_PLAN/` 原样）

= 1 (README) + 1 (MERGE_LOG) + 11 + 11 + 6 + 2 = **32 份 .md**。

## 6. 决议记录（原「未决 / 需人工跟进」）

> 本节原列「是否以 `FAR_LAB_MASTER_PLAN/` 替换仓库内 `PROJECT_PLAN/`」为未决项。该决议**已于 2026-07-07 落地执行**：

- **决议：`FAR_LAB_MASTER_PLAN/` 定为唯一权威主规划。** 原 `PROJECT_PLAN/` 从工作树移除（其内容已逐字节并入本目录，见 §1 校验）。
- **引用迁移（已完成）**：`scripts/lib/ledger.mjs` 的 `LEDGER_REL`、`scripts/depth_gate.mjs`、`src/cli/status_dump.ts`、`.github/workflows/depth-evidence.yml` 与 `entry-protocol-check.yml`、`.pi/project.json` 的 context，以及全部代码/测试/文档中的路径指针，已统一从 `PROJECT_PLAN/...` 迁移到 `FAR_LAB_MASTER_PLAN/...`。`depth_gate` CHECK-L1（账本存在性）经迁移后实时通过。
- **R6 单口径强化**：迁移时顺手把 `scripts/depth_gate.mjs` 原先硬编码的 ledger 路径改为复用 `lib/ledger.mjs` 导出的 `LEDGER_REL`，消除 gate 与 bot 之间的双口径漂移面（与该模块既有的 R6 单源禁令一致）。

仍需人工跟进（与替换决议无关）：

- 本合并是**文档合并**，不替代 `far status --json` 实测：发布前仍需在真实仓库跑该命令回填任何具体实现数字。
- 调研版 `08_SCIIR` 中 per-object 的 PROV/RO-Crate/OTel 映射角度有一定价值，但因含 bug 且与 APPENDIX_A 重叠而丢弃；若未来需要 per-field 开放科学映射表，建议在 `APPENDIX_D` 或新 `APPENDIX_G` 中以权威附录形式重做（不要从 buggy 的调研版 08 复活）。
