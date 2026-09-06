<div align="center">

# FAR-Lab

**Evidence-constrained, falsifiable, revisable scientific research workbench.**

Given a research question, FAR-Lab retrieves real literature, generates competing
hypotheses ranked by evidence support and falsifiability, synthesizes executable
research plans, and produces reproducibility bundles that anyone can independently
verify — while never claiming an experiment ran when it did not.

[![CI](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2024-brightgreen.svg)](https://nodejs.org/)
[![Runtime deps: zod only](https://img.shields.io/badge/runtime%20deps-zod%20only-informational.svg)](#dependencies)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict%20%26%20noUncheckedIndexedAccess-3178c6.svg)](#testing)

*Scientific Second Brain · Research Execution · Auditable Research Record*

</div>

---

## Table of contents

- [Why FAR-Lab](#why-far-lab)
- [What it does](#what-it-does)
- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Web workbench](#web-workbench)
- [CLI reference](#cli-reference)
- [Reproducibility & provenance](#reproducibility--provenance)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Verifying a release](#verifying-a-release)
- [Docs & community](#docs--community)
- [License](#license)

## Why FAR-Lab

Most "AI research" tools optimize for fluent prose. FAR-Lab optimizes for
**verifiable honesty**. The design rule that shapes everything:

> LLMs propose semantic content; deterministic code owns IDs, schemas,
> validation, authorization, transactions, verdicts, and provenance.

Concretely, that means:

- **Claims are bound to sources, word-for-word.** Every evidential claim links to
  a resolvable span of its source text; the binding is machine-checkable, not a
  free-text assertion.
- **The software never fakes execution.** When a plan's real-world legs (bench,
  field, human-subjects, archive) cannot run computationally, FAR-Lab registers a
  frozen, preregistered *protocol* and waits in a human-attested ledger — it does
  not simulate a result.
- **Unknown stays unknown.** Costs derive only from user-declared pricing; if a
  route is missing a key, FAR-Lab honestly refuses rather than fabricating demo
  output.

## What it does

The core is a 12-stage research pipeline that turns a question into a
falsifiable, evidence-backed research plan:

```
scope → retrieve → verify_sources → build_evidence → generate_hypotheses
→ critique_falsify → rank → plan → execute → feedback → revise → export
```

Literature is retrieved from **OpenAlex, arXiv, CrossRef and EuropePMC**. An
in-run falsification cascade deterministically closes
`experiment → feedback → revise → re-experiment` under a bounded round / token /
no-material-delta budget, so weak hypotheses get one more honest pass instead of
an infinite loop.

## Features

### Research methodology

- **12-stage pipeline** from question to export, with ACH-style contrastivity
  analysis in the falsification stage and per-cell evidence
  support/contradiction states in the ranking view.
- **In-run falsification cascade** — a deterministic iteration controller with an
  adaptive quality gate; run-level token budget treats receipts as the only spend
  authority.
- **Research supervisor** — read-only trajectory analysis at stage boundaries
  (idempotent; signals are persisted for audit, decisions stay with the
  orchestrator and the human).
- **Human-in-the-loop feedback** — expert judgment, new literature, experiment
  results and reviewer comments causally drive the revise stage; direct
  hypothesis edits enter the same causal revision chain.

### Execution & verification

- **Experiment execution layer** — a Python sidecar (`experiment-runtime/`) with a
  durable scheduler, dataset acquisition (ARFF / CSV / OpenML), train/eval with
  mechanical statistical verdicts, and exploratory CodeAct under a fail-closed
  Docker Linux OCI boundary (no network, read-only rootfs, non-root, no
  capabilities, seccomp + resource limits). CodeAct outputs are **candidate
  findings only, never verdicts**.
- **Scientific tool plane** — pinned sidecar operations for tabular profiling
  (`data_profile`), pandas group-by analysis (`dataframe_groupby`), Matplotlib
  SVG/PNG figures (`plot`), deterministic SVG previews (`plot_svg`), statistics,
  simulation, FEM, ODE and NetCDF. Compute responses carry runtime versions and
  lockfile provenance. See `docs/SCIENTIFIC_TOOLS.md`.
- **Research protocol layer (paradigm-honest execution)** — preregistered
  materials, arms and sampling; a code-committed randomization sequence seeded by
  the plan hash (regenerated, never re-randomized); fail-closed ethics gates and
  stop conditions; append-only human-attested ledger.
  `GET /api/v1/runs/:id/protocol` · `POST /api/v1/runs/:id/protocol/records`
- **Reproducibility bundles** — deterministic, zero-LLM IMRaD paper projection
  with limitations synthesized from real counts and BibTeX from stored metadata
  only; independently verifiable via `far verify`.
- **Cross-run memory substrate** — governed memory in the same SQLite store (no
  second memory DB): lifecycle governance, poisoning fences, deterministic
  zero-LLM retrieval (FTS5 + ACT-R activation), append-only supersession.

### Surfaces

- **CLI workbench** (`far`) — 20+ commands across the full lifecycle: create and
  resume runs, inspect objects, record feedback, run experiments, register
  protocols, export reports/papers/bundles, verify reproducibility, and more. An
  optional interactive TUI ships as an isolated Ink package.
- **Web workbench** — React SPA with real-time SSE streaming (visible reconnect
  state), run sidebar, hypothesis tournament table, ACH comparison canvas, command
  palette (`Ctrl+K`), offline dictation (ONNX Runtime Whisper), i18n (zh/en),
  dark/light theme.
- **Desktop shell** — Tauri v2 (Rust): system tray, global hotkey, deep links
  (Windows `far://`), optional hardened CSP. Desktop installers are *not* signed
  or notarized and are not represented as a supported distribution channel.

### Model & integration control

- **Model control plane** — model-agnostic, gateway-neutral failover chains with
  verified semantics (error-class fail-over, cooldown, serving route visible in
  every receipt) and a receipt-derived usage ledger. Built-in routes:
  **`zai` (default), `dashscope`, `deepseek`, `universal`**, plus custom routes;
  `universal` accepts any gateway URL that implements one of FAR-Lab's verified
  wire contracts: OpenAI Chat Completions-compatible, OpenAI Responses API,
  Anthropic Messages-compatible, or Gemini `generateContent`-native. Qwen/DashScope is only one optional route,
  used for competition/test evidence when required. Other protocols require a
  dedicated adapter and are rejected rather than silently treated as compatible.
  Responses routes use `openai_responses`, a base URL such as `https://api.openai.com/v1`,
  and the endpoint's actual model ID. They support streaming, structured output, and
  declared `reasoning_effort` (sent as `reasoning.effort`). Live external Responses
  service validation remains `UNVERIFIED_EXTERNAL`; local contracts are not service certification.
- **Resident conversation agent** — runs on the agent kernel with a read-tool
  plane over the workspace, `propose_action` approval cards, and an automations
  engine (schedule + run-completed triggers) whose proposals always gate on the
  human.
- **Extensibility plane** — MCP servers (`far mcp add/probe`, e.g. Docling,
  Playwright browser control), plugins (`far plugin install`, staged **DISABLED**
  for review), declarative hook rules compiled to kernel permissions
  (strictest-wins, fail-closed when headless), an integrated terminal,
  approval-gated `run_command` proposals, agent file tools, and a network plane
  (HTTP(S) proxy + custom CA applied to all outbound fetch, self-tested by
  `far probe net`).

See [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) for the full guide.

## Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 24 | core engine, CLI, server |
| npm | ≥ 10 | |
| Python + uv | ≥ 3.11 | experiment sidecar only |
| Docker Engine | Linux-container mode | required for production `explore_code` |
| SQLite | bundled via `node:sqlite` | no native dependency |

## Quick start

```bash
# Clone and build
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
npm install
npm run build

# Required only before using the agent's explore_code capability. This fails
# rather than falling back to host execution when Linux Docker isolation is
# unavailable.
npm run sandbox:build && npm run sandbox:verify

# Configure any one supported model gateway
export ZAI_API_KEY=your_zhipu_api_key         # Zhipu GLM (default route)
# export DASHSCOPE_API_KEY=...                 # Alibaba Qwen (optional)
# export DEEPSEEK_API_KEY=...                  # DeepSeek
# export FARLAB_UNIVERSAL_WIRE=openai \        # arbitrary OpenAI-compatible gateway
#        FARLAB_UNIVERSAL_BASE_URL=https://... \
#        FARLAB_UNIVERSAL_MODEL=your-model \
#        FARLAB_UNIVERSAL_API_KEY=your-key
# No key yet? Retrieval still runs for real against the free public APIs
# (OpenAlex / arXiv / CrossRef / EuropePMC), but the model-judgment stages
# (scope / hypotheses / ranking) honestly refuse with the reason recorded —
# FAR-Lab never fabricates demo content. (--route accepts only real routes:
# zai | dashscope | deepseek | universal.)

# Run a minimal research pipeline (in a fresh clone there is no global `far`;
# run through the repo, or `npm link` first to get `far`).
node dist/cli/main.js research start \
  "What mechanisms drive horizontal transfer of antibiotic resistance genes in biofilms?" \
  --domain microbiology --goal exploratory

node dist/cli/main.js research status <run-id> --watch     # live progress
node dist/cli/main.js research inspect <run-id> --hypotheses
node dist/cli/main.js research inspect <run-id> --plan
node dist/cli/main.js research export <run-id> --format bundle --out ./output
node dist/cli/main.js verify <bundle-id>                    # independent verify
```

> In the snippets below, `far` means `node dist/cli/main.js` (or `npm run far --`).

## Web workbench

```bash
# Build the frontend once. Without this the server honestly reports
# "web workbench NOT built" and serves the API only.
cd web && npm install && npm run build && cd ..

npm run serve         # scripts/serve.mjs → http://localhost:3196
```

`npm run serve` binds port **3196** by default; the `far serve` command and the
code defaults bind **8787** (override either with `PORT`). Both bind `127.0.0.1`
loopback only unless `FARLAB_ALLOW_REMOTE=1`.

## CLI reference

```bash
# Full research lifecycle
far research start "Question" --domain oncology --goal explanatory
far runs --json
far research status <run-id> --watch
far research inspect <run-id> --evidence|--hypotheses|--plan|--sources
far research resume <run-id>          # resume from last checkpoint
far research cancel <run-id>
far research feedback <run-id> --source human_expert --content "..." \
  --target-kind hypothesis --target-id H-003
far research export <run-id> --format report|bundle|package
far inspect <run-id> [seq]            # time-travel state at an event sequence
far new                               # interactive wizard (TTY only)

# Experiment execution (durable scheduler + worker)
far experiment run spec.json
far experiment enqueue spec.json --priority 1
far experiment worker --max-jobs 10 --max-running 3
far experiment status [--job <job-id>] && far experiment logs <run-id>

# Protocol ledger, memory, provenance, data ops
far protocol show <run-id> && far protocol record <run-id> ...
far memory search "..." --kind episodic|semantic|experiment_outcome|profile
far data info && far ingest ... && far gc --apply
far backup ... && far restore ...
far agent refine <run-id> --turns 5 --top-k 3 --max-concurrent 4

# Model routes & integration plane
far probe [--live] && far probe net      # route health / proxy loopback self-test
far mcp add|list|probe ... && far plugin install|list ...
far completion bash|zsh|pwsh
```

## Reproducibility & provenance

Every run is backed by durable events, checkpoints, a content-addressed artifact
store, and lineage you can replay. `far verify <bundle-id>` re-checks a
reproducibility bundle independently of the run that produced it. Exported papers
carry BibTeX built only from stored metadata; limitation counts are synthesized
from real evidence tallies — never invented.

## Configuration

> A complete annotated template ships as [`.env.example`](.env.example) — copy it
> to `.env` and fill in at least one live key. The CLI hydrates `.env` at startup
> (real environment variables win; `FAR_DOTENV=off` disables hydration).

```bash
# Gateway credentials — provide the route you use
ZAI_API_KEY=                # Zhipu GLM (default)
DASHSCOPE_API_KEY=          # Alibaba DashScope / Qwen
DEEPSEEK_API_KEY=           # DeepSeek (base https://api.deepseek.com)
FARLAB_UNIVERSAL_WIRE=openai # openai | openai_responses | anthropic | gemini
FARLAB_UNIVERSAL_BASE_URL=
FARLAB_UNIVERSAL_MODEL=
FARLAB_UNIVERSAL_API_KEY=

# Runtime
FARLAB_MODEL_PROVIDER=zai   # zai | dashscope | deepseek | universal
FARLAB_DATA_DIR=.far-run    # database + artifacts root
PORT=                       # server bind port (serve.mjs defaults 3196; far serve 8787)
HOST=127.0.0.1              # bind address (non-loopback needs FARLAB_ALLOW_REMOTE=1)

# Literature sources (optional higher rate limits / polite pool)
OPENALEX_API_KEY=           OPENALEX_MAILTO=           CROSSREF_MAILTO=

# Network plane — applies to ALL outbound fetch
FARLAB_HTTPS_PROXY=         FARLAB_NO_PROXY=         FARLAB_CA_CERT=

# Terminal surface
FARLAB_TERMINAL=off         FARLAB_SHELL=
```

Provider selection is a **routing** choice, not a vendor lock-in:

| `FARLAB_MODEL_PROVIDER` | Backend | Notes |
|-------------------------|---------|-------|
| `zai` (default) | Zhipu GLM | Anthropic-compatible wire |
| `dashscope` | Alibaba DashScope | Qwen series; optional competition/test route |
| `deepseek` | DeepSeek | base `https://api.deepseek.com` |
| `universal` | Any configured gateway | OpenAI-compatible / Anthropic-compatible / Gemini-native |

Custom providers can be configured through the model-config API/UI or registered
via `src/providers/custom.ts`. `test-stub` and unknown route names are rejected
rather than silently falling back.

## Project structure

```
FAR-Lab/
├── src/
│   ├── cli/            # `far` entry point, command router, terminal rendering
│   ├── agent/          # agent runtime: loop, capabilities, MCP, compaction, CodeAct
│   ├── app/            # composition root, orchestrator, provider resolver, verify
│   ├── domain/         # pure zod domain model (run, source, claim, hypothesis, plan)
│   ├── pipeline/       # 12 stage implementations (+ llm / screening / citation-chase)
│   ├── providers/      # LLM adapters (zai, dashscope, deepseek, universal, custom)
│   ├── sources/        # literature adapters (OpenAlex, arXiv, CrossRef, EuropePMC) + fulltext/retraction
│   ├── server/         # HTTP API (/api/v1), automations, terminal, integrations
│   ├── experiment/     # experiment layer: datasets, executors, device gateway
│   ├── persistence/    # SQLite store + content-addressed artifact storage
│   ├── kernel/         # capability plane (planner, capability registry)
│   ├── model-plane/    # model capability metadata
│   ├── ingest/         # deterministic multimodal artifact → source-document-model parsers
│   ├── plugins/        # plugin import / manifest / host (far-plugin.json)
│   ├── report/         # reproducibility package engine (figures, citations, Ro-Crate)
│   ├── platform/       # zero-dep .env hydration and boot concerns
│   └── shared/         # crypto, ports, net-env, guards, timing
├── web/                # React frontend (Vite + Tailwind), i18n zh/en
├── experiment-runtime/ # Python sidecar (uv-managed)
├── packages/tui/       # optional interactive terminal UI (isolated Ink package)
├── desktop/            # Tauri v2 desktop shell (Rust)
├── tests/              # root Vitest suite
├── eval/               # evaluation protocols & benchmark scripts
├── scripts/            # operational scripts (serve, sandbox, release)
├── project-spec/       # formal specification documents & policies
└── docs/               # extensibility, troubleshooting, ADRs, backup/restore
```

## Testing

```bash
# The root suite imports web/src modules — install web deps first (CI does too).
cd web && npm install && cd ..

npm test              # full Vitest suite (sidecar tests skip gracefully without uv)
npm run test:watch
npm run typecheck     # strict TS, noUncheckedIndexedAccess enabled
npm run lint
```

- **Runner:** Vitest 3 with a `forks` pool.
- **Coverage:** 264 test files spanning domain schemas, pipeline stages,
  providers, sources, agent kernel, memory, lineage, experiments, API endpoints,
  CLI commands, and regression guards.
- Tests are offline by design; a test that would need a live route fails there
  exactly as it would locally.

## Verifying a release

Published releases ship a `.tar.gz` source archive, a content manifest, a CycloneDX
SBOM, `SHA256SUMS`, and two Sigstore verification bundles. Verify signed checksums,
covered files, and archive provenance before extracting:

```bash
cd /path/to/downloaded-release
gh attestation verify SHA256SUMS --repo yry1816186-pixel/FAR-Lab
sha256sum --check SHA256SUMS
gh attestation verify /path/to/farlab-public-<version>+<commit>.tar.gz \
  --repo yry1816186-pixel/FAR-Lab
# From a trusted checkout, additionally match every archive payload byte to the manifest:
node scripts/verify-release-artifacts.mjs /path/to/downloaded-release
```

Only an annotated, version-matched Git tag may create a GitHub Release; branch and
manual-dispatch artifacts are release candidates only. See
[VERSIONING.md](VERSIONING.md) for the full policy.

## Docs & community

- [CONTRIBUTING.md](CONTRIBUTING.md) — the contract, workspaces, gates, workflow
- [SECURITY.md](SECURITY.md) — reporting, threat model, explicit non-goals
- [CHANGELOG.md](CHANGELOG.md) — release history (Keep a Changelog)
- [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) · [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- Chinese documentation: [README.zh-CN.md](README.zh-CN.md)

## License

[Apache License 2.0](./LICENSE). Copyright 2026 The FAR-Lab Authors. See
[NOTICE](./NOTICE) for third-party attributions.
