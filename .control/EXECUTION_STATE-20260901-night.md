# Night lane execution state — 2026-09-01 (Claude Code, ENDGAME-PLAN-v9)

Branch: `lane/endgame-wave0-root`, sibling to the 2026-08-31 wave0/wavea
lanes (their CLS work at `87a1f3f` and Wave-0 evidence stand; this lane
complements them and rebase-merges their pushes before every push of its own).

## CI-red root causes closed on this lane (all reproduced locally first)

1. **Verify (windows) three reds** (`5582f27`):
   - docker suites gated on OSType=linux — GitHub windows runners ship a
     Windows-container engine, `node:24-slim` has no windows/amd64 manifest;
     real SSH chain verified green locally on the WSL2 backend.
   - `web-bundle-budget` moved to the real CLI process boundary — vite-node's
     transform of plain-`.mjs` sources outside `web/src` returns an empty
     module on Windows (transformRequest len=0, transform [skipped]; linux/
     macos unaffected). The inspector CLI gained an optional budget arg with
     fail-fast exit 2 on non-numeric input.
   - endgame-sweep fixture `git init --template=` — a host-global
     `init.templateDir` pre-commit leaked into fixture repos (CI has none,
     hence platform-divergent).
2. **License ledger CRLF** (`9652fe3`): repo content is LF, autocrlf checkout
   on windows renders CRLF, `--check` byte-diff goes red on windows-latest
   only. `.gitattributes` pins `submission/OSS_LEDGER.md text eol=lf`;
   comparison itself untouched. Verified: local windows check PASS rc=0.
3. **E2E three families** (`d8a1416` + sibling `485d925`):
   - PDF spec fresh-only heading → composer anchor (sibling landed first;
     this lane rebase-adopted their version).
   - dictation spec: `route('**/models/**') → 404` hermetic precondition —
     a developer dist can carry 157 MB of real ASR artifacts which sent the
     worker into a full wasm load past the 30 s assertion.
   - **product bug**: `homeSurface` rendered in two alternative JSX branches
     (`newResearchView` vs fallback) — the branch flip remounts the whole
     workbench and silently discards a question typed into the first frame
     (Firefox's looser commit timing exposes it). Single-slot rewrite in
     App.tsx; `runDetail.id` restores the narrowed type chain.
4. **retrieve cancel checkpoint** (`eba4208`): `run_cancelled` persisted but
   the retrieval loop (planned queries / variants / citation chase) had zero
   cancellation checks — the run stuck at `running` with an endless receipt
   stream and no cancelled UI (resilience.spec:41 red twice in CI; local
   test-double reproduction seq 9-10 `run_cancelled` then receipts growing).
   `assertNotCancelled` now guards `runSearch` entry and every chase seed.
   Registered TODO: run_cancelled double-write (api.ts:1235 via:http +
   orchestrator.ts:755 via:persisted-request — W1-shape, follow-up).
5. **playwright projects** (`d8a1416`): three explicit browser projects, the
   System-Edge channel bound to chromium only (firefox/webkit reject any
   channel; local `--project=firefox` used to die on launch); CI
   `--browser` → `--project`.

## Capability slices landed

- **TUI + desktop shell i18n** (`1a42bc4`): `FARLANG` resolution (zh
  historical default), bilingual stage/status/conn/rel-time/composer tables
  (EN mirrors web dict — no competing translations), `render-en` smoke
  proves no zh leakage; Rust `lang_is_en` pure fn + dialog/notification
  bilinguals. node:test 54/0, cargo test 7/0.
- **Desktop sidecar packaging** (`9a71c5b`): `stage-sidecar.mjs` builds a
  self-contained backend payload (dist + web/dist + zod + serve.mjs; runtime
  dep set is exactly zod) with D-031 precondition, per-stage health smoke
  (PASS at 173.6 MB), and a `--check` drift gate; `sidecar_root()` resolves
  packaged resources across the three platform layouts with dev-tree
  fallback; D-031 learned the distributed-tree semantics (no src → no
  staleness to guard) with a regression test. BUILD_SCOPE.md updated with
  the honest remaining boundary (system Node external, Python runtime not
  packaged, installed-app journey still UNVERIFIED).
- **Wave A docs** (`c4611fc`): ADR-static-encryption (OS-FDE delegation with
  the three reasons), TROUBLESHOOTING (all entries real incidents with
  verified causes), CONTRIBUTING (real gate commands, lane discipline).
- **Design baseline walkthrough** (in-account, `.control/
  HCI_FINAL_COVERAGE-20260830.md` appended): 3 surfaces × vision-model
  review on gold data = 9 Critical + 26 Warning registered; fixes scheduled
  for Wave D per the plan's own wording. One benign stable 404 recorded
  (`GET /runs/:id/protocol` absence state).

## Gates at last push (eba4208)

root tsc 0 / eslint 0 / full vitest 233 files 2349 passed 9 skipped 0 failed /
cargo check+test 7/0 / three-browser e2e × core-journey→optional-assets
4+4+4 exit 0. Hosted CI for `eba4208` pending at time of writing; `d8a1416`
hosted run had 19/20 jobs green with only release-pack's embedded chromium
full red on resilience:41 — root-caused and fixed as (4) above.

## Open on this lane

- NSIS local bundle build to prove sidecar ships inside the installer
  (release-pack gate embeds it in CI).
- run_cancelled double-write cleanup (registered TODO above).
- Wave A remaining depth items: off-source-tree installed-app e2e, updater,
  uninstall cleanup, deb/AppImage/macOS notarization disclosures.
