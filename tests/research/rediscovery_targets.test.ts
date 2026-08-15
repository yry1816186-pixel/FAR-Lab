/**
 * tests/research/rediscovery_targets.test.ts — target-set registry honesty:
 * >= 3 domains x >= 2 targets, every target strictly post-cutoff, no
 * fabricated DOIs (CONFIRMED implies well-formed), UNVERIFIED flagged with a
 * note, corpus holdout-clean, and every synthetic document visibly marked.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REDISCOVERY_DOMAINS,
  REDISCOVERY_SPECS,
  targetsWithoutConfirmedDoi,
  unverifiedTargetIds,
} from '../../src/research/evaluation/rediscovery/targets.ts';

describe('rediscovery target registry (brief: >=3 domains, >=2 targets each)', () => {
  it('ships at least 3 distinct domains', () => {
    assert.ok(REDISCOVERY_DOMAINS.length >= 3, `only ${REDISCOVERY_DOMAINS.length} domains`);
    assert.equal(REDISCOVERY_DOMAINS.length, new Set(REDISCOVERY_DOMAINS).size);
  });

  it('every spec has >= 2 targets and unique spec ids', () => {
    const specIds = new Set<string>();
    for (const spec of REDISCOVERY_SPECS) {
      assert.ok(spec.targetDiscoveries.length >= 2, `${spec.specId} has < 2 targets`);
      specIds.add(spec.specId);
    }
    assert.equal(specIds.size, REDISCOVERY_SPECS.length);
  });

  it('every target is strictly post-cutoff with >= 3 match keywords', () => {
    for (const spec of REDISCOVERY_SPECS) {
      for (const t of spec.targetDiscoveries) {
        assert.ok(t.publishedAfter > spec.cutoffDate,
          `${spec.specId}/${t.id}: publishedAfter must be > cutoff`);
        assert.ok(t.matchKeywords.length >= 3,
          `${spec.specId}/${t.id}: needs >= 3 match keywords for level matching`);
        assert.ok(t.groundingDocumentIds.length >= 1,
          `${spec.specId}/${t.id}: needs >= 1 grounding document for L2`);
      }
    }
  });

  it('no fabricated DOIs: CONFIRMED implies non-null well-formed 10.x/... form', () => {
    for (const spec of REDISCOVERY_SPECS) {
      for (const t of spec.targetDiscoveries) {
        if (t.doiStatus === 'CONFIRMED') {
          assert.ok(t.doi !== null, `${spec.specId}/${t.id}: CONFIRMED without doi`);
          assert.match(t.doi!, /^10\.\d{4,9}\/\S+$/);
        } else if (t.doi !== null) {
          assert.match(t.doi, /^10\.\d{4,9}\/\S+$/);
        }
      }
    }
  });

  it('UNVERIFIED targets are flagged with a note (currently none: all real, established discoveries)', () => {
    for (const spec of REDISCOVERY_SPECS) {
      for (const t of spec.targetDiscoveries) {
        if (t.verificationStatus === 'UNVERIFIED') {
          assert.ok(t.unverifiedNote !== null && t.unverifiedNote.length > 0,
            `${spec.specId}/${t.id}: UNVERIFIED requires a note`);
        }
      }
    }
    // b7-T3 online verification (doi.org resolution, 2026-08-16): the two
    // formerly-UNCONFIRMED DOIs are now confirmed — the shipped set has ZERO
    // bibliographic gaps. The MECHANISM stays pinned: any future target with a
    // null/UNCONFIRMED DOI MUST appear in targetsWithoutConfirmedDoi (so the
    // gap can never silently hide), and none may linger unflagged.
    assert.deepEqual(unverifiedTargetIds(), []);
    assert.deepEqual(targetsWithoutConfirmedDoi(), []);
  });

  it('shipped corpora are holdout-clean: every document is pre-cutoff', () => {
    for (const spec of REDISCOVERY_SPECS) {
      for (const d of spec.corpusFixture) {
        assert.ok(d.publicationDate !== null, `${spec.specId}/${d.persistentIdentifier}: null date in shipped fixture`);
        assert.ok(d.publicationDate! <= spec.cutoffDate,
          `${spec.specId}/${d.persistentIdentifier}: ${d.publicationDate} after cutoff`);
      }
    }
  });

  it('every fixture document is visibly synthetic (anti corpus-pollution guard)', () => {
    for (const spec of REDISCOVERY_SPECS) {
      for (const d of spec.corpusFixture) {
        assert.ok(d.title.startsWith('[SYNTHETIC]'),
          `${spec.specId}/${d.persistentIdentifier}: title must carry [SYNTHETIC] marker`);
        assert.ok(d.abstract !== null && d.abstract.startsWith('[SYNTHETIC]'),
          `${spec.specId}/${d.persistentIdentifier}: abstract must carry [SYNTHETIC] marker`);
      }
    }
  });

  it('document ids are hash-computed, not hand-written (stable + unique)', () => {
    for (const spec of REDISCOVERY_SPECS) {
      const ids = spec.corpusFixture.map((d) => d.documentId);
      assert.equal(new Set(ids).size, ids.length, `${spec.specId}: doc id collision`);
      for (const d of spec.corpusFixture) {
        // sha256('openalex|pid') truncated to 32 hex chars.
        assert.match(d.documentId, /^[0-9a-f]{32}$/);
      }
    }
  });

  it('llmFixtures cite computed document ids (real set-membership, no hand-written ids)', () => {
    for (const spec of REDISCOVERY_SPECS) {
      const validIds = new Set(spec.corpusFixture.map((d) => d.documentId));
      const parsed = JSON.parse(spec.llmFixtures['research_hypotheses']!) as {
        hypotheses: { supportingCitations: string[]; counterEvidenceCitations: string[] }[];
      };
      assert.ok(parsed.hypotheses.length >= 3);
      for (const h of parsed.hypotheses) {
        for (const id of [...h.supportingCitations, ...h.counterEvidenceCitations]) {
          assert.ok(validIds.has(id), `${spec.specId}: hypothesis cites non-corpus id ${id}`);
        }
      }
    }
  });
});
