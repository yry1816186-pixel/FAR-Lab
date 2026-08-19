/**
 * assay_envelope — R3 V2 证明信封产出面（断言检验页）判别测试。
 *
 *   1. grounded 提交 → 请求体带 grounded:true（幂等键输入含 grounded——异参不复放）
 *   2. sealed 响应 → 信封面板三动作（复制/下载/前往验证）+ 复制写真实剪贴板 JSON
 *   3. skipped 响应 → 如实 fail-closed 说明（含 RULE-PE-004 原因文本）
 *   4. 未接地默认关（复选框初始未勾）
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AssayPage from '@/features/assay/AssayPage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

const SEALED_ENVELOPE = {
  schemaVersion: 'far.proof_envelope.v2',
  envelopeId: 'ENV-01TEST',
  proofHash: 'ab'.repeat(32),
  claim: { id: '01TEST', naturalLanguage: 'claim', domain: 'general_science', scope: 'x', claimType: 'quantitative' },
};

const VERDICT_NODE = {
  verdictId: 'v-1',
  evidenceId: 'e-1',
  parentNodeId: null,
  nodeKind: 'root',
  verdict: 'UNTESTED',
  falsificationSpec: { prediction: 'p', metric: 'macro_f1', falsificationThreshold: 0.8, thresholdSemantics: 'gt' },
  thresholdSpec: null,
  metricValue: 0.62,
  conflictingEvidenceCount: 0,
  scopeSlipText: null,
  untestedReason: 'no statistics',
  sourceAnchor: null,
  prevHash: 'aa'.repeat(32),
  currentHash: 'bb'.repeat(32),
  createdAt: '2026-08-19T04:00:00Z',
  updatedAt: '2026-08-19T04:00:00Z',
  decisionTrace: null,
};

function stubAssayFetch(opts: { readonly sealed: boolean; readonly capturedBodies?: string[] }) {
  return stubFetch((url, init) => {
    if (url === '/api/v1/llm-status') return okJson({ profile: null, keyConfigured: false });
    if (url === '/api/v1/hypothesize' && init?.method === 'POST') {
      opts.capturedBodies?.push(String(init.body));
      return okJson({
        loopState: { runId: 'r-1', iterationsCompleted: 1, terminated: true, terminationReason: 'max_iterations', artifacts: [], verdictNode: null, intermediateVerdicts: [], error: null },
        graphSubtree: { rootId: 'none', nodes: [], edges: [] },
        honestVerdict: VERDICT_NODE,
        reproHash: 'cd'.repeat(32),
        proofEnvelopeV2: opts.sealed ? SEALED_ENVELOPE : null,
        proofEnvelopeV2Status: opts.sealed ? 'sealed' : 'skipped',
        proofEnvelopeV2Note: opts.sealed ? null : 'validator FAIL (fail-closed, envelope not persisted): RULE-PE-004',
      });
    }
    return undefined;
  });
}

describe('AssayPage V2 envelope surface', () => {
  it('grounded checkbox is off by default and flips the request body flag', async () => {
    const user = userEvent.setup();
    const bodies: string[] = [];
    stubAssayFetch({ sealed: false, capturedBodies: bodies });
    renderWithProviders(<AssayPage />, ['/assay']);

    const box = screen.getByTestId('assay-grounded');
    expect(box).not.toBeChecked();

    await user.type(screen.getByLabelText('科学断言'), 'Does X hold on dataset Y?');
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(screen.getByTestId('assay-submit'));

    await screen.findByTestId('envelope-panel');
    expect(bodies).toHaveLength(1);
    const sent = JSON.parse(bodies[0]!) as { grounded?: boolean; idempotencyKey?: string };
    expect(sent.grounded).toBe(true);
    expect(typeof sent.idempotencyKey).toBe('string');
  });

  it('sealed response renders copy/download/verify-link; copy writes the envelope JSON to the clipboard', async () => {
    const user = userEvent.setup();
    const writes: string[] = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: (text: string) => { writes.push(text); return Promise.resolve(); } },
    });
    stubAssayFetch({ sealed: true });
    renderWithProviders(<AssayPage />, ['/assay']);

    await user.type(screen.getByLabelText('科学断言'), 'Does X hold on dataset Y?');
    await user.click(screen.getByTestId('assay-submit'));

    await screen.findByTestId('envelope-copy');
    expect(screen.getByTestId('envelope-download')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /前往验证页/ })).toHaveAttribute('href', '/verify');

    await user.click(screen.getByTestId('envelope-copy'));
    expect(writes).toHaveLength(1);
    const copied = JSON.parse(writes[0]!) as typeof SEALED_ENVELOPE;
    expect(copied.proofHash).toBe(SEALED_ENVELOPE.proofHash);
    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });

  it('skipped response renders the honest fail-closed reason (no fake envelope actions)', async () => {
    const user = userEvent.setup();
    stubAssayFetch({ sealed: false });
    renderWithProviders(<AssayPage />, ['/assay']);

    await user.type(screen.getByLabelText('科学断言'), 'Does X hold on dataset Y?');
    await user.click(screen.getByTestId('assay-submit'));

    const skipped = await screen.findByTestId('envelope-skipped');
    expect(skipped).toHaveTextContent('未封存证明信封');
    expect(skipped).toHaveTextContent('RULE-PE-004');
    expect(screen.queryByTestId('envelope-copy')).toBeNull();
  });
});
