# COMPETITION.md — XH-202619 Current Competition Truth

**Verified:** 2026-08-21 against the current official competition page. Re-check before any consequential compliance/submission claim; this file is not allowed to override a newer official rule.

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
