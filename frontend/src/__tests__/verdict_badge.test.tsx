/**
 * VerdictBadge — the one verdict renderer: canonical token verbatim, dual
 * channel (text + shape icon), unknown wire values rendered honestly.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '@/shared/i18n/index.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';

function renderBadge(verdict: string) {
  return render(
    <I18nProvider>
      <VerdictBadge verdict={verdict} />
    </I18nProvider>,
  );
}

describe('VerdictBadge', () => {
  it('renders the canonical token verbatim (never a translation)', () => {
    renderBadge('CONFIRMED');
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
  });

  it('pairs the token with a localized gloss (dual channel)', () => {
    renderBadge('REFUTED');
    expect(screen.getByText('REFUTED')).toBeInTheDocument();
    expect(screen.getByText('已证伪')).toBeInTheDocument();
  });

  it('carries a shape icon (color is never the only channel)', () => {
    const { container } = renderBadge('INCONCLUSIVE');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('exposes the machine value for tests and gates', () => {
    const { container } = renderBadge('DEGRADED_SCOPE');
    expect(container.querySelector('[data-verdict="DEGRADED_SCOPE"]')).not.toBeNull();
  });

  it('renders an unknown wire value verbatim instead of guessing a bucket', () => {
    const { container } = renderBadge('PROBABLY_TRUE');
    expect(screen.getByText('PROBABLY_TRUE')).toBeInTheDocument();
    expect(container.querySelector('[data-verdict="PROBABLY_TRUE"]')).not.toBeNull();
    // No fabricated gloss for an unknown value.
    expect(screen.queryByText('证据不足')).toBeNull();
  });
});
