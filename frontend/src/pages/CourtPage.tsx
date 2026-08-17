/**
 * CourtPage —— 跨模型可靠性法庭可视化（FI-3）。
 *
 * 端点：POST /api/v1/court（WS-A.2 live·真实 provider 跨模型一致性）。
 * 四组件：LiveSessionForm（WS-B.2）+ AgreementHero + ModelVerdictTable + HonestyAlert。
 *
 * 诚实定位（红线）：无预制罐头证书——页面只展示真实跑出来的 session。DASHSCOPE_API_KEY
 * 未配置时服务端 503 fail-closed，表单同步禁用并给出指引（绝不回放 fixture 冒充跨模型证书）。每个模型 verdict 由
 * R0-R9 确定性内核给出（LLM 非裁决者）。
 */

import { useState } from 'react';
import { useCourtLive, useLlmStatus } from '@/lib/api_client';
import { isVerdictValue } from '@/lib/verdict';
import type { CourtCertificateDto } from '@/lib/types';
import { useT } from '@/lib/i18n';
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
          <Button
            onClick={handleLiveRun}
            disabled={courtLive.isPending || !isLiveMode || liveClaim.trim().length === 0}
            data-testid="court-live-run"
          >
            {courtLive.isPending ? t('court.live.running') : t('court.live.run')}
          </Button>
          {!isLiveMode ? (
            <p className="text-sm text-muted-foreground" data-testid="court-live-disabled-hint">
              {t('llm.status.offlineBody')}
            </p>
          ) : null}
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

    </div>
  );
}
