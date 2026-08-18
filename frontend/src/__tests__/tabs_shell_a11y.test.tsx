/**
 * A11y wiring: the Tabs WAI-ARIA pattern (roving tabIndex + arrow keys) and
 * the AppShell landmarks (skip link → #main-content, labelled nav).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/app/AppShell.tsx';
import { Tabs } from '@/shared/ui/Tabs.tsx';
import { okJson, renderWithProviders, stubFetch } from './helpers.tsx';

describe('Tabs (WAI-ARIA)', () => {
  const items = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ];

  it('renders a labelled tablist with one tabbable tab', () => {
    render(<Tabs items={items} active="a" onChange={() => undefined} ariaLabel="views" />);
    expect(screen.getByRole('tablist', { name: 'views' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });

  it('arrow keys move selection and focus', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} active="a" onChange={onChange} ariaLabel="views" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('c');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('aria-controls points at the tabpanel id contract', () => {
    render(<Tabs items={items} active="a" onChange={() => undefined} ariaLabel="views" />);
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-controls', 'tabpanel-b');
  });
});

describe('AppShell landmarks', () => {
  it('exposes skip link → #main-content and a labelled primary nav', async () => {
    stubFetch((url) => {
      // Probes are bare JSON (no success envelope); app endpoints are enveloped.
      if (url === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'far-chain-api', timestamp: '2026-08-18T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/v1/llm-status') return okJson({ profile: null, keyConfigured: false });
      return undefined;
    });
    renderWithProviders(<AppShell>{<p>content</p>}</AppShell>);

    const skip = screen.getByRole('link', { name: '跳转到正文' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')).not.toBeNull();
    expect(screen.getAllByRole('navigation', { name: '主导航' }).length).toBeGreaterThan(0);

    // Runtime strip reports the real backend state (API ok / LLM offline).
    expect(await screen.findAllByTestId('runtime-api')).not.toHaveLength(0);
    const apiBadge = (await screen.findAllByTestId('runtime-api'))[0];
    expect(apiBadge).toHaveTextContent('正常');
  });
});
