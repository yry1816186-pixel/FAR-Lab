# FAR-Lab Technology Coverage Tree

Purpose: technology-space (not candidate-space) coverage. Each leaf is an
independently investigable technical problem. Statuses: `STRONG` (real
implementation + tests, KEEP unless frontier radar displaces), `PARTIAL`
(implemented with named gaps), `MISSING` (no implementation), `DESIGN`
(decision recorded, implementation pending), `REJ-TRIG` (deliberately
rejected with reversal trigger). Research-asset pointers: TC=TECH_CANDIDATES.md
(A..H), W6/W7/W8/W9=wave reports, WS=PLAN-DESIGN-RESTRUCTURE, PF=oss-porting-scan,
AVO=research/avo-nooa, HS=HARNESS_SURVEY, DOC=evidence/oss-integration.
Priorities: P0 changes core-loop capability now; P1 material, dependency-gated;
P2 marginal/long-horizon.

v0 2026-08-24 source-inventory build. **v1 2026-08-24: merged 11 independent
blind-spot hunts** (agent-arch, scientific-software, distributed, database,
ML/AI4S, HPC, security, HCI, dev-tooling, OSS-ecosystem, frontier — reports
raw in research/tech-intel/blindspot/). New/changed leaves marked
`[BS-<view>]`. Registry: `.control/TECH_INTELLIGENCE_REGISTRY.md`.

## A. Researcher Workflow

### A1 Problem formulation
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A1.1 | question → structured falsifiable scope | STRONG | scope stage; LLM refine + zod |
| A1.2 | question decomposition / sub-question tree | PARTIAL | implicit in scope+plan; no explicit decomposition artifact |
| A1.3 | answerability / feasibility pre-assessment | MISSING | no gate before retrieval spend |
| A1.4 | domain packs (field-specific methodology) | PARTIAL | deferred (EXECUTION_STATE 08-24); Intern-S1 Pro class models = candidate substrate [BS-frontier] |

### A2 Literature retrieval & corpus building
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A2.1 | query planning + mutation cascade | STRONG | W6-F2 |
| A2.2 | multi-source fusion (RRF) | STRONG | W6 |
| A2.3 | listwise LLM rerank windows | STRONG | W6-F4 (2 hunters voted OVER-covered vs 12-doc corpus — no action, sunk+used) |
| A2.4 | identifier resolution + wrong-paper guard | STRONG | verify_sources |
| A2.5 | fulltext acquisition (HTML/JATS/TEI) | STRONG | 3 routes; raw-PDF absent from core |
| A2.6 | document structured parsing (figures/tables/formulas→data) | PARTIAL | docling-mcp live (DOC) but NOT consumed in-run; no figure→vision; no table→claims |
| A2.7 | screening / active learning | STRONG | ASReview-pattern; [BS-HCI] keyboard-first screening UX missing (Rayyan-class) |
| A2.8 | near-dup detection/merge | PARTIAL | [BS-db] MinHash-LSH zero-dep option (no embedding needed — unblocks) |
| A2.9 | cross-run corpus memory (reuse past retrievals) | MISSING | every run re-retrieves |
| A2.10 | bibliography integration | PARTIAL | Zotero proxy; [BS-HCI] cite-while-you-write BibTeX/CSL export to Word/Overleaf missing |
| A2.11 | non-English literature | MISSING | EN-only APIs; FTS5 unicode61 tokenizer blocks zh corpus search too [BS-db] |
| A2.12 | retraction/correction monitoring | MISSING | [BS-scisoft] Crossref already integrated — Retraction Watch data free since 2023; corpus-trust gate feeding A3.2 |
| A2.13 | study-registry mining (PROSPERO/CT.gov/OSF) | MISSING | [BS-scisoft] novelty overlap check + unpublished counter-evidence/publication-bias signal |
| A2.14 | bring-your-own corpus import (PDF/BibTeX/user library) | MISSING | [BS-HCI] cold-start disconnect from researcher's real library |
| A2.15 | entity grounding (Wikidata-class SPARQL) | MISSING | [BS-oss] concept linking, analogy distance, cross-lingual entities |

### A3 Evidence extraction & adjudication
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A3.1 | claim/proposition extraction | STRONG | build_evidence |
| A3.2 | evidence relation vocabulary + adjudication | STRONG | 11 relations; [BS-scisoft] CiTO (41 standard subproperties) alignment absent — blocks external interop |
| A3.3 | judge calibration (panel/swap/κ) | PARTIAL | design adopted; live BLOCKED |
| A3.4 | certainty grading (GRADE) | STRONG | deterministic ladder |
| A3.5 | citation-context counter-evidence | PARTIAL | S2AG falsified; [BS-scisoft] REOPEN: scite API (1.8亿 statements) + OpenCitations COCI (CC0) are the working third-party sources |
| A3.6 | evidence-body rating / orthogonal promotion | DESIGN | WS P1; verify per-module landed |
| A3.7 | quantitative extraction (tables/figures→numbers) | MISSING | blocked on A2.6 in-run consumption |
| A3.8 | ACH diagnosticity / removal sensitivity | DESIGN | domain/ach.ts; verify depth |
| A3.9 | claim reproducibility-risk prediction | MISSING | [BS-ml] DARPA SCORE route (textual/stats features → P(replicates)) as counter-evidence prefilter |

### A4 Hypothesis generation & selection
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A4.1 | multi-strategy generation | STRONG | negative conditioning + evolution operators |
| A4.2 | novelty assessment | STRONG | SciMON facet |
| A4.3 | tournament selection | STRONG | Robin BT/ILSR; [BS-ml] ideation-execution gap (arXiv 2506.20803): ranking at ideation time is a KNOWN failure mode — needs execution-grounded feasibility signal |
| A4.4 | diversity measurement | STRONG | TF-IDF dispersion |
| A4.5 | hypothesis dedup | PARTIAL | [BS-db] MinHash-LSH unblocks sans embedding |
| A4.6 | human hypothesis co-editing | STRONG | causal revision chain |
| A4.7 | inference-time search (best-of-N / verifier-guided / Plan Search) | MISSING | [BS-agentarch] compute allocation beats prompt tweaks for diversity |

### A5 Research plan design
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A5.1 | structured preregistration | DESIGN | WS P0; verify validators |
| A5.2 | decision-rule predicate V&V | STRONG | interval V&V |
| A5.3 | power/MDE/OCCA/PB | STRONG | spec-time gates; [BS-scisoft] DAGitty-class causal-DAG adjustment-set identification + d-separation absent |
| A5.4 | causal discovery as hypothesis gen | DESIGN | adopted, sidecar-only |
| A5.5 | falsification spec generation | STRONG | critique_falsify |
| A5.6 | plan freeze/deviation audit | DESIGN | [BS-scisoft×2] OSF Registries API = external tamper-proof timestamp; Registered-Reports path |
| A5.7 | anchored review threads on artifact versions | MISSING | [BS-devtool] PR-style comment threads feeding revision loop |

### A6 Experiment execution (EEL)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A6.1 | dataset ingestion | STRONG | OpenML; [BS-ml] pre-execution dataset audit (confident learning / cleanlab-class: label errors, leakage, dupes) missing — verdict ceiling = test-set quality |
| A6.2 | local deterministic execution | STRONG | sidecar; reviewed templates |
| A6.3 | remote execution | PARTIAL | [BS-hpc] container image digest NOT captured (10-check bundle verify can't pass unpinned); Apptainer/SIF for HPC targets |
| A6.4 | durable scheduler | STRONG | far-scheduler.db |
| A6.5 | env pinning | STRONG | uv lockfile; [BS-hpc] GPU/driver/CUDA capture + atomic-nondeterminism policy when GPU templates arrive; [BS-oss] repo2docker-class full-machine rebuild |
| A6.6 | multi-experiment campaigns | MISSING | [BS-hpc] execution primitive = job arrays (1 spec × N configs, per-cell status, partial failure, aggregate); [BS-ml] sequential-experiment optimization (surrogate P(supports|hyp features) + multi-fidelity acquisition) |
| A6.7 | simulation workloads | PARTIAL | [BS-oss] Mesa/SimPy/solve_ivp as reviewed sidecar templates; [BS-ml] SBI (amortized posterior) = standard 2025+ for simulation-inference |
| A6.8 | dataset ecosystem breadth | MISSING | [BS-scisoft] Croissant 1.0 + Datasheets license/FAIR gates required before HF/Kaggle extension |
| A6.9 | live-data/online platforms | MISSING | playwright-mcp registered, unused |
| A6.10 | in-job checkpoint/resume (multi-hour) | MISSING | [BS-hpc] fences reclaim by full re-run; milestone checkpoints distinct concern |

### A7 Statistical analysis & verdicts
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A7.1 | preregistered mechanical verdict | STRONG | invariant |
| A7.2 | deterministic stats tier | STRONG | W9; [BS-scisoft] ADD statcheck/GRIM/SPRITE statistical forensics (deterministic recompute — perfect style fit) |
| A7.3 | meta-analysis pooling | STRONG-DL | [BS-scisoft+oss] REOPEN: DL+Egger weakest pooling class; webR (WASM R, MIT harness) unlocks metafor Hartung-Knapp/robust-variance without R install; NMA + Bayesian hierarchical = current standard |
| A7.4 | uncertainty reporting (VSUP) | PARTIAL | granularity-collapse debt |
| A7.5 | conformal prediction / distribution-free UQ | MISSING | [BS-ml] calibrated coverage for sklearn predictions + hypothesis probabilities |

### A8 Feedback → revision loop
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A8.1 | causal revision chain | STRONG | Revision+VersionDiff |
| A8.2 | deterministic iteration controller | STRONG | iteration.ts |
| A8.3 | prediction ledger self-calibration | STRONG | RPS settle |
| A8.4 | revision quality evaluation | PARTIAL | [BS-frontier] DataPRM (KDD 2026, ternary process reward) = blueprint for step/revision evaluators |
| A8.5 | structured diff + three-way merge for domain artifacts | MISSING | [BS-devtool] nbdime-class semantic diff; line-diff meaningless on JSON artifacts; feeds B4.3 branching |

### A9 Ranking & decision
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A9.1 | deterministic composite + tournament | STRONG | honest labels |
| A9.2 | live judge calibration | MISSING | BLOCKED-live |
| A9.3 | human preference integration | PARTIAL | promote/reject/fork; no learning from them |

### A10 Provenance & reproducibility
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A10.1 | receipts + event spine | STRONG | [BS-db] caveat: WAL-crash can silently lose committed txns — receipts≠crash-commit proof; scope claim honestly |
| A10.2 | bundle verification | STRONG | 10 checks; [BS-hpc] unpinned image breaks it (see A6.3) |
| A10.3 | SWAN JSON-LD | STRONG | [BS-scisoft] CiTO alignment needed for real interop |
| A10.4 | RO-Crate | REJ-TRIG | trigger recorded |

### A11 Research outputs
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A11.1 | IMRaD paper projection | STRONG | deterministic; [BS-scisoft] PRISMA 2020 flow diagram + EQUATOR checklists (CONSORT/STROBE/TRIPOD+AI) machine-checkable QA absent |
| A11.2 | limitations synthesis | STRONG | BP3 |
| A11.3 | report/paper reader | STRONG | HX5 |
| A11.4 | manuscript writing assistant | MISSING | one-shot projection only |
| A11.5 | literate computational documents (Quarto-class) | MISSING | [BS-devtool] narrative + cached executable code = re-runnable record |

### A12 Research memory (cross-run) → merged into Memory RU with B5
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A12.1 | cross-run finding/claim memory | MISSING | G7 |
| A12.2 | experiment-outcome memory (negative-results archive) | MISSING | [BS-ml] = carrier for ideation-execution gap fix; [BS-frontier] AutoSci SciEvolve = design template |
| A12.3 | researcher profile/preference memory | PARTIAL | conversation-grant memory only |

### A13 Science-system self-evaluation
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| A13.1 | rediscovery eval | STRONG | W9 |
| A13.2 | retrieval baseline harness | STRONG | W6 |
| A13.3 | external comparability | STRONG | MLR-Bench; [BS-frontier] ResearchClawBench (40 tasks, frontier mean 26.5) third axis; [BS-ml] EXECUTION-side benchs missing (MLE-bench/PaperBench/ScienceAgentBench/AstaBench) |
| A13.4 | counter-evidence metric | STRONG | 0.143 honest |
| A13.5 | longitudinal self-improvement tracking | MISSING | no capability trend |
| A13.6 | adversarial agent-security regression suite | MISSING | [BS-security] AgentDojo-class injection/privilege corpus run at gate changes (→F13) |

## B. Agent / Intelligence Architecture

### B1 Agent loop kernel
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B1.1 | loop discipline | STRONG | loop.ts 499L |
| B1.2 | compaction | STRONG | layered |
| B1.3 | parallel tool calls per turn | MISSING | single action per turn |
| B1.4 | streaming progressive output | MISSING | no token streaming |
| B1.5 | steering | STRONG | steer queue |
| B1.6 | context composition discipline (per-call assembly: truncation, just-in-time retrieval, example selection, handoff) | MISSING | [BS-agentarch] frontier treats as own discipline beyond passive compaction |

### B2 Long-horizon scheduling authority (AVO G1/G2)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B2.1 | agent-owned exploration scheduling | DESIGN | Route A verdict; S8 pending; [BS-frontier] Intern·Agent 1.5 (Shanghai AI Lab, reasoning-driven scheduling) = closest deployed analogue |
| B2.2 | supervisor stall/loop/drift + redirection | PARTIAL | read-only signals exist |
| B2.3 | state-dependent action selection | DESIGN | spike T3 proven, not in product |
| B2.4 | budget/round governance | STRONG | caps+budget+USD ceiling |

### B3 CodeAct exploratory layer (AVO G4)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B3.1 | sandboxed code-as-action | DESIGN | two-layer verdict; spike done |
| B3.2 | code artifacts as provenance objects | MISSING | no first-class analysis-script object |
| B3.3 | trajectory→skill synthesis | MISSING | [BS-agentarch] Voyager-class: recurring multi-step patterns (fetch+parse, counter-query) hardened into reviewed tools |

### B4 Trajectory & lineage (AVO G3/G6)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B4.1 | lineage graph model + query | MISSING | [BS-frontier] AER (arXiv 2603.21692) = ready-made schema+query face; [BS-oss] Jena Fuseki+Comunica SPARQL route (Kuzu ABANDONED 2025-10 — avoid); [BS-db] adjacency+recursive CTE vs closure-table = physical design decision |
| B4.2 | event tag-query API | MISSING | ATIF-style |
| B4.3 | branching/rollback | MISSING | [BS-frontier] Execution Lineage (arXiv 2605.06365): loop baselines hide state pollution, DAG replay zero — lineage semantics without DAG engine |
| B4.4 | trajectory observability UX | PARTIAL | narrative live; no graph view |

### B5 Memory system (AVO G7; mandatory lead: TencentDB Agent Memory)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B5.1 | working memory/compaction | STRONG | =B1.2 |
| B5.2 | episodic cross-run memory | MISSING | rollout JSONL session-local |
| B5.3 | semantic substrate (graph/vector/hybrid) | MISSING | [BS-db] option space: FTS5-only / zero-dep brute F32 cosine / sqlite-vec (violates dep gate); [BS-oss] fastembed ONNX in EXISTING Python sidecar = unlocked without new TS deps; [BS-frontier] AutoSci SciMem = schema-governed two-tier (long-term/project) design |
| B5.4 | procedural memory (skills) | STRONG | tiered |
| B5.5 | consolidation/forgetting | MISSING | AutoSci SciEvolve template; [BS-db] event-log compaction/snapshotting = storage-side prerequisite |
| B5.6 | conflict resolution across memories | MISSING | — |
| B5.7 | memory observability/debugging | MISSING | — |
| B5.8 | memory evaluation | MISSING | — |
| B5.9 | memory poisoning defense | MISSING | [BS-security] once B5 lands, injected content persists across runs (OWASP ASI06) — must co-design, not retrofit |

### B6 Evaluator family (AVO G8)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B6.1 | deterministic quality gates | STRONG | quality-gate |
| B6.2 | information-gain/uncertainty-reduction evaluators | MISSING | [BS-frontier] IGPO (info-gain dense reward) = candidate formalization (UNVERIFIED, bot-blocked) |
| B6.3 | process/step-level evaluation | PARTIAL | [BS-frontier] DataPRM = blueprint |
| B6.4 | prompt/agent-program optimization + regression CI | MISSING | [BS-agentarch] GEPA-class reflective evolution + prompt regression gates; 30+ hand-tuned prompts ungoverned |

### B7 Model routing & provider plane (2 hunters voted over-covered — no action; commodity-grade already)
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B7.1-B7.4 | failover/ledger/transport/discovery | STRONG | — |
| B7.5 | local inference | PARTIAL | [BS-frontier] Intern-S1 Pro = free science-specialized base changes default assumption |
| B7.6 | cost-aware routing | REJ-TRIG | trigger recorded |
| B7.7 | reasoning-effort plane (thinking budgets, interleaved thinking, reasoning-token accounting in receipts) | MISSING | [BS-agentarch] per-stage effort routing = cost/quality lever on EVERY LLM stage |

### B8 MCP ecosystem
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B8.1 | MCP client | STRONG | pagination+refresh fixed |
| B8.2 | MCP GET-SSE notifications | MISSING | streamable-HTTP without GET channel |
| B8.3 | FAR-Lab as server (inverse surface) | MISSING | [BS-agentarch+frontier] re-evaluate on MCP + A2A pair (A2A v1.0 stable, 150+ orgs, Agentic AI Foundation 2026-08); [BS-oss] jupyter-mcp-server precedent |

### B9 skills | STRONG · B10 subagents | STRONG · B11 plugins | PARTIAL (no signature verification — see F8) · B12 resident agent | STRONG
(B12 extension [BS-devtool]: hunk-level inline accept/reject review instead of whole-action cards)

### B13 Agent observability
| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| B13.1 | telemetry/rollouts | STRONG | crash classification |
| B13.2 | OTel semconv | REJ-TRIG | map archived |
| B13.3 | trajectory inspection (replay/step-through) | PARTIAL | [BS-devtool] debugger semantics: breakpoints at stage boundaries, watch state, rewind-edit-replay from checkpoints (LangGraph Studio time-travel precedent); [BS-oss] jupyter-mcp as artifact host |

## C. Systems Architecture

| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| C1.1 | process model | STRONG | TS + sidecars, isomorphic protocol |
| C2.1 | workflow engine (linear) | STRONG | DAG rejected w/ triggers |
| C2.2 | HITL interrupts mid-stage | PARTIAL | approvals at boundaries only |
| C3.1 | persistence core | STRONG | [BS-db+dist] WAL checkpoint starvation, multi-process (exe+CLI+TUI+web) contention policy undocumented |
| C3.2 | event sourcing | PARTIAL | [BS-db] events+step_outputs grow unbounded; `far gc` cleans blobs only; snapshotting/archive = cheap replay |
| C3.3 | multi-workspace/multi-user | MISSING | by design (desktop-first) |
| C3.4 | cross-store transactional outbox (far.db ↔ scheduler.db ↔ events) | MISSING | [BS-dist] dual-write atomicity: crash can write state but lose job/event; fences protect claims not publication integrity |
| C3.5 | clock discipline (HLC; suspend-safe TTLs) | MISSING | [BS-dist] Windows sleep/resume breaks wall-clock lease TTLs; spine spans local+remote with no causal order; + object-payload schema upcasting (28 kinds evolve; DDL-only migrations) [BS-db] |
| C3.6 | backup/restore/DR + integrity drills | MISSING | [BS-dist+db] no backup code; WAL-copy-as-backup invalid; VACUUM INTO / .recover / scheduled integrity_check |
| C3.7 | structured query plane over object store | MISSING | [BS-db] generated columns / JSONB expression indexes on hot JSON fields (scores, certainty, year) — cross-run queries without new infra |
| C4.1 | step-output cache | STRONG | fingerprints |
| C4.2 | cross-run result cache | MISSING | ties A2.9 |
| C4.3 | KV-cache-aware context layout (stable prefix/variable tail) | MISSING | [BS-agentarch] near-identical multi-KB prefixes re-sent by judge panels/rerank windows = biggest cost lever under USD ceiling |
| C4.4 | incremental staleness propagation (dirty bits make/bazel-style) | MISSING | [BS-devtool] upstream evidence changes → derived claims/plans/reports marked stale |
| C5.1 | durable queue | STRONG | [BS-dist] poison-job DLQ + bounded redelivery missing (attempts increment, never terminate) |
| C5.2 | session attach/detach (tmux model) | MISSING | [BS-devtool] long runs outlive UI process; CLI/web/desktop re-attach to live session |
| C6.1 | sandbox | STRONG | D-087; [BS-dist] remote-orphan reaper (SAGA-lite compensation) after host crash/cancel |
| C6.2 | lightweight WASM sandbox tier (Pyodide/QuickJS) | MISSING | [BS-devtool] sub-second in-process tier for CodeAct exploration — no VM provisioning |
| C7.1 | remote execution | PARTIAL | [BS-hpc] data staging to target (checksum-verified dataset presence); version handshake + device capability schema (GPU/VRAM/CUDA) |
| C7.2 | batch-scheduler adapters (SLURM-class) | MISSING | [BS-hpc] P2, demand-gated |
| C8.1 | observability | STRONG | receipts/events/narrative |
| C9.1 | HTTP API | STRONG | 2000L contract tests |
| C9.2 | API auth | PARTIAL | CORRECTED 2026-08-24: F-1 loopback guard (Host allowlist + Origin regex) already exists at api.ts:1949-1957 — source inventory had missed it; now regression-locked (tests/server-hardening.test.ts, 6 cases). Residual: session-token mechanism assessed LOW priority (Host+Origin checks block rebinding + cross-site; local malicious processes out of threat model) |
| C10.1 | desktop packaging | STRONG | exe verified |
| C11.1 | large-corpus scale | UNTESTED | caps 12 docs/run |
| C11.2 | perf regression gates | PARTIAL | ad hoc |
| C11.3 | internal backpressure (SSE slow consumers, inter-stage buffers) | MISSING | [BS-dist] static caps masquerade as flow control |
| C12.1 | fault-injection test category (kill worker mid-job, corrupt db, drop provider) | MISSING | [BS-dist] lease/fence/reclaim claimed STRONG but never executed against; W8 harness covers subtask redo only |

## D. Scientific Computing

| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| D1.1 | deterministic stats engine | STRONG | W9 |
| D1.2 | symbolic computation | MISSING | [BS-oss] SymPy (BSD) sidecar; pairs with pint → closes D8.1 dimension checking |
| D1.3 | symbolic regression / formula discovery | MISSING | [BS-ml] PySR-class: experiment data → closed-form transferable hypotheses feeding A4 generation |
| D2.1 | experiment tracking | STRONG | far.db + scheduler |
| D3.1 | dataset ecosystem breadth | MISSING | =A6.8, Croissant-gated |
| D3.2 | local dataset versioning | PARTIAL | immutable records, no diffing |
| D3.3 | dataset inspection UX (profile/missing-values/clean preview before execution) | MISSING | [BS-HCI] researchers refuse unaudited data |
| D4.1 | ML template breadth | PARTIAL | sklearn whitelist |
| D5.1 | notebook integration | MISSING | [BS-oss] jupyter-mcp-server (datalayer, BSD-3) solves directly |
| D6.1 | provenance interop | REJ-TRIG | — |
| D7.1 | simulation runtimes | MISSING | =A6.7 Mesa/SimPy/ODE |
| D8.1 | unit/dimension checking | MISSING | pint route |
| D9.1 | model interpretability → mechanistic hypotheses (SHAP/PDP-class attribations as revision input) | MISSING | [BS-ml] "experiment→mechanism" missing link for Direction-A |

## E. Product / Human Research Environment

| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| E1 web · E2 CLI · E3 TUI · E4 desktop · E5 viz · E6 conversation · E7 palette+FTS5 · E8 dictation · E9 export · E12 steering · E13 onboarding · E14 progressive disclosure | STRONG | — |
| E10 accessibility | PARTIAL | axe informal |
| E11 collaboration | MISSING | single-user by design |
| E5.1 reactive parameter exploration (slider→recompute) | MISSING | [BS-devtool] static charts |
| E13.1 methodology onboarding (falsifiability/GADE/prereg teaching moments) | MISSING | [BS-HCI] distinct from UI onboarding |
| E14.1 catch-up summaries ("what happened while away") | MISSING | [BS-HCI] multi-hour runs need missed-activity digests |
| E15 human reading + annotation surface (highlight→claim promotion) | MISSING | [BS-HCI] researchers' most frequent act has no first-class object |
| E16 sensemaking / qualitative coding workspace | MISSING | [BS-HCI] tagging/affinity-grouping between extraction and hypotheses; loop biased quantitative |
| E17 trust-calibration UX (confidence sourcing, when-not-to-trust prompts, over/under-reliance mitigation) | MISSING | [BS-HCI] probabilistic verdicts + approval cards demand it |
| E18 LSP-style domain-object intelligence (hover/go-to-def/find-refs/rename across claims/hypotheses/runs) | MISSING | [BS-devtool] palette is name-lookup only |
| E19 competitive landscape watch (Claude Science beta 2026-06-30: skills+connectors workbench) | MISSING | [BS-frontier] defines the product benchmark |

## F. Security / Governance

| Leaf | Problem | Status | Current / evidence |
|---|---|---|---|
| F1 sandbox · F2 permissions · F3 secrets · F4 supply chain · F5 egress · F6 audit spine · F7 resource limits | STRONG | infra layer solid (F1 judged over-covered by security hunter: highest-frequency powers — LLM calls, playwright, MCP, file tools — never touch the Docker sandbox; the risk lives in the cognitive layer) |
| F8 plugin trust/signatures | MISSING | + [BS-security] tool-description poisoning + rug-pull review (Invariant-class), MCP supply-chain审查 |
| F9 data privacy | PARTIAL | — |
| F10 SBOM/dependency scanning | PARTIAL | manual gates |
| F11 indirect prompt-injection defense tiers | MISSING | [BS-security+agentarch, independent] untrusted fulltext/Zotero/MCP-output flows directly into tool-calling LLM context; OWASP Agentic ASI01/02 #1 risk; CaMeL/FIDES design references |
| F12 tool-output taint tracking / IFC | MISSING | [BS-security] poisoned tool results persist into evidence/claim DB and inherit scientific authority |
| F13 adversarial security regression suite | MISSING | [BS-security] = A13.6; promptfoo/AgentDojo-class red-team at gate changes |
| F14 audit-log tamper-evidence (hash-chain/signature) | MISSING | [BS-security] append-only is app promise not cryptographic; provenance product's foundation |
| F15 exfil detection at LLM boundary (content-level DLP, canary tokens; playwright second channel) | MISSING | [BS-security] egress allowlist can't see the model-call exit |
| F16 approval-card anti-gaming (misleading descriptions, approval fatigue) | MISSING | [BS-security] ASI09; human-oversight integrity is itself attacked |
| F17 per-task capability tokens (vs ambient credentials for SSH/MCP/remote) | MISSING | [BS-security] |

## v1 leaf math & Research Unit clustering

~175 leaves. STRONG ~85 / PARTIAL ~28 / DESIGN ~11 / MISSING ~46 / REJ-TRIG ~8.
MISSING clusters → Research Units (registry IDs), priority-ordered:

| RU | Theme | Leaves | Priority / status (2026-08-24 P1 wave) |
|---|---|---|---|
| RU-1 MEMORY | Cross-run research memory substrate | A12.*, B5.2-3, B5.5-9 | P0 — INTEGRATED (see registry; TencentDB LICENSE question closed 08-24) |
| RU-2 LINEAGE | Trajectory graph + event query + branching | B4.*, C3.7, A8.5 | P0 — INTEGRATED storage; fork writer + PROV-O landed |
| RU-3 COGSEC | Cognitive-layer agent security | F11-F17, A13.6, B5.9, C9.2 | P0 — T0-T6 INTEGRATED |
| RU-4 SCHED | Scheduling authority + supervisor + CodeAct | B2.*, B3.*, C6.2 | P0 — DESIGN Route A (AVO lane) |
| RU-5 QUANT | Quantitative evidence pipeline | A2.6, A3.7, A7.2+, D1.3, D9.1 | P1 — SHORTLISTED (packet RU5) |
| RU-6 SCISOFT | Scientific-software methodology pack | A2.12-13, A3.5 reopen, A5.6 OSF, A7.3 webR/NMA, A11.1 PRISMA, CiTO | P1 — GO1/2/4 LANDED; GO3 queued |
| RU-7 STORAGE | Storage/reliability hardening | C3.4-6, C5.1, C11.3, C12.1 | P1 — backup/DLQ/clock LANDED (86f12b2); packet RU7 covers residual outbox/backpressure/fault-matrix |
| RU-8 CAMPAIGN | Multi-experiment + dataset audit + arrays + checkpoints | A6.1 audit, A6.6, A6.10, A7.5 conformal | P1 — SHORTLISTED (packet RU8) |
| RU-9 CTXENG | Context composition + effort plane + KV-cache + prompt CI | B1.6, B6.4, B7.7, C4.3 | P1 — SHORTLISTED (packet RU9) |
| RU-10 CORPUS | BYO-corpus + dedup + cross-run cache + multilingual + entity grounding | A2.8-9, A2.11, A2.14-15 | P1 — SHORTLISTED (packet RU10; trigram zh route probe-proven) |
| RU-11 HCI-RESEARCHER | Reading/annotation/sensemaking/trust-calibration/screening UX | E15-E17, A2.7 UX, E13.1, E14.1, D3.3 | P1 — PROPOSAL READY, user-gated (packet RU11) |
| RU-12 TOOLING | Debugger semantics + diff/merge + literate docs + session attach | A8.5 UX, B13.3, C5.2, A11.5 | P2 — SHORTLISTED (packet RU12) |
| RU-13 SURFACE | Inverse MCP/A2A + SSE notifications + competitive watch | B8.2-3, E19 | P2 — SHORTLISTED (packet RU13; spec read) |
| RU-14 EVAL-EXEC | Execution-side benchmarks + process evaluators + info-gain | A13.3+, B6.2-3, A8.4 | P1 — SHORTLISTED (packet RU14; RCB verified) |
| RU-15 SEARCH-TIME | Inference-time search for generation | A4.7 | P2 — SHORTLISTED (packet RU15) |
