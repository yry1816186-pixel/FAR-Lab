import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderHonestVerdict } from '../../src/falsifiability/index.ts';

test('render_emits_evidenceSufficiency', () => {
  const rendered = renderHonestVerdict({
    claim: 'claim',
    evidences: [],
    falsificationSpec: {
      prediction: 'accuracy should be at least 0.85',
      metric: 'accuracy',
      falsificationThreshold: 0.85,
      thresholdSemantics: 'gt',
    },
    thresholdSpec: {
      semantics: 'gt',
      value: 0.85,
    },
  });

  assert.equal(rendered.verdict, 'UNTESTED');
  assert.equal(rendered.untestedReason, 'EVIDENCE_MISSING');
});
