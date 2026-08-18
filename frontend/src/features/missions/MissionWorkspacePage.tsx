import { Link, useNavigate, useParams } from 'react-router-dom';

import { isTerminalState } from '@/entities/run.ts';
import { ApiError } from '@/shared/api/http.ts';
import { useCancelResearch, useResearchRun, useResearchStatus } from '@/shared/api/endpoints.ts';
import { useResearchEventStream } from '@/shared/api/sse.ts';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { ErrorBlock, LoadingBlock, StreamStatusLine } from '@/shared/ui/StateBlock.tsx';
import { Tabs } from '@/shared/ui/Tabs.tsx';
import { lifecycleTone } from '@/entities/run.ts';
import { MissionOverview } from './MissionOverview.tsx';
import { MissionHypotheses } from './MissionHypotheses.tsx';
import { MissionGrounding } from './MissionGrounding.tsx';
import { MissionPlan } from './MissionPlan.tsx';
import { MissionExecution } from './MissionExecution.tsx';
import { MissionEvaluation } from './MissionEvaluation.tsx';
import { MissionProvenance } from './MissionProvenance.tsx';

const VIEWS = ['overview', 'hypotheses', 'grounding', 'plan', 'execution', 'evaluation', 'provenance'] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABEL_KEY: Readonly<Record<View, MessageKey>> = {
  overview: 'mission.tabs.overview',
  hypotheses: 'mission.tabs.hypotheses',
  grounding: 'mission.tabs.grounding',
  plan: 'mission.tabs.plan',
  execution: 'mission.tabs.execution',
  evaluation: 'mission.tabs.evaluation',
  provenance: 'mission.tabs.provenance',
};

function asView(raw: string | undefined): View {
  return VIEWS.find((v) => v === raw) ?? 'overview';
}

/**
 * The mission workspace: one research run, seven views. Live data comes from
 * the status endpoint (polled while non-terminal) plus the per-run SSE stream;
 * the frozen ResearchRun loads only when the run is COMPLETED — a 409 answer
 * is rendered as the real "not completed yet" state, never as an error.
 */
export default function MissionWorkspacePage() {
  const t = useT();
  const navigate = useNavigate();
  const { runId = '', view: rawView } = useParams();
  const view = asView(rawView);

  const status = useResearchStatus(runId);
  const terminal = status.data !== undefined && isTerminalState(status.data.state);
  const stream = useResearchEventStream(runId, { enabled: !terminal });
  const run = useResearchRun(runId, { enabled: terminal && status.data?.state === 'COMPLETED' });
  const cancel = useCancelResearch(runId);

  const runNotCompleted =
    run.error instanceof ApiError && run.error.httpStatus === 409;

  return (
    <div data-testid="mission-workspace">
      <nav aria-label="breadcrumb" className="mb-3 text-xs text-ink3">
        <Link to="/missions" className="hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          {t('nav.missions')}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="font-mono">{runId}</span>
      </nav>

      {status.isPending ? <LoadingBlock /> : null}

      {status.isError ? (
        <ErrorBlock
          error={status.error}
          testId="status-error"
          onRetry={() => void status.refetch()}
        />
      ) : null}

      {status.isSuccess ? (
        <>
          <PageHeader
            title={status.data.question}
            actions={
              <span className="flex items-center gap-2">
                <Badge tone={lifecycleTone(status.data.state)}>{status.data.state}</Badge>
                {!terminal ? (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate()}
                    data-testid="cancel-run"
                  >
                    {cancel.isPending ? t('mission.cancel.running') : t('mission.cancel')}
                  </Button>
                ) : null}
              </span>
            }
          />

          {cancel.isSuccess && !cancel.data.cancelled ? (
            <p role="status" className="mb-3 text-sm text-ink2" data-testid="cancel-noop">
              {t('mission.cancel.notRunning')}
            </p>
          ) : null}
          {cancel.isError ? <ErrorBlock error={cancel.error} testId="cancel-error" className="mb-3" /> : null}

          {!terminal ? (
            <div className="mb-4 rounded border border-border bg-surface2 px-4 py-3">
              <StreamStatusLine
                status={stream.status}
                labels={{
                  connecting: t('mission.stream.connecting'),
                  live: t('mission.stream.live'),
                  closed: t('mission.stream.closed'),
                }}
              />
              <p className="mt-1 text-sm text-ink2">{t('mission.notCompleted')}</p>
            </div>
          ) : null}

          <Tabs
            ariaLabel={t('mission.overview.title')}
            active={view}
            onChange={(id) => void navigate(`/missions/${runId}/${id}`)}
            items={VIEWS.map((v) => ({ id: v, label: t(VIEW_LABEL_KEY[v]) }))}
          />

          <div role="tabpanel" id={`tabpanel-${view}`} aria-labelledby={`tab-${view}`} className="pt-4">
            {view === 'overview' ? (
              <MissionOverview status={status.data} run={run.data ?? null} runPending={run.isPending} runNotCompleted={runNotCompleted} runError={run.error ?? null} />
            ) : null}
            {view === 'hypotheses' ? (
              <MissionHypotheses run={run.data ?? null} runPending={run.isPending} runNotCompleted={runNotCompleted} />
            ) : null}
            {view === 'grounding' ? (
              <MissionGrounding run={run.data ?? null} runPending={run.isPending} runNotCompleted={runNotCompleted} />
            ) : null}
            {view === 'plan' ? (
              <MissionPlan runId={runId} run={run.data ?? null} runPending={run.isPending} runNotCompleted={runNotCompleted} />
            ) : null}
            {view === 'execution' ? (
              <MissionExecution runId={runId} status={status.data} run={run.data ?? null} runNotCompleted={runNotCompleted} events={stream.events} streamStatus={stream.status} />
            ) : null}
            {view === 'evaluation' ? (
              <MissionEvaluation runId={runId} completed={status.data.state === 'COMPLETED'} />
            ) : null}
            {view === 'provenance' ? (
              <MissionProvenance run={run.data ?? null} runPending={run.isPending} runNotCompleted={runNotCompleted} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
