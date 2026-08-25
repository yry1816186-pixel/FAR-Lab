# Lane 15 — governance-release — R2 report (2026-08-25)

Branch `ws/r2/15-governance-release` from `baseline/parallel-r2` (`47cc373`). Lane mandate:
specs/docs/repository governance/licensing/CI-release/submission/competition evidence.

## 1. Commits

- `2f5f743` docs(competition): adjudicate 30-vs-20 page limit (bind 20) + submission map + release blockers
- `753fa17` feat(harness): deterministic OSS license ledger + gate; CI covers lint/TUI/CLI-smoke/release-pack
- `3d96a86` chore(governance): Apache-2.0 metadata alignment, stray dump removal, R1 report snapshot banner
- (this commit) docs(governance): hosted-CI outcome, NOTICE picocolors entry, 15→03 hosted-CI handoff, report

## 2. Evidence (commands + exits, 2026-08-25, lane worktree)

| Gate | Command | Result |
| --- | --- | --- |
| Baseline identity | `git worktree add work/r2-15-governance-release -b ws/r2/15-governance-release baseline/parallel-r2` | HEAD == `47cc373` == tag ✓ |
| Installs | `npm ci` (root/web/tui) | exit 0 ×3, 0 vulnerabilities |
| Typecheck | `npm run typecheck` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | 0 errors / 3 warnings (pre-existing unused-eslint-disable, identical to BASELINE record) |
| Full suite (serial) | `npm test` | **1 failed / 1441 passed / 4 skipped (1446)**, exit 1 — the single failure is `tests/storage-hardening.test.ts > RU-7.3 backwards-clock detection`, the KNOWN date-sensitive baseline-inherited red (independently reproduced by lanes 09/11 on 2026-08-24/25; fix already exists on lane 12's branch `24f2555`, awaiting fusion). Two serial reruns show exactly this one failure; an earlier run executed concurrently with the TUI suite showed one extra failure that never reproduced serially (CPU-contention flake). Lane 15 touched zero runtime/test code — this red is not lane-introduced. |
| TUI tests | `cd packages/tui && npm test` | exit 0, fail 0 |
| CLI smoke | `node dist/cli/main.js --help` | exit 0 (offline help path) |
| License gate | `node zcode-harness/scripts/license-ledger.mjs --check` | PASS — 4 workspaces, 2 recorded exceptions (jszip MIT-election; sharp win32 binary build-time-only/never-distributed) |
| Secret scan | `node zcode-harness/scripts/secret-scan.mjs` | exit 0 (known allowances only) |
| Path hygiene | `node zcode-harness/scripts/path-hygiene.mjs` | exit 1 — identical to the BASELINE-documented worktree condition (missing untracked `.control/*`; `.venv` oversized-file allowance). Environmental, pre-existing, not lane-introduced. |
| Page-limit recheck | WebFetch of both official pages, 2026-08-25 | Aliyun `PDF≤30页`; NADC `PDF≤20页` — contradiction still live; adjudicated ≤20 (COMPETITION.md) |
| PR #128 close-out | per-file `git cat-file -e baseline/parallel-r2:<file>` sweep over `origin/main...origin/mission/gap-closure` | every changed file present, deliberately untracked (`.control/*`, `eval/results/*`, spikes outputs), or deliberately superseded (`NewRunForm.tsx` → `ResearchComposer.tsx`, commit `cc24715`); PR closed with verification comment (no merge) |

## 3. Competition compliance (core lane deliverable)

- `project-spec/COMPETITION.md` reverified 2026-08-25 against both official pages: model-route
  requirement unchanged (Qwen base via Bailian or officially recommended tools + receipts);
  **page-limit contradiction confirmed still live and ADJUDICATED: bind ≤20** (dominant
  strategy — compliant under both rules; re-open only on new official text). Lane 11's
  2026-08-24 "unified ≤20" claim retracted. NADC submission entry URL recorded
  (https://survey.aliyun.com/apps/zhiliao/A4e_qqNGu).
- NEW `submission/COMPLIANCE_MAP.md`: official evaluation-loop requirements → implementation
  owners → runtime evidence → submission material; submission checklist with honest states;
  scoring-dimension → product-strength mapping for the technical PDF. Static mapping only —
  dynamic status stays in `.control/ACCEPTANCE_STATUS.json` (no second status authority).
- NEW `submission/RELEASE_BLOCKERS.md`: the single published gap list — B-QWEN-LIVE-ROUTE
  (ACC-02 below target; user credential + one receipted live run), S-1 technical PDF (≤20pp,
  unwritten), ACC-40 evidence level (sibling lane owns). User-owned submission actions
  separated from engineering blockers.

## 4. OSS / license governance

- NEW `zcode-harness/scripts/license-ledger.mjs` (deterministic, offline): audits all 4
  workspaces' declared+installed packages, renders `submission/OSS_LEDGER.md`, `--check`
  gate fails on ledger drift or unapproved copyleft; exceptions require a recorded
  justification (currently: jszip MIT-branch election; sharp win32 LGPL binary — build-time
  only, never distributed, release manifest prunes node_modules).
- License metadata aligned to the adjudicated Apache-2.0 (NOTICE/LICENSE): `license` field
  added to root/web/desktop `package.json`; TUI `MIT` → `Apache-2.0`. Lockfile does not
  record the root license field, so `npm ci` sync is unaffected (verified).
- Runtime-dependency invariant re-verified: root `dependencies` == `zod` only.
- **Dependency-policy sign-offs (lane 15 authority):** lane 03's `packages/tui/package.json`
  delta (version 0.1.0→0.3.0, description, test-script extension) — no new dependencies →
  APPROVED. No other lane changed any package.json dependency lines.

## 5. CI / release policy

`.github/workflows/ci.yml` rewritten to exercise the current architecture: fresh installs
(root/web/tui) → build → typecheck → **lint (new)** → full suite (real uv sidecar) →
**TUI package tests (new)** → **CLI smoke `--help` (new)** → **license ledger gate (new)** →
secret/path scans → web production build (typechecks web via its build script). NEW
`release-pack` job (tags `v*` + manual dispatch only): runs the self-verifying
`scripts/export-public.mjs` (fresh-install verify inside the exported copy) and uploads the
public-release artifact. No live-API gates; no obsolete gates preserved.

## 6. Repository hygiene findings

- `ach-matrix.yml` (root) — unreferenced RTL accessibility-tree debug dump; REMOVED.
- `final_delivery.md` — must stay at root (`FINAL_BUILD_PROMPT.md:27` mandates it); added a
  prominent historical-snapshot banner (R1, dated facts, pointers to current authorities).
- `jss_metafor.pdf` — intentional docling fixture (referenced by `artifacts/live-verify.mjs`); kept.
- `.qoder/**` (IDE-generated repowiki, ~640KB) — history-only (untracked now); history
  rewriting is forbidden, so recorded, not rewritten.
- Primary worktree untracked junk `$null` (PowerShell redirect accident) — NOT touched
  (sibling in-flight tree; recommending deletion to the owning session).
- `work/human-experience` stale worktree — pruned via `git worktree prune` (BASELINE says
  safe; no unique commits).
- Repo pack 35.75 MiB — acceptable; largest blobs are intentional evidence PNGs and the PDF
  fixture. No action.
- **Lane discipline findings for the Integrator:** lane 13 has NO lane branch/commits (its
  reliability work lives in the primary tree on `build/hx-reconstruction` — residue-fusion
  required, same as lane 05's multimodal commits `fb2c2ed..b04c29a`); lane 14 not started
  (no branch). All 11 pushed lane branches carry reports; handoff naming conventions
  followed everywhere except one (lane 01 uses `from-01-to-XX` while later lanes use
  `NN-to-NN`; harmless).

## 7. Conflict notes (shared files touched by this lane)

- `package.json` (12), `web/package.json` (01), `packages/tui/package.json` + `desktop/package.json` (03):
  one-line `license` metadata additions only — LICENSE/NOTICE policy is lane 15's primary
  ownership; deviation recorded (§9). Merge-safe (no dep/lockfile impact).
- `.github/workflows/ci.yml`, `zcode-harness/**`, `submission/**`, `project-spec/COMPETITION.md`,
  `final_delivery.md`, `.planning/concurrency/**`: lane 15 primary ownership.

## 8. Handoffs

- Received `r2-2026-08-25-from-11-to-15-page-count-discrepancy.md` → ADJUDICATED (≤20);
  receipt written: `r2-2026-08-25-from-15-to-11-page-limit-adjudicated.md` (no action needed by 11).
- Given `r2-2026-08-25-from-15-to-03-hosted-ci-picocolors-red.md` (high urgency): hosted-CI
  red in `tests/cli-term.test.ts` — identical code was green on GH 2026-08-24 and red
  2026-08-25; owner lane 03 to diagnose (suspected ambient-env drift, NO_COLOR/argv path).
- Open (informational to Integrator, not new handoff files): lane-13/lane-05 work sits on
  `build/hx-reconstruction` residue rather than lane branches (see §6); RU-7.3 fix already
  on lane 12's branch awaiting fusion.

## 9. Deviations

1. Branch name `ws/r2/15-governance-release` (OWNERSHIP/INTEGRATION_RULES convention) instead
   of the lane prompt's literal `ws/r2-governance-release/main` — repo convention wins
   (12 existing lanes follow it); noted for the Integrator's fusion script.
2. License-metadata one-liners in lanes 01/03/12-owned package.json files under lane-15
   LICENSE-policy authority (§7).
3. `npm test` exits 1 due to the inherited RU-7.3 red (§2) — not fixed here because the test
   file is lane 13's (reliability) ownership and the fix already exists on lane 12's branch;
   duplicating it here would violate the no-second-author rule.

## 10. Hosted-CI outcome (pushed branch, run 32862865855) and honest limits

- The rewritten `verify` job reached `Full test suite` and failed there on exactly TWO
  pre-existing baseline reds: RU-7.3 (date-sensitive, fix on lane 12's branch) and
  `cli-term` picocolors color-discipline (GitHub-runner env drift between 2026-08-24 green
  run 32747734353 @`2e5c9a9` and 2026-08-25 red runs — identical test+vendor bytes; full
  evidence chain in handoff `r2-2026-08-25-from-15-to-03-hosted-ci-picocolors-red.md`).
  Steps after the suite (TUI tests, CLI smoke, license gate, scans, web build) could not
  execute on GH; each is locally verified green (§2). Lane 15 introduced neither red.
- NOTICE gap found during that investigation: vendored picocolors was missing from the
  extracted-components list — added (ISC, v1.1.1, one documented local adaptation).
- The two-exception copyleft allowlist reflects today's installed tree only; ledger
  `--check` in CI will catch any future drift.
- Competition facts are as of 2026-08-25 fetches; any later official page change supersedes
  COMPETITION.md by its own rule.
