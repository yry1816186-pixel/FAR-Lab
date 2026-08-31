# Wave A execution lane — 2026-08-31

Branch: `lane/endgame-wave0-root`, continuing from the verified Wave 0 head
`9843eff`. The primary Windows worktree and user-owned port 3196 remain
untouched.

## FA-PLT-02 — canonical CI / loaded-home CLS

Finding state before repair:

- Current canonical `main@cc4009c` hosted run 33315252432 is red. Its verify
  job passed; web-e2e reported 22 passed and one failed. The sole failure is
  `perf: home first paint and layout stability`, CLS 0.123795 on both attempts
  against the unchanged `<0.1` budget.
- A fresh isolated route on local port 3299 measured home CLS 0.0001 and map
  CLS 0.0785 (2/2 pass), so an unconditional page-wide rendering regression is
  ruled out.
- The real preceding suite state was reproduced on isolated port 3300 by
  running core-journey, draft-scope, then perf in one scratch workspace. After
  one completed study and one persisted draft existed, home CLS was 0.115515
  on both attempts; six other tests passed. This makes the first asynchronous
  data-load transition the bounded seam. Source-node attribution is the next
  diagnostic; no threshold or retry weakening is allowed.

Design-gate summary for this repair:

- User need/task: a returning researcher must reach the workbench without the
  navigation rail, judgment queue, or study index jumping while saved work
  loads.
- Information hierarchy: persistent shell and compose entry first; saved study
  and conversation projections appear only from real API state.
- State/failure: initial loading must reserve or atomically replace honest
  structure; errors remain visible and retryable; no fake rows or fabricated
  progress.
- Verification: deterministic loaded-workspace reproduction, layout-shift
  attribution, fresh and loaded perf gates, full browser surface regression,
  production build, then hosted run after an authorized integration/push.

Repair checkpoint — source commit `87a1f3f`:

- Layout-shift attribution found that `AwarenessBar` was inserted only after
  `/runs` returned active work. The resulting 43px shell insertion moved
  `.app-body` from y=59 to y=102 and contributed 0.115474 CLS. The strip now
  owns one stable semantic slot and renders truthful loading, idle, and active
  states instead of conditionally changing shell geometry.
- Two adjacent shell shifts were closed at the same ownership boundary: the
  app frame now owns a bounded viewport/scroll region, and the recent-study
  rail group owns a stable loading/empty/loaded region rather than appearing
  after asynchronous data arrives.
- Permanent layout-shift source/rectangle attribution was added to the perf
  regression. This exposed a second deterministic map defect after the home
  fix: the evidence request set `scienceLoaded` before the independent
  `/science` request settled, removing a 311.5px state placeholder and
  contributing 0.158829 CLS. A separate `spineLoaded` fact now owns that
  projection; one request can no longer claim another has completed.
- The loaded-home perf case now creates active work explicitly, asserts the
  awareness surface, requests cancellation, and waits for a persisted terminal
  state. An intermediate full-suite run showed why the last step matters: only
  requesting cancellation leaked an active worker into the later resilience
  case. The cleanup contract was fixed rather than hidden with a retry.

Direct verification after the final repair:

- Web typecheck and production build: PASS.
- Root typecheck: PASS; lint: zero errors and the same three pre-existing
  unused-disable warnings.
- i18n key regression: 4/4 passed.
- Isolated perf route: 2/2 passed; loaded home CLS 0.0001, map CLS 0.0185,
  seven claims, zero admissible template hypotheses, zero long tasks.
- Original reproduction order (`core-journey`, `draft-scope`, `perf`): 7/7
  passed; loaded home CLS 0.0001 and map CLS 0.0184.
- Complete Chromium route with one worker: 23/23 passed in 4.6 minutes; no
  retry or failure. It includes resilience, role/a11y, bilingual/theme,
  keyboard, narrow-screen, researcher-judgment, task-metric, and real-terminal
  paths.
- Secret scan: PASS across 901 files, no HIGH finding. Path hygiene: zero
  errors; only ignored `dist`/`node_modules` artifacts warned. `git diff
  --check` passed before commit.
- Five-table sync/check after the source commit: structural PASS across 902
  tracked files. Coverage remains deliberately incomplete at 5/902 reviewed
  (runtime 2/378, tests/evaluation/evidence 2/321, delivery/operations 1/114,
  product/specs/docs 0/38, governance/assets 0/51); shallow assertions are
  1/168 adjudicated. FA-W0-05/06 therefore remain PARTIAL.

FA-PLT-02 remains PARTIAL rather than PASS: canonical `main@cc4009c` still has
the red hosted run recorded above. The local root cause is closed at `87a1f3f`,
but a canonical hosted verify+web-e2e green run must be observed after this lane
is integrated before the hosted-CI acceptance criterion can change state.

## FA-PLT-07 — Web production artifact weight (finding before repair)

Pre-repair production-build inventory at `f058934`:

- `web/dist`: 47,856,580 bytes; the 17 production source maps alone are
  16,395,647 bytes.
- `ort-wasm-simd-threaded.asyncify-*.wasm`: 23,567,050 bytes in the default
  artifact even though clean source has no vendored Whisper model and the
  dictation path must report `model_missing`. Root cause is ORT's default
  bundled-wasm export condition; the worker later points at separately
  vendored `/models/ort`, so a populated ASR distribution would carry both.
- Both browser pdfjs implementations are emitted: modern 479,385 bytes and
  legacy 535,249 bytes. The Node-only branch inside `pdfCollect.ts` remains
  statically discoverable to the browser bundler.
- The main entry is 1,313,137 bytes and its source map confirms KaTeX remains
  static (618,563 source bytes) even though only hypothesis statements with
  `$...$` need it. Radar/ECharts, XLSX, mammoth/office, citation parsers and the
  ASR worker are already separate chunks, but there is no deterministic gate
  proving they stay off the cold shell.

Predeclared repair contract (no post-hoc budget movement):

- application shell excluding explicit optional `/models` assets stays below
  10,000,000 bytes, contains no `.map`, and contains no ORT wasm outside that
  optional asset directory;
- browser output has one pdfjs runtime, with no legacy pdfjs chunk;
- KaTeX, ASR, ingest and comparison visualization remain lazy and absent from
  the initial HTML dependency closure;
- a deterministic inventory gate records shell, initial and optional assets
  and fails the budgets; real PDF ingestion, visible ASR-unavailable behavior,
  production build and cold-shell browser requests must still pass.

Additional pre-repair failure found by the required browser route (isolated
port 3312, both attempts): the absent Whisper probe correctly returned HTTP
404 and the worker diagnostic said `ASR model not vendored`, but the UI showed
the generic “语音转写失败”. `asr-worker.ts` classifies the `load` message as
`model_missing`, while its `transcribe` catch hard-codes every failure to
`transcribe_failed`. Because recording warm-up and transcription are
concurrent, the typed warm-up error can be dropped before the pending
transcription promise exists, leaving the later hard-coded classification as
the user-visible result. This is part of FA-PLT-07's honest optional-capability
contract and must be fixed at the worker boundary; weakening the browser
expectation to accept the generic error is forbidden.

### Closure evidence (commits cbcfba7 + 62917fd)

- Production build and the build-integrated bundle gate PASS: application
  artifact 7,346,964 bytes (pre-repair 47,856,580), initial closure 1,203,645
  bytes / 336,506 gzip, zero `.map`, zero wasm outside `/models`, one modern
  pdfjs runtime, no legacy pdfjs runtime. KaTeX/CSS, PDF, XLSX, Radar and ASR
  remain outside the initial manifest closure.
- Deterministic gate regressions pass 3/3; the real Node PDF collection → SDM
  integration passes 4/4.
- Chromium optional-capability and transition suite passed 15/15 across five
  repetitions with retries disabled: actionable missing-model ASR, state held
  across the initial empty-workspace transition, and real selected-PDF parsing.
- Combined optional/performance gate passed 5/5 with retries disabled. Cold
  home requested main JS/CSS and four fonts only; home FCP/LCP/CLS was
  148ms/196ms/0.0001, map 112ms/160ms/0.0002, with zero long tasks.

## FA-PLT-08 — Static frontend cache identity (finding before repair)

Pre-repair live `HEAD` probes against the production static server on isolated
port 3320 found that both `/` (`index.html`, 1,932 bytes) and the content-hashed
`/assets/index-CSzSy9GS.js` (1,042,096 bytes) return `Content-Type` and
`Content-Length` only. Neither response supplies `Cache-Control`, `ETag`, nor
`Last-Modified`. This matches the older durable-state observation that a shell
deployment required a hard reload because `index.html` cached.

Predeclared repair contract:

- unversioned `index.html`, model assets, and other non-Vite static files must
  revalidate rather than become indefinitely stale;
- Vite-owned `/assets/` files are content-hashed and may advertise
  `public, max-age=31536000, immutable`;
- every 200 static representation carries an identity validator, and a matching
  `If-None-Match` returns an empty 304 with the same cache contract for both GET
  and HEAD;
- MIME truth, missing-model 404s, and path-traversal refusal must not regress.

### Closure evidence (commit 62917fd)

- Root typecheck/build pass; `tests/api.test.ts` passes 78/78, including
  index/assets/models cache policy, strong sha256 ETag, GET+HEAD conditional
  304, MIME, missing-model 404 and traversal refusal.
- Post-build production probes on isolated port 3321 observed `/` as
  `no-cache` and hashed JS as `public, max-age=31536000, immutable`; both exact
  validators returned 304 with zero response bytes and retained `nosniff`.

## FA-PLT-03 / FA-SEC-09 / FA-SEC-10 — release evidence chain (finding before repair)

Pre-repair inspection at `8a5200f` found that the hosted `release-pack` job is
not yet a distributable or independently verifiable release path:

- `zcode-harness/public-release-manifest.json` omits both
  `experiment-runtime/**` (which `src/experiment/python.ts` and the remote
  executor require) and the documented first-class optional TUI at
  `packages/tui/**`. The exported source snapshot therefore cannot implement
  all capabilities described by its own README.
- `scripts/export-public.mjs` calls `npm ci`, typecheck, build, lint and tests
  only at the exported root. It does not install/build the exported Web app,
  does not test/package the TUI, and does not provision or directly verify the
  Python sidecar. The workflow's pre-export installs happen in the private
  workspace and cannot prove the copied tree is self-sufficient.
- The job uploads a mutable directory artifact only. It emits no release
  archive, content manifest, SHA256SUMS, SBOM, signed provenance/attestation,
  or GitHub Release. `PROVENANCE.md` embeds wall-clock time, so even a later
  archive would be nondeterministic without a source-date contract.
- CI has no dependency-audit gate and no SAST workflow. `npm sbom
  --package-lock-only --sbom-format=cyclonedx` is available in the pinned
  Node/npm 24 toolchain and works for each npm lock, but an npm-only document
  would not truthfully inventory the Rust and Python locks shipped here.
- The TUI package dry run currently includes all seven test files and exposes
  a TypeScript bin requiring Node's strip-types behavior, while declaring no
  Node engine or publish file allowlist.

Predeclared repair contract:

- the allowlist ships every runtime leg it documents, and verification occurs
  inside the exported copy for root, Web, TUI and the Python sidecar;
- release construction produces one deterministic source archive plus a
  machine-readable content manifest, SHA256SUMS and a multi-ecosystem
  CycloneDX SBOM, with a local verification command that rejects tampering;
- hosted release construction generates signed GitHub/Sigstore provenance and
  an SBOM attestation before any public release asset may be published;
- dependency auditing and JavaScript/TypeScript CodeQL become hosted gates;
- no acceptance item moves to PASS until the hosted evidence exists, and no
  GitHub Release is published while R-21 remains open.

### Local closure checkpoint (baseline `b4dc93b`, ledger update follows)

- The public allowlist now carries root, Web, TUI, Python runtime, desktop,
  public audit snapshots and community/source assets. It continues to exclude
  `.control`, private research/evidence state, internal prompts and history.
- Export refuses a dirty source tree, derives timestamps from the source
  commit, constructs an ephemeral Git repository only for inventory tests,
  and prunes `.git`, dependency trees, build products and caches in `finally`.
  The archive builder independently rejects any `.git` residue.
- The exact copied tree exported 888 source files and passed inside-copy gates:
  root typecheck/build/lint plus 2342 tests passed / 12 honest skips; Web
  production build and 7,346,964-byte bundle gate; TUI 49/49 plus an 18-file
  clean npm pack; locked Python environment/import; desktop npm lock and Cargo
  metadata under Rust 1.98.0.
- An initial run failed truthfully because `FINAL_ACCEPTANCE.json` and a local
  Git context were absent. Those hidden dependencies were fixed. A later run
  exposed `onnxruntime-node` downloading an unused 44 MB partial CUDA package;
  the task-owned partial file was removed and the Web/browser-only route now
  sets `ONNXRUNTIME_NODE_INSTALL=skip`, reducing clean Web install from minutes
  to seconds without changing `onnxruntime-web` output.
- Syft 1.51.0 was downloaded from the immutable official release and checked
  against the published SHA-256. A real CycloneDX 1.7 scan found 991 components:
  npm 456, Cargo 494, PyPI 24, GitHub 9 and 8 without purls. The release builder
  accepted all three required lock ecosystems.
- The 890-file source archive, content manifest, SBOM, release notes and
  SHA256SUMS passed independent safe-extraction and byte-level manifest checks.
  A second build from the same source/SBOM was byte-identical; archive SHA-256:
  `a221b8d9223fa3055bfd8c456453cd56bec09f4e9f034f22a2017ca9b467feeb`.
- Tag publication remains fail closed: `v0.1.0` is rejected while its changelog
  marker is `UNRELEASED`. No tag or public release was created.
- Hosted workflow now gates release on Ubuntu+Windows verify, Chromium+Firefox,
  four npm audit cells and CodeQL for Actions/JS-TS/Python/Rust; every Action is
  pinned to a full commit SHA. It wires GitHub OIDC build/SBOM attestations and
  verifies them before upload. None of these hosted results or signatures is
  claimed locally. Run 33369651681 still renders `In progress`, 0/2 verify.
- Acceptance truth after local closure: 20 PASS / 34 PARTIAL / 10 FAIL /
  2 BLOCKED_EXTERNAL. FA-PLT-04 and FA-PLT-06 moved to PASS; FA-PLT-01,
  FA-PLT-03, FA-SEC-09 and FA-SEC-10 remain PARTIAL pending hosted evidence
  (and updater work for FA-SEC-10).
