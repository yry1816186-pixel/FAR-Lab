# COMPETITION.md — XH-202619 Current Competition Truth

**Verified:** 2026-08-26 against the official pages (URLs below; previous rechecks 2026-08-25, 2026-08-24, 2026-08-22, 2026-08-21). Re-check before any consequential compliance/submission claim; this file is not allowed to override a newer official rule.

**Official sources (recorded 2026-08-22, re-fetched 2026-08-25 and 2026-08-26):**

- Aliyun official topic page: https://university.aliyun.com/action/tzbjbgs2026
- NADC (国家天文科学数据中心) topic release, published 2026-06-25: https://nadc.china-vo.org/article/20260624094452

## 0. Model-calling route requirement (verbatim, 2026-08-25 recheck — unchanged)

> 基座模型须基于千问（Qwen）系列模型，开发平台需通过阿里云百炼平台调用，或者采用比赛官网推荐的Qoder/QoderWork/QwenWork/秒悟等工具调用系列模型，并提供调用凭证或截图。
> 允许参赛团队围绕下游任务和领域数据进行模型微调。
> 作品可基于大模型训练、智能体编排、skills 设计、系统 harness 工程等方式完成。
> 鼓励演示，推荐搭建可交互前端、可调用测试 API，并制作 10 分钟内的演示视频。

Consequences for FAR-Lab:

- The officially mandated route is **Qwen-series via Bailian (or official recommended tools) with call receipts/screenshots**. A DeepSeek-only live route does NOT satisfy this requirement (DeepSeek is domestic open-source but not Qwen-series/Bailian). Submission compliance requires the Qwen/Bailian live route to be verified and receipted before delivery; tracked as `B-QWEN-LIVE-ROUTE` (needs user-provided credentials; no fabrication allowed).
- Product remains model-agnostic (gateway protocol-neutral); the competition route is a submission constraint, not an architecture constraint.

## Submission requirements (2026-08-25 recheck, summary)

- Materials: 技术方案文档 PDF（研究问题与解决方法、架构设计与讲解、代表性测试案例、源代码、项目工作流程、上下文工程设计、数据或资料来源说明、结果展示与反馈迭代过程）；可附交互前端、可调用测试 API、≤10 分钟演示视频。
  **Page-limit discrepancy (ADJUDICATED 2026-08-25, lane 15; handoff 11→15 `r2-2026-08-25-from-11-to-15-page-count-discrepancy.md`):** the two official pages still contradict each other on 2026-08-25 (both re-fetched verbatim by lane 15): Aliyun topic page says `技术方案文档（PDF≤30页）`; NADC release says `技术方案文档（PDF≤20页）`. Lane 11's 2026-08-24 note claiming the pages had unified at ≤20 was wrong and is retracted. **Adjudication: bind to the stricter ≤20 pages.** Rationale: a ≤20-page document is compliant under both rules simultaneously; no organizer clarification channel is guaranteed to answer before the deadline; the downside is content compression only. This binding stands until an official clarification or the per-track 作品提交要求 says otherwise — re-check before printing the final PDF. Both pages agree on the content items.
- Deadline (official fact, recorded as-is, re-confirmed 2026-08-25 on both pages): 作品 2026-09-05 前提交至发榜单位指定链接；压缩包命名"学校-姓名-作品名-联系电话"，附网盘链接/提取码/上传时间截图（单独附件文档整理）+ 盖章报名表 PDF（与报名系统填报信息严格一致）。
- Submission entry (NADC page, recorded 2026-08-25): https://survey.aliyun.com/apps/zhiliao/A4e_qqNGu

## 1. Locked scope

- 2026 “挑战杯”揭榜挂帅擂台赛，榜题：**基于国产开源大模型的 AI Scientist 的研发与应用**，题号 `XH-202619`.
- FAR-Lab target: **Track 1 -> Direction 1 -> A: 科学假设生成与研究计划设计**.
- Official A loop: **问题理解 -> 知识整合 -> 候选假设生成 -> 证据梳理 -> 研究计划输出 -> 反馈修正**.
- Direction B execution/simulation may be used only as a supporting validation/feedback adapter; it must not redefine the product core.

## 2. Current scoring dimensions

- Scientific value 40%: factual accuracy; clarity of transformation/explanation/presentation; completeness/consistency.
- Technical depth 30%: model/agent/skill design completeness; multimodal processing/generation/reasoning/interaction; result validation, feedback iteration and stability.
- Application potential 30%: real-scenario value; demonstration/interaction/delivery completeness; reproducibility of code/results/process.

## 3. Engineering evidence matrix

| Criterion | Product responsibility | Minimum convincing evidence |
| --- | --- | --- |
| Problem understanding | explicit ResearchQuestion/Scope/Constraints | real run + persisted structured state |
| Knowledge/evidence integration | verified sources, claims, evidence/counter-evidence | resolvable source snapshot + claim alignment checks |
| Multiple hypotheses | genuinely distinct candidates | real model run + diversity/dedup evidence |
| Falsifiability/testability | observable variables, comparator/threshold/decision rule | deterministic validation + reviewer challenge |
| Executable research plan | variables, controls, data, method, metrics, stop/risk/resources | structured plan + executability checks |
| Feedback/revision | feedback changes hypothesis/plan causally | version chain + semantic diff + quality evidence |
| Truth/reproducibility | provenance, immutable inputs/artifacts, replay/recompute | reproducibility bundle + independent verification |
| Official-route compliance | live officially required model route | provider/model/request receipt or official proof artifact |
| Product usability | real Web/CLI workflow, no fake controls/states | realistic user workflow + HCI/accessibility verification |

Dynamic implementation status belongs only in `.control/ACCEPTANCE_STATUS.json`, not in this file.

## 6. Non-negotiable anti-drift rules

- Do not drift into generic RAG, paper summarizer, generic coding Agent, generic AI Scientist platform or Direction-B laboratory-control product.
- Do not create judge/demo/screenshot-only product modes or fake progress/results/provenance.
- “Science 125 questions” is an allowed problem source, not a requirement to pretend universal all-domain support.
