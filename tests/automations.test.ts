import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { startAutomationEngine } from '../src/server/automations.js';
import { createConversation, postConversationMessage } from '../src/server/conversations.js';
import { ResearchQuestion } from '../src/domain/index.js';

/**
 * Automation engine (resident-agent R3) at the service level, fully offline:
 * schedule triggers respect their interval clock (persisted, resumable),
 * run_completed triggers fire once per new completed run (dedupe), fired turns
 * are REAL kernel turns leaving visible automation + agent messages, failures
 * are recorded honestly, and remembered action grants are IGNORED in automated
 * context (an unattended loop never spends without a human gate).
 */

const finishTurn = (reply: string): StubStep => ({
  rawOutput: JSON.stringify({
    action: 'finish',
    reason: 'scripted',
    result: { reply, clarifyingQuestions: [], candidates: [], readyToConverge: false },
  }),
});
const proposeLaunch = (): StubStep => ({
  rawOutput: JSON.stringify({
    action: 'use_tool', tool: 'propose_action', reason: 'scripted',
    args: { kind: 'launch_research', title: '自动触发的行动', args: { question: '自动化回合提出的另一个研究问题？' } },
  }),
});

let app: Awaited<ReturnType<typeof createApp>>;
const openApps: Array<Awaited<ReturnType<typeof createApp>>> = [];
const engines: Array<() => void> = [];

beforeAll(() => { /* apps/engines created per-test */ });

afterAll(() => {
  for (const stop of engines) stop();
  for (const a of openApps) a.close();
});

const T0 = Date.parse('2026-08-23T10:00:00Z');
const at = (offsetMs: number): Date => new Date(T0 + offsetMs);
/** Minimal completed run for run_completed triggers (store-level, no pipeline). */
const seedCompletedRun = (createdAt: Date): string => {
  const question = ResearchQuestion.parse({
    id: `q_${Math.random().toString(36).slice(2, 28).padEnd(20, '0')}`,
    text: '自动化触发测试研究问题', background: '', goalType: 'explanatory',
    scope: { domain: 'test', phenomena: ['x'] }, constraints: {}, createdAt: createdAt.toISOString(),
  });
  const run = app.store.createRun(question, {}, createdAt.toISOString());
  app.store.updateRun({ ...run, status: 'completed' });
  return run.id;
};

describe('automation engine (offline, scripted kernel turns)', () => {
  it('fires schedule automations only when due, records visible turns, resumes from persisted clock', async () => {
    const steps: StubStep[] = [finishTurn('定时简评：一切正常。')];
    app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-auto-')), providerOverride: createTestStubProvider(steps) });
    const conv = createConversation(app, { title: '自动化测试' });
    const created = at(0);
    app.store.putObject('automation', {
      id: 'auto_schedulertest0000000000', conversationId: conv.id, label: '每分钟巡检',
      trigger: { kind: 'schedule', intervalMinutes: 1 }, task: '给一句话工作区状态简评',
      enabled: true, maxTurnsPerFire: 4, fireCount: 0, notifiedRunIds: [],
      createdAt: created.toISOString(), updatedAt: created.toISOString(),
    });
    const engine = startAutomationEngine(app, {
      createRun: async () => { throw new Error('not needed in this test'); },
      now: () => at(0),
    });
    engines.push(engine.stop);

    // before the interval elapses: no fire
    expect(await engine.tick(at(30_000))).toBe(0);
    // due: fires exactly once, leaves automation notice + agent reply
    expect(await engine.tick(at(61_000))).toBe(1);
    const fired = app.store.getObject('conversation', conv.id)!;
    const roles = fired.messages.map((m) => m.role);
    expect(roles).toContain('automation');
    expect(roles).toContain('agent');
    expect(fired.messages.at(-1)?.content).toContain('定时简评');
    expect(fired.messages.filter((m) => m.role === 'automation').at(-1)?.content).toContain('每分钟巡检');
    const auto = app.store.getObject('automation', 'auto_schedulertest0000000000')!;
    expect(auto.fireCount).toBe(1);
    expect(auto.lastFiredAt).toBe(at(61_000).toISOString());
    // dedupe within the same interval window
    expect(await engine.tick(at(90_000))).toBe(0);
    // next interval elapses → fires again (script exhausted: honest failure path)
    expect(await engine.tick(at(122_000))).toBe(1);
    const failed = app.store.getObject('conversation', conv.id)!;
    const failureNotice = failed.messages.filter((m) => m.role === 'automation').at(-1)?.content ?? '';
    expect(failureNotice).toMatch(/失败|触发异常/);
    expect(app.store.getObject('automation', 'auto_schedulertest0000000000')!.fireCount).toBe(2);
    engine.stop();

  });

  it('fires run_completed once per NEW completed run (created after the automation), dedupes across ticks', async () => {
    const steps: StubStep[] = [
      finishTurn('首个完成的简评。'),
      finishTurn('第二个完成的简评。'),
    ];
    app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-auto-')), providerOverride: createTestStubProvider(steps) });
    const conv = createConversation(app, { title: '完成触发测试' });
    const created = at(0);
    app.store.putObject('automation', {
      id: 'auto_runcompletetest0000000', conversationId: conv.id, label: '完成简评',
      trigger: { kind: 'run_completed' }, task: '总结刚完成的研究',
      enabled: true, maxTurnsPerFire: 4, fireCount: 0, notifiedRunIds: [],
      createdAt: created.toISOString(), updatedAt: created.toISOString(),
    });
    const engine = startAutomationEngine(app, {
      createRun: async () => { throw new Error('not needed in this test'); },
      now: () => at(0),
    });
    engines.push(engine.stop);

    // a run created BEFORE the automation exists is not its business
    const oldRun = seedCompletedRun(new Date(T0 - 60_000));
    expect(await engine.tick(at(1_000))).toBe(0);
    // a new completed run fires once...
    const newRun = seedCompletedRun(at(500));
    expect(await engine.tick(at(2_000))).toBe(1);
    const autoAfterFirst = app.store.getObject('automation', 'auto_runcompletetest0000000')!;
    expect(autoAfterFirst.notifiedRunIds).toEqual([newRun]);
    // ...and never again for the same run
    expect(await engine.tick(at(3_000))).toBe(0);
    expect(autoAfterFirst.fireCount).toBe(1);
    // another completion fires again; the notice names the run honestly
    seedCompletedRun(at(4_000));
    expect(await engine.tick(at(5_000))).toBe(1);
    const convAfter = app.store.getObject('conversation', conv.id)!;
    const notice = convAfter.messages.filter((m) => m.role === 'automation').at(0)?.content ?? '';
    expect(notice).toContain('已完成');
    void oldRun;
    engine.stop();

  });

  it('NEVER auto-executes proposals from automated turns — remembered grants do not apply unattended', async () => {
    const steps: StubStep[] = [proposeLaunch(), finishTurn('我提议了一个行动，等待批准。')];
    app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-auto-')), providerOverride: createTestStubProvider(steps) });
    const conv = createConversation(app, { title: '免批安全测试' });
    // the researcher remembers launch_research — but that grant is HUMAN-turn-scoped
    app.store.putObject('conversation', { ...conv, autoApprove: ['launch_research'] });
    const created = at(0);
    app.store.putObject('automation', {
      id: 'auto_autogate00000000000000', conversationId: conv.id, label: '自动巡检',
      trigger: { kind: 'schedule', intervalMinutes: 1 }, task: '检查并提议行动',
      enabled: true, maxTurnsPerFire: 4, fireCount: 0, notifiedRunIds: [],
      createdAt: created.toISOString(), updatedAt: created.toISOString(),
    });
    const engine = startAutomationEngine(app, {
      createRun: async () => { throw new Error('must not be called'); },
      now: () => at(0),
    });
    engines.push(engine.stop);
    expect(await engine.tick(at(61_000))).toBe(1);
    const after = app.store.getObject('conversation', conv.id)!;
    const proposal = after.messages.flatMap((m) => m.proposals ?? [])[0];
    expect(proposal).toBeDefined();
    expect(proposal.status).toBe('pending'); // NOT executed despite the remembered grant
    expect(proposal.autoApproved).toBeUndefined();
    expect(after.runIds).toHaveLength(0);
    engine.stop();

  });

  it('disables orphaned automations loudly instead of firing into a deleted conversation', async () => {
    const steps: StubStep[] = [];
    app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-auto-')), providerOverride: createTestStubProvider(steps) });
    const conv = createConversation(app, { title: '孤儿测试' });
    app.store.putObject('automation', {
      id: 'auto_orphan000000000000000', conversationId: conv.id, label: '孤儿',
      trigger: { kind: 'schedule', intervalMinutes: 1 }, task: '不应触发',
      enabled: true, maxTurnsPerFire: 4, fireCount: 0, notifiedRunIds: [],
      createdAt: at(0).toISOString(), updatedAt: at(0).toISOString(),
    });
    app.store.deleteObject('conversation', conv.id);
    const engine = startAutomationEngine(app, {
      createRun: async () => { throw new Error('not needed'); },
      now: () => at(0),
    });
    engines.push(engine.stop);
    expect(await engine.tick(at(61_000))).toBe(0);
    expect(app.store.getObject('automation', 'auto_orphan000000000000000')!.enabled).toBe(false);
    engine.stop();

  });
});

// keep the human-turn path honest too: a remembered grant DOES auto-execute on a human turn
describe('remembered grants on human turns', () => {
  it('executes immediately after a researcher turn (same path the HTTP test covers)', async () => {
    const steps: StubStep[] = [
      proposeLaunch(),
      finishTurn('已按你的免批设置执行。'),
    ];
    app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-auto-')), providerOverride: createTestStubProvider(steps) });
    const conv = createConversation(app, { title: '免批执行' });
    app.store.putObject('conversation', { ...conv, autoApprove: ['launch_research'] });
    const updated = await postConversationMessage(app, conv.id, { text: '直接启动这个研究' }, {
      createRun: async () => 'run_scriptedlaunch000000000000',
    });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? [])[0]!;
    expect(proposal.status).toBe('executed');
    expect(proposal.autoApproved).toBe(true);
    expect(updated.runIds).toContain('run_scriptedlaunch000000000000');
  });
});
