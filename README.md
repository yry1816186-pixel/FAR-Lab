# FAR-Lab

**Falsifiable · Tamper-Detectable · Independently Recomputable AI-for-Science framework.**

> FAR-Lab is a **claim-level verification layer for AI4S scientific claims**. It does not chase the
> "fully-automated scientist" narrative. Instead it uses a deterministic verdict kernel and a
> content-addressed evidence chain to constrain LLM-generated hypotheses inside engineering
> boundaries that are **falsifiable, recomputable, and traceable**.
>
> 🇨🇳 中文文档：[README.zh-CN.md](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%E2%89%A511-blue.svg)](https://www.python.org)
[![CI](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg)](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml)

> Badges point at **real** workflows / facts. CI badge state is whatever GitHub reports live — we do
> not fabricate a green. Release / PyPI / Docker badges are intentionally absent until those
> publications exist (`NEEDS_RELEASE_PUBLICATION`).

---

## 30-second install

> The one-line installer points at a GitHub Release asset. Until the first release is published
> (`NEEDS_RELEASE_PUBLICATION`), use the developer install below — the `far` commands are identical.

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
node src/cli/far.ts doctor            # environment self-diagnosis (no key needed)
node src/cli/far.ts demo tess-offline # offline demo — needs ZERO credentials
```

> This project is distributed as source (git clone + pnpm install) and is not published to the npm registry. The `far` CLI runs directly via `node src/cli/far.ts`.

`far doctor` only **WARNs** on a missing API key — it never fails the offline experience and never
reads a key value.

---

## 2-minute Quickstart

```bash
# 1. Verify a pre-generated, self-verifiable proof bundle (offline, no key)
node src/cli/far.ts verify examples/tess-offline/output/demo.far-proof
#   → tamperStatus: clean · recomputation.node: pass · exit 0

# 2. Run the deterministic verdict kernel over 14 golden vectors
node src/cli/far.ts verify-golden --all

# 3. See tamper detection in action
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
node src/cli/far.ts verify /tmp/tampered
#   → tamperStatus: tampered · recomputation.node: fail · exit 7
```

### Scripted Hero walkthroughs (IC-08, timed + honest-labeled)

```bash
node scripts/hero_tamper_walkthrough.mjs   # HERO-TAMPER-PLUS: export→verify clean→tamper→verify exit 7 (≤60s)
node scripts/hero_multiseed.mjs            # HERO-MULTISEED: cherry-pick caught over 5 pre-registered real BLS seeds (≤90s, needs python+numpy)
```

Both scripts exit non-zero if the narrative breaks (script failure = Hero failure), print an
honest-status section (what is proven vs NOT proven), and time-box the run. They prove bundle
integrity + tamper detection + independent recomputation — not scientific truth (fixtures).


Full CLI reference: `node src/cli/far.ts --help`.

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
- ❌ It is **not** a general AI4S benchmark. It is a verification layer.
- ❌ It does **not** claim physical immutability or full reproducibility — see *Known limits*.

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

Deeper: [docs/concepts/far-proof.md](docs/concepts/far-proof.md) · [docs/concepts/evidence-ledger.md](docs/concepts/evidence-ledger.md)

---

## Offline demo (no API key required)

```bash
node src/cli/far.ts demo tess-offline
```

Runs entirely offline: 14 golden vectors through the real R0–R9 kernel, then an end-to-end
TESS claim (`C-ASTRO-0001`) through FEC orchestration → kernel verdict → fail-closed sealing. See
[examples/tess-offline/README.md](examples/tess-offline/README.md) for the persistent bundle and a
**tested** tamper-detection walkthrough.

---

## Live providers (Qwen / DashScope / Bailian)

> **`NEEDS_API_KEY`** — real inference costs money and never runs by default.

```bash
export DASHSCOPE_API_KEY=sk-...          # never commit this; see SECURITY.md
node src/cli/far.ts ask "<question>" --profile competition_aliyun_qwen
```

Core gates and the offline demo run **without** this key. The CI `competition_qwen_smoke` job is a
conditional gate that gracefully skips when the key is absent. Setup: [docs/providers/qwen-dashscope.md](docs/providers/qwen-dashscope.md)

---

## Docker

```bash
docker compose up far-demo      # one-shot offline TESS demo (no key)
docker compose up far-api       # long-running API server @ http://localhost:3000 (offline)
```

The default image runs the offline demo / anonymous API and **never** requires a key. To use a real
provider, pass an explicit env file: `docker compose --env-file .env up far-api`.

> `NEEDS_DOCKER_BUILD_VALIDATION`: the image is built locally; publish to GHCR is part of the release
> workflow (`NEEDS_GHCR_PUBLISH`).

---

## Documentation

- **Getting started**: [Quickstart](docs/quickstart.md) · [Installation](docs/installation.md) · [Full index](docs/INDEX.md)
- **Concepts**: [Proof bundles](docs/concepts/far-proof.md) · [Evidence ledger](docs/concepts/evidence-ledger.md)
- **Providers**: [Qwen / DashScope](docs/providers/qwen-dashscope.md)
- **Demos**: [TESS offline](docs/demos/tess-offline.md)
- **Architecture**: [docs/INDEX.md](docs/INDEX.md)

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
- **Anti-theater** — 20 detectors catch fake-green tests (tests that pass without exercising real logic).
- **Secrets never committed** — `.env` is gitignored; see [SECURITY.md](SECURITY.md).
- **Tamper-evidence scope (2026-07-20 adversarial review)** — naive tampering (content edited without
  recomputing hashes) and corruption are detected and located; consistent forgery by an attacker who
  recomputes the public hash algorithm is out of scope for V1 keyless chains (DEF-18).
- **Lifecycle tombstones** — retractions/corrections are append-only derived records
  (`far lifecycle`, migration 0021); the bundle verifier replays the event hash chain and the SSOT
  state machine, so stripped or flipped tombstones in an export are detected.
- **Crash-safe resume** — `far ask --resume` continues from hash-chained stage receipts with DB
  lineage binding; forged receipts or a swapped database fail closed.
- **Offline backup** — `far backup` uses SQLite `VACUUM INTO` and refuses to back up a corrupted DB.
- Real API / real data / real GPU / competition submission are all explicitly tagged
  `NEEDS_API_VALIDATION` / `NEEDS_REAL_ENV` / `NEEDS_GPU_VALIDATION` / `NEEDS_HUMAN_OPERATION`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions must pass
`pnpm typecheck && pnpm lint && pnpm test` before submission.

---

## Citation & License

If this work is useful, cite it: see [CITATION.cff](CITATION.cff).

**MIT License** — see [LICENSE](LICENSE). This is a competition entry (XH-202619); it does not
represent the official position of Alibaba Cloud, DashScope, NAOC, NADC, or any institution.

### Known limits

1. **Float serialization** — string-key hashing is fully proven; float serialization is migrating to
   RFC 8785 JCS.
2. **Multimodal** — vision supported (Qwen-VL); audio/video/tabular are on the roadmap.
3. **Single-node** — SQLite-based; multi-node PostgreSQL is future work.
4. **Pre-1.0** — API and schema may change.
