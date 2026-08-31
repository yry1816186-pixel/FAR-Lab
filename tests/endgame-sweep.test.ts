import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'zcode-harness', 'scripts', 'endgame-sweep.mjs');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const ledgerPath = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-endgame-sweep-'));
  tempDirs.push(dir);
  return path.join(dir, 'SWEEP-LOG.json');
};

const run = (log: string, command: string, args: string[] = []) => spawnSync(
  process.execPath,
  [SCRIPT, command, '--root', ROOT, '--log', log, ...args],
  { cwd: ROOT, encoding: 'utf8' },
);

const runAt = (root: string, log: string, command: string, args: string[] = []) => spawnSync(
  process.execPath,
  [SCRIPT, command, '--root', root, '--log', log, ...args],
  { cwd: root, encoding: 'utf8' },
);

const fixtureRepo = (): { root: string; log: string } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'far-endgame-fixture-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'src', 'value.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'tests', 'value.test.ts'), 'expect(value).toBeTruthy();\n');
  fs.writeFileSync(path.join(root, 'FINAL_ACCEPTANCE.json'), JSON.stringify({ items: [{ id: 'FA-T-01' }] }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=FAR Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  return { root, log: path.join(root, '.control', 'SWEEP-LOG.json') };
};

describe('endgame sweep ledger (real Git inventory)', () => {
  it('builds five disjoint full-coverage tables and backfills every FA id', () => {
    const log = ledgerPath();
    const synced = run(log, 'sync');
    expect(synced.status, synced.stderr).toBe(0);
    const value = JSON.parse(fs.readFileSync(log, 'utf8')) as {
      schema: string;
      tables: Record<string, Array<{ path: string; status: string }>>;
      shallowAssertions: unknown[];
      acceptanceLinks: Array<{ faId: string }>;
    };
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
    const inventoried = Object.values(value.tables).flat();
    expect(value.schema).toBe('endgame-sweep/1');
    expect(Object.keys(value.tables).sort()).toEqual([
      'delivery_operations',
      'governance_assets',
      'product_specs_docs',
      'runtime',
      'tests_evaluation_evidence',
    ]);
    expect(inventoried).toHaveLength(tracked.length);
    expect(new Set(inventoried.map((entry) => entry.path)).size).toBe(tracked.length);
    expect(value.shallowAssertions.length).toBeGreaterThan(0);
    expect(value.acceptanceLinks.length).toBe(
      (JSON.parse(fs.readFileSync(path.join(ROOT, 'FINAL_ACCEPTANCE.json'), 'utf8')) as { items: unknown[] }).items.length,
    );
    const checked = run(log, 'check');
    expect(checked.status, checked.stderr).toBe(0);
  });

  it('keeps completion red until file reviews and shallow assertions are adjudicated', () => {
    const log = ledgerPath();
    expect(run(log, 'sync').status).toBe(0);
    const incomplete = run(log, 'check', ['--require-complete']);
    expect(incomplete.status).toBe(1);
    expect(incomplete.stderr).toMatch(/pending_assertions=[1-9]\d*/);
    expect(incomplete.stderr).toContain('incomplete review status pending');
  });

  it('requires FA-first finding links and rationale/evidence for adjudication states', () => {
    const log = ledgerPath();
    expect(run(log, 'sync').status).toBe(0);
    // Use a public, always-shipped governance input. AGENTS.md is intentionally
    // absent from public source snapshots and must not be a hidden test fixture.
    const governedPath = 'package.json';

    const unknownFinding = run(log, 'record', ['--path', governedPath, '--status', 'finding_open', '--fa', 'FA-NOT-REAL']);
    expect(unknownFinding.status).toBe(1);
    expect(unknownFinding.stderr).toContain('add the finding to FINAL_ACCEPTANCE.json before linking it');

    const value = JSON.parse(fs.readFileSync(log, 'utf8')) as { shallowAssertions: Array<{ id: string }> };
    const id = value.shallowAssertions[0]!.id;
    const missingRationale = run(log, 'assertion', ['--id', id, '--status', 'justified']);
    expect(missingRationale.status).toBe(1);
    expect(missingRationale.stderr).toContain('justified requires --rationale');
    expect(run(log, 'assertion', ['--id', id, '--status', 'justified', '--rationale', 'Presence itself is the explicit contract in this test.']).status).toBe(0);
    expect(run(log, 'record', ['--path', governedPath, '--status', 'reviewed_clean', '--evidence', 'manual package contract review']).status).toBe(0);
    expect(run(log, 'check').status).toBe(0);
  });

  it('invalidates changed file reviews and keeps removed pending assertions unresolved', () => {
    const fixture = fixtureRepo();
    expect(runAt(fixture.root, fixture.log, 'sync').status).toBe(0);
    expect(runAt(fixture.root, fixture.log, 'record', ['--path', 'src/value.ts', '--status', 'reviewed_clean']).status).toBe(0);

    fs.writeFileSync(path.join(fixture.root, 'src', 'value.ts'), 'export const value = 2;\n');
    const stale = runAt(fixture.root, fixture.log, 'check');
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('working-tree content changed since sync');
    expect(runAt(fixture.root, fixture.log, 'sync').status).toBe(0);
    const afterChange = JSON.parse(fs.readFileSync(fixture.log, 'utf8')) as { tables: Record<string, Array<{ path: string; status: string }>> };
    expect(Object.values(afterChange.tables).flat().find((entry) => entry.path === 'src/value.ts')?.status).toBe('pending');

    const beforeRemoval = JSON.parse(fs.readFileSync(fixture.log, 'utf8')) as { shallowAssertions: Array<{ id: string }> };
    const removedId = beforeRemoval.shallowAssertions[0]!.id;
    fs.writeFileSync(path.join(fixture.root, 'tests', 'value.test.ts'), 'expect(value).toBe(1);\n');
    expect(runAt(fixture.root, fixture.log, 'sync').status).toBe(0);
    const afterRemoval = JSON.parse(fs.readFileSync(fixture.log, 'utf8')) as { retiredAssertions: Array<{ id: string; status: string }> };
    expect(afterRemoval.retiredAssertions).toContainEqual(expect.objectContaining({ id: removedId, status: 'pending' }));
    const incomplete = runAt(fixture.root, fixture.log, 'check', ['--require-complete']);
    expect(incomplete.stderr).toContain('pending_assertions=1');
    expect(runAt(fixture.root, fixture.log, 'assertion', ['--id', removedId, '--status', 'strengthened', '--evidence', 'tests/value.test.ts now asserts the exact value']).status).toBe(0);
  });

  it('does not allow an open FA-linked finding to be relabelled clean', () => {
    const fixture = fixtureRepo();
    expect(runAt(fixture.root, fixture.log, 'sync').status).toBe(0);
    expect(runAt(fixture.root, fixture.log, 'record', ['--path', 'src/value.ts', '--status', 'finding_open', '--fa', 'FA-T-01']).status).toBe(0);
    const bypass = runAt(fixture.root, fixture.log, 'record', ['--path', 'src/value.ts', '--status', 'reviewed_clean']);
    expect(bypass.status).toBe(1);
    expect(bypass.stderr).toContain('must transition through finding_fixed');
    expect(runAt(fixture.root, fixture.log, 'record', ['--path', 'src/value.ts', '--status', 'finding_fixed', '--fa', 'FA-T-01', '--evidence', 'tests/value.test.ts']).status).toBe(0);
  });
});
