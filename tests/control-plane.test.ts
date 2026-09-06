import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const roots: string[] = [];
const evidence = ['synthetic control-plane evidence'];
const write = (root: string, rel: string, value: unknown) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'far-control-plane-'));
  roots.push(root);
  write(root, '.control/ACCEPTANCE_STATUS.json', {
    items: [{ id: 'ACC-01', status: 'live_verified', target: 'live_verified', evidence }],
    gates: [{ id: 'audit', status: 'pass', evidence: evidence[0] }],
  });
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('control-plane completion summary fails closed on missing blocker ledgers', () => {
  it('rejects a missing BLOCKERS.json instead of reporting an acceptance-ready workspace', async () => {
    const { summarizeWorkspace } = await import('../zcode-harness/plugins/farlab-control-plane/lib/control.mjs');
    const summary = summarizeWorkspace(fixture(), { requireFrontier: false });
    expect(summary.acceptanceFloorReady).toBe(false);
    expect(summary.blockers.errors).toContain('Missing .control/BLOCKERS.json');
  });

  it('rejects a blocker file without a recognized items array', async () => {
    const { summarizeWorkspace } = await import('../zcode-harness/plugins/farlab-control-plane/lib/control.mjs');
    const root = fixture();
    write(root, '.control/BLOCKERS.json', {});
    const summary = summarizeWorkspace(root, { requireFrontier: false });
    expect(summary.acceptanceFloorReady).toBe(false);
    expect(summary.blockers.errors).toContain('BLOCKERS.json contains no recognized items array');
  });
});
