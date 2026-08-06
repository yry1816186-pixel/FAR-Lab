#!/usr/bin/env python3
"""Insert JSDoc comments before export statements across CLI and demo_seeds modules."""
import os, sys

BASE = "src"
count = 0

def insert_jsdoc(filepath, export_start, jsdoc):
    """Insert JSDoc text immediately before a line starting with export_start."""
    global count
    full = os.path.join(BASE, filepath)
    with open(full, "r", encoding="utf-8") as f:
        content = f.read()
    out = []
    done = False
    for line in content.split("\n"):
        if not done and line.lstrip().startswith(export_start):
            if out and out[-1].strip().startswith("/**"):
                print(f"  SKIP (has JSDoc): {filepath} :: {export_start[:40]}")
            else:
                out.extend(jsdoc.split("\n"))
                done = True
                count += 1
                print(f"  OK: {filepath} :: {export_start[:50]}")
        out.append(line)
    if not done:
        print(f"  NOT FOUND: {filepath} :: {export_start[:50]}")
        return
    with open(full, "w", encoding="utf-8") as f:
        f.write("\n".join(out))

# ============================================================
# CLI COMMANDS
# ============================================================

# --- cli/commands/api.ts ---
insert_jsdoc("cli/commands/api.ts", "export interface ApiArgs",
    "/**\n * Parsed arguments for the `far api` command.\n *\n * Controls the REST API server binding, database backend, demo seeding, and JWT authentication.\n */")

insert_jsdoc("cli/commands/api.ts", "export function parseApiArgs",
    "/**\n * Parses CLI arguments for the `far api` command.\n *\n * Supports --port, --host, --db, --persist, --no-seed, --jwt-secret, --protected.\n * Falls back to PORT environment variable for the port.\n * @param argv - Raw CLI argument tokens (excluding the far api prefix).\n * @returns Parsed ApiArgs with all fields resolved.\n * @throws Error on unrecognized arguments.\n */")

insert_jsdoc("cli/commands/api.ts", "export async function runApi",
    "/**\n * Starts the FAR-Lab REST API server (Fastify).\n *\n * Refuses to bind on non-loopback hosts in anonymous mode as a fail-closed security measure.\n * Seeds the database with demo verdict data when --seed is enabled.\n * @param argv - Raw CLI argument tokens for the far api command.\n * @returns Exit code: 0 on success.\n * @throws Error if binding non-loopback in anonymous mode or server fails to start.\n */")

# --- cli/commands/arena.ts ---
insert_jsdoc("cli/commands/arena.ts", "export interface ArenaArgs",
    "/**\n * Parsed arguments for the `far arena` adversarial science arena command.\n *\n * A hypothesis is adjudicated by a deterministic kernel, then N refuters attempt attacks.\n */")

insert_jsdoc("cli/commands/arena.ts", "export function parseArenaArgs",
    "/**\n * Parses CLI arguments for the `far arena` command.\n *\n * Supports --refuters <csv> and --json. Positional args form the hypothesis.\n * @param argv - Raw CLI argument tokens (excluding far arena prefix).\n * @returns Parsed ArenaArgs.\n * @throws Error on unrecognized flags or empty --refuters value.\n */")

insert_jsdoc("cli/commands/arena.ts", "export async function runArena",
    "/**\n * Runs the adversarial science arena session.\n *\n * Executes the hypothesis through the R0-R9 kernel, runs refuters, scores attacks.\n * @param argv - Raw CLI argument tokens for the far arena command.\n * @returns Exit code: 0 on success.\n */")

# --- cli/commands/ask.ts ---
insert_jsdoc("cli/commands/ask.ts", "export interface AskArgs",
    "/**\n * Parsed arguments for the `far ask` command.\n *\n * Controls the question text, FSM mode, database, output, export, resume, and profile.\n */")

insert_jsdoc("cli/commands/ask.ts", "export function parseAskArgs",
    "/**\n * Parses CLI arguments for the `far ask` command.\n *\n * Supports --mode full|quick, --db, --json, --resume, --export, --profile.\n * @param argv - Raw CLI argument tokens (excluding far ask prefix).\n * @returns Parsed AskArgs.\n * @throws Error on invalid mode values or unrecognized flags.\n */")

insert_jsdoc("cli/commands/ask.ts", "export interface AskRender",
    "/**\n * Renderable output from a `far ask` run, used by both CLI and API layers.\n *\n * Contains question, run ID, stage progression, verdict, trace grade, and chain head hash.\n */")

insert_jsdoc("cli/commands/ask.ts", "export function buildRender",
    "/**\n * Builds a renderable output object from a loop runner result.\n *\n * Extracts verdict, trace grade, stage count, termination reason into a structured render.\n * @param result - The raw loop runner result from the 6-stage FSM.\n * @param profile - The LLM profile used (e.g. offline_replay).\n * @param question - The original question text.\n * @returns A structured AskRender for display.\n */")

insert_jsdoc("cli/commands/ask.ts", "export async function runAsk",
    "/**\n * Runs the full `far ask` pipeline: 6-stage FSM, proof sealing, and optional export.\n *\n * Creates an in-memory database, runs the agent loop, seals the proof envelope (ASK-9),\n * and optionally exports to .far-proof bundle.\n * @param argv - Raw CLI argument tokens for the far ask command.\n * @returns Exit code: 0 on success.\n */")

# --- cli/commands/audit_multiseed.ts ---
insert_jsdoc("cli/commands/audit_multiseed.ts", "export interface AuditMultiseedOptions",
    "/**\n * Options for the `far audit-multiseed` command.\n *\n * Configures lightcurve path, Python command, and JSON output mode.\n */")

insert_jsdoc("cli/commands/audit_multiseed.ts", "export interface AuditMultiseedDump",
    "/**\n * Structured audit dump from a multi-seed cherry-pick detection run.\n *\n * Records declared vs detected vs hidden seeds, per-seed BLS metrics, and verdict.\n */")

insert_jsdoc("cli/commands/audit_multiseed.ts", "export async function collectAuditMultiseed",
    "/**\n * Collects a multi-seed BLS experiment and runs cherry-pick detection.\n *\n * Spawns real Python processes per seed, builds the adversarial chain, detects cherry-picking.\n * @param options - Lightcurve path and Python command configuration.\n * @returns Structured AuditMultiseedDump with detection results.\n */")

insert_jsdoc("cli/commands/audit_multiseed.ts", "export async function runAuditMultiseed",
    "/**\n * Runs the `far audit-multiseed` CLI command end-to-end.\n *\n * Discovers Python, resolves fixture path, collects audit dump, outputs results.\n * @param argv - Raw CLI argument tokens for far audit-multiseed.\n * @returns Exit code: 0 success, 1 audit failure, 2 argument error.\n */")

# --- cli/commands/audit_seed_cherry.ts ---
insert_jsdoc("cli/commands/audit_seed_cherry.ts", "export interface AuditSeedCherryOptions",
    "/**\n * Options for the `far audit-seed-cherry` command.\n *\n * Configures lightcurve path, Python command, and JSON output mode.\n */")

insert_jsdoc("cli/commands/audit_seed_cherry.ts", "export interface AuditSeedCherryDump",
    "/**\n * Structured audit dump from a seed-cherry-pick detection showcase.\n *\n * Records declared vs reported vs hidden seeds, BLS metrics, and anti-theater verdict.\n */")

insert_jsdoc("cli/commands/audit_seed_cherry.ts", "export async function collectAuditSeedCherry",
    "/**\n * Collects a seed-cherry-pick adversarial chain and runs anti-theater detection.\n *\n * Uses fixture cherry-pick data to validate the ANTI_THEATER_FAIL detector.\n * @param options - Lightcurve path and Python command configuration.\n * @returns Structured AuditSeedCherryDump with detection results.\n */")

insert_jsdoc("cli/commands/audit_seed_cherry.ts", "export async function runAuditSeedCherry",
    "/**\n * Runs the `far audit-seed-cherry` CLI command end-to-end.\n *\n * Discovers Python, resolves fixture path, collects audit dump, outputs results.\n * @param argv - Raw CLI argument tokens for far audit-seed-cherry.\n * @returns Exit code: 0 success, 1 failure, 2 argument error.\n */")

# --- cli/commands/backup.ts ---
insert_jsdoc("cli/commands/backup.ts", "export function runBackup",
    "/**\n * Runs the `far backup` command: VACUUM INTO safe backup with integrity checks.\n *\n * Full integrity check before backup (fail-closed), VACUUM INTO for copy, then quick_check.\n * @param argv - Raw CLI argument tokens (--db <path> --out <path> [--force]).\n * @returns Exit code: 0 success, 1 integrity failure, 2 argument error.\n */")

# --- cli/commands/bench.ts ---
insert_jsdoc("cli/commands/bench.ts", "export interface BenchRunOptions",
    "/**\n * Options for the `far bench run` command.\n *\n * Controls JSON output, file output path, timestamp, git SHA, and domain filter.\n */")

insert_jsdoc("cli/commands/bench.ts", "export async function runBenchRun",
    "/**\n * Runs the deterministic engineering-integrity benchmark across demo seeds.\n *\n * Loads the demo seed registry, optionally filters by domain, executes all seeds.\n * @param options - Benchmark configuration including output format and domain filter.\n * @returns Exit code: 0 success, 2 if no seeds match domain.\n */")

insert_jsdoc("cli/commands/bench.ts", "export function selectBenchSeeds",
    "/**\n * Selects benchmark seeds matching a given scientific domain.\n *\n * @param seeds - All available benchmark seed runners.\n * @param domain - Optional domain filter. undefined returns all seeds.\n * @returns Filtered list of seed runners matching the domain.\n */")

# --- cli/commands/c_astro.ts ---
insert_jsdoc("cli/commands/c_astro.ts", "export interface CAstroOnlineOptions",
    "/**\n * Options for the `far c-astro` online TESS analysis command.\n *\n * Configures lightcurve path, Python command, and JSON output mode.\n */")

insert_jsdoc("cli/commands/c_astro.ts", "export interface CAstroOnlineDump",
    "/**\n * Structured output from a `far c-astro` online TESS analysis run.\n *\n * Records BLS period, depth, SNR, transit parameters, and five-value verdict.\n */")

insert_jsdoc("cli/commands/c_astro.ts", "export async function runCAstro",
    "/**\n * Runs the `far c-astro` CLI command: online TESS exoplanet transit analysis.\n *\n * Discovers Python, runs BLS periodogram on a TESS lightcurve, produces full verdict.\n * @param argv - Raw CLI argument tokens for far c-astro.\n * @returns Exit code: 0 success, 1 analysis failure, 2 argument error.\n */")

# --- cli/commands/court.ts ---
insert_jsdoc("cli/commands/court.ts", "export interface CourtArgs",
    "/**\n * Parsed arguments for the `far court` adversarial adjudication command.\n *\n * Controls the hypothesis text, refuter strategy, and output format.\n */")

insert_jsdoc("cli/commands/court.ts", "export function parseCourtArgs",
    "/**\n * Parses CLI arguments for the `far court` command.\n *\n * @param argv - Raw CLI argument tokens (excluding far court prefix).\n * @returns Parsed CourtArgs.\n * @throws Error on unrecognized arguments.\n */")

insert_jsdoc("cli/commands/court.ts", "export async function runCourt",
    "/**\n * Runs the `far court` adversarial adjudication session.\n *\n * @param argv - Raw CLI argument tokens for the far court command.\n * @returns Exit code: 0 on success.\n */")

# --- cli/commands/demo.ts ---
insert_jsdoc("cli/commands/demo.ts", "export async function runDemo",
    "/**\n * Runs the `far demo` command: one-shot 6-stage FSM demo with offline replay.\n *\n * @param argv - Raw CLI argument tokens for far demo.\n * @returns Exit code: 0 on success.\n */")

# --- cli/commands/doctor.ts ---
insert_jsdoc("cli/commands/doctor.ts", "export interface DoctorOptions",
    "/**\n * Options for the `far doctor` environment self-check command.\n *\n * Controls JSON output mode for machine-readable diagnostics.\n */")

insert_jsdoc("cli/commands/doctor.ts", "export function runDoctor",
    "/**\n * Runs the `far doctor` command: environment self-diagnostic checks.\n *\n * Validates Node.js version, package structure, git availability, and prerequisites.\n * @param options - Doctor options including JSON output flag.\n * @returns Exit code: 0 all checks pass, 1 any check fails.\n */")

# --- cli/commands/export_far_proof.ts ---
insert_jsdoc("cli/commands/export_far_proof.ts", "export type ExportFarProofSource",
    "/**\n * Supported source types for FAR-proof export (envelope JSON or bundle directory). */")

insert_jsdoc("cli/commands/export_far_proof.ts", "export interface ExportFarProofOptions",
    "/**\n * Options for the `far export far-proof` command.\n *\n * Controls the export source, output directory, and timestamp.\n */")

insert_jsdoc("cli/commands/export_far_proof.ts", "export interface ExportFarProofCliResult",
    "/**\n * Result of a FAR-proof export CLI operation.\n *\n * Contains the output directory path and number of envelopes exported.\n */")

insert_jsdoc("cli/commands/export_far_proof.ts", "export function runExportFarProof",
    "/**\n * Runs the `far export far-proof` command: exports proof data to a bundle.\n *\n * @param options - Export configuration (source, output directory, timestamp).\n * @returns Exit code: 0 on success, non-zero on failure.\n */")

# --- cli/commands/export_receipt.ts ---
insert_jsdoc("cli/commands/export_receipt.ts", "export type ReceiptFormat",
    "/**\n * Supported output formats for trust receipt export (json or markdown). */")

insert_jsdoc("cli/commands/export_receipt.ts", "export type ReceiptSourceKind",
    "/**\n * Source kind for a trust receipt: ProofEnvelopeV2 JSON or .far-proof bundle. */")

insert_jsdoc("cli/commands/export_receipt.ts", "export type ReceiptTamperStatus",
    "/**\n * Tamper detection status: clean, tampered, or unknown. */")

insert_jsdoc("cli/commands/export_receipt.ts", "export interface TrustReceiptSummary",
    "/**\n * Human-readable summary of a trust receipt: claim, verdict, evidence scope,\n * proof hash, verification command, tamper status, and limitations.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export interface TrustReceipt",
    "/**\n * Complete trust receipt document projected from proof data.\n *\n * A DOC projection (not a new fact source). Contains schema version, timestamp,\n * source provenance, verification summary, and scientific limitations.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export interface ExportReceiptOptions",
    "/**\n * Options for the `far export receipt` command.\n *\n * Controls the source (envelope or bundle), output format, file path, and timestamp.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export function runExportReceipt",
    "/**\n * Runs the `far export receipt` command: generates a trust receipt from proof data.\n *\n * Accepts --envelope or --bundle, verifies the proof, outputs JSON or Markdown.\n * @param options - Receipt export configuration.\n * @returns Exit code: 0 success, 2 argument error, 7 verification failure.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export function buildTrustReceiptFromEnvelope",
    "/**\n * Builds a trust receipt from a ProofEnvelopeV2 object.\n *\n * Verifies envelope integrity, extracts claim/verdict, computes tamper status.\n * @param envelope - The parsed ProofEnvelopeV2 to build from.\n * @param sourcePath - File path of the source envelope for provenance.\n * @param generatedAt - ISO 8601 timestamp for receipt generation.\n * @returns Assembled trust receipt, or error if verification fails.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export function buildTrustReceiptFromBundle",
    "/**\n * Builds a trust receipt from a .far-proof V1 bundle directory.\n *\n * Verifies bundle integrity, loads latest envelope from proof_envelopes.jsonl.\n * @param bundlePath - Path to the .far-proof bundle directory.\n * @param generatedAt - ISO 8601 timestamp for receipt generation.\n * @returns Assembled trust receipt, or error if verification fails.\n */")

insert_jsdoc("cli/commands/export_receipt.ts", "export function renderReceiptMarkdown",
    "/**\n * Renders a trust receipt as a Markdown document.\n *\n * @param receipt - The trust receipt to render.\n * @returns Markdown-formatted string with claim, verdict, limitations, and verify command.\n */")

# --- cli/commands/fec.ts ---
insert_jsdoc("cli/commands/fec.ts", "export interface FecCompileOptions",
    "/**\n * Options for the `far fec compile` command.\n *\n * Controls the claim text, output path, and optional FEC ID.\n */")

insert_jsdoc("cli/commands/fec.ts", "export interface FecFreezeOptions",
    "/**\n * Options for the `far fec freeze` command.\n *\n * Controls the claim ID and output path for freezing a compiled FEC.\n */")

insert_jsdoc("cli/commands/fec.ts", "export interface FecCompileSuccessOutput",
    "/**\n * Structured success output from FEC compilation.\n *\n * Contains the compiled FEC document, schema version, and output file path.\n */")

insert_jsdoc("cli/commands/fec.ts", "export interface FecCompileFailureOutput",
    "/**\n * Structured failure output from FEC compilation.\n *\n * Contains error code and human-readable error message.\n */")

insert_jsdoc("cli/commands/fec.ts", "export type FecCompileOutput",
    "/**\n * Discriminated union of FEC compilation results (success or failure). */")

insert_jsdoc("cli/commands/fec.ts", "export function runFecCompile",
    "/**\n * Runs the `far fec compile` command: compiles a Falsification Evidence Chain from a claim.\n *\n * @param options - Compilation options including claim text and output path.\n * @returns Structured FecCompileOutput indicating success or failure.\n */")

insert_jsdoc("cli/commands/fec.ts", "export function runFecFreeze",
    "/**\n * Runs the `far fec freeze` command: freezes a compiled FEC to disk.\n *\n * @param options - Freeze options including claim ID and output path.\n * @returns Exit code: 0 on success, 1 on failure.\n */")

# --- cli/commands/fsm.ts ---
insert_jsdoc("cli/commands/fsm.ts", "export interface FsmAdvanceOptions",
    "/**\n * Options for the `far fsm advance` command.\n *\n * Controls the FSM event to fire, state file path, and JSON output mode.\n */")

insert_jsdoc("cli/commands/fsm.ts", "export interface FsmStateFile",
    "/**\n * Persistent state file for the CLI FSM, stored as JSON on disk.\n *\n * Tracks the current state and a SHA-256 receipt chain for tamper detection.\n */")

insert_jsdoc("cli/commands/fsm.ts", "export interface FsmAdvanceSuccess",
    "/**\n * Success result from an FSM advance operation.\n *\n * Contains the new state and the updated receipt hash.\n */")

insert_jsdoc("cli/commands/fsm.ts", "export interface FsmAdvanceFailure",
    "/**\n * Failure result from an FSM advance operation.\n *\n * Contains the error kind and a human-readable reason string.\n */")

insert_jsdoc("cli/commands/fsm.ts", "export type FsmAdvanceResult",
    "/**\n * Discriminated union of FSM advance results (success or failure). */")

insert_jsdoc("cli/commands/fsm.ts", "export function runFsmAdvance",
    "/**\n * Runs the `far fsm advance` command: advances the CLI protocol FSM by one event.\n *\n * Reads current state from disk, validates transition, updates receipt chain.\n * @param options - FSM advance configuration (event, state file path, output mode).\n * @returns Exit code: 0 success, 1 protocol deviation, 2 argument error.\n */")

# --- cli/commands/init.ts ---
insert_jsdoc("cli/commands/init.ts", "export interface InitArgs",
    "/**\n * Parsed arguments for the `far init` command.\n *\n * Controls the project name, target directory, and template selection.\n */")

insert_jsdoc("cli/commands/init.ts", "export function parseInitArgs",
    "/**\n * Parses CLI arguments for the `far init` command.\n *\n * @param argv - Raw CLI argument tokens (excluding far init prefix).\n * @returns Parsed InitArgs.\n * @throws Error on unrecognized arguments.\n */")

insert_jsdoc("cli/commands/init.ts", "export function runInit",
    "/**\n * Runs the `far init` command: scaffolds a new FAR-Lab project.\n *\n * @param argv - Raw CLI argument tokens for the far init command.\n * @returns Exit code: 0 on success.\n */")

# --- cli/commands/lifecycle.ts ---
insert_jsdoc("cli/commands/lifecycle.ts", "export async function runLifecycle",
    "/**\n * Runs the `far lifecycle` command: manages claim lifecycle states.\n *\n * Subcommands: state (show), history (list), transition (advance with audit), verify (integrity).\n * @param argv - Raw CLI argument tokens for far lifecycle.\n * @returns Exit code: 0 on success, 2 on argument error.\n */")

# --- cli/commands/repl.ts ---
insert_jsdoc("cli/commands/repl.ts", "export async function runRepl",
    "/**\n * Runs the `far repl` command: interactive REPL for continuous 6-stage FSM queries.\n *\n * Accepts questions line-by-line, runs each through the agent loop in quick mode.\n * Supports :fork, :history, :help, :quit.\n * @returns Exit code: 0 on normal exit.\n */")

# --- cli/commands/replay.ts ---
insert_jsdoc("cli/commands/replay.ts", "export interface ReplayArgs",
    "/**\n * Parsed arguments for the `far replay` command.\n *\n * Controls the evidence chain data source (DB or bundle) and output format.\n */")

insert_jsdoc("cli/commands/replay.ts", "export function parseReplayArgs",
    "/**\n * Parses CLI arguments for the `far replay` command.\n *\n * Supports --db, --bundle, --json. Positional arg treated as DB path.\n * @param argv - Raw CLI argument tokens (excluding far replay prefix).\n * @returns Parsed ReplayArgs.\n * @throws Error if neither --db nor --bundle provided, or on unknown flags.\n */")

insert_jsdoc("cli/commands/replay.ts", "export async function runReplay",
    "/**\n * Runs the `far replay` command: replays an evidence chain from a DB or bundle.\n *\n * Reads call_records, displays each record's stage and hash chain, verifies integrity.\n * @param argv - Raw CLI argument tokens for far replay.\n * @returns Exit code: 0 success, 1 error, 2 argument error.\n */")

# --- cli/commands/status.ts ---
insert_jsdoc("cli/commands/status.ts", "export interface StatusOptions",
    "/**\n * Options for the `far status` command.\n *\n * Controls the optional evidence_log DB path and JSON output mode.\n */")

insert_jsdoc("cli/commands/status.ts", "export function runStatus",
    "/**\n * Runs the `far status` command: single-source-of-truth project status dump.\n *\n * Collects git info, file counts, golden vectors, chain head, tests, and coverage.\n * Always exits 0 (pending fields are not failures).\n * @param options - Status options including optional DB path and JSON flag.\n * @param repoRoot - Repository root directory (injectable for testing).\n * @returns Exit code: 0 (always), 2 if not inside a git checkout.\n */")

# --- cli/commands/stream.ts ---
insert_jsdoc("cli/commands/stream.ts", "export interface StreamArgs",
    "/**\n * Parsed arguments for the `far stream` command.\n *\n * Controls the question, FSM mode, JSON output, and LLM profile.\n */")

insert_jsdoc("cli/commands/stream.ts", "export function parseStreamArgs",
    "/**\n * Parses CLI arguments for the `far stream` command.\n *\n * Supports --mode full|quick, --json, --profile.\n * @param argv - Raw CLI argument tokens (excluding far stream prefix).\n * @returns Parsed StreamArgs.\n * @throws Error on invalid mode values or unrecognized flags.\n */")

insert_jsdoc("cli/commands/stream.ts", "export async function runStream",
    "/**\n * Runs the `far stream` command: SSE/stdio streaming 6-stage FSM execution.\n *\n * Executes the agent loop with per-stage onArtifact callback for real-time progress.\n * @param argv - Raw CLI argument tokens for far stream.\n * @returns Exit code: 0 success, 2 missing question or unsupported profile.\n */")

# --- cli/commands/verify.ts ---
insert_jsdoc("cli/commands/verify.ts", "export type VerifyStatus",
    "/**\n * Verification status: PASS, FAIL, or WARN. */")

insert_jsdoc("cli/commands/verify.ts", "export type TamperStatus",
    "/**\n * Tamper detection status: clean, tampered, or not applicable. */")

insert_jsdoc("cli/commands/verify.ts", "export type ScopeStatus",
    "/**\n * Evidence scope status: full, degraded, or not applicable. */")

insert_jsdoc("cli/commands/verify.ts", "export type RecomputeAxis",
    "/**\n * Recomputation axis status: pass, fail, or not yet run.\n *\n * Each axis (node, python, browser) independently recomputes the proof hash.\n */")

insert_jsdoc("cli/commands/verify.ts", "export interface VerifyOptions",
    "/**\n * Options for the `far verify` command.\n *\n * Controls verification mode, source paths, recomputation backends, and output format.\n */")

# --- cli/commands/verify_golden.ts ---
insert_jsdoc("cli/commands/verify_golden.ts", "export const buildPythonPath",
    "/**\n * Builds the Python module search path for repro scripts.\n *\n * Re-exported from python_env.ts for backward compatibility with test imports.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export type VerifyGoldenStatus",
    "/**\n * Golden vector verification status: PASS or FAIL. */")

insert_jsdoc("cli/commands/verify_golden.ts", "export type VerifyGoldenBackend",
    "/**\n * Verification backend: node (TypeScript kernel), python (cross-language mirror),\n * or browser (Web Crypto sandbox).\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export interface VerifyGoldenCaseResult",
    "/**\n * Result of verifying a single golden vector case.\n *\n * Compares computed verdict, decisive rule ID, and reason codes against expected values.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export interface VerifyGoldenDump",
    "/**\n * Aggregated dump from a golden vector verification run.\n *\n * Contains pass/fail counts, per-case results, and any errors encountered.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export interface CollectVerifyGoldenOptions",
    "/**\n * Options for collecting golden vector verification results.\n *\n * Supports filtering by case IDs, custom case directory, and backend selection.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export function collectVerifyGoldenDump",
    "/**\n * Collects golden vector verification results for a given backend.\n *\n * Loads cases from disk, runs them through the specified backend's verdict kernel.\n * @param options - Case selection, directory, and backend configuration.\n * @returns Aggregated VerifyGoldenDump with per-case results.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export function runVerifyGolden",
    "/**\n * Runs the `far verify-golden` CLI command end-to-end.\n *\n * Validates on-disk golden vector cases against the V2 verdict kernel.\n * @param argv - Raw CLI argument tokens for far verify-golden.\n * @returns Exit code: 0 all pass, 1 failure, 2 argument error.\n */")

insert_jsdoc("cli/commands/verify_golden.ts", "export function renderVerifyGoldenText",
    "/**\n * Renders golden vector verification results as human-readable text.\n *\n * @param dump - The golden vector verification dump to render.\n * @returns Formatted string with pass/fail summary and per-case details.\n */")

# --- cli/commands/version.ts ---
insert_jsdoc("cli/commands/version.ts", "export function runVersion",
    "/**\n * Runs the `far version` command: prints package version and git HEAD SHA.\n *\n * @returns Exit code: 0 (always succeeds).\n */")

# --- cli/git_commit_sha.ts ---
insert_jsdoc("cli/git_commit_sha.ts", "export function resolveGitCommitSha",
    "/**\n * Resolves the current git HEAD commit SHA.\n *\n * Runs git rev-parse HEAD in PACKAGE_ROOT. Falls back to DEMO_GIT_COMMIT_SHA when\n * not in a git repo or git is unavailable. CWD-independent for SHA integrity.\n * @returns 40-character lowercase hex SHA string.\n */")

# --- cli/parse_options.ts ---
insert_jsdoc("cli/parse_options.ts", "export interface OptionSchema",
    "/**\n * Declarative schema for a single CLI option.\n *\n * Supports string, boolean, and enum types with aliases, defaults, validators,\n * and positional argument handling.\n */")

insert_jsdoc("cli/parse_options.ts", "export interface ParseResult",
    "/**\n * Result of declarative CLI argument parsing.\n *\n * Contains resolved option values and any errors encountered during parsing.\n */")

insert_jsdoc("cli/parse_options.ts", "export function parseOptions",
    "/**\n * Parses CLI arguments according to a declarative option schema.\n *\n * Single-pass over args supporting --flag value, --flag=value, boolean flags,\n * positional arguments, enum validation, and custom validators.\n * @param args - Raw CLI argument tokens.\n * @param schema - Array of option schema definitions.\n * @param commandPrefix - Error message prefix (e.g. far api).\n * @returns ParseResult with resolved values and any parsing errors.\n */")

insert_jsdoc("cli/parse_options.ts", "export function reportErrors",
    "/**\n * Reports parsing errors to stderr and returns the appropriate exit code.\n *\n * @param errors - Array of error strings from a failed parse.\n * @param commandPrefix - Command name for error messages.\n * @returns Exit code: 2 if errors exist, 0 if none.\n */")

# --- cli/stage_receipt.ts ---
insert_jsdoc("cli/stage_receipt.ts", "export const GENESIS_RECEIPT",
    "/**\n * Genesis receipt hash: 64 zero hex characters.\n *\n * Serves as the prevReceipt for the first stage in the CLI FSM receipt chain,\n * matching the evidence_log GENESIS_PREV_HASH convention.\n */")

insert_jsdoc("cli/stage_receipt.ts", "export interface StageReceipt",
    "/**\n * A single stage receipt in the CLI FSM hash chain.\n *\n * Links each stage to its predecessor via SHA-256(prevReceipt + outputHash),\n * forming a tamper-evident chain from genesis through verification.\n */")

insert_jsdoc("cli/stage_receipt.ts", "export function computeStageReceipt",
    "/**\n * Computes a stage receipt hash by chaining with the previous receipt.\n *\n * @param prevReceipt - Previous stage receipt hash (64-char hex). Non-empty; use GENESIS_RECEIPT for first stage.\n * @param stageOutput - The stage output object to hash (serialized via canonical JSON).\n * @returns 64-character lowercase hex SHA-256 digest.\n * @throws Error if prevReceipt is empty.\n */")

insert_jsdoc("cli/stage_receipt.ts", "export function verifyStageReceiptChain",
    "/**\n * Verifies the integrity of a complete stage receipt chain.\n *\n * Walks from genesis through each receipt, recomputing the expected hash.\n * @param receipts - Ordered array of stage receipts from first to last.\n * @returns true if the chain is intact, false if any link is broken.\n */")

# --- cli/state_machine.ts ---
insert_jsdoc("cli/state_machine.ts", "export const CLI_STATES",
    "/**\n * All valid CLI protocol FSM states, from INITIAL through VERIFIED.\n *\n * Ordered array used to derive the CliState union type at runtime.\n */")

insert_jsdoc("cli/state_machine.ts", "export type CliState =",
    "/**\n * Union type of all valid CLI protocol states. */")

insert_jsdoc("cli/state_machine.ts", "export const CLI_EVENTS",
    "/**\n * All valid CLI protocol FSM events, one per state transition.\n *\n * Each event maps to exactly one target state via EVENT_TO_TARGET.\n */")

insert_jsdoc("cli/state_machine.ts", "export type CliEvent =",
    "/**\n * Union type of all valid CLI protocol events. */")

insert_jsdoc("cli/state_machine.ts", "export const CliState = {",
    "/**\n * Runtime string constants for CLI states, enabling CliState.FOO access patterns.\n *\n * Satisfies Record<string, CliState> for type-safe enum-like usage without TypeScript enums.\n */")

insert_jsdoc("cli/state_machine.ts", "export const CliEvent = {",
    "/**\n * Runtime string constants for CLI events, enabling CliEvent.FOO access patterns.\n *\n * Satisfies Record<string, CliEvent> for type-safe enum-like usage without TypeScript enums.\n */")

insert_jsdoc("cli/state_machine.ts", "export const legalTransitions",
    "/**\n * Legal state transitions in the CLI protocol FSM.\n *\n * Maps each source state to the set of valid target states. Any transition not\n * in this map is treated as PROTOCOL_DEVIATION_CRITICAL (fail-closed).\n */")

insert_jsdoc("cli/state_machine.ts", "export type TransitionOk",
    "/**\n * Successful FSM transition result containing the next state. */")

insert_jsdoc("cli/state_machine.ts", "export type TransitionFail",
    "/**\n * Failed FSM transition result with deviation reason and state context. */")

insert_jsdoc("cli/state_machine.ts", "export type TransitionResult",
    "/**\n * Discriminated union of FSM transition results (TransitionOk or TransitionFail). */")

insert_jsdoc("cli/state_machine.ts", "export function isCliState",
    "/**\n * Type guard: checks whether a value is a valid CliState.\n *\n * @param value - Arbitrary value to test.\n * @returns true if the value is a string matching one of the CLI_STATES entries.\n */")

insert_jsdoc("cli/state_machine.ts", "export function isCliEvent",
    "/**\n * Type guard: checks whether a value is a valid CliEvent.\n *\n * @param value - Arbitrary value to test.\n * @returns true if the value is a string matching one of the CLI_EVENTS entries.\n */")

insert_jsdoc("cli/state_machine.ts", "export function transition",
    "/**\n * Attempts a state transition in the CLI protocol FSM.\n *\n * Fail-closed: unrecognized events or illegal transitions return\n * PROTOCOL_DEVIATION_CRITICAL rather than silently succeeding.\n * @param current - The current FSM state.\n * @param event - The event to fire.\n * @returns TransitionOk with the next state, or TransitionFail with reason.\n */")

# --- cli/status_dump.ts ---
insert_jsdoc("cli/status_dump.ts", "export const TEST_GLOBS",
    "/**\n * Test file globs for node --test, synchronized with package.json scripts.test.\n *\n * Must stay in sync with CI test configuration. The CLI layer reuses this\n * constant when spawning test count and coverage processes.\n */")

insert_jsdoc("cli/status_dump.ts", "export interface PendingField",
    "/**\n * A pending field marker for phase B data not yet collected.\n *\n * Used when test counts or coverage metrics are unavailable (e.g. spawn failed).\n */")

insert_jsdoc("cli/status_dump.ts", "export interface TestCountResult",
    "/**\n * Parsed test count result from node --test TAP output.\n *\n * Contains total, passed, failed, and optionally skipped test counts.\n */")

insert_jsdoc("cli/status_dump.ts", "export interface ChainHeadStatus",
    "/**\n * Evidence chain head verification status.\n *\n * Includes integrity check result, verified count, and optional tamper detection\n * for both evidence payloads and call record payloads.\n */")

insert_jsdoc("cli/status_dump.ts", "export interface StatusDump",
    "/**\n * Complete project status dump collected by `far status`.\n *\n * Aggregates phase A (cheap file/git metrics), phase B (test counts),\n * and phase C (coverage, suite integrity) data into a single SSOT structure.\n */")

insert_jsdoc("cli/status_dump.ts", "export type StatusLabel",
    "/**\n * Capability status labels used in the FarStatusJson capabilities section.\n *\n * Ranges from IMPLEMENTED_VERIFIED through ROADMAP and RETIRED.\n */")

insert_jsdoc("cli/status_dump.ts", "export interface FarStatusJson",
    "/**\n * Machine-readable JSON status document for CI consumption.\n *\n * Includes project metadata, git info, platform details, test results,\n * coverage metrics, golden vector counts, capability statuses, and warnings.\n */")

insert_jsdoc("cli/status_dump.ts", "export interface CollectStatusDumpOptions",
    "/**\n * Options for collecting the status dump.\n *\n * CLI layers inject chain head verification, test counts, and coverage;\n * omitted fields default to pending status.\n */")

insert_jsdoc("cli/status_dump.ts", "export function collectStatusDump",
    "/**\n * Collects the complete project status dump.\n *\n * Gathers git SHA, file counts, migrations, docs, golden vectors, chain head,\n * test counts, and coverage into a single StatusDump.\n * @param options - Optional injected data from CLI layers (chainHead, testCount, coverage).\n * @returns Complete StatusDump with all phase A/B/C fields populated or pending.\n */")

insert_jsdoc("cli/status_dump.ts", "export function toStatusJson",
    "/**\n * Converts a StatusDump into the machine-readable FarStatusJson format.\n *\n * Adds git branch/dirty status, platform info, and capability labels for CI.\n * @param dump - The collected status dump.\n * @param generatedAt - ISO 8601 timestamp (defaults to now).\n * @returns Machine-readable FarStatusJson for JSON output.\n */")

# ============================================================
# DEMO_SEEDS
# ============================================================

# --- helpers.ts ---
insert_jsdoc("demo_seeds/helpers.ts", "export function openDb",
    "/**\n * Opens an in-memory SQLite database for demo seed execution.\n *\n * @returns A better-sqlite3 Database instance. Caller is responsible for closing.\n */")

insert_jsdoc("demo_seeds/helpers.ts", "export function fixtureResponse",
    "/**\n * Creates a fixture LLM gateway that returns deterministic canned responses.\n *\n * Used by all demo seeds to run the 6-stage agent loop without real LLM API calls.\n * @returns A sequential gateway that replays fixture responses in order.\n */")

# --- a4_planetary_orbit_decay.ts (DemoSeedResult) ---
insert_jsdoc("demo_seeds/a4_planetary_orbit_decay.ts", "export interface DemoSeedResult",
    "/**\n * Unified output contract for every demo seed run.\n *\n * Contains all artifacts produced by a 6-stage agent loop: raw input, source card,\n * loop state, verdict node, reproducibility hash, evidence graph subtree,\n * chain verification result, research paper, and the database instance.\n * The caller is responsible for closing db.\n */")

# --- a11_smbh_merger.ts ---
insert_jsdoc("demo_seeds/a11_smbh_merger.ts", "export const A11_RAW_INPUT",
    "/**\n * Raw input text for the Supermassive Black Hole Merger demo seed.\n *\n * Scientific problem statement used as the initial claim for the 6-stage agent loop.\n */")
insert_jsdoc("demo_seeds/a11_smbh_merger.ts", "export const A11_SOURCE_CARD",
    "/**\n * Source card (evidence provenance) for the SMBH Merger demo seed.\n *\n * Identifies the primary literature source with DOI, title, evidence level, and stability.\n */")
insert_jsdoc("demo_seeds/a11_smbh_merger.ts", "export async function runA11Seed",
    "/**\n * Executes the SMBH Merger demo seed through the full 6-stage agent loop.\n *\n * Runs understanding, integration, hypothesis, evidence, planning, and feedback stages\n * with fixture-backed offline replay. Returns all artifacts per DemoSeedResult.\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- a16_pulsar_p0.ts ---
insert_jsdoc("demo_seeds/a16_pulsar_p0.ts", "export const A16_RAW_INPUT",
    "/**\n * Raw input text for the Pulsar P0 Period Derivative Anomaly demo seed.\n *\n * Scientific problem statement used as the initial claim for the 6-stage agent loop.\n */")
insert_jsdoc("demo_seeds/a16_pulsar_p0.ts", "export const A16_SOURCE_CARD",
    "/**\n * Source card (evidence provenance) for the Pulsar P0 demo seed.\n *\n * Identifies the ATNF Pulsar Catalogue as primary data source.\n */")
insert_jsdoc("demo_seeds/a16_pulsar_p0.ts", "export async function runA16Seed",
    "/**\n * Executes the Pulsar P0 demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- a2_dark_energy.ts ---
insert_jsdoc("demo_seeds/a2_dark_energy.ts", "export const A2_RAW_INPUT",
    "/**\n * Raw input text for the Dark Energy Equation of State demo seed.\n *\n * Scientific problem statement on cosmological constant vs dynamical dark energy.\n */")
insert_jsdoc("demo_seeds/a2_dark_energy.ts", "export const A2_SOURCE_CARD",
    "/**\n * Source card for the Dark Energy demo seed (Planck 2018 CMB constraints on w).\n */")
insert_jsdoc("demo_seeds/a2_dark_energy.ts", "export async function runA2Seed",
    "/**\n * Executes the Dark Energy demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- a4_planetary_orbit_decay.ts ---
insert_jsdoc("demo_seeds/a4_planetary_orbit_decay.ts", "export const A4_RAW_INPUT",
    "/**\n * Raw input text for the Planetary Orbit Decay demo seed.\n *\n * Scientific problem statement on Hot Jupiter orbital period decay.\n */")
insert_jsdoc("demo_seeds/a4_planetary_orbit_decay.ts", "export const A4_SOURCE_CARD",
    "/**\n * Source card for the Planetary Orbit Decay demo seed.\n */")

# --- a8_black_hole_information.ts ---
insert_jsdoc("demo_seeds/a8_black_hole_information.ts", "export const A8_RAW_INPUT",
    "/**\n * Raw input text for the Black Hole Information Paradox demo seed.\n *\n * Scientific problem statement on Hawking radiation, Page curve, and island formula.\n */")
insert_jsdoc("demo_seeds/a8_black_hole_information.ts", "export const A8_SOURCE_CARD",
    "/**\n * Source card for the Black Hole Information Paradox demo seed.\n */")
insert_jsdoc("demo_seeds/a8_black_hole_information.ts", "export async function runA8Seed",
    "/**\n * Executes the Black Hole Information Paradox demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- b2_ipsc_reprogramming.ts ---
insert_jsdoc("demo_seeds/b2_ipsc_reprogramming.ts", "export const B2_RAW_INPUT",
    "/**\n * Raw input text for the iPSC Reprogramming demo seed.\n *\n * Scientific problem statement on Yamanaka 4-factor somatic cell reprogramming.\n */")
insert_jsdoc("demo_seeds/b2_ipsc_reprogramming.ts", "export const B2_SOURCE_CARD",
    "/**\n * Source card for the iPSC Reprogramming demo seed.\n */")
insert_jsdoc("demo_seeds/b2_ipsc_reprogramming.ts", "export async function runB2Seed",
    "/**\n * Executes the iPSC Reprogramming demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- b3_crispr_offtarget.ts ---
insert_jsdoc("demo_seeds/b3_crispr_offtarget.ts", "export const B3_RAW_INPUT",
    "/**\n * Raw input text for the CRISPR-Cas9 Off-target Effects demo seed.\n *\n * Scientific problem statement on genome editing precision and off-target rates.\n */")
insert_jsdoc("demo_seeds/b3_crispr_offtarget.ts", "export const B3_SOURCE_CARD",
    "/**\n * Source card for the CRISPR Off-target Effects demo seed.\n */")
insert_jsdoc("demo_seeds/b3_crispr_offtarget.ts", "export async function runB3Seed",
    "/**\n * Executes the CRISPR Off-target Effects demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- b5_microbiome_depression.ts ---
insert_jsdoc("demo_seeds/b5_microbiome_depression.ts", "export const B5_RAW_INPUT",
    "/**\n * Raw input text for the Microbiome-Gut-Brain Axis demo seed.\n *\n * Scientific problem statement on FMT for depression treatment.\n */")
insert_jsdoc("demo_seeds/b5_microbiome_depression.ts", "export const B5_SOURCE_CARD",
    "/**\n * Source card for the Microbiome-Depression demo seed.\n */")
insert_jsdoc("demo_seeds/b5_microbiome_depression.ts", "export async function runB5Seed",
    "/**\n * Executes the Microbiome-Depression demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- b7_protein_folding.ts ---
insert_jsdoc("demo_seeds/b7_protein_folding.ts", "export const B7_RAW_INPUT",
    "/**\n * Raw input text for the Protein Structure Prediction demo seed.\n *\n * Scientific problem statement on CASP15 free-modelling TM-score accuracy.\n */")
insert_jsdoc("demo_seeds/b7_protein_folding.ts", "export const B7_SOURCE_CARD",
    "/**\n * Source card for the Protein Folding demo seed.\n */")

# --- c10_nisq_quantum_advantage.ts ---
insert_jsdoc("demo_seeds/c10_nisq_quantum_advantage.ts", "export const C10_RAW_INPUT",
    "/**\n * Raw input text for the NISQ Quantum Advantage demo seed.\n *\n * Scientific problem statement on Google Sycamore vs classical computing.\n */")
insert_jsdoc("demo_seeds/c10_nisq_quantum_advantage.ts", "export const C10_SOURCE_CARD",
    "/**\n * Source card for the NISQ Quantum Advantage demo seed.\n */")
insert_jsdoc("demo_seeds/c10_nisq_quantum_advantage.ts", "export async function runC10Seed",
    "/**\n * Executes the NISQ Quantum Advantage demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- c2_co2_reduction.ts ---
insert_jsdoc("demo_seeds/c2_co2_reduction.ts", "export const C2_RAW_INPUT",
    "/**\n * Raw input text for the CO2 Electrochemical Reduction demo seed.\n *\n * Scientific problem statement on Cu-catalyzed CO2 conversion to ethylene.\n */")
insert_jsdoc("demo_seeds/c2_co2_reduction.ts", "export const C2_SOURCE_CARD",
    "/**\n * Source card for the CO2 Reduction demo seed.\n */")
insert_jsdoc("demo_seeds/c2_co2_reduction.ts", "export async function runC2Seed",
    "/**\n * Executes the CO2 Reduction demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- c3_catalyst_activity.ts ---
insert_jsdoc("demo_seeds/c3_catalyst_activity.ts", "export const C3_RAW_INPUT",
    "/**\n * Raw input text for the Catalyst Turnover Number Prediction demo seed.\n *\n * Scientific problem statement on DFT+ML TON prediction accuracy.\n */")
insert_jsdoc("demo_seeds/c3_catalyst_activity.ts", "export const C3_SOURCE_CARD",
    "/**\n * Source card for the Catalyst Activity demo seed.\n */")

# --- c8_artificial_photosynthesis.ts ---
insert_jsdoc("demo_seeds/c8_artificial_photosynthesis.ts", "export const C8_RAW_INPUT",
    "/**\n * Raw input text for the Artificial Photosynthesis Efficiency demo seed.\n *\n * Scientific problem statement on PEC solar-to-hydrogen efficiency.\n */")
insert_jsdoc("demo_seeds/c8_artificial_photosynthesis.ts", "export const C8_SOURCE_CARD",
    "/**\n * Source card for the Artificial Photosynthesis demo seed.\n */")
insert_jsdoc("demo_seeds/c8_artificial_photosynthesis.ts", "export async function runC8Seed",
    "/**\n * Executes the Artificial Photosynthesis demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- d9_dark_matter_detection.ts ---
insert_jsdoc("demo_seeds/d9_dark_matter_detection.ts", "export const D9_RAW_INPUT",
    "/**\n * Raw input text for the Dark Matter Direct Detection demo seed.\n *\n * Scientific problem statement on WIMP-nucleon scattering detection.\n */")
insert_jsdoc("demo_seeds/d9_dark_matter_detection.ts", "export const D9_SOURCE_CARD",
    "/**\n * Source card for the Dark Matter Detection demo seed.\n */")

# --- e2_carbon_flux.ts ---
insert_jsdoc("demo_seeds/e2_carbon_flux.ts", "export const E2_RAW_INPUT",
    "/**\n * Raw input text for the Carbon Flux Estimation demo seed.\n *\n * Scientific problem statement on eddy covariance vs remote sensing NEE/GPP estimates.\n */")
insert_jsdoc("demo_seeds/e2_carbon_flux.ts", "export const E2_SOURCE_CARD",
    "/**\n * Source card for the Carbon Flux demo seed.\n */")
insert_jsdoc("demo_seeds/e2_carbon_flux.ts", "export async function runE2Seed",
    "/**\n * Executes the Carbon Flux demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- e3_global_carbon_sink.ts ---
insert_jsdoc("demo_seeds/e3_global_carbon_sink.ts", "export const E3_RAW_INPUT",
    "/**\n * Raw input text for the Global Carbon Sink Distribution demo seed.\n *\n * Scientific problem statement on land vs ocean carbon absorption partitioning.\n */")
insert_jsdoc("demo_seeds/e3_global_carbon_sink.ts", "export const E3_SOURCE_CARD",
    "/**\n * Source card for the Global Carbon Sink demo seed.\n */")
insert_jsdoc("demo_seeds/e3_global_carbon_sink.ts", "export async function runE3Seed",
    "/**\n * Executes the Global Carbon Sink demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- e5_climate_sensitivity.ts ---
insert_jsdoc("demo_seeds/e5_climate_sensitivity.ts", "export const E5_RAW_INPUT",
    "/**\n * Raw input text for the Equilibrium Climate Sensitivity demo seed.\n *\n * Scientific problem statement on ECS low-sensitivity hypothesis falsification.\n */")
insert_jsdoc("demo_seeds/e5_climate_sensitivity.ts", "export const E5_SOURCE_CARD",
    "/**\n * Source card for the Climate Sensitivity demo seed.\n */")
insert_jsdoc("demo_seeds/e5_climate_sensitivity.ts", "export async function runE5Seed",
    "/**\n * Executes the Climate Sensitivity demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- e8_ocean_acidification_coral.ts ---
insert_jsdoc("demo_seeds/e8_ocean_acidification_coral.ts", "export const E8_RAW_INPUT",
    "/**\n * Raw input text for the Ocean Acidification and Coral Calcification demo seed.\n *\n * Scientific problem statement on pH decline and coral calcification rate impact.\n */")
insert_jsdoc("demo_seeds/e8_ocean_acidification_coral.ts", "export const E8_SOURCE_CARD",
    "/**\n * Source card for the Ocean Acidification Coral demo seed.\n */")
insert_jsdoc("demo_seeds/e8_ocean_acidification_coral.ts", "export async function runE8Seed",
    "/**\n * Executes the Ocean Acidification Coral demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- g2_universal_flu_vaccine.ts ---
insert_jsdoc("demo_seeds/g2_universal_flu_vaccine.ts", "export const G2_RAW_INPUT",
    "/**\n * Raw input text for the Universal Influenza Vaccine demo seed.\n *\n * Scientific problem statement on broad-spectrum flu protection assessment.\n */")
insert_jsdoc("demo_seeds/g2_universal_flu_vaccine.ts", "export const G2_SOURCE_CARD",
    "/**\n * Source card for the Universal Flu Vaccine demo seed.\n */")
insert_jsdoc("demo_seeds/g2_universal_flu_vaccine.ts", "export async function runG2Seed",
    "/**\n * Executes the Universal Flu Vaccine demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- g5_seismic_precursor.ts ---
insert_jsdoc("demo_seeds/g5_seismic_precursor.ts", "export const G5_RAW_INPUT",
    "/**\n * Raw input text for the Pre-seismic EM Precursor Prediction demo seed.\n *\n * Scientific problem statement on electromagnetic anomaly-based earthquake prediction.\n */")
insert_jsdoc("demo_seeds/g5_seismic_precursor.ts", "export const G5_SOURCE_CARD",
    "/**\n * Source card for the Seismic Precursor demo seed.\n */")

# --- h1_rna_world.ts ---
insert_jsdoc("demo_seeds/h1_rna_world.ts", "export const H1_RAW_INPUT",
    "/**\n * Raw input text for the RNA World Hypothesis demo seed.\n *\n * Scientific problem statement on self-replicating ribozyme falsifiability.\n */")
insert_jsdoc("demo_seeds/h1_rna_world.ts", "export const H1_SOURCE_CARD",
    "/**\n * Source card for the RNA World demo seed.\n */")
insert_jsdoc("demo_seeds/h1_rna_world.ts", "export async function runH1Seed",
    "/**\n * Executes the RNA World demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- h3_homochirality.ts ---
insert_jsdoc("demo_seeds/h3_homochirality.ts", "export const H3_RAW_INPUT",
    "/**\n * Raw input text for the Homochirality Origin of Life demo seed.\n *\n * Scientific problem statement on L-amino acid / D-sugar exclusivity origins.\n */")
insert_jsdoc("demo_seeds/h3_homochirality.ts", "export const H3_SOURCE_CARD",
    "/**\n * Source card for the Homochirality demo seed.\n */")
insert_jsdoc("demo_seeds/h3_homochirality.ts", "export async function runH3Seed",
    "/**\n * Executes the Homochirality demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- m2_sglt2_heart_failure.ts ---
insert_jsdoc("demo_seeds/m2_sglt2_heart_failure.ts", "export const M2_RAW_INPUT",
    "/**\n * Raw input text for the SGLT2 Inhibitor Heart Failure Benefit demo seed.\n *\n * Scientific problem statement on cardiovascular outcome reduction in T2D patients.\n */")
insert_jsdoc("demo_seeds/m2_sglt2_heart_failure.ts", "export const M2_SOURCE_CARD",
    "/**\n * Source card for the SGLT2 Heart Failure demo seed.\n */")

# --- m3_telomere_aging.ts ---
insert_jsdoc("demo_seeds/m3_telomere_aging.ts", "export const M3_RAW_INPUT",
    "/**\n * Raw input text for the Telomere Shortening and Aging demo seed.\n *\n * Scientific problem statement on telomere attrition as primary aging driver.\n */")
insert_jsdoc("demo_seeds/m3_telomere_aging.ts", "export const M3_SOURCE_CARD",
    "/**\n * Source card for the Telomere Aging demo seed.\n */")
insert_jsdoc("demo_seeds/m3_telomere_aging.ts", "export async function runM3Seed",
    "/**\n * Executes the Telomere Aging demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- m7_alzheimer_amyloid.ts ---
insert_jsdoc("demo_seeds/m7_alzheimer_amyloid.ts", "export const M7_RAW_INPUT",
    "/**\n * Raw input text for the Alzheimer Amyloid-beta Hypothesis demo seed.\n *\n * Scientific problem statement on anti-amyloid immunotherapy efficacy.\n */")
insert_jsdoc("demo_seeds/m7_alzheimer_amyloid.ts", "export const M7_SOURCE_CARD",
    "/**\n * Source card for the Alzheimer Amyloid demo seed.\n */")
insert_jsdoc("demo_seeds/m7_alzheimer_amyloid.ts", "export async function runM7Seed",
    "/**\n * Executes the Alzheimer Amyloid demo seed through the full 6-stage agent loop.\n *\n * @returns Complete DemoSeedResult. Caller must close result.db.\n */")

# --- n3_neurodegeneration_aggregation.ts ---
insert_jsdoc("demo_seeds/n3_neurodegeneration_aggregation.ts", "export const N3_RAW_INPUT",
    "/**\n * Raw input text for the Neurodegenerative Protein Aggregation demo seed.\n *\n * Scientific problem statement on alpha-synuclein as sole PD driver.\n */")
insert_jsdoc("demo_seeds/n3_neurodegeneration_aggregation.ts", "export const N3_SOURCE_CARD",
    "/**\n * Source card for the Neurodegeneration Aggregation demo seed.\n */")

# --- p1_room_temp_superconductor.ts ---
insert_jsdoc("demo_seeds/p1_room_temp_superconductor.ts", "export const P1_RAW_INPUT",
    "/**\n * Raw input text for the Room-Temperature Superconductivity demo seed.\n *\n * Scientific problem statement on LK-99 replication and claims assessment.\n */")
insert_jsdoc("demo_seeds/p1_room_temp_superconductor.ts", "export const P1_SOURCE_CARD",
    "/**\n * Source card for the Room-Temperature Superconductor demo seed.\n */")

# --- p3_arrow_of_time.ts ---
insert_jsdoc("demo_seeds/p3_arrow_of_time.ts", "export const P3_RAW_INPUT",
    "/**\n * Raw input text for the Arrow of Time and Second Law demo seed.\n *\n * Scientific problem statement on macroscopic irreversibility explanations.\n */")
insert_jsdoc("demo_seeds/p3_arrow_of_time.ts", "export const P3_SOURCE_CARD",
    "/**\n * Source card for the Arrow of Time demo seed.\n */")

# --- p6_quantum_biology.ts ---
insert_jsdoc("demo_seeds/p6_quantum_biology.ts", "export const P6_RAW_INPUT",
    "/**\n * Raw input text for the Quantum Coherence in Biology demo seed.\n *\n * Scientific problem statement on room-temperature quantum effects in biological systems.\n */")
insert_jsdoc("demo_seeds/p6_quantum_biology.ts", "export const P6_SOURCE_CARD",
    "/**\n * Source card for the Quantum Biology demo seed.\n */")

# --- t1_consciousness_ncc.ts ---
insert_jsdoc("demo_seeds/t1_consciousness_ncc.ts", "export const T1_RAW_INPUT",
    "/**\n * Raw input text for the Neural Correlates of Consciousness demo seed.\n *\n * Scientific problem statement on IIT vs GNWT adversarial collaboration.\n */")
insert_jsdoc("demo_seeds/t1_consciousness_ncc.ts", "export const T1_SOURCE_CARD",
    "/**\n * Source card for the Consciousness NCC demo seed.\n */")

# ============================================================
# SUMMARY
# ============================================================
print(f"\nTotal JSDoc comments inserted: {count}")
