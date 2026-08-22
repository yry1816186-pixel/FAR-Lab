# Wave-5 Fusion Evidence (evidence/W5A, 2026-08-22)

Mission: `research/WAVE-PROMPTS/wave5-ai-scientist-systems.md` per user /goal.
Breadth reports: `research/wave5-reports/` (10/10; 3 main-agent-authored after subagent
account rate-limiting [1302] killed 7/13 dispatches — noted per report; robin's "failed"
agent had already written its full report). Scout: `research/WAVE5-SCOUT.md`.

## Environment & deconfliction facts (recorded for the record)

- Model routes at wave open (single probe per policy): deepseek chat 402 (D-036 unchanged);
  OpenAlex keyless 200. **ALL live LLM verification BLOCKED** — offline/deterministic only.
- Parallel sessions executed W6 (retrieval — owns retrieve.ts, ACTIVE), W7 (structured
  output), W8 (durability — ACTIVE on stage files incl. checkpointed), W9 (judge v2.1,
  D-042/D-043 committed). Wave-5 fusion landing zones avoided all parallel-owned files
  except hypotheses/falsify/evidence stages, which Wave-8 wrapped with `ctx.checkpointed`
  ON TOP of Wave-5 changes (merge verified intact; test-harness passthrough added).
- Account-level subagent rate limit (1302) capped practical subagent concurrency at ~2-3.

## Premise measurements (Marginal Value Gate, BEFORE any fusion — all offline, zero API)

| candidate | probe | command | result | gate verdict |
|---|---|---|---|---|
| W5-F2 citation-noise stripping in claim matcher | gold-set scan | `node -e` regex scan over `eval/claim-pair-gold.jsonl` (104 pairs) | **0/104** pairs contain any citation-like paren pattern | **REJECTED** — premise falsified on recorded data |
| W5-F1 cross-family near-dup corpus hygiene | near-dup probe | `node spikes/wave5-near-dup-probe.mjs` (8-word shingle Jaccard ≥0.8 over title+abstract[:400], same-run cross-identifier pairs; 530 docs / 46 runs) | **3 near-dup pairs in 3/46 runs (~0.5% of docs)**; e.g. identical "Mol428 MONITORING…" title under different id-sets | **DEFER→registry B** — real class, sub-threshold materiality; trigger = post-W6 rerun (W6-F1 reroutes counter queries to crossref) |
| W5-F4 diversity loop | duplicate-rate probe | `node spikes/wave5-diversity-probe.mjs` (objects table scan) | **136/455 = 30.0% of persisted candidates are paraphrase duplicates; 37/40 runs affected; worst run 7/12 duplicates; 112/319 clusters multi-member; 0/40 runs below the 3-representative floor** | **GO** — material evidenced failure class (generation budget waste + cluster churn) |
| W5-A1 rank resume double-count | read-only audit | direct read of `src/pipeline/stages/rank.ts:484-497,505-545` | stored tournament reused wholesale on resume (no re-judge); W8's in-flight per-pair domain-key checkpoints cache only successful judgments | **PASS — no defect** |

## Fusions executed (offline-verified; live re-measurement queued on D-036)

### W5-F4 — cross-strategy negative conditioning + operator-extended supplement

- `src/pipeline/stages/hypotheses.ts`: `antiRepetitionInstruction()` + `previouslyProposed`
  payload (statement+mechanism of every prior candidate in-run) injected into strategy
  calls 2/3 of generate_hypotheses; diversity-supplement systemPrompt now instructs four
  explicit operators (integrate / reduce / make-feasible / transplant). Mechanism sources:
  AI-Scientist-v2 `perform_ideation_temp_free.py:99-125` (mechanism-level paraphrase, RAIL
  license — zero verbatim copy) + Kaimen evolution-operator taxonomy (Apache-2.0).
- Tests: `tests/pipeline-hypotheses.test.ts` — 2 new tests (first strategy sees no history;
  2nd sees 2 candidates; 3rd sees 4; supplement carries all four operator keywords +
  full existing-set visibility). Suite: **31/31 green** in this file.
- Verification: `npx vitest run tests/pipeline-hypotheses.test.ts` → Tests 31 passed (29
  pre-existing + 2 new). Live F1 effect UNVERIFIED (D-036) — queued with the diversity
  probe as the before-measure (30% duplicate rate).

### W5-F5 — anchored-band relation discipline + independent link audit

- `src/pipeline/stages/falsify.ts`: (a) RELATION LABEL DISCIPLINE rewritten as anchored
  bands (supports/contradicts/weakens/qualifies with same-subject+same-quantity anchors;
  "topical kinship is NOT support"); (b) NEW `LinkVerifyOut` schema + exported pure
  `applyLinkAudit()` (confirm/relabel/drop; unknown ids ignored; silence=confirm;
  relabel-without-relation keeps original) + audit pass AFTER topical gate BEFORE
  persistence — relabel notes and drop visibility in warnings + `uncertainties`;
  audit-call failure keeps originally gated links with a warning (enrichment, never a
  silent drop path). Mechanism sources: MLR-Bench anchored bands + anti-leniency (MIT),
  AI-Scientist v1 review ensemble + pessimistic-critic default (mechanism-level, RAIL),
  v1's deterministic-aggregation discipline (numeric bounded-mean pattern informed the
  confirm/relabel/drop design; per the scout revision, a temp-0 3-vote was rejected as
  degenerate in-pipeline — a differently-framed single audit replaces it).
- `src/pipeline/stages/evidence.ts`: claim-claim cross-relation adjudication systemPrompt
  rewritten with anchored bands (text-only; "not_comparable DEFAULT under any doubt").
- Tests: `applyLinkAudit` pure-function test (confirm/relabel-no-relation/drop/unknown-id/
  silence paths) + stage test (relabel weakens + drop + hypothesis claimIds follow audit +
  audit-failure keeps originals visibly). Suite green.
- Verification: full suite (below). Live blind-agreement re-measurement BLOCKED (D-036),
  queued — expected direction: audit-majority labels are modal labels, raising expected
  single-draw agreement (the 0.61 metric); not claimed as measured.

### W5-F3 — MLR-Bench adapter fidelity (task structure, rendering omissions, judge context)

- `eval/mlr-bench.mjs`: (a) `questionFor()` preserves CFP line structure (was: whitespace-
  collapsed single run — the diagnosed "task flattening"); 5000-char cap now lands on a
  line boundary; (b) `renderProposal()` section 4 now renders the leading hypothesis's
  `predictions`, falsification `observable/measurement/expectedRelation`, and the
  hypothesis-level `decisionRule` (persisted data that was previously unrendered —
  "rendering omissions"); (c) `judgeOne()` passes each agent's OWN rendered idea as
  `idea_for_consistency_context` for proposal judging (farlab AND anchors, symmetric) —
  upstream parity with mlrbench `review_proposal.py:169-185` (judge reads task+idea+proposal).
- Verification (offline, zero API):
  - `node eval/mlr-bench.mjs --dry-run` → rubrics extracted (idea 7541 / proposal 12150
    chars, dimension asserts true), sample question head shows preserved line break after
    the workshop title. exit 0.
  - `REL_RENDER_RUN=run_q17j6mehhbhxvx1szdsqhemvq7 node eval/mlr-bench.mjs --render-only`
    → exit 0; IDEA renders literature-novelty delta; PROPOSAL section 4 now contains
    "Predictions of the leading hypothesis" (3 items), "Falsification design (leading
    hypothesis)", and the hypothesis-level decision rule — all previously omitted.
- **口径 disclosure**: the judge-context addition changes the judging protocol; numbers
  produced after this change are NOT directly comparable to the recorded 30/30 (idea
  7.00 / proposal 6.20) — recorded in DECISIONS; same-judge-same-protocol internal
  comparisons (farlab vs anchors) remain apples-to-apples because anchors get the same
  context treatment. Live re-run queued on D-036.

## Full-suite verification (mixed working tree with parallel W6/W8 sessions)

- `npm run typecheck` → exit 0.
- `npm test` → **455/456 pass**; the single failure is `tests/wave8-durability.test.ts >
  KILL-AND-RESUME (timeout 120s)` — Wave-8's own in-flight test on Wave-8's in-flight
  code (not a Wave-5 surface; left to that session, recorded here for attribution).
- `npm run build` → exit 0 (dist refreshed; dist-freshness guard satisfied).

## Adversarial audit (subagent red review, 2026-08-22 — findings + root-cause fixes)

Auditor verified the baseline green, traced every finding to code, and ran mutation checks
against the real dist implementation (scratch in `.cache/w5-audit-mutation/`, no repo files
touched by the auditor). Findings and dispositions:

- **P1 (fixed at root)**: cross-polarity audit relabel (e.g. counter→supports) desynchronized
  the persisted object graph — the persisted relation carried `supports` while the hypothesis
  kept the claim in `counterClaimIds` (rank judge reads both arrays; mlr-bench render derives
  counter counts from relation polarity → split-brain views of one run). **Fix**: persistence
  and hypothesis id-arrays now derive from ONE final-polarity pass (`finalCounter`/
  `finalSupporting` built from audit decisions), so arrays always match persisted relations.
- **P2 (fixed at root)**: mkRelation rationale lookup keyed by FINAL relation fell through to
  boilerplate on cross-family relabels (proposer's linkReason lives in the proposal family's
  table). **Fix**: rationale is keyed to the PROPOSAL family (`proposalFamilyOf` map), so the
  substantive proposer argument always survives; the relabel stays disclosed in
  `uncertainties` via the audit note. (The first fix attempt keyed off the final LIST and
  reproduced the same bug — caught by the new P1 regression test before landing.)
- **P2 test-gap (fixed)**: mutation check proved the applyLinkAudit pure test passed under
  (a) removing the hallucinated-id guard and (b) making 'drop' a no-op. **Fix**: the test now
  drops a PROPOSED id and asserts `dropped:true` + note, and asserts `audit.size===4` +
  `!audit.has('clm_x')` — both mutants now provably fail the test.
- **P3 (fixed cheaply)**: audit-failure stage test now also asserts `counterClaimIds`/
  `supportingClaimIds` survive the failure path unchanged.
- **P3 (recorded, Wave-8 handoff)**: `ctx.checkpointed` keys ('strategy:<name>') are not
  bound to the prompt payload — same-build resume is safe (auditor verified determinism:
  strategy order fixed, replay rebuilds history, store returns fresh parses), but a
  CROSS-VERSION resume (pre-W5 run interrupted, W5 deployed) would replay a pre-W5 cached
  response under a rebuilt W5 prompt with no staleness signal. Recorded for the Wave-8
  durability session: consider hashing the payload (or a schema-version salt) into the
  checkpoint key.
- **P3 (recorded, no fix)**: `previouslyProposed` injection is unfenced model text in the
  user payload — same convention as `availableClaims`, attack bounded to duplicate
  generation (clustering dedups); not a fix-now item.

Attack points checked CLEAN by the auditor (no findings): evidence.ts prompt-only diff;
mlr-bench argv roundtrip with newlines (empirically verified); renderProposal null-safety;
judge-context symmetry across farlab+anchors; truncation×history determinism;
all-counter-links-dropped consistency; hallucinated verdict ids; W5-F4 test strength
(fails if previouslyProposed were empty).

## Post-fix verification

- `npx tsc --noEmit` exit 0; `npx vitest run tests/pipeline-hypotheses.test.ts` → **32/32**
  (28 pre-existing + 4 Wave-5 tests: 2×F4, applyLinkAudit pure + strengthened, P1
  cross-polarity regression, stage relabel/drop/failure).
- `npm run build` exit 0.
- `npm test` → **470/474**; the 4 failures are Wave-6's OWN in-flight audit-fix tests
  (`tests/pipeline-retrieve.test.ts` W6/F4 ×2, `tests/sources-fulltext.test.ts` W6/F5 ×2 —
  test names that did not exist earlier this session; the Wave-6 session is actively landing
  them). Zero Wave-5 surfaces red.

## Live verification queue (BLOCKED by D-036, honestly UNVERIFIED-live)

1. rediscovery-mean-f1 re-run (W5-F4 effect; before-measure = 30% duplicate rate probe).
2. relation-blind-agreement blind re-judge (W5-F5 effect; expected direction only —
   audited labels are modal labels — NOT claimed as measured).
3. mlr-bench re-run under the new adapter+judge protocol (old/new protocols both reported
   per the anti-inflation rule; D-050 disclosure stands).

