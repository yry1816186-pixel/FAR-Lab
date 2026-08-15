import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WizardPage from '@/pages/WizardPage';

/** WizardPage tests — verifies the 4-step guided verification journey. */

function renderWizard(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WizardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const HEADERS = { 'Content-Type': 'application/json' };

const SUCCESSFUL_RESPONSE = {
  loopState: {
    runId: '01KZTESTRUNID00000000',
    iterationsCompleted: 1,
    terminated: true,
    terminationReason: 'feedback_converged',
    artifacts: [
      { stageId: 'stage1_understanding', payloadKind: 'understanding', structured: { problemStatement: 'Test problem' } },
      { stageId: 'stage2_integration', payloadKind: 'integration', structured: { summary: 'Test integration' } },
      { stageId: 'stage3_hypothesis', payloadKind: 'hypothesis', structured: { prediction: 'Test prediction' } },
      { stageId: 'stage4_evidence', payloadKind: 'experiment', structured: { measurementSummary: 'Test measurement' } },
      { stageId: 'stage5_plan', payloadKind: 'plan', structured: { summary: 'Test plan' } },
      { stageId: 'stage6_feedback', payloadKind: 'feedback', structured: { verdict: 'CONFIRMED' } },
    ],
  },
  graphSubtree: { rootId: 'root', nodes: [{ id: 'root' }], edges: [] },
  honestVerdict: {
    verdictId: '01KZTESTVERDICTID000000',
    verdict: 'CONFIRMED',
    falsificationSpec: { prediction: 'Test prediction', metric: 'accuracy', falsificationThreshold: 0.72 },
    metricValue: 0.85,
    untestedReason: null,
  },
  reproHash: 'abc123def456'.repeat(8),
  traceGrade: null,
};

describe('WizardPage', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('renders the wizard landing (step 0 — input)', () => {
    renderWizard();
    expect(screen.getByTestId('wizard-page')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-input')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-claim-input')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-run')).toBeInTheDocument();
  });

  it('shows three preset claim buttons', () => {
    renderWizard();
    expect(screen.getByTestId('wizard-preset-catalysis')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-preset-astronomy')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-preset-ml benchmark')).toBeInTheDocument();
  });

  it('updates the claim text when typing', async () => {
    const user = userEvent.setup();
    renderWizard();
    const input = screen.getByTestId('wizard-claim-input') as HTMLTextAreaElement;
    await user.clear(input);
    await user.type(input, 'My custom claim');
    expect(input.value).toBe('My custom claim');
  });

  it('switches to preset claim on button click', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByTestId('wizard-preset-astronomy'));
    const input = screen.getByTestId('wizard-claim-input') as HTMLTextAreaElement;
    expect(input.value).toContain('TESS');
  });

  it('advances through the pipeline to verdict and proof on successful API call', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      void input;
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    renderWizard();

    // Step 0 → click run
    await user.click(screen.getByTestId('wizard-run'));

    // Should reach step 2 (verdict) after the pipeline
    // NOTE: the page intentionally holds step 1 for 1500ms so judges see the
    // 6-stage pipeline animate; default waitFor timeout (1000ms) is too short.
    await waitFor(
      () => {
        expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    // Verdict badge should show CONFIRMED
    expect(screen.getByText(/CONFIRMED/i)).toBeInTheDocument();

    // Advance to proof step
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument();
    });

    // Repro hash should be visible
    expect(screen.getByTestId('wizard-repro-hash')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-repro-hash').textContent).toContain('abc123');

    // Copy button works
    const writeText = vi.fn();
    // jsdom navigator.clipboard is a read-only getter — defineProperty, not assign
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByTestId('wizard-copy-hash'));
    expect(writeText).toHaveBeenCalled();
  });

  it('displays error state on API failure', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      return new Response(JSON.stringify({ message: 'Server error' }), { status: 500, headers: HEADERS });
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Verification failed/i)).toBeInTheDocument();
  });

  it('shows start-over button on the proof step that resets to step 0', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    // 1500ms deliberate pipeline hold — see note in the pipeline test above.
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    await user.click(screen.getByText(/Start over/i));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-input')).toBeInTheDocument();
    });
  });

  // ---------- R-04: Step4 闭环 — Next steps 卡片(保存/导出/分享/复检) ----------

  it('renders the Next steps card with save/export/share/re-verify actions on the proof step', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    // R-04: Next steps card renders with all four action buttons
    expect(screen.getByTestId('wizard-next-steps')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-save-receipt')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-copy-export')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-copy-share')).toBeInTheDocument();
    // Re-verify link points at the receipt page
    const reverifyLink = screen.getByTestId('wizard-reverify-link');
    expect(reverifyLink).toBeInTheDocument();
    expect(reverifyLink.getAttribute('href')).toBe('/v2-receipt');
  });

  it('saves to receipts and shows the receipt id on success (R-04 persist闭环)', async () => {
    const user = userEvent.setup();
    // Distinguish the persist POST from the hypothesize POST by URL.
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      const url = String(input);
      if (url.includes('/api/v2/receipts')) {
        return new Response(
          JSON.stringify({ ok: true, data: { receiptId: 'rcpt-saved-001', idempotent: false } }),
          { status: 201, headers: HEADERS },
        );
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    // Click save → persists via POST /api/v2/receipts → success shows receiptId
    await user.click(screen.getByTestId('wizard-save-receipt'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-save-receipt')).toHaveTextContent('Saved to receipts');
    });
    expect(screen.getByText(/rcpt-saved-001/)).toBeInTheDocument();
  });

  it('sends complete 11-kind manifestMembers when saving (counter-case 1 闭环修复)', async () => {
    const user = userEvent.setup();
    // 捕获 persist POST 请求体,验证 manifestMembers 包含全部 11 个必填 kind。
    let persistBody: {
      manifestMembers?: Array<{ kind: string; digest: string; sizeBytes: number }>;
    } | null = null;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      const url = String(input);
      if (url.includes('/api/v2/receipts') && init?.method === 'POST') {
        persistBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ ok: true, data: { receiptId: 'rcpt-saved-001', idempotent: false } }),
          { status: 201, headers: HEADERS },
        );
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    await user.click(screen.getByTestId('wizard-save-receipt'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-save-receipt')).toHaveTextContent('Saved to receipts');
    });

    // counter-case 1:manifestMembers 包含全部 11 个必填 kind(确保复检 processConformance=PASS)
    expect(persistBody).not.toBeNull();
    const members = persistBody!.manifestMembers;
    expect(members).toBeDefined();
    expect(members!.length).toBe(11);

    const kinds = members!.map((m) => m.kind);
    const expectedKinds = [
      'claim', 'fecSnapshot', 'protocolFreeze', 'datasetBindings', 'workflowBindings',
      'experimentRuns', 'measurementResults', 'statisticalResults', 'verdictTrace',
      'antiTheaterReport', 'ledgerRoot',
    ];
    for (const kind of expectedKinds) {
      expect(kinds).toContain(kind);
    }
    // 每个 digest 为合法 64-hex SHA-256(后端 verifyReceiptManifest 的 HEX64 校验)
    for (const m of members!) {
      expect(m.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(m.sizeBytes).toBe(32); // SHA-256 = 32 bytes
    }
  }, 15000);

  it('copies the export command and share link to clipboard (R-04 导出/分享)', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    // Export command copy
    await user.click(screen.getByTestId('wizard-copy-export'));
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls.at(-1)?.[0]).toContain('far export far-proof');

    // Share link copy
    await user.click(screen.getByTestId('wizard-copy-share'));
    expect(writeText.mock.calls.at(-1)?.[0]).toContain('/v2-receipt?runId=');
  });

  it('downloads a .far-proof bundle via Blob + browser download (counter-case 5)', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith('/llm-status')) {
        return new Response(JSON.stringify({ ok: true, data: { profile: 'competition_aliyun_qwen', keyConfigured: true } }), { status: 200, headers: HEADERS });
      }
      return new Response(JSON.stringify({ ok: true, data: SUCCESSFUL_RESPONSE }), { status: 200, headers: HEADERS });
    });
    // jsdom 不实现 URL.createObjectURL / anchor.click —— 手工 mock。
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));
    await waitFor(
      () => expect(screen.getByTestId('wizard-step-verdict')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    await user.click(screen.getByText(/See proof/i));
    await waitFor(() => expect(screen.getByTestId('wizard-step-proof')).toBeInTheDocument());

    // Click download → triggers Blob + anchor click
    await user.click(screen.getByTestId('wizard-download-proof'));
    await waitFor(() => {
      expect(screen.getByTestId('wizard-download-proof')).toHaveTextContent(/downloaded/i);
    });

    // Blob URL was created and revoked
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    // Anchor was clicked (browser download triggered)
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Download filename contains runId prefix.
    // mockImplementation(() => {}) types instances as void → cast through unknown.
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toContain('far-proof-');

    clickSpy.mockRestore();
  }, 15000);
});
