# Wave-G WP1 · Open-Source Release Structure Proposal

Status: PROPOSAL (user-gated decision points marked ⚠). No large moves executed in Wave-G WP1; the
workspace layout stays as-is. This document defines the boundary and the export mechanism so a public
release can be produced deterministically when the user approves.

Reference standards applied (world-class OSS repo conventions): a public repository contains source,
tests, build/config, licensing, contribution & usage docs, and CI — NOT internal process state,
research working notes, or machine-local runtimes. Examples of the pattern: mature labs ship the tool
+ reproducible eval entry points, and keep internal logs/experiment trails out of the repo or in
clearly separated artifacts/releases.

## 1. Boundary: workspace (full truth) vs public release (curated view)

The FAR-Lab workspace is deliberately a **full-fact system** (constitution §2): `.control/`,
`evidence/`, `research/`, `spikes/` are the project's decision provenance. They must never be deleted
from the workspace — but they do not belong in a public repository (internal state, competition
working notes, session handoffs, provider probe receipts, unfunded-route records).

### Public release (INCLUDE)

| Path | Why public |
|---|---|
| `src/**` | Product source (Direction-A core loop) |
| `web/**` | Product frontend (source + configs + TESTING.md) |
| `tests/**` | Test suite — public repos earn trust through tests |
| `eval/*.mjs`, `eval/*.jsonl` (gold/task inputs), `eval/PROTOCOL.md`, `eval/north-star.json` | Reproducible evaluation harness + declared metrics; this is a scientific-integrity asset, not internal state |
| `scripts/*.mjs` | live-check / serve / migration entry points |
| `zcode-harness/scripts/**`, `zcode-harness/plugins/**` | Runtime governance tooling (completion gate, secret scan, path hygiene, control-plane plugin) — reviewed code, reproducible gates |
| `project-spec/**` | ⚠ USER GATE: specs/contracts are strong OSS material (ARCHITECTURE/INTERFACES/SCIENTIFIC_MODEL); but `COMPETITION.md` contains competition-specific route rules — recommend include-with-redaction or keep-internal, user decides |
| `README.md` | Public entry (already quick-start shaped) |
| Root configs | `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `web/` configs, `.gitignore` |

### Public release (EXCLUDE — workspace-only)

| Path | Why internal |
|---|---|
| `.control/**` | Live control plane (session state, blockers, decisions log) |
| `evidence/**` | Internal verification records (receipts, run reports, audit outputs) |
| `research/**` | Research底稿: SCOUTs, wave reports, WAVE-PROMPTS, intelligence baseline |
| `spikes/**` | Experiment/probe trail (incl. provider route receipts) |
| `eval/results/**` | ⚠ USER GATE: live run outputs (judge scores, baselines). Recommend exclude by default (data, not code; some contain judged model outputs) — but a tagged "reproducibility data" release attachment is a valid alternative. Default: exclude. |
| `AGENTS.md`, `START_HERE.md`, `HANDOFF_PROMPT.md`, `FINAL_BUILD_PROMPT.md`, `FAR-Lab_DEVELOPMENT_MISSION.md`, `BUNDLE_MANIFEST.json`, `final_delivery.md` | Workspace constitution / mission / handoff / delivery artifacts — internal control documents |
| `.far-run/`, `dist/`, `.cache/`, `node_modules/` etc. | Already gitignored runtime state |

## 2. Gaps a public release must close (user-gated)

1. ⚠ **LICENSE — does not exist.** Blocking for any public release. User must choose (the workspace's
   own borrow-rules ban AGPL for INCOMING code; outgoing choice is the user's). Until chosen, the export
   script refuses to run with `--require-license` default.
2. ⚠ **Competition-specific content**: `project-spec/COMPETITION.md` and any README mentions of the
   competition route status — decide include/redact.
3. **Public README hardening**: the export generates a release README section pointing at
   `project-spec/` docs and the eval harness entry points; workspace-internal pointers
   (`.control/`, HANDOFF) are stripped by the allowlist naturally.
4. **CI (optional, recommended)**: a minimal GitHub Actions workflow running typecheck/lint/test/build
   on the public view — proposal only; not built in Wave-G (WP scope).

## 3. Export mechanism (proposed, small, deterministic)

`scripts/export-public.mjs` (to be built on user approval; spec here so the mechanism is reviewable):

- Input: an explicit allowlist manifest (the INCLUDE table above, machine-readable
  `zcode-harness/public-release-manifest.json`), pinned to the current commit hash.
- Behavior: copies allowlisted paths into `build/public-release/<name>-<shortsha>/` (gitignored),
  verifies the copied tree: `npm ci && npm run typecheck && npm test && npm run build` inside the copy
  (the copy must be self-sufficient), writes a `PROVENANCE.md` recording source commit + export time +
  diff-vs-allowlist. Refuses to export without a LICENSE file in the allowlist (gate #1).
- The workspace stays untouched; no history rewrite; public repo gets a fresh initial history (no
  internal commits leaked through grafting) — this is the safe default vs `git filter-repo` (which is
  banned by red lines anyway when applied to this workspace).

## 4. Root tidiness (current state, post-WP1)

Root keeps: constitution/mission/control docs (internal-by-design, each referenced), README, configs,
dir entries. Removed this wave: stray empty `artifacts/`, 4 stray temp files (see deletion-manifest).
Verdict: root is tidy for a WORKSPACE; the public view is produced by the export allowlist, not by
restructuring the workspace (avoids breaking hundreds of recorded evidence paths — constitution §2
provenance links stay valid).
