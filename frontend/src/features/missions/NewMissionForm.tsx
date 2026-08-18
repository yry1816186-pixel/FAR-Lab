import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { CreateResearchRequest } from '@/entities/dtos.ts';
import { useCreateResearch } from '@/shared/api/endpoints.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { ErrorBlock } from '@/shared/ui/StateBlock.tsx';

const SOURCE_OPTIONS = ['openalex', 'arxiv', 'crossref'] as const;

/**
 * The mission-creation form (shared by Home and the missions list).
 * `auto` profile is the default: live when a key exists, otherwise the
 * backend refuses with an actionable 503 — shown verbatim, never masked.
 */
export function NewMissionForm({ onStarted }: { readonly onStarted?: ((runId: string) => void) | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const createResearch = useCreateResearch();

  const [question, setQuestion] = useState('');
  const [profile, setProfile] = useState<'auto' | 'offline_replay'>('auto');
  const [sources, setSources] = useState<readonly string[]>(['openalex']);

  const toggleSource = (source: string): void => {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
    );
  };

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length === 0 || createResearch.isPending) return;
    const body: CreateResearchRequest = {
      question: trimmed,
      profile,
      sources: sources.length > 0 ? (sources as CreateResearchRequest['sources']) : ['openalex'],
    };
    createResearch.mutate(body, {
      onSuccess: (data) => {
        setQuestion('');
        if (onStarted !== undefined) onStarted(data.runId);
        else void navigate(`/missions/${data.runId}`);
      },
    });
  };

  const error = createResearch.error;

  return (
    <form onSubmit={onSubmit} aria-label={t('mission.create.title')} className="space-y-4">
      <div>
        <label htmlFor="new-mission-question" className="label-micro mb-1 block">
          {t('mission.create.questionLabel')}
        </label>
        <textarea
          id="new-mission-question"
          value={question}
          onChange={(evt) => setQuestion(evt.target.value)}
          placeholder={t('mission.create.questionPlaceholder')}
          rows={3}
          maxLength={2000}
          required
          className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-mission-profile" className="label-micro mb-1 block">
            {t('mission.create.profileLabel')}
          </label>
          <select
            id="new-mission-profile"
            value={profile}
            onChange={(evt) => setProfile(evt.target.value === 'offline_replay' ? 'offline_replay' : 'auto')}
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <option value="auto">{t('mission.create.profileAuto')}</option>
            <option value="offline_replay">{t('mission.create.profileReplay')}</option>
          </select>
        </div>

        <fieldset>
          <legend className="label-micro mb-1">{t('mission.create.sourcesLabel')}</legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {SOURCE_OPTIONS.map((source) => (
              <label key={source} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={sources.includes(source)}
                  onChange={() => toggleSource(source)}
                  className="h-4 w-4 accent-[var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
                />
                <span className="font-mono text-xs">{source}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink3">{t('mission.create.sourcesHint')}</p>
        </fieldset>
      </div>

      {error !== null ? <ErrorBlock error={error} testId="start-error" /> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={question.trim().length === 0 || createResearch.isPending}>
          {createResearch.isPending ? t('mission.create.starting') : t('mission.create.submit')}
        </Button>
      </div>
    </form>
  );
}
