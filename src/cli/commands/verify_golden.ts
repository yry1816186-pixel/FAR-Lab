// src/cli/commands/verify_golden.ts
// `far verify-golden` —— run on-disk verdict golden vectors through the V2 kernel.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';
import { createContext, runInContext } from 'node:vm';

import {
  decideFiveValueVerdict,
  type VerdictKernelInput,
} from '../../falsifiability/verdict_kernel_v2.ts';
import { VERDICTS, type Verdict } from '../../schema/enums.ts';

const DEFAULT_CASE_DIR = join(PACKAGE_ROOT, 'golden_vectors', 'cases');
const DEFAULT_BROWSER_VERIFY_HTML = join(PACKAGE_ROOT, 'frontend', 'public', 'verify_golden.html');
const CASE_ID_PATTERN = /^GV-\d{2}$/;
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

export type VerifyGoldenStatus = 'PASS' | 'FAIL';
export type VerifyGoldenBackend = 'node' | 'python' | 'browser';

export interface VerifyGoldenCaseResult {
  readonly caseId: string;
  readonly status: VerifyGoldenStatus;
  readonly backend: VerifyGoldenBackend;
  readonly verdict: Verdict | null;
  readonly expectedVerdict: Verdict | null;
  readonly decisiveRuleId: string | null;
  readonly expectedDecisiveRuleId: string | null;
  readonly reasonCodes: readonly string[];
  readonly expectedReasonCodes: readonly string[];
  readonly errors: readonly string[];
}

export interface VerifyGoldenDump {
  readonly status: VerifyGoldenStatus;
  readonly backend: VerifyGoldenBackend;
  readonly caseDir: string;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly cases: readonly VerifyGoldenCaseResult[];
  readonly errors: readonly string[];
}

export interface CollectVerifyGoldenOptions {
  readonly caseIds?: readonly string[];
  readonly caseDir?: string;
  readonly backend?: VerifyGoldenBackend;
}

interface GoldenVectorExpected {
  readonly verdict: Verdict;
  readonly decisiveRuleId: string;
  readonly reasonCodes: readonly string[];
  readonly untestedReason: string | null;
}

interface GoldenVectorCase {
  readonly caseId: string;
  readonly input: {
    readonly evidences: readonly unknown[];
    readonly kernel: VerdictKernelInput;
  };
  readonly expected: GoldenVectorExpected;
}

interface ComputedGoldenVerdict {
  readonly verdict: Verdict;
  readonly decisiveRuleId: string;
  readonly reasonCodes: readonly string[];
  readonly untestedReason: string | null;
}

interface BrowserGoldenVerifier {
  readonly decideFiveValueVerdict: (input: VerdictKernelInput) => unknown;
}

interface BrowserGoldenSandbox {
  FARGoldenVerify?: BrowserGoldenVerifier;
  readonly console: Console;
  readonly document: {
    readonly addEventListener: (eventName: string, handler: () => void) => void;
  };
}

let browserVerifierCache: BrowserGoldenVerifier | undefined;

export function collectVerifyGoldenDump(options: CollectVerifyGoldenOptions = {}): VerifyGoldenDump {
  const caseDir = options.caseDir ?? DEFAULT_CASE_DIR;
  const backend = options.backend ?? 'node';
  const selected = options.caseIds ?? readAllCaseIds(caseDir);
  const cases: VerifyGoldenCaseResult[] = [];
  const errors: string[] = [];

  for (const caseId of selected) {
    const normalized = normalizeCaseId(caseId);
    if (normalized === null) {
      const error = `invalid case id: ${caseId}`;
      errors.push(error);
      cases.push(failedCase(caseId, backend, [error]));
      continue;
    }
    cases.push(verifyGoldenCase(caseDir, normalized, backend));
  }

  const failed = cases.filter((item) => item.status === 'FAIL').length;
  return {
    status: failed === 0 && errors.length === 0 ? 'PASS' : 'FAIL',
    backend,
    caseDir,
    total: cases.length,
    passed: cases.length - failed,
    failed,
    cases,
    errors,
  };
}

export function runVerifyGolden(options: CollectVerifyGoldenOptions & { readonly json?: boolean } = {}): number {
  const dump = collectVerifyGoldenDump(options);
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } else {
    process.stdout.write(renderVerifyGoldenText(dump));
  }
  return dump.status === 'PASS' ? 0 : 7;
}

export function renderVerifyGoldenText(dump: VerifyGoldenDump): string {
  const lines = [
    `far verify-golden: ${dump.status} (${dump.passed}/${dump.total} passed, backend=${dump.backend})`,
  ];
  for (const result of dump.cases) {
    const suffix = result.status === 'PASS'
      ? `${result.verdict ?? 'null'} via ${result.decisiveRuleId ?? 'null'}`
      : result.errors.join('; ');
    lines.push(`  ${result.status} ${result.caseId}: ${suffix}`);
  }
  if (dump.errors.length > 0) {
    for (const error of dump.errors) {
      lines.push(`  error: ${error}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function verifyGoldenCase(caseDir: string, caseId: string, backend: VerifyGoldenBackend): VerifyGoldenCaseResult {
  try {
    const casePath = join(caseDir, `${caseId}.json`);
    const parsed = parseGoldenVectorFile(readJson(casePath), caseId);
    if (!parsed.ok) {
      return failedCase(caseId, backend, [parsed.error]);
    }
    const output = decideWithBackend(backend, parsed.case.input.kernel, casePath);
    const errors = compareExpected(parsed.case.expected, output);
    return {
      caseId,
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      backend,
      verdict: output.verdict,
      expectedVerdict: parsed.case.expected.verdict,
      decisiveRuleId: output.decisiveRuleId,
      expectedDecisiveRuleId: parsed.case.expected.decisiveRuleId,
      reasonCodes: output.reasonCodes,
      expectedReasonCodes: parsed.case.expected.reasonCodes,
      errors,
    };
  } catch (error) {
    return failedCase(caseId, backend, [`${caseId}: ${errorMessage(error)}`]);
  }
}

function decideWithBackend(
  backend: VerifyGoldenBackend,
  kernel: VerdictKernelInput,
  casePath: string,
): ComputedGoldenVerdict {
  if (backend === 'node') {
    return decideFiveValueVerdict(kernel);
  }
  if (backend === 'python') {
    return decideWithPython(casePath);
  }
  return decideWithBrowser(kernel);
}

function decideWithPython(casePath: string): ComputedGoldenVerdict {
  const result = spawnSync(
    PYTHON_CMD,
    ['-m', 'far_chain_repro.verdict_kernel_v2', casePath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: buildPythonPath() },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error !== undefined) {
    throw new Error(`python backend spawn failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`python backend exited ${result.status}: ${(result.stderr ?? '').trim()}`);
  }
  return parseBackendVerdictOutput(JSON.parse(result.stdout) as unknown, 'python');
}

function decideWithBrowser(kernel: VerdictKernelInput): ComputedGoldenVerdict {
  const verifier = loadBrowserVerifier();
  return parseBackendVerdictOutput(verifier.decideFiveValueVerdict(kernel), 'browser');
}

function loadBrowserVerifier(): BrowserGoldenVerifier {
  if (browserVerifierCache !== undefined) {
    return browserVerifierCache;
  }
  const html = readFileSync(DEFAULT_BROWSER_VERIFY_HTML, 'utf8');
  const script = html.match(/<script id="far-verify-golden-standalone">([\s\S]*?)<\/script>/)?.[1];
  if (script === undefined) {
    throw new Error('browser backend script #far-verify-golden-standalone not found');
  }
  const sandbox: BrowserGoldenSandbox = {
    console,
    document: {
      addEventListener: () => undefined,
    },
  };
  createContext(sandbox);
  runInContext(script, sandbox, { filename: DEFAULT_BROWSER_VERIFY_HTML });
  if (sandbox.FARGoldenVerify === undefined) {
    throw new Error('browser backend did not expose FARGoldenVerify');
  }
  browserVerifierCache = sandbox.FARGoldenVerify;
  return sandbox.FARGoldenVerify;
}

function parseBackendVerdictOutput(raw: unknown, backend: VerifyGoldenBackend): ComputedGoldenVerdict {
  if (!isRecord(raw)) {
    throw new Error(`${backend} backend output must be an object`);
  }
  const verdict = readVerdict(raw.verdict);
  if (verdict === null) {
    throw new Error(`${backend} backend output verdict is invalid`);
  }
  if (typeof raw.decisiveRuleId !== 'string' || raw.decisiveRuleId.length === 0) {
    throw new Error(`${backend} backend output decisiveRuleId is invalid`);
  }
  if (!Array.isArray(raw.reasonCodes) || !raw.reasonCodes.every((item) => typeof item === 'string')) {
    throw new Error(`${backend} backend output reasonCodes is invalid`);
  }
  if (raw.untestedReason !== null && typeof raw.untestedReason !== 'string') {
    throw new Error(`${backend} backend output untestedReason is invalid`);
  }
  return {
    verdict,
    decisiveRuleId: raw.decisiveRuleId,
    reasonCodes: raw.reasonCodes,
    untestedReason: raw.untestedReason,
  };
}

function compareExpected(expected: GoldenVectorExpected, output: ComputedGoldenVerdict): readonly string[] {
  const errors: string[] = [];
  if (output.verdict !== expected.verdict) {
    errors.push(`verdict mismatch: expected ${expected.verdict}, got ${output.verdict}`);
  }
  if (output.decisiveRuleId !== expected.decisiveRuleId) {
    errors.push(`decisiveRuleId mismatch: expected ${expected.decisiveRuleId}, got ${output.decisiveRuleId}`);
  }
  if (!sameStringArray(output.reasonCodes, expected.reasonCodes)) {
    errors.push(
      `reasonCodes mismatch: expected ${JSON.stringify(expected.reasonCodes)}, got ${JSON.stringify(output.reasonCodes)}`,
    );
  }
  if (output.untestedReason !== expected.untestedReason) {
    errors.push(`untestedReason mismatch: expected ${expected.untestedReason}, got ${output.untestedReason}`);
  }
  return errors;
}

function parseGoldenVectorFile(
  raw: unknown,
  fallbackCaseId: string,
): { readonly ok: true; readonly case: GoldenVectorCase } | { readonly ok: false; readonly error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: `${fallbackCaseId}: root must be an object` };
  }
  const caseId = readOptionalString(raw.caseId);
  if (caseId === null || normalizeCaseId(caseId) === null) {
    return { ok: false, error: `${fallbackCaseId}: caseId must match GV-##` };
  }
  const input = raw.input;
  if (!isRecord(input)) {
    return { ok: false, error: `${caseId}: input must be an object` };
  }
  if (!Array.isArray(input.evidences)) {
    return { ok: false, error: `${caseId}: input.evidences must be an array` };
  }
  if (!isVerdictKernelInput(input.kernel)) {
    return { ok: false, error: `${caseId}: input.kernel must match VerdictKernelInput` };
  }
  const expectedRaw = raw.expected;
  if (!isRecord(expectedRaw)) {
    return { ok: false, error: `${caseId}: expected must be an object` };
  }
  const expected = readExpected(expectedRaw, caseId);
  if (!expected.ok) {
    return expected;
  }
  return {
    ok: true,
    case: {
      caseId,
      input: {
        evidences: input.evidences,
        kernel: input.kernel,
      },
      expected: expected.expected,
    },
  };
}

function readExpected(
  raw: Record<string, unknown>,
  caseId: string,
): { readonly ok: true; readonly expected: GoldenVectorExpected } | { readonly ok: false; readonly error: string } {
  const verdict = readVerdict(raw.verdict);
  if (verdict === null) {
    return { ok: false, error: `${caseId}: expected.verdict must be a known verdict` };
  }
  const decisiveRuleId = readOptionalString(raw.decisiveRuleId);
  if (decisiveRuleId === null) {
    return { ok: false, error: `${caseId}: expected.decisiveRuleId must be a non-empty string` };
  }
  if (!Array.isArray(raw.reasonCodes) || !raw.reasonCodes.every((item) => typeof item === 'string' && item.length > 0)) {
    return { ok: false, error: `${caseId}: expected.reasonCodes must be a non-empty string array` };
  }
  const untestedReason = raw.untestedReason;
  if (untestedReason !== null && typeof untestedReason !== 'string') {
    return { ok: false, error: `${caseId}: expected.untestedReason must be string or null` };
  }
  return {
    ok: true,
    expected: {
      verdict,
      decisiveRuleId,
      reasonCodes: raw.reasonCodes,
      untestedReason,
    },
  };
}

function readAllCaseIds(caseDir: string): readonly string[] {
  return readdirSync(caseDir, { encoding: 'utf8' })
    .filter((fileName) => /^GV-\d{2}\.json$/.test(fileName))
    .map((fileName) => fileName.slice(0, -'.json'.length))
    .sort();
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function failedCase(caseId: string, backend: VerifyGoldenBackend, errors: readonly string[]): VerifyGoldenCaseResult {
  return {
    caseId,
    status: 'FAIL',
    backend,
    verdict: null,
    expectedVerdict: null,
    decisiveRuleId: null,
    expectedDecisiveRuleId: null,
    reasonCodes: [],
    expectedReasonCodes: [],
    errors,
  };
}

function normalizeCaseId(caseId: string): string | null {
  const trimmed = caseId.trim();
  const withoutJson = trimmed.endsWith('.json') ? trimmed.slice(0, -'.json'.length) : trimmed;
  return CASE_ID_PATTERN.test(withoutJson) ? withoutJson : null;
}

function isVerdictKernelInput(value: unknown): value is VerdictKernelInput {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Object.hasOwn(value, 'fec') &&
    Array.isArray(value.datasetBindings) &&
    Array.isArray(value.statistics) &&
    Array.isArray(value.protocolDeviations) &&
    Array.isArray(value.antiTheaterFindings) &&
    isRecord(value.evidenceSufficiency) &&
    Array.isArray(value.contradictionSet) &&
    Array.isArray(value.integrityFlags)
  );
}

function readVerdict(value: unknown): Verdict | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (VERDICTS as readonly string[]).includes(value) ? value as Verdict : null;
}

export function buildPythonPath(): string {
  const existingPythonPath = process.env.PYTHONPATH;
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (existingPythonPath !== undefined && existingPythonPath.length > 0) {
    parts.push(existingPythonPath);
  }
  return parts.join(delimiter);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
