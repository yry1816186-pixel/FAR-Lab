// §6.2 · Premise search tests.
// Covers:
//   - local_verified_claims fallback when mathlib unavailable (fresh-clone default)
//   - keyword matching against naturalLanguage
//   - empty sourceAnchor throws
//   - mathlib available override returns empty premises with honest note
//   - no matching keywords returns empty premises
//   - sourceAnchor is always preserved in result

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { searchPremises } from '../../src/math/premise_search.ts';
import type { MathClaim } from '../../src/math/math_claim.ts';

function makeClaim(overrides: Partial<MathClaim> = {}): MathClaim {
  return {
    claimId: overrides.claimId ?? 'claim_premise_001',
    naturalLanguage: overrides.naturalLanguage ?? 'forall x, x equals x in real numbers',
    claimKind: overrides.claimKind ?? 'algebraic_identity',
    formalization: overrides.formalization ?? {
      target: 'smtlib',
      source: '{"lhs":"x","rhs":"x"}',
      formalizerId: 'core_neutral@v1',
      confidence: 0.9,
    },
    requiredLevel: overrides.requiredLevel ?? 'L1_cas',
    expectedOutcome: overrides.expectedOutcome ?? 'verified',
    linkedVerdictNodeId: overrides.linkedVerdictNodeId ?? null,
    requireFormalVerification: overrides.requireFormalVerification ?? false,
    createdAt: overrides.createdAt ?? '2026-06-27T00:00:00.000Z',
  };
}

test('searchPremises: throws when sourceAnchor is empty', () => {
  assert.throws(
    () =>
      searchPremises({
        query: 'real numbers',
        localClaims: [],
        sourceAnchor: '',
      }),
    /sourceAnchor is mandatory/,
  );
});

test('searchPremises: returns local_verified_claims with keyword matches when mathlib unavailable (fresh-clone default)', () => {
  const localClaims = [
    makeClaim({
      claimId: 'claim_real_001',
      naturalLanguage: 'all real numbers are equal to themselves',
    }),
    makeClaim({
      claimId: 'claim_unrelated_002',
      naturalLanguage: 'the sky is blue today',
    }),
  ];
  const result = searchPremises({
    query: 'real numbers',
    localClaims,
    sourceAnchor: 'git_commit_abc123',
  });
  assert.equal(result.source, 'local_verified_claims');
  assert.equal(result.mathlibAvailable, false);
  assert.equal(result.sourceAnchor, 'git_commit_abc123');
  assert.equal(result.query, 'real numbers');
  assert.ok(result.premises.length >= 1);
  const matched = result.premises.find((p) => p.name === 'claim_real_001');
  assert.ok(matched, 'expected claim_real_001 to be matched');
  assert.equal(matched!.source, 'local_verified_claims');
  assert.equal(matched!.statement, 'all real numbers are equal to themselves');
});

test('searchPremises: returns empty premises when no keywords match', () => {
  const localClaims = [
    makeClaim({ naturalLanguage: 'the sky is blue' }),
  ];
  const result = searchPremises({
    query: 'quantum mechanics',
    localClaims,
    sourceAnchor: 'git_commit_def456',
  });
  assert.equal(result.premises.length, 0);
  assert.equal(result.source, 'local_verified_claims');
});

test('searchPremises: mathlib available override returns empty premises with honest note', () => {
  const result = searchPremises({
    query: 'real numbers',
    localClaims: [makeClaim()],
    mathlibAvailableOverride: true,
    sourceAnchor: 'git_commit_ghi789',
  });
  assert.equal(result.mathlibAvailable, true);
  assert.equal(result.source, 'mathlib');
  assert.equal(result.premises.length, 0);
  // mathlib integration is NOT implemented in core (would require LeanDojo runtime dep).
  // Honest behavior: return empty rather than fabricating premises.
});

test('searchPremises: preserves sourceAnchor in result regardless of path', () => {
  const anchor = 'anchor_xyz_20260627';
  const result = searchPremises({
    query: 'test',
    localClaims: [],
    sourceAnchor: anchor,
  });
  assert.equal(result.sourceAnchor, anchor);
});

test('searchPremises: filters out short keywords (length <= 1)', () => {
  // Single-character keywords are filtered out to avoid false matches.
  const localClaims = [
    makeClaim({ naturalLanguage: 'a is a letter' }),
  ];
  const result = searchPremises({
    query: 'a',
    localClaims,
    sourceAnchor: 'anchor',
  });
  // 'a' is a single char, filtered out, so no keywords remain → no matches.
  assert.equal(result.premises.length, 0);
});
