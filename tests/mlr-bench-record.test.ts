/**
 * MLR-Bench instrument regression locks (2026-09-06):
 *  - import-clean: the module must not execute the batch on import (ΩF-010 family —
 *    the 2026-09-05 mlr-bench had live logic at top level; asta-litqa2 got the
 *    main-guard root fix in #164, mlr-bench got it 2026-09-06);
 *  - success-record fields (#159): task/runId/agent/stage on EVERY judged row and
 *    the judge label derived from the live provider (the first max batch lost all
 *    four fields on success rows and hardcoding 'glm' — per-agent means were
 *    uncomputable from the artifact);
 *  - parseReview dimension validation (verbatim-rubric drift fails fast);
 *  - rediscovery-tasks DB_PATH follows FARLAB_DATA_DIR (#160: fresh-run batches
 *    must not open the soak-owned .far-run).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSuccessRecord, parseReview } from '../eval/mlr-bench.mjs';

describe('mlr-bench import cleanliness (ΩF-010 family)', () => {
  it('importing the module executes NOTHING (exports only, no batch side effects)', async () => {
    // a regression to top-level execution would die here on the missing-repo rubric
    // extraction (or worse, start live runs) — the import itself is the assertion
    const mod = await import('../eval/mlr-bench.mjs');
    expect(typeof mod.buildSuccessRecord).toBe('function');
    expect(typeof mod.parseReview).toBe('function');
  });
  it('running as a script still executes main (guard fires on argv[1] match)', () => {
    // The script must reach a FAIL-VISIBLE gate and exit 1 — proving the main-guard
    // routes script invocations to main(). Which gate depends on the environment
    // (CI has no .cache/repos/mlrbench clone → the rubric-extraction gate fires
    // BEFORE the provider gate; a dev box with the clone → the provider gate).
    // Keys are DELETED (not blanked): makeProvider treats '' as unknown route.
    const env = { ...process.env };
    delete env.ZAI_API_KEY;
    delete env.ZHIPU_API_KEY;
    delete env.DASHSCOPE_API_KEY;
    delete env.FARLAB_BASELINE_PROVIDER;
    try {
      const stdout = execFileSync('node', [resolve(process.cwd(), 'eval/mlr-bench.mjs'), '--dry-run'], {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      throw new Error(`expected fail-visible exit 1, got stdout: ${stdout.slice(0, 200)}`);
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
      if (err.status === undefined) throw e; // our own thrown Error, not the expected exec failure
      expect(err.status).toBe(1);
      const combined = String(err.stderr ?? '') + String(err.stdout ?? '');
      expect(combined).toMatch(/live route not ready|cannot read .*review_idea\.py/);
    }
  });
});

describe('buildSuccessRecord (#159 field lock)', () => {
  const review = {
    Consistency: { score: 7, justification: 'a' },
    Clarity: { score: 8, justification: 'b' },
    Novelty: { score: 6, justification: 'c' },
    Feasibility: { score: 7, justification: 'd' },
    Significance: { score: 5, justification: 'e' },
    OverallAssessment: { score: 7, strengths: ['s1'], weaknesses: ['w1'] },
  };
  const provider = { providerName: 'dashscope', modelId: 'qwen3.7-max' };
  it('carries task/runId/agent/stage on the success row (the dropped-fields regression)', () => {
    const r = buildSuccessRecord({ task: 'iclr2023_bands', runId: 'run_x1', agent: 'farlab', stage: 'idea', review, provider });
    expect(r.task).toBe('iclr2023_bands');
    expect(r.runId).toBe('run_x1');
    expect(r.agent).toBe('farlab');
    expect(r.stage).toBe('idea');
  });
  it('judge identity derives from the LIVE provider, never a hardcoded family label', () => {
    const r = buildSuccessRecord({ task: 't', runId: 'r', agent: 'farlab', stage: 'idea', review, provider });
    expect(r.judge).toContain('dashscope/qwen3.7-max');
    expect(r.judge).not.toContain('glm');
  });
  it('falls back to makeProvider in the judge label when providerName is absent', () => {
    const r = buildSuccessRecord({ task: 't', runId: 'r', agent: 'farlab', stage: 'idea', review, provider: { modelId: 'm' } });
    expect(r.judge).toContain('makeProvider/m');
  });
  it('maps scores/overall/strengths/weaknesses; rendering tag only on farlab rows', () => {
    const far = buildSuccessRecord({ task: 't', runId: 'r', agent: 'farlab', stage: 'proposal', review, provider });
    expect(far.scores).toEqual({ Consistency: 7, Clarity: 8, Novelty: 6, Feasibility: 7, Significance: 5, OverallAssessment: 7 });
    expect(far.overall).toBe(7);
    expect(far.strengths).toEqual(['s1']);
    expect(far.rendering).toBe('idea-proposal-v2');
    const anchor = buildSuccessRecord({ task: 't', runId: 'r', agent: 'o4-mini-2025-04-16', stage: 'idea', review, provider });
    expect(anchor.rendering).toBeUndefined();
  });
});

describe('parseReview (verbatim-rubric drift fails fast)', () => {
  const dims = ['Consistency', 'Clarity', 'Novelty', 'Feasibility', 'Significance', 'OverallAssessment'];
  const valid = {
    Consistency: { score: 7, justification: 'a' },
    Clarity: { score: 8, justification: 'b' },
    Novelty: { score: 6, justification: 'c' },
    Feasibility: { score: 7, justification: 'd' },
    Significance: { score: 5, justification: 'e' },
    OverallAssessment: { score: 7, strengths: [], weaknesses: [] },
  };
  it('accepts a well-formed review', () => {
    expect(parseReview(dims, valid)).toBe(valid);
  });
  it('rejects a dimension key set mismatch (upstream rubric rename)', () => {
    const bad = { ...valid, Soundness: valid.Novelty };
    delete (bad as Record<string, unknown>).Novelty;
    expect(parseReview(dims, bad)).toBeInstanceOf(Error);
    expect(String((parseReview(dims, bad) as Error).message)).toContain('dimension key set mismatch');
  });
  it('rejects out-of-range and non-integer scores', () => {
    expect(parseReview(dims, { ...valid, Clarity: { score: 0, justification: 'x' } })).toBeInstanceOf(Error);
    expect(parseReview(dims, { ...valid, Clarity: { score: 11, justification: 'x' } })).toBeInstanceOf(Error);
    expect(parseReview(dims, { ...valid, Clarity: { score: 7.5, justification: 'x' } })).toBeInstanceOf(Error);
  });
  it('rejects missing justification and missing OverallAssessment arrays', () => {
    expect(parseReview(dims, { ...valid, Novelty: { score: 6 } })).toBeInstanceOf(Error);
    expect(parseReview(dims, { ...valid, OverallAssessment: { score: 7 } })).toBeInstanceOf(Error);
  });
});

describe('rediscovery-tasks DB_PATH follows FARLAB_DATA_DIR (#160)', () => {
  it('resolves far.db inside FARLAB_DATA_DIR when set (isolation from soak-owned .far-run)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farlab-datadir-'));
    const out = execFileSync('node', ['--input-type=module', '-e', 'const m = await import("./eval/rediscovery-tasks.mjs"); console.log(m.DB_PATH);'], {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, FARLAB_DATA_DIR: dir },
    }).trim();
    expect(out.startsWith(dir)).toBe(true);
    expect(out.endsWith('far.db')).toBe(true);
  });
  it('defaults to .far-run/far.db without the env (historical banked runs)', () => {
    const out = execFileSync('node', ['--input-type=module', '-e', 'const m = await import("./eval/rediscovery-tasks.mjs"); console.log(m.DB_PATH);'], {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, FARLAB_DATA_DIR: '' },
    }).trim();
    expect(out.replace(/\\/g, '/')).toContain('.far-run/far.db');
  });
});
