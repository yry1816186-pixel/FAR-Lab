# CLI Reference

The `far` CLI is the primary interface to FAR-Chain. Run `far --help` for the live, authoritative
listing. The CLI runs TypeScript directly via Node 24 native type-stripping (no build step).

Unless noted, every command works **offline with zero credentials**. The deterministic R0–R9 kernel
— never an LLM — produces every verdict.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (or PASS for verify-family commands) |
| 1 | runtime error |
| 2 | bad arguments / input validation |
| 7 | FAIL (verify), tamper detected, compile HARD_FAIL, or protocol deviation |

## Diagnostic

### `far version`
Print the package name, version, and git HEAD.

### `far doctor [--live-qwen-smoke]`
Environment self-check (Node/pnpm/Python/git/Docker, dependencies, native module, offline verify of
the demo fixture). A missing `DASHSCOPE_API_KEY` only **WARNs, never FAILs**.
- `--live-qwen-smoke` — explicitly call the real API (needs a valid key; billable).
- Exit: `0` all green / `1` FAIL present (core impaired) / `2` WARN only.

### `far status [--db <path>] [--json]`
Emit the single-source-of-truth status report.
- `--db <path>` — verify the evidence_log chain head (`verifyChainHead`); omitted ⇒ pending.
- `--json` — machine-readable output.

## Demo

### `far demo [tess-offline]`
One-shot demo: 14 Golden Vectors through the real R0–R9 kernel, then an end-to-end demo claim. Fully
offline, no credentials.
- `tess-offline` — focus on the TESS (`C-ASTRO-0001`) offline verdict.

## Core workflow

### `far init <domain> [--out <dir>] [--force]`
Scaffold a DomainPack (`domain.config.json` + `claim.template.json` + `fec.template.json` + `README.md`).
Fill the templates, then run `far fec compile`.

### `far fec compile --claim <path> --out <path>`
Compile a FecContractV2 and recompute `fecHash`. Runs the 10 FEC compilation checks; `computeFecHash`
= SHA-256 over canonical JSON of the VC fields.
- Exit: `0` compiled / `7` HARD_FAIL / `2` bad args / `1` runtime.

### `far fec freeze --fec <path>`
Recompute `fecHash` from a compiled FEC and strictly compare with the stored value (no hand-filled
hashes).
- Exit: `0` match / `7` mismatch (tamper detected) / `2` bad args / `1` runtime.

### `far verify [--bundle <path> | --envelope <path> --db <path>] [--mode chain|envelope|full] [--json] [--explain] [--lint-input <path>]`
Third-party independent recomputation.
- `--bundle <path>` — `.far-proof` V1 minimal offline bundle (positional shorthand allowed).
- `--envelope <path>` — ProofEnvelopeV2 JSON.
- `--db <path>` — evidence_log DB.
- `--mode` — `chain` | `envelope` | `full` (inferred from inputs by default).
- `--json` — machine-readable 10-field schema output.
- `--explain` — human-readable mode: expand the 10-rule check table.
- `--lint-input <path>` — independently recompute the 20 anti-theater detectors and compare in depth
  with the embedded report (requires `--envelope`; any divergence ⇒ FAIL, exit 7).
- Exit: `0` PASS / `7` FAIL / `2` bad args / `1` runtime.

### `far verify-golden [--all | --case GV-01] [--backend node|python|browser] [--json]`
Recompute the verdict Golden Vectors.
- `--all` — run `golden_vectors/cases/GV-01..GV-14.json` (default).
- `--case <id>` — run a single case (e.g. `GV-01`).
- `--backend` — `node` (V2 kernel), `python` (mirror), `browser` (offline verifier).
- Exit: `0` PASS / `7` FAIL / `2` bad args / `1` runtime.

### `far export receipt (--envelope <path> | --bundle <path>) [--format json|markdown] [--out <path>]`
Trust Receipt DOC projection (does not enter proofHash).
- `--format` — `json` (default) | `markdown` (`--json` / `--markdown` are shorthand).
- Exit: `0` success / `7` input validation failed / `2` bad args / `1` runtime.

### `far export far-proof (--demo-chain | --db <path>) --out <dir> [--package] [--archive <path>] [--json] [--force] [--exported-at <iso>]`
Export a `.far-proof` V1 self-verifiable evidence bundle.
- `--demo-chain` — build the `C-ASTRO-0001` offline demo chain, then export.
- `--db <path>` — export from an existing evidence_log DB (also requires `--run-id`, `--model-snapshot`,
  `--git-commit`, `--env-hash`).
- `--package` — also produce `verify.sh` + `integrity.json` + a `.tar.zst` offline package.
- Exit: `0` success / `7` chain verification failed / `2` bad args / `1` runtime.

## Server

### `far api [--port <n>] [--db <path> | --persist <path>] [--no-seed] [--protected]`
Start the REST API server (Fastify; the frontend defaults to `localhost:3000`).
- `--port <n>` — listen port (default 3000; overridable via `PORT`).
- `--db <path>` — DB path (default `:memory:`, fresh each start).
- `--persist <p>` — persist to a file (survives restarts).
- `--no-seed` — do not seed the demo verdict.
- `--protected` — enable JWT auth (needs `FAR_JWT_SECRET`).

## Advanced

### `far ask "<question>" [--mode full|quick] [--json] [--export <dir>] [--profile offline_replay]`
Run the full 6-stage FSM once (`runAgentLoop`); emits a verdict + evidence chain.
- `--mode` — `full` (up to 3 iterations, default) | `quick` (single pass).
- `--export <dir>` — export a V1 `.far-proof` bundle.
- Defaults to `offline_replay` (no keys, fixture replay). Real inference needs `--profile
  competition_aliyun_qwen` + credentials.
- Exit: `0` normal termination / `1` loop error / `2` bad args.

### `far stream "<question>" [--mode] [--json]`
Like `ask`, but streams each stage live (`onArtifact` callback; real streaming, not replay).

### `far repl`
Interactive REPL (`ask` / `:fork <suffix>` / `:history` / `:quit`).

### `far replay --db <path> | --bundle <dir>`
Replay the evidence chain (time machine; hash-chain verify).

### `far court "<claim>" [--models a,b,c] [--json]`
Cross-model reliability court (issues a `ReliabilityCertificate`).

### `far arena "<hypothesis>" [--refuters a,b,c] [--json]`
Adversarial science arena (refuter attacks + deterministic arbiter scoreboard).

### `far bench run [--domain <name>] [--generated-at <iso>] [--git-commit <sha|null>] [--json] [--out <path>]`
FAR-Bench offline demo profile.
- `--domain <name>` — run only the given demo domain; omit for all.
- Exit: `0` success / `2` bad args / `1` runtime.

### `far fsm advance --event <name> --input <path> [--state-file <path>] [--json]`
Advance the 9-state CLI protocol FSM and append a stageReceipt hash link.
- `--event` — a CliEvent name (`ADVANCE_CLAIM_CANDIDATE` … `ADVANCE_VERIFIED`).
- An illegal transition is never silently overwritten: returns `PROTOCOL_DEVIATION_CRITICAL`, exit 7.
- Exit: `0` advanced / `7` protocol deviation / `2` bad args / `1` runtime.

## Honest boundary

Court / arena / ask under `offline_replay` replay the same fixture, so their verdicts are necessarily
identical — they demonstrate the framework, not real model disagreement or real scientific
adjudication. Real inference needs a real provider (credential gate). See
[concepts/far-proof.md](concepts/far-proof.md) and [providers/qwen-dashscope.md](providers/qwen-dashscope.md).
