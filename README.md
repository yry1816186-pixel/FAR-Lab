# FAR-Lab

**An evidence-constrained, falsifiable, iterable, traceable open-source AI Scientist research system.**

> 🎯 **一句话：FAR-Lab 是一个证据约束、可证伪、可迭代、可追溯、可复现边界清楚的开源 AI Scientist 研究系统——它从科学问题出发，调用真实文献与数据源生成并比较候选假设，设计可执行研究计划，吸收人工/文献/工具反馈完成修订，并通过确定性验证内核和内容寻址证据链约束模型幻觉与科研表演。**
>
> 产品关系（科学假设生成与研究计划设计）：
> ```text
> AI Scientist 科研生成、证据整合与研究规划主系统   (far research: 生成候选假设 + 比较 + 研究计划)
>                          ↓
> FAR-Lab 确定性可信验证内核                        (R0–R9 裁决 / FEC 可证伪契约 / 内容寻址证据链)
>                          ↓
> 可追溯证据、裁决、版本与复现包                    (.far-proof / ProofEnvelope / 第三方独立重算)
> ```

> FAR-Lab is an **open-source AI Scientist research system**: it starts from a scientific question,
> grounds it in real literature (OpenAlex / arXiv / Crossref, supporting **and** counter-evidence),
> generates and compares **mechanistically-distinct candidate hypotheses**, designs an **executable
> research plan**, and routes every claim through a **deterministic verdict kernel** — not an LLM —
> so the result is falsifiable, tamper-detectable, and independently recomputable. It does not chase
> the "fully-automated scientist" narrative: **the LLM proposes, the deterministic kernel decides, and
> a third party can re-verify**.
>
> 🇨🇳 中文文档：[README.zh-CN.md](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%E2%89%A511-blue.svg)](https://www.python.org)
[![CI](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg)](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml)

> Badges point at **real** workflows / facts. CI badge state is whatever GitHub reports live — we do
> not fabricate a green. Release / PyPI / Docker badges are intentionally absent until those
> publications exist.

---

## 30-second install

> The one-line installer points at a GitHub Release asset. Until the first release is published,
> use the developer install below — the `far` commands are identical.

**macOS / Linux / WSL** (once a release exists):
```bash
curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
far doctor
far demo tess-offline
```

**Source install (works immediately — distributed via source, not npm registry):**
```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
pnpm far doctor            # environment self-diagnosis (no key needed)
pnpm far demo tess-offline # offline demo — needs ZERO credentials
```

> This project is distributed as source (git clone + pnpm install) and is not published to the npm
> registry. Every command below runs as `pnpm far <cmd>` (the `far` script wraps
> `node src/cli/far.ts`); without pnpm — e.g. a bare git clone with only Node ≥ 24 — invoke the CLI
> directly: `node src/cli/far.ts doctor`. After `pnpm install` the `far` bin is also available
> (or `pnpm exec far` / `npx far-lab`).

`far doctor` only **WARNs** on a missing API key — it never fails the offline experience and never
reads a key value.

---

## 2-minute Quickstart

```bash
# 1. Run the offline demo through the real R0-R9 kernel (15 golden vectors + end-to-end, no key)
pnpm far demo
#   → 15/15 golden vectors PASS · end-to-end demo claim sealed · exit 0
#   (the `tess-offline` sub-mode focuses on C-ASTRO-0001 and may yield UNTESTED; for a full
#    statistics-driven demo use `far demo`)

# 2. Run the deterministic verdict kernel over 15 golden vectors
pnpm far verify-golden --all

# 3. See tamper detection in action (requires a .far-proof bundle — run step 4 first to export one)
#    macOS / Linux / WSL (bash):
mkdir -p /tmp/tampered && cp -r .far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
pnpm far verify /tmp/tampered
#   → tamperStatus: tampered · recomputation.node: fail · exit 7
#
#    Windows (PowerShell 7+):
#   New-Item -ItemType Directory -Force tampered | Out-Null
#   Copy-Item -Recurse .far-proof tampered
#   (Get-Content tampered/proof_envelopes.jsonl) -replace 'UNTESTED','CONFIRMED' | Set-Content tampered/proof_envelopes.jsonl
#   pnpm far verify tampered

# 4. Export the proof bundle used by step 3
pnpm far export far-proof --demo-chain --force
```

**Exit-code semantics of `far verify --bundle`** (so scripts read it correctly): `0` = all
recomputation axes passed; `1` = **partial recompute (WARN)** — the hash chain and tamper check
are clean but some environment-gated axes (Python / browser Web-Crypto) did not run on this
machine — this is an honest *not fully recomputed* state, not a verification failure; `7` =
tampering detected (recomputation mismatched the stored evidence). A `status: WARN` with
`tamperStatus: clean` therefore means "chain intact, fewer independent re-computers than
possible" — rerun on a machine with the Python axis installed for the full three-axis result.


The same guarantees the quickstart walks through — bundle integrity, tamper detection (exit 7 on
edited evidence), and independent recomputation — are asserted end-to-end by the test suite
(`tests/far_proof/`, `tests/cli/export_far_proof.test.ts`), so a regression in any of them fails
`pnpm test` rather than a scripted walkthrough.

Full CLI reference: `pnpm far --help` (grouped overview) · per-command usage: `pnpm far <cmd> --help`.

---

## What problem does it solve?

LLM-generated scientific hypotheses suffer three failure modes: **unfalsifiable** (no experiment can
refute them), **irreproducible** (results drift across environments), and **untraceable** (conclusions
detached from evidence). FAR-Lab closes all three with:

- **Falsifiability engine** — every accepted claim must carry an executable falsification spec
  (metric + threshold + comparator). Claims without one are rejected at the gate.
- **Five-value verdict kernel** — a **deterministic** rule set (R0–R9), **not an LLM**, produces the
  verdict: `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`.
- **Content-addressed evidence chain** — all evidence, verdict traces, and FEC contracts are hashed
  (SHA-256) into an append-only log; cross-language (TypeScript / Python / browser) hashes are
  byte-identical. Tampering is detectable.

---

## What it is **not**

- ❌ It does **not** prove scientific truths. Demo verdicts come from **offline fixtures**, not real
  scientific adjudication.
- ❌ It does **not** use an LLM as the final arbiter. The LLM generates hypotheses; the deterministic
  R0–R9 kernel decides.
- ❌ It is **not** a "fully-automated scientist" — the hypothesis/plan generator and the verifier are
  separate roles, and human approval gates are first-class (see the research plan's
  `humanApprovalRequired`).
- ❌ It does **not** claim physical immutability or full reproducibility — see *Known limits*.

---

## Live quickstart (hypothesis generation + research plan)

```bash
# Ground a question in real literature, generate 3-5 candidate hypotheses,
# critique them independently, score them, and design an executable plan.
# No --profile needed: the default is `auto` — LIVE (real Qwen + real retrieval)
# when DASHSCOPE_API_KEY is set.
pnpm far research start "Does stellar activity inflate hot Jupiter radii?" --source openalex
```

This is the **representative live path**: real Qwen generation + real OpenAlex retrieval in one run.
Every stage records its component mode (`modelExecutionMode` / `retrievalExecutionMode`) and the
aggregate `runMode` (`LIVE` only when all science-affecting components are live).

**Without a key**: `pnpm far research start` **fails closed** (exit 2) with actionable guidance —
it never fabricates an answer to your question from synthetic fixtures. Two no-key paths:
`pnpm far ground "<question>"` (real literature retrieval — free, no key), or the explicit
`pnpm far research start "<q>" --profile offline_replay` wiring demo (`runMode=RECORDED_REPLAY`;
proves the pipeline plumbing — citation binding, deterministic scoring, Pareto front, plan design —
**not** any scientific truth). The deterministic verification kernel (`pnpm far demo`,
`pnpm far verify-golden`, `pnpm far verify`) runs fully offline with zero key.

### The research loop (three-minute walkthrough)

```bash
# 1. Run the vertical slice (researchability gate → grounding → hypotheses → critique → plan).
#    Live retrieval works WITHOUT a key (OpenAlex is free); the model call needs DASHSCOPE_API_KEY
#    (profile `auto` = LIVE with a key; without one it fails closed with guidance — see above).
#    Long runs are checkpointed per stage under .far/research-runs/<runId>/ — Ctrl+C cancels
#    honestly (state=CANCELLED, finished stages kept) and the run can be resumed.
pnpm far research start "Does stellar activity inflate hot Jupiter radii?" --out run.json
pnpm far research status <runId>     # lifecycle state + per-stage progress (8 stages)
pnpm far research resume <runId>     # continue a crashed/cancelled run from its checkpoint

# 2. Real-data analysis against the NASA Exoplanet Archive (live TAP fetch).
#    Domain-gated: a non-exoplanet run is REFUSED, never analyzed against the wrong dataset.
pnpm far research analyze run.json --live
#   → n=392 hot Jupiters, r=0.587, p<0.001 (association, not causation — honest wording)
#     (live-measured 2026-08; recompute with `pnpm far research analyze <run.json> --live` —
#      these values track the live NASA TAP archive and drift as it updates)

# 3. Apply expert feedback → immutable revision → compare the before/after plan:
pnpm far research feedback run.json --file feedback.json
pnpm far research compare run.json

# 4. Program-computed metrics + deterministic recompute:
pnpm far research evaluate run.json

# 5. Export a hash-pinned bundle + third-party verify (tamper → exit 7):
pnpm far research export run.json --out bundle
pnpm far research verify bundle

# 6. The same loop is available as a Web workbench + REST API (async + SSE):
#    pnpm dev   →  API on http://localhost:3000 + Web workbench on http://localhost:5173
#                  (one command starts both; Ctrl+C stops both)
#    pnpm api   →  POST /api/v1/research (202 + runId) · GET /research/<id>/status
#                  GET /research/<id>/events (SSE progress) · POST /research/<id>/cancel
```

The loop is **honest about its modes**: every stage records `modelExecutionMode` /
`retrievalExecutionMode` / `experimentExecutionMode`; the aggregate `runMode` is `LIVE` only when
every science-affecting component is live — otherwise `MIXED` / `RECORDED_REPLAY` is shown, never
disguised as live.

---

## Web workbench

`pnpm dev` starts the API (:3000) and the web workbench (:5173) together; `Ctrl+C` stops both.
The workbench is organized around scientific objects, not chat bubbles:

- **Missions** (`/missions`) — a research mission end to end: status polling + SSE lifecycle events
  while running, seven views once completed (overview / hypotheses / grounding / plan / execution /
  evaluation / provenance). A run that is not finished shows its live state — never a fabricated
  result.
- **Assay** (`/assay`) — run the R0–R9 kernel over a single claim, or open the cross-model **court**
  / adversarial **arena**. Court and arena are live-only: without `DASHSCOPE_API_KEY` the UI states
  the requirement up front and the backend answers 503 with guidance — it never replays a canned
  verdict.
- **Verify** (`/verify`) — paste or upload a `.far-proof` envelope for six-dimension verification;
  persist receipts idempotently (by proofHash) and re-verify them later (`/receipts/<id>`).
- **Evidence** (`/evidence`) — the verdict ledger, evidence/chain lookup by hash, and the
  whole-chain Merkle trust root with a portable snapshot you can pin into a paper appendix or CI.
- **Benchmark** (`/benchmark`) — the pre-generated Science-125 report with its honesty notes shown
  verbatim (offline fixture output, labeled as such — not real scientific adjudication).

Every surface renders the aggregate `runMode` verbatim, verdicts carry their canonical machine
token plus a localized gloss, and loading / empty / error / unavailable are first-class states —
an unreachable API shows the error with its machine code, never a fabricated dashboard.

The workbench source lives in `frontend/` (React 18 + Vite; zh-CN default, English secondary):
`cd frontend && npm ci`, then `npm run dev` / `npm run build` / `npm run test`.

Single-process mode: once `pnpm build` has produced `frontend/dist`, plain `pnpm api` serves the
workbench itself — `http://localhost:3000/` is the app (SPA deep links included), no dev server or
reverse proxy needed. `--web-root <dir>` overrides the dist location, `--no-web` disables hosting;
when no built dist exists the API stays API-only and says so at startup (it never serves a fake shell).

---

## Live evaluation (frozen evaluation set)

FAR-Lab ships a **frozen evaluation set** (`src/research/evaluation/frozen_eval_set.json`) with
pre-registered items across scientific domains. Run it live with
`scripts/run_frozen_eval.mjs` (requires a `DASHSCOPE_API_KEY`; real literature retrieval; the
deterministic layer is independently recomputed). The same script reproduces every metric from a
fresh clone — no number in the set is hardcoded. Human-rubric dimensions (scientific plausibility,
novelty, plan executability) are deliberately **not** auto-scored; they are listed for blind review.

---

## How it compares

FAR-Lab is an **AI Scientist research system** (hypothesis generation + research planning) whose
distinctive trust layer is **claim-level falsifiability verification** — a niche that is largely
**complementary** to (not a replacement for) the established categories below. It can *consume* their
outputs as evidence and *export* to provenance standards.

| Capability | Experiment trackers<br/>(MLflow / W&B / DVC) | Provenance standards<br/>(W3C PROV-O / RO-Crate) | AI-Scientist generators<br/>(Sakana "AI Scientist" et al.) | **FAR-Lab** |
|---|:---:|:---:|:---:|:---:|
| Claim-level **falsifiability** gate (reject unfalsifiable claims) | ✗ | ✗ | partial (LLM-judged) | ✅ **deterministic FEC** |
| **Deterministic** verdict, no LLM in the decider | ✗ | ✗ | ✗ | ✅ **R0–R9 kernel** |
| **Anti-theater** detector suite (catch p-hacking / cherry-pick / fixture-as-result) | ✗ | ✗ | ✗ | ✅ **23 detectors** |
| **Tamper-evident** evidence chain (SHA-256 append-only) | partial (logging) | ✗ (models lineage, no chain) | ✗ | ✅ **+ cross-language byte-identical** |
| **Independent third-party recompute** of a sealed verdict | ✗ | partial (lineage only) | ✗ | ✅ **ProofEnvelope re-verify** |
| Role of the LLM | optional logging helper | none | **generator** (writes hypotheses/papers) | **generator only** — never the decider |

**The decisive gap FAR-Lab closes**: in autonomous AI-Scientist systems, the entity that *generates* a
hypothesis is also the entity that *judges* it. FAR-Lab splits these roles — the LLM proposes, a
deterministic, content-addressed, anti-theater-protected kernel decides — so a third party can
independently recompute and falsify the verdict. Experiment trackers and provenance standards are
necessary infrastructure FAR-Lab builds on (it exports RO-Crate 1.1 + W3C PROV-O), but neither
produces a falsifiability verdict nor runs anti-theater detection.

---

## Core concepts

| Concept | Meaning |
|---------|---------|
| **Claim** | A falsifiable scientific statement + its falsificationSpec (metric/threshold/comparator) |
| **Evidence** | A measurement/observation, content-addressed by SHA-256, in an append-only hash chain |
| **Verdict** | One of 5 values, produced by the deterministic R0–R9 kernel (priority: `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`) |
| **ProofEnvelope** | A sealed, hashed verdict artifact (proofHash) that a third party can independently recompute |
| **`.far-proof`** | A self-verifiable offline bundle (claim graph + redacted chain + proofHash) exportable via `far export far-proof` |
| **FEC** | Falsifiability Evidence Contract — a frozen, hashed measurement/statistical plan |

Deeper: see the concept table above and `far <command> --help` for per-command contracts.

---

## Offline demo (no API key required)

```bash
pnpm far demo tess-offline
```

Runs entirely offline: 15 golden vectors through the real R0–R9 kernel, then an end-to-end
TESS claim (`C-ASTRO-0001`) through FEC orchestration → kernel verdict → fail-closed sealing.

---

## Live providers (Qwen / DashScope / Bailian)

> A `DASHSCOPE_API_KEY` is required for live inference — real inference costs money and never runs by default.

```bash
export DASHSCOPE_API_KEY=sk-...          # never commit this; see SECURITY.md
pnpm far ask "Does stellar activity inflate hot Jupiter radii?" --profile competition_aliyun_qwen
```

Core gates and the offline demo run **without** this key. The CI `competition_qwen_smoke` job is a
conditional gate that gracefully skips when the key is absent. Provider setup: see `.env.example`.

---

## Docker

```bash
docker compose up far-demo      # one-shot offline TESS demo (no key)
docker compose up far-api       # long-running API server @ http://localhost:3000 (offline)
```

Without a key the deterministic endpoints (health, benchmark, verdict lookup, v2 receipts, planning)
are fully real and available, while LLM-dependent endpoints fail closed (503 + guidance) — the server
never replays pre-baked answers. To enable live inference, pass an explicit env file:
`docker compose --env-file .env up far-api`.

> The image is built locally; publishing to GHCR happens in the release workflow when a version tag is pushed.

### Platform support matrix (T-010)

| Platform | Status | Notes |
|----------|--------|-------|
| Node.js ≥ 24 (macOS / Linux / WSL) | ✅ Fully supported | Required (better-sqlite3 prebuilt binaries + native ESM loaders). |
| Node.js 22 / 20 | ❌ Not supported | better-sqlite3 ABI mismatch crashes on Node < 24. Use Docker or upgrade. |
| Windows (PowerShell 7+) | ✅ Supported | All CLI commands work; bash one-liners in Quickstart have PowerShell equivalents inline. |
| Docker (`docker compose up`) | ✅ Recommended fallback | Bundles correct Node + Python + native deps. Use this if Node version issues arise. |

> If `pnpm install` fails on native modules (better-sqlite3), use `docker compose up far-demo` —
> the Docker image pins the correct toolchain and bypasses host Node version mismatches.

**Windows notes.** The repo enforces LF via `.gitattributes` (byte-level determinism of the
kernel does not depend on your `core.autocrlf`). Two environment-level tips: (1) if real-time
antivirus scans lock files during test runs, add the repo directory to the exclusion list —
FAR-Lab already retries atomic renames on `EPERM`, but exclusions remove the latency; (2) enable
long-path support (`git config --global core.longpaths true` + the Windows long-path policy) if
you clone deep under a nested home directory. The Windows CI axis (`windows-latest`) runs the
full suite on every PR.

---

## Documentation

- This README (EN + [zh-CN](README.zh-CN.md)) is the documentation surface: quickstart, installation, architecture, concepts, and the full command reference via `far --help` / `far <command> --help`.
- Extended internal documentation is intentionally not distributed in the repository (repo carries source + user-facing docs only).

---

## Developer guide

```bash
pnpm install --frozen-lockfile
node scripts/ensure_py_deps.mjs   # probe Python axis (skips gracefully if absent)
pnpm typecheck && pnpm lint && pnpm test
```

`make bootstrap` / `make verify` / `make demo` are available on macOS/Linux (Windows: use the pnpm
commands directly). See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Testing

```bash
pnpm test            # main regression suite
pnpm run test:py     # Python verification axis (SymPy / Z3 · skips gracefully if absent)
```

The suite covers canonical hash, five-value verdict, FEC, proof envelope, anti-theater, and
cross-language consistency. Real-backend axes (SymPy/Z3/Dafny/Lean) skip per environment when the
toolchain is absent.

---

## Security & integrity boundaries

- **No LLM as final arbiter** — the five-value verdict is decided by a deterministic R0-R9 kernel; LLMs never cast the final verdict.
- **No hardcoded raw statistics** — p-values / effect sizes are computed by `src/statistics/`, never
  literals.
- **Anti-theater** — 23 detectors catch fake-green tests (tests that pass without exercising real logic).
- **Secrets never committed** — `.env` is gitignored; see [SECURITY.md](SECURITY.md).
- **Tamper-evidence scope** — naive tampering (content edited without
  recomputing hashes) and corruption are detected and located; consistent forgery by an attacker who
  recomputes the public hash algorithm is out of scope for V1 keyless chains.
- **Lifecycle tombstones** — retractions/corrections are append-only derived records
  (`far lifecycle`, migration 0021); the bundle verifier replays the event hash chain and the SSOT
  state machine, so stripped or flipped tombstones in an export are detected.
- **Crash-safe resume** — `far ask --resume` continues from hash-chained stage receipts with DB
  lineage binding; forged receipts or a swapped database fail closed.
- **Offline backup** — `far backup` uses SQLite `VACUUM INTO` and refuses to back up a corrupted DB.
- **Scheduled re-verification** — `far schedule add --exec "<command>" --every 7` re-verifies claims
  over time (JSON-persisted under `$FAR_HOME/schedules.json`; due-date logic + auditable exec runs).
  Your claims get re-verified as new evidence appears — not just once at submission time.

---

## Disclaimer

FAR-Lab is a **research tool only**. Its outputs are unvalidated, AI-generated research conjectures —
**not medical advice** and not clinically validated knowledge. It never produces clinical, dosage, or
prescription outputs: the deterministic clinical-safety layer (`src/discovery/safety/`) fail-closed
refuses dosage/prescription/person-harm requests and forces a bilingual "not medical advice" banner
onto clinical / epidemiology / toxicology / psych-intervention content. That screen is a lexical
heuristic — it cannot identify all clinically-actionable content and is no substitute for regulatory
review. **Consult a licensed clinician before any health decision.**

---

## Responsible use

FAR-Lab accelerates falsifiable research exploration; it does not remove scientist or operator responsibility.

- **Human accountability** — every verdict is protocol-bounded: `CONFIRMED` means "within the stated protocol, inputs, and thresholds", never scientific truth. Publication, clinical, policy, and safety decisions remain human responsibilities.
- **Dual-use screening** — high-risk domains (clinical, bio/chem safety, human subjects) pass deterministic fail-closed gates (`src/discovery/safety/`); refused categories are answered with refusal, not with the requested content.
- **No fabrication** — claims without sufficient evidence surface as `UNTESTED` / `INCONCLUSIVE` rather than confident answers; negative results are first-class records, never hidden.
- **Traceability when sharing** — every shareable result can be exported as a content-addressed `.far-proof` bundle that third parties independently recompute; cite the bundle when sharing conclusions.
- **Reporting** — security or misuse concerns: [SECURITY.md](SECURITY.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions must pass
`pnpm typecheck && pnpm lint && pnpm test` before submission.

---

## Runtime LLM usage

At runtime, LLMs (Qwen family) are used **only as evidence generators**; the verdict is
produced by a deterministic rule kernel (R0–R9, no LLM arbiter — enforced by
`no_llm_final_judge_scan` in CI).

---

## Citation & License

If this work is useful, cite it. The canonical metadata lives in [CITATION.cff](CITATION.cff);
a ready-to-paste BibTeX entry is provided here for convenience.

```bibtex
@software{far-lab,
  author       = {Richard Yuan},
  title        = {{FAR-Lab: Falsification-Anchored Research Chain---a claim-level verification layer for AI for Science}},
  year         = {2026},
  version      = {1.1.0},
  license      = {MIT},
  url          = {https://github.com/yry1816186-pixel/FAR-Lab}
}
```

**MIT License** — see [LICENSE](LICENSE). FAR-Lab is an independent open-source project and does
not represent the official position of Alibaba Cloud, DashScope, NAOC, NADC, or any institution.

### Known limits

1. **Float serialization** — string-key hashing is fully proven; float and exponent-boundary
   serialization follows RFC 8785 JCS on all axes (vendored `canonicalize@4.0.0` in TS,
   `rfc8785` in Python, mirrored in the browser verifiers), locked byte-equal by
   convergence golden vectors.
2. **Multimodal** — vision supported (Qwen-VL); audio/video/tabular are on the roadmap.
3. **Single-node** — SQLite-based; multi-node PostgreSQL is future work. Tested throughput is
   O(10²) rows/sec append + O(10⁴) rows indexed lookups/sec on consumer SSD (single-process).
   Not suitable for high-concurrency multi-writer production (>100 concurrent writers → use PostgreSQL).
4. **Early-stage 1.x** — API and schema may change within the 1.x line. We follow semver:
   breaking changes bump the minor version (1.0 → 1.1) with a deprecation window of at least
   one minor release.
5. **Cross-language hashing scope** — string-key hashing is byte-identical across TypeScript/Python
   (CI-verified); exponent-boundary number vectors are byte-equal under RFC 8785 JCS (convergence
   golden vectors); the browser ProofEnvelope verifier is wired (#13): standalone
   `frontend/public/verify.html` + in-app browser-side recompute panels.
6. **TESS demo scientific fidelity** — the offline demo uses a deterministic synthetic light curve
   (box transit, no limb darkening / contamination) and a coarse BLS grid (120 periods). The
   Bonferroni α'=0.0125 is a pre-registered fixed threshold (F8), **not** a real TESS frequency-grid
   trial-factor correction. This is an honest teaching simplification, not a production TESS
   validation pipeline.
7. **"CONFIRMED" semantics** — FAR-Lab's `CONFIRMED` verdict means "contract-consistent bounded
   support", **not** the astronomical term "confirmed exoplanet" (which requires RV mass / TTV).
   Astronomical candidates produced by the demo should be read as VALIDATED / CANDIDATE.
8. **Anti-theater runtime wiring** — the 23 anti-theater detectors are fully wired in offline
   `verify` (bundle re-computation, 23 detectors re-run and compared) **and** in the production
   verdict path: the science-harness pipelines run `runAntiTheaterLint` and inject the findings
   into the FEC, and the kernel's R4 / ANTI_THEATER_FAIL rule fires on them. The honest caveat is
   data, not wiring — the multi-seed demo runs on a deterministic synthetic lightcurve; real
   online-TESS multi-seed verification is the pending data item.
9. **Tamper detection scope** — keyless SHA-256 chains detect **naive** tampering (an attacker who
   does not recompute hashes). An **optional** Ed25519 bundle signature narrows the "consistent
   forgery" window: `far sign <bundle> --key <sk.pem>` emits a `<bundle>.sig.json` sidecar that
   `far verify --bundle` checks (add `--pubkey <pk.pem>` for key attribution). A signed bundle
   whose files are recomputed by an attacker without the private key fails verification. Still out
   of scope: key identity is an organizational PKI concern, and an attacker holding both the
   private key and write access can re-sign (DEF-18, V-04).
10. **Deterministic FSM over Bailian Agent** (T-035) — FAR-Lab uses a self-written
    deterministic FSM (`src/agent_loop/fsm_runner.ts`) instead of Alibaba Cloud Bailian Agent /
    application orchestration. This is an intentional design choice: the FSM is deterministic and
    fully traceable (every stage transition is logged to `evidence_log`), whereas Bailian Agent is
    a black-box orchestration layer that would break reproducibility. Bailian Agent integration is
    a V2 evaluation item if deterministic-trace compatibility can be preserved.
11. **Reproducibility scope — environment drift** — a `.far-proof` bundle locks the **evidence**
    (content-addressed hashes, tamper-detectable) but, unlike a Docker capsule, does **not** lock
    the full runtime environment. To make environment drift **detectable**, each bundle's
    `data_manifest.json` now carries an `envFingerprint` (node/python version, platform, arch),
    and `far verify --bundle` emits an `ENV_DRIFT` warning when the verifying environment differs
    from the recording one. This is disclosure, not a guarantee: same versions can still drift on
    transitive dependencies, and fully locking the environment (Docker/WholeTale-style) is a V2 item.


12. **Figure/table evidence is out of scope (v1)** — FAR-Lab's evidence pipeline ingests text
    metadata and abstracts, plus structured experimental observations. It does **not** extract
    quantitative evidence from paper figures (effect-size curves, spectra, scatter trends).
    Claims resting primarily on figure-only evidence will show incomplete evidence coverage —
    by design, honestly — until figure-to-data extraction lands (image-understanding vs
    vectorized-PDF parsing routes under ADR evaluation, post-competition track).
