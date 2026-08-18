/**
 * Assay gate truthfulness — court/arena are live-only instruments. Without a
 * configured key the page states the requirement up front (the backend would
 * 503); with one, the real form renders. The claim tab is always available.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import AssayPage from '@/features/assay/AssayPage.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

function stubLlm(keyConfigured: boolean) {
  return stubFetch((url) => (url === '/api/v1/llm-status' ? okJson({ profile: keyConfigured ? 'zhipu' : null, keyConfigured }) : undefined));
}

describe('AssayPage live gate', () => {
  it('the claim tab renders without any LLM requirement', async () => {
    stubLlm(false);
    renderWithProviders(<AssayPage />, ['/assay']);
    expect(screen.getByLabelText('科学断言')).toBeInTheDocument();
    expect(screen.queryByTestId('llm-unavailable')).toBeNull();
  });

  it('the court tab states the live-key requirement when unconfigured', async () => {
    stubLlm(false);
    renderWithProviders(<AssayPage />, ['/assay']);
    await userEvent.click(screen.getByRole('tab', { name: '跨模型法庭' }));
    const gate = await screen.findByTestId('llm-unavailable');
    expect(gate).toHaveTextContent('需要配置实时模型');
    // The form is not rendered behind the gate — no dead controls.
    expect(screen.queryByTestId('court-submit')).toBeNull();
  });

  it('the arena tab states the live-key requirement when unconfigured', async () => {
    stubLlm(false);
    renderWithProviders(<AssayPage />, ['/assay']);
    await userEvent.click(screen.getByRole('tab', { name: '对抗竞技场' }));
    expect(await screen.findByTestId('llm-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('arena-submit')).toBeNull();
  });

  it('with a configured key the real court form renders', async () => {
    stubLlm(true);
    renderWithProviders(<AssayPage />, ['/assay']);
    await userEvent.click(screen.getByRole('tab', { name: '跨模型法庭' }));
    expect(await screen.findByTestId('court-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('llm-unavailable')).toBeNull();
  });
});
