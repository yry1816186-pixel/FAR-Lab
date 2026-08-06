---
status: reviewed
owner_role: strategy-and-evaluation-lead
last_verified: 2026-08-05
scope: dated primary-source comparison of agent platforms, interoperability protocols, and scientific-trust standards
authoritative_for:
  - benchmark method
  - benchmark observations
  - allowable comparative claims
evidence_level: mixed
related_decisions: [DEC-001, DEC-004, DEC-007]
related_requirements: [REQ-QUAL-006, REQ-QUAL-008, REQ-ARCH-011, REQ-SCI-001, REQ-SCI-003]
supersedes: []
superseded_by: null
---

# Competitive benchmark and non-leadership verdict

## 1. Verdict

**FAR-Lab has not demonstrated parity with mature agent products or superiority in scientific verification.** The current repository contains unusually relevant deterministic-verdict and evidence-chain assets, but the observed runtime, permission, release, user, and scientific-validation evidence is insufficient for either claim. The expanded scorecard in `18_WORLD_CLASS_PARITY_SCORECARD.md` finds 15 applicable engineering dimensions and **0 proven** on an immutable candidate. This document therefore records patterns to adopt, capabilities that are not applicable, and experiments required before any narrow comparative statement.

Query date: **2026-08-05**. Versions are observations at that date, not permanent “latest” claims. Official repositories, documentation, releases, specifications, and security policies are primary evidence. README claims establish only what a project says it offers. No competing product was installed or benchmarked in this run.

## 2. Comparison rules

| Rule | Application |
|---|---|
| Comparable unit | A user-observable task under the same model, input revision, data, tools, network, time, turns, token/cost budget, retries, and review rubric. |
| Evidence state | `OBSERVED` means an official source supports the feature; `UNKNOWN` means reviewed sources do not establish it; `NOT_APPLICABLE` means the product/protocol solves a different problem. |
| Quality claim | Feature presence, a release, a CI file, a checkpoint, or a signature is not proof of safety or task quality. |
| Failure accounting | Timeouts, refusals, unsafe actions, human assists, retries, and setup failures remain in the denominator. |
| Scientific boundary | Coding-task success, citation grounding, provenance validity, artifact integrity, reproducibility, and scientific validity are separate outcomes. |
| Leadership language | “Match” or “exceed” is prohibited until a preregistered repeated comparison and independent review satisfy §8. |

## 3. Agent-product observations

| System | Observed version/state | Primary pattern | Material boundary | FAR-Lab disposition |
|---|---|---|---|---|
| OpenCode | v1.18.13, 2026-08-04 | TUI/desktop/IDE/Web/SDK; allow/ask/deny; plugins, tools, MCP, sessions | Official security model says permissions are not a security sandbox; unauthenticated server configuration is hazardous | Adopt explicit permission grammar and session UX only; do not copy surface breadth or call prompts containment. |
| pi | v0.83.0, 2026-07-29; former pi-mono redirected | Four-tool minimal core; interactive/RPC/JSON/SDK; tree/fork/clone/compact; extension-first design | Intentionally no built-in sandbox; extensions have system authority | Adopt minimal-core and structured-event ideas; require a stricter extension trust boundary than pi. |
| Hermes Agent | v0.20.0 / tag v2026.8.3 | Memory, cron, skills, subagents, execution backends, grounded citations | Deny rules are not a malicious-process sandbox; `--yolo` weakens approval; citation grounding is not scientific validation | Consider citation-to-source checks outside the kernel; exclude self-improving skills and memory from trust root. |
| Claude Code | v2.1.222, 2026-08-04 | Terminal/IDE/desktop/Web/SDK, permissions, sessions, hooks, MCP, skills, subagents | Bash sandbox may fail open unless configured otherwise and does not govern every built-in tool | Adopt explicit fail-closed profile, resumable session semantics, and hooks only where evidence boundaries remain visible. |
| Codex CLI | rust-v0.146.0, 2026-07-29 | OS-enforced local sandbox, approval modes, network policy, AGENTS scoping, exec/JSON/resume/SDK/MCP | Workspace sandbox is not whole-system isolation; default network restrictions constrain networked workflows | Use as a baseline for local execution policy and machine-readable CLI behavior, not a scientific comparator. |
| Aider | GitHub release v0.86.0, 2025-08-09 | Git-first diff/undo, repository map, automatic lint/test loop, terse terminal workflow | No established first-party OS sandbox or unified capability policy was found; GitHub release recency is not package recency | Adopt concise repair/recovery UX and structured context selection where applicable; no direct scientific comparison. |
| Cline | v4.1.3 | IDE-first task, category approval, Shadow-Git checkpoints, CLI/SDK, MCP/ACP/skills | Checkpoints restore state but do not contain execution; “safe” command classification and YOLO remain trust boundaries | Adopt visible checkpoints and category explanations; require policy enforcement independent of model classification. |
| Roo Code | v3.54.0; repository archived and extension shutdown 2026-05-15 | Historical modes, MCP, skills, worktrees, checkpoints, delegation | Archived lifecycle and published command/symlink/MCP advisories outweigh feature breadth | Threat-model input only; reject as a current dependency or parity target. |
| OpenHands | v1.9.0 | Separate action runtime; Docker/local/cloud/SDK/CLI/ACP; risk policies | Process/local runtime is explicitly not sandboxed; direct SDK tool execution can bypass conversation policy | Adopt isolated-worker separation and benchmark-runtime discipline; never equate risk confirmation with isolation. |
| SWE-agent / mini-SWE-agent | v1.1 maintenance-only / mini v2.4.6 active | Configurable agent-computer interface, multiple environments, trajectory/replay, benchmark runners | mini local default is unsandboxed; some isolation backends are experimental; coding scores do not transfer | Adopt versioned trajectories, replay, and environment matrix; not benchmark-score parity. |
| Goose | v1.45.0 | Shared Rust core across desktop/CLI/API, MCP/ACP, sessions, permission modes | Optional sandbox disabled by default; tool classification/provider behavior is best effort | Adopt exportable sessions and permission modes only after fail-closed enforcement design. |
| Continue | repository/docs observed at 2.0.0; lifecycle evidence conflicts | IDE/CLI sessions and source-controlled agent checks; allow/ask/exclude | Repository page states no longer actively maintained/read-only while accessible docs describe product behavior; exact active lifecycle is `DISPUTED` | Do not select as dependency until lifecycle is reverified; checks may inspire policy-as-code, not deterministic verdicts. |
| OpenClaw | 2026.7.1-2 | Personal-agent gateway, persistent automation, provenance/taint classes, memory and session state | Designed for a single operator, not hostile multitenancy; host tools and shared main session can broaden exposure | Adopt immutable source/taint classification and durable failure history; reject gateway/memory as scientific trust root. |
| Scientific Agent Skills | v2.62.0 | 158 versionable scientific workflows using Agent Skills | Skills may read credentials/files and contain malicious instructions; scanning is not certification; domain correctness is unproven by format | Skills are quarantined, pinned external tools with per-skill review; never kernel extensions by default. |

Official evidence links and fine-grained gaps are preserved in `BENCHMARK_GAP_MATRIX.md`; the observations above do not assert that a feature works in every environment.

## 4. Protocol fit

| Protocol | Observed state | Solves | Does not solve | FAR-Lab v0 decision |
|---|---|---|---|---|
| MCP | stable 2026-07-28 | Agent/host access to tools and resources with capability/version negotiation | Tool safety, host sandbox, scientific evidence semantics, authorization correctness | `NOT_APPLICABLE` to the first receipt loop; add only for a proven external-tool integration need. |
| ACP | wire v1; schema v1.20.0 | Local editor/client-to-agent sessions, updates, terminals and permission requests | Enforcement, remote hostile-agent trust, scientific validity | `NOT_APPLICABLE` until an IDE pilot is accepted. |
| A2A | v1.0.1 | Remote independent agent discovery and durable task/message lifecycle | Application authorization, sandbox, truth, receipt semantics | `NOT_APPLICABLE` until a federated verifier pilot exists. |
| Agent Skills | spec version/date `UNKNOWN` | Progressive-disclosure packaging of instructions and optional scripts/resources | Signing, dependency lock, runtime containment, scientific correctness | Optional packaging outside the kernel; pin and audit every skill before execution. |

The split is deliberate: MCP is tool/context access, ACP is editor–agent interaction, A2A is remote agent federation, and Agent Skills is instruction packaging. A protocol gateway must not erase identity, scope, provenance, or approval semantics.

## 5. Scientific-trust reference stack

| Standard/profile | What it can support | What it cannot prove | Proposed role |
|---|---|---|---|
| RO-Crate 1.3 | Describing research objects, software, people, equipment, licenses, and aggregation | That described content is correct | Receipt metadata/interchange profile. |
| Workflow Run/Provenance Run Crate 0.5.0 | Workflow/step/input/output/run description | Full compatibility with RO-Crate 1.3 or scientific validity | Execution-trace mapping with an explicit profile-version bridge. |
| W3C PROV | Entity/activity/agent derivation and provenance consistency | Truth in the ordinary sense | Canonical provenance graph vocabulary. |
| in-toto Attestation v1.2 / DSSE | Authenticated statements about subjects and process steps | That the stated process is scientifically adequate or artifact is good | Signed stage attestations and threshold policy. |
| Sigstore/Cosign ecosystem | Identity-bound signing, transparency evidence, offline verification material | That the signer should have signed or content is scientifically valid | Optional external identity/time `trustPolicy`; pinned issuer/identity/workflow policy. |
| SLSA 1.2 | FAR-Lab's own source/build provenance and build assurance | Code quality or a non-malicious producer | Release supply-chain gate, never scientific verdict input. |
| CWL 1.2.1 | Portable containerized batch dataflow | Stateful/real-time service semantics or inherently reproducible in-place mutation | Optional execution-plan serialization for suitable methods. |
| ACM artifact badges v1.1 | Separating available, functional, reusable, reproduced, replicated | One universal “verified” result | Product-language model for orthogonal assurance badges. |

The mandatory semantic separation is:

`provenance_consistent` → `artifact_integrity_verified` → `signer_authenticated` → `process_policy_met` → `execution_reproduced` → `scientific_verdict`.

These are not implications. A fully signed and reproducible run can preserve a biased dataset or invalid method exactly.

## 6. Must-match baseline and deliberate exclusions

| Baseline | Decision | Release gate |
|---|---|---|
| Read/ask/deny plus path, process, network, time and resource policy | Must match for any executing mode | Adversarial deny/escape/timeout tests in OS-isolated worker. |
| Session/task persistence, cancellation, resume, event audit | Must match for durable compile/verify | Crash/restart/cancel/idempotency tests with no false success. |
| Human and machine CLI output with stable error schema | Must match | Golden schema and exit-code compatibility tests. |
| Context inspection, provenance and compaction disclosure | Must match only if optional agent ships | Replay shows what was omitted/summarized and agent output remains outside verdict root. |
| Cross-platform install and diagnostics | Must match for declared platforms | Clean-room Windows/Linux qualification from immutable candidate. |
| Git/repository coding loop, LSP, browser automation, messaging, marketplace | Deliberate non-goals | Re-enter only when a target scientific workflow cannot complete without one. |
| Subagents, MCP, ACP, A2A | `NOT_APPLICABLE` to v0 | Re-enter with user evidence, protocol threat model, conformance and rollback plan. |

## 7. FAR-Lab-specific target advantages

These are **targets, not achievements**:

1. A sealed receipt independently verifies mandatory digests, policy/version bindings, correction lineage, and external signatures while visibly reporting the selected `verificationPolicy`, `trustPolicyId` and `VerificationTimeContext`.
2. Uncertainty, refusal, applicability and evidence conflicts remain first-class rather than collapsing to a binary “verified.”
3. Challenge, evidence request, appeal, correction, withdrawal and affected-result recall form a tested procedural lifecycle.
4. Data, code, environment, parameters, random state, tool/model versions and human decisions are traceable without putting an LLM inside the deterministic decision root.
5. Offline/local handling and explicit disclosure policy protect sensitive scientific material.

Each target remains `UNPROVEN` until the corresponding requirements in `TRACEABILITY_MATRIX.md`, scientific gates, user studies, and independent verifier tests pass.

## 8. Reproducible comparison protocol

1. Freeze every compared version, task, repository/data revision, environment image and dependency lock.
2. Select tasks before seeing outcomes; separate development and held-out sets; disclose contamination.
3. Use the same model where architectures permit, otherwise report the model difference rather than normalizing it away.
4. Set equal time, turn, token, cost, retry, tool, filesystem and network budgets.
5. Run at least 30 independent trials per stochastic condition unless a preregistered power analysis justifies another count.
6. Preserve structured trajectories, approvals, unsafe attempts, environment diagnostics, human interventions and failures.
7. Blind at least two reviewers for user-observable and scientific outcomes; adjudicate disagreement and report agreement.
8. Report success distribution, worst case, confidence intervals, setup failures, unauthorized actions, approval burden, latency, cost and accessibility task success.
9. Publish the harness, scoring rules and exclusions; prohibit task-ID hardcoding, selective reporting and model self-score as sole oracle.
10. Require independent rerun and verify that any apparent gain does not worsen safety, user control, maintainability or cost outside its preregistered tolerance.

Allowed claim form only after passing: “On `<task set>`, against `<version>`, with `<model/budget/environment>`, FAR-Lab met/exceeded `<metric threshold>`; no conclusion is made outside those conditions.”

## 9. Source set

Representative official sources: [OpenCode permissions](https://opencode.ai/docs/permissions/), [pi security policy](https://github.com/earendil-works/pi/security), [Hermes security](https://hermes-agent.nousresearch.com/docs/user-guide/security/), [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing), [Codex approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security), [Aider repository map](https://aider.chat/docs/repomap.html), [Cline checkpoints](https://docs.cline.bot/core-workflows/checkpoints), [Roo repository](https://github.com/RooCodeInc/Roo-Code), [OpenHands runtime](https://docs.openhands.dev/openhands/usage/architecture/runtime), [mini-SWE environments](https://mini-swe-agent.com/latest/advanced/environments/), [Goose permissions](https://goose-docs.ai/docs/guides/goose-permissions/), [Continue permissions](https://docs.continue.dev/cli/tool-permissions), [OpenClaw security](https://docs.openclaw.ai/gateway/security), and [Scientific Agent Skills security](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/SECURITY.md).

Protocol/standard sources: [MCP stable release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28), [ACP architecture](https://agentclientprotocol.com/get-started/architecture), [A2A v1.0.1](https://github.com/a2aproject/A2A/releases/tag/v1.0.1), [Agent Skills specification](https://agentskills.io/specification), [RO-Crate 1.3](https://www.researchobject.org/ro-crate/specification/1.3/index.html), [W3C PROV-DM](https://www.w3.org/TR/prov-dm/), [in-toto Attestation v1.2](https://github.com/in-toto/attestation/blob/main/spec/README.md), [Sigstore threat model](https://docs.sigstore.dev/about/threat-model/), and [SLSA 1.2](https://slsa.dev/spec/v1.2/).

## 10. Residual evidence gaps

- No side-by-side executable comparison was run; all project capability observations are documentary.
- Exact accessibility, install success, latency, cost, context precision, and unsafe-action rates are `UNKNOWN` across the set.
- Continue's current maintenance status is disputed by official surfaces and must be reverified before dependency selection.
- Agent Skills has no verified normative version/date in the reviewed source set.
- FAR-Lab has no real-user task corpus, expert scientific oracle, clean current runtime result, or independent receipt verification trial.
- FAR-Lab also lacks approved target machine schemas/TCK, numeric/disclosure/long-term conformance, candidate-bound distribution/support evidence and a fair parity study; a stronger design cannot substitute for those results.
