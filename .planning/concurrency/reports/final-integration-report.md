# R2 Final Integration Report — 2026-08-25/26

**Final integrated SHA:** `a11dc19ab394e503890de0ba8422b26ce6086f45` (branch `integration/farlab-current`, worktree `~/Desktop/farlab-integration`).
**Integrator:** final-integration authority session (per R2 goal). **Base:** `baseline/parallel-r2` = `47cc373`.

Fifteen specialist results + all BASELINE.md residue rows are fused into one canonical tree. Every conflict was decided by ownership/semantics, never "whatever compiles". All evidence below was re-run on the integrated tree (specialist-branch proof was not trusted as final proof).

## 1. Fusion ledger (order = dependency; merge + authority decisions)

| # | Source | Commits/decisions | Conflicts → resolution authority |
|---|---|---|---|
| 0 | `build/hx-reconstruction` @ `b04c29a` (residue superset: R1 campaign RU-8 GO2-4 + RU-12 + science formal-evidence + model-plane `0cc128d` + reliability `419b86e` + **lane 05 multimodal** `fb2c2ed..b04c29a`) | merge `21ee017` | `src/cli/main.ts` obs-vs-probe-custom same-insertion-point (predicted by lane 13): **kept both blocks**, each with its own try/finally tail; deduped `path` import |
| 1 | `ws/r2/12-platform-data-api` | merge `1251ef5` | `tests/storage-hardening.test.ts`: **lane 12 Date.now()-derived fixture** chosen over residue deleteMeta approach (persistence-test owner + context-robust per lane 14 F-1) |
| 2 | `ws/r2/11-model-plane` | merge `75c53e7` | `src/model-plane/capabilities.ts` add/add: **lane 11 side** (= port + 08-25 official-FAQ facts + `isBailianEndpoint`) |
| 3 | `ws/r2/08-agent-kernel` | merge `68a10a4` | none |
| 4 | `ws/r2/09-capability-ecosystem` | merge `28fd28f` | none |
| 5 | `ws/r2/04-retrieval-evidence` | merge `29d1dc0` | 4 conflicts, all retrieval surface: **lane 04 side** (richer `fusion.citationChase` object + `refs:/cites:/batch:` cache-key chase supersede hx science lane's simpler `citationChaseSearches` counter + adapter `searchFiltered` mechanism) |
| 6 | `ws/r2/06-scientific-reasoning` | merge `9c34523` | 10 conflicts. Retrieval five (source/openalex/retrieve/verify/retraction-gate): **04 side** (strict superset). `stat-forensics`/`revise`/`rank-test`/`stat-forensics-test`: **06 side** (science authority). `evidence.ts`: **true 3-way semantic union** — kept hx replicate/fails_to_replicate verdicts + lane 04 Retraction-Watch notes, applied lane 06's `e91f00d` CI-anchoring patch (ciPairContext payload + verdict-independent heterogeneity disclosures) |
| 7 | `ws/r2/10-scientific-execution` | merge `d019631` | none |
| 8 | `ws/r2/07-scientific-communication` | merge `65ae330` | none |
| 9 | `ws/r2/01-hx-web-product` | merge `9ae51c7` | none |
| 10 | `ws/r2/02-visual-design` | merge `8bf4758` | none |
| 11 | `ws/r2/03-terminal-desktop` | merge `425ada2` | none |
| 12 | `ws/r2/13-reliability-security` | merge `74223c2` | 9 add/add evidence/spikes/observability: **lane 13 side** (port + DNS case + perf profile + taxonomy cause-unwrap). `storage-hardening`: **lane 12 side** (as #1) |
| 13 | `ws/r2/14-evaluation-redteam` | merge `44e16e8` | none |
| 14 | `ws/r2/15-governance-release` | merge `f3354fd` | none |
| — | `retrieval/evidence-lane` residue | **superseded** by lane 04's port chain (verified: `git diff residue..integration -- src/` shows integration ⊃ residue; the only residue-only file `ach-matrix.yml` is lane-15-deleted) | — |
| — | `work/human-experience` | 0 unique commits (@ R1 baseline); worktree pruned, branch deleted | — |

## 2. Fusion defects found and fixed (integration-level, root-caused)

1. **`40d1402` Retraction priority regression** — lane 04's refactor moving `retractionStatusFrom` from verify.ts inline into `sources/retraction.ts` silently restored first-match `??=` semantics, regressing the residue's order-independence fix (reinstated > retracted > EoC > corrected). The order-independence test survived via auto-merge from the hx side and exposed it. Fixed with an explicit priority ranking; 31/31 retraction tests green.
2. **`40d1402` Superseded chase test removed** — lane 06's `pipeline-retrieve.test.ts` "citation chase snowballs" asserted the dead `searchFiltered` + `citationChaseSearches` mechanism. Superseded by lane 04's strictly stronger e2e (retrieval-known-answer: seeds/backward/forward/hop2/receipts/dedup through the real stage) + 20 unit tests. Deleted the stale block only.
3. **`a11dc19` Orphan public barrel** — lane 14's scorecard rerun on the fused tree flagged `src/ingest/index.ts` (P1-ORPHAN: imported by nothing; all callers deep-import). Deleted; tsc green.

## 3. Open handoffs consumed (product wiring the lanes could not do cross-ownership)

- **04→12** `cdb8214`: `ctx.responseCache` now constructed in production composition (dedicated `source-cache.db`, same own-tiny-track pattern as far-scheduler.db); `FARLAB_RETRIEVAL_REPLAY=1` and `FARLAB_RETRACTION_WATCH_CSV` knobs honored. Retrieval response cache + replay + Retraction Watch are no longer test-only.
- **05→04** `cdb8214`: fulltext SDM persisted next to the text artifact in the evidence deepening loop (`fullTextSdmRef` on SourceDocument; defensive optional guard keeps custom pre-sdm fetchers byte-legacy). 65/65 evidence/fulltext tests green.
- **08→01** `cdb8214`: `web/src/api/types.ts` ConversationActionKind mirror completed (`cancel_run`, `create_tool_integration`), ProposalCard labels + zh/en i18n keys added. Web tsc green.
- **09→08** `cdb8214`: resident conversation agent now composes through the ONE authoritative `assembleSessionCapabilities` (researcher-enabled MCP servers/skills/hook rules reachable from the primary surface; read-class admission; `list_capabilities` discovery). Added `builtinAdmission: 'read_class_only'` seam to the assembly to preserve lane 13's F-5 discipline; deleted the now-dead `conversationAllowRules` and **re-locked F-5 through the new authoritative path** (assembly-level test). 34/34 conversation/assembly/refine tests green.
- **07→03** `cdb8214`: `far research export --format package` wired to the lane-07 engine (+HELP). **Real-path proof:** exported the vitamin-D run from a snapshot of the real workspace → 13 files, paper included, pandoc 3.8.3 produced docx/jats/html, 0 unresolved citations, `far verify <bundle>` exit 0.
- **11→12** `cdb8214`: `GET/PUT /api/v1/competition-route` settings surface + contract test. **Live proof on the served instance:** off→on→on(idempotent)→off + invalid body → 400.

## 4. Re-run proof on the integrated tree (commands + exit codes + numbers)

| Gate | Command | Result |
|---|---|---|
| Fresh installs | `npm ci` ×3 (root/web/tui) | exit 0 ×3, 0 vulnerabilities |
| Root typecheck | `npm run typecheck` | exit 0 |
| Root build | `npm run build` | exit 0 |
| Web typecheck+build | `cd web && npm run typecheck && npm run build` | exit 0 (12.87s, chunk-size warning only — same as baseline record) |
| Lint | `npm run lint` | 0 errors / 3 pre-existing unused-eslint-disable warnings |
| **Full suite** | `npm test` | **1950 passed / 2 failed / 4 skipped (1956 tests, 191 files, ~102s)**. The 2 failures are `tests/gateway.test.ts` + `tests/remote-executor.test.ts` — docker `node:24-slim` metadata re-resolve EOFs at the registry mirror (`cloudfront-docker-cf.mrs.1ms.run`); **directly reproduced outside vitest**; image exists locally; lane 13 documented the same class; environmental, not a code defect. Baseline-era red RU-7.3 time-bomb is FIXED by lane 12's fixture |
| TUI package | `cd packages/tui && npm test` | all pass, exit 0 |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | PASS exit 0 |
| License ledger | `node zcode-harness/scripts/license-ledger.mjs --check` | PASS (4 workspaces, 2 recorded exceptions) after regen |
| Path hygiene | `node zcode-harness/scripts/path-hygiene.mjs` | 4 `missing-required:.control/*` — the BASELINE-documented bare-worktree condition (workspace-local untracked state), identical to every lane + lane 15's record |
| **Red-team scorecard (lane 14 mandate: rerun on fused tree)** | `node eval/redteam/scorecard.mjs` | **PASS_WITH_DIVERGENCES — 0 invalid claims, 18 ADV divergences** (baseline snapshot: 0 invalid / 10). p5 citation grounding over the real corpus: 1261 verified claims, 0 failing, 0 missing sources, 0 malformed DOIs. Interim INVALID findings were root-caused: orphan barrel (fixed, §2.3) and missing artifacts copy in the evidence dir (env, fixed by providing the copy) |
| completion-gate | `node zcode-harness/scripts/completion-gate.mjs` | NOT_READY — `.control/*` absent in the integration worktree (untracked-by-design runtime state; primary tree owns it) **and** global blockers remain (see §7). No global completion is claimed |

### Human-experience hard gate (SHA → build → served → client → journeys)

`a11dc19` → `web/dist` built in the integration worktree (exit 0) → `node scripts/serve.mjs` (D-031 stale-dist guard passed) on a **read-only snapshot of the real workspace** (VACUUM INTO far.db + artifacts copy, 85 runs) at 127.0.0.1:4173 → real browser journeys (DOM snapshots = primary evidence; screenshots `evidence/final-integration/*.png` for human review):

1. Home: full research library (研究库 52 + 待处理 32), conversation sidebar with 未开始 badge, composer with model picker (zai · glm-4.6), engine-ready status, zh/en + theme toggles.
2. Completed run (vitamin D, 9/9 stages): research conclusion with BT-tournament + evidence-balance signature, stage narrative (supporting/counter counts), StageGantt timeline, AVO science-evaluator panel (反证在列 / 可证伪性 / 多样性 / 溯源 / 不确定性), 讨论此研究 bar.
3. **Conversation↔research seam (lane 01 core)**: 讨论此研究 → real `POST /api/v1/conversations` → dock opens beside objects, URL `#run/…?conv=conv_30vntfh0xhb3cdpb5zmwx6cn15`.
4. Hypotheses tab renders ranked hypotheses with evidence-binding honesty states.

Baseline-vs-final: the R2 baseline was already no raw pipeline viewer, but the two surfaces were mutually exclusive modes; the final tree has the docked dialogue seam, cancel_run approval cards (typed end-to-end), token-converged visual system with theme-following charts, URL-addressable conversations, i18n-complete proposal kinds. The "backend viewer with new components" description is not sustainable for this tree.

## 5. Architecture ownership (one invariant, one owner — verified post-fusion)

| Concern | Owner (unchanged from BASELINE.md) | Fusion note |
|---|---|---|
| Session capability composition | `src/agent/capabilities/assembly.ts` | **now single** — refine AND conversation-agent both consume (second inline assembly deleted) |
| Retraction derivation | `src/sources/retraction.ts` | single derivation, both stages consume; priority semantics restored |
| Citation chase | `src/pipeline/citation-chase.ts` + retrieve stage | single engine (`refs:/cites:/batch:` cache keys); old searchFiltered mechanism removed |
| Response cache/replay | `src/sources/response-cache.ts` + composition | production-wired (was test-only) |
| Ingest/SDM | `src/ingest/**` + evidence-stage persistence | fulltext SDM persisted on corpus docs; orphan barrel deleted |
| Export/package | `src/report/**` | single engine; CLI + script + API aligned |
| Model plane | `src/model-plane/**` + provider-resolver | competition gate at the production chokepoint + settings API |
| Persistence | `src/persistence/*` | v9 migration + WAL/synchronous=NORMAL + concurrent-access proof |
| Reliability/obs | observability + recovery + gc + bind guard | F-1/F-5/F-3 fixes verified at fusion (F-5 re-locked through assembly) |

**Removal/deprecation list:** `src/ingest/index.ts` (orphan barrel); `conversationAllowRules` (dead after assembly seam); stale chase test block; superseded residue branches (`retrieval/evidence-lane` content superseded, `work/human-experience` pruned); `ach-matrix.yml` (lane 15, honored).

## 6. Known open items (honest, owner-assigned)

- **Environmental (not code):** docker registry-mirror EOF for the 2 remote-execution tests (local image exists; lane 13 + this report's direct reproduction); hosted-CI picocolors `cli-term` red (8/8 green locally; lane 15's evidence chain stands).
- **Deferred handoffs (below integration bar, seams ready):** 10→03 CLI `--device`/`simulate` pass-through; 06→04 `allocateSamples` wire-or-delete; 06→10 conformal/Hartung-Knapp/Holm executors; 05→01 web ingest stopgap port; 01→12 health-coldstart server latency + liveready semantics; 14-F3 `src/providers/deepseek.ts` deletion + 26-site test re-homing (module archived/unreachable-by-registry; model-plane follow-up).
- **Scorecard 18 ADV divergences:** test-only modules pending product adoption decisions (campaign trio, conformal, search-allocation, executor-simulation, matrix, model-plane trio, host-main dynamic-import, deepseek) + pptx warning-string fake-marker vocabulary + numpy exploration surface limitation (14-F2 → lane 10).
- **Excluded in-flight sibling work (never touched, per hard rule):** primary-worktree uncommitted files `src/cli/main.ts` / `src/persistence/store.ts` / `src/server/api.ts` (time-travel inspect/state-at in flight) + `tests/time-travel.test.ts` + `.planning/handoffs/RETRIEVAL.md` — belong to the active sibling session on `build/hx-reconstruction`; fusion used committed tips only.

## 7. Release blockers consumed (lane 15) + global state

- Page-count contradiction: **adjudicated ≤20** (lane 15, dual-source dominant strategy; reopen only on new official text).
- PR #128 closed with verification (lane 15; accepted).
- `submission/RELEASE_BLOCKERS.md` remains the single published gap list: **B-QWEN-LIVE-ROUTE** (user credential + one receipted live run — external), **S-1 technical PDF** (≤20pp, unwritten — user-owned), **ACC-40 evidence level** (lineage projection, user action).
- No-live-API policy honored throughout: zero live model calls; all proof offline/deterministic; live-only items labeled.

## 8. Delivery

Single authoritative branch: `integration/farlab-current` @ `a11dc19`, pushed to origin, one PR toward `main`. Lane branches are preserved (merged, not deleted). The primary worktree (`build/hx-reconstruction`) still holds the in-flight sibling session and was never modified by the Integrator.
