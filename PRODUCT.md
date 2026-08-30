# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (primary) + CLI (`far`) / TUI + Tauri desktop shell; reports and export artifacts are product surfaces.

## Stack

Existing codebase answers: React 18 + Vite + TypeScript; SSE event stream over a Node HTTP API (`/api/v1`); single SQLite truth plane (far.db + append-only events/receipts + content-addressed artifacts); pinned Python experiment sidecar (lockfile-hash provenance); Tauri desktop shell. Runtime deps minimal (zod only in product Node runtime; sidecar pins numpy/scipy/sklearn/xarray/netcdf4/sympy).

## Users

Primary: working scientific researchers (Zotero-heavy, bilingual zh/en, literature-driven workflows) who need to go from a question to a falsifiable, evidence-constrained set of hypotheses, an executable research plan, and an auditable research record — across computational and non-computational work. Secondary (confirmed): competition judges (XH-202619 Track 1-A) evaluating live capability and honesty; the builder/developer running the workbench locally. [ASSUMPTION from task book, labeled: "真实科研人员愿意长期使用" is the bar the owner repeatedly set; no persona interviews have been conducted.]

## Product Purpose

FAR-Lab is an **AOSSA research operating environment — Scientific Second Brain + Research Execution + Auditable Research Record**. Success = a researcher can: pose a question and get a Scientific Problem Model with explicit method selection; see what real literature and data support/contradict; compare candidate hypotheses with uncertainty visible; execute what software can execute (tabular ML, theory identity, FEM, data-plane ML) and preregister protocols for what it cannot; correct the system's scientific decisions; and export a reproducible package another environment can verify. It must never fabricate citations, progress, certainty, execution, or verdicts.

## Positioning

Not a chatbot, not a literature search, not a dashboard: the differentiator is the closed loop `question → knowledge/data → problem model + method selection → real retrieval → claim-source binding → multi-hypothesis falsification → ranked comparison → plan → deterministic execution/protocol → mechanical verdicts → causal revision → paper/code/data/reproducible bundle → new question`, with an append-only truth plane (receipts + hash-chained events) underneath and honest execution-mode labeling (LIVE / OFFLINE / RECORDED / SYNTHETIC) everywhere.

## Operating Context

- Local-first single-workspace model (SQLite far.db); server on 127.0.0.1 (default 3196).
- Model access via protocol-agnostic routes (Zhipu GLM / DashScope-Qwen / DeepSeek / any OpenAI- or Anthropic-compatible endpoint / local endpoints / a keyless offline deterministic route for interface acceptance).
- Execution is routed deterministically by method selection: tabular → literature-pool → theory identity → FEM → protocol fallback; method families rejected at scope skip their legs with an audit note. Verdicts derive mechanically from preregistered thresholds — never LLM judgment.
- Researchers bring materials: PDFs, DOIs, BibTeX/RIS, Zotero libraries, NetCDF/CSV datasets; voice dictation supported.
- Real failure modes are product paths: provider overload/limit classification with backoff, network loss, partial runs with resume (battle-proven through multi-day 529/1302 overload cycles), honest skip with reason.
- Competition context: Qwen/DashScope route mandated for the final live verification (credential user-owned; deadline 2026-09-05).

## Capabilities and Constraints

Confirmed capabilities: Scientific Problem Model (objectives/variables with units/formalization/data inventory/statistical premises/metrics/stop conditions/unknowns register) + MethodSelection over 12 closed method families with real named validators, both formed at scope; 12-stage research pipeline with quality gates, token budget and iteration controller; evidence graph with claim↔hypothesis relations and counter-evidence loop; hypothesis tournament + scorecards + uncertainty propagation; causal feedback→revision chain with version diffs; execution plane: EEL (preregistered stats, mechanical verdicts, executed-once determinism), FEM uniform + adaptive AFEM with convergence-order verification, theory identity checks, NetCDF data plane (immutable raw + QC + derived versions with lineage, auto-serialization into experiment specs), and the protocol layer (materials/instruments/arms/randomization/QC/human-confirmation nodes/ethics gate fail-closed, append-only human-attested ledger, zero-LLM collection sheets); deterministic IMRaD paper projection including a problem-model Methods section; limitations from real counts only; one-click reproducibility ZIP with 16-check `far verify`; study-grouped workspace, answer-first brief, library aggregation, resident conversation with approval-gated actions, terminal panel, raw-data drill-down.

Constraints (binding): no fabricated anything (progress, sources, stats, success, execution); internal ids/jargon recede behind researcher language; execution modes always labeled; verdicts presented as mechanical, model output never dressed as objective fact; uncertainty and counter-evidence displayed, never erased; zh/en parity with domain content in its produced language; WCAG 2.2 AA target; keyboard operability.

Explicitly undecided (open): desktop beyond a web shell; external-product baselines (AI4Science / LLM+Web+Notebook) are BLOCKED/external, not scoped out; scenario C's real human execution is user-owned.

## Brand Commitments

Name: FAR-Lab. Voice: precise, restrained, non-marketing, states limits and uncertainty plainly (产品文案中英分别自然写作). Visual world: "精密科研仪器、研究编辑器、实验环境与高质量出版物的融合" — NOT generic AI chat aesthetics (the owner's task book bans purple gradients, sparkles-as-identity, chat-bubble ubiquity, fake-progress motion). Existing Evidence Typography + cognitive semantic colors may be kept, adjusted, or replaced only by measured readability/task-efficiency evidence. Ground truth of the built world: `DESIGN.md`.

## Evidence on Hand

- Scenario A live closed loop (2026-08-30): 2D Poisson, adaptive AFEM 10 rounds, H1~ndof slope −0.484 (optimal −0.5 band), mechanical verdict=supports, bundle verified 15/15 with 120 live receipts (`work/scenario-a`).
- Scenario B live end-to-end (2026-08-30): literature leg + NetCDF data leg bridged and pipeline-native (run_wx8dmqmb: registered datasets → sidecar training → paired MSE StatReport with 95% CI → bundle verified 16/16, 123 live receipts; `work/scenario-b*`).
- Two gold studies (`work/gold`): full 12-stage live loops through sustained provider overload, 16-17 verbatim-bound claims, competing hypotheses with falsifiers, feedback→revision, all four bundles `far verify` PASS.
- Baseline contrast on predeclared structural metrics (`work/baseline/comparison.md`): direct-LLM and in-process coding-agent conditions; honest reverse column (baseline broader via model memory and consistent with FAR-Lab measurements); external product baselines BLOCKED/external.
- Independent four-dimension audit (scientific/engineering/product/security, 2026-08-30): all Critical and Warning findings fixed (`66c25ff`, `f7d0a25`, `c178f8a`, `cb7cfaa`, `6a0a52b`, `1015218`, `98d4cb8`); audit-confirmed sandbox containment.
- Full suite 2275 passed | 4 skipped, e2e 22 passed, CI green on main (HEAD `98d4cb8`).
- Absences that must not be fabricated: no persona/usability-interview data; no DASHSCOPE live receipt run yet (ACC-02, user credential); scenario C has no real human-attested execution yet.

## Product Principles

1. Truth over appearance — visible failure beats fake success; every number traceable to real objects.
2. The researcher's judgment is the product — surfaces exist to inform and accept that judgment, not to showcase the pipeline.
3. Evidence constrains everything — claims bind to sources; counter-evidence is first-class; uncertainty is displayed, never erased.
4. Verdicts are mechanical, proposals are model-shaped — the LLM proposes inside closed schemas; deterministic code decides, and the UI shows which is which.
5. One product across surfaces — web/desktop/CLI/export share objects, terms, and state semantics.
6. Complexity must pay rent — every surface/component/animation answers for a real research task it speeds, clarifies, or secures.

## Accessibility & Inclusion

Target WCAG 2.2 AA; full keyboard operability of core journeys; zh/en natural-language parity (dict.ts single source; EN leak = e2e failure); 375px no-horizontal-overflow standing gate; axe critical/serious = 0; IME-safe inputs; light/dark; reduced-motion respected; color-never-the-only-encoding. [ASSUMPTION labeled: formal audit tooling wired into the standing e2e suite — kept green by gates, not yet a separate compliance audit.]
