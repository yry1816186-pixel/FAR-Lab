import { useCallback, useState } from 'react';
import { ApiError, isNotFound, withTimeout } from '../../api/client';
import { getReceipts, getReport, verifyBundle } from '../../api/endpoints';
import type { ProvenanceReceipt, ResearchRun, VerificationReport } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, EmptyState, ErrorBox, IdText, Section, Skeleton, TimeText, errorText } from '../common';
import type { EventsState } from '../RunDetail';

/** Best-effort discovery: bundle ids that actually appeared in the event stream (e.g. export stage summaries). */
function discoverBundleIds(events: EventsState): string[] {
  const found = new Set<string>();
  for (const ev of events.events) {
    const text = JSON.stringify(ev.detail ?? {});
    const matches = text.match(/bnd_[a-z0-9]+/g);
    if (matches !== null) for (const m of matches) found.add(m);
  }
  return [...found];
}

export function ProvenanceTab({ run, events }: { run: ResearchRun; events: EventsState }): JSX.Element {
  const { t } = useI18n();
  const receiptsFetcher = useCallback((signal: AbortSignal) => getReceipts(run.id, signal), [run.id]);
  const receiptsRes = useResource(receiptsFetcher, [run.id], `${run.updatedAt}:${run.status}`);

  const reportFetcher = useCallback((signal: AbortSignal) => getReport(run.id, signal), [run.id]);
  const reportRes = useResource(reportFetcher, [run.id], `${run.updatedAt}:${run.status}`);

  const modelCalls = (receiptsRes.data ?? []).filter((r) => r.kind === 'model_call');
  const nonLive = (receiptsRes.data ?? []).filter((r) => r.executionMode !== 'live');

  return (
    <div className="tab-content">
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
            <ReceiptsTable receipts={receiptsRes.data} />
          </>
        ) : null}
      </Section>

      <Section title={t('bundle.title')}>
        <BundleVerify discovered={discoverBundleIds(events)} />
      </Section>

      <Section title={t('report.title')}>
        {reportRes.loading ? (
          <Skeleton lines={3} />
        ) : reportRes.error !== null && isNotFound(reportRes.error) ? (
          <EmptyState titleKey="report.none" hint={t('report.noneHint', { stage: t(`stage.${run.currentStage}` as never) })} />
        ) : reportRes.error !== null ? (
          <ErrorBox error={reportRes.error} onRetry={reportRes.retry} />
        ) : reportRes.data !== null ? (
          <ReportBlock runId={run.id} markdown={reportRes.data} />
        ) : null}
      </Section>
    </div>
  );
}

function ReceiptsTable({ receipts }: { receipts: ProvenanceReceipt[] }): JSX.Element {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  if (receipts.length === 0) return <EmptyState titleKey="prov.none" />;

  return (
    <div className="table-scroll">
      <table className="data-table receipts">
        <caption className="sr-only">{t('prov.receipts', { n: receipts.length })}</caption>
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
        <tbody>
          {receipts.map((r) => {
            const open = openId === r.id;
            const hashes: string[] = [];
            if (r.modelCall !== undefined) {
              hashes.push(r.modelCall.requestHash, r.modelCall.outputHash);
            } else if (r.sourceRetrieval !== undefined) {
              hashes.push(...(r.sourceRetrieval.contentHashes ?? []));
            } else if (r.toolExec !== undefined) {
              hashes.push(r.toolExec.inputHash, r.toolExec.outputHash);
            }
            return (
              <ReceiptRow
                key={r.id}
                receipt={r}
                open={open}
                hashSummary={hashes.length > 0 ? `${hashes[0]!.slice(0, 12)} (+${hashes.length - 1})` : '—'}
                onToggle={() => setOpenId(open ? null : r.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptRow({
  receipt,
  open,
  hashSummary,
  onToggle,
}: {
  receipt: ProvenanceReceipt;
  open: boolean;
  hashSummary: string;
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
        <td>{t(`receiptKind.${r.kind}` as never)}</td>
        <td>
          <Badge tone={r.executionMode === 'live' ? 'ok' : 'warn'}>{t(`mode.${r.executionMode}` as never)}</Badge>
        </td>
        <td className="mono">{r.stage ?? '—'}</td>
        <td className="mono small">
          {r.modelCall !== undefined ? `${r.modelCall.provider}/${r.modelCall.modelId}` : r.sourceRetrieval !== undefined ? r.sourceRetrieval.family : r.toolExec !== undefined ? r.toolExec.tool : '—'}
        </td>
        <td className="mono">{r.modelCall?.latencyMs !== undefined ? `${r.modelCall.latencyMs}ms` : r.toolExec?.durationMs !== undefined ? `${r.toolExec.durationMs}ms` : '—'}</td>
        <td className="mono hash-cell">{hashSummary}</td>
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

function BundleVerify({ discovered }: { discovered: string[] }): JSX.Element {
  const { t } = useI18n();
  const [bundleId, setBundleId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const effectiveId = bundleId.trim();

  const run = async (id: string): Promise<void> => {
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

  const verdictTone = report === null ? 'muted' : report.verdict === 'verified' ? 'ok' : report.verdict === 'degraded' ? 'warn' : 'err';

  return (
    <div className="bundle-verify">
      <p className="muted small">{t('bundle.intro')}</p>
      {discovered.length > 0 && (
        <p className="small">
          {t('bundle.discovered')}{' '}
          {discovered.map((id) => (
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
        <button type="button" className="btn btn--primary" disabled={verifying || effectiveId.length === 0} onClick={() => void run(effectiveId)}>
          {verifying ? t('bundle.verifying') : t('bundle.verify')}
        </button>
      </div>
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

function ReportBlock({ runId, markdown }: { runId: string; markdown: string }): JSX.Element {
  const { t } = useI18n();
  const [showPreview, setShowPreview] = useState(false);

  const download = (): void => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runId}.report.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-block">
      <div className="report-actions">
        <button type="button" className="btn" onClick={download}>
          {t('report.download')}
        </button>
        <button type="button" className="btn" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? t('common.collapse') : t('report.preview')}
        </button>
        <span className="muted small">{t('report.chars', { n: markdown.length })}</span>
      </div>
      {showPreview && <pre className="pre-block report-preview">{markdown}</pre>}
    </div>
  );
}
