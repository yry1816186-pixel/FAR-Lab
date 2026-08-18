/**
 * features/verify/ReceiptPage — one persisted receipt: stored fields,
 * manifest members, the latest server-side verification, and a re-verify
 * action that re-runs the six-dimension check against the stored envelope.
 */

import { Link, useParams } from 'react-router-dom';

import { isVerdictValue } from '@/entities/verdict.ts';
import { useReceipt, useVerifyReceiptById } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';
import { VerificationResultView } from './VerifyPage.tsx';

export default function ReceiptPage() {
  const t = useT();
  const { locale } = useI18n();
  const { receiptId = '' } = useParams<{ readonly receiptId: string }>();
  const receipt = useReceipt(receiptId);
  const reverify = useVerifyReceiptById();

  return (
    <div data-testid="receipt-page">
      <PageHeader
        title={t('receipt.title')}
        actions={
          <Link to="/verify" className="text-sm text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
            ← {t('receipt.back')}
          </Link>
        }
      />

      {receipt.isPending ? <LoadingBlock /> : null}
      {receipt.isError ? <ErrorBlock error={receipt.error} onRetry={() => void receipt.refetch()} /> : null}
      {receipt.isSuccess && receipt.data === null ? <EmptyBlock title={t('receipt.notFound')} /> : null}

      {receipt.isSuccess && receipt.data !== null ? (
        <>
          <Section title={t('receipt.title')}>
            <KeyValueList>
              <KeyValue label={t('receipts.claim')}>{receipt.data.receipt.claimText}</KeyValue>
              <KeyValue label={t('receipts.verdict')}>
                {isVerdictValue(receipt.data.receipt.verdict) ? (
                  <VerdictBadge verdict={receipt.data.receipt.verdict} />
                ) : (
                  <Badge tone="muted">{receipt.data.receipt.verdict}</Badge>
                )}
              </KeyValue>
              <KeyValue label={t('receipt.claimId')}>
                <HashValue value={receipt.data.receipt.claimId} />
              </KeyValue>
              <KeyValue label={t('receipts.proofHash')}>
                <HashValue value={receipt.data.receipt.proofHash} truncate={false} />
              </KeyValue>
              <KeyValue label={t('receipt.schemaVersion')}>
                <span className="font-mono text-xs">{receipt.data.receipt.schemaVersion}</span>
              </KeyValue>
              <KeyValue label={t('verify.standing')}>
                <Badge tone={receipt.data.receipt.receiptStanding === 'VALID' ? 'ok' : 'warn'}>
                  {receipt.data.receipt.receiptStanding}
                </Badge>
              </KeyValue>
              <KeyValue label={t('verify.preservation')}>{receipt.data.receipt.preservationStatus}</KeyValue>
              <KeyValue label={t('receipts.created')}>
                <time dateTime={receipt.data.receipt.createdAt}>{formatDateTime(receipt.data.receipt.createdAt, locale)}</time>
              </KeyValue>
            </KeyValueList>
          </Section>

          <Section title={t('receipt.manifest', { count: receipt.data.manifestMembers.length })}>
            {receipt.data.manifestMembers.length === 0 ? (
              <EmptyBlock />
            ) : (
              <DataTable caption={t('receipt.manifest', { count: receipt.data.manifestMembers.length })} head={[t('receipt.kind'), t('receipt.digest'), t('receipt.size')]}>
                {receipt.data.manifestMembers.map((m) => (
                  <tr key={`${m.kind}:${m.digest}`}>
                    <Td mono>{m.kind}</Td>
                    <Td>
                      <HashValue value={m.digest} />
                    </Td>
                    <Td mono>{m.sizeBytes}</Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Section>

          <Section
            title={t('receipt.latestVerification')}
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={reverify.isPending}
                onClick={() => reverify.mutate(receiptId)}
                data-testid="reverify"
              >
                {reverify.isPending ? t('receipt.reverifying') : t('receipt.reverify')}
              </Button>
            }
          >
            {receipt.data.latestVerification === null ? <EmptyBlock title={t('receipt.neverVerified')} /> : null}
            {receipt.data.latestVerification !== null ? (
              <>
                <p className="mb-3" data-testid="receipt-allpass">
                  <Badge tone={receipt.data.latestVerification.allPass ? 'ok' : 'danger'}>
                    {receipt.data.latestVerification.allPass ? t('receipt.allPass') : t('receipt.notAllPass')}
                  </Badge>
                  <span className="ml-3 text-xs text-ink3">
                    <time dateTime={receipt.data.latestVerification.evaluatedAt}>
                      {formatDateTime(receipt.data.latestVerification.evaluatedAt, locale)}
                    </time>
                  </span>
                </p>
                <VerificationResultView result={receipt.data.latestVerification.result} />
              </>
            ) : null}
            {reverify.isError ? <ErrorBlock className="mt-3" error={reverify.error} testId="reverify-error" /> : null}
            {reverify.isSuccess ? (
              <div className="mt-4 border-t border-border pt-4" data-testid="reverify-result">
                <VerificationResultView result={reverify.data} />
              </div>
            ) : null}
          </Section>
        </>
      ) : null}
    </div>
  );
}
