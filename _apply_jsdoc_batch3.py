#!/usr/bin/env python3
"""Apply all 136 JSDoc comments for batch 3 — self-contained (no shell escaping issues)."""
import os
import sys

ROOT = r"C:\Users\RichardYuan\Desktop\FAR-Lab"

def apply_jsdoc(filepath, search_line, jsdoc_text):
    """Insert jsdoc_text before search_line in the file at ROOT/filepath."""
    full_path = os.path.join(ROOT, filepath.replace("/", os.sep))
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if search_line not in content:
        print(f"  NOT_FOUND: {search_line[:80]}", file=sys.stderr)
        return False
    
    idx = content.find(search_line)
    before = content[:idx].rstrip("\r\n")
    if before.endswith("*/"):
        return True  # already has JSDoc
    
    content = before + "\n" + jsdoc_text + "\n" + content[idx:]
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    return True

count = 0
total = 0

def C(label, filepath, search, jsdoc):
    global count, total
    total += 1
    if apply_jsdoc(filepath, search, jsdoc):
        count += 1
        print(f"  [{count}/{total}] {label}")
    else:
        print(f"  [FAIL] {label}", file=sys.stderr)

# All 136 entries follow — same content as before
# math/autoformalizer.ts (2)
C("autoformalizer:AutoformalizeInput", "src/math/autoformalizer.ts",
    "export interface AutoformalizeInput {",
    "/** Input for the autoformalizer: a natural-language math claim plus metadata\n * describing which backends must verify the resulting formal expression. */")
C("autoformalizer:Autoformalizer", "src/math/autoformalizer.ts",
    "export interface Autoformalizer {",
    "/** Contract for converting natural-language math claims into\n * machine-checkable FormalExpression objects. */")

# math/cas_backend.ts (1)
C("cas_backend:SymPyCasBackendOptions", "src/math/cas_backend.ts",
    "export interface SymPyCasBackendOptions {",
    "/** Configuration options for the SymPy CAS (Computer Algebra System) backend. */")

# math/competition_math_adapter.ts (3)
C("competition_math:Options", "src/math/competition_math_adapter.ts",
    "export interface CompetitionMathAdapterOptions {",
    "/** Options for constructing a CompetitionMathAutoformalizer.\n * The competition model snapshot MUST be injected by the caller (red-line #2). */")
C("competition_math:Class", "src/math/competition_math_adapter.ts",
    "export class CompetitionMathAutoformalizer implements Autoformalizer {",
    "/** Model-backed autoformalizer using a competition Qwen-Math profile.\n * Wraps the core-neutral rule-based formalizer, falling back on any\n * gateway or parsing failure (honest degradation). */")
C("competition_math:Factory", "src/math/competition_math_adapter.ts",
    "export function createCompetitionMathAutoformalizer(",
    "/** Factory: create a competition math autoformalizer.\n * @param options Configuration including the competition model snapshot.\n * @returns A new CompetitionMathAutoformalizer instance.\n * @throws Error if competitionModelSnapshot is empty. */")

# math/dafny_backend.ts (2)
C("dafny:Options", "src/math/dafny_backend.ts",
    "export interface DafnyBackendOptions {",
    "/** Configuration options for the Dafny formal verification backend. */")
C("dafny:Class", "src/math/dafny_backend.ts",
    "export class DafnyBackend implements MathBackend {",
    "/** Dafny formal verification backend (spec 38 S3.4).\n * Spawns the dafny verify CLI on a temp .dfy file. Degrades to\n * outcome='unknown' when the dafny binary is not on PATH. */")

# math/errors.ts (1)
C("errors:Base", "src/math/errors.ts",
    "export class MathVerificationError extends Error {",
    "/** Base error for the math verification layer. All math-specific errors\n * extend this class. */")

# math/evidence_sink.ts (5)
C("evsink:persistMathClaim", "src/math/evidence_sink.ts",
    "export function persistMathClaim(",
    "/** Persist a MathClaim to the math_claims table.\n * @param db SQLite database connection with the math schema migrated.\n * @param claim The claim to insert. */")
C("evsink:getMathClaim", "src/math/evidence_sink.ts",
    "export function getMathClaim(db: Database.Database, claimId: string): MathClaim | null {",
    "/** Retrieve a MathClaim by its ID.\n * @param db SQLite database connection.\n * @param claimId The unique claim identifier.\n * @returns The claim, or null if not found. */")
C("evsink:persistVerification", "src/math/evidence_sink.ts",
    "export function persistVerification(",
    "/** Persist a MathVerificationRecord to the math_verifications table.\n * @param db SQLite database connection.\n * @param record The verification result to insert. */")
C("evsink:getVerificationsForClaim", "src/math/evidence_sink.ts",
    "export function getVerificationsForClaim(",
    "/** Retrieve all verification records for a claim, ordered by verified_at ascending.\n * @param db SQLite database connection.\n * @param claimId The claim whose verifications to fetch.\n * @returns Array of verification records (may be empty). */")
C("evsink:AppendArgs", "src/math/evidence_sink.ts",
    "export interface AppendVerificationEvidenceArgs {",
    "/** Arguments for appending a verification result to the shared evidence_log.\n * Requires a callRecordSeq FK linking to the LLM-gateway call flow. */")

# math/formal_backend.ts (2)
C("formal:Options", "src/math/formal_backend.ts",
    "export interface Lean4FormalBackendOptions {",
    "/** Configuration options for the Lean 4 formal verification backend. */")
C("formal:Class", "src/math/formal_backend.ts",
    "export class Lean4FormalBackend implements MathBackend {",
    "/** Lean 4 formal verification backend (spec 38 S3.3).\n * Spawns the lean compiler on a temp .lean file. Degrades to\n * outcome='unknown' when the lean binary is not on PATH. */")

# math/honesty_wall.ts (3)
C("hwall:Const", "src/math/honesty_wall.ts",
    "export const MATH_VERIFICATION_BOUNDARY = 'math_verification_boundary';",
    "/** Boundary identifier for the math verification honesty wall. */")
C("hwall:Input", "src/math/honesty_wall.ts",
    "export interface HonestyWallInput {",
    "/** Input to the math verification honesty wall renderer. */")
C("hwall:Render", "src/math/honesty_wall.ts",
    "export interface HonestyWallRender {",
    "/** Rendered output of the math verification honesty wall.\n * Includes achieved level, gate status, and verification details. */")

# math/math_claim.ts (29)
C("mc:SYMBOLIC_KINDS", "src/math/math_claim.ts",
    "export const SYMBOLIC_MATH_CLAIM_KINDS = [",
    "/** Eight symbolic math claim kinds (spec 38 S1): algebraic_identity,\n * equation_solution, calculus, inequality, dimensional_consistency,\n * matrix_identity, statistic_identity, theorem. */")
C("mc:NUMERICAL_KINDS", "src/math/math_claim.ts",
    "export const NUMERICAL_MATH_CLAIM_KINDS = [",
    "/** Four numerical math claim kinds (spec 38 S1): numerical_reproduction,\n * statistical_inference, optimization_convergence, validated_numerics. */")
C("mc:ALL_KINDS", "src/math/math_claim.ts",
    "export const MATH_CLAIM_KINDS = [",
    "/** All 12 math claim kinds (8 symbolic + 4 numerical), authoritative per spec 38 S1. */")
C("mc:SymKindT", "src/math/math_claim.ts",
    "export type SymbolicMathClaimKind = (typeof SYMBOLIC_MATH_CLAIM_KINDS)[number];",
    "/** Union of the 8 symbolic math claim kind string literals. */")
C("mc:NumKindT", "src/math/math_claim.ts",
    "export type NumericalMathClaimKind = (typeof NUMERICAL_MATH_CLAIM_KINDS)[number];",
    "/** Union of the 4 numerical math claim kind string literals. */")
C("mc:KindT", "src/math/math_claim.ts",
    "export type MathClaimKind = (typeof MATH_CLAIM_KINDS)[number];",
    "/** Union of all 12 math claim kind string literals. */")
C("mc:isSymKind", "src/math/math_claim.ts",
    "export function isSymbolicKind(",
    "/** Type guard: whether a string is one of the 8 symbolic claim kinds.\n * @param kind String to test.\n * @returns True if kind is a valid SymbolicMathClaimKind. */")
C("mc:isNumKind", "src/math/math_claim.ts",
    "export function isNumericalKind(",
    "/** Type guard: whether a string is one of the 4 numerical claim kinds.\n * @param kind String to test.\n * @returns True if kind is a valid NumericalMathClaimKind. */")
C("mc:isKind", "src/math/math_claim.ts",
    "export function isMathClaimKind(",
    "/** Type guard: whether a string is a valid MathClaimKind.\n * @param value String to test.\n * @returns True if value is one of the 12 known claim kinds. */")
C("mc:VERIF_LEVELS", "src/math/math_claim.ts",
    "export const VERIFICATION_LEVELS = [",
    "/** Four verification levels (spec 38 S1): L1_cas, L2_smt, L3_formal, L4_human. */")
C("mc:VerifLevelT", "src/math/math_claim.ts",
    "export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];",
    "/** Union of the 4 verification level string literals. */")
C("mc:isVerifLevel", "src/math/math_claim.ts",
    "export function isVerificationLevel(",
    "/** Type guard: whether a string is a valid VerificationLevel.\n * @param value String to test.\n * @returns True if value is one of the 4 known levels. */")
C("mc:LEVEL_RANK", "src/math/math_claim.ts",
    "export const LEVEL_RANK: Readonly<Record<VerificationLevel, number>> = {",
    "/** Rank ordering of verification levels (spec S1.1): L1_cas=1 < L2_smt=2\n * < L3_formal=3 < L4_human=4. Used by meetsRequiredLevel and derivedAchievedLevel. */")
C("mc:VERIF_OUTCOMES", "src/math/math_claim.ts",
    "export const VERIFICATION_OUTCOMES = [",
    "/** Three verification outcomes (spec 38 S1): verified, refuted, unknown. */")
C("mc:VerifOutcomeT", "src/math/math_claim.ts",
    "export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];",
    "/** Union of the 3 verification outcome string literals. */")
C("mc:isVerifOutcome", "src/math/math_claim.ts",
    "export function isVerificationOutcome(",
    "/** Type guard: whether a string is a valid VerificationOutcome.\n * @param value String to test.\n * @returns True if value is verified, refuted, or unknown. */")
C("mc:BACKEND_KINDS", "src/math/math_claim.ts",
    "export const BACKEND_KINDS = [",
    "/** Five backend kinds (spec 38 S1.1): cas, smt, lean4, dafny, numerical. */")
C("mc:BackendKindT", "src/math/math_claim.ts",
    "export type BackendKind = (typeof BACKEND_KINDS)[number];",
    "/** Union of the 5 backend kind string literals. */")
C("mc:isBackendKind", "src/math/math_claim.ts",
    "export function isBackendKind(",
    "/** Type guard: whether a string is a valid BackendKind.\n * @param value String to test.\n * @returns True if value is one of the 5 known backend kinds. */")
C("mc:SYMB_BACKENDS", "src/math/math_claim.ts",
    "export const SYMBOLIC_BACKEND_KINDS = [",
    "/** Four symbolic backend kinds (spec S1.1): cas, smt, lean4, dafny.\n * These backends can return self-proving 'verified'.\n * 'numerical' is excluded (non-self-proving - spec S4.5). */")
C("mc:SymbBackendT", "src/math/math_claim.ts",
    "export type SymbolicBackendKind = (typeof SYMBOLIC_BACKEND_KINDS)[number];",
    "/** Union of the 4 symbolic backend kind string literals. */")
C("mc:isSymbBackend", "src/math/math_claim.ts",
    "export function isSymbolicBackendKind(",
    "/** Type guard: whether a backend kind is one of the 4 symbolic backends.\n * @param kind A BackendKind to test.\n * @returns True if the backend is cas, smt, lean4, or dafny. */")
C("mc:BACKEND_LEVEL", "src/math/math_claim.ts",
    "export const BACKEND_LEVEL: Readonly<Record<SymbolicBackendKind, VerificationLevel>> = {",
    "/** Maps each symbolic backend to the verification level it satisfies when\n * it returns outcome='verified' (spec S1.1). 'numerical' has no entry. */")
C("mc:FORMAL_TARGETS", "src/math/math_claim.ts",
    "export const FORMAL_TARGETS = [",
    "/** Three formal target languages (spec S1 / S5): lean4, dafny, smtlib. */")
C("mc:FormalT", "src/math/math_claim.ts",
    "export type FormalTarget = (typeof FORMAL_TARGETS)[number];",
    "/** Union of the 3 formal target language string literals. */")
C("mc:isFormalT", "src/math/math_claim.ts",
    "export function isFormalTarget(",
    "/** Type guard: whether a string is a valid FormalTarget.\n * @param value String to test.\n * @returns True if value is lean4, dafny, or smtlib. */")
C("mc:FormalExpr", "src/math/math_claim.ts",
    "export interface FormalExpression {",
    "/** Machine-checkable formalization of a math claim (spec S1).\n * target is the formal language; source carries the expression text;\n * formalizerId identifies which formalizer produced it. */")
C("mc:MathClaim", "src/math/math_claim.ts",
    "export interface MathClaim {",
    "/** Structured math claim (spec S1). Contains the natural-language claim,\n * its kind, formalization, required verification level, and linked verdict. */")
C("mc:MathVerifRec", "src/math/math_claim.ts",
    "export interface MathVerificationRecord {",
    "/** One backend verification run on one claim (spec S1.1).\n * Contains the backend identity, outcome, input hash, and timing. */")

# math/math_gate.ts (2)
C("mgate:Input", "src/math/math_gate.ts",
    "export interface MathGateInput {",
    "/** Input to the math gate evaluator. */")
C("mgate:Result", "src/math/math_gate.ts",
    "export interface MathGateResult {",
    "/** Result of the math gate evaluation. Indicates whether the claim can be\n * confirmed given the current math verification state. */")

# math/math_verifier.ts (2)
C("mverif:Options", "src/math/math_verifier.ts",
    "export interface MathVerifierOptions {",
    "/** Options for constructing a MathVerifier. Allows injecting custom\n * backend implementations for testing or alternative configurations. */")
C("mverif:Class", "src/math/math_verifier.ts",
    "export class MathVerifier {",
    "/** Routes a MathClaim to the appropriate backend based on claimKind domain\n * and requiredLevel (spec 38 S4). See module header for routing table. */")

# math/numerical_backend.ts (2)
C("num:Bound", "src/math/numerical_backend.ts",
    "export interface NumericalBound {",
    "/** Numerical bound descriptor: a [min, max] range with sample count and\n * human-readable description. Always present in numerical verification output. */")
C("num:Class", "src/math/numerical_backend.ts",
    "export class NumericalBackend implements MathBackend {",
    "/** Numerical verification backend (spec 38 S3.5). ALWAYS returns\n * outcome='unknown' (non-self-proving invariant - spec S4.5).\n * Pure TypeScript, no external dependencies - always available. */")

# math/premise_search.ts (4)
C("ps:SourceT", "src/math/premise_search.ts",
    "export type PremiseSource = 'mathlib' | 'local_verified_claims';",
    "/** Origin of a premise: from a mathlib library or from locally verified claims. */")
C("ps:Premise", "src/math/premise_search.ts",
    "export interface Premise {",
    "/** A single premise (theorem/lemma) relevant to a formal proof attempt. */")
C("ps:Input", "src/math/premise_search.ts",
    "export interface PremiseSearchInput {",
    "/** Input for premise search. Contains the query, local claims fallback,\n * and a mandatory source anchor for auditability. */")
C("ps:Result", "src/math/premise_search.ts",
    "export interface PremiseSearchResult {",
    "/** Result of a premise search: the found premises, their source,\n * and whether mathlib was available. */")

# math/smt_backend.ts (2)
C("smt:Options", "src/math/smt_backend.ts",
    "export interface Z3SmtBackendOptions {",
    "/** Configuration options for the Z3 SMT backend. */")
C("smt:Class", "src/math/smt_backend.ts",
    "export class Z3SmtBackend implements MathBackend {",
    "/** Z3 SMT-LIB backend (spec 38 S3.2). Supports both CLI z3 -in and Python\n * z3-solver modes. Degrades to outcome='unknown' when Z3 is unavailable. */")

# science_harness/adapters/science_check_to_fec.ts (1)
C("sc2fec:Projection", "src/science_harness/adapters/science_check_to_fec.ts",
    "export interface ScienceCheckFecProjection {",
    "/** Projection of a ScienceCheck into FEC FalsificationSpec + ThresholdSpec.\n * Handles the 5-value to 3-value threshold operator mapping (lossy but honest). */")

# science_harness/anti_theater_input.ts (2)
C("ati:Args", "src/science_harness/anti_theater_input.ts",
    "export interface AntiTheaterPipelineInputArgs {",
    "/** Arguments for building a unified AntiTheaterLintInput from pipeline\n * constants (shared by hero_a, c_astro, seed_cherry pipelines). */")
C("ati:Builder", "src/science_harness/anti_theater_input.ts",
    "export function buildAntiTheaterPipelineInput(",
    "/** Construct a unified AntiTheaterLintInput from pipeline-specific constants.\n * Enforces anti-theater red lines: declaredSeeds and runRegistrySeeds are REQUIRED.\n * @param args Pipeline constants and metadata.\n * @returns A fully-populated AntiTheaterLintInput. */")

# science_harness/c_astro_pipeline.ts (17)
C("ca:ID", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_CLAIM_ID = 'C-ASTRO-0001';",
    "/** C-ASTRO claim identifier (preregistered before unblinding). */")
C("ca:Key", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_METRIC_KEY = 'transit_depth_significance';",
    "/** Primary metric key for C-ASTRO transit depth significance measurement. */")
C("ca:TIC", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_TIC_ID = 'TIC 268644982';",
    "/** TESS Input Catalog ID for the C-ASTRO target star. */")
C("ca:Sector", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_SECTOR = 14;",
    "/** TESS sector number for the C-ASTRO observation. */")
C("ca:Claim", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_PIPELINE_CLAIM =",
    "/** C-ASTRO pipeline claim text: TIC 268644982 shows a transit signal\n * consistent with a planet (period ~2.41d, depth ~0.8%). */")
C("ca:FalsSpec", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_FALSIFICATION_SPEC: FalsificationSpec = {",
    "/** C-ASTRO falsification specification: transit depth significance must be > 0. */")
C("ca:ThreshSpec", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_THRESHOLD_SPEC: ThresholdSpec = {",
    "/** C-ASTRO threshold specification: greater-than-zero semantics. */")
C("ca:Alpha", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_ALPHA = 0.05;",
    "/** C-ASTRO significance level alpha (0.05 = 5%). */")
C("ca:Conf", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_CONFIDENCE_LEVEL = 0.95;",
    "/** C-ASTRO confidence level for interval estimates (95%). */")
C("ca:Seed", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_SEED = 42;",
    "/** C-ASTRO fixed random seed (SR-2, anti-p-hacking). */")
C("ca:Frozen", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_FROZEN_AT = '2026-07-01T00:00:00.000Z';",
    "/** C-ASTRO preregistration freeze timestamp (ISO 8601). */")
C("ca:Anchor", "src/science_harness/c_astro_pipeline.ts",
    "export const C_ASTRO_SOURCE_ANCHOR: SourceAnchor = {",
    "/** C-ASTRO source anchor: reproducibility fingerprint for the BLS computation. */")
C("ca:BlsMetrics", "src/science_harness/c_astro_pipeline.ts",
    "export interface BlsMetrics {",
    "/** BLS (Box-fitting Least Squares) period search output metrics.\n * Contains transit parameters (period, depth, SNR) and in/out flux arrays. */")
C("ca:SandboxOut", "src/science_harness/c_astro_pipeline.ts",
    "export interface CAstroSandboxOutput {",
    "/** Result of running BLS computation in a venv sandbox:\n * the sandbox execution result plus parsed BLS metrics. */")
C("ca:Stats", "src/science_harness/c_astro_pipeline.ts",
    "export interface CAstroStatistics {",
    "/** Real two-sample statistics from C-ASTRO BLS in/out flux comparison.\n * Contains z-test, effect size, CI, adjusted p-value, and FEC StatisticalResult. */")
C("ca:DSrc", "src/science_harness/c_astro_pipeline.ts",
    "export type DatasetSource = 'online' | 'cached_fixture';",
    "/** Origin of the lightcurve dataset: online TESS fetch or cached synthetic fixture. */")
C("ca:Result", "src/science_harness/c_astro_pipeline.ts",
    "export interface CAstroPipelineResult {",
    "/** Complete C-ASTRO pipeline result: sandbox measurement, statistics,\n * machine verdict, FEC gate decision, anti-theater report, and sealed proof. */")

# science_harness/dataset_resolver.ts (3)
C("dr:Params", "src/science_harness/dataset_resolver.ts",
    "export interface OnlineFetchParams {",
    "/** Parameters for fetching a dataset online via lightkurve or astroquery.mast.\n * Includes host whitelist enforcement, retry/backoff, and optional LC export. */")
C("dr:Result", "src/science_harness/dataset_resolver.ts",
    "export interface OnlineFetchResult {",
    "/** Result of an online dataset fetch: the resolved dataset reference\n * plus whether the host was whitelisted. Optional lightcurvePath for BLS. */")
C("dr:Fetch", "src/science_harness/dataset_resolver.ts",
    "export async function fetchOnlineDataset(",
    "/** Spawn dataset_fetch.py to fetch a dataset online (lightkurve / astroquery.mast).\n * Returns null on any failure (non-whitelisted host, network, MAST rate-limit).\n * Caller should fall back to cached_fixture on null (02 F1 never-fabricate).\n * @param params Fetch configuration including resolver, host, and retry options.\n * @returns The fetched dataset reference, or null on failure. */")

# science_harness/hero_a_pipeline.ts (12)
C("ha:ID", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_PIPELINE_CLAIM_ID = 'C-MMLU-A-0001';",
    "/** Hero-A claim identifier (preregistered before unblinding). */")
C("ha:Key", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_METRIC_KEY = 'mmlu_physics_accuracy';",
    "/** Hero-A primary metric key: MMLU-physics per-run accuracy. */")
C("ha:Claim", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_PIPELINE_CLAIM =",
    "/** Hero-A claim: model A achieves mean per-run accuracy >= 0.72 on MMLU-physics. */")
C("ha:FalsSpec", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_FALSIFICATION_SPEC: FalsificationSpec = {",
    "/** Hero-A falsification spec: accuracy must exceed 0.72 threshold. */")
C("ha:Thresh", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_THRESHOLD_SPEC: ThresholdSpec = {",
    "/** Hero-A threshold spec: greater-than semantics at 0.72. */")
C("ha:Alpha", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_ALPHA = 0.05;",
    "/** Hero-A significance level (5%). */")
C("ha:Conf", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_CONFIDENCE_LEVEL = 0.95;",
    "/** Hero-A confidence level for interval estimates (95%). */")
C("ha:Seed", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_SEED = 42;",
    "/** Hero-A fixed random seed (SR-2, anti-p-hacking). */")
C("ha:Frozen", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_FROZEN_AT = '2026-07-01T00:00:00.000Z';",
    "/** Hero-A preregistration freeze timestamp (ISO 8601). */")
C("ha:Anchor", "src/science_harness/hero_a_pipeline.ts",
    "export const HERO_A_SOURCE_ANCHOR: SourceAnchor = {",
    "/** Hero-A source anchor: reproducibility fingerprint for the MMLU evaluation. */")
C("ha:Stats", "src/science_harness/hero_a_pipeline.ts",
    "export interface HeroAStatistics {",
    "/** Real one-sample statistics from Hero-A MMLU-physics accuracy evaluation.\n * Contains z-test, CI, Cohen's d, adjusted p-value, and FEC StatisticalResult. */")
C("ha:Result", "src/science_harness/hero_a_pipeline.ts",
    "export interface HeroAPipelineResult {",
    "/** Complete Hero-A pipeline result: statistics, machine verdict,\n * anti-theater report, and sealed proof. */")

# science_harness/hero_b_pipeline.ts (13)
C("hb:ID", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_PIPELINE_CLAIM_ID = 'C-COT-B-0002';",
    "/** Hero-B claim identifier (preregistered before unblinding). */")
C("hb:Key", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_METRIC_KEY = 'hallucination_rate_reduction';",
    "/** Hero-B primary metric key: hallucination rate reduction (baseline minus cot). */")
C("hb:Claim", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_PIPELINE_CLAIM =",
    "/** Hero-B claim: Chain-of-Thought prompting reduces mean LLM hallucination\n * rate vs baseline (causal claim). */")
C("hb:FalsSpec", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_FALSIFICATION_SPEC: FalsificationSpec = {",
    "/** Hero-B falsification spec: reduction must exceed 0 threshold. */")
C("hb:Thresh", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_THRESHOLD_SPEC: ThresholdSpec = {",
    "/** Hero-B threshold spec: greater-than-zero semantics. */")
C("hb:Alpha", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_ALPHA = 0.05;",
    "/** Hero-B significance level (5%). */")
C("hb:Conf", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_CONFIDENCE_LEVEL = 0.95;",
    "/** Hero-B confidence level for interval estimates (95%). */")
C("hb:Seed", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_SEED = 42;",
    "/** Hero-B fixed random seed (SR-2, anti-p-hacking). */")
C("hb:Frozen", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_FROZEN_AT = '2026-07-01T00:00:00.000Z';",
    "/** Hero-B preregistration freeze timestamp (ISO 8601). */")
C("hb:CotRates", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_COT_RATES: readonly number[] = [",
    "/** Fixture: per-stratum hallucination rates with Chain-of-Thought prompting (12 strata). */")
C("hb:Anchor", "src/science_harness/hero_b_pipeline.ts",
    "export const HERO_B_SOURCE_ANCHOR: SourceAnchor = {",
    "/** Hero-B source anchor: reproducibility fingerprint for the hallucination eval. */")
C("hb:Stats", "src/science_harness/hero_b_pipeline.ts",
    "export interface HeroBStatistics {",
    "/** Real two-sample statistics from Hero-B hallucination rate comparison.\n * Includes confounding gate result (d-separation adjudication). */")
C("hb:Result", "src/science_harness/hero_b_pipeline.ts",
    "export interface HeroBPipelineResult {",
    "/** Complete Hero-B pipeline result: statistics, machine verdict, FEC gate, and sealed proof. */")

# science_harness/multiseed_audit.ts (11)
C("ms:ID", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_CLAIM_ID = 'C-MULTISEED-0001';",
    "/** Multi-seed audit claim identifier. */")
C("ms:Key", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_METRIC_KEY = 'transit_depth_significance';",
    "/** Multi-seed audit primary metric key. */")
C("ms:Claim", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_PIPELINE_CLAIM =",
    "/** Multi-seed pipeline claim: TIC 268644982 shows a transit signal recovered\n * across multiple pre-registered seeds. */")
C("ms:Frozen", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_FROZEN_AT = C_ASTRO_FROZEN_AT;",
    "/** Multi-seed preregistration freeze timestamp (aliased from C-ASTRO). */")
C("ms:Declared", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_DECLARED_SEEDS: readonly number[] = [0, 1, 2, 3, 4];",
    "/** Researcher pre-registered seeds (all must be run). */")
C("ms:Threshold", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_DETECTION_THRESHOLD = 8.5;",
    "/** BLS depthSNR threshold for seed detection (>= counts as detected). */")
C("ms:FalsSpec", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_FALSIFICATION_SPEC: FalsificationSpec = {",
    "/** Multi-seed falsification spec: transit depth significance > 0. */")
C("ms:ThreshSpec", "src/science_harness/multiseed_audit.ts",
    "export const MULTISEED_THRESHOLD_SPEC: ThresholdSpec = { semantics: 'gt', value: 0 };",
    "/** Multi-seed threshold spec: greater-than-zero semantics. */")
C("ms:Run", "src/science_harness/multiseed_audit.ts",
    "export interface MultiseedRun {",
    "/** Single seed run in the multi-seed experiment: seed, BLS metrics, and detection flag. */")
C("ms:Experiment", "src/science_harness/multiseed_audit.ts",
    "export interface MultiseedExperiment {",
    "/** Complete multi-seed BLS experiment: all runs, detected seed subset,\n * declared seeds, and detection threshold. */")
C("ms:AuditResult", "src/science_harness/multiseed_audit.ts",
    "export interface MultiseedAuditResult {",
    "/** Result of a multi-seed cherry-pick audit: experiment data, registry hash,\n * machine verdict, and anti-theater report. */")

# science_harness/sandbox_runner.ts (5)
C("sr:buildEnv", "src/science_harness/sandbox_runner.ts",
    "export function buildVenvPythonEnv(",
    "/** Build a sanitized Python environment for venv subprocess execution.\n * Strips secret keys (API_KEY/SECRET/TOKEN) and allows only a minimal\n * env whitelist. Injects PYTHONPATH for repro/ and .python-deps/.\n * @returns A sanitized environment object for child_process.spawn. */")
C("sr:resolveVenv", "src/science_harness/sandbox_runner.ts",
    "export function resolveVenvPython(",
    "/** Resolve the .venv312 Python executable (Python 3.12 with lightkurve).\n * Probes for the venv and validates lightkurve+astroquery are importable.\n * @returns Absolute path to the venv Python, or null if unavailable. */")
C("sr:PreflightOpts", "src/science_harness/sandbox_runner.ts",
    "export interface PreflightOptions {",
    "/** Options for preflight working directory checks (FUSION-OS-4). */")
C("sr:PreflightRes", "src/science_harness/sandbox_runner.ts",
    "export interface PreflightResult {",
    "/** Result of a preflight working directory scan. Reports whether the\n * directory is safe for sandbox execution (no .git, no symlinks, file cap). */")
C("sr:Preflight", "src/science_harness/sandbox_runner.ts",
    "export function preflightWorkingDir(",
    "/** Preflight scan a working directory before spawning a venv subprocess.\n * Rejects .git directories, symlinks (O_NOFOLLOW), and file counts exceeding\n * the cap (zip-bomb defense). Best-effort, not OS-level isolation.\n * @param workingDir Directory to scan (empty string = skip).\n * @param options File count cap override.\n * @returns Scan result with ok/reason and file count. */")

# science_harness/seed_cherry_pipeline.ts (11)
C("sc:ID", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_CLAIM_ID = 'C-CHERRY-0001';",
    "/** Seed-cherry audit claim identifier. */")
C("sc:Key", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_METRIC_KEY = 'transit_depth_significance';",
    "/** Seed-cherry primary metric key: transit depth significance. */")
C("sc:Claim", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_PIPELINE_CLAIM =",
    "/** Seed-cherry claim: TIC 268644982 shows a transit signal detected\n * across 5 pre-registered seeds (cherry-picked adversarial submission). */")
C("sc:PrimarySeed", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_PRIMARY_SEED = 0;",
    "/** Primary seed for the seed-cherry fixture (seed 0 of 5 declared). */")
C("sc:Declared", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_DECLARED_SEEDS: readonly number[] = [0, 1, 2, 3, 4];",
    "/** Researcher pre-registered 5 seeds (all declared, cherry-pick hides 3,4). */")
C("sc:Reported", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_REPORTED_SEEDS: readonly number[] = [0, 1, 2];",
    "/** Researcher actually reported 3 seeds (cherry-picked: seeds 3,4 hidden). */")
C("sc:FalsSpec", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_FALSIFICATION_SPEC: FalsificationSpec = {",
    "/** Seed-cherry falsification spec: transit depth significance > 0. */")
C("sc:ThreshSpec", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_THRESHOLD_SPEC: ThresholdSpec = {",
    "/** Seed-cherry threshold spec: greater-than-zero semantics. */")
C("sc:AntiTheater", "src/science_harness/seed_cherry_pipeline.ts",
    "export const SEED_CHERRY_ANTI_THEATER_SUMMARY =",
    "/** AntiTheaterLintInput neutral summary text for seed-cherry (no strength words,\n * detect_report_mismatch does not trigger). */")
C("sc:Result", "src/science_harness/seed_cherry_pipeline.ts",
    "export interface SeedCherryPipelineResult {",
    "/** Complete seed-cherry pipeline result: statistics, machine verdict,\n * anti-theater report, and sealed proof. */")
C("sc:PreparedInputs", "src/science_harness/seed_cherry_pipeline.ts",
    "export interface SeedCherryPreparedInputs {",
    "/** Pre-constructed FEC inputs for the seed-cherry chain (decoupled from\n * DB writes so tests can compare with/without antiTheaterReport). */")

# science_harness/types.ts (1)
C("types:DS", "src/science_harness/types.ts",
    "export interface DatasetResolution {",
    "/** Dataset resolution result (spec 12 S2.2 three-valued decision tree).\n * Tracks status (resolved/degraded/untested), reference, exempt flag, and reason. */")

print(f"\n{'='*60}")
print(f"Applied {count}/{total} JSDoc comments successfully")
if count < total:
    print(f"FAILED: {total - count} symbols could not be documented")
    sys.exit(1)
