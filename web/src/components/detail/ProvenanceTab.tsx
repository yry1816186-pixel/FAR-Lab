import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, PackageOpen, RefreshCw, ScrollText } from 'lucide-react';
import { ApiError, isNotFound, withTimeout } from '../../api/client';
import { getBundles, getEvidence, getHypotheses, getPaper, getReceipts, getReport, reexportRun, verifyBundle } from '../../api/endpoints';
import type { ProvenanceReceipt, ReceiptKind, ResearchRun, VerificationReport } from '../../api/types';

/** Receipt stage values in practice: the 12 RunStageName values or 'agent:*'
 * kernel stages (those render raw, honestly — they name a capability, not a
 * pipeline stage a researcher knows). */
const STAGE_KEYS: Record<string, ReturnType<typeof stageKey>> = {
  scope: stageKey('scope'), retrieve: stageKey('retrieve'), verify_sources: stageKey('verify_sources'),
  build_evidence: stageKey('build_evidence'), generate_hypotheses: stageKey('generate_hypotheses'),
  critique_falsify: stageKey('critique_falsify'), rank: stageKey('rank'), plan: stageKey('plan'),
  execute: stageKey('execute'), feedback: stageKey('feedback'), revise: stageKey('revise'), export: stageKey('export'),
};
import { isSettled } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { aggregateReceipts, formatTokens } from '../../viz/cross-viz';
import { formatDuration } from '../../viz/stage-viz';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Section, Skeleton, TimeText, errorText } from '../common';
import type { EventsState } from '../RunDetail';
import { buildClaimLabels, buildHypLabels } from './InlineIdRefs';
import { MarkdownDoc } from './MarkdownDoc';
import { stageKey, receiptKindKey, executionModeKey } from '../../i18n/keys';

/** Best-effort discovery kept only as a graceful fallback while the bundles API 404s on older servers (D-060). */
function discoverBundleIds(events: EventsState): string[] {
  const found = new Set<string>();
  for (const ev of events.events) {
    const text = JSON.stringify(ev.detail ?? {});
    const matches = text.match(/bnd_[a-z0-9]+/g);
    if (matches !== null) for (const m of matches) found.add(m);
  }
  return [...found];
}

export function ProvenanceTab({ run, events, onMutated }: { run: ResearchRun; events: EventsState; onMutated: () => void }): JSX.Element {
  const { t } = useI18n();
  const receiptsFetcher = useCallback((signal: AbortSignal) => getReceipts(run.id, signal), [run.id]);
  const receiptsRes = useResource(receiptsFetcher, [run.id], `${run.updatedAt}:${run.status}`);

  const bundlesFetcher = useCallback((signal: AbortSignal) => getBundles(run.id, signal), [run.id]);
  const bundlesRes = useResource(bundlesFetcher, [run.id], `${run.updatedAt}:${run.status}`);
  // Fallback to the event scan only when the first-class endpoint is missing (older server).
  const discovered = bundlesRes.error !== null && isNotFound(bundlesRes.error) ? discoverBundleIds(events) : [];

  const reportFetcher = useCallback((signal: AbortSignal) => getReport(run.id, signal), [run.id]);
  const reportRes = useResource(reportFetcher, [run.id], `${run.updatedAt}:${run.status}`);

  // BP-3 paper artifact: a 404 (pre-BP3 bundle, or export not run) simply hides the
  // download button — the report block above keeps the report-only story intact.
  const paperFetcher = useCallback((signal: AbortSignal) => getPaper(run.id, signal), [run.id]);
  const paperRes = useResource(paperFetcher, [run.id], `${run.updatedAt}:${run.status}`);
  // HX5: deliverable prose carries bare hyp_/clm_ ids — rendered previews use
  // the same human labels as the rest of the workbench. Best-effort fetches.
  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const hypRes = useResource(hypFetcher, [run.id], `${run.updatedAt}`);
  const evFetcher = useCallback((signal: AbortSignal) => getEvidence(run.id, signal), [run.id]);
  const evRes = useResource(evFetcher, [run.id], `${run.updatedAt}`);
  const hypLabels = hypRes.data !== null
    ? buildHypLabels(hypRes.data.scorecards, new Map(hypRes.data.hypotheses.map((h) => [h.id, h.statement] as const)))
    : undefined;
  const claimLabels = evRes.data !== null
    ? buildClaimLabels(evRes.data.claims.map((c) => c.id), t('idref.claim'))
    : undefined;

  const modelCalls = (receiptsRes.data ?? []).filter((r) => r.kind === 'model_call');
  const nonLive = (receiptsRes.data ?? []).filter((r) => r.executionMode !== 'live');
  const bundles = bundlesRes.data ?? [];
  const latestBundle = bundles.length > 0 ? bundles[bundles.length - 1]! : null;

  return (
    <>
      {/* First-screen actions (verify-panel review 2026-08-29): the verify /
          download affordances used to sit below 120 receipt rows. The strip
          keeps them one glance away; the full forms stay in their sections. */}
      <div className="prov-quick">
        <span className="prov-quick-label">{t('prov.quick.label')}</span>
        {latestBundle !== null ? (
          <>
            <span className="mono small" title={`${latestBundle.createdAt} · ${latestBundle.evidenceLevel}`}>{latestBundle.id}</span>
            <a className="btn btn--small" href={`/api/v1/runs/${encodeURIComponent(run.id)}/package`} title={t('report.packageHint')}>
              <PackageOpen size={12} aria-hidden="true" /> {t('report.downloadPackage')}
            </a>
          </>
        ) : (
          <span className="muted small">{t('prov.quick.noBundle', { stage: t(stageKey(run.currentStage)) })}</span>
        )}
        <a className="btn btn--small" href="#prov-verify-anchor" onClick={(e) => { e.preventDefault(); document.getElementById('prov-verify-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <ScrollText size={12} aria-hidden="true" /> {t('prov.quick.verify')}
        </a>
        {nonLive.length === 0 && receiptsRes.data !== null && receiptsRes.data.length > 0 && (
          <Badge tone="ok">{t('prov.quick.allLive', { n: receiptsRes.data.length })}</Badge>
        )}
      </div>

      <Section title={t('prov.receipts', { n: receiptsRes.data?.length ?? 0 })}>
        {receiptsRes.loading ? (
          <Skeleton lines={4} />
        ) : receiptsRes.error !== null && isNotFound(receiptsRes.error) ? (
          <EmptyState titleKey="prov.none" />
        ) : receiptsRes.error !== null ? (
          <ErrorBox error={receiptsRes.error} onRetry={receiptsRes.retry} />
        ) : receiptsRes.data !== null ? (
          <>
            <p className="muted small">
              {t('prov.summary', { n: receiptsRes.data.length, m: modelCalls.length, k: nonLive.length })}
            </p>
            {nonLive.length > 0 && <p className="callout callout--warn small">{t('prov.nonLiveWarn')}</p>}
            <ReceiptTotalsStrip receipts={receiptsRes.data} />
            <ReceiptsTable receipts={receiptsRes.data} />
          </>
        ) : null}
      </Section>

      <Section title={t('bundle.title')}>
        <span id="prov-verify-anchor" className="sr-only">{t('bundle.title')}</span>
        <BundleVerify bundles={bundles} fallbackIds={discovered} run={run} onMutated={onMutated} bundlesLoading={bundlesRes.loading} />
      </Section>

      <Section title={t('report.title')}>
        {reportRes.loading ? (
          <Skeleton lines={3} />
        ) : reportRes.error !== null && isNotFound(reportRes.error) ? (
          <EmptyState titleKey="report.none" hint={t('report.noneHint', { stage: t(stageKey(run.currentStage)) })} />
        ) : reportRes.error !== null ? (
          <ErrorBox error={reportRes.error} onRetry={reportRes.retry} />
        ) : reportRes.data !== null ? (
          <ReportBlock
            runId={run.id}
            markdown={reportRes.data}
            paperMarkdown={paperRes.data}
            hasBundle={bundles.length > 0}
            hypLabels={hypLabels}
            claimLabels={claimLabels}
          />
        ) : null}
      </Section>
    </>
  );
}

/** VIZ V6: one-line aggregate over the receipts — where the tokens and latency went. */
function ReceiptTotalsStrip({ receipts }: { receipts: ProvenanceReceipt[] }): JSX.Element | null {
  const { t } = useI18n();
  const totals = aggregateReceipts(receipts);
  if (totals.modelCalls === 0 && totals.retrievals === 0 && totals.toolExecs === 0) return null;
  return (
    <p className="receipt-totals mono small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0 8px' }}>
      <span>{t('prov.totModelCalls', { n: totals.modelCalls })}</span>
      {totals.totalTokens > 0 && <span>{t('prov.totTokens', { n: formatTokens(totals.totalTokens) })}</span>}
      {totals.latencyMsMax > 0 && (
        <span title={t('prov.totLatencyTitle', { sum: formatDuration(totals.latencyMsSum) })}>
          {t('prov.totLatency', { max: formatDuration(totals.latencyMsMax), sum: formatDuration(totals.latencyMsSum) })}
        </span>
      )}
      <span>{t('prov.totRetrievals', { n: totals.retrievals })}</span>
      <span>{t('prov.totTools', { n: totals.toolExecs })}</span>
    </p>
  );
}

function ReceiptsTable({ receipts }: { receipts: ProvenanceReceipt[] }): JSX.Element {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | ReceiptKind>('all');
  if (receipts.length === 0) return <EmptyState titleKey="prov.none" />;

  const filtered = kindFilter === 'all' ? receipts : receipts.filter((r) => r.kind === kindFilter);
  // Group by stage in arrival order (verify-panel review 2026-08-29: 120 flat
  // rows read as a log dump; the stage IS the researcher's mental model).
  const groups: { stage: string; label: string; rows: ProvenanceReceipt[] }[] = [];
  for (const r of filtered) {
    const stage = r.stage ?? 'unknown';
    const label = STAGE_KEYS[stage] !== undefined ? t(STAGE_KEYS[stage]) : stage;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.stage === stage) last.rows.push(r);
    else groups.push({ stage, label, rows: [r] });
  }

  const copyHash = (hash: string): void => {
    void navigator.clipboard.writeText(hash)
      .then(() => toast.success(t('prov.hashCopied')))
      .catch(() => toast.error(t('common.idCopyFailed')));
  };

  return (
    <>
      <div className="prov-filter" role="group" aria-label={t('prov.filterLabel')}>
        <button type="button" className={`btn btn--sm${kindFilter === 'all' ? ' btn--primary' : ''}`} aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
          {t('prov.filterAll')} {receipts.length}
        </button>
        {(['model_call', 'source_retrieval', 'tool_exec'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn--sm${kindFilter === k ? ' btn--primary' : ''}`}
            aria-pressed={kindFilter === k}
            onClick={() => setKindFilter(k)}
          >
            {t(receiptKindKey(k))} {receipts.filter((r) => r.kind === k).length}
          </button>
        ))}
      </div>
      <div className="table-scroll">
      <table className="data-table receipts">
        <caption className="sr-only">{t('prov.receipts', { n: filtered.length })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('prov.col.id')}</th>
            <th scope="col">{t('prov.col.kind')}</th>
            <th scope="col">{t('prov.col.mode')}</th>
            <th scope="col">{t('prov.col.stage')}</th>
            <th scope="col">{t('prov.col.model')}</th>
            <th scope="col">{t('prov.col.latency')}</th>
            <th scope="col">{t('prov.col.hash')}</th>
            <th scope="col">{t('prov.col.at')}</th>
            <th scope="col">{t('prov.detail')}</th>
          </tr>
        </thead>
        {groups.map((g, gi) => (
          <tbody key={`${g.stage}-${gi}`}>
            <tr className="receipt-group-row">
              <th scope="rowgroup" colSpan={9}>
                <span className="receipt-group-label">{g.label}</span>
                <span className="muted small"> {g.rows.length}</span>
              </th>
            </tr>
            {g.rows.map((r) => {
              const open = openId === r.id;
              const hashes: string[] = [];
              if (r.modelCall !== undefined) {
                hashes.push(r.modelCall.requestHash, r.modelCall.outputHash);
              } else if (r.sourceRetrieval !== undefined) {
                hashes.push(...(r.sourceRetrieval.contentHashes ?? []));
              } else if (r.toolExec !== undefined) {
                hashes.push(r.toolExec.inputHash, r.toolExec.outputHash);
              }
              const firstHash = hashes[0];
              return (
                <ReceiptRow
                  key={r.id}
                  receipt={r}
                  open={open}
                  hashNode={firstHash === undefined ? <span className="mono hash-cell">—</span> : (
                    <button
                      type="button"
                      className="mono hash-cell hash-copy"
                      title={t('prov.hashTitle', { all: hashes.join('\n') })}
                      onClick={() => copyHash(firstHash)}
                    >
                      {firstHash.slice(0, 12)}{hashes.length > 1 ? ` (+${hashes.length - 1})` : ''}
                    </button>
                  )}
                  onToggle={() => setOpenId(open ? null : r.id)}
                />
              );
            })}
          </tbody>
        ))}
      </table>
      </div>
    </>
  );
}

function ReceiptRow({
  receipt,
  open,
  hashNode,
  onToggle,
}: {
  receipt: ProvenanceReceipt;
  open: boolean;
  hashNode: JSX.Element;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const r = receipt;
  const usage = r.modelCall?.usage;
  const usageText = usage !== undefined && (usage.totalTokens ?? usage.promptTokens ?? usage.completionTokens) !== undefined
    ? `prompt=${usage.promptTokens ?? '?'} completion=${usage.completionTokens ?? '?'} total=${usage.totalTokens ?? '?'}`
    : null;

  return (
    <>
      <tr className={`receipt-row${r.executionMode === 'live' ? '' : ' receipt-row--nonlive'}`}>
        <th scope="row"><IdText value={r.id} /></th>
        <td>{t(receiptKindKey(r.kind))}</td>
        <td>
          <Badge tone={r.executionMode === 'live' ? 'ok' : 'warn'}>{t(executionModeKey(r.executionMode))}</Badge>
        </td>
        <td
          className="mono"
          title={r.stage ?? undefined}
        >
          {(() => { const k = r.stage !== undefined ? STAGE_KEYS[r.stage] : undefined; return k !== undefined ? t(k) : (r.stage ?? '—'); })()}
        </td>
        <td className="mono small">
          {r.modelCall !== undefined ? `${r.modelCall.provider}/${r.modelCall.modelId}` : r.sourceRetrieval !== undefined ? r.sourceRetrieval.family : r.toolExec !== undefined ? r.toolExec.tool : '—'}
        </td>
        <td className="mono">{r.modelCall?.latencyMs !== undefined ? `${r.modelCall.latencyMs}ms` : r.toolExec?.durationMs !== undefined ? `${r.toolExec.durationMs}ms` : '—'}</td>
        <td>{hashNode}</td>
        <td><TimeText iso={r.at} /></td>
        <td>
          <button type="button" className="link-button" aria-expanded={open} onClick={onToggle}>
            {open ? t('common.collapse') : t('common.expand')}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="receipt-detail-row">
          <td colSpan={9}>
            <div className="receipt-detail mono small">
              {r.modelCall !== undefined && (
                <>
                  <div>requestHash={r.modelCall.requestHash}</div>
                  <div>outputHash={r.modelCall.outputHash}</div>
                  {r.modelCall.modelVersion !== undefined && <div>modelVersion={r.modelCall.modelVersion}</div>}
                  {r.modelCall.finishReason !== undefined && <div>{t('prov.detail.finishReason')}={r.modelCall.finishReason}</div>}
                  {usageText !== null && <div>{t('prov.detail.usage')}: {usageText}</div>}
                </>
              )}
              {r.sourceRetrieval !== undefined && (
                <>
                  <div>{t('prov.detail.query')}: {r.sourceRetrieval.query}</div>
                  <div>{t('prov.detail.httpStatus')}={r.sourceRetrieval.httpStatus} · {t('prov.detail.resultCount')}={r.sourceRetrieval.resultCount}</div>
                  {(r.sourceRetrieval.contentHashes ?? []).map((h, i) => <div key={i}>contentHash={h}</div>)}
                </>
              )}
              {r.toolExec !== undefined && (
                <>
                  <div>{t('prov.detail.tool')}: {r.toolExec.tool}</div>
                  <div>inputHash={r.toolExec.inputHash}</div>
                  <div>outputHash={r.toolExec.outputHash}</div>
                  {r.toolExec.exitCode !== undefined && <div>{t('prov.detail.exitCode')}={r.toolExec.exitCode}</div>}
                </>
              )}
              {r.codeRevision !== undefined && <div>codeRevision={r.codeRevision}</div>}
              {r.environmentFingerprint !== undefined && <div>env={r.environmentFingerprint}</div>}
              {r.redactionNote !== undefined && <div className="muted">{t('prov.detail.redactionNote')}: {r.redactionNote}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BundleVerify({
  bundles,
  fallbackIds,
  run,
  onMutated,
  bundlesLoading,
}: {
  bundles: { id: string; createdAt: string; evidenceLevel: string }[];
  fallbackIds: string[];
  run: ResearchRun;
  onMutated: () => void;
  bundlesLoading: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [bundleId, setBundleId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reexporting, setReexporting] = useState(false);
  const [reexportError, setReexportError] = useState<ApiError | null>(null);

  const effectiveId = bundleId.trim();

  const runVerify = async (id: string): Promise<void> => {
    setError(null);
    setReport(null);
    setVerifying(true);
    const controller = new AbortController();
    try {
      const result = await verifyBundle(id, withTimeout(controller.signal, 30_000));
      setReport(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '验证请求超时（30s）', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 30 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setVerifying(false);
    }
  };

  // Re-export: server re-runs the export stage only when a revision is newer than the
  // latest bundle (honest guards: 409 busy / 400 no-bundle / 400 no-newer-revision).
  const reexportable = isSettled(run.status) && bundles.length > 0;
  const doReexport = async (): Promise<void> => {
    setReexportError(null);
    setReexporting(true);
    const controller = new AbortController();
    try {
      await reexportRun(run.id, withTimeout(controller.signal, 15_000));
      toast.success(t('bundle.reexportStarted'));
      onMutated(); // refresh run detail; the new bundle appears in the chips below
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setReexportError(new ApiError({ code: 'timeout', message: '请求超时（15s）', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 15 } }));
      } else {
        setReexportError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setReexporting(false);
    }
  };

  const verdictTone = report === null ? 'muted' : report.verdict === 'verified' ? 'ok' : report.verdict === 'degraded' ? 'warn' : 'err';

  return (
    <div className="bundle-verify">
      <p className="muted small">{t('bundle.intro')}</p>
      {!bundlesLoading && bundles.length > 0 && (
        <p className="small">
          {t('bundle.discovered')}{' '}
          {bundles.map((b) => (
            <button key={b.id} type="button" className="chip-button mono" onClick={() => setBundleId(b.id)} title={`${b.createdAt} · ${b.evidenceLevel}`}>
              {b.id}
            </button>
          ))}
        </p>
      )}
      {bundles.length === 0 && fallbackIds.length > 0 && (
        <p className="small">
          {t('bundle.discovered')}{' '}
          {fallbackIds.map((id) => (
            <button key={id} type="button" className="chip-button mono" onClick={() => setBundleId(id)}>
              {id}
            </button>
          ))}
        </p>
      )}
      <div className="bundle-form">
        <label className="field-label" htmlFor="bundle-id">
          {t('bundle.inputLabel')}
        </label>
        <input
          id="bundle-id"
          type="text"
          className="mono"
          value={bundleId}
          placeholder={t('bundle.inputPlaceholder')}
          onChange={(e) => setBundleId(e.target.value)}
          disabled={verifying}
        />
        <div className="bundle-actions">
          <button type="button" className="btn btn--primary" disabled={verifying || effectiveId.length === 0} onClick={() => void runVerify(effectiveId)}>
            {verifying ? t('bundle.verifying') : t('bundle.verify')}
          </button>
          {reexportable && (
            <button type="button" className="btn" disabled={reexporting} onClick={() => void doReexport()} title={t('bundle.reexportHint')}>
              {reexporting ? <RefreshCw size={13} aria-hidden="true" className="spin" /> : <RefreshCw size={13} aria-hidden="true" />} {t('bundle.reexport')}
            </button>
          )}
        </div>
      </div>
      {reexportError !== null && (
        <p className="field-error" role="alert">
          {t('bundle.reexportFailed')}：{errorText(reexportError)}
        </p>
      )}
      {error !== null && (
        <div role="alert">
          <p className="field-error">
            {errorText(error)}
            {isNotFound(error) ? ` — ${t('bundle.notFoundHint')}` : ''}
          </p>
        </div>
      )}
      {report !== null && (
        <div className="bundle-report">
          <p>
            <strong>{t('bundle.verdict')}:</strong>{' '}
            <Badge tone={verdictTone}>{report.verdict}</Badge>{' '}
            <span className="muted small mono">
              {report.bundleId} · declaredEvidenceLevel={report.declaredEvidenceLevel}
            </span>
          </p>
          {/* S2b: the bundle's own declared reproduction limits — part of the verdict,
              never buried (mandatory honesty travels with the check table). */}
          {(report.limitations ?? []).length > 0 && (
            <div className="callout callout--warn small">
              <strong>{t('bundle.limitations')}</strong>
              <ul className="bundle-limitations">
                {report.limitations!.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{t('bundle.checks', { n: report.checks.length })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('bundle.checkName')}</th>
                  <th scope="col">{t('bundle.checkResult')}</th>
                  <th scope="col">{t('bundle.checkDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {report.checks.map((c) => (
                  <tr key={c.name}>
                    <th scope="row" className="mono small">{c.name}</th>
                    <td>
                      <Badge tone={c.passed ? 'ok' : 'err'}>{c.passed ? 'PASS' : 'FAIL'}</Badge>
                    </td>
                    <td className="small">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.replayGuidance !== undefined && report.replayGuidance.length > 0 && (
            <details>
              <summary>{t('bundle.replayGuidance')}</summary>
              <pre className="pre-block">{report.replayGuidance}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ReportBlock({ runId, markdown, paperMarkdown, hasBundle, hypLabels, claimLabels }: {
  runId: string;
  markdown: string;
  paperMarkdown: string | null;
  /** CPS-7: a stored bundle exists -> the full-package download is offered. */
  hasBundle: boolean;
  hypLabels?: Map<string, string>;
  claimLabels?: Map<string, string>;
}): JSX.Element {
  const { t } = useI18n();
  const hasPaper = paperMarkdown !== null;
  const [doc, setDoc] = useState<'report' | 'paper'>('report');
  const active = doc === 'report' || !hasPaper ? markdown : paperMarkdown ?? markdown;

  const downloadBlob = (text: string, name: string): void => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-block">
      <div className="report-actions">
        {hasPaper ? (
          <div className="doc-switch" role="tablist" aria-label={t('report.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={doc === 'report' || !hasPaper}
              className={`doc-switch-btn${doc === 'report' || !hasPaper ? ' doc-switch-btn--active' : ''}`}
              onClick={() => setDoc('report')}
            >
              <ScrollText size={13} aria-hidden="true" /> {t('report.tabReport')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={doc === 'paper'}
              className={`doc-switch-btn${doc === 'paper' ? ' doc-switch-btn--active' : ''}`}
              onClick={() => setDoc('paper')}
            >
              <FileText size={13} aria-hidden="true" /> {t('report.tabPaper')}
            </button>
          </div>
        ) : (
          <span className="muted small">{t('report.title')}</span>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => downloadBlob(active, doc === 'paper' && hasPaper ? `${runId}.paper.md` : `${runId}.report.md`)}
          title={t('report.downloadHint')}
        >
          <Download size={13} aria-hidden="true" />
          {doc === 'paper' && hasPaper ? t('report.downloadPaper') : t('report.download')}
        </button>
        {hasBundle && (
          <a
            className="btn"
            href={`/api/v1/runs/${encodeURIComponent(runId)}/package`}
            title={t('report.packageHint')}
          >
            <PackageOpen size={13} aria-hidden="true" />
            {t('report.downloadPackage')}
          </a>
        )}
        <span className="muted small">{t('report.chars', { n: active.length })}</span>
      </div>
      {/* Rendered preview (HX5): downloaded files keep raw ids; the preview
          humanizes hyp_/clm_ references with the workbench labels. */}
      <MarkdownDoc markdown={active} hypLabels={hypLabels} claimLabels={claimLabels} />
    </div>
  );
}
