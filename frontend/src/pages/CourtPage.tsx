/**
 * CourtPage —— 跨模型可靠性法庭可视化（FI-3）。
 *
 * Authority: src/api/internal/court_service.ts ReliabilityCertificate + GET /api/v1/court/demo。
 *
 * 三组件：
 *   1. AgreementHero — 一致性分类徽章（unanimous / majority / split）+ 模型数 + 证书 ID。
 *   2. ModelVerdictTable — 每个模型的裁决条目（model / verdict / decisiveRuleId / chainHead）。
 *   3. HonestyAlert — 诚实声明（offline_replay 同 fixture→unanimous·真实分歧需凭据门·LLM 非裁决者）。
 *
 * 诚实定位（红线）：
 *   - demo 用 offline_replay（零 key·同 fixture），verdict 必然 unanimous——展示「多模型法庭框架
 *     + 一致性检测 + 证书结构」，非真实模型分歧。
 *   - 每个模型 verdict 仍由 R0-R9 确定性内核给出（LLM 非裁决者）。
 *   - 真实多模型分歧须 far court --models 接真实 provider（凭据门）。
 */

import { useCourtDemo } from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import type { VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Gavel, Users, ShieldAlert } from 'lucide-react';
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

export default function CourtPage() {
  const t = useT();
  const { data: cert, isLoading, isError, error } = useCourtDemo();

  if (isLoading) {
    return (
      <div className="space-y-8" data-testid="court-loading-skeleton">
        <header className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </header>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || cert === undefined) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t('court.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('court.subtitle')}</p>
        </header>
        <Alert variant="destructive">
          <AlertTitle>{t('court.errorTitle')}</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : t('arena.noVerdict')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Gavel className="h-7 w-7" aria-hidden="true" />
          {t('court.title')}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t('court.subtitle2')}
        </p>
      </header>

      {/* AgreementHero */}
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

      {/* ModelVerdictTable */}
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

      {/* HonestyAlert */}
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
    </div>
  );
}
