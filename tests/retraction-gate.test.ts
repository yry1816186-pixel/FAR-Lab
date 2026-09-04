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
  it('status is order-INDEPENDENT by priority: reinstated > retracted > EoC > corrected (SCIENCE lane 2026-08-24)', () => {
    // previously `??=` first-match let update-to array ORDER decide — a
    // [correction, retraction] listing read as 'corrected'.
    expect(retractionStatusFrom(mkRecord([{ type: 'correction' }, { type: 'retraction' }]))).toBe('retracted');
    expect(retractionStatusFrom(mkRecord([{ type: 'retraction' }, { type: 'correction' }]))).toBe('retracted');
    // a reinstatement resolves the retraction regardless of listing order
    expect(retractionStatusFrom(mkRecord([{ type: 'correction' }, { type: 'reinstatement' }, { type: 'retraction' }]))).toBe('reinstated');
    expect(retractionStatusFrom(mkRecord([{ type: 'retraction' }, { type: 'reinstatement' }]))).toBe('reinstated');
    // EoC outranks correction; retraction outranks EoC
    expect(retractionStatusFrom(mkRecord([{ type: 'correction' }, { type: 'expression of concern' }]))).toBe('expression_of_concern');
    expect(retractionStatusFrom(mkRecord([{ type: 'expression of concern' }, { type: 'retraction' }]))).toBe('retracted');
  });
});

describe('retractionStatusFrom (OpenAlex is_retracted fallback, RU-R frontier cand.1)', () => {
  const oaRecord = (isRetracted: unknown): RawSourceRecord => ({
    identifiers: [{ kind: 'openalex', value: 'W1' }],
    title: 't',
    contentDepth: 'metadata_only',
    accessState: 'unknown',
    normalized: { id: 'https://openalex.org/W1', is_retracted: isRetracted } as Record<string, unknown>,
  });

  it('strict boolean true classifies retracted (the primary-family coverage win)', () => {
    expect(retractionStatusFrom(oaRecord(true))).toBe('retracted');
  });

  it('never coerces truthy-but-not-boolean shapes', () => {
    expect(retractionStatusFrom(oaRecord(false))).toBeUndefined();
    expect(retractionStatusFrom(oaRecord(undefined))).toBeUndefined();
    expect(retractionStatusFrom(oaRecord('true'))).toBeUndefined();
    expect(retractionStatusFrom(oaRecord(1))).toBeUndefined();
  });

  it('update-to classification outranks the flag (richer signal wins, flag is a hint)', () => {
    const both: RawSourceRecord = {
      ...oaRecord(true),
      normalized: {
        is_retracted: true,
        'update-to': [{ type: 'correction' }],
      } as Record<string, unknown>,
    };
    expect(retractionStatusFrom(both)).toBe('corrected');
  });

  it('a non-classifying update-to does not suppress a true flag', () => {
    const both: RawSourceRecord = {
      ...oaRecord(true),
      normalized: {
        is_retracted: true,
        'update-to': [{ type: 'new edition' }],
      } as Record<string, unknown>,
    };
    expect(retractionStatusFrom(both)).toBe('retracted');
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

describe('RU-10 zh fuzzy-key fix (CJK titles merge)', () => {
  // fuzzyTitleKey is the pool-merge identity: same title (modulo punctuation) +
  // same year -> one pool entry. Under the pre-fix normalization CJK titles
  // collapsed to EMPTY and could never merge — these assertions fail if the
  // Han-run preservation in normalizeTitle regresses.
  const rec = (title: string, publicationYear = 2024): RawSourceRecord => ({
    identifiers: [{ kind: 'doi', value: '10.1/x' }],
    title,
    publicationYear,
    contentDepth: 'abstract',
    accessState: 'unknown',
    abstractText: '',
    normalized: {},
  });

  it('a CJK title produces a non-empty key, stable across punctuation variants', async () => {
    const { fuzzyTitleKey } = await import('../src/pipeline/stages/retrieve.js');
    const a = fuzzyTitleKey(rec('维生素D与抑郁症：一项随机对照试验的荟萃分析'));
    const b = fuzzyTitleKey(rec('维生素D与抑郁症，一项随机对照试验的荟萃分析'));
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it('different CJK titles and different years produce different keys; short titles are null', async () => {
    const { fuzzyTitleKey } = await import('../src/pipeline/stages/retrieve.js');
    const base = '维生素D与抑郁症：一项随机对照试验的荟萃分析';
    const other = '另一种完全不同的中文研究标题用于区分检验';
    expect(fuzzyTitleKey(rec(other))).not.toBe(fuzzyTitleKey(rec(base)));
    expect(fuzzyTitleKey(rec(base, 2025))).not.toBe(fuzzyTitleKey(rec(base, 2024)));
    expect(fuzzyTitleKey(rec('短标题'))).toBeNull(); // below FUZZY_MIN_TITLE_LEN
  });
});
