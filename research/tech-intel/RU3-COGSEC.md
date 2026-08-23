# RU-3 COGSEC — Research Packet (2026-08-24, SEARCH_SATURATED)

Agent-produced, main-Agent adjudicated. Status: SOURCE_VERIFIED (CaMeL
offline-tested 106/106 green in local clone: Temp\camel-eval, PYTHONPATH=src).

## Problem
Tiered cognitive-layer defense for an agent whose highest-frequency powers
(LLM calls, playwright, MCP, file tools) never touch the Docker sandbox:
injection tiers, taint/IFC, exfil tripwires, localhost hardening, audit
tamper-evidence, approval anti-gaming, capability tokens, adversarial
regression suite.

## Candidates & verdicts
| Candidate | License/Status | Verdict | Key evidence |
|---|---|---|---|
| Spotlighting + channel separation (MSR CEUR Vol-3920) | paper, widely replicated | **ADOPT (T1, first)** | GPT-family ASR >50%→<2% for ~one-line pipeline change |
| FIDES (MSR, arXiv 2505.23643v2) | paper+notebook, no reusable engine | **EXTRACT design (T2/T3)** | labels = integrity {T,U} × confidentiality + type lattice bool⊑enum⊑string; deterministic policy check at tool-call boundary (Alg5 L7); AgentDojo: Basic 163 injections vs FIDES* 1 residual / 0 policy violations; utility cost ≤24.5% (gains +16-24% on reasoning models) |
| CaMeL (google-research/camel-prompt-injection) | Apache-2.0; research artifact, officially unmaintained | **EXTRACT (policy protocol + capability wrapper)** | security_policy.py = 110-line Protocol (`__call__→Allowed|Denied`); full dual-LLM architecture REJECT (2× cost) |
| AgentDojo (ETH Spylab+Invariant) | MIT, pip, AISI/NIST-adopted | **ADOPT** | adversarial regression base |
| promptfoo red-team | MIT, production | **ADOPT (CI)** | `owasp:agentic` plugin maps ASI01-10; needs small live budget → gate on route restore |
| OWASP Agentic Top 10 2026 | doc (2025-12-09 BH-EU) | **KEEP** | checklist; ASI06 memory poisoning + ASI09 trust exploitation hit our roadmap directly |
| tldrsec/prompt-injection-defenses | catalog | **KEEP** | 9 defense classes with numbers (Task Shield 2.07% ASR/69.79% utility) |
| Invariant MCP mitigations | blog+tools | **EXTRACT** | rug-pull = pin schema/version + diff-review on change (into MCP onboarding); ~5.5% of 1,899 surveyed servers contain poisoning |
| garak/PyRIT | Apache/MIT | **DEFER** | overlap with promptfoo+AgentDojo |
| NeuroTaint (arXiv 2604.23374) | paper, no code | **KEEP-watch** | runtime taint via LLM reasoning laundering detection |
| Willison lethal trifecta / dual-LLM | blog, OWASP-cited | **ADOPT vocabulary** | threat-model terms into spec |
| Counter-evidence | arXiv 2605.17634 "agents may always fall for injections" | noted | supports boundary-level deterministic defense over prompt-level |

## Integration ladder (risk-reduction/cost descending; T0-T2 = this fusion wave)
- **T0 localhost hardening** (server, ~0.5d): Host allowlist (localhost/127/
  ::1 + port) + Origin allowlist + per-session token; SSE EventSource can't
  send headers ⇒ query-token→cookie one-time exchange on first connect.
- **T1 spotlighting + channel separation** (pipeline/sources→prompt assembly,
  1-2d): datamark+delimit ALL untrusted content (fulltext/JATS/Zotero/MCP
  outputs AND MCP tool descriptions); instructions and data never concatenated.
- **T2 taint vocabulary** (zod schemas→persistence→export, 3-5d): integrity
  labels `trusted / untrusted-literal / derived-untrusted` (+type-capacity
  bool⊑enum⊑string); attach at claim schema, event records, export objects.
  HARD INVARIANT: derived-untrusted must never enter permission decisions,
  approval-reason fields, or unlabelled exports. (Unified with RU-1
  trust_class — see registry note.)
- **T3 policy check at tool boundary** (permission engine, 2-3d): tool calls
  whose args contain derived-untrusted ⇒ force-human/deny (strictest-wins reuse).
- **T4 exfil tripwires** (provider boundary + egress tools, 2d): per-run
  in-memory canaries into secrets/context; outbound scan (canary hit, URL-in-
  untrusted, oversized body) ⇒ cut.
- **T5 audit hash-chain** (spine, 1d): BEFORE UPDATE/DELETE triggers RAISE
  (ABORT) + prev_hash=SHA256(prev‖payload) per run; O(n) verify sub-second at
  1e4 events; signed checkpoint head for external anchoring (local chain
  alone can be wholesale recomputed).
- **T6 approval-card anti-gaming** (web, 2d): structured fields (action/
  target/arg-taint/source); agent free-text never the sole justification;
  MCP description diffs shown (ASI09/04).
- **T7 capability tokens** (runtime, 2-3d): SSH/MCP credentials → task-id+
  tool+resource+TTL short-lived tokens.
- **T8 CaMeL quarantined slice**: isolated LLM only for CodeAct exploration
  slice, not whole product.

## Adversarial regression suite
Deterministic gate (every CI, no LLM): injection corpus (AgentDojo set +
own: paper-HTML hidden text / JATS comments / PDF annotations / Zotero notes /
MCP description poisoning / rug-pull diffs) → offline asserts: spotlighting
applied; taint propagation correct on claim/event; policy engine blocks
derived-untrusted args; canary tripwires fire; hash chain verifies + detects
tampering. Live gate (small nightly budget, route-gated): sampled AgentDojo +
promptfoo owasp:agentic over the real pipeline; metrics ASR/utility/blocked-
with-reason; hard gate = 0 policy violations, soft line = utility regression
≤25% (FIDES-measured ceiling).

## UNVERIFIED
microsoft/fides + agentdojo LICENSE full text (badges/convention); tldrsec
repo license; FIDES "100%" phrasing (measured: 1 residual/0 violations);
NeuroTaint code availability; promptfoo CI determinism details.
