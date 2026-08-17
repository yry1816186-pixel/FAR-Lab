import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useReport, useVerdictList } from '@/lib/api_client';
import { VERDICT_BADGE_VARIANT, isVerdictValue } from '@/lib/verdict';
import { useT } from '@/lib/i18n';
import type { HonestVerdictDto } from '@/lib/types';
import { FileText, AlertCircle, Loader2, Clock, Search, History } from 'lucide-react';

// ---------- Constants ----------


interface ReportHistoryEntry {
  runId: string;
  timestamp: string;
}

// ---------- Sub-components ----------

/** Map a verdict item to a one-line Chinese summary. */
function verdictSummaryLine(v: HonestVerdictDto): string {
  return `${v.decision} · ${v.nodeKind} · ${v.verdictId}`;
}

/**
 * Sandboxed iframe renderer.
 * Uses srcdoc set imperatively — never dangerouslySetInnerHTML (zero-tolerance #9).
 */
function ReportIframe({ html }: { html: string }) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = html;
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      title={t('report.iframeTitle')}
      className="w-full min-h-[600px] border rounded-md"
      data-testid="report-iframe"
    />
  );
}

/** Try to find a verdict in the list that relates to the given runId. */
function findRelatedVerdict(
  runId: string,
  verdicts: readonly HonestVerdictDto[],
): HonestVerdictDto | null {
  if (verdicts.length === 0) return null;
  // Try exact match on verdictId first, then evidenceId, then substring match
  const exact = verdicts.find((v) => v.verdictId === runId || v.evidenceId === runId);
  if (exact) return exact;
  const fuzzy = verdicts.find(
    (v) => v.verdictId.includes(runId) || v.evidenceId.includes(runId),
  );
  return fuzzy ?? null;
}

// ---------- Page ----------

export default function ReportPage() {
  const t = useT();
  const [runIdInput, setRunIdInput] = useState('');
  const [activeRunId, setActiveRunId] = useState('');
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);

  // Queries
  const {
    data: reportHtml,
    isLoading: reportLoading,
    isError: reportIsError,
    error: reportError,
  } = useReport(activeRunId);

  const { data: verdictData } = useVerdictList();

  const verdicts = verdictData?.items ?? [];

  // ---------- Handlers ----------

  const handleView = () => {
    const trimmed = runIdInput.trim();
    if (trimmed.length === 0) return;
    setActiveRunId(trimmed);
    setHistory((prev) => {
      if (prev.some((h) => h.runId === trimmed)) return prev;
      return [{ runId: trimmed, timestamp: new Date().toISOString() }, ...prev];
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleView();
    }
  };

  const handleHistoryClick = (runId: string) => {
    setRunIdInput(runId);
    setActiveRunId(runId);
  };

  // ---------- Render helpers ----------

  function renderContent() {
    if (activeRunId.length === 0) {
      return (
        <div
          className="flex flex-col items-center gap-3 py-16 text-center"
          data-testid="report-idle"
        >
          <FileText className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">{t('report.idle')}</p>
        </div>
      );
    }

    if (reportLoading) {
      return (
        <div
          className="flex items-center justify-center gap-2 py-16"
          data-testid="report-loading"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{t('report.reportLoading')}</span>
        </div>
      );
    }

    if (reportIsError) {
      return (
        <Alert variant="destructive" data-testid="report-error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('report.errorTitle')}</AlertTitle>
          <AlertDescription>
            {reportError instanceof Error ? reportError.message : t('report.errorTitle')}
          </AlertDescription>
        </Alert>
      );
    }

    if (reportHtml !== undefined && reportHtml.length === 0) {
      return (
        <div
          className="flex flex-col items-center gap-3 py-16 text-center"
          data-testid="report-empty"
        >
          <FileText className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">
            {t('report.empty', { id: activeRunId })}
          </p>
        </div>
      );
    }

    // Success: render sandboxed iframe
    return (
      <div data-testid="report-success">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {t('report.runIdLabel')} <code className="font-mono text-foreground">{activeRunId}</code>
          </span>
        </div>
        <ReportIframe html={reportHtml!} />
      </div>
    );
  }

  // ---------- JSX ----------

  return (
    <div className="space-y-8" data-testid="report-page">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('report.title')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('report.subtitle')}
        </p>
      </header>

      {/* Input section */}
      <section aria-labelledby="report-input-heading">
        <h2 id="report-input-heading" className="sr-only">
          {t('report.inputSr')}
        </h2>
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={runIdInput}
                  onChange={(e) => setRunIdInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('report.placeholder')}
                  aria-label={t('report.runIdAria')}
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="report-runid-input"
                />
              </div>
              <Button
                onClick={handleView}
                disabled={runIdInput.trim().length === 0}
                data-testid="report-view-btn"
              >
                {t('report.view')}
              </Button>
            </div>

            {/* Quick-select from history chips */}
            {history.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('report.recent')}</span>
                {history.slice(0, 6).map((h) => (
                  <button
                    key={h.runId}
                    type="button"
                    onClick={() => handleHistoryClick(h.runId)}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-mono transition-colors hover:bg-accent hover:text-accent-foreground"
                    data-testid={`report-history-chip-${h.runId}`}
                  >
                    {h.runId}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Main content: report iframe or state indicators */}
      <section aria-labelledby="report-content-heading">
        <h2 id="report-content-heading" className="sr-only">
          {t('report.contentSr')}
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('report.contentTitle')}</CardTitle>
            <CardDescription>
              {activeRunId.length > 0
                ? t('report.viewingRunId', { id: activeRunId })
                : t('report.noRunId')}
            </CardDescription>
          </CardHeader>
          <CardContent>{renderContent()}</CardContent>
        </Card>
      </section>

      {/* History + Verdict section */}
      <section aria-labelledby="report-history-heading" className="grid gap-4 lg:grid-cols-2">
        <h2 id="report-history-heading" className="sr-only">
          {t('report.historySr')}
        </h2>

        {/* History panel */}
        <Card data-testid="report-history-panel">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" aria-hidden="true" />
              <CardTitle className="text-lg">{t('report.historyTitle')}</CardTitle>
            </div>
            <CardDescription>{t('report.historyDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="report-history-empty"
              >
                {t('report.historyEmpty')}
              </p>
            ) : (
              <ul className="space-y-2" data-testid="report-history-list">
                {history.map((h) => {
                  const relatedVerdict = findRelatedVerdict(h.runId, verdicts);
                  return (
                    <li
                      key={h.runId}
                      className="rounded border p-3"
                      data-testid={`report-history-item-${h.runId}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleHistoryClick(h.runId)}
                          className="font-mono text-sm text-left hover:underline"
                        >
                          {h.runId}
                        </button>
                        {relatedVerdict !== null && (
                          <Badge
                            variant={
                              VERDICT_BADGE_VARIANT[isVerdictValue(relatedVerdict.decision) ? relatedVerdict.decision : 'UNTESTED']
                            }
                            data-testid={`report-verdict-badge-${h.runId}`}
                          >
                            {relatedVerdict.decision}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        <time dateTime={h.timestamp}>
                          {new Date(h.timestamp).toLocaleString('zh-CN')}
                        </time>
                      </div>
                      {relatedVerdict !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {verdictSummaryLine(relatedVerdict)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Verdict summary panel */}
        <Card data-testid="report-verdict-panel">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" aria-hidden="true" />
              <CardTitle className="text-lg">{t('report.verdictTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('report.verdictDesc', { n: verdicts.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verdicts.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="report-verdict-empty"
              >
                {t('report.verdictEmpty')}
              </p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto" data-testid="report-verdict-list">
                {verdicts.slice(0, 20).map((v) => (
                  <li
                    key={v.verdictId}
                    className="rounded border p-2 text-sm"
                    data-testid={`report-verdict-item-${v.verdictId}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-xs">{v.verdictId}</code>
                      <Badge
                        variant={VERDICT_BADGE_VARIANT[isVerdictValue(v.decision) ? v.decision : 'UNTESTED']}
                      >
                        {v.decision}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {v.nodeKind}
                      {v.evidenceId.length > 0 && ` · evidence: ${v.evidenceId}`}
                    </p>
                    {v.untestedReason !== null && v.untestedReason.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {v.untestedReason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
