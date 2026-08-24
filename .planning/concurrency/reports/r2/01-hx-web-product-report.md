# R2 Lane 01 — hx-web-product report (2026-08-24)

Branch `ws/r2/01-hx-web-product` from `baseline/parallel-r2` (`47cc373`,
verified `git rev-parse` == worktree HEAD at setup). Worktree
`work/r2-01-hx-web-product`.

**Adversarial audit (independent subagent, post-v1): ACCEPT_WITH_ISSUES.**
One P1 accepted and FIXED in the follow-up commit (create-conversation
failure was silent on the primary path — the error UI lived only inside the
dock, which never mounts when nothing is selected; now rendered once at the
top of the main area in every dock state). useHealth AbortError polling
stall also fixed (audit P2). Remaining audit P2s: dict-key count corrected
below, `health-strip--checking` unstyled (handed to lane 02), deleted-id
reopen edge (visible failure, covered by the lane-08 link handoff),
ResearchStatePanel hardcoded-zh (disclosed).

## 1. Commits

- `a4bc56e` feat(web): conversation↔research seam (dock + #conv routes) + state-honesty fixes (16 files, +667/−62)

## 2. What changed and why

### D1 — the conversation↔research seam (mission core)

Baseline dogfood verdict: the R2 baseline is NOT a raw pipeline viewer (prior
lanes' researcher IA, honest states, evidence anchoring are real), but the
two working surfaces were **mutually exclusive modes**: `RunDetail` had zero
conversation presence (rg: no match), and opening a run from a conversation
unmounted the dialogue. The researcher could not ask and look at the same
time.

Shipped (all in lane-01 files):

- **Docked conversation pane** (`App.tsx`, `web/src/conversation-dock.css` —
  new lane-01 CSS file; styles.css untouched): a conversation opened while a
  research view is active docks beside the objects instead of replacing them;
  no run open → full view as before; dock has its own close; narrow
  viewports (<980px) overlay instead of squeezing.
- **"讨论此研究" bar** on every research page (`RunDetail.tsx`), above the
  tabs: shows the source conversation (if the run was launched from one) or
  offers to create a dialogue titled by the research question (real
  `POST /api/v1/conversations`; session-scoped dedupe; durable link
  requested from lane 08 — handoff 3). Creation failure renders an ErrorBox
  with retry inside the dock slot (no silent fake-open).
- **Conversations are URL-addressable** (`hooks/useHashRoute.ts`):
  `#conv/<id>` full view; `#run/<id>/<tab>?conv=<cid>` encodes the docked
  pair. Back/forward through no-conv URLs closes the dock. Leave-and-resume
  no longer drops the dialogue.

### D2 — state-honesty fixes (dogfooded defects, all live-verified after fix)

| # | Defect (BEFORE, real bundle) | Fix |
|---|---|---|
| 1 | Cold-start `/health` exceeds client 30s timeout → strip shows `健康检查失败` up to 30s | `useHealth`: first 2 failures retry at 2.5s; strip distinguishes `检查中…` (in flight) from failed; server latency handed to lane 12 |
| 3 | 0-turn conversation listed as `讨论中` | `未开始` badge (sidebar + ConversationView header) when `turns===0 && status open` |
| 4 | Stage table leaks `step_outputs:3` storage vocabulary | `已保存 · N 项输出`; raw ref kept on hover (audit) |
| 5 | Completed run shows `[高] 探索停滞：no persisted activity for 169464s…` (English telemetry, terminal-run noise) | Terminal runs: supervisor block states 研究已结束 + signals archived under disclosure; live runs: rationale/action projected in zh from the signal's STRUCTURED evidence (raw English on hover); no red alert on terminal runs |
| 7 | Evidence overview counter `反对关系 0` vs relations section `削弱 1` — same tab, two predicates | ONE `isCounterRelation` predicate used by both (overview now 1) |
| 9 | Top-ranked hypothesis with zero bindings shows no evidence element (reads as hidden/unknown) | Explicit `证据绑定：暂无（尚无支持或反例关系指向此假设）` |
| 10 | Conversations evaporate on refresh (no route) | `#conv/` + `?conv=` routes (see D1) |

Not fixed (recorded): #6 evaluator-family detail strings remain
data-language English in zh UI (they are generated content; proper fix is an
evaluator-side projection — deferred with note); #8 weakening-relation card
target disclosure (needs relation target in the API projection — candidate
follow-up).

## 3. Evidence (commands + exit codes + live journey on the real served bundle)

Setup gates (fresh baseline, before first edit):

- `npm ci` root/web/tui → exit 0 each (0 vulnerabilities / audit notes only)
- `npm run typecheck && npm run build` (root) → exit 0
- web `npm run typecheck && npm run build` → exit 0 (chunk-size warning only,
  matches BASELINE.md evidence)

Dogfood harness: `FARLAB_DATA_DIR=<snapshot of real workspace>` +
`PORT=3296` (populated, 85 runs / 660 hypotheses / 1266 claims) and `PORT=3297`
(empty). Served-bundle chain: source commit `47cc373` → `web/dist` built in
the lane worktree → `node scripts/serve.mjs` (D-031 stale-dist guard passed)
→ browser at 127.0.0.1:3296 (cache-busted reloads after each rebuild).

Live-verified journeys (browser DOM snapshots + node-id clicks on the real
bundle, AFTER state):

1. 研究页 → `讨论此研究` → conversation `conv_dprw5g…` created (real POST),
   dock open beside objects, URL `#run/…/research?conv=conv_dprw5g…`,
   sidebar count 1→2.
2. Full reload at that URL → dock + research view restored (resume journey).
3. `#conv/conv_dprw5g…` → full-view conversation.
4. Navigate to no-conv run URL → dock closes, bar returns to 讨论此研究.
5. Evidence overview `反对关系` 0→1 (agrees with relations section).
6. Hypotheses: №1 renders explicit 证据绑定：暂无…
7. Research tab: supervisor block = 研究已结束（completed）+ archived
   disclosure; stage table shows `检查点: 已保存 · 3 项输出`.
8. Sidebar: `未开始 0 轮讨论` for the new conversation.
9. Empty instance (3297): first-user view intact, health ready fast.

Final gates:

- web typecheck + build → exit 0
- root `npm run lint` → 0 errors / 3 pre-existing unused-eslint-disable warnings
- root `npm test` → **1441 passed / 4 skipped / 1 failed**; the 1 failure is
  `tests/storage-hardening.test.ts:57` — the DOCUMENTED pre-existing
  date-sensitive fixture (hardcodes `2026-08-24T12:00Z`, fails after 12:00
  UTC; signature matches EXECUTION_STATE's record; lane 01 changed zero
  backend/test files — `git status` shows only `web/src/**`).
- `node zcode-harness/scripts/secret-scan.mjs` → PASS (exit 0)

Screenshots: IAB capture artifacts (URLs expire; regenerated on demand):
welcome BEFORE-state with 健康检查失败 (mid-session capture), AFTER research
+ dock view, right-edge dock clip. DOM-snapshot evidence (in this report's
session log) is the primary chain; vision-model reads of the screenshots
proved unreliable (one hallucinated a nonexistent page title) and were not
used as evidence.

## 4. Conflict notes (shared files touched)

All changes are inside `web/src/**` ownership (prompt-pack boundary): no
`styles.css` / `common.tsx` / `ui/**` / `viz/**` edits — dock styling lives
in the new lane-01 file `web/src/conversation-dock.css` reusing existing CSS
custom properties. `web/src/i18n/dict.ts` gained 10 keys (zh+en, kept in
key-sync by its Record type). No backend files touched; no other lane's
worktree/branch touched; primary tree never modified (worktree-only lane).

## 5. Handoffs

Given (all in `.planning/concurrency/handoffs/`):

1. `r2-2026-08-24-from-01-to-12-health-coldstart.md` — P1, evidence + client
   mitigation shipped, server latency owner is 12.
2. `r2-2026-08-24-from-01-to-12-liveready-semantics.md` — P2, persisted-claim
   vs live-probe labeling.
3. `r2-2026-08-24-from-01-to-08-run-discussion-link.md` — P2, durable
   run↔discussion link (client currently dedupes per session, honestly).
4. `r2-2026-08-24-from-01-to-02-health-checking-tone.md` — P2, missing
   `.health-strip--checking` style (styles.css is lane-02 authority).

Received: none.

## 6. Deviations

- **Branch naming**: prompt pack said `ws/r2-hx-web-product/main`; the
  binding INTEGRATION_RULES setup command says `ws/r2/<nn>-<slug>` → used
  `ws/r2/01-hx-web-product` (contract wins; noted for the Integrator).
- **Report path**: prompt pack said `reports/r2-hx-web-product-report.md`;
  BASELINE.md says `reports/r2/<nn>-<slug>-report.md` → used the contract
  path.
- **OWNERSHIP.md internal inconsistency**: lane-01's exception list names
  `api/** hooks/** … App.tsx main.tsx components/**` as "lane-02 files",
  but lane-02's own section claims only styles/tokens/common/ui/viz. The
  user's lane prompt (authoritative) grants lane 01 `web/src/**` except
  visual-authority files. Followed the prompt; lane 15 should fix the doc.
- No live-API testing performed (policy respected); all journeys ran on
  persisted real workspace data. Model-turn behaviors (resident-agent
  replies, automations firing) are BLOCKED-live by policy — surfaces
  verified structurally.
- Playwright-locator clicks time out app-wide in this session's IAB (env
  quirk; typing + node-id clicks + hash routes work) — walkthrough used
  domSnapshot + dom_cua; not a product defect (input events verified
  delivered).

## 7. Remaining debts / follow-ups

- Evaluator-family detail i18n (#6) and weakening-relation target disclosure
  (#8) — recorded above.
- ResearchStatePanel is hardcoded-zh (pre-existing pattern); full i18n if the
  panel becomes en-critical.
- Conversation "讨论中" for turns>0 remains the open-status projection
  (unchanged semantics).
