import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Link2,
  Loader2,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { AssuranceDimensionCard } from '@/components/v2/AssuranceDimensionCard';
import {
  ReceiptUploader,
  type VerificationResult,
} from '@/components/v2/ReceiptUploader';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useReceipt,
  useReceiptList,
  useVerifyReceiptById,
  v2QueryKeys,
} from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import { isVerdictValue } from '@/lib/verdict';
import type { V2AssuranceDimensionResult, V2StoredReceipt } from '@/lib/types';

const PAGE_SIZE = 20;

export function V2ReceiptPage() {
  const queryClient = useQueryClient();
  const t = useT();
  const [searchParams] = useSearchParams();
  const [uploadResult, setUploadResult] = useState<VerificationResult | null>(null);
  const [listPage, setListPage] = useState(0);

  const sharedRunId = searchParams.get('runId') ?? undefined;
  const listOffset = listPage * PAGE_SIZE;

  const sharedListQuery = useReceiptList(PAGE_SIZE, 0, sharedRunId, {
    enabled: sharedRunId !== undefined,
  });
  const sharedReceipt = sharedListQuery.data?.receipts[0] ?? null;
  const sharedDetailQuery = useReceipt(sharedReceipt?.id ?? '');
  const reVerifyMutation = useVerifyReceiptById();
  const listQuery = useReceiptList(PAGE_SIZE, listOffset);

  const handleVerified = useCallback(
    (result: VerificationResult) => {
      setUploadResult(result);
      void queryClient.invalidateQueries({ queryKey: v2QueryKeys.list(PAGE_SIZE, listOffset) });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'receipts', 'list'] });
    },
    [listOffset, queryClient],
  );

  const sharedSection = sharedRunId === undefined ? null : (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('v2.sharedReceipt')}
        </CardTitle>
        <CardDescription className="break-all font-mono text-xs">
          {t('v2.sharedRunId', { id: sharedRunId })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sharedListQuery.isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>{t('app.loadingPage')}</span>
          </div>
        )}
        {sharedListQuery.isError && (
          <div className="space-y-2 py-3" role="alert">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t('v2.sharedLoadFailed')}
            </p>
            <p className="text-xs text-muted-foreground">
              {sharedListQuery.error instanceof Error ? sharedListQuery.error.message : t('v2.sharedLoadFailed')}
            </p>
          </div>
        )}
        {sharedListQuery.isSuccess && sharedReceipt === null && (
          <p className="py-3 text-sm text-muted-foreground">{t('v2.sharedNotFound')}</p>
        )}
        {sharedReceipt !== null && (
          <div className="space-y-5">
            <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Metadata label={t('v2.receiptId')} mono>{sharedReceipt.id}</Metadata>
              <div>
                <p className="text-muted-foreground">{t('v2.verdict')}</p>
                <div className="mt-1">
                  {isVerdictValue(sharedReceipt.verdict)
                    ? <VerdictBadge decision={sharedReceipt.verdict} size="sm" />
                    : <Badge variant="outline">{sharedReceipt.verdict}</Badge>}
                </div>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">{t('v2.claim')}</p>
                <p className="mt-1">{sharedReceipt.claimText}</p>
              </div>
              <Metadata label={t('v2.standing')}>{sharedReceipt.receiptStanding}</Metadata>
              <Metadata label={t('v2.createdAt')} mono>{sharedReceipt.createdAt}</Metadata>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button
                size="sm"
                disabled={reVerifyMutation.isPending}
                onClick={() => void reVerifyMutation.mutateAsync(sharedReceipt.id)}
              >
                {reVerifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('v2.sharedReVerify')}
              </Button>
              {reVerifyMutation.isError && (
                <span className="text-sm text-destructive" role="alert">{t('v2.sharedReVerifyFailed')}</span>
              )}
            </div>

            {sharedDetailQuery.isLoading && (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t('app.loadingPage')}</span>
              </div>
            )}
            {sharedDetailQuery.isError && (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t('v2.sharedDetailFailed')}
              </p>
            )}
            {sharedDetailQuery.data !== undefined && (
              <div className="space-y-5">
                <div>
                  <h2 className="mb-2 text-sm font-medium">{t('v2.manifestMembers')}</h2>
                  {sharedDetailQuery.data.manifestMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('v2.listEmpty')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('v2.tableKind')}</TableHead>
                            <TableHead>{t('v2.tableDigest')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sharedDetailQuery.data.manifestMembers.map((member) => (
                            <TableRow key={`${member.kind}:${member.digest}`}>
                              <TableCell className="font-mono text-xs">{member.kind}</TableCell>
                              <TableCell className="max-w-[34rem] break-all font-mono text-xs">{member.digest}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                {sharedDetailQuery.data.latestVerification !== null && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-medium">{t('v2.latestVerification')}</h2>
                    {Object.entries(
                      sharedDetailQuery.data.latestVerification.result.dimensions as Record<string, V2AssuranceDimensionResult>,
                    ).map(([dimensionKey, dimension]) => (
                      <AssuranceDimensionCard
                        key={dimensionKey}
                        dimension={dimension.dimension}
                        outcome={dimension.outcome}
                        detail={dimension.detail}
                        reasonCodes={dimension.reasonCodes}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const uploadResultSection = uploadResult === null ? null : (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          {t('v2.verificationResult')}
        </CardTitle>
        <CardDescription>
          {t('v2.resultReceipt', { id: uploadResult.receiptId })} —{' '}
          <span className="font-mono text-xs">{uploadResult.evaluatedAt}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Metadata label={t('v2.resultId')} mono>{uploadResult.resultId}</Metadata>
          <Metadata label={t('v2.receiptStanding')}>{uploadResult.receiptStanding}</Metadata>
          <Metadata label={t('v2.reviewSummary')}>{uploadResult.reviewSummary}</Metadata>
          <Metadata label={t('v2.policy')} mono>{uploadResult.verificationPolicyId}</Metadata>
        </div>
        <div className="space-y-3 border-t pt-4">
          {Object.entries(uploadResult.dimensions).map(([dimensionKey, dimension]) => (
            <AssuranceDimensionCard
              key={dimensionKey}
              dimension={dimension.dimension}
              outcome={dimension.outcome}
              detail={dimension.detail}
              reasonCodes={dimension.reasonCodes}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const listData = listQuery.data;
  const receipts: readonly V2StoredReceipt[] = listData?.receipts ?? [];
  const totalCount = listData?.total ?? 0;
  const totalPages = listData === undefined ? 1 : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <ScrollText className="h-8 w-8 text-primary" aria-hidden="true" />
          {t('v2.title')}
        </h1>
        <p className="text-muted-foreground">{t('v2.subtitle')}</p>
      </header>

      {sharedSection}

      <ReceiptUploader onVerified={handleVerified} />
      {uploadResultSection}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('v2.storedReceipts')}</CardTitle>
          <CardDescription>
            {t('v2.storedReceiptsDesc')}
            {listData !== undefined && <span className="ml-2 text-xs">{t('v2.totalCount', { n: totalCount })}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>{t('app.loadingPage')}</span>
            </div>
          )}
          {listQuery.isError && (
            <div className="space-y-2 py-4" role="alert">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {t('v2.listLoadFailed')}
              </p>
              <p className="text-xs text-muted-foreground">
                {listQuery.error instanceof Error ? listQuery.error.message : t('v2.listLoadFailed')}
              </p>
            </div>
          )}
          {listQuery.isSuccess && receipts.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('v2.listEmpty')}</p>
          )}
          {listQuery.isSuccess && receipts.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('v2.tableReceiptId')}</TableHead>
                    <TableHead>{t('v2.tableClaim')}</TableHead>
                    <TableHead>{t('v2.tableVerdict')}</TableHead>
                    <TableHead>{t('v2.tableCreated')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="max-w-[14rem] break-all font-mono text-xs">{receipt.id}</TableCell>
                      <TableCell className="max-w-[24rem]">{receipt.claimText}</TableCell>
                      <TableCell>
                        {isVerdictValue(receipt.verdict)
                          ? <VerdictBadge decision={receipt.verdict} size="sm" />
                          : <Badge variant="outline">{receipt.verdict}</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{receipt.createdAt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {listQuery.isSuccess && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('v2.storedReceipts')}>
              <Button
                variant="outline"
                size="sm"
                disabled={listPage <= 0}
                onClick={() => setListPage((page) => Math.max(0, page - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {t('v2.previous')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('v2.pageOf', { page: listPage + 1, pages: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={listPage >= totalPages - 1}
                onClick={() => setListPage((page) => Math.min(totalPages - 1, page + 1))}
              >
                {t('v2.next')}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-sm font-medium">{t('v2.assuranceScope')}</h2>
              <p className="text-xs text-muted-foreground">{t('v2.assuranceScopeBody')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metadata({
  children,
  label,
  mono = false,
}: {
  readonly children: string;
  readonly label: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`mt-1 break-all ${mono ? 'font-mono text-xs' : ''}`}>{children}</p>
    </div>
  );
}

export default V2ReceiptPage;
