import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  ScrollText,
  Info,
  ChevronLeft,
  ChevronRight,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VerdictBadge } from '@/components/VerdictBadge';
import { isVerdictValue } from '@/lib/verdict';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useDemoReceipt,
  useReceiptList,
  useReceipt,
  useVerifyReceiptById,
  v2QueryKeys,
} from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import { AssuranceDimensionCard } from '@/components/v2/AssuranceDimensionCard';
import {
  ReceiptUploader,
  type VerificationResult,
} from '@/components/v2/ReceiptUploader';

// ---------- Types (SSOT: lib/types.ts) ----------
//
// demo 端点与持久化端点收据形态不同(后端契约待统一项,见 SPRINT1-FRONTEND-REPORT.md):
//   - V2DemoReceipt       : receiptId / verdictLabel / isFixtureOnly  (GET /receipts/demo)
//   - V2StoredReceipt     : id / verdict / receiptStanding / ...      (GET /receipts 列表项)
// 前端按应然契约消费(types.ts 为 SSOT),边界由 api_client.parseV2Response 做
// { ok: true, data: T } 信封校验 + zod 运行时 parse(counter-case 2/3)。

import type { V2DemoReceipt, V2StoredReceipt, V2AssuranceDimensionResult } from '@/lib/types';

// ---------- Dimension rendering order (demo section) ----------

const DIMENSION_ORDER = [
  'provenance',
  'integrity',
  'identity',
  'processConformance',
  'executionReproduction',
  'scientificVerdict',
] as const;

// ---------- Page ----------

const PAGE_SIZE = 20;

export function V2ReceiptPage() {
  const queryClient = useQueryClient();
  const t = useT();

  // --- Shared-link deep link (Wizard 分享链接 /v2-receipt?runId=xxx) ---
  // 闭环(R-04 counter-case 1 后续):Wizard 保存收据时 claimId = runId,
  // 后端 list 支持 claimId 过滤 → 此处按 runId 定位收据并展示详情。
  const [searchParams] = useSearchParams();
  const sharedRunId = searchParams.get('runId') ?? undefined;
  const sharedListQuery = useReceiptList(PAGE_SIZE, 0, sharedRunId, {
    enabled: sharedRunId !== undefined,
  });
  const sharedReceipt = sharedListQuery.data?.receipts[0] ?? null;
  const sharedDetailQuery = useReceipt(sharedReceipt?.id ?? '');

  // 复检 mutation(对共享收据运行六维验证 + 持久化)。
  const reVerifyMutation = useVerifyReceiptById();

  // --- Reference receipt (built-in example verification) ---
  // 走统一 fetchJson + parseV2Response 边界解码(R-06 · counter-case 2/3):
  // { ok: true, data: T } 信封校验 + zod 运行时 parse。
  const demoQuery = useDemoReceipt();

  // --- Upload result state ---
  const [uploadResult, setUploadResult] = useState<VerificationResult | null>(null);

  // --- Receipt list pagination state ---
  const [listPage, setListPage] = useState(0);
  const listOffset = listPage * PAGE_SIZE;
  const listQuery = useReceiptList(PAGE_SIZE, listOffset);

  // --- Upload verified callback ---
  const handleVerified = useCallback(
    (result: VerificationResult) => {
      setUploadResult(result);
      // Invalidate receipt list so it reflects the new receipt
      void queryClient.invalidateQueries({ queryKey: v2QueryKeys.list(PAGE_SIZE, listOffset) });
      void queryClient.invalidateQueries({ queryKey: ['v2', 'receipts', 'list'] });
    },
    [queryClient, listOffset],
  );

  // --- Full page loading (reference receipt only; list loads independently) ---
  if (demoQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const demoData = demoQuery.data;
  const receipt: V2DemoReceipt | null = demoData?.receipt ?? null;
  const verification: VerificationResult | null = demoData?.verification ?? null;

  // --- Shared-link receipt section (runId deep link, non-blocking) ---
  const sharedSection =
    sharedRunId === undefined ? null : (
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            {t('v2.sharedReceipt')}
          </CardTitle>
          <CardDescription className="font-mono text-xs break-all">
            {t('v2.sharedRunId', { id: sharedRunId })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sharedListQuery.isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {sharedListQuery.isError && (
            <p className="text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('v2.sharedLoadFailed')}
            </p>
          )}
          {sharedListQuery.isSuccess && sharedReceipt === null && (
            <p className="text-sm text-muted-foreground">{t('v2.sharedNotFound')}</p>
          )}
          {sharedReceipt !== null && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('v2.receiptId')}</span>
                  <p className="font-mono text-xs break-all">{sharedReceipt.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('v2.verdict')}</span>
                  <div>
                    {isVerdictValue(sharedReceipt.verdict)
                      ? <VerdictBadge decision={sharedReceipt.verdict} size="sm" />
                      : <Badge variant="outline">{sharedReceipt.verdict}</Badge>}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">{t('v2.claim')}</span>
                  <p className="text-sm">{sharedReceipt.claimText}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('v2.standing')}</span>
                  <Badge variant="outline">{sharedReceipt.receiptStanding}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('v2.createdAt')}</span>
                  <p className="font-mono text-xs">{sharedReceipt.createdAt}</p>
                </div>
              </div>

              {/* Re-verify action (UI 内复检 · 与列表详情路径共享) */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  size="sm"
                  disabled={reVerifyMutation.isPending}
                  onClick={() => void reVerifyMutation.mutateAsync(sharedReceipt.id)}
                >
                  {reVerifyMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {t('v2.sharedReVerify')}
                </Button>
                {reVerifyMutation.isError && (
                  <span className="text-sm text-red-400">{t('v2.sharedReVerifyFailed')}</span>
                )}
              </div>

              {/* Shared detail: manifest + latest verification */}
              {sharedDetailQuery.isLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}
              {sharedDetailQuery.isError && (
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {t('v2.sharedDetailFailed')}
                </p>
              )}
              {sharedDetailQuery.data !== undefined && (
                <>
                  <div>
                    <p className="text-sm font-medium mb-1">{t('v2.manifestMembers')}</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('v2.tableKind')}</TableHead>
                          <TableHead>{t('v2.tableDigest')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sharedDetailQuery.data.manifestMembers.map((m) => (
                          <TableRow key={m.kind}>
                            <TableCell className="font-mono text-xs">{m.kind}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[300px] truncate">
                              {m.digest}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {sharedDetailQuery.data.latestVerification !== null && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{t('v2.latestVerification')}</p>
                      {Object.entries(
                        sharedDetailQuery.data.latestVerification.result.dimensions as Record<
                          string,
                          V2AssuranceDimensionResult
                        >,
                      ).map(([dimKey, dim]) => (
                        <AssuranceDimensionCard
                          key={dimKey}
                          dimension={dim.dimension}
                          outcome={dim.outcome}
                          detail={dim.detail}
                          reasonCodes={dim.reasonCodes}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );

  // --- Reference receipt section (non-blocking: error shows card but page still renders) ---
  const demoSection = demoQuery.isError ? (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-400">
          <ShieldAlert className="w-5 h-5" />
          {t('v2.refReceiptUnavailable')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {demoQuery.error instanceof Error ? demoQuery.error.message : t('v2.refReceiptLoadFailed')}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {t('v2.refStartServer')}
        </p>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Receipt Info */}
      {receipt !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('v2.refReceipt')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('v2.receiptId')}</span>
                <p className="font-mono">{receipt.receiptId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('v2.verdict')}</span>
                <div>
                  {isVerdictValue(receipt.verdictLabel)
                    ? <VerdictBadge decision={receipt.verdictLabel} size="sm" />
                    : <Badge variant="outline">{receipt.verdictLabel}</Badge>}
                </div>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('v2.claim')}</span>
                <p className="text-sm">{receipt.claimText}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('v2.manifestMembers')}</span>
                <p className="font-mono text-sm">{receipt.manifestMembers.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('v2.standing')}</span>
                <div>
                  <Badge variant={receipt.isFixtureOnly ? 'secondary' : 'default'}>
                    {receipt.isFixtureOnly ? t('v2.reference') : t('v2.verified')}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Six Dimensions */}
      {verification !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              {t('v2.sixDimensions')}
            </CardTitle>
            <CardDescription>
              {t('v2.evaluatedAt')}{' '}
              <span className="font-mono text-xs">{verification.evaluatedAt}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {DIMENSION_ORDER.map((dimKey) => {
              const dim = verification.dimensions[dimKey];
              if (dim === undefined) return null;
              return (
                <AssuranceDimensionCard
                  key={dimKey}
                  dimension={dim.dimension}
                  outcome={dim.outcome}
                  detail={dim.detail}
                  reasonCodes={dim.reasonCodes}
                />
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );

  // --- Upload verification result ---
  const uploadResultSection = uploadResult !== null && (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          {t('v2.verificationResult')}
        </CardTitle>
        <CardDescription>
          {t('v2.resultReceipt', { id: uploadResult.receiptId })} —{' '}
          <span className="font-mono text-xs">{uploadResult.evaluatedAt}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t('v2.resultId')}</span>
            <p className="font-mono text-xs break-all">{uploadResult.resultId}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('v2.receiptStanding')}</span>
            <Badge variant="outline">{uploadResult.receiptStanding}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">{t('v2.reviewSummary')}</span>
            <Badge variant="outline">{uploadResult.reviewSummary}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">{t('v2.policy')}</span>
            <p className="font-mono text-xs break-all">{uploadResult.verificationPolicyId}</p>
          </div>
        </div>
      </CardContent>
      <CardContent className="space-y-3">
        {Object.entries(uploadResult.dimensions).map(([dimKey, dim]) => (
          <AssuranceDimensionCard
            key={dimKey}
            dimension={dim.dimension}
            outcome={dim.outcome}
            detail={dim.detail}
            reasonCodes={dim.reasonCodes}
          />
        ))}
      </CardContent>
    </Card>
  );

  // --- Receipt list (应然契约: V2StoredReceipt with id/verdict) ---
  const listData = listQuery.data;
  const receipts: readonly V2StoredReceipt[] = listData?.receipts ?? [];
  const totalCount = listData?.total ?? 0;
  const totalPages = listData !== undefined ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  const receiptListSection = (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('v2.storedReceipts')}</CardTitle>
        <CardDescription>
          {t('v2.storedReceiptsDesc')}
          {listData !== undefined && (
            <span className="ml-2 text-xs">
              {t('v2.totalCount', { n: totalCount })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {listQuery.isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {listQuery.isError && (
          <div className="flex items-center gap-2 text-sm text-red-400 py-4">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('v2.listLoadFailed')} {listQuery.error?.message ?? 'Unknown error'}</span>
          </div>
        )}

        {listQuery.isSuccess && (
          <>
            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('v2.listEmpty')}
              </p>
            ) : (
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
                  {receipts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {item.id}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {item.claimText}
                      </TableCell>
                      <TableCell>
                        {isVerdictValue(item.verdict)
                          ? <VerdictBadge decision={item.verdict} size="sm" />
                          : <Badge variant="outline">{item.verdict}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.createdAt}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={listPage <= 0}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
                {t('v2.previous')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('v2.pageOf', { page: listPage + 1, pages: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={listPage >= totalPages - 1}
                onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                {t('v2.next')}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ScrollText className="w-8 h-8 text-primary" />
          {t('v2.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('v2.subtitle')}
        </p>
      </div>

      {/* Shared Receipt (runId deep link from Wizard share link) */}
      {sharedSection}

      {/* Reference Receipt Section */}
      {demoSection}

      {/* Upload Section */}
      <ReceiptUploader onVerified={handleVerified} />

      {/* Upload Verification Result */}
      {uploadResultSection}

      {/* Receipt List */}
      {receiptListSection}

      {/* Assurance Scope (R-07: 替代旧 "Honesty Boundary" 否定式表述,改为专业范围声明) */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t('v2.assuranceScope')}</p>
              <p className="text-xs text-muted-foreground">
                {t('v2.assuranceScopeBody')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Summary */}
      {verification !== null && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('v2.reviewSummaryLabel')} <Badge variant="outline">{verification.reviewSummary}</Badge></span>
          <span>{t('v2.policyLabel')} <span className="font-mono text-xs">{verification.verificationPolicyId}</span></span>
        </div>
      )}
    </div>
  );
}

export default V2ReceiptPage;
