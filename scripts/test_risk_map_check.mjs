#!/usr/bin/env node
/**
 * Validate ci/TEST_RISK_MAP.yaml as an executable ENG-TEST-001 control.
 *
 * This gate proves only that the required risk taxonomy is present and each
 * entry is bound to a structurally valid, in-repository test/runner asset. It
 * does not prove that assertions are scientifically strong; mutation, fuzz,
 * targeted failure tests, and independent review remain separate evidence.
 */

import {
  existsSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';

export const REQUIRED_RISK_CLASSES = Object.freeze([
  'unit',
  'contract',
  'property-based',
  'metamorphic',
  'differential',
  'mutation',
  'fuzz',
  'integration',
  'e2e',
  'visual-a11y',
  'fault-injection',
  'regression',
  // FAR-Lab trust-kernel completion modes (AGENTS.md §7).
  'positive',
  'negative',
  'boundary',
  'tamper',
]);

const ASSET_KINDS = new Set(['test', 'script', 'ci_job', 'ci_run', 'corpus']);
const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'riskClasses']);
const RISK_CLASS_FIELDS = new Set(['class', 'risk', 'assets', 'gap']);
const ASSET_FIELDS = new Set(['kind', 'locator']);
const GAP_FIELDS = new Set(['rationale', 'owner', 'tracking', 'nextAction']);
const TEST_FILE_PATTERN = /(?:^|\/)(?:tests|__tests__)\/.+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const TEST_DIR_PREFIXES = ['tests/', 'frontend/src/__tests__/'];
const SCRIPT_PREFIXES = ['scripts/', 'ci/'];
const CORPUS_PREFIXES = ['golden_vectors/', 'repro/'];
const SCRIPT_FILE_PATTERN = /\.(?:[cm]?[jt]s|py|sh|ps1)$/;

function parseArgs(argv) {
  const options = { root: process.cwd(), map: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root' || arg === '--map') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--root') options.root = value;
      else options.map = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findUnknownFields(value, allowed) {
  return Object.keys(value).filter((field) => !allowed.has(field));
}

function parseMap(text) {
  const document = parseDocument(text, { prettyErrors: false, strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('; '));
  }
  const parsed = document.toJS();
  if (!isRecord(parsed)) throw new Error('map root must be an object');
  return parsed;
}

function insideRoot(rootReal, candidateReal) {
  const rel = relative(rootReal, candidateReal);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function containsTestFile(path) {
  const stats = statSync(path);
  if (stats.isFile()) return TEST_FILE_PATTERN.test(path.replaceAll('\\', '/'));
  if (!stats.isDirectory()) return false;
  const pending = [path];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile() && TEST_FILE_PATTERN.test(child.replaceAll('\\', '/'))) return true;
    }
  }
  return false;
}

function validatePathAsset({ kind, locator, root, rootReal }) {
  if (isAbsolute(locator) || locator.includes('\\') || locator.split('/').includes('..')) {
    return `locator must be a forward-slash relative path inside the repository: "${locator}"`;
  }
  const candidate = resolve(root, locator);
  if (!existsSync(candidate)) return `dangling locator "${locator}"`;
  const candidateReal = realpathSync(candidate);
  if (!insideRoot(rootReal, candidateReal)) return `locator escapes repository root: "${locator}"`;

  if (kind === 'test') {
    if (!TEST_DIR_PREFIXES.some((prefix) => locator.startsWith(prefix))) {
      return `test locator must live under tests/ or frontend/src/__tests__/: "${locator}"`;
    }
    if (!containsTestFile(candidateReal)) return `test locator contains no *.test/spec file: "${locator}"`;
  } else if (kind === 'script') {
    if (
      !SCRIPT_PREFIXES.some((prefix) => locator.startsWith(prefix))
      || !statSync(candidateReal).isFile()
      || !SCRIPT_FILE_PATTERN.test(locator)
    ) {
      return `script locator must be an executable-source file under scripts/ or ci/: "${locator}"`;
    }
  } else if (kind === 'corpus') {
    if (!CORPUS_PREFIXES.some((prefix) => locator.startsWith(prefix))) {
      return `corpus locator must live under golden_vectors/ or repro/: "${locator}"`;
    }
  }
  return null;
}

function loadWorkflow(root) {
  const workflowPath = join(root, '.github', 'workflows', 'ci.yml');
  if (!existsSync(workflowPath)) return null;
  const document = parseDocument(readFileSync(workflowPath, 'utf8'), {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) return null;
  const workflow = document.toJS();
  return isRecord(workflow) ? workflow : null;
}

function workflowJobs(workflow) {
  if (workflow === null || !isRecord(workflow.jobs)) return {};
  return workflow.jobs;
}

function workflowRunLines(workflow) {
  const lines = new Set();
  for (const job of Object.values(workflowJobs(workflow))) {
    if (!isRecord(job) || !Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (!isRecord(step) || typeof step.run !== 'string') continue;
      for (const line of step.run.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 0) lines.add(trimmed);
      }
    }
  }
  return lines;
}

function validateGap(gap) {
  if (!isRecord(gap)) return 'gap must be an object';
  const unknown = findUnknownFields(gap, GAP_FIELDS);
  if (unknown.length > 0) return `gap has unknown field(s): ${unknown.join(', ')}`;
  const required = ['rationale', 'owner', 'tracking', 'nextAction'];
  for (const field of required) {
    if (typeof gap[field] !== 'string' || gap[field].trim().length === 0) {
      return `gap.${field} must be a non-empty string`;
    }
  }
  if (gap.rationale.trim().length < 40) return 'gap.rationale must contain at least 40 characters';
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(gap.tracking)) {
    return 'gap.tracking must be a stable requirement/decision id';
  }
  return null;
}

function validateAsset(asset, context) {
  if (!isRecord(asset)) return 'asset must be an object';
  const unknown = findUnknownFields(asset, ASSET_FIELDS);
  if (unknown.length > 0) return `asset has unknown field(s): ${unknown.join(', ')}`;
  if (typeof asset.kind !== 'string' || !ASSET_KINDS.has(asset.kind)) {
    return `asset.kind must be one of ${[...ASSET_KINDS].join(', ')}`;
  }
  if (typeof asset.locator !== 'string' || asset.locator.trim().length === 0) {
    return 'asset.locator must be a non-empty string';
  }
  const locator = asset.locator.trim();
  if (asset.kind === 'ci_job') {
    return Object.hasOwn(workflowJobs(context.workflow), locator)
      ? null
      : `CI job not found: "${locator}"`;
  }
  if (asset.kind === 'ci_run') {
    return context.workflowRunLines.has(locator)
      ? null
      : `exact CI run line not found: "${locator}"`;
  }
  return validatePathAsset({ kind: asset.kind, locator, root: context.root, rootReal: context.rootReal });
}

export function checkMap({ mapText, root }) {
  const findings = [];
  let parsed;
  try {
    parsed = parseMap(mapText);
  } catch (error) {
    return {
      ok: false,
      findings: [`map: invalid YAML/schema — ${error instanceof Error ? error.message : String(error)}`],
      stats: { classes: 0, gapped: 0 },
    };
  }

  for (const field of findUnknownFields(parsed, TOP_LEVEL_FIELDS)) {
    findings.push(`map: unknown top-level field "${field}"`);
  }
  if (parsed.schemaVersion !== '1') findings.push('map: schemaVersion must equal "1"');
  if (!Array.isArray(parsed.riskClasses)) {
    findings.push('map: riskClasses must be an array');
    return { ok: false, findings, stats: { classes: 0, gapped: 0 } };
  }

  const rootReal = realpathSync(resolve(root));
  const workflow = loadWorkflow(rootReal);
  const context = {
    root: rootReal,
    rootReal,
    workflow,
    workflowRunLines: workflowRunLines(workflow),
  };
  const seen = new Set();
  let gapped = 0;

  for (const [index, rawClass] of parsed.riskClasses.entries()) {
    if (!isRecord(rawClass)) {
      findings.push(`riskClasses[${index}]: must be an object`);
      continue;
    }
    for (const field of findUnknownFields(rawClass, RISK_CLASS_FIELDS)) {
      findings.push(`riskClasses[${index}]: unknown field "${field}"`);
    }
    const className = typeof rawClass.class === 'string' ? rawClass.class.trim() : '';
    if (className.length === 0) {
      findings.push(`riskClasses[${index}]: class must be a non-empty string`);
      continue;
    }
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(className)) {
      findings.push(`class ${className}: must use stable lowercase kebab-case`);
    }
    if (seen.has(className)) findings.push(`class ${className}: duplicate`);
    seen.add(className);
    if (typeof rawClass.risk !== 'string' || rawClass.risk.trim().length === 0) {
      findings.push(`class ${className}: risk must be a non-empty string`);
    }
    const assets = rawClass.assets;
    if (!Array.isArray(assets)) findings.push(`class ${className}: assets must be an array`);
    const assetList = Array.isArray(assets) ? assets : [];
    const hasGap = rawClass.gap !== undefined && rawClass.gap !== null;
    if (assetList.length === 0 && !hasGap) {
      findings.push(`class ${className}: assets and gap are both empty`);
    }
    if (assetList.length > 0 && hasGap) {
      findings.push(`class ${className}: assets and gap cannot coexist`);
    }
    if (hasGap) {
      gapped += 1;
      const gapFinding = validateGap(rawClass.gap);
      if (gapFinding !== null) findings.push(`class ${className}: ${gapFinding}`);
      // A declared gap is honest state, not completed test coverage. CI remains red.
      findings.push(`class ${className}: declared gap keeps ENG-TEST-001 incomplete`);
    }
    for (const [assetIndex, asset] of assetList.entries()) {
      const finding = validateAsset(asset, context);
      if (finding !== null) findings.push(`class ${className} asset[${assetIndex}]: ${finding}`);
    }
  }

  for (const required of REQUIRED_RISK_CLASSES) {
    if (!seen.has(required)) findings.push(`map: missing required risk class "${required}"`);
  }

  return {
    ok: findings.length === 0,
    findings,
    stats: { classes: parsed.riskClasses.length, gapped },
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`test_risk_map_check: bad args — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const root = resolve(options.root);
  const mapPath = options.map ?? join(root, 'ci', 'TEST_RISK_MAP.yaml');
  if (!existsSync(mapPath)) {
    console.error(`test_risk_map_check: map missing ${mapPath}`);
    process.exit(1);
  }
  const result = checkMap({ mapText: readFileSync(mapPath, 'utf8'), root });
  for (const finding of result.findings) console.error(`test_risk_map_check: ${finding}`);
  console.log(
    `test_risk_map_check: ${result.ok ? 'PASS' : 'FAIL'} — ${result.stats.classes} risk classes (${result.stats.gapped} declared gap)`,
  );
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('test_risk_map_check.mjs') === true) main();
