import { describe, it, expect } from 'vitest';
import {
  ToolIntegrationSchema, ToolIntegrationDraftSchema, instantiateDraft, integrationSemanticIssues,
  maskIntegrationSecrets, maskSecret,
  type ToolIntegration, type ToolIntegrationDraft,
} from '../src/domain/tool-integration.js';

const base = {
  id: 'tint_abcdefghjkmnpqrstvwxyz12',
  label: 'demo',
  enabled: true,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
  createdBy: 'researcher',
} as const;

const mk = (over: Record<string, unknown>): ToolIntegration =>
  ToolIntegrationSchema.parse({ ...base, kind: 'skill', name: 'demo', description: 'd', body: 'b', ...over });

describe('tool integration schema', () => {
  it('parses each kind and fills defaults', () => {
    const skill = mk({ kind: 'skill' });
    expect(skill.kind).toBe('skill');
    expect(skill.priority).toBe(0);

    const cmd = mk({ kind: 'command', name: 'find-gaps', template: 'find evidence gaps about {{topic}}' });
    expect(cmd.scope).toBe('both');

    const mcp = mk({ kind: 'mcp_server', transport: 'stdio', command: 'node' });
    expect(mcp.args).toEqual([]);
    expect(mcp.env).toEqual({});
    expect(mcp.riskClass).toBe('execute');
    expect(mcp.timeoutMs).toBe(30_000);
  });

  it('rejects malformed ids and unknown kinds', () => {
    expect(ToolIntegrationSchema.safeParse({ ...base, kind: 'skill', name: 'x', description: 'd', body: 'b', id: 'bad' }).success).toBe(false);
    expect(ToolIntegrationSchema.safeParse({ ...base, kind: 'plugin_loader', name: 'x', description: 'd', body: 'b' }).success).toBe(false);
  });

  it('semantic issues: transport field requirements', () => {
    const stdioNoCmd = mk({ kind: 'mcp_server', transport: 'stdio' });
    expect(integrationSemanticIssues(stdioNoCmd)).toContain('stdio transport requires a command');

    const httpNoUrl = mk({ kind: 'mcp_server', transport: 'http' });
    expect(integrationSemanticIssues(httpNoUrl)).toContain('http transport requires a url');

    const ok = mk({ kind: 'mcp_server', transport: 'http', url: 'https://example.test/mcp' });
    expect(integrationSemanticIssues(ok)).toEqual([]);
  });

  it('semantic issues: hook event/action compatibility', () => {
    const emptyMatch = mk({ kind: 'hook_rule', event: 'before_tool', match: {}, action: { type: 'log' } });
    expect(integrationSemanticIssues(emptyMatch)).toContain('match requires toolPattern and/or riskClass');

    const turnEndBlock = mk({ kind: 'hook_rule', event: 'turn_end', match: { toolPattern: 'x' }, action: { type: 'block', reason: 'no' } });
    expect(integrationSemanticIssues(turnEndBlock)).toContain('turn_end rules can only log');

    const afterBlock = mk({ kind: 'hook_rule', event: 'after_tool', match: { toolPattern: 'x' }, action: { type: 'block', reason: 'no' } });
    expect(integrationSemanticIssues(afterBlock)).toHaveLength(1);
  });

  it('drafts omit identity; instantiateDraft assigns it and re-checks semantics', () => {
    const draft = ToolIntegrationDraftSchema.parse({
      kind: 'skill', label: 'L', enabled: true, name: 'demo-skill', description: 'd', body: 'b',
    } satisfies Record<string, unknown>) as ToolIntegrationDraft;
    expect('id' in draft).toBe(false);
    expect('createdBy' in draft).toBe(false);

    const stored = instantiateDraft(draft, { id: 'tint_abcdefghjkmnpqrstvwxyz99', createdBy: 'conversation', provenance: { conversationId: 'conv_abc123', messageId: 'cmsg_1' } });
    expect(stored.id).toBe('tint_abcdefghjkmnpqrstvwxyz99');
    expect(stored.createdBy).toBe('conversation');
    expect(stored.provenance?.conversationId).toBe('conv_abc123');
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const bad = ToolIntegrationDraftSchema.parse({ kind: 'mcp_server', transport: 'stdio', label: 'L', enabled: true }) as ToolIntegrationDraft;
    expect(() => instantiateDraft(bad, { id: 'tint_abcdefghjkmnpqrstvwxyz98', createdBy: 'researcher' })).toThrow(/requires a command/);
  });

  it('masking: env/header values masked, other kinds pass through', () => {
    const secret = mk({
      kind: 'mcp_server', transport: 'stdio', command: 'node',
      env: { API_KEY: 'sk-1234567890' }, headers: { Authorization: 'Bearer abcdef' },
    });
    const masked = maskIntegrationSecrets(secret);
    expect(masked.kind === 'mcp_server' && masked.env.API_KEY).toBe('••••7890');
    expect(masked.kind === 'mcp_server' && masked.headers.Authorization).toBe('••••cdef');
    // original untouched (projection is a copy)
    expect(secret.kind === 'mcp_server' && secret.env.API_KEY).toBe('sk-1234567890');

    const skill = mk({ kind: 'skill' });
    expect(maskIntegrationSecrets(skill)).toBe(skill);
    expect(maskSecret('')).toBe('');
    expect(maskSecret('k')).toBe('••••k');
  });
});
