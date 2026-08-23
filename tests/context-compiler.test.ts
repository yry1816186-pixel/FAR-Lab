import { describe, it, expect } from 'vitest';
import { applySectionBudget, selectDiverseExemplars, CLAIMS_PROMPT_CAP } from '../src/pipeline/stages/shared.js';

// RU-9 GO4 — minimal context compiler. All offline/deterministic.

describe('applySectionBudget', () => {
  const sections = [
    { id: 'instructions', priority: 1, text: 'I'.repeat(50) },
    { id: 'question', priority: 1, text: 'Q'.repeat(30) },
    { id: 'evidence', priority: 2, text: 'E'.repeat(60) },
    { id: 'extra', priority: 3, text: 'X'.repeat(40) },
  ];
  it('keeps whole sections in priority order until the budget; drops report ids', () => {
    const r = applySectionBudget(sections, 140);
    expect(r.kept).toHaveLength(3); // 50+30+60=140 fits exactly; extra dropped
    expect(r.dropped).toEqual(['extra']);
  });
  it('deterministic on ties (id order); never partially truncates a section', () => {
    const r = applySectionBudget(sections, 79); // instructions(50)+question(30)=80 > 79 -> question dropped whole
    expect(r.kept).toEqual(['I'.repeat(50)]);
    expect(r.dropped).toContain('question');
    expect(applySectionBudget(sections, 79)).toEqual(r);
  });
});

describe('selectDiverseExemplars', () => {
  const mk = (id: string, text: string) => ({ id, text });
  it('under k returns everything; deterministic across runs', () => {
    const items = [mk('a', 'alpha beta'), mk('b', 'gamma delta')];
    expect(selectDiverseExemplars(items, 'seed', 5)).toEqual(items);
    const first = selectDiverseExemplars(items, 'seed', 1);
    expect(selectDiverseExemplars(items, 'seed', 1)).toEqual(first);
  });
  it('prefers a DIVERSE set over near-duplicate top-relevance items (MMR semantics)', () => {
    // 10 near-duplicates + 2 distinct-but-relevant alternatives (shared seed token,
    // so relevance is nonzero — MMR is relevance-first and never picks zero-relevance
    // items; that boundary is the determinism test's job).
    const dup = Array.from({ length: 10 }, (_, i) => mk(`dup${i}`, `vitamin D depression dose response study ${i}`));
    const distinct = [
      mk('other1', 'depression sleep deprivation cognitive performance'),
      mk('other2', 'depression gut microbiome inflammation markers'),
    ];
    const picked = selectDiverseExemplars([...dup, ...distinct], 'vitamin D depression', 4);
    const pickedIds = new Set(picked.map((p) => p.id));
    // naive top-4-by-relevance = 4 dups; the diverse picker must include >=1 distinct
    expect(pickedIds.has('other1') || pickedIds.has('other2')).toBe(true);
    expect(picked).toHaveLength(4);
  });
  it('cap boundary: exactly CLAIMS_PROMPT_CAP selected from a large base', () => {
    const big = Array.from({ length: 60 }, (_, i) => mk(`c${i}`, `claim number ${i} about vitamin D mechanism ${i % 7}`));
    expect(selectDiverseExemplars(big, 'vitamin D', CLAIMS_PROMPT_CAP)).toHaveLength(CLAIMS_PROMPT_CAP);
  });
});
