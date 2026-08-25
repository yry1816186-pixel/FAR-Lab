# R2 Lane 13 Report — Reliability, Security, Observability & Performance

Branch `ws/r2/13-reliability-security` from `baseline/parallel-r2` (47cc373).
Mandate: prove a long-running scientific agent stays observable, recoverable,
secure and resource-bounded under real failure — not just correct on the happy
path.

## 1. Commits

| SHA | Subject |
|---|---|
| b234c9e | feat(reliability): observability layer + fault/soak/backup proof + 3 defect fixes (RESIDUE PORT of build/hx-reconstruction 419b86e via `cherry-pick -x`; attribution line preserved; one conflict resolved — see §3) |
| 823b3bd | feat(security): red-team audit + DNS fault case + taxonomy cause-unwrap |
| 54d2617 | perf: agent-loop kernel overhead profile + lane-local evidence refresh |

## 2. Evidence (all commands run in the lane worktree, offline, no live APIs)

### Baseline sanity (before first edit)
- `npm ci` root/web/tui: exit 0 ×3 · `npm run typecheck` exit 0 · `npm run build` exit 0
- `npm test` (baseline): 1441 passed / 1 failed / 4 skipped — the sole failure was
  the KNOWN date-sensitive `RU-7.3 backwards-clock` fixture (EXECUTION_STATE
  record; hardcodes 2026-08-24T12:00Z) — **fixed by the residue port** (its
  defect #5). Post-port full suite: **1464 passed / 0 failed / 4 skipped**
  (exit 0, 102.7s).

### Residue port (rule 3): reliability workstream 419b86e → b234c9e
- Ported: observability layer (`src/app/observability.ts` 18-category error
  taxonomy + process/storage sampling + correlation contract; `src/app/recovery-state.ts`
  derived recovery phases), `far data obs` operator console, crash-atomic
  artifact landing, forward-only db guard, WAL synchronous=NORMAL (15k
  appendEvent 31.6s→3.5s), gc anchored-regex + orphan sweep, deterministic
  RU-7.3 floor, 4 reliability test files + 4 tracked spikes + evidence set.
- Verification: `npx vitest run tests/reliability-*.test.ts tests/gc.test.ts
  tests/storage-hardening.test.ts` → 28/28 PASS; full suite 1464/0/4.

### Fault injection — 10/10 PASS (`node spikes/reliability-faults.mjs`, exit 0)
Nine residue cases re-verified on this branch (SIGINT mid-run, DB busy under
2.5s exclusive writer, corruption boundary, ENOSPC artifact landing, EACCES,
cross-process duplicate execute → RunLeaseHeldError, model 429→502→ECONNRESET→
malformed through the REAL retry core, outbox crash-window exactly-once,
2-process × 40 concurrent appends) **plus the new case 10**:

- `dns-resolution-failure` — closes the residue handoff's honest boundary #1
  offline. EAI_AGAIN in the REAL undici cause shape (`TypeError: fetch failed`,
  errno on `.cause`) through the real `runOpenAICompatStructuredCall`: transport
  = fail-visible `provider_error`, 0 blind retries (W1 discipline — never retry
  a black-holed connection), clean transport recovers to `ok`. Taxonomy side:
  direct errno + cause-carried errno + SourceAdapterError shape all classify
  `network_error`/retryable. Evidence: `evidence/reliability/faults.json`.

### Security audit (new, `evidence/reliability/security-audit-2026-08-25.md`)
Threat-model control map for every mandate item (injection/indirect-injection,
malicious tool/MCP/plugin, generated-code injection, path traversal, SSRF/exfil,
secrets, auth posture, supply chain, malicious artifacts, resource exhaustion,
independent permission audit). Findings — every one **reproduced through real
code** (`node spikes/security-redteam.mjs` → 4/4 REPRODUCED, exit 0,
`evidence/reliability/security-redteam.json`):

- **F-1 (medium → lane 09)**: manifest-declared MCP `riskClass` is
  attacker-controllable and load-bearing (import passthrough → registration →
  explore-mode auto-allow AND RU-3 T3 embed-guard exemption). Proofs F1a/F1b/F1c.
- **F-5 (hardening → lane 08)**: conversation-agent's blanket per-name allow
  rules cannot see risk classes; one future execute-class registration becomes a
  silent unconditional allow (proof F5 on the real engine).
- **F-3 (low → lane 12)**: `HOST=0.0.0.0` binds the unauthenticated API on all
  interfaces silently.
- **F-2 (checklist → lane 05)**: zip/XML resource-cap proofs due at their
  parser fusion (their substrate is not in this baseline).

In-lane fix from the audit: `classifyError` now unwraps one guarded undici
`.cause` hop and maps `SourceAdapterError(kind='network')` → `network_error`
(retrieval outages and real DNS failures were mislabeled `provider_error` in
the obs console). Locked by 2 new tests: `tests/reliability-observability.test.ts`
15/15 PASS. CP-C3 (MCP execute-class human-approval boundary on every production
path) verified STRUCTURALLY: `loop.ts:405` is the only `permissions.decide` site;
refine + conversation-agent inject their engines into the loop; no direct
tool-call HTTP route — with F-1/F-5 as the two carve-outs handed off.

### Soak — PASS (lane-local rerun, `node spikes/reliability-soak.mjs`, exit 0)
23,526 events / 7,294 receipts / 7,294 artifact blobs; RSS 65.1→107.9MB
(+42.8MB, allowance 120); active handles +0; every run's hash chain verifies;
WAL stable at 4.05MB; db 24.5MB proportional; 0 lease races. Evidence:
`evidence/reliability/soak.json` + `soak-samples.json`.

### Backup/restore/migration — 5/5 PASS (`node spikes/reliability-backup-drill.mjs`, exit 0)
Roundtrip (VACUUM INTO; counts+chains identical), WAL-copy trap (naive far.db
copy carries −1/6 events), v1→v8 migration chain (rows preserved, 7/7 new
tables), newer-than-build db refused visibly, gc conservatism on restored
workspace. Evidence: `evidence/reliability/backup-drill.json`.

### Performance (extended, `node spikes/reliability-perf.mjs`, exit 0)
- NEW agent-kernel profile (the one unmeasured mandate surface): REAL
  `runAgentLoop`, instant stub provider → **0.2ms/turn machinery** (20 sessions
  × 6 turns) and **0.5ms/turn** on a 60-turn session with full transcript
  growth. Verdict: negligible vs model latency; **no optimization warranted**.
- Re-confirmed on this branch: 15k appendEvent 3.0s (WAL fix holding), CLI cold
  start 106–158ms, createApp 21ms, API start 15ms, GET /runs 21ms, heavy-run
  detail 4ms, event pagination 74ms, chain verify 33ms→2ms cached, SSE first
  bytes 5ms. Evidence: `evidence/reliability/perf.json`.

### Final gates (lane completion)
- `npm run typecheck && npm run build` exit 0.
- Full `npm test`: **1466 passed / 0 failed / 4 skipped, exit 0** (120s; includes
  the 2 new observability tests). One intermediate identical-code run had a
  single transient failure whose identity is unrecoverable (log tail truncated)
  and which did not reproduce on the immediate full rerun — consistent with the
  documented load-sensitive environmental flakes (parseRetryAfterMs timing,
  remote-executor docker, agent-mcp timeout; all green here). No defect
  attributed; flagged for awareness.
- `node zcode-harness/scripts/secret-scan.mjs` exit 0.
- eslint 0 errors on touched files (spikes/*.mjs are in the repo's existing
  eslint ignore set — same treatment as the residue spikes).
- `node zcode-harness/scripts/completion-gate.mjs` in the lane worktree reports
  the expected unreadable `.control/*` (workspace-local runtime state lives in
  the primary tree) → global completion is NOT claimed by this lane (see §6).

## 3. Conflict notes (shared files)

- **Port conflict (b234c9e)**: `src/cli/main.ts` — the residue's `data obs`
  command block collided with the baseline's `probe-custom` block at the same
  insertion point. Resolution: kept BOTH blocks with their own try/finally
  closures (independent command handlers). No other conflicts.
- **Ported shared-file changes** (from the residue commit itself, surgical):
  `src/cli/main.ts` (+obs only), `src/persistence/store.ts` (+workspaceCounts
  only), `src/cli/gc.ts`, `src/persistence/{artifacts,db}.ts`,
  `tests/{gc,storage-hardening}.test.ts`. These belong to lanes 03/12 on paper;
  the changes are the rule-3-sanctioned port of already-reviewed residue, and
  the owning lanes' semantics are untouched beyond it.
- Known interaction: lane 12's persistence evolution and lane 03's CLI surface
  may conflict textually at fusion; the hunks are small and additive.

## 4. Handoffs

**Given (open, this lane authored):**
- `r2-2026-08-25-from-13-to-09-mcp-riskclass-floor.md` — F-1 fix with proposed
  patch + regression-test sketch. Status: OPEN (medium).
- `r2-2026-08-25-from-13-to-08-conversation-allow-floor.md` — F-5 fix (key allow
  expansion on riskClass; fail-closed for unknowns). Status: OPEN (hardening).
- `r2-2026-08-25-from-13-to-12-host-bind-guard.md` — F-3 non-loopback bind
  guard (`FARLAB_ALLOW_REMOTE=1` opt-in). Status: OPEN (low).
- `r2-2026-08-25-from-13-to-05-ingest-resource-caps.md` — zip/XML resource-cap
  checklist for their parser fusion. Status: OPEN (note).

**Received:** none.

## 5. Deviations

1. **Branch name**: the lane prompt text said `ws/r2-reliability-security/main`;
   the published INTEGRATION_RULES/BASELINE mandate `ws/r2/<nn>-<slug>` (all
   sibling lanes follow it) — used `ws/r2/13-reliability-security`.
2. **Residue port** (rule 3/4): cherry-picked build/hx-reconstruction `419b86e`
   with `-x` attribution instead of rebuilding — the port-vs-duplicate rule
   requires exactly this. Conflict resolution documented in §3.
3. **`git fetch --all` failed** at setup (proxy unreachable from this sandbox);
   the baseline tag is local so setup proceeded; push will retry.
4. No files outside lane ownership were modified except via the ported residue
   commit (§3). The four findings above were handed off, not hot-patched —
   none met the security-blocker bar (each has a human-gate compensating
   control today).

## 6. Honest boundaries / unverified claims

- Remote-executor faults (SSH reset, container death, subagent death on the
  gateway) remain BLOCKED on the user-gated Docker/WSL2 target — unchanged.
- No live-network fault was injected (workspace no-live-API directive); DNS was
  proven at the transport seam with the exact error shape a real resolver
  failure produces. Real-socket behavior: BLOCKED-live.
- Same-process concurrent `execute` lease residual (P2) stays documented-not-
  fixed, awaiting a real caller (minimal-sufficient rule).
- Global mission completion is NOT claimed: `completion-gate` remains NOT_READY
  on the external credential blocker (B-QWEN-LIVE-ROUTE) and lane-owned
  ACC-02/ACC-40 evidence items — outside this lane's control.
