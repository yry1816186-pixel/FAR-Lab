import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { createConversation, resolveConversationProposal } from '../src/server/conversations.js';
import { ConversationSchema, CreateToolIntegrationArgsSchema } from '../src/domain/index.js';
import type { Conversation } from '../src/domain/index.js';

/**
 * TIS T4: conversation-staged tool configs. The deterministic half of the flow
 * — resolveConversationProposal on a pending create_tool_integration card — is
 * driven directly against the real store (no model call: proposal execution is
 * deterministic by design). The model-side drafting rides the existing
 * propose_action machinery (agent-mcp/conversations suites cover the loop).
 */

let tmp: string;
let app: App;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-tool-props-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
});

afterAll(() => { app.close(); });

const draftArgs = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  draft: {
    kind: 'mcp_server', label: 'ArXiv 全文', transport: 'stdio',
    command: 'npx', args: ['-y', '@example/arxiv-mcp'], enabled: true,
  },
  rationale: '研究者需要 arXiv 全文抓取',
  warnings: ['需要本机安装 Node 与 npx 可用'],
  ...over,
});

/** Seed a conversation holding one pending create_tool_integration proposal. */
const seedProposal = (args: Record<string, unknown>): { convId: string; proposalId: string } => {
  const conv = createConversation(app, { title: '工具接入' });
  const proposalId = `act_${Date.now().toString(36)}`;
  const withProposal: Conversation = ConversationSchema.parse({
    ...conv,
    messages: [
      ...conv.messages,
      ConversationSchema.shape.messages.element.parse({
        id: `cmsg_${Date.now().toString(36)}`,
        role: 'agent',
        content: '我起草了一个工具配置，请审查。',
        proposals: [{
          id: proposalId, kind: 'create_tool_integration', title: '接入 ArXiv MCP 服务器',
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

describe('create_tool_integration args schema', () => {
  it('validates drafts, requires rationale, defaults warnings', () => {
    const parsed = CreateToolIntegrationArgsSchema.parse(draftArgs());
    expect(parsed.warnings).toEqual(['需要本机安装 Node 与 npx 可用']);
    expect(parsed.draft.kind).toBe('mcp_server');
    expect(CreateToolIntegrationArgsSchema.safeParse({ draft: { kind: 'skill', label: 'L', name: 'x2', description: 'd', body: 'b', enabled: true } }).success).toBe(false);
  });
});

describe('resolveConversationProposal: create_tool_integration', () => {
  it('approval stores the integration DISABLED with conversation provenance', async () => {
    const { convId, proposalId } = seedProposal(draftArgs());
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: true });
    // conversation state machine
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('executed');
    // stored integration — enabled forced off even though the draft said true
    const integrations = app.store.listObjects('tool_integration', '__none__');
    const created = integrations.find((i) => i.label === 'ArXiv 全文');
    expect(created).toBeDefined();
    expect(created?.enabled).toBe(false);
    expect(created?.createdBy).toBe('conversation');
    expect(created?.provenance?.conversationId).toBe(convId);
  });

  it('rejection leaves the store untouched and marks the proposal rejected', async () => {
    const before = app.store.listObjects('tool_integration', '__none__').length;
    const { convId, proposalId } = seedProposal(draftArgs({ draft: { kind: 'command', label: 'C', name: 'demo-cmd', template: 't', enabled: true } }));
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: false });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('rejected');
    expect(app.store.listObjects('tool_integration', '__none__').length).toBe(before);
  });

  it('a semantically invalid draft fails honestly (status failed, nothing stored)', async () => {
    const before = app.store.listObjects('tool_integration', '__none__').length;
    const { convId, proposalId } = seedProposal(draftArgs({ draft: { kind: 'mcp_server', label: '坏', transport: 'stdio', enabled: true } }));
    const updated = await resolveConversationProposal(app, convId, proposalId, { approve: true });
    const proposal = updated.messages.flatMap((m) => m.proposals ?? []).find((p) => p.id === proposalId);
    expect(proposal?.status).toBe('failed');
    expect(proposal?.result).toContain('requires a command');
    expect(app.store.listObjects('tool_integration', '__none__').length).toBe(before);
  });

  it('double-resolution is refused (409-shaped state machine)', async () => {
    const { convId, proposalId } = seedProposal(draftArgs());
    await resolveConversationProposal(app, convId, proposalId, { approve: true });
    await expect(resolveConversationProposal(app, convId, proposalId, { approve: true })).rejects.toThrow(/already executed/);
  });
});
