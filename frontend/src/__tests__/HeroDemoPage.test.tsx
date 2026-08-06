/**
 * HeroDemoPage.test.tsx — tests for the 60-second tamper detection hero demo.
 *
 * Verifies:
 *   1. Initial render shows clean state (exit 0)
 *   2. Clicking "Tamper" transitions to detected state (exit 7)
 *   3. Clicking "Reset" returns to clean state
 *   4. Hash chain computation runs in the browser (Web Crypto)
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeroDemoPage from '@/pages/HeroDemoPage';

describe('HeroDemoPage', () => {
  it('renders with clean chain status on initial load', async () => {
    render(<HeroDemoPage />);

    // Header
    expect(screen.getByText('Tamper detection in action')).toBeInTheDocument();

    // Wait for hash computation to settle
    await waitFor(() => {
      expect(screen.getByTestId('chain-status')).toHaveTextContent('CLEAN');
    });

    // Exit code badge shows exit 0
    expect(screen.getByTestId('exit-code-badge')).toHaveTextContent('exit 0');

    // Tamper button is present
    expect(screen.getByTestId('tamper-button')).toBeInTheDocument();
  });

  it('transitions to TAMPER DETECTED after clicking tamper button', async () => {
    render(<HeroDemoPage />);

    // Wait for initial clean state
    await waitFor(() => {
      expect(screen.getByTestId('chain-status')).toHaveTextContent('CLEAN');
    });

    // Click tamper button
    fireEvent.click(screen.getByTestId('tamper-button'));

    // State should transition to detected after the 800ms delay
    await waitFor(
      () => {
        expect(screen.getByTestId('chain-status')).toHaveTextContent('TAMPER DETECTED');
      },
      { timeout: 3000 },
    );

    // Exit code should now be 7
    expect(screen.getByTestId('exit-code-badge')).toHaveTextContent('exit 7');

    // Evidence item ev-2 should show as modified
    const ev2 = screen.getByTestId('evidence-ev-2');
    expect(ev2).toHaveTextContent('Modified');

    // Explanation card should appear
    expect(screen.getByTestId('explanation')).toBeInTheDocument();
  });

  it('returns to clean state after clicking reset', async () => {
    render(<HeroDemoPage />);

    // Wait for initial clean state
    await waitFor(() => {
      expect(screen.getByTestId('chain-status')).toHaveTextContent('CLEAN');
    });

    // Tamper first
    fireEvent.click(screen.getByTestId('tamper-button'));
    await waitFor(
      () => {
        expect(screen.getByTestId('chain-status')).toHaveTextContent('TAMPER DETECTED');
      },
      { timeout: 3000 },
    );

    // Reset
    fireEvent.click(screen.getByTestId('reset-button'));

    // Should return to clean
    await waitFor(() => {
      expect(screen.getByTestId('chain-status')).toHaveTextContent('CLEAN');
    });
    expect(screen.getByTestId('exit-code-badge')).toHaveTextContent('exit 0');
  });

  it('displays the scientific claim C-MMLU-A-0001', () => {
    render(<HeroDemoPage />);
    expect(screen.getByText('Claim C-MMLU-A-0001')).toBeInTheDocument();
  });
});
