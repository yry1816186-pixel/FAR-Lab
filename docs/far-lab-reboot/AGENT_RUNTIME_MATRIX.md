---
status: reviewed
owner_role: agent-safety-lead
last_verified: 2026-08-05
scope: optional target agent modes, tools, permissions, context, memory, budgets, and evaluation
authoritative_for: [agent mode inventory]
evidence_level: D
related_decisions: [DEC-004, DEC-007]
related_requirements: [REQ-ARCH-002, REQ-ARCH-011]
supersedes: []
superseded_by: null
---

# Agent runtime matrix

Status: target design; all agent modes are optional and unvalidated. The deterministic compiler, kernel, and verifier are software services, not agents.

| ID / agent | Mode / model | Tools | Permission / workspace | Context / memory | Subagents | Budget / stop | Evaluation | Owner / version |
|---|---|---|---|---|---|---|---|---|
| AR-001 Evidence mapper | `READ_ONLY`; model pinned per attempt, provider policy-bound | structured search, safe parsers, receipt/draft read | read-only capability over selected roots; no network by default | task brief + manifest + bounded excerpts; no persistent memory | none by default | token/time/tool limits; stop on sufficient trace, denial, loop, cancellation | evidence recall/precision, secret access, unsupported assertions | Agent team / profile v0 |
| AR-002 Draft assistant | `SUGGEST`; model pinned | AR-001 plus write proposal/diff into draft staging | ask for one draft workspace; cannot publish | same plus current draft; session memory only and user inspectable | bounded research subagent allowed with subset | stop for ambiguity, policy conflict, budget, unsafe input | task time, omission, approval burden, unsafe write | Agent team / profile v0 |
| AR-003 Review assistant | `READ_ONLY`; independent configuration from author where possible | receipt verify result, evidence graph, policy explain, citation resolver | disclosed receipt only; cannot contact author tools or change outcome | no author hidden context; no cross-case memory | optional parallel evidence readers; results untrusted | fixed budget; stop with questions/unknowns, never verdict | challenge usefulness, hallucinated evidence, bias/automation study | Review governance / deferred |
| AR-004 Remediation planner | `PLAN_ONLY`; model pinned | affected-receipt query over structured defect index, no mutations | privacy/governance-approved read scope | defect card + version graph; no raw sensitive data unless explicit | none | hard affected-set/export limit; human approval required | recall/precision of affected set; false notification risk | Governance / deferred |
| AR-005 Evaluation runner | `REPLAY`; exact model/provider/container | frozen tools and task fixture | isolated disposable environment; network fixture only | exact prompt/context snapshot; memory disabled | configuration-specific | same turns/tokens/time/cost/retries for all systems | full benchmark protocol, blinded judge | Evaluation / versioned campaign |

Universal rules: tool schemas and outputs are untrusted; child permissions are intersection-only; model fallback creates a new attempt; compaction emits a reviewable summary with source pointers and never becomes evidence; memory is off for scientific decision tasks; all tool calls carry session/task/attempt/actor/capability IDs; termination is a deterministic runtime decision, not an LLM assertion.
