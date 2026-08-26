# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase answers: React 18 + Vite + TypeScript; SSE event stream over a Node HTTP API (`/api/v1`); single SQLite truth plane; Tauri desktop shell; CLI/TUI. Runtime deps minimal (zod only in product Node runtime).

## Users

Primary: working scientific researchers (Zotero-heavy, bilingual zh/en, literature-driven workflows) who need to go from a question to a falsifiable, evidence-constrained set of hypotheses and an executable research plan. Secondary (confirmed): competition judges (XH-202619 Track 1-A) evaluating live capability and honesty; the builder/developer running the workbench locally. [ASSUMPTION from task book, labeled: "真实科研人员愿意长期使用" is the bar the owner repeatedly set; no persona interviews have been conducted.]

## Product Purpose

FAR-Lab generates falsifiable scientific hypotheses and research plans under real evidence constraints. Success = a researcher can: ask a question, see what real literature supports/contradicts, compare candidate hypotheses with uncertainty visible, intervene/correct the system's scientific decisions, and export a reproducible package another environment can verify. It must never fabricate citations, progress, certainty, or execution modes.

## Positioning

Not a chatbot, not a literature search, not a dashboard: the differentiator is the closed loop `question → real retrieval → claim-source binding → multi-hypothesis falsification → ranked comparison → plan → deterministic experiment verdicts → causal revision → reproducible export`, with an append-only truth plane (receipts + hash-chained events) underneath and honest execution-mode labeling (LIVE / OFFLINE / RECORDED / SYNTHETIC) everywhere.

## Operating Context

- Local-first single-workspace model (SQLite far.db); server on 127.0.0.1 (default 3196).
- Model access via protocol-agnostic routes (Zhipu GLM / DashScope-Qwen / DeepSeek / any OpenAI- or Anthropic-compatible endpoint / local endpoints / a keyless offline deterministic route for demos and interface acceptance).
- Researchers bring materials: PDFs, DOIs, BibTeX/RIS, Zotero libraries, datasets; voice dictation supported.
- Real failure modes are product paths: provider quota exhaustion (observed live 2026-08-26), network loss, partial runs with resume, seedless conversation launches (P0 observed and fixed).
- Competition context: Qwen/DashScope route mandated for the final live verification (deadline 2026-09-05).

## Capabilities and Constraints

Confirmed capabilities: 12-stage research pipeline with quality gates, token budget and iteration controller; evidence graph with claim↔hypothesis relations and counter-evidence loop; hypothesis tournament + scorecards; causal feedback→revision chain with version diffs; one-click reproducibility ZIP + `far verify`; study-grouped workspace (runs grouped by question); answer-first research brief; degradation alert on the default route.

Constraints (binding): no fabricated anything (progress, sources, stats, success); internal ids/jargon recede behind researcher language; execution modes always labeled; zh/en parity with domain content in its produced language; WCAG 2.2 AA target; keyboard operability.

Explicitly undecided (open): the post-tabs information architecture (this is exactly what the HX skeleton prototypes A/B must decide); whether conversation remains a first-class entry or becomes one tool among several; desktop beyond a web shell.

## Brand Commitments

Name: FAR-Lab. Voice: precise, restrained, non-marketing, states limits and uncertainty plainly (产品文案中英分别自然写作). Visual world: "精密科研仪器、研究编辑器、实验环境与高质量出版物的融合" — NOT generic AI chat aesthetics (the owner's task book bans purple gradients, sparkles-as-identity, chat-bubble ubiquity, fake-progress motion). Existing Evidence Typography + cognitive semantic colors may be kept, adjusted, or replaced only by measured readability/task-efficiency evidence.

## Evidence on Hand

- Real workspace: 85+ runs (52 completed), 2,951 model-call receipts, 9.31M tokens, 21-claim evidence sets with counter relations (live API 2026-08-26).
- §20 BEFORE metrics for 8 core tasks (`.control/HCI_EXECUTION_STATE.md`) — measured, not estimated.
- Prior-line shipped slices with browser verification (commits 3df63f5..50dcbbc) and an independent adversarial audit report (`evidence/independent-audit-2026-08-26/`).
- Offline deterministic full-journey route (keyless, ~20-30s per run) for repeatable demos.
- Competition materials: S-1 PDF (`submission/技术方案文档.pdf`), demo script (`submission/演示视频脚本.md`).
- Absences that must not be fabricated: no user acceptance drive yet; no DASHSCOPE live receipt run yet; no persona/usability-interview data.

## Product Principles

1. Truth over appearance — visible failure beats fake success; every number traceable to real objects.
2. The researcher's judgment is the product — surfaces exist to inform and accept that judgment, not to showcase the pipeline.
3. Evidence constrains everything — claims bind to sources; counter-evidence is first-class; uncertainty is displayed, never erased.
4. One product across surfaces — web/desktop/CLI/export share objects, terms, and state semantics.
5. Complexity must pay rent — every surface/component/animation answers for a real research task it speeds, clarifies, or secures.

## Accessibility & Inclusion

Target WCAG 2.2 AA; full keyboard operability of core journeys; zh/en natural-language parity; IME-safe inputs; light/dark; reduced-motion respected; color-never-the-only-encoding. [ASSUMPTION labeled: formal audit tooling not yet wired into CI — an HX gate, not a satisfied fact.]
