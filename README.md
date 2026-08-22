# FAR-Lab

Evidence-constrained, falsifiable scientific hypothesis generation and research-plan design workbench. Given a research question, it retrieves literature, generates competing hypotheses ranked by evidence support and falsifiability, synthesizes executable research plans, and produces reproducibility bundles with independent verification.

## Features

- **Full research pipeline** — 11 stages: `scope` → `retrieve` → `verify_sources` → `build_evidence` → `generate_hypotheses` → `critique_falsify` → `rank` → `plan` → `feedback` → `revise` → `export`; literature sources: OpenAlex, arXiv, CrossRef, EuropePMC
- **Claim-source word-by-word binding** — every evidential claim is bound to its source text span; alignment is machine-verifiable, not free-text assertion
- **Hypothesis comparison with evidence discrimination** — structured comparison view with per-cell evidence support/contradiction states; falsification stage produces ACH-style contrastivity analysis
- **Model-agnostic provider layer** — pluggable LLM backends via `FARLAB_MODEL_PROVIDER`; built-in adapters for Zhipu GLM (`zai`) and Alibaba DashScope/Qwen (`dashscope`)
- **CLI workbench** (`far` binary) — 15+ commands covering the full lifecycle: create runs, inspect objects, resume from checkpoint, export reports/bundles, record feedback, run experiments, verify reproducibility
- **Web workbench** — React SPA with real-time SSE streaming, run sidebar, hypothesis tournament table, ACH comparison canvas, command palette (`Ctrl+K`), i18n (zh/en), dark/light theme
- **Reproducibility bundles** — self-contained export with provenance receipts, content-addressed artifacts, lockfile-based dependency pinning; verifiable independently via `far verify`
- **Experiment execution layer** — Python sidecar (`experiment-runtime/`) with durable scheduler, dataset acquisition (ARFF/CSV), train/test splitting, remote execution over stdio JSON protocol
- **Agent-driven refinement** — parallel sub-agent evidence-gap hunting with tool-using loops; full session audit trail
- **Human-in-the-loop feedback** — structured feedback signals (expert judgment, new literature, experiment results, reviewer comments) that causally drive the revise stage
- **Tauri desktop shell** — system tray, deep links, hotkey bindings (optional)

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | >= 24 |
| npm | >= 10 |
| Python + uv | >= 3.11 (experiment sidecar only) |
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

# Set model provider key (choose one)
export ZAI_API_KEY=your_zhipu_api_key          # Zhipu GLM (default)
# export DASHSCOPE_API_KEY=your_dashscope_key   # Alibaba Qwen (competition route)

# Run a minimal research pipeline
far research start "What mechanisms drive horizontal transfer of antibiotic resistance genes in biofilms?" \
  --domain microbiology --goal exploratory

# Watch progress in real time
far research status <run-id> --watch

# Inspect results
far research inspect <run-id> --hypotheses
far research inspect <run-id> --plan

# Export reproducibility bundle
far research export <run-id> --format bundle --out ./output

# Verify bundle independently
far verify <bundle-id>
```

### Web Workbench

```bash
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
│   ├── pipeline/             # 11-stage research pipeline (scope → retrieve → ... → export)
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
├── tests/                    # 54+ test suites (Vitest, forks pool)
├── eval/                     # Evaluation protocols & benchmark scripts
├── scripts/                  # Operational scripts (serve, health checks, export)
├── project-spec/             # Formal specification documents & policies
├── desktop/                  # Tauri v2 desktop shell (Rust backend)
├── dist/                     # Compiled output (git-ignored)
└── .far-run/                 # Runtime data (SQLite DB, artifacts, exports)
```

## Configuration

### Environment Variables

```bash
# === Required (at least one) ===
ZAI_API_KEY=                  # Zhipu GLM API key (default provider)
DASHSCOPE_API_KEY=            # Alibaba DashScope / Qwen API key

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
```

### Provider Selection

Set `FARLAB_MODEL_PROVIDER` to choose the default LLM backend:

| Value | Provider | Notes |
|-------|----------|-------|
| `zai` | Zhipu GLM (GLM-4-plus) | Default; Anthropic-compatible API |
| `dashscope` | Alibaba DashScope | Qwen series; competition route |

Custom providers can be registered programmatically via the provider registry in `src/providers/custom.ts`.

## Run Tests

```bash
# Full test suite
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
- **Count:** 54+ test files covering domain schemas, pipeline stages, providers, sources, agent loop, API endpoints, CLI commands, experiment execution, and regression guards

## License

[Apache License 2.0](./LICENSE)

Copyright 2026 The FAR-Lab Authors. See [NOTICE](./NOTICE) for third-party attributions.
