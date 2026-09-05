import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { extractPromptsRaw } from '../eval/prompt-regression.mjs';

/**
 * SCI-03 weakens-discriminator lock (2026-09-06): the critique prompt's relation-label
 * discipline was refined after the max-judge miss-class analysis (pipeline weakens 0/10
 * exact = 4 under-commitment + 4 direction errors + 2 topical-adjacent). These tests
 * assert the three new clauses on the FULL runtime prompt extracted from source (same
 * extractor as the versioned snapshot), so they cannot be silently dropped without both
 * a test failure and a prompt-regression version bump.
 */
const prompts = extractPromptsRaw(resolve(process.cwd(), 'src/pipeline/stages/falsify.ts'));
const falsify = prompts.find((p) => p.name === 'INLINE:Youareanadversar');

describe('falsify critique prompt weakens-discriminator clauses (v3, source-locked)', () => {
  it('extracts the falsify critique prompt', () => {
    expect(falsify).toBeDefined();
    expect(falsify!.text.length).toBeGreaterThan(3000);
  });

  it('weakens requires compatibility with partial truth (no negation of the core relation)', () => {
    expect(falsify!.text).toContain('"weakens" ONLY when the claim reduces confidence while remaining COMPATIBLE with the hypothesis being partly');
    expect(falsify!.text).toContain('it must not assert the negation of the core relation');
  });

  it('literature-state hypotheses: at-odds findings are contradictions, not weakenings', () => {
    expect(falsify!.text).toContain('a claim reporting findings AT ODDS with the asserted literature-state is a contradiction, not a weakening');
  });

  it('rarity/exception hypotheses: challenge-to-mainstream supports, broader-class findings contradict', () => {
    expect(falsify!.text).toContain('SUPPORTED by findings that challenge the');
    expect(falsify!.text).toContain('CONTRADICTED by findings of the association holding in the broader class');
  });
});
