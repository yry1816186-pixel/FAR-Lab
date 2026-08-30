# RISK_REGISTER.md — Active Product/Engineering Risks

Only risks that can materially affect the product or its verified release belong here. Registration/defense/presentation administration is not an engineering completion blocker.

| ID | Risk | Consequence | Primary mitigation / trigger |
| --- | --- | --- | --- |
| R-01 | Direction-A scope drifts into generic AI Scientist or Direction B | core value diluted | every major capability maps to canonical A loop/acceptance |
| R-02 | Officially required model-route compliance treated as demo-only or deferred | competition path invalid | P0 live official-route proof + current official recheck |
| R-03 | citations resolve but do not support claims | scientific false confidence | content-level alignment + fail-closed + sampling review |
| R-04 | abstract/metadata retrieval overclaimed as full evidence | unsupported conclusions | claim ceiling equals content actually retrieved; add full-text/data adapters when needed |
| R-05 | only supporting evidence is retrieved | confirmation bias | explicit counter-evidence/negative/methodological queries |
| R-06 | hypotheses are paraphrases or scoring is pseudo-objective | shallow scientific value | diversity/dedup + inspectable rationale/uncertainty |
| R-07 | feedback regenerates text instead of causal revision | fake iteration | revision object + structured diff + quality evidence |
| R-08 | DB/event/files compete as state authorities | corrupt/irrecoverable workflow | canonical ownership in ARCHITECTURE; recovery tests |
| R-09 | model/provider/tool failure silently returns fixture/demo output | fake success | explicit failure/degraded state; production/test path separation |
| R-10 | architecture/tool/agent bloat | slower delivery, more failure modes | minimal-sufficient decisions + Harness pruning + caller checks |
| R-11 | repeated local patch/test/audit loops consume work | core remains unfinished | critical-problem priority + anti-loop discipline |
| R-12 | user experience becomes AI-dashboard theater | product unusable/untrustworthy | task-first HCI, real state/actions, accessibility/large-data/error verification |
| R-13 | unbounded LLM/tool/concurrency work | cost/latency/resource failure | bounded fan-out/retries/budgets from measurement |
| R-14 | secrets/prompt injection/supply-chain or subprocess/network boundary compromised | data/security failure | least privilege, secret scan, input/trust-boundary controls, due diligence |
| R-15 | provenance stores sensitive raw prompts/data indiscriminately | privacy/security risk | redaction/hashes by default; explicit secure raw retention |
| R-16 | pre-research corpus anchors architecture despite staleness | weak technology choices | cold reference only; fresh decision-specific verification |
| R-17 | ZCode Harness files exist but are not actually loaded | guardrails silently absent | local marketplace install + fresh-session runtime verification |
| R-18 | performance targets chosen without measurement | premature optimization/bad gates | representative benchmark first, then budget/reversal triggers |
| R-19 | exploration CodeAct static gate is bypassable (alias/split-chain/getattr; static bans are guardrails, not a jail) | agent-drafted code reaches researcher-privilege OS surface | 2026-08-30: alias-aware gates + getattr ban + runtime dangerous-module scrub + env-minimized sidecar (tests/codeact-escape-regression.test.ts); REAL containment = OS-level isolation, tracked in FINAL_ACCEPTANCE FA-SEC-01 |
| R-20 | no process-boundary network egress allowlist (sources layer guarded 2026-08-30; providers/MCP/custom routes not) | injected tool use or escape exfiltrates to arbitrary hosts | sources httpGet destination guard + per-hop redirect re-check landed; deny-by-default egress for the whole process tracked in FINAL_ACCEPTANCE FA-SEC-04 |
| R-21 | release artifacts unsigned, no SBOM | downstream cannot verify artifact integrity; supply-chain substitution | SHA256SUMS + sigstore + SBOM planned at release-pack execution (FINAL_ACCEPTANCE FA-SEC-09/10); do NOT distribute before closed |

Update this file only when the risk class/mitigation materially changes; live blockers belong in `.control/BLOCKERS.json`.
