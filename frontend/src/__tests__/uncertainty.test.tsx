// frontend/src/__tests__/uncertainty.test.tsx
// UX-UNCERTAINTY-001 验收（机器可测子集）：schema 校验 + 覆盖 + 误导措辞 review +
// 组件渲染绑定。真实用户理解度属 T1 可用性测试，不在此冒充。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  MISLEADING_PHRASES,
  UNCERTAINTY_KINDS,
  UNCERTAINTY_TEMPLATES,
  UncertaintyDisclosureSchema,
  describeVerdictUncertainty,
  renderUncertaintyNote,
  reviewWording,
} from '@/lib/uncertainty';
import { VerdictBadge } from '@/components/VerdictBadge';
import type { VerdictValue } from '@/lib/types';

describe('UX-UNCERTAINTY-001: schema', () => {
  it('五种不确定性 kind 的模板全部通过 schema', () => {
    for (const kind of UNCERTAINTY_KINDS) {
      const parsed = UncertaintyDisclosureSchema.safeParse(UNCERTAINTY_TEMPLATES[kind]);
      expect(parsed.success, kind).toBe(true);
    }
  });

  it('缺字段/空串/未知 kind 被 schema 拒绝（fail-closed）', () => {
    expect(UncertaintyDisclosureSchema.safeParse({ kind: 'not_run', whatIsKnown: '', whatIsUnknown: 'x', nextStep: 'y' }).success).toBe(false);
    expect(UncertaintyDisclosureSchema.safeParse({ kind: 'mystery', whatIsKnown: 'a', whatIsUnknown: 'x', nextStep: 'y' }).success).toBe(false);
    expect(UncertaintyDisclosureSchema.safeParse({ kind: 'not_run', whatIsKnown: 'a', whatIsUnknown: 'x' }).success).toBe(false);
  });
});

describe('UX-UNCERTAINTY-001: 覆盖（comprehension 机器子集）', () => {
  it('三个非决定性裁决都有披露；两个决定性裁决没有', () => {
    const nonDeterministic: VerdictValue[] = ['INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'];
    for (const v of nonDeterministic) {
      expect(describeVerdictUncertainty(v), v).not.toBeNull();
    }
    expect(describeVerdictUncertainty('CONFIRMED')).toBeNull();
    expect(describeVerdictUncertainty('REFUTED')).toBeNull();
  });

  it('每份披露三段式具体非空（已知道/还不知道/如何减少）', () => {
    for (const kind of UNCERTAINTY_KINDS) {
      const d = UNCERTAINTY_TEMPLATES[kind];
      expect(d.whatIsKnown.length, kind).toBeGreaterThan(10);
      expect(d.whatIsUnknown.length, kind).toBeGreaterThan(10);
      expect(d.nextStep.length, kind).toBeGreaterThan(10);
    }
  });
});

describe('UX-UNCERTAINTY-001: 误导措辞 review', () => {
  it('每个误导短语都有命中反例（规则表非装饰）', () => {
    const probes = [
      'this proves the hypothesis',
      'the result is proven',
      'the pipeline guarantees correctness',
      'the evidence is irrefutable',
      'the claim holds beyond doubt',
      'the model is 100% accurate',
      '该证据证明了结论',
      '结果保证正确',
      '结论毋庸置疑',
    ];
    expect(probes.length).toBe(MISLEADING_PHRASES.length);
    for (const p of probes) {
      expect(reviewWording(p).length, p).toBeGreaterThanOrEqual(1);
    }
  });

  it('裁决系统词汇与诚实文案不误伤（反例锁定的特异性）', () => {
    expect(reviewWording('Confirmed — evidence supports the claim at the preregistered threshold')).toEqual([]);
    expect(reviewWording('Inconclusive — evidence did not reach the decision threshold')).toEqual([]);
    expect(reviewWording('Refuted — the falsification check failed as predicted')).toEqual([]);
    expect(reviewWording('Untested — no check has run yet')).toEqual([]);
  });

  it('全部披露模板自身通过措辞审查（SSOT 文案零误导短语）', () => {
    for (const kind of UNCERTAINTY_KINDS) {
      const d = UNCERTAINTY_TEMPLATES[kind];
      const text = renderUncertaintyNote(d);
      expect(reviewWording(text), `${kind}: ${text}`).toEqual([]);
    }
  });
});

describe('UX-UNCERTAINTY-001: 组件渲染绑定', () => {
  it('VerdictBadge 带 uncertaintyNote 时渲染披露文本（可查询）', () => {
    const d = describeVerdictUncertainty('INCONCLUSIVE')!;
    render(<VerdictBadge decision="INCONCLUSIVE" uncertaintyNote={renderUncertaintyNote(d)} />);
    const note = screen.getByTestId('verdict-uncertainty-note');
    expect(note.textContent).toContain('Known:');
    expect(note.textContent).toContain('Unknown:');
    expect(note.textContent).toContain('To reduce:');
  });

  it('不带 note 时不渲染披露节点（opt-in，不污染紧凑布局）', () => {
    render(<VerdictBadge decision="INCONCLUSIVE" />);
    expect(screen.queryByTestId('verdict-uncertainty-note')).toBeNull();
  });
});
