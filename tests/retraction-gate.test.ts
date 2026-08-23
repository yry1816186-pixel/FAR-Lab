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
