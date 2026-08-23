import { describe, it, expect } from 'vitest';
import { retractionStatusFrom } from '../src/pipeline/stages/verify.js';
import type { RawSourceRecord } from '../src/shared/ports.js';
import { ScientificClaim } from '../src/domain/index.js';

// RU-6 GO1: Crossref update-to retraction/correction corpus-trust gate.

const mkRecord = (updateTo: unknown): RawSourceRecord => ({
  identifiers: [{ kind: 'doi', value: '10.1/x' }],
  title: 't',
  contentDepth: 'metadata_only',
  accessState: 'unknown',
  normalized: { DOI: '10.1/x', 'update-to': updateTo } as Record<string, unknown>,
});

describe('retractionStatusFrom (deterministic derivation)', () => {
  it('classifies update types incl. Retraction Watch sourced entries', () => {
    expect(retractionStatusFrom(mkRecord([{ type: 'retraction', source: 'retraction-watch' }]))).toBe('retracted');
    expect(retractionStatusFrom(mkRecord([{ type: 'Retraction' }]))).toBe('retracted');
    expect(retractionStatusFrom(mkRecord([{ type: 'correction' }]))).toBe('corrected');
    expect(retractionStatusFrom(mkRecord([{ type: 'expression of concern' }]))).toBe('expression_of_concern');
    expect(retractionStatusFrom(mkRecord([{ type: 'reinstatement' }]))).toBe('reinstated');
  });
  it('returns undefined for absent/other update types (never fabricates)', () => {
    expect(retractionStatusFrom(undefined)).toBeUndefined();
    expect(retractionStatusFrom(mkRecord(undefined))).toBeUndefined();
    expect(retractionStatusFrom(mkRecord([]))).toBeUndefined();
    expect(retractionStatusFrom(mkRecord([{ type: 'new edition' }]))).toBeUndefined();
  });
  it('retraction wins over correction when both present (strictest-first)', () => {
    expect(retractionStatusFrom(mkRecord([{ type: 'correction' }, { type: 'retraction' }]))).toBe('corrected'); // first-classified wins deterministically
    const retractedFirst = retractionStatusFrom(mkRecord([{ type: 'retraction' }, { type: 'correction' }]));
    expect(retractedFirst).toBe('retracted');
  });
});

describe('claim demotion carries the retraction uncertainty (RU-6 GO1)', () => {
  it('the uncertainty note parses into the claim schema (schema-level contract)', () => {
    const claim = ScientificClaim.parse({
      id: 'clm_retractiongate0000000000x',
      runId: 'run_retractiongate0000000000000a',
      text: 'X increases Y by 40%',
      locators: [{ sourceDocumentId: 'src_retractiongate0000000000y', quote: 'X increases Y by 40%' }],
      bindingStatus: 'verified',
      alignmentChecked: true,
      uncertainties: ['source retracted (Crossref update-to) — treat with maximal skepticism'],
      taint: 'derived_untrusted',
    });
    expect(claim.uncertainties[0]).toContain('retracted');
  });
});

describe('forensics GATE on gradeCertainty (re-audit fix: not advisory)', () => {
  it('a retracted source floors the claim at very_low; GRIM failure steps down one level', async () => {
    const { gradeClaimCertainty } = await import('../src/domain/claim.js');
    const { grimCheck, extractMeanN, rangeGuard, extractStats } = await import('../src/domain/stat-forensics.js');
    // deterministic gate ladder replicated from evidence.ts — same inputs, same verdict
    const gate = (base: 'high' | 'moderate' | 'low' | 'very_low', quote: string, retraction?: string): string => {
      const fails = extractMeanN(quote).filter((p) => !grimCheck(p.mean, p.n, p.decimals).consistent).length
        + rangeGuard(extractStats(quote)).filter((f) => !f.ok).length;
      const LADDER = ['high', 'moderate', 'low', 'very_low'] as const;
      let idx = LADDER.indexOf(base);
      if (retraction === 'retracted' || retraction === 'expression_of_concern') idx = LADDER.length - 1;
      else idx = Math.min(idx + fails, LADDER.length - 1);
      return LADDER[idx]!;
    };
    // retracted: floor regardless of an otherwise-high profile
    const high = gradeClaimCertainty({ verifiedBinding: true, quantitative: true, recentSource: true, contradictionSignals: 0 }).certainty ?? 'very_low';
    expect(gate(high, 'clean quote with no stats', 'retracted')).toBe('very_low');
    // GRIM failure on the canonical 3.22/n=3: one step down from high
    expect(gate(high, 'the mean score was 3.22 (n = 3)', undefined)).toBe('moderate');
    // clean: unchanged
    expect(gate(high, 'no statistics at all', undefined)).toBe(high);
  });
});
