/**
 * CourtPage —— 跨模型可靠性法庭可视化（FI-3）。
 *
 * 端点：GET /api/v1/court/demo（参考 fixture）+ POST /api/v1/court（WS-A.2 live）。
 * 四组件：LiveSessionForm（WS-B.2）+ AgreementHero + ModelVerdictTable + HonestyAlert。
 *
 * 诚实定位（红线）：demo 用 offline_replay（同 fixture→unanimous）。live 表单：DASHSCOPE_API_KEY
 * 配置时走真实 provider（datasetSource=real），否则诚实降级 offline replay。每个模型 verdict 由
 * R0-R9 确定性内核给出（LLM 非裁决者）。
 */

import { useState } from 'react';
import { useCourtDemo, useCourtLive, useLlmStatus } from '@/lib/api_client';
import type { CourtCertificateDto } from '@/lib/types';
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
import { Gavel, Users, ShieldAlert, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const FIVE_VERDICTS = new Set<string>([
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
]);

const AGREEMENT_LABEL: Record<string, 'court.agreement.unanimous' | 'court.agreement.majority' | 'court.agreement.split'> = {
  unanimous: 'court.agreement.unanimous',
  majority: 'court.agreement.majority',
  split: 'court.agreement.split',
};

const AGREEMENT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  unanimous: 'default',
  majority: 'secondary',
  split: 'destructive',
};

function isVerdictValue(v: string): v is VerdictValue {
  return FIVE_VERDICTS.has(v);
}

/** CertificateDisplay — 复用展示组件（demo + live 共用·根据 cert 渲染）。 */
function CertificateDisplay({ cert }: { readonly cert: CourtCertificateDto }) {
  const t = useT();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            {t('court.agreementTitle')}
          </CardTitle>
          <CardDescription>
            {t('court.claim', { claim: cert.claim })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Badge variant={AGREEMENT_VARIANT[cert.agreement] ?? 'default'} className="text-base">
            {t(AGREEMENT_LABEL[cert.agreement] ?? 'court.agreement.unanimous')}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t('court.models', {
              n: cert.modelCount,
              verdicts: cert.distinctVerdicts.join(' / '),
            })}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('court.certificate')} <code className="rounded bg-muted px-1.5 py-0.5">{cert.certificateId}</code>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('court.tableTitle')}</CardTitle>
          <CardDescription>{t('court.tableDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('court.col.model')}</TableHead>
                <TableHead>{t('court.col.verdict')}</TableHead>
                <TableHead>{t('court.col.rule')}</TableHead>
                <TableHead>{t('court.col.chainHead')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cert.verdicts.map((v) => (
                <TableRow key={v.model}>
                  <TableCell className="font-medium">{v.model}</TableCell>
                  <TableCell>
                    {v.verdict !== null && isVerdictValue(v.verdict) ? (
                      <VerdictBadge decision={v.verdict} size="sm" />
                    ) : (
                      <Badge variant="destructive">{t('arena.noVerdict')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.decisiveRuleId === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <code className="text-xs">{v.decisiveRuleId}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.chainHead === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <code className="text-xs text-muted-foreground">
                        {v.chainHead.slice(0, 12)}…
                      </code>
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
        <AlertTitle className="flex items-center gap-2">{t('court.honestyTitle')} <IntegrityBadge source={cert.datasetSource} /></AlertTitle>
        <AlertDescription>
          <p>{cert.honestNote}</p>
          <p className="mt-2">
            <strong>{t('court.redLine')}</strong>
          </p>
        </AlertDescription>
      </Alert>
    </>
  );
}

export default function CourtPage() {
  const t = useT();
  const { data: demoCert, isLoading, isError, error } = useCourtDemo();
  const { data: llmStatus } = useLlmStatus();
  const courtLive = useCourtLive();

  const [liveClaim, setLiveClaim] = useState('');
  const [liveModels, setLiveModels] = useState('alpha, beta, gamma');

  const isLiveMode = llmStatus?.keyConfigured === true;

  const handleLiveRun = () => {
    const models = liveModels.split(',').map((m) => m.trim()).filter((m) => m.length > 0);
    if (liveClaim.trim().length === 0 || models.length === 0) return;
    void courtLive.mutate({ claim: liveClaim.trim(), models });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Gavel className="h-7 w-7" aria-hidden="true" />
          {t('court.title')}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('court.subtitle2')}</p>
      </header>

      {/* WS-B.2 LLM 状态横幅——诚实展示 live / offline replay */}
      <Alert data-testid="court-llm-status">
        <Zap className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>{isLiveMode ? t('llm.status.liveTitle') : t('llm.status.offlineTitle')}</AlertTitle>
        <AlertDescription>
          {isLiveMode ? t('llm.status.liveBody') : t('llm.status.offlineBody')}
        </AlertDescription>
      </Alert>

      {/* WS-B.2 Live session form */}
      <Card data-testid="court-live-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" aria-hidden="true" />
            {t('court.live.title')}
          </CardTitle>
          <CardDescription>{t('court.live.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="court-live-claim" className="text-sm font-medium">
              {t('court.live.claimLabel')}
            </label>
            <textarea
              id="court-live-claim"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('court.live.claimPlaceholder')}
              value={liveClaim}
              onChange={(e) => setLiveClaim(e.target.value)}
              data-testid="court-live-claim-input"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="court-live-models" className="text-sm font-medium">
              {t('court.live.modelsLabel')}
            </label>
            <input
              id="court-live-models"
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={liveModels}
              onChange={(e) => setLiveModels(e.target.value)}
              data-testid="court-live-models-input"
            />
          </div>
          <Button onClick={handleLiveRun} disabled={courtLive.isPending || liveClaim.trim().length === 0} data-testid="court-live-run">
            {courtLive.isPending ? t('court.live.running') : t('court.live.run')}
          </Button>
          {courtLive.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {courtLive.error instanceof Error ? courtLive.error.message : t('arena.noVerdict')}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {courtLive.data ? (
        <div data-testid="court-live-result">
          <CertificateDisplay cert={courtLive.data} />
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4" data-testid="court-loading-skeleton">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : isError || demoCert === undefined ? (
        <Alert variant="destructive">
          <AlertTitle>{t('court.errorTitle')}</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : t('arena.noVerdict')}
          </AlertDescription>
        </Alert>
      ) : (
        <div data-testid="court-demo-reference">
          <CertificateDisplay cert={demoCert} />
        </div>
      )}
    </div>
  );
}
