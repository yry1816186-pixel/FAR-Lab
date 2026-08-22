# FAR-Lab 技术方案（PDF 源稿）

> XH-202619「基于国产开源大模型的 AI Scientist 的研发与应用」· 赛道一 · 方向 1 · A：科学假设生成与研究计划设计
> 源稿即 PDF 排版底本（≤20 页约束在排版时执行）。**诚实纪律**：本文每个数字旁注证据文件路径（`evidence/`、`eval/results/`，均为仓库实跑产物，可逐点验算——延续 D-022 复算纪律）；测试计数随并行开发漂移，一律以 `npm test` 实跑为准（本文快照时点 595/595，2026-08-22 D-066）。
> 官方八要素在正文中以【要素 N】标注逐项覆盖。

---

## 0. 结论前置（评审 30 秒版）

**FAR-Lab 是一个证据约束的"科学方法操作系统"**：输入一个真实科学问题，系统执行"问题理解→文献检索（含结构性反证检索）→逐字证据绑定→多策略可证伪假设生成→锦标赛排序→可执行研究计划→因果反馈修订"全链，并导出可第三方独立核验的复现包。

五个经外部对标核实（11 个同类产品公开面逐一核对，`research/wave-product-reports/line-f-competitor-product.md`）的差异化能力：

1. **Fail-closed 证据约束**：claim 对不上检索来源即降级，绝不编造（绑定率与降级路径可从 DB 复算：`eval/results/metrics-ev1.json` 全 run claims_verified 58/58 池化）
2. **可证伪性工程化**：每条假设带九字段证伪规范（观测/测量/判定规则/支持与证伪条件/混杂因子…），计划层强制决策规则与多重检验纪律（POPPER，D-025）
3. **假设锦标赛排序**：Bradley-Terry + 顺序交换一致性 + 不确定性区间——排序依据可审计，不是单次 LLM 打分
4. **全链 LLM 回执**：每次模型调用留 receipt（provider/model/usage/延迟/输入输出哈希），非 live 执行在 UI 显式警告
5. **第三方可复现**：`far verify` 10 项检查独立核验导出包（10/10 通过记录：`evidence/W-EV1/live-run-verification.md`）

**如实边界**：官方指定"千问经百炼"提交路由的 live 验证仍缺用户凭证（B-QWEN-LIVE-ROUTE；一键探针 `node spikes/qwen-route-probe.mjs` 已就位）；反证判官的语义命中仍是已量化短板（0.143，见 §7）；macOS/Linux 桌面壳代码就绪未实测。

---

## 1. 研究问题与解决方法【要素 1】

### 1.1 问题

AI 科学家系统普遍存在**可信性缺口**：生成的假设与计划无法回答"这个说法的证据是哪一句？为什么排第一？换个 judge 还成立吗？离线能复现吗？"。全自动系统（如 AI-Scientist 类）无人工科学方法约束；文献助手类停在检索摘要层。中间地带——**人在环、证据约束、可证伪工程化的科学方法工作台**——是空白（对标分析：`research/wave-product-reports/line-f-competitor-product.md`，Elicit/SciSpace/Consensus/Scite/OpenScholar/Sakana/Robin 等 11 产品）。

### 1.2 方法（与官方 A 环逐段对应）

| 官方环 | FAR-Lab 实现 | 关键机制与证据 |
|---|---|---|
| 问题理解 | `scope` 阶段：ResearchQuestion 结构化（goalType 五类/现象/边界/五类约束），LLM 精化后持久化 | 驱动后续检索与计划；真实 run 报告 §1：`evidence/W1/run_*.report.md` |
| 知识整合 | `retrieve`+`verify_sources`+`build_evidence`：OpenAlex/arXiv/Crossref/EuropePMC 四源；**反证查询结构性保证**（计划含恰好 2 条反证查询且双源执行，retrieve.ts schema 强制）；来源核验（DOI/arXiv id/OpenAlex id/title 匹配，错误论文守卫 wrongPaperSuspect D-046-F3）；claim 逐字绑定四态（verified/resolved_unaligned/unresolved/missing） | 检索透明 API 暴露全查询计划（`GET /runs/:id/corpus`）；验证率 0.9667：`eval/results/metrics-ev1.json`；arXiv 零结果率 82.3%→级联恢复（D-046-F2，`evidence/W6/retrieval-baseline-harness.md`） |
| 候选假设生成 | `generate_hypotheses`：多策略（机制驱动/数据异常/跨域迁移…）+ 跨策略负向条件化防重复（D-049-F4）+ 聚类代表；新颖性双层（语料相对标签 + 文献邻居判定 novel/incremental/already_done） | `evidence/W-EV1/live-run-verification.md` |
| 证据梳理 | claim↔hypothesis 关系（supports/contradicts/weakens/qualifies…11 类，极性三分）；关系标签可靠性修复：falsify schema v2 显式标签 + topical gate，修复后 contradicts 错标 0/21、盲判一致 54.5%（修复前 46%） | `evidence/W-EV2/relation-precision.md` |
| 研究计划输出 | `rank`+`plan`：假设锦标赛（两两对决、双序一致检查、BT 排名+不确定性）→ 计划（变量/对照/纳入排除/数据与工具需求/步骤依赖图/指标统计/四条决策规则/混杂/替代解释/伦理/可复现要求）+ 可执行性门 + 多重检验纪律（多假设计划强制 single_primary 等） | executability 5/5：`eval/results/metrics-ev1.json`；BT 实现与 swap 一致性：`evidence/W-EV1/ev1-before-after.md` |
| 反馈修正 | `feedback`+`revise`：九源反馈信号（人类专家/新文献/新数据/工具结果/仿真/实验/评审/验证失败/复现失败）→ **因果修订**（每条修订必须链接触发它的反馈 + 逐字段 before/after + 质量增量判定 + 版本 diff）；修订后可一键重导出 | `evidence/W-EV1/live-run-verification.md`；修订链 UI：方案 §3 |

**模型面（国产开源路由）**：DeepSeek（默认，strict function calling 结构化传输 D-026）/ 智谱 GLM / 阿里百炼 Qwen（`FARLAB_MODEL_PROVIDER` 三路由 fail-closed 切换，错配即抛错不静默回退）。结构化输出四层容忍链 + 自研 JSON 修复引擎（上游 jsonrepair 算法源码级抽取，74/74 oracle 逐字节等价，损坏修复 9/68→68/68：`evidence/W7/repair-benchmark.md`）；截断输出永不静默补全验收（finishReason=length → 专用重问，D-044）。

## 2. 架构设计与讲解【要素 2】

四层，单向依赖，零框架：

```
Web 工作台(React SPA) ──HTTP──> API 层(node:http, /api/v1) ──> 应用内核
桌面壳(Tauri v2 webview)            │                        ├─ orchestrator(11 阶段+租约单写者)
CLI(far, 零依赖 dist) ──────────────┤                        ├─ 领域层(zod schema 单源)
                                    │                        ├─ 持久层(node:sqlite + 内容寻址工件库)
                                    └────────────────────────┴─ 模型面(3 provider) + 检索面(4 源)
```

- **领域 schema 单源**：所有对象（question/claim/hypothesis/plan/revision/receipt/bundle…）zod 定义于 `src/domain/`，API/CLI/Web 三表面只是投影——三表面术语一致性的机制保障。
- **编排与可靠性**：阶段级 checkpoint + 步级幂等（W8）；**跨进程租约单写者**（同 run 二执行者直接拒绝）+ 服务器 watchdog 30s 内自动领养冻结 run（`src/app/orchestrator.ts`、`src/server/api.ts`，判别测试在 `tests/`）。
- **安全边界**：API 仅 loopback（Host/Origin 双查，防 DNS-rebinding/CSRF）；变更动词强制 JSON；1MB 请求上限；路径穿越防护；密钥只以环境变量名出现在任何 API 面（health/probe 均不回显值，测试断言 sk- 零出现）。
- **桌面壳**（Tauri v2.11.5）：纯运行表面——spawn 同一个 Node server + webview 装同一 `web/dist`，Windows 本机端到端实测（拉起 health 200/1s；强杀经 Job Object 随行终止，D-066）；macOS/Linux 代码就绪未实测（如实）。
- **设计系统**：「证据排印」三声三字体（IBM Plex Sans=界面声/Plex Mono=溯源声/Source Serif 4=陈述声，全 OFL 自托管）；色板 OKLCH 数学计算 + WCAG 逐对验证（`spikes/design-palette-probe.mjs` 可复算）；**无彩色界面，彩色即证据**——饱和色只出现在认知状态（✓已验证/✗已反驳/？未知/▲弱化）。

## 3. 代表性测试案例【要素 3】

| 案例 | 结果（实跑） | 证据 |
|---|---|---|
| FIRE-Bench 式再发现评估（5 个已发表发现，假设级 F1） | 均值 0.58，2/5 完美再发现；判分方差 ±0.5 已披露并升级 judge v2.1（GT 固定+金标校准匹配，replay swing ≤0.091） | 结果 JSONL（当前文件名）：`eval/results/rediscovery-v2-pass1-runs.jsonl`、`eval/results/rediscovery-v1-degraded*.jsonl`；分析：`evidence/W-EV2/rediscovery.md`；D-042 |
| MLR-Bench 外部同判对比（N=5×3 维度 30/30） | idea 7.00 / proposal 6.20（锚点 o4-mini 7.80/7.40、deepseek-r1 7.60/7.00）；**Feasibility 7.40 超两个锚点**；差距归因披露（任务扁平化/新颖性呈现/渲染遗漏） | `evidence/W-EV2/mlr-bench.md` |
| 复现包第三方核验 | `far verify` 10/10 全过（exit 0，逐项真实执行，不可执行按失败计） | `evidence/W-EV1/live-run-verification.md` |
| 关系标签可靠性（对抗修复前后） | contradicts 错标 30%→0/21；盲判一致 46%→54.5% | `evidence/W-EV2/relation-precision.md` |
| EV1 前后对照（机制融合效果） | claims +40%、反证关系 +104%、claim 绑定 100% 保持、计划 5/5 保持；token +84.5% 如实记录 | `evidence/W-EV1/ev1-before-after.md` |
| 自动化回归 | 全量测试 595/595（快照 2026-08-22；以 `npm test` 实跑为准） | CI 等价本地命令 |

## 4. 源代码【要素 4】

- 仓库结构：`src/`（domain/app/pipeline 11 阶段/persistence/providers/sources/server/cli）+ `web/`（React 工作台）+ `desktop/`（Tauri 壳）+ `tests/`（全量套件）+ `eval/`（评估脚本与结果 JSONL）+ `evidence/`（每个能力对应真实 run 的命令级证据）+ `.control/DECISIONS.jsonl`（D-001..D-067 决策账本，含每项反转触发器）。
- 纪律：生产路径零 mock；运行时依赖仅 zod（前端依赖隔离在 `web/package.json`）；dist 陈旧守卫拒绝执行（D-031）；密钥永不入库（secret-scan 门禁）。
- 复现三命令：`npm install && npm run build` → `DEEPSEEK_API_KEY=… node dist/cli/main.js research start "问题"` → `node dist/cli/main.js verify <bundle-id>`（详见 §8）。

## 5. 项目工作流程【要素 5】

多 Wave 研发制（每 Wave：外部源码远征→源码级融合→before/after 基准→对抗审计→收口门禁），全程账本化：`research/WAVE*-SCOUT.md`（调研）+ `DECISIONS.jsonl`（决策）+ `evidence/W*`（验证）+ `eval/north-star.json`（北极星指标账本：current 全部带证据文件路径，target 只升不降，反注水规则四条）。示例闭环：Wave-6 检索（82.3% 零结果率实证→F1/F2 融合→冻结库回放全等+守卫零回归）——`evidence/W6/retrieval-baseline-harness.md`。

## 6. 上下文工程设计【要素 6】

- **提示**：每阶段系统提示词即科学方法协议（如检索规划强制"恰好 2 条含明确反证词汇的反证查询、覆盖两个不同角度"；反证检查强制"显式断言才可标 contradicts"——schema v2 标签纪律 D-024）。领域约束进 schema 而非提示词措辞（可测）。
- **结构化输出**：strict function calling（DeepSeek beta 路由，41/41 工具调用零失败 e2e：D-030）+ zod 投影 + 四层 JSON 容忍链（direct→fence→legacy 引号扫描→修复引擎）；**截断即拒绝验收**并触发专用简洁重问（防伪造红线）。
- **上下文预算**：证据入 prompt 带围栏（不可信文献数据隔离）；检索融合 RRF-k60 + LLM listwise 重排（窗口化防上游限制，D-046-F4）；判分投票可配 N 路中位数（FARLAB_JUDGE_VOTES，D-039）。

## 7. 数据或资料来源说明【要素 7】

- 文献源（全部 keyless 可用，可选 key 增强）：OpenAlex（429 有界退避+预算态如实透出）/arXiv（LaTeXML 全文）/Crossref（第三冗余源，反证查询改道路由）/EuropePMC（JATS 全文）；全文深化 GROBID TEI（服务端，D-028）。claim 逐字引用绑定到来源快照（内容寻址哈希）。
- 评估数据：FIRE-Bench 设计再发现 5 题（自建种子，发布物同库）；MLR-Bench（CC BY 4.0 数据/MIT 代码，适配器保结构保真）；历史 run 库（46+ runs 的 receipts 回放做确定性基准）。
- 如实短板（不掩盖）：反证判官语义命中 0.143 [0.026,0.513]（严格口径，目标 0.7——差距已归因：miss 主体为空席非反转；改进路径=judge v2 裁决层，`evidence/W9/counter-evidence-metric.md`）；MLR-Bench idea/proposal 与锚点差 0.8/1.2（归因见 §3）。

## 8. 结果展示与反馈迭代过程【要素 8】

- **结果展示**：Web 工作台七 tab（概览=真值进度 n/9+11 阶段时间线；证据=检索透明面板+认知状态证据行；假设=锦标赛+九字段证伪规范折叠；计划；修订=因果链 before/after；溯源=回执表+bundle 核验+重导出；事件流）。三表面同术语（i18n 类型化词典缺 key 编译失败）。
- **反馈迭代（三层实证）**：①产品层：九源反馈→因果修订→重导出闭环（UI 一键，服务端三重诚实守卫）；②研发层：对抗审计驱动（EV1 数字复算修正 D-022、审计驳回记录在案——如对比度误报驳回）；③科学层：假设本身可被反馈削弱/证伪并留版本 diff。
- **诚实呈现制度**：未知即未知（无百分比进度、无 ETA）；弃权一等状态；非 live 回执警告横幅；`far verify` 报告即对外信任凭证。
- **复现指引**：`npm run serve`（Web）→ 新建研究 → 溯源 tab 验证 bundle → CLI `research export --format bundle` → 第三方 `far verify`（10 检查独立复算）。

---

## 附：当前外部门（如实）

1. DASHSCOPE_API_KEY（官方"千问经百炼"提交路由 live 验证；一键探针在位：`node spikes/qwen-route-probe.mjs`）
2. DeepSeek/z.ai 余额（判分方差 live 复测；`far probe --live` 一命令分类）
3. OPENALEX_API_KEY（可选：不间断检索+全文抓取）

数字口径快照：2026-08-22（D-066/D-067 间）。本文所有指标可在 `eval/north-star.json` 找到同源条目与证据路径。
