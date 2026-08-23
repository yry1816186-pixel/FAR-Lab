# Blind-Spot Hunt Reports (2026-08-24, 11 independent agents)

Raw findings from 11 independent blind-spot hunters against COVERAGE-TREE v0.
Each hunted in isolation (no cross-reading). Merged conclusions in
COVERAGE-TREE.md v1; this file is the evidence archive. External anchors are
hunter-reported and cited as-is; treat unverified ones as leads, not facts.

## 1. Agent-architecture view
- Indirect prompt injection (untrusted-content isolation): fulltext/Zotero/MCP
  outputs flow into prompts; no taint/spotlight/CaMeL leaf. Anchors: tldrsec/
  prompt-injection-defenses; CaMeL (DeepMind 2025). → NEW F11.
- Per-call context composition ("context compiler"): truncation, just-in-time
  retrieval, example selection, subagent handoff — own discipline beyond
  compaction. Anchors: Anthropic context engineering; haystack guide. → B1.6.
- Prompt/agent-program optimization + regression CI: GEPA (arXiv 2507.19457)
  beats RL with fewer rollouts; 30+ hand-tuned prompts ungoverned. → B6.4.
- Reasoning-effort plane: thinking budgets/interleaved thinking 2026;
  no effort routing, no reasoning-token accounting in receipts. → B7.7.
- KV-cache utilization: judge panels/rerank windows resend near-identical
  multi-KB prefixes; cache-aware layout = biggest cost lever. → C4.3.
- A2A interop: 150+ orgs, joined Agentic AI Foundation with MCP 2026-08;
  "FAR-Lab as consumable scientist agent" distinct from tool serving. → B8.3.
- Inference-time search for generation: best-of-N / verifier-guided /
  Plan Search (DeepMind 2025) — compute allocation beats prompt tweaks. → A4.7.
- Trajectory→skill synthesis: Voyager-class hardening of recurring patterns. → B3.3.
- Over-covered: E8 dictation (no decision-changing power).

## 2. Scientific-software view
- Retraction/correction monitoring: Crossref distributes Retraction Watch
  free since 2023 (Crossref already integrated here!). → A2.12.
- PRISMA 2020 flow diagram + EQUATOR checklists (CONSORT/STROBE/TRIPOD+AI)
  machine-checkable QA. → A11.1.
- External-timestamp preregistration: OSF Registries API. → A5.6.
- Study-registry mining (PROSPERO/CT.gov/OSF): novelty overlap + unpublished
  counter-evidence. → A2.13.
- Smart-citation infra: scite (~1.8e8 statements) + OpenCitations COCI
  (~4.5e8 DOI links, CC0) reopen the falsified S2AG premise. → A3.5.
- Statistical forensics (statcheck/GRIM/GRIMMER/SPRITE): deterministic
  recompute, perfect style match. → A7.2.
- CiTO/SPAR ontology alignment (41 standard relations) for interop. → A3.2/A10.3.
- Croissant/Datasheets dataset metadata + license gates. → A6.8.
- DAGitty-class causal-DAG adjustment sets + E-value sensitivity. → A5.3.
- NMA + Bayesian hierarchical synthesis (Stan-class). → A7.3.
- Over-covered: B7 provider plane (6 leaves, mostly STRONG, commodity).

## 3. Distributed-systems view (source-verified against our code)
- Cross-store transactional outbox: far.db/scheduler.db/event-spine dual
  writes non-atomic; fences protect claims not publication integrity. → C3.4.
- Poison-job DLQ + bounded redelivery: jobs.attempts increments, never
  terminates. → C5.1.
- Side-effect idempotency (operation IDs at executor boundary): fingerprint
  dedup only covers deterministic work. → C6.1.
- Remote-orphan reaper (SAGA-lite compensation) after crash/cancel. → C6.2.
- Clock discipline: Windows sleep/resume breaks wall-clock TTL leases; HLC
  for spine ordering across local+remote. TigerBeetle three-clocks anchor. → C3.5.
- Backup/restore/DR: no backup code; WAL-file-copy invalid; VACUUM INTO. → C3.6.
- Multi-process WAL contention (exe+CLI+TUI+web on same file) undocumented;
  spine retention/compaction absent. → C3.1/C3.2.
- Internal backpressure: no SSE slow-consumer policy; static caps masquerade
  as flow control. → C11.3.
- Protocol version handshake + device health. → C7.1.
- Fault-injection test category (kill mid-job, corrupt db, drop provider):
  reliability claims never executed against. → C12.1.
- Over-covered: A2.3 rerank sophistication vs 12-doc corpus.

## 4. Database/storage view (source-verified)
- SQLite operational hygiene: WAL checkpoint starvation, busy_timeout,
  VACUUM INTO backup, .recover doctrine, scheduled integrity_check. → C3.6.
- Event-log compaction/snapshotting/retention: `far gc` cleans blobs only. → C3.2.
- Object payload schema upcasting: v1-4 migrations DDL-only; 28 evolving zod
  kinds vs historical JSON rows. → C3.5.
- Lineage physical model: adjacency+recursive CTE vs closure table (+cycle
  guards) is an explicit design decision. → B4.1.
- Vector option space under zero-dep: FTS5-only / brute F32 BLOB cosine /
  sqlite-vec (violates dep gate). → B5.3.
- FTS5 tokenizer family: trigram for identifier/substring paths; ICU for zh
  (A2.11 storage-side prerequisite). → E7/A2.11.
- Structured query plane: generated columns / JSONB expression indexes on
  hot fields. → C3.7.
- Continuous storage invariant checker (dangling refs artifact↔object↔event). → A10.2.
- MinHash-LSH/SimHash zero-dep dedup (no embedding needed). → A2.8/A4.5.
- WAL silent-loss awareness: corrupted WAL checksum can drop committed txns;
  receipts≠crash-commit proof. → A10.1 caveat.
- Over-covered: F6/A10.1/C3.2 describe one store as three STRONG leaves.

## 5. ML/AI4S view
- Conformal prediction / distribution-free UQ. → A7.5.
- Dataset audit before execution (confident learning/cleanlab Datalab): ~3.4%
  label errors flip rankings; verdict ceiling = test-set quality. → A6.1.
- Execution-side benchmarks: MLE-bench / PaperBench (21% vs human 22%) /
  ScienceAgentBench / AstaBench. → A13.3.
- Ideation-execution gap (arXiv 2506.20803, Si/Hashimoto/Yang 2025): LLM ideas
  beat humans pre-execution, lose post-execution; tournament-at-ideation is a
  KNOWN failure mode. → A4.3/A12.2.
- Sequential experiment optimization: surrogate P(supports|features) +
  multi-fidelity BO (distinct from rejected hypothesis-bandits). → A6.6.
- Simulation-based inference (NPE/NLE amortized posteriors; Cranmer PNAS 2020;
  sbi package). → A6.7.
- Symbolic regression / formula discovery (PySR, AI-Feynman). → D1.3.
- Claim reproducibility-risk prediction (DARPA SCORE route). → A3.9.
- Model interpretability → mechanistic hypotheses (SHAP-class). → D9.1.
- Over-covered: A2.3 (agrees with #3).

## 6. HPC/GPU view (source-verified: devices.ts local+SSH; unpinned Dockerfile)
- Batch-scheduler adapters (SLURM sbatch/squeue/scancel) P2 demand-gated. → C7.2.
- GPU/CUDA env capture + atomic-nondeterminism policy — touches A7.1
  determinism discipline directly. → A6.5.
- Container image digest as pinned provenance artifact (Apptainer/SIF for
  HPC). → A6.3/A10.2.
- Job-array execution semantics (1 spec × N configs, per-cell status,
  partial failure, aggregate) — the execution half of A6.6. Snakemake/Nextflow
  anchors. → A6.6.
- In-job milestone checkpoint/resume (fences reclaim by full re-run). → A6.10.
- Data staging to remote target (checksum-verified presence). → C7.1.
- Compute metering (wall-time/CPU/GPU-seconds/peak RSS) per job. → F7.
- Device capability schema (GPU/VRAM/CUDA level). → C7.1.
- Anti-scope: multi-node distributed training (Ray/DDP/MPI/NCCL) — wrong
  shape for Direction-A at any foreseeable scale.

## 7. Security view (OWASP Agentic 2026 anchored)
- Tiered indirect-prompt-injection defense (ASI01/02 top risk). → F11.
- Tool-output taint tracking / IFC (FIDES arXiv 2505.23643 blocks all
  injections with policy checks on AgentDojo; CaMeL arXiv 2503.18813). → F12.
- MCP/plugin context supply-chain review: tool-description poisoning +
  rug-pull (Invariant Labs; Willison). → F8.
- Content-level exfil detection at the LLM boundary (legal exit carries
  corpus; playwright second channel). → F15.
- localhost API hardening: DNS rebinding/CSRF; Host/Origin validation +
  session token. → C9.2.
- Per-task capability tokens vs ambient credentials (SSH/MCP/remote). → F17.
- Memory/skill poisoning defense (ASI06) must co-design with B5. → B5.9.
- Adversarial security regression suite (AgentDojo/promptfoo-class). → F13.
- Audit-log tamper-evidence (hash-chain/signature). → F14.
- Approval-card anti-gaming (ASI09: misleading descriptions, fatigue). → F16.
- Over-covered: F1 sandbox — highest-frequency powers (LLM calls, playwright,
  MCP, file tools) never touch Docker sandbox; risk is cognitive-layer.

## 8. HCI/product view
- Human reading + annotation surface (highlight→claim promotion; Zotero PDF
  reader + Obsidian/Logseq anchors). → E15.
- Sensemaking / qualitative coding workspace (Taguette/NVivo-class). → E16.
- BYO-corpus import (PDF/BibTeX; Elicit precedent). → A2.14.
- Trust-calibration UX (Marusich 2025 HCI-EAS). → E17.
- Keyboard-first screening UX (Rayyan-class single-key adjudication). → A2.7.
- Hypothesis/plan compare-diff mental models (ACH grid view). → A8 UX.
- Methodology onboarding (falsifiability/GRADE/prereg teaching). → E13.1.
- Catch-up summaries for multi-hour runs (GitHub/Linear missed-activity). → E14.1.
- Dataset inspection UX (OpenRefine profiling precedent). → D3.3.
- Cite-while-you-write BibTeX/CSL round-trip to Word/Overleaf. → A2.10.
- Over-covered: E5 viz investment vs zero reading/annotation leaves.

## 9. Developer-tooling/IDE view
- Structured diff + three-way merge for domain artifacts (nbdime semantic). → A8.5.
- LSP-style domain-object intelligence (hover/references/rename). → E18.
- Debugger semantics for runs: breakpoints at stage boundaries, watch,
  rewind-edit-replay (LangGraph Studio time-travel; DAP). → B13.3.
- Lightweight WASM sandbox tier (Pyodide/QuickJS) for CodeAct. → C6.2.
- Incremental staleness propagation (make/bazel dirty bits). → C4.4.
- Session attach/detach multiplexing (tmux model). → C5.2.
- Literate computational documents (Quarto/org-babel). → A11.5.
- Hunk-level inline accept/reject review of agent edits (Cursor/Copilot
  Edits pattern). → B12.
- Reactive parameter exploration (ipywidgets/Observable). → E5.1.
- Review-comment threads on artifact versions (PR model). → A5.7.

## 10. OSS-ecosystem view (license-noted)
- fastembed (Apache-2.0, Qdrant): ONNX local embeddings inside EXISTING
  Python sidecar — unblocks near-dup/semantic-memory/corpus-cache clusters
  with zero TS deps. → A2.8/A4.5/B5.3.
- webR (MIT harness; R GPL stays behind process boundary; v0.6.0 2026-06,
  Posit-backed): metafor-class pooling via WASM. → A7.3.
- Mesa (Apache-2.0) + SimPy (MIT) + solve_ivp: A6.7/D7.1 as reviewed
  sidecar templates. 
- SymPy (BSD) + pint (MIT): D1.2 + D8.1 dimension checking.
- OpenReview openreview-py (MIT): reviewer-critique corpus for A3.5/A13.3.
- OSF API v2: external preregistration + negative-results posting. → A5.6/A12.2.
- jupyter-mcp-server (datalayer, BSD-3): D5.1 kernel bridge + B3.2 artifact host.
- Wikidata SPARQL (CC0 data): entity grounding; community MCP servers exist;
  Comunica MCP SPARQL (ESWC 2026) research-grade. → A2.15.
- Apache Jena Fuseki + Comunica (MIT): lineage storage+query; Kuzu
  ABANDONED by creators 2025-10 — avoid. → B4.1.
- repo2docker (BSD-3, JupyterHub-org): full-machine rebuildable env. → A6.5.
- Re-open: A7.3 DL pooling → metafor Hartung-Knapp/robust-variance via webR.

## 11. Frontier view (2026 H1/H2; verification status noted)
- Claude Science (Anthropic, 2026-06-30 public beta): orchestrated agents +
  60+ scientific skills/connectors; genomics/biomed literature. Competitive
  benchmark; validates skills+connectors architecture. → E19.
- Intern·Agent 1.5 (Shanghai AI Lab, 2026-02): reasoning-driven autonomous
  research; predecessor topped MLE-bench in 12h. Closest deployed analogue
  to AVO Route-A scheduling. → B2.1/A6.6.
- Intern-S1 Pro SAGE (Shanghai AI Lab, 2026-02): open trillion-param
  science-specialized base. → B7.5/A1.4.
- AER — Agent Execution Record (arXiv 2603.21692, VERIFIED): structured
  intent/observation/inference per step + versioned plans + delegation
  authority chains + SDK. Ready-made lineage schema. → B4.1/B4.2.
- Execution Lineage (arXiv 2605.06365, VERIFIED): artifact-computation DAG +
  identity-based replay; loop baselines hide state pollution, replay clean. → B4.3/C3.2.
- AutoSci (arXiv 2605.31468, VERIFIED paper; affiliations UNVERIFIED):
  memory-centric full-cycle science agent; schema-governed two-tier memory
  (SciMem) + feedback-driven evolution (SciEvolve). Strongest 2026 memory
  design reference; schema-governance (not vector-RAG) fits our
  determinism-first stance. → A12/B5.
- ResearchClawBench (arXiv 2606.07591, VERIFIED): 40 real paper-redisco tasks,
  10 domains; best agent 21.5, frontier mean 26.5; failure taxonomy
  (protocol mismatch / evidence mismatch / missing scientific core). → A13.3.
- DataPRM (arXiv 2604.24198, KDD 2026, VERIFIED): 4B process-reward model,
  ternary reward separating recoverable/fatal errors; +7.21% on
  ScienceAgentBench. Blueprint for B6.3/A8.4. 
- IGPO (OpenReview qkWP6phrvZ, UNVERIFIED — bot-blocked): information-gain
  dense reward for multi-turn agents. → B6.2.
- A2A v1.0 stable (2026-01; secondary sources only): ACP merged in; agent
  cards + task delegation. → B8.3.
- Judged overhyped: end-to-end "fully-autonomous AI scientist" narrative —
  frontier mean 26.5 with failures at protocol/evidence alignment means the
  bottleneck is verifiability, exactly Direction-A's core; do not reduce
  human-in-the-loop.
