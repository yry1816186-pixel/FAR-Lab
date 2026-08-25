# COMPLIANCE_MAP.md — XH-202619 requirement → implementation → evidence → submission material

Governance artifact (lane 15). Static mapping only — live status lives exclusively in
`.control/ACCEPTANCE_STATUS.json` (workspace fact system, never published); the acceptance
contract itself is `project-spec/ACCEPTANCE.md`. Competition facts are recorded and dated in
`project-spec/COMPETITION.md` (rechecked 2026-08-25). This map says WHERE each requirement is
implemented and WHAT evidence/submission artifact answers it; it does not re-certify status.

Scope: XH-202619 Track 1 → Direction 1 → A (科学假设生成与研究计划设计).

## A. Official evaluation-loop requirements

| Official requirement | Implementation (authoritative owner) | Runtime evidence | Submission evidence |
| --- | --- | --- | --- |
| 问题理解 (problem understanding) | `src/pipeline/stages/scope.ts`; ResearchQuestion/Scope/Constraints domain objects (`src/domain/`) | real runs persisted in far.db; ACC-03 evidence chain | 技术方案文档 §研究问题; run snapshots |
| 知识整合 (knowledge integration) | `src/sources/**` (OpenAlex/arXiv/CrossRef/EuropePMC), `src/pipeline/stages/{retrieve,verify_sources,align,evidence}.ts`; multimodal ingest `src/ingest/**` | immutable source snapshots + claim-span alignment; ACC-04/05/06 | 文档 §数据或资料来源说明; claim-source binding samples |
| 候选假设生成 (multiple hypotheses) | `src/pipeline/stages/{hypotheses,hypothesis-dedup}.ts`, adaptive quality gate `src/app/quality-gate.ts` | diversity/dedup evidence per run; ACC-07 | 文档 §代表性测试案例 |
| 证据梳理 (evidence organization) | `src/pipeline/screening.ts`, ACH contrastivity in `critique_falsify`; counter-evidence/uncertainty surfaces | evidence/counter-evidence/uncertainty inspectable; ACC-06/09 | hypothesis tournament + ACH canvas screenshots |
| 研究计划输出 (research plan) | `src/pipeline/stages/plan.ts`, `plan-formal.ts`; executability validation | structured plans + checks; ACC-10 | 文档 §架构设计; plan exports |
| 反馈修正 (feedback revision) | `src/pipeline/stages/{feedback,revise}.ts`, iteration controller, human edit chain | version chains + semantic diff; ACC-11/26/29 | 文档 §结果展示与反馈迭代过程 |
| Falsifiability/testability | `falsify` stage + `src/domain/falsification` specs; confirmatory binding (MDE, power) | deterministic validation; ACC-08/32 | 文档 §研究方法 |

## B. Official route/compliance requirements

| Requirement | Implementation | Runtime evidence | Submission evidence |
| --- | --- | --- | --- |
| Qwen-series base via Bailian (or officially recommended tools) + call receipts | provider plane `src/providers/*`, DashScope provider; competition route switch (lane 11 handoff → 12) | **BLOCKED-live**: `B-QWEN-LIVE-ROUTE` — needs user-provided Bailian credential; no fabrication (see RELEASE_BLOCKERS.md) | 调用凭证/截图 from a real Qwen/Bailian route run — REQUIRED before submission, currently absent |
| Model-agnostic product claim | protocol-neutral gateway; providers pluggable (`FARLAB_MODEL_PROVIDER`) | multi-provider receipts (zai/dashscope/custom) | 文档 §架构设计 (gateway design) |
| 微调 allowance (optional) | not used; no fine-tuning claim made | n/a | no claim → no evidence needed |

## C. Submission materials checklist (facts rechecked 2026-08-25, COMPETITION.md)

| Material | Status at 2026-08-25 | Owner |
| --- | --- | --- |
| 技术方案文档 PDF (content items per official list; **≤20 pages adjudicated**, 30-vs-20 discrepancy recorded in COMPETITION.md) | NOT WRITTEN — blocker S-1 (RELEASE_BLOCKERS.md) | 15 drafts, user approves |
| 交互前端 (optional, recommended) | EXISTS: `web/dist` served by `node scripts/serve.mjs` (http://localhost:3196); ACC-16 evidence | done, keep current |
| 可调用测试 API (optional, recommended) | EXISTS: `/api/v1` HTTP contract on the same server | done, keep current |
| ≤10 分钟演示视频 (optional) | NOT PRODUCED — user-owned demo (policy: 演示归用户) | user |
| 源代码 | public-release pack via `scripts/export-public.mjs` + `zcode-harness/public-release-manifest.json` (allowlist; excludes research/evidence/.control/private strategy docs) | 15 |
| 网盘链接/提取码/上传时间截图 (single attachment doc) | submission-time user action | user |
| 盖章报名表 PDF (info must match registration system exactly) | user-owned | user |
| 压缩包命名 学校-姓名-作品名-联系电话 | submission-time | user |
| Deadline 2026-09-05; entry https://survey.aliyun.com/apps/zhiliao/A4e_qqNGu (NADC page) | recorded | — |

## D. Scoring dimensions → product strengths (for 技术方案文档 authoring)

- Scientific value 40%: claim-source word-by-word binding; deterministic validation; uncertainty/counter-evidence preserved (never erased); provenance receipts.
- Technical depth 30%: agent kernel + capability plane (MCP/skills/hooks, capability-scoped admission); multimodal scientific document understanding (`src/ingest/**` format matrix incl. deterministic SVG plot digitization); experiment execution loop (uv sidecar, CodeAct dual static gates); cross-run memory substrate (single SQLite authority, poisoning fences).
- Application potential 30%: reproducibility bundles + `far verify`; Web workbench real workflow; CLI/TUI; i18n + accessibility evidence.

## E. Acceptance coverage

All 41 acceptance criteria (project-spec/ACCEPTANCE.md) map onto the above surfaces; current
level-of-evidence gaps are listed ONLY in `submission/RELEASE_BLOCKERS.md` (single published
gap list; dynamic detail in `.control/`). As of 2026-08-25: ACC-02 below target
(BLOCKED-live, user credential), ACC-40 below target (evidence level, sibling lane owns the
rebase); all other critical items at/above target per `.control/ACCEPTANCE_STATUS.json`.
