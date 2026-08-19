/**
 * Workbench result-region state contract (product chain flow-web F1):
 * provider failure → the loop error becomes the PRIMARY state of the result
 * region (not a footnote) — with cause + next steps, and no fabricated verdict.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import HomePage from '@/features/home/HomePage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

const LOOP_ERROR_RESPONSE = {
  loopState: {
    runId: 'r-fail-1',
    iterationsCompleted: 1,
    terminated: true,
    terminationReason: 'error',
    artifacts: [],
    verdictNode: null,
    intermediateVerdicts: [],
    error: { code: 'RETRY_EXHAUSTED', message: 'runAgentLoop: uncaught error (http_400 Arrearage: account overdue)' },
  },
  graphSubtree: { rootId: 'none', nodes: [], edges: [] },
  honestVerdict: null,
  reproHash: '0'.repeat(64),
  proofEnvelopeV2: null,
  proofEnvelopeV2Status: 'skipped',
  proofEnvelopeV2Note: 'no verdict computation captured (loop did not reach the verdict stage)',
};

describe('Workbench result region — failure as primary state', () => {
  it('loop error renders as the result-region primary alert with cause and next steps, no verdict fabricated', async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      if (url === '/api/v1/research') return okJson({ runs: [] });
      if (url === '/api/v1/hypothesize' && init?.method === 'POST') return okJson(LOOP_ERROR_RESPONSE);
      return undefined;
    });
    renderWithProviders(<HomePage />, ['/']);

    await user.type(screen.getByRole('textbox'), 'Does microplastic exposure alter soil microbiomes?');
    await user.click(screen.getByTestId('workbench-submit'));

    // 失败 = 主状态：alert 出现，含真实 code 与 provider 原因
    const alert = await screen.findByTestId('workbench-loop-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.textContent).toContain('RETRY_EXHAUSTED');
    expect(alert.textContent).toContain('Arrearage');
    // 下一步指引存在（far doctor / 离线路径）
    expect(alert.textContent).toContain('far doctor');
    // 零伪造：无五值大字、无"未产裁决"中性质疑（失败态取代之）
    expect(screen.queryByTestId('workbench-verdict')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-no-verdict')).not.toBeInTheDocument();
  });
});
