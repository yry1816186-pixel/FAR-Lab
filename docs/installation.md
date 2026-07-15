# Installation

FAR-Chain's primary language is TypeScript (Node ≥ 24); the research verification axis uses Python
3.11+. The frontend is a separate npm workspace.

## Requirements

| Component | Version | Required? | Notes |
|-----------|---------|-----------|-------|
| Node.js | ≥ 24 | **Required** | Source-distribution runs `.ts` via Node 24 native type-stripping; the published npm bundle is pre-built JS |
| pnpm | 10.x | Required | `corepack enable` enables it |
| git | any | Required | clone the repo |
| Python | 3.11 / 3.12 | Optional | Only the research axis (SymPy/Z3); if missing, that axis skips |
| Docker | any | Optional | `docker compose up` for a one-line demo |

## Option 1: One-line install script (end users)

> `NEEDS_RELEASE_PUBLICATION`: the curl/irm links below point at a GitHub Release asset and go live
> **after the first release is published**. Until then, use Option 2 — the `far` commands are identical.

**macOS / Linux / WSL**:
```bash
curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
far doctor
far demo tess-offline
```

**Windows PowerShell**:
```powershell
irm https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.ps1 | iex
far doctor
far demo tess-offline
```

Script behavior (red lines):
- Installs into the user directory (`~/.far-chain` / `%USERPROFILE%\.far-chain`); **never requires root / admin**.
- Detects Node ≥ 24 / pnpm / Python / git / Docker and prints clear fix instructions for anything missing.
- **Writes no API key**, **downloads no large datasets**, **starts no GPU/cloud**.
- Runs `far doctor` after install and prints the next step.
- Every step is fail-closed (`set -euo pipefail` / `$ErrorActionPreference='Stop'`); failures give a clear error.

## Option 1 alt: npm global install

```bash
npm install -g far-chain
far doctor
far demo tess-offline
```

The `far` bin ships as a pre-built bundle (`dist/far.js`, produced by `scripts/build_cli.mjs` via
esbuild on `prepack`). Source-distribution (Option 2) runs the `.ts` directly via Node 24 native
type-stripping; the published bundle sidesteps Node's `node_modules` type-stripping restriction so
`npm install -g` works out of the box. Native deps (`better-sqlite3`, `fastify`, …) resolve from the
installer's `node_modules` at runtime.

> Verified by a fresh-install smoke on every release: `npm pack` → install in an isolated dir →
> `far version` / `--help` / `doctor` all run; `far doctor` reports WARN (healthy) with
> `better-sqlite3 resolvable` OK.

## Option 2: Developer install (git clone)

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install --frozen-lockfile      # Node dependencies
node scripts/ensure_py_deps.mjs      # probe the Python verification axis (graceful skip if missing)
```

Optional research axis (SymPy/Z3 cross-language hash consistency):
```bash
pip install -e .                     # core research deps (threadpoolctl/numpy/sympy/z3-solver)
# Real TESS live-data fetching (heavy deps · only for NEEDS_REAL_ENV scenarios, install manually):
# pip install -e ".[science]"        # lightkurve + astroquery
```

Enable the global `far` command:
```bash
pnpm link --global          # or just run node src/cli/far.ts <command>
```

Makefile (macOS/Linux): `make bootstrap` (install deps) / `make verify` (CI gates) / `make demo`
(offline). Windows has no make — use the pnpm commands directly.

## Option 3: Docker

```bash
docker compose up far-demo      # one-shot offline TESS demo (no key)
docker compose up far-api       # long-running API server @ http://localhost:3000 (offline)
```

The default image runs the offline demo / anonymous API and **never** requires a key. For a real
provider, pass an explicit env file:
```bash
echo "DASHSCOPE_API_KEY=sk-..." > .env
docker compose --env-file .env up far-api
```

> `NEEDS_DOCKER_BUILD_VALIDATION`: the image is designed on the standard `node:24-slim` pattern; it
> cannot be build-tested locally when no daemon is running. Publishing to GHCR is part of the release
> workflow (`NEEDS_GHCR_PUBLISH`).

## Run the full stack (API + web dashboard)

```bash
pnpm api                                       # terminal 1: REST API @ http://localhost:3000
cd frontend && npm install && npm run dev      # terminal 2: Vite @ http://localhost:5173
```

The frontend defaults to `localhost:3000` (override with `VITE_API_BASE_URL`). Production mode:
`pnpm api --persist ./far-chain.db --protected` (needs `FAR_JWT_SECRET`).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `far` command not found | `pnpm link --global`; or run `node src/cli/far.ts` directly; or verify PATH includes the pnpm global bin |
| `node src/cli/far.ts` reports a type-stripping error | Node < 24; `nvm install 24` or install Node ≥ 24 |
| `pnpm install` fails | delete `node_modules` and retry; confirm pnpm 10 (`corepack enable`) |
| pnpm reports "Ignored build scripts: esbuild" | Normal (pnpm 10 default); does not affect better-sqlite3 (prebuilt) or the `far` command (fresh-clone verified). If you need vitest/tsx (dev): `pnpm approve-builds` |
| Python axis skips | run `node scripts/ensure_py_deps.mjs` for the probe output; `pip install -e .` |
| better-sqlite3 native load failure | reinstall: `pnpm rebuild better-sqlite3`; or confirm the Node ≥ 24 match |
| Anything uncertain | `far doctor` — it tells you item by item what is wrong |

## Things you must not do (red lines)

- ❌ Never commit `.env` or any file containing a real key (`.gitignore` already excludes it; see [SECURITY.md](../SECURITY.md)).
- ❌ Never call a real API by default in CI / install scripts (only via conditional gates / explicit flags).
- ❌ Never present the offline demo as a live demo.
