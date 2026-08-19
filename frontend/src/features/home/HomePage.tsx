import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import type { HypothesizeResponse } from '@/entities/dtos.ts';
import type { VerdictValue } from '@/entities/verdict.ts';
import { lifecycleDot } from '@/entities/run.ts';
import { useHypothesize, useResearchList } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/shared/ui/StateBlock.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';

/** 五值 → CSS 变量语义色（design_tokens SSOT 的 Web 对应）。 */
const VERDICT_VAR: Record<VerdictValue, string> = {
  CONFIRMED: 'var(--v-confirmed)',
  REFUTED: 'var(--v-refuted)',
  INCONCLUSIVE: 'var(--v-inconclusive)',
  DEGRADED_SCOPE: 'var(--v-degraded)',
  UNTESTED: 'var(--v-untested)',
};

const VERDICT_GLOSS_KEY: Record<VerdictValue, MessageKey> = {
  CONFIRMED: 'verdict.gloss.confirmed',
  REFUTED: 'verdict.gloss.refuted',
  INCONCLUSIVE: 'verdict.gloss.inconclusive',
  DEGRADED_SCOPE: 'verdict.gloss.degraded',
  UNTESTED: 'verdict.gloss.untested',
};

/**
 * 工作台（REDESIGN 产品链产物 · flow-web F1 主屏）——打开即干活：
 * 断言输入是主角，裁决同页呈现（五值大字 + 人话理由 + 审计折叠）。
 * 零口号、零营销 hero、零机器内脏直铺。真实数据流：useHypothesize（assay 同契约）。
 */
export default function HomePage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useResearchList();
  const hypothesize = useHypothesize();

  const [claim, setClaim] = useState('');
  const [grounded, setGrounded] = useState(true);
  const [result, setResult] = useState<HypothesizeResponse | null>(null);
  const [envelopeCopied, setEnvelopeCopied] = useState(false);

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const trimmed = claim.trim();
    if (trimmed.length === 0 || hypothesize.isPending) return;
    setResult(null);
    setEnvelopeCopied(false);
    hypothesize.mutate(
      { researchInput: trimmed, mode: 'quick', dialogueMode: 'disabled', grounded },
      { onSuccess: (data) => setResult(data) },
    );
  };

  const verdict = result?.honestVerdict ?? null;

  return (
    <div data-testid="home-page">
      {/* ── 输入区：断言即主角 ─────────────────────────────── */}
      <section aria-label={t('workbench.inputRegion')} className="border-b border-border pb-8">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="workbench-claim" className="label-micro mb-2 block">
              {t('workbench.claimLabel')}
            </label>
            <textarea
              id="workbench-claim"
              value={claim}
              onChange={(evt) => setClaim(evt.target.value)}
              placeholder={t('workbench.claimPlaceholder')}
              rows={4}
              maxLength={2000}
              required
              className="w-full rounded border border-borderStrong bg-surface px-4 py-3 text-[0.9375rem] leading-7 text-ink placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button type="submit" disabled={claim.trim().length === 0 || hypothesize.isPending} data-testid="workbench-submit">
              {hypothesize.isPending ? t('workbench.running') : t('workbench.submit')}
            </Button>
            <label className="flex items-center gap-2 text-sm text-ink2" title={t('assay.claim.groundedHint')}>
              <input
                type="checkbox"
                checked={grounded}
                onChange={(evt) => setGrounded(evt.target.checked)}
                className="h-4 w-4 accent-[var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
                data-testid="workbench-grounded"
              />
              {t('assay.claim.groundedLabel')}
            </label>
          </div>
        </form>
        {hypothesize.isError ? (
          <div className="mt-4">
            <ErrorBlock error={hypothesize.error} testId="workbench-error" />
          </div>
        ) : null}
      </section>

      {/* ── 裁决区：同页呈现，五值即排版事件 ────────────────── */}
      {result !== null ? (
        <section aria-label={t('workbench.resultRegion')} className="border-b border-border py-8" data-testid="workbench-result">
          {/* 运行失败 = 结果区主状态（journey：失败不是脚注——给原因 + 给下一步） */}
          {result.loopState.error !== null ? (
            <div className="max-w-2xl rounded border border-danger/50 bg-danger/5 px-5 py-4" role="alert" data-testid="workbench-loop-error">
              <p className="text-sm font-semibold text-danger">{t('workbench.loopFailed.title')}</p>
              <p className="mt-1.5 text-sm leading-6 text-ink2">
                <span className="font-mono text-xs">{result.loopState.error.code}</span>
                {' · '}
                {result.loopState.error.message}
              </p>
              <p className="mt-2.5 text-xs leading-5 text-ink3">{t('workbench.loopFailed.nextSteps')}</p>
            </div>
          ) : null}
          {result.loopState.error === null && verdict === null ? (
            <p className="text-sm text-ink2" data-testid="workbench-no-verdict">
              {t('workbench.noVerdict')}
            </p>
          ) : null}
          {verdict !== null ? (
            <div className="space-y-5">
              <p
                className="font-display text-5xl leading-tight sm:text-6xl"
                style={{ color: VERDICT_VAR[verdict.verdict] }}
                data-testid="workbench-verdict"
              >
                {t(VERDICT_GLOSS_KEY[verdict.verdict])}
              </p>

              {/* 人话理由行：字段缺省即不显示，不画空槽 */}
              <dl className="max-w-2xl space-y-1.5 text-sm leading-6 text-ink2" data-testid="workbench-reasons">
                <div className="flex gap-3">
                  <dt className="shrink-0 text-ink3">{t('workbench.reason.test')}</dt>
                  <dd>
                    {verdict.falsificationSpec.metric}{' '}
                    {verdict.falsificationSpec.thresholdSemantics === 'range'
                      ? `∈ [${String(verdict.thresholdSpec?.lower ?? '?')}, ${String(verdict.thresholdSpec?.upper ?? '?')}]`
                      : `${verdict.falsificationSpec.thresholdSemantics === 'gt' ? '≥' : '≤'} ${String(verdict.falsificationSpec.falsificationThreshold)}`}
                    {verdict.metricValue !== null ? ` · ${t('workbench.reason.observed')} ${verdict.metricValue}` : ''}
                  </dd>
                </div>
                {verdict.conflictingEvidenceCount > 0 ? (
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('workbench.reason.conflict')}</dt>
                    <dd>{t('workbench.reason.conflictValue', { count: verdict.conflictingEvidenceCount })}</dd>
                  </div>
                ) : null}
                {verdict.scopeSlipText !== null ? (
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('workbench.reason.scope')}</dt>
                    <dd className="text-warn">{verdict.scopeSlipText}</dd>
                  </div>
                ) : null}
                {verdict.untestedReason !== null ? (
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('workbench.reason.whyUntested')}</dt>
                    <dd>{verdict.untestedReason}</dd>
                  </div>
                ) : null}
              </dl>

              {/* 审计抽屉：机器语言全部折叠于此，默认不见 */}
              <details className="max-w-2xl rounded border border-border bg-surface2/30 px-4 py-3" data-testid="workbench-audit">
                <summary className="cursor-pointer text-xs font-medium text-ink3 focus-visible:ring-2 focus-visible:ring-accent">
                  {t('workbench.auditDetails')}
                </summary>
                <dl className="mt-3 space-y-1.5 text-xs text-ink2">
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">verdictId</dt>
                    <dd className="font-mono">{verdict.verdictId}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('assay.claim.reproHash')}</dt>
                    <dd><HashValue value={result.reproHash} /></dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('evidence.integrity.chainHead')}</dt>
                    <dd><HashValue value={verdict.currentHash} /></dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="shrink-0 text-ink3">{t('assay.claim.iterations')}</dt>
                    <dd>{result.loopState.iterationsCompleted}</dd>
                  </div>
                </dl>
                {result.proofEnvelopeV2Status === 'sealed' && result.proofEnvelopeV2 != null ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="workbench-envelope-copy"
                      onClick={() => {
                        void navigator.clipboard?.writeText(JSON.stringify(result.proofEnvelopeV2, null, 2)).then(() => {
                          setEnvelopeCopied(true);
                          window.setTimeout(() => setEnvelopeCopied(false), 1500);
                        });
                      }}
                    >
                      {envelopeCopied ? t('state.copied') : t('workbench.envelope.copy')}
                    </Button>
                    <span className="text-xs text-ink3">{t('workbench.envelope.verifyHint')}</span>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-ink3">
                    {result.proofEnvelopeV2Note ?? t('workbench.envelope.none')}
                  </p>
                )}
              </details>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── 最近核验：发丝线流水 ────────────────────────────── */}
      <section aria-label={t('workbench.recentRegion')} className="py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="label-micro">{t('workbench.recent')}</h2>
          <Link to="/missions" className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
            {t('home.viewAllMissions')}
          </Link>
        </div>
        {list.isPending ? <LoadingBlock /> : null}
        {list.isError ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && list.data.runs.length === 0 ? <EmptyBlock title={t('workbench.recentEmpty')} /> : null}
        {list.isSuccess && list.data.runs.length > 0 ? (
          <ol className="border-t border-border">
            {list.data.runs.slice(0, 6).map((run) => (
              <li key={run.runId}>
                <Link
                  to={`/missions/${run.runId}`}
                  className="group flex items-baseline justify-between gap-4 border-b border-border py-3 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full"
                      style={{ backgroundColor: lifecycleDot(run.state) }}
                    />
                    <span className="truncate text-sm text-ink group-hover:text-accent">{run.question}</span>
                  </span>
                  <time className="shrink-0 text-xs tabular-nums text-ink3">{formatDateTime(run.startedAt, locale)}</time>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}
