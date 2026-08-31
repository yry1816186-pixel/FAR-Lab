import { describe, expect, it } from 'vitest';
import type { ResearchQuestion } from '../web/src/api/types.js';
import {
  scopeEditorDraft,
  scopeEditorFingerprint,
  scopeEditorPatch,
  scopeLines,
} from '../web/src/lab/scopeEditorModel.js';

const QUESTION: ResearchQuestion = {
  id: 'qst_scope_editor_test',
  text: 'Which intervention changes the target phenomenon?',
  background: '',
  goalType: 'explanatory',
  scope: {
    domain: 'systems biology',
    phenomena: ['signal adaptation', 'recovery dynamics'],
    inScope: ['human cohorts'],
    outOfScope: ['animal-only studies'],
  },
  constraints: {
    assumptions: [], dataConstraints: [], resourceConstraints: [], ethicalConstraints: [], methodologicalConstraints: [],
  },
  createdAt: '2026-08-31T00:00:00.000Z',
};

describe('canonical shared scope editor model', () => {
  it('round-trips the canonical question without inventing a patch', () => {
    const draft = scopeEditorDraft(QUESTION);
    expect(draft).toEqual({
      domain: 'systems biology',
      goalType: 'explanatory',
      phenomena: 'signal adaptation\nrecovery dynamics',
      inScope: 'human cohorts',
      outOfScope: 'animal-only studies',
    });
    expect(scopeEditorPatch(QUESTION, draft)).toEqual({ patch: {}, issues: [] });
  });

  it('uses one trim/list rule and permits explicit empty inclusion/exclusion boundaries', () => {
    const result = scopeEditorPatch(QUESTION, {
      domain: '  translational physiology  ',
      goalType: 'interventional',
      phenomena: ' treatment response \n\n recovery slope ',
      inScope: '   ',
      outOfScope: '',
    });
    expect(result.issues).toEqual([]);
    expect(result.patch).toEqual({
      goalType: 'interventional',
      scope: {
        domain: 'translational physiology',
        phenomena: ['treatment response', 'recovery slope'],
        inScope: [],
        outOfScope: [],
      },
    });
    expect(scopeLines(' a \n\n b ')).toEqual(['a', 'b']);
  });

  it('fails locally on the two domain-required fields and emits no partial patch', () => {
    const result = scopeEditorPatch(QUESTION, {
      ...scopeEditorDraft(QUESTION),
      domain: ' ',
      phenomena: '\n',
      goalType: 'predictive',
    });
    expect(result.issues).toEqual(['domain_required', 'phenomena_required']);
    expect(result.patch).toEqual({});
  });

  it('fingerprints editable baseline values, not object identity or unrelated prose', () => {
    const sameEditable = { ...QUESTION, text: 'Reworded question' };
    expect(scopeEditorFingerprint(sameEditable)).toBe(scopeEditorFingerprint(QUESTION));
    const changed = { ...QUESTION, scope: { ...QUESTION.scope, inScope: ['clinical trials'] } };
    expect(scopeEditorFingerprint(changed)).not.toBe(scopeEditorFingerprint(QUESTION));
  });
});
