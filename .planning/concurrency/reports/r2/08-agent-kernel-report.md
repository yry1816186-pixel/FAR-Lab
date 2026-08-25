# R2 Lane 08 — agent-kernel report

Branch `ws/r2/08-agent-kernel`, base `baseline/parallel-r2` (`47cc373`).
Mission: long-horizon autonomy, memory/context, supervisor, agent lifecycle.

## 1. Commits

| SHA | Subject |
|---|---|
| (see `git log baseline/parallel-r2..ws/r2/08-agent-kernel`) | feat(kernel): conversation turn rollout durability + crash-resume + agent memory/supervision tools |
| (same range) | docs(concurrency): lane 08 report + 08→01 handoff (cancel_run card) |

## 2. Audit conclusions (verified by direct read, file:line in repo)

- **One authoritative lifecycle confirmed.** Research runs: `src/app/orchestrator.ts`
  (leases, transactional transitions, sub-stage checkpoints, budget governance,
  quality-gate regeneration, iteration rounds). Tool-using sessions:
  `src/agent/loop.ts` (JSON-ReAct, 3-layer compaction, stop conditions, steering,
  resume, exfil tripwires, untrusted-content policy). Supervisor read-only
  (`src/app/supervisor.ts`). No competing controllers found; nothing merged away.
- **Memory substrate healthy at this baseline**: `putMemory` FTS delete-then-insert
  fixed (86f12b2 IS an ancestor of the base, verified `git merge-base --is-ancestor`
  exit 0), `searchMemory` ranks by ACT-R activation AND touches access counters
  (store.ts:1097-1104), supersession lifecycle + trust derivation + failure-reason
  gate enforced by `MemoryItemSchema`. 4-kind vocabulary (episodic/semantic/
  experiment_outcome/profile) is the adjudicated RU-1 design — NOT extended.
- **Real gaps found (drove this lane's work)**: supervisor signals had zero
  consumers (advisory events only); conversation/automation turns had no rollout
  durability (refine had it, conversation did not) and no crash-resume; memory and
  supervision were invisible to the resident agent; no integrated long-horizon
  proof workload existed.

## 3. What this lane shipped

1. **Conversation-turn rollout durability + crash-resume** (S2)
   - Deterministic session ids: `conversationSessionId(convId, anchor)` —
     recomputable, never persisted; anchor = researcher message id (human turns)
     or `<automationId>:<fireCount>` (automation fires).
   - Every turn now writes an append-only JSONL rollout under
     `<dataDir>/agent-sessions/` (same convention as the refine capability) and
     spills oversized tool results to the artifact store.
   - `planConversationResume` + `retryConversationTurn`: an UNFINISHED rollout
     (no `session_end` — the torn-process shape) is resumed with priorTurns
     continuing the same maxTurns budget; attempt-1 tool results survive;
     decided sessions (any session_end) honestly restart fresh. Capability
     guard mirrors the refine resume path.
2. **Resident agent memory + supervision read tools** (S3)
   - `recall_memory`: FTS cross-run memory retrieval (kinds/trust filters,
     labels travel — external items are data, never instructions).
   - `run_supervision`: read-only trajectory signals with recommended actions —
     the first CONSUMER of supervisor output inside any agent surface.
3. **`cancel_run` proposal kind** (S4) — the evidence-based redirect path:
   supervision says stuck → agent proposes cancel → researcher approves →
   `store.requestCancel` + `run_cancelled` audit event. Foreign-run proposals
   refused at the tool boundary (conversation scope).
4. **Long-horizon offline proof workload** (S1) `tests/agent-longhorizon.test.ts`
   — deterministic mechanism invariants (scripted provider measures the HARNESS):
   A goal preservation + context discipline under forced full-handoff compaction;
   B dead-end tolerance (persistent tool failures = structured feedback, session
   completes); C crash classification (`tool_outcome_unknown` vs
   `tool_not_started`), transcript repair on resume, compaction-baseline replay;
   D stop policy + budget discipline (stop conditions, budget-gated turns,
   nearLimit); E subagent fan-out isolation (failing child ≠ sibling death).

## 4. Evidence (commands + exit codes + key output)

| Claim | Command | Result |
|---|---|---|
| Baseline sanity at 47cc373 | `npm ci && npm run typecheck && npm run build` | exit 0 |
| Pre-edit kernel subset green | `npx vitest run` (12 kernel/memory/supervisor files) | 85/85 passed |
| New durability+tools tests | `npx vitest run tests/conversation-kernel-durability.test.ts` | 6/6 passed |
| Long-horizon workload | `npx vitest run tests/agent-longhorizon.test.ts` | 9/9 passed |
| Adjacent regression | `npx vitest run` (conversations/automations/search-conversations/reasoning-conversation/agent-loop/agent-resume/memory-substrate) | 57/57 passed |
| Full suite (final) | `npm test` | **1456 passed / 4 skipped / 1 failed** — the 1 is the pre-existing date-sensitive `storage-hardening` RU-7.3 (fixture hardcodes 2026-08-24T12:00Z; sibling-owned file, untouched by this lane, already documented in `.control`) |
| Typecheck + build (post-change) | `npm run typecheck && npm run build` | exit 0 |
| Web typecheck (enum impact) | `cd web && npm run typecheck` | exit 0 |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | exit 0 (known allowances only) |
| putMemory fix in baseline | `git merge-base --is-ancestor 86f12b2 HEAD` | exit 0 (IN-BASELINE) |

Environmental note for other lanes: a fresh worktree WITHOUT `cd web && npm ci`
fails `tests/file-ingest.test.ts` + `tests/citation-entries.test.ts` (they
import `web/src/utils/ingest.ts` → `@citation-js/core` lives in web deps).
After `cd web && npm ci`: 17/17 green. Not a code defect; INTEGRATION_RULES
setup step 4 already mandates the web install.

## 5. Conflict notes (shared files touched)

- `src/domain/conversation.ts` — **semantic edit with handoff note** (per
  OWNERSHIP 12): `ConversationActionKind` + `cancel_run` (same pattern the
  resident-agent lane used for `create_tool_integration`). Lane 12 stewardship:
  enum-only addition, no structural change.
- `src/server/conversation-agent.ts`, `conversations.ts`, `automations.ts`,
  `src/domain/conversation.ts` are all inside lane-08's ownership list; no
  other lane's files were edited (`git status` confirms the complete touched
  set: 4 modified src files + 2 new test files + this report/handoff).
- No live-API testing anywhere; all model interactions are the repo's
  test-stub provider (receipt.executionMode 'test').

## 6. Handoffs

- **Given → lane 01** (filed): `.planning/concurrency/handoffs/r2-2026-08-25-08-to-01-cancel-run-card.md`
  — render cancel_run cards, i18n labels, and fix the STALE
  `ConversationActionKind` mirror in `web/src/api/types.ts:847` (it already
  lacked `create_tool_integration` before this lane).
- **Given → lane 12** (this note, no file needed): enum addition above.
- **Informational → lane 06**: supervisor signals now have a conversation-plane
  consumer (`run_supervision` tool → `cancel_run` proposals). The
  orchestrator-internal supervisor→iteration bridge was ANALYZED and
  deliberately NOT built: `repeated_failure` requires 3 identical stage_failed
  signatures, but the 3rd failure parks the run as `partial` before any pass
  boundary — the veto path is near-unreachable; the human-gated conversation
  path is the honest redirect.
- **Informational → lane 13**: conversation/automation rollouts now persist
  under `<dataDir>/agent-sessions/` (one JSONL per session) — consider in
  GC/storage-lifecycle policy.
- **Received**: none (no handoff records existed for lane 08 at round start).

## 7. Deviations

- Branch named `ws/r2/08-agent-kernel`, not the goal-prompt literal
  `ws/r2-agent-kernel/main`: INTEGRATION_RULES setup step 2 and all five
  existing R2 lane worktrees use `ws/r2/<nn>-<slug>`; the workspace contract
  outranks the prompt-pack template.
- Residue policy: none ported — lane-08's ownership surface had no
  out-of-lineage residue (BASELINE.md residue table lists ingest/model-plane/
  retrieval only).

## 8. Verified vs unverified / open items

- IMPLEMENTED_UNVERIFIED-live: GUI appearance of `cancel_run` cards and the
  new tools' traces in a real browser (offline lane; handoff 08→01 covers the
  web side; backend contract locked by tests).
- BLOCKED-live: LLM advisory iteration/conversation planning quality (no live
  model route per the 2026-08-23 directive; the deterministic harness and stub
  tests are the offline evidence ceiling).
- Analyzed and rejected this pass (recorded so nobody re-litigates blindly):
  - Procedural/tool-experience memory kind: RU-1 adjudicated the 4-kind
    vocabulary (`research/tech-intel/RU1-MEMORY.md`); adding a kind is a
    cross-lane schema change with no current consumer that the existing kinds
    cannot absorb.
  - Orchestrator-internal supervisor veto (see handoff note to 06).
  - Automation `run_stalled` trigger kind: would need domain schema change —
    candidate for a future handoff if the product wants autonomous stall
    response; today `run_supervision` + `cancel_run` give the human-gated path.
- Saturation statement: remaining in-lane ideas were either cross-lane
  (handoffs filed), rejected with recorded rationale above, or BLOCKED-live.
  The vertical slices shipped are each exercised end-to-end by real-path tests
  (HTTP conversation flow, rollout files on disk, store-level effects).
