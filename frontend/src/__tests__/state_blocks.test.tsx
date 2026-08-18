/**
 * StateBlock — first-class async states: error surfaces the machine code and
 * the backend remediation guidance verbatim; loading is announced; empty is
 * honest text, never fabricated content.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api/http.ts';
import { I18nProvider } from '@/shared/i18n/index.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, UnavailableBlock } from '@/shared/ui/StateBlock.tsx';

function wrap(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('ErrorBlock', () => {
  it('announces via role=alert with message, machine code, and verbatim guidance', () => {
    const err = new ApiError(503, 'live profile unavailable', 'court_live_profile_unavailable', null, {
      guidance: 'Set FAR_LLM_API_KEY and retry.',
    });
    wrap(<ErrorBlock error={err} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('live profile unavailable');
    expect(alert).toHaveTextContent('court_live_profile_unavailable');
    expect(alert).toHaveTextContent('Set FAR_LLM_API_KEY and retry.');
  });

  it('renders a plain Error message without inventing a code', () => {
    wrap(<ErrorBlock error={new Error('boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});

describe('LoadingBlock / EmptyBlock / UnavailableBlock', () => {
  it('loading is a polite live region', () => {
    wrap(<LoadingBlock />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('empty state renders its title', () => {
    wrap(<EmptyBlock title="暂无数据" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('unavailable state names the blocked capability with its reason', () => {
    wrap(<UnavailableBlock testId="llm-unavailable" title="需要配置实时模型" body="端点以 503 如实拒绝" />);
    const el = screen.getByTestId('llm-unavailable');
    expect(el).toHaveTextContent('需要配置实时模型');
    expect(el).toHaveTextContent('503');
  });
});
