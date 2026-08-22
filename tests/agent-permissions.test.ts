import { describe, it, expect } from 'vitest';
import { PermissionEngine } from '../src/agent/permissions.js';

describe('permission engine (deny > ask > allow, fail-closed)', () => {
  it('applies the first matching rule in order', async () => {
    const engine = new PermissionEngine({
      rules: [
        { tool: 'exec', effect: 'deny', note: 'no shell' },
        { tool: 'search', effect: 'allow' },
      ],
    });
    expect((await engine.decide('exec', {})).effect).toBe('deny');
    expect((await engine.decide('search', { q: 'x' })).effect).toBe('allow');
  });

  it('fails closed on unmatched tools (default deny)', async () => {
    const engine = new PermissionEngine({ rules: [{ tool: 'search', effect: 'allow' }] });
    const d = await engine.decide('unlisted_tool', {});
    expect(d.effect).toBe('deny');
    expect(d.cachedGrant).toBe(false);
  });

  it('evaluates argsMatch only on tool match', async () => {
    const engine = new PermissionEngine({
      rules: [{ tool: 'search', argsMatch: (a) => (a as { limit: number }).limit <= 5, effect: 'allow' }],
      defaultEffect: 'deny',
    });
    expect((await engine.decide('search', { limit: 3 })).effect).toBe('allow');
    expect((await engine.decide('search', { limit: 50 })).effect).toBe('deny');
    expect((await engine.decide('other', { limit: 3 })).effect).toBe('deny');
  });

  it('ask without a handler degrades to deny (headless default)', async () => {
    const engine = new PermissionEngine({ defaultEffect: 'ask' });
    const d = await engine.decide('anything', {});
    expect(d.effect).toBe('deny');
    expect(d.rule).toMatch(/ask-without-handler/);
  });

  it('grants via ask handler, caches per exact args, and expires after TTL', async () => {
    let now = 1_000_000;
    const asked: Array<{ tool: string; args: unknown }> = [];
    const engine = new PermissionEngine({
      defaultEffect: 'ask',
      ask: async (tool, args) => { asked.push({ tool, args }); return true; },
      approvalTtlMs: 100,
      now: () => now,
    });
    const first = await engine.decide('exec', { cmd: 'ls', cwd: '/tmp' });
    expect(first.effect).toBe('allow');
    expect(first.asked).toBe(true);

    now += 50; // still valid — same tool+args
    const cached = await engine.decide('exec', { cmd: 'ls', cwd: '/tmp' });
    expect(cached.effect).toBe('allow');
    expect(cached.cachedGrant).toBe(true);
    expect(asked.length).toBe(1);

    // different args => approval does NOT generalize (exact-context binding)
    const other = await engine.decide('exec', { cmd: 'rm -rf /', cwd: '/tmp' });
    expect(other.cachedGrant).toBe(false);
    expect(asked.length).toBe(2);

    now += 60; // total 110ms > TTL 100ms — the first grant is dead
    const expired = await engine.decide('exec', { cmd: 'ls', cwd: '/tmp' });
    expect(expired.cachedGrant).toBe(false);
    expect(expired.effect).toBe('allow'); // ask handler grants again (asked.length now 3)
    expect(asked.length).toBe(3);
  });

  it('key-order differences in args do not create new approvals (canonical key)', async () => {
    const now = 0;
    let asks = 0;
    const engine = new PermissionEngine({
      defaultEffect: 'ask',
      ask: async () => { asks += 1; return true; },
      now: () => now,
    });
    await engine.decide('t', { a: 1, b: 2 });
    const d = await engine.decide('t', { b: 2, a: 1 });
    expect(d.cachedGrant).toBe(true);
    expect(asks).toBe(1);
  });

  it('a denied ask never authorizes and is not cached', async () => {
    const engine = new PermissionEngine({ defaultEffect: 'ask', ask: async () => false });
    const d = await engine.decide('t', {});
    expect(d.effect).toBe('deny');
    expect(d.asked).toBe(true);
    const d2 = await engine.decide('t', {});
    expect(d2.effect).toBe('deny');
  });
});
