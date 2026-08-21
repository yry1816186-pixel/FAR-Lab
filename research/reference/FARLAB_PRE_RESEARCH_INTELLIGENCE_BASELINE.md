# FAR-Lab Pre-Research Intelligence Baseline

**RESEARCH_AS_OF_DATE:** `2026-08-20`
**DOCUMENT TYPE:** `PRE-RESEARCH DECISION INTELLIGENCE`
**AUTHORITY:** Non-authoritative baseline; current evidence and future problem-specific investigation outrank this document.
**CORPUS SCOPE:** 16 top-level supplied files/containers recursively expanded to 551 source occurrences, 369 unique byte contents and 470 normalized entities.
**EVIDENCE CEILING:** No named external candidate was executed or benchmarked in this consolidation. Ten local synthetic contract/numerical models were executed and are explicitly not product, cluster, GPU, browser, quantum or laboratory validation.

> **Future Builder Contract:** This document expands the search space; it does not replace fresh investigation. A Tier S/A record is a research priority, not adoption authority.

---

## 0. Document Contract

### Purpose

This baseline gives future FAR-Lab engineering Agents a normalized, high-density map of relevant systems, projects, standards, architecture families, reusable primitives, performance techniques, engineering practices, failure lessons, scientific infrastructure, product/HCI patterns, emerging directions and unresolved research gaps. It is designed to improve the starting search space and expose decision-relevant alternatives before implementation work begins.

### What this document is not

It is not a final architecture, technology selection, requirement specification, implementation manual, procurement decision, legal opinion, benchmark result or proof that any project should be adopted. It does not authorize copying code, changing FAR-Lab, or delegating scientific judgment to an AI system.

### Truth and provenance vocabulary

| LABEL | MEANING |
| --- | --- |
| RAW CORPUS CLAIM | A statement preserved from an uploaded AI-generated report or registry. It is a discovery lead, not authority. |
| WEB / PRIMARY-SOURCE VERIFIED FACT | A fact checked against an official repository, specification, documentation, release, paper or standards source as of the research date. |
| INFERENCE | A conclusion derived from multiple facts or architecture comparisons; it must remain distinguishable from those facts. |
| RECOMMENDATION / HYPOTHESIS | A preliminary FAR-Lab direction that requires problem-specific execution and evidence. |
| UNKNOWN / UNVERIFIED / STALE / CONFLICTING_EVIDENCE | An explicit limit. Missing facts are not filled from model memory. |

### Evidence levels

`RAW_LEAD → IDENTITY_VERIFIED → OFFICIAL_DOCS_INSPECTED → ARCHITECTURE_INSPECTED → SOURCE_INSPECTED → ISSUES_INSPECTED / PAPER_INSPECTED → EXECUTED → BENCHMARKED`. Evidence labels describe work actually performed. They do not describe project quality.

### Candidate verification funnel

| LEVEL | MINIMUM WORK | USE IN THIS BASELINE |
| --- | --- | --- |
| Level 0 — Lead | Corpus mention only. | Preserve terminology and candidate identity without trusting claims. |
| Level 1 — Identity verified | Authoritative repository/site, purpose, maintainer, license and maintenance signal where available. | Minimum for meaningful current landscape placement. |
| Level 2 — Architecture verified | Official docs, architecture, APIs, extension model and relevant source structure. | Required for architecture-changing comparison. |
| Level 3 — Ecosystem / failure inspected | Issues, releases, limitations, security, migration and production evidence. | Expected for consequential Tier S/A claims where accessible. |
| Level 4 — Execution evidence | Clone/install/run/inspect/benchmark or integration proof on a relevant workload. | Not reached for named external candidates in this consolidation; remains a Builder obligation. |

### Legal / IP rule

Only legitimate public repositories, specifications, documentation, papers, SDKs, issue trackers and observable behavior support the verified core. Unauthorized leaked/private implementation claims are quarantined. Source availability is not equivalent to an OSI-approved license, and exact component/deployment licensing must be rechecked before copying, vendoring, forking, hosting or distributing code.

### Anti-anchoring and staleness

All versions, maintenance signals, licenses, ecosystem momentum and protocol states are time-sensitive after `2026-08-20`. Future Agents must be free to reverse these rankings, discover missed systems or choose a new architecture family. This baseline is a head start, not a cage.

### Decision invariant

> **One invariant has one authoritative owner.** Projections, caches, indexes, traces, notebooks, agent memories and protocol sessions may improve speed or interaction, but they must not silently become competing truth owners.

## 1. Corpus Audit

### Ingestion completeness gate

| MEASURE | COUNT | INTERPRETATION |
| --- | --- | --- |
| Top-level files/containers supplied | 16 | Every visible attachment was opened or recursively expanded. |
| TOTAL SOURCES PROVIDED after recursive expansion | 551 | Every archive member and top-level artifact is a ledger occurrence. |
| Unique byte contents | 369 | Package copies with the same SHA-256 are not independent evidence. |
| TOTAL SOURCES INGESTED | 329 | Readable unique narrative, registry, source or experiment artifacts. |
| TOTAL PARTIALLY READABLE | 40 | Generated/binary technical artifacts such as executables, bytecode or Git internals; metadata/hashes recorded. |
| TOTAL UNREADABLE / CORRUPTED / UNAVAILABLE | 0 | No supplied research narrative or registry was lost to corruption/unavailability. |
| TOTAL DUPLICATE SOURCES | 182 | Duplicate package copies retained in the ledger but not counted as independent evidence. |
| EMPTY | 0 | No empty source occurrence. |
| Normalized canonical entities | 470 | Aliases and duplicate records merged; source provenance retained. |
| Quarantined malformed candidate rows | 3 | Preserved in Section 28; not promoted into canonical tiers. |

The 40 `PARTIALLY_READABLE` occurrences are non-narrative generated/binary artifacts inside preservation packages, not unreadable research reports. Their existence and hashes are recorded, but they were not treated as prose intelligence. The 182 duplicate occurrences mostly arise from nested preservation/download packages; they increase provenance coverage, not claim confidence.

### Top-level supplied source inventory

| SOURCE_ID | FILENAME | STATE | BYTES | TOPIC | CANDIDATE COUNT | EVIDENCE QUALITY | DUPLICATE OF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RAW-0001 | 111(1).md | INGESTED | 82478 | data / knowledge / provenance | 20 | RAW_NARRATIVE | UNKNOWN |
| RAW-0002 | 222(1).md | INGESTED | 11750 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0003 | FAR-Lab Autonomous Rebuild Mission Constitution — FINAL.md | INGESTED | 23954 | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0004 | FAR-Lab_Batch-002-Candidate-Registry(1).csv | INGESTED | 32007 | candidate/entity registry | 104 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0005 | FAR-Lab_Batch-002-Continuation-State(1).json | INGESTED | 116879 | mixed / unclassified technical research artifact | 104 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0006 | FAR-Lab_Batch-002_Research-Package(1).zip | INGESTED | 110492 | data / search / provenance / knowledge | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0007 | FAR-Lab_Download-Repair_2026-08-20(1).zip | INGESTED | 4619869 | package / manifest / repair | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0008 | FAR-Lab_Download-Repair_2026-08-20_README(1).md | INGESTED | 1297 | package / manifest / repair | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0009 | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20 (1).md | DUPLICATE_SOURCE | 64892 | architecture-family registry | 72 | RAW_NARRATIVE | RAW-0011 |
| RAW-0010 | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20(1).json | INGESTED | 171140 | architecture-family registry | 72 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0011 | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20(1).md | INGESTED | 64892 | architecture-family registry | 72 | RAW_NARRATIVE | UNKNOWN |
| RAW-0012 | FAR-Lab_RU-001-004_Batch-002_Durable-Coding-Provenance-Search(1).md | INGESTED | 89375 | data / search / knowledge / provenance | 68 | RAW_NARRATIVE | UNKNOWN |
| RAW-0013 | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials(1).csv | INGESTED | 113065 | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0014 | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity(1).md | INGESTED | 64495 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | UNKNOWN |
| RAW-0015 | deepseek_chat_FAR-Lab_20260820(1).json | INGESTED | 605791 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0016 | deepseek_chat_FAR-Lab_20260820.md | INGESTED | 585996 | durable execution / effects / recovery | 74 | RAW_NARRATIVE | UNKNOWN |

### Corpus authority assessment

* Strongest raw assets: machine-readable final registries, complete architecture/primitive/failure/performance/white-space tables, current source registries, synthetic experiment outputs and deeply sourced Batch 002 research units.
* Weakest raw assets: duplicated AI reports, early rapid-search narratives, records with missing URLs/licenses, malformed candidate names and claims promoted above their actual evidence.
* Evidence duplication rule: five AI reports repeating a claim remain one family of raw leads unless independent external sources support it.
* Execution ceiling: local models were executed; external candidates were not cloned/run/benchmarked as part of this consolidation. Any corpus record claiming otherwise was not promoted.

The complete 551-row Corpus Ingestion Ledger appears in Section 31, including source ID, filename, producer/date when available, topic, readability, candidate count, evidence quality, duplicate linkage and major claims.

## 2. Global Technology Map

### Normalized authority-plane map

| PLANE | CONTENT | AUTHORITY RULE |
| --- | --- | --- |
| Scientific validity plane | Claims, measurements, hypotheses, assumptions, units, uncertainty, diagnostics, peer/human review and publication gates. | Authoritative for whether a result is scientifically admissible; no agent/runtime may bypass it. |
| Evidence/provenance plane | Immutable artifacts, assertions, derivations, environment identities, attestations and research packages. | Authoritative for what was observed/produced and why; not a substitute for validity. |
| Durable control plane | Runs, plans, timers, approvals, retries, leases and deterministic/memoized control history. | Authoritative for logical progress; must not own external-world truth. |
| Effect plane | Intents, attempts, final authorization, fencing, endpoint receipt/inquiry, unknown state, compensation and quiescence. | Authoritative for interaction with mutable external systems. |
| Resource/execution plane | Local processes, containers, Wasm, microVMs, GPUs, HPC, browsers, robots and instruments. | Replaceable executors; snapshots are recovery caches, not scientific truth. |
| Interaction/collaboration plane | Workbench, notebooks, editor protocols, CRDT drafts, comments, review and visualization. | Projects canonical state; drafts become authoritative only through validated publication. |

### Canonical object model — preliminary

| OBJECT | MINIMUM SEMANTICS | NOT EQUIVALENT TO |
| --- | --- | --- |
| ResearchRun | Mission identity, plan revision, owner, status, budgets, policy basis and durable control reference. | Chat session, worker process or UI tab. |
| Intent | Typed proposed action with inputs, target, delegated authority, generation and idempotency identity. | A prompt or log message. |
| EffectAttempt / Receipt / UnknownEffect | External commit attempt, endpoint identity, acknowledgement/query result and reconciliation state. | Workflow completion or retry count. |
| Artifact / ArtifactManifest | Immutable bytes or structured object identified by digest, media/schema and storage locations. | A mutable path or database row alone. |
| Entity | Long-lived logical identity such as paper, person, dataset, instrument, sample or software project. | One artifact version. |
| Proposition | A claim that can be discussed without being accepted as true. | An asserted fact. |
| Assertion / EvidenceAssertion | A sourced, time/context-qualified support, contradiction, observation or assessment of a proposition. | A graph edge with one confidence number. |
| Measurement | Value plus quantity kind, unit, reference frame, conditions, calibration and uncertainty. | A bare numeric scalar. |
| Activity / Derivation | Method/process execution and dependency relationship that produced an artifact/assertion. | An operational trace alone. |
| ValidityAssessment | Method-specific diagnostics, assumptions, reviewer/agent identity, decision and rationale. | Signature, DOI, benchmark or successful execution. |
| EnvironmentIdentity | Pinned software/toolchain/container/derivation and hardware-relevant context. | A package name or “latest” tag. |
| ResourceBinding / RecoveryContract | Executor, capabilities, checkpoint/replay/abort semantics and current ownership generation. | A process ID or lease alone. |
| PublicationEnvelope | Closed research object with claims, artifacts, evidence, environment, signatures, licenses and validity gates. | A rendered PDF. |

### Domain hierarchy

| DOMAIN | SUBDOMAINS / CAPABILITIES | REPRESENTATIVE ARCHITECTURE FAMILIES |
| --- | --- | --- |
| Scientific validity | Measurement, statistics, causal inference, DOE, uncertainty, review, publication | Typed measurement objects; diagnostic gates; causal assumption graphs; adaptive-design controller; research package. |
| Control and effects | Durability, retries, cancellation, ownership, external actions, reconciliation | Event-history replay; SQL durable workflows; intent/effect ledger; fencing; status inquiry. |
| Evidence and knowledge | Artifacts, assertions, provenance, corrections, search, scholarly graphs | CAS; bitemporal assertions; PROV/RO-Crate; hybrid retrieval; provenance algebra. |
| Execution and compute | Local, sandbox, GPU, HPC, browser, robots/instruments | Wasm components; microVM; typed IR lowering; hierarchical scheduler; command protocols. |
| Product and collaboration | Workbench, notebook, editor, review, visualization, publishing | Reactive notebook; protocol-separated agent workbench; CRDT draft; transactional publication. |
| Security and reliability | Identity, authorization, supply chain, isolation, audit, formal verification | SPIFFE; policy/ReBAC; attestations; verification ladder; deterministic simulation. |

### Popularity, recency and legacy bias correction

| LANDSCAPE ROLE | REPRESENTATIVE SYSTEMS / PATTERNS | WHY RETAINED |
| --- | --- | --- |
| Production leaders | Temporal, Apache Arrow, Bazel, Slurm, PETSc, JupyterLab, OpenTelemetry | Mature systems with production/engineering depth; still require FAR-specific proof. |
| Strong challengers | DBOS, SGLang, marimo, TensorStore, Cedar, Flux | Compelling architecture or lower operational burden; younger or more specialized evidence. |
| Research frontier | Faraday/Replica, FAR, FAROS, AI Scientist families, confidential science, quantum/classical IR | May change architecture or product strategy; not presented as current requirements. |
| Architectural classics | Erlang/OTP supervision, event sourcing, build graphs, HDF5, MPI, database transactions | Older ideas remain relevant even when direct adoption is inappropriate. |
| Hidden gems | AiiDA, provenance semirings, Salsa/DICE, QUDT/UCUM, Flux, Catalyst | High transfer value despite lower AI-framework visibility. |
| Useful negative examples | Kuzu maintenance loss; CRDT-as-truth; snapshot-as-recovery; HDF5-as-database; telemetry-as-evidence | Failures and category errors define stronger platform boundaries. |

## 3. Coverage & Gap Matrix

Coverage is qualitative and depth-based. `DEEP` means meaningful candidate diversity, architecture/failure analysis and evidence; it does not mean implementation selection or global exhaustiveness. Targeted gap repair eliminated any strategically important `MISSING` category, but several domains remain `SHALLOW` or `LEAD_ONLY` because real-world evidence is unavailable or discipline-specific.

| DOMAIN | SCOPE | STATE | EVIDENCE BASIS | RESIDUAL GAP | GAP REPAIR PERFORMED | SATURATION JUDGMENT |
| --- | --- | --- | --- | --- | --- | --- |
| Durable control, workflow recovery and external effects | Event-history replay; SQL durability; cancellation; leases/fencing; idempotency; unknown outcomes; compensation; process/browser/GPU continuity. | DEEP | Multiple architecture families, source/issue inspection, 700-trial and 4,000-trial synthetic fault models. | Production A/B/C execution and real sink/instrument adapters. | Temporal/DBOS/Restate plus effect-ledger, process-checkpoint and command-protocol searches. | Architecture/failure-contract families converged; benchmark saturation not reached. |
| Scientific evidence, provenance and reproducibility | W3C PROV, AiiDA, RO-Crate, OpenLineage, attestations, CAS, environment identity, research packaging, query provenance. | DEEP | Large candidate/family coverage and standards inspection; evidence-envelope synthesis. | Integrated FAR profile, redaction/privacy, long-horizon schema evolution and independent reproduction. | Added semiring/query provenance, bitemporal assertions, cryptographic/package layer separation. | Decision-relevant architecture families represented. |
| Search, scholarly graphs, retrieval and evidence synthesis | Lexical, sparse, dense, late-interaction, graph, code and scholarly retrieval; reranking; systematic-review screening. | DEEP | Lucene/Tantivy/Vespa/Quickwit/Zoekt, multi-source scholarly graphs and retrieval benchmarks/protocols. | FAR corpora quality-cost frontier, recall audits, license-aware field-level merge. | Expanded beyond vector DBs into multi-stage retrieval, source disagreement and review stopping. | Architecture families converged; workload measurements remain open. |
| Data truth, databases, artifacts and scientific arrays | Transactional control, bitemporal assertions, immutable CAS, versioned data, columnar interchange, arrays, indexes and projections. | DEEP | FoundationDB/XTDB/Postgres families, Arrow, Zarr, TensorStore, object stores and version-control systems. | Physical-store benchmark, schema migration, archival policy and cross-store failure drills. | Rejected universal-database framing; added logical truth model, arrays and bitemporal assertions. | Logical families represented; physical backend choice deliberately unsaturated. |
| Compiler, build, typed IR and incremental computation | MLIR, Bazel/Skyframe/REAPI, Salsa/DICE, Differential Dataflow, hermetic actions and dependency invalidation. | DEEP | Cross-domain architecture inspection plus synthetic publication-drift model. | A FAR research IR prototype and from-scratch equivalence tests under dynamic dependencies. | Added mature build/compiler systems and negative evidence about undeclared dependencies/cache poisoning. | Major architecture families represented. |
| HPC, numerical computing, resource management and data movement | Slurm/Flux, MPI/UCX/libfabric, PETSc/Kokkos/Trilinos, Arrow/Flight, array stores, checkpointing and locality. | DEEP | Broad systems/numerics coverage, mature reference systems and failure/performance registries. | Real cluster benchmark, multi-tenant fairness, GPU topology and elastic failure tests. | Expanded beyond Ray/GPU orchestration into classic HPC and solver ecosystems. | Architecture families strong; deployment evidence workload-specific. |
| Security, isolation, workload identity and authorization | Wasm capability tier, microVM/container isolation, SPIFFE/SPIRE, OPA/Cedar, ReBAC, signatures, confidential compute. | DEEP | Multiple mature families, advisories/failure evidence, synthetic revocation model. | End-to-end enforcement proof, egress/secret policy, multi-tenant threat model and patch gates. | Separated sandbox, identity, policy, relationship authorization and supply-chain trust. | Family-level saturation; FAR integration proof absent. |
| Reliability, observability, deterministic simulation and formal verification | Audit vs telemetry, OpenTelemetry, replay, TLA+/TLC/Apalache, property/differential tests, chaos and deterministic simulation. | DEEP | Failure archaeology, formal-method references and several executed synthetic models. | Implementation-model conformance, production traces and adversarial long-duration testing. | Added verification ladder and rejected telemetry-as-audit. | Decision-relevant ladder represented. |
| Agent and coding runtimes | Thin agent kernels, coding agents, context planes, tool protocols, durable harnesses, approvals and semantic editing. | MODERATE | Substantial corpus plus current harness verification; many young projects and heterogeneous claims. | Comparative real repository tasks, security/context freshness, long-horizon drift and cost. | Separated agent planner from durability/provenance/security and downgraded unverified harness hype. | Major patterns represented; product/workload evidence not saturated. |
| Model serving, GPU kernels and inference economics | vLLM/SGLang/TGI, continuous batching, paged KV, prefix cache, disaggregation, Triton/CUTLASS and routing. | MODERATE | Multiple source-inspected engines, failure reports and performance techniques. | Current hardware/model benchmarks, correctness under cache/parallelism, energy/cost and portability. | Added classic kernels, distributed inference and cache failure intelligence. | Architecture families represented; rapidly changing benchmark frontier. |
| Statistics, Bayesian inference, uncertainty and diagnostics | Stan/PyMC/ArviZ, simulation-based inference, calibration, posterior predictive checks and error propagation. | MODERATE | Mature method ecosystems and synthetic sequential-peeking/units models. | Domain validation profiles, missing-data/model criticism, multiplicity and expert review UX. | Added diagnostics and metrology rather than treating execution as validity. | Core families represented; discipline-specific methodology remains open. |
| Causal inference, experimental design and optimization | DoWhy/EconML, causal discovery, DOE, BoTorch/Ax/Optuna, active learning, safe optimization and stopping. | MODERATE | Representative mature systems and methodological literature. | Assumption elicitation, transportability, interference, adaptive-inference corrections and safe real experiments. | Added causal validation and sequential-design failure modes. | Core method families represented; domain validation open. |
| Notebooks, IDEs, research workbenches and publishing | JupyterLab, marimo, Theia, LSP/DAP/ACP, Quarto, reactive views, debugging and extension UX. | MODERATE | Mature shells/protocols plus reactive/incremental systems. | Researcher workflow studies, claim/evidence review UX, recovery UX and accessibility. | Added product/HCI as scientific capability rather than decoration. | Architecture families represented; user evidence shallow. |
| Local-first collaboration, review and version control | Automerge/Yjs, branches/diffs, review comments, offline state, ReBAC and transactional publication. | MODERATE | CRDT/versioning families and 4,000-trial invariant model. | Long-lived document scale, semantic merge, offline revocation, review governance and human factors. | Separated collaborative drafts from authoritative scientific truth. | Primitive families represented; product validation open. |
| Protocols, extensions, schemas and interoperability | MCP, ACP, AG-UI/MCP Apps, A2A, WASI Component Model/WIT, LSP/DAP, SKG-IF and domain schemas. | MODERATE | Current specs and multiple protocol families. | Version negotiation, conformance suites, downgrade/identity security and governance. | Rejected one-universal-protocol model; separated tool, workbench, UI and federation boundaries. | Major protocol roles represented; ecosystem remains fast-moving. |
| Scientific workflows and domain platforms | AiiDA, Galaxy, Nextflow, Snakemake, CWL/WDL, domain-specific workflow/data systems and remote execution. | MODERATE | Broad mature system coverage across computational science. | Cross-domain abstraction limits, interactive/physical workflows and migration/archival tests. | Preserved domain specialization instead of forcing one workflow DSL. | Representative families present; domain-by-domain depth uneven. |
| Autonomous science and research-agent systems | AI Scientist families, Coscientist, FAROS, Faraday/Replica, literature-to-review cascades and evaluation. | MODERATE | Papers/systems inspected, but much evidence is benchmark- or vendor-reported. | Independent reproduction, scientific validity, novelty auditing, long-term cost and human governance. | Separated frontier agents from production engineering and retained them as Watch where appropriate. | Representative frontier patterns present; empirical replication absent. |
| Laboratory automation, instrument control and robotics | Bluesky/Ophyd, SiLA, OPC UA, PyLabRobot, Opentrons, ROS2/MoveIt, command receipts and safety interlocks. | SHALLOW | Standards/source inspection and architecture transfer; no real hardware execution. | Hardware-in-loop faults, calibration, sample identity, interlocks, emergency stop, regulatory/warranty constraints. | Targeted cyber-physical search added device/command/reconciliation primitives. | Software families represented; physical-world evidence blocked. |
| Metrology, units, calibration and measurement uncertainty | QUDT, UCUM, quantity kinds, coordinate/reference frames, calibration lineage and uncertainty budgets. | MODERATE | Official ontology/spec inspection and synthetic unit-error model. | Domain profiles, calibration certificate interchange, correlated uncertainty and instrument integration. | Added a distinct scientific truth/metrology plane. | Core semantic families present; operational integration open. |
| Scientific visualization and large-data interaction | ParaView/Catalyst, WebGPU, progressive/remote/in-situ visualization, provenance-linked figures and uncertainty display. | MODERATE | Mature scientific visualization references and emerging browser GPU standard. | Perceptual validity, uncertainty/HCI studies, large remote datasets and accessible collaboration. | Added in-situ/remote architecture and figure provenance. | System families represented; user-study evidence shallow. |
| Cloud, edge, networking, messaging and deployment | NATS/Kafka-class messaging, object storage, Kubernetes, gRPC/Arrow Flight, edge/offline execution and cost controls. | MODERATE | Broad distributed-systems references and failure records. | FAR topology, network partition policy, multi-region sovereignty, cost/latency benchmark and disaster recovery. | Connected infrastructure to explicit authority and evidence boundaries. | Families represented; target deployment unknown. |
| Privacy, sovereign data and confidential science | Federated analytics, data spaces, confidential containers/attestation, access policy and privacy-preserving projections. | LEAD_ONLY | Standards/frontier signals but limited integrated scientific implementation evidence. | Threat models, privacy accounting, federated validity, attestation trust roots and legal governance. | Targeted future/contrarian search added compute-to-data and confidential execution. | Not locally saturated; preserved as strategic frontier. |
| Energy, carbon, capacity and scientific portfolio optimization | Carbon-aware scheduling, accelerator utilization, budgets, queueing and portfolio/value-of-information allocation. | SHALLOW | One 3,000-scenario synthetic model plus adjacent scheduling/optimization systems. | Real telemetry, embodied/operational carbon, deadline/service constraints and scientific value functions. | Added sustainability/capacity governance beyond raw cloud cost. | Architecture leads present; empirical evidence sparse. |
| Browser-native and executable publication computing | Pyodide/WebAssembly/WebGPU, browser sandboxes, reproducible capsules, interactive papers and offline execution. | LEAD_ONLY | Emerging standards and isolated systems; few robust end-to-end scientific deployments. | Determinism, package supply chain, memory limits, device portability, archival replay and citation semantics. | Frontier review added browser as an execution continent, not just a UI. | Not saturated; Watch. |
| Quantum–classical and future compute interoperability | QIR, OpenQASM, hybrid workflow lowering, calibration metadata, accelerators and emerging compute. | LEAD_ONLY | Standards and research systems; rapidly changing hardware/toolchains. | Stable runtime contracts, error mitigation validity, reproducibility, vendor portability and real workloads. | Future review added typed cross-backend IR and calibration provenance. | Not saturated; Watch. |
| Human-subject, clinical, regulated and wet-lab research governance | Consent, protocol registration, audit, bias, privacy, regulated records, quality systems and safety cases. | SHALLOW | Cross-domain transfers and selected scholarly/lab standards; no dedicated exhaustive pass. | GxP/clinical/regulatory requirements, ethics/consent semantics, wet-lab QA and jurisdictional law. | Second-pass expert review exposed this gap; only preliminary governance patterns added. | Not saturated; adoption decisions require domain counsel. |

## 4. Architecture Family Registry

Architecture families are more decision-relevant than repository count. The compact registry below preserves the complete normalized family set extracted from the corpus. Exact maturity, performance and failure evidence is cross-referenced in Sections 5–12 and 24; fields not established by the corpus are not invented.

| ID | FAMILY | RESEARCH UNIT | PROBLEM | CORE MECHANISM | REPRESENTATIVE SYSTEMS | TRADEOFFS / WHERE IT FAILS | FAR-LAB RELEVANCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AF-091 | Composable solver stack | PREVIOUS_BATCH | Select numerical methods without rewriting models | Model discretization -> nonlinear/linear solver -> preconditioner -> backend | PETSc; Trilinos; hypre; Ginkgo | Configuration space and convergence diagnostics | Solver registry with evidence |
| AF-135 | Intent–Effect–Evidence Ledger | RU-001 | Crash-safe externally visible action | Append-only intent, dispatch, receipt, reconciliation and evidence records | Temporal; Restate; DBOS; Avatar Engine; payment idempotency | More state and adapter work; does not create exactly-once downstream | Unique FAR-Lab effect gateway |
| AF-136 | Deterministic Control History | RU-001 | Resume long-running control logic | Event history replay with side effects isolated in activities | Temporal; Cadence; Dapr Workflow | Versioning and history growth constraints | Durable research-run control plane |
| AF-137 | Memoized Step Runtime | RU-001 | Avoid repeating expensive deterministic steps | Persist completed step results and re-enter ordinary code | DBOS; Inngest; Trigger.dev | Step boundaries and serializer security matter | Shorter research tasks and model calls |
| AF-138 | Lease + Generation + Fencing Worker | RU-001 | Prevent stale workers from committing | Lease ownership plus monotonic generation checked at final effect gate | Kubernetes controllers; Restate; OpenGeni | Requires every authoritative write path to enforce fence | Worker/runtime safety invariant |
| AF-139 | Semantic Checkpoint Cache | RU-001 | Recover execution environment efficiently | Checkpoint only after meaningful state changes; treat snapshot as cache, ledger as truth | Crab; CRIU; DMTCP | Platform compatibility and unsafe deserialization | Optional workspace acceleration |
| AF-140 | Actor/Virtual-Object Durable Runtime | RU-001 | Stateful concurrent research entities | Keyed state and serialized per-entity commands | Rivet Actors; Restate; Orleans family | Hot-key bottlenecks and lifecycle complexity | Sessions, instruments, datasets as durable entities |
| AF-141 | Repository Context Data Plane | RU-002 | Give coding agents current structured context | Exact search + syntax + semantic facts + freshness manifest + retrieval trace | Glean; SCIP; Zoekt; Aider RepoMap; CodeNib | Index cost, stale facts and privacy | Shared coding/research context service |
| AF-142 | Agent–IDE Protocol Plane | RU-002 | Decouple coding agent from editor UI | Versioned session, permission, terminal, plan and update protocol | ACP; LSP; DAP | Protocol evolution and lowest-common-denominator risk | Multiple clients over one research-agent runtime |
| AF-143 | Reactive Computational Document | RU-002 | Eliminate hidden notebook order state | Dependency graph, stale propagation and topological re-execution | marimo; Pluto; ipyflow | Dynamic language analysis is imperfect | Scientific notebook substrate |
| AF-144 | Incremental Action Graph | RU-002 | Recompute only affected research products | Demand-driven dependency graph with equality cutoffs and cache keys | Buck2 DICE; Salsa; Incremental; Bazel | Invalidation correctness is difficult | Research computation and evidence invalidation |
| AF-145 | Hermetic Workspace Action | RU-002 | Make code edits and builds reproducible | Declared inputs, isolated execution, content-addressed outputs | Bazel REAPI; Nix; Pants; Buck2 | Setup cost and escape hatches | Build/test actions inside FAR-Lab |
| AF-146 | Structured Patch Transaction | RU-002 | Safely modify code under partial failure | AST/text patch with writable-root checks, preconditions and rollback | Codex apply_patch; Aider edit formats | Semantic merge and generated files remain hard | Auditable code mutation primitive |
| AF-147 | Layered Evidence Envelope | RU-003 | Package a scientifically auditable result | Operational lineage + semantic provenance + research object + digest attestations + signatures | OpenLineage; W3C PROV; RO-Crate; in-toto; Sigstore | Schema mapping and storage overhead | Canonical FAR-Lab evidence object |
| AF-148 | Content-Addressed Research Lineage | RU-003 | Trace exact artifacts and executions | Immutable record IDs derived from content and acyclic references | Nextflow LIDs; Nix; OCI; DataLad | Mutable external resources need captured snapshots | Artifact/run graph and integrity checks |
| AF-149 | Provenance-Preserving Metadata Fusion | RU-003 | Reconcile disagreeing sources | Store each assertion with source, timestamp, confidence and transformation | OpenAlex; Crossref; DataCite; PROV | More complex querying than last-write-wins | Literature and dataset identity resolution |
| AF-150 | Scientific Validity Gate | RU-003 | Separate runtime success from scientific support | Method, uncertainty, assumptions, diagnostics and evidence checks before claim promotion | ArviZ; causal refuters; workflow provenance | Domain-specific validators required | Unique core for trustworthy autonomous science |
| AF-151 | Tamper-Evident Execution Chain | RU-003 | Detect altered evidence history | Hash-linked records, signatures and transparency receipts | in-toto; Sigstore Rekor; SCITT | Does not prove methodological validity | Evidence custody and publication receipts |
| AF-152 | Segmented Hybrid Search | RU-004 | Search mutable heterogeneous corpora | Immutable lexical/vector segments, background merge and multi-stage ranking | Lucene; Tantivy; Quickwit; Vespa | Merge amplification, freshness and ranking complexity | General evidence/search substrate |
| AF-153 | Code-Specialized Trigram Search | RU-004 | Fast exact/regex code search | Trigram posting lists with repository/shard metadata | Zoekt | Not semantic by itself | Low-latency code archaeology |
| AF-154 | Scholarly Heterogeneous Graph | RU-004 | Connect papers, authors, institutions, grants and citations | Versioned entity graph with source-level provenance | OpenAlex; OpenAIRE; OpenCitations | Licensing and conflicting metadata | Literature intelligence graph |
| AF-155 | Active Evidence Screening Loop | RU-004 | Reduce review effort without hidden automation | Auditable rank–label–retrain–stop cycle | ASReview; active learning | Stopping bias and reviewer drift | Systematic review assistant |
| AF-156 | Sparse–Dense–Late Interaction Ensemble | RU-004 | Robust retrieval across query types | Lexical BM25/SPLADE + dense embeddings + ColBERT/reranker | Lucene; SPLADE; ColBERT; Vespa | Higher cost and fusion calibration | Tiered retrieval policy |
| AF-157 | Retrieval Evaluation Observatory | RU-004 | Prevent benchmark overfitting | Versioned corpora, query sets, relevance judgments and quality/latency/cost Pareto curves | BEIR; PyTerrier; Anserini | Judgments age and domain transfer fails | FAR-Lab search benchmark suite |
| AF-158 | Continuous-Batching LLM Server | RU-005 | Maximize token throughput | Dynamic request admission, paged KV cache and streaming scheduler | vLLM; SGLang; TGI | Tail latency and fairness tradeoffs | Commodity model-serving backend |
| AF-159 | Disaggregated Prefill/Decode Serving | RU-005 | Use heterogeneous resources efficiently | Separate prefill, decode and KV movement pools | Mooncake; llm-d; Dynamo | Network/KV consistency and scheduling complexity | Large-cluster serving option |
| AF-160 | Provider Capability Router | RU-005 | Choose model by quality, cost, latency and policy | Capability descriptors, fallback, budgets and per-request evidence | LiteLLM; gateway products | Provider semantics are not perfectly portable | Model gateway control plane |
| AF-161 | Prefix-Aware Research Session Cache | RU-005 | Reuse stable context across long sessions | Content-addressed prefixes with tenant/policy/version boundaries | SGLang; vLLM prefix cache | Cache poisoning and invalidation | Research context acceleration |
| AF-162 | Compiler-to-Kernel Stack | RU-005 | Optimize model execution across accelerators | Graph capture -> multi-level IR -> generated/autotuned kernels | Inductor; MLIR; Triton; IREE; XLA | Dynamic shapes and compiler debugging | Performance backend, not application truth |
| AF-163 | Measured Inference Admission Control | RU-005 | Avoid overload and OOM | Memory-aware slots, queue age, token budgets and cancellation | Triton; OpenGeni; vLLM | Requires workload-specific measurements | Safe model serving |
| AF-164 | Hierarchical HPC Resource Control | RU-006 | Compose allocations across sites and workflows | Batch manager plus nested resource manager | Slurm; Flux | Operational complexity and policy integration | Remote compute federation |
| AF-165 | Explicit-Dependency Many-Task Runtime | RU-006 | Schedule fine-grained heterogeneous work | Tasks declare data dependencies; runtime maps and migrates work | Legion; PaRSEC; StarPU | Programming model adoption cost | High-performance scientific kernels |
| AF-166 | MPI Semantic Interface over Pluggable Fabric | RU-006 | Separate application communication from transport | MPI API over UCX/OFI providers | Open MPI; MPICH; UCX; libfabric | Transport bugs and feature mismatch | Portable cluster communication |
| AF-167 | Performance-Portable Kernel Policy | RU-006 | Run one algorithm on CPU/GPU backends | Execution/memory policies separate algorithm from backend | Kokkos; RAJA | Lowest-common-denominator and tuning needs | Accelerator abstraction boundary |
| AF-168 | Content-Addressed Simulation Run | RU-006 | Reproduce scientific computation | Hash model, mesh, parameters, solver config, environment and outputs | AiiDA; Nextflow lineage; Nix | Nondeterministic hardware and floating point | Simulation evidence envelope |
| AF-169 | Elastic Checkpointable HPC Task | RU-006 | Survive preemption and topology change | Application checkpoint contract plus scheduler-aware rebind | DMTCP; MANA; Charm++; Flux | MPI/GPU/external resource compatibility | Future cloud/HPC resilience |
| AF-170 | Probabilistic Program + Diagnostic Separation | RU-007 | Avoid equating sampling with valid inference | Inference engine emits standardized draws; independent diagnostics gate conclusions | Stan/PyMC/NumPyro + ArviZ | Interchange schemas and model-specific diagnostics | Bayesian analysis contract |
| AF-171 | Causal Assumption–Identification–Refutation Pipeline | RU-007 | Make causal claims auditable | Graph assumptions, identification, estimation and adversarial refuters | DoWhy; EconML; DoubleML | Unmeasured confounding remains epistemic | Causal evidence workflow |
| AF-172 | Sequential Experiment Decision Service | RU-007 | Optimize experiments under cost and constraints | Acquisition functions, pending trials, safety constraints and stopping rules | BoTorch; Ax; Optuna; SMAC | Adaptive bias and model misspecification | Experiment planner behind validity gate |
| AF-173 | Message-Driven Instrument Plan | RU-007 | Control heterogeneous instruments safely | Plans yield device-neutral messages; RunEngine executes and emits documents | Bluesky; Ophyd | Device drivers and physical irreversibility | Laboratory execution plane |
| AF-174 | Instrument Effect Reconciliation | RU-007 | Resolve timeout after physical action | Command ID, device status query, calibration state and manual-resolution path | Industrial control patterns; effect ledger | Many devices cannot report exact state | Unique lab safety primitive |
| AF-175 | Calibration and Measurement Traceability Graph | RU-007 | Preserve physical meaning and uncertainty | Calibration chain, unit, instrument, operator, environment and uncertainty | QUDT; UCUM; metrology practice | Domain-specific models and governance | Scientific measurement evidence |
| AF-176 | Threat-Model-Selected Sandbox | RU-008 | Match isolation to adversary and workload | Choose process/container/microVM/Wasm/TEE/verified kernel by threat model | bubblewrap/gVisor/Firecracker/Wasmtime/Gramine/seL4 | Performance and compatibility differ | Execution-class policy |
| AF-177 | Identity–Relationship–Policy Separation | RU-008 | Make authorization analyzable | SPIFFE identity + Zanzibar relationships + OPA/Cedar decision + executor enforcement | SPIRE; SpiceDB/OpenFGA; OPA/Cedar | Consistency and policy versioning | Authorization control plane |
| AF-178 | Proof-Obligation Routing | RU-008 | Use formal methods where they pay | Map protocol risks to TLA+, code contracts to Dafny/Lean, bounded implementation to Kani/CBMC | TLA+; Apalache; Lean; Dafny; Kani; CBMC | Proof scope can be misleading | Critical invariant verification program |
| AF-179 | Adversarial Verification Ladder | RU-008 | Avoid green-test false confidence | Property tests -> fuzzing -> deterministic simulation -> Jepsen -> chaos -> red-team eval | Hypothesis; OSS-Fuzz; FoundationDB; Jepsen; Chaos Mesh | Expensive and still incomplete | Evidence level required per claim |
| AF-180 | Checkpoint Supply-Chain Boundary | RU-008 | Prevent code execution from persisted state | Typed schemas, signatures, bounds, low-privilege loader and version gates | LangGraph advisories; safe serialization patterns | Compatibility and migration burden | All persisted agent state |
| AF-181 | Attested Confidential Worker | RU-008 | Protect sensitive research on untrusted infrastructure | TEE measurement, workload identity, encrypted secrets and evidence receipt | Confidential Containers; Gramine; SPIRE | Side channels and hardware trust | Restricted-data execution class |
| AF-182 | Local-First Durable Document | RU-009 | Enable offline collaborative work | CRDT document + sync protocol + local persistence | Automerge; Yjs; Loro | Semantic invariant conflicts | Notes, plans and manuscript editing |
| AF-183 | Authoritative Database with Local Shapes | RU-009 | Combine relational truth with local UX | Server transactions stream selected shapes to local stores | ElectricSQL | Offline writes and authorization complexity | Metadata/forms collaboration |
| AF-184 | Operation-Log Version Control | RU-009 | Preserve change intent and undo/redo | Version control operations are first-class and rebaseable | Jujutsu | Ecosystem maturity | Research workspace history |
| AF-185 | Patch-Theory Semantic Merge | RU-009 | Represent independent changes rather than snapshots | Commuting patches and conflict algebra | Pijul | Tooling and mental-model cost | Research object merge exploration |
| AF-186 | Capability-Scoped Plugin Host | RU-009 | Extend system without sharing process authority | Wasm component or out-of-process RPC with declared capabilities | Extism; Wasmtime; go-plugin | Cross-boundary latency and API versioning | FAR-Lab extension runtime |
| AF-187 | Presence as Ephemeral Side Channel | RU-009 | Avoid polluting durable state with cursors/status | Best-effort awareness separate from document history | Yjs awareness; collaboration systems | Presence can be stale | Collaborative UX plane |
| AF-188 | Dual Reconciliation Control Loops | RU-010 | Separate resource liveness from scientific semantics | Infrastructure controller reconciles workloads; research controller reconciles intent/effects/evidence | Kubernetes; Temporal-like runtime | Cross-loop race conditions | Core deployment architecture |
| AF-189 | Durable Event Backbone with Domain Ledgers | RU-010 | Distribute events without confusing log with truth | Kafka/Pulsar/NATS transport events; domain DBs own invariants | Kafka; Pulsar; NATS | Duplicate delivery and schema evolution | Integration event plane |
| AF-190 | Telemetry Processing Pipeline | RU-010 | Unify traces, metrics and logs | Receivers -> processors -> exporters with semantic conventions | OpenTelemetry Collector | Sampling can hide failures | Operational observability |
| AF-191 | Scientific Run SLO | RU-010 | Measure useful reliability | SLOs for recovery, evidence completeness, effect ambiguity and scientific validity | Prometheus; OTel; custom metrics | Hard to define and game-resistant | Product/research operations |
| AF-192 | Queue-Isolated Recovery Plane | RU-010 | Prevent recovery storms | Separate quotas, backpressure and gradual resume for recovery work | Incident lessons; Kubernetes queues | Slower recovery by design | Runtime safety |
| AF-193 | Edge/Instrument Gateway | RU-010 | Bridge intermittently connected labs | Local durable queue, policy cache, device adapters and sync receipts | K3s/KubeEdge; NATS; OPC UA patterns | Split-brain and physical safety | Remote lab integration |
| AF-194 | Document AST as Publication IR | RU-011 | Generate many publication formats consistently | Structured document AST with citations, figures and executable references | Pandoc; MyST; Quarto | Round-trip fidelity limitations | Publication compiler |
| AF-195 | Executable Research Publication | RU-011 | Bind text to computation and evidence | Document nodes reference versioned cells, data and outputs | Quarto; MyST; Jupyter Book | Execution cost and environment drift | Living papers/reports |
| AF-196 | Declarative Visualization Evidence | RU-011 | Make charts reproducible and inspectable | Versioned grammar spec + data transform provenance | Vega-Lite; Observable | Some advanced visuals need imperative escape | Figures as evidence objects |
| AF-197 | Scale-Aware Visualization Pipeline | RU-011 | Explore datasets larger than client memory | Server/parallel aggregation, multiresolution tiles and linked views | Datashader; ParaView; deck.gl | Approximation and transfer complexity | Large scientific data UX |
| AF-198 | Reviewable Claim Graph | RU-011 | Review claims, citations and figures together | Inline claim nodes linked to evidence and comments | Manubot; OpenReview patterns; PROV | Novel UX and schema work | Unique scientific review surface |
| AF-199 | Domain Workbench Plugin | RU-011 | Embed specialized visualization without monolith | Plugin contributes data adapters, views, commands and evidence exporters | napari; VS Code; Jupyter | Plugin security and API stability | Domain-specific workspaces |
| AF-200 | Domain Schema Plugin Contract | RU-012 | Preserve scientific semantics across domains | Versioned schema, validator, converters, units, provenance and views | BIDS; NWB; NOMAD; GA4GH | Governance and migration | First-class FAR-Lab domain extension |
| AF-201 | Workflow Community Quality System | RU-012 | Scale reusable scientific pipelines | Templates, modules, linting, CI, versioning and community review | nf-core; Galaxy toolsheds | Social governance and dependency drift | Workflow marketplace quality gate |
| AF-202 | Provenance-Native Scientific Workflow | RU-012 | Track remote calculations as domain objects | Every input, code, scheduler job and output is a provenance node | AiiDA; Galaxy; Nextflow lineage | Storage and integration overhead | Remote scientific execution |
| AF-203 | Labeled Multidimensional Data Model | RU-012 | Carry coordinates, units and metadata through analysis | Named dimensions, coordinate indexes and lazy chunked arrays | xarray; NWB; Zarr ecosystem | Metadata can silently drop | Core scientific array contract |
| AF-204 | Federated Domain Data Repository | RU-012 | Publish validated datasets with stable IDs | Domain validation, immutable versions, metadata search and access APIs | DANDI; NOMAD; Galaxy histories | Repository governance | Research object publication |
| AF-205 | Robotics/Lab Middleware Adapter | RU-012 | Integrate physical systems with common effect semantics | ROS2/OPC UA/SiLA/device API translated to commands, state and receipts | ROS2; MoveIt; Opentrons; PyLabRobot | Real-time and safety constraints | Instrument integration adapters |
| AF-206 | Negotiated Agent Interoperability | RU-013 | Connect heterogeneous agents and clients | Capability negotiation, session/task lifecycle, messages, artifacts and permissions | MCP; ACP; A2A; AG-UI | Rapidly evolving standards and semantic gaps | Protocol gateway, not core truth |
| AF-207 | Schema-First API Mesh | RU-013 | Maintain cross-language contracts | OpenAPI/gRPC/Protobuf/AsyncAPI with compatibility testing | OpenAPI; gRPC; Protobuf; AsyncAPI | Schema drift and generated-code burden | Service/plugin boundaries |
| AF-208 | Columnar Data Service Boundary | RU-013 | Move large scientific data efficiently | Arrow memory format and Flight RPC with tickets/streams | Apache Arrow Flight | Authorization and versioning | High-throughput data plane |
| AF-209 | Sovereign Dataspace Connector | RU-013 | Exchange data under usage policy across institutions | Connector negotiates contract, identity, policy and transfer without central ownership | Dataspace Protocol; Eclipse EDC; ODRL | Policy enforcement after transfer is limited | Cross-institution federation |
| AF-210 | Artifact–Attestation Graph | RU-013 | Attach evidence to immutable artifacts | OCI manifest/referrer graph with in-toto/SBOM/provenance attestations | OCI; ORAS; in-toto; SLSA | Registry compatibility and retention | Model/data/code release pipeline |
| AF-211 | Versioned Protocol Translation Gateway | RU-013 | Survive protocol evolution | Canonical internal model plus adapters and conformance fixtures | MCP/ACP/A2A/CloudEvents | Translation can lose semantics | Interoperability integration layer |
| AF-212 | Metrology-Aware Scientific Object | RU-014 | Keep unit, calibration and uncertainty semantics | Quantity value + unit/dimension + uncertainty/covariance + calibration trace | QUDT; UCUM; Astropy units | Domain conventions and correlation complexity | Unique measurement core |
| AF-213 | Energy/Carbon as Schedulable Resource | RU-014 | Optimize scientific compute beyond money/time | Energy measurements and carbon forecasts enter scheduler objective with deadlines | Kepler; Carbon Aware SDK | Estimation uncertainty and fairness | Sustainability-aware scheduling |
| AF-214 | Browser-Resident Scientific Compute | RU-014 | Run private/offline analysis near data/user | Wasm/Pyodide/WebGPU with local object cache and signed packages | Pyodide; JupyterLite; WebGPU; DuckDB-Wasm | Memory, browser security and package limits | Edge workbench mode |
| AF-215 | Component-Model Scientific Plugin | RU-014 | Portable typed plugins across languages | Wasm Component Model/WIT with capability handles | Component Model; Wasmtime; Extism | Ecosystem immature | Future plugin ABI |
| AF-216 | Quantum/Classical Workflow Boundary | RU-014 | Represent hybrid quantum experiments reproducibly | QIR/OpenQASM artifacts, calibration metadata, backend receipts and classical provenance | QIR; OpenQASM | Hardware noise and fast-moving APIs | Frontier domain adapter |
| AF-217 | Privacy-Preserving Federated Research | RU-014 | Analyze restricted distributed data | Federated compute, differential privacy, secure aggregation and verifiable policy | OpenDP; federated-learning systems; dataspace connectors | Utility/privacy tradeoffs and governance | Restricted multi-institution studies |

## 5. Tier S Architecture-Changing Candidates

Tier S means the candidate or synthesized architecture may materially alter FAR-Lab product or platform strategy. It does **not** authorize adoption. These records received the deepest consolidation and current primary-source verification available in this pass.

### S-001 — FAR-Lab Intent–Effect–Evidence Ledger

| FIELD | VALUE |
| --- | --- |
| PROJECT | FAR-Lab Intent–Effect–Evidence Ledger |
| CANONICAL REPOSITORY / SOURCE | INTERNAL SYNTHESIS; no external repository |
| ORGANIZATION | FAR-Lab pre-research synthesis |
| CURRENT / RELEVANT VERSION | PRE-RESEARCH HYPOTHESIS 2026-08-20 |
| LICENSE | N/A — architecture hypothesis |
| STATUS / MAINTENANCE | Hypothesis assembled from durable execution, payment-style idempotency, database fencing, scientific provenance and instrument-control evidence. |
| DOMAIN | Systems / scientific trust |
| SUBDOMAIN | External effects and evidence |
| ARCHITECTURE FAMILY | Intent–Effect–Evidence ledger with typed unknown outcomes |
| PRIMARY PROBLEM | A recovered workflow does not prove whether an irreversible external effect occurred, nor whether a resulting scientific claim is valid. |
| EVIDENCE LEVEL | DECISION_SYNTHESIS + EXECUTED_SYNTHETIC_MODEL (not production validation) |
| CONFIDENCE | HIGH on problem; MEDIUM on proposed integration |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Durable intent; generation/fencing; final authorization check; endpoint idempotency or status inquiry; receipt; UNKNOWN_EFFECT_STATE; reconciliation; compensation; evidence linkage; quiescence certificate. |
| CORE ARCHITECTURE | One authoritative effect gateway joins control history to external-world receipts without letting either the workflow engine or a process snapshot own scientific truth. |
| BEST COMPONENTS | Makes ambiguous outcomes explicit; prevents blind replay; separates control, external-world and scientific validity. |
| RELEVANT SOURCE / PACKAGE AREAS | Derived from AF-135, AF-138, AF-139, P-050 and the executed synthetic effect-fault model; no production implementation inspected. |
| LANGUAGE / STACK | Implementation-neutral; likely SQL/event log + typed adapters + policy engine. |
| STATE MODEL | Append-only Intent, EffectAttempt, Receipt, UnknownEffect, Reconciliation and Evidence records. |
| EXECUTION MODEL | Control runtime requests effects; gateway revalidates authority/generation and performs adapter-specific commit/query/compensate protocol. |
| CONCURRENCY MODEL | Leases plus sink-enforced fencing/generation; recovery has an independent admission budget. |
| EXTENSION MODEL | Per-effect adapter declares replay safety, idempotency, query, compensation and irreversibility semantics. |
| SECURITY MODEL | Capability/policy decision bound to the final effect attempt; persistent state treated as untrusted supply-chain input. |
| OBSERVABILITY MODEL | Every transition audit-logged; operational traces are linked but not authoritative. |
| PERFORMANCE TECHNIQUES | Extra durable writes and adapter round trips; synthetic model found a fused gate+idempotency+inquiry protocol safest, not fastest. |
| DEPLOYMENT MODEL | Central logical authority; adapters may run near resources/instruments. |
| MATURITY | Architecture synthesis; primitives individually mature, end-to-end integration unproven. |
| ADOPTION EVIDENCE | No external implementation supplies the entire contract. |
| WEAKNESSES | High adapter burden; physical actions may remain irreconcilable; exactly-once is impossible without downstream cooperation. |
| KNOWN FAILURE MODES | Duplicate effects, stale-owner writes, recovery storms, checkpoint/external-world divergence. |
| CROSS-DOMAIN VALUE | Transfers payment processing, database fencing, industrial command acknowledgement and safety-case thinking into agent execution. |
| POTENTIAL FAR-LAB VALUE | Potential unique core and governing safety boundary. |
| POSSIBLE FUTURE ADOPTION MODES | BUILD behind a stable interface while adopting a commodity durable control engine underneath. |
| LEGAL / LICENSE CONCERNS | No direct code-reuse issue; external adapter and engine licenses remain component-specific. |
| INTEGRATION RISKS | Dual authorities, bypass paths, mismatched effect identity, insufficient downstream inquiry. |
| LONG-TERM RISKS | Schema evolution, unbounded histories, adapter drift, incomplete quiescence detection. |
| FUTURE POTENTIAL | Could become a portable effect conformance protocol if adapters and formal models are generalized. |
| SOURCE-CORPUS REFERENCES | RAW-0012, RAW-0014, RAW-0039, RAW-0032; C-001..C-063 families. |
| EXTERNAL EVIDENCE | Temporal/DBOS/Restate official sources; payment/idempotency and instrument standards referenced in corpus. |
| FUTURE INVESTIGATION OBLIGATION | Build a minimal reference model; model-check invariants; execute real downstream adapters; inject crashes at every pre/post-commit window; prove no bypass. |

### S-002 — Temporal

| FIELD | VALUE |
| --- | --- |
| PROJECT | Temporal |
| CANONICAL REPOSITORY / SOURCE | https://github.com/temporalio/temporal |
| ORGANIZATION | Temporal Technologies / temporalio |
| CURRENT / RELEVANT VERSION | Server v1.31.2 verified 2026-07-08; TypeScript SDK v1.21.1 verified 2026-07-24; revalidate before use |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Actively maintained; mature production durable-execution platform. |
| DOMAIN | Systems / runtime |
| SUBDOMAIN | Durable workflow control |
| ARCHITECTURE FAMILY | Deterministic event-history replay with activities |
| PRIMARY PROBLEM | Crash-tolerant long-running logical control with timers, retries, cancellation and worker replacement. |
| EVIDENCE LEVEL | SOURCE_INSPECTED + ISSUES_INSPECTED; not EXECUTED/BENCHMARKED in this mission |
| CONFIDENCE | HIGH identity/architecture; MEDIUM FAR fit |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Durable histories, workflow replay, activities, signals/updates, timers, child workflows, versioning, visibility and multi-language SDKs. |
| CORE ARCHITECTURE | Server persists event history and mutable execution state; deterministic workflow workers rebuild control state; nondeterministic/external operations are activities. |
| BEST COMPONENTS | Strongest mature reference for logical durability and failure recovery. |
| RELEVANT SOURCE / PACKAGE AREAS | Server history/matching/frontend services; SDK workflow/activity/sandbox layers. Exact FAR-Lab integration paths remain unexecuted. |
| LANGUAGE / STACK | Go server; language SDKs including TypeScript/Python/Java/Go. |
| STATE MODEL | Append-only workflow event history plus server-managed mutable state. |
| EXECUTION MODEL | Worker polling and workflow-task replay; activities are retryable side-effect boundaries. |
| CONCURRENCY MODEL | Workflow task serialization per execution; activities and child workflows parallelize explicitly. |
| EXTENSION MODEL | SDK interceptors, payload codecs/converters, workers, activities, nexus/services. |
| SECURITY MODEL | Namespace/service auth and deployment controls; application effect authorization remains FAR-Lab responsibility. |
| OBSERVABILITY MODEL | Visibility APIs, metrics/traces/logs; not scientific provenance. |
| PERFORMANCE TECHNIQUES | History replay, sticky execution and continue-as-new; large histories and worker caches require measurement. |
| DEPLOYMENT MODEL | Separate service/control plane plus workers; self-hosted or managed. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Broad production evidence; not independently benchmarked for FAR-Lab. |
| WEAKNESSES | Operational machinery; deterministic replay/versioning constraints; history growth; does not solve ambiguous external effects. |
| KNOWN FAILURE MODES | Current issue/security history includes workflow-stall/race and SDK cache/sandbox edge cases; patch gating required. |
| CROSS-DOMAIN VALUE | Actor/event-sourcing and distributed-systems recovery semantics. |
| POTENTIAL FAR-LAB VALUE | Comparator and likely commodity control-plane candidate. |
| POSSIBLE FUTURE ADOPTION MODES | ADAPT behind FAR-Lab runtime abstraction; never make Temporal history the scientific evidence authority. |
| LEGAL / LICENSE CONCERNS | Permissive MIT; managed-service terms separately reviewed. |
| INTEGRATION RISKS | Large payloads in histories, workflow code evolution, duplicate external effects after timeout, dual ownership with FAR ledgers. |
| LONG-TERM RISKS | Migration of long-lived workflows across SDK/server versions; operational lock-in. |
| FUTURE POTENTIAL | Likely remains a leading durable-control reference; agent-specific layers should remain replaceable. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-001; corpus sources: RAW-0461 |
| EXTERNAL EVIDENCE | Official repository, docs, releases, SDK repository and issue/security tracker, checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Run identical FAR-Lab crash/cancel/fork/approval/version-upgrade workload against DBOS and current local runtime; measure correctness before cost/latency. |

### S-003 — DBOS Transact (TypeScript)

| FIELD | VALUE |
| --- | --- |
| PROJECT | DBOS Transact (TypeScript) |
| CANONICAL REPOSITORY / SOURCE | https://github.com/dbos-inc/dbos-transact-ts |
| ORGANIZATION | DBOS, Inc. / dbos-inc |
| CURRENT / RELEVANT VERSION | v4.25 verified 2026-07-30; revalidate |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Active, growing, younger operational history than Temporal. |
| DOMAIN | Systems / runtime |
| SUBDOMAIN | Database-backed durable workflows |
| ARCHITECTURE FAMILY | Postgres-persisted workflow/step state embedded in application library |
| PRIMARY PROBLEM | Durable workflows with a smaller operational footprint and close fit to a TypeScript/Postgres service. |
| EVIDENCE LEVEL | SOURCE_INSPECTED; not EXECUTED/BENCHMARKED |
| CONFIDENCE | HIGH architecture; MEDIUM operational fit |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Workflow status, operation outputs, events/history, queues, streams, schedules, recovery, cancellation, timeout, fork/parent metadata. |
| CORE ARCHITECTURE | Application library checkpoints workflow/step results in a Postgres system database; ordinary code re-enters from persisted operation boundaries. |
| BEST COMPONENTS | Low infrastructure count; close integration with TypeScript/Postgres; explicit persisted step outputs. |
| RELEVANT SOURCE / PACKAGE AREAS | src/system_database.ts; src/dbos-executor.ts; workflow/queue/recovery tests. |
| LANGUAGE / STACK | TypeScript + PostgreSQL. |
| STATE MODEL | Relational tables for workflow status, operation outputs, events, streams, queues, schedules and recovery metadata. |
| EXECUTION MODEL | Decorated/registered workflows and steps; replay/memoization from SQL state. |
| CONCURRENCY MODEL | Database transactions and queue semantics; contention/scale assumptions require proof. |
| EXTENSION MODEL | Application functions, queues, event/stream APIs and database integration. |
| SECURITY MODEL | Application/database security; effect authorization remains external. |
| OBSERVABILITY MODEL | Database state and logs; export integration required. |
| PERFORMANCE TECHNIQUES | Avoids separate orchestration service; DB write amplification and contention are workload-dependent. |
| DEPLOYMENT MODEL | Application + PostgreSQL; docs warn durable workflow code must not be transformed by unsupported bundlers. |
| MATURITY | Growing |
| ADOPTION EVIDENCE | Increasing but less independent production evidence than Temporal. |
| WEAKNESSES | Requires Postgres; younger; bundling constraints; durability semantics and scale need empirical proof. |
| KNOWN FAILURE MODES | Ambiguous downstream commits remain; database outage/contended system tables can couple application and workflow recovery. |
| CROSS-DOMAIN VALUE | Database-as-runtime and transactionally durable application execution. |
| POTENTIAL FAR-LAB VALUE | Potential lowest-rewrite durable-control candidate for current FAR-Lab service shape. |
| POSSIBLE FUTURE ADOPTION MODES | ADAPT behind local/server runtime abstraction; compare directly with Temporal. |
| LEGAL / LICENSE CONCERNS | MIT. |
| INTEGRATION RISKS | Bundling, schema migrations, application DB coupling, accidentally treating step memoization as effect exactly-once. |
| LONG-TERM RISKS | Postgres scaling and ecosystem maturity. |
| FUTURE POTENTIAL | Could be compelling for installations that prioritize operational simplicity. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-003; corpus sources: RAW-0461 |
| EXTERNAL EVIDENCE | Official repository and TypeScript documentation/release material, checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Port one unchanged FAR research pipeline; kill between every step/effect; test duplicate starts, fan-out, approval pauses, 24-hour timers and version migration. |

### S-004 — AiiDA

| FIELD | VALUE |
| --- | --- |
| PROJECT | AiiDA |
| CANONICAL REPOSITORY / SOURCE | https://github.com/aiidateam/aiida-core |
| ORGANIZATION | AiiDA team |
| CURRENT / RELEVANT VERSION | v2.8.1 verified 2026-07-25; revalidate |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Mature, actively maintained scientific workflow/provenance platform. |
| DOMAIN | Scientific infrastructure |
| SUBDOMAIN | Process/data provenance and remote computation |
| ARCHITECTURE FAMILY | Typed process/data provenance graph with checkpointed WorkChains |
| PRIMARY PROBLEM | Preserve how scientific data and calculations were produced while supporting remote/HPC execution and resumable workflows. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED + release/failure notes; source paths partially inspected |
| CONFIDENCE | HIGH value; MEDIUM direct reuse |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Process and data nodes, links/provenance queries, WorkChains, checkpoint/pause/resume, transports, schedulers, plugins, archives/export. |
| CORE ARCHITECTURE | ORM graph distinguishes processes from immutable data; daemon/engine executes processes and preserves causal links. |
| BEST COMPONENTS | Scientific semantics are richer than generic lineage or AgentOps traces. |
| RELEVANT SOURCE / PACKAGE AREAS | aiida.orm; aiida.engine/processes/workchains; transports; schedulers; plugin entry points; archive format. |
| LANGUAGE / STACK | Python, PostgreSQL/RabbitMQ deployment heritage, remote schedulers. |
| STATE MODEL | Provenance graph plus process checkpoint state and immutable data nodes. |
| EXECUTION MODEL | Event-driven process engine with remote transport/scheduler plugins. |
| CONCURRENCY MODEL | Daemon workers and scheduler jobs; domain workflows explicitly compose processes. |
| EXTENSION MODEL | Plugin ecosystem for data types, calculations, workflows, transports and schedulers. |
| SECURITY MODEL | Remote credential/transport handling; not a general tenant isolation boundary. |
| OBSERVABILITY MODEL | Process state/logs and provenance queries; operational telemetry is separate. |
| PERFORMANCE TECHNIQUES | Designed for many remote calculations; graph/query and daemon scale must be benchmarked for FAR workloads. |
| DEPLOYMENT MODEL | Service plus database/broker/daemon; local and HPC integrations. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Strong computational-science use, especially materials. |
| WEAKNESSES | Domain heritage and Python framework coupling; adoption wholesale could overconstrain FAR-Lab. |
| KNOWN FAILURE MODES | Release notes include resource-leak/race fixes; remote scheduler failures need reconciliation. |
| CROSS-DOMAIN VALUE | Scientific workflow, data lineage and HPC transport. |
| POTENTIAL FAR-LAB VALUE | Extract process/data/evidence semantics and archive/query patterns; possible adapters, not platform rebase. |
| POSSIBLE FUTURE ADOPTION MODES | EXTRACT semantics; possibly ADAPT plugins/transports selectively. |
| LEGAL / LICENSE CONCERNS | MIT. |
| INTEGRATION RISKS | Duplicating canonical truth, Python coupling, mapping claims/assertions to AiiDA’s process/data graph. |
| LONG-TERM RISKS | Schema/generalization pressure beyond computational materials. |
| FUTURE POTENTIAL | A major reference for provenance-native autonomous science. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-433; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official repository, docs, changelog/release notes, checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Prototype a domain-neutral projection of FAR EvidenceAssertion/Artifact/Activity objects; test invalidation and “what changes if evidence X is withdrawn?” queries. |

### S-005 — Scientific Evidence Interoperability Stack

| FIELD | VALUE |
| --- | --- |
| PROJECT | Scientific Evidence Interoperability Stack |
| CANONICAL REPOSITORY / SOURCE | W3C PROV + RO-Crate + OpenLineage + in-toto/Sigstore |
| ORGANIZATION | W3C, RO-Crate community, OpenLineage, CNCF/Sigstore/in-toto communities |
| CURRENT / RELEVANT VERSION | PROV Recommendation 2013; RO-Crate 1.2.0 (1.3 WIP); component versions revalidate |
| LICENSE | Mixed: specs and implementations differ; component-specific legal review |
| STATUS / MAINTENANCE | Mature standards/primitives with complementary—not interchangeable—semantics. |
| DOMAIN | Evidence / provenance / reproducibility |
| SUBDOMAIN | Semantic, operational, package and cryptographic evidence |
| ARCHITECTURE FAMILY | Layered evidence envelope linked by stable IDs/digests |
| PRIMARY PROBLEM | No single provenance format simultaneously captures scientific meaning, operational lineage, portable research packaging and tamper-evident attestations. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED / SPEC_INSPECTED; no end-to-end execution |
| CONFIDENCE | HIGH on layer separation; MEDIUM on profile design |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | PROV Entity/Activity/Agent semantics; RO-Crate research-object package; OpenLineage run/job/dataset events; in-toto/SLSA typed attestations; Sigstore/Rekor signing/transparency. |
| CORE ARCHITECTURE | Separate authorities joined by artifact/run/step IDs and content digests; public projections may omit private raw evidence. |
| BEST COMPONENTS | Interoperable and legally separable layers; avoids overloading traces or signatures. |
| RELEVANT SOURCE / PACKAGE AREAS | Specs/schemas plus project libraries; exact implementation selection deferred. |
| LANGUAGE / STACK | JSON-LD/RDF, JSON events, OCI artifacts, transparency logs, signing clients. |
| STATE MODEL | Immutable artifacts, semantic assertions/derivations, operational events, package manifests and signed statements. |
| EXECUTION MODEL | Emit evidence at boundaries; finalize package after validity/review gates. |
| CONCURRENCY MODEL | Append-only event/attestation streams; package closure requires atomic publication. |
| EXTENSION MODEL | Profiles/facets/predicates and domain schemas. |
| SECURITY MODEL | Cryptographic authenticity and transparency; explicitly does not prove scientific validity. |
| OBSERVABILITY MODEL | OpenLineage/OTel links; scientific evidence remains independently queryable. |
| PERFORMANCE TECHNIQUES | Evidence volume and graph compaction are principal costs; large bytes remain external by digest. |
| DEPLOYMENT MODEL | Federated producers with a logical evidence authority and archival exports. |
| MATURITY | Standards mature; integrated scientific envelope emerging. |
| ADOPTION EVIDENCE | Widely used components in data, supply chain and research packaging. |
| WEAKNESSES | Identity alignment, profile governance and evidence volume; overlapping vocabularies. |
| KNOWN FAILURE MODES | Signature ≠ validity; DOI ≠ reproduction; lineage ≠ package; sampled telemetry may drop events. |
| CROSS-DOMAIN VALUE | Supply-chain security, data lineage, digital preservation and scholarly communication. |
| POTENTIAL FAR-LAB VALUE | Likely foundation of FAR external interchange and `.far-proof` trust envelope. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT standards; BUILD canonical internal model and projections. |
| LEGAL / LICENSE CONCERNS | Review each spec, reference implementation, schema and service separately. |
| INTEGRATION RISKS | Conflicting identifiers, duplicated truth, incomplete private/public projections. |
| LONG-TERM RISKS | Profile fragmentation and schema evolution. |
| FUTURE POTENTIAL | Proof-carrying research objects and machine-verifiable evidence closure. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-078, C-082, C-169, C-170, C-171, C-306, C-307; corpus sources: RAW-0020, RAW-0467, RAW-0531 |
| EXTERNAL EVIDENCE | Official W3C, RO-Crate, OpenLineage, in-toto/SLSA and Sigstore/Rekor sources. |
| FUTURE INVESTIGATION OBLIGATION | Build one complete FAR run package; independently verify digests/signatures; query semantic lineage; test redaction and package reconstruction without vendor workflow history. |

### S-006 — Apache Arrow

| FIELD | VALUE |
| --- | --- |
| PROJECT | Apache Arrow |
| CANONICAL REPOSITORY / SOURCE | https://github.com/apache/arrow |
| ORGANIZATION | Apache Software Foundation |
| CURRENT / RELEVANT VERSION | 25.0.1 verified 2026-08-10; revalidate |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature, active cross-language data-plane standard and implementation. |
| DOMAIN | Data / compute |
| SUBDOMAIN | Columnar in-memory interchange |
| ARCHITECTURE FAMILY | Language-neutral columnar memory contract |
| PRIMARY PROBLEM | Move tabular/record data across languages, processes and engines without repeated serialization/copying. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED + repository metadata |
| CONFIDENCE | HIGH |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Columnar arrays, schemas, IPC, C data interface, Flight/Flight SQL, compute kernels, Parquet integration. |
| CORE ARCHITECTURE | Specified physical layout optimized for vectorized access and zero-copy sharing; mutation semantics are intentionally outside the core format. |
| BEST COMPONENTS | Prevents per-subsystem data-copy contracts; strong polyglot boundary. |
| RELEVANT SOURCE / PACKAGE AREAS | format/; cpp/src/arrow; c_glib; java; python bindings; Flight protocol. |
| LANGUAGE / STACK | C++ core and many language implementations. |
| STATE MODEL | Immutable/append-oriented arrays and schemas; buffers referenced by offsets. |
| EXECUTION MODEL | Library/protocol boundary rather than workflow engine. |
| CONCURRENCY MODEL | Readers can share immutable buffers; writers/builders manage ownership explicitly. |
| EXTENSION MODEL | Extension types, custom metadata, Flight services. |
| SECURITY MODEL | Input validation, memory ownership and IPC trust boundaries require care. |
| OBSERVABILITY MODEL | Not intrinsic; attach provenance/digests externally. |
| PERFORMANCE TECHNIQUES | Zero-copy exchange, SIMD/vectorization, O(1) random access; conversion costs depend on source format. |
| DEPLOYMENT MODEL | Embedded libraries, shared-memory/IPC, network Flight services. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Broad analytics/data ecosystem adoption. |
| WEAKNESSES | Not a database, transaction model, artifact identity or scientific semantics layer. |
| KNOWN FAILURE MODES | Schema drift, buffer lifetime errors, oversized messages and dictionary/extension incompatibility. |
| CROSS-DOMAIN VALUE | Database, analytics, HPC and language-runtime interoperability. |
| POTENTIAL FAR-LAB VALUE | Canonical high-throughput table/batch boundary; not canonical truth store. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT data-plane interfaces and Flight selectively. |
| LEGAL / LICENSE CONCERNS | Apache-2.0. |
| INTEGRATION RISKS | Treating Arrow objects as durable state; schema/version mismatch; hidden copies in bindings. |
| LONG-TERM RISKS | Extension-type fragmentation. |
| FUTURE POTENTIAL | Likely remains foundational for heterogeneous compute and model-serving data paths. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-142; corpus sources: RAW-0467 |
| EXTERNAL EVIDENCE | Official repository, release, format and Flight documentation checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Benchmark representative evidence/table/array transfers; define schema evolution, digest and ownership rules; verify zero-copy claims in each language boundary. |

### S-007 — Bazel / Skyframe / Remote Execution API

| FIELD | VALUE |
| --- | --- |
| PROJECT | Bazel / Skyframe / Remote Execution API |
| CANONICAL REPOSITORY / SOURCE | https://github.com/bazelbuild/bazel |
| ORGANIZATION | Bazel community / Google |
| CURRENT / RELEVANT VERSION | 9.2 release line current in August 2026; exact patch revalidate |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature build-system architecture and remote-execution protocol family. |
| DOMAIN | Compiler / build / execution |
| SUBDOMAIN | Incremental hermetic action graphs |
| ARCHITECTURE FAMILY | Dependency graph + content-addressed action identity + remote execution |
| PRIMARY PROBLEM | Correctly avoid recomputation while retaining exact invalidation reasons and reproducible action descriptions. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED + failure/issue evidence; not executed |
| CONFIDENCE | HIGH architectural transfer; MEDIUM direct reuse |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Skyframe incremental evaluation, hermetic actions, action cache, CAS, REAPI, remote workers, sandboxing, dependency discovery. |
| CORE ARCHITECTURE | Typed-ish rule graph evaluates action keys derived from declared inputs/toolchains/configuration; results are cached by content identity. |
| BEST COMPONENTS | Best cross-domain reference for scientific action identity, invalidation and retained derivations. |
| RELEVANT SOURCE / PACKAGE AREAS | Skyframe evaluator; action cache/CAS; remote execution protos; sandbox and rule analysis packages. |
| LANGUAGE / STACK | Java/C++/Starlark; gRPC/Protobuf REAPI. |
| STATE MODEL | Dependency graph, action metadata, CAS blobs and cache results. |
| EXECUTION MODEL | Local or remote action scheduler with explicit inputs/outputs. |
| CONCURRENCY MODEL | Parallel graph evaluation and remote worker execution. |
| EXTENSION MODEL | Starlark rules/aspects/toolchains and REAPI implementations. |
| SECURITY MODEL | Hermetic sandbox, CAS integrity and remote worker trust/attestation are separate concerns. |
| OBSERVABILITY MODEL | Build event protocol, action logs, cache diagnostics. |
| PERFORMANCE TECHNIQUES | Incremental recomputation, remote cache/execution, parallel scheduling; undeclared inputs create fast wrong answers. |
| DEPLOYMENT MODEL | Developer machines, CI and remote execution clusters. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Large-scale production build evidence. |
| WEAKNESSES | Build semantics are not interactive agent/effect semantics; dynamic science can violate declared-dependency assumptions. |
| KNOWN FAILURE MODES | Source mutation during build, environment leakage, untracked tools, cache upload loss, poisoned cache/symlink trust boundaries. |
| CROSS-DOMAIN VALUE | Build systems to scientific experiment compilation. |
| POTENTIAL FAR-LAB VALUE | Reference architecture for typed research action graph and cache correctness. |
| POSSIBLE FUTURE ADOPTION MODES | EXTRACT/ADAPT semantics; use REAPI/CAS where workloads fit. |
| LEGAL / LICENSE CONCERNS | Apache-2.0. |
| INTEGRATION RISKS | Overforcing dynamic research into static build rules; cache/evidence conflation. |
| LONG-TERM RISKS | Rule/toolchain complexity and remote cache trust. |
| FUTURE POTENTIAL | Research plans compiled to hermetic action graphs with explicit invalidation. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: EXT-002, C-102; corpus sources: RAW-0010, RAW-0465 |
| EXTERNAL EVIDENCE | Official Bazel and Remote Execution API docs/issues checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Compile a representative FAR experiment into actions; inject undeclared dependencies and cache corruption; prove from-scratch equivalence and explain every invalidation. |

### S-008 — MLIR

| FIELD | VALUE |
| --- | --- |
| PROJECT | MLIR |
| CANONICAL REPOSITORY / SOURCE | https://github.com/llvm/llvm-project/tree/main/mlir |
| ORGANIZATION | LLVM Project |
| CURRENT / RELEVANT VERSION | LLVM stable 22.1.8 verified 2026-06-16; MLIR ships with LLVM; revalidate |
| LICENSE | Apache-2.0 WITH LLVM-exception |
| STATUS / MAINTENANCE | Mature compiler infrastructure with rapidly evolving dialect ecosystem. |
| DOMAIN | Compiler / execution |
| SUBDOMAIN | Typed extensible intermediate representation |
| ARCHITECTURE FAMILY | Multi-level IR with dialects, rewrites and staged lowering |
| PRIMARY PROBLEM | Represent research plans, computations, devices and transformations in a form that can be validated, optimized and lowered to heterogeneous executors. |
| EVIDENCE LEVEL | AUTHORITATIVE_SOURCE_VERIFIED + OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | HIGH architecture; LOW-MEDIUM immediate adoption |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Custom dialects/types/attributes/operations, verifiers, pass manager, pattern rewriting, interfaces, serialization, lowering to LLVM/GPU/other targets. |
| CORE ARCHITECTURE | IR keeps domain structure at multiple abstraction levels rather than erasing it into a single low-level graph. |
| BEST COMPONENTS | Powerful structure-preserving execution IR and validation boundary. |
| RELEVANT SOURCE / PACKAGE AREAS | mlir/include/mlir/IR; Dialect; Pass; Rewrite; ExecutionEngine; tools/mlir-*. |
| LANGUAGE / STACK | C++ with Python bindings; integrates LLVM. |
| STATE MODEL | SSA-based modules/regions/blocks/operations with typed attributes. |
| EXECUTION MODEL | Compilation and transformation pipeline; optional JIT/execution engines. |
| CONCURRENCY MODEL | Pass infrastructure and target runtimes; execution concurrency expressed by dialects. |
| EXTENSION MODEL | First-class dialect and interface registration. |
| SECURITY MODEL | IR verification limits malformed programs; generated code still needs sandbox/policy. |
| OBSERVABILITY MODEL | Pass diagnostics, IR dumps and provenance must be augmented for scientific derivations. |
| PERFORMANCE TECHNIQUES | Enables target-specific lowering, fusion and optimization; compiler complexity and compile latency are tradeoffs. |
| DEPLOYMENT MODEL | Compiler library/toolchain embedded in services or clients. |
| MATURITY | Mature infrastructure; FAR dialect hypothetical. |
| ADOPTION EVIDENCE | Major compiler/ML ecosystem use. |
| WEAKNESSES | High engineering cost; inappropriate if FAR workflows remain mostly dynamic/untyped. |
| KNOWN FAILURE MODES | Dialect/version churn, invalid transformations, semantic information loss during lowering. |
| CROSS-DOMAIN VALUE | Compiler architecture to scientific plans and effectful execution. |
| POTENTIAL FAR-LAB VALUE | Potential architecture for typed research-plan IR and staged lowering. |
| POSSIBLE FUTURE ADOPTION MODES | ADAPT concepts first; prototype minimal dialect only if concrete requirements justify. |
| LEGAL / LICENSE CONCERNS | Apache-2.0 WITH LLVM exception. |
| INTEGRATION RISKS | Overengineering, C++ toolchain burden, mismatch with interactive Python/TypeScript. |
| LONG-TERM RISKS | Custom dialect maintenance and upstream compatibility. |
| FUTURE POTENTIAL | Could unify CPU/GPU/HPC/browser/quantum lowering while preserving scientific constraints. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-112; corpus sources: RAW-0466 |
| EXTERNAL EVIDENCE | Official LLVM/MLIR repository, releases and architecture docs checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Define a minimal research-plan schema first; compare JSON/Protobuf/DSL versus MLIR on validation, evolution and executor lowering before committing. |

### S-009 — Nix

| FIELD | VALUE |
| --- | --- |
| PROJECT | Nix |
| CANONICAL REPOSITORY / SOURCE | https://github.com/NixOS/nix |
| ORGANIZATION | NixOS / Nix community |
| CURRENT / RELEVANT VERSION | 2.35.x current in July–August 2026; exact patch revalidate |
| LICENSE | LGPL-2.1 |
| STATUS / MAINTENANCE | Mature, active package/build/environment system. |
| DOMAIN | Reproducibility / build |
| SUBDOMAIN | Environment identity and closure |
| ARCHITECTURE FAMILY | Pure/declarative derivations and content-addressed store |
| PRIMARY PROBLEM | Make software environments reconstructable and referentially identifiable rather than merely listing package names. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED; not executed |
| CONFIDENCE | HIGH primitive; MEDIUM product fit |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Derivations, immutable store paths, dependency closure, binary caches, flakes/profiles, sandboxed builds, reproducible deployment patterns. |
| CORE ARCHITECTURE | Build outputs are named by derivation/input identity; immutable store paths allow multiple versions and closure capture. |
| BEST COMPONENTS | Turns environment closure into an addressable artifact. |
| RELEVANT SOURCE / PACKAGE AREAS | src/libstore; evaluator; derivation/store/path code; daemon and sandbox. |
| LANGUAGE / STACK | C++/Nix language/shell. |
| STATE MODEL | Immutable store plus profiles/generations and derivation metadata. |
| EXECUTION MODEL | Sandboxed builds and realization of derivation graphs. |
| CONCURRENCY MODEL | Parallel build scheduler and binary cache substitution. |
| EXTENSION MODEL | Nix expressions, derivations, overlays/flakes and builders. |
| SECURITY MODEL | Sandbox and signed caches; input fetchers and builders remain supply-chain boundaries. |
| OBSERVABILITY MODEL | Build logs and derivation metadata; scientific provenance linkage must be added. |
| PERFORMANCE TECHNIQUES | Binary caches and closure reuse; evaluation/build latency and store growth are costs. |
| DEPLOYMENT MODEL | Developer/server/HPC environments; can produce OCI/container outputs. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Strong reproducibility/deployment ecosystem. |
| WEAKNESSES | Steep learning curve; reproducibility still fails with nondeterministic builds, mutable external services or hardware differences. |
| KNOWN FAILURE MODES | Hash collisions/derivation bugs, scheduler issues and impure inputs require continuous update discipline. |
| CROSS-DOMAIN VALUE | Functional package management to scientific provenance. |
| POTENTIAL FAR-LAB VALUE | Environment identity/reconstruction layer, not experiment validity. |
| POSSIBLE FUTURE ADOPTION MODES | ADAPT patterns; optional Nix-backed environment executor/profile. |
| LEGAL / LICENSE CONCERNS | LGPL-2.1; generated environments contain many licenses. |
| INTEGRATION RISKS | User experience, non-Nix platforms, hidden runtime inputs, large closure/storage cost. |
| LONG-TERM RISKS | Flake/CLI evolution and ecosystem complexity. |
| FUTURE POTENTIAL | Strong base for attested, content-addressed experiment environments. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: EXT-001; corpus sources: RAW-0010 |
| EXTERNAL EVIDENCE | Official repository/manual/current release line checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Reproduce one FAR computation on clean local and HPC/container environments; capture hardware/driver/network inputs and compare with OCI/Apptainer alternatives. |

### S-010 — Wasmtime + WASI + WebAssembly Component Model

| FIELD | VALUE |
| --- | --- |
| PROJECT | Wasmtime + WASI + WebAssembly Component Model |
| CANONICAL REPOSITORY / SOURCE | https://github.com/bytecodealliance/wasmtime |
| ORGANIZATION | Bytecode Alliance |
| CURRENT / RELEVANT VERSION | Wasmtime 45.0.0 last verified 2026-05-21; WASI 0.3 released 2026-06-11; revalidate current |
| LICENSE | Apache-2.0 WITH LLVM-exception; component specifications/licenses revalidate |
| STATUS / MAINTENANCE | Mature runtime with evolving component/WASI standards and active security patching. |
| DOMAIN | Security / runtime / plugins |
| SUBDOMAIN | Capability-scoped portable extension execution |
| ARCHITECTURE FAMILY | Wasm sandbox + interface types/WIT + host-granted capabilities |
| PRIMARY PROBLEM | Run third-party extensions across languages without loading arbitrary native code in-process. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED + SECURITY_ADVISORIES_INSPECTED; not executed |
| CONFIDENCE | HIGH architecture; MEDIUM workload compatibility |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | JIT/AOT Wasm, fuel/epoch interruption, memory/table limits, WASI resources, component model, WIT interfaces, host functions. |
| CORE ARCHITECTURE | Modules/components execute in an isolated linear-memory VM; host explicitly supplies filesystem/network/clock/random/resource capabilities. |
| BEST COMPONENTS | Stable language-neutral ABI direction and narrow capability surface. |
| RELEVANT SOURCE / PACKAGE AREAS | crates/wasmtime; cranelift; wasmtime-wasi; component tooling; WIT definitions. |
| LANGUAGE / STACK | Rust runtime with C/Python/.NET/other embeddings. |
| STATE MODEL | Module/component memory, tables, resources and optional serialized/precompiled artifacts. |
| EXECUTION MODEL | Embedded runtime invokes component exports and host imports. |
| CONCURRENCY MODEL | Multiple stores/instances; async host functions; resource limits per instance. |
| EXTENSION MODEL | WIT/component interfaces and host bindings. |
| SECURITY MODEL | Strong language/runtime boundary but not infallible; 2026 advisories included resource exhaustion and sandbox-escape/data-leak classes. |
| OBSERVABILITY MODEL | Host-controlled tracing/metrics; deterministic receipts must be implemented by FAR. |
| PERFORMANCE TECHNIQUES | Fast startup, AOT/JIT, pooling allocators; host calls/copies and sandbox checks add overhead. |
| DEPLOYMENT MODEL | Embedded local plugin host, edge or server; not a replacement for microVMs for arbitrary native workloads. |
| MATURITY | Mature runtime; component ecosystem emerging. |
| ADOPTION EVIDENCE | Substantial industry use; security-sensitive update cadence. |
| WEAKNESSES | WASI gaps for some native/scientific libraries; runtime CVEs; resource safety is not scientific safety. |
| KNOWN FAILURE MODES | Sandbox escape/data leakage, excessive resource consumption, incompatible component versions. |
| CROSS-DOMAIN VALUE | Browser/runtime capability security applied to scientific plugins. |
| POTENTIAL FAR-LAB VALUE | Preferred lightweight plugin tier, complementary to Firecracker/native sandboxes. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT/ADAPT for general third-party plugins after threat testing. |
| LEGAL / LICENSE CONCERNS | Permissive, but bundled runtimes/plugins have separate licenses. |
| INTEGRATION RISKS | Overgranting host functions, nondeterministic clocks/random/network, ABI/version churn. |
| LONG-TERM RISKS | Component/WASI standard evolution and native library compatibility. |
| FUTURE POTENTIAL | Potential universal scientific-plugin ABI and portable edge/browser executor. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-115, C-116, C-468, C-469; corpus sources: RAW-0466 |
| EXTERNAL EVIDENCE | Official Wasmtime/WASI/component sources, releases and security advisories checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Threat-test filesystem/network/clock/random/secrets/CPU/memory; compare startup/throughput and escape surface with child process, gVisor and Firecracker. |

### S-011 — MCP + ACP Protocol Decomposition

| FIELD | VALUE |
| --- | --- |
| PROJECT | MCP + ACP Protocol Decomposition |
| CANONICAL REPOSITORY / SOURCE | https://modelcontextprotocol.io/specification ; https://github.com/agentclientprotocol/agent-client-protocol |
| ORGANIZATION | MCP community / Agent Client Protocol community |
| CURRENT / RELEVANT VERSION | MCP 2026-07-28; ACP wire protocol v1 and artifact v0.13.3 verified 2026-05-22; revalidate SDKs |
| LICENSE | MCP spec repository MIT; ACP Apache-2.0; SDK/component licenses vary |
| STATUS / MAINTENANCE | Current interoperable protocols with distinct scopes; rapidly evolving ecosystem. |
| DOMAIN | Protocols / product architecture |
| SUBDOMAIN | Tools/data and workbench-agent boundary |
| ARCHITECTURE FAMILY | Stateless tool/context protocol + stateful client-agent session protocol |
| PRIMARY PROBLEM | Avoid coupling FAR-Lab tools, workbench and agents to one implementation or conflating transport session state with durable research state. |
| EVIDENCE LEVEL | OFFICIAL_SPEC_INSPECTED + SOURCE_INSPECTED; no FAR integration execution |
| CONFIDENCE | HIGH scope separation; MEDIUM stability |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | MCP tools/resources/prompts and capability negotiation; ACP sessions, plans, files, terminals, permissions, cancellation and updates. |
| CORE ARCHITECTURE | MCP is a request/response integration boundary with explicit state handles; ACP lets a client own workspace/environment while an agent supplies session behavior. FAR canonical state lives behind both. |
| BEST COMPONENTS | Separates two boundaries that universal “agent protocols” often confuse. |
| RELEVANT SOURCE / PACKAGE AREAS | Protocol schemas/specs and SDKs; exact host/client implementations vary. |
| LANGUAGE / STACK | JSON-RPC and language SDKs. |
| STATE MODEL | Protocol/session state only; durable ResearchRun/evidence/effects stay elsewhere. |
| EXECUTION MODEL | Adapters translate protocol calls into typed internal commands and projections. |
| CONCURRENCY MODEL | Multiple clients/tools/agents; cancellation and reconnect semantics must map explicitly. |
| EXTENSION MODEL | Protocol extensions/capabilities with version negotiation. |
| SECURITY MODEL | Authentication, authorization and permission requests; tool-supplied content/UI is untrusted. |
| OBSERVABILITY MODEL | Protocol events linked to canonical run/effect IDs. |
| PERFORMANCE TECHNIQUES | Cacheable capability lists and streaming updates; gateway translation adds overhead. |
| DEPLOYMENT MODEL | Local stdio/HTTP or remote gateways; editor/workbench clients. |
| MATURITY | MCP production-relevant; ACP emerging but credible. |
| ADOPTION EVIDENCE | Rapid ecosystem uptake; not proof of semantic completeness. |
| WEAKNESSES | Fast specification change; semantic loss in gateways; standards cannot supply scientific validity. |
| KNOWN FAILURE MODES | Protocol session becoming sole task owner; permission bypass; unsupported cancellation/resume semantics silently dropped. |
| CROSS-DOMAIN VALUE | LSP/DAP-style protocol boundaries applied to agents and tools. |
| POTENTIAL FAR-LAB VALUE | Core interoperability strategy and anti-lock-in boundary. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT specs; BUILD versioned internal gateway and loss-conformance matrix. |
| LEGAL / LICENSE CONCERNS | Review exact SDK, schema, documentation and host component. |
| INTEGRATION RISKS | Best-effort translation, stale capability caches, protocol-driven authority confusion. |
| LONG-TERM RISKS | Fragmentation among MCP/ACP/A2A/AG-UI and incompatible extensions. |
| FUTURE POTENTIAL | Negotiated agent/tool interoperability with explicit loss and safety semantics. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-071, C-074, C-449; corpus sources: RAW-0020, RAW-0465 |
| EXTERNAL EVIDENCE | Official MCP 2026-07-28 specification and ACP v1 repository/docs checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Prototype disconnect/reconnect, permission, cancellation and tool-result flows; prove no protocol ID is sole durable owner and unsupported semantics fail closed. |

### S-012 — FoundationDB

| FIELD | VALUE |
| --- | --- |
| PROJECT | FoundationDB |
| CANONICAL REPOSITORY / SOURCE | https://github.com/apple/foundationdb |
| ORGANIZATION | Apple / FoundationDB community |
| CURRENT / RELEVANT VERSION | CONFLICTING_EVIDENCE: docs show 7.3.79 while repository release material surfaced 7.3.69; revalidate exact supported release |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature distributed transactional key-value database; active maintenance. |
| DOMAIN | Databases / reliability |
| SUBDOMAIN | Transactional control state and deterministic simulation |
| ARCHITECTURE FAMILY | Ordered transactional KV with role-separated distributed architecture |
| PRIMARY PROBLEM | Provide strongly consistent control state and expose whole-cluster failures to deterministic simulation. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED; version conflict unresolved; not executed |
| CONFIDENCE | HIGH architecture; LOW-MEDIUM adoption fit |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Serializable ACID transactions, ordered key ranges, layers, replication, locality, backup/restore, deterministic simulation test harness. |
| CORE ARCHITECTURE | Stateless/role-separated processes coordinate through transactional logs/storage; database is intentionally minimal and extended through layers. |
| BEST COMPONENTS | Excellent reference for invariant-focused minimal core and deterministic whole-cluster testing. |
| RELEVANT SOURCE / PACKAGE AREAS | fdbserver; flow; fdbclient; simulation/workload tests. |
| LANGUAGE / STACK | C++/Flow with language bindings. |
| STATE MODEL | Ordered KV and transaction versions. |
| EXECUTION MODEL | Client transactions against distributed cluster roles. |
| CONCURRENCY MODEL | Optimistic transactions/conflict ranges; distributed role processes. |
| EXTENSION MODEL | Layer model and bindings. |
| SECURITY MODEL | Cluster/network configuration and tenant boundaries; not an execution sandbox. |
| OBSERVABILITY MODEL | Trace/event system and status JSON; separate audit required. |
| PERFORMANCE TECHNIQUES | Low-latency transactions and range operations; 10 MB affected-data transaction limit shapes design. |
| DEPLOYMENT MODEL | Distributed cluster; operationally substantial. |
| MATURITY | Mature |
| ADOPTION EVIDENCE | Production database and influential systems-research reference. |
| WEAKNESSES | Not a universal data store; transactional size/latency model unsuitable for large artifacts/arrays/search. |
| KNOWN FAILURE MODES | Transaction limits, operational complexity, version compatibility and layer correctness. |
| CROSS-DOMAIN VALUE | Database simulation discipline transferred to workflow/effect/control plane testing. |
| POTENTIAL FAR-LAB VALUE | Potential control-state substrate or simulation/testing reference; requires workload proof. |
| POSSIBLE FUTURE ADOPTION MODES | ARCHITECTURAL_REFERENCE or ADAPT for server-scale control state; not default local mode. |
| LEGAL / LICENSE CONCERNS | Apache-2.0. |
| INTEGRATION RISKS | Overcentralization, operational burden, treating KV as semantic model. |
| LONG-TERM RISKS | Version skew and specialized expertise. |
| FUTURE POTENTIAL | Deterministic simulation methodology may be more valuable than direct adoption. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-135, C-396; corpus sources: RAW-0467 |
| EXTERNAL EVIDENCE | Official repository/docs/releases and limits documentation checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Resolve current version; model FAR invariants and run deterministic simulation/fault workloads; compare with PostgreSQL/SQLite/other control stores. |

### S-013 — Hybrid Retrieval Plane

| FIELD | VALUE |
| --- | --- |
| PROJECT | Hybrid Retrieval Plane |
| CANONICAL REPOSITORY / SOURCE | Apache Lucene / Tantivy / Vespa primary sources |
| ORGANIZATION | Apache Software Foundation; Quickwit; Vespa.ai |
| CURRENT / RELEVANT VERSION | Lucene 10.5.1; Tantivy 0.26.1; Vespa rolling release—revalidate deployment |
| LICENSE | Apache-2.0 / MIT / Apache-2.0 |
| STATUS / MAINTENANCE | Mature lexical and ranking engines; integrated FAR retrieval planner remains hypothetical. |
| DOMAIN | Search / knowledge |
| SUBDOMAIN | Evidence-aware hybrid retrieval |
| ARCHITECTURE FAMILY | Immutable segments + lexical/sparse/dense/late-interaction retrieval + bounded multi-phase ranking |
| PRIMARY PROBLEM | Scientific/code queries require exact terms, filters, vectors, citations and cost-aware reranking; no one retrieval family dominates. |
| EVIDENCE LEVEL | SOURCE/OFFICIAL_DOCS_INSPECTED; no FAR benchmark |
| CONFIDENCE | HIGH family; LOW on final engine selection |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | BM25/postings/doc values/vector KNN; WAND/block-max pruning; code trigram search; sparse/dense/ColBERT; first/second/global ranking; provenance and freshness manifests. |
| CORE ARCHITECTURE | Canonical truth remains in evidence/artifact stores; indexes are rebuildable projections. Query planner selects retrieval funnel and records index/model/ranker versions. |
| BEST COMPONENTS | Corrects vector-only bias and makes retrieval a measured policy. |
| RELEVANT SOURCE / PACKAGE AREAS | Lucene core/index/search/codecs; Tantivy index/query; Vespa rank profiles/searchlib/content nodes. |
| LANGUAGE / STACK | Java, Rust and distributed C++/Java services. |
| STATE MODEL | Immutable index segments/splits, vector indexes, ranking models and freshness manifests. |
| EXECUTION MODEL | Filter → retrieve → merge → bounded rerank → evidence projection. |
| CONCURRENCY MODEL | Segment-level parallel search, distributed shards and background merges. |
| EXTENSION MODEL | Analyzers/codecs/rank profiles/custom tensors/query features. |
| SECURITY MODEL | Corpus ACL filtering before retrieval; untrusted documents/rankers; query and result provenance. |
| OBSERVABILITY MODEL | Recall/latency/cost/freshness per corpus and query family. |
| PERFORMANCE TECHNIQUES | WAND pruning, immutable splits, hot caches, phased ranking and bounded expensive inference. |
| DEPLOYMENT MODEL | Embedded Lucene/Tantivy or distributed Vespa/Quickwit-class services by workload. |
| MATURITY | Components mature; adaptive planner and evidence contract emerging. |
| ADOPTION EVIDENCE | Strong production search evidence. |
| WEAKNESSES | Operational/index complexity; evaluation corpora can leak; source identity resolution remains separate. |
| KNOWN FAILURE MODES | Index staleness, ranker drift, vector-only exact-term misses, active-screening false negatives, corrupt PDF extraction. |
| CROSS-DOMAIN VALUE | Classical IR, recommender cascades and database projections applied to scientific evidence. |
| POTENTIAL FAR-LAB VALUE | Core search architecture; exact engine selected per measured corpus frontier. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT Lucene/Tantivy-class lexical core; ADAPT Vespa-style phased ranking; benchmark before final physical selection. |
| LEGAL / LICENSE CONCERNS | Component-specific licenses; Quickwit AGPL if used. |
| INTEGRATION RISKS | Dual-write drift, unobservable coverage, ACL leakage, non-reproducible ranking. |
| LONG-TERM RISKS | Embedding/ranker churn and index rebuild cost. |
| FUTURE POTENTIAL | Adaptive query routing with calibrated abstention and provenance-preserving evidence synthesis. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-109, C-157, C-159, C-160, C-161, C-345, C-346; corpus sources: RAW-0020, RAW-0467 |
| EXTERNAL EVIDENCE | Official repositories/docs/releases plus BEIR/IR references checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Build FAR-specific corpora and relevance judgments; compare lexical/sparse/dense/late-interaction funnels on recall, latency, cost, provenance and freshness faults. |

### S-014 — Scientific Truth / Metrology Plane

| FIELD | VALUE |
| --- | --- |
| PROJECT | Scientific Truth / Metrology Plane |
| CANONICAL REPOSITORY / SOURCE | QUDT + UCUM + W3C PROV + bitemporal database references |
| ORGANIZATION | QUDT community; Regenstrief/UCUM; W3C; database communities |
| CURRENT / RELEVANT VERSION | QUDT 3.5.0; UCUM 2.2; specifications revalidate |
| LICENSE | QUDT CC BY 4.0; UCUM custom terms; component-specific review |
| STATUS / MAINTENANCE | Mature vocabularies and temporal/provenance primitives; integrated assertion/measurement plane is a FAR hypothesis. |
| DOMAIN | Scientific data / validity |
| SUBDOMAIN | Assertions, time, units, uncertainty and calibration |
| ARCHITECTURE FAMILY | Artifact–Entity–Proposition–Assertion model with bitemporal and metrology semantics |
| PRIMARY PROBLEM | A text+embedding record or a knowledge-graph edge cannot honestly represent conflicting claims, corrections, validity intervals, measurement units, uncertainty and calibration. |
| EVIDENCE LEVEL | OFFICIAL_SPEC_INSPECTED + CORPUS SYNTHESIS; no implementation |
| CONFIDENCE | HIGH problem; MEDIUM model |
| TIER | S |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Immutable artifacts; stable entities; unasserted propositions; source-scoped assertions; valid/system/observation/publication times; quantity kind, unit, uncertainty, calibration and frame. |
| CORE ARCHITECTURE | One logical truth model; full-text/vector/graph summaries are rebuildable projections. Assertions can support, contradict, supersede or qualify propositions without overwriting history. |
| BEST COMPONENTS | Preserves disagreement and scientific time; prevents vector DB or KG edge from masquerading as truth. |
| RELEVANT SOURCE / PACKAGE AREAS | Standards/ontologies and database temporal models; no single implementation selected. |
| LANGUAGE / STACK | Relational/bitemporal tables + provenance graph + semantic vocabularies; optional RDF/JSON-LD projections. |
| STATE MODEL | Versioned assertions and measurements linked to immutable artifacts/activities. |
| EXECUTION MODEL | Ingestion resolves identity and creates assertions; validity gate adjudicates without deleting disagreement. |
| CONCURRENCY MODEL | Transactional publication of assertions; source ingestion and projections may be parallel. |
| EXTENSION MODEL | Domain schema plugins for units, coordinate frames, methods and uncertainty. |
| SECURITY MODEL | Field-level source/license/privacy metadata and policy-scoped projections. |
| OBSERVABILITY MODEL | Correction/retraction propagation and projection freshness metrics. |
| PERFORMANCE TECHNIQUES | Incremental materialization and compact provenance circuits; semantic richness increases query/storage cost. |
| DEPLOYMENT MODEL | Logical authority may use multiple physical stores but prohibits competing truth owners. |
| MATURITY | Constituent ideas mature; integrated scientific truth plane emerging. |
| ADOPTION EVIDENCE | No single system satisfies the full contract. |
| WEAKNESSES | Complex identity resolution, schema governance and uncertainty semantics. |
| KNOWN FAILURE MODES | Last-write-wins metadata loss, boolean retraction simplification, unit mismatch, stale projections and polyglot-persistence disagreement. |
| CROSS-DOMAIN VALUE | Temporal databases, metrology, scholarly corrections and provenance algebra. |
| POTENTIAL FAR-LAB VALUE | Potential unique core for evidence-grounded scientific reasoning. |
| POSSIBLE FUTURE ADOPTION MODES | BUILD logical model; ADOPT QUDT/UCUM/PROV vocabulary where compatible; choose stores later. |
| LEGAL / LICENSE CONCERNS | UCUM and corpus/data licenses require explicit review; ontology attribution retained. |
| INTEGRATION RISKS | Overgeneralization, ontology mismatch, expensive entity resolution, duplicate authorities. |
| LONG-TERM RISKS | Schema migration and domain-plugin governance. |
| FUTURE POTENTIAL | Provenance-carrying values and automatic invalidation/reassessment when evidence changes. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-137, C-169, C-463, C-464; corpus sources: RAW-0467 |
| EXTERNAL EVIDENCE | Official QUDT, UCUM, W3C PROV and temporal-database sources checked 2026-08-20. |
| FUTURE INVESTIGATION OBLIGATION | Prototype contradictory literature and calibrated measurement cases; prove temporal correction, unit conversion, uncertainty and projection rebuild semantics. |

## 6. Tier A Subsystem Candidates

Tier A records are strong subsystem candidates or references for important capabilities. They still require current version/license checks, source inspection of the actual integration path and workload-specific execution.

### A-001 — Restate

| FIELD | VALUE |
| --- | --- |
| PROJECT | Restate |
| CANONICAL REPOSITORY / SOURCE | https://github.com/restatedev/restate |
| ORGANIZATION | Restate |
| CURRENT / RELEVANT VERSION | v1.7.2 verified 2026-07-06 |
| LICENSE | BSL-1.1; converts per-version to Apache-2.0 after four years |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Systems / durable services |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Journaled invocation state machine |
| PRIMARY PROBLEM | Durable service invocations, state and reliable communication. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Durable invocations, stateful services/objects, timers and reliable communication. |
| CORE ARCHITECTURE | A Rust runtime journals invocations and state transitions to provide durable RPC/service semantics. |
| BEST COMPONENTS | Strong reliable-communication and virtual-object model; useful alternative to workflow-centric APIs. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Journaled invocations and keyed service state. |
| EXECUTION MODEL | Services replay from journaled state. |
| SECURITY MODEL | Application and deployment policy; no replacement for FAR final effect gate. |
| OBSERVABILITY MODEL | Invocation state and telemetry. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Not OSI open source today; managed-service restrictions and journal semantics require legal/technical review. |
| KNOWN FAILURE MODES | License lock-in; external effect ambiguity still exists. |
| POTENTIAL FAR-LAB VALUE | Architecture reference for durable service actors and communication. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSL-1.1; converts per-version to Apache-2.0 after four years |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-002; corpus sources: RAW-0461 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/restatedev/restate |
| FUTURE INVESTIGATION OBLIGATION | Perform legal review, then compare cancellation, external-effect ambiguity, throughput and migration against Temporal/DBOS. |

### A-002 — RO-Crate

| FIELD | VALUE |
| --- | --- |
| PROJECT | RO-Crate |
| CANONICAL REPOSITORY / SOURCE | https://www.researchobject.org/ro-crate/ |
| ORGANIZATION | RO-Crate community |
| CURRENT / RELEVANT VERSION | Recommendation 1.2.0; 1.3 work-in-progress |
| LICENSE | Apache-2.0 specification |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Evidence / publishing |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | JSON-LD research-object package |
| PRIMARY PROBLEM | Package data, software, workflow, people and context for exchange and archiving. |
| EVIDENCE LEVEL | OFFICIAL_SPEC_INSPECTED |
| CONFIDENCE | HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Research object metadata, entities, contextual links, profiles and workflow-run profiles. |
| CORE ARCHITECTURE | A root data entity and contextual entities describe a research object using a constrained JSON-LD profile. |
| BEST COMPONENTS | Interoperable, human- and machine-readable, profileable, aligned with scholarly packaging. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Portable package metadata plus referenced artifacts. |
| EXTENSION MODEL | Profiles and additional vocabularies. |
| SECURITY MODEL | Integrity must come from digests/signatures outside core RO-Crate. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Not a transparency log, execution trace, validity proof or internal transactional model. |
| KNOWN FAILURE MODES | Incomplete packages and dangling references. |
| POTENTIAL FAR-LAB VALUE | External archival/interchange envelope around stronger FAR proof semantics. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 specification |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-170; corpus sources: RAW-0467 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://www.researchobject.org/ro-crate/ |
| FUTURE INVESTIGATION OBLIGATION | Produce and validate a complete FAR run crate; test profile extension, redaction and independent reconstruction. |

### A-003 — OpenLineage

| FIELD | VALUE |
| --- | --- |
| PROJECT | OpenLineage |
| CANONICAL REPOSITORY / SOURCE | https://github.com/OpenLineage/OpenLineage |
| ORGANIZATION | OpenLineage project |
| CURRENT / RELEVANT VERSION | Current schema/release revalidate |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Evidence / data engineering |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Operational job/run/dataset lineage event schema |
| PRIMARY PROBLEM | Interoperate with data pipelines and capture operational lineage events. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Run/job/dataset events and facets. |
| CORE ARCHITECTURE | Producers emit versioned RunEvent records for jobs, runs and datasets with extensible facets. |
| BEST COMPONENTS | Useful open event vocabulary with source-code/schema/data-quality/column-lineage facets. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Append-only events; downstream lineage graph is projection. |
| EXTENSION MODEL | Facets. |
| OBSERVABILITY MODEL | Operational lineage by design. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Operational lineage is weaker than scientific causality, claims and immutable research packages. |
| KNOWN FAILURE MODES | Event loss/out-of-order delivery; semantic overclaim. |
| POTENTIAL FAR-LAB VALUE | Projection/event bridge from FAR execution into data ecosystem. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-078, C-171; corpus sources: RAW-0020, RAW-0467 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/OpenLineage/OpenLineage |
| FUTURE INVESTIGATION OBLIGATION | Map one research run without flattening evidence assertions; test schema evolution and out-of-order events. |

### A-004 — Sigstore / Rekor / in-toto

| FIELD | VALUE |
| --- | --- |
| PROJECT | Sigstore / Rekor / in-toto |
| CANONICAL REPOSITORY / SOURCE | https://github.com/sigstore/sigstore ; https://github.com/in-toto/in-toto |
| ORGANIZATION | Sigstore and in-toto communities |
| CURRENT / RELEVANT VERSION | Component versions revalidate |
| LICENSE | Apache-2.0 implementations; component-specific review |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Supply-chain trust / evidence |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Signed typed attestations plus transparency inclusion |
| PRIMARY PROBLEM | Bind artifact identities to signed build/execution statements and public log evidence. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Attestations, signatures, identity binding, transparency proofs. |
| CORE ARCHITECTURE | in-toto predicates/statements describe supply-chain steps; Sigstore/cosign signs artifacts/attestations and Rekor records transparency entries. |
| BEST COMPONENTS | Mature authenticity/transparency primitives and strong interoperability with OCI/SLSA. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Signed statements and Merkle-log entries. |
| SECURITY MODEL | Cryptographic identity and verification; trust roots and policy are external. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Authenticity and log inclusion do not establish completeness, reproducibility or scientific validity. |
| KNOWN FAILURE MODES | Signed invalid science; compromised issuer; unavailable log. |
| POTENTIAL FAR-LAB VALUE | Tamper-evident layer of FAR Evidence Envelope. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 implementations; component-specific review |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-081, C-082, C-306, C-307, C-308; corpus sources: RAW-0020, RAW-0531 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/sigstore/sigstore ; https://github.com/in-toto/in-toto |
| FUTURE INVESTIGATION OBLIGATION | Sign a `.far-proof` research package, verify offline, rotate identities/keys and test missing/false-but-signed claims. |

### A-005 — Zarr

| FIELD | VALUE |
| --- | --- |
| PROJECT | Zarr |
| CANONICAL REPOSITORY / SOURCE | https://github.com/zarr-developers/zarr-python |
| ORGANIZATION | Zarr community |
| CURRENT / RELEVANT VERSION | v3.3.0 verified 2026-07-30 |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Scientific data / storage |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Chunked compressed N-dimensional array format |
| PRIMARY PROBLEM | Store cloud/object-friendly multidimensional arrays with chunked parallel access. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | HIGH identity; MEDIUM workload fit |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Zarr v2/v3 arrays, groups, chunking, codecs and multiple stores. |
| CORE ARCHITECTURE | Metadata describes arrays/groups/chunks/codecs; clients map chunk keys to local/object storage and operate asynchronously/concurrently. |
| BEST COMPONENTS | Widely used format, parallel/chunked access, extensible codecs and cloud fit. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Chunk objects plus metadata. |
| EXECUTION MODEL | Library-level reads/writes. |
| PERFORMANCE TECHNIQUES | Chunk locality, parallel I/O and compression; poor chunk shape causes cliffs. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Concurrent write semantics and metadata consistency depend on store/implementation; not a transaction database. |
| KNOWN FAILURE MODES | Partial metadata/chunk publication, incompatible codecs, small-object explosion. |
| POTENTIAL FAR-LAB VALUE | Primary array artifact format candidate and projection substrate. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-149; corpus sources: RAW-0467 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/zarr-developers/zarr-python |
| FUTURE INVESTIGATION OBLIGATION | Benchmark representative arrays, partial writes, metadata consolidation, concurrent writers and recovery on target object stores. |

### A-006 — TensorStore

| FIELD | VALUE |
| --- | --- |
| PROJECT | TensorStore |
| CANONICAL REPOSITORY / SOURCE | https://github.com/google/tensorstore |
| ORGANIZATION | Google open source |
| CURRENT / RELEVANT VERSION | Rolling; exact release UNKNOWN |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Scientific data / storage |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Asynchronous transactional multidimensional array access |
| PRIMARY PROBLEM | Provide uniform high-throughput access to large arrays across local, object and format backends. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Views/index transforms, Zarr/N5 drivers, S3/GCS/HTTP, cache and transactions. |
| CORE ARCHITECTURE | Composable index transforms/views and asynchronous operations sit over drivers such as Zarr/N5 with caching, transactions and optimistic concurrency. |
| BEST COMPONENTS | Advanced indexing, async remote I/O, caching and cross-process consistency mechanisms. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Driver-backed arrays and cache state. |
| EXECUTION MODEL | Async futures and concurrent I/O. |
| PERFORMANCE TECHNIQUES | Multicore, concurrent high-latency I/O and read/writeback caching. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Complex C++/Python API and rolling release; not an archival format or metadata standard. |
| KNOWN FAILURE MODES | Stale cache, optimistic-concurrency conflicts, backend semantic mismatch. |
| POTENTIAL FAR-LAB VALUE | High-performance array access layer above immutable/transactional stores. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: EXT-005; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/google/tensorstore |
| FUTURE INVESTIGATION OBLIGATION | Run faulted concurrent-read/write and cloud-latency benchmarks; verify transaction boundaries and cache invalidation. |

### A-007 — OpenAlex / OpenCitations / Crossref

| FIELD | VALUE |
| --- | --- |
| PROJECT | OpenAlex / OpenCitations / Crossref |
| CANONICAL REPOSITORY / SOURCE | https://openalex.org ; https://opencitations.net ; https://www.crossref.org |
| ORGANIZATION | Independent scholarly infrastructure providers |
| CURRENT / RELEVANT VERSION | Rolling datasets/APIs; snapshot dates must be recorded |
| LICENSE | Data licenses and terms differ by source |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Scholarly knowledge |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Heterogeneous scholarly graphs with source-specific identity |
| PRIMARY PROBLEM | Supply open metadata, citation and update signals without collapsing source disagreement. |
| EVIDENCE LEVEL | AUTHORITATIVE_PAGE_OR_SPEC_VERIFIED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Works/authors/institutions/citations/updates and snapshots/APIs. |
| CORE ARCHITECTURE | Each provider exposes distinct IDs, snapshots/APIs, update semantics and derived fields; FAR retains source-scoped assertions and reversible identity links. |
| BEST COMPONENTS | Broad scholarly coverage, open citation data and post-publication update signals. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Source snapshots and source-scoped records. |
| SECURITY MODEL | Respect data terms and privacy; derived fields marked. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Coverage, licensing, derivation and correction semantics differ; canonicalization can lose disagreement. |
| KNOWN FAILURE MODES | Boolean retraction simplification, ID collision, stale graph, source bias. |
| POTENTIAL FAR-LAB VALUE | Core external scholarly data sources feeding a provenance-preserving truth plane. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Provider-specific data licenses/terms; do not infer one common license. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-118, C-165, C-167, C-168, C-353; corpus sources: RAW-0020, RAW-0467 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://openalex.org ; https://opencitations.net ; https://www.crossref.org |
| FUTURE INVESTIGATION OBLIGATION | Measure coverage/freshness by domain; test retractions/corrections, ID merges and source disagreement. |

### A-008 — vLLM

| FIELD | VALUE |
| --- | --- |
| PROJECT | vLLM |
| CANONICAL REPOSITORY / SOURCE | https://github.com/vllm-project/vllm |
| ORGANIZATION | vLLM project |
| CURRENT / RELEVANT VERSION | v0.23.0 verified 2026-06-12 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | AI systems / compute |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Paged KV + continuous batching inference server |
| PRIMARY PROBLEM | Serve open models efficiently under variable-length concurrent workloads. |
| EVIDENCE LEVEL | AUTHORITATIVE_DOCS_VERIFIED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | PagedAttention, continuous batching, quantization, distributed serving and prefix caching. |
| CORE ARCHITECTURE | Engine virtualizes KV cache pages and continuously batches token steps; distributed executors and OpenAI-compatible APIs expose serving. |
| BEST COMPONENTS | Leading production/reference implementation for high-throughput LLM serving. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Ephemeral KV/prefix/scheduler state. |
| EXECUTION MODEL | GPU token scheduler and worker processes. |
| PERFORMANCE TECHNIQUES | High GPU utilization; tail latency/fairness and OOM must be measured. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Fast-moving kernels/model support; throughput claims are hardware/model/workload-specific; caches are disposable serving state. |
| KNOWN FAILURE MODES | KV leaks/stale keys, OOM, wrong outputs under unsupported combinations. |
| POTENTIAL FAR-LAB VALUE | Commodity serving backend candidate behind measured capability registry. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-179; corpus sources: RAW-0502 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/vllm-project/vllm |
| FUTURE INVESTIGATION OBLIGATION | Benchmark FAR tool-use/schema/long-context workloads against SGLang and hosted providers; inject cache and cancellation faults. |

### A-009 — SGLang

| FIELD | VALUE |
| --- | --- |
| PROJECT | SGLang |
| CANONICAL REPOSITORY / SOURCE | https://github.com/sgl-project/sglang |
| ORGANIZATION | SGLang project |
| CURRENT / RELEVANT VERSION | v0.5.13 stable verified 2026-06-13; later nightly exists |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | AI systems / compute |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Radix/prefix-aware serving and structured generation runtime |
| PRIMARY PROBLEM | Serve LLMs/VLMs with efficient prefix reuse, structured generation and programmable front-end. |
| EVIDENCE LEVEL | AUTHORITATIVE_DOCS_VERIFIED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Continuous batching, prefix/radix cache, structured generation, distributed serving. |
| CORE ARCHITECTURE | A serving engine schedules requests and manages reusable prefix trees/KV state with structured-output integrations. |
| BEST COMPONENTS | Strong serving performance and agent/structured-output relevance. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Ephemeral prefix/KV and scheduler state. |
| PERFORMANCE TECHNIQUES | Prefix reuse and optimized kernels; workload-dependent. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Rapid release cadence; feature combinations and nightly builds increase correctness risk. |
| KNOWN FAILURE MODES | Cache isolation, multimodal keys, feature compatibility and resource leaks. |
| POTENTIAL FAR-LAB VALUE | Primary comparator to vLLM for FAR model-serving workloads. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-180; corpus sources: RAW-0502 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/sgl-project/sglang |
| FUTURE INVESTIGATION OBLIGATION | Pin stable release; benchmark tool calls, constrained decoding, multimodal, cancellation and cache isolation. |

### A-010 — Triton Language

| FIELD | VALUE |
| --- | --- |
| PROJECT | Triton Language |
| CANONICAL REPOSITORY / SOURCE | https://github.com/triton-lang/triton |
| ORGANIZATION | Triton/LLVM community |
| CURRENT / RELEVANT VERSION | Rolling; exact current release revalidate |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Compiler / GPU |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Python-like GPU kernel language and compiler |
| PRIMARY PROBLEM | Generate specialized GPU kernels without hand-writing CUDA while exposing block/program-level optimization. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Custom GPU kernels, autotuning, compiler optimizations. |
| CORE ARCHITECTURE | Triton programs compile through an MLIR/LLVM-based stack to target-specific GPU code. |
| BEST COMPONENTS | Productive kernel specialization and broad modern ML-system use. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| EXECUTION MODEL | Compile and launch GPU programs. |
| PERFORMANCE TECHNIQUES | Fusion, tile-level control and autotuning. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Dynamic shapes/heuristics can choose wrong kernels; hardware/version compatibility moves quickly. |
| KNOWN FAILURE MODES | Wrong/slow dynamic-shape specialization, silent fallback, numerical regressions. |
| POTENTIAL FAR-LAB VALUE | Kernel compiler reference and optional backend, not FAR core API. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-203, C-361; corpus sources: RAW-0502 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/triton-lang/triton |
| FUTURE INVESTIGATION OBLIGATION | Benchmark only kernels that dominate FAR workloads; validate numerical correctness across shapes/devices. |

### A-011 — Firecracker

| FIELD | VALUE |
| --- | --- |
| PROJECT | Firecracker |
| CANONICAL REPOSITORY / SOURCE | https://github.com/firecracker-microvm/firecracker |
| ORGANIZATION | AWS open source |
| CURRENT / RELEVANT VERSION | v1.16.1 verified 2026-07-02 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / isolation |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Minimal KVM microVM VMM |
| PRIMARY PROBLEM | Isolate untrusted native workloads with a smaller device model and fast startup. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED + SECURITY_ADVISORIES_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | MicroVM lifecycle, jailer, rate limiters, snapshots and device model. |
| CORE ARCHITECTURE | A VMM exposes a minimal virtual hardware surface, jailer/seccomp controls and snapshot/restore APIs. |
| BEST COMPONENTS | Strong kernel boundary relative to containers; mature microVM architecture. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | VM memory/device/disk state plus host resources. |
| SECURITY MODEL | KVM boundary, seccomp and jailer; patch advisories mandatory. |
| PERFORMANCE TECHNIQUES | Fast startup/dense microVMs but heavier than Wasm. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Linux/KVM operational burden; snapshots contain secrets and are version-sensitive; not immune to VMM/kernel bugs. |
| KNOWN FAILURE MODES | Snapshot/vsock restore defects, UART/OOB and jailer/symlink advisories. |
| POTENTIAL FAR-LAB VALUE | Strong sandbox tier for native/untrusted workloads, complementary to Wasm. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-017; corpus sources: RAW-0461 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/firecracker-microvm/firecracker |
| FUTURE INVESTIGATION OBLIGATION | Threat-model target workloads; test escape/resource isolation, snapshot compatibility and startup/cost against gVisor/Kata. |

### A-012 — Extism

| FIELD | VALUE |
| --- | --- |
| PROJECT | Extism |
| CANONICAL REPOSITORY / SOURCE | https://github.com/extism/extism |
| ORGANIZATION | Extism / Dylibso |
| CURRENT / RELEVANT VERSION | Current version UNKNOWN; active in 2026 |
| LICENSE | BSD-3-Clause for main repository; verify SDKs |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / plugins |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Cross-language WebAssembly plugin host |
| PRIMARY PROBLEM | Offer a higher-level plugin SDK/ABI over Wasm with host-controlled capabilities. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Plugin manifests, host functions, SDKs, runtime limiters and HTTP controls. |
| CORE ARCHITECTURE | Hosts load Wasm plugins and expose explicit host functions, HTTP controls, timers, limits and optional persistent memory. |
| BEST COMPONENTS | Practical multilingual plugin model and mature SDK ergonomics. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Wasm memory plus optional persisted variables. |
| EXTENSION MODEL | Plugin ABI and host function registry. |
| SECURITY MODEL | Host-controlled capabilities over Wasm. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Security depends on host function design; persistent plugin state complicates determinism; smaller ecosystem than raw Wasmtime. |
| POTENTIAL FAR-LAB VALUE | Reference/implementation candidate for FAR scientific plugin ABI. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-3-Clause for main repository; verify SDKs |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-405; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/extism/extism |
| FUTURE INVESTIGATION OBLIGATION | Prototype one plugin in three languages; test capability denial, state migration, timeout and ABI upgrade. |

### A-013 — SPIFFE / SPIRE

| FIELD | VALUE |
| --- | --- |
| PROJECT | SPIFFE / SPIRE |
| CANONICAL REPOSITORY / SOURCE | https://github.com/spiffe/spire |
| ORGANIZATION | SPIFFE community / CNCF |
| CURRENT / RELEVANT VERSION | SPIRE v1.15.2 verified 2026-07-09 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / identity |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Attested workload identity and short-lived SVIDs |
| PRIMARY PROBLEM | Give machines/workloads cryptographically verifiable identities without long-lived shared secrets. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | SPIFFE IDs, X.509/JWT SVIDs, Workload API, federation and attestors. |
| CORE ARCHITECTURE | Node and workload attestors authorize issuance of SPIFFE IDs/SVIDs via Workload API; trust domains federate explicitly. |
| BEST COMPONENTS | Mature workload identity plane with strong rotation/attestation model. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Registration entries, trust bundles and short-lived credentials. |
| SECURITY MODEL | Workload attestation and credential rotation. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Identity does not decide authorization or scientific authority; deployment/attestor complexity. |
| KNOWN FAILURE MODES | Misconfigured selectors/trust domains, stale attestation, identity-authority confusion. |
| POTENTIAL FAR-LAB VALUE | Machine/workload identity input to FAR effect and evidence policy. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-305; corpus sources: RAW-0531 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/spiffe/spire |
| FUTURE INVESTIGATION OBLIGATION | Prototype local/Kubernetes/HPC identities; bind SVID to effect receipt and verify rotation/revocation behavior. |

### A-014 — Open Policy Agent

| FIELD | VALUE |
| --- | --- |
| PROJECT | Open Policy Agent |
| CANONICAL REPOSITORY / SOURCE | https://github.com/open-policy-agent/opa |
| ORGANIZATION | Open Policy Agent / CNCF |
| CURRENT / RELEVANT VERSION | v1.17.0 verified 2026-05-28 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / authorization |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | General policy-as-code engine |
| PRIMARY PROBLEM | Centralize contextual authorization and admission rules instead of scattering allowlists. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Rego, bundles, APIs, partial evaluation and decision logs. |
| CORE ARCHITECTURE | Rego policies evaluate JSON inputs/data; bundles and partial evaluation support distributed enforcement. |
| BEST COMPONENTS | Mature, expressive, embeddable and ecosystem-rich. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Policy/data bundles and decision inputs. |
| PERFORMANCE TECHNIQUES | Partial evaluation and local decisions. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Policy/data freshness, TOCTOU and language complexity; relationship semantics may fit OpenFGA/SpiceDB better. |
| KNOWN FAILURE MODES | Shutdown regression history, stale policy, decision/effect TOCTOU. |
| POTENTIAL FAR-LAB VALUE | Policy decision engine feeding final effect gate, not the gate itself. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-303; corpus sources: RAW-0531 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/open-policy-agent/opa |
| FUTURE INVESTIGATION OBLIGATION | Model effect permissions, cache/partial-eval safety and policy-version receipts; test revocation races. |

### A-015 — Cedar

| FIELD | VALUE |
| --- | --- |
| PROJECT | Cedar |
| CANONICAL REPOSITORY / SOURCE | https://github.com/cedar-policy/cedar |
| ORGANIZATION | Cedar Policy |
| CURRENT / RELEVANT VERSION | v4.12.0 verified 2026-07-28 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / authorization |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Schema-aware authorization policy language |
| PRIMARY PROBLEM | Express fast, analyzable principal-action-resource-context policies with validation. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Policy evaluator, schemas, entities, validator and tooling. |
| CORE ARCHITECTURE | Policies evaluate over entities and context; schemas validate policy/entity/action shapes and formal methods support language assurance. |
| BEST COMPONENTS | Narrow authorization focus, strong validation and formal-analysis story. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Policy sets, schemas and entity graph. |
| SECURITY MODEL | Authorization-specific. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Schema validation is separate from runtime data correctness; relationship-heavy models may need an external graph. |
| KNOWN FAILURE MODES | Schema/runtime mismatch and stale entities. |
| POTENTIAL FAR-LAB VALUE | Candidate for effect authorization language and proof-oriented policy core. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-304; corpus sources: RAW-0531 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/cedar-policy/cedar |
| FUTURE INVESTIGATION OBLIGATION | Encode FAR delegated authority and compare ergonomics/latency/formal obligations with OPA. |

### A-016 — OpenFGA / SpiceDB

| FIELD | VALUE |
| --- | --- |
| PROJECT | OpenFGA / SpiceDB |
| CANONICAL REPOSITORY / SOURCE | https://github.com/openfga/openfga ; https://github.com/authzed/spicedb |
| ORGANIZATION | OpenFGA / Authzed |
| CURRENT / RELEVANT VERSION | OpenFGA v1.18.1 verified 2026-06-29; SpiceDB current revalidate |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Security / collaboration |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Zanzibar-style relationship-based authorization |
| PRIMARY PROBLEM | Represent project, organization, artifact and delegated-access relationships at scale. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Authorization models, relationship tuples, checks, listing and consistency tokens. |
| CORE ARCHITECTURE | Tuple/relation graphs and authorization models answer checks/listing/expansion queries; policy/effect enforcement remains separate. |
| BEST COMPONENTS | Strong ReBAC semantics, auditable relationships and mature design lineage. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Relationship graph and model versions. |
| SECURITY MODEL | ReBAC authority. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Consistency/latency/model complexity; does not evaluate arbitrary contextual policy or bind decision atomically to effects. |
| KNOWN FAILURE MODES | Stale relationship read, model migration and permission graph mistakes. |
| POTENTIAL FAR-LAB VALUE | Collaboration/ownership graph combined with OPA/Cedar and final effect gate. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-388, C-389; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/openfga/openfga ; https://github.com/authzed/spicedb |
| FUTURE INVESTIGATION OBLIGATION | Prototype project/data/artifact sharing, offline revocation and consistency requirements; compare query cost. |

### A-017 — TLA+ / TLC + Apalache

| FIELD | VALUE |
| --- | --- |
| PROJECT | TLA+ / TLC + Apalache |
| CANONICAL REPOSITORY / SOURCE | https://github.com/tlaplus/tlaplus ; https://github.com/apalache-mc/apalache |
| ORGANIZATION | TLA+ community / Informal Systems |
| CURRENT / RELEVANT VERSION | Apalache v0.58.3 verified 2026-07-09; CLI tools current; Eclipse Toolbox unmaintained |
| LICENSE | MIT for TLA+; Apalache license revalidate |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Formal methods / reliability |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Explicit-state and symbolic model checking |
| PRIMARY PROBLEM | Check critical distributed/effect/policy protocols against temporal safety and liveness invariants. |
| EVIDENCE LEVEL | SOURCE/OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Temporal logic specs, model checking, invariants and counterexamples. |
| CORE ARCHITECTURE | TLA+ specifications model states/transitions; TLC enumerates states and Apalache uses SMT-backed symbolic checking for supported fragments. |
| BEST COMPONENTS | Excellent for small high-risk state machines and counterexample discovery. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Abstract protocol states. |
| EXECUTION MODEL | CLI/model checker. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Model/implementation gap; state explosion; not a proof of all code. Legacy Eclipse Toolbox should not anchor workflow. |
| KNOWN FAILURE MODES | Incorrect abstraction, unchecked assumptions, implementation divergence. |
| POTENTIAL FAR-LAB VALUE | Verification ladder for effect ledger, ownership, recovery, policy and publication protocols. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT for TLA+; Apalache license revalidate |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-316, C-391; corpus sources: RAW-0531 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/tlaplus/tlaplus ; https://github.com/apalache-mc/apalache |
| FUTURE INVESTIGATION OBLIGATION | Formalize generation/fencing/unknown-effect and offline-revocation protocols; connect traces to implementation tests. |

### A-018 — marimo

| FIELD | VALUE |
| --- | --- |
| PROJECT | marimo |
| CANONICAL REPOSITORY / SOURCE | https://github.com/marimo-team/marimo |
| ORGANIZATION | marimo team |
| CURRENT / RELEVANT VERSION | v0.23.15 verified 2026-07-23 |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Product / notebooks |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Reactive versionable Python notebook |
| PRIMARY PROBLEM | Eliminate hidden notebook execution order and make interactive documents reproducible/versionable. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Reactive graph, Python source, UI elements, SQL and app deployment. |
| CORE ARCHITECTURE | Cells form a dependency graph; edits invalidate and recompute downstream cells; notebooks are stored as ordinary Python files. |
| BEST COMPONENTS | Reactive semantics, source-control friendliness and app mode. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Source file plus runtime values/dependency graph. |
| PERFORMANCE TECHNIQUES | Selective recomputation. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Proxy/auth/embedding and large-state behavior need proof; reactive recomputation can trigger expensive or unsafe effects. |
| KNOWN FAILURE MODES | Proxy/auth embedding fragility; accidental effect re-execution. |
| POTENTIAL FAR-LAB VALUE | Reference/possible component for reactive scientific workspace, with effects isolated from pure cells. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: EXT-004; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/marimo-team/marimo |
| FUTURE INVESTIGATION OBLIGATION | Run long notebooks with expensive/side-effectful cells, collaboration and kernel failure; define pure/effect cell semantics. |

### A-019 — JupyterLab

| FIELD | VALUE |
| --- | --- |
| PROJECT | JupyterLab |
| CANONICAL REPOSITORY / SOURCE | https://github.com/jupyterlab/jupyterlab |
| ORGANIZATION | Project Jupyter |
| CURRENT / RELEVANT VERSION | v4.6.2 verified 2026-07-21 |
| LICENSE | BSD-3-Clause |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Product / workbench |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Extensible document/workspace shell |
| PRIMARY PROBLEM | Provide a mature multi-document scientific workbench, kernels and extension host. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Documents, kernels, terminals, workspaces, settings and extensions. |
| CORE ARCHITECTURE | Lumino-based application shell and federated extensions integrate notebooks, terminals, text editors, consoles and services. |
| BEST COMPONENTS | Mature ecosystem, familiar scientist UX and proven extension architecture. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Documents/workspaces/kernel sessions. |
| EXTENSION MODEL | Federated extensions. |
| SECURITY MODEL | Server auth, extension trust and kernel isolation are distinct. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Classic notebook hidden-state semantics, extension/supply-chain complexity and server security burden. |
| KNOWN FAILURE MODES | Hidden state, extension incompatibility, stale kernels. |
| POTENTIAL FAR-LAB VALUE | Reference/possible shell; FAR canonical state and reactive semantics must remain independent. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-3-Clause |
| SOURCE-CORPUS REFERENCES | Candidate IDs: EXT-003; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/jupyterlab/jupyterlab |
| FUTURE INVESTIGATION OBLIGATION | Prototype FAR panels/protocol adapters; threat-test extensions; test large datasets and recovery without making kernel state authoritative. |

### A-020 — Eclipse Theia

| FIELD | VALUE |
| --- | --- |
| PROJECT | Eclipse Theia |
| CANONICAL REPOSITORY / SOURCE | https://github.com/eclipse-theia/theia |
| ORGANIZATION | Eclipse Foundation |
| CURRENT / RELEVANT VERSION | v1.74.0 verified 2026-07-31 |
| LICENSE | EPL-2.0 with GPL-2.0 secondary |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Product / IDE |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Composable browser/desktop IDE platform |
| PRIMARY PROBLEM | Build a custom research IDE without forking VS Code while reusing LSP/DAP/extension patterns. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Editors, terminals, LSP/DAP, plugins, browser/desktop shell. |
| CORE ARCHITECTURE | Frontend/backend application architecture, dependency injection and plugin/extension compatibility expose modular IDE services. |
| BEST COMPONENTS | Customizable, protocol-oriented, browser/desktop deployment. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Workspace/UI/session state. |
| EXTENSION MODEL | Theia extensions and VS Code extensions. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Large framework surface, extension compatibility and product engineering burden. |
| KNOWN FAILURE MODES | Extension-host coupling, API drift and frontend/backend lifecycle bugs. |
| POTENTIAL FAR-LAB VALUE | Workbench shell reference if JupyterLab patterns are insufficient. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | EPL-2.0 with GPL-2.0 secondary |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-073; corpus sources: RAW-0465 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/eclipse-theia/theia |
| FUTURE INVESTIGATION OBLIGATION | Build a thin FAR workbench proof using ACP/LSP/DAP; compare bundle size, extension isolation and maintenance with JupyterLab/custom web UI. |

### A-021 — Quarto

| FIELD | VALUE |
| --- | --- |
| PROJECT | Quarto |
| CANONICAL REPOSITORY / SOURCE | https://github.com/quarto-dev/quarto-cli |
| ORGANIZATION | Quarto project / Posit ecosystem |
| CURRENT / RELEVANT VERSION | v1.10.18 stable verified 2026-07-24; 1.11.1 pre-release |
| LICENSE | MIT for CLI; editor/extension components may use other licenses |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Publishing / product |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Executable document compiler and multi-format publication |
| PRIMARY PROBLEM | Transform source documents, code and citations into reproducible scientific outputs. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Markdown, notebooks, citations, websites/books/papers/slides and extensions. |
| CORE ARCHITECTURE | A Pandoc-based build pipeline parses document metadata/markdown, executes engines and renders multiple output formats. |
| BEST COMPONENTS | Mature multi-format publishing, project/manuscript support and strong notebook integration. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Source documents, project config and generated outputs. |
| EXTENSION MODEL | Filters, extensions, engines and formats. |
| SECURITY MODEL | Code execution and extension trust must be sandboxed. |
| PERFORMANCE TECHNIQUES | Incremental project builds where supported. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Execution can be non-hermetic; round-trip visual editing and component licensing vary; publication success does not validate claims. |
| KNOWN FAILURE MODES | Non-hermetic execution, stale outputs and environment-dependent rendering. |
| POTENTIAL FAR-LAB VALUE | Publication substrate beneath a FAR claim/evidence review layer. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | CLI MIT; inspect each bundled/extension component. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-095, C-420; corpus sources: RAW-0465 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/quarto-dev/quarto-cli |
| FUTURE INVESTIGATION OBLIGATION | Create a signed executable manuscript with frozen inputs/environment; compare reproducibility and diff/round-trip behavior. |

### A-022 — OpenTelemetry Collector

| FIELD | VALUE |
| --- | --- |
| PROJECT | OpenTelemetry Collector |
| CANONICAL REPOSITORY / SOURCE | https://github.com/open-telemetry/opentelemetry-collector |
| ORGANIZATION | OpenTelemetry / CNCF |
| CURRENT / RELEVANT VERSION | Collector v0.159.0 release schedule verified 2026-08-17; dual distribution versioning revalidate |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Observability / operations |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Receiver–processor–exporter telemetry pipeline |
| PRIMARY PROBLEM | Unify traces, metrics and logs across heterogeneous FAR services and executors. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | OTLP ingestion/export, processors, connectors, extensions and pipelines. |
| CORE ARCHITECTURE | Pluggable receivers feed processors/exporters/connectors in configurable pipelines; semantic conventions standardize attributes. |
| BEST COMPONENTS | Mature vendor-neutral observability ecosystem and separation of collection from storage. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Queues/buffers and exporter state. |
| OBSERVABILITY MODEL | Its primary purpose. |
| PERFORMANCE TECHNIQUES | Batching, queues and sampling; bounded memory required. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Tail sampling/buffering can lose or evict traces and exhaust memory; telemetry is lossy and not authoritative evidence. |
| KNOWN FAILURE MODES | Dropped spans, tail-sampling eviction, memory exhaustion and exporter backpressure. |
| POTENTIAL FAR-LAB VALUE | Operational observability plane linked to—but separate from—evidence/audit. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-413; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/open-telemetry/opentelemetry-collector |
| FUTURE INVESTIGATION OBLIGATION | Load-test cardinality, backpressure, tail sampling and outage behavior; define which events bypass sampling into durable audit. |

### A-023 — Slurm

| FIELD | VALUE |
| --- | --- |
| PROJECT | Slurm |
| CANONICAL REPOSITORY / SOURCE | https://github.com/SchedMD/slurm |
| ORGANIZATION | SchedMD |
| CURRENT / RELEVANT VERSION | 26.05 release verified 2026 |
| LICENSE | GPL-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | HPC / resource management |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Central cluster scheduler with plugin ecosystem |
| PRIMARY PROBLEM | Integrate institutional batch compute, queues, accounting and accelerator resources without replacing site policy. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Jobs/steps, partitions, priorities, reservations, GRES/GPU, accounting and plugins. |
| CORE ARCHITECTURE | slurmctld owns scheduling/control; slurmd agents manage nodes; plugins implement scheduling, accounting, authentication and resources. |
| BEST COMPONENTS | Dominant HPC operational integration target and mature resource/accounting model. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Cluster/job/accounting state. |
| EXECUTION MODEL | Batch allocation and job-step launch. |
| PERFORMANCE TECHNIQUES | Large-scale scheduling; asynchronous steps/dynamic memory features require site validation. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Central control-plane complexity; site-specific policy/plugins; not a workflow/evidence engine. |
| KNOWN FAILURE MODES | Queue delay, job success without outputs, lost controller state, stuck/hung MPI and checkpoint mismatch. |
| POTENTIAL FAR-LAB VALUE | Native HPC executor adapter and resource authority. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | GPL-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-367; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/SchedMD/slurm |
| FUTURE INVESTIGATION OBLIGATION | Submit/cancel/requeue arrays, MPI/GPU jobs and preemption scenarios; reconcile scheduler completion with scientific artifact validity. |

### A-024 — Flux Framework

| FIELD | VALUE |
| --- | --- |
| PROJECT | Flux Framework |
| CANONICAL REPOSITORY / SOURCE | https://github.com/flux-framework/flux-core |
| ORGANIZATION | Flux Framework / LLNL |
| CURRENT / RELEVANT VERSION | Current 0.x release line active; exact release revalidate |
| LICENSE | LGPL-3.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | HPC / resource management |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Hierarchical composable resource manager |
| PRIMARY PROBLEM | Support nested scheduling and many-task scientific workloads inside allocations. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Brokers, job manager, resource model, nested instances and scheduler integration. |
| CORE ARCHITECTURE | A set of broker processes forms an instance; site-composed services and external scheduler components provide hierarchical resource management. |
| BEST COMPONENTS | Hierarchical instances, user-level deployment and research-friendly composability. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Instance/job/resource state. |
| PERFORMANCE TECHNIQUES | Overdecomposition and hierarchical scheduling. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Smaller ecosystem than Slurm and operational complexity; often complements rather than replaces site scheduler. |
| KNOWN FAILURE MODES | Nested scheduler failure, metadata divergence and resource leaks. |
| POTENTIAL FAR-LAB VALUE | Nested allocation/sub-scheduler model for FAR experiment campaigns. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | LGPL-3.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-366; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/flux-framework/flux-core |
| FUTURE INVESTIGATION OBLIGATION | Run inside Slurm allocation; test nested queues, failure propagation, job metadata and evidence linkage. |

### A-025 — PETSc / TAO

| FIELD | VALUE |
| --- | --- |
| PROJECT | PETSc / TAO |
| CANONICAL REPOSITORY / SOURCE | https://github.com/petsc/petsc |
| ORGANIZATION | PETSc team |
| CURRENT / RELEVANT VERSION | v3.25.4 docs verified 2026; revalidate |
| LICENSE | BSD-2-Clause |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Scientific computing |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Composable scalable solver stack |
| PRIMARY PROBLEM | Provide robust distributed linear/nonlinear/time-stepping/optimization methods without reimplementing numerical infrastructure. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | KSP, SNES, TS, TAO, DM, preconditioners and GPU backends. |
| CORE ARCHITECTURE | Data management and solver/preconditioner interfaces compose methods over MPI and accelerator backends; TAO adds optimization. |
| BEST COMPONENTS | World-class solver architecture, diagnostics and GPU/MPI portability. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Distributed vectors/matrices/solver state. |
| EXECUTION MODEL | MPI/SPMD numerical kernels and nonlinear/linear solver iteration. |
| PERFORMANCE TECHNIQUES | Matrix-free methods, preconditioning and scalable backends. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Large configuration space; convergence is method/problem-dependent; wrong tolerances can yield plausible false results. |
| KNOWN FAILURE MODES | False convergence, hidden precision, incompatible checkpoints and device fallback. |
| POTENTIAL FAR-LAB VALUE | Numerical-method service/reference with evidence-rich convergence diagnostics. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-2-Clause |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-230, C-372; corpus sources: RAW-0447 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/petsc/petsc |
| FUTURE INVESTIGATION OBLIGATION | Run representative PDE/optimization workloads across CPU/GPU/MPI; capture solver options, residuals and reference comparisons. |

### A-026 — Kokkos

| FIELD | VALUE |
| --- | --- |
| PROJECT | Kokkos |
| CANONICAL REPOSITORY / SOURCE | https://github.com/kokkos/kokkos |
| ORGANIZATION | Kokkos team / Sandia |
| CURRENT / RELEVANT VERSION | v5.2.0 verified 2026-07-24 |
| LICENSE | BSD-3-Clause |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | HPC / accelerator |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | C++ performance-portability abstraction |
| PRIMARY PROBLEM | Express parallel loops/data layouts once across CUDA, HIP, SYCL, OpenMP, HPX and threads. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Parallel patterns, Views, execution/memory spaces and tools. |
| CORE ARCHITECTURE | Execution spaces, memory spaces, views and policies abstract target-specific parallel execution/data placement. |
| BEST COMPONENTS | Mature portability design, broad backend coverage and current C++20 baseline. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Application data in typed Views. |
| PERFORMANCE TECHNIQUES | Backend specialization and data-layout policies. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Portable source does not guarantee portable performance; backend/version tuning remains necessary. |
| KNOWN FAILURE MODES | Suboptimal backend mapping, memory-space mistakes and nondeterministic reductions. |
| POTENTIAL FAR-LAB VALUE | Reference/optional kernel portability layer for FAR-owned scientific kernels. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-3-Clause |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-225, C-374; corpus sources: RAW-0447 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/kokkos/kokkos |
| FUTURE INVESTIGATION OBLIGATION | Benchmark representative kernels on target accelerators; record backend/compiler/version and detect silent fallback. |

### A-027 — Stan

| FIELD | VALUE |
| --- | --- |
| PROJECT | Stan |
| CANONICAL REPOSITORY / SOURCE | https://github.com/stan-dev/stan |
| ORGANIZATION | Stan Development Team |
| CURRENT / RELEVANT VERSION | v2.39.0 verified 2026-05-19 |
| LICENSE | BSD-3-Clause; dependency notices apply |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Statistics / probabilistic programming |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Compiled probabilistic program with HMC/NUTS and diagnostics |
| PRIMARY PROBLEM | Fit Bayesian models with explicit probability models and mature sampling algorithms. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | HMC/NUTS, VI, Pathfinder, Laplace, optimization and generated quantities. |
| CORE ARCHITECTURE | Stan language compiles models to C++; inference algorithms run HMC/NUTS, optimization, variational and approximation methods. |
| BEST COMPONENTS | Mature statistical semantics, diagnostics and extensive scientific adoption. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Model/data/chains/adaptation state. |
| EXECUTION MODEL | Compiled model and sampler. |
| PERFORMANCE TECHNIQUES | Effective samples per second, vectorization and parallel chains. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Model validity and convergence remain user responsibilities; compile/runtime cost and discrete-parameter constraints. |
| KNOWN FAILURE MODES | Divergences, poor mixing, weak identifiability, prior/model misspecification. |
| POTENTIAL FAR-LAB VALUE | Typed method component and reference implementation for Bayesian inference. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-3-Clause; dependency notices apply |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-256; corpus sources: RAW-0393 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/stan-dev/stan |
| FUTURE INVESTIGATION OBLIGATION | Integrate model/data/prior/diagnostic artifacts; test simulation-based calibration and independent reference results. |

### A-028 — ArviZ

| FIELD | VALUE |
| --- | --- |
| PROJECT | ArviZ |
| CANONICAL REPOSITORY / SOURCE | https://github.com/arviz-devs/arviz |
| ORGANIZATION | ArviZ project |
| CURRENT / RELEVANT VERSION | CONFLICTING_EVIDENCE: docs surfaced 1.2.0 while release pages surfaced 1.1.0; revalidate package metadata |
| LICENSE | Apache-2.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Statistics / diagnostics |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Bayesian inference diagnostics and visualization |
| PRIMARY PROBLEM | Make posterior quality, convergence and predictive checks explicit and portable across probabilistic backends. |
| EVIDENCE LEVEL | SOURCE_INSPECTED; VERSION_CONFLICT |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | R-hat, ESS, LOO, posterior/predictive diagnostics and visualization. |
| CORE ARCHITECTURE | InferenceData/xarray structures normalize chains, samples and predictions; diagnostics/plots operate independently of sampler. |
| BEST COMPONENTS | Backend-neutral diagnostics, rich posterior/predictive checks and xarray integration. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | InferenceData datasets. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Diagnostics can be misread; no single statistic proves convergence; current version conflict unresolved. |
| KNOWN FAILURE MODES | False confidence from summary metrics and insufficient chains. |
| POTENTIAL FAR-LAB VALUE | Scientific validity-gate component for Bayesian analyses. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Apache-2.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-260; corpus sources: RAW-0393 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/arviz-devs/arviz |
| FUTURE INVESTIGATION OBLIGATION | Resolve current release; define minimum diagnostic bundle and escalation rules; test known pathological posteriors. |

### A-029 — DoWhy

| FIELD | VALUE |
| --- | --- |
| PROJECT | DoWhy |
| CANONICAL REPOSITORY / SOURCE | https://github.com/py-why/dowhy |
| ORGANIZATION | PyWhy |
| CURRENT / RELEVANT VERSION | Rolling; official main docs updated 2026-08-03; exact release revalidate |
| LICENSE | MIT—revalidate exact repository notice |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Causal inference |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Assumption → identification → estimation → refutation workflow |
| PRIMARY PROBLEM | Prevent causal claims from being reduced to predictive correlation and require explicit assumptions. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Graph modeling, identification, estimation, refutation, interventions/counterfactual extensions. |
| CORE ARCHITECTURE | Causal graph/estimand/model stages separate identification from estimation and expose refutation/sensitivity routines. |
| BEST COMPONENTS | Methodological decomposition and refutation hooks directly match a scientific validity service. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Causal model, estimand, estimate and refutation artifacts. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Graph/assumptions remain analyst-supplied; refuters are not universal proof; APIs evolve. |
| KNOWN FAILURE MODES | Causal overclaim, invalid graph/assumptions, estimator mismatch. |
| POTENTIAL FAR-LAB VALUE | Causal method plugin/reference for claim-level assumptions and diagnostics. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT—revalidate exact repository notice |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-264; corpus sources: RAW-0393 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/py-why/dowhy |
| FUTURE INVESTIGATION OBLIGATION | Encode benchmark causal studies with known answers; test unobserved-confounding sensitivity and assumption provenance. |

### A-030 — BoTorch

| FIELD | VALUE |
| --- | --- |
| PROJECT | BoTorch |
| CANONICAL REPOSITORY / SOURCE | https://github.com/meta-pytorch/botorch |
| ORGANIZATION | Meta / BoTorch community |
| CURRENT / RELEVANT VERSION | v0.18.1 verified 2026 |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Optimization / experimental design |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Bayesian optimization research library |
| PRIMARY PROBLEM | Select expensive experiments under uncertainty, constraints, multiple objectives and cost tradeoffs. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Single/multi-objective, constrained, cost-aware, batch and multi-fidelity BO. |
| CORE ARCHITECTURE | PyTorch/GPyTorch surrogate models and Monte Carlo acquisition functions optimize candidate experiments; Ax supplies higher-level orchestration. |
| BEST COMPONENTS | Research-frontier BO algorithms and differentiable, composable implementation. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Data, surrogate posterior, acquisition and candidate set. |
| PERFORMANCE TECHNIQUES | Adaptive batching and GPU-accelerated Monte Carlo. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Safety and validity depend on model/constraints; acquisition optimization can fail; library is lower-level than end-user experiment service. |
| KNOWN FAILURE MODES | Unsafe exploration, model misspecification and optimizer failure. |
| POTENTIAL FAR-LAB VALUE | Method engine behind a guarded adaptive experiment service. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-271; corpus sources: RAW-0393 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/meta-pytorch/botorch |
| FUTURE INVESTIGATION OBLIGATION | Use simulation and real constrained experiments; require safe region, stopping rule, uncertainty calibration and operator override. |

### A-031 — Bluesky / Ophyd

| FIELD | VALUE |
| --- | --- |
| PROJECT | Bluesky / Ophyd |
| CANONICAL REPOSITORY / SOURCE | https://github.com/bluesky/bluesky |
| ORGANIZATION | Bluesky project |
| CURRENT / RELEVANT VERSION | Bluesky v1.15.1 verified 2026-05-06; Ophyd version revalidate |
| LICENSE | BSD-3-Clause |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Laboratory / autonomous science |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Message-based experiment plan + device abstraction |
| PRIMARY PROBLEM | Orchestrate instrument acquisition with metadata, streaming, pause/resume and explicit plan semantics. |
| EVIDENCE LEVEL | SOURCE_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Plans, RunEngine, suspenders, callbacks, event documents and device abstraction. |
| CORE ARCHITECTURE | Python generator plans yield messages interpreted by RunEngine; Ophyd devices expose signals/status; callbacks stream documents. |
| BEST COMPONENTS | Mature beamline-grade orchestration pattern, pluggable devices and live data flow. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Plan/run metadata, device statuses and emitted documents. |
| EXECUTION MODEL | Message interpreter driving asynchronous hardware operations. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | RunEngine checkpoints cannot roll back physical samples/devices; device drivers and safety interlocks are site-specific. |
| KNOWN FAILURE MODES | Repeated physical effects, stale device state, incomplete run documents. |
| POTENTIAL FAR-LAB VALUE | Primary software architecture reference for instrument plans and resumable data acquisition. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | BSD-3-Clause |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-047, C-384, C-385; corpus sources: RAW-0519 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/bluesky/bluesky |
| FUTURE INVESTIGATION OBLIGATION | Integrate a simulated and a real harmless device; crash around command acknowledgement; require sample/device reconciliation and operator gates. |

### A-032 — ROS 2 / MoveIt 2

| FIELD | VALUE |
| --- | --- |
| PROJECT | ROS 2 / MoveIt 2 |
| CANONICAL REPOSITORY / SOURCE | https://github.com/ros2/ros2 ; https://github.com/moveit/moveit2 |
| ORGANIZATION | Open Robotics / MoveIt community |
| CURRENT / RELEVANT VERSION | ROS 2 Lyrical Luth LTS released 2026-05-22; MoveIt distribution version revalidate |
| LICENSE | Mixed Apache-2.0/BSD-3-Clause packages |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Robotics / cyber-physical |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | DDS-based component graph + motion-planning stack |
| PRIMARY PROBLEM | Integrate robots, sensors, transforms, planning and execution with mature ecosystem interfaces. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Nodes, actions, lifecycle, DDS QoS, transforms, planning scene and motion planning. |
| CORE ARCHITECTURE | ROS 2 nodes communicate through DDS topics/services/actions with QoS; MoveIt maintains planning scene and executes collision-aware trajectories. |
| BEST COMPONENTS | Broad robotics ecosystem, lifecycle/QoS concepts and mature motion-planning architecture. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Distributed graph/device/planning state. |
| SECURITY MODEL | SROS/DDS security plus physical safety controls. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Distributed state/QoS complexity; planning scene can be stale; software success does not ensure physical safety. |
| KNOWN FAILURE MODES | Stale transforms/scenes, communication partitions, unsafe trajectories. |
| POTENTIAL FAR-LAB VALUE | Optional robotics executor and cross-domain reference for cyber-physical state/recovery. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Mixed Apache-2.0/BSD-3-Clause packages |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-446, C-447; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/ros2/ros2 ; https://github.com/moveit/moveit2 |
| FUTURE INVESTIGATION OBLIGATION | Use simulation first; define coordinate-frame, calibration, emergency-stop and execution-monitor contracts before real hardware. |

### A-033 — PyLabRobot / Opentrons / SiLA

| FIELD | VALUE |
| --- | --- |
| PROJECT | PyLabRobot / Opentrons / SiLA |
| CANONICAL REPOSITORY / SOURCE | https://github.com/PyLabRobot/pylabrobot ; https://github.com/Opentrons/opentrons ; https://sila-standard.com |
| ORGANIZATION | PyLabRobot, Opentrons and SiLA communities |
| CURRENT / RELEVANT VERSION | PyLabRobot 0.2.x and Opentrons robot stack 9.1.1/API 2.29 observed; exact versions revalidate |
| LICENSE | MIT / Apache-2.0 / standard terms vary |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Laboratory automation |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Hardware abstraction + vendor platform + open command standard |
| PRIMARY PROBLEM | Control heterogeneous lab devices and liquid handlers while retaining explicit command state and interoperability. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Liquid handling, readers/pumps/scales, robot protocols and observable commands. |
| CORE ARCHITECTURE | PyLabRobot provides async hardware-agnostic drivers; Opentrons exposes robot/protocol APIs; SiLA models observable commands and services. |
| BEST COMPONENTS | Practical breadth across open devices and useful command-state abstractions. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Device/session/command/protocol state plus physical world. |
| SECURITY MODEL | Network/device credentials, allowlisted commands and interlocks. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Drivers may be incomplete or invalidate warranties; physical calibration/safety/consumables are outside software API. |
| KNOWN FAILURE MODES | Duplicate dispense, reconnect races, wrong labware/unit/calibration and unsafe abort. |
| POTENTIAL FAR-LAB VALUE | Adapter landscape for lab execution; never direct model-to-device authority. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Review each driver, hardware warranty and standard terms. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-049, C-387, C-448; corpus sources: RAW-0519 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/PyLabRobot/pylabrobot ; https://github.com/Opentrons/opentrons ; https://sila-standard.com |
| FUTURE INVESTIGATION OBLIGATION | Start with simulators and low-risk devices; validate units/labware/calibration; inject disconnects and require operator confirmation for irreversible actions. |

### A-034 — QUDT

| FIELD | VALUE |
| --- | --- |
| PROJECT | QUDT |
| CANONICAL REPOSITORY / SOURCE | https://github.com/qudt/qudt-public-repo |
| ORGANIZATION | QUDT.org |
| CURRENT / RELEVANT VERSION | v3.5.0 verified 2026-07-28 |
| LICENSE | CC BY 4.0 |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Metrology / semantic data |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Ontology for quantities, units, dimensions and quantity kinds |
| PRIMARY PROBLEM | Use stable machine-readable semantics instead of free-text unit strings. |
| EVIDENCE LEVEL | OFFICIAL_SPEC/REPOSITORY_INSPECTED |
| CONFIDENCE | HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Unit/quantity-kind/dimension vocabularies and SHACL/OWL artifacts. |
| CORE ARCHITECTURE | RDF/OWL/SHACL vocabularies model units, quantity kinds, dimensions, systems and conversion metadata. |
| BEST COMPONENTS | Rich, governed semantic coverage and validation artifacts. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Versioned ontology terms. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Ontology does not itself enforce numerical execution, calibration or uncertainty propagation. |
| KNOWN FAILURE MODES | Wrong term mapping, ontology-version drift and missing domain units. |
| POTENTIAL FAR-LAB VALUE | Vocabulary/reference layer for FAR Measurement object and domain schemas. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | CC BY 4.0 |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-463; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/qudt/qudt-public-repo |
| FUTURE INVESTIGATION OBLIGATION | Map representative domain units/frames, validate conversions and preserve attribution/version. |

### A-035 — UCUM

| FIELD | VALUE |
| --- | --- |
| PROJECT | UCUM |
| CANONICAL REPOSITORY / SOURCE | https://ucum.org |
| ORGANIZATION | UCUM / Regenstrief Institute |
| CURRENT / RELEVANT VERSION | v2.2 verified 2024-06-17; still current in checked source |
| LICENSE | Custom UCUM terms; legal review required |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Metrology / interoperability |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Canonical unit code system |
| PRIMARY PROBLEM | Encode units unambiguously in electronic communication and clinical/scientific interchange. |
| EVIDENCE LEVEL | OFFICIAL_SPEC_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Unit code grammar and reference tables. |
| CORE ARCHITECTURE | A formal grammar composes base/derived units with prefixes, annotations and conversion semantics. |
| BEST COMPONENTS | Compact, widely used machine code for units and dimensional conversion. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Unit codes and definitions. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Custom license; annotations and domain conventions need governance; does not carry calibration/uncertainty. |
| KNOWN FAILURE MODES | Ambiguous/custom annotations and unsafe conversion assumptions. |
| POTENTIAL FAR-LAB VALUE | Execution/interchange code layer complementary to QUDT semantics. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Custom UCUM terms; legal review required |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-464; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://ucum.org |
| FUTURE INVESTIGATION OBLIGATION | Run parser/conversion conformance corpus and legal review; define prohibited ambiguous unit strings. |

### A-036 — Automerge / Yjs

| FIELD | VALUE |
| --- | --- |
| PROJECT | Automerge / Yjs |
| CANONICAL REPOSITORY / SOURCE | https://github.com/automerge/automerge ; https://github.com/yjs/yjs |
| ORGANIZATION | Automerge and Yjs communities |
| CURRENT / RELEVANT VERSION | Current releases revalidate |
| LICENSE | MIT |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Collaboration / local-first |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | CRDT-based mergeable document state |
| PRIMARY PROBLEM | Allow offline and concurrent editing of drafts, annotations, layouts and review comments. |
| EVIDENCE LEVEL | SOURCE/REPOSITORY_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Local edits, merge/sync, presence integrations and document data types. |
| CORE ARCHITECTURE | Operation/change histories merge without central locking; sync protocols exchange deltas and derive convergent document state. |
| BEST COMPONENTS | Mature local-first collaboration primitives and strong ecosystems. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | CRDT operation/change history and materialized document. |
| SECURITY MODEL | Untrusted update validation and project authorization required. |
| PERFORMANCE TECHNIQUES | Delta sync; compaction/history costs vary. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | Convergence does not preserve domain invariants, authorization or bounded history; tombstones/updates can become DoS vectors. |
| KNOWN FAILURE MODES | Convergent-but-invalid state, tombstone growth and offline authorization. |
| POTENTIAL FAR-LAB VALUE | Collaboration projection only; authoritative publication crosses a transactional validity gate. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | MIT |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-397, C-398; corpus sources: WEB_GAP_REPAIR |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/automerge/automerge ; https://github.com/yjs/yjs |
| FUTURE INVESTIGATION OBLIGATION | Test long-lived documents, malicious updates, offline revocation and semantic merge validation. |

### A-037 — DataLad / lakeFS / Dolt

| FIELD | VALUE |
| --- | --- |
| PROJECT | DataLad / lakeFS / Dolt |
| CANONICAL REPOSITORY / SOURCE | https://github.com/datalad/datalad ; https://github.com/treeverse/lakeFS ; https://github.com/dolthub/dolt |
| ORGANIZATION | Independent projects |
| CURRENT / RELEVANT VERSION | Current releases revalidate |
| LICENSE | Mixed: MIT/Apache-2.0 and dependencies; component review |
| STATUS / MAINTENANCE | Mature or growing; revalidate |
| DOMAIN | Data versioning / reproducibility |
| SUBDOMAIN | UNKNOWN |
| ARCHITECTURE FAMILY | Branch/diff/merge data histories over files, object stores or SQL |
| PRIMARY PROBLEM | Give experiments first-class branches, commits and reproducible data/artifact versions. |
| EVIDENCE LEVEL | OFFICIAL_DOCS_INSPECTED |
| CONFIDENCE | MEDIUM-HIGH |
| TIER | A |

| FIELD | DECISION INTELLIGENCE |
| --- | --- |
| KEY CAPABILITIES | Commit/branch/diff/merge and data provenance by modality. |
| CORE ARCHITECTURE | DataLad composes Git/git-annex datasets and procedures; lakeFS versions object-storage namespaces; Dolt versions relational tables with Git-like semantics. |
| BEST COMPONENTS | Mature patterns for branchable research state across distinct data modalities. |
| RELEVANT SOURCE / PACKAGE AREAS | Relevant source/spec areas identified at project level; exact integration path not executed. |
| STATE MODEL | Version graph plus referenced data. |
| MATURITY | Mature or growing; revalidate |
| WEAKNESSES | No universal backend; merge semantics may be textual/object/table rather than scientific; storage/UX complexity. |
| KNOWN FAILURE MODES | Dangling remote data, semantic merge errors, costly storage and dual ownership. |
| POTENTIAL FAR-LAB VALUE | Reference set for experiment branches and immutable artifact history. |
| POSSIBLE FUTURE ADOPTION MODES | ADOPT / ADAPT / EXTRACT only after problem-specific comparison |
| LEGAL / LICENSE CONCERNS | Review each component and git-annex/storage dependencies. |
| SOURCE-CORPUS REFERENCES | Candidate IDs: C-096, C-098, C-154, C-156; corpus sources: RAW-0020, RAW-0467 |
| EXTERNAL EVIDENCE | Official source checked 2026-08-20: https://github.com/datalad/datalad ; https://github.com/treeverse/lakeFS ; https://github.com/dolthub/dolt |
| FUTURE INVESTIGATION OBLIGATION | Select one workload per modality; test large data, branching, garbage collection, merge conflict and provenance export. |

## 7. Tier B Technical References

Tier B systems are valuable architecture, engineering or method references. Some may advance later, but the present evidence or fit is not strong enough for Tier A. Component entries already represented inside Tier S/A groups are omitted here to avoid double counting.

| ID | PROJECT / ENTITY | DOMAIN | CANONICAL SOURCE | LICENSE | EVIDENCE | WHY PRESERVED | RAW PROVENANCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENT-0115 | Differential Dataflow | Coding / IDE / notebooks / evidence tooling | https://github.com/TimelyDataflow/differential-dataflow | MIT | DOCUMENTATION_INSPECTED | Indexed multiversion delta computation \| MIT \| DOCUMENTATION_INSPECTED | C-110; RAW-0465 |
| ENT-0092 | Galaxy | Coding / IDE / notebooks / evidence tooling | https://github.com/galaxyproject/galaxy | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | RU-003 \| A_SCIENCE_PLATFORM \| Reproducible analysis histories and workflow export | C-086; RAW-0020 |
| ENT-0109 | OCI Distribution / ORAS | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance, Protocols / interoperability / data sovereignty | https://github.com/oras-project/oras | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | RU-003 \| S_ARTIFACT_PROTOCOL \| Subject/referrer graph for attaching evidence artifacts | C-104, C-151, C-457; RAW-0020, RAW-0467 |
| ENT-0083 | Tree-sitter | Coding / IDE / notebooks / evidence tooling | https://github.com/tree-sitter/tree-sitter | MIT | DOCUMENTATION_INSPECTED | Incremental concrete syntax tree reuse \| MIT \| SOURCE_INSPECTED | C-077; RAW-0465 |
| ENT-0110 | W3C Verifiable Credentials 2.0 | Coding / IDE / notebooks / evidence tooling, Protocols / interoperability / data sovereignty | https://www.w3.org/TR/vc-data-model-2.0/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | RU-003 \| A_CREDENTIAL_STANDARD \| Issuer-holder-verifier claims and selective presentation | C-105, C-462; RAW-0020 |
| ENT-0158 | DVC | Data / search / knowledge / provenance | https://github.com/iterative/dvc | Apache-2.0 | DOCUMENTATION_INSPECTED | Git-linked content-addressed data cache \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-155; RAW-0467 |
| ENT-0143 | Materialize | Data / search / knowledge / provenance | https://github.com/MaterializeInc/materialize | BSL-1.1 converting to Apache-2.0 after 4 years | DOCUMENTATION_INSPECTED | Incremental view maintenance \| BSL / commercial terms; verify exact component \| DOCUMENTATION_INSPECTED | C-138; RAW-0467 |
| ENT-0166 | Milvus | Data / search / knowledge / provenance | https://github.com/milvus-io/milvus | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Distributed vector data plane \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-164; RAW-0467 |
| ENT-0164 | pgvector | Data / search / knowledge / provenance | https://github.com/pgvector/pgvector | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Vector indexes inside PostgreSQL \| PostgreSQL License \| SOURCE_INSPECTED | C-162; RAW-0467 |
| ENT-0165 | Qdrant | Data / search / knowledge / provenance | https://github.com/qdrant/qdrant | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | Segmented HNSW vector service \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-163; RAW-0467 |
| ENT-0163 | Quickwit | Data / search / knowledge / provenance | https://github.com/quickwit-oss/quickwit | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Object-store decoupled search \| Apache-2.0 \| SOURCE_INSPECTED | C-161; RAW-0467 |
| ENT-0145 | RisingWave | Data / search / knowledge / provenance | https://github.com/risingwavelabs/risingwave | Apache-2.0 | DOCUMENTATION_INSPECTED | Distributed incremental SQL \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-140; RAW-0467 |
| ENT-0170 | W3C PROV | Data / search / knowledge / provenance | https://www.w3.org/TR/prov-overview/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Entity-Activity-Agent provenance model \| W3C document license \| STANDARD_INSPECTED | C-169; RAW-0467 |
| ENT-0397 | Apache Kafka | Distributed systems / cloud / messaging / observability | https://github.com/apache/kafka | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Partitioned durable event log and streaming ecosystem | C-410; UNKNOWN |
| ENT-0398 | Apache Pulsar | Distributed systems / cloud / messaging / observability | https://github.com/apache/pulsar | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Segmented storage/compute-separated messaging | C-411; UNKNOWN |
| ENT-0394 | Kubernetes | Distributed systems / cloud / messaging / observability | https://github.com/kubernetes/kubernetes | Apache-2.0 | SOURCE_INSPECTED | Desired-state infrastructure reconciliation and workload lifecycle | C-407; UNKNOWN |
| ENT-0396 | NATS | Distributed systems / cloud / messaging / observability | https://github.com/nats-io/nats-server | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Low-latency messaging, request/reply and JetStream persistence | C-409; UNKNOWN |
| ENT-0401 | Prometheus | Distributed systems / cloud / messaging / observability | https://github.com/prometheus/prometheus | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Time-series metrics, pull-based collection and alerting | C-414; UNKNOWN |
| ENT-0042 | agent-ledger | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-033; RAW-0480 |
| ENT-0040 | Assay | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-031; RAW-0480 |
| ENT-0037 | DriftQ-Core | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-028; RAW-0480 |
| ENT-0043 | etchplan | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-034; RAW-0480 |
| ENT-0036 | Harn | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-027; RAW-0480 |
| ENT-0014 | Hatchet | Durable execution / external effects | https://github.com/hatchet-dev/hatchet | MIT/UNKNOWN exact subcomponent mix | DOCUMENTATION_INSPECTED | 耐久事件日志 + DAG/Task \| Hatchet / Go \| MIT | C-007; RAW-0461 |
| ENT-0018 | LangGraph | Durable execution / external effects | https://github.com/langchain-ai/langgraph | MIT | DOCUMENTATION_INSPECTED | Agent graph checkpoint \| LangChain / Python \| MIT | C-009; RAW-0461 |
| ENT-0039 | OpenGeni | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-030; RAW-0480 |
| ENT-0038 | Polos | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | SOURCE_INSPECTED | Reference for Durable execution / external effects | C-029; RAW-0480 |
| ENT-0013 | AgentScope Java Harness | GAP_REPAIR | https://github.com/agentscope-ai/agentscope-java | Apache-2.0 | SOURCE_INSPECTED | Workspace-as-source-of-truth agent harness with typed events, permissions, distributed state and sandbox adapters. | EXT-007; RAW-0016 |
| ENT-0238 | AMReX | HPC / numerical computing / optimization | https://github.com/AMReX-Codes/amrex | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_AMR \| Block-structured AMR framework \| DOCUMENTATION_AND_REPOSITORY_VERIFIED | C-239; RAW-0447 |
| ENT-0362 | Charm++ | HPC / numerical computing / optimization | https://github.com/charmplusplus/charm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Migratable objects, overdecomposition and adaptive load balancing | C-369; UNKNOWN |
| ENT-0246 | DAKOTA | HPC / numerical computing / optimization | https://github.com/snl-dakota/dakota | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_SCIENCE \| Design exploration and uncertainty-analysis framework \| AUTHORITATIVE_REPOSITORY_VERIFIED | C-247; RAW-0447 |
| ENT-0237 | deal.II | HPC / numerical computing / optimization | https://github.com/dealii/dealii | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_SCIENCE \| General adaptive finite-element C++ library \| RELEASE_AND_REPOSITORY_VERIFIED | C-238; RAW-0447 |
| ENT-0239 | DifferentialEquations.jl / SciML | HPC / numerical computing / optimization | https://github.com/SciML/DifferentialEquations.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_SCIENCE \| Composable differential-equation solver ecosystem \| DOCUMENTATION_AND_RELEASE_VERIFIED | C-240, C-379; RAW-0447 |
| ENT-0241 | Enzyme | HPC / numerical computing / optimization | https://github.com/EnzymeAD/Enzyme | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_FRONTIER \| LLVM-IR-level automatic differentiation \| DOCUMENTATION_VERIFIED | C-242; RAW-0447 |
| ENT-0235 | FEniCSx | HPC / numerical computing / optimization | https://github.com/FEniCS/dolfinx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_SCIENCE \| Form-compiler-driven finite-element platform \| RELEASE_AND_REPOSITORY_VERIFIED | C-236; RAW-0447 |
| ENT-0233 | Ginkgo | HPC / numerical computing / optimization | https://github.com/ginkgo-project/ginkgo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_NUMERICAL \| Performance-portable iterative solver library \| AUTHORITATIVE_REPOSITORY_VERIFIED | C-234; RAW-0447 |
| ENT-0244 | HiGHS | HPC / numerical computing / optimization | https://github.com/ERGO-Code/HiGHS | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_OPTIMIZER \| Open high-performance LP/MIP/QP solver \| DOCUMENTATION_AND_LOCAL_EXECUTION | C-245; RAW-0447 |
| ENT-0222 | HPX | HPC / numerical computing / optimization | https://github.com/TheHPXProject/hpx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_RUNTIME \| C++ asynchronous many-task runtime \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-223; RAW-0447 |
| ENT-0364 | hypre | HPC / numerical computing / optimization | https://github.com/hypre-space/hypre | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Scalable multigrid and sparse linear solvers | C-373; UNKNOWN |
| ENT-0243 | Ipopt | HPC / numerical computing / optimization | https://github.com/coin-or/Ipopt | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_OPTIMIZER \| Interior-point nonlinear optimizer \| DOCUMENTATION_VERIFIED | C-244; RAW-0447 |
| ENT-0369 | JuMP | HPC / numerical computing / optimization | https://github.com/jump-dev/JuMP.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Algebraic optimization modeling with solver-independent semantics | C-380; UNKNOWN |
| ENT-0367 | LAMMPS | HPC / numerical computing / optimization | https://github.com/lammps/lammps | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Parallel particle and molecular simulation | C-377; UNKNOWN |
| ENT-0361 | Legion | HPC / numerical computing / optimization | https://github.com/StanfordLegion/legion | VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | Logical-region data model and dependence-aware heterogeneous task runtime | C-368; UNKNOWN |
| ENT-0218 | libfabric | HPC / numerical computing / optimization | https://github.com/ofiwg/libfabric | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_COMMUNICATION \| Provider-based fabric API \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-219; RAW-0447 |
| ENT-0234 | MFEM | HPC / numerical computing / optimization | https://github.com/mfem/mfem | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_SCIENCE \| High-order finite-element library \| RELEASE_AND_DOCUMENTATION_VERIFIED | C-235; RAW-0447 |
| ENT-0365 | MOOSE | HPC / numerical computing / optimization | https://github.com/idaholab/moose | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Composable multiphysics finite-element applications | C-375; UNKNOWN |
| ENT-0216 | MPICH | HPC / numerical computing / optimization | https://github.com/pmodels/mpich | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_HPC_PROTOCOL \| Reference-quality MPI implementation and ABI ecosystem \| REPOSITORY_AND_RELEASE_VERIFIED | C-217; RAW-0447 |
| ENT-0215 | Open MPI / ULFM | HPC / numerical computing / optimization | https://github.com/open-mpi/ompi | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_HPC_PROTOCOL \| MPI standard runtime with application-visible fault repair \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-216, C-371; RAW-0447 |
| ENT-0366 | OpenFOAM | HPC / numerical computing / optimization | https://github.com/OpenFOAM/OpenFOAM-dev | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Finite-volume computational fluid dynamics | C-376; UNKNOWN |
| ENT-0247 | OpenTURNS | HPC / numerical computing / optimization | https://github.com/openturns/openturns | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_SCIENCE \| Industrial uncertainty quantification platform \| AUTHORITATIVE_REPOSITORY_VERIFIED | C-248; RAW-0447 |
| ENT-0371 | OR-Tools | HPC / numerical computing / optimization | https://github.com/google/or-tools | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Constraint programming, routing and mathematical optimization | C-382; UNKNOWN |
| ENT-0223 | PaRSEC | HPC / numerical computing / optimization | https://github.com/ICLDisco/parsec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_RUNTIME \| Distributed symbolic task-graph runtime \| REPOSITORY_AND_ISSUES_VERIFIED | C-224; RAW-0447 |
| ENT-0370 | Pyomo | HPC / numerical computing / optimization | https://github.com/Pyomo/pyomo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Python optimization modeling and solver interfaces | C-381; UNKNOWN |
| ENT-0225 | RAJA | HPC / numerical computing / optimization | https://github.com/llnl/RAJA | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_PORTABILITY \| Loop-kernel policy abstraction \| REPOSITORY_VERIFIED | C-226; RAW-0447 |
| ENT-0221 | StarPU | HPC / numerical computing / optimization | https://github.com/starpu-runtime/starpu | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_RUNTIME \| Heterogeneous task graph scheduler \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-222; RAW-0447 |
| ENT-0232 | SuiteSparse | HPC / numerical computing / optimization | https://github.com/DrTimothyAldenDavis/SuiteSparse | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_PRIMITIVE \| Sparse direct and graph-algorithm suite \| AUTHORITATIVE_REPOSITORY_VERIFIED | C-233; RAW-0447 |
| ENT-0231 | SUNDIALS | HPC / numerical computing / optimization | https://github.com/llnl/sundials | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | S_INTEGRATOR \| Pluggable ODE/DAE/nonlinear solver suite \| RELEASE_AND_DOCUMENTATION_VERIFIED | C-232; RAW-0447 |
| ENT-0363 | Taskflow | HPC / numerical computing / optimization | https://github.com/taskflow/taskflow | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Composable C++ task graphs and heterogeneous execution | C-370; UNKNOWN |
| ENT-0230 | Trilinos | HPC / numerical computing / optimization | https://github.com/trilinos/Trilinos | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_NUMERICAL \| Large package ecosystem for scalable scientific computing \| DOCUMENTATION_AND_PACKAGE_VERIFIED | C-231; RAW-0447 |
| ENT-0217 | UCX | HPC / numerical computing / optimization | https://github.com/openucx/ucx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_COMMUNICATION \| Unified low-level HPC communication framework \| REPOSITORY_VERIFIED | C-218; RAW-0447 |
| ENT-0368 | WarpX | HPC / numerical computing / optimization | https://github.com/BLAST-WarpX/warpx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Exascale particle-in-cell plasma simulation | C-378; UNKNOWN |
| ENT-0388 | cr-sqlite | Local-first / collaboration / version control / plugins | https://github.com/vlcn-io/cr-sqlite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | SQLite CRDT extension and causal sync | C-401; UNKNOWN |
| ENT-0387 | ElectricSQL | Local-first / collaboration / version control / plugins | https://github.com/electric-sql/electric | Apache-2.0/UNKNOWN exact current license ; VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | Postgres change streaming and client-side local-first shapes | C-400; UNKNOWN |
| ENT-0393 | HashiCorp go-plugin | Local-first / collaboration / version control / plugins | https://github.com/hashicorp/go-plugin | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Out-of-process RPC plugin lifecycle | C-406; UNKNOWN |
| ENT-0389 | Jujutsu | Local-first / collaboration / version control / plugins | https://github.com/jj-vcs/jj | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Operation-log-oriented version control and mutable change identities | C-402; UNKNOWN |
| ENT-0386 | Loro | Local-first / collaboration / version control / plugins | https://github.com/loro-dev/loro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Rich CRDT with versioning and movable tree/list semantics | C-399; UNKNOWN |
| ENT-0390 | Pijul | Local-first / collaboration / version control / plugins | https://github.com/pijul-scm/pijul | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Patch-theory distributed version control | C-403; UNKNOWN |
| ENT-0391 | Sapling | Local-first / collaboration / version control / plugins | https://github.com/facebook/sapling | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Scalable source control and stacked changes | C-404; UNKNOWN |
| ENT-0450 | Carbon Aware SDK | Metrology / sustainability / browser / frontier compute | https://github.com/Green-Software-Foundation/carbon-aware-sdk | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Carbon-intensity-aware workload timing and placement | C-466; UNKNOWN |
| ENT-0455 | DuckDB-Wasm | Metrology / sustainability / browser / frontier compute | https://github.com/duckdb/duckdb-wasm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | In-browser analytical database | C-472; UNKNOWN |
| ENT-0454 | JupyterLite | Metrology / sustainability / browser / frontier compute | https://github.com/jupyterlite/jupyterlite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Serverless browser-hosted Jupyter | C-471; UNKNOWN |
| ENT-0449 | Kepler | Metrology / sustainability / browser / frontier compute | https://github.com/sustainable-computing-io/kepler | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Workload energy estimation and metrics | C-465; UNKNOWN |
| ENT-0453 | Pyodide | Metrology / sustainability / browser / frontier compute | https://github.com/pyodide/pyodide | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Python scientific stack in WebAssembly | C-470; UNKNOWN |
| ENT-0355 | Apache TVM | Model serving / GPU / compiler | https://github.com/apache/tvm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Tensor compiler and heterogeneous deployment | C-362; UNKNOWN |
| ENT-0352 | DeepSpeed | Model serving / GPU / compiler | https://github.com/deepspeedai/DeepSpeed | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Distributed training/inference memory and parallelism techniques | C-358; UNKNOWN |
| ENT-0356 | IREE | Model serving / GPU / compiler | https://github.com/iree-org/iree | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | MLIR-based portable accelerator compiler/runtime | C-363; UNKNOWN |
| ENT-0353 | Megatron-LM | Model serving / GPU / compiler | https://github.com/NVIDIA/Megatron-LM | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Tensor/pipeline/expert parallelism reference | C-359; UNKNOWN |
| ENT-0351 | Ollama | Model serving / GPU / compiler | https://github.com/ollama/ollama | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Local model distribution and runtime UX | C-357; UNKNOWN |
| ENT-0357 | OpenXLA | Model serving / GPU / compiler | https://github.com/openxla/xla | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | XLA compiler infrastructure for accelerated ML | C-364; UNKNOWN |
| ENT-0358 | PyTorch Inductor | Model serving / GPU / compiler | https://github.com/pytorch/pytorch | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Graph compiler and generated kernels for PyTorch | C-365; UNKNOWN |
| ENT-0354 | xFormers | Model serving / GPU / compiler | https://github.com/facebookresearch/xformers | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Memory-efficient transformer components | C-360; UNKNOWN |
| ENT-0194 | BentoML | Model serving / GPU / inference | https://github.com/bentoml/BentoML | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Application-centric model serving \| Apache-2.0 \| REPOSITORY_VERIFIED | C-195; RAW-0502 |
| ENT-0203 | CUTLASS | Model serving / GPU / inference | https://github.com/NVIDIA/cutlass | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | CUDA linear algebra templates and DSLs \| NVIDIA permissive/BSD-style; verify exact current LICENSE \| REPOSITORY_VERIFIED | C-204; RAW-0502 |
| ENT-0200 | FlashAttention | Model serving / GPU / inference | https://github.com/Dao-AILab/flash-attention | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | IO-aware fused attention \| BSD-3-Clause \| REPOSITORY_AND_ISSUES_SCREENED | C-201; RAW-0502 |
| ENT-0191 | KServe | Model serving / GPU / inference | https://github.com/kserve/kserve | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Kubernetes model-serving lifecycle \| Apache-2.0 \| REPOSITORY_VERIFIED | C-192; RAW-0502 |
| ENT-0195 | LiteLLM | Model serving / GPU / inference | https://github.com/BerriAI/litellm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Provider-compatible model gateway \| MIT core; enterprise features separate \| SOURCE_AND_ISSUES_SCREENED | C-196; RAW-0502 |
| ENT-0182 | llama.cpp | Model serving / GPU / inference | https://github.com/ggml-org/llama.cpp | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Portable CPU/GPU local runtime \| MIT \| REPOSITORY_VERIFIED | C-183; RAW-0502 |
| ENT-0187 | llm-d | Model serving / GPU / inference | https://github.com/llm-d/llm-d | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Kubernetes-native disaggregated inference \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-188; RAW-0502 |
| ENT-0189 | Mooncake | Model serving / GPU / inference | https://github.com/kvcache-ai/Mooncake | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Disaggregated KV cache and transfer platform \| Apache-2.0 \| REPOSITORY_VERIFIED | C-190; RAW-0502 |
| ENT-0186 | NVIDIA Dynamo | Model serving / GPU / inference | https://github.com/ai-dynamo/dynamo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Disaggregated inference serving framework \| Apache-2.0 \| DOCUMENTATION_AND_SOURCE_INSPECTED | C-187; RAW-0502 |
| ENT-0193 | NVIDIA Triton Inference Server | Model serving / GPU / inference | https://github.com/triton-inference-server/server | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_DOCS_VERIFIED | Multi-framework production inference server \| BSD-3-Clause \| REPOSITORY_VERIFIED | C-194; RAW-0502 |
| ENT-0192 | Ray Serve | Model serving / GPU / inference | https://github.com/ray-project/ray | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Python distributed serving runtime \| Apache-2.0 \| REPOSITORY_VERIFIED | C-193; RAW-0502 |
| ENT-0180 | TensorRT-LLM | Model serving / GPU / inference | https://github.com/NVIDIA/TensorRT-LLM | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_DOCS_VERIFIED | NVIDIA-optimized compiled runtime \| Apache-2.0 \| SOURCE_AND_ISSUES_INSPECTED | C-181; RAW-0502 |
| ENT-0181 | Text Generation Inference | Model serving / GPU / inference | https://github.com/huggingface/text-generation-inference | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Legacy production inference server \| Apache-2.0 \| AUTHORITATIVE_LIFECYCLE_VERIFIED | C-182; RAW-0502 |
| ENT-0436 | A2A Protocol | Protocols / interoperability / data sovereignty | https://github.com/a2aproject/A2A | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Agent-to-agent task, message and artifact interoperability | C-450; UNKNOWN |
| ENT-0437 | AG-UI | Protocols / interoperability / data sovereignty | https://github.com/ag-ui-protocol/ag-ui | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | Event protocol between agent backends and interactive frontends | C-451; UNKNOWN |
| ENT-0442 | AsyncAPI | Protocols / interoperability / data sovereignty | https://github.com/asyncapi/spec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Event-driven API descriptions | C-456; UNKNOWN |
| ENT-0441 | CloudEvents | Protocols / interoperability / data sovereignty | https://github.com/cloudevents/spec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Portable event envelopes | C-455; UNKNOWN |
| ENT-0443 | Dataspace Protocol | Protocols / interoperability / data sovereignty | https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Policy-aware federated data-space negotiation | C-458; UNKNOWN |
| ENT-0444 | Eclipse EDC | Protocols / interoperability / data sovereignty | https://github.com/eclipse-edc/Connector | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Connector architecture for sovereign data exchange | C-459; UNKNOWN |
| ENT-0439 | gRPC | Protocols / interoperability / data sovereignty | https://github.com/grpc/grpc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Typed streaming RPC and multi-language code generation | C-453; UNKNOWN |
| ENT-0438 | OpenAPI | Protocols / interoperability / data sovereignty | https://github.com/OAI/OpenAPI-Specification | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | HTTP API interface description | C-452; UNKNOWN |
| ENT-0440 | Protocol Buffers | Protocols / interoperability / data sovereignty | https://github.com/protocolbuffers/protobuf | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Versioned binary schemas and code generation | C-454; UNKNOWN |
| ENT-0445 | Solid | Protocols / interoperability / data sovereignty | https://solidproject.org/TR/protocol | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Decentralized data pods and access protocols | C-460; UNKNOWN |
| ENT-0446 | W3C ODRL | Protocols / interoperability / data sovereignty | https://www.w3.org/TR/odrl-model/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Machine-readable usage policy model | C-461; UNKNOWN |
| ENT-0405 | Citation Style Language | Publishing / visualization / product / HCI | https://github.com/citation-style-language/schema | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Machine-readable citation formatting standard | C-418; UNKNOWN |
| ENT-0409 | Datashader | Publishing / visualization / product / HCI | https://github.com/holoviz/datashader | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Rasterization pipeline for very large datasets | C-423; UNKNOWN |
| ENT-0414 | deck.gl | Publishing / visualization / product / HCI | https://github.com/visgl/deck.gl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | GPU-accelerated large-scale geospatial visualization | C-428; UNKNOWN |
| ENT-0404 | Manubot | Publishing / visualization / product / HCI | https://github.com/manubot/manubot | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Git-based scholarly manuscripts and citation automation | C-417; UNKNOWN |
| ENT-0403 | MyST Markdown | Publishing / visualization / product / HCI | https://github.com/jupyter-book/mystmd | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Structured scientific Markdown, directives and executable publications | C-416; UNKNOWN |
| ENT-0413 | napari | Publishing / visualization / product / HCI | https://github.com/napari/napari | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | N-dimensional image viewer and plugin ecosystem | C-427; UNKNOWN |
| ENT-0407 | Observable Framework | Publishing / visualization / product / HCI | https://github.com/observablehq/framework | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Static data-app generation with reactive client views | C-421; UNKNOWN |
| ENT-0402 | Pandoc | Publishing / visualization / product / HCI | https://github.com/jgm/pandoc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Document AST and multi-format conversion | C-415; UNKNOWN |
| ENT-0410 | ParaView | Publishing / visualization / product / HCI | https://github.com/Kitware/ParaView | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Distributed scientific visualization and in-situ workflows | C-424; UNKNOWN |
| ENT-0412 | Typst | Publishing / visualization / product / HCI | https://github.com/typst/typst | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Programmable modern typesetting engine | C-426; UNKNOWN |
| ENT-0408 | Vega-Lite | Publishing / visualization / product / HCI | https://github.com/vega/vega-lite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Declarative visualization grammar and reproducible specs | C-422; UNKNOWN |
| ENT-0411 | VTK | Publishing / visualization / product / HCI | https://github.com/Kitware/VTK | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Scientific visualization algorithms and data model | C-425; UNKNOWN |
| ENT-0406 | Zotero | Publishing / visualization / product / HCI | https://github.com/zotero/zotero | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Reference, attachment and annotation management | C-419; UNKNOWN |
| ENT-0425 | Astropy | Scientific workflows / domain platforms / robotics | https://github.com/astropy/astropy | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Units, coordinates, tables and astronomy formats | C-439; UNKNOWN |
| ENT-0431 | BIDS Specification | Scientific workflows / domain platforms / robotics | https://github.com/bids-standard/bids-specification | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Brain imaging data organization and metadata standard | C-445; UNKNOWN |
| ENT-0418 | Common Workflow Language | Scientific workflows / domain platforms / robotics | https://github.com/common-workflow-language/common-workflow-language | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Portable command-line workflow specification | C-432; UNKNOWN |
| ENT-0430 | DANDI CLI | Scientific workflows / domain platforms / robotics | https://github.com/dandi/dandi-cli | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Validation and publication of neurophysiology datasets | C-444; UNKNOWN |
| ENT-0428 | Dask | Scientific workflows / domain platforms / robotics | https://github.com/dask/dask | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Dynamic task graphs and parallel Python collections | C-442; UNKNOWN |
| ENT-0424 | GROMACS | Scientific workflows / domain platforms / robotics | https://github.com/gromacs/gromacs | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | High-performance molecular dynamics | C-438; UNKNOWN |
| ENT-0415 | Nextflow | Scientific workflows / domain platforms / robotics | https://github.com/nextflow-io/nextflow | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | Dataflow scientific workflows and heterogeneous executors | C-429; UNKNOWN |
| ENT-0417 | nf-core tools | Scientific workflows / domain platforms / robotics | https://github.com/nf-core/tools | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Community standards, linting and lifecycle for pipelines | C-431; UNKNOWN |
| ENT-0420 | NOMAD | Scientific workflows / domain platforms / robotics | https://github.com/FAIRmat-NFDI/nomad | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Extensible materials metainfo, parsers and FAIR data | C-434; UNKNOWN |
| ENT-0423 | OpenMM | Scientific workflows / domain platforms / robotics | https://github.com/openmm/openmm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Programmable GPU-accelerated molecular simulation | C-437; UNKNOWN |
| ENT-0427 | Pangeo | Scientific workflows / domain platforms / robotics | https://github.com/pangeo-data/pangeo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Cloud-native earth-system data ecosystem | C-441; UNKNOWN |
| ENT-0421 | pymatgen | Scientific workflows / domain platforms / robotics | https://github.com/materialsproject/pymatgen | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Materials structures, transformations and analysis | C-435; UNKNOWN |
| ENT-0429 | PyNWB | Scientific workflows / domain platforms / robotics | https://github.com/NeurodataWithoutBorders/pynwb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Neurodata Without Borders schema implementation | C-443; UNKNOWN |
| ENT-0422 | RDKit | Scientific workflows / domain platforms / robotics | https://github.com/rdkit/rdkit | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Molecular representations, descriptors and cheminformatics | C-436; UNKNOWN |
| ENT-0416 | Snakemake | Scientific workflows / domain platforms / robotics | https://github.com/snakemake/snakemake | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | Rule-based reproducible scientific workflows | C-430; UNKNOWN |
| ENT-0426 | xarray | Scientific workflows / domain platforms / robotics | https://github.com/pydata/xarray | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Labeled multidimensional arrays and domain metadata | C-440; UNKNOWN |
| ENT-0343 | Anserini | Search / scholarly knowledge / retrieval | https://github.com/castorini/anserini | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Reproducible Lucene research baselines | C-349; UNKNOWN |
| ENT-0350 | ASReview | Search / scholarly knowledge / retrieval | https://github.com/asreview/asreview | Apache-2.0 | SOURCE_INSPECTED | Auditable active-learning prioritization for systematic review | C-356; UNKNOWN |
| ENT-0341 | BEIR | Search / scholarly knowledge / retrieval | https://github.com/beir-cellar/beir | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Heterogeneous zero-shot information-retrieval evaluation | C-347; UNKNOWN |
| ENT-0339 | ColBERT | Search / scholarly knowledge / retrieval | https://github.com/stanford-futuredata/ColBERT | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Late-interaction multi-vector retrieval | C-345; UNKNOWN |
| ENT-0348 | DataCite | Search / scholarly knowledge / retrieval | https://datacite.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | Research object identifiers and metadata | C-354; UNKNOWN |
| ENT-0346 | Europe PMC | Search / scholarly knowledge / retrieval | https://europepmc.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | Life-science literature, full text, citations and annotations | C-352; UNKNOWN |
| ENT-0344 | GROBID | Search / scholarly knowledge / retrieval | https://github.com/kermitt2/grobid | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Structured extraction from scholarly PDFs | C-350; UNKNOWN |
| ENT-0338 | LanceDB | Search / scholarly knowledge / retrieval | https://github.com/lancedb/lancedb | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | Embedded multimodal vector tables over columnar storage | C-344; UNKNOWN |
| ENT-0335 | Meilisearch | Search / scholarly knowledge / retrieval | https://github.com/meilisearch/meilisearch | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Low-latency typo-tolerant product search | C-341; UNKNOWN |
| ENT-0345 | OpenAIRE Research Graph | Search / scholarly knowledge / retrieval | https://graph.openaire.eu | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | Cross-source research graph and provenance | C-351; UNKNOWN |
| ENT-0349 | ORCID | Search / scholarly knowledge / retrieval | https://orcid.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | Researcher identifiers and affiliation assertions | C-355; UNKNOWN |
| ENT-0333 | ParadeDB | Search / scholarly knowledge / retrieval | https://github.com/paradedb/paradedb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Transactional Postgres-native full-text and hybrid search | C-339; UNKNOWN |
| ENT-0342 | PyTerrier | Search / scholarly knowledge / retrieval | https://github.com/terrier-org/pyterrier | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Declarative retrieval experiment pipelines | C-348; UNKNOWN |
| ENT-0334 | Solr | Search / scholarly knowledge / retrieval | https://github.com/apache/solr | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Lucene-based distributed indexing, faceting and query services | C-340; UNKNOWN |
| ENT-0340 | SPLADE | Search / scholarly knowledge / retrieval | https://github.com/naver/splade | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Learned sparse lexical expansion | C-346; UNKNOWN |
| ENT-0336 | Typesense | Search / scholarly knowledge / retrieval | https://github.com/typesense/typesense | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Operationally simple typo-tolerant search | C-342; UNKNOWN |
| ENT-0337 | Weaviate | Search / scholarly knowledge / retrieval | https://github.com/weaviate/weaviate | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Hybrid sparse/dense retrieval with schema and filters | C-343; UNKNOWN |
| ENT-0332 | Zoekt | Search / scholarly knowledge / retrieval | https://github.com/sourcegraph/zoekt | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Trigram-indexed high-performance regex and code search | C-338; UNKNOWN |
| ENT-0317 | CBMC | Security / reliability / formal methods / evaluation | https://github.com/diffblue/cbmc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | bounded model checking for C/C++ \| OFFICIAL_MANUAL_INSPECTED \| A_REFERENCE | C-323; RAW-0531 |
| ENT-0324 | Chaos Mesh | Security / reliability / formal methods / evaluation | https://github.com/chaos-mesh/chaos-mesh | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Kubernetes CRD/controller fault injection \| OFFICIAL_ARCHITECTURE_INSPECTED \| A | C-330; RAW-0531 |
| ENT-0304 | Confidential Containers | Security / reliability / formal methods / evaluation | https://github.com/confidential-containers/confidential-containers | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | confidential VM pod plus Trustee attestation \| OFFICIAL_ARCHITECTURE_AND_TRUST_MODEL_INSPECTED \| A_FRONTIER | C-310; RAW-0531 |
| ENT-0381 | cvc5 | Security / reliability / formal methods / evaluation | https://github.com/cvc5/cvc5 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | SMT solver with proof and theory support | C-394; UNKNOWN |
| ENT-0312 | Dafny | Security / reliability / formal methods / evaluation | https://github.com/dafny-lang/dafny | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | verification-aware programming language \| OFFICIAL_DOCUMENTATION_INSPECTED \| A | C-318; RAW-0531 |
| ENT-0383 | FoundationDB Simulation Harness | Security / reliability / formal methods / evaluation | https://github.com/apple/foundationdb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Deterministic simulation and fault injection for distributed systems | C-396; UNKNOWN |
| ENT-0305 | Gramine | Security / reliability / formal methods / evaluation | https://github.com/gramineproject/gramine | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Linux library OS for SGX \| REPOSITORY_AND_DOCUMENTATION_INSPECTED \| B | C-311; RAW-0531 |
| ENT-0321 | Hypothesis | Security / reliability / formal methods / evaluation | https://github.com/HypothesisWorks/hypothesis | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | data-generating property tests with shrinking \| OFFICIAL_DOCUMENTATION_INSPECTED \| A | C-327; RAW-0531 |
| ENT-0323 | Jepsen | Security / reliability / formal methods / evaluation | https://github.com/jepsen-io/jepsen | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | generative fault-injection plus history checking \| OFFICIAL_ANALYSES_AND_METHOD_INSPECTED \| S_PRIMITIVE | C-329; RAW-0531 |
| ENT-0379 | Kani | Security / reliability / formal methods / evaluation | https://github.com/model-checking/kani | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Bounded model checking for Rust | C-392; UNKNOWN |
| ENT-0293 | Kata Containers | Security / reliability / formal methods / evaluation | https://github.com/kata-containers/kata-containers | Apache-2.0 | DOCUMENTATION_INSPECTED | VM-isolated OCI container runtime \| DOCUMENTATION_SECURITY_ADVISORIES_INSPECTED \| A | C-297; RAW-0531 |
| ENT-0313 | Lean 4 | Security / reliability / formal methods / evaluation | https://github.com/leanprover/lean4 | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | dependent type theory proof assistant and programming language \| OFFICIAL_CURRENT_DOCUMENTATION_INSPECTED \| A_FRONTIER | C-319; RAW-0531 |
| ENT-0382 | OSS-Fuzz | Security / reliability / formal methods / evaluation | https://github.com/google/oss-fuzz | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Continuous coverage-guided fuzzing infrastructure | C-395; UNKNOWN |
| ENT-0297 | seL4 | Security / reliability / formal methods / evaluation | https://github.com/seL4/seL4 | MIXED_COMPONENT_LICENSES | SOURCE_INSPECTED | formally verified capability microkernel \| FORMAL_ASSURANCE_AND_PLATFORM_MATRIX_INSPECTED \| S_PRIMITIVE | C-301; RAW-0531 |
| ENT-0380 | Z3 | Security / reliability / formal methods / evaluation | https://github.com/Z3Prover/z3 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | SMT solving for verification and synthesis | C-393; UNKNOWN |
| ENT-0271 | Ax | Statistics / causal inference / autonomous science | https://github.com/facebook/Ax | MIT ; VERIFY_BEFORE_ADOPTION | ISSUES_INSPECTED | A_EXPERIMENT_PLATFORM \| Service/platform layer for adaptive experiments \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-272; RAW-0393 |
| ENT-0267 | causal-learn | Statistics / causal inference / autonomous science | https://github.com/py-why/causal-learn | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_CAUSAL_DISCOVERY \| Constraint, score and functional causal discovery toolkit \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-268; RAW-0393 |
| ENT-0264 | EconML | Statistics / causal inference / autonomous science | https://github.com/py-why/EconML | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_CAUSAL_LIBRARY \| Orthogonal and double-machine-learning estimators \| REPOSITORY_AND_ASSUMPTIONS_VERIFIED | C-265; RAW-0393 |
| ENT-0257 | NumPyro | Statistics / causal inference / autonomous science | https://github.com/pyro-ppl/numpyro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_STATISTICAL_RUNTIME \| JAX-transformed functional PPL \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-258; RAW-0393 |
| ENT-0272 | Optuna | Statistics / causal inference / autonomous science | https://github.com/optuna/optuna | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | A_OPTIMIZATION_PLATFORM \| Define-by-run adaptive trial and pruning system \| REPOSITORY_ISSUES_AND_DOCUMENTATION_VERIFIED | C-273; RAW-0393 |
| ENT-0256 | PyMC | Statistics / causal inference / autonomous science | https://github.com/pymc-devs/pymc | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | S_A_STATISTICAL_RUNTIME \| Python graph-based Bayesian modeling \| REPOSITORY_RELEASE_AND_DOCUMENTATION_VERIFIED | C-257; RAW-0393 |
| ENT-0260 | Pyro | Statistics / causal inference / autonomous science | https://github.com/pyro-ppl/pyro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_B_STATISTICAL_RUNTIME \| Dynamic effect-handler PPL in PyTorch \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-261; RAW-0393 |
| ENT-0273 | SMAC3 | Statistics / causal inference / autonomous science | https://github.com/automl/SMAC3 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_OPTIMIZATION_LIBRARY \| Model-based configuration with intensification \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-274; RAW-0393 |
| ENT-0269 | Tetrad | Statistics / causal inference / autonomous science | https://github.com/cmu-phil/tetrad | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_CLASSIC_CAUSAL_SYSTEM \| Long-running causal discovery workbench \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-270; RAW-0393 |
| ENT-0266 | Tigramite | Statistics / causal inference / autonomous science | https://github.com/jakobrunge/tigramite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_CAUSAL_DISCOVERY \| Time-series causal discovery with conditional independence tests \| REPOSITORY_PAPER_AND_ASSUMPTIONS_VERIFIED | C-267; RAW-0393 |
| ENT-0258 | Turing.jl | Statistics / causal inference / autonomous science | https://github.com/TuringLang/Turing.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | A_STATISTICAL_RUNTIME \| Composable Julia PPL \| REPOSITORY_AND_DIAGNOSTICS_VERIFIED | C-259; RAW-0393 |
| ENT-0372 | DoubleML | Statistics / causal inference / experiments / laboratory | https://github.com/DoubleML/doubleml-for-py | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Double/debiased machine learning | C-383; UNKNOWN |
| ENT-0373 | Tiled | Statistics / causal inference / experiments / laboratory | https://github.com/bluesky/tiled | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Structured scientific data access and catalog service | C-386; UNKNOWN |

## 8. Tier C / Landscape Leads

Tier C preserves breadth, niche systems, historical references and alternative implementations. These leads should be revisited only when a concrete problem makes them competitive.

| ID | PROJECT / ENTITY | DOMAIN | CANONICAL SOURCE | LICENSE | EVIDENCE | WHY PRESERVED | RAW PROVENANCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENT-0130 | Alive2 | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | SMT-based translation validation for LLVM transformations \| MIT \| SOURCE_INSPECTED | C-125; RAW-0466 |
| ENT-0124 | Apache TVM Relax / TIR | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | High-level tensor/dataflow IR plus low-level tensor IR \| Apache-2.0 \| SOURCE_INSPECTED | C-119; RAW-0466 |
| ENT-0108 | C2PA 2.4 | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_CONTENT_PROVENANCE_STANDARD \| Signed content credentials and repository receipts | C-103; RAW-0020 |
| ENT-0099 | CamFlow | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_SECURITY_PRIMITIVE \| Whole-system provenance through Linux security hooks | C-094; RAW-0020 |
| ENT-0127 | Clang LibTooling / AST Matchers | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Compiler-native source analysis and refactoring APIs \| Apache-2.0 with LLVM Exceptions \| DOCUMENTATION_INSPECTED | C-122; RAW-0466 |
| ENT-0071 | Cline | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Approval-gated IDE agent with checkpoints and worktrees \| Apache-2.0 \| SOURCE_INSPECTED | C-064; RAW-0465 |
| ENT-0125 | CodeQL | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Code-as-relational-database query platform \| MIT for query libraries; CodeQL CLI terms differ \| SOURCE_INSPECTED | C-120; RAW-0466 |
| ENT-0132 | ColBERTv2 | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| A_RETRIEVAL_PRIMITIVE \| Compressed token-level late-interaction retrieval | C-127; RAW-0020 |
| ENT-0135 | Cranelift / Winch | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Compile-latency tiered code generation \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-130; RAW-0466 |
| ENT-0105 | CycloneDX 1.7 | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_BOM_STANDARD \| Extensible BOM graph for software, hardware, services, crypto and AI | C-100; RAW-0020 |
| ENT-0082 | Debug Adapter Protocol | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Capability-negotiated editor-debugger protocol \| CC-BY-4.0 specification; implementations vary \| DOCUMENTATION_INSPECTED | C-076; RAW-0465 |
| ENT-0090 | FAIR Digital Objects | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_FRONTIER_STANDARD \| Persistent typed digital object architecture | C-084; RAW-0020 |
| ENT-0074 | Gemini CLI | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Extensible terminal agent with tools and MCP \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-067; RAW-0465 |
| ENT-0086 | Glean | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Typed incremental source-code fact store \| Verify exact repository license before reuse \| DOCUMENTATION_INSPECTED | C-080; RAW-0465 |
| ENT-0075 | Goose | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | MCP/ACP-based local agent with recipes and subagents \| Apache-2.0 \| SOURCE_INSPECTED | C-068; RAW-0465 |
| ENT-0119 | GraalVM / Truffle | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Partial-evaluation language implementation framework \| GPLv2 with Classpath Exception for GraalVM CE modules; verify component licenses \| SOURCE_INSPECTED | C-114; RAW-0466 |
| ENT-0111 | IETF SCITT | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| B_FRONTIER_STANDARD \| Transparency services for generic signed statements | C-106; RAW-0020 |
| ENT-0096 | IPyflow | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Fine-grained dynamic read/write dependency tracking \| BSD-3-Clause \| SOURCE_INSPECTED | C-090; RAW-0465 |
| ENT-0053 | Jupyter Enterprise Gateway | Coding / IDE / notebooks / evidence tooling, Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Remote kernel lifecycle and persistence \| Official docs inspected \| B subsystem | C-045, C-092; RAW-0465, RAW-0519 |
| ENT-0081 | Language Server Protocol | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Versioned client-language-server protocol \| CC-BY-4.0 specification; implementations vary \| DOCUMENTATION_INSPECTED | C-075; RAW-0465 |
| ENT-0095 | Livebook | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Ordered collaborative notebook with explicit runtimes \| Apache-2.0 \| SOURCE_INSPECTED | C-089; RAW-0465 |
| ENT-0116 | LLVM | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Low-level typed SSA optimization IR \| Apache-2.0 with LLVM Exceptions \| SOURCE_INSPECTED | C-111; RAW-0466 |
| ENT-0118 | MLIR Transform Dialect | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Explicit transform plans with effects, failure modes and handles \| Apache-2.0 with LLVM Exceptions \| DOCUMENTATION_INSPECTED | C-113; RAW-0466 |
| ENT-0093 | Nextflow Lineage | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_COMPONENT \| Native content-addressed workflow lineage records | C-087; RAW-0020 |
| ENT-0113 | Ninja | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Minimal low-overhead build graph executor \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-108; RAW-0465 |
| ENT-0098 | noWorkflow | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_PRIMITIVE \| Python execution provenance without workflow rewrite | C-093; RAW-0020 |
| ENT-0073 | OpenAI Codex CLI | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Rust terminal agent with sandbox and approval policy \| Apache-2.0 \| SOURCE_INSPECTED | C-066; RAW-0465 |
| ENT-0077 | OpenCode | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Client-server agent with plan/build modes and LSP integration \| MIT \| SOURCE_INSPECTED | C-070; RAW-0465 |
| ENT-0102 | Pachyderm | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_DATA_PLATFORM \| Versioned data repositories and global pipeline commits | C-097; RAW-0020 |
| ENT-0134 | Rascal | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Integrated parsing, analysis, transformation and visualization language \| BSD-style project license; verify exact terms \| SOURCE_INSPECTED | C-129; RAW-0466 |
| ENT-0107 | Remote Execution API | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Action cache plus content-addressed remote execution protocol \| Apache-2.0 \| SOURCE_INSPECTED | C-102; RAW-0465 |
| ENT-0097 | ReproZip | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_COMPONENT \| Observed dependency capture and portable execution bundle | C-091; RAW-0020 |
| ENT-0128 | RobotReviewer | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| B_EVIDENCE_COMPONENT \| Automated risk-of-bias and RCT evidence extraction | C-123; RAW-0020 |
| ENT-0072 | Roo Code | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Mode-driven IDE agent \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-065; RAW-0465 |
| ENT-0085 | SCIP | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Compiler-produced semantic index exchange \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-079; RAW-0465 |
| ENT-0122 | Semantic Scholar S2AG and S2ORC | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| A_SCHOLARLY_CORPUS \| Scholarly graph, parsed full text and model-derived fields | C-117; RAW-0020 |
| ENT-0089 | Semgrep | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Pattern and dataflow analysis engine \| LGPL-2.1 for engine; product components vary \| SOURCE_INSPECTED | C-083; RAW-0465 |
| ENT-0112 | Shake | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Dynamic dependency discovery with correctness linting \| BSD-3-Clause \| DOCUMENTATION_INSPECTED | C-107; RAW-0465 |
| ENT-0126 | SKG-IF | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| A_B_EMERGING_STANDARD \| Scientific knowledge graph interoperability framework | C-121; RAW-0020 |
| ENT-0087 | SLSA | Coding / IDE / notebooks / evidence tooling, Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| S_SUPPLY_CHAIN_STANDARD \| Build provenance and supply-chain assurance levels | C-081, C-308; RAW-0020, RAW-0531 |
| ENT-0104 | Software Heritage and SWHID | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| S_ARCHIVE_STANDARD \| Typed Merkle identity for software artifacts | C-099; RAW-0020 |
| ENT-0106 | SPDX 3.0 | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_BOM_STANDARD \| ISO-rooted software and supply-chain data model | C-101; RAW-0020 |
| ENT-0133 | Spoofax | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Declarative syntax, name/type analysis and transformation generation \| Apache-2.0 \| SOURCE_INSPECTED | C-128; RAW-0466 |
| ENT-0129 | Trialstreamer | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| A_B_RESEARCH_INFRA \| Living clinical-trial evidence map | C-124; RAW-0020 |
| ENT-0079 | Visual Studio Code | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Process-isolated extension host with contribution points \| MIT \| DOCUMENTATION_INSPECTED | C-072; RAW-0465 |
| ENT-0136 | wasm-tools | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Low-level WebAssembly validation, composition and transformation tools \| Apache-2.0 \| SOURCE_INSPECTED | C-131; RAW-0466 |
| ENT-0094 | Whole Tale | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_REFERENCE \| Executable research tale and environment capsule | C-088; RAW-0020 |
| ENT-0091 | Workflow Run RO-Crate | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| S_SCIENCE_PROFILE \| Portable workflow-execution research object profile | C-085; RAW-0020 |
| ENT-0151 | Apache Hudi | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Incremental mutable lake table \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-146; RAW-0467 |
| ENT-0149 | Apache Iceberg | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Manifest and snapshot table log \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-144; RAW-0467 |
| ENT-0174 | Apache Jena and TDB2 | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RDF quad store and SPARQL algebra \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-174; RAW-0467 |
| ENT-0148 | Apache Parquet | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Row-group columnar file \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-143; RAW-0467 |
| ENT-0146 | ClickHouse | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Distributed columnar OLAP \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-141; RAW-0467 |
| ENT-0176 | CozoDB | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Datalog relational graph engine \| MPL-2.0 \| DOCUMENTATION_INSPECTED | C-177; RAW-0467 |
| ENT-0173 | DataHub | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Metadata graph and change log \| Apache-2.0 core; managed features separate \| AUTHORITATIVE_PAGE_VERIFIED | C-173; RAW-0467 |
| ENT-0150 | Delta Lake | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Transaction-log table format \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-145; RAW-0467 |
| ENT-0139 | DuckDB | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Embedded vectorized OLAP \| MIT \| SOURCE_INSPECTED | C-134; RAW-0467 |
| ENT-0177 | Eclipse RDF4J | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Modular RDF repository and SPARQL stack \| EPL-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-178; RAW-0467 |
| ENT-0144 | Feldera | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Compiled incremental SQL \| UNKNOWN - verify current repository license \| DOCUMENTATION_INSPECTED | C-139; RAW-0467 |
| ENT-0155 | Git object database and packfiles | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Content-addressed object graph \| GPL-2.0 \| DOCUMENTATION_INSPECTED | C-150; RAW-0467 |
| ENT-0157 | IPFS CID, IPLD and trustless gateways | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Self-describing typed content address \| Specification and implementations vary; verify component \| STANDARD_INSPECTED | C-153; RAW-0467 |
| ENT-0152 | Lance | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Versioned multimodal columnar format \| Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-147; RAW-0467 |
| ENT-0172 | Marquez | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | OpenLineage reference metadata service \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-172; RAW-0467 |
| ENT-0160 | OpenSearch | Data / search / knowledge / provenance | https://github.com/opensearch-project/OpenSearch | Apache-2.0 | REPOSITORY_METADATA_VERIFIED | Sharded distributed Lucene service \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-158; RAW-0467 |
| ENT-0156 | ORAS | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | OCI artifact client and libraries \| Apache-2.0 \| DOCUMENTATION_INSPECTED | C-152; RAW-0467 |
| ENT-0175 | Oxigraph | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Embedded RDF and SPARQL engine \| MIT / Apache-2.0 \| AUTHORITATIVE_PAGE_VERIFIED | C-175; RAW-0467 |
| ENT-0137 | PostgreSQL | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | MVCC relational fact store \| PostgreSQL License \| DOCUMENTATION_INSPECTED | C-132; RAW-0467 |
| ENT-0141 | RocksDB | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | LSM embedded key-value engine \| Apache-2.0 / GPL-2.0 dual licensing \| DOCUMENTATION_INSPECTED | C-136; RAW-0467 |
| ENT-0168 | Semantic Scholar Academic Graph | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Scholarly graph plus learned enrichment \| Data licenses vary by dataset \| DOCUMENTATION_INSPECTED | C-166; RAW-0467 |
| ENT-0138 | SQLite | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Embedded transactional relational store \| Public domain \| AUTHORITATIVE_PAGE_VERIFIED | C-133; RAW-0467 |
| ENT-0153 | TileDB | Data / search / knowledge / provenance | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Sparse and dense array engine \| MIT core; commercial services separate \| AUTHORITATIVE_PAGE_VERIFIED | C-148; RAW-0467 |
| ENT-0395 | HashiCorp Nomad | Distributed systems / cloud / messaging / observability | https://github.com/hashicorp/nomad | BUSL; VERIFY_USAGE | REPOSITORY_METADATA_VERIFIED | General-purpose scheduler across heterogeneous workloads | C-408; UNKNOWN |
| ENT-0399 | Redpanda | Distributed systems / cloud / messaging / observability | https://github.com/redpanda-data/redpanda | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | Kafka-compatible single-binary streaming system | C-412; UNKNOWN |
| ENT-0035 | Avatar Engine | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Agent-specific append-only effect ledger \| avatar-runtime / Python、Postgres \| Apache-2.0 | C-025; RAW-0461 |
| ENT-0032 | AWS Lambda Durable Functions | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Serverless history replay \| AWS \| 闭源服务/SDK | C-022; RAW-0461 |
| ENT-0033 | AWS Lambda MicroVMs | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 托管状态化 microVM \| AWS \| 闭源服务 | C-023; RAW-0461 |
| ENT-0031 | AWS Step Functions | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 托管状态机 \| AWS \| 闭源服务 | C-021; RAW-0461 |
| ENT-0021 | Azure Durable Task | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 事件溯源函数编排 \| Microsoft / 多语言 \| Apache-2.0（核心） | C-011; RAW-0461 |
| ENT-0067 | Browserless Session Persistence | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-060; RAW-0496 |
| ENT-0022 | Cadence | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 确定性事件历史重放 \| Uber / Go \| Apache-2.0 | C-012; RAW-0461 |
| ENT-0044 | Causet | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | AUTHORITATIVE_PAGE_VERIFIED / SOURCE_UNAVAILABLE | Reference for Durable execution / external effects | C-035; RAW-0480 |
| ENT-0064 | Concordia | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Cross-layer checkpointing for interactive/accelerated systems \| Paper inspected \| B frontier | C-056; RAW-0519 |
| ENT-0019 | Conductor OSS | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 声明式状态机 + Task Queue \| Conductor OSS / Java \| Apache-2.0 | C-010; RAW-0461 |
| ENT-0028 | Crab | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 语义感知 Agent Sandbox C/R \| 学术团队 / Python、eBPF、CRIU、ZFS \| MIT | C-018; RAW-0461 |
| ENT-0026 | CRIU | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 进程/容器 checkpoint-restore \| CRIU community / C \| GPL-2.0 为主 | C-016; RAW-0461 |
| ENT-0047 | CRIUgpu | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GPU process checkpoint/restart research implementation \| Paper/repository inspected \| A/B frontier | C-039; RAW-0519 |
| ENT-0007 | Dapr Workflow | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Durable Task + sidecar + 可签名历史 \| CNCF/Dapr / Go \| Apache-2.0 | C-004; RAW-0461 |
| ENT-0048 | DMTCP | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Transparent distributed process checkpointing \| Official documentation inspected \| A/B primitive | C-040; RAW-0519 |
| ENT-0029 | Erlang/OTP Supervisor | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 监督树 \| Ericsson/OTP / Erlang \| Apache-2.0 | C-019; RAW-0461 |
| ENT-0034 | ESAA | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Event-Sourced Autonomous Agents \| 研究论文 \| 论文/原型 | C-024; RAW-0461 |
| ENT-0051 | FTI | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Application-level multi-level HPC checkpoint library \| Official docs/API inspected \| A/B subsystem | C-043; RAW-0519 |
| ENT-0023 | Golem | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | WASM durable worker + operation log \| Golem Cloud / Rust \| BSL 1.1 → Apache-2.0 | C-013; RAW-0461 |
| ENT-0041 | Gollem (Fugue Labs) | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-032; RAW-0495 |
| ENT-0009 | Inngest | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 步骤记忆化 / 函数重建 \| Inngest / Go、TS \| SSPL-1.0，未来 Apache-2.0 | C-005; RAW-0461 |
| ENT-0054 | Kishu | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Notebook state versioning and time travel \| Paper inspected \| A/B frontier | C-046; RAW-0519 |
| ENT-0030 | Kubernetes Controllers/Jobs | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | 期望状态对账 \| CNCF / Go \| Apache-2.0 | C-020; RAW-0461 |
| ENT-0061 | Ledger | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Explicit execution state for long-horizon coding agents \| Paper inspected \| A research | C-053; RAW-0519 |
| ENT-0049 | MANA | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | MPI-agnostic checkpoint/restart via split processes \| Paper and NERSC docs inspected \| A primitive | C-041; RAW-0519 |
| ENT-0046 | NVIDIA CUDA Driver API Checkpoint | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GPU context checkpoint API \| Official API inspected \| B primitive | C-038; RAW-0519 |
| ENT-0024 | Obelisk | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | WASM 确定性 Workflow + WIT \| obeli-sk / Rust \| AGPL-3.0；WIT/Proto 子目录 MIT | C-014; RAW-0461 |
| ENT-0069 | Object-store Conditional Generation Preconditions | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-062; RAW-0496 |
| ENT-0070 | Observable Runtime | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-002 \| A_PRODUCT_REFERENCE \| Demand-driven reactive dataflow notebook runtime | C-063; RAW-0020 |
| ENT-0056 | OPC UA audit/method model | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Audited industrial method invocation \| Standard/docs inspected \| A protocol reference | C-048; RAW-0519 |
| ENT-0060 | OpenComputer durable sessions | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Durable interactive computer sessions \| Public docs/demo repository discovered \| B frontier | C-052; RAW-0519 |
| ENT-0059 | Pagerunner | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Browser session checkpoint including tabs/cookies/storage/forms \| Product page inspected; source/execution pending \| B product reference | C-051; RAW-0519 |
| ENT-0068 | Playwright storageState | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-061; RAW-0496 |
| ENT-0062 | REMIT / RESUME CONTRACT | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Formal contract and fault matrix for workflow resume \| Paper inspected \| S primitive/research | C-054; RAW-0519 |
| ENT-0016 | Resonate | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Durable Promise / 分布式 async-await \| Resonate HQ / Rust \| Apache-2.0 | C-008; RAW-0461 |
| ENT-0025 | Rivet Actors | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Durable Actor / hibernation \| Rivet / Rust、TypeScript \| Apache-2.0 | C-015; RAW-0461 |
| ENT-0063 | SAGA workflow-atomic GPU scheduling | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Atomic scheduling across workflow/GPU resources \| Paper inspected \| B frontier | C-055; RAW-0519 |
| ENT-0050 | SCR | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Multi-level scalable checkpoint/restart for HPC \| Official docs/results inspected \| A subsystem | C-042; RAW-0519 |
| ENT-0058 | thaw | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Live LLM serving session checkpoint/branch/diff/restore \| Authoritative page inspected; source/execution pending \| B frontier | C-050; RAW-0519 |
| ENT-0012 | Trigger.dev | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Waitpoint + CRIU/快照恢复 \| Trigger.dev / TypeScript \| Apache-2.0 | C-006; RAW-0461 |
| ENT-0052 | VeloC | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Checkpoint coordination and multi-level storage \| Paper/docs inspected \| B/A reference | C-044; RAW-0519 |
| ENT-0226 | AdaptiveCpp | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_PORTABILITY \| Multi-backend SYCL implementation \| REPOSITORY_VERIFIED | C-227; RAW-0447 |
| ENT-0253 | ADIOS2 | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_IO \| Streaming and file scientific data transport \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-254; RAW-0447 |
| ENT-0242 | CasADi | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_OPTIMIZATION \| Symbolic-numeric nonlinear optimization framework \| DOCUMENTATION_VERIFIED | C-243; RAW-0447 |
| ENT-0228 | Chapel | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_LANGUAGE \| Productive global-view parallel language \| AUTHORITATIVE_REPOSITORY_VERIFIED | C-229; RAW-0447 |
| ENT-0249 | ExBLAS | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_PRIMITIVE \| Accurate and reproducible BLAS reductions \| REPOSITORY_AND_PAPER_VERIFIED | C-250; RAW-0447 |
| ENT-0236 | Firedrake | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_SCIENCE \| Automated PDE discretization and solver composition \| DOCUMENTATION_VERIFIED | C-237; RAW-0447 |
| ENT-0219 | GASNet-EX | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_COMMUNICATION \| PGAS and active-message communication substrate \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-220; RAW-0447 |
| ENT-0254 | HDF5 | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_IO \| Hierarchical portable scientific data format and library \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-255; RAW-0447 |
| ENT-0252 | Herbgrind | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | B_RESEARCH \| Dynamic floating-point root-cause analysis \| PAPER_AND_REPOSITORY_VERIFIED | C-253; RAW-0447 |
| ENT-0240 | JAX | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_DIFFERENTIABLE \| Program transformations over array programs \| DOCUMENTATION_AND_LOCAL_EXECUTION | C-241; RAW-0447 |
| ENT-0245 | JuMP and MathOptInterface | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_MODELING \| Solver-independent algebraic modeling and interface layer \| DOCUMENTATION_VERIFIED | C-246; RAW-0447 |
| ENT-0220 | Legion and Realm | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_ARCHITECTURE \| Logical-region data-centric task runtime \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-221; RAW-0447 |
| ENT-0227 | OpenMP 6.0 | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_STANDARD \| Directive-based shared-memory and accelerator programming \| SPECIFICATION_AND_IMPLEMENTATION_MATRIX_VERIFIED | C-228; RAW-0447 |
| ENT-0250 | Random123 | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_PRIMITIVE \| Counter-based parallel random generators \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-251; RAW-0447 |
| ENT-0248 | ReproBLAS | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_PRIMITIVE \| Binned reproducible reductions \| PAPER_AND_AUTHORITATIVE_PAGE_VERIFIED | C-249; RAW-0447 |
| ENT-0251 | Verificarlo | HPC / numerical computing / optimization | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_TESTING \| LLVM-based floating-point variability instrumentation \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-252; RAW-0447 |
| ENT-0213 | DCGM Exporter | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GPU health and utilization metrics exporter \| Apache-2.0 \| REPOSITORY_SCREENED | C-214; RAW-0502 |
| ENT-0204 | DeepGEMM | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Specialized GPU GEMM library \| MIT \| REPOSITORY_VERIFIED | C-205; RAW-0502 |
| ENT-0188 | DistServe | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Prefill/decode disaggregated serving \| Apache-2.0 \| PAPER_AND_REPOSITORY_SCREENED | C-189; RAW-0502 |
| ENT-0196 | Envoy AI Gateway | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Envoy/Gateway API traffic policy \| Apache-2.0 \| REPOSITORY_VERIFIED | C-197; RAW-0502 |
| ENT-0201 | FlashInfer | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Composable LLM inference kernels \| Apache-2.0 \| REPOSITORY_VERIFIED | C-202; RAW-0502 |
| ENT-0197 | Gateway API Inference Extension | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Kubernetes inference-aware routing extension \| Apache-2.0 \| REPOSITORY_VERIFIED | C-198; RAW-0502 |
| ENT-0211 | GGUF / ggml | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Portable quantized model artifact ecosystem \| MIT \| REPOSITORY_VERIFIED | C-212; RAW-0502 |
| ENT-0210 | GPTQModel | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Modern GPTQ model quantization/runtime support \| Apache-2.0 \| REPOSITORY_SCREENED | C-211; RAW-0502 |
| ENT-0185 | LightLLM | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Lightweight distributed serving runtime \| Apache-2.0 \| REPOSITORY_VERIFIED | C-186; RAW-0502 |
| ENT-0208 | LLM Compressor | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Quantization/compression toolkit \| Apache-2.0 \| REPOSITORY_SCREENED | C-209; RAW-0502 |
| ENT-0190 | LMCache | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reusable KV cache layer \| Apache-2.0 \| REPOSITORY_VERIFIED | C-191; RAW-0502 |
| ENT-0184 | LMDeploy | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | TurboMind/PyTorch deployment runtime \| Apache-2.0 \| REPOSITORY_VERIFIED | C-185; RAW-0502 |
| ENT-0183 | MLC-LLM | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Cross-device compiled inference \| Apache-2.0 \| REPOSITORY_VERIFIED | C-184; RAW-0502 |
| ENT-0214 | MLPerf Inference / AIPerf / Prism | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Serving performance and methodology references \| Mixed open licenses; verify component \| STANDARD_AND_REPOSITORY_SCREENED | C-215; RAW-0502 |
| ENT-0206 | NCCL | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Collective communication library \| BSD-3-Clause \| REPOSITORY_AND_ISSUES_SCREENED | C-207; RAW-0502 |
| ENT-0205 | NIXL | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Accelerator data-transfer library \| Apache-2.0 \| DOCUMENTATION_SCREENED | C-206; RAW-0502 |
| ENT-0212 | OpenTelemetry GenAI semantic conventions | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GenAI request/response/usage telemetry schema \| Apache-2.0 specification \| STANDARD_INSPECTED | C-213; RAW-0502 |
| ENT-0198 | RouteLLM | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Learned quality/cost router \| Apache-2.0 \| REPOSITORY_VERIFIED | C-199; RAW-0502 |
| ENT-0207 | safetensors | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Non-executable tensor serialization \| Apache-2.0 \| REPOSITORY_VERIFIED | C-208; RAW-0502 |
| ENT-0199 | TensorZero | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Model gateway with observability and optimization \| Apache-2.0 \| REPOSITORY_VERIFIED | C-200; RAW-0502 |
| ENT-0209 | TorchAO | Model serving / GPU / inference | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | PyTorch-native quantization and sparsity \| BSD-3-Clause \| REPOSITORY_SCREENED | C-210; RAW-0502 |
| ENT-0318 | AFL++ | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | coverage-guided evolutionary fuzzing \| OFFICIAL_DOCUMENTATION_INSPECTED \| A | C-324; RAW-0531 |
| ENT-0311 | Alloy Analyzer | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | bounded relational model finding \| OFFICIAL_DOCUMENTATION_INSPECTED \| A_PRIMITIVE | C-317; RAW-0531 |
| ENT-0308 | AMD SEV-SNP | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | encrypted VM with integrity-protected nested paging \| VENDOR_SPEC_AND_SECURITY_BULLETINS_INSPECTED \| B_ARCHITECTURE | C-314; RAW-0531 |
| ENT-0326 | Antithesis | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | deterministic hypervisor plus guided state-space exploration \| PUBLIC_ARCHITECTURAL_SIGNAL_AND_DOCS_INSPECTED \| S_ARCHITECTURE_SIGNAL | C-332; RAW-0531 |
| ENT-0294 | bubblewrap | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | namespace construction toolkit \| REPOSITORY_SECURITY_POLICY_INSPECTED \| B | C-298; RAW-0531 |
| ENT-0298 | CHERI / CHERIoT | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | tagged architectural capabilities \| SPECIFICATION_AND_IMPLEMENTATION_SIGNALS_INSPECTED \| S_FRONTIER | C-302; RAW-0531 |
| ENT-0292 | gVisor | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | user-space syscall interposition kernel \| DOCUMENTATION_AND_REPOSITORY_INSPECTED \| A | C-296; RAW-0531 |
| ENT-0330 | HELM | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | holistic scenario-metric evaluation and transparent leaderboards \| OFFICIAL_LEADERBOARDS_AND_FRAMEWORK_INSPECTED \| A_REFERENCE | C-336; RAW-0531 |
| ENT-0328 | Inspect AI | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | evaluation-as-code task/solver/scorer framework \| OFFICIAL_REPOSITORY_AND_DOCS_INSPECTED \| A | C-334; RAW-0531 |
| ENT-0307 | Intel TDX | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | hardware-isolated confidential VM \| VENDOR_AND_KERNEL_DOCUMENTATION_INSPECTED \| B_ARCHITECTURE | C-313; RAW-0531 |
| ENT-0315 | Isabelle | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | generic interactive theorem prover \| OFFICIAL_CURRENT_RELEASE_INSPECTED \| A_REFERENCE | C-321; RAW-0531 |
| ENT-0316 | Kani Rust Verifier | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | bounded model checking for Rust \| OFFICIAL_DOCUMENTATION_INSPECTED \| A | C-322; RAW-0531 |
| ENT-0296 | Landlock | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | unprivileged kernel-enforced filesystem sandbox \| KERNEL_DOCUMENTATION_INSPECTED \| A_PRIMITIVE | C-300; RAW-0531 |
| ENT-0319 | libFuzzer | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | in-process coverage-guided fuzzing engine \| OFFICIAL_CURRENT_DOCUMENTATION_INSPECTED \| B | C-325; RAW-0531 |
| ENT-0325 | LitmusChaos | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | control-plane/execution-plane chaos platform \| OFFICIAL_ARCHITECTURE_INSPECTED \| A | C-331; RAW-0531 |
| ENT-0329 | lm-evaluation-harness | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | configurable benchmark harness \| OFFICIAL_REPOSITORY_INSPECTED \| A_REFERENCE | C-335; RAW-0531 |
| ENT-0327 | NIST AI Risk Management Framework | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | lifecycle risk management framework \| OFFICIAL_CURRENT_FRAMEWORK_INSPECTED \| A_STANDARD | C-333; RAW-0531 |
| ENT-0295 | nsjail | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | namespaces plus seccomp jail \| REPOSITORY_INSPECTED \| B | C-299; RAW-0531 |
| ENT-0331 | OpenAI Evals | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | evaluation framework and registry \| OFFICIAL_REPOSITORY_VERIFIED \| B_REFERENCE | C-337; RAW-0531 |
| ENT-0320 | OSS-Fuzz / ClusterFuzz | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | continuous managed fuzzing service \| OFFICIAL_ARCHITECTURE_INSPECTED \| A | C-326; RAW-0531 |
| ENT-0322 | QuickCheck | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | random property testing with shrinking \| OFFICIAL_API_AND_REPOSITORY_INSPECTED \| A_REFERENCE | C-328; RAW-0531 |
| ENT-0314 | Rocq Prover | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | calculus-of-inductive-constructions proof assistant \| OFFICIAL_RELEASE_AND_DOCUMENTATION_INSPECTED \| A_REFERENCE | C-320; RAW-0531 |
| ENT-0303 | The Update Framework | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | threshold and role-separated update metadata \| SPECIFICATION_AND_REFERENCE_IMPLEMENTATION_INSPECTED \| S_PRIMITIVE | C-309; RAW-0531 |
| ENT-0377 | Vault | Security / reliability / formal methods / evaluation | https://github.com/hashicorp/vault | BUSL; VERIFY_USAGE | REPOSITORY_METADATA_VERIFIED | Dynamic credentials, encryption and secret lifecycle | C-390; UNKNOWN |
| ENT-0306 | Veraison | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RATS-aligned pluggable verification service \| OFFICIAL_ARCHITECTURE_INSPECTED \| A_PRIMITIVE | C-312; RAW-0531 |
| ENT-0283 | A-Lab | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_A_AUTONOMOUS_LAB_REFERENCE \| Closed-loop inorganic-materials synthesis laboratory \| PAPER_AND_PUBLIC_DISCUSSION_INSPECTED | C-285; RAW-0393 |
| ENT-0289 | AHOIS | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_FRONTIER \| Socratic multi-agent falsification loop \| PAPER_INSPECTED | C-293; RAW-0548 |
| ENT-0286 | BlackJAX | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_INFERENCE_PRIMITIVE \| JAX-native composable sampling kernels \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-290; RAW-0393 |
| ENT-0265 | CausalML | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_CAUSAL_LIBRARY \| Uplift and heterogeneous treatment-effect toolkit \| REPOSITORY_VERIFIED | C-266; RAW-0393 |
| ENT-0281 | FutureHouse Aviary | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_SCIENTIFIC_AGENT_ENVIRONMENT \| Scientific task environments and agent compute graphs \| OFFICIAL_ARTICLE_REPOSITORY_AND_PAPER_VERIFIED | C-282; RAW-0393 |
| ENT-0280 | FutureHouse Robin | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_AUTONOMOUS_SCIENCE_REFERENCE \| Multi-agent biological discovery workflow \| OFFICIAL_ARTICLE_REPOSITORY_AND_PAPER_VERIFIED | C-281; RAW-0393 |
| ENT-0277 | MAPIE | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_COVERAGE_LIBRARY \| Conformal prediction library \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-278; RAW-0393 |
| ENT-0274 | Nevergrad | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_OPTIMIZATION_LIBRARY \| Derivative-free optimizer portfolio \| REPOSITORY_VERIFIED | C-275; RAW-0393 |
| ENT-0268 | pgmpy | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_GRAPHICAL_MODELS \| Bayesian-network structure, inference and estimation toolkit \| REPOSITORY_VERIFIED | C-269; RAW-0393 |
| ENT-0278 | River | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_STREAMING_ML \| Streaming estimators, drift detection and progressive validation \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-279; RAW-0393 |
| ENT-0276 | safestats | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | B_FRONTIER \| e-value and safe anytime-valid testing \| REPOSITORY_AND_DOCUMENTATION_INSPECTED | C-277; RAW-0548 |
| ENT-0275 | SALib | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_SCIENTIFIC_METHOD \| Global sensitivity sampling and analysis library \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-276; RAW-0393 |
| ENT-0262 | statsmodels | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_STATISTICAL_LIBRARY \| Classical statistical model and inference library \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-263, C-283; RAW-0393, RAW-0548 |
| ENT-0261 | TensorFlow Probability | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_STATISTICAL_LIBRARY \| Probability distributions and inference layers over TensorFlow/JAX \| REPOSITORY_AND_DOCUMENTATION_VERIFIED | C-262; RAW-0393 |

## 9. Watchlist / Emerging Candidates

Watch entries are potentially important but currently too young, speculative, benchmark-dependent or fast-moving for adoption-oriented tiering.

| ID | PROJECT / ENTITY | DOMAIN | CANONICAL SOURCE | LICENSE | EVIDENCE | WHY PRESERVED | RAW PROVENANCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENT-0290 | Agentic AI for Autonomous Quantum Sensing | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_FRONTIER_PRIMITIVE \| agent hypothesis plus deterministic-control oracle loop \| PAPER_INSPECTED | C-294; RAW-0548 |
| ENT-0291 | Agentic AI for Particle-Accelerator Experiments | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_ARCHITECTURE_SIGNAL \| plan-first bounded accelerator experiment agent \| PAPER_INSPECTED | C-295; RAW-0548 |
| ENT-0288 | AutoCog | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_FRONTIER_SIGNAL \| closed-loop executable cognitive-theory discovery \| PAPER_INSPECTED | C-292; RAW-0548 |
| ENT-0287 | AutoLabs | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_FRONTIER \| self-correcting protocol-translation multi-agent system \| REPOSITORY_AND_2026_PAPER_INSPECTED | C-291; RAW-0548 |
| ENT-0282 | Coscientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_PRODUCT_ARCHITECTURAL_REFERENCE \| LLM-driven chemical experiment planning and execution reference \| PAPER_INSPECTED | C-284, C-289; RAW-0393, RAW-0548 |
| ENT-0017 | Faraday / Replica | GAP_REPAIR | https://arxiv.org/abs/2608.13331 | PAPER; code/data license UNKNOWN | PAPER_INSPECTED | 27B research-policy model using coding agents as tools on paper-replication tasks; headline result depends on rubric-judge validity. | EXT-009; RAW-0016 |
| ENT-0011 | FAROS | GAP_REPAIR | https://github.com/OpenNSWM-Lab/FAROS | UNKNOWN—revalidate repository | OFFICIAL_DOCS_INSPECTED | Blueprint/capability/profile/provider AutoResearch runtime; release-candidate maturity and incomplete DAG/execution loop. | EXT-006; RAW-0016 |
| ENT-0020 | Find, Attempt, and Recommend (FAR) | GAP_REPAIR | https://arxiv.org/abs/2608.16977 | PAPER; implementation license UNKNOWN | PAPER_INSPECTED | Literature-to-review cascade for scalable mathematical discovery and expert-attention allocation. | EXT-010; RAW-0016 |
| ENT-0045 | Google Agent Executor (AX) | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-036; RAW-0495 |
| ENT-0285 | Google Co-Scientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_ARCHITECTURE_SIGNAL \| multi-agent hypothesis tournament and evolution \| PAPER_AND_METHODS_INSPECTED | C-288; RAW-0548 |
| ENT-0065 | OpenHands Software Agent SDK | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Composable event-driven agent SDK with persistent conversations \| MIT \| SOURCE_INSPECTED | C-058; RAW-0465 |
| ENT-0457 | OpenQASM | Metrology / sustainability / browser / frontier compute | https://github.com/openqasm/openqasm | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Quantum assembly language and timing/control semantics | C-474; UNKNOWN |
| ENT-0015 | PURISTA AI Harness | GAP_REPAIR | https://github.com/puristajs/harness | MIT | IDENTITY_VERIFIED | Typed, sandboxed, observable TypeScript AI harness; early evidence and low public adoption. | EXT-008; RAW-0016 |
| ENT-0456 | Quantum Intermediate Representation | Metrology / sustainability / browser / frontier compute | https://github.com/qir-alliance/qir-spec | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | LLVM-based quantum/classical interoperability IR | C-473; UNKNOWN |
| ENT-0066 | SWE-agent | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Structured agent-computer interface \| MIT \| DOCUMENTATION_INSPECTED | C-059; RAW-0465 |
| ENT-0284 | The AI Scientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | B_FRONTIER \| end-to-end computational paper-production loop \| REPOSITORY_AND_PAPER_INSPECTED | C-286; RAW-0548 |
| ENT-0279 | The AI Scientist v2 | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_FRONTIER_REFERENCE \| End-to-end machine-learning research agent \| REPOSITORY_LICENSE_AND_PAPER_VERIFIED | C-280, C-287; RAW-0393, RAW-0548 |
| ENT-0451 | WebGPU | Metrology / sustainability / browser / frontier compute | https://github.com/gpuweb/gpuweb | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Portable browser/native GPU compute API | C-467; UNKNOWN |

Watch-specific obligations: independently reproduce frontier paper claims; validate judge/rubric reliability; inspect complete execution/security paths; recheck licenses; compare against mature non-AI baselines; record negative results and total resource cost.

## 10. Rejected / Superseded Candidates

Rejection here is scoped. A rejected ownership model or adoption mode may still contain useful components or historical architecture lessons.

| ID | SYSTEM / PATTERN | DISPOSITION | EVIDENCE / REASON | FAR-LAB LESSON / ALTERNATIVE | REVERSAL TRIGGER |
| --- | --- | --- | --- | --- | --- |
| RJ-001 | Monolithic agent framework as FAR-Lab platform owner | REJECT ownership model; retain local patterns | No single agent framework should own durability, effects, evidence, validity, security and workbench state. | Would create overlapping authorities and couple scientific truth to fast-moving agent abstractions. | Reconsider only if a system demonstrates explicit separable ownership and beats best-of-breed planes in FAR workloads. |
| RJ-002 | Vector database as canonical knowledge/memory store | REJECT as truth plane; use as rebuildable projection | Embeddings are lossy, model/version-dependent and cannot represent assertion/evidence/time/provenance semantics. | Store immutable artifacts and versioned assertions; rebuild vector/sparse/graph projections. | Never reconsider canonical ownership; only projection engine choice changes. |
| RJ-003 | CRDT state as authoritative scientific truth, quota or authorization | REJECT | Convergence does not preserve domain invariants, uniqueness, budgets or revocation. | Use for drafts/comments/layout; publish through transactional validators. | Reconsider only with proven invariant-preserving escrow/transaction boundary. |
| RJ-004 | Process/VM/GPU/browser snapshot as recovery truth | REJECT; retain as acceleration cache | Snapshots are version-sensitive, can contain secrets and cannot reconcile the external world. | Recover from logical/effect/evidence ledger; use snapshots opportunistically. | No reversal without downstream world-state protocol. |
| RJ-005 | Telemetry/message broker as audit or scientific evidence authority | REJECT | Sampling, retention, delivery and semantic models are not adequate for durable authority. | Link operational telemetry to separate audit/evidence records. | No reversal; implementation may improve but semantic roles remain distinct. |
| RJ-006 | HDF5 as general-purpose multi-writer state database | REJECT use case; retain scientific format/reference | HDF5 is valuable for arrays/interchange/parallel I/O but has unsuitable general multi-writer transactional semantics. | Use purpose-built transactional control and array stores. | Reconsider only for bounded domain data, not platform truth. |
| RJ-007 | Kuzu direct adoption | REJECT current adoption; retain architecture reference | Repository archived in October 2025 despite permissive license. | Prefer maintained graph/query options or relational+index projections. | Reconsider only after credible maintained successor/fork. |
| RJ-008 | TLA+ Eclipse Toolbox as primary workflow | SUPERSEDED | The Eclipse-based Toolbox is unmaintained; TLA+ language/TLC remain valuable. | Use CLI/VS Code tooling and Apalache where appropriate. | Reconsider only if maintained successor emerges. |
| RJ-009 | A2A as mandatory core protocol | DEFER | Federation is not a universal requirement and adds identity/security/lifecycle complexity. | Adopt only for a concrete cross-service opaque-agent federation need. | Trigger: real multi-organization agent delegation mission. |
| RJ-010 | Restate direct adoption without license/deployment review | DEFER / ARCHITECTURAL_REFERENCE | BSL terms are not equivalent to OSI open source and may restrict hosted use. | Use architecture insight; legal review before deployment/fork/service use. | Trigger: acceptable license/commercial terms plus workload proof. |
| RJ-011 | Quickwit as an unreviewed central search dependency | DEFER / LEGAL GATE | License/deployment terms and object-store/metastore failure model require exact review. | Use Lucene/Tantivy/other comparators until legal and workload proof. | Trigger: legal approval and superior FAR benchmark. |
| RJ-012 | README/star-count adoption | REJECT evaluation method | Popularity and prose do not establish architecture, license, failure semantics or scientific correctness. | Use candidate verification funnel and source/execution evidence. | No reversal. |
| RJ-013 | Leaked/private-source implementation claims | QUARANTINE | Unauthorized or unverifiable proprietary implementation details cannot support the verified core. | Use legitimate public docs/APIs/papers or mark UNKNOWN. | Trigger: lawful authoritative evidence. |
| RJ-014 | Agent memory as workflow recovery | REJECT equivalence | Conversational/vector memory lacks durable history, versioning, idempotency, ownership and reconciliation. | Keep context/memory as rebuildable projection over canonical state. | No reversal without full durable-control semantics. |
| RJ-015 | Signatures/DOIs/benchmarks as scientific validity | REJECT equivalence | Authenticity, persistence and task scores answer different questions from methodological validity. | Maintain independent validity assessments and expert/domain gates. | No reversal. |

## 11. Technology Primitive Registry

Primitives are reusable mechanisms independent of any single project. This complete registry is retained because a weak or rejected project can still expose a valuable primitive.

| ID | PRIMITIVE | RESEARCH UNIT | PROBLEM SOLVED | ORIGIN / REFERENCE SYSTEMS | TRADEOFFS | POSSIBLE FAR-LAB RELEVANCE | MATURITY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-016 | Semantic checkpoint trigger | PREVIOUS_BATCH | Checkpoint only when recoverable state changed | Crab research / Crab research | Needs robust change detector | Workspace snapshot policy | MATURE_OR_EMERGING |
| P-050 | Recovery concurrency budget | PREVIOUS_BATCH | Prevent restart storms | Incident engineering / Incident engineering | Slower nominal recovery | Separate recovery queue | MATURE_OR_EMERGING |
| P-141 | Continuous batching | PREVIOUS_BATCH | Interleave tokens from varying-length requests | vLLM; TGI / vLLM; TGI | Fairness and tail latency | Inference scheduler | MATURE_OR_EMERGING |
| P-256 | transparency inclusion proof | PREVIOUS_BATCH | Prove an attestation is logged | Rekor; Merkle logs / Rekor; Merkle logs | Log availability and key trust | Release evidence | MATURE_OR_EMERGING |
| P-287 | Unknown-effect state | RU-001 | Represent timeout where external action may have happened | Payments; durable execution / Payments; durable execution | Forces manual/query paths instead of automatic retry | Effect gateway state machine | MATURE_OR_EMERGING |
| P-288 | Crash-stable idempotency key | RU-001 | Reuse the same downstream deduplication key after restart | Avatar Engine; payment APIs / Avatar Engine; payment APIs | Only end-to-end if downstream honors key | Tool adapter contract | MATURE_OR_EMERGING |
| P-289 | Generation fencing token | RU-001 | Reject writes from superseded workers | Distributed leases; Restate / Distributed leases; Restate | Must be checked by final authority | All effect commits | MATURE_OR_EMERGING |
| P-290 | Continue-as-new | RU-001 | Bound durable workflow history | Temporal / Temporal | Splits operational run IDs | Long agent sessions | MATURE_OR_EMERGING |
| P-291 | Tombstone + incarnation ID | RU-001 | Prevent deleted durable entity resurrection | Actor systems; storage systems / Actor systems; storage systems | Identity management overhead | Agent/session lifecycle | MATURE_OR_EMERGING |
| P-292 | Observable trace equivalence | RU-001 | Compare fault-free and recovered effect traces | Distributed testing / Distributed testing | Allows timing variance but requires explicit invariants | Recovery correctness benchmark | MATURE_OR_EMERGING |
| P-293 | Freshness manifest | RU-002 | Expose index commit and source revision | Code intelligence systems / Code intelligence systems | More metadata in every context response | Context data plane | MATURE_OR_EMERGING |
| P-294 | Definition/reference fact schema | RU-002 | Represent language-semantic code relationships | Glean; SCIP; Kythe / Glean; SCIP; Kythe | Indexer quality varies by language | Semantic navigation and retrieval | MATURE_OR_EMERGING |
| P-295 | Token-budgeted repository map | RU-002 | Select high-value symbols/files under context limits | Aider RepoMap / Aider RepoMap | Graph centrality can miss task-local context | Coding context packer | MATURE_OR_EMERGING |
| P-296 | Action content key | RU-002 | Cache hermetic build/research action by declared inputs | Bazel; Nix / Bazel; Nix | Undeclared inputs break correctness | Incremental research execution | MATURE_OR_EMERGING |
| P-297 | Equality cutoff | RU-002 | Stop invalidation propagation when output unchanged | Salsa; DICE / Salsa; DICE | Equality definition can be expensive/wrong | Reactive analyses | MATURE_OR_EMERGING |
| P-298 | Topological stale propagation | RU-002 | Rerun downstream notebook cells in dependency order | marimo; Pluto / marimo; Pluto | Dynamic dependencies can evade analysis | Notebook runtime | MATURE_OR_EMERGING |
| P-299 | Writable-root patch guard | RU-002 | Prevent patch writes outside authorized workspace | Codex / Codex | Hard links and generated paths complicate checks | Code mutation safety | MATURE_OR_EMERGING |
| P-300 | Patch precondition digest | RU-002 | Reject edits against changed source | Optimistic concurrency / Optimistic concurrency | Requires conflict UX | Transactional editing | MATURE_OR_EMERGING |
| P-301 | Digest-bound subject | RU-003 | Bind an assertion to immutable artifact bytes | in-toto Statement / in-toto Statement | Digest does not carry semantics | Evidence attestations | MATURE_OR_EMERGING |
| P-302 | Provenance qualified relation | RU-003 | Capture agent/activity/entity roles and derivations | W3C PROV / W3C PROV | Verbose graph | Scientific evidence graph | MATURE_OR_EMERGING |
| P-303 | Research object crate | RU-003 | Package data, code, workflows, people and actions | RO-Crate / RO-Crate | Profile governance required | Publication/export | MATURE_OR_EMERGING |
| P-304 | Lineage run facet | RU-003 | Extend run/job/dataset events without central schema lock | OpenLineage / OpenLineage | Facet compatibility | Operational provenance | MATURE_OR_EMERGING |
| P-305 | Source assertion tuple | RU-003 | Preserve value, source, retrieval time and transform | Metadata fusion / Metadata fusion | Query complexity | Literature metadata | MATURE_OR_EMERGING |
| P-306 | Evidence completeness score | RU-003 | Measure missing required artifacts/receipts | FAR-Lab synthesis / FAR-Lab synthesis | Can be gamed if poorly defined | Claim promotion gate | MATURE_OR_EMERGING |
| P-307 | Method-validity status | RU-003 | Separate software success from scientific validity | Scientific method / Scientific method | Domain-specific | Run/claim state model | MATURE_OR_EMERGING |
| P-308 | Immutable index segment | RU-004 | Make concurrent indexing/search and rollback tractable | Lucene; Tantivy / Lucene; Tantivy | Background merge amplification | Search index | MATURE_OR_EMERGING |
| P-309 | Block-max WAND | RU-004 | Skip documents unable to enter top-k | Lucene / Lucene | Requires safe score upper bounds | Sparse retrieval | MATURE_OR_EMERGING |
| P-310 | Reciprocal-rank fusion | RU-004 | Combine rankings without calibrated scores | Information retrieval / Information retrieval | Can overvalue weak lists | Hybrid retrieval | MATURE_OR_EMERGING |
| P-311 | Late interaction MaxSim | RU-004 | Retain token-level matching with compact document vectors | ColBERT / ColBERT | Larger index than single-vector | Scholarly/code retrieval | MATURE_OR_EMERGING |
| P-312 | Learned sparse expansion | RU-004 | Preserve inverted-index efficiency with semantic expansion | SPLADE / SPLADE | Model/domain drift | Evidence retrieval | MATURE_OR_EMERGING |
| P-313 | Citation-context edge | RU-004 | Represent why a work cites another | Scholarly graphs / Scholarly graphs | Full-text rights and extraction noise | Evidence support graph | MATURE_OR_EMERGING |
| P-314 | Active-learning stopping rule | RU-004 | Stop screening with auditable criterion | ASReview/statistics / ASReview/statistics | Incorrect assumptions bias recall | Systematic review | MATURE_OR_EMERGING |
| P-315 | Retrieval provenance trace | RU-004 | Record query, index version, candidates, ranks and reranker | FAR-Lab synthesis / FAR-Lab synthesis | Storage and privacy | Citation grounding audit | MATURE_OR_EMERGING |
| P-316 | Paged KV cache | RU-005 | Reduce fragmentation and share GPU memory | vLLM / vLLM | Page management overhead | LLM serving | MATURE_OR_EMERGING |
| P-317 | Prefix cache key | RU-005 | Reuse shared prompt prefixes safely | SGLang; vLLM / SGLang; vLLM | Tenant/model/policy invalidation | Research session acceleration | MATURE_OR_EMERGING |
| P-318 | Speculative decoding | RU-005 | Use draft model to reduce target-model serial steps | Inference research / Inference research | Acceptance rate and extra compute | Latency optimization | MATURE_OR_EMERGING |
| P-319 | Disaggregated KV transfer | RU-005 | Move KV between prefill/decode workers | Mooncake; llm-d / Mooncake; llm-d | Network and cache consistency | Cluster serving | MATURE_OR_EMERGING |
| P-320 | Memory-aware admission slot | RU-005 | Refuse work before OOM | Serving systems / Serving systems | Underutilization if conservative | Safe inference | MATURE_OR_EMERGING |
| P-321 | Capability descriptor | RU-005 | Describe model modalities, context, tools, price and policy | Model gateways / Model gateways | Provider claims require measurement | Routing control plane | MATURE_OR_EMERGING |
| P-322 | Quality–latency–cost Pareto record | RU-005 | Choose model by measured frontier, not single score | FAR-Lab synthesis / FAR-Lab synthesis | Requires representative workload | Model selection registry | MATURE_OR_EMERGING |
| P-323 | Hierarchical resource allocation | RU-006 | Nest schedulers inside granted allocations | Flux; HPC / Flux; HPC | Policy complexity | Federated compute | MATURE_OR_EMERGING |
| P-324 | Logical data region | RU-006 | Express task data privileges and dependencies | Legion / Legion | Programming-model complexity | Many-task scientific runtime | MATURE_OR_EMERGING |
| P-325 | Migratable overdecomposed object | RU-006 | Move fine-grained work for load balance/resilience | Charm++ / Charm++ | Runtime metadata overhead | Elastic HPC | MATURE_OR_EMERGING |
| P-326 | MPI communicator contract | RU-006 | Define collective communication membership | MPI / MPI | Failure semantics are difficult | Distributed simulation | MATURE_OR_EMERGING |
| P-327 | Preconditioner as first-class configuration | RU-006 | Make convergence method explicit | PETSc; Trilinos / PETSc; Trilinos | Large tuning space | Solver evidence | MATURE_OR_EMERGING |
| P-328 | Residual norm termination record | RU-006 | Audit why solver stopped | Numerical solvers / Numerical solvers | Norm choice affects interpretation | Simulation run record | MATURE_OR_EMERGING |
| P-329 | Execution/memory space policy | RU-006 | Separate algorithm from hardware backend | Kokkos / Kokkos | Backend-specific tuning remains | Portable kernels | MATURE_OR_EMERGING |
| P-330 | Compensated summation | RU-006 | Reduce floating-point accumulation error | Numerical analysis / Numerical analysis | Extra operations | Reproducible reductions | MATURE_OR_EMERGING |
| P-331 | Application checkpoint contract | RU-006 | Serialize model state independent of process image | HPC practice / HPC practice | Application effort | Preemption recovery | MATURE_OR_EMERGING |
| P-332 | Solver capability negotiation | RU-006 | Select algorithm supported by problem/backend | Optimization interfaces / Optimization interfaces | Abstraction leakage | Solver registry | MATURE_OR_EMERGING |
| P-333 | InferenceData schema | RU-007 | Standardize posterior draws, diagnostics and observed data | ArviZ / ArviZ | Adapters needed | Bayesian evidence artifacts | MATURE_OR_EMERGING |
| P-334 | Rank-normalized R-hat | RU-007 | Detect chain non-convergence robustly | Bayesian diagnostics / Bayesian diagnostics | Not sufficient alone | Validity gate | MATURE_OR_EMERGING |
| P-335 | Effective sample size | RU-007 | Quantify correlated posterior information | MCMC diagnostics / MCMC diagnostics | Estimator uncertainty | Validity gate | MATURE_OR_EMERGING |
| P-336 | Causal estimand object | RU-007 | Separate target effect from estimator | DoWhy/causal inference / DoWhy/causal inference | Requires explicit assumptions | Causal study object | MATURE_OR_EMERGING |
| P-337 | Refutation test | RU-007 | Challenge causal estimate with placebo/subset/sensitivity | DoWhy / DoWhy | Cannot eliminate all confounding | Claim gate | MATURE_OR_EMERGING |
| P-338 | Pending-trial fantasization | RU-007 | Plan Bayesian optimization with parallel experiments | BoTorch / BoTorch | Model approximation | Experiment scheduler | MATURE_OR_EMERGING |
| P-339 | Safe acquisition constraint | RU-007 | Avoid experiments outside safety envelope | Safe Bayesian optimization / Safe Bayesian optimization | Can be over-conservative | Lab experiment planner | MATURE_OR_EMERGING |
| P-340 | RunEngine message | RU-007 | Represent device-independent experimental actions | Bluesky / Bluesky | Message vocabulary governance | Instrument plan IR | MATURE_OR_EMERGING |
| P-341 | Calibration validity interval | RU-007 | Reject measurements outside calibration window | Metrology / Metrology | Operational burden | Instrument adapter | MATURE_OR_EMERGING |
| P-342 | Covariance-aware uncertainty propagation | RU-007 | Avoid treating correlated errors as independent | Metrology/statistics / Metrology/statistics | Covariance data often absent | Measurement object | MATURE_OR_EMERGING |
| P-343 | Capability handle | RU-008 | Grant narrow authority without ambient access | seL4; Wasm components / seL4; Wasm components | Revocation and delegation design | Plugin/tool access | MATURE_OR_EMERGING |
| P-344 | Attested workload identity | RU-008 | Bind runtime measurement to identity | SPIFFE/TEE / SPIFFE/TEE | Hardware/root trust | Confidential workers | MATURE_OR_EMERGING |
| P-345 | Relationship consistency token | RU-008 | Read authorization graph at explicit consistency point | SpiceDB / SpiceDB | Latency vs freshness | Collaboration authorization | MATURE_OR_EMERGING |
| P-346 | Policy decision receipt | RU-008 | Record policy version, inputs and decision | OPA/Cedar / OPA/Cedar | Sensitive input redaction | Effect evidence | MATURE_OR_EMERGING |
| P-347 | Bounded model-checking harness | RU-008 | Explore implementation states within finite bounds | Kani/CBMC / Kani/CBMC | Bound incompleteness | Critical Rust/C modules | MATURE_OR_EMERGING |
| P-348 | State-machine invariant | RU-008 | Declare safety/liveness property over transitions | TLA+ / TLA+ | Model abstraction risk | Effect/recovery protocols | MATURE_OR_EMERGING |
| P-349 | Property-based shrinker | RU-008 | Minimize failing generated case | Hypothesis / Hypothesis | Generator quality | Adapter and schema testing | MATURE_OR_EMERGING |
| P-350 | Deterministic fault schedule | RU-008 | Replay concurrency/failure scenario exactly | FoundationDB simulation / FoundationDB simulation | Requires controlled nondeterminism | Runtime verification | MATURE_OR_EMERGING |
| P-351 | Checkpoint type allowlist | RU-008 | Block arbitrary object construction | Secure serialization / Secure serialization | Migration friction | Persistent state loader | MATURE_OR_EMERGING |
| P-352 | Resource abuse budget | RU-008 | Limit CPU/memory/process/network/output independently | Sandbox engineering / Sandbox engineering | Can terminate valid work | Execution policy | MATURE_OR_EMERGING |
| P-353 | CRDT change hash | RU-009 | Identify causally ordered document changes | Automerge / Automerge | History compaction | Collaborative objects | MATURE_OR_EMERGING |
| P-354 | Awareness/presence channel | RU-009 | Share ephemeral cursor/user state | Yjs / Yjs | No durability guarantee | Collaborative UI | MATURE_OR_EMERGING |
| P-355 | Escrow token | RU-009 | Preserve numeric invariant under offline concurrent writes | Distributed databases / Distributed databases | Requires partitioned rights | Inventory/quota collaboration | MATURE_OR_EMERGING |
| P-356 | Local shape subscription | RU-009 | Sync only authorized relational subset | ElectricSQL / ElectricSQL | Shape invalidation and ACL changes | Offline metadata UI | MATURE_OR_EMERGING |
| P-357 | Operation-log undo | RU-009 | Undo user-visible version-control operations | Jujutsu / Jujutsu | History semantics unfamiliar | Workspace timeline | MATURE_OR_EMERGING |
| P-358 | Stable change identity | RU-009 | Track a logical change across rebases | Jujutsu / Jujutsu | Interoperability with Git | Review/agent changes | MATURE_OR_EMERGING |
| P-359 | WIT interface | RU-009 | Define typed cross-language component boundary | Wasm Component Model / Wasm Component Model | Ecosystem immaturity | Plugin ABI | MATURE_OR_EMERGING |
| P-360 | Out-of-process plugin handshake | RU-009 | Negotiate version and lifecycle across process boundary | go-plugin / go-plugin | RPC overhead | Legacy/native plugins | MATURE_OR_EMERGING |
| P-361 | Desired-state generation | RU-010 | Reject stale reconciliation observations | Kubernetes controllers / Kubernetes controllers | Generation bookkeeping | Infrastructure loop | MATURE_OR_EMERGING |
| P-362 | Work queue rate limiter | RU-010 | Back off repeated reconciliation failures | Kubernetes / Kubernetes | Slower recovery | Controllers | MATURE_OR_EMERGING |
| P-363 | Partitioned append log | RU-010 | Scale ordered durable events | Kafka/Pulsar / Kafka/Pulsar | Cross-partition ordering absent | Event backbone | MATURE_OR_EMERGING |
| P-364 | Consumer acknowledgement cursor | RU-010 | Track replay progress | JetStream/Kafka/Pulsar / JetStream/Kafka/Pulsar | At-least-once duplicates | Integration consumers | MATURE_OR_EMERGING |
| P-365 | Trace context propagation | RU-010 | Correlate work across services | OpenTelemetry / OpenTelemetry | Cardinality and sampling | Observability | MATURE_OR_EMERGING |
| P-366 | Tail-based sampling | RU-010 | Retain traces based on completed outcome | OTel processors / OTel processors | Decision delay and memory | Failure visibility | MATURE_OR_EMERGING |
| P-367 | Scientific evidence SLO | RU-010 | Alert on incomplete evidence, not only uptime | FAR-Lab synthesis / FAR-Lab synthesis | New operational semantics | Research operations | MATURE_OR_EMERGING |
| P-368 | Control-plane circuit breaker | RU-010 | Stop recovery/scale feedback loops | Incident engineering / Incident engineering | May delay healthy work | Recovery safety | MATURE_OR_EMERGING |
| P-369 | Document abstract syntax tree | RU-011 | Transform publications without string hacks | Pandoc / Pandoc | Extension compatibility | Publication IR | MATURE_OR_EMERGING |
| P-370 | Executable directive | RU-011 | Embed computation/data query in document | MyST/Quarto / MyST/Quarto | Security and reproducibility | Living reports | MATURE_OR_EMERGING |
| P-371 | Citation key resolver | RU-011 | Resolve DOI/identifier to versioned metadata | Zotero/Manubot / Zotero/Manubot | Source disagreement | Reference pipeline | MATURE_OR_EMERGING |
| P-372 | Declarative chart spec | RU-011 | Store visual encoding as data | Vega-Lite / Vega-Lite | Limited bespoke interactions | Figure artifact | MATURE_OR_EMERGING |
| P-373 | Multiresolution aggregate | RU-011 | Visualize large data without transferring all points | Datashader / Datashader | Aggregation can hide outliers | Large-data views | MATURE_OR_EMERGING |
| P-374 | Linked selection provenance | RU-011 | Record filters/selections behind a displayed claim | Interactive visualization / Interactive visualization | High event volume | Exploration audit | MATURE_OR_EMERGING |
| P-375 | Review anchor identity | RU-011 | Keep comments attached across document edits | Collaborative editors / Collaborative editors | Anchor drift | Scientific review | MATURE_OR_EMERGING |
| P-376 | Publication build manifest | RU-011 | Pin sources, dependencies, locale and toolchain | Hermetic build systems / Hermetic build systems | Maintenance overhead | Reproducible papers | MATURE_OR_EMERGING |
| P-377 | Versioned domain schema | RU-012 | Validate scientific objects with evolving semantics | BIDS; NWB; NOMAD / BIDS; NWB; NOMAD | Migration governance | Domain plugin contract | MATURE_OR_EMERGING |
| P-378 | Unit-aware labeled dimension | RU-012 | Carry dimensions, coordinates and units through arrays | xarray; Astropy / xarray; Astropy | Metadata-loss escape hatches | Scientific data core | MATURE_OR_EMERGING |
| P-379 | Chunked cloud array | RU-012 | Access very large arrays lazily | Zarr; HDF5/NetCDF patterns / Zarr; HDF5/NetCDF patterns | Chunk layout matters | Object-store data | MATURE_OR_EMERGING |
| P-380 | Workflow tool wrapper | RU-012 | Describe command, inputs, outputs and environment | Galaxy; CWL; Snakemake / Galaxy; CWL; Snakemake | Wrapper maintenance | Domain tool registry | MATURE_OR_EMERGING |
| P-381 | Domain validator receipt | RU-012 | Prove data passed exact schema/tool version | DANDI; BIDS validators / DANDI; BIDS validators | Validation is not scientific correctness | Dataset evidence | MATURE_OR_EMERGING |
| P-382 | Remote calculation node | RU-012 | Represent scheduler job as provenance entity | AiiDA / AiiDA | Backend adapters | HPC integration | MATURE_OR_EMERGING |
| P-383 | Physical coordinate frame | RU-012 | Make transforms and frames explicit | ROS2; astronomy/imaging / ROS2; astronomy/imaging | Frame mistakes remain common | Domain schema | MATURE_OR_EMERGING |
| P-384 | Instrument command adapter | RU-012 | Translate semantic action to vendor protocol | Ophyd; PyLabRobot; Opentrons / Ophyd; PyLabRobot; Opentrons | Device-specific safety | Lab plugin | MATURE_OR_EMERGING |
| P-385 | Capability negotiation | RU-013 | Agree protocol/version/features before work | MCP; ACP; A2A / MCP; ACP; A2A | Extension fragmentation | Protocol gateway | MATURE_OR_EMERGING |
| P-386 | Session resume token | RU-013 | Reconnect client to durable logical session | ACP / ACP | Authorization and replay bounds | Agent clients | MATURE_OR_EMERGING |
| P-387 | Artifact part descriptor | RU-013 | Carry typed task outputs between agents | A2A / A2A | Schema interoperability | Agent federation | MATURE_OR_EMERGING |
| P-388 | CloudEvent envelope | RU-013 | Standardize event identity/source/type/time/data | CloudEvents / CloudEvents | Payload semantics external | Event mesh | MATURE_OR_EMERGING |
| P-389 | Schema compatibility fixture | RU-013 | Test old/new encoders and unknown fields | Protobuf/OpenAPI / Protobuf/OpenAPI | Fixture maintenance | Protocol lifecycle | MATURE_OR_EMERGING |
| P-390 | Arrow Flight ticket | RU-013 | Address streamed columnar dataset or query | Arrow Flight / Arrow Flight | Access control needed | Data plane | MATURE_OR_EMERGING |
| P-391 | Usage policy expression | RU-013 | Represent permitted/forbidden duties over data | ODRL/Dataspace / ODRL/Dataspace | Post-transfer enforcement limits | Federated access | MATURE_OR_EMERGING |
| P-392 | Attestation referrer | RU-013 | Attach SBOM/provenance/signature to artifact | OCI/ORAS / OCI/ORAS | Registry support | Release graph | MATURE_OR_EMERGING |
| P-393 | Quantity kind URI | RU-014 | Distinguish dimensionally similar scientific meanings | QUDT / QUDT | Ontology governance | Measurement semantics | MATURE_OR_EMERGING |
| P-394 | Canonical unit code | RU-014 | Exchange units without display-string ambiguity | UCUM / UCUM | Domain exceptions | Data interchange | MATURE_OR_EMERGING |
| P-395 | Energy attribution interval | RU-014 | Attribute joules to workload over time | Kepler / Kepler | Model estimation error | Compute evidence | MATURE_OR_EMERGING |
| P-396 | Carbon forecast window | RU-014 | Schedule flexible work in lower-carbon period | Carbon Aware SDK / Carbon Aware SDK | Forecast uncertainty/deadline tradeoff | Resource planner | MATURE_OR_EMERGING |
| P-397 | WebGPU compute pipeline | RU-014 | Execute portable GPU kernels in browser | WebGPU / WebGPU | Browser limits and shader portability | Local analysis | MATURE_OR_EMERGING |
| P-398 | Component capability import | RU-014 | Declare exactly which host functions plugin receives | Wasm Component Model / Wasm Component Model | Tooling maturity | Plugin security | MATURE_OR_EMERGING |
| P-399 | QIR module | RU-014 | Represent hybrid quantum program in compiler IR | QIR / QIR | Backend variability | Quantum workflow artifact | MATURE_OR_EMERGING |
| P-400 | Calibration-bound quantum circuit | RU-014 | Bind circuit results to backend calibration snapshot | Quantum operations / Quantum operations | Calibration changes rapidly | Quantum evidence | MATURE_OR_EMERGING |

## 12. Performance Intelligence Registry

Performance intelligence records techniques and cliffs even when the originating project is not recommended. Vendor benchmarks remain vendor evidence unless independently reproduced.

| ID | TOPIC | RESEARCH UNIT | METRIC | TECHNIQUE | EVIDENCE | CAVEAT / FAILURE CLIFF | FAR-LAB IMPLICATION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PIR-035 | Incremental equality cutoff | PREVIOUS_BATCH | avoided downstream recomputations | Stop propagation if value unchanged | DICE/Salsa architecture | Equality costs | Use for research action graph |
| PIR-080 | Durable history rollover | RU-001 | history length / replay latency | Continue-as-new and snapshots | Architecture evidence | Snapshot compatibility | Bound control histories |
| PIR-081 | Semantic checkpoint suppression | RU-001 | checkpoint bytes and pause latency | Checkpoint only on meaningful state | Paper-reported; not independently reproduced | Workload dependent | Benchmark workspace state change detector |
| PIR-082 | Recovery admission | RU-001 | recovery throughput and control-plane load | Dedicated quota/backpressure/jitter | Synthetic model and incident evidence | Not production benchmark | Separate recovery SLO |
| PIR-083 | Incremental context index | RU-002 | index update work | Ownership/invalidation proportional to changed units | Glean architecture reports O(changes) goal | Cross-file dependency closure | Use layered incremental index |
| PIR-084 | Repository map budget | RU-002 | context tokens / map build latency | Cache tree-sitter tags and rank symbol graph | Source-inspected Aider pattern | Rank quality varies | Measure task success vs token budget |
| PIR-085 | Evidence graph compaction | RU-003 | metadata storage and query latency | Content-addressed dedup and normalized assertions | Architecture synthesis | Query joins | Separate immutable blobs from indexes |
| PIR-086 | WAND dynamic pruning | RU-004 | postings scored per top-k query | Safe max-score bounds and competitive threshold | Lucene source inspected | Depends on query/score distribution | Adopt lexical engine rather than rebuild |
| PIR-087 | Tiered retrieval | RU-004 | quality / p95 latency / cost | Cheap recall then bounded reranking | IR practice | Evaluation needed on FAR-Lab corpus | Store Pareto frontier |
| PIR-088 | Immutable search splits | RU-004 | indexing isolation and object-store cost | Build immutable splits, cache hot segments | Quickwit architecture | Merge and cold-start cost | Candidate for large evidence corpus |
| PIR-089 | Paged KV memory | RU-005 | KV utilization / OOM rate | Page KV blocks across requests | vLLM architecture | Metadata overhead | Require measured memory admission |
| PIR-090 | Continuous batching | RU-005 | tokens/s and p95 latency | Token-level interleaving | Serving systems | Fairness tradeoff | Class-based scheduler |
| PIR-091 | Prefix caching | RU-005 | time-to-first-token and compute reuse | Cache content-addressed stable prefixes | vLLM/SGLang | Security/invalidation | Tenant-bound cache |
| PIR-092 | Speculative decoding | RU-005 | accepted tokens per target step | Draft/verify multiple tokens | Research/production systems | Quality model pairing | Optional accelerator |
| PIR-093 | Disaggregated serving | RU-005 | GPU utilization and KV network bandwidth | Separate prefill/decode pools | Emerging systems | Network bottleneck | Use only after workload benchmark |
| PIR-094 | HPC hierarchical scheduling | RU-006 | allocation utilization and queue latency | Nested Flux inside batch allocation | Architecture evidence | Operational complexity | Federated scientific compute |
| PIR-095 | Task overdecomposition | RU-006 | load balance and communication overlap | Many migratable tasks/objects | Charm++/Legion/StarPU | Runtime overhead | Irregular simulations |
| PIR-096 | Preconditioner selection | RU-006 | iterations and time-to-solution | Problem-aware preconditioning | Solver practice | No universal winner | Benchmark by problem class |
| PIR-097 | Partial assembly | RU-006 | memory traffic and operator throughput | Matrix-free/high-order operators | MFEM/PETSc ecosystem | More complex kernels | PDE workloads |
| PIR-098 | Portable execution policy | RU-006 | backend portability / tuning effort | Kokkos/RAJA policies | Architecture evidence | Needs backend tuning | Standard accelerator boundary |
| PIR-099 | MCMC vectorization | RU-007 | effective samples per second | JAX/vectorized chains | NumPyro/PyMC ecosystems | ESS, not raw samples, is metric | Performance plus diagnostics |
| PIR-100 | Adaptive experiment batching | RU-007 | scientific utility per cost/time | Batch acquisition with pending trials | BoTorch/Ax | Model error and adaptivity | Resource-aware experiment planner |
| PIR-101 | Instrument plan streaming | RU-007 | time to first data / backpressure | Message-driven RunEngine and event documents | Bluesky architecture | Device latency | Stream evidence while run active |
| PIR-102 | Policy partial evaluation | RU-008 | decision latency | Compile policy with static inputs | OPA technique | Policy invalidation | Edge/sandbox decision cache |
| PIR-103 | Wasm plugin startup | RU-008 | cold start / memory isolation | Ahead-of-time component runtime | Wasmtime ecosystem | Host calls and sandbox config | Plugin execution class |
| PIR-104 | Deterministic simulation | RU-008 | bugs found per compute / reproducibility | Control all nondeterministic choices | FoundationDB pattern | High engineering cost | Use on core protocols |
| PIR-105 | CRDT delta sync | RU-009 | bytes per collaboration update | Exchange causal changes/deltas | Automerge/Yjs | History growth | Compact and snapshot |
| PIR-106 | Local shape sync | RU-009 | client data volume / freshness | Stream query-shaped subsets | ElectricSQL | Server index and ACL cost | Large collaborative metadata |
| PIR-107 | Event log batching | RU-010 | throughput / durability latency | Batch append and sequential I/O | Kafka/Pulsar/Redpanda | Tail latency | Not for low-volume effects by default |
| PIR-108 | OTel collector pipeline | RU-010 | telemetry CPU/memory / drop rate | Batch, filter, sample and route | Collector architecture | Sampling loses evidence | Separate telemetry from durable evidence |
| PIR-109 | Multiresolution rendering | RU-011 | points processed / frame latency | Aggregate/rasterize before display | Datashader/ParaView | Approximation must be disclosed | Large scientific views |
| PIR-110 | Incremental publication build | RU-011 | rebuild time | Content-keyed document nodes and cached computation | Build/document systems | Cache invalidation | Publication action graph |
| PIR-111 | Chunked labeled arrays | RU-012 | I/O amplification / parallelism | Choose chunks by access pattern | xarray/Zarr/Dask | Bad chunks dominate cost | Record chunk layout and workload |
| PIR-112 | Columnar Flight transport | RU-013 | serialization overhead / throughput | Zero-copy-ish columnar batches and streaming | Arrow Flight | Network and auth | Scientific data plane |
| PIR-113 | Browser WebGPU analysis | RU-014 | local latency / transfer avoided | Compute near browser-resident data | WebGPU frontier | Device/browser variance | Privacy/offline mode |
| PIR-114 | Carbon-aware deferral | RU-014 | gCO2e per deadline-compliant run | Shift flexible work to low-intensity windows | Synthetic model + Carbon Aware architecture | Forecast uncertainty | Optional scheduling objective |

### Cross-cutting benchmark discipline

| DIMENSION | REQUIRED PRACTICE |
| --- | --- |
| Correctness before speed | Verify scientific/output equivalence, effect safety and cache freshness before measuring latency/throughput. |
| Cold and warm paths | Report startup, first query/run, warmed cache and recovery performance separately. |
| Resource accounting | Record CPU/GPU time, peak/resident memory, I/O/network bytes, storage amplification, energy/cost and operator complexity. |
| Workload identity | Version dataset, model, prompt/toolchain, hardware, topology, concurrency, policy and environment. |
| Failure performance | Measure restart/replay storms, cache loss, partial metadata, network partition and degraded-mode behavior. |
| Distribution, not one number | Retain latency distributions, tail behavior, variance and quality metrics; avoid isolated best-case throughput. |
| Independent baselines | Compare current FAR path, strongest mature alternative and clean/from-scratch result. |

## 13. Engineering Excellence Registry

| ID | PRACTICE | HOW IT WORKS | REFERENCE DISCIPLINES / SYSTEMS | FAR-LAB VALUE |
| --- | --- | --- | --- | --- |
| EE-001 | Single authoritative owner per invariant | Assign one subsystem ownership for control, effects, evidence, validity, resources and collaboration; use projections/adapters elsewhere. | Temporal/AiiDA/database architecture; corpus failure archaeology | Prevents permanent dual-write ambiguity and architecture collage. |
| EE-002 | Append-only audit with explicit corrections | Retain original assertions/events and model correction/supersession rather than overwriting history. | Event sourcing, bitemporal DBs, scholarly correction systems | Required for scientific and authorization history. |
| EE-003 | Deterministic logical replay; isolated nondeterminism | Keep network, clock, randomness and external effects outside replayed control logic. | Temporal, build systems, deterministic simulation | Makes recovery/test behavior inspectable and versionable. |
| EE-004 | Stable identities and content digests | Bind run, plan, action, effect, artifact, schema, environment and policy versions to stable IDs/digests. | CAS, REAPI, in-toto, research objects | Foundation for deduplication, provenance and cache correctness. |
| EE-005 | Schema evolution as an executable migration discipline | Version schemas/protocols and test old histories, packages and long-lived workflows across upgrades. | Databases, workflow engines, protocol ecosystems | Avoids silent historical corruption. |
| EE-006 | Hermetic action descriptions | Declare inputs, tools, environment and outputs; record undeclared-dependency violations. | Bazel/Nix/REAPI | A fast cached wrong result is a scientific failure. |
| EE-007 | Typed plans and commands | Model proposed operations as validated data/IR before execution. | Compilers, robotics commands, policy engines | Separates model suggestion from authority. |
| EE-008 | Capability-scoped extension boundaries | Expose explicit host functions/resources rather than loading arbitrary in-process plugins. | WASI/Component Model/Extism | Reduces ambient authority and ABI coupling. |
| EE-009 | Final authorization at the effect boundary | Recheck policy, identity, cancellation and generation immediately before the external commit. | Zero-trust policy and effect-ledger synthesis | Closes stale-approval/revocation races. |
| EE-010 | End-to-end effect protocol | Use endpoint idempotency or transaction inquiry, durable receipts, typed unknown state and compensation/manual resolution. | Payments, databases, durable runtimes | Local retry semantics alone do not provide exactly-once. |
| EE-011 | Independent recovery admission control | Budget recovery separately from ordinary worker/task concurrency. | Distributed systems incident patterns | Prevents retry/reconnect/checkpoint storms. |
| EE-012 | From-scratch equivalence tests | Compare incremental/cached output against clean recomputation under randomized mutations. | Salsa/DICE/build systems | Detects missing dependencies and stale projections. |
| EE-013 | Explicit invalidation reasons | Retain which dependency/policy/schema/evidence change invalidated a derived result. | Incremental computation and provenance | Supports scientific explanation and efficient recompute. |
| EE-014 | Independent validity gate | Do not equate successful execution, signatures, provenance or benchmark scores with scientific validity. | Metrology/statistics/review practice | Separates engineering correctness from method correctness. |
| EE-015 | Diagnostics are immutable artifacts | Persist convergence, calibration, residual, uncertainty, sensitivity and bias diagnostics with the result. | Stan/ArviZ/numerical solvers | Makes acceptance/rejection auditable. |
| EE-016 | Units, frames and calibration are typed | Carry quantity kind, unit, reference frame, calibration version and uncertainty at boundaries. | QUDT/UCUM/robotics/metrology | Prevents silent category/unit/frame errors. |
| EE-017 | Telemetry, audit and provenance are separate | Use sampled operational telemetry for debugging; durable audit for authority; semantic provenance for science. | OpenTelemetry and evidence systems | Prevents dropped traces from erasing accountability. |
| EE-018 | Fault injection around real commit boundaries | Kill/restart/partition before and after durable/external commits; include stale owners and cancellations. | FoundationDB simulation, chaos testing | Happy-path tests cannot establish recovery semantics. |
| EE-019 | Property and differential testing | Check invariants across implementations, serializations and execution orders. | Databases, compilers, numerical software | Finds broad failure classes rather than examples. |
| EE-020 | Deterministic simulation for distributed protocols | Run many reproducible interleavings with captured seeds and minimized counterexamples. | FoundationDB and formal-method practice | High leverage before expensive production chaos. |
| EE-021 | Continuous advisory/patch gates | Track runtime, sandbox, parser, dependency and protocol advisories; block unsafe versions. | Security-maintained runtimes | Isolation is a maintained property, not a one-time checkbox. |
| EE-022 | Explicit plugin ABI and compatibility contract | Version WIT/protocol/schema surfaces and test host/guest compatibility matrices. | Component Model, IDE extension hosts | Avoids ecosystem fragility and accidental lock-in. |
| EE-023 | Data ownership and deletion policy | Define canonical copy, projections, retention, garbage collection and archival closure for every state class. | Polyglot storage and preservation | Avoids stale truth and undeletable evidence sprawl. |
| EE-024 | Reproducible releases and attestations | Build releases from pinned closures; sign/attest artifacts and retain SBOM/source mapping. | Nix/SLSA/Sigstore | Makes the execution substrate itself evidence-addressable. |
| EE-025 | Executable documentation and examples | Continuously test setup, migration, failure and method examples against current releases. | Mature OSS practice | Documentation should follow verified reality. |
| EE-026 | Recovery- and failure-centered UX | Show ambiguous effects, stale state, invalidated results, blocked permissions and recovery choices without hiding them. | HCI/reliability transfer | A scientifically honest product must expose uncertainty and recovery state. |

## 14. Scientific Systems & Method Intelligence

**Preliminary architecture stance:** Software execution is only one layer of scientific correctness. FAR-Lab should make method assumptions, measurements, uncertainty, diagnostics, validity decisions and publication gates first-class records.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Scientific workflow/provenance | AiiDA; Galaxy; Nextflow; Snakemake; CWL/WDL | Extract process/data semantics and executor adapters; do not force one domain workflow language. | Workflow success can coexist with invalid method, stale remote data or irreproducible environment. |
| Bayesian/statistical inference | Stan; PyMC; ArviZ; SBI ecosystems | Expose typed method plugins and persist convergence/posterior predictive/sensitivity diagnostics. | Peeking, non-identifiability, divergent chains, prior sensitivity and model misspecification. |
| Causal inference | DoWhy; EconML; causal discovery tools | Represent estimand, graph, assumptions, identification, estimator, refutations and transport conditions. | Unverifiable assumptions, interference, selection bias and estimator misuse. |
| Experimental design/optimization | BoTorch; Ax; Optuna; DOE libraries | Use safe/constrained adaptive design with explicit stopping and uncertainty. | Unsafe exploration, optimizer pathology and invalid post-selection inference. |
| Metrology | QUDT; UCUM; calibration/uncertainty standards | Measurement object includes value, quantity kind, unit, frame, calibration, conditions and uncertainty budget. | Unit/frame mismatch and confidence scores that omit measurement uncertainty. |
| Systematic review | ASReview; EPPI-class systems; scholarly graphs | Use provenance-aware active screening with conservative recall audits and human adjudication. | Biased stopping, duplicated/withdrawn literature and source disagreement. |
| Publishing/reproducibility | Quarto; RO-Crate; DataLad; Nix | Publish closed artifacts, environment identity, claims, diagnostics and validity decision. | A rendered paper/DOI/signature does not prove reproduction. |

**Future proof obligations:** Every method adapter needs a domain validation profile; every accepted result retains diagnostics and uncertainty; every publication gate can reject a technically successful run.

## 15. Agent / Coding / Autonomous Runtime Intelligence

**Preliminary architecture stance:** Agents should propose plans, select context and interpret results; they should not own canonical durability, security, external-effect semantics or scientific validity.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Thin agent kernel | PydanticAI/LangGraph-style local patterns; AgentScope | Typed planning/tool semantics behind stable platform ports. | Framework-local state becomes accidental platform truth. |
| Coding workbench boundary | ACP + LSP + DAP | Editor controls files, terminals, permissions and lifecycle while agents remain interchangeable. | Protocol session becomes sole owner of a long task. |
| Context data plane | Tree-sitter; SCIP; Glean; Kythe; Zoekt | Build exact/semantic/repository maps as versioned data products with freshness manifests. | Stale context and embedding-only retrieval cause wrong edits. |
| Structured changes | AST/patch/edit protocols + review | Prefer machine-checkable edits and retain diff, tests, review and rollback evidence. | Free-form shell edits bypass policy or corrupt unrelated work. |
| Durable harness | Temporal/DBOS + workspace/effect adapters | Resume logical work without conflating conversation memory or process snapshot with recovery. | Duplicate effects, lost approvals and hidden provider state. |
| Evaluation | SWE-bench-like tasks plus real FAR missions | Measure end-to-end mission correctness, security, recovery, evidence and cost. | Benchmark overfitting and judge/model leakage. |
| Frontier research agents | Faraday/Replica; FAR; FAROS; AI Scientist families | Watch and independently reproduce; extract architecture only after evidence. | Hype, rubric-judge dependence, weak negative-result reporting and low maturity. |

**Future proof obligations:** Swap agents without migrating canonical state; revoke permissions during live tasks; execute real repositories; preserve human review and evidence for every consequential change.

## 16. Data / Search / Knowledge / Provenance Intelligence

**Preliminary architecture stance:** There should be one logical truth model and multiple rebuildable physical projections. Artifact, entity, proposition, assertion, observation, activity and validity assessment must remain distinct.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Transactional truth/control | FoundationDB/Postgres-class stores; bitemporal patterns | Own identities, assertions, policy versions and publication transactions. | Polyglot stores disagree and stale caches become truth. |
| Immutable artifact fabric | CAS/object storage/OCI/ORAS | Digest raw bytes and manifests; references—not large bytes—enter histories. | Mutable paths, dangling remote data and unsafe garbage collection. |
| Columnar data plane | Apache Arrow/Flight | Use stable schemas for cross-language high-throughput tables. | Treating in-memory buffers as durable state. |
| Scientific arrays | Zarr/TensorStore/HDF5 references | Chunked arrays with explicit schema/consolidation/publication semantics. | Partial metadata, concurrent writes and backend inconsistency. |
| Versioned data | DataLad/lakeFS/Dolt/DVC | Branch experiments by modality while retaining immutable artifacts. | Semantic merge and dual ownership. |
| Derived indexes | Lucene/Vespa/vector/graph projections | Rebuild from canonical assertions/artifacts; store index version/freshness. | Vector/search results silently outlive source corrections. |
| Scholarly graph | OpenAlex/OpenCitations/Crossref/OpenAIRE/Europe PMC | Preserve provider IDs, field-level license/provenance and disagreement. | Premature canonicalization and boolean retraction state. |
| Provenance algebra | PROV/OpenLineage/ProvSQL-style ideas | Retain alternative derivations and compute impact of evidence changes. | Graph/circuit growth and incomprehensible explanations. |

**Future proof obligations:** Define canonical object schemas and temporal semantics; test correction/retraction; benchmark projections; prove that deleting/rebuilding indexes cannot change scientific truth.

## 17. Systems / Runtime / Distributed / OS Intelligence

**Preliminary architecture stance:** Separate control-state recovery, execution-environment recovery and external-world reconciliation. Resource snapshots are replaceable accelerators.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Durable control | Temporal/DBOS/Restate | Timers, retries, pause/resume, migrations and logical history. | Replay nondeterminism and history/version growth. |
| Effects | Intent–Effect–Evidence ledger | Final gate, fencing, sink cooperation, receipt/inquiry and unknown state. | Exactly-once marketing without endpoint support. |
| Process/VM continuity | CRIU/DMTCP/Firecracker/checkpoint systems | Use for latency and stateful tools where compatible. | Secrets/version coupling and no external rollback. |
| Distributed ownership | Leases + fencing + generation | Reject stale workers at every authoritative sink. | Lease expiry without sink validation. |
| Messaging | NATS/Kafka-class systems | Transport events; durable ownership semantics remain in control/effect planes. | Broker delivery mistaken for business/effect completion. |
| Observability | OpenTelemetry + durable audit | Operational traces aid diagnosis; audit/evidence remain complete and durable. | Sampling, tail-buffer loss and cardinality/memory cliffs. |
| Deployment | Kubernetes/cloud/edge/local/HPC adapters | Choose topology by mission/data/security; keep core semantics topology-neutral. | Platform coupling and divergent local/cloud behavior. |

**Future proof obligations:** Fault-inject partitions, stale owners, cancellations, upgrades and recovery storms; define quiescence; maintain disaster recovery and schema migration procedures.

## 18. Compiler / Build / Execution Intelligence

**Preliminary architecture stance:** Compile research intent into typed, inspectable, content-addressed actions and staged backend lowerings; retain the derivation from claim to execution.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Typed research IR | MLIR-inspired dialects | Represent data, methods, effects, resources, units and evidence obligations. | Premature universal IR and semantic loss. |
| Incremental graph | Skyframe/Salsa/DICE | Track dependencies, equality cutoffs and invalidation explanations. | Hidden dynamic dependency produces stale science. |
| Hermetic action | Bazel/Nix/REAPI | Digest code/data/toolchain/environment and publish outputs atomically. | Non-hermetic network/time/randomness. |
| Backend lowering | Local, Wasm, containers, GPU, HPC, browser, robot | Backend contracts expose capabilities, recovery and evidence. | Backend-specific behavior breaks equivalence. |
| Remote execution | REAPI/CAS + schedulers | Move action descriptions and immutable inputs, not opaque sessions. | Poisoned cache, lost upload and untrusted worker. |
| Verification | Type/schema checks + property/differential tests | Validate lowerings and from-scratch equivalence. | Passing compilation mistaken for methodological correctness. |

**Future proof obligations:** Start with narrow dialects; record every lowering; test undeclared dependencies; compare clean/incremental/remote outputs; keep effects explicit.

## 19. HPC / GPU / Compute Intelligence

**Preliminary architecture stance:** Treat compute as a hierarchy of resource authorities and method-specific executors, not one universal scheduler or GPU framework.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Cluster allocation | Slurm + Flux | Slurm as site authority; Flux for nested/dynamic allocations where justified. | Competing schedulers and operational complexity. |
| Task/runtime layer | MPI/UCX/libfabric/StarPU/HPX/PaRSEC | Select by workload; retain topology and failure evidence. | Failure semantics and oversubscription. |
| Numerical methods | PETSc/Trilinos/SUNDIALS/SuiteSparse/Ginkgo | Reuse mature solvers/preconditioners with diagnostics. | Silent non-convergence or wrong tolerances. |
| Portability | Kokkos/RAJA/SYCL/OpenMP-class systems | Separate algorithms from backend execution while measuring portability gaps. | Performance cliffs and numerical variation. |
| Inference serving | vLLM/SGLang/TGI/TensorRT-LLM | Continuous batching, paged/prefix KV and disaggregation as replaceable serving layer. | Stale cache keys, incorrect outputs and resource leaks. |
| GPU kernels | Triton/CUTLASS/FlashAttention | Use optimized kernels after correctness/reference comparison. | Shape-specific regressions, precision and hardware dependence. |
| Data movement | Arrow/Flight/Zarr/TensorStore | Plan locality, chunks, zero-copy boundaries and backpressure. | Hidden copies and storage/network hot spots. |

**Future proof obligations:** Benchmark actual FAR models/data on target hardware; retain solver/inference diagnostics; test failure/restart; track cost, energy and topology.

## 20. Security / Reliability / Formal Verification Intelligence

**Preliminary architecture stance:** Security is a continuously enforced plane spanning identity, policy, sandbox, supply chain, persistent-state validation, audit and resource governance.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Plugin isolation | Wasmtime/WASI/Extism | Least-privilege host functions and versioned component interfaces. | Host/runtime vulnerabilities and resource DoS. |
| Native sandbox | Firecracker/Kata/gVisor-class tiers | Use stronger kernel boundary for untrusted native workloads. | Snapshot/kernel/device attack surface and operational cost. |
| Identity | SPIFFE/SPIRE | Short-lived attested workload identity. | Trust-domain bootstrap and identity≠authorization. |
| Policy | OPA/Cedar | Central policy with schema/versioned decision evidence. | TOCTOU and stale bundles/entity data. |
| Relationships | OpenFGA/SpiceDB | Project/data/artifact collaboration permissions. | Consistency and model mistakes. |
| Supply chain | Nix/SBOM/in-toto/Sigstore | Pinned closure, signed provenance and patch gates. | Signature does not establish code safety or science. |
| Formal/reliability | TLA+/TLC/Apalache + deterministic simulation | Prove/check critical state machines and generate tests. | Model/implementation gap. |
| Persistent state | Treat checkpoints/bundles/CRDT updates as untrusted | Validate schemas, tenant binding, signatures and capabilities on restore. | Deserialization and privilege resurrection. |

**Future proof obligations:** Threat model the integrated product; prove no direct effect bypass; run revocation races and hostile plugin/state tests; maintain advisory response and legal/privacy review.

## 21. IDE / Notebook / HCI / Collaboration Intelligence

**Preliminary architecture stance:** The workbench is part of scientific capability. It must expose claims, evidence, methods, uncertainty, effects and recovery—not merely chat and files.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Workbench shell | JupyterLab/Theia/custom patterns | Composable documents, editors, terminals, panels and extensions. | Framework rebase cost and extension trust. |
| Reactive computation | marimo + incremental graph | Expose dependencies and stale state; isolate effectful cells. | Accidental expensive/effect recomputation. |
| Agent boundary | ACP/LSP/DAP | Interchangeable agents with plans, permissions and debug surfaces. | Session/canonical-state confusion. |
| Claim/evidence workspace | FAR unique-core hypothesis | Navigate claim → evidence → method → run → artifact → validity. | Information overload and premature rigid workflow. |
| Failure/recovery UX | Effect and validity states | Show unknown effect, invalidation, stale projection, revocation and operator choices. | Hiding ambiguity encourages unsafe retries. |
| Collaboration | CRDT drafts + review + transactional publication | Offline editing with accountable release. | Convergent-invalid state and permission drift. |
| Visualization | ParaView/Catalyst/WebGPU patterns | Progressive/remote/in-situ views linked to transforms and uncertainty. | Misleading encodings and detached figures. |
| Publishing | Quarto + evidence package | Executable, diffable outputs with citations and closure. | Rendered success mistaken for truth. |

**Future proof obligations:** Run longitudinal researcher studies across disciplines; test accessibility and large projects; make uncertainty/failure states understandable; measure task outcomes, not screen count.

## 22. Autonomous Science / Laboratory / Robotics Intelligence

**Preliminary architecture stance:** No model or recovered process may directly infer physical state. Lab/robot actions require typed plans, device identity, calibration, interlocks, command acknowledgement and human authority.

| CAPABILITY | STRONG REFERENCES | DECISION INTELLIGENCE | KNOWN FAILURE / LIMIT |
| --- | --- | --- | --- |
| Experiment orchestration | Bluesky/Ophyd | Message-based plans, status, pause/resume and streaming documents. | Checkpoint cannot undo sample/device action. |
| Interoperability | SiLA/OPC UA | Observable commands, services, audit and typed device surfaces. | Vendor/standard profile variability. |
| Lab device adapters | PyLabRobot/Opentrons | Hardware abstraction and practical automation ecosystem. | Driver completeness, labware/calibration and warranty. |
| Robotics | ROS2/MoveIt | Lifecycle/QoS, transforms, planning scene and motion execution. | Stale frames/scenes and physical safety. |
| Sample/material identity | LIMS/ELN and barcode patterns | Bind command, container, sample, position and custody to evidence. | Mix-up and physical state not captured digitally. |
| Safety | Industrial/robot safety transfer | Emergency stop, interlocks, safe checkpoints, quiescence and operator release. | Software authorization is not safety certification. |
| Adaptive science | BoTorch/safe control + instrument ledger | Closed-loop design under constraints and uncertainty. | Unsafe exploration and biased adaptive inference. |

**Future proof obligations:** Simulation first; hardware-in-loop next; independent safety review; typed units/frames/calibration; non-resumable step labels; operator intervention for ambiguous physical state.

## 23. Cross-Domain Transfer Registry

Many of the most valuable FAR-Lab ideas are mature solutions from outside AI. The transfer is a hypothesis until its assumptions are tested in the FAR context.

| ID | FAR-LAB / AGENT PROBLEM | OTHER DISCIPLINE | MATURE CONCEPT | REFERENCE SYSTEMS | WHY TRANSFER MAY WORK | TRADEOFFS | FUTURE INVESTIGATION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| XDT-001 | Agent/tool side effects | Payment processing | Stable idempotency keys, receipts, transaction inquiry and compensation | Stripe/payment APIs; database transactions | Tool calls share the same commit/acknowledgement ambiguity. | Endpoints may not support inquiry/idempotency; compensation may be partial. | Define effect adapter conformance tests. |
| XDT-002 | Stale workers after failover | Distributed databases | Fencing tokens / generations enforced at the sink | ZooKeeper/etcd/database lease patterns | A lease alone cannot stop an old holder from writing. | Every authoritative write path must carry/verify generation. | Formalize and fault-inject ownership transfer. |
| XDT-003 | Long-running agent recovery | Event-sourced systems | Deterministic replay plus versioned migrations | Temporal/Cadence | Logical state can be reconstructed without snapshotting every process. | Nondeterminism and long-lived history upgrades are difficult. | Compare Temporal/DBOS with FAR workload. |
| XDT-004 | Agent subprocess failure | Erlang/OTP | Supervision trees, restart intensity and isolation | Erlang/Elixir OTP | Restarts need hierarchy and budgets, not blanket retries. | State/effect semantics remain external to supervision. | Use restart budgets and quiescence checks. |
| XDT-005 | Research recomputation | Build systems | Content-addressed actions and explicit invalidation | Bazel/Skyframe/REAPI/Nix | Experiments and derived views resemble dependency-driven builds. | Scientific dependencies can be dynamic/implicit. | Create typed research action graph and equivalence suite. |
| XDT-006 | Heterogeneous research execution | Compilers | Typed multi-level IR and staged lowering | MLIR/LLVM | Separate scientific intent from backend-specific execution. | IR ossification and semantic loss. | Prototype narrow IR with reversible lowering evidence. |
| XDT-007 | Collaborative drafts | Local-first systems | CRDT merge for proposals/comments/layout | Automerge/Yjs | Offline collaboration is valuable where convergence—not truth—is the requirement. | Convergent state can violate scientific/policy invariants. | Cross transactional validity boundary on publication. |
| XDT-008 | Experiment branching | Version-control/data-versioning | Commit/branch/diff/merge with immutable references | Git, DataLad, lakeFS, Dolt | Exploratory research naturally branches. | Merge semantics may not reflect scientific meaning. | Add semantic conflict/lineage layer. |
| XDT-009 | Measurement representation | Metrology | Quantity kind, units, frames, calibration and uncertainty budgets | QUDT, UCUM, VIM/GUM concepts | Scientific values are not bare numbers. | Domain-specific uncertainty/correlation remains complex. | Create Measurement object and domain profiles. |
| XDT-010 | Claim validity | Causal inference/statistics | Explicit assumptions, diagnostics, sensitivity and falsification | DoWhy, Stan, ArviZ | A claim should carry the conditions under which it is supported. | Methods do not automate judgment or domain validity. | Implement validity assessments and human gates. |
| XDT-011 | Adaptive experiments | Control theory / operations research | Safe exploration, constraints, stopping and value of information | BoTorch, MPC/safe BO literature | Experiment selection is a closed-loop control problem. | Model misspecification can cause unsafe or biased decisions. | Require safe set, operator override and prospective validation. |
| XDT-012 | Large scholarly search | Search/recommender systems | Cascaded retrieval and bounded expensive reranking | Lucene/Vespa/FAR cascade | Use cheap high-recall stages before expensive analysis. | Early-stage false negatives may be unrecoverable. | Build recall audit and source-stratified sampling. |
| XDT-013 | Research artifact trust | Software supply chain | Typed attestations, transparency and provenance closure | in-toto/SLSA/Sigstore | Code/data/model environments need verifiable origin. | Authenticity does not prove scientific validity. | Link attestations to validity/evidence graph. |
| XDT-014 | Machine/service identity | Zero-trust infrastructure | Attested short-lived workload identity | SPIFFE/SPIRE | Agents/executors should not inherit ambient long-lived credentials. | Identity alone does not authorize an effect. | Bind identity and delegated user authority at final gate. |
| XDT-015 | Third-party extensions | Browser/runtime security | Capability-scoped sandbox and stable ABI | WASI/Component Model/Extism | Plugins should receive explicit host powers only. | Resource exhaustion and host bugs remain. | Build threat/conformance suite and patch gate. |
| XDT-016 | Nested compute allocation | HPC schedulers | Hierarchical allocation and nested scheduling | Flux/Slurm | Research missions allocate resources to subworkflows dynamically. | Cluster policy and operational complexity. | Keep optional executor boundary. |
| XDT-017 | Long-term research package | Digital preservation | Self-describing package plus persistent identifiers and fixity | RO-Crate, BagIt/OCI concepts | Research must survive implementation/runtime turnover. | External services and mutable dependencies can escape closure. | Test independent reconstruction years/versions later. |
| XDT-018 | Critical orchestration invariants | Formal methods | State-machine specification and counterexample search | TLA+/TLC/Apalache | Effect/recovery protocols are small enough to model. | Abstract model may diverge from implementation. | Generate conformance tests from traces/invariants. |
| XDT-019 | Derived evidence impact | Database provenance theory | Provenance semirings / dependency circuits | ProvSQL and provenance research | A conclusion may have alternative derivations and changing evidence trust. | Scalability and interpretation complexity. | Prototype bounded provenance algebra for claim graphs. |
| XDT-020 | Large scientific views | Graphics/visual analytics | Level-of-detail, remote rendering and in-situ pipelines | ParaView/Catalyst | Move computation to data and progressively reveal detail. | Visualization can mislead or discard uncertainty. | Bind view transforms and uncertainty to provenance. |
| XDT-021 | Reproducible distributed behavior | Replicated-state-machine testing | Deterministic simulation and minimized seeds | FoundationDB simulation | Rare race/failure combinations become repeatable. | Simulation model may omit hardware/OS faults. | Combine simulation, chaos and production traces. |
| XDT-022 | Human approvals and publication | Clinical/regulated governance | Protocol registration, role separation, audit and release gates | Clinical trial/quality-system patterns | High-consequence science needs accountable staged release. | Regulatory regimes vary; process can become burdensome. | Domain-specific governance profiles and legal review. |
| XDT-023 | Robot/instrument state | Robotics/control systems | Coordinate frames, calibration, command acknowledgement and emergency stop | ROS2/MoveIt, OPC UA, SiLA | Physical state cannot be inferred from software checkpoints. | Hardware-specific dynamics and safety certification. | Hardware-in-loop test and operator safety case. |
| XDT-024 | Evidence correction history | Bitemporal databases/accounting | Valid time vs system time and non-destructive correction | XTDB and temporal databases | Science needs to know both when a fact applied and when FAR learned it. | Query/model complexity and storage growth. | Implement assertion/retraction/supersession semantics. |
| XDT-025 | Research portfolio choice | Decision analysis | Expected value of information, constrained portfolio optimization | Bayesian decision theory / OR | Resources should be allocated to decisions, not merely tasks. | Scientific value is difficult to quantify and can be gamed. | Use transparent multi-criteria governance, not a single opaque score. |

## 24. Failure Intelligence Registry

Failure records are first-class decision intelligence. They may change a tier, define a required adapter contract or establish a rejection even when a feature list looks attractive.

| ID | SYSTEM / PATTERN | RESEARCH UNIT | FAILURE | ROOT CAUSE | GENERAL LESSON | FAR-LAB CONSEQUENCE |
| --- | --- | --- | --- | --- | --- | --- |
| FIR-203 | Durable runtime | RU-001 | External action repeats after timeout | Receipt persisted after downstream commit and retry assumes failure | Exactly-once is an end-to-end protocol | Use UNKNOWN_EFFECT_STATE, query and stable idempotency key |
| FIR-204 | Worker leases | RU-001 | Old worker commits after lease loss | Lease expires but sink does not enforce generation | Lease alone is not fencing | Check generation at final authoritative write |
| FIR-205 | Checkpoint system | RU-001 | Checkpoint load executes attacker-controlled code | General object deserialization crosses trust boundary | Persistent state is supply-chain input | Typed schemas, signatures, allowlists and low-privilege loader |
| FIR-206 | Recovery automation | RU-001 | Control plane repeatedly collapses during mass recovery | Recovery traffic shares unbounded normal autoscaling path | Recovery is a separate workload class | Independent quotas, jitter and gradual admission |
| FIR-207 | Environment snapshot | RU-001 | Restored process disagrees with external systems | Snapshot rolls back local state but not remote effects | Snapshot is cache, not world rollback | Reconcile databases, jobs and instruments on resume |
| FIR-208 | Code context index | RU-002 | Agent edits against stale symbols | Index revision is hidden from consumer | Context needs freshness evidence | Return source revision/index generation with every result |
| FIR-209 | Repository map | RU-002 | Central files dominate task-specific context | Global graph centrality used without local evidence | One ranking is not a context policy | Fuse task mentions, exact search and semantic dependencies |
| FIR-210 | Notebook | RU-002 | Rerun order changes result | Implicit mutable kernel state and out-of-order cells | Computational documents need explicit dependencies | Reactive graph and stale-state indicators |
| FIR-211 | Incremental cache | RU-002 | Incorrect result reused | Undeclared input or weak cache key | Hermeticity is a correctness property | Capture environment, code, data and policy fingerprints |
| FIR-212 | Patch engine | RU-002 | Patch overwrites concurrent human/agent change | No source precondition or merge transaction | Text mutation needs optimistic concurrency | Digest preconditions and conflict review |
| FIR-213 | Provenance store | RU-003 | Successful run has incomplete evidence | Telemetry was treated as durable evidence | Observability can be sampled/dropped | Evidence ledger must be transactional or reconciled |
| FIR-214 | Metadata fusion | RU-003 | Correct source value is silently overwritten | Last-write-wins collapses disagreement | Conflict is information | Preserve source assertions and fusion rule |
| FIR-215 | Attestation pipeline | RU-003 | Signed artifact is reported scientifically valid | Cryptographic authenticity confused with methodological validity | Integrity and validity are separate gates | Require statistical/domain validity evidence |
| FIR-216 | Citation graph | RU-003 | Claim cites a paper that does not support it | Identifier link lacks citation context and entailment | A citation edge is not support | Store quoted context, location and support relation |
| FIR-217 | Research package | RU-003 | Package cannot be reproduced later | Dependencies, data rights or remote resources were not captured | Packaging needs closure and license metadata | Evidence completeness checks before publication |
| FIR-218 | Vector-only retrieval | RU-004 | Exact identifiers and rare terms are missed | Dense similarity replaces lexical retrieval | Semantic search does not dominate every query | Always retain exact and sparse channels |
| FIR-219 | Hybrid ranker | RU-004 | Ranking changes after model update without trace | Reranker/model/index version omitted | Retrieval is part of evidence production | Persist full retrieval provenance |
| FIR-220 | Search index | RU-004 | Recently corrected source remains invisible | Refresh/merge lag not surfaced | Freshness is query semantics | Expose indexed-at and source revision |
| FIR-221 | IR benchmark | RU-004 | System appears better only on familiar benchmark | Dataset leakage and overfitting | Benchmark diversity and holdouts matter | Use domain-separated, time-split evaluation |
| FIR-222 | PDF extraction | RU-004 | Tables/equations/citations are corrupted | Layout parser output trusted without confidence | Extraction is uncertain evidence | Retain page coordinates, original asset and confidence |
| FIR-223 | Active screening | RU-004 | Relevant studies excluded too early | Stopping model assumptions violated | Active learning cannot certify recall by itself | Audit random samples and sensitivity of stop rule |
| FIR-224 | LLM server | RU-005 | OOM cascade under long contexts | Admission counts requests, not KV/memory demand | Concurrency is not a scalar | Use token/KV/memory-aware admission |
| FIR-225 | Prefix cache | RU-005 | Tenant or policy data leaks through reused prefix | Cache key omits authority/model/policy dimensions | Caches cross security boundaries | Bind cache to tenant, model, policy and content digest |
| FIR-226 | Continuous batching | RU-005 | Interactive requests starve | Throughput scheduler lacks fairness/deadline policy | Max throughput can destroy product latency | Separate classes and enforce age/fairness |
| FIR-227 | Model router | RU-005 | Fallback changes tool/schema behavior | Providers treated as semantically interchangeable | Capability negotiation needs conformance evidence | Route only across tested compatible profiles |
| FIR-228 | Quantized inference | RU-005 | Numerical/quality regression goes unnoticed | Only throughput measured | Optimization must preserve task quality | Record quality delta per workload and precision |
| FIR-229 | Compiler stack | RU-005 | Generated kernel is fast but wrong for dynamic shape | Guard or fallback path incomplete | Compilation needs differential testing | Compare eager/reference across shapes |
| FIR-230 | GPU backend | RU-005 | Silent CPU fallback destroys cost/latency | Backend placement not included in evidence | Execution location is result metadata | Record actual device/kernel/backend |
| FIR-231 | HPC scheduler | RU-006 | Job completes but scientific output is partial | Exit code is treated as semantic completion | Process success is not scientific success | Validate output manifest and invariants |
| FIR-232 | MPI application | RU-006 | Single rank failure hangs entire job | Failure semantics not designed into collective protocol | Communication interface constrains recovery | Use checkpoint/restart or resilient task decomposition |
| FIR-233 | Floating-point reduction | RU-006 | Different rank/order yields different result | Non-associativity and nondeterministic scheduling | Bitwise reproducibility is not automatic | Record reduction algorithm and tolerance |
| FIR-234 | Iterative solver | RU-006 | Solver reports convergence to wrong answer | Stopping norm/tolerance/preconditioner inappropriate | Convergence flag needs residual and validation | Persist residual history and reference checks |
| FIR-235 | Mixed precision | RU-006 | Speedup causes unstable or biased result | Precision policy hidden | Precision is scientific configuration | Record precision per stage and error bound |
| FIR-236 | HPC checkpoint | RU-006 | Checkpoint cannot resume on new topology/driver | Snapshot captures implementation-specific state | Portability needs application contract | Versioned checkpoint compatibility manifest |
| FIR-237 | Optimization solver | RU-006 | “Optimal” solution is not comparable | Gap, tolerance, time limit or termination reason omitted | Optimality is conditional | Store solver log, bounds and termination |
| FIR-238 | MCMC study | RU-007 | Posterior summary is reported despite non-convergence | Diagnostics omitted or cherry-picked | Inference output requires diagnostics gate | Require R-hat/ESS/divergence review |
| FIR-239 | Sequential experiment | RU-007 | False positive rate inflates | Repeated peeking without sequential correction | Adaptive observation changes inference | Use preregistered stopping or sequential methods |
| FIR-240 | Causal analysis | RU-007 | Strong causal language from observational association | Identification assumptions remain implicit | Estimator sophistication cannot create identification | Store DAG/estimand and refutation results |
| FIR-241 | Bayesian optimization | RU-007 | Planner samples unsafe experiment | Constraint model lacks conservative safety envelope | Optimization objective is not safety policy | Independent hard interlocks and approvals |
| FIR-242 | Instrument control | RU-007 | Timeout causes repeated physical action | Controller cannot query whether device acted | Physical effects are often irreversible | Command IDs, status query and manual resolution |
| FIR-243 | Measurement pipeline | RU-007 | Unit conversion or calibration silently wrong | Units/calibration treated as display metadata | Measurement semantics are executable constraints | Typed quantities and calibration receipts |
| FIR-244 | Sandbox | RU-008 | Isolated process exfiltrates via ambient credentials/network | Isolation focuses on filesystem only | Sandbox security is multi-dimensional | Deny-by-default credentials/network/resources |
| FIR-245 | Authorization | RU-008 | Revoked permission remains usable offline | Capability/token lacks epoch or revocation check | Offline authority has bounded validity | Short leases, generations and final effect check |
| FIR-246 | Policy engine | RU-008 | Decision and action use different state | TOCTOU between policy evaluation and effect | Decision receipt must bind effect parameters | Recheck or transactionally bind policy version/input |
| FIR-247 | Formal model | RU-008 | Model proves property absent from implementation | Abstraction omits failure or integration path | Proof scope must be explicit | Trace model variables to code and runtime tests |
| FIR-248 | Bounded checker | RU-008 | No counterexample is mistaken for proof | Search bound too small | Bounded verification is conditional | Report bounds and complement with other evidence |
| FIR-249 | Fuzzer | RU-008 | High coverage misses semantic corruption | Oracle only detects crash | Generator and oracle define what is tested | Add invariants, differential and metamorphic checks |
| FIR-250 | Agent benchmark | RU-008 | Scores rise through contamination or brittle harness | Static public tasks and hidden infrastructure drift | Evaluation datasets age | Time-split/private tasks and harness versioning |
| FIR-251 | CRDT document | RU-009 | Replicas converge to semantically invalid state | CRDT resolves operations but not business invariant | Convergence is not correctness | Use invariant-aware transactions or escrow |
| FIR-252 | Presence channel | RU-009 | Stale cursor/status becomes durable truth | Ephemeral awareness mixed with document history | Presence has different retention/consistency | Separate ephemeral channel |
| FIR-253 | Local-first client | RU-009 | Revoked user commits offline mutation later | Offline write accepted without authority epoch | Local-first needs revocation semantics | Bind mutation to capability generation and server validation |
| FIR-254 | Plugin ecosystem | RU-009 | Plugin breaks host after API upgrade | Unversioned in-process ABI | Extensions need explicit contract and isolation | Component/RPC boundary and compatibility suite |
| FIR-255 | Version control | RU-009 | Semantic artifact conflict hidden by text merge | Files merge cleanly but scientific objects conflict | Text merge cannot validate domain semantics | Domain-aware validators after merge |
| FIR-256 | Controller | RU-010 | Two controllers fight and oscillate | Overlapping ownership of the same desired state | Every invariant needs one authority | Separate infrastructure and research controllers |
| FIR-257 | Event backbone | RU-010 | Duplicate message causes duplicate effect | At-least-once delivery confused with exactly-once effect | Broker semantics stop at delivery boundary | Consumer idempotency/effect ledger |
| FIR-258 | Telemetry pipeline | RU-010 | Incident has no trace because sampling dropped it | Sampling optimized volume without failure policy | Telemetry is probabilistic | Tail/sample by error and preserve durable evidence separately |
| FIR-259 | Autoscaler | RU-010 | Recovery surge triggers runaway scale and control load | Feedback loop ignores recovery class and control capacity | Control planes need rate limits | Queue isolation and circuit breakers |
| FIR-260 | Edge gateway | RU-010 | Offline instrument gateway diverges from central policy | Policy/config versions not reconciled | Edge autonomy needs bounded leases | Fail closed for irreversible effects |
| FIR-261 | Publication build | RU-011 | Same source produces different paper | Unpinned toolchain, locale, data or network fetch | Documents are software builds | Hermetic manifest and deterministic rendering |
| FIR-262 | Citation resolver | RU-011 | Reference metadata changes silently | Live resolver overwrites prior resolved record | Citation metadata is versioned evidence | Snapshot source assertion and DOI retrieval time |
| FIR-263 | Interactive chart | RU-011 | Screenshot hides filters or sampling | View state not stored with claim | Visualization interaction is part of evidence | Persist selection/filter/aggregation spec |
| FIR-264 | Review system | RU-011 | Comment attaches to wrong text after edits | Anchor based only on offsets | Review anchors need stable identity/context | Node IDs and re-anchoring evidence |
| FIR-265 | Domain schema | RU-012 | Valid file is scientifically misinterpreted after schema change | Version migration or units semantics ignored | Schema version is executable context | Pin validator/schema and migration record |
| FIR-266 | Labeled array | RU-012 | Coordinate alignment produces plausible wrong output | Automatic alignment on inconsistent coordinates | Labels reduce but do not remove semantic error | Validate units, frames and coordinate domains |
| FIR-267 | Workflow wrapper | RU-012 | Tool upgrade changes output format | Container tag or wrapper not pinned | Tool interface is versioned scientific dependency | Digest images and output schema tests |
| FIR-268 | Robotics/lab adapter | RU-012 | Simulation command is unsafe on real hardware | Digital interface lacks physical interlocks | Software approval is not safety certification | Independent hardware safety layer |
| FIR-269 | Protocol gateway | RU-013 | Translation drops permission or cancellation semantics | Canonical model is weaker than source protocol | Interoperability can lose safety | Conformance matrix and fail on unrepresentable fields |
| FIR-270 | Schema evolution | RU-013 | Old client misreads new enum/field | Unknown-value behavior unspecified | Forward compatibility must be designed | Reserve extensions and test mixed versions |
| FIR-271 | Dataspace connector | RU-013 | Usage policy is not enforceable after download | Policy travels but receiver controls execution | Sovereignty is partly governance | Prefer compute-to-data and audit receipts |
| FIR-272 | Artifact registry | RU-013 | Attestations are garbage-collected separately | Referrer retention not tied to subject | Evidence lifecycle must match artifact | Retention policy and completeness check |
| FIR-273 | Energy estimator | RU-014 | Carbon savings claim is numerically precise but wrong | Estimated power/carbon uncertainty omitted | Sustainability evidence needs uncertainty | Record model, interval and source |
| FIR-274 | Browser compute | RU-014 | Local result depends on browser/GPU implementation | WebGPU/Wasm backend and precision differ | Browser portability is not bitwise identity | Record browser/device/backend and tolerance |
| FIR-275 | Quantum workflow | RU-014 | Circuit result cannot be reproduced | Calibration and queue/backend state changed | Quantum result is calibration-bound | Capture calibration snapshot and backend receipt |
| FIR-276 | Unit ontology | RU-014 | Dimensionally compatible conversion changes meaning | Quantity kind not distinguished from dimension | Units alone are insufficient | Use quantity kind and domain constraints |

## 25. Innovation White Space

White-space records are hypotheses about inadequately solved FAR-Lab problems. They are not established unique-core designs.

| ID | PROBLEM | WHY CURRENT SYSTEMS REMAIN INSUFFICIENT | CLOSEST SYSTEMS | MISSING PRIMITIVE | POSSIBLE RESEARCH DIRECTION | SCIENTIFIC VALUE | DIFFICULTY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS-073 | Internal step dedup does not prove external actions exactly once | Downstream systems differ and timeout leaves ambiguous state | Temporal/Restate/DBOS; payment idempotency | Effect receipt/query/compensate/fence conformance protocol | FAR-Lab Effect Gateway with UNKNOWN_EFFECT_STATE | Prevents duplicate experiments, commits and releases | EXTREME |
| WS-074 | One run spans resources no process snapshot can restore together | Remote jobs and physical devices advance independently | CRIU/DMTCP/MANA/Crab; workflow histories | Resource checkpoint capability and rebind/reconcile hooks | Resource contract: checkpointable/reconnectable/replayable/compensatable/irreversible | Long autonomous scientific work | EXTREME |
| WS-075 | Runtime completion is promoted directly to a scientific claim | Software systems do not know domain assumptions/statistics | ArviZ; causal refuters; validators | Claim-level method and uncertainty contract | Independent validity service with domain plugins and human escalation | Trustworthy autonomous science | EXTREME |
| WS-076 | Metadata systems collapse conflicting sources | Last-write-wins destroys uncertainty and correction history | OpenAlex/OpenAIRE/PROV | Assertion-level source/confidence/fusion model | Evidence graph with reversible fusion rules | Honest literature and dataset intelligence | HIGH |
| WS-077 | Changes to data, policy or assumptions require selective recomputation | Build systems know files, not scientific meaning | DICE/Salsa/Bazel; reactive notebooks | Semantic dependency and equality contracts | Research action graph linking claims, data, code, models and policy | Fast reproducible revision | EXTREME |
| WS-078 | Agents consume stale indexes without knowing it | Retrieval APIs omit source/index generations | Glean/SCIP/code search | Freshness manifest and stale-result policy | Versioned context data plane with invalidation notifications | Safer coding and analysis | HIGH |
| WS-079 | Citations are returned without full search trace | RAG systems usually store only final chunks | IR experiment systems; provenance standards | Query/index/ranking/source trace schema | Retrieval provenance ledger and replay harness | Defensible evidence gathering | HIGH |
| WS-080 | Gateways route by static provider labels | Tool/schema/reasoning behavior changes across models and versions | LiteLLM; MCP capability negotiation | Continuously measured capability profile | Model conformance lab feeding policy router | Reliable multi-provider operation | HIGH |
| WS-081 | Recovery tests validate liveness, not semantic equivalence | Duplicate or reordered effects remain invisible | Jepsen; workflow tests | Intent/effect/evidence trace equivalence benchmark | Fault-injection corpus and formal invariants | Long-running agent reliability | HIGH |
| WS-082 | Solver outputs omit configuration and backend semantics | Libraries expose different logs/tolerances/precision | PETSc/Trilinos/JuMP/Pyomo | Common solver-run evidence schema | Solver adapter contract with residuals, bounds and termination | Auditable computational science | HIGH |
| WS-083 | Units/calibration/uncertainty are optional annotations | Generic data frames lose covariance and traceability | QUDT; UCUM; Astropy; lab systems | Quantity kind + calibration + covariance contract | Measurement object graph enforced at computation boundaries | Prevents physically meaningless conclusions | EXTREME |
| WS-084 | Lab automation retries commands after ambiguous timeout | Devices often lack idempotency and transactional query | Bluesky/Ophyd; industrial protocols | Device status/receipt/irreversibility adapter contract | Lab effect gateway with manual-resolution states | Safe autonomous experimentation | EXTREME |
| WS-085 | Local-first systems accept long-lived offline authority | CRDT convergence ignores authorization epochs | Automerge/Yjs + authorization systems | Revocable capability generation in mutation envelope | Server-validated authority epochs and bounded offline leases | Secure multi-institution collaboration | HIGH |
| WS-086 | Text/CRDT merge creates scientifically invalid composite object | Merge engines do not understand units, schemas or causal roles | Version control; domain validators | Post-merge semantic invariant hooks | Plugin-provided merge validators and repair workflows | Reliable collaborative data/model editing | HIGH |
| WS-087 | Authorization is evaluated separately from the action | State changes between decision and effect | OPA/Cedar; transactional systems | Decision receipt bound to exact effect and generation | Policy-aware effect transaction or final gate | Security under concurrency | HIGH |
| WS-088 | Agent/data protocols evolve independently | Gateways silently discard unsupported fields | MCP/ACP/A2A/CloudEvents | Machine-readable semantic coverage matrix | Canonical model with explicit unrepresentable-state failures | Interoperable without weakening safety | HIGH |
| WS-089 | Restricted data cannot leave site, but results need trust | TEEs prove software measurement, not method/data handling | Confidential Containers; RATS; in-toto | Privacy-preserving evidence predicates | Compute-to-data worker with attested policy and selective-disclosure evidence | Cross-institution science | EXTREME |
| WS-090 | Operations monitor uptime, not evidence or validity | SRE metrics ignore ambiguous effects and invalid claims | OpenTelemetry/Prometheus | Research-specific SLI vocabulary | SLOs for recovery equivalence, evidence completeness and validity | Operate autonomous science responsibly | HIGH |
| WS-091 | Papers review prose separately from computation/evidence | Comments are not linked to reproducible claim nodes | Manubot/OpenReview/PROV | Stable claim identity and evidence traversal | Reviewable claim graph with executable checks | Faster, deeper scientific review | EXTREME |
| WS-092 | Schedulers report precise carbon numbers from estimates | Power attribution and carbon forecasts are uncertain | Kepler; Carbon Aware SDK | Uncertainty-bearing sustainability evidence | Energy/carbon objective with confidence intervals and deadline constraints | Responsible compute planning | MEDIUM |
| WS-093 | Quantum results expire with device calibration | Circuit artifact alone cannot reproduce physical execution | QIR; OpenQASM; cloud quantum services | Calibration/backend/queue/effect receipt schema | Hybrid quantum evidence envelope | Future quantum science integration | HIGH |
| WS-094 | Dataspace policy does not control downloaded copies | Post-transfer enforcement is weak | Eclipse EDC; Dataspace Protocol; federated analysis | Attested remote execution and result-release policy | Policy-negotiated compute capsules at data holder | Restricted-data collaboration | EXTREME |
| WS-095 | Datasets span arrays, meshes, images, code, streams and physical samples | Existing identifiers are format- or repository-specific | RO-Crate; OCI; domain standards | Cross-medium identity and part/derivation model | Content/semantic manifest with external custody references | Unified research artifact management | HIGH |
| WS-096 | Domain schemas evolve, but transformed datasets lose migration history | Converters overwrite objects without proof | BIDS/NWB/NOMAD versioning | Migration predicate and validation receipt | Versioned transformation chain with reversible source retention | Long-term reproducibility | HIGH |
| WS-097 | Agent-created work can inherit ambiguous user authority | Session creator/current user is often inferred | OpenGeni initiator patterns; ACP permissions | Immutable initiator/delegation chain | Every effect and claim carries frozen authority provenance | Accountability and safe delegation | HIGH |
| WS-098 | Benchmarks test isolated tools, not research workflows | No common harness spans retrieval, code, computation, evidence and validity | BEIR/SWE-bench/workflow tests | Composable scientific task/evidence schema | Private time-split end-to-end research benchmark | Measure actual FAR-Lab value | EXTREME |
| WS-099 | Distributed instruments and compute disagree on time | Wall-clock timestamps lack synchronization/uncertainty provenance | PTP/NTP; instrument logs | Clock source, uncertainty and causality record | Time attestation in evidence envelope | Ordering and physical traceability | HIGH |
| WS-100 | CPU/GPU/browser results differ subtly | Backend, compiler and reduction order are not first-class | Kokkos; WebGPU; ML compilers | Tolerance and backend-equivalence contract | Reference computation plus differential validation matrix | Portable scientific confidence | HIGH |

### Highest-leverage repaired white spaces

| PROBLEM | CURRENT CLOSEST SYSTEMS | WHY INSUFFICIENT | MISSING PRIMITIVE / DIRECTION | MAJOR UNCERTAINTY | REQUIRED EXPERIMENT |
| --- | --- | --- | --- | --- | --- |
| End-to-end external-effect correctness | Temporal/DBOS/Restate; payment APIs; instrument standards | No generic runtime can prove physical/remote effects exactly once without sink cooperation. | Effect-adapter conformance protocol and typed unknown/quiescence states. | Coverage of heterogeneous sinks and irreversibility. | Real adapters with crash injection and formal model. |
| Scientific validity as a software object | Workflow/provenance/statistics tools | Execution, provenance, signatures and diagnostics are fragmented and none is sufficient alone. | ValidityAssessment with discipline profile, assumptions, diagnostics and accountable release. | Avoiding false universal methodology. | Three discipline pilots reviewed by experts. |
| Claim-centered workbench | Notebooks, IDEs, literature tools | Users navigate files/cells/chats rather than claim–evidence–method impact. | Reactive claim/evidence graph with review and invalidation UX. | Cognitive load and fit across disciplines. | Longitudinal researcher study. |
| Bitemporal, provenance-carrying scientific knowledge | KGs, temporal DBs, lineage systems | Contradictions/corrections and alternative derivations are flattened. | Assertion graph + valid/system time + provenance algebra + incremental projections. | Scale and human explanation. | Scholarly correction corpus benchmark. |
| Safe adaptive physical science | BO platforms and lab orchestrators | Optimization, physical safety, command semantics and evidence are separate. | Safe controller + effect ledger + sample/device state reconciliation. | Hardware variability and safety certification. | Simulation and hardware-in-loop campaign. |
| Portable typed scientific execution | Workflow DSLs, MLIR, build systems | No common IR preserves science semantics while lowering to local/GPU/HPC/browser/lab backends. | Narrow extensible research IR with evidence/recovery contracts. | Premature abstraction and semantic loss. | Three heterogeneous end-to-end methods. |

## 26. Combinational Innovation Hypotheses

| ID | COMBINATION | SOURCE DISCIPLINES | EXPECTED ADVANTAGE | WHY EXISTING SYSTEMS DO NOT ALREADY PROVIDE IT | RISKS | PROOF REQUIRED |
| --- | --- | --- | --- | --- | --- | --- |
| CIH-X01 | Durable control + effect ledger + scientific validity gate | Distributed systems + payments + scientific method | Long missions recover safely while external effects and scientific acceptance remain independently authoritative. | Existing runtimes usually stop at workflow success and agent systems often conflate execution with correctness. | More state machines, adapter burden and user-visible ambiguity. | Model checking, sink fault injection, method-specific validity tests and real mission trials. |
| CIH-X02 | Content-addressed artifacts + PROV graph + signed attestations + RO-Crate | Build systems + provenance + supply chain + preservation | Portable proof-carrying research object with independently verifiable fixity and lineage. | Each existing layer solves only one evidence dimension. | Identity alignment, package size, redaction and profile fragmentation. | Cross-tool package reconstruction and adversarial tamper/redaction tests. |
| CIH-X03 | MLIR-like research IR + Bazel action graph + Slurm/Flux executors | Compilers + build systems + HPC | Typed plans lower to local/GPU/HPC backends with retained action identity and incremental reuse. | Scientific plans and resource schedulers currently meet through ad hoc scripts. | IR rigidity, dynamic dependencies and backend semantic mismatch. | Prototype three methods/backends and prove equivalent scientific semantics. |
| CIH-X04 | Bitemporal assertion graph + provenance semiring + incremental materialization | Temporal DBs + database provenance + dataflow | Correct/retract evidence and incrementally identify affected conclusions without flattening contradictions into facts. | Knowledge graphs typically lack both non-destructive assertion history and derivation algebra. | Graph/circuit growth and difficult explanation semantics. | Bounded corpus prototype, correction benchmark and human explanation study. |
| CIH-X05 | ACP/MCP + capability policy + workload identity | IDE protocols + tool interoperability + zero trust | Interchangeable agents/tools with explicit permissions and identity-bound effects. | Protocols define transport but rarely own durable security/effect semantics. | Protocol downgrade, confused deputy and reconnect identity errors. | Conformance suite, revocation races, reconnect and bypass tests. |
| CIH-X06 | Reactive notebook + hermetic action graph + evidence envelope | Notebooks + build systems + provenance | Interactive exploration with stale-state detection, reproducible recomputation and publishable evidence. | Reactive notebooks do not fully model external effects/environments; build systems lack scientific UX. | Expensive recompute, hidden dynamic dependencies and effect replay. | From-scratch equivalence, effect-cell semantics and researcher workflow trials. |
| CIH-X07 | CRDT drafts + transactional publication + semantic validators | Local-first + databases + scientific schemas | Offline collaboration without allowing convergent-but-invalid state to become scientific truth. | Most collaboration systems stop at syntactic convergence. | Publication conflicts, validator latency and confusing dual states. | Adversarial offline merges, revocation and publication UX tests. |
| CIH-X08 | Hybrid retrieval + active screening + provenance-aware audit sampling | Information retrieval + systematic review + statistics | High-recall evidence discovery with bounded cost and explicit uncertainty about missed studies. | Retrievers optimize ranking; review tools often lack source/provenance-aware stopping proof. | Sampling bias, reviewer drift and source license differences. | Prospective review against expert gold set with recall audit. |
| CIH-X09 | Bayesian optimization + safe control + instrument command audit | Machine learning + control theory + lab automation | Adaptive autonomous experiments that remain within safety constraints and produce auditable command/evidence chains. | Optimization platforms and lab orchestrators are usually separate. | Model misspecification, irreversible effects and hardware failure. | Simulation then hardware-in-loop with safe-set/interlock/operator review. |
| CIH-X10 | WASI components + domain schemas + signed plugin manifests | Runtime security + scientific standards + supply chain | Portable scientific method plugins with explicit capabilities, typed I/O and verifiable provenance. | General plugin hosts lack scientific semantics; scientific packages often have ambient authority. | ABI/schema governance, performance and native-library escape hatches. | Multi-language plugin corpus, capability denial, signature and numerical equivalence tests. |
| CIH-X11 | Arrow Flight + Zarr/TensorStore + topology-aware HPC scheduler | Data interchange + arrays + HPC | High-throughput table/array movement with locality-aware execution and immutable references. | No single store/protocol handles all modalities and scheduler concerns. | Copies hidden by bindings, cache coherence and storage hot spots. | End-to-end locality/throughput/memory benchmark on real cluster. |
| CIH-X12 | Operational telemetry + durable audit + deterministic replay debugger | Observability + event sourcing + debugging | Navigate from a user-visible failure to exact authoritative transitions and a reproducible replay. | Tracing is sampled and replay histories often lack scientific/effect semantics. | Privacy, evidence volume and version compatibility. | Fault corpus with trace loss and cross-version replay. |
| CIH-X13 | Metrology objects + causal models + uncertainty propagation | Measurement science + causal inference + statistics | Claims carry units/calibration/measurement uncertainty through causal and statistical transformations. | Current AI/knowledge stacks flatten values and confidence. | Correlated uncertainty and domain-specific measurement models. | Domain pilot with reference calculations and expert metrology review. |
| CIH-X14 | Attested confidential worker + sovereign data space + evidence-release policy | Confidential computing + data governance + provenance | Compute near restricted data while releasing verifiable, policy-approved evidence rather than raw data. | Confidential compute, data spaces and scientific provenance are developed separately. | Attestation trust, side channels, reproducibility and legal acceptance. | Threat model, remote-attestation pilot, privacy audit and independent reproduction. |
| CIH-X15 | WebGPU/Pyodide + executable publication + signed provenance | Browser runtimes + publishing + evidence | Portable interactive papers that execute locally and retain result provenance. | Browser execution usually lacks archival/environment/claim guarantees. | Browser/version drift, package supply chain, device variation and memory limits. | Cross-browser deterministic corpus and long-term replay package. |
| CIH-X16 | QIR/OpenQASM + MLIR-style lowering + classical workflow + calibration provenance | Quantum compilers + workflow systems + metrology | Hybrid quantum/classical experiments with explicit device calibration and reproducible lowering choices. | Quantum IRs and scientific workflow/provenance systems are weakly integrated. | Rapid hardware change, proprietary toolchains and noisy validity. | Multi-provider reference workflow and calibration-sensitive reproduction. |

## 27. Future Technology Radar

Time bands are directional, not forecasts. `NOW` means production-relevant today; `NEXT` approximately 1–2 years; `FRONTIER` approximately 2–5 years and potentially architecture-changing; `WATCH` means maturity/evidence is insufficient.

| ID | HORIZON | DIRECTION | WHY IT MATTERS | REFERENCE SIGNALS | FAR-LAB POSTURE |
| --- | --- | --- | --- | --- | --- |
| FR-001 | NOW | Durable execution with explicit effect reconciliation | Production-relevant primitives exist; integration is the open work. | Temporal/DBOS/Restate + effect ledger | Do not select engine before FAR fault benchmark. |
| FR-002 | NOW | Layered scientific evidence envelope | Standards are usable now. | PROV/RO-Crate/OpenLineage/in-toto/Sigstore | Build profile and independent verification. |
| FR-003 | NOW | Hybrid retrieval with bounded reranking | Mature engines and methods; workload routing matters. | Lucene/Vespa/sparse+dense+late interaction | Measure recall/latency/cost per corpus. |
| FR-004 | NOW | Capability-scoped Wasm plugin tier | Component/WASI ecosystem is usable but evolving. | Wasmtime/WASI/Extism | Patch gate and compatibility matrix. |
| FR-005 | NOW | Workload identity + external policy/ReBAC | Mature components exist. | SPIFFE/SPIRE, OPA/Cedar, OpenFGA/SpiceDB | Bind final decision to effects. |
| FR-006 | NOW | Reactive/versionable notebooks and executable publishing | Useful current product primitives. | marimo, JupyterLab, Quarto | Separate effects and publication validity. |
| FR-007 | NOW | High-throughput model serving and compiler kernels | Rapid but production-relevant. | vLLM/SGLang/Triton/CUTLASS | Rebenchmark current hardware/models. |
| FR-008 | NOW | Classical solver and diagnostic ecosystems as method plugins | Mature science software should be reused. | PETSc/Kokkos/Stan/ArviZ | Preserve diagnostics and method validity. |
| FR-009 | NEXT | WASI 0.3 and component ecosystem maturation | Async/components may strengthen portable extension boundaries over ~1–2 years. | WASI/Component Model/WIT | Track compatibility/security and avoid premature ABI lock-in. |
| FR-010 | NEXT | Disaggregated prefill/decode and external KV-cache fabrics | Likely important for heterogeneous inference economics. | Dynamo/llm-d/Mooncake/SGLang families | Correctness, eviction and topology benchmarks. |
| FR-011 | NEXT | Measured capability/cost-aware model routing | Routing should use task-specific evidence rather than provider labels. | Evaluation/routing systems | Prospective calibration and drift monitoring. |
| FR-012 | NEXT | Proof-carrying research objects | Standards can be composed into independently verifiable packages. | RO-Crate + attestations + provenance | Define closure/redaction and verifier UX. |
| FR-013 | NEXT | Claim-centered research workspaces | Likely product differentiator beyond chat/notebook metaphors. | Evidence graphs + reactive workbench | User studies and domain pilots. |
| FR-014 | NEXT | Safe autonomous-lab adapters | Command standards and orchestration are ready for controlled pilots. | Bluesky/SiLA/OPC UA/PyLabRobot | Hardware-in-loop safety case. |
| FR-015 | NEXT | Sovereign compute-to-data pilots | Regulated/collaborative science will push execution toward data. | Data spaces + confidential containers | Legal, privacy and attestation validation. |
| FR-016 | NEXT | Incremental provenance and impact analysis | Database/dataflow research is mature enough for bounded products. | Provenance semirings + differential dataflow | Scale and explanation benchmarks. |
| FR-017 | FRONTIER | Typed multi-backend scientific IR | Could unify planning, verification, incremental execution and heterogeneous compute in 2–5 years. | MLIR/QIR/REAPI concepts | Prove semantics across real disciplines before standardizing. |
| FR-018 | FRONTIER | Machine-checkable methodological contracts | Could move validity checks from prose into executable schemas/rules. | Statistical diagnostics, formal methods, metrology | Avoid false formalization and discipline flattening. |
| FR-019 | FRONTIER | Attested confidential science | May enable cross-institution science on restricted data. | Confidential compute + evidence release | Side-channel, reproducibility and governance proof. |
| FR-020 | FRONTIER | Browser-native scientific execution | WebGPU/Wasm may make portable local science viable. | WebGPU/Pyodide/Component Model | Cross-browser determinism and archival replay. |
| FR-021 | FRONTIER | Quantum–classical typed execution | May alter compute orchestration for selected domains. | QIR/OpenQASM/MLIR | Hardware portability and calibration provenance. |
| FR-022 | FRONTIER | Automated replication curricula and research-policy training | Paper replication may become a training/evaluation substrate. | Faraday/Replica and related research | Independent benchmark/judge validation and cost. |
| FR-023 | FRONTIER | Provenance algebra for dynamic evidence | Could support principled conclusion retraction/recalculation. | Semiring provenance + bitemporal assertions | Human-readable semantics and scalability. |
| FR-024 | WATCH | Blueprint-driven autonomous research runtimes | Promising abstraction, early systems. | FAROS | Verify license, complete DAG/execution loop and real science. |
| FR-025 | WATCH | Workspace-as-source-of-truth agent harnesses | Potentially useful product/runtime pattern, young evidence. | AgentScope Java Harness/PURISTA | Security, consistency and long-horizon tasks. |
| FR-026 | WATCH | Literature-to-review discovery cascades | Could allocate expert attention effectively. | FAR paper | Recall/novelty and expert baseline validation. |
| FR-027 | WATCH | General AI scientist systems | Architecture-changing only if independent scientific validity improves. | AI Scientist/Coscientist/AutoLabs families | Reproduction, negative results and human oversight. |

## 28. Low-Confidence Leads Worth Preserving

Low-confidence does not mean worthless. These entries remain searchable without contaminating the verified core.

| ID | PROJECT / ENTITY | DOMAIN | CANONICAL SOURCE | LICENSE | EVIDENCE | WHY PRESERVED | RAW PROVENANCE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ENT-0283 | A-Lab | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_A_AUTONOMOUS_LAB_REFERENCE \| Closed-loop inorganic-materials synthesis laboratory \| PAPER_AND_PUBLIC_DISCUSSION_INSPECTED | C-285; RAW-0393 |
| ENT-0290 | Agentic AI for Autonomous Quantum Sensing | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_FRONTIER_PRIMITIVE \| agent hypothesis plus deterministic-control oracle loop \| PAPER_INSPECTED | C-294; RAW-0548 |
| ENT-0291 | Agentic AI for Particle-Accelerator Experiments | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_ARCHITECTURE_SIGNAL \| plan-first bounded accelerator experiment agent \| PAPER_INSPECTED | C-295; RAW-0548 |
| ENT-0288 | AutoCog | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_FRONTIER_SIGNAL \| closed-loop executable cognitive-theory discovery \| PAPER_INSPECTED | C-292; RAW-0548 |
| ENT-0287 | AutoLabs | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_FRONTIER \| self-correcting protocol-translation multi-agent system \| REPOSITORY_AND_2026_PAPER_INSPECTED | C-291; RAW-0548 |
| ENT-0067 | Browserless Session Persistence | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-060; RAW-0496 |
| ENT-0265 | CausalML | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_CAUSAL_LIBRARY \| Uplift and heterogeneous treatment-effect toolkit \| REPOSITORY_VERIFIED | C-266; RAW-0393 |
| ENT-0282 | Coscientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_PRODUCT_ARCHITECTURAL_REFERENCE \| LLM-driven chemical experiment planning and execution reference \| PAPER_INSPECTED | C-284, C-289; RAW-0393, RAW-0548 |
| ENT-0047 | CRIUgpu | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GPU process checkpoint/restart research implementation \| Paper/repository inspected \| A/B frontier | C-039; RAW-0519 |
| ENT-0007 | Dapr Workflow | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Durable Task + sidecar + 可签名历史 \| CNCF/Dapr / Go \| Apache-2.0 | C-004; RAW-0461 |
| ENT-0082 | Debug Adapter Protocol | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Capability-negotiated editor-debugger protocol \| CC-BY-4.0 specification; implementations vary \| DOCUMENTATION_INSPECTED | C-076; RAW-0465 |
| ENT-0017 | Faraday / Replica | GAP_REPAIR | https://arxiv.org/abs/2608.13331 | PAPER; code/data license UNKNOWN | PAPER_INSPECTED | 27B research-policy model using coding agents as tools on paper-replication tasks; headline result depends on rubric-judge validity. | EXT-009; RAW-0016 |
| ENT-0011 | FAROS | GAP_REPAIR | https://github.com/OpenNSWM-Lab/FAROS | UNKNOWN—revalidate repository | OFFICIAL_DOCS_INSPECTED | Blueprint/capability/profile/provider AutoResearch runtime; release-candidate maturity and incomplete DAG/execution loop. | EXT-006; RAW-0016 |
| ENT-0020 | Find, Attempt, and Recommend (FAR) | GAP_REPAIR | https://arxiv.org/abs/2608.16977 | PAPER; implementation license UNKNOWN | PAPER_INSPECTED | Literature-to-review cascade for scalable mathematical discovery and expert-attention allocation. | EXT-010; RAW-0016 |
| ENT-0041 | Gollem (Fugue Labs) | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-032; RAW-0495 |
| ENT-0045 | Google Agent Executor (AX) | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Reference for Durable execution / external effects | C-036; RAW-0495 |
| ENT-0285 | Google Co-Scientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | S_ARCHITECTURE_SIGNAL \| multi-agent hypothesis tournament and evolution \| PAPER_AND_METHODS_INSPECTED | C-288; RAW-0548 |
| ENT-0081 | Language Server Protocol | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Versioned client-language-server protocol \| CC-BY-4.0 specification; implementations vary \| DOCUMENTATION_INSPECTED | C-075; RAW-0465 |
| ENT-0329 | lm-evaluation-harness | Security / reliability / formal methods / evaluation | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | configurable benchmark harness \| OFFICIAL_REPOSITORY_INSPECTED \| A_REFERENCE | C-335; RAW-0531 |
| ENT-0098 | noWorkflow | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| A_B_PRIMITIVE \| Python execution provenance without workflow rewrite | C-093; RAW-0020 |
| ENT-0046 | NVIDIA CUDA Driver API Checkpoint | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | GPU context checkpoint API \| Official API inspected \| B primitive | C-038; RAW-0519 |
| ENT-0070 | Observable Runtime | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-002 \| A_PRODUCT_REFERENCE \| Demand-driven reactive dataflow notebook runtime | C-063; RAW-0020 |
| ENT-0065 | OpenHands Software Agent SDK | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Composable event-driven agent SDK with persistent conversations \| MIT \| SOURCE_INSPECTED | C-058; RAW-0465 |
| ENT-0457 | OpenQASM | Metrology / sustainability / browser / frontier compute | https://github.com/openqasm/openqasm | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Quantum assembly language and timing/control semantics | C-474; UNKNOWN |
| ENT-0015 | PURISTA AI Harness | GAP_REPAIR | https://github.com/puristajs/harness | MIT | IDENTITY_VERIFIED | Typed, sandboxed, observable TypeScript AI harness; early evidence and low public adoption. | EXT-008; RAW-0016 |
| ENT-0456 | Quantum Intermediate Representation | Metrology / sustainability / browser / frontier compute | https://github.com/qir-alliance/qir-spec | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | LLVM-based quantum/classical interoperability IR | C-473; UNKNOWN |
| ENT-0128 | RobotReviewer | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-004 \| B_EVIDENCE_COMPONENT \| Automated risk-of-bias and RCT evidence extraction | C-123; RAW-0020 |
| ENT-0063 | SAGA workflow-atomic GPU scheduling | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Atomic scheduling across workflow/GPU resources \| Paper inspected \| B frontier | C-055; RAW-0519 |
| ENT-0066 | SWE-agent | Durable execution / external effects | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | Structured agent-computer interface \| MIT \| DOCUMENTATION_INSPECTED | C-059; RAW-0465 |
| ENT-0284 | The AI Scientist | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | B_FRONTIER \| end-to-end computational paper-production loop \| REPOSITORY_AND_PAPER_INSPECTED | C-286; RAW-0548 |
| ENT-0279 | The AI Scientist v2 | Statistics / causal inference / autonomous science | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | A_B_FRONTIER_REFERENCE \| End-to-end machine-learning research agent \| REPOSITORY_LICENSE_AND_PAPER_VERIFIED | C-280, C-287; RAW-0393, RAW-0548 |
| ENT-0451 | WebGPU | Metrology / sustainability / browser / frontier compute | https://github.com/gpuweb/gpuweb | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | Portable browser/native GPU compute API | C-467; UNKNOWN |
| ENT-0091 | Workflow Run RO-Crate | Coding / IDE / notebooks / evidence tooling | UNKNOWN / no authoritative URL preserved | UNKNOWN | PREVIOUS_BATCH_RECORDED | RU-003 \| S_SCIENCE_PROFILE \| Portable workflow-execution research object profile | C-085; RAW-0020 |

### Quarantined malformed raw candidate rows

| RAW ID | RAW NAME | SOURCE ARTIFACT | EVIDENCE | REASON |
| --- | --- | --- | --- | --- |
| C-026 | –C-056), including frontier agent runtimes, effect-ledger systems, browser replay, process/GPU/HPC checkpointing, notebook state time travel, laboratory command protocols and a for | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | PREVIOUS_BATCH_RECORDED | Malformed/duplicate registry row; preserved but excluded from canonical tiering. |
| C-037 | Fugue Labs / Gollem：已核验仓库 fugue-labs/gollem，Go、MIT；它是类型安全 Agent SDK，而非耐久运行时，转入 RU-002 作为 SDK/工具协议候选。 | FAR-Lab_RU-001_Batch-002_Revision-2_Effect-Semantics-and-Continuity.md | PREVIOUS_BATCH_RECORDED | Malformed/duplicate registry row; preserved but excluded from canonical tiering. |
| C-057 | Google Agent Executor (AX)：Apache-2.0，事件日志、single-writer、snapshot 路线有价值；公开预览且 pending resume、suspend/resume 粒度、持久目录所有权仍在演进，定级 AFRONTIER / DEFERPRODUCTION. | FAR-Lab_RU-001_Batch-002_Revision-2_Effect-Semantics-and-Continuity.md | PREVIOUS_BATCH_RECORDED | Malformed/duplicate registry row; preserved but excluded from canonical tiering. |

Promotion rule: a lead advances only after identity, authoritative source, current license/maintenance and decision-relevant architecture are verified. Frontier paper claims additionally require benchmark/judge scrutiny and independent reproduction where consequential.

## 29. Remaining Blind Spots

| ID | BLIND SPOT | WHY IT REMAINS OPEN | DECISION-RELEVANT RESEARCH REQUIRED | CURRENT STATE |
| --- | --- | --- | --- | --- |
| BS-001 | Real hardware laboratory failure corpus | No instrument/robot was executed in this consolidation. | Hardware-in-loop fault injection across disconnect, duplicate command, calibration drift, sample mismatch, emergency stop and partial completion. | SHALLOW; physical-world evidence blocked. |
| BS-002 | Researcher-centered longitudinal product evidence | Architecture patterns were inspected; sustained scientist use was not observed. | Multi-week studies across disciplines comparing current tools and FAR prototypes. | SHALLOW. |
| BS-003 | Human-subject/clinical/regulatory governance | Only preliminary cross-domain signals were included. | Dedicated legal/ethics/quality-system review by jurisdiction and domain. | SHALLOW; do not infer compliance. |
| BS-004 | Wet-lab method validation and laboratory QA | Software/lab-control coverage does not establish wet-lab reproducibility. | Domain pilots with controls, contamination/error models, calibration and independent replication. | SHALLOW. |
| BS-005 | Privacy accounting and federated scientific validity | Confidential/data-space leads are early. | Threat model, differential privacy/federated inference validation and legal data-governance pilots. | LEAD_ONLY. |
| BS-006 | Real energy/carbon measurements | Only synthetic scheduling evidence exists. | Hardware/platform telemetry, regional carbon signals and workload-quality constraints. | SHALLOW. |
| BS-007 | Long-term digital preservation | Package standards were inspected but decade-scale replay was not tested. | Multi-version, offline and independent reconstruction exercises. | MODERATE gap. |
| BS-008 | Scientific visualization perceptual validity | System architecture coverage exceeds HCI/perception evidence. | Controlled studies on uncertainty, misleading encodings and collaborative interpretation. | SHALLOW. |
| BS-009 | Cross-language numerical equivalence | Many solver/runtime ecosystems were mapped but not compared. | Reference problems across CPU/GPU/languages with tolerance and reproducibility policies. | MODERATE gap. |
| BS-010 | Multi-tenant production security | Components were inspected; integrated FAR threat/penetration evidence is absent. | End-to-end threat model, red-team, egress/secret/resource controls and patch process. | MODERATE gap. |
| BS-011 | Workload-specific database/search/storage benchmark | The logical architecture is stronger than the physical selection evidence. | Representative FAR corpus/run/artifact workloads with failure, cost and migration tests. | MODERATE gap. |
| BS-012 | Model-serving correctness under optimization | Performance systems change rapidly and published benchmarks are not enough. | Current hardware/model test matrix including cache poisoning/staleness, quantization and parallelism correctness. | MODERATE gap. |
| BS-013 | Methodological contracts across disciplines | A universal validity schema may be impossible or harmful. | Discipline-specific profiles co-designed with experts; test where common abstractions fail. | FRONTIER uncertainty. |
| BS-014 | Quantum/future-compute practical relevance | Standards exist but FAR workloads are speculative. | Concrete domain mission and multi-provider prototype before architecture commitment. | LEAD_ONLY. |
| BS-015 | License compatibility of the final component mix | Individual licenses were recorded where possible; product-wide compatibility was not adjudicated. | Counsel review of exact versions, deployment model, distribution and copied/vendor code. | OPEN legal obligation. |

### Mandatory second-pass / contrarian / future review log

| PASS | QUESTION / ACTION | DECISION-CHANGING RESULT |
| --- | --- | --- |
| First consolidation pass | Normalized the raw corpus, merged aliases, separated package duplicates, extracted registries and identified evidence ceilings. | Replaced report-count confidence with source/evidence confidence. |
| Gap review by technical continent | Asked what experts in systems, DB, compilers, HPC, security, statistics, metrology, HCI and cyber-physical systems would find missing. | Added build/IR, classical HPC, metrology, product/HCI, lab/robotics, privacy/sovereignty and regulated-science gaps. |
| Contrarian review | Searched for mature non-AI systems and negative evidence that challenge popular agent-framework consensus. | Elevated Nix/Bazel/MLIR/FoundationDB/AiiDA/Arrow/OTP/metrology patterns; rejected monolithic agent ownership and vector-memory truth. |
| Future review | Asked what could obsolete the baseline in 2–5 years. | Added WASI 0.3/components, disaggregated inference, confidential science, browser execution, typed scientific IR, provenance algebra and quantum-classical interfaces. |
| Local saturation check | Compared late searches with existing families. | Stopped where searches mostly mapped to existing families; retained physical lab, regulated science, privacy and future compute as unsaturated. |

### Contradiction and correction log

| ID | CONFLICT | RAW / PRIOR CONDITION | RESOLUTION STATE | RESOLVED CONCLUSION / RESIDUAL UNCERTAINTY |
| --- | --- | --- | --- | --- |
| VC-001 | FoundationDB current version | Raw records and official pages exposed different 7.3.x patch identifiers. | CONFLICTING_EVIDENCE | Record the conflict; revalidate release/tag/package immediately before use. Architecture conclusions do not depend on patch number. |
| VC-002 | Restate open-source status | Some raw notes treated source availability as open source. | RESOLVED | BSL-1.1 with delayed conversion is source-available, not currently OSI open source; legal gate required. |
| VC-003 | Kuzu maintenance | Historical popularity could imply current adoption strength. | RESOLVED | Repository archived in October 2025; retain only as architecture reference. |
| VC-004 | FAROS maturity | Raw report promoted it near architecture-changing status. | RESOLVED WITH RESIDUAL UNCERTAINTY | Project identity and blueprint abstractions verified; release-candidate/incomplete execution-loop evidence keeps it Watch. License must be revalidated. |
| VC-005 | PURISTA AI Harness durability claims | Raw report attached detailed durable-workspace/runtime claims to a young project. | DOWNGRADED | Identity/repository verified, but consequential durability semantics were not established; Watch/identity-level only. |
| VC-006 | Faraday/Replica headline performance | Raw report framed the paper as decisive. | DOWNGRADED | Paper verified; result depends on benchmark construction and rubric judge. Independent replication absent; Watch. |
| VC-007 | Synthetic experiments vs product validation | Some packages contain executed numerical trials. | RESOLVED | Label only EXECUTED_SYNTHETIC_MODEL; no external named project or FAR production path was validated by them. |
| VC-008 | OpenTelemetry as provenance | Several ecosystem narratives blur tracing and evidence. | RESOLVED | Operational telemetry and scientific provenance remain separate semantic authorities. |
| VC-009 | CRDT convergence as correctness | Local-first literature can imply safe shared truth. | RESOLVED | Convergence does not preserve domain invariants; synthetic model reinforced transactional publication boundary. |
| VC-010 | Exactly-once workflow claims | Marketing language can imply end-to-end exactly once. | RESOLVED | Only downstream idempotency/inquiry plus fencing/receipts can close modeled effect ambiguity; otherwise retain UNKNOWN_EFFECT_STATE. |

## 30. Future FAR-Lab Builder Research Obligations

> **This document expands the search space; it does not replace fresh investigation.**

Before any consequential architecture or adoption decision, the future Builder must execute the following chain:

```text
define the actual problem
→ inspect current FAR-Lab reality
→ revisit relevant intelligence records
→ conduct current problem-specific landscape search
→ verify candidate version/license/maintenance
→ inspect architecture, source, issues and security
→ execute important finalists where practical
→ compare current FAR-Lab and strongest alternatives
→ prototype the integration boundary when necessary
→ verify ownership, migration, failure and scientific validity
→ decide, record reversal triggers and preserve evidence
```

### Non-negotiable obligations

| OBLIGATION | REQUIRED EVIDENCE BEFORE ADOPTION |
| --- | --- |
| Problem definition | Must-Win research mission, current failure, user/scientific outcome and success/failure criteria. |
| Current reality inspection | Actual repository/runtime/data/product path—not README or planned architecture. |
| Fresh landscape search | Problem/capability/architecture/failure queries across relevant technical communities. |
| Identity/version/license | Exact repository/spec, release or commit, maintainer, license and deployment-specific legal review. |
| Source and ecosystem inspection | Relevant modules, APIs, extension model, issues, releases, security advisories and migration reports. |
| Comparative execution | Same workload on current FAR and finalists; correctness and failure semantics before performance. |
| Integration proof | One authoritative ownership model for state, data, execution, retries, permissions, evidence and upgrades. |
| Scientific proof | Method validity, uncertainty, provenance, real data/workload and domain-appropriate independent review. |
| Failure proof | Crash, partition, stale owner, cancellation, revocation, corrupted state, cache loss and recovery storm tests. |
| Performance proof | Cold/warm/tail latency, throughput, memory, I/O, cost/energy, quality and operational burden. |
| Security proof | Threat model, capability bypass test, untrusted input/state/plugin tests, egress/secret/resource limits and patch process. |
| Migration/reversal | State/data migration, rollback, compatibility and old-path deletion or explicit coexistence model. |
| Staleness revalidation | Recheck all time-sensitive facts after this research date and before each consequential release. |

### Highest-priority comparative proofs suggested by this baseline

| PROOF | COMPARATORS | FAULT / WORKLOAD MATRIX | DECISION OUTPUT |
| --- | --- | --- | --- |
| Durable runtime | Current FAR checkpoint path vs DBOS vs Temporal; Restate architecture reference | Kill between every stage/effect, duplicate start, worker loss, cancel, approval pause, fan-out, long sleep, history growth and version upgrade. | Control-engine choice and exact ownership boundary. |
| Evidence envelope | Current `.far-proof` vs PROV/RO-Crate/OpenLineage/in-toto/Sigstore composition | Build, redact, tamper, independently verify and reconstruct one real mission package. | Canonical schema and export profile. |
| Plugin isolation | Current child-process sandbox vs Wasmtime/Extism vs microVM where needed | Filesystem/network/clock/random/secret/resource denial, hostile state, escape/advisory and performance tests. | Tiered sandbox design. |
| Research action graph | Current stages vs Bazel/Skyframe/Salsa-inspired prototype | Undeclared dependencies, clean/incremental equivalence, cache poison/loss and remote action execution. | Typed incremental execution architecture. |
| Knowledge/search | Canonical assertion/artifact model + Lucene/sparse/dense/late interaction/graph projections | Scholarly corrections, source disagreement, recall audit, freshness, latency/cost and index rebuild. | Truth schema and retrieval routing policy. |
| Scientific method gate | At least Bayesian, causal and numerical/experimental missions | Assumption capture, diagnostics, uncertainty, sequential decisions, invalid methods and human review. | ValidityAssessment schema and domain profiles. |
| Workbench | Current product vs JupyterLab/Theia/marimo-derived prototypes | Real multi-day researcher missions, interruption/recovery, claim/evidence navigation, collaboration and publication. | Product architecture based on user/scientific outcomes. |
| Lab/robotics | Simulator then harmless hardware adapters | Duplicate command, disconnect, stale state, unit/frame/calibration error, abort and interlock. | Physical executor contract and safety boundary. |

### Final quality-gate state for this baseline

| GATE | STATE | EVIDENCE / RESIDUAL |
| --- | --- | --- |
| Corpus | PASSED | All 551 recursive occurrences and 16 top-level containers have ledger entries; 40 binary/generated artifacts are marked partially readable. |
| Deduplication | PASSED | 369 unique byte contents; 182 duplicate package occurrences separated from independent evidence; 470 canonical entities. |
| Contradictions | PASSED WITH RESIDUALS | Consequential version/license/maturity conflicts logged; unresolved values remain UNKNOWN or CONFLICTING_EVIDENCE. |
| Tier S/A verification | PASSED AT PRE-RESEARCH LEVEL | 51 deep records with primary sources, versions/licenses where supportable, architecture, weaknesses and obligations; no false execution claim. |
| Coverage and gap repair | PASSED FOR DECISION-RELEVANT BASELINE | No strategically important domain left MISSING; physical lab, regulated science, privacy, sustainability and future compute remain shallow/lead-only. |
| Cross-domain / contrarian | PASSED | Mature database, compiler, build, HPC, metrology, formal, HCI and safety concepts materially changed the synthesis. |
| Performance / science / product / failure / frontier | PASSED | Dedicated registries and sections exist; empirical blind spots remain explicit. |
| Provenance and honesty | PASSED | Raw claims, verified facts, inference, hypotheses, evidence ceilings and source IDs remain distinguishable. |

The existence of a Tier S/A candidate in this baseline does not authorize adoption. Better projects released later, missed projects, new architecture families and evidence that reverses these rankings must be welcomed.

## 31. Source & Evidence Index

### 31.1 Current primary-source verification index for Tier S/A

| RECORD | PROJECT / SYNTHESIS | AUTHORITATIVE SOURCE | VERSION / STALENESS NOTE | LICENSE | EVIDENCE | CORPUS PROVENANCE |
| --- | --- | --- | --- | --- | --- | --- |
| S-001 | FAR-Lab Intent–Effect–Evidence Ledger | INTERNAL SYNTHESIS; no external repository | PRE-RESEARCH HYPOTHESIS 2026-08-20 | N/A — architecture hypothesis | DECISION_SYNTHESIS + EXECUTED_SYNTHETIC_MODEL (not production validation) | RAW-0012, RAW-0014, RAW-0039, RAW-0032; C-001..C-063 families. |
| S-002 | Temporal | https://github.com/temporalio/temporal | Server v1.31.2 verified 2026-07-08; TypeScript SDK v1.21.1 verified 2026-07-24; revalidate before use | MIT | SOURCE_INSPECTED + ISSUES_INSPECTED; not EXECUTED/BENCHMARKED in this mission | Candidate IDs: C-001; corpus sources: RAW-0461 |
| S-003 | DBOS Transact (TypeScript) | https://github.com/dbos-inc/dbos-transact-ts | v4.25 verified 2026-07-30; revalidate | MIT | SOURCE_INSPECTED; not EXECUTED/BENCHMARKED | Candidate IDs: C-003; corpus sources: RAW-0461 |
| S-004 | AiiDA | https://github.com/aiidateam/aiida-core | v2.8.1 verified 2026-07-25; revalidate | MIT | OFFICIAL_DOCS_INSPECTED + release/failure notes; source paths partially inspected | Candidate IDs: C-433; corpus sources: WEB_GAP_REPAIR |
| S-005 | Scientific Evidence Interoperability Stack | W3C PROV + RO-Crate + OpenLineage + in-toto/Sigstore | PROV Recommendation 2013; RO-Crate 1.2.0 (1.3 WIP); component versions revalidate | Mixed: specs and implementations differ; component-specific legal review | OFFICIAL_DOCS_INSPECTED / SPEC_INSPECTED; no end-to-end execution | Candidate IDs: C-078, C-082, C-169, C-170, C-171, C-306, C-307; corpus sources: RAW-0020, RAW-0467, RAW-0531 |
| S-006 | Apache Arrow | https://github.com/apache/arrow | 25.0.1 verified 2026-08-10; revalidate | Apache-2.0 | OFFICIAL_DOCS_INSPECTED + repository metadata | Candidate IDs: C-142; corpus sources: RAW-0467 |
| S-007 | Bazel / Skyframe / Remote Execution API | https://github.com/bazelbuild/bazel | 9.2 release line current in August 2026; exact patch revalidate | Apache-2.0 | OFFICIAL_DOCS_INSPECTED + failure/issue evidence; not executed | Candidate IDs: EXT-002, C-102; corpus sources: RAW-0010, RAW-0465 |
| S-008 | MLIR | https://github.com/llvm/llvm-project/tree/main/mlir | LLVM stable 22.1.8 verified 2026-06-16; MLIR ships with LLVM; revalidate | Apache-2.0 WITH LLVM-exception | AUTHORITATIVE_SOURCE_VERIFIED + OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-112; corpus sources: RAW-0466 |
| S-009 | Nix | https://github.com/NixOS/nix | 2.35.x current in July–August 2026; exact patch revalidate | LGPL-2.1 | OFFICIAL_DOCS_INSPECTED; not executed | Candidate IDs: EXT-001; corpus sources: RAW-0010 |
| S-010 | Wasmtime + WASI + WebAssembly Component Model | https://github.com/bytecodealliance/wasmtime | Wasmtime 45.0.0 last verified 2026-05-21; WASI 0.3 released 2026-06-11; revalidate current | Apache-2.0 WITH LLVM-exception; component specifications/licenses revalidate | OFFICIAL_DOCS_INSPECTED + SECURITY_ADVISORIES_INSPECTED; not executed | Candidate IDs: C-115, C-116, C-468, C-469; corpus sources: RAW-0466 |
| S-011 | MCP + ACP Protocol Decomposition | https://modelcontextprotocol.io/specification ; https://github.com/agentclientprotocol/agent-client-protocol | MCP 2026-07-28; ACP wire protocol v1 and artifact v0.13.3 verified 2026-05-22; revalidate SDKs | MCP spec repository MIT; ACP Apache-2.0; SDK/component licenses vary | OFFICIAL_SPEC_INSPECTED + SOURCE_INSPECTED; no FAR integration execution | Candidate IDs: C-071, C-074, C-449; corpus sources: RAW-0020, RAW-0465 |
| S-012 | FoundationDB | https://github.com/apple/foundationdb | CONFLICTING_EVIDENCE: docs show 7.3.79 while repository release material surfaced 7.3.69; revalidate exact supported release | Apache-2.0 | OFFICIAL_DOCS_INSPECTED; version conflict unresolved; not executed | Candidate IDs: C-135, C-396; corpus sources: RAW-0467 |
| S-013 | Hybrid Retrieval Plane | Apache Lucene / Tantivy / Vespa primary sources | Lucene 10.5.1; Tantivy 0.26.1; Vespa rolling release—revalidate deployment | Apache-2.0 / MIT / Apache-2.0 | SOURCE/OFFICIAL_DOCS_INSPECTED; no FAR benchmark | Candidate IDs: C-109, C-157, C-159, C-160, C-161, C-345, C-346; corpus sources: RAW-0020, RAW-0467 |
| S-014 | Scientific Truth / Metrology Plane | QUDT + UCUM + W3C PROV + bitemporal database references | QUDT 3.5.0; UCUM 2.2; specifications revalidate | QUDT CC BY 4.0; UCUM custom terms; component-specific review | OFFICIAL_SPEC_INSPECTED + CORPUS SYNTHESIS; no implementation | Candidate IDs: C-137, C-169, C-463, C-464; corpus sources: RAW-0467 |
| A-001 | Restate | https://github.com/restatedev/restate | v1.7.2 verified 2026-07-06 | BSL-1.1; converts per-version to Apache-2.0 after four years | SOURCE_INSPECTED | Candidate IDs: C-002; corpus sources: RAW-0461 |
| A-002 | RO-Crate | https://www.researchobject.org/ro-crate/ | Recommendation 1.2.0; 1.3 work-in-progress | Apache-2.0 specification | OFFICIAL_SPEC_INSPECTED | Candidate IDs: C-170; corpus sources: RAW-0467 |
| A-003 | OpenLineage | https://github.com/OpenLineage/OpenLineage | Current schema/release revalidate | Apache-2.0 | SOURCE_INSPECTED | Candidate IDs: C-078, C-171; corpus sources: RAW-0020, RAW-0467 |
| A-004 | Sigstore / Rekor / in-toto | https://github.com/sigstore/sigstore ; https://github.com/in-toto/in-toto | Component versions revalidate | Apache-2.0 implementations; component-specific review | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-081, C-082, C-306, C-307, C-308; corpus sources: RAW-0020, RAW-0531 |
| A-005 | Zarr | https://github.com/zarr-developers/zarr-python | v3.3.0 verified 2026-07-30 | MIT | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-149; corpus sources: RAW-0467 |
| A-006 | TensorStore | https://github.com/google/tensorstore | Rolling; exact release UNKNOWN | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | Candidate IDs: EXT-005; corpus sources: WEB_GAP_REPAIR |
| A-007 | OpenAlex / OpenCitations / Crossref | https://openalex.org ; https://opencitations.net ; https://www.crossref.org | Rolling datasets/APIs; snapshot dates must be recorded | Data licenses and terms differ by source | AUTHORITATIVE_PAGE_OR_SPEC_VERIFIED | Candidate IDs: C-118, C-165, C-167, C-168, C-353; corpus sources: RAW-0020, RAW-0467 |
| A-008 | vLLM | https://github.com/vllm-project/vllm | v0.23.0 verified 2026-06-12 | Apache-2.0 | AUTHORITATIVE_DOCS_VERIFIED | Candidate IDs: C-179; corpus sources: RAW-0502 |
| A-009 | SGLang | https://github.com/sgl-project/sglang | v0.5.13 stable verified 2026-06-13; later nightly exists | Apache-2.0 | AUTHORITATIVE_DOCS_VERIFIED | Candidate IDs: C-180; corpus sources: RAW-0502 |
| A-010 | Triton Language | https://github.com/triton-lang/triton | Rolling; exact current release revalidate | MIT | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-203, C-361; corpus sources: RAW-0502 |
| A-011 | Firecracker | https://github.com/firecracker-microvm/firecracker | v1.16.1 verified 2026-07-02 | Apache-2.0 | OFFICIAL_DOCS_INSPECTED + SECURITY_ADVISORIES_INSPECTED | Candidate IDs: C-017; corpus sources: RAW-0461 |
| A-012 | Extism | https://github.com/extism/extism | Current version UNKNOWN; active in 2026 | BSD-3-Clause for main repository; verify SDKs | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-405; corpus sources: WEB_GAP_REPAIR |
| A-013 | SPIFFE / SPIRE | https://github.com/spiffe/spire | SPIRE v1.15.2 verified 2026-07-09 | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-305; corpus sources: RAW-0531 |
| A-014 | Open Policy Agent | https://github.com/open-policy-agent/opa | v1.17.0 verified 2026-05-28 | Apache-2.0 | SOURCE_INSPECTED | Candidate IDs: C-303; corpus sources: RAW-0531 |
| A-015 | Cedar | https://github.com/cedar-policy/cedar | v4.12.0 verified 2026-07-28 | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-304; corpus sources: RAW-0531 |
| A-016 | OpenFGA / SpiceDB | https://github.com/openfga/openfga ; https://github.com/authzed/spicedb | OpenFGA v1.18.1 verified 2026-06-29; SpiceDB current revalidate | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-388, C-389; corpus sources: WEB_GAP_REPAIR |
| A-017 | TLA+ / TLC + Apalache | https://github.com/tlaplus/tlaplus ; https://github.com/apalache-mc/apalache | Apalache v0.58.3 verified 2026-07-09; CLI tools current; Eclipse Toolbox unmaintained | MIT for TLA+; Apalache license revalidate | SOURCE/OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-316, C-391; corpus sources: RAW-0531 |
| A-018 | marimo | https://github.com/marimo-team/marimo | v0.23.15 verified 2026-07-23 | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | Candidate IDs: EXT-004; corpus sources: WEB_GAP_REPAIR |
| A-019 | JupyterLab | https://github.com/jupyterlab/jupyterlab | v4.6.2 verified 2026-07-21 | BSD-3-Clause | OFFICIAL_DOCS_INSPECTED | Candidate IDs: EXT-003; corpus sources: WEB_GAP_REPAIR |
| A-020 | Eclipse Theia | https://github.com/eclipse-theia/theia | v1.74.0 verified 2026-07-31 | EPL-2.0 with GPL-2.0 secondary | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-073; corpus sources: RAW-0465 |
| A-021 | Quarto | https://github.com/quarto-dev/quarto-cli | v1.10.18 stable verified 2026-07-24; 1.11.1 pre-release | MIT for CLI; editor/extension components may use other licenses | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-095, C-420; corpus sources: RAW-0465 |
| A-022 | OpenTelemetry Collector | https://github.com/open-telemetry/opentelemetry-collector | Collector v0.159.0 release schedule verified 2026-08-17; dual distribution versioning revalidate | Apache-2.0 | SOURCE_INSPECTED | Candidate IDs: C-413; corpus sources: WEB_GAP_REPAIR |
| A-023 | Slurm | https://github.com/SchedMD/slurm | 26.05 release verified 2026 | GPL-2.0 | SOURCE_INSPECTED | Candidate IDs: C-367; corpus sources: WEB_GAP_REPAIR |
| A-024 | Flux Framework | https://github.com/flux-framework/flux-core | Current 0.x release line active; exact release revalidate | LGPL-3.0 | SOURCE_INSPECTED | Candidate IDs: C-366; corpus sources: WEB_GAP_REPAIR |
| A-025 | PETSc / TAO | https://github.com/petsc/petsc | v3.25.4 docs verified 2026; revalidate | BSD-2-Clause | SOURCE_INSPECTED | Candidate IDs: C-230, C-372; corpus sources: RAW-0447 |
| A-026 | Kokkos | https://github.com/kokkos/kokkos | v5.2.0 verified 2026-07-24 | BSD-3-Clause | SOURCE_INSPECTED | Candidate IDs: C-225, C-374; corpus sources: RAW-0447 |
| A-027 | Stan | https://github.com/stan-dev/stan | v2.39.0 verified 2026-05-19 | BSD-3-Clause; dependency notices apply | SOURCE_INSPECTED | Candidate IDs: C-256; corpus sources: RAW-0393 |
| A-028 | ArviZ | https://github.com/arviz-devs/arviz | CONFLICTING_EVIDENCE: docs surfaced 1.2.0 while release pages surfaced 1.1.0; revalidate package metadata | Apache-2.0 | SOURCE_INSPECTED; VERSION_CONFLICT | Candidate IDs: C-260; corpus sources: RAW-0393 |
| A-029 | DoWhy | https://github.com/py-why/dowhy | Rolling; official main docs updated 2026-08-03; exact release revalidate | MIT—revalidate exact repository notice | SOURCE_INSPECTED | Candidate IDs: C-264; corpus sources: RAW-0393 |
| A-030 | BoTorch | https://github.com/meta-pytorch/botorch | v0.18.1 verified 2026 | MIT | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-271; corpus sources: RAW-0393 |
| A-031 | Bluesky / Ophyd | https://github.com/bluesky/bluesky | Bluesky v1.15.1 verified 2026-05-06; Ophyd version revalidate | BSD-3-Clause | SOURCE_INSPECTED | Candidate IDs: C-047, C-384, C-385; corpus sources: RAW-0519 |
| A-032 | ROS 2 / MoveIt 2 | https://github.com/ros2/ros2 ; https://github.com/moveit/moveit2 | ROS 2 Lyrical Luth LTS released 2026-05-22; MoveIt distribution version revalidate | Mixed Apache-2.0/BSD-3-Clause packages | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-446, C-447; corpus sources: WEB_GAP_REPAIR |
| A-033 | PyLabRobot / Opentrons / SiLA | https://github.com/PyLabRobot/pylabrobot ; https://github.com/Opentrons/opentrons ; https://sila-standard.com | PyLabRobot 0.2.x and Opentrons robot stack 9.1.1/API 2.29 observed; exact versions revalidate | MIT / Apache-2.0 / standard terms vary | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-049, C-387, C-448; corpus sources: RAW-0519 |
| A-034 | QUDT | https://github.com/qudt/qudt-public-repo | v3.5.0 verified 2026-07-28 | CC BY 4.0 | OFFICIAL_SPEC/REPOSITORY_INSPECTED | Candidate IDs: C-463; corpus sources: WEB_GAP_REPAIR |
| A-035 | UCUM | https://ucum.org | v2.2 verified 2024-06-17; still current in checked source | Custom UCUM terms; legal review required | OFFICIAL_SPEC_INSPECTED | Candidate IDs: C-464; corpus sources: WEB_GAP_REPAIR |
| A-036 | Automerge / Yjs | https://github.com/automerge/automerge ; https://github.com/yjs/yjs | Current releases revalidate | MIT | SOURCE/REPOSITORY_INSPECTED | Candidate IDs: C-397, C-398; corpus sources: WEB_GAP_REPAIR |
| A-037 | DataLad / lakeFS / Dolt | https://github.com/datalad/datalad ; https://github.com/treeverse/lakeFS ; https://github.com/dolthub/dolt | Current releases revalidate | Mixed: MIT/Apache-2.0 and dependencies; component review | OFFICIAL_DOCS_INSPECTED | Candidate IDs: C-096, C-098, C-154, C-156; corpus sources: RAW-0020, RAW-0467 |

### 31.2 Evidence-label interpretation and ceiling

| LEVEL | WHAT IT PROVES | WHAT IT DOES NOT PROVE |
| --- | --- | --- |
| RAW_LEAD | The corpus mentioned a possible entity/claim. | Identity, correctness, currency or suitability. |
| IDENTITY_VERIFIED | Authoritative project/spec/paper identity and purpose were found. | Architecture, license completeness, maintenance or performance. |
| OFFICIAL_DOCS_INSPECTED | Official documentation/specification supports described semantics. | Implementation behavior under FAR workload. |
| ARCHITECTURE / SOURCE_INSPECTED | Relevant design or source paths were inspected. | Successful installation, integration or production reliability. |
| ISSUES_INSPECTED | Known limitations/failures/migrations were examined. | Absence of unknown defects. |
| PAPER_INSPECTED | Paper methods/results were read. | Independent reproduction or benchmark/judge validity. |
| EXECUTED_SYNTHETIC_MODEL | A local abstract contract/numerical model ran. | Named product behavior, production integration or real scientific validity. |
| EXECUTED | The actual candidate/workflow was run in the stated environment. | General performance or production suitability. |
| BENCHMARKED | A defined workload and metrics were measured. | External validity outside that workload. |

### 31.3 Synthetic experiment index

| EXPERIMENT | MODELED MEASURES | CONCLUSION | EVIDENCE CEILING |
| --- | --- | --- | --- |
| capability_revocation | trials=4000; naive_unauthorized_effects=449; final_generation_gate_unauthorized_effects=0 | Dispatch-time authorization is insufficient; final effect gate eliminated stale-authority commits in this model. | EXECUTED_SYNTHETIC_MODEL |
| crdt_semantic_invariant | trials=4000; raw_convergent_but_invalid=1703; escrow_invariant_violations=0 | Replica convergence did not preserve a global stock invariant; escrow rights did in this model. | EXECUTED_SYNTHETIC_MODEL |
| recovery_storm | tasks=600; capacity_per_second=60; naive_peak_admission=600; naive_over_capacity_request_count=679; naive_drain_seconds=3; quota_peak_admission=60; quota_over_capacity_request_count=0; quota_drain_seconds=21 | A recovery quota removed control-plane overload in this model at the cost of a controlled drain time. | EXECUTED_SYNTHETIC_MODEL |
| publication_build_drift | trials=500; naive_distinct_outputs=473; hermetic_distinct_outputs=1 | Pinned toolchain, locale, epoch and data manifest produced one digest; ambient builds drifted. | EXECUTED_SYNTHETIC_MODEL |
| units_and_uncertainty | trials=3000; naive_mean_absolute_unit_error_m=248.736; typed_mean_absolute_unit_error_m=0; mean_independence_minus_covariance_sigma=0.00212629 | Typed conversion removed unit-scale errors; covariance materially changes propagated uncertainty. | EXECUTED_SYNTHETIC_MODEL |
| sequential_peeking | null_experiments=6000; max_sample=200; fixed_horizon_false_positive_rate=0.0511667; repeated_peeking_false_positive_rate=0.240167 | Repeated uncorrected peeking inflated false positives under the null in this simulation. | EXECUTED_SYNTHETIC_MODEL |
| floating_point_reduction | trials=500; median_naive_order_span=0; median_stable_method_span=0.000488281 | Reduction order changed floating-point results; compensated/pairwise methods reduced order sensitivity. | EXECUTED_SYNTHETIC_MODEL |
| tamper_evident_evidence_chain | chains=500; events_per_chain=40; tampering_detected=500; detection_rate=1 | Hash-linked records detected every single-event alteration in this model; plain append-only files would not. | EXECUTED_SYNTHETIC_MODEL |
| metadata_disagreement | entities=3000; conflicting_entities=699; assertions_lost_by_last_write_wins=699; assertions_preserved_by_provenance_model=6000 | Provenance-preserving fusion exposed disagreements that last-write-wins erased. | EXECUTED_SYNTHETIC_MODEL |
| carbon_aware_scheduling | jobs=3000; baseline_gco2=1.08895e+07; deadline_aware_gco2=8.99759e+06; relative_reduction=0.173737; deadline_misses=0 | Deadline-bounded shifting reduced modeled emissions without missed deadlines; real use needs forecast and energy uncertainty. | EXECUTED_SYNTHETIC_MODEL |

**Scope warning from the experiment package:** Synthetic contract and numerical models only; not product, cluster, GPU, browser, quantum or laboratory benchmarks.

### 31.4 Canonical entity registry

Stable `ENT-*` IDs normalize aliases and preserve all raw candidate/source references. `S-COMPONENT` and `A-COMPONENT` entries are represented inside their grouped deep records rather than double-counted as independent choices.

| ENTITY ID | CANONICAL ENTITY | PRELIMINARY TIER | DOMAINS | CANONICAL / PRESERVED URLS | LICENSE EVIDENCE | BEST EVIDENCE | RAW CANDIDATE IDs | RAW SOURCE IDs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ENT-0001 | Nix | S | GAP_REPAIR | https://github.com/NixOS/nix | LGPL-2.1 ; LGPL-2.1-or-later | DOCUMENTATION_INSPECTED | EXT-001 | RAW-0010 |
| ENT-0002 | Temporal | S | Durable execution / external effects | https://github.com/temporalio/temporal | MIT | SOURCE_INSPECTED | C-001 | RAW-0461 |
| ENT-0003 | Bazel / Skyframe / Remote Execution API | S | GAP_REPAIR | https://github.com/bazelbuild/bazel | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | EXT-002 | RAW-0010 |
| ENT-0004 | Restate | A | Durable execution / external effects | https://github.com/restatedev/restate | BSL-1.1; converts per-version to Apache-2.0 after 4 years | SOURCE_INSPECTED | C-002 | RAW-0461 |
| ENT-0005 | DBOS | S | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-003 | RAW-0461 |
| ENT-0006 | JupyterLab | A | GAP_REPAIR | https://github.com/jupyterlab/jupyterlab | BSD-3-Clause | DOCUMENTATION_INSPECTED | EXT-003 | UNKNOWN |
| ENT-0007 | Dapr Workflow | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-004 | RAW-0461 |
| ENT-0008 | marimo | A | GAP_REPAIR | https://github.com/marimo-team/marimo | Apache-2.0 | DOCUMENTATION_INSPECTED | EXT-004 | UNKNOWN |
| ENT-0009 | Inngest | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-005 | RAW-0461 |
| ENT-0010 | TensorStore | A | GAP_REPAIR | https://github.com/google/tensorstore | Apache-2.0 | OFFICIAL_DOCS_INSPECTED | EXT-005 | UNKNOWN |
| ENT-0011 | FAROS | WATCH | GAP_REPAIR | https://github.com/OpenNSWM-Lab/FAROS | UNKNOWN—revalidate repository | OFFICIAL_DOCS_INSPECTED | EXT-006 | RAW-0016 |
| ENT-0012 | Trigger.dev | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-006 | RAW-0461 |
| ENT-0013 | AgentScope Java Harness | B | GAP_REPAIR | https://github.com/agentscope-ai/agentscope-java | Apache-2.0 | SOURCE_INSPECTED | EXT-007 | RAW-0016 |
| ENT-0014 | Hatchet | B | Durable execution / external effects | https://github.com/hatchet-dev/hatchet | MIT/UNKNOWN exact subcomponent mix | DOCUMENTATION_INSPECTED | C-007 | RAW-0461 |
| ENT-0015 | PURISTA AI Harness | WATCH | GAP_REPAIR | https://github.com/puristajs/harness | MIT | IDENTITY_VERIFIED | EXT-008 | RAW-0016 |
| ENT-0016 | Resonate | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-008 | RAW-0461 |
| ENT-0017 | Faraday / Replica | WATCH | GAP_REPAIR | https://arxiv.org/abs/2608.13331 | PAPER; code/data license UNKNOWN | PAPER_INSPECTED | EXT-009 | RAW-0016 |
| ENT-0018 | LangGraph | B | Durable execution / external effects | https://github.com/langchain-ai/langgraph | MIT | DOCUMENTATION_INSPECTED | C-009 | RAW-0461 |
| ENT-0019 | Conductor OSS | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-010 | RAW-0461 |
| ENT-0020 | Find, Attempt, and Recommend (FAR) | WATCH | GAP_REPAIR | https://arxiv.org/abs/2608.16977 | PAPER; implementation license UNKNOWN | PAPER_INSPECTED | EXT-010 | RAW-0016 |
| ENT-0021 | Azure Durable Task | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-011 | RAW-0461 |
| ENT-0022 | Cadence | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-012 | RAW-0461 |
| ENT-0023 | Golem | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-013 | RAW-0461 |
| ENT-0024 | Obelisk | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-014 | RAW-0461 |
| ENT-0025 | Rivet Actors | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-015 | RAW-0461 |
| ENT-0026 | CRIU | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-016 | RAW-0461 |
| ENT-0027 | Firecracker | A | Durable execution / external effects | https://github.com/firecracker-microvm/firecracker | Apache-2.0 | DOCUMENTATION_INSPECTED | C-017 | RAW-0461 |
| ENT-0028 | Crab | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-018 | RAW-0461 |
| ENT-0029 | Erlang/OTP Supervisor | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-019 | RAW-0461 |
| ENT-0030 | Kubernetes Controllers/Jobs | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-020 | RAW-0461 |
| ENT-0031 | AWS Step Functions | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-021 | RAW-0461 |
| ENT-0032 | AWS Lambda Durable Functions | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-022 | RAW-0461 |
| ENT-0033 | AWS Lambda MicroVMs | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-023 | RAW-0461 |
| ENT-0034 | ESAA | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-024 | RAW-0461 |
| ENT-0035 | Avatar Engine | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-025 | RAW-0461 |
| ENT-0036 | Harn | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-027 | RAW-0480 |
| ENT-0037 | DriftQ-Core | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-028 | RAW-0480 |
| ENT-0038 | Polos | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-029 | RAW-0480 |
| ENT-0039 | OpenGeni | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-030 | RAW-0480 |
| ENT-0040 | Assay | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-031 | RAW-0480 |
| ENT-0041 | Gollem (Fugue Labs) | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-032 | RAW-0495 |
| ENT-0042 | agent-ledger | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-033 | RAW-0480 |
| ENT-0043 | etchplan | B | Durable execution / external effects | UNKNOWN | UNKNOWN | SOURCE_INSPECTED | C-034 | RAW-0480 |
| ENT-0044 | Causet | C | Durable execution / external effects | UNKNOWN | UNKNOWN | AUTHORITATIVE_PAGE_VERIFIED / SOURCE_UNAVAILABLE | C-035 | RAW-0480 |
| ENT-0045 | Google Agent Executor (AX) | WATCH | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-036 | RAW-0495 |
| ENT-0046 | NVIDIA CUDA Driver API Checkpoint | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-038 | RAW-0519 |
| ENT-0047 | CRIUgpu | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-039 | RAW-0519 |
| ENT-0048 | DMTCP | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-040 | RAW-0519 |
| ENT-0049 | MANA | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-041 | RAW-0519 |
| ENT-0050 | SCR | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-042 | RAW-0519 |
| ENT-0051 | FTI | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-043 | RAW-0519 |
| ENT-0052 | VeloC | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-044 | RAW-0519 |
| ENT-0053 | Jupyter Enterprise Gateway | C | Coding / IDE / notebooks / evidence tooling, Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-045, C-092 | RAW-0465, RAW-0519 |
| ENT-0054 | Kishu | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-046 | RAW-0519 |
| ENT-0055 | Bluesky / Ophyd | A | Durable execution / external effects, Statistics / causal inference / experiments / laboratory | https://github.com/bluesky/bluesky ; https://github.com/bluesky/ophyd | BSD-3-Clause ; VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | C-047, C-384, C-385 | RAW-0519 |
| ENT-0056 | OPC UA audit/method model | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-048 | RAW-0519 |
| ENT-0057 | SiLA 2 Observable Command | A-COMPONENT | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-049 | RAW-0519 |
| ENT-0058 | thaw | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-050 | RAW-0519 |
| ENT-0059 | Pagerunner | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-051 | RAW-0519 |
| ENT-0060 | OpenComputer durable sessions | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-052 | RAW-0519 |
| ENT-0061 | Ledger | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-053 | RAW-0519 |
| ENT-0062 | REMIT / RESUME CONTRACT | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-054 | RAW-0519 |
| ENT-0063 | SAGA workflow-atomic GPU scheduling | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-055 | RAW-0519 |
| ENT-0064 | Concordia | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-056 | RAW-0519 |
| ENT-0065 | OpenHands Software Agent SDK | WATCH | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-058 | RAW-0465 |
| ENT-0066 | SWE-agent | WATCH | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-059 | RAW-0465 |
| ENT-0067 | Browserless Session Persistence | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-060 | RAW-0496 |
| ENT-0068 | Playwright storageState | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-061 | RAW-0496 |
| ENT-0069 | Object-store Conditional Generation Preconditions | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-062 | RAW-0496 |
| ENT-0070 | Observable Runtime | C | Durable execution / external effects | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-063 | RAW-0020 |
| ENT-0071 | Cline | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-064 | RAW-0465 |
| ENT-0072 | Roo Code | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-065 | RAW-0465 |
| ENT-0073 | OpenAI Codex CLI | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-066 | RAW-0465 |
| ENT-0074 | Gemini CLI | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-067 | RAW-0465 |
| ENT-0075 | Goose | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-068 | RAW-0465 |
| ENT-0077 | OpenCode | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-070 | RAW-0465 |
| ENT-0078 | Agent Client Protocol (ACP) | S-COMPONENT | Coding / IDE / notebooks / evidence tooling | https://github.com/agentclientprotocol/agent-client-protocol | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | C-071, C-074 | RAW-0020, RAW-0465 |
| ENT-0079 | Visual Studio Code | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-072 | RAW-0465 |
| ENT-0080 | Eclipse Theia | A | Coding / IDE / notebooks / evidence tooling | https://github.com/eclipse-theia/theia | EPL-2.0 plus third-party components | DOCUMENTATION_INSPECTED | C-073 | RAW-0465 |
| ENT-0081 | Language Server Protocol | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-075 | RAW-0465 |
| ENT-0082 | Debug Adapter Protocol | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-076 | RAW-0465 |
| ENT-0083 | Tree-sitter | B | Coding / IDE / notebooks / evidence tooling | https://github.com/tree-sitter/tree-sitter | MIT | DOCUMENTATION_INSPECTED | C-077 | RAW-0465 |
| ENT-0084 | OpenLineage | A | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance | https://github.com/OpenLineage/OpenLineage | Apache-2.0 | SOURCE_INSPECTED | C-078, C-171 | RAW-0020, RAW-0467 |
| ENT-0085 | SCIP | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-079 | RAW-0465 |
| ENT-0086 | Glean | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-080 | RAW-0465 |
| ENT-0087 | SLSA | C | Coding / IDE / notebooks / evidence tooling, Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-081, C-308 | RAW-0020, RAW-0531 |
| ENT-0088 | Sigstore / Rekor / cosign | A | Coding / IDE / notebooks / evidence tooling, Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-082, C-306 | RAW-0020, RAW-0531 |
| ENT-0089 | Semgrep | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-083 | RAW-0465 |
| ENT-0090 | FAIR Digital Objects | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-084 | RAW-0020 |
| ENT-0091 | Workflow Run RO-Crate | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-085 | RAW-0020 |
| ENT-0092 | Galaxy | B | Coding / IDE / notebooks / evidence tooling | https://github.com/galaxyproject/galaxy | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-086 | RAW-0020 |
| ENT-0093 | Nextflow Lineage | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-087 | RAW-0020 |
| ENT-0094 | Whole Tale | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-088 | RAW-0020 |
| ENT-0095 | Livebook | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-089 | RAW-0465 |
| ENT-0096 | IPyflow | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-090 | RAW-0465 |
| ENT-0097 | ReproZip | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-091 | RAW-0020 |
| ENT-0098 | noWorkflow | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-093 | RAW-0020 |
| ENT-0099 | CamFlow | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-094 | RAW-0020 |
| ENT-0100 | Quarto | A | Coding / IDE / notebooks / evidence tooling, Publishing / visualization / product / HCI | https://github.com/quarto-dev/quarto-cli | MIT ; VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | C-095, C-420 | RAW-0465 |
| ENT-0101 | lakeFS | A-COMPONENT | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance | https://github.com/treeverse/lakeFS | Apache-2.0 | DOCUMENTATION_INSPECTED | C-096, C-154 | RAW-0020, RAW-0467 |
| ENT-0102 | Pachyderm | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-097 | RAW-0020 |
| ENT-0103 | DataLad | A-COMPONENT | Coding / IDE / notebooks / evidence tooling | https://github.com/datalad/datalad | MIT | DOCUMENTATION_INSPECTED | C-098 | RAW-0020 |
| ENT-0104 | Software Heritage and SWHID | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-099 | RAW-0020 |
| ENT-0105 | CycloneDX 1.7 | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-100 | RAW-0020 |
| ENT-0106 | SPDX 3.0 | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-101 | RAW-0020 |
| ENT-0107 | Remote Execution API | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-102 | RAW-0465 |
| ENT-0108 | C2PA 2.4 | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-103 | RAW-0020 |
| ENT-0109 | OCI Distribution / ORAS | B | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance, Protocols / interoperability / data sovereignty | https://github.com/oras-project/oras | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-104, C-151, C-457 | RAW-0020, RAW-0467 |
| ENT-0110 | W3C Verifiable Credentials 2.0 | B | Coding / IDE / notebooks / evidence tooling, Protocols / interoperability / data sovereignty | https://www.w3.org/TR/vc-data-model-2.0/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-105, C-462 | RAW-0020 |
| ENT-0111 | IETF SCITT | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-106 | RAW-0020 |
| ENT-0112 | Shake | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-107 | RAW-0465 |
| ENT-0113 | Ninja | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-108 | RAW-0465 |
| ENT-0114 | Apache Lucene | S-COMPONENT | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance | https://github.com/apache/lucene | Apache-2.0 | SOURCE_INSPECTED | C-109, C-157 | RAW-0020, RAW-0467 |
| ENT-0115 | Differential Dataflow | B | Coding / IDE / notebooks / evidence tooling | https://github.com/TimelyDataflow/differential-dataflow | MIT | DOCUMENTATION_INSPECTED | C-110 | RAW-0465 |
| ENT-0116 | LLVM | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-111 | RAW-0466 |
| ENT-0117 | MLIR | S | Coding / IDE / notebooks / evidence tooling | https://github.com/llvm/llvm-project/tree/main/mlir | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SOURCE_VERIFIED | C-112 | RAW-0466 |
| ENT-0118 | MLIR Transform Dialect | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-113 | RAW-0466 |
| ENT-0119 | GraalVM / Truffle | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-114 | RAW-0466 |
| ENT-0120 | Wasmtime | S-COMPONENT | Coding / IDE / notebooks / evidence tooling | https://github.com/bytecodealliance/wasmtime | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-115 | RAW-0466 |
| ENT-0121 | WebAssembly Component Model / WIT | S-COMPONENT | Coding / IDE / notebooks / evidence tooling, Metrology / sustainability / browser / frontier compute | https://component-model.bytecodealliance.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-116, C-468 | RAW-0466 |
| ENT-0122 | Semantic Scholar S2AG and S2ORC | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-117 | RAW-0020 |
| ENT-0123 | OpenCitations | A-COMPONENT | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance | https://github.com/opencitations | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PROJECT_VERIFIED | C-118, C-168 | RAW-0020, RAW-0467 |
| ENT-0124 | Apache TVM Relax / TIR | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-119 | RAW-0466 |
| ENT-0125 | CodeQL | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-120 | RAW-0466 |
| ENT-0126 | SKG-IF | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-121 | RAW-0020 |
| ENT-0127 | Clang LibTooling / AST Matchers | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-122 | RAW-0466 |
| ENT-0128 | RobotReviewer | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-123 | RAW-0020 |
| ENT-0129 | Trialstreamer | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-124 | RAW-0020 |
| ENT-0130 | Alive2 | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-125 | RAW-0466 |
| ENT-0131 | Kuzu | C | Coding / IDE / notebooks / evidence tooling, Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-126, C-176 | RAW-0020, RAW-0467 |
| ENT-0132 | ColBERTv2 | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-127 | RAW-0020 |
| ENT-0133 | Spoofax | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-128 | RAW-0466 |
| ENT-0134 | Rascal | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-129 | RAW-0466 |
| ENT-0135 | Cranelift / Winch | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-130 | RAW-0466 |
| ENT-0136 | wasm-tools | C | Coding / IDE / notebooks / evidence tooling | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-131 | RAW-0466 |
| ENT-0137 | PostgreSQL | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-132 | RAW-0467 |
| ENT-0138 | SQLite | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-133 | RAW-0467 |
| ENT-0139 | DuckDB | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-134 | RAW-0467 |
| ENT-0140 | FoundationDB | S | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-135 | RAW-0467 |
| ENT-0141 | RocksDB | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-136 | RAW-0467 |
| ENT-0142 | XTDB | S-COMPONENT | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-137 | RAW-0467 |
| ENT-0143 | Materialize | B | Data / search / knowledge / provenance | https://github.com/MaterializeInc/materialize | BSL-1.1 converting to Apache-2.0 after 4 years | DOCUMENTATION_INSPECTED | C-138 | RAW-0467 |
| ENT-0144 | Feldera | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-139 | RAW-0467 |
| ENT-0145 | RisingWave | B | Data / search / knowledge / provenance | https://github.com/risingwavelabs/risingwave | Apache-2.0 | DOCUMENTATION_INSPECTED | C-140 | RAW-0467 |
| ENT-0146 | ClickHouse | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-141 | RAW-0467 |
| ENT-0147 | Apache Arrow | S | Data / search / knowledge / provenance | https://github.com/apache/arrow | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-142 | RAW-0467 |
| ENT-0148 | Apache Parquet | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-143 | RAW-0467 |
| ENT-0149 | Apache Iceberg | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-144 | RAW-0467 |
| ENT-0150 | Delta Lake | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-145 | RAW-0467 |
| ENT-0151 | Apache Hudi | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-146 | RAW-0467 |
| ENT-0152 | Lance | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-147 | RAW-0467 |
| ENT-0153 | TileDB | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-148 | RAW-0467 |
| ENT-0154 | Zarr | A | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-149 | RAW-0467 |
| ENT-0155 | Git object database and packfiles | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-150 | RAW-0467 |
| ENT-0156 | ORAS | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-152 | RAW-0467 |
| ENT-0157 | IPFS CID, IPLD and trustless gateways | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-153 | RAW-0467 |
| ENT-0158 | DVC | B | Data / search / knowledge / provenance | https://github.com/iterative/dvc | Apache-2.0 | DOCUMENTATION_INSPECTED | C-155 | RAW-0467 |
| ENT-0159 | Dolt | A-COMPONENT | Data / search / knowledge / provenance | https://github.com/dolthub/dolt | Apache-2.0 | DOCUMENTATION_INSPECTED | C-156 | RAW-0467 |
| ENT-0160 | OpenSearch | C | Data / search / knowledge / provenance | https://github.com/opensearch-project/OpenSearch | Apache-2.0 | REPOSITORY_METADATA_VERIFIED | C-158 | RAW-0467 |
| ENT-0161 | Vespa | S-COMPONENT | Data / search / knowledge / provenance | https://github.com/vespa-engine/vespa | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-159 | RAW-0467 |
| ENT-0162 | Tantivy | S-COMPONENT | Data / search / knowledge / provenance | https://github.com/quickwit-oss/tantivy | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-160 | RAW-0467 |
| ENT-0163 | Quickwit | B | Data / search / knowledge / provenance | https://github.com/quickwit-oss/quickwit | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-161 | RAW-0467 |
| ENT-0164 | pgvector | B | Data / search / knowledge / provenance | https://github.com/pgvector/pgvector | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-162 | RAW-0467 |
| ENT-0165 | Qdrant | B | Data / search / knowledge / provenance | https://github.com/qdrant/qdrant | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-163 | RAW-0467 |
| ENT-0166 | Milvus | B | Data / search / knowledge / provenance | https://github.com/milvus-io/milvus | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-164 | RAW-0467 |
| ENT-0167 | OpenAlex | A-COMPONENT | Data / search / knowledge / provenance | https://github.com/ourresearch/openalex-guts | Mixed; data/API terms plus public pipeline code ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-165 | RAW-0467 |
| ENT-0168 | Semantic Scholar Academic Graph | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-166 | RAW-0467 |
| ENT-0169 | Crossref Metadata | A-COMPONENT | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-167 | RAW-0467 |
| ENT-0170 | W3C PROV | B | Data / search / knowledge / provenance | https://www.w3.org/TR/prov-overview/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-169 | RAW-0467 |
| ENT-0171 | RO-Crate | A | Data / search / knowledge / provenance | https://www.researchobject.org/ro-crate/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-170 | RAW-0467 |
| ENT-0172 | Marquez | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-172 | RAW-0467 |
| ENT-0173 | DataHub | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-173 | RAW-0467 |
| ENT-0174 | Apache Jena and TDB2 | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-174 | RAW-0467 |
| ENT-0175 | Oxigraph | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-175 | RAW-0467 |
| ENT-0176 | CozoDB | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-177 | RAW-0467 |
| ENT-0177 | Eclipse RDF4J | C | Data / search / knowledge / provenance | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-178 | RAW-0467 |
| ENT-0178 | vLLM | A | Model serving / GPU / inference | https://github.com/vllm-project/vllm | Apache-2.0 | AUTHORITATIVE_DOCS_VERIFIED | C-179 | RAW-0502 |
| ENT-0179 | SGLang | A | Model serving / GPU / inference | https://github.com/sgl-project/sglang | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_DOCS_VERIFIED | C-180 | RAW-0502 |
| ENT-0180 | TensorRT-LLM | B | Model serving / GPU / inference | https://github.com/NVIDIA/TensorRT-LLM | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_DOCS_VERIFIED | C-181 | RAW-0502 |
| ENT-0181 | Text Generation Inference | B | Model serving / GPU / inference | https://github.com/huggingface/text-generation-inference | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-182 | RAW-0502 |
| ENT-0182 | llama.cpp | B | Model serving / GPU / inference | https://github.com/ggml-org/llama.cpp | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-183 | RAW-0502 |
| ENT-0183 | MLC-LLM | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-184 | RAW-0502 |
| ENT-0184 | LMDeploy | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-185 | RAW-0502 |
| ENT-0185 | LightLLM | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-186 | RAW-0502 |
| ENT-0186 | NVIDIA Dynamo | B | Model serving / GPU / inference | https://github.com/ai-dynamo/dynamo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-187 | RAW-0502 |
| ENT-0187 | llm-d | B | Model serving / GPU / inference | https://github.com/llm-d/llm-d | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-188 | RAW-0502 |
| ENT-0188 | DistServe | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-189 | RAW-0502 |
| ENT-0189 | Mooncake | B | Model serving / GPU / inference | https://github.com/kvcache-ai/Mooncake | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-190 | RAW-0502 |
| ENT-0190 | LMCache | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-191 | RAW-0502 |
| ENT-0191 | KServe | B | Model serving / GPU / inference | https://github.com/kserve/kserve | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-192 | RAW-0502 |
| ENT-0192 | Ray Serve | B | Model serving / GPU / inference | https://github.com/ray-project/ray | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-193 | RAW-0502 |
| ENT-0193 | NVIDIA Triton Inference Server | B | Model serving / GPU / inference | https://github.com/triton-inference-server/server | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_DOCS_VERIFIED | C-194 | RAW-0502 |
| ENT-0194 | BentoML | B | Model serving / GPU / inference | https://github.com/bentoml/BentoML | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-195 | RAW-0502 |
| ENT-0195 | LiteLLM | B | Model serving / GPU / inference | https://github.com/BerriAI/litellm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-196 | RAW-0502 |
| ENT-0196 | Envoy AI Gateway | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-197 | RAW-0502 |
| ENT-0197 | Gateway API Inference Extension | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-198 | RAW-0502 |
| ENT-0198 | RouteLLM | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-199 | RAW-0502 |
| ENT-0199 | TensorZero | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-200 | RAW-0502 |
| ENT-0200 | FlashAttention | B | Model serving / GPU / inference | https://github.com/Dao-AILab/flash-attention | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-201 | RAW-0502 |
| ENT-0201 | FlashInfer | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-202 | RAW-0502 |
| ENT-0202 | Triton Language | A | Model serving / GPU / compiler, Model serving / GPU / inference | https://github.com/triton-lang/triton | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-203, C-361 | RAW-0502 |
| ENT-0203 | CUTLASS | B | Model serving / GPU / inference | https://github.com/NVIDIA/cutlass | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-204 | RAW-0502 |
| ENT-0204 | DeepGEMM | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-205 | RAW-0502 |
| ENT-0205 | NIXL | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-206 | RAW-0502 |
| ENT-0206 | NCCL | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-207 | RAW-0502 |
| ENT-0207 | safetensors | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-208 | RAW-0502 |
| ENT-0208 | LLM Compressor | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-209 | RAW-0502 |
| ENT-0209 | TorchAO | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-210 | RAW-0502 |
| ENT-0210 | GPTQModel | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-211 | RAW-0502 |
| ENT-0211 | GGUF / ggml | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-212 | RAW-0502 |
| ENT-0212 | OpenTelemetry GenAI semantic conventions | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-213 | RAW-0502 |
| ENT-0213 | DCGM Exporter | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-214 | RAW-0502 |
| ENT-0214 | MLPerf Inference / AIPerf / Prism | C | Model serving / GPU / inference | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-215 | RAW-0502 |
| ENT-0215 | Open MPI / ULFM | B | HPC / numerical computing / optimization | https://github.com/open-mpi/ompi | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-216, C-371 | RAW-0447 |
| ENT-0216 | MPICH | B | HPC / numerical computing / optimization | https://github.com/pmodels/mpich | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-217 | RAW-0447 |
| ENT-0217 | UCX | B | HPC / numerical computing / optimization | https://github.com/openucx/ucx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-218 | RAW-0447 |
| ENT-0218 | libfabric | B | HPC / numerical computing / optimization | https://github.com/ofiwg/libfabric | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-219 | RAW-0447 |
| ENT-0219 | GASNet-EX | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-220 | RAW-0447 |
| ENT-0220 | Legion and Realm | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-221 | RAW-0447 |
| ENT-0221 | StarPU | B | HPC / numerical computing / optimization | https://github.com/starpu-runtime/starpu | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-222 | RAW-0447 |
| ENT-0222 | HPX | B | HPC / numerical computing / optimization | https://github.com/TheHPXProject/hpx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-223 | RAW-0447 |
| ENT-0223 | PaRSEC | B | HPC / numerical computing / optimization | https://github.com/ICLDisco/parsec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-224 | RAW-0447 |
| ENT-0224 | Kokkos | A | HPC / numerical computing / optimization | https://github.com/kokkos/kokkos | BSD-3-Clause | SOURCE_INSPECTED | C-225, C-374 | RAW-0447 |
| ENT-0225 | RAJA | B | HPC / numerical computing / optimization | https://github.com/llnl/RAJA | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-226 | RAW-0447 |
| ENT-0226 | AdaptiveCpp | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-227 | RAW-0447 |
| ENT-0227 | OpenMP 6.0 | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-228 | RAW-0447 |
| ENT-0228 | Chapel | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-229 | RAW-0447 |
| ENT-0229 | PETSc / TAO | A | HPC / numerical computing / optimization | https://github.com/petsc/petsc | BSD-2-Clause | SOURCE_INSPECTED | C-230, C-372 | RAW-0447 |
| ENT-0230 | Trilinos | B | HPC / numerical computing / optimization | https://github.com/trilinos/Trilinos | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-231 | RAW-0447 |
| ENT-0231 | SUNDIALS | B | HPC / numerical computing / optimization | https://github.com/llnl/sundials | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-232 | RAW-0447 |
| ENT-0232 | SuiteSparse | B | HPC / numerical computing / optimization | https://github.com/DrTimothyAldenDavis/SuiteSparse | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-233 | RAW-0447 |
| ENT-0233 | Ginkgo | B | HPC / numerical computing / optimization | https://github.com/ginkgo-project/ginkgo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-234 | RAW-0447 |
| ENT-0234 | MFEM | B | HPC / numerical computing / optimization | https://github.com/mfem/mfem | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-235 | RAW-0447 |
| ENT-0235 | FEniCSx | B | HPC / numerical computing / optimization | https://github.com/FEniCS/dolfinx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-236 | RAW-0447 |
| ENT-0236 | Firedrake | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-237 | RAW-0447 |
| ENT-0237 | deal.II | B | HPC / numerical computing / optimization | https://github.com/dealii/dealii | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-238 | RAW-0447 |
| ENT-0238 | AMReX | B | HPC / numerical computing / optimization | https://github.com/AMReX-Codes/amrex | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-239 | RAW-0447 |
| ENT-0239 | DifferentialEquations.jl / SciML | B | HPC / numerical computing / optimization | https://github.com/SciML/DifferentialEquations.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-240, C-379 | RAW-0447 |
| ENT-0240 | JAX | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-241 | RAW-0447 |
| ENT-0241 | Enzyme | B | HPC / numerical computing / optimization | https://github.com/EnzymeAD/Enzyme | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-242 | RAW-0447 |
| ENT-0242 | CasADi | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-243 | RAW-0447 |
| ENT-0243 | Ipopt | B | HPC / numerical computing / optimization | https://github.com/coin-or/Ipopt | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-244 | RAW-0447 |
| ENT-0244 | HiGHS | B | HPC / numerical computing / optimization | https://github.com/ERGO-Code/HiGHS | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-245 | RAW-0447 |
| ENT-0245 | JuMP and MathOptInterface | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-246 | RAW-0447 |
| ENT-0246 | DAKOTA | B | HPC / numerical computing / optimization | https://github.com/snl-dakota/dakota | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-247 | RAW-0447 |
| ENT-0247 | OpenTURNS | B | HPC / numerical computing / optimization | https://github.com/openturns/openturns | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-248 | RAW-0447 |
| ENT-0248 | ReproBLAS | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-249 | RAW-0447 |
| ENT-0249 | ExBLAS | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-250 | RAW-0447 |
| ENT-0250 | Random123 | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-251 | RAW-0447 |
| ENT-0251 | Verificarlo | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-252 | RAW-0447 |
| ENT-0252 | Herbgrind | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-253 | RAW-0447 |
| ENT-0253 | ADIOS2 | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-254 | RAW-0447 |
| ENT-0254 | HDF5 | C | HPC / numerical computing / optimization | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-255 | RAW-0447 |
| ENT-0255 | Stan | A | Statistics / causal inference / autonomous science | https://github.com/stan-dev/stan | BSD-3-Clause | SOURCE_INSPECTED | C-256 | RAW-0393 |
| ENT-0256 | PyMC | B | Statistics / causal inference / autonomous science | https://github.com/pymc-devs/pymc | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-257 | RAW-0393 |
| ENT-0257 | NumPyro | B | Statistics / causal inference / autonomous science | https://github.com/pyro-ppl/numpyro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-258 | RAW-0393 |
| ENT-0258 | Turing.jl | B | Statistics / causal inference / autonomous science | https://github.com/TuringLang/Turing.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-259 | RAW-0393 |
| ENT-0259 | ArviZ | A | Statistics / causal inference / autonomous science | https://github.com/arviz-devs/arviz | Apache-2.0 | SOURCE_INSPECTED | C-260 | RAW-0393 |
| ENT-0260 | Pyro | B | Statistics / causal inference / autonomous science | https://github.com/pyro-ppl/pyro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-261 | RAW-0393 |
| ENT-0261 | TensorFlow Probability | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-262 | RAW-0393 |
| ENT-0262 | statsmodels | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-263, C-283 | RAW-0393, RAW-0548 |
| ENT-0263 | DoWhy | A | Statistics / causal inference / autonomous science | https://github.com/py-why/dowhy | MIT | SOURCE_INSPECTED | C-264 | RAW-0393 |
| ENT-0264 | EconML | B | Statistics / causal inference / autonomous science | https://github.com/py-why/EconML | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-265 | RAW-0393 |
| ENT-0265 | CausalML | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-266 | RAW-0393 |
| ENT-0266 | Tigramite | B | Statistics / causal inference / autonomous science | https://github.com/jakobrunge/tigramite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-267 | RAW-0393 |
| ENT-0267 | causal-learn | B | Statistics / causal inference / autonomous science | https://github.com/py-why/causal-learn | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-268 | RAW-0393 |
| ENT-0268 | pgmpy | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-269 | RAW-0393 |
| ENT-0269 | Tetrad | B | Statistics / causal inference / autonomous science | https://github.com/cmu-phil/tetrad | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-270 | RAW-0393 |
| ENT-0270 | BoTorch | A | Statistics / causal inference / autonomous science | https://github.com/meta-pytorch/botorch ; https://github.com/pytorch/botorch | MIT ; VERIFY_BEFORE_ADOPTION | ISSUES_INSPECTED | C-271 | RAW-0393 |
| ENT-0271 | Ax | B | Statistics / causal inference / autonomous science | https://github.com/facebook/Ax | MIT ; VERIFY_BEFORE_ADOPTION | ISSUES_INSPECTED | C-272 | RAW-0393 |
| ENT-0272 | Optuna | B | Statistics / causal inference / autonomous science | https://github.com/optuna/optuna | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-273 | RAW-0393 |
| ENT-0273 | SMAC3 | B | Statistics / causal inference / autonomous science | https://github.com/automl/SMAC3 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-274 | RAW-0393 |
| ENT-0274 | Nevergrad | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-275 | RAW-0393 |
| ENT-0275 | SALib | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-276 | RAW-0393 |
| ENT-0276 | safestats | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-277 | RAW-0548 |
| ENT-0277 | MAPIE | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-278 | RAW-0393 |
| ENT-0278 | River | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-279 | RAW-0393 |
| ENT-0279 | The AI Scientist v2 | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-280, C-287 | RAW-0393, RAW-0548 |
| ENT-0280 | FutureHouse Robin | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-281 | RAW-0393 |
| ENT-0281 | FutureHouse Aviary | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-282 | RAW-0393 |
| ENT-0282 | Coscientist | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-284, C-289 | RAW-0393, RAW-0548 |
| ENT-0283 | A-Lab | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-285 | RAW-0393 |
| ENT-0284 | The AI Scientist | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-286 | RAW-0548 |
| ENT-0285 | Google Co-Scientist | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-288 | RAW-0548 |
| ENT-0286 | BlackJAX | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-290 | RAW-0393 |
| ENT-0287 | AutoLabs | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-291 | RAW-0548 |
| ENT-0288 | AutoCog | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-292 | RAW-0548 |
| ENT-0289 | AHOIS | C | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-293 | RAW-0548 |
| ENT-0290 | Agentic AI for Autonomous Quantum Sensing | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-294 | RAW-0548 |
| ENT-0291 | Agentic AI for Particle-Accelerator Experiments | WATCH | Statistics / causal inference / autonomous science | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-295 | RAW-0548 |
| ENT-0292 | gVisor | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-296 | RAW-0531 |
| ENT-0293 | Kata Containers | B | Security / reliability / formal methods / evaluation | https://github.com/kata-containers/kata-containers | Apache-2.0 | DOCUMENTATION_INSPECTED | C-297 | RAW-0531 |
| ENT-0294 | bubblewrap | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-298 | RAW-0531 |
| ENT-0295 | nsjail | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-299 | RAW-0531 |
| ENT-0296 | Landlock | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-300 | RAW-0531 |
| ENT-0297 | seL4 | B | Security / reliability / formal methods / evaluation | https://github.com/seL4/seL4 | MIXED_COMPONENT_LICENSES | SOURCE_INSPECTED | C-301 | RAW-0531 |
| ENT-0298 | CHERI / CHERIoT | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-302 | RAW-0531 |
| ENT-0299 | Open Policy Agent | A | Security / reliability / formal methods / evaluation | https://github.com/open-policy-agent/opa | Apache-2.0 | SOURCE_INSPECTED | C-303 | RAW-0531 |
| ENT-0300 | Cedar | A | Security / reliability / formal methods / evaluation | https://github.com/cedar-policy/cedar | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-304 | RAW-0531 |
| ENT-0301 | SPIFFE / SPIRE | A | Security / reliability / formal methods / evaluation | https://github.com/spiffe/spire | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-305 | RAW-0531 |
| ENT-0302 | in-toto | A | Security / reliability / formal methods / evaluation | https://github.com/in-toto/in-toto | Apache-2.0 | DOCUMENTATION_INSPECTED | C-307 | RAW-0531 |
| ENT-0303 | The Update Framework | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-309 | RAW-0531 |
| ENT-0304 | Confidential Containers | B | Security / reliability / formal methods / evaluation | https://github.com/confidential-containers/confidential-containers | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-310 | RAW-0531 |
| ENT-0305 | Gramine | B | Security / reliability / formal methods / evaluation | https://github.com/gramineproject/gramine | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-311 | RAW-0531 |
| ENT-0306 | Veraison | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-312 | RAW-0531 |
| ENT-0307 | Intel TDX | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-313 | RAW-0531 |
| ENT-0308 | AMD SEV-SNP | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-314 | RAW-0531 |
| ENT-0309 | TLA+ / TLC | A-COMPONENT | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-315 | RAW-0531 |
| ENT-0310 | Apalache | A-COMPONENT | Security / reliability / formal methods / evaluation | https://github.com/apalache-mc/apalache | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-316 | RAW-0531 |
| ENT-0311 | Alloy Analyzer | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-317 | RAW-0531 |
| ENT-0312 | Dafny | B | Security / reliability / formal methods / evaluation | https://github.com/dafny-lang/dafny | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-318 | RAW-0531 |
| ENT-0313 | Lean 4 | B | Security / reliability / formal methods / evaluation | https://github.com/leanprover/lean4 | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-319 | RAW-0531 |
| ENT-0314 | Rocq Prover | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-320 | RAW-0531 |
| ENT-0315 | Isabelle | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-321 | RAW-0531 |
| ENT-0316 | Kani Rust Verifier | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-322 | RAW-0531 |
| ENT-0317 | CBMC | B | Security / reliability / formal methods / evaluation | https://github.com/diffblue/cbmc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-323 | RAW-0531 |
| ENT-0318 | AFL++ | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-324 | RAW-0531 |
| ENT-0319 | libFuzzer | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-325 | RAW-0531 |
| ENT-0320 | OSS-Fuzz / ClusterFuzz | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-326 | RAW-0531 |
| ENT-0321 | Hypothesis | B | Security / reliability / formal methods / evaluation | https://github.com/HypothesisWorks/hypothesis | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-327 | RAW-0531 |
| ENT-0322 | QuickCheck | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-328 | RAW-0531 |
| ENT-0323 | Jepsen | B | Security / reliability / formal methods / evaluation | https://github.com/jepsen-io/jepsen | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-329 | RAW-0531 |
| ENT-0324 | Chaos Mesh | B | Security / reliability / formal methods / evaluation | https://github.com/chaos-mesh/chaos-mesh | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-330 | RAW-0531 |
| ENT-0325 | LitmusChaos | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-331 | RAW-0531 |
| ENT-0326 | Antithesis | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-332 | RAW-0531 |
| ENT-0327 | NIST AI Risk Management Framework | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-333 | RAW-0531 |
| ENT-0328 | Inspect AI | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-334 | RAW-0531 |
| ENT-0329 | lm-evaluation-harness | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-335 | RAW-0531 |
| ENT-0330 | HELM | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-336 | RAW-0531 |
| ENT-0331 | OpenAI Evals | C | Security / reliability / formal methods / evaluation | UNKNOWN | UNKNOWN | PREVIOUS_BATCH_RECORDED | C-337 | RAW-0531 |
| ENT-0332 | Zoekt | B | Search / scholarly knowledge / retrieval | https://github.com/sourcegraph/zoekt | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-338 | UNKNOWN |
| ENT-0333 | ParadeDB | B | Search / scholarly knowledge / retrieval | https://github.com/paradedb/paradedb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-339 | UNKNOWN |
| ENT-0334 | Solr | B | Search / scholarly knowledge / retrieval | https://github.com/apache/solr | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-340 | UNKNOWN |
| ENT-0335 | Meilisearch | B | Search / scholarly knowledge / retrieval | https://github.com/meilisearch/meilisearch | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-341 | UNKNOWN |
| ENT-0336 | Typesense | B | Search / scholarly knowledge / retrieval | https://github.com/typesense/typesense | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-342 | UNKNOWN |
| ENT-0337 | Weaviate | B | Search / scholarly knowledge / retrieval | https://github.com/weaviate/weaviate | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-343 | UNKNOWN |
| ENT-0338 | LanceDB | B | Search / scholarly knowledge / retrieval | https://github.com/lancedb/lancedb | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-344 | UNKNOWN |
| ENT-0339 | ColBERT | B | Search / scholarly knowledge / retrieval | https://github.com/stanford-futuredata/ColBERT | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-345 | UNKNOWN |
| ENT-0340 | SPLADE | B | Search / scholarly knowledge / retrieval | https://github.com/naver/splade | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-346 | UNKNOWN |
| ENT-0341 | BEIR | B | Search / scholarly knowledge / retrieval | https://github.com/beir-cellar/beir | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-347 | UNKNOWN |
| ENT-0342 | PyTerrier | B | Search / scholarly knowledge / retrieval | https://github.com/terrier-org/pyterrier | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-348 | UNKNOWN |
| ENT-0343 | Anserini | B | Search / scholarly knowledge / retrieval | https://github.com/castorini/anserini | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-349 | UNKNOWN |
| ENT-0344 | GROBID | B | Search / scholarly knowledge / retrieval | https://github.com/kermitt2/grobid | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-350 | UNKNOWN |
| ENT-0345 | OpenAIRE Research Graph | B | Search / scholarly knowledge / retrieval | https://graph.openaire.eu | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | C-351 | UNKNOWN |
| ENT-0346 | Europe PMC | B | Search / scholarly knowledge / retrieval | https://europepmc.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | C-352 | UNKNOWN |
| ENT-0347 | Crossref | A-COMPONENT | Search / scholarly knowledge / retrieval | https://www.crossref.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | C-353 | UNKNOWN |
| ENT-0348 | DataCite | B | Search / scholarly knowledge / retrieval | https://datacite.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | C-354 | UNKNOWN |
| ENT-0349 | ORCID | B | Search / scholarly knowledge / retrieval | https://orcid.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_PAGE_VERIFIED | C-355 | UNKNOWN |
| ENT-0350 | ASReview | B | Search / scholarly knowledge / retrieval | https://github.com/asreview/asreview | Apache-2.0 | SOURCE_INSPECTED | C-356 | UNKNOWN |
| ENT-0351 | Ollama | B | Model serving / GPU / compiler | https://github.com/ollama/ollama | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-357 | UNKNOWN |
| ENT-0352 | DeepSpeed | B | Model serving / GPU / compiler | https://github.com/deepspeedai/DeepSpeed | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-358 | UNKNOWN |
| ENT-0353 | Megatron-LM | B | Model serving / GPU / compiler | https://github.com/NVIDIA/Megatron-LM | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-359 | UNKNOWN |
| ENT-0354 | xFormers | B | Model serving / GPU / compiler | https://github.com/facebookresearch/xformers | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-360 | UNKNOWN |
| ENT-0355 | Apache TVM | B | Model serving / GPU / compiler | https://github.com/apache/tvm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-362 | UNKNOWN |
| ENT-0356 | IREE | B | Model serving / GPU / compiler | https://github.com/iree-org/iree | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-363 | UNKNOWN |
| ENT-0357 | OpenXLA | B | Model serving / GPU / compiler | https://github.com/openxla/xla | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-364 | UNKNOWN |
| ENT-0358 | PyTorch Inductor | B | Model serving / GPU / compiler | https://github.com/pytorch/pytorch | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-365 | UNKNOWN |
| ENT-0359 | Flux Framework | A | HPC / numerical computing / optimization | https://github.com/flux-framework/flux-core | LGPL-3.0-or-later ; LGPL-3.0/UNKNOWN exact repo license details | SOURCE_INSPECTED | C-366 | UNKNOWN |
| ENT-0360 | Slurm | A | HPC / numerical computing / optimization | https://github.com/SchedMD/slurm | GPL-2.0-or-later | SOURCE_INSPECTED | C-367 | UNKNOWN |
| ENT-0361 | Legion | B | HPC / numerical computing / optimization | https://github.com/StanfordLegion/legion | VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | C-368 | UNKNOWN |
| ENT-0362 | Charm++ | B | HPC / numerical computing / optimization | https://github.com/charmplusplus/charm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-369 | UNKNOWN |
| ENT-0363 | Taskflow | B | HPC / numerical computing / optimization | https://github.com/taskflow/taskflow | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-370 | UNKNOWN |
| ENT-0364 | hypre | B | HPC / numerical computing / optimization | https://github.com/hypre-space/hypre | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-373 | UNKNOWN |
| ENT-0365 | MOOSE | B | HPC / numerical computing / optimization | https://github.com/idaholab/moose | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-375 | UNKNOWN |
| ENT-0366 | OpenFOAM | B | HPC / numerical computing / optimization | https://github.com/OpenFOAM/OpenFOAM-dev | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-376 | UNKNOWN |
| ENT-0367 | LAMMPS | B | HPC / numerical computing / optimization | https://github.com/lammps/lammps | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-377 | UNKNOWN |
| ENT-0368 | WarpX | B | HPC / numerical computing / optimization | https://github.com/BLAST-WarpX/warpx | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-378 | UNKNOWN |
| ENT-0369 | JuMP | B | HPC / numerical computing / optimization | https://github.com/jump-dev/JuMP.jl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-380 | UNKNOWN |
| ENT-0370 | Pyomo | B | HPC / numerical computing / optimization | https://github.com/Pyomo/pyomo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-381 | UNKNOWN |
| ENT-0371 | OR-Tools | B | HPC / numerical computing / optimization | https://github.com/google/or-tools | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-382 | UNKNOWN |
| ENT-0372 | DoubleML | B | Statistics / causal inference / experiments / laboratory | https://github.com/DoubleML/doubleml-for-py | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-383 | UNKNOWN |
| ENT-0373 | Tiled | B | Statistics / causal inference / experiments / laboratory | https://github.com/bluesky/tiled | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-386 | UNKNOWN |
| ENT-0374 | PyLabRobot | A-COMPONENT | Statistics / causal inference / experiments / laboratory | https://github.com/PyLabRobot/pylabrobot | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-387 | UNKNOWN |
| ENT-0375 | OpenFGA | A-COMPONENT | Security / reliability / formal methods / evaluation | https://github.com/openfga/openfga | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-388 | UNKNOWN |
| ENT-0376 | SpiceDB | A-COMPONENT | Security / reliability / formal methods / evaluation | https://github.com/authzed/spicedb | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-389 | UNKNOWN |
| ENT-0377 | Vault | C | Security / reliability / formal methods / evaluation | https://github.com/hashicorp/vault | BUSL; VERIFY_USAGE | REPOSITORY_METADATA_VERIFIED | C-390 | UNKNOWN |
| ENT-0378 | TLA+ Toolbox | A-COMPONENT | Security / reliability / formal methods / evaluation | https://github.com/tlaplus/tlaplus | MIT | SOURCE_INSPECTED | C-391 | UNKNOWN |
| ENT-0379 | Kani | B | Security / reliability / formal methods / evaluation | https://github.com/model-checking/kani | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-392 | UNKNOWN |
| ENT-0380 | Z3 | B | Security / reliability / formal methods / evaluation | https://github.com/Z3Prover/z3 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-393 | UNKNOWN |
| ENT-0381 | cvc5 | B | Security / reliability / formal methods / evaluation | https://github.com/cvc5/cvc5 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-394 | UNKNOWN |
| ENT-0382 | OSS-Fuzz | B | Security / reliability / formal methods / evaluation | https://github.com/google/oss-fuzz | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-395 | UNKNOWN |
| ENT-0383 | FoundationDB Simulation Harness | B | Security / reliability / formal methods / evaluation | https://github.com/apple/foundationdb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-396 | UNKNOWN |
| ENT-0384 | Automerge | A-COMPONENT | Local-first / collaboration / version control / plugins | https://github.com/automerge/automerge | MIT | SOURCE_INSPECTED | C-397 | UNKNOWN |
| ENT-0385 | Yjs | A-COMPONENT | Local-first / collaboration / version control / plugins | https://github.com/yjs/yjs | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-398 | UNKNOWN |
| ENT-0386 | Loro | B | Local-first / collaboration / version control / plugins | https://github.com/loro-dev/loro | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-399 | UNKNOWN |
| ENT-0387 | ElectricSQL | B | Local-first / collaboration / version control / plugins | https://github.com/electric-sql/electric | Apache-2.0/UNKNOWN exact current license ; VERIFY_BEFORE_ADOPTION | SOURCE_INSPECTED | C-400 | UNKNOWN |
| ENT-0388 | cr-sqlite | B | Local-first / collaboration / version control / plugins | https://github.com/vlcn-io/cr-sqlite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-401 | UNKNOWN |
| ENT-0389 | Jujutsu | B | Local-first / collaboration / version control / plugins | https://github.com/jj-vcs/jj | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-402 | UNKNOWN |
| ENT-0390 | Pijul | B | Local-first / collaboration / version control / plugins | https://github.com/pijul-scm/pijul | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-403 | UNKNOWN |
| ENT-0391 | Sapling | B | Local-first / collaboration / version control / plugins | https://github.com/facebook/sapling | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-404 | UNKNOWN |
| ENT-0392 | Extism | A | Local-first / collaboration / version control / plugins | https://github.com/extism/extism | BSD-3-Clause/UNKNOWN exact monorepo details ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-405 | UNKNOWN |
| ENT-0393 | HashiCorp go-plugin | B | Local-first / collaboration / version control / plugins | https://github.com/hashicorp/go-plugin | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-406 | UNKNOWN |
| ENT-0394 | Kubernetes | B | Distributed systems / cloud / messaging / observability | https://github.com/kubernetes/kubernetes | Apache-2.0 | SOURCE_INSPECTED | C-407 | UNKNOWN |
| ENT-0395 | HashiCorp Nomad | C | Distributed systems / cloud / messaging / observability | https://github.com/hashicorp/nomad | BUSL; VERIFY_USAGE | REPOSITORY_METADATA_VERIFIED | C-408 | UNKNOWN |
| ENT-0396 | NATS | B | Distributed systems / cloud / messaging / observability | https://github.com/nats-io/nats-server | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-409 | UNKNOWN |
| ENT-0397 | Apache Kafka | B | Distributed systems / cloud / messaging / observability | https://github.com/apache/kafka | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-410 | UNKNOWN |
| ENT-0398 | Apache Pulsar | B | Distributed systems / cloud / messaging / observability | https://github.com/apache/pulsar | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-411 | UNKNOWN |
| ENT-0399 | Redpanda | C | Distributed systems / cloud / messaging / observability | https://github.com/redpanda-data/redpanda | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-412 | UNKNOWN |
| ENT-0400 | OpenTelemetry Collector | A | Distributed systems / cloud / messaging / observability | https://github.com/open-telemetry/opentelemetry-collector ; https://github.com/open-telemetry/opentelemetry-collector-releases | Apache-2.0 | SOURCE_INSPECTED | C-413 | UNKNOWN |
| ENT-0401 | Prometheus | B | Distributed systems / cloud / messaging / observability | https://github.com/prometheus/prometheus | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-414 | UNKNOWN |
| ENT-0402 | Pandoc | B | Publishing / visualization / product / HCI | https://github.com/jgm/pandoc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-415 | UNKNOWN |
| ENT-0403 | MyST Markdown | B | Publishing / visualization / product / HCI | https://github.com/jupyter-book/mystmd | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-416 | UNKNOWN |
| ENT-0404 | Manubot | B | Publishing / visualization / product / HCI | https://github.com/manubot/manubot | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-417 | UNKNOWN |
| ENT-0405 | Citation Style Language | B | Publishing / visualization / product / HCI | https://github.com/citation-style-language/schema | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-418 | UNKNOWN |
| ENT-0406 | Zotero | B | Publishing / visualization / product / HCI | https://github.com/zotero/zotero | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-419 | UNKNOWN |
| ENT-0407 | Observable Framework | B | Publishing / visualization / product / HCI | https://github.com/observablehq/framework | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-421 | UNKNOWN |
| ENT-0408 | Vega-Lite | B | Publishing / visualization / product / HCI | https://github.com/vega/vega-lite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-422 | UNKNOWN |
| ENT-0409 | Datashader | B | Publishing / visualization / product / HCI | https://github.com/holoviz/datashader | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-423 | UNKNOWN |
| ENT-0410 | ParaView | B | Publishing / visualization / product / HCI | https://github.com/Kitware/ParaView | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-424 | UNKNOWN |
| ENT-0411 | VTK | B | Publishing / visualization / product / HCI | https://github.com/Kitware/VTK | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-425 | UNKNOWN |
| ENT-0412 | Typst | B | Publishing / visualization / product / HCI | https://github.com/typst/typst | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-426 | UNKNOWN |
| ENT-0413 | napari | B | Publishing / visualization / product / HCI | https://github.com/napari/napari | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-427 | UNKNOWN |
| ENT-0414 | deck.gl | B | Publishing / visualization / product / HCI | https://github.com/visgl/deck.gl | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-428 | UNKNOWN |
| ENT-0415 | Nextflow | B | Scientific workflows / domain platforms / robotics | https://github.com/nextflow-io/nextflow | Apache-2.0 ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-429 | UNKNOWN |
| ENT-0416 | Snakemake | B | Scientific workflows / domain platforms / robotics | https://github.com/snakemake/snakemake | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-430 | UNKNOWN |
| ENT-0417 | nf-core tools | B | Scientific workflows / domain platforms / robotics | https://github.com/nf-core/tools | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-431 | UNKNOWN |
| ENT-0418 | Common Workflow Language | B | Scientific workflows / domain platforms / robotics | https://github.com/common-workflow-language/common-workflow-language | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-432 | UNKNOWN |
| ENT-0419 | AiiDA | S | Scientific workflows / domain platforms / robotics | https://github.com/aiidateam/aiida-core | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-433 | UNKNOWN |
| ENT-0420 | NOMAD | B | Scientific workflows / domain platforms / robotics | https://github.com/FAIRmat-NFDI/nomad | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-434 | UNKNOWN |
| ENT-0421 | pymatgen | B | Scientific workflows / domain platforms / robotics | https://github.com/materialsproject/pymatgen | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-435 | UNKNOWN |
| ENT-0422 | RDKit | B | Scientific workflows / domain platforms / robotics | https://github.com/rdkit/rdkit | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-436 | UNKNOWN |
| ENT-0423 | OpenMM | B | Scientific workflows / domain platforms / robotics | https://github.com/openmm/openmm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-437 | UNKNOWN |
| ENT-0424 | GROMACS | B | Scientific workflows / domain platforms / robotics | https://github.com/gromacs/gromacs | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-438 | UNKNOWN |
| ENT-0425 | Astropy | B | Scientific workflows / domain platforms / robotics | https://github.com/astropy/astropy | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-439 | UNKNOWN |
| ENT-0426 | xarray | B | Scientific workflows / domain platforms / robotics | https://github.com/pydata/xarray | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-440 | UNKNOWN |
| ENT-0427 | Pangeo | B | Scientific workflows / domain platforms / robotics | https://github.com/pangeo-data/pangeo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-441 | UNKNOWN |
| ENT-0428 | Dask | B | Scientific workflows / domain platforms / robotics | https://github.com/dask/dask | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-442 | UNKNOWN |
| ENT-0429 | PyNWB | B | Scientific workflows / domain platforms / robotics | https://github.com/NeurodataWithoutBorders/pynwb | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-443 | UNKNOWN |
| ENT-0430 | DANDI CLI | B | Scientific workflows / domain platforms / robotics | https://github.com/dandi/dandi-cli | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-444 | UNKNOWN |
| ENT-0431 | BIDS Specification | B | Scientific workflows / domain platforms / robotics | https://github.com/bids-standard/bids-specification | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-445 | UNKNOWN |
| ENT-0432 | ROS 2 | A-COMPONENT | Scientific workflows / domain platforms / robotics | https://github.com/ros2/ros2 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-446 | UNKNOWN |
| ENT-0433 | MoveIt 2 | A-COMPONENT | Scientific workflows / domain platforms / robotics | https://github.com/moveit/moveit2 | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-447 | UNKNOWN |
| ENT-0434 | Opentrons | A-COMPONENT | Scientific workflows / domain platforms / robotics | https://github.com/Opentrons/opentrons | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-448 | UNKNOWN |
| ENT-0435 | Model Context Protocol (MCP) | S-COMPONENT | Protocols / interoperability / data sovereignty | https://github.com/modelcontextprotocol/modelcontextprotocol ; https://modelcontextprotocol.io/specification | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-449 | UNKNOWN |
| ENT-0436 | A2A Protocol | B | Protocols / interoperability / data sovereignty | https://github.com/a2aproject/A2A | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-450 | UNKNOWN |
| ENT-0437 | AG-UI | B | Protocols / interoperability / data sovereignty | https://github.com/ag-ui-protocol/ag-ui | MIT ; VERIFY_BEFORE_ADOPTION | DOCUMENTATION_INSPECTED | C-451 | UNKNOWN |
| ENT-0438 | OpenAPI | B | Protocols / interoperability / data sovereignty | https://github.com/OAI/OpenAPI-Specification | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-452 | UNKNOWN |
| ENT-0439 | gRPC | B | Protocols / interoperability / data sovereignty | https://github.com/grpc/grpc | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-453 | UNKNOWN |
| ENT-0440 | Protocol Buffers | B | Protocols / interoperability / data sovereignty | https://github.com/protocolbuffers/protobuf | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-454 | UNKNOWN |
| ENT-0441 | CloudEvents | B | Protocols / interoperability / data sovereignty | https://github.com/cloudevents/spec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-455 | UNKNOWN |
| ENT-0442 | AsyncAPI | B | Protocols / interoperability / data sovereignty | https://github.com/asyncapi/spec | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-456 | UNKNOWN |
| ENT-0443 | Dataspace Protocol | B | Protocols / interoperability / data sovereignty | https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-458 | UNKNOWN |
| ENT-0444 | Eclipse EDC | B | Protocols / interoperability / data sovereignty | https://github.com/eclipse-edc/Connector | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-459 | UNKNOWN |
| ENT-0445 | Solid | B | Protocols / interoperability / data sovereignty | https://solidproject.org/TR/protocol | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-460 | UNKNOWN |
| ENT-0446 | W3C ODRL | B | Protocols / interoperability / data sovereignty | https://www.w3.org/TR/odrl-model/ | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-461 | UNKNOWN |
| ENT-0447 | QUDT | S-COMPONENT | Metrology / sustainability / browser / frontier compute | https://github.com/qudt/qudt-public-repo | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-463 | UNKNOWN |
| ENT-0448 | UCUM | S-COMPONENT | Metrology / sustainability / browser / frontier compute | https://ucum.org | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-464 | UNKNOWN |
| ENT-0449 | Kepler | B | Metrology / sustainability / browser / frontier compute | https://github.com/sustainable-computing-io/kepler | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-465 | UNKNOWN |
| ENT-0450 | Carbon Aware SDK | B | Metrology / sustainability / browser / frontier compute | https://github.com/Green-Software-Foundation/carbon-aware-sdk | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-466 | UNKNOWN |
| ENT-0451 | WebGPU | WATCH | Metrology / sustainability / browser / frontier compute | https://github.com/gpuweb/gpuweb | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-467 | UNKNOWN |
| ENT-0452 | WASI | S-COMPONENT | Metrology / sustainability / browser / frontier compute | https://github.com/WebAssembly/WASI | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-469 | UNKNOWN |
| ENT-0453 | Pyodide | B | Metrology / sustainability / browser / frontier compute | https://github.com/pyodide/pyodide | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-470 | UNKNOWN |
| ENT-0454 | JupyterLite | B | Metrology / sustainability / browser / frontier compute | https://github.com/jupyterlite/jupyterlite | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-471 | UNKNOWN |
| ENT-0455 | DuckDB-Wasm | B | Metrology / sustainability / browser / frontier compute | https://github.com/duckdb/duckdb-wasm | VERIFY_BEFORE_ADOPTION | REPOSITORY_METADATA_VERIFIED | C-472 | UNKNOWN |
| ENT-0456 | Quantum Intermediate Representation | WATCH | Metrology / sustainability / browser / frontier compute | https://github.com/qir-alliance/qir-spec | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-473 | UNKNOWN |
| ENT-0457 | OpenQASM | WATCH | Metrology / sustainability / browser / frontier compute | https://github.com/openqasm/openqasm | VERIFY_BEFORE_ADOPTION | AUTHORITATIVE_SPEC_VERIFIED | C-474 | UNKNOWN |
| ENT-0458 | FAR-Lab Intent–Effect–Evidence Ledger | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0459 | Scientific Evidence Interoperability Stack | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0460 | Wasmtime + WASI + WebAssembly Component Model | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0461 | MCP + ACP Protocol Decomposition | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0462 | Hybrid Retrieval Plane | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0463 | Scientific Truth / Metrology Plane | S | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0464 | OpenAlex / OpenCitations / Crossref | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0465 | OpenFGA / SpiceDB | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0466 | TLA+ / TLC + Apalache | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0467 | Automerge / Yjs | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0468 | DataLad / lakeFS / Dolt | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0469 | ROS 2 / MoveIt 2 | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |
| ENT-0470 | PyLabRobot / Opentrons / SiLA | A | Cross-cutting synthesis | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | NONE | RAW-0039 |

### 31.5 External source registry preserved from the corpus

This table preserves corpus provenance and search leads. It is **not** a claim that every raw URL or metadata field was freshly revalidated. Tier S/A sources and consequential conflict resolutions received the current verification pass; lower-tier leads retain their stated evidence level.

| SOURCE ID | NAME | URL | RESEARCH UNIT | TYPE | EVIDENCE LEVEL | VERIFIED ON | NOTES |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-0001 | Agent Client Protocol | https://github.com/agentclientprotocol/agent-client-protocol | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0002 | AMReX | https://github.com/AMReX-Codes/amrex | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0003 | Apache Arrow | https://github.com/apache/arrow | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0004 | Apache Lucene | https://github.com/apache/lucene | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0005 | Apalache | https://github.com/apalache-mc/apalache | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0006 | ArviZ | https://github.com/arviz-devs/arviz | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0007 | Ax | https://github.com/facebook/Ax | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0008 | BentoML | https://github.com/bentoml/BentoML | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0009 | BoTorch | https://github.com/meta-pytorch/botorch | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0010 | causal-learn | https://github.com/py-why/causal-learn | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0011 | CBMC | https://github.com/diffblue/cbmc | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0012 | Cedar | https://github.com/cedar-policy/cedar | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0013 | Chaos Mesh | https://github.com/chaos-mesh/chaos-mesh | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0014 | Confidential Containers | https://github.com/confidential-containers/confidential-containers | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0015 | CUTLASS | https://github.com/NVIDIA/cutlass | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0016 | Dafny | https://github.com/dafny-lang/dafny | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0017 | DAKOTA | https://github.com/snl-dakota/dakota | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0018 | deal.II | https://github.com/dealii/dealii | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0019 | DoWhy | https://github.com/py-why/dowhy | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0020 | EconML | https://github.com/py-why/EconML | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0021 | Enzyme | https://github.com/EnzymeAD/Enzyme | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0022 | FEniCSx | https://github.com/FEniCS/dolfinx | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0023 | FlashAttention | https://github.com/Dao-AILab/flash-attention | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0024 | Galaxy | https://github.com/galaxyproject/galaxy | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0025 | Ginkgo | https://github.com/ginkgo-project/ginkgo | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0026 | Gramine | https://github.com/gramineproject/gramine | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0027 | HiGHS | https://github.com/ERGO-Code/HiGHS | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0028 | HPX | https://github.com/TheHPXProject/hpx | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0029 | Hypothesis | https://github.com/HypothesisWorks/hypothesis | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0030 | Ipopt | https://github.com/coin-or/Ipopt | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0031 | Jepsen | https://github.com/jepsen-io/jepsen | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0032 | KServe | https://github.com/kserve/kserve | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0033 | Lean 4 | https://github.com/leanprover/lean4 | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0034 | libfabric | https://github.com/ofiwg/libfabric | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0035 | LiteLLM | https://github.com/BerriAI/litellm | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0036 | llama.cpp | https://github.com/ggml-org/llama.cpp | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0037 | llm-d | https://github.com/llm-d/llm-d | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0038 | MFEM | https://github.com/mfem/mfem | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0039 | Milvus | https://github.com/milvus-io/milvus | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0040 | MLIR | https://github.com/llvm/llvm-project/tree/main/mlir | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SOURCE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0041 | Mooncake | https://github.com/kvcache-ai/Mooncake | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0042 | MPICH | https://github.com/pmodels/mpich | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0043 | NumPyro | https://github.com/pyro-ppl/numpyro | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0044 | NVIDIA Dynamo | https://github.com/ai-dynamo/dynamo | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0045 | NVIDIA Triton Inference Server | https://github.com/triton-inference-server/server | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_DOCS_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0046 | Open Policy Agent | https://github.com/open-policy-agent/opa | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0047 | OpenAlex | https://github.com/ourresearch/openalex-guts | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0048 | OpenCitations | https://github.com/opencitations | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PROJECT_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0049 | OpenLineage | https://github.com/OpenLineage/OpenLineage | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0050 | OpenSearch | https://github.com/opensearch-project/OpenSearch | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0051 | OpenTURNS | https://github.com/openturns/openturns | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0052 | Optuna | https://github.com/optuna/optuna | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0053 | PaRSEC | https://github.com/ICLDisco/parsec | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0054 | pgvector | https://github.com/pgvector/pgvector | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0055 | PyMC | https://github.com/pymc-devs/pymc | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0056 | Pyro | https://github.com/pyro-ppl/pyro | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0057 | Qdrant | https://github.com/qdrant/qdrant | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0058 | Quickwit | https://github.com/quickwit-oss/quickwit | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0059 | RAJA | https://github.com/llnl/RAJA | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0060 | Ray Serve | https://github.com/ray-project/ray | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0061 | RO-Crate | https://www.researchobject.org/ro-crate/ | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0062 | seL4 | https://github.com/seL4/seL4 | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0063 | SGLang | https://github.com/sgl-project/sglang | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_DOCS_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0064 | SMAC3 | https://github.com/automl/SMAC3 | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0065 | SPIFFE / SPIRE | https://github.com/spiffe/spire | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0066 | Stan | https://github.com/stan-dev/stan | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0067 | StarPU | https://github.com/starpu-runtime/starpu | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0068 | SuiteSparse | https://github.com/DrTimothyAldenDavis/SuiteSparse | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0069 | SUNDIALS | https://github.com/llnl/sundials | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0070 | Tantivy | https://github.com/quickwit-oss/tantivy | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0071 | TensorRT-LLM | https://github.com/NVIDIA/TensorRT-LLM | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_DOCS_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0072 | Tetrad | https://github.com/cmu-phil/tetrad | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0073 | Text Generation Inference | https://github.com/huggingface/text-generation-inference | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0074 | Tigramite | https://github.com/jakobrunge/tigramite | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0075 | Trilinos | https://github.com/trilinos/Trilinos | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0076 | Turing.jl | https://github.com/TuringLang/Turing.jl | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0077 | UCX | https://github.com/openucx/ucx | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0078 | Vespa | https://github.com/vespa-engine/vespa | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0079 | vLLM | https://github.com/vllm-project/vllm | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_DOCS_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0080 | W3C PROV | https://www.w3.org/TR/prov-overview/ | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0081 | Wasmtime | https://github.com/bytecodealliance/wasmtime | PREVIOUS_BATCH | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0082 | Anserini | https://github.com/castorini/anserini | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0083 | ASReview | https://github.com/asreview/asreview | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0084 | BEIR | https://github.com/beir-cellar/beir | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0085 | ColBERT | https://github.com/stanford-futuredata/ColBERT | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0086 | Crossref | https://www.crossref.org | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PAGE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0087 | DataCite | https://datacite.org | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PAGE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0088 | Europe PMC | https://europepmc.org | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PAGE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0089 | GROBID | https://github.com/kermitt2/grobid | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0090 | LanceDB | https://github.com/lancedb/lancedb | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0091 | Meilisearch | https://github.com/meilisearch/meilisearch | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0092 | OpenAIRE Research Graph | https://graph.openaire.eu | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PAGE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0093 | ORCID | https://orcid.org | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_PAGE_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0094 | ParadeDB | https://github.com/paradedb/paradedb | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0095 | PyTerrier | https://github.com/terrier-org/pyterrier | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0096 | Solr | https://github.com/apache/solr | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0097 | SPLADE | https://github.com/naver/splade | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0098 | Typesense | https://github.com/typesense/typesense | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0099 | Weaviate | https://github.com/weaviate/weaviate | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0100 | Zoekt | https://github.com/sourcegraph/zoekt | RU-004 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0101 | Apache TVM | https://github.com/apache/tvm | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0102 | DeepSpeed | https://github.com/deepspeedai/DeepSpeed | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0103 | IREE | https://github.com/iree-org/iree | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0104 | Megatron-LM | https://github.com/NVIDIA/Megatron-LM | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0105 | Ollama | https://github.com/ollama/ollama | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0106 | OpenXLA | https://github.com/openxla/xla | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0107 | PyTorch Inductor | https://github.com/pytorch/pytorch | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0108 | Triton Language | https://github.com/triton-lang/triton | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0109 | xFormers | https://github.com/facebookresearch/xformers | RU-005 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0110 | Charm++ | https://github.com/charmplusplus/charm | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0111 | DifferentialEquations.jl | https://github.com/SciML/DifferentialEquations.jl | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0112 | Flux Framework | https://github.com/flux-framework/flux-core | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0113 | hypre | https://github.com/hypre-space/hypre | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0114 | JuMP | https://github.com/jump-dev/JuMP.jl | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0115 | Kokkos | https://github.com/kokkos/kokkos | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0116 | LAMMPS | https://github.com/lammps/lammps | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0117 | Legion | https://github.com/StanfordLegion/legion | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0118 | MOOSE | https://github.com/idaholab/moose | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0119 | Open MPI | https://github.com/open-mpi/ompi | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0120 | OpenFOAM | https://github.com/OpenFOAM/OpenFOAM-dev | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0121 | OR-Tools | https://github.com/google/or-tools | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0122 | PETSc | https://github.com/petsc/petsc | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0123 | Pyomo | https://github.com/Pyomo/pyomo | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0124 | Slurm | https://github.com/SchedMD/slurm | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0125 | Taskflow | https://github.com/taskflow/taskflow | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0126 | WarpX | https://github.com/BLAST-WarpX/warpx | RU-006 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0127 | Bluesky | https://github.com/bluesky/bluesky | RU-007 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0128 | DoubleML | https://github.com/DoubleML/doubleml-for-py | RU-007 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0129 | Ophyd | https://github.com/bluesky/ophyd | RU-007 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0130 | PyLabRobot | https://github.com/PyLabRobot/pylabrobot | RU-007 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0131 | Tiled | https://github.com/bluesky/tiled | RU-007 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0132 | cvc5 | https://github.com/cvc5/cvc5 | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0133 | FoundationDB Simulation | https://github.com/apple/foundationdb | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0134 | Kani | https://github.com/model-checking/kani | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0135 | OpenFGA | https://github.com/openfga/openfga | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0136 | OSS-Fuzz | https://github.com/google/oss-fuzz | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0137 | SpiceDB | https://github.com/authzed/spicedb | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0138 | TLA+ Toolbox | https://github.com/tlaplus/tlaplus | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0139 | Vault | https://github.com/hashicorp/vault | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0140 | Z3 | https://github.com/Z3Prover/z3 | RU-008 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0141 | Automerge | https://github.com/automerge/automerge | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0142 | cr-sqlite | https://github.com/vlcn-io/cr-sqlite | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0143 | ElectricSQL | https://github.com/electric-sql/electric | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0144 | Extism | https://github.com/extism/extism | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0145 | HashiCorp go-plugin | https://github.com/hashicorp/go-plugin | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0146 | Jujutsu | https://github.com/jj-vcs/jj | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0147 | Loro | https://github.com/loro-dev/loro | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0148 | Pijul | https://github.com/pijul-scm/pijul | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0149 | Sapling | https://github.com/facebook/sapling | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0150 | Yjs | https://github.com/yjs/yjs | RU-009 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0151 | Apache Kafka | https://github.com/apache/kafka | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0152 | Apache Pulsar | https://github.com/apache/pulsar | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0153 | HashiCorp Nomad | https://github.com/hashicorp/nomad | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0154 | Kubernetes | https://github.com/kubernetes/kubernetes | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0155 | NATS | https://github.com/nats-io/nats-server | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0156 | OpenTelemetry Collector | https://github.com/open-telemetry/opentelemetry-collector | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0157 | Prometheus | https://github.com/prometheus/prometheus | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0158 | Redpanda | https://github.com/redpanda-data/redpanda | RU-010 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0159 | Citation Style Language | https://github.com/citation-style-language/schema | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0160 | Datashader | https://github.com/holoviz/datashader | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0161 | deck.gl | https://github.com/visgl/deck.gl | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0162 | Manubot | https://github.com/manubot/manubot | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0163 | MyST Markdown | https://github.com/jupyter-book/mystmd | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0164 | napari | https://github.com/napari/napari | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0165 | Observable Framework | https://github.com/observablehq/framework | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0166 | Pandoc | https://github.com/jgm/pandoc | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0167 | ParaView | https://github.com/Kitware/ParaView | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0168 | Quarto | https://github.com/quarto-dev/quarto-cli | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | SOURCE_INSPECTED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0169 | Typst | https://github.com/typst/typst | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0170 | Vega-Lite | https://github.com/vega/vega-lite | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0171 | VTK | https://github.com/Kitware/VTK | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0172 | Zotero | https://github.com/zotero/zotero | RU-011 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0173 | AiiDA | https://github.com/aiidateam/aiida-core | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0174 | Astropy | https://github.com/astropy/astropy | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0175 | BIDS Specification | https://github.com/bids-standard/bids-specification | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0176 | Common Workflow Language | https://github.com/common-workflow-language/common-workflow-language | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0177 | DANDI CLI | https://github.com/dandi/dandi-cli | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0178 | Dask | https://github.com/dask/dask | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0179 | GROMACS | https://github.com/gromacs/gromacs | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0180 | MoveIt 2 | https://github.com/moveit/moveit2 | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0181 | Nextflow | https://github.com/nextflow-io/nextflow | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0182 | nf-core tools | https://github.com/nf-core/tools | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0183 | NOMAD | https://github.com/FAIRmat-NFDI/nomad | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0184 | OpenMM | https://github.com/openmm/openmm | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0185 | Opentrons | https://github.com/Opentrons/opentrons | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0186 | Pangeo | https://github.com/pangeo-data/pangeo | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0187 | pymatgen | https://github.com/materialsproject/pymatgen | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0188 | PyNWB | https://github.com/NeurodataWithoutBorders/pynwb | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0189 | RDKit | https://github.com/rdkit/rdkit | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0190 | ROS 2 | https://github.com/ros2/ros2 | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0191 | Snakemake | https://github.com/snakemake/snakemake | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0192 | xarray | https://github.com/pydata/xarray | RU-012 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0193 | A2A Protocol | https://github.com/a2aproject/A2A | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0194 | AG-UI | https://github.com/ag-ui-protocol/ag-ui | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0195 | AsyncAPI | https://github.com/asyncapi/spec | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0196 | CloudEvents | https://github.com/cloudevents/spec | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0197 | Dataspace Protocol | https://docs.internationaldataspaces.org/ids-knowledgebase/dataspace-protocol | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0198 | Eclipse EDC | https://github.com/eclipse-edc/Connector | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0199 | gRPC | https://github.com/grpc/grpc | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0200 | Model Context Protocol | https://modelcontextprotocol.io/specification | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0201 | OCI Distribution / ORAS | https://github.com/oras-project/oras | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0202 | OpenAPI | https://github.com/OAI/OpenAPI-Specification | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0203 | Protocol Buffers | https://github.com/protocolbuffers/protobuf | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0204 | Solid | https://solidproject.org/TR/protocol | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0205 | W3C ODRL | https://www.w3.org/TR/odrl-model/ | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0206 | W3C Verifiable Credentials | https://www.w3.org/TR/vc-data-model-2.0/ | RU-013 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0207 | Carbon Aware SDK | https://github.com/Green-Software-Foundation/carbon-aware-sdk | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0208 | DuckDB-Wasm | https://github.com/duckdb/duckdb-wasm | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0209 | JupyterLite | https://github.com/jupyterlite/jupyterlite | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0210 | Kepler | https://github.com/sustainable-computing-io/kepler | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0211 | OpenQASM | https://github.com/openqasm/openqasm | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0212 | Pyodide | https://github.com/pyodide/pyodide | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0213 | Quantum Intermediate Representation | https://github.com/qir-alliance/qir-spec | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0214 | QUDT | https://github.com/qudt/qudt-public-repo | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0215 | UCUM | https://ucum.org | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0216 | WASI | https://github.com/WebAssembly/WASI | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | REPOSITORY_METADATA_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0217 | WebAssembly Component Model | https://component-model.bytecodealliance.org | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |
| SRC-0218 | WebGPU | https://github.com/gpuweb/gpuweb | RU-014 | OFFICIAL_REPOSITORY_OR_SPEC | AUTHORITATIVE_SPEC_VERIFIED | 2026-08-20 | Primary project/spec source; adoption still requires exact release, component license and workload validation. |

### 31.6 Preliminary decision records from the corpus

| ID | DECISION / NAME | DESCRIPTION | RESEARCH UNIT | EVIDENCE | SOURCE ARTIFACT |
| --- | --- | --- | --- | --- | --- |
| DR-001 | BUILD FAR-Lab External Effect Gate | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-002 | ADAPT Harn OpenTrustGraph Records | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-003 | ADAPT OpenGeni Authority Model | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-004 | EXTRACT DriftQ Staged/Compensation Model | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-005 | ADOPT Conditional Artifact Generations | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-006 | KEEP Process/GPU/Browser Checkpoints as Cache | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-007 | DEFER Full Adoption of AX/Harn/OpenGeni/etchplan | UNKNOWN | PREVIOUS_BATCH | PREVIOUS_BATCH_RECORDED | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md |
| DR-008 | BUILD: FAR-Lab intent/effect/evidence ledger | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-009 | ADOPT: durable workflow commodity layer | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-010 | ADAPT: ACP/MCP/A2A protocol gateway | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-011 | BUILD: scientific validity gate | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-012 | ADOPT: Lucene/Tantivy-class lexical core | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-013 | ADAPT: hybrid retrieval ensemble | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-014 | ADOPT: vLLM/SGLang-class serving backends | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-015 | BUILD: measured model capability registry | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-016 | ADOPT: Slurm/Flux interfaces for HPC resources | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-017 | ADOPT/ADAPT: PETSc/solver ecosystems | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-018 | BUILD: metrology-aware measurement object | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-019 | ADOPT: OPA/Cedar + relationship authorization patterns | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-020 | ADOPT selectively: formal methods by proof obligation | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-021 | ADOPT: CRDT for collaborative documents, not invariants | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-022 | BUILD: semantic merge validators | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-023 | ADOPT: OpenTelemetry for operations | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-024 | BUILD: research-specific SLOs | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-025 | ADOPT/ADAPT: Quarto/MyST/Pandoc publication stack | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-026 | BUILD: domain schema plugin contract | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-027 | WATCH/PROTOTYPE: browser/WebGPU and quantum IR | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-028 | ADAPT: sovereign compute-to-data connectors | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |
| DR-029 | BUILD: protocol-loss conformance matrix | UNKNOWN | UNKNOWN | DECISION_SYNTHESIS | FINAL_EXPEDITION |

### 31.7 Preliminary fusion records from the corpus

| ID | SOURCE | CAPABILITY | ADOPTION MODE | INTEGRATION BOUNDARY | OWNERSHIP | MIGRATION / REMOVAL | VERIFICATION | LICENSE / EVIDENCE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-001 | Temporal/Restate/DBOS family | Durable control history | ADAPT | ResearchRun service API | FAR-Lab owns intent/effect/evidence; engine owns control replay | Wrap existing run commands; dual-write during migration / Delete custom retry/timer loops | Crash/replay/version/fault suite on real engine | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-002 | PostgreSQL + object/CAS store | Authoritative metadata and immutable artifacts | ADOPT | Repository interfaces | Postgres owns mutable relational truth; CAS owns immutable blobs | Import existing registries and artifacts / Remove duplicate JSON state authorities | Backup/restore/corruption and scale tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-003 | Lucene/Tantivy/Zoekt class | Exact/sparse/code search | ADOPT | Index/search service | Search engine owns index; source graph owns evidence truth | Build from source snapshots with generation manifests / Remove custom grep-as-index paths | Quality/latency/freshness benchmark | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-004 | Vespa/ColBERT/SPLADE patterns | Hybrid semantic ranking | ADAPT | Reranking service | FAR-Lab owns evaluation/routing; components score candidates | Shadow evaluate before serving / Remove vector-only default | Time-split FAR-Lab corpus Pareto test | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-005 | vLLM/SGLang/Triton Server | Open-model inference | ADOPT | Model Gateway | Backend owns kernels/scheduling; gateway owns policy/evidence | Canary by model profile / Remove direct SDK coupling from agents | Quality/latency/memory/failure benchmark | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-006 | Slurm/Flux | HPC allocation and job lifecycle | ADOPT | RemoteCompute adapter | Site scheduler owns resources; FAR-Lab owns scientific run | Add scheduler-specific plugins / Remove assumptions of Kubernetes-only execution | Real cluster pilot with preemption/accounting | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-007 | PETSc/Trilinos/hypre/Ginkgo | Numerical solver capability | ADAPT | Solver adapter contract | Library owns numerical implementation; FAR-Lab owns config/evidence | Wrap selected solvers per domain / Remove internal generic solver ambitions | Reference problems and residual/precision checks | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-008 | Stan/PyMC/NumPyro + ArviZ | Bayesian inference and diagnostics | ADAPT | Statistical Study API | Engine owns inference; validity gate owns acceptance | Normalize outputs to evidence schema / Remove raw summary-only reports | Known posterior and simulation-based calibration tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-009 | DoWhy/EconML/DoubleML | Causal workflow | ADAPT | CausalStudy plugin | Domain/user owns causal assumptions; library estimates | Store DAG and refuters with result / Remove causal language from untyped analyses | Synthetic ground-truth and sensitivity tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-010 | Bluesky/Ophyd/PyLabRobot | Instrument plan and adapters | ADAPT | Lab Gateway | Instrument controller owns hardware safety; FAR-Lab owns intent/effect ledger | Begin read-only and simulated devices / Remove direct vendor calls from agents | Hardware-in-loop fault and ambiguity tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-011 | OPA/Cedar + SPIRE + SpiceDB | Policy, identity and relationship authorization | ADAPT | Authorization service and final effect gate | Each subsystem owns its specialized truth; effect gateway enforces | Shadow decisions then enforce / Remove monolithic permissions table | Revocation/TOCTOU/consistency adversarial tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-012 | Automerge/Yjs/Loro | Collaborative document state | ADOPT | Document service | CRDT owns mergeable document state; domain services own invariants | Migrate notes/manuscripts first / Remove central-lock-only editing | Partition/offline/convergence plus invariant tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-013 | OpenTelemetry Collector + Prometheus | Operational telemetry | ADOPT | Telemetry plane | Telemetry owns diagnostics, never evidence truth | Instrument services incrementally / Remove bespoke log correlation | Load/drop/sampling and PII tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-014 | Quarto/MyST/Pandoc/Vega-Lite | Publication and visualization compiler | ADAPT | Publication compiler | Compiler renders; evidence graph supplies versioned nodes | Import Markdown/notebooks and pin manifests / Remove hand-coded format exporters | Deterministic multi-format build tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-015 | W3C PROV + OpenLineage + RO-Crate + in-toto/Sigstore | Evidence envelope | ADAPT | Evidence service/exporters | FAR-Lab canonical graph owns mappings; standards own interchange | Emit standards from canonical records / Remove incompatible bespoke provenance exports | Round-trip/schema/tamper/completeness tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-016 | MCP + ACP + A2A + AG-UI | Agent/client/tool interoperability | ADAPT | Protocol Gateway | Canonical internal model owns semantics; adapters translate | Conformance fixtures and feature matrix / Remove protocol-specific core state | Mixed-version, cancellation and permission tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |
| FR-017 | QUDT + UCUM | Units and quantity semantics | ADAPT | Measurement object library | Standards own vocabulary; FAR-Lab owns validation/covariance/calibration | Wrap existing numeric data at domain boundaries / Remove unit strings as sole semantics | Dimensional, offset-unit and covariance tests | VERIFY_BEFORE_ADOPTION / FUSION_DESIGN |

### 31.8 Complete Corpus Ingestion Ledger

Every supplied source occurrence is accounted for below. Duplicate occurrences retain their own `SOURCE_ID` and point to the byte-identical source they duplicate. Hashes are shortened for readability; the full ledger is retained in the working data used to produce this document.

| SOURCE_ID | ORIGIN | FILENAME | BYTES | SHA-256 PREFIX | READABILITY | DUPLICATE OF | PRODUCER / MODEL | DATE | TOPIC | CANDIDATE COUNT | EVIDENCE QUALITY | MAJOR CLAIMS / NOTES |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RAW-0001 | TOP_LEVEL | 111(1).md | 82478 | 38392cc66c42fbba | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / knowledge / provenance | 20 | RAW_NARRATIVE | FAR-Lab 应首先被看作 provenance-aware、incremental、durable、capability-secured scientific computation system，Agent 是其上层。 \| **FAR-Lab 的 Knowledge/Memory 层不能以 Vector DB 为中心。它应该以“可版本化事实 + 命题/断言 + 证据 + 推导 + 时间 + provenance + 不确定性 + immutable artifacts”为中心；全文、向量、GraphRAG、summary、embedding 都应是可丢弃、可重建的派生 projection。** \| Compound A inhibits protein B. |
| RAW-0002 | TOP_LEVEL | 222(1).md | 11750 | 9346ed59fc29b4b8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0003 | TOP_LEVEL | FAR-Lab Autonomous Rebuild Mission Constitution — FINAL.md | 23954 | 64d350a788c69f36 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | 科研人员究竟为什么要使用 FAR-Lab，而不是 ChatGPT、Claude、现有 AI Scientist、Notebook、IDE、workflow engine、文献系统、数据平台或其他 Agent？ \| 它改善了哪个 Must-Win Research Mission？ \| 是否存在尚未调查、但可能改变当前架构、优先级、科学价值或产品能力的重要方向？ |
| RAW-0004 | TOP_LEVEL | FAR-Lab_Batch-002-Candidate-Registry(1).csv | 32007 | d2a9cabbf89adc6e | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | candidate/entity registry | 104 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0005 | TOP_LEVEL | FAR-Lab_Batch-002-Continuation-State(1).json | 116879 | 7ea3bf9138232909 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 104 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0006 | TOP_LEVEL | FAR-Lab_Batch-002_Research-Package(1).zip | 110492 | b43349352d45f9eb | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0007 | TOP_LEVEL | FAR-Lab_Download-Repair_2026-08-20(1).zip | 4619869 | 04e45fa41775c7d1 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | package / manifest / repair | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0008 | TOP_LEVEL | FAR-Lab_Download-Repair_2026-08-20_README(1).md | 1297 | bc61db8b7acedad0 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | package / manifest / repair | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0009 | TOP_LEVEL | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20 (1).md | 64892 | 85bb88d9f1f44cbc | DUPLICATE_SOURCE | RAW-0011 | UNKNOWN | 2026-08-20 | architecture-family registry | 72 | RAW_NARRATIVE | UNKNOWN |
| RAW-0010 | TOP_LEVEL | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20(1).json | 171140 | 8ae9190515d578c2 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | architecture-family registry | 72 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0011 | TOP_LEVEL | FAR-Lab_OSS_Architecture_Intelligence_Registry_2026-08-20(1).md | 64892 | 85bb88d9f1f44cbc | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | architecture-family registry | 72 | RAW_NARRATIVE | UNKNOWN |
| RAW-0012 | TOP_LEVEL | FAR-Lab_RU-001-004_Batch-002_Durable-Coding-Provenance-Search(1).md | 89375 | 4b0c477d850483ca | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 68 | RAW_NARRATIVE | Decision: ADAPT a layered control plane rather than adopting one engine as the whole FAR-Lab runtime. \| Decision: BUILD the integration layer from four independently replaceable planes: Client/IDE Protocol, Context Data Plane, Solver/Planner, and Sandbox/Effect Ledger. Adopt mature protocols and primitives rather than embedding one monolithic coding agent. \| Decision: BUILD a FAR-Lab Evidence Envelope from standards-based layers. Operational events, semantic provenance, research-object packaging, signed attestations, transparency evidence, environment manifests, low-level traces, and privacy p |
| RAW-0013 | TOP_LEVEL | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials(1).csv | 113065 | f43c4e696043e77d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0014 | TOP_LEVEL | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity(1).md | 64495 | 820765af63070f95 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0015 | TOP_LEVEL | deepseek_chat_FAR-Lab_20260820(1).json | 605791 | 54c7b8df92bbf372 | INGESTED | UNKNOWN | DeepSeek | 2026-08-17 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0016 | TOP_LEVEL | deepseek_chat_FAR-Lab_20260820.md | 585996 | 25775b42ae3104e5 | INGESTED | UNKNOWN | DeepSeek | 2026-08-20 | durable execution / effects / recovery | 74 | RAW_NARRATIVE | UNKNOWN |
| RAW-0017 | ARCHIVE_MEMBER | FAR-Lab_Batch-002-Candidate-Registry.csv | 32007 | d2a9cabbf89adc6e | DUPLICATE_SOURCE | RAW-0004 | UNKNOWN | 2026-08-20 | candidate/entity registry | 104 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0018 | ARCHIVE_MEMBER | FAR-Lab_Batch-002-Continuation-State.json | 116879 | 7ea3bf9138232909 | DUPLICATE_SOURCE | RAW-0005 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 104 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0019 | ARCHIVE_MEMBER | FAR-Lab_Batch-002.sha256 | 1184 | 2f996a528f631028 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0020 | ARCHIVE_MEMBER | FAR-Lab_RU-001-004_Batch-002_Durable-Coding-Provenance-Search.md | 89375 | 4b0c477d850483ca | DUPLICATE_SOURCE | RAW-0012 | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 68 | RAW_NARRATIVE | Decision: ADAPT a layered control plane rather than adopting one engine as the whole FAR-Lab runtime. \| Decision: BUILD the integration layer from four independently replaceable planes: Client/IDE Protocol, Context Data Plane, Solver/Planner, and Sandbox/Effect Ledger. Adopt mature protocols and primitives rather than embedding one monolithic coding agent. \| Decision: BUILD a FAR-Lab Evidence Envelope from standards-based layers. Operational events, semantic provenance, research-object packaging, signed attestations, transparency evidence, environment manifests, low-level traces, and privacy p |
| RAW-0021 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Continuation-State.json | 11458 | 12279e04e2b239cd | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0022 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002.sha256 | 838 | 268441d011515bc2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0023 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Harness.py | 25679 | af5c0f53a75c377c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0024 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Protocol-Summary.csv | 1050 | 2835d4f2de5444d3 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0025 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Scenario-Summary.csv | 6494 | 66957c3a2299df7d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0026 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Summary.json | 8880 | 4fd33661f3780cf8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0027 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials.csv | 113065 | f43c4e696043e77d | DUPLICATE_SOURCE | RAW-0013 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0028 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | 64495 | 820765af63070f95 | DUPLICATE_SOURCE | RAW-0014 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0029 | ARCHIVE_MEMBER | FAR-Lab_Final_Architecture-Registry.csv | 69948 | 98c5061470a2f09a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | architecture-family registry | 217 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0030 | ARCHIVE_MEMBER | FAR-Lab_Final_Candidate-Registry.csv | 150246 | facd3349aee0ee02 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | candidate/entity registry | 474 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0031 | ARCHIVE_MEMBER | FAR-Lab_Final_Decision-Records.json | 13785 | 63946e4ad69e8254 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 29 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0032 | ARCHIVE_MEMBER | FAR-Lab_Final_Evidence-Policy.md | 1279 | 50e7083d193646bc | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0033 | ARCHIVE_MEMBER | FAR-Lab_Final_Experiment-Summary.json | 4099 | fb55d3c9120369a0 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0034 | ARCHIVE_MEMBER | FAR-Lab_Final_Failure-Intelligence.csv | 80731 | d3d355ec94115fe1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | failure-intelligence registry | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0035 | ARCHIVE_MEMBER | FAR-Lab_Final_Fusion-Records.json | 12380 | cd9da37c67d6bf2d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 17 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0036 | ARCHIVE_MEMBER | FAR-Lab_Final_Performance-Intelligence.csv | 31251 | d291e8cdd7b58716 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | performance-intelligence registry | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0037 | ARCHIVE_MEMBER | FAR-Lab_Final_Previous-Artifact-Manifest.csv | 26954 | 0bf45205a4ff640b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0038 | ARCHIVE_MEMBER | FAR-Lab_Final_Primitive-Registry.csv | 104098 | 5d07447000733f94 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | technology-primitive registry | 400 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0039 | ARCHIVE_MEMBER | FAR-Lab_Final_Reference-Architecture.md | 1879 | 318277cdcc51d32f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0040 | ARCHIVE_MEMBER | FAR-Lab_Final_Research-Coverage-Matrix.csv | 4001 | 8dd567a03098aa60 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | research coverage matrix | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0041 | ARCHIVE_MEMBER | FAR-Lab_Final_Source-Registry.csv | 53923 | 7a5634639b0ca895 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | external source registry | 218 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0042 | ARCHIVE_MEMBER | FAR-Lab_Final_White-Space-Registry.csv | 34289 | d681ee87def81041 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | innovation white-space registry | 100 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0043 | ARCHIVE_MEMBER | capability-revocation.csv | 150182 | 71d78467b71704a1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / formal methods / evaluation | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0044 | ARCHIVE_MEMBER | carbon-scheduling.csv | 218433 | c364021085aaeef4 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0045 | ARCHIVE_MEMBER | crdt-invariant.csv | 103093 | b6b19aa6f6e5a4d8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | collaboration / local-first / plugins | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0046 | ARCHIVE_MEMBER | evidence-hash-chain.csv | 6180 | 2d8603b9921d9252 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0047 | ARCHIVE_MEMBER | metadata-disagreement.csv | 482123 | f7b21e3d2bca6271 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0048 | ARCHIVE_MEMBER | numerical-reproducibility.csv | 76371 | b3b2d61ca227d410 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | HPC / numerical / simulation / optimization | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0049 | ARCHIVE_MEMBER | publication-drift.csv | 77315 | 34776d986beae2c3 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0050 | ARCHIVE_MEMBER | recovery-storm.csv | 970 | 02c6f2d90326f2cc | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0051 | ARCHIVE_MEMBER | sequential-peeking.csv | 186030 | a092cbfae3a8fceb | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | statistics / causal / experimental design / autonomous science | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0052 | ARCHIVE_MEMBER | units-uncertainty.csv | 660187 | 9feefcf3193bd049 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0053 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Harness.py | 10590 | 971ea6cb9315b262 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0054 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Summary.json | 5287 | 76deebb4d4fab531 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0055 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Trials.csv | 4494 | d9469c9fff207a0c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0056 | ARCHIVE_MEMBER | FAR-Lab-Input-Document-Index.json | 94625 | 730f4368bedf19e6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 17 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0057 | ARCHIVE_MEMBER | FAR-Lab_Batch-002-Candidate-Registry.csv | 32007 | d2a9cabbf89adc6e | DUPLICATE_SOURCE | RAW-0004 | UNKNOWN | 2026-08-20 | candidate/entity registry | 104 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0058 | ARCHIVE_MEMBER | FAR-Lab_Batch-002-Continuation-State.json | 116879 | 7ea3bf9138232909 | DUPLICATE_SOURCE | RAW-0005 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 104 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0059 | ARCHIVE_MEMBER | FAR-Lab_Batch-002.sha256 | 1184 | 2f996a528f631028 | DUPLICATE_SOURCE | RAW-0019 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0060 | ARCHIVE_MEMBER | FAR-Lab_Batch-002_Research-Package.sha256 | 105 | 98b5d2f091ac3c08 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0061 | ARCHIVE_MEMBER | FAR-Lab_Batch-002_Research-Package.zip | 110492 | b43349352d45f9eb | DUPLICATE_SOURCE | RAW-0006 | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0062 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Browser-Continuity-rerun.log | 297 | 22aefa784d0baf8b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0063 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Checkpoint-Security-Adversarial-Proof.json | 7674 | d013fc6ef291e579 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0064 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Checkpoint-Security-Adversarial-Proof.md | 1247 | b91741362c7f4c90 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0065 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Checkpoint-Security-State.db | 12288 | e4f58a0fcacf1a8e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0066 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-GPU-Checkpoint-Probe.json | 4729 | b6ea1b932d4b748a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0067 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-GPU-Checkpoint-Probe.md | 1077 | 411941d94b589ac3 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0068 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Multiprocess-Checkpoint-Restart-Proof.json | 4337 | 1138ffc97a5311df | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0069 | ARCHIVE_MEMBER | FAR-Lab_Batch-003-Multiprocess-Checkpoint-Restart-Proof.md | 973 | 612048944b8a095a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0070 | ARCHIVE_MEMBER | crash-once-2.marker | 54 | baf5694479d3ca99 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0071 | ARCHIVE_MEMBER | events.jsonl | 18553 | 39c1acaca4437a91 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0072 | ARCHIVE_MEMBER | shard-0.json | 279 | d38c598b33afb007 | DUPLICATE_SOURCE | RAW-0076 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0073 | ARCHIVE_MEMBER | shard-1.json | 284 | 02d2e99a8ad8952c | DUPLICATE_SOURCE | RAW-0077 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0074 | ARCHIVE_MEMBER | shard-2.json | 284 | 18896b9ba5c97151 | DUPLICATE_SOURCE | RAW-0078 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0075 | ARCHIVE_MEMBER | shard-3.json | 284 | 4f3889c238ac8a1a | DUPLICATE_SOURCE | RAW-0079 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0076 | ARCHIVE_MEMBER | shard-0.json | 279 | d38c598b33afb007 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0077 | ARCHIVE_MEMBER | shard-1.json | 284 | 02d2e99a8ad8952c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0078 | ARCHIVE_MEMBER | shard-2.json | 284 | 18896b9ba5c97151 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0079 | ARCHIVE_MEMBER | shard-3.json | 284 | 4f3889c238ac8a1a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0080 | ARCHIVE_MEMBER | shard-0.json | 352 | c0f0e9868489338d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0081 | ARCHIVE_MEMBER | shard-1.json | 362 | b53368e89988161a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0082 | ARCHIVE_MEMBER | shard-2.json | 366 | c1e3b4f166a1daaa | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0083 | ARCHIVE_MEMBER | shard-3.json | 362 | 944aa519ce6f66b5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0084 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Harness.py | 10590 | 971ea6cb9315b262 | DUPLICATE_SOURCE | RAW-0053 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0085 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Summary.json | 5287 | 76deebb4d4fab531 | DUPLICATE_SOURCE | RAW-0054 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0086 | ARCHIVE_MEMBER | FAR-Lab_Batch-003_Synthetic-Architecture-Trials.csv | 4494 | d9469c9fff207a0c | DUPLICATE_SOURCE | RAW-0055 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0087 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Isolation-Proof.json | 2515 | d9a390f05f9dfa4d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0088 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Isolation-Proof.md | 975 | 27407fb1d8e10fa9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0089 | ARCHIVE_MEMBER | bubblewrap-install.log | 364 | 690eedad8ac1ea28 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / formal methods / evaluation | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0090 | ARCHIVE_MEMBER | landlock_probe | 16576 | ea869c15e41e19ba | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0091 | ARCHIVE_MEMBER | landlock_probe.c | 4302 | 1a21b1c892e3d028 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0092 | ARCHIVE_MEMBER | outside-secret.txt | 19 | 8e0a51b0ffe9ebd9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0093 | ARCHIVE_MEMBER | preinstall-probe.txt | 145 | 1672671d2d4e640e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0094 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Model-Agent-Execution-Capability-Probe.json | 3052 | 4d0312cb433afed8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0095 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Model-Agent-Execution-Capability-Probe.md | 609 | 764c5e05f11b5d6b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0096 | ARCHIVE_MEMBER | COMMIT_EDITMSG | 48 | e018d5400deec3a7 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0097 | ARCHIVE_MEMBER | HEAD | 21 | 28d25bf82af4c0e2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0098 | ARCHIVE_MEMBER | ORIG_HEAD | 41 | 7a13651ce23e46d6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0099 | ARCHIVE_MEMBER | config | 148 | 49650da094bb433f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0100 | ARCHIVE_MEMBER | description | 73 | 85ab6c163d43a17e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0101 | ARCHIVE_MEMBER | applypatch-msg.sample | 478 | 0223497a0b8b033a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0102 | ARCHIVE_MEMBER | commit-msg.sample | 896 | 1f74d5e9292979b5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0103 | ARCHIVE_MEMBER | fsmonitor-watchman.sample | 4726 | e0549964e93897b5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0104 | ARCHIVE_MEMBER | post-update.sample | 189 | 81765af2daef3230 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0105 | ARCHIVE_MEMBER | pre-applypatch.sample | 424 | e15c5b469ea3e0a6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0106 | ARCHIVE_MEMBER | pre-commit.sample | 1649 | 57185b7b9f05239d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0107 | ARCHIVE_MEMBER | pre-merge-commit.sample | 416 | d3825a70337940eb | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0108 | ARCHIVE_MEMBER | pre-push.sample | 1374 | ecce9c7e04d3f5dd | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0109 | ARCHIVE_MEMBER | pre-rebase.sample | 4898 | 4febce8677900523 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0110 | ARCHIVE_MEMBER | pre-receive.sample | 544 | a4c3d2b9c7bb3fd8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0111 | ARCHIVE_MEMBER | prepare-commit-msg.sample | 1492 | e9ddcaa4189fddd2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0112 | ARCHIVE_MEMBER | push-to-checkout.sample | 2783 | a53d0741798b287c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0113 | ARCHIVE_MEMBER | sendemail-validate.sample | 2308 | 44ebfc923dc5466b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0114 | ARCHIVE_MEMBER | update.sample | 3650 | 8d5f2fa83e103cf0 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0115 | ARCHIVE_MEMBER | index | 351 | a9bcd52dc3c064a5 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0116 | ARCHIVE_MEMBER | exclude | 240 | 6671fe83b7a07c89 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0117 | ARCHIVE_MEMBER | HEAD | 1244 | 763d9dd6d4f1bd49 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0118 | ARCHIVE_MEMBER | agent-a | 370 | ccb4e21b67d954bf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0119 | ARCHIVE_MEMBER | agent-b | 374 | 1cd2fa91a267e9ac | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0120 | ARCHIVE_MEMBER | agent-bad | 373 | 5b0a9ab3859caa47 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0121 | ARCHIVE_MEMBER | gate-agent-bad | 159 | 4bcd03f87ca66be8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0122 | ARCHIVE_MEMBER | main | 542 | 100e2e54613cf280 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0123 | ARCHIVE_MEMBER | a5b4105bcb05df330e56d3688c36e46fe3d883 | 219 | 0846ab360665e1e2 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0124 | ARCHIVE_MEMBER | ae36a4761300fece82ab20155fb91809dfcc37 | 301 | f9f420d03d619178 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0125 | ARCHIVE_MEMBER | 0c6bcd0389cb4b6a5e58e0e5b16a68a7b2b8b1 | 135 | 8fe653eb35e4427a | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0126 | ARCHIVE_MEMBER | 860d204aa132990542f6a072ac9089958b5ba0 | 63 | 5ca29450f9f7d51b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0127 | ARCHIVE_MEMBER | 50740652cd97a450e14c5fd20cf9ac863ae0b1 | 392 | 5ca61318b7c26561 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0128 | ARCHIVE_MEMBER | aeed7abc880bb016f97014ba4ac2b80cc800ac | 184 | 04ea75766b1ec63d | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0129 | ARCHIVE_MEMBER | c3a04ea6e2ebfab7912ef2003fc57e43186c9c | 208 | f486a011bd0d71c7 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0130 | ARCHIVE_MEMBER | 0e657da52783a4dae611e8a4c31de8fb8d9086 | 62 | afe5278c4ee5d380 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0131 | ARCHIVE_MEMBER | fd3b8226a49e90bee8c1a313e8ad36cfb762d0 | 134 | 64895968ac76eeb0 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0132 | ARCHIVE_MEMBER | 680fae6eb18f3fabbdde3f495426be50eecd6f | 90 | 7fdbe5548eb1e0ac | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0133 | ARCHIVE_MEMBER | cb608adfc1d382bac66100150e7bf9d5e0fb47 | 63 | 4c4e13363ee8c6f5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0134 | ARCHIVE_MEMBER | 960bb04e2801db6ad4a9d897cadedf68913b27 | 180 | 758c86985da1439d | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0135 | ARCHIVE_MEMBER | 7e1214c0836f3f1ff213dd19232c02a03914b2 | 90 | 1113ecefaff67d87 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0136 | ARCHIVE_MEMBER | 63fc183683b88c5d6d4445d6bf0fc76bca8c55 | 341 | 6f216250fc8fffe1 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0137 | ARCHIVE_MEMBER | 68325e6fc0d0a9873e1f66c78b052ecb39f52d | 222 | dfbd39d6dd84f00d | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0138 | ARCHIVE_MEMBER | 6895bc6caa7abae52ccd6283b4240a3fde420c | 189 | 28c6c18cf5caf4ed | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0139 | ARCHIVE_MEMBER | 09fa1d377306ddb5bef9d1c6c7a7504ce02131 | 139 | e25f9eea0bcf04d7 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0140 | ARCHIVE_MEMBER | 0bec50aff02cf59b7d4cab8e68b0a10e58f6c1 | 181 | db3f70782d385aed | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0141 | ARCHIVE_MEMBER | c8095356925b56e7863dc80de110d9323e8ac4 | 312 | 311b61d98a1d2753 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0142 | ARCHIVE_MEMBER | 95b035cde15ae3346f8bd6a3e26f2bfb22a7ca | 183 | d78f178b733ae434 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0143 | ARCHIVE_MEMBER | bf0a1b21a8ce5bed57fe8fc83ac648895203bc | 63 | c9b181768ddf9fca | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0144 | ARCHIVE_MEMBER | 5a692af04178ba336c576eb93e4a6037b29559 | 136 | 1178c06d8e519c5d | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0145 | ARCHIVE_MEMBER | 62e1ac0ae9f8f5c6b234381d1b906596f3db52 | 399 | e7715e9da256dead | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0146 | ARCHIVE_MEMBER | 1cc045b4d1e5d6eb5c5135dd083f414188bad7 | 89 | 9c9a83d8129ba274 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0147 | ARCHIVE_MEMBER | 8b40a19fdb786f55d6bcb1473659f557c970e8 | 90 | 52a9f6843e05d7a1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0148 | ARCHIVE_MEMBER | d874d7e8c5901f684884d56b62e9dfd3e438f1 | 89 | 371a506f5bb2378e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0149 | ARCHIVE_MEMBER | 6690e2aa939c2e31dea026909657d2d2dd44f3 | 63 | eeb2291234f4f5c7 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0150 | ARCHIVE_MEMBER | d80fb0361c556ff9a46a96f3c002a954f0da5c | 145 | 42f695849e08c32e | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0151 | ARCHIVE_MEMBER | 7585c78985711297259dd6b7ab12642d58a5bf | 328 | 3469be0c12e4b9a2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0152 | ARCHIVE_MEMBER | 26466beb50e90e86b6139ffaa4f70af72c97b1 | 273 | 9595f1d456138f82 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0153 | ARCHIVE_MEMBER | 60ac29e4dd8ea8535e135e16900d122ea203ed | 201 | b6e37ef43cfe87cd | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0154 | ARCHIVE_MEMBER | agent-a | 41 | a7bba4e177eca4c9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0155 | ARCHIVE_MEMBER | agent-b | 41 | ea60afea91d5cfaa | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0156 | ARCHIVE_MEMBER | agent-bad | 41 | 8df1373a81c065b1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0157 | ARCHIVE_MEMBER | gate-agent-bad | 41 | 7a13651ce23e46d6 | DUPLICATE_SOURCE | RAW-0098 | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0158 | ARCHIVE_MEMBER | main | 41 | 7a13651ce23e46d6 | DUPLICATE_SOURCE | RAW-0098 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0159 | ARCHIVE_MEMBER | COMMIT_EDITMSG | 34 | db2a3aa3d37411fc | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0160 | ARCHIVE_MEMBER | HEAD | 24 | 4cea47df61d14f01 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0161 | ARCHIVE_MEMBER | ORIG_HEAD | 41 | 538fa22e4a940df9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0162 | ARCHIVE_MEMBER | commondir | 6 | 340ddcb67a6204f7 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0163 | ARCHIVE_MEMBER | gitdir | 73 | 3ee52b4d2ae97a99 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0164 | ARCHIVE_MEMBER | index | 263 | 6a7d0d81d06cd57c | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0165 | ARCHIVE_MEMBER | HEAD | 463 | a1dd216b7ff35083 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0166 | ARCHIVE_MEMBER | COMMIT_EDITMSG | 38 | 3fb255dbc19d147a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0167 | ARCHIVE_MEMBER | HEAD | 24 | d0a7cdbe1f1726ac | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0168 | ARCHIVE_MEMBER | ORIG_HEAD | 41 | 538fa22e4a940df9 | DUPLICATE_SOURCE | RAW-0161 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0169 | ARCHIVE_MEMBER | commondir | 6 | 340ddcb67a6204f7 | DUPLICATE_SOURCE | RAW-0162 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0170 | ARCHIVE_MEMBER | gitdir | 73 | 0f65bbb1fc2dbb25 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0171 | ARCHIVE_MEMBER | index | 263 | 4c2a1ff7ec82250c | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0172 | ARCHIVE_MEMBER | HEAD | 467 | ba8577ca09b7b1c0 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0173 | ARCHIVE_MEMBER | COMMIT_EDITMSG | 37 | d8c7ff122ba41600 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0174 | ARCHIVE_MEMBER | HEAD | 26 | 14ec9902ad5f6e36 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0175 | ARCHIVE_MEMBER | ORIG_HEAD | 41 | 538fa22e4a940df9 | DUPLICATE_SOURCE | RAW-0161 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0176 | ARCHIVE_MEMBER | commondir | 6 | 340ddcb67a6204f7 | DUPLICATE_SOURCE | RAW-0162 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0177 | ARCHIVE_MEMBER | gitdir | 75 | 386175c6b335c4a6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0178 | ARCHIVE_MEMBER | index | 263 | 89b5dc7035a14ecd | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0179 | ARCHIVE_MEMBER | HEAD | 466 | 34e75003e2dd070f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0180 | ARCHIVE_MEMBER | MERGE_PROVENANCE.json | 611 | bc5f8624d8f19d70 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | data / search / knowledge / provenance | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0181 | ARCHIVE_MEMBER | calculator.cpython-313.pyc | 1030 | eb0337498f0b1dca | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0182 | ARCHIVE_MEMBER | calculator.py | 515 | 8247a0c465725b79 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0183 | ARCHIVE_MEMBER | test_calculator.cpython-313.pyc | 2480 | 28046209ee76711e | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0184 | ARCHIVE_MEMBER | test_calculator.py | 740 | fc9fd8f02a7e2f10 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0185 | ARCHIVE_MEMBER | .git | 96 | 8d918e2979cca756 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0186 | ARCHIVE_MEMBER | calculator.cpython-313.pyc | 712 | 3548a1b8e73f09f7 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0187 | ARCHIVE_MEMBER | calculator.py | 342 | 68785bdd7fad368f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0188 | ARCHIVE_MEMBER | test_calculator.cpython-313.pyc | 2023 | 480a206ba03015b6 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0189 | ARCHIVE_MEMBER | test_calculator.py | 602 | 1bdaa3e1c8fc63b6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0190 | ARCHIVE_MEMBER | .git | 96 | f2854db17a8f81ee | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0191 | ARCHIVE_MEMBER | calculator.cpython-313.pyc | 805 | 3531d413065cb9c8 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0192 | ARCHIVE_MEMBER | calculator.py | 329 | 489ad8915de61a37 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0193 | ARCHIVE_MEMBER | test_calculator.cpython-313.pyc | 1543 | 361e1a9857ffe197 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0194 | ARCHIVE_MEMBER | test_calculator.py | 440 | 4e98f24236f2bc44 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0195 | ARCHIVE_MEMBER | .git | 98 | 71540c8cff139e59 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0196 | ARCHIVE_MEMBER | calculator.cpython-313.pyc | 493 | b385a7987eb0f572 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0197 | ARCHIVE_MEMBER | calculator.py | 178 | 1c2df6a95aa0b98e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0198 | ARCHIVE_MEMBER | test_calculator.cpython-313.pyc | 1091 | b8d79624f943398f | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0199 | ARCHIVE_MEMBER | test_calculator.py | 306 | 0ece07e8abcf480e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0200 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Network-Effect-Protocol-Proof.json | 6408 | 940feb78e1529f82 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0201 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Network-Effect-Protocol-Proof.md | 1343 | 3409527c46fb7620 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0202 | ARCHIVE_MEMBER | ledger-events.jsonl | 1200 | 81362306e90d0fc4 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0203 | ARCHIVE_MEMBER | ledger.db | 20480 | d311d0d34c1ea473 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0204 | ARCHIVE_MEMBER | port.txt | 5 | b20b0d8d99be2693 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0205 | ARCHIVE_MEMBER | target-events.jsonl | 3118 | de6ecdb2a27e5fca | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0206 | ARCHIVE_MEMBER | target.db | 20480 | ed0c368746711bf4 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0207 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Semantic-Browser-Continuation-Proof.json | 2426 | c00738ee6d1cd7c3 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0208 | ARCHIVE_MEMBER | FAR-Lab_Batch-004-Semantic-Browser-Continuation-Proof.md | 96 | 9c16b61a27c36d42 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0209 | ARCHIVE_MEMBER | journal.db | 12288 | b455cb7bb71d05da | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0210 | ARCHIVE_MEMBER | run_playwright.py | 2738 | 4b9a81becfe86ad2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0211 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Candidate-Registry.csv | 23774 | 7a2a73c8995ce0d7 | DUPLICATE_SOURCE | RAW-0457 | UNKNOWN | 2026-08-20 | candidate/entity registry | 47 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0212 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Multi-Replica-Rollback-Prevention-Proof.json | 4175 | ce2ad1c5f9239c87 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0213 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Multi-Replica-Rollback-Prevention-Proof.md | 973 | 81844c0754faea4b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0214 | ARCHIVE_MEMBER | authority.db | 12288 | 4a13f8e632e37032 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0215 | ARCHIVE_MEMBER | events.jsonl | 3531 | e85ff53184651113 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0216 | ARCHIVE_MEMBER | region-a.db | 28672 | 750d27b90e90704d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0217 | ARCHIVE_MEMBER | region-b.db | 28672 | e9acd82d7bde5427 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0218 | ARCHIVE_MEMBER | region-c.db | 28672 | d0a9e916146becaf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0219 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Source-Registry.json | 8400 | 4a5f61bd62d196b7 | DUPLICATE_SOURCE | RAW-0458 | UNKNOWN | 2026-08-20 | external source registry | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0220 | ARCHIVE_MEMBER | COMMIT_EDITMSG | 29 | 23973152af95e955 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0221 | ARCHIVE_MEMBER | HEAD | 21 | 28d25bf82af4c0e2 | DUPLICATE_SOURCE | RAW-0097 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0222 | ARCHIVE_MEMBER | config | 148 | 49650da094bb433f | DUPLICATE_SOURCE | RAW-0099 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0223 | ARCHIVE_MEMBER | description | 73 | 85ab6c163d43a17e | DUPLICATE_SOURCE | RAW-0100 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0224 | ARCHIVE_MEMBER | applypatch-msg.sample | 478 | 0223497a0b8b033a | DUPLICATE_SOURCE | RAW-0101 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0225 | ARCHIVE_MEMBER | commit-msg.sample | 896 | 1f74d5e9292979b5 | DUPLICATE_SOURCE | RAW-0102 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0226 | ARCHIVE_MEMBER | fsmonitor-watchman.sample | 4726 | e0549964e93897b5 | DUPLICATE_SOURCE | RAW-0103 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0227 | ARCHIVE_MEMBER | post-update.sample | 189 | 81765af2daef3230 | DUPLICATE_SOURCE | RAW-0104 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0228 | ARCHIVE_MEMBER | pre-applypatch.sample | 424 | e15c5b469ea3e0a6 | DUPLICATE_SOURCE | RAW-0105 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0229 | ARCHIVE_MEMBER | pre-commit.sample | 1649 | 57185b7b9f05239d | DUPLICATE_SOURCE | RAW-0106 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0230 | ARCHIVE_MEMBER | pre-merge-commit.sample | 416 | d3825a70337940eb | DUPLICATE_SOURCE | RAW-0107 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0231 | ARCHIVE_MEMBER | pre-push.sample | 1374 | ecce9c7e04d3f5dd | DUPLICATE_SOURCE | RAW-0108 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0232 | ARCHIVE_MEMBER | pre-rebase.sample | 4898 | 4febce8677900523 | DUPLICATE_SOURCE | RAW-0109 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0233 | ARCHIVE_MEMBER | pre-receive.sample | 544 | a4c3d2b9c7bb3fd8 | DUPLICATE_SOURCE | RAW-0110 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0234 | ARCHIVE_MEMBER | prepare-commit-msg.sample | 1492 | e9ddcaa4189fddd2 | DUPLICATE_SOURCE | RAW-0111 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0235 | ARCHIVE_MEMBER | push-to-checkout.sample | 2783 | a53d0741798b287c | DUPLICATE_SOURCE | RAW-0112 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0236 | ARCHIVE_MEMBER | sendemail-validate.sample | 2308 | 44ebfc923dc5466b | DUPLICATE_SOURCE | RAW-0113 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0237 | ARCHIVE_MEMBER | update.sample | 3650 | 8d5f2fa83e103cf0 | DUPLICATE_SOURCE | RAW-0114 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0238 | ARCHIVE_MEMBER | index | 771 | 939bc44f8a3e70f3 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | UNKNOWN | BINARY_OR_EXECUTABLE_ARTIFACT | UNKNOWN |
| RAW-0239 | ARCHIVE_MEMBER | exclude | 240 | 6671fe83b7a07c89 | DUPLICATE_SOURCE | RAW-0116 | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0240 | ARCHIVE_MEMBER | HEAD | 180 | f11aab0e58283324 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0241 | ARCHIVE_MEMBER | main | 180 | f11aab0e58283324 | DUPLICATE_SOURCE | RAW-0240 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0242 | ARCHIVE_MEMBER | fa55f25df234a8981a9d4c2ac6b1b59a942a59 | 303 | 45d9be78985f3c4d | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0243 | ARCHIVE_MEMBER | b95fef605eb929a202510e6761910ab531041d | 101 | c65df64674d7af47 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0244 | ARCHIVE_MEMBER | 2347bfe892901f661d935ed1c520b14454900b | 68 | 48897701f78a8845 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0245 | ARCHIVE_MEMBER | e7e29627edc37fbeac1012be3786cd9af9a2b1 | 58 | dede7fb65bc5cecd | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0246 | ARCHIVE_MEMBER | 5e4b59a8d014843c9ebf2b01dad1d5fe5fc59a | 144 | c7a6f4810981ba6f | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0247 | ARCHIVE_MEMBER | 285c9f8f71a99cb88565ddc01638610793a493 | 380 | f4e4a060d94aa4b7 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0248 | ARCHIVE_MEMBER | d719d8ee07bdfeb819df66bb54aab729fa7f93 | 101 | 5a765427ba1bd140 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0249 | ARCHIVE_MEMBER | ec2af2a9458b641152afcef0af3ecd194bab76 | 71 | a7f6ae59102b393d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0250 | ARCHIVE_MEMBER | e58fb493d2a13ce620bd1e491797121a913dff | 55 | 4d08207ca968d1d8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0251 | ARCHIVE_MEMBER | f3e9389a2d6f69216f2629f23c15314982b2cb | 71 | aa1b48d13073fac1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0252 | ARCHIVE_MEMBER | a4e453f183259d4728328f734e4b9a9149dbe4 | 95 | 8bb7c40d0b2174a8 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | UNKNOWN | GENERATED_GIT_OBJECT | UNKNOWN |
| RAW-0253 | ARCHIVE_MEMBER | 0c28868656f6171524b0d7a6b74c6287c54c51 | 82 | c153c3eb52bddbdf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0254 | ARCHIVE_MEMBER | main | 41 | f18ccae400ba825b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0255 | ARCHIVE_MEMBER | post-checkout | 91 | f56f62f5aca5b08a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0256 | ARCHIVE_MEMBER | .gitmodules | 56 | aa713ff8d993790c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0257 | ARCHIVE_MEMBER | tasks.json | 90 | 6cbe8fd0c1f1f69f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0258 | ARCHIVE_MEMBER | AGENTS.md | 90 | 4409f66128a2e0e8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0259 | ARCHIVE_MEMBER | secret.txt | 19 | 10e652e880fd3196 | DUPLICATE_SOURCE | RAW-0263 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0260 | ARCHIVE_MEMBER | escape-secret | 19 | 10e652e880fd3196 | DUPLICATE_SOURCE | RAW-0263 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0261 | ARCHIVE_MEMBER | malicious_tool.py | 795 | 9fbb3c32d3a38b2d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0262 | ARCHIVE_MEMBER | package.json | 57 | e4166021e5cc2dd2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0263 | ARCHIVE_MEMBER | secret.txt | 19 | 10e652e880fd3196 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0264 | ARCHIVE_MEMBER | FAR-Lab_Batch-006-Candidate-Registry.csv | 16629 | 73d1fd89e7467403 | DUPLICATE_SOURCE | RAW-0470 | UNKNOWN | UNKNOWN | candidate/entity registry | 37 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0265 | ARCHIVE_MEMBER | FAR-Lab_Batch-006-Source-Registry.json | 8898 | f144efafba987467 | DUPLICATE_SOURCE | RAW-0471 | UNKNOWN | UNKNOWN | external source registry | 43 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0266 | ARCHIVE_MEMBER | FAR-Lab_Batch-007-Candidate-Registry.csv | 23065 | 06c54c40915786ed | DUPLICATE_SOURCE | RAW-0440 | UNKNOWN | UNKNOWN | candidate/entity registry | 40 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0267 | ARCHIVE_MEMBER | FAR-Lab_Batch-007-Source-Registry.json | 9615 | dd99c85c2812ca2c | DUPLICATE_SOURCE | RAW-0441 | UNKNOWN | UNKNOWN | external source registry | 49 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0268 | ARCHIVE_MEMBER | FAR-Lab_Batch-008-Candidate-Registry.csv | 26025 | a8886da3f34a30f9 | DUPLICATE_SOURCE | RAW-0538 | UNKNOWN | UNKNOWN | candidate/entity registry | 40 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0269 | ARCHIVE_MEMBER | FAR-Lab_Batch-008-Source-Registry.json | 9719 | ad6837c10e308347 | DUPLICATE_SOURCE | RAW-0539 | UNKNOWN | UNKNOWN | external source registry | 50 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0270 | ARCHIVE_MEMBER | FAR-Lab_Batch-009-Candidate-Registry.csv | 28909 | 1912442332c06f70 | DUPLICATE_SOURCE | RAW-0524 | UNKNOWN | UNKNOWN | candidate/entity registry | 42 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0271 | ARCHIVE_MEMBER | FAR-Lab_Batch-009-Source-Registry.json | 11612 | 8d0c1779abb6877c | DUPLICATE_SOURCE | RAW-0525 | UNKNOWN | UNKNOWN | external source registry | 56 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0272 | ARCHIVE_MEMBER | FAR-Lab_Effect-Ledger-Failure-Benchmark-Replications.json | 62825 | 86783572ef8fd55a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0273 | ARCHIVE_MEMBER | FAR-Lab_Effect-Ledger-Failure-Benchmark.csv | 1873 | c23eec1429f5316a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0274 | ARCHIVE_MEMBER | FAR-Lab_Effect-Ledger-Failure-Benchmark.json | 5796 | 1775c30aecbee61c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0275 | ARCHIVE_MEMBER | FAR-Lab_Effect-Ledger-Failure-Benchmark.py | 20230 | f207275a79e8dde5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0276 | ARCHIVE_MEMBER | FAR-Lab_Final_Architecture-Registry.csv | 69948 | 98c5061470a2f09a | DUPLICATE_SOURCE | RAW-0029 | UNKNOWN | UNKNOWN | architecture-family registry | 217 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0277 | ARCHIVE_MEMBER | FAR-Lab_Final_Candidate-Registry.csv | 150246 | facd3349aee0ee02 | DUPLICATE_SOURCE | RAW-0030 | UNKNOWN | 2026-08-20 | candidate/entity registry | 474 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0278 | ARCHIVE_MEMBER | FAR-Lab_Final_Decision-Records.json | 13785 | 63946e4ad69e8254 | DUPLICATE_SOURCE | RAW-0031 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 29 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0279 | ARCHIVE_MEMBER | FAR-Lab_Final_Evidence-Policy.md | 1279 | 50e7083d193646bc | DUPLICATE_SOURCE | RAW-0032 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0280 | ARCHIVE_MEMBER | FAR-Lab_Final_Experiment-Summary.json | 4099 | fb55d3c9120369a0 | DUPLICATE_SOURCE | RAW-0033 | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0281 | ARCHIVE_MEMBER | FAR-Lab_Final_Failure-Intelligence.csv | 80731 | d3d355ec94115fe1 | DUPLICATE_SOURCE | RAW-0034 | UNKNOWN | UNKNOWN | failure-intelligence registry | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0282 | ARCHIVE_MEMBER | FAR-Lab_Final_Fusion-Records.json | 12380 | cd9da37c67d6bf2d | DUPLICATE_SOURCE | RAW-0035 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 17 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0283 | ARCHIVE_MEMBER | FAR-Lab_Final_Performance-Intelligence.csv | 31251 | d291e8cdd7b58716 | DUPLICATE_SOURCE | RAW-0036 | UNKNOWN | UNKNOWN | performance-intelligence registry | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0284 | ARCHIVE_MEMBER | FAR-Lab_Final_Previous-Artifact-Manifest.csv | 26954 | 0bf45205a4ff640b | DUPLICATE_SOURCE | RAW-0037 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0285 | ARCHIVE_MEMBER | FAR-Lab_Final_Primitive-Registry.csv | 104098 | 5d07447000733f94 | DUPLICATE_SOURCE | RAW-0038 | UNKNOWN | UNKNOWN | technology-primitive registry | 400 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0286 | ARCHIVE_MEMBER | FAR-Lab_Final_Reference-Architecture.md | 1879 | 318277cdcc51d32f | DUPLICATE_SOURCE | RAW-0039 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0287 | ARCHIVE_MEMBER | FAR-Lab_Final_Research-Coverage-Matrix.csv | 4001 | 8dd567a03098aa60 | DUPLICATE_SOURCE | RAW-0040 | UNKNOWN | UNKNOWN | research coverage matrix | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0288 | ARCHIVE_MEMBER | FAR-Lab_Final_Source-Registry.csv | 53923 | 7a5634639b0ca895 | DUPLICATE_SOURCE | RAW-0041 | UNKNOWN | 2026-08-20 | external source registry | 218 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0289 | ARCHIVE_MEMBER | FAR-Lab_Final_White-Space-Registry.csv | 34289 | d681ee87def81041 | DUPLICATE_SOURCE | RAW-0042 | UNKNOWN | UNKNOWN | innovation white-space registry | 100 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0290 | ARCHIVE_MEMBER | capability-revocation.csv | 150182 | 71d78467b71704a1 | DUPLICATE_SOURCE | RAW-0043 | UNKNOWN | UNKNOWN | security / formal methods / evaluation | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0291 | ARCHIVE_MEMBER | carbon-scheduling.csv | 218433 | c364021085aaeef4 | DUPLICATE_SOURCE | RAW-0044 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0292 | ARCHIVE_MEMBER | crdt-invariant.csv | 103093 | b6b19aa6f6e5a4d8 | DUPLICATE_SOURCE | RAW-0045 | UNKNOWN | UNKNOWN | collaboration / local-first / plugins | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0293 | ARCHIVE_MEMBER | evidence-hash-chain.csv | 6180 | 2d8603b9921d9252 | DUPLICATE_SOURCE | RAW-0046 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0294 | ARCHIVE_MEMBER | metadata-disagreement.csv | 482123 | f7b21e3d2bca6271 | DUPLICATE_SOURCE | RAW-0047 | UNKNOWN | UNKNOWN | data / search / provenance / knowledge | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0295 | ARCHIVE_MEMBER | numerical-reproducibility.csv | 76371 | b3b2d61ca227d410 | DUPLICATE_SOURCE | RAW-0048 | UNKNOWN | UNKNOWN | HPC / numerical / simulation / optimization | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0296 | ARCHIVE_MEMBER | publication-drift.csv | 77315 | 34776d986beae2c3 | DUPLICATE_SOURCE | RAW-0049 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0297 | ARCHIVE_MEMBER | recovery-storm.csv | 970 | 02c6f2d90326f2cc | DUPLICATE_SOURCE | RAW-0050 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0298 | ARCHIVE_MEMBER | sequential-peeking.csv | 186030 | a092cbfae3a8fceb | DUPLICATE_SOURCE | RAW-0051 | UNKNOWN | UNKNOWN | statistics / causal / experimental design / autonomous science | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0299 | ARCHIVE_MEMBER | units-uncertainty.csv | 660187 | 9feefcf3193bd049 | DUPLICATE_SOURCE | RAW-0052 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0300 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-004.md | 6099 | 60c9a8edd5447911 | DUPLICATE_SOURCE | RAW-0508 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0301 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-005.md | 2155 | 7583b146ac80e8b5 | DUPLICATE_SOURCE | RAW-0459 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0302 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-006.md | 2950 | 219fe7c1d1d8f5f9 | DUPLICATE_SOURCE | RAW-0472 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0303 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-007.md | 1445 | d3f394597029f614 | DUPLICATE_SOURCE | RAW-0442 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0304 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-008.md | 1260 | 7a06e25236f86434 | DUPLICATE_SOURCE | RAW-0540 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0305 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-009.md | 2109 | 14a3af5929c7c544 | DUPLICATE_SOURCE | RAW-0526 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0306 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-004.zip | 156787 | 4e03c730a7f2c84e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0307 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-005.zip | 197736 | 41ba4e5ee277c5e4 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0308 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-006.zip | 407913 | d266b6fa60fd1538 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0309 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-007.zip | 170291 | b436c558bce24f23 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0310 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-008.zip | 183322 | 41910b4db0c0fdce | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0311 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Through-Batch-009.zip | 220326 | 3e1c38f6fb0d748a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0312 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-004.json | 122534 | 146ba464d340f77c | DUPLICATE_SOURCE | RAW-0509 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 131 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0313 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-005.json | 209783 | ea0dbacd0cfa4626 | DUPLICATE_SOURCE | RAW-0460 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 178 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0314 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.csv | 60103 | 3af67137a20b6f9a | DUPLICATE_SOURCE | RAW-0473 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 215 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0315 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.json | 286723 | 1aecc16bb2c425a6 | DUPLICATE_SOURCE | RAW-0474 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 215 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0316 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.sha256 | 471 | 6b0a903fed374d36 | DUPLICATE_SOURCE | RAW-0475 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0317 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-007.csv | 87613 | 04824bce92b8fd23 | DUPLICATE_SOURCE | RAW-0443 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 255 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0318 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-007.json | 376221 | f3936608604874a7 | DUPLICATE_SOURCE | RAW-0444 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 255 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0319 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-007.sha256 | 1028 | f1eaaeea3338a9f5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0320 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-008.csv | 113511 | f3b9a3dd61263b5f | DUPLICATE_SOURCE | RAW-0541 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 295 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0321 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-008.json | 471460 | 3def042ee658f2bb | DUPLICATE_SOURCE | RAW-0542 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 295 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0322 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-008.sha256 | 1042 | ccae5f5b2a42c915 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0323 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-009.csv | 142293 | b1ae3fe814045f2b | DUPLICATE_SOURCE | RAW-0527 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 337 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0324 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-009.json | 567620 | acd11bca79a47c48 | DUPLICATE_SOURCE | RAW-0528 | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 337 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0325 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-009.sha256 | 1038 | bd8b4c5bede40d03 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0326 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-003_Integration-Checkpoint-and-UI-State.md | 10181 | abc9e5ca663fa154 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0327 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-003_State.json | 6252 | 51040805c063110b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0328 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-004_Network-Isolation-Merge-and-Incremental.md | 8482 | cf465bbec412fd97 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0329 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-004_State.json | 3925 | 793a9ea6d04fb1a5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0330 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-005_Provenance-Untrusted-Repo-and-Rollback.md | 8362 | c71c5c1cf049f0b4 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0331 | ARCHIVE_MEMBER | FAR-Lab_Mission-Continuation_Batch-005_State.json | 4623 | 8b73f2476855a5a2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0332 | ARCHIVE_MEMBER | FAR-Lab_Mission_Master-Index_Batches-001-003.md | 1483 | 971af33b2f263aef | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0333 | ARCHIVE_MEMBER | FAR-Lab_Mission_Master-Index_Batches-001-004.md | 762 | b56eab4e9372e752 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0334 | ARCHIVE_MEMBER | FAR-Lab_Mission_Master-Index_Batches-001-005.md | 1354 | 7c49c877f4c279de | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mission constitution / governance | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0335 | ARCHIVE_MEMBER | FAR-Lab_RU-001-004_Batch-002_Durable-Coding-Provenance-Search.md | 89375 | 4b0c477d850483ca | DUPLICATE_SOURCE | RAW-0012 | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 68 | RAW_NARRATIVE | Decision: ADAPT a layered control plane rather than adopting one engine as the whole FAR-Lab runtime. \| Decision: BUILD the integration layer from four independently replaceable planes: Client/IDE Protocol, Context Data Plane, Solver/Planner, and Sandbox/Effect Ledger. Adopt mature protocols and primitives rather than embedding one monolithic coding agent. \| Decision: BUILD a FAR-Lab Evidence Envelope from standards-based layers. Operational events, semantic provenance, research-object packaging, signed attestations, transparency evidence, environment manifests, low-level traces, and privacy p |
| RAW-0336 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001-Continuation-State.json | 5258 | 0f669a515fc7b972 | DUPLICATE_SOURCE | RAW-0477 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0337 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001.sha256 | 251 | 8381cbbaff240251 | DUPLICATE_SOURCE | RAW-0478 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0338 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Continuation-State.json | 11458 | 12279e04e2b239cd | DUPLICATE_SOURCE | RAW-0021 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0339 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-DBOS-Execution-rerun.log | 146 | fa6f6d6af31b1baa | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0340 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-DBOS-Execution.json | 1776 | aecdb56b3cc2e341 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0341 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Environment-Probe.json | 1819 | 8f03b79f6834cce1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0342 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Fault-Injection-Results.json | 32078 | bde407eada1e590c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0343 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Issue-Intelligence.json | 2255 | daef9841a6d32e5d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 7 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0344 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Recovery-Storm-Results.json | 2223 | f28b1e0269134105 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0345 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Revision-2-Continuation-State.json | 13931 | 9944fe948209745e | DUPLICATE_SOURCE | RAW-0480 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0346 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Revision-2.sha256 | 1106 | 8d58ac4db8654a33 | DUPLICATE_SOURCE | RAW-0481 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0347 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002.sha256 | 838 | 268441d011515bc2 | DUPLICATE_SOURCE | RAW-0022 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0348 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark-Report.md | 6260 | 76e8af418bc2b9ee | DUPLICATE_SOURCE | RAW-0483 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0349 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.csv | 4534 | 1c1c3f9fd095452d | DUPLICATE_SOURCE | RAW-0484 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0350 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.json | 36553 | de3b82e4e0a17848 | DUPLICATE_SOURCE | RAW-0485 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0351 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.py | 32051 | 534ee5a014f03df5 | DUPLICATE_SOURCE | RAW-0486 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0352 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Process-Crash-Evidence.tar.gz | 10400 | 56d71028697fa8af | DUPLICATE_SOURCE | RAW-0487 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0353 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-001_Durable-Agent-Runtime.md | 96178 | 5f9b295d6690ac9b | DUPLICATE_SOURCE | RAW-0461 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 13 | RAW_NARRATIVE | 本批次不是“推荐几个 Agent 框架”，而是把长期自主执行问题拆成控制状态、外部效果、执行环境、监督恢复、版本兼容、安全与科研证据链等可独立判断的技术层。 \| `Tier` 评价的是对 FAR-Lab 决策空间的价值，不等于建议整体采用。项目级与组件级价值分开判断。 \| 本节是工程情报，不是法律意见。任何生产采用仍需由合格法律顾问结合 FAR-Lab 的部署和商业模式复核。 |
| RAW-0354 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Harness.py | 25679 | af5c0f53a75c377c | DUPLICATE_SOURCE | RAW-0023 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0355 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Protocol-Summary.csv | 1050 | 2835d4f2de5444d3 | DUPLICATE_SOURCE | RAW-0024 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0356 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Scenario-Summary.csv | 6494 | 66957c3a2299df7d | DUPLICATE_SOURCE | RAW-0025 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0357 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Summary.json | 8880 | 4fd33661f3780cf8 | DUPLICATE_SOURCE | RAW-0026 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0358 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials.csv | 113065 | f43c4e696043e77d | DUPLICATE_SOURCE | RAW-0013 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0359 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | 64495 | 820765af63070f95 | DUPLICATE_SOURCE | RAW-0014 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0360 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md | 47140 | 9a4c0bb74d09125d | DUPLICATE_SOURCE | RAW-0495 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 29 | RAW_NARRATIVE | 本批不再问“哪个工作流引擎更好”，而是追问：在崩溃、取消、租约转移、网络超时、重放、版本变化、GPU/浏览器/实验设备恢复时，系统怎样证明某个外部动作到底发生了什么、谁仍有权提交、何时可以安全继续。 \| **Fencing 保护的是本地权威状态，不会自动撤销或阻止已经越过边界的外部动作。** |
| RAW-0361 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Revision-2_Effect-Semantics-and-Continuity.md | 122012 | b72a9d4f1bb447f5 | DUPLICATE_SOURCE | RAW-0496 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | Revision 2 合并了原 BATCH 002 的广域候选/连续性研究与随后执行的 2,400,000 次固定种子故障模拟、14 个 SQLite WAL 独立进程崩溃/恢复场景。旧版文件保留为研究过程证据，本文件为 BATCH 002 的规范入口。 \| **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** \| 本批不再问“哪个工作流引擎更好”，而是追问：在崩溃、取消、租约转移、网络超时、重放、版本变化、GPU/浏览器/实验设备恢复时，系统怎样证明某个外部动作到底发生了什么、谁仍有权提交、何时可以安全继续。 |
| RAW-0362 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-003_Live-Recovery-and-Crash-Proof.md | 21184 | 9289f89922efe505 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | Evidence rule: a source inspection, package install, unit test, injected exception, real SIGKILL, process checkpoint/restore, synthetic benchmark and production deployment are distinct proof levels. This report never promotes one into another. \| Decision: None \| Decision: None |
| RAW-0363 | ARCHIVE_MEMBER | FAR-Lab_RU-002-Batch-001-Incremental-Agent-Graph-Results.json | 5562 | 0352d50ab899a6f9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0364 | ARCHIVE_MEMBER | FAR-Lab_RU-002-Batch-001-Marimo-Execution-rerun.log | 148 | f4f25c0ad7a0f186 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0365 | ARCHIVE_MEMBER | FAR-Lab_RU-002-Batch-001-Marimo-Execution.json | 1395 | 55204ec7b7dd7d94 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0366 | ARCHIVE_MEMBER | FAR-Lab_RU-002_Batch-001_Evidence-Bound-Coding-Workbench.md | 37839 | 91c5b3ad5c2b454b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0367 | ARCHIVE_MEMBER | FAR-Lab_RU-002_Batch-003_Coding-IDE-Notebook-Incremental.md | 92150 | 95e990fa1cfa11b0 | DUPLICATE_SOURCE | RAW-0465 | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental computation | 25 | RAW_NARRATIVE | UNKNOWN |
| RAW-0368 | ARCHIVE_MEMBER | FAR-Lab_RU-003_Batch-004_Compiler-IR-Program-Analysis.md | 66450 | 33176a4a5d9dff38 | DUPLICATE_SOURCE | RAW-0466 | text | 2026-08-20 | compiler / IR / build / program analysis | 18 | RAW_NARRATIVE | UNKNOWN |
| RAW-0369 | ARCHIVE_MEMBER | FAR-Lab_RU-004_Batch-005_Data-Search-Provenance.md | 74441 | 9b0b27f8749646c1 | DUPLICATE_SOURCE | RAW-0467 | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 19 | RAW_NARRATIVE | UNKNOWN |
| RAW-0370 | ARCHIVE_MEMBER | FAR-Lab_RU-005-Batch-006-Continuation-State.json | 3038 | 8aef100a90bb3291 | DUPLICATE_SOURCE | RAW-0500 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0371 | ARCHIVE_MEMBER | FAR-Lab_RU-005-Batch-006.sha256 | 908 | a876c95e692b2159 | DUPLICATE_SOURCE | RAW-0501 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0372 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Model-Serving-Inference-GPU-Gateway.md | 53958 | c6250ab5bfc941d3 | DUPLICATE_SOURCE | RAW-0502 | UNKNOWN | 2026-08-20 | model serving / inference / GPU | 39 | RAW_NARRATIVE | UNKNOWN |
| RAW-0373 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.csv | 13763 | 1316ee21123a4a04 | DUPLICATE_SOURCE | RAW-0503 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0374 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.json | 35506 | a0f54656662b46bf | DUPLICATE_SOURCE | RAW-0504 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0375 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.md | 5221 | 22a341d032e293ef | DUPLICATE_SOURCE | RAW-0505 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0376 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.py | 21923 | c6e383d19c16ef53 | DUPLICATE_SOURCE | RAW-0506 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0377 | ARCHIVE_MEMBER | FAR-Lab_RU-006-Batch-007-Continuation-State.json | 3330 | 67de8479a8af0a43 | DUPLICATE_SOURCE | RAW-0445 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0378 | ARCHIVE_MEMBER | FAR-Lab_RU-006-Batch-007.sha256 | 1437 | c9b8e7a6f2316e5f | DUPLICATE_SOURCE | RAW-0446 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0379 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_HPC-Numerical-Simulation-Optimization.md | 57235 | 74ba7c1f262f1766 | DUPLICATE_SOURCE | RAW-0447 | UNKNOWN | 2026-08-20 | HPC / numerical / simulation / optimization | 73 | RAW_NARRATIVE | UNKNOWN |
| RAW-0380 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.csv | 1262 | 7dd902a3ddb4fa1f | DUPLICATE_SOURCE | RAW-0448 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0381 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.json | 4978 | 2357b2893cb2f06e | DUPLICATE_SOURCE | RAW-0449 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0382 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.md | 1398 | 2dda350463752ecf | DUPLICATE_SOURCE | RAW-0450 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0383 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.py | 9381 | edf96051ce6ddd14 | DUPLICATE_SOURCE | RAW-0451 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0384 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation-run.log | 447 | 40eb86154ea00cad | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0385 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.csv | 16534 | 24536348e9da6663 | DUPLICATE_SOURCE | RAW-0452 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0386 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.json | 51460 | 20ed58754c89456e | DUPLICATE_SOURCE | RAW-0453 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 114 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0387 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.md | 4439 | e3644f629c2ca30e | DUPLICATE_SOURCE | RAW-0454 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0388 | ARCHIVE_MEMBER | FAR-Lab_RU-007-Batch-008-Continuation-State.json | 4023 | d7d93adf4f25a285 | DUPLICATE_SOURCE | RAW-0543 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0389 | ARCHIVE_MEMBER | FAR-Lab_RU-007-Batch-008.sha256 | 1024 | 61dfd473cee98dbc | DUPLICATE_SOURCE | RAW-0544 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0390 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.csv | 2771 | bc7a7378b772c4f3 | DUPLICATE_SOURCE | RAW-0545 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0391 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.json | 7748 | ce075ffd3d73a90b | DUPLICATE_SOURCE | RAW-0546 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 36 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0392 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.md | 1786 | f1c86e88500b3deb | DUPLICATE_SOURCE | RAW-0547 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0393 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistics-Causal-DOE-Autonomous-Science.md | 48566 | 82c58a5791180854 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | statistics / causal / experiments / autonomous science / lab | 54 | RAW_NARRATIVE | UNKNOWN |
| RAW-0394 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistics-Causality-Experiments-Autonomous-Science.md | 63244 | 7217ca2f5bc1ba79 | DUPLICATE_SOURCE | RAW-0548 | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 64 | RAW_NARRATIVE | UNKNOWN |
| RAW-0395 | ARCHIVE_MEMBER | FAR-Lab_RU-008-Batch-009-Continuation-State.json | 2874 | 9cac6a2f0962b56b | DUPLICATE_SOURCE | RAW-0529 | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0396 | ARCHIVE_MEMBER | FAR-Lab_RU-008-Batch-009.sha256 | 1036 | 55a56e27375bcca8 | DUPLICATE_SOURCE | RAW-0530 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0397 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Confidential-Formal-Testing-Evaluation.md | 47832 | c9e4fa62ce046752 | DUPLICATE_SOURCE | RAW-0531 | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0398 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.csv | 9418 | 270f468fefce3440 | DUPLICATE_SOURCE | RAW-0532 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0399 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.json | 21187 | 53e240c916a043ec | DUPLICATE_SOURCE | RAW-0533 | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 57 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0400 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.md | 5083 | 70b8580356743e98 | DUPLICATE_SOURCE | RAW-0534 | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0401 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Contract-Validation.csv | 2600 | 316bf45f25cf9227 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0402 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Contract-Validation.json | 6546 | c5dd5cfadd0562cf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 25 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0403 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Contract-Validation.md | 1169 | e8bcb71d1480280f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | collaboration / local-first / plugins | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0404 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Plugin-Validation.csv | 5933 | d71b16c4333e15f1 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0405 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Plugin-Validation.json | 17796 | b81bf1fc12b02c9c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 76 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0406 | ARCHIVE_MEMBER | FAR-Lab_RU-009_Batch-010_Collaboration-Plugin-Validation.md | 8615 | 79608b13daf968c2 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | collaboration / local-first / plugins | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0407 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RU_Contract-Harness.py | 15332 | 9493db5bd501e650 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | collaboration / CRDT / plugins | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0408 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RU_Contract-Summary.json | 1849 | 15e5d86d6be85fdc | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0409 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RU_Contract-Trials.csv | 236967 | c7ce4f1cfa83dd1f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0410 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RUs_Synthetic-Contract-Validation.csv | 2202 | 8b09894131d615eb | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0411 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RUs_Synthetic-Contract-Validation.json | 5741 | 2181f25026770c4f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 21 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0412 | ARCHIVE_MEMBER | FAR-Lab_Remaining-RUs_Synthetic-Contract-Validation.md | 1265 | 3fa0cb7a3ce85f97 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0413 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-004.json | 6849 | 5dd2e012e3463482 | DUPLICATE_SOURCE | RAW-0522 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0414 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-005.json | 7823 | df874dac1552c33b | DUPLICATE_SOURCE | RAW-0468 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0415 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-006.json | 9260 | 914584a6cd1b2f6d | DUPLICATE_SOURCE | RAW-0507 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0416 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-007.json | 7888 | 6418f0f553ac6acd | DUPLICATE_SOURCE | RAW-0455 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0417 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-008.json | 8856 | e8a66e9172a7f2a5 | DUPLICATE_SOURCE | RAW-0549 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0418 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-009.json | 9959 | 4f2d255c2732af7e | DUPLICATE_SOURCE | RAW-0535 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0419 | ARCHIVE_MEMBER | FAR-Lab_Through-Batch-004.sha256 | 1775 | 5f7ff636b800aa76 | DUPLICATE_SOURCE | RAW-0523 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0420 | ARCHIVE_MEMBER | FAR-Lab_Through-Batch-005.sha256 | 1411 | ea76304175515090 | DUPLICATE_SOURCE | RAW-0469 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0421 | ARCHIVE_MEMBER | calc.py | 108 | f1ef96993deb035e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0422 | ARCHIVE_MEMBER | inspect.json | 226 | 64488139d7554cc6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0423 | ARCHIVE_MEMBER | plan.json | 134 | 4d41bb0e205a9a79 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0424 | ARCHIVE_MEMBER | test-report.json | 341 | 015b13b8953cbac9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0425 | ARCHIVE_MEMBER | crash-worker-observation.json | 466 | 00ccdc228a7f2bbe | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0426 | ARCHIVE_MEMBER | external_target.db | 20480 | b001eef5b16df640 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0427 | ARCHIVE_MEMBER | ledger.db | 45056 | 178535d4a82b7d13 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | EXECUTION_STATE_DATABASE | UNKNOWN |
| RAW-0428 | ARCHIVE_MEMBER | reattached-ui-projection.json | 922 | ae10e7bc1b86caa9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0429 | ARCHIVE_MEMBER | stale-worker-observation.json | 510 | 2ba01586c5f3bf06 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0430 | ARCHIVE_MEMBER | calc.cpython-313.pyc | 416 | 7ae08bdf64063d0c | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0431 | ARCHIVE_MEMBER | test_calc.cpython-313.pyc | 1163 | 8c76836f539d4593 | PARTIALLY_READABLE | UNKNOWN | UNKNOWN | UNKNOWN | repository fixture / test artifact | 0 | COMPILED_PYTHON_ARTIFACT | UNKNOWN |
| RAW-0432 | ARCHIVE_MEMBER | calc.py | 108 | f1ef96993deb035e | DUPLICATE_SOURCE | RAW-0421 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0433 | ARCHIVE_MEMBER | test_calc.py | 323 | f0e5bca5c5ba22e6 | DUPLICATE_SOURCE | RAW-0435 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0434 | ARCHIVE_MEMBER | calc.py | 108 | f1ef96993deb035e | DUPLICATE_SOURCE | RAW-0421 | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0435 | ARCHIVE_MEMBER | test_calc.py | 323 | f0e5bca5c5ba22e6 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0436 | ARCHIVE_MEMBER | FAR-Lab_state_probe.json | 10467 | 7a89b5b68df06978 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0437 | ARCHIVE_MEMBER | FAR-Lab_state_probe.png | 134548 | fe2403262fd393de | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 0 | VISUAL_EXECUTION_ARTIFACT | UNKNOWN |
| RAW-0438 | ARCHIVE_MEMBER | README.md | 1297 | bc61db8b7acedad0 | DUPLICATE_SOURCE | RAW-0008 | UNKNOWN | 2026-08-20 | package / manifest / repair | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0439 | ARCHIVE_MEMBER | SHA256SUMS.txt | 64229 | eb735e5a7d07a818 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0440 | ARCHIVE_MEMBER | FAR-Lab_Batch-007-Candidate-Registry.csv | 23065 | 06c54c40915786ed | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | candidate/entity registry | 40 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0441 | ARCHIVE_MEMBER | FAR-Lab_Batch-007-Source-Registry.json | 9615 | dd99c85c2812ca2c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | external source registry | 49 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0442 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-007.md | 1445 | d3f394597029f614 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0443 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-007.csv | 87613 | 04824bce92b8fd23 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 255 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0444 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-007.json | 376221 | f3936608604874a7 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 255 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0445 | ARCHIVE_MEMBER | FAR-Lab_RU-006-Batch-007-Continuation-State.json | 3330 | 67de8479a8af0a43 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0446 | ARCHIVE_MEMBER | FAR-Lab_RU-006-Batch-007.sha256 | 1437 | c9b8e7a6f2316e5f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0447 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_HPC-Numerical-Simulation-Optimization.md | 57235 | 74ba7c1f262f1766 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | HPC / numerical / simulation / optimization | 73 | RAW_NARRATIVE | UNKNOWN |
| RAW-0448 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.csv | 1262 | 7dd902a3ddb4fa1f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0449 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.json | 4978 | 2357b2893cb2f06e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0450 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.md | 1398 | 2dda350463752ecf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0451 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Numerical-Reproducibility-Benchmark.py | 9381 | edf96051ce6ddd14 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0452 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.csv | 16534 | 24536348e9da6663 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0453 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.json | 51460 | 20ed58754c89456e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 114 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0454 | ARCHIVE_MEMBER | FAR-Lab_RU-006_Batch-007_Scientific-Validation.md | 4439 | e3644f629c2ca30e | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0455 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-007.json | 7888 | 6418f0f553ac6acd | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0456 | ARCHIVE_MEMBER | far_lab_ru006_numerical_validation.py | 30059 | 3ecc975e8f86765d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | HPC / numerical / simulation / optimization | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0457 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Candidate-Registry.csv | 23774 | 7a2a73c8995ce0d7 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | candidate/entity registry | 47 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0458 | ARCHIVE_MEMBER | FAR-Lab_Batch-005-Source-Registry.json | 8400 | 4a5f61bd62d196b7 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | external source registry | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0459 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-005.md | 2155 | 7583b146ac80e8b5 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0460 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-005.json | 209783 | ea0dbacd0cfa4626 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 178 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0461 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-001_Durable-Agent-Runtime.md | 96178 | 5f9b295d6690ac9b | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 13 | RAW_NARRATIVE | 本批次不是“推荐几个 Agent 框架”，而是把长期自主执行问题拆成控制状态、外部效果、执行环境、监督恢复、版本兼容、安全与科研证据链等可独立判断的技术层。 \| `Tier` 评价的是对 FAR-Lab 决策空间的价值，不等于建议整体采用。项目级与组件级价值分开判断。 \| 本节是工程情报，不是法律意见。任何生产采用仍需由合格法律顾问结合 FAR-Lab 的部署和商业模式复核。 |
| RAW-0462 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Harness.py | 25679 | af5c0f53a75c377c | DUPLICATE_SOURCE | RAW-0023 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0463 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Summary.json | 8880 | 4fd33661f3780cf8 | DUPLICATE_SOURCE | RAW-0026 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0464 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | 64495 | 820765af63070f95 | DUPLICATE_SOURCE | RAW-0014 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0465 | ARCHIVE_MEMBER | FAR-Lab_RU-002_Batch-003_Coding-IDE-Notebook-Incremental.md | 92150 | 95e990fa1cfa11b0 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental computation | 25 | RAW_NARRATIVE | UNKNOWN |
| RAW-0466 | ARCHIVE_MEMBER | FAR-Lab_RU-003_Batch-004_Compiler-IR-Program-Analysis.md | 66450 | 33176a4a5d9dff38 | INGESTED | UNKNOWN | text | 2026-08-20 | compiler / IR / build / program analysis | 18 | RAW_NARRATIVE | UNKNOWN |
| RAW-0467 | ARCHIVE_MEMBER | FAR-Lab_RU-004_Batch-005_Data-Search-Provenance.md | 74441 | 9b0b27f8749646c1 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 19 | RAW_NARRATIVE | UNKNOWN |
| RAW-0468 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-005.json | 7823 | df874dac1552c33b | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0469 | ARCHIVE_MEMBER | FAR-Lab_Through-Batch-005.sha256 | 1411 | ea76304175515090 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0470 | ARCHIVE_MEMBER | FAR-Lab_Batch-006-Candidate-Registry.csv | 16629 | 73d1fd89e7467403 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | candidate/entity registry | 37 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0471 | ARCHIVE_MEMBER | FAR-Lab_Batch-006-Source-Registry.json | 8898 | f144efafba987467 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | external source registry | 43 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0472 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-006.md | 2950 | 219fe7c1d1d8f5f9 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0473 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.csv | 60103 | 3af67137a20b6f9a | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 215 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0474 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.json | 286723 | 1aecc16bb2c425a6 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 215 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0475 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-006.sha256 | 471 | 6b0a903fed374d36 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0476 | ARCHIVE_MEMBER | FAR-Lab_RU-001-004_Batch-002_Durable-Coding-Provenance-Search.md | 89375 | 4b0c477d850483ca | DUPLICATE_SOURCE | RAW-0012 | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 68 | RAW_NARRATIVE | Decision: ADAPT a layered control plane rather than adopting one engine as the whole FAR-Lab runtime. \| Decision: BUILD the integration layer from four independently replaceable planes: Client/IDE Protocol, Context Data Plane, Solver/Planner, and Sandbox/Effect Ledger. Adopt mature protocols and primitives rather than embedding one monolithic coding agent. \| Decision: BUILD a FAR-Lab Evidence Envelope from standards-based layers. Operational events, semantic provenance, research-object packaging, signed attestations, transparency evidence, environment manifests, low-level traces, and privacy p |
| RAW-0477 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001-Continuation-State.json | 5258 | 0f669a515fc7b972 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0478 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001.sha256 | 251 | 8381cbbaff240251 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0479 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Continuation-State.json | 11458 | 12279e04e2b239cd | DUPLICATE_SOURCE | RAW-0021 | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0480 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Revision-2-Continuation-State.json | 13931 | 9944fe948209745e | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0481 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Revision-2.sha256 | 1106 | 8d58ac4db8654a33 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0482 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002.sha256 | 838 | 268441d011515bc2 | DUPLICATE_SOURCE | RAW-0022 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0483 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark-Report.md | 6260 | 76e8af418bc2b9ee | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0484 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.csv | 4534 | 1c1c3f9fd095452d | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0485 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.json | 36553 | de3b82e4e0a17848 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0486 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Effect-Protocol-Benchmark.py | 32051 | 534ee5a014f03df5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0487 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002_Process-Crash-Evidence.tar.gz | 10400 | 56d71028697fa8af | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | ARCHIVE_CONTAINER | UNKNOWN |
| RAW-0488 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-001_Durable-Agent-Runtime.md | 96178 | 5f9b295d6690ac9b | DUPLICATE_SOURCE | RAW-0461 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 13 | RAW_NARRATIVE | 本批次不是“推荐几个 Agent 框架”，而是把长期自主执行问题拆成控制状态、外部效果、执行环境、监督恢复、版本兼容、安全与科研证据链等可独立判断的技术层。 \| `Tier` 评价的是对 FAR-Lab 决策空间的价值，不等于建议整体采用。项目级与组件级价值分开判断。 \| 本节是工程情报，不是法律意见。任何生产采用仍需由合格法律顾问结合 FAR-Lab 的部署和商业模式复核。 |
| RAW-0489 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Harness.py | 25679 | af5c0f53a75c377c | DUPLICATE_SOURCE | RAW-0023 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0490 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Protocol-Summary.csv | 1050 | 2835d4f2de5444d3 | DUPLICATE_SOURCE | RAW-0024 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0491 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Scenario-Summary.csv | 6494 | 66957c3a2299df7d | DUPLICATE_SOURCE | RAW-0025 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0492 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Summary.json | 8880 | 4fd33661f3780cf8 | DUPLICATE_SOURCE | RAW-0026 | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0493 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials.csv | 113065 | f43c4e696043e77d | DUPLICATE_SOURCE | RAW-0013 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0494 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | 64495 | 820765af63070f95 | DUPLICATE_SOURCE | RAW-0014 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0495 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Recovery.md | 47140 | 9a4c0bb74d09125d | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 29 | RAW_NARRATIVE | 本批不再问“哪个工作流引擎更好”，而是追问：在崩溃、取消、租约转移、网络超时、重放、版本变化、GPU/浏览器/实验设备恢复时，系统怎样证明某个外部动作到底发生了什么、谁仍有权提交、何时可以安全继续。 \| **Fencing 保护的是本地权威状态，不会自动撤销或阻止已经越过边界的外部动作。** |
| RAW-0496 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Revision-2_Effect-Semantics-and-Continuity.md | 122012 | b72a9d4f1bb447f5 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | Revision 2 合并了原 BATCH 002 的广域候选/连续性研究与随后执行的 2,400,000 次固定种子故障模拟、14 个 SQLite WAL 独立进程崩溃/恢复场景。旧版文件保留为研究过程证据，本文件为 BATCH 002 的规范入口。 \| **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** \| 本批不再问“哪个工作流引擎更好”，而是追问：在崩溃、取消、租约转移、网络超时、重放、版本变化、GPU/浏览器/实验设备恢复时，系统怎样证明某个外部动作到底发生了什么、谁仍有权提交、何时可以安全继续。 |
| RAW-0497 | ARCHIVE_MEMBER | FAR-Lab_RU-002_Batch-003_Coding-IDE-Notebook-Incremental.md | 92150 | 95e990fa1cfa11b0 | DUPLICATE_SOURCE | RAW-0465 | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental computation | 25 | RAW_NARRATIVE | UNKNOWN |
| RAW-0498 | ARCHIVE_MEMBER | FAR-Lab_RU-003_Batch-004_Compiler-IR-Program-Analysis.md | 66450 | 33176a4a5d9dff38 | DUPLICATE_SOURCE | RAW-0466 | text | 2026-08-20 | compiler / IR / build / program analysis | 18 | RAW_NARRATIVE | UNKNOWN |
| RAW-0499 | ARCHIVE_MEMBER | FAR-Lab_RU-004_Batch-005_Data-Search-Provenance.md | 74441 | 9b0b27f8749646c1 | DUPLICATE_SOURCE | RAW-0467 | UNKNOWN | 2026-08-20 | data / search / knowledge / provenance | 19 | RAW_NARRATIVE | UNKNOWN |
| RAW-0500 | ARCHIVE_MEMBER | FAR-Lab_RU-005-Batch-006-Continuation-State.json | 3038 | 8aef100a90bb3291 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0501 | ARCHIVE_MEMBER | FAR-Lab_RU-005-Batch-006.sha256 | 908 | a876c95e692b2159 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0502 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Model-Serving-Inference-GPU-Gateway.md | 53958 | c6250ab5bfc941d3 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | model serving / inference / GPU | 39 | RAW_NARRATIVE | UNKNOWN |
| RAW-0503 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.csv | 13763 | 1316ee21123a4a04 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0504 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.json | 35506 | a0f54656662b46bf | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0505 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.md | 5221 | 22a341d032e293ef | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0506 | ARCHIVE_MEMBER | FAR-Lab_RU-005_Batch-006_Routing-Benchmark.py | 21923 | c6e383d19c16ef53 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0507 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-006.json | 9260 | 914584a6cd1b2f6d | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0508 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-004.md | 6099 | 60c9a8edd5447911 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0509 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-004.json | 122534 | 146ba464d340f77c | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 131 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0510 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001-Continuation-State.json | 5258 | 0f669a515fc7b972 | DUPLICATE_SOURCE | RAW-0477 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0511 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-001.sha256 | 251 | 8381cbbaff240251 | DUPLICATE_SOURCE | RAW-0478 | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0512 | ARCHIVE_MEMBER | FAR-Lab_RU-001-Batch-002-Continuation-State.json | 11382 | ed73e2bbd54cd1de | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0513 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-001_Durable-Agent-Runtime.md | 96178 | 5f9b295d6690ac9b | DUPLICATE_SOURCE | RAW-0461 | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 13 | RAW_NARRATIVE | 本批次不是“推荐几个 Agent 框架”，而是把长期自主执行问题拆成控制状态、外部效果、执行环境、监督恢复、版本兼容、安全与科研证据链等可独立判断的技术层。 \| `Tier` 评价的是对 FAR-Lab 决策空间的价值，不等于建议整体采用。项目级与组件级价值分开判断。 \| 本节是工程情报，不是法律意见。任何生产采用仍需由合格法律顾问结合 FAR-Lab 的部署和商业模式复核。 |
| RAW-0514 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Harness.py | 25679 | af5c0f53a75c377c | DUPLICATE_SOURCE | RAW-0023 | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0515 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Protocol-Summary.csv | 965 | 647aee01cfeca5d5 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0516 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Scenario-Summary.csv | 6238 | 6f174af4be599b50 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0517 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Summary.json | 8793 | e7d7ddeab6112588 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0518 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Fault-Trials.csv | 11509 | f5207bb804bfbf91 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0519 | ARCHIVE_MEMBER | FAR-Lab_RU-001_Batch-002_Effect-Semantics-and-Continuity.md | 64425 | ca4e21100b260f00 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 12 | RAW_NARRATIVE | **RU-002 — Coding Agents, IDE/Notebook Architecture, Repository Intelligence, Build Systems and Incremental Computation** |
| RAW-0520 | ARCHIVE_MEMBER | FAR-Lab_RU-002_Batch-003_Coding-IDE-Notebook-Incremental.md | 92150 | 95e990fa1cfa11b0 | DUPLICATE_SOURCE | RAW-0465 | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental computation | 25 | RAW_NARRATIVE | UNKNOWN |
| RAW-0521 | ARCHIVE_MEMBER | FAR-Lab_RU-003_Batch-004_Compiler-IR-Program-Analysis.md | 66450 | 33176a4a5d9dff38 | DUPLICATE_SOURCE | RAW-0466 | text | 2026-08-20 | compiler / IR / build / program analysis | 18 | RAW_NARRATIVE | UNKNOWN |
| RAW-0522 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-004.json | 6849 | 5dd2e012e3463482 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0523 | ARCHIVE_MEMBER | FAR-Lab_Through-Batch-004.sha256 | 1775 | 5f7ff636b800aa76 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0524 | ARCHIVE_MEMBER | FAR-Lab_Batch-009-Candidate-Registry.csv | 28909 | 1912442332c06f70 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | candidate/entity registry | 42 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0525 | ARCHIVE_MEMBER | FAR-Lab_Batch-009-Source-Registry.json | 11612 | 8d0c1779abb6877c | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | external source registry | 56 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0526 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-009.md | 2109 | 14a3af5929c7c544 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0527 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-009.csv | 142293 | b1ae3fe814045f2b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 337 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0528 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-009.json | 567620 | acd11bca79a47c48 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | mixed / unclassified technical research artifact | 337 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0529 | ARCHIVE_MEMBER | FAR-Lab_RU-008-Batch-009-Continuation-State.json | 2874 | 9cac6a2f0962b56b | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | coding agents / IDE / notebook / incremental | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0530 | ARCHIVE_MEMBER | FAR-Lab_RU-008-Batch-009.sha256 | 1036 | 55a56e27375bcca8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0531 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Confidential-Formal-Testing-Evaluation.md | 47832 | c9e4fa62ce046752 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0532 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.csv | 9418 | 270f468fefce3440 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0533 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.json | 21187 | 53e240c916a043ec | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 57 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0534 | ARCHIVE_MEMBER | FAR-Lab_RU-008_Batch-009_Security-Formal-Validation.md | 5083 | 70b8580356743e98 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0535 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-009.json | 9959 | 4f2d255c2732af7e | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0536 | ARCHIVE_MEMBER | far_lab_ru008_security_formal_validation.py | 22700 | d3127d0b381b4929 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / reliability / formal methods | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0537 | ARCHIVE_MEMBER | ru008_validation_run.log | 763 | 7a934c35c53186f8 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0538 | ARCHIVE_MEMBER | FAR-Lab_Batch-008-Candidate-Registry.csv | 26025 | a8886da3f34a30f9 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | candidate/entity registry | 40 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0539 | ARCHIVE_MEMBER | FAR-Lab_Batch-008-Source-Registry.json | 9719 | ad6837c10e308347 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | external source registry | 50 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0540 | ARCHIVE_MEMBER | FAR-Lab_Global-Intelligence_Index_Through-Batch-008.md | 1260 | 7a06e25236f86434 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | coding agents / IDE / notebook / incremental | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0541 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-008.csv | 113511 | f3b9a3dd61263b5f | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 295 | MACHINE_READABLE_REGISTRY | UNKNOWN |
| RAW-0542 | ARCHIVE_MEMBER | FAR-Lab_Global-Registry_Through-Batch-008.json | 471460 | 3def042ee658f2bb | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 295 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0543 | ARCHIVE_MEMBER | FAR-Lab_RU-007-Batch-008-Continuation-State.json | 4023 | d7d93adf4f25a285 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | durable execution / effects / recovery | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0544 | ARCHIVE_MEMBER | FAR-Lab_RU-007-Batch-008.sha256 | 1024 | 61dfd473cee98dbc | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | package / manifest / repair | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |
| RAW-0545 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.csv | 2771 | bc7a7378b772c4f3 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 0 | EXECUTED_OR_GENERATED_DATA | UNKNOWN |
| RAW-0546 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.json | 7748 | ce075ffd3d73a90b | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | execution evidence / synthetic experiment | 36 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0547 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistical-Validation.md | 1786 | f1c86e88500b3deb | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | RAW_NARRATIVE | UNKNOWN |
| RAW-0548 | ARCHIVE_MEMBER | FAR-Lab_RU-007_Batch-008_Statistics-Causality-Experiments-Autonomous-Science.md | 63244 | 7217ca2f5bc1ba79 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | execution evidence / synthetic experiment | 64 | RAW_NARRATIVE | UNKNOWN |
| RAW-0549 | ARCHIVE_MEMBER | FAR-Lab_Research-Continuation-State_Through-Batch-008.json | 8856 | e8a66e9172a7f2a5 | INGESTED | UNKNOWN | UNKNOWN | 2026-08-20 | mixed / unclassified technical research artifact | 0 | MACHINE_READABLE_REGISTRY_OR_STATE | UNKNOWN |
| RAW-0550 | ARCHIVE_MEMBER | far_lab_ru007_statistical_validation.py | 16958 | fc01d4c120e84207 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | durable execution / effects / recovery | 0 | EXECUTABLE_SOURCE | UNKNOWN |
| RAW-0551 | ARCHIVE_MEMBER | ru007_validation_run.log | 390 | f09e3bca03e20a00 | INGESTED | UNKNOWN | UNKNOWN | UNKNOWN | security / formal methods / evaluation | 0 | GENERATED_TEXT_ARTIFACT | UNKNOWN |

---

**End of canonical pre-research baseline. Revalidate before consequential use.**
