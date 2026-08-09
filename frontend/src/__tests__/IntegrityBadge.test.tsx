/**
 * IntegrityBadge.test.tsx — IC-11 诚实边界标识验收。
 *
 * 验收 Oracle(合同 contract-011):
 *   ① 各 datasetSource 状态有可见区分(label/tone/data-source 互不相同);
 *   ② 后端未标注/非法值 → 显式 unknown 态(不猜测);
 *   ③ note 透传呈现。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IntegrityBadge } from '../components/IntegrityBadge';

describe('IntegrityBadge (IC-11)', () => {
  it('四个 datasetSource 状态均有可见区分', () => {
    const cases = [
      ['online', 'Live'],
      ['cached_fixture', 'Cached reference'],
      ['replay', 'Replay'],
      ['fixture', 'Reference data'],
    ] as const;
    const seen = new Set<string>();
    for (const [source, label] of cases) {
      const { container, unmount } = render(<IntegrityBadge source={source} />);
      const el = screen.getByTestId(`integrity-badge-${source}`);
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent(label);
      expect(el.getAttribute('data-source')).toBe(source);
      seen.add(el.className);
      unmount();
      expect(container).toBeDefined();
    }
    expect(seen.size, '四态视觉须互不相同').toBe(4);
  });

  it('后端未标注/非法值 → 显式 unknown(不猜测)', () => {
    render(<IntegrityBadge source={null} />);
    const el = screen.getByTestId('integrity-badge-unknown');
    expect(el).toHaveTextContent('Unknown source');
    expect(el.getAttribute('data-source')).toBe('unknown');
  });

  it('非法字符串同样落入 unknown', () => {
    render(<IntegrityBadge source="mystery" />);
    expect(screen.getByTestId('integrity-badge-unknown')).toBeInTheDocument();
  });

  it('note 透传呈现', () => {
    render(<IntegrityBadge source="replay" note="reference note" />);
    expect(screen.getByTestId('integrity-badge-replay')).toHaveTextContent('reference note');
  });
});
