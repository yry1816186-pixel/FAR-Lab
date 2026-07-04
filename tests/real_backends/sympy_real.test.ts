import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SymPyCasBackend } from '../../src/math/cas_backend.ts';
import { Z3SmtBackend } from '../../src/math/smt_backend.ts';

test('SymPy real backend verifies and refutes expanded polynomial identities', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }

  const previousPythonPath = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previousPythonPath);
  try {
    const probe = spawnSync(
      pythonCommand,
      ['-c', 'import sympy; print(sympy.__version__)'],
      { encoding: 'utf8' },
    );
    if (probe.status !== 0) {
      t.skip(`sympy import failed for ${pythonCommand}: ${(probe.stderr ?? '').trim()}`);
      return;
    }

    const sympyVersion = probe.stdout.trim();
    const backend = new SymPyCasBackend({ pythonCommand, sympyVersion });
    assert.equal(backend.isAvailable(), true);

    const verified = await backend.verify({
      expression: JSON.stringify({ lhs: '(x + 1)**2', rhs: 'x**2 + 2*x + 1' }),
      expectedOutcome: 'verified',
      mode: 'expand',
    });
    assert.equal(verified.outcome, 'verified');
    assert.equal(verified.backendKind, 'cas');
    assert.match(verified.backendId, /^sympy@/);
    assert.match(verified.compileLog ?? '', /expand; sympy=/);
    assert.match(verified.outputArtifact ?? '', /lhs_expanded/);

    const refuted = await backend.verify({
      expression: JSON.stringify({ lhs: '(x + 1)**2', rhs: 'x**2 + 1' }),
      expectedOutcome: 'verified',
      mode: 'expand',
    });
    assert.equal(refuted.outcome, 'refuted');
    assert.match(refuted.outputArtifact ?? '', /rhs_expanded/);
  } finally {
    if (previousPythonPath === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = previousPythonPath;
    }
  }
});

test('Z3 real Python backend verifies SMT-LIB satisfiability and refutation', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }

  const previousPythonPath = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previousPythonPath);
  try {
    const probe = spawnSync(
      pythonCommand,
      ['-c', 'import z3; print(z3.get_version_string())'],
      { encoding: 'utf8' },
    );
    if (probe.status !== 0) {
      t.skip(`z3-solver import failed for ${pythonCommand}: ${(probe.stderr ?? '').trim()}`);
      return;
    }

    const z3Version = probe.stdout.trim();
    const backend = new Z3SmtBackend({
      z3Command: '__far_missing_z3_cli__',
      pythonCommand,
      versionOverride: z3Version,
    });
    assert.equal(backend.isAvailable(), true);

    const theorem = await backend.verify({
      expression: JSON.stringify({
        query: 'unsat',
        script: [
          '(set-logic QF_LIA)',
          '(declare-const x Int)',
          '(assert (not (=> (> x 0) (> x (- 1)))))',
        ].join('\n'),
      }),
      expectedOutcome: 'verified',
    });
    assert.equal(theorem.outcome, 'verified');
    assert.equal(theorem.backendKind, 'smt');
    assert.equal(theorem.backendId, `z3@${z3Version}`);
    assert.match(theorem.outputArtifact ?? '', /unsat/);
    assert.match(theorem.compileLog ?? '', /z3-solver=/);

    const refuted = await backend.verify({
      expression: JSON.stringify({
        query: 'unsat',
        script: [
          '(set-logic QF_LIA)',
          '(declare-const x Int)',
          '(assert (> x 3))',
        ].join('\n'),
      }),
      expectedOutcome: 'verified',
    });
    assert.equal(refuted.outcome, 'refuted');
    assert.match(refuted.outputArtifact ?? '', /sat/);
  } finally {
    if (previousPythonPath === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = previousPythonPath;
    }
  }
});

function findPythonCommand(): string | null {
  for (const command of ['python3', 'python']) {
    const result = spawnSync(command, ['-c', 'import sys; print(sys.version)'], {
      encoding: 'utf8',
    });
    if (result.error === undefined && result.status === 0) {
      return command;
    }
  }
  return null;
}

function buildPythonPath(previousPythonPath: string | undefined): string {
  const parts = [
    resolve('repro'),
    resolve('.python-deps'),
  ];
  if (previousPythonPath !== undefined && previousPythonPath.length > 0) {
    parts.push(previousPythonPath);
  }
  return parts.join(delimiter);
}
