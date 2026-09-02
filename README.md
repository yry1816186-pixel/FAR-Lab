# FAR-Lab

Evidence-constrained, falsifiable scientific hypothesis generation and research-plan design workbench. Given a research question, it retrieves literature, generates competing hypotheses ranked by evidence support and falsifiability, synthesizes executable research plans, and produces reproducibility bundles with independent verification.

## Features

- **Full research pipeline** — 12 stages: `scope` → `retrieve` → `verify_sources` → `build_evidence` → `generate_hypotheses` → `critique_falsify` → `rank` → `plan` → `execute` → `feedback` → `revise` → `export`; literature sources: OpenAlex, arXiv, CrossRef, EuropePMC
- **In-run falsification cascade** — a deterministic iteration controller closes experiment → feedback → revise (re-freeze) → re-experiment under bounded rounds / token budget / no-material-delta; an adaptive quality gate reopens weak hypothesis generation for one bounded round; run-level token budget treats receipts as the only spend authority
- **Research supervisor** — read-only trajectory analysis at stage boundaries (idempotent, one observation per boundary; signals persisted for audit, action stays with the orchestrator and the human)
- **Cross-run memory substrate** — governed memory items in the same SQLite store (no second memory DB): lifecycle governance (zod + SQL CHECK), poisoning fences (own-trust requires resolvable provenance; external content never derives own-trust), deterministic zero-LLM retrieval (FTS5 + ACT-R activation), append-only supersession
- **Experiment execution layer** — Python sidecar (`experiment-runtime/`) with durable scheduler, dataset acquisition (ARFF/CSV/OpenML), train/eval with mechanical statistical verdicts, and exploratory CodeAct under dual static gates plus a fail-closed Docker Linux OCI boundary (no network, read-only rootfs, non-root, no capabilities, seccomp/resource limits, exact environment allowlist) — outputs are candidate findings only, never verdicts; remote execution over stdio JSON protocol
- **Research protocol layer (paradigm-honest execution)** — when a plan's real-world legs (bench / field / human-subjects / engineering / archive / theory) cannot run computationally, the execute stage registers a FROZEN protocol: preregistered materials, instruments, arms and sampling, a code-committed randomization sequence (seeded by the plan hash — regenerated, never re-randomized), steps with explicit human-confirmation requirements, measurement variables with declarative QC, fail-closed ethics gates and stop conditions. Execution is tracked in an append-only HUMAN-ATTESTED ledger — the software never claims execution, it awaits real-world records; completed (or explicitly published) outcomes re-enter the causal loop as experiment feedback. HTTP: `GET /api/v1/runs/:id/protocol`, `POST /api/v1/runs/:id/protocol/records`
- **Claim-source word-by-word binding** — every evidential claim is bound to its source text span; alignment is machine-verifiable, not free-text assertion
- **Hypothesis comparison with evidence discrimination** — structured comparison view with per-cell evidence support/contradiction states; falsification stage produces ACH-style contrastivity analysis
- **Model control plane** — failover chains with verified semantics (fail-over error classes, cooldown, serving route visible in every receipt) and a receipt-derived usage ledger (cost only from user-declared pricing — unknown stays unknown); pluggable backends via `FARLAB_MODEL_PROVIDER` (Zhipu GLM `zai`, Alibaba DashScope/Qwen `dashscope`, custom)
- **Resident conversation agent** — conversations run on the agent kernel with a read-tool plane over the workspace, `propose_action` approval cards (approve/reject/remember), and an automations engine (schedule + run-completed triggers) whose proposals always gate on the human
- **Tool integrations (MCP)** — external MCP servers (e.g. Docling document understanding) join kernel sessions under capability-scoped admission (read-only capabilities admit read-class tools only); declarative hook rules compile to kernel permissions (strictest-wins, fail-closed when headless); plugins (`far-plugin.json`: skills/commands/hooks/MCP + subprocess-isolated JS entry) import via `far plugin install` — all staged DISABLED for review
- **Extensibility plane** — `far mcp add/probe` (real connectivity round trip; browser control via Playwright MCP, desktop automation recipes in docs/EXTENSIBILITY.md), integrated terminal (login shell, profile-loaded, SSE-streamed; no PTY — honestly documented), approval-gated `run_command` proposals, agent file tools (`read_file`/`find_files`/`grep_content`), network plane (HTTP(S) proxy + custom CA for ALL outbound fetch, `far probe net` loopback self-test), and model thinking capture (reasoning_content / thinking blocks) surfaced per conversation message
- **Research-product export** — deterministic zero-LLM IMRaD paper projection with limitations synthesized from real counts and BibTeX from stored metadata only; reproducibility bundles verifiable independently via `far verify`
- **CLI workbench** (`far` binary) — 15+ commands covering the full lifecycle: create runs, inspect objects, resume from checkpoint, export reports/papers/bundles, record feedback, run experiments, verify reproducibility; optional interactive TUI (`packages/tui`, isolated Ink package)
- **Web workbench** — React SPA with real-time SSE streaming (visible reconnect state), run sidebar, hypothesis tournament table, ACH comparison canvas, research composer with offline dictation (ONNX Runtime Whisper), command palette (`Ctrl+K`), i18n (zh/en), dark/light theme
- **Human-in-the-loop feedback** — structured feedback signals (expert judgment, new literature, experiment results, reviewer comments) that causally drive the revise stage; direct hypothesis edit enters the same causal revision chain
- **Tauri desktop shell** — system tray, global hotkey, deep links (Windows: far:// scheme; other platforms unregistered), hardened CSP (optional)

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | >= 24 |
| npm | >= 10 |
| Python + uv | >= 3.11 (experiment sidecar only) |
| Docker Engine | Linux-container mode (required for production `explore_code`) |
| SQLite | bundled via `node:sqlite` |

Runtime dependencies (production): **zod** ^3.24.0 (single runtime invariant — schema validation only).

All other npm packages are devDependencies (TypeScript, Vitest, ESLint).

## Quick Start

```bash
# Clone and install
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
npm install
npm run build

# Required before using the agent's explore_code capability. This fails rather
# than falling back to host execution when Linux Docker isolation is unavailable.
npm run sandbox:build
npm run sandbox:verify

# Set model provider key (choose one)
export ZAI_API_KEY=your_zhipu_api_key          # Zhipu GLM (default)
# export DASHSCOPE_API_KEY=your_dashscope_key   # Alibaba Qwen (competition route)
# No key yet? Append --route offline: retrieval and claim binding still run for
# real (free public APIs); model-judgment stages (scope/hypotheses/ranking) are
# honestly refused with the reason on the record — no fabricated demo content.

# Run a minimal research pipeline.
# In a fresh clone the CLI has no global `far` command — run it through the repo:
node dist/cli/main.js research start "What mechanisms drive horizontal transfer of antibiotic resistance genes in biofilms?" \
  --domain microbiology --goal exploratory
# (short form: npm run far -- research start …; `far <cmd>` works after `npm link`)

# Watch progress in real time
node dist/cli/main.js research status <run-id> --watch

# Inspect results
node dist/cli/main.js research inspect <run-id> --hypotheses
node dist/cli/main.js research inspect <run-id> --plan

# Export reproducibility bundle
node dist/cli/main.js research export <run-id> --format bundle --out ./output

# Verify bundle independently
node dist/cli/main.js verify <bundle-id>
```

> Shorthand below: `far` means `node dist/cli/main.js` (or `npm run far --`).

### Verify a published source release

Published releases contain a `.tar.gz` source archive, content manifest,
CycloneDX SBOM, `SHA256SUMS`, and two Sigstore verification bundles. Verify
the signed checksum list, its covered files, and archive provenance before
extracting or running it:

```bash
cd /path/to/downloaded-release
gh attestation verify SHA256SUMS --repo yry1816186-pixel/FAR-Lab
sha256sum --check SHA256SUMS
gh attestation verify /path/to/farlab-public-<version>+<commit>.tar.gz \
  --repo yry1816186-pixel/FAR-Lab
# From a trusted FAR-Lab checkout, additionally match every archive payload
# byte to the release content manifest:
node scripts/verify-release-artifacts.mjs /path/to/downloaded-release
```

The Node verifier safely inspects and extracts the archive into a temporary
directory, then matches every payload byte against the content manifest.
Branch/manual-dispatch artifacts are release candidates only; only an
annotated, version-matched Git tag may create a GitHub Release.

### Web Workbench

```bash
# Build the web frontend once (a fresh clone has no web/dist — without this
# step the server honestly reports "web workbench NOT built" and serves API only)
cd web && npm install && npm run build && cd ..

# Terminal 1: start API server + web frontend on port 3196
npm run serve

# Open http://localhost:3196 in browser
```

## Usage

### CLI Commands

```bash
# Create and execute a full research run
far research start "Your research question here" \
  --domain oncology \
  --goal explanatory    # explanatory|predictive|interventional|methodological|exploratory

# List all runs
far runs [--json]

# Check run status (single snapshot)
far research status <run-id>

# Live monitoring (TTY repaints every 2s)
far research status <run-id> --watch

# Inspect specific output objects
far research inspect <run-id> --evidence
far research inspect <run-id> --hypotheses
far research inspect <run-id> --plan
far research inspect <run-id> --sources

# Resume a failed/partial run from last checkpoint
far research resume <run-id>

# Record human feedback (drives causal revision)
far research feedback <run-id> \
  --source human_expert \
  --content "The mechanism proposed in H-003 contradicts recent CRISPR-Cas studies" \
  --target-kind hypothesis \
  --target-id H-003

# Export human-readable report or reproducibility bundle
far research export <run-id> --format report   # Markdown report
far research export <run-id> --format bundle  # Verification-ready bundle

# Cancel a running pipeline
far research cancel <run-id>

# Interactive wizard (TTY only, Chinese prompts)
far new

# Model route health check
far probe              # Config check (key presence, no tokens consumed)
far probe zai --live   # Real chat call (~1 token)

# Data footprint
far data info

# Shell completion
far completion bash >> ~/.bashrc
far completion zsh >> ~/.zshrc
```

### Experiment Execution

```bash
# Execute an experiment spec
far experiment run spec.json

# Queue with priority
far experiment enqueue spec.json --priority 1

# Drain queue as worker
far experiment worker --max-jobs 10 --max-running 3

# Monitor jobs
far experiment status
far experiment status --job <job-id>
far experiment logs <experiment-run-id>

# Cooperative cancellation
far experiment cancel <job-id>
```

### Agent Refinement

```bash
# Evidence-gap refinement on a completed run
far agent refine <run-id> \
  --turns 5 \
  --top-k 3 \
  --max-concurrent 4
```

### Programmatic Usage (Node.js)

```typescript
import { createApp } from 'far-lab/app/composition.js';
import { ResearchQuestion, ScientificGoalType } from 'far-lab/domain/index.js';

const app = await createApp({
  providerName: process.env.FARLAB_MODEL_PROVIDER ?? 'zai',
});

// Create a run and execute the pipeline
const question = ResearchQuestion.parse({
  text: "How does tumor heterogeneity affect immunotherapy response?",
  domain: 'oncology',
  goal: ScientificGoalType.Explanatory,
});
const run = app.store.createRun(question);
const result = await app.orchestrator.execute(run.id);

// Inspect output objects
const hypotheses = app.store.listObjects('hypothesis', run.id);
const plan = app.store.listObjects('plan', run.id);

console.log('Status:', result.status);
console.log('Hypotheses:', hypotheses.length);
```

## Project Structure

```
far-lab/
├── src/                      # Core TypeScript source
│   ├── cli/                  # CLI entry point (`far` binary), commands, terminal rendering
│   ├── agent/                # Agent runtime: loop, sub-agents, permissions, MCP, skills
│   ├── app/                  # Orchestration: composition root, provider resolver, verification
│   ├── domain/               # Pure domain model: Question, Hypothesis, Claim, Evidence, Plan, Run
│   ├── pipeline/             # 12-stage research pipeline (scope → retrieve → ... → export)
│   │   └── stages/           # Individual stage implementations
│   ├── providers/            # LLM provider adapters (zai, dashscope, custom)
│   ├── sources/              # Literature source adapters (OpenAlex, arXiv, CrossRef, fulltext)
│   ├── server/               # HTTP API server (default port via PORT env, serve.mjs defaults to 3196)
│   ├── experiment/           # Experiment execution layer (scheduler, executor, datasets)
│   ├── persistence/          # SQLite store + content-addressed artifact storage
│   └── shared/               # Crypto utilities, port abstractions
├── web/                      # React 18 frontend (Vite 6 + Tailwind CSS v4)
│   └── src/
│       ├── api/              # API client, endpoint definitions, response normalization
│       ├── components/       # UI components (runs sidebar, detail views, ACH canvas, etc.)
│       ├── hooks/            # React hooks (SSE streaming, hash routing, polling)
│       ├── state/            # Global state (connection, theme)
│       └── i18n/             # Internationalization (zh/en dictionaries)
├── experiment-runtime/       # Python sidecar for experiment execution (uv-managed)
├── packages/tui/             # Optional interactive terminal UI (isolated Ink package; never a Node-core dependency)
├── tests/                    # 240 test files (Vitest, forks pool)
├── eval/                     # Evaluation protocols & benchmark scripts
├── scripts/                  # Operational scripts (serve, health checks, export)
├── project-spec/             # Formal specification documents & policies
├── desktop/                  # Tauri v2 desktop shell (Rust backend)
├── dist/                     # Compiled output (git-ignored)
└── .far-run/                 # Runtime data (SQLite DB, artifacts, exports)
```

## Configuration

### Environment Variables

> A complete annotated template ships as [.env.example](.env.example) — copy it to `.env`
> and fill in at least one live key. The CLI hydrates `.env` at startup (real environment
> variables win; `FAR_DOTENV=off` disables hydration).

```bash
# === Required (at least one) ===
ZAI_API_KEY=                  # Zhipu GLM API key (default provider)
DASHSCOPE_API_KEY=            # Alibaba DashScope / Qwen API key
ZHIPU_API_KEY=                # Legacy zai key name — honored when ZAI_API_KEY is unset

# === Optional ===
FARLAB_MODEL_PROVIDER=zai     # Default model provider: zai | dashscope
FARLAB_DATA_DIR=.far-run      # Root directory for database and artifacts
PORT=3196                    # HTTP API / serve port (server/main.ts also listens on 8787 when PORT is unset)
HOST=127.0.0.1                # Server bind address
FARLAB_LEASE_TTL_MS=240000    # Run lease TTL (milliseconds)
FARLAB_STAGE_CONCURRENCY=3    # Max concurrent sub-tasks per stage
FARLAB_GIT_COMMIT=auto        # Git commit hash for provenance (auto-detected)

# === Literature Sources ===
OPENALEX_API_KEY=             # OpenAlex API key (higher rate limits)
OPENALEX_MAILTO=              # OpenAlex polite-pool identifier
CROSSREF_MAILTO=              # CrossRef polite-pool identifier

# === Network plane (proxy + custom CA; applies to ALL outbound fetch) ===
FARLAB_HTTPS_PROXY=           # e.g. http://127.0.0.1:7890 (falls back to HTTPS_PROXY)
FARLAB_HTTP_PROXY=            # plain-HTTP proxy (falls back to HTTP_PROXY)
FARLAB_NO_PROXY=              # bypass list (falls back to NO_PROXY)
FARLAB_CA_CERT=               # PEM file with extra CAs (corporate MITM proxies)
# Applied at process boot (Node fetch contract); long-running entrypoints re-exec
# once to apply it. Verify with: far probe net  (real loopback self-test)

# === Terminal (web integrated terminal) ===
FARLAB_TERMINAL=off           # set to disable the terminal surface entirely
FARLAB_SHELL=                 # force the shell program (default: auto-detect pwsh/powershell/cmd or $SHELL)
```

See [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md) for the full extensibility guide: skills, plugins (`far plugin install`), MCP servers (`far mcp add/probe`, incl. browser control via Playwright MCP and desktop automation recipes), commands, hooks, the integrated terminal, agent-proposed shell commands, file find/grep tools, the network plane, and thinking display.

### Provider Selection

Set `FARLAB_MODEL_PROVIDER` to choose the default LLM backend:

| Value | Provider | Notes |
|-------|----------|-------|
| `zai` | Zhipu GLM (GLM-4-plus) | Default; Anthropic-compatible API |
| `dashscope` | Alibaba DashScope | Qwen series; competition route |

Custom providers can be registered programmatically via the provider registry in `src/providers/custom.ts`.

## Run Tests

```bash
# The root vitest suite imports web/src modules — install web deps first
# (CI does the same; see .github/workflows/ci.yml):
cd web && npm install && cd ..

# Full test suite. The experiment-sidecar tests additionally need Python + uv
# (the suite skips them gracefully when uv is absent on the default path —
# CI runs them for real).
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Type checking (strict mode, noUncheckedIndexedAccess enabled)
npm run typecheck

# Linting
npm run lint
```

Test configuration:
- **Runner:** Vitest 3+ with `forks` pool
- **Timeouts:** 120s per test, 60s per hook
- **Coverage:** `tests/**/*.test.ts`, `src/**/*.test.ts`
- **Count:** 240 test files covering domain schemas, pipeline stages, providers, sources, agent kernel, memory, lineage, experiments, API endpoints, CLI commands, and regression guards

## License

[Apache License 2.0](./LICENSE)

Copyright 2026 The FAR-Lab Authors. See [NOTICE](./NOTICE) for third-party attributions.
