import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runUnifiedAgentLoop } from '../src/agent/runtime.js';
import { ToolRegistry } from '../src/agent/tool.js';
import { PermissionEngine } from '../src/agent/permissions.js';
import { SessionTelemetry } from '../src/agent/telemetry.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import type { AgentLoopConfig } from '../src/agent/loop.js';

const config: AgentLoopConfig = {
  capability: 'runtime-contract',
  systemPrompt: 'test',
  task: 'finish the contract test',
  maxTurns: 2,
  resultSchema: z.object({ answer: z.string() }),
};

const deps = () => ({
  provider: createTestStubProvider([{ rawOutput: JSON.stringify({ action: 'finish', reason: 'done', result: { answer: 'ok' } }) }]),
  tools: new ToolRegistry(),
  permissions: new PermissionEngine({ rules: [{ effect: 'allow' }], defaultEffect: 'deny' }),
  sessionId: 'ags_runtime_contract_000000',
  purpose: 'test:runtime',
  emit: () => {},
  recordReceipt: () => {},
});

describe('unified agent runtime', () => {
  it('creates one telemetry owner when a caller does not provide one', async () => {
    const result = await runUnifiedAgentLoop(config, deps());
    expect(result.status).toBe('completed');
    expect(result.telemetry.summary().modelCalls).toBe(1);
  });

  it('preserves caller telemetry so conversation and kernel projections share the same lifecycle', async () => {
    const telemetry = new SessionTelemetry();
    const result = await runUnifiedAgentLoop(config, { ...deps(), telemetry });
    expect(result.telemetry).toBe(telemetry);
    expect(telemetry.summary().modelCalls).toBe(1);
  });
});
