import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve('zcode-harness/scripts/completion-gate.mjs');
const roots: string[] = [];
const evidence = ['synthetic test fixture: exercised command with exit 0'];
const accepted = () => ({
  items: [{ id: 'ACC-01', status: 'live_verified', target: 'live_verified', evidence }],
  gates: [{ id: 'independent-audit', satisfied: true, evidence: evidence[0] }],
});
const write = (root: string, file: string, value: unknown) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'far-completion-synthetic-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.control'));
  fs.mkdirSync(path.join(root, 'project-spec'));
  fs.writeFileSync(path.join(root, 'project-spec/ACCEPTANCE.md'), '| ID | Criterion | Target |\n| ACC-01 | Synthetic acceptance contract | live_verified + benchmark artifact |\n');
  write(root, '.control/ACCEPTANCE_STATUS.json', accepted());
  write(root, '.control/BLOCKERS.json', { items: [] });
  write(root, 'FINAL_ACCEPTANCE.json', { items: [{ id: 'FA-T-01', status: 'PASS', evidence }] });
  return root;
};
const run = (root: string, args: string[] = []) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  expect(result.stderr).toBe('');
  return { exit: result.status, report: JSON.parse(result.stdout) };
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('completion gate fails closed on lost or corrupted evidence ledgers', () => {
  it('distinguishes the acceptance floor from final mission completion', () => {
    const root = fixture();
    write(root, 'FINAL_ACCEPTANCE.json', { currentVerdict: 'READY (stale prose)', items: [{ id: 'FA-T-01', status: 'PARTIAL', evidence }] });
    const floor = run(root);
    expect(floor.exit).toBe(0);
    expect(floor.report.scope).toBe('acceptance_floor');
    const final = run(root, ['--final']);
    expect(final.exit).toBe(1);
    expect(final.report.verdict).toBe('NOT_READY');
    expect(final.report.missing).toContainEqual({ id: 'FA-T-01', kind: 'final-acceptance', status: 'PARTIAL', target: 'PASS' });
  });

  it.each([{}, null, [], { items: [] }, { items: [], gates: [] }])('rejects a missing or empty acceptance inventory: %j', (value) => {
    const root = fixture();
    write(root, '.control/ACCEPTANCE_STATUS.json', value);
    expect(run(root).exit).toBe(1);
  });

  it.each([{}, null, [], { items: null }])('rejects a missing blocker inventory: %j', (value) => {
    const root = fixture();
    write(root, '.control/BLOCKERS.json', value);
    expect(run(root).exit).toBe(1);
  });

  it('cannot remove a canonical item, lower its target or make it optional in the status ledger', () => {
    const root = fixture();
    fs.appendFileSync(path.join(root, 'project-spec/ACCEPTANCE.md'), '| ACC-02 | Another required capability | tested |\n');
    expect(run(root).report.errors).toContain('missing-canonical-item:ACC-02');
    const value = accepted();
    value.items[0]!.target = 'implemented';
    value.items[0]!.status = 'implemented';
    write(root, '.control/ACCEPTANCE_STATUS.json', value);
    expect(run(root).report.errors).toContain('target-below-contract:ACC-01:implemented:live_verified');
    write(root, '.control/ACCEPTANCE_STATUS.json', { ...accepted(), items: [{ ...accepted().items[0], optional: true }] });
    expect(run(root).report.errors).toContain('canonical-item-marked-optional:ACC-01');
  });

  it('rejects duplicate IDs and evidence made only of empty strings', () => {
    const root = fixture();
    const value = accepted();
    value.items[0]!.evidence = [' '];
    value.items.push(value.items[0]!);
    value.gates[0]!.evidence = ' ';
    write(root, '.control/ACCEPTANCE_STATUS.json', value);
    const result = run(root);
    expect(result.exit).toBe(1);
    expect(result.report.errors).toEqual(expect.arrayContaining([
      'duplicate-id:acceptance-items:ACC-01', 'status-without-evidence:ACC-01', 'gate-without-evidence:independent-audit',
    ]));
  });

  it('rejects malformed entries without throwing instead of producing a verdict', () => {
    const root = fixture();
    write(root, '.control/ACCEPTANCE_STATUS.json', { items: [null], gates: [42] });
    write(root, '.control/BLOCKERS.json', { items: [null, { id: 'B-01', status: 'RESOVLED', critical: true }] });
    expect(run(root).exit).toBe(1);
  });

  it('blocks every unresolved critical state, even if it is not literally OPEN', () => {
    const root = fixture();
    write(root, '.control/BLOCKERS.json', { items: [{ id: 'B-01', status: 'DRAFTED_PENDING_USER_REVIEW', critical: true }] });
    expect(run(root).exit).toBe(1);
  });

  it('requires a readable canonical acceptance contract', () => {
    const root = fixture();
    fs.unlinkSync(path.join(root, 'project-spec/ACCEPTANCE.md'));
    expect(run(root).exit).toBe(1);
  });

  it('keeps hosted evidence contracts binding on a resolved blocker', () => {
    const root = fixture();
    const item = { id: 'B-HOSTED', status: 'RESOLVED', critical: true, requiredEvidence: { sourceSha: null }, resolutionEvidence: { sourceSha: 'short-sha' } };
    write(root, '.control/BLOCKERS.json', { items: [item] });
    expect(run(root).report.errors).toContain('resolved-blocker-source-sha-missing:B-HOSTED');
    item.resolutionEvidence.sourceSha = 'a'.repeat(40);
    write(root, '.control/BLOCKERS.json', { items: [item] });
    expect(run(root).exit).toBe(0);
  });

  it.each(['FAIL', 'PARTIAL', 'BLOCKED_EXTERNAL', 'UNKNOWN'])('keeps final completion red for %s', (status) => {
    const root = fixture();
    write(root, 'FINAL_ACCEPTANCE.json', { items: [{ id: 'FA-T-01', status, evidence }] });
    expect(run(root, ['--final']).exit).toBe(1);
  });

  it('requires final inventory and evidence before passing the final mode', () => {
    const root = fixture();
    expect(run(root, ['--final']).exit).toBe(0);
    write(root, 'FINAL_ACCEPTANCE.json', { items: [] });
    expect(run(root, ['--final']).exit).toBe(1);
    write(root, 'FINAL_ACCEPTANCE.json', { items: [{ id: 'FA-T-01', status: 'PASS', evidence: [] }] });
    expect(run(root, ['--final']).exit).toBe(1);
    fs.unlinkSync(path.join(root, 'FINAL_ACCEPTANCE.json'));
    expect(run(root, ['--final']).exit).toBe(1);
  });
});
