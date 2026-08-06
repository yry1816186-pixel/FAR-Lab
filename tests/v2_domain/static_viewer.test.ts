// tests/v2_domain/static_viewer.test.ts
//
// IMPL-029 — no-script bound static viewer + accessible relation model.
//
// Authority: doc19 §7.3 (static viewer), SPEC-011 (accessible relation-view).
// The viewer must function with JavaScript disabled — all verification data
// is server-rendered or embedded as static JSON. No client-side computation
// is required for the trust path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaticViewerPayload,
  assertNoScriptRequired,
  buildAccessibleRelationModel,
  VIEWER_CONTENT_CLASSES,
  type StaticViewerPayload,
} from '../../src/v2_domain/static_viewer.ts';

// ---------------------------------------------------------------------------
// Viewer content classes
// ---------------------------------------------------------------------------

test('VIEWER_CONTENT_CLASSES: includes receipt, verification, manifest, limitation', () => {
  const classes = [...VIEWER_CONTENT_CLASSES];
  const mustInclude = ['receipt', 'verification', 'manifest', 'limitation', 'review'];
  for (const c of mustInclude) {
    assert.equal(classes.includes(c as never), true, `content class ${c} must exist`);
  }
});

// ---------------------------------------------------------------------------
// buildStaticViewerPayload
// ---------------------------------------------------------------------------

test('buildStaticViewerPayload: produces server-rendered HTML with embedded JSON', () => {
  const payload = buildStaticViewerPayload({
    receiptId: 'r-001',
    claimText: 'Adapter A achieves macro-F1 >= 0.80',
    verdict: 'INCONCLUSIVE',
    dimensions: {
      provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      identity: { dimension: 'identity', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'keyless' },
      processConformance: { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      executionReproduction: { dimension: 'executionReproduction', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'no replay' },
      scientificVerdict: { dimension: 'scientificVerdict', outcome: 'WARN', reasonCodes: [], detail: 'fixture only' },
    },
    manifestRoot: 'a'.repeat(64),
    receiptStanding: 'ACTIVE',
  });
  assert.ok(payload.html.length > 100, 'HTML must be substantive');
  assert.ok(payload.embeddedJson.length > 0, 'embedded JSON required');
  assert.equal(payload.scriptRequired, false, 'must NOT require JavaScript');
  assert.ok(payload.html.includes('provenance'), 'HTML must show dimensions');
  assert.ok(payload.html.includes('r-001'), 'HTML must show receipt ID');
});

test('buildStaticViewerPayload: includes limitation notice in HTML', () => {
  const payload = buildStaticViewerPayload({
    receiptId: 'r-002',
    claimText: 'test claim',
    verdict: 'WARN',
    dimensions: {
      provenance: { dimension: 'provenance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      integrity: { dimension: 'integrity', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      identity: { dimension: 'identity', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'keyless' },
      processConformance: { dimension: 'processConformance', outcome: 'PASS', reasonCodes: [], detail: 'ok' },
      executionReproduction: { dimension: 'executionReproduction', outcome: 'NOT_APPLICABLE', reasonCodes: [], detail: 'no replay' },
      scientificVerdict: { dimension: 'scientificVerdict', outcome: 'WARN', reasonCodes: [], detail: 'fixture only' },
    },
    manifestRoot: 'b'.repeat(64),
    receiptStanding: 'ACTIVE',
  });
  assert.ok(payload.html.toLowerCase().includes('limitation') || payload.html.toLowerCase().includes('does not certify'));
});

// ---------------------------------------------------------------------------
// assertNoScriptRequired
// ---------------------------------------------------------------------------

test('assertNoScriptRequired: passes when scriptRequired=false', () => {
  const payload: StaticViewerPayload = {
    html: '<div>test</div>',
    embeddedJson: '{}',
    scriptRequired: false,
    contentHash: 'a'.repeat(64),
  };
  assert.doesNotThrow(() => assertNoScriptRequired(payload));
});

test('assertNoScriptRequired: throws when scriptRequired=true', () => {
  assert.throws(
    () => assertNoScriptRequired({
      html: '<div>test</div>',
      embeddedJson: '{}',
      scriptRequired: true as false, // intentionally wrong to test the assertion
      contentHash: 'a'.repeat(64),
    }),
    /SCRIPT_REQUIRED_VIOLATION/,
  );
});

// ---------------------------------------------------------------------------
// Accessible relation model
// ---------------------------------------------------------------------------

test('buildAccessibleRelationModel: produces ARIA-compatible relation graph', () => {
  const model = buildAccessibleRelationModel({
    receiptId: 'r-003',
    dimensions: ['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'],
    manifestMembers: ['claim', 'fecSnapshot', 'verdictTrace'],
    hasReview: false,
  });
  assert.ok(model.relations.length > 0, 'must have relations');
  // Each relation has ARIA role + aria-labelledby target
  for (const rel of model.relations) {
    assert.ok(rel.fromNode, 'relation must have fromNode');
    assert.ok(rel.toNode, 'relation must have toNode');
    assert.ok(rel.relationType.length > 0, 'relation must have type');
    assert.ok(rel.ariaRole.length > 0, 'relation must have ARIA role');
  }
});

test('buildAccessibleRelationModel: review case adds contested relation', () => {
  const model = buildAccessibleRelationModel({
    receiptId: 'r-004',
    dimensions: ['provenance', 'integrity'],
    manifestMembers: ['claim'],
    hasReview: true,
  });
  const hasContested = model.relations.some((r) => r.relationType === 'CONTESTED_BY');
  assert.equal(hasContested, true, 'review case must add CONTESTED_BY relation');
});
