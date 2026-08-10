/**
 * ArenaPage —— 对抗科学竞技场可视化（W3 / FI-2）。
 *
 * 端点：GET /api/v1/arena/demo（参考 fixture）+ POST /api/v1/arena（WS-A.3 live）。
 * 四组件：LiveSessionForm（WS-B.2）+ RobustHero + RefuterScoreboard + HonestyAlert。
 *
 * 诚实定位（红线）：demo 用 offline_replay（同 fixture→robust）。live 表单：DASHSCOPE_API_KEY
 * 配置时走真实 provider（datasetSource=real），否则诚实降级 offline replay。arbiter 是确定性规则
 * （verdict 分歧检测），非 LLM 仲裁。
 */

import { useState } from 'react';
import { useArenaDemo, useArenaLive, useLlmStatus } from '@/lib/api_client';
import type { ArenaResultDto } from '@/lib/types';
import { useT } from '@/lib/i18n';
import type { VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VerdictBadge } from '@/components/VerdictBadge';
import { IntegrityBadge } from '@/components/IntegrityBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Swords, ShieldCheck, ShieldAlert, Swords as SwordIcon, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const FIVE_VERDICTS = new Set<string>([
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
]);

function isVerdictValue(v: string): v is VerdictValue {
  return FIVE_VERDICTS.has(v);
}

/** ArenaResultDisplay — 复用展示组件（demo + live 共用·根据 result 渲染）。 */
function ArenaResultDisplay({ result }: { readonly result: ArenaResultDto }) {
  const t = useT();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result.robust ? (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            )}
            {t('arena.verdictTitle')}
          </CardTitle>
          <CardDescription>{t('arena.hypothesis', { h: result.hypothesis })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Badge variant={result.robust ? 'default' : 'destructive'} className="text-base">
            {result.robust ? t('arena.robust') : t('arena.breached', { n: result.landedCount })}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t('arena.originalVerdict')}
            {result.originalVerdict !== null && isVerdictValue(result.originalVerdict) ? (
              <VerdictBadge decision={result.originalVerdict} size="sm" />
            ) : (
              <span className="text-muted-foreground">{t('arena.noVerdict')}</span>
            )}
            {result.originalRule !== null && (
              <code className="ml-2 text-xs">{result.originalRule}</code>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('arena.arenaId')} <code className="rounded bg-muted px-1.5 py-0.5">{result.arenaId}</code>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('arena.scoreboardTitle')}</CardTitle>
          <CardDescription>{t('arena.scoreboardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('arena.col.refuter')}</TableHead>
                <TableHead>{t('arena.col.verdict')}</TableHead>
                <TableHead>{t('arena.col.result')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.attempts.map((a) => (
                <TableRow key={a.refuter}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1">
                      <SwordIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      {a.refuter}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.verdict !== null && isVerdictValue(a.verdict) ? (
                      <VerdictBadge decision={a.verdict} size="sm" />
                    ) : (
                      <Badge variant="destructive">{t('arena.noVerdict')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.attackLanded ? (
                      <Badge variant="destructive">{t('arena.landed')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('arena.held')}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Alert>
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle className="flex items-center gap-2">{t('arena.honestyTitle')} <IntegrityBadge source={result.datasetSource} /></AlertTitle>
        <AlertDescription>
          <p>{result.honestNote}</p>
          <p className="mt-2"><strong>{t('arena.redLine')}</strong></p>
        </AlertDescription>
      </Alert>
    </>
  );
}

export default function ArenaPage() {
  const t = useT();
  const { data: demoResult, isLoading, isError, error } = useArenaDemo();
  const { data: llmStatus } = useLlmStatus();
  const arenaLive = useArenaLive();

  const [liveHypothesis, setLiveHypothesis] = useState('');
  const [liveRefuters, setLiveRefuters] = useState('scope-launderer, post-hoc-threshold, dataset-drift');

  const isLiveMode = llmStatus?.keyConfigured === true;

  const handleLiveRun = () => {
    const refuters = liveRefuters.split(',').map((r) => r.trim()).filter((r) => r.length > 0);
    if (liveHypothesis.trim().length === 0 || refuters.length === 0) return;
    void arenaLive.mutate({ hypothesis: liveHypothesis.trim(), refuters });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Swords className="h-7 w-7" aria-hidden="true" />
          {t('arena.title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('arena.subtitle2')}</p>
      </header>

      {/* WS-B.2 LLM 状态横幅 */}
      <Alert data-testid="arena-llm-status">
        <Zap className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>{isLiveMode ? t('llm.status.liveTitle') : t('llm.status.offlineTitle')}</AlertTitle>
        <AlertDescription>
          {isLiveMode ? t('llm.status.liveBody') : t('llm.status.offlineBody')}
        </AlertDescription>
      </Alert>

      {/* WS-B.2 Live session form */}
      <Card data-testid="arena-live-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" aria-hidden="true" />
            {t('arena.live.title')}
          </CardTitle>
          <CardDescription>{t('arena.live.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="arena-live-hypothesis" className="text-sm font-medium">
              {t('arena.live.hypothesisLabel')}
            </label>
            <textarea
              id="arena-live-hypothesis"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('arena.live.hypothesisPlaceholder')}
              value={liveHypothesis}
              onChange={(e) => setLiveHypothesis(e.target.value)}
              data-testid="arena-live-hypothesis-input"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="arena-live-refuters" className="text-sm font-medium">
              {t('arena.live.refutersLabel')}
            </label>
            <input
              id="arena-live-refuters"
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={liveRefuters}
              onChange={(e) => setLiveRefuters(e.target.value)}
              data-testid="arena-live-refuters-input"
            />
          </div>
          <Button onClick={handleLiveRun} disabled={arenaLive.isPending || liveHypothesis.trim().length === 0} data-testid="arena-live-run">
            {arenaLive.isPending ? t('arena.live.running') : t('arena.live.run')}
          </Button>
          {arenaLive.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {arenaLive.error instanceof Error ? arenaLive.error.message : t('arena.noVerdict')}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {arenaLive.data ? (
        <div data-testid="arena-live-result">
          <ArenaResultDisplay result={arenaLive.data} />
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4" data-testid="arena-loading-skeleton">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : isError || demoResult === undefined ? (
        <Alert variant="destructive">
          <AlertTitle>{t('arena.errorTitle')}</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : t('arena.noVerdict')}
          </AlertDescription>
        </Alert>
      ) : (
        <div data-testid="arena-demo-reference">
          <ArenaResultDisplay result={demoResult} />
        </div>
      )}
    </div>
  );
}
