import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { createConversation, resolveConversationProposal } from '../src/server/conversations.js';
import { ConversationSchema } from '../src/domain/index.js';
import type { Conversation } from '../src/domain/index.js';
import { detectLoginShell, runInLoginShell } from '../src/shared/login-shell.js';
import { TerminalManager } from '../src/server/terminal.js';

/**
 * Extensibility lane (S2): the shell plane is tested against REAL processes —
 * real login shells (pwsh/powershell/cmd/bash per platform), real child exits,
 * real terminal sessions streaming real output. No shell stubs: a mocked shell
 * would prove nothing about profile inheritance, encoding or process-tree kills.
 */

let tmp: string;
let app: App;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-shell-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('detectLoginShell', () => {
  it('finds a real shell with login semantics on this platform', () => {
    const shell = detectLoginShell();
    expect(shell.program.length).toBeGreaterThan(0);
    expect(shell.displayName.length).toBeGreaterThan(0);
    if (process.platform !== 'win32') {
      // POSIX: login flag present so profile-class files load.
      expect(shell.sessionArgs).toContain('-l');
    }
  });

  it('honors FARLAB_SHELL override', () => {
    const prev = process.env.FARLAB_SHELL;
    process.env.FARLAB_SHELL = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/bash';
    const shell = detectLoginShell();
    expect(shell.program).toBe(process.env.FARLAB_SHELL);
    if (prev === undefined) delete process.env.FARLAB_SHELL; else process.env.FARLAB_SHELL = prev;
  });
});

describe('runInLoginShell (real processes)', () => {
  it('runs a command in the real login shell and returns honest stdout', async () => {
    const r = await runInLoginShell({
      command: 'node -e "console.log(\'far-shell-marker\')"',
      cwd: tmp,
      timeoutMs: 30_000,
      maxOutputChars: 4000,
    });
    expect(r.timedOut).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('far-shell-marker');
  }, 45_000);

  it('reports nonzero exit codes honestly', async () => {
    const r = await runInLoginShell({
      command: 'node -e "process.exit(3)"',
      cwd: tmp,
      timeoutMs: 30_000,
      maxOutputChars: 4000,
    });
    expect(r.exitCode).toBe(3);
  }, 45_000);

  it('kills the process tree on timeout and says so', async () => {
    const r = await runInLoginShell({
      command: 'node -e "setTimeout(()=>{},60000)"',
      cwd: tmp,
      timeoutMs: 2000,
      maxOutputChars: 4000,
    });
    expect(r.timedOut).toBe(true);
  }, 30_000);

  it('reports spawn failures honestly (spawnFailed, never success)', async () => {
    const prev = process.env.FARLAB_SHELL;
    process.env.FARLAB_SHELL = process.platform === 'win32' ? 'C:\\definitely\\not\\a\\shell.exe' : '/definitely/not/a/shell';
    try {
      const r = await runInLoginShell({ command: 'echo hi', cwd: tmp, timeoutMs: 10_000, maxOutputChars: 4000 });
      expect('spawnFailed' in r).toBe(true);
      expect(r.stderr).toContain('spawn failed');
    } finally {
      if (prev === undefined) delete process.env.FARLAB_SHELL; else process.env.FARLAB_SHELL = prev;
    }
  }, 30_000);
});

describe('TerminalManager (real sessions)', () => {
  it('spawns a login shell, streams real output, kills cleanly', async () => {
    const mgr = new TerminalManager();
    expect(mgr.enabled()).toBe(true);
    const session = mgr.create(tmp);
    expect(session.alive).toBe(true);
    expect(session.shell.program.length).toBeGreaterThan(0);

    const chunks: string[] = [];
    let exited = false;
    const sub = mgr.subscribe(session.id, (ev) => {
      if (ev.type === 'out') chunks.push(ev.data);
      else exited = true;
    });
    expect(sub).not.toBeNull();

    mgr.write(session.id, 'node -e "console.log(\'far-term-marker\')"\n');
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 45_000;
      const poll = (): void => {
        if (chunks.join('').includes('far-term-marker')) return resolve();
        if (exited || Date.now() > deadline) return reject(new Error(`marker not seen; got: ${chunks.join('').slice(0, 400)}`));
        setTimeout(poll, 200);
      };
      poll();
    });

    expect(mgr.kill(session.id)).toBe(true);
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 30_000;
      const poll = (): void => {
        if (exited) return resolve();
        if (Date.now() > deadline) return reject(new Error('session did not exit after kill'));
        setTimeout(poll, 200);
      };
      poll();
    });
    mgr.unsubscribe(session.id, () => undefined);
    mgr.closeAll();
  }, 120_000);

  it('caps concurrent sessions', () => {
    const mgr = new TerminalManager();
    const created = [];
    try {
      for (let i = 0; i < 6; i += 1) created.push(mgr.create(tmp));
      expect(() => mgr.create(tmp)).toThrow(/cap/);
    } finally {
      mgr.closeAll();
    }
  }, 60_000);
});

describe('run_command proposal (approval-gated shell execution)', () => {
  const seedRunCommand = (args: Record<string, unknown>): { convId: string; proposalId: string } => {
    const conv = createConversation(app, { title: 'shell 提案' });
    const proposalId = `act_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const withProposal: Conversation = ConversationSchema.parse({
      ...conv,
      messages: [
        ...conv.messages,
        ConversationSchema.shape.messages.element.parse({
          id: `cmsg_${Date.now().toString(36)}`,
          role: 'agent',
          content: '需要跑一条命令来核对环境。',
          proposals: [{
            id: proposalId, kind: 'run_command', title: '打印 node 版本',
            args, status: 'pending', createdAt: new Date().toISOString(),
          }],
          createdAt: new Date().toISOString(),
        }),
      ],
      updatedAt: new Date().toISOString(),
    });
    app.store.putObject('conversation', withProposal);
    return { convId: conv.id, proposalId };
  };

  it('approval executes the command in the real login shell and records exit code + output', async () => {
    const { convId, proposalId } = seedRunCommand({ command: 'node -e "console.log(\'far-prop-marker\')"', timeoutMs: 30_000 });
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: true });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('executed');
    expect(proposal?.result).toContain('退出码 0');
    expect(proposal?.result).toContain('far-prop-marker');
  }, 60_000);

  it('refuses cwd escapes before any execution', async () => {
    const { convId, proposalId } = seedRunCommand({ command: 'echo hi', cwd: '..', timeoutMs: 5000 });
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: true });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('failed');
    expect(proposal?.result).toContain('越界');
  });

  it('nonzero exit lands as failed with the code visible', async () => {
    const { convId, proposalId } = seedRunCommand({ command: 'node -e "process.exit(2)"', timeoutMs: 30_000 });
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: true });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('failed');
    expect(proposal?.result).toContain('退出码 2');
  }, 60_000);
});
