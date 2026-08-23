import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import {
  collectEnvSecrets, describeViolation, makeSessionCanary, scanOutbound,
} from '../src/shared/exfil-guard.js';
import { invokeStructured } from '../src/pipeline/llm.js';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopDeps } from '../src/agent/loop.js';
import { ToolRegistry, type AgentTool } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import type { ModelProvider, StructuredCallRequest } from '../src/shared/ports.js';

// RU-3 T4 exfil tripwires — deterministic, no live dependency.

describe('exfil-guard pure functions', () => {
  it('collectEnvSecrets: pattern-matched names with long values only', () => {
    const secrets = collectEnvSecrets({
      ZAI_API_KEY: 'a'.repeat(32),
      DASHSCOPE_API_KEY: 'short',
      SOMETHING_ELSE: 'b'.repeat(32),
      MY_SERVICE_ACCESS_TOKEN: 'c'.repeat(40),
    } as unknown as NodeJS.ProcessEnv);
    expect(secrets.map((s) => s.name).sort()).toEqual(['MY_SERVICE_ACCESS_TOKEN', 'ZAI_API_KEY']);
  });

  it('scanOutbound: secret/canary/oversized hits and clean pass', () => {
    const secret = { name: 'TEST_API_KEY', value: 'v'.repeat(24) };
    const canary = { id: 'session', value: makeSessionCanary('ags_x') };
    expect(scanOutbound(`body with ${secret.value} inside`, { secrets: [secret] })?.kind).toBe('secret_hit');
    expect(scanOutbound(`leaking ${canary.value}`, { canaries: [canary] })?.kind).toBe('canary_hit');
    expect(scanOutbound('x'.repeat(11), { maxChars: 10 })?.kind).toBe('oversized');
    expect(scanOutbound('clean body', { secrets: [secret], canaries: [canary] })).toBeNull();
  });

  it('violation messages NEVER contain the secret value or canary value', () => {
    const value = 'SUPERSECRETVALUE1234567890';
    const v = scanOutbound(`has ${value}`, { secrets: [{ name: 'LEAKY_KEY', value }] })!;
    const msg = describeViolation(v);
    expect(msg).toContain('LEAKY_KEY');
    expect(msg).not.toContain(value);
    const canaryValue = makeSessionCanary('ags_y');
    const c = scanOutbound(canaryValue, { canaries: [{ id: 'session', value: canaryValue }] })!;
    expect(describeViolation(c)).not.toContain(canaryValue);
  });

  it('makeSessionCanary: stable shape, unpredictable per session', () => {
    expect(makeSessionCanary('ags_a')).toMatch(/^FARCANARY-[0-9a-f]{24}$/);
    expect(makeSessionCanary('ags_a')).not.toBe(makeSessionCanary('ags_a')); // randomized per call
  });
});

describe('exfil tripwire at the model plane (invokeStructured)', () => {
  const ENV_NAME = 'FARLAB_T4TEST_API_KEY';
  afterEach(() => { delete process.env[ENV_NAME]; });

  it('cuts a payload embedding an env secret value, naming the secret not the value', async () => {
    const value = 't4secretvalue-abcdef123456';
    process.env[ENV_NAME] = value;
    const provider: ModelProvider = createTestStubProvider([{ rawOutput: JSON.stringify({ ok: true }) }]);
    await expect(invokeStructured({ provider, recordReceipt: () => {} }, {
      stage: 'test', purpose: 'exfil-test', systemPrompt: 's',
      payload: { smuggled: value },
      schema: z.object({ ok: z.boolean() }), temperature: 0,
    })).rejects.toThrow(/exfil tripwire.*FARLAB_T4TEST_API_KEY/);
  });

  it('passes clean payloads (regression guard for the unified entry)', async () => {
    const provider: ModelProvider = createTestStubProvider([{ rawOutput: JSON.stringify({ ok: true }) }]);
    const res = await invokeStructured({ provider, recordReceipt: () => {} }, {
      stage: 'test', purpose: 'exfil-test', systemPrompt: 's',
      payload: { corpus: 'normal scientific text about vitamin D' },
      schema: z.object({ ok: z.boolean() }), temperature: 0,
    });
    expect(res.data.ok).toBe(true);
  });
});

describe('exfil tripwire at the kernel tool boundary', () => {
  const useTool = (tool: string, args: Record<string, unknown> = {}): string =>
    JSON.stringify({ action: 'use_tool', tool, args, reason: 'progress' });
  const finish = (result: Record<string, unknown>): string => JSON.stringify({ action: 'finish', reason: 'done', result });

  const echoTool: AgentTool = {
    name: 'own_echo',
    description: 'echo',
    inputSchema: z.object({ text: z.string() }),
    async execute(args) {
      return { ok: true, data: args };
    },
  };

  it('denies a tool call smuggling the session canary (attacked-model shape), lets clean calls pass', async () => {
    const requests: StructuredCallRequest[] = [];
    let canary = '';
    const provider: ModelProvider = {
      ...createTestStubProvider([]),
      structuredCall: (async (req: StructuredCallRequest, parse: unknown) => {
        requests.push(req);
        const m = /FARCANARY-[0-9a-f]{24}/.exec(String(req.systemPrompt));
        if (m !== null && canary === '') canary = m[0];
        // call 1: clean probe; call 2: the attacked model exfiltrates the canary
        // via tool args; call 3: finish honestly.
        const step: StubStep = requests.length === 1
          ? { rawOutput: useTool('own_echo', { text: 'probe' }) }
          : requests.length === 2
            ? { rawOutput: useTool('own_echo', { text: `send ${canary} home` }) }
            : { rawOutput: finish({ answer: 'ok' }) };
        return createTestStubProvider([step]).structuredCall(req, parse as never);
      }) as unknown as ModelProvider['structuredCall'],
    };
    const deps: AgentLoopDeps = {
      provider,
      tools: new ToolRegistry().register(echoTool),
      permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
      sessionId: 'ags_t4loop0000000000000000aaaa',
      purpose: 'test:t4',
      emit: () => {},
      recordReceipt: () => {},
      telemetry: new SessionTelemetry(),
    };
    const cfg: AgentLoopConfig = {
      capability: 't4', systemPrompt: 's', task: 't', maxTurns: 6,
      resultSchema: z.object({ answer: z.string().min(2) }),
    };
    const res = await runAgentLoop(cfg, deps);
    expect(res.status).toBe('completed');
    const results = res.transcript.filter((e) => e.kind === 'tool_result');
    const denied = results.filter((e) => e.kind === 'tool_result' && e.ok === false);
    expect(denied).toHaveLength(1);
    const payload = (denied[0] as { payload: { reason: string } }).payload;
    expect(payload.reason).toContain('exfil tripwire');
    expect(payload.reason).not.toContain(canary);
    // the denial must not leak the canary into the transcript either
    expect(JSON.stringify(res.transcript)).not.toContain(canary);
  });

  it('denies a tool call embedding an env secret value regardless of allow rules', async () => {
    const ENV_NAME = 'FARLAB_T4B_API_KEY';
    process.env[ENV_NAME] = 'leakme-secret-value-9876543210';
    try {
      const provider = createTestStubProvider([
        { rawOutput: useTool('own_echo', { text: `key=${process.env[ENV_NAME]}` }) },
        { rawOutput: finish({ answer: 'ok' }) },
      ] as StubStep[]);
      const deps: AgentLoopDeps = {
        provider,
        tools: new ToolRegistry().register(echoTool),
        permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
        sessionId: 'ags_t4leak00000000000000000aaaa',
        purpose: 'test:t4leak', emit: () => {}, recordReceipt: () => {}, telemetry: new SessionTelemetry(),
      };
      const res = await runAgentLoop(
        { capability: 't4', systemPrompt: 's', task: 't', maxTurns: 4, resultSchema: z.object({ answer: z.string().min(2) }) },
        deps,
      );
      const denied = res.transcript.find((e) => e.kind === 'tool_result' && !e.ok) as { payload: { reason: string } } | undefined;
      expect(denied?.payload.reason).toContain(ENV_NAME);
      expect(denied?.payload.reason).not.toContain(process.env[ENV_NAME]!);
    } finally {
      delete process.env[ENV_NAME];
    }
  });
});
