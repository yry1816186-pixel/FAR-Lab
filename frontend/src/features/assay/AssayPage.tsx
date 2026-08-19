import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { isVerdictValue } from '@/entities/verdict.ts';
import type { HypothesizeResponse } from '@/entities/dtos.ts';
import { useArenaLive, useCourtLive, useHypothesize, useLlmStatus } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { Badge, type Tone } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { ErrorBlock, Section, UnavailableBlock } from '@/shared/ui/StateBlock.tsx';
import { Tabs } from '@/shared/ui/Tabs.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';

const INSTRUMENTS = ['claim', 'court', 'arena'] as const;
type Instrument = (typeof INSTRUMENTS)[number];

const INSTRUMENT_KEY: Readonly<Record<Instrument, MessageKey>> = {
  claim: 'assay.tabs.claim',
  court: 'assay.tabs.court',
  arena: 'assay.tabs.arena',
};

const DATASET_KEY: Readonly<Record<string, MessageKey>> = {
  online: 'assay.dataset.online',
  cached_fixture: 'assay.dataset.cached_fixture',
  replay: 'assay.dataset.replay',
  fixture: 'assay.dataset.fixture',
};

const DATASET_TONE: Readonly<Record<string, Tone>> = {
  online: 'ok',
  cached_fixture: 'info',
  replay: 'warn',
  fixture: 'muted',
};

function DatasetSourceBadge({ source }: { readonly source: string }) {
  const t = useT();
  const key = DATASET_KEY[source];
  return <Badge tone={DATASET_TONE[source] ?? 'muted'}>{key !== undefined ? t(key) : source}</Badge>;
}

/** Court/Arena are live-only: without a configured key the backend 503s — the
 * UI states that requirement up front instead of letting the user discover it. */
function LiveGate({ children }: { readonly children: React.ReactNode }) {
  const t = useT();
  const llm = useLlmStatus();
  if (llm.isSuccess && !llm.data.keyConfigured) {
    return (
      <UnavailableBlock
        testId="llm-unavailable"
        title={t('assay.unavailable.title')}
        body={t('assay.unavailable.body')}
      />
    );
  }
  return <>{children}</>;
}

function ClaimTab() {
  const t = useT();
  const { locale } = useI18n();
  const hypothesize = useHypothesize();
  const [claim, setClaim] = useState('');
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const [grounded, setGrounded] = useState(false);
  const [envelopeCopied, setEnvelopeCopied] = useState(false);
  const [result, setResult] = useState<HypothesizeResponse | null>(null);

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const trimmed = claim.trim();
    if (trimmed.length === 0 || hypothesize.isPending) return;
    setResult(null);
    setEnvelopeCopied(false);
    hypothesize.mutate(
      { researchInput: trimmed, mode, dialogueMode: 'disabled', grounded },
      { onSuccess: (data) => setResult(data) },
    );
  };

  const verdict = result?.honestVerdict ?? null;

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-4" aria-label={t('assay.tabs.claim')}>
        <div>
          <label htmlFor="assay-claim" className="label-micro mb-1 block">
            {t('assay.claim.inputLabel')}
          </label>
          <textarea
            id="assay-claim"
            value={claim}
            onChange={(evt) => setClaim(evt.target.value)}
            placeholder={t('assay.claim.inputPlaceholder')}
            rows={3}
            required
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="assay-mode" className="label-micro mb-1 block">
              {t('assay.claim.modeLabel')}
            </label>
            <select
              id="assay-mode"
              value={mode}
              onChange={(evt) => setMode(evt.target.value === 'full' ? 'full' : 'quick')}
              className="rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <option value="quick">{t('assay.claim.modeQuick')}</option>
              <option value="full">{t('assay.claim.modeFull')}</option>
            </select>
          </div>
          <Button type="submit" disabled={claim.trim().length === 0 || hypothesize.isPending} data-testid="assay-submit">
            {hypothesize.isPending ? t('assay.claim.running') : t('assay.claim.submit')}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink2">
          <input
            type="checkbox"
            checked={grounded}
            onChange={(evt) => setGrounded(evt.target.checked)}
            className="h-4 w-4 accent-[var(--accent)] focus-visible:ring-2 focus-visible:ring-accent"
            data-testid="assay-grounded"
          />
          {t('assay.claim.groundedLabel')}
        </label>
        <p className="-mt-2 text-xs text-ink3">{t('assay.claim.groundedHint')}</p>
      </form>

      {hypothesize.isError ? <ErrorBlock error={hypothesize.error} testId="assay-error" className="mt-4" /> : null}

      {result !== null ? (
        <Section title={t('assay.claim.result')}>
          {verdict === null ? (
            <p className="text-sm text-ink2" data-testid="assay-no-verdict">
              {t('assay.claim.noVerdict')}
            </p>
          ) : (
            <div className="space-y-4" data-testid="assay-result">
              <div className="flex flex-wrap items-center gap-3">
                <VerdictBadge verdict={verdict.verdict} />
                <span className="font-mono text-xs text-ink3">{verdict.verdictId}</span>
              </div>
              <KeyValueList>
                <KeyValue label={t('verdict.falsification')}>
                  <span className="font-mono text-xs">
                    {verdict.falsificationSpec.metric}{' '}
                    {verdict.falsificationSpec.thresholdSemantics === 'range'
                      ? `[${String(verdict.thresholdSpec?.lower ?? '?')}, ${String(verdict.thresholdSpec?.upper ?? '?')}]`
                      : `${verdict.falsificationSpec.thresholdSemantics === 'gt' ? '≥' : '≤'} ${String(verdict.falsificationSpec.falsificationThreshold)}`}
                  </span>
                </KeyValue>
                <KeyValue label={t('verdict.metricValue')}>
                  <span className="font-mono text-xs">{verdict.metricValue ?? '—'}</span>
                </KeyValue>
                <KeyValue label={t('verdict.conflictingEvidence')}>{verdict.conflictingEvidenceCount}</KeyValue>
                {verdict.scopeSlipText !== null ? (
                  <KeyValue label={t('verdict.scopeSlip')}>
                    <span className="text-warn">{verdict.scopeSlipText}</span>
                  </KeyValue>
                ) : null}
                {verdict.untestedReason !== null ? (
                  <KeyValue label={t('verdict.untestedReason')}>{verdict.untestedReason}</KeyValue>
                ) : null}
                <KeyValue label={t('assay.claim.iterations')}>{result.loopState.iterationsCompleted}</KeyValue>
                <KeyValue label={t('assay.claim.reproHash')}>
                  <HashValue value={result.reproHash} />
                </KeyValue>
                <KeyValue label={t('evidence.integrity.chainHead')}>
                  <HashValue value={verdict.currentHash} />
                </KeyValue>
              </KeyValueList>
              <p className="text-xs text-ink3">
                {t('assay.claim.graph', { nodes: result.graphSubtree.nodes.length, edges: result.graphSubtree.edges.length })}
                {' · '}
                <time dateTime={verdict.createdAt}>{formatDateTime(verdict.createdAt, locale)}</time>
              </p>
              {result.loopState.error !== null ? (
                <p role="alert" className="text-sm text-danger">
                  {t('assay.claim.loopError')}: {result.loopState.error.code} — {result.loopState.error.message}
                </p>
              ) : null}
            </div>
          )}
          <div className="mt-4 rounded border border-border bg-surface2/40 p-3" data-testid="envelope-panel">
            {result.proofEnvelopeV2Status === 'sealed' && result.proofEnvelopeV2 != null ? (
              <div>
                <p className="mb-2 text-xs text-ink3">{t('assay.envelope.sealedNote')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="envelope-copy"
                    onClick={() => {
                      void navigator.clipboard?.writeText(JSON.stringify(result.proofEnvelopeV2, null, 2)).then(() => {
                        setEnvelopeCopied(true);
                        window.setTimeout(() => setEnvelopeCopied(false), 1500);
                      });
                    }}
                  >
                    {envelopeCopied ? t('state.copied') : t('assay.envelope.copy')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="envelope-download"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(result.proofEnvelopeV2, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'proof-envelope-v2.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    {t('assay.envelope.download')}
                  </Button>
                  <Link
                    to="/verify"
                    className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {t('assay.envelope.goVerify')}
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-warn" data-testid="envelope-skipped">
                {t('assay.envelope.skipped')}{result.proofEnvelopeV2Note != null ? `：${result.proofEnvelopeV2Note}` : ''}
              </p>
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function CourtTab() {
  const t = useT();
  const court = useCourtLive();
  const [claim, setClaim] = useState('');
  const [models, setModels] = useState('');

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const modelList = models.split('\n').map((m) => m.trim()).filter((m) => m.length > 0);
    if (claim.trim().length === 0 || modelList.length === 0 || court.isPending) return;
    court.mutate({ claim: claim.trim(), models: modelList });
  };

  const certificate = court.data ?? null;

  return (
    <LiveGate>
      <form onSubmit={onSubmit} className="space-y-4" aria-label={t('assay.tabs.court')}>
        <div>
          <label htmlFor="court-claim" className="label-micro mb-1 block">
            {t('assay.court.claimLabel')}
          </label>
          <textarea
            id="court-claim"
            value={claim}
            onChange={(evt) => setClaim(evt.target.value)}
            rows={2}
            required
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="court-models" className="label-micro mb-1 block">
            {t('assay.court.modelsLabel')}
          </label>
          <textarea
            id="court-models"
            value={models}
            onChange={(evt) => setModels(evt.target.value)}
            rows={3}
            required
            aria-describedby="court-models-hint"
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
          <p id="court-models-hint" className="mt-1 text-xs text-ink3">
            {t('assay.court.modelsHint')}
          </p>
        </div>
        <Button type="submit" disabled={court.isPending} data-testid="court-submit">
          {court.isPending ? t('assay.court.running') : t('assay.court.submit')}
        </Button>
      </form>

      {court.isError ? <ErrorBlock error={court.error} testId="court-error" className="mt-4" /> : null}

      {certificate !== null ? (
        <Section title={t('assay.court.result')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={certificate.agreement === 'unanimous' ? 'ok' : certificate.agreement === 'majority' ? 'info' : 'warn'}>
              {t(`assay.court.agreement.${certificate.agreement}` as MessageKey)}
            </Badge>
            <DatasetSourceBadge source={certificate.datasetSource} />
            <span className="font-mono text-xs text-ink3">{certificate.certificateId}</span>
          </div>
          <DataTable caption={t('assay.court.result')} head={[t('assay.court.model'), t('assay.court.verdict'), t('assay.court.rule'), t('assay.court.chainHead')]}>
            {certificate.verdicts.map((entry) => (
              <tr key={entry.model}>
                <Td mono>{entry.model}</Td>
                <Td>
                  {entry.verdict !== null && isVerdictValue(entry.verdict) ? (
                    <VerdictBadge verdict={entry.verdict} showGloss={false} />
                  ) : (
                    <span className="text-xs text-ink3">{entry.verdict ?? entry.error ?? '—'}</span>
                  )}
                </Td>
                <Td mono>{entry.decisiveRuleId ?? '—'}</Td>
                <Td>{entry.chainHead !== null ? <HashValue value={entry.chainHead} /> : '—'}</Td>
              </tr>
            ))}
          </DataTable>
          <p className="mt-3 text-xs text-ink3">{certificate.honestNote}</p>
        </Section>
      ) : null}
    </LiveGate>
  );
}

function ArenaTab() {
  const t = useT();
  const arena = useArenaLive();
  const [hypothesis, setHypothesis] = useState('');
  const [refuters, setRefuters] = useState('');

  const onSubmit = (evt: FormEvent<HTMLFormElement>): void => {
    evt.preventDefault();
    const refuterList = refuters.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
    if (hypothesis.trim().length === 0 || refuterList.length === 0 || arena.isPending) return;
    arena.mutate({ hypothesis: hypothesis.trim(), refuters: refuterList });
  };

  const result = arena.data ?? null;

  return (
    <LiveGate>
      <form onSubmit={onSubmit} className="space-y-4" aria-label={t('assay.tabs.arena')}>
        <div>
          <label htmlFor="arena-hypothesis" className="label-micro mb-1 block">
            {t('assay.arena.hypothesisLabel')}
          </label>
          <textarea
            id="arena-hypothesis"
            value={hypothesis}
            onChange={(evt) => setHypothesis(evt.target.value)}
            rows={2}
            required
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 text-sm text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="arena-refuters" className="label-micro mb-1 block">
            {t('assay.arena.refutersLabel')}
          </label>
          <textarea
            id="arena-refuters"
            value={refuters}
            onChange={(evt) => setRefuters(evt.target.value)}
            rows={3}
            required
            aria-describedby="arena-refuters-hint"
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
          <p id="arena-refuters-hint" className="mt-1 text-xs text-ink3">
            {t('assay.arena.refutersHint')}
          </p>
        </div>
        <Button type="submit" disabled={arena.isPending} data-testid="arena-submit">
          {arena.isPending ? t('assay.arena.running') : t('assay.arena.submit')}
        </Button>
      </form>

      {arena.isError ? <ErrorBlock error={arena.error} testId="arena-error" className="mt-4" /> : null}

      {result !== null ? (
        <Section title={t('assay.arena.result')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={result.robust ? 'ok' : 'danger'}>{result.robust ? t('assay.arena.robust') : t('assay.arena.notRobust')}</Badge>
            <Badge tone="muted">{t('assay.arena.landed', { landed: result.landedCount, total: result.attempts.length })}</Badge>
            <DatasetSourceBadge source={result.datasetSource} />
          </div>
          <p className="mb-3 text-sm text-ink2">
            {t('assay.arena.original')}:{' '}
            {result.originalVerdict !== null && isVerdictValue(result.originalVerdict) ? (
              <VerdictBadge verdict={result.originalVerdict} showGloss={false} />
            ) : (
              <span className="font-mono text-xs">{result.originalVerdict ?? '—'}</span>
            )}
          </p>
          <DataTable caption={t('assay.arena.result')} head={[t('assay.arena.attacker'), t('assay.court.verdict'), t('assay.arena.attackLanded')]}>
            {result.attempts.map((attempt) => (
              <tr key={attempt.refuter}>
                <Td mono>{attempt.refuter}</Td>
                <Td>
                  {attempt.verdict !== null && isVerdictValue(attempt.verdict) ? (
                    <VerdictBadge verdict={attempt.verdict} showGloss={false} />
                  ) : (
                    <span className="text-xs text-ink3">{attempt.verdict ?? attempt.error ?? '—'}</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={attempt.attackLanded ? 'danger' : 'muted'}>{attempt.attackLanded ? t('benchmark.yes') : t('benchmark.no')}</Badge>
                </Td>
              </tr>
            ))}
          </DataTable>
          <p className="mt-3 text-xs text-ink3">{result.honestNote}</p>
        </Section>
      ) : null}
    </LiveGate>
  );
}

/** Assay — single-claim verdict + live cross-model instruments. */
export default function AssayPage() {
  const t = useT();
  const [instrument, setInstrument] = useState<Instrument>('claim');

  return (
    <div data-testid="assay-page">
      <PageHeader title={t('assay.title')} lede={t('assay.lede')} />
      <Tabs
        ariaLabel={t('assay.title')}
        active={instrument}
        onChange={(id) => setInstrument(id as Instrument)}
        items={INSTRUMENTS.map((i) => ({ id: i, label: t(INSTRUMENT_KEY[i]) }))}
      />
      <div role="tabpanel" id={`tabpanel-${instrument}`} aria-labelledby={`tab-${instrument}`} className="pt-4">
        {instrument === 'claim' ? <ClaimTab /> : null}
        {instrument === 'court' ? <CourtTab /> : null}
        {instrument === 'arena' ? <ArenaTab /> : null}
      </div>
    </div>
  );
}
