import type { ResearchQuestion, ResearchScope, ScientificGoalType } from '../api/types';

/** The single editable projection of canonical ResearchQuestion scope fields. */
export interface ScopeEditorDraft {
  domain: string;
  goalType: ScientificGoalType;
  phenomena: string;
  inScope: string;
  outOfScope: string;
}

export type ScopeEditorIssue = 'domain_required' | 'phenomena_required';

export interface ScopeEditorPatch {
  goalType?: ScientificGoalType;
  scope?: Partial<Pick<ResearchScope, 'domain' | 'phenomena' | 'inScope' | 'outOfScope'>>;
}

export const scopeLines = (text: string): string[] =>
  text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

export const scopeEditorDraft = (question: ResearchQuestion | null): ScopeEditorDraft => ({
  domain: question?.scope.domain ?? '',
  goalType: question?.goalType ?? 'explanatory',
  phenomena: (question?.scope.phenomena ?? []).join('\n'),
  inScope: (question?.scope.inScope ?? []).join('\n'),
  outOfScope: (question?.scope.outOfScope ?? []).join('\n'),
});

/**
 * Convert the one editor draft into the PATCH contract. Validation mirrors the
 * canonical domain schema: domain and phenomena are required; in/out boundaries
 * are allowed to be empty arrays and remain meaningful explicit edits.
 */
export const scopeEditorPatch = (
  question: ResearchQuestion,
  draft: ScopeEditorDraft,
): { patch: ScopeEditorPatch; issues: ScopeEditorIssue[] } => {
  const issues: ScopeEditorIssue[] = [];
  const domain = draft.domain.trim();
  const phenomena = scopeLines(draft.phenomena);
  const inScope = scopeLines(draft.inScope);
  const outOfScope = scopeLines(draft.outOfScope);
  if (domain.length === 0) issues.push('domain_required');
  if (phenomena.length === 0) issues.push('phenomena_required');
  if (issues.length > 0) return { patch: {}, issues };

  const scope: NonNullable<ScopeEditorPatch['scope']> = {};
  if (domain !== question.scope.domain) scope.domain = domain;
  if (JSON.stringify(phenomena) !== JSON.stringify(question.scope.phenomena)) scope.phenomena = phenomena;
  if (JSON.stringify(inScope) !== JSON.stringify(question.scope.inScope)) scope.inScope = inScope;
  if (JSON.stringify(outOfScope) !== JSON.stringify(question.scope.outOfScope)) scope.outOfScope = outOfScope;

  const patch: ScopeEditorPatch = {};
  if (draft.goalType !== question.goalType) patch.goalType = draft.goalType;
  if (Object.keys(scope).length > 0) patch.scope = scope;
  return { patch, issues };
};

export const scopeEditorFingerprint = (question: ResearchQuestion | null): string =>
  question === null
    ? 'none'
    : JSON.stringify({
        id: question.id,
        goalType: question.goalType,
        domain: question.scope.domain,
        phenomena: question.scope.phenomena,
        inScope: question.scope.inScope,
        outOfScope: question.scope.outOfScope,
      });
