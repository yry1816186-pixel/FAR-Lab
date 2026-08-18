import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditTracePage from '@/pages/AuditTracePage';

vi.mock('@/lib/api_client', () => ({
  useVerdictByHypothesis: vi.fn(),
  useEvidenceChain: vi.fn(),
  useLifecycleEvents: vi.fn(),
}));

import { useVerdictByHypothesis, useEvidenceChain, useLifecycleEvents } from '@/lib/api_client';

function emptyQuery() {
  return { data: undefined, isLoading: false, isError: false, error: null } as never;
}

describe('AuditTracePage capability boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVerdictByHypothesis).mockReturnValue(emptyQuery());
    vi.mocked(useEvidenceChain).mockReturnValue(emptyQuery());
    vi.mocked(useLifecycleEvents).mockReturnValue(emptyQuery());
  });

  it('routes claim/hypothesis IDs only to verdict and lifecycle APIs', async () => {
    const user = userEvent.setup();
    render(<AuditTracePage />);

    await user.type(screen.getByRole('textbox'), 'claim-42');
    await user.click(screen.getByRole('button', { name: 'Run trace' }));

    expect(useVerdictByHypothesis).toHaveBeenLastCalledWith('claim-42');
    expect(useLifecycleEvents).toHaveBeenLastCalledWith('claim-42');
    expect(useEvidenceChain).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId('audit-chain-capability-note')).toBeInTheDocument();
    expect(screen.getByText(/does not expose a reliable hypothesis-ID/i)).toBeInTheDocument();
  });

  it('routes a 64-hex identifier only to the evidence-chain head API', async () => {
    const user = userEvent.setup();
    const hash = 'A'.repeat(64);
    render(<AuditTracePage />);

    await user.type(screen.getByRole('textbox'), hash);
    await user.click(screen.getByRole('button', { name: 'Run trace' }));

    expect(useEvidenceChain).toHaveBeenLastCalledWith(hash.toLowerCase());
    expect(useVerdictByHypothesis).toHaveBeenLastCalledWith('');
    expect(useLifecycleEvents).toHaveBeenLastCalledWith('');
    expect(screen.queryByTestId('audit-chain-capability-note')).not.toBeInTheDocument();
  });

  it('renders an honest empty state without introducing demo trace data', async () => {
    const user = userEvent.setup();
    render(<AuditTracePage />);

    await user.type(screen.getByRole('textbox'), 'missing-claim');
    await user.click(screen.getByRole('button', { name: 'Run trace' }));

    expect(screen.getByTestId('audit-empty')).toBeInTheDocument();
    expect(screen.getByText(/honest empty result/i)).toBeInTheDocument();
  });
});
