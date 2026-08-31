import { useCallback, useEffect, useState } from 'react';
import type { ConstraintSet, ResearchQuestion, ScientificGoalType } from '../api/types';
import { useI18n } from '../i18n/LanguageContext';
import {
  scopeEditorDraft,
  scopeEditorFingerprint,
  type ScopeEditorDraft,
  type ScopeEditorIssue,
} from './scopeEditorModel';

const GOAL_TYPES: readonly ScientificGoalType[] = [
  'explanatory', 'predictive', 'interventional', 'methodological', 'exploratory',
];

export const useScopeEditorDraft = (question: ResearchQuestion | null): {
  draft: ScopeEditorDraft;
  change: <K extends keyof ScopeEditorDraft>(field: K, value: ScopeEditorDraft[K]) => void;
  reset: (next: ResearchQuestion | null) => void;
} => {
  const [draft, setDraft] = useState<ScopeEditorDraft>(() => scopeEditorDraft(question));
  const fingerprint = scopeEditorFingerprint(question);
  useEffect(() => {
    setDraft(scopeEditorDraft(question));
    // The fingerprint contains every editable baseline field. Depending on the
    // object identity would erase unsaved edits on StudyMap's polling refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);
  const change = useCallback(<K extends keyof ScopeEditorDraft>(field: K, value: ScopeEditorDraft[K]): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);
  const reset = useCallback((next: ResearchQuestion | null): void => { setDraft(scopeEditorDraft(next)); }, []);
  return { draft, change, reset };
};

export function ScopeEditor({
  idPrefix,
  title,
  hint,
  draft,
  onChange,
  issues = [],
  constraints,
  defaultOpen = true,
}: {
  idPrefix: string;
  title: string;
  hint: string;
  draft: ScopeEditorDraft;
  onChange: <K extends keyof ScopeEditorDraft>(field: K, value: ScopeEditorDraft[K]) => void;
  issues?: readonly ScopeEditorIssue[];
  constraints?: ConstraintSet;
  defaultOpen?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const domainError = issues.includes('domain_required');
  const phenomenaError = issues.includes('phenomena_required');
  const constraintItems = constraints === undefined
    ? []
    : [
        ...constraints.assumptions,
        ...constraints.dataConstraints,
        ...constraints.resourceConstraints,
        ...constraints.ethicalConstraints,
        ...constraints.methodologicalConstraints,
      ].filter((item) => item.length > 0);

  return (
    <details className="scope-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="scope-editor-summary">
        <span>{title}</span>
        <span className="scope-editor-summary-value">{draft.domain || t('scope.domainUnset')}</span>
      </summary>
      <div className="scope-editor-body">
        <p className="scope-editor-hint">{hint}</p>
        <div className="scope-editor-grid">
          <label className="scope-editor-field" htmlFor={`${idPrefix}-domain`}>
            <span>{t('scope.domain')}</span>
            <input
              id={`${idPrefix}-domain`}
              value={draft.domain}
              aria-invalid={domainError}
              aria-describedby={domainError ? `${idPrefix}-domain-error` : undefined}
              onChange={(event) => onChange('domain', event.target.value)}
            />
            {domainError && <span className="scope-editor-error" id={`${idPrefix}-domain-error`} role="alert">{t('scope.domainRequired')}</span>}
          </label>
          <label className="scope-editor-field" htmlFor={`${idPrefix}-goal`}>
            <span>{t('scope.goalType')}</span>
            <select
              id={`${idPrefix}-goal`}
              value={draft.goalType}
              onChange={(event) => onChange('goalType', event.target.value as ScientificGoalType)}
            >
              {GOAL_TYPES.map((goal) => <option key={goal} value={goal}>{t(`scope.goal.${goal}`)}</option>)}
            </select>
          </label>
          <label className="scope-editor-field scope-editor-field--wide" htmlFor={`${idPrefix}-phenomena`}>
            <span>{t('scope.phenomena')}</span>
            <textarea
              id={`${idPrefix}-phenomena`}
              rows={3}
              value={draft.phenomena}
              placeholder={t('scope.listHint')}
              aria-invalid={phenomenaError}
              aria-describedby={phenomenaError ? `${idPrefix}-phenomena-error` : undefined}
              onChange={(event) => onChange('phenomena', event.target.value)}
            />
            {phenomenaError && <span className="scope-editor-error" id={`${idPrefix}-phenomena-error`} role="alert">{t('scope.phenomenaRequired')}</span>}
          </label>
          <label className="scope-editor-field" htmlFor={`${idPrefix}-in`}>
            <span>{t('scope.inScope')}</span>
            <textarea id={`${idPrefix}-in`} rows={2} value={draft.inScope} placeholder={t('scope.listHint')} onChange={(event) => onChange('inScope', event.target.value)} />
          </label>
          <label className="scope-editor-field" htmlFor={`${idPrefix}-out`}>
            <span>{t('scope.outOfScope')}</span>
            <textarea id={`${idPrefix}-out`} rows={2} value={draft.outOfScope} placeholder={t('scope.listHint')} onChange={(event) => onChange('outOfScope', event.target.value)} />
          </label>
        </div>
        {constraints !== undefined && (
          <p className="scope-editor-constraints">
            {t('scope.constraints')}{': '}{constraintItems.join(' · ') || t('scope.noConstraints')}
          </p>
        )}
      </div>
    </details>
  );
}
