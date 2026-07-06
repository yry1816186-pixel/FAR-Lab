import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

import {
  collectVerifyGoldenDump,
  renderVerifyGoldenText,
  runVerifyGolden,
  type VerifyGoldenDump,
} from '../../src/cli/commands/verify_golden.ts';

interface BrowserGoldenCaseResult {
  readonly status: 'PASS' | 'FAIL';
  readonly backend: 'browser';
  readonly caseId: string | null;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly reasonCodes: readonly string[];
  readonly expectedVerdict: string | null;
  readonly errors: readonly string[];
}

interface BrowserGoldenOutput {
  readonly verdict: string;
  readonly decisiveRuleId: string;
  readonly reasonCodes: readonly string[];
  readonly untestedReason: string | null;
  readonly integrityFlags: readonly string[];
}

interface BrowserGoldenVerifier {
  readonly decideFiveValueVerdict: (input: unknown) => BrowserGoldenOutput;
  readonly verifyGoldenCase: (rawCase: unknown) => BrowserGoldenCaseResult;
}

interface MutableGoldenCase {
  readonly input: {
    readonly kernel: {
      readonly fec: {
        readonly scope: { timeWindow: string };
        readonly statisticalPlan: { multipleTestingCorrection: string };
        multipleTestingPlan?: {
          correction: string;
          familySize: number;
          adjustedAlpha: number;
          preregistered: boolean;
        };
      };
      integrityFlags: string[];
      antiTheaterFindings: unknown[];
    };
  };
}

interface BrowserGoldenSandbox {
  FARGoldenVerify?: BrowserGoldenVerifier;
  readonly console: Console;
  readonly document: {
    readonly addEventListener: (eventName: string, handler: () => void) => void;
  };
}

const VERIFY_GOLDEN_HTML = resolve(process.cwd(), 'frontend', 'public', 'verify_golden.html');

test('collectVerifyGoldenDump: all on-disk GV cases run through V2 kernel and pass', () => {
  const dump = collectVerifyGoldenDump();
  assert.equal(dump.status, 'PASS');
  assert.equal(dump.backend, 'node');
  assert.equal(dump.total, 14);
  assert.equal(dump.passed, 14);
  assert.equal(dump.failed, 0);
  assert.equal(dump.errors.length, 0);
  assert.ok(dump.cases.every((result) => result.status === 'PASS'));
});

test('collectVerifyGoldenDump: single GV case reports verdict and rule trace', () => {
  const dump = collectVerifyGoldenDump({ caseIds: ['GV-01'] });
  assert.equal(dump.status, 'PASS');
  assert.equal(dump.total, 1);
  const result = dump.cases[0];
  assert.ok(result);
  assert.equal(result.caseId, 'GV-01');
  assert.equal(result.verdict, 'CONFIRMED');
  assert.equal(result.decisiveRuleId, 'R7_PRIMARY_TEST_CONFIRMS');
  assert.deepEqual([...result.reasonCodes], ['R7_PRIMARY_TEST_CONFIRMS']);
});

test('collectVerifyGoldenDump: Python backend mirrors Node verdict for a GV case', () => {
  const dump = collectVerifyGoldenDump({ backend: 'python', caseIds: ['GV-02'] });
  assert.equal(dump.status, 'PASS');
  assert.equal(dump.backend, 'python');
  assert.equal(dump.total, 1);
  const result = dump.cases[0];
  assert.ok(result);
  assert.equal(result.backend, 'python');
  assert.equal(result.verdict, 'REFUTED');
  assert.equal(result.decisiveRuleId, 'R6_PRIMARY_TEST_REFUTES');
});

test('collectVerifyGoldenDump: browser backend loads offline verifier and passes all GV cases', () => {
  const dump = collectVerifyGoldenDump({ backend: 'browser' });
  assert.equal(dump.status, 'PASS');
  assert.equal(dump.backend, 'browser');
  assert.equal(dump.total, 14);
  assert.equal(dump.passed, 14);
  assert.equal(dump.failed, 0);
});

test('verify_golden.html is standalone and its browser verifier passes GV-12', () => {
  const html = readFileSync(VERIFY_GOLDEN_HTML, 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\bimport\s*\(/);

  const verifier = loadGoldenBrowserVerifier(html);
  const rawCase = JSON.parse(readFileSync('golden_vectors/cases/GV-12.json', 'utf8')) as unknown;
  const result = verifier.verifyGoldenCase(rawCase);
  assert.equal(result.status, 'PASS');
  assert.equal(result.backend, 'browser');
  assert.equal(result.caseId, 'GV-12');
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
});

test('verify_golden.html browser verifier consumes compiler FEC semantics', () => {
  const verifier = loadGoldenBrowserVerifier(readFileSync(VERIFY_GOLDEN_HTML, 'utf8'));

  const hardFailCase = readMutableGoldenCase('GV-01');
  hardFailCase.input.kernel.fec.scope.timeWindow = '';
  const hardFail = verifier.decideFiveValueVerdict(hardFailCase.input.kernel);
  assert.equal(hardFail.verdict, 'UNTESTED');
  assert.equal(hardFail.decisiveRuleId, 'R1_FEC_NOT_COMPILABLE');

  const warnCase = readMutableGoldenCase('GV-01');
  warnCase.input.kernel.fec.statisticalPlan.multipleTestingCorrection = 'none';
  warnCase.input.kernel.fec.multipleTestingPlan = {
    correction: 'bonferroni',
    familySize: 2,
    adjustedAlpha: 0.025,
    preregistered: true,
  };
  warnCase.input.kernel.integrityFlags = [];
  warnCase.input.kernel.antiTheaterFindings = [];
  const warned = verifier.decideFiveValueVerdict(warnCase.input.kernel);
  assert.equal(warned.verdict, 'INCONCLUSIVE');
  assert.equal(warned.decisiveRuleId, 'R8_INSUFFICIENT_POWER_OR_NULL');
  assert.ok(warned.integrityFlags.includes('p_hacking_risk'));
});

test('far verify-golden CLI accepts browser backend', () => {
  const result = spawnSync(
    process.execPath,
    ['src/cli/far.ts', 'verify-golden', '--backend', 'browser', '--case', 'GV-01', '--json'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as VerifyGoldenDump;
  assert.equal(parsed.status, 'PASS');
  assert.equal(parsed.backend, 'browser');
  assert.equal(parsed.total, 1);
  assert.equal(parsed.cases[0]?.verdict, 'CONFIRMED');
});

test('collectVerifyGoldenDump: expected verdict drift fails the case', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-gv-'));
  try {
    const caseDir = join(dir, 'cases');
    mkdirSync(caseDir);
    const original = readFileSync('golden_vectors/cases/GV-01.json', 'utf8');
    const drifted = original.replace('"verdict": "CONFIRMED"', '"verdict": "REFUTED"');
    writeFileSync(join(caseDir, 'GV-01.json'), drifted);

    const dump = collectVerifyGoldenDump({ caseDir });
    assert.equal(dump.status, 'FAIL');
    assert.equal(dump.total, 1);
    assert.equal(dump.failed, 1);
    const result = dump.cases[0];
    assert.ok(result);
    assert.equal(result.status, 'FAIL');
    assert.ok(
      result.errors.some((error) => /verdict mismatch/.test(error)),
      `expected verdict mismatch, got ${result.errors.join(' | ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runVerifyGolden: JSON output uses exit 0 for PASS and includes all cases', () => {
  const captured = captureStdout(() => runVerifyGolden({ json: true }));
  assert.equal(captured.code, 0);
  const parsed = JSON.parse(captured.stdout) as VerifyGoldenDump;
  assert.equal(parsed.status, 'PASS');
  assert.equal(parsed.total, 14);
  assert.equal(parsed.passed, 14);
});

test('renderVerifyGoldenText: human output names failing cases', () => {
  const text = renderVerifyGoldenText({
    status: 'FAIL',
    backend: 'node',
    caseDir: 'cases',
    total: 1,
    passed: 0,
    failed: 1,
    errors: [],
    cases: [
      {
        caseId: 'GV-99',
        status: 'FAIL',
        backend: 'node',
        verdict: null,
        expectedVerdict: null,
        decisiveRuleId: null,
        expectedDecisiveRuleId: null,
        reasonCodes: [],
        expectedReasonCodes: [],
        errors: ['missing file'],
      },
    ],
  });
  assert.match(text, /FAIL \(0\/1 passed/);
  assert.match(text, /GV-99/);
  assert.match(text, /missing file/);
});

function captureStdout(run: () => number): { readonly code: number; readonly stdout: string } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    return { code: run(), stdout: chunks.join('') };
  } finally {
    process.stdout.write = original;
  }
}

function readMutableGoldenCase(caseId: string): MutableGoldenCase {
  return JSON.parse(readFileSync(`golden_vectors/cases/${caseId}.json`, 'utf8')) as MutableGoldenCase;
}

function loadGoldenBrowserVerifier(html: string): BrowserGoldenVerifier {
  const script = html.match(/<script id="far-verify-golden-standalone">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'verify_golden.html must contain #far-verify-golden-standalone inline script');
  const sandbox: BrowserGoldenSandbox = {
    console,
    document: {
      addEventListener: () => undefined,
    },
  };
  createContext(sandbox);
  runInContext(script, sandbox, { filename: VERIFY_GOLDEN_HTML });
  assert.ok(sandbox.FARGoldenVerify, 'standalone script must expose global FARGoldenVerify');
  return sandbox.FARGoldenVerify;
}
