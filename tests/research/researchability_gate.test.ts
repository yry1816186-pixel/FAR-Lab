// tests/research/researchability_gate.test.ts
// Researchability Gate (§9.1) deterministic screening regression tests:
//   - out-of-scope prompts (creative writing / chit-chat / empty) → UNSUPPORTED
//   - dangerous chemistry / dual-use directions → UNSUPPORTED + safety reason
//   - human-subject / personal-data directions → LIMITED + requiresEthicsGate
//   - scientific questions pass with a domain hint; no false positive on
//     legitimate uses of "explosive" (e.g. explosive stellar transients).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessResearchabilityDeterministic,
  ResearchabilityBlockedError,
} from '../../src/research/researchability_gate.ts';

describe('assessResearchabilityDeterministic', () => {
  test('empty question → UNSUPPORTED', () => {
    const r = assessResearchabilityDeterministic('   ');
    assert.equal(r.verdict, 'UNSUPPORTED');
    assert.ok(r.reasons.some((x) => x.includes('empty')));
  });

  test('creative-writing prompt → UNSUPPORTED (not a research question)', () => {
    const r = assessResearchabilityDeterministic('write a poem about stars');
    assert.equal(r.verdict, 'UNSUPPORTED');
    assert.ok(r.reasons.some((x) => x.includes('not a research question')));
  });

  test('chit-chat prompt → UNSUPPORTED', () => {
    const r = assessResearchabilityDeterministic('what is your name');
    assert.equal(r.verdict, 'UNSUPPORTED');
  });

  test('dangerous chemistry (explosives synthesis) → UNSUPPORTED + safety reason', () => {
    const r = assessResearchabilityDeterministic('How can we synthesize high explosives efficiently?');
    assert.equal(r.verdict, 'UNSUPPORTED');
    assert.ok(r.safetyRisks.includes('dangerous chemistry'));
    assert.ok(r.reasons.some((x) => x.includes('safety screen')));
  });

  test('reverse-order explosives pattern also blocks', () => {
    const r = assessResearchabilityDeterministic('high explosives manufacturing at scale');
    assert.equal(r.verdict, 'UNSUPPORTED');
    assert.ok(r.safetyRisks.includes('dangerous chemistry'));
  });

  test('gain-of-function → requiresEthicsGate (human-subject class)', () => {
    const r = assessResearchabilityDeterministic('Does gain-of-function research on coronaviruses improve pandemic preparedness?');
    assert.ok(r.requiresEthicsGate);
  });

  test('clinical trial direction → requiresEthicsGate', () => {
    const r = assessResearchabilityDeterministic('Should we run a clinical trial for this new drug?');
    assert.ok(r.requiresEthicsGate);
  });

  test('legitimate astronomy use of "explosive" passes (no false positive)', () => {
    const r = assessResearchabilityDeterministic('What drives explosive stellar transients in distant galaxies?');
    assert.equal(r.verdict, 'RESEARCHABLE');
    assert.equal(r.safetyRisks.length, 0);
  });

  test('scientific question gets a domain hint', () => {
    const r = assessResearchabilityDeterministic('Does dark matter interact with itself beyond gravity?');
    assert.equal(r.scope.domain, 'astronomy');
    assert.equal(r.verdict, 'RESEARCHABLE');
  });

  test('too-short question → LIMITED', () => {
    const r = assessResearchabilityDeterministic('dark energy');
    assert.equal(r.verdict, 'LIMITED');
    assert.ok(r.reasons.some((x) => x.includes('too short')));
  });
});

describe('ResearchabilityBlockedError', () => {
  test('carries the report and names the verdict', () => {
    const screening = assessResearchabilityDeterministic('write a poem');
    const report = {
      question: 'write a poem',
      verdict: screening.verdict,
      reasons: screening.reasons,
      safetyRisks: screening.safetyRisks,
      scope: screening.scope,
      decomposition: null,
      requiresEthicsGate: screening.requiresEthicsGate,
      assessedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    const err = new ResearchabilityBlockedError(report);
    assert.match(err.message, /UNSUPPORTED/);
    assert.equal(err.report, report);
    assert.equal(err.name, 'ResearchabilityBlockedError');
  });
});
