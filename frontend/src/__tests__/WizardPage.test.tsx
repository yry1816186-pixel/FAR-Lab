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
      void input;
      return new Response(JSON.stringify(SUCCESSFUL_RESPONSE), { status: 200, headers: HEADERS });
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
    vi.mocked(fetch).mockImplementation(async () =>
      new Response(JSON.stringify({ message: 'Server error' }), { status: 500, headers: HEADERS }),
    );
    renderWizard();

    await user.click(screen.getByTestId('wizard-run'));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Verification failed/i)).toBeInTheDocument();
  });

  it('shows start-over button on the proof step that resets to step 0', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async () =>
      new Response(JSON.stringify(SUCCESSFUL_RESPONSE), { status: 200, headers: HEADERS }),
    );
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
});
