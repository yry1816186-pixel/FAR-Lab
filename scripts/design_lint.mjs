#!/usr/bin/env node
/**
 * design_lint.mjs — FAR-Lab 设计控制面与 SSOT 的机器校验（DESIGN_PRIME §16）。
 *
 * 激活条件（否则 SKIP exit 0，不影响非设计工作）：
 *   design ledger 存在，或 docs/design/ 中存在 §15 规范文件，或 docs/design/machine-readable/ 存在。
 *
 * 校验项（任一失败 exit 1）：
 *   F1 design ledger**\/*.yaml 与 docs/design/machine-readable/**\/*.yaml 必须可解析且非空
 *   F2 design ledger 必须含 §6 全部 22 个必需键，freeze_status 枚举合法
 *   F3 design ledger 条目必须含 §3.2 必需字段，status ∈ §3.1/§3.4 词汇
 *   F4 design ledger 条目必须含 §23.18 必需字段
 *   F5 控制面与规范文档中禁止未登记的 TODO/TBD/待定/后续补充/尚未考虑 等标记
 *      （同行引用 DEF-n / EXT-n / EA-n / deferral_id / action_id 者豁免）
 *   F6 docs/design/ 的 §15 规范文件必须带完整 §15.1 front-matter 头，status 枚举合法
 *   F7 design-freeze.yaml（若存在）freeze_status ∈ §18 枚举
 *   F8 docs/design/ 中不匹配 §15 规范名的 NN_*.md 记 legacy 警告（不阻断）
 *
 * 用法：node scripts/design_lint.mjs [--root <dir>]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

const args = process.argv.slice(2);
let ROOT = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--root" && args[i + 1]) {
    ROOT = args[i + 1];
    i += 1;
  }
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const rel = (p) => relative(ROOT, p) || p;

// ── §15 canonical SSOT file names ────────────────────────────────────────────
const CANONICAL = [
  "00_INDEX_AND_READING_ORDER.md",
  "01_EXECUTIVE_DESIGN_CONTRACT.md",
  "02_FACT_BASELINE_REPOSITORY_AND_CLAIM_MAP.md",
  "03_COMPETITION_REQUIREMENTS_PUBLIC_CLAIMS_AND_TRACE.md",
  "04_STAKEHOLDERS_USERS_JOBS_ADOPTION_AND_SOCIAL_VALUE.md",
  "05_PROBLEM_MODEL_FAILURE_CHAINS_AND_SYSTEM_BOUNDARY.md",
  "06_RESEARCH_METHOD_SOURCE_REGISTRY_ECOSYSTEM_AND_FAILURES.md",
  "07_OPPORTUNITY_MAP_SIMPLE_BASELINES_AND_REJECTED_OPTIONS.md",
  "08_CONCEPT_TOURNAMENT_PROTOTYPES_KILL_REVIEW_AND_EVIDENCE.md",
  "09_PRODUCT_THESIS_SCOPE_NON_GOALS_HERO_AND_ADOPTION.md",
  "10_SCIENTIFIC_AUTHORITY_EPISTEMIC_MODEL_AND_ETHICS.md",
  "11_DOMAIN_MODEL_FEC_VERDICT_STATES_AND_INVARIANTS.md",
  "12_EVIDENCE_PROVENANCE_PROOF_AND_INDEPENDENT_VERIFICATION.md",
  "13_REQUIREMENTS_QUALITY_SCENARIOS_AND_ASSURANCE_CASE.md",
  "14_ARCHITECTURE_VIEWS_TRADEOFFS_ADRS_AND_FITNESS_FUNCTIONS.md",
  "15_PROJECT_STRUCTURE_MODULES_DEPENDENCIES_AND_MIGRATION.md",
  "16_AGENT_RUNTIME_MODELS_TOOLS_CONTEXT_AND_MEMORY.md",
  "17_DATA_DATABASE_STORAGE_SCHEMA_PROTOCOL_API_CLI_AND_SDK.md",
  "18_WEB_UX_INFORMATION_ARCHITECTURE_ACCESSIBILITY_AND_I18N.md",
  "19_CROSS_PLATFORM_INSTALLATION_DEPLOYMENT_AND_PROFILES.md",
  "20_PERFORMANCE_RELIABILITY_RECOVERY_OBSERVABILITY_AND_COST.md",
  "21_SECURITY_PRIVACY_THREAT_MODEL_AND_SUPPLY_CHAIN.md",
  "22_EXTENSIBILITY_CONFIGURATION_CUSTOMIZATION_AND_SAFE_EVOLUTION.md",
  "23_TEST_EVALUATION_BENCHMARK_RED_TEAM_AND_EXTERNAL_REPLICATION.md",
  
  "25_OPEN_SOURCE_LICENSE_GOVERNANCE_AND_LONG_TERM_MAINTENANCE.md",
  "26_IMPLEMENTATION_SEQUENCE_RESOURCES_MIGRATION_AND_ROADMAP.md",
  "27_SUSTAINABILITY_ENERGY_AND_COST_BOUNDARIES.md",
  "28_RISKS_UNKNOWNS_DESIGN_DEBT_AND_REOPEN_TRIGGERS.md",
  "29_FULL_TRACEABILITY_CHANGE_IMPACT_AND_COMPATIBILITY.md",
  "30_BLIND_SPOTS_CROSS_LIFECYCLE_AND_IMPACT_CHAINS.md",
  "31_COMPLETION_EVIDENCE_DEFERRALS_AND_EXTERNAL_ACTIONS.md",
  "32_FINAL_DESIGN_REVIEW_AND_FREEZE.md",
];

const STATE_REQUIRED_KEYS = [
  "project", "repository_root", "branch_or_workspace", "head_sha", "working_tree_summary",
  "stage", "active_question", "current_state_baseline", "target_state_ref", "migration_plan_ref",
  "frozen_decisions", "open_p0_questions", "open_blockers", "high_impact_unknowns",
  "active_deferrals", "coverage_gaps", "last_evidence", "last_failure",
  "next_action", "next_command", "freeze_status", "updated_at",
];

const CLAIM_REQUIRED = [
  "claim_id", "statement", "scope", "status", "risk_class",
  "evidence_refs", "counter_evidence_refs", "falsifier", "public_claim_allowed",
  "last_verified_at", "reopen_trigger",
];
const CLAIM_STATUS = new Set([
  "OBSERVED_FACT", "REPRODUCED_FACT", "EXTERNALLY_VERIFIED", "SUPPORTED_INFERENCE",
  "DESIGN_HYPOTHESIS", "CREATIVE_PROPOSAL", "DECISION", "FROZEN",
  "UNKNOWN", "BLOCKED", "BLOCKED_EXTERNAL", "CONTRADICTED", "SUPERSEDED",
]);
const CLAIM_RISK = new Set(["low", "medium", "high", "critical"]);

const DEFERRAL_REQUIRED = [
  "deferral_id", "item", "priority", "reason", "why_non_blocking", "design_impact",
  "owner_or_authority", "prerequisites", "verification_steps", "deadline_stage", "reopen_trigger",
];

const DOC_HEADER_REQUIRED = [
  "status", "scope", "source_of_truth_for", "requirements", "decisions", "facts",
  "hypotheses", "unknowns", "deferrals", "evidence", "consumers", "reopen_triggers", "last_verified_at",
];
const DOC_STATUS = new Set(["DRAFT", "REVIEWED", "FROZEN", "SUPERSEDED"]);
const FREEZE_STATUS = new Set(["FULL_FREEZE", "LOCAL_FREEZE_WITH_EXTERNAL_GATES", "NOT_FROZEN"]);

const MARKER_RE = /\bTODO\b|\bTBD\b|待定|待补充|后续补充|后续处理|尚未考虑|以后再说|以后处理/;
const MARKER_EXEMPT_RE = /DEF-\d+|EXT-\d+|EA-\d+|deferral_id|action_id|not_applicable/;

// ── helpers ──────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function readYaml(file) {
  const text = readFileSync(file, "utf8");
  if (!text.trim()) return { ok: false, doc: null, msg: "empty file" };
  try {
    const doc = parse(text);
    if (doc === null || doc === undefined) return { ok: false, doc: null, msg: "parses to null" };
    return { ok: true, doc, msg: "" };
  } catch (e) {
    return { ok: false, doc: null, msg: e.message.split("\n")[0] };
  }
}

/** Accept top-level list, top-level map of entries, or { key: [...] } wrapper. */
function entriesOf(doc, wrapKey) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === "object") {
    if (Array.isArray(doc[wrapKey])) return doc[wrapKey];
    return Object.values(doc);
  }
  return null;
}

function extractFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end < 0) return null;
  return text.slice(4, end);
}

function scanMarkers(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (MARKER_RE.test(line) && !MARKER_EXEMPT_RE.test(line)) {
      err(`${rel(file)}:${i + 1}: unregistered deferral marker (must reference DEF-/EXT- id): ${line.trim().slice(0, 80)}`);
    }
  });
}

// ── activation ───────────────────────────────────────────────────────────────
const CONTROL = join(ROOT, ".far-design");
const DOCS = join(ROOT, "docs", "design");
const MACHINE = join(DOCS, "machine-readable");
const canonicalPresent = CANONICAL.filter((n) => existsSync(join(DOCS, n)));
if (!existsSync(CONTROL) && canonicalPresent.length === 0 && !existsSync(MACHINE)) {
  console.log("design-lint: SKIP (no design ledger and no docs/design SSOT present)");
  process.exit(0);
}

// ── F1: yaml parse + non-empty ───────────────────────────────────────────────
const controlYamls = walk(CONTROL).filter((f) => /\.ya?ml$/.test(f));
const machineYamls = walk(MACHINE).filter((f) => /\.ya?ml$/.test(f));
const parsedCache = new Map();
for (const f of [...controlYamls, ...machineYamls]) {
  const r = readYaml(f);
  if (!r.ok) err(`${rel(f)}: invalid/empty YAML: ${r.msg}`);
  else parsedCache.set(f, r.doc);
}

// ── F2: STATE.yaml ───────────────────────────────────────────────────────────
const stateFile = join(CONTROL, "STATE.yaml");
if (existsSync(stateFile) && parsedCache.has(stateFile)) {
  const doc = parsedCache.get(stateFile);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    err("design ledger: must be a YAML map");
  } else {
    for (const k of STATE_REQUIRED_KEYS) {
      if (!(k in doc)) err(`design ledger: missing required key '${k}' (DESIGN_PRIME §6)`);
    }
    if (doc.freeze_status !== undefined && !FREEZE_STATUS.has(String(doc.freeze_status))) {
      err(`design ledger: freeze_status '${doc.freeze_status}' not in ${[...FREEZE_STATUS].join("|")}`);
    }
  }
}

// ── F3: CLAIMS.yaml ──────────────────────────────────────────────────────────
const claimsFile = join(CONTROL, "CLAIMS.yaml");
if (existsSync(claimsFile) && parsedCache.has(claimsFile)) {
  const entries = entriesOf(parsedCache.get(claimsFile), "claims");
  if (!entries) {
    err("design ledger: must be a list, a map of entries, or { claims: [...] }");
  } else {
    entries.forEach((e, i) => {
      const tag = `CLAIMS[${i}]`;
      if (!e || typeof e !== "object") { err(`${tag}: entry must be a map`); return; }
      for (const k of CLAIM_REQUIRED) if (!(k in e)) err(`${tag}: missing required field '${k}' (§3.2)`);
      if (e.status !== undefined && !CLAIM_STATUS.has(String(e.status))) {
        err(`${tag}: status '${e.status}' not in §3.1 vocabulary`);
      }
      if (e.risk_class !== undefined && !CLAIM_RISK.has(String(e.risk_class))) {
        err(`${tag}: risk_class '${e.risk_class}' not in low|medium|high|critical`);
      }
    });
  }
}

// ── F4: DEFERRAL_REGISTER.yaml ───────────────────────────────────────────────
const deferralFile = join(CONTROL, "DEFERRAL_REGISTER.yaml");
if (existsSync(deferralFile) && parsedCache.has(deferralFile)) {
  const entries = entriesOf(parsedCache.get(deferralFile), "deferrals");
  if (!entries) {
    err("design ledger: must be a list, a map of entries, or { deferrals: [...] }");
  } else {
    entries.forEach((e, i) => {
      const tag = `DEFERRAL[${i}]`;
      if (!e || typeof e !== "object") { err(`${tag}: entry must be a map`); return; }
      for (const k of DEFERRAL_REQUIRED) if (!(k in e)) err(`${tag}: missing required field '${k}' (§23.18)`);
    });
  }
}

// ── F5: unregistered deferral markers ────────────────────────────────────────
for (const f of [...controlYamls, ...machineYamls]) scanMarkers(f);
for (const n of canonicalPresent) scanMarkers(join(DOCS, n));

// ── F6: canonical doc headers ────────────────────────────────────────────────
for (const n of canonicalPresent) {
  const f = join(DOCS, n);
  const fm = extractFrontMatter(readFileSync(f, "utf8"));
  if (fm === null) { err(`docs/design/${n}: missing YAML front-matter header (§15.1)`); continue; }
  let doc;
  try { doc = parse(fm); } catch (e) { err(`docs/design/${n}: front-matter YAML invalid: ${e.message.split("\n")[0]}`); continue; }
  if (!doc || typeof doc !== "object") { err(`docs/design/${n}: front-matter must be a YAML map`); continue; }
  for (const k of DOC_HEADER_REQUIRED) if (!(k in doc)) err(`docs/design/${n}: front-matter missing '${k}' (§15.1)`);
  if (doc.status !== undefined && !DOC_STATUS.has(String(doc.status))) {
    err(`docs/design/${n}: status '${doc.status}' not in DRAFT|REVIEWED|FROZEN|SUPERSEDED`);
  }
}

// ── F7: design-freeze.yaml ───────────────────────────────────────────────────
for (const f of [join(MACHINE, "design-freeze.yaml"), join(CONTROL, "design-freeze.yaml")]) {
  if (existsSync(f) && parsedCache.has(f)) {
    const doc = parsedCache.get(f);
    if (!doc || typeof doc !== "object") { err(`${rel(f)}: must be a YAML map`); continue; }
    if (!FREEZE_STATUS.has(String(doc.freeze_status))) {
      err(`${rel(f)}: freeze_status '${doc.freeze_status}' not in ${[...FREEZE_STATUS].join("|")}`);
    }
    if (doc.freeze_status !== "NOT_FROZEN" && Number(doc.schema_version) !== 2) {
      err(`${rel(f)}: non-NOT_FROZEN record must carry schema_version: 2 (§18)`);
    }
  }
}

// ── F8: legacy numbered docs (warning only) ──────────────────────────────────
if (existsSync(DOCS)) {
  for (const n of readdirSync(DOCS)) {
    if (/^\d{2}[a-z]?_.*\.md$/.test(n) && !CANONICAL.includes(n)) {
      warn(`docs/design/${n}: numbered doc not in §15 canonical set — treat as legacy pending migration/supersede`);
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
for (const w of warnings) console.log(`WARNING: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
const scope = `${controlYamls.length} control yaml, ${machineYamls.length} machine-readable yaml, ${canonicalPresent.length}/${CANONICAL.length} canonical docs`;
if (errors.length) {
  console.log(`design-lint: FAIL (${errors.length} errors, ${warnings.length} warnings; ${scope})`);
  process.exit(1);
}
console.log(`design-lint: PASS (${warnings.length} warnings; ${scope})`);
process.exit(0);
