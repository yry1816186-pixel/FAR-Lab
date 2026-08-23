# RU-8 CAMPAIGN — Research Packet (2026-08-24, SEARCH_SATURATED)

Main-Agent direct research. Status: SOURCE_VERIFIED (registry + repo probes
today; sidecar pin read from experiment-runtime/pyproject.toml).

## Problem
Campaign plane: A6.1 pre-execution dataset audit (label errors/leakage/dupes)
· A6.6 multi-experiment campaigns (job arrays + sequential optimization) ·
A6.10 in-job milestone checkpoint/resume · A7.5 conformal prediction UQ.

## Environment facts (FACT)
Sidecar pins: python >=3.11, numpy<3, scikit-learn>=1.5,<2, scipy<2 (uv.lock).
Candidate compat verified against this pin.

## Search vocabulary run
`cleanlab confident learning license`, `MAPIE conformal sklearn BSD`,
`crepes conformal prediction`, `Optuna storage sqlite journal pruner`,
`SMAC3 HEBO license`, `SLURM job array semantics exit codes dependency`,
`sklearn pipeline checkpoint resume warm_start partial_fit safe`,
`sequential experiment design multi-fidelity acquisition`,
`dataset leakage detection before training`

## Candidate table (SR=read, SC=probed)
| Candidate | Org | License | Maturity | Solves | Family | Tag |
|---|---|---|---|---|---|---|
| cleanlab | Cleanlab Inc | Apache-2.0 | active (pushed 2026-01; v2.9.0, py>=3.10) | label-error ranking via confident learning; also dupes/outliers | dataset audit | SC+SR(registry) |
| MAPIE | scikit-learn-contrib | BSD-3-Clause | very active (pushed 2026-08-14; v1.5.0, py>=3.10) | split/CV conformal wrappers for sklearn predict | conformal UQ | SC |
| crepes | Henrik Boström | BSD-3 (registry metadata incomplete — verify file at adoption) | stable 0.9.x, py>=3.10 | leaner conformal framework | conformal alternative | SC |
| Optuna | Optuna (PFN orbit) | MIT | extremely active (pushed 2026-08-21) | HPO/multi-fidelity pruners (Median/Hyperband), journal/sqlite storage | sequential optimization engine | SC |
| SMAC3 / HEBO | community/华为 | permissive (BSD/Apache family; not probed deep this wave) | established | Bayesian opt alternatives | heavier; no advantage at our scale | KEEP-watch |
| SLURM --array semantics | SchedMD | doc | HPC standard | per-cell task ids, independent exit codes, throttling (%N), dependency chains | campaign primitive semantics to MIMIC | PR |
| skops / joblib dump | sklearn-orbit | BSD | standard | model persistence; mid-fit dump NOT crash-safe → snapshot-at-milestone only | checkpointing reality | SR |
| warm_start / staged pipelines | sklearn docs | n/a | native | resumable fitting for supported estimators | checkpoint mechanism | FACT(docs) |

## Source-level findings
1. **CampaignSpec as preregistered object** (the key architectural move):
   campaigns must live in the SAME preregistration discipline as
   ExperimentSpec: CampaignSpec {base_experiment_spec, grid: N configs,
   multiple_testing_policy ACROSS cells (reuse POPPER-style alpha-spending
   from D-025!), per_cell_status events}. Verdicts remain mechanical per
   cell; aggregate stage reports family-wise correction honestly. This
   prevents campaigns from becoming a p-hacking engine — the exact failure
   mode the constitution warns about.
2. **Job-array execution maps onto existing scheduler.db primitives**:
   campaign = one durable parent row + N child jobs with cell_index; reuse
   leases/fences/OAOO checkpoints verbatim (W8 assets); throttle = in-flight
   cap; per-cell terminal status event on spine; partial-failure tolerance =
   cells independent by construction. No new queue machinery.
3. **Sequential optimization boundary**: Optuna (MIT, zero question about it)
   runs INSIDE the sidecar with its own transient storage (journal file in
   run scratch); FAR-Lab never treats optuna's db as authority — only the
   chosen-config decisions + receipts flow back through the stdio protocol.
   Multi-fidelity pruning uses epoch-level intermediate values reported via
   existing progress protocol. far.db stays single source of truth.
4. **Dataset audit gate placement**: cleanlab runs BEFORE execute acceptance:
   new deterministic gate `dataset_audit` producing {label_issues: k,
   top_offenders, duplicate_clusters, class_balance} artifact riding receipts;
   audit result displayed pre-run (D3.3 UX hook) and archived. py3.10+ ok.
   Leakage heuristics (temporal/group splits) = template-level checks in
   reviewed builder whitelist (deterministic, no ML).
5. **In-job milestones**: honest scope — sklearn has no safe mid-fit serialize
   for arbitrary estimators. What IS safe: (a) staged Pipeline completion
   markers, (b) estimators supporting warm_start, (c) epoch-callback models
   (torch-class later). Milestone checkpoint = artifact snapshot at stage
   boundaries + resume manifest listing completed stages; full-recompute
   fallback documented (current fences behavior) remains the floor. This
   converts A6.10 from "impossible generally" to "safe where supported,
   visible always".
6. **Conformal**: MAPIE wraps our existing sklearn builders with minimal
   surface change; report calibrated coverage object {method, alpha,
   empirical_coverage, interval_widths} into StatReport extension. Hypothesis-
   probability calibration downstream deferred until judge probabilities are
   actually consumed by a decision gate (avoid vanity calibration).

## Verdicts (main-Agent, closed vocab)
- Dataset audit gate: **ADOPT cleanlab-in-sidecar** (Apache-2.0; uv lockfile at implementation)
- Conformal UQ: **ADOPT MAPIE-in-sidecar** (BSD-3; crepes REJECT as second mechanism)
- Campaign orchestration: **BUILD** on scheduler primitives + CampaignSpec preregistration schema (incl cross-cell multiple-testing policy REQUIRED)
- Sequential optimization: **ADOPT Optuna-in-sidecar** transient-only (MIT; storage isolation rule above)
- In-job milestones: **BUILD safe-subset** (stage-boundary snapshots + warm_start/staged support matrix; general mid-fit REJECT as unsafe)
- SMAC3/HEBO: **REJECT** (no marginal benefit at current scale; two mechanisms rule)

## Integration sketch (owners)
- src/domain/experiment.ts (+campaign.ts): CampaignSpec zod + validation gates
- experiment-runtime sidecar: audit op (cleanlab), conformal op (MAPIE), tuning loop (optuna transient) — all behind existing stdio protocol; lockfile additions ONLY at implementation wave
- scheduler lane (sibling-owned files): campaign rows/cells — COORDINATION REQUIRED before any scheduler change; packet records design only
- execute stage: audit-gate insertion point (fail-closed on unrunnable audit)
- export: per-cell status table + family-wise correction disclosure

## Deterministic validation workload (offline)
- audit golden test: synthetic dataset with planted label flips → cleanlab ranks ≥80% of plants top-decile (seeded)
- conformal coverage simulation: seeded gaussian/classification suites → empirical coverage within [alpha±ε] across 50 seeds
- campaign mini-matrix 1×4 fixture: all cells reach terminal states; one injected cell failure → aggregate reports partial with honest counts
- multiple-testing policy unit tests: alpha-spending across cells enforced mechanically
- milestone manifest: staged pipeline interruption → resume skips completed stages byte-identically

## UNVERIFIED
- crepes LICENSE file text (registry gap)
- cleanlab performance envelope on >1e6-row datasets (our caps suggest fine)
- optuna journal-file concurrency on Windows paths (single-process sidecar use should avoid issue; probe at integration)
