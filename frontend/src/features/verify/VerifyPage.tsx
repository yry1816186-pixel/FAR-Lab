/**
 * features/verify/VerifyPage — independent verification surface.
 *
 * Paste or upload a ProofEnvelopeV2 (.far-proof receipt JSON) → the backend
 * runs the six-dimension assurance check → results render with honest
 * outcome badges. A verified envelope can be persisted (idempotent by
 * proofHash). The fixture demo receipt is explicitly labeled as a demo.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { V2VerificationResult } from '@/entities/dtos.ts';
import { isVerdictValue } from '@/entities/verdict.ts';
import {
  useDemoReceipt,
  usePersistReceipt,
  useReceiptList,
  useVerifyEnvelope,
} from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge, type Tone } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';

const PAGE_SIZE = 20;

const OUTCOME_TONE: Readonly<Record<string, Tone>> = {
  PASS: 'ok',
  FAIL: 'danger',
  WARN: 'warn',
  SKIP: 'muted',
  NOT_APPLICABLE: 'info',
};

const OUTCOME_KEY = {
  PASS: 'verify.outcome.pass',
  FAIL: 'verify.outcome.fail',
  WARN: 'verify.outcome.warn',
  SKIP: 'verify.outcome.skip',
  NOT_APPLICABLE: 'verify.outcome.na',
} as const;

function OutcomeBadge({ outcome }: { readonly outcome: string }) {
  const t = useT();
  const key = OUTCOME_KEY[outcome as keyof typeof OUTCOME_KEY];
  return <Badge tone={OUTCOME_TONE[outcome] ?? 'muted'}>{key !== undefined ? t(key) : outcome}</Badge>;
}

/** Six-dimension assurance panel shared by verify / persist / re-verify flows. */
export function VerificationResultView({ result }: { readonly result: V2VerificationResult }) {
  const t = useT();
  const { locale } = useI18n();
  const dimensions = Object.values(result.dimensions);
  return (
    <div data-testid="verify-result">
      <KeyValueList>
        <KeyValue label={t('verify.standing')}>
          <Badge tone={result.receiptStanding === 'VALID' ? 'ok' : 'warn'}>{result.receiptStanding}</Badge>
        </KeyValue>
        <KeyValue label={t('verify.preservation')}>{result.preservationStatus}</KeyValue>
        <KeyValue label={t('verify.policy')}>
          <span className="font-mono text-xs">{result.verificationPolicyId}</span>
        </KeyValue>
        <KeyValue label={t('verify.evaluatedAt')}>
          <time dateTime={result.evaluatedAt}>{formatDateTime(result.evaluatedAt, locale)}</time>
        </KeyValue>
        <KeyValue label={t('verify.reviewSummary')}>{result.reviewSummary}</KeyValue>
      </KeyValueList>

      <h3 className="label-micro mb-2 mt-4">{t('verify.dimensions')}</h3>
      <DataTable caption={t('verify.dimensions')} head={[t('verify.dimensions'), '', t('verify.reasonCodes'), '']}>
        {dimensions.map((dim) => (
          <tr key={dim.dimension}>
            <Td className="font-medium">{dim.dimension}</Td>
            <Td>
              <OutcomeBadge outcome={dim.outcome} />
            </Td>
            <Td mono>
              {dim.reasonCodes.length > 0 ? dim.reasonCodes.join(', ') : '—'}
            </Td>
            <Td className="max-w-md text-xs text-ink2">{dim.detail}</Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

interface ParsedEnvelope {
  readonly raw: string;
  readonly proofHash: string;
  readonly schemaVersion: string;
  readonly claimId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly manifestMembers?: readonly { readonly kind: string; readonly digest: string; readonly sizeBytes: number }[];
}

/**
 * Extract the persist fields from the envelope as-is. The receipt payload may
 * be the envelope root or nested under `receipt`; unknown shapes surface a
 * client-side error rather than a guessed request body.
 */
function parseEnvelope(raw: string): ParsedEnvelope {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
  const root = parsed as Record<string, unknown>;
  const receiptLike = (typeof root['receipt'] === 'object' && root['receipt'] !== null ? root['receipt'] : root) as Record<string, unknown>;

  const proofHash =
    (typeof root['proofHash'] === 'string' && root['proofHash']) ||
    (typeof receiptLike['proofHash'] === 'string' && (receiptLike['proofHash'] as string)) ||
    (typeof root['proof'] === 'object' && root['proof'] !== null && typeof (root['proof'] as Record<string, unknown>)['proofHash'] === 'string'
      ? ((root['proof'] as Record<string, unknown>)['proofHash'] as string)
      : '');
  if (proofHash === '') throw new Error('missing proofHash');

  const manifestRaw = receiptLike['manifestMembers'] ?? root['manifestMembers'];
  const manifestMembers = Array.isArray(manifestRaw)
    ? (manifestRaw.filter(
        (m): m is { kind: string; digest: string; sizeBytes: number } =>
          typeof m === 'object' && m !== null &&
          typeof (m as Record<string, unknown>)['kind'] === 'string' &&
          typeof (m as Record<string, unknown>)['digest'] === 'string' &&
          typeof (m as Record<string, unknown>)['sizeBytes'] === 'number',
      ) as { kind: string; digest: string; sizeBytes: number }[])
    : undefined;

  return {
    raw,
    proofHash,
    schemaVersion: typeof receiptLike['schemaVersion'] === 'string' ? receiptLike['schemaVersion'] : '2',
    claimId:
      (typeof receiptLike['claimId'] === 'string' && (receiptLike['claimId'] as string)) ||
      (typeof receiptLike['claim'] === 'object' && receiptLike['claim'] !== null && typeof (receiptLike['claim'] as Record<string, unknown>)['id'] === 'string'
        ? ((receiptLike['claim'] as Record<string, unknown>)['id'] as string)
        : 'unknown'),
    claimText:
      (typeof receiptLike['claimText'] === 'string' && (receiptLike['claimText'] as string)) ||
      (typeof receiptLike['claim'] === 'object' && receiptLike['claim'] !== null && typeof (receiptLike['claim'] as Record<string, unknown>)['text'] === 'string'
        ? ((receiptLike['claim'] as Record<string, unknown>)['text'] as string)
        : ''),
    verdict:
      (typeof receiptLike['verdict'] === 'string' && (receiptLike['verdict'] as string)) ||
      (typeof receiptLike['verdictLabel'] === 'string' && (receiptLike['verdictLabel'] as string)) ||
      'UNTESTED',
    ...(manifestMembers !== undefined ? { manifestMembers } : {}),
  };
}

function VerifyPanel() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [lastEnvelope, setLastEnvelope] = useState<ParsedEnvelope | null>(null);
  const verify = useVerifyEnvelope();
  const persist = usePersistReceipt();

  const runVerify = (raw: string): void => {
    setClientError(null);
    persist.reset();
    let envelope: ParsedEnvelope;
    try {
      envelope = parseEnvelope(raw);
    } catch {
      setClientError(t('verify.invalidJson'));
      return;
    }
    setLastEnvelope(envelope);
    verify.mutate(envelope.raw);
  };

  const onFile = (file: File): void => {
    void file.text().then((text) => {
      setInput(text);
    });
  };

  return (
    <Section title={t('verify.title')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runVerify(input);
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="envelope-input" className="label-micro mb-1 block">
            {t('verify.inputLabel')}
          </label>
          <textarea
            id="envelope-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('verify.inputPlaceholder')}
            rows={8}
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={input.trim().length === 0 || verify.isPending}>
            {verify.isPending ? t('verify.verifying') : t('verify.submit')}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            .far-proof
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.far-proof,application/json"
            className="hidden"
            aria-label={t('verify.uploadLabel')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) onFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </form>

      {clientError !== null ? (
        <p role="alert" className="mt-3 text-sm text-danger" data-testid="verify-client-error">
          {clientError}
        </p>
      ) : null}
      {verify.isError ? <ErrorBlock className="mt-3" error={verify.error} testId="verify-error" onRetry={() => { if (lastEnvelope !== null) verify.mutate(lastEnvelope.raw); }} /> : null}

      {verify.isSuccess ? (
        <div className="mt-4">
          <h3 className="label-micro mb-2">{t('verify.result')}</h3>
          <VerificationResultView result={verify.data.verification} />
          {lastEnvelope !== null ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={persist.isPending || persist.isSuccess}
                onClick={() =>
                  persist.mutate({
                    proofHash: lastEnvelope.proofHash,
                    schemaVersion: lastEnvelope.schemaVersion,
                    claimId: lastEnvelope.claimId,
                    claimText: lastEnvelope.claimText,
                    verdict: lastEnvelope.verdict,
                    ...(lastEnvelope.manifestMembers !== undefined ? { manifestMembers: lastEnvelope.manifestMembers } : {}),
                  })
                }
              >
                {persist.isPending ? t('verify.persisting') : t('verify.persist')}
              </Button>
              {persist.isSuccess ? (
                <p role="status" className="text-sm text-ok" data-testid="verify-persisted">
                  {persist.data.idempotent ? t('verify.persistedIdempotent') : t('verify.persisted', { id: persist.data.receiptId })}
                  {' · '}
                  <Link to={`/receipts/${persist.data.receiptId}`} className="text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                    {t('verify.viewReceipt')}
                  </Link>
                </p>
              ) : null}
              {persist.isError ? <ErrorBlock error={persist.error} testId="persist-error" /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function DemoPanel() {
  const t = useT();
  const [requested, setRequested] = useState(false);
  const demo = useDemoReceipt({ enabled: requested });

  return (
    <Section title={t('verify.loadDemo')}>
      {!requested ? (
        <Button variant="outline" onClick={() => setRequested(true)} data-testid="load-demo">
          {t('verify.loadDemo')}
        </Button>
      ) : null}
      {demo.isPending && requested ? <LoadingBlock /> : null}
      {demo.isError ? <ErrorBlock error={demo.error} testId="demo-error" onRetry={() => void demo.refetch()} /> : null}
      {demo.isSuccess ? (
        <div>
          <p role="note" className="mb-3 rounded border border-warn/50 bg-warn/5 px-3 py-2 text-sm text-warn" data-testid="demo-note">
            {t('verify.demoNote')}
          </p>
          <KeyValueList>
            <KeyValue label={t('receipts.claim')}>{demo.data.receipt.claimText}</KeyValue>
            <KeyValue label={t('receipts.verdict')}>
              {isVerdictValue(demo.data.receipt.verdictLabel) ? (
                <VerdictBadge verdict={demo.data.receipt.verdictLabel} />
              ) : (
                <Badge tone="muted">{demo.data.receipt.verdictLabel}</Badge>
              )}
            </KeyValue>
            <KeyValue label={t('receipt.claimId')}>
              <HashValue value={demo.data.receipt.receiptId} />
            </KeyValue>
          </KeyValueList>
          <div className="mt-4">
            <VerificationResultView result={demo.data.verification} />
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function ReceiptsPanel() {
  const t = useT();
  const { locale } = useI18n();
  const [offset, setOffset] = useState(0);
  const list = useReceiptList(PAGE_SIZE, offset);

  return (
    <Section title={t('receipts.title')}>
      {list.isPending ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && list.data.receipts.length === 0 ? <EmptyBlock title={t('receipts.empty')} /> : null}
      {list.isSuccess && list.data.receipts.length > 0 ? (
        <>
          <DataTable
            caption={t('receipts.title')}
            head={[t('receipts.claim'), t('receipts.verdict'), t('receipts.standing'), t('receipts.proofHash'), t('receipts.created'), '']}
          >
            {list.data.receipts.map((r) => (
              <tr key={r.id}>
                <Td className="max-w-xs">
                  <span className="block truncate" title={r.claimText}>{r.claimText}</span>
                </Td>
                <Td>
                  {isVerdictValue(r.verdict) ? <VerdictBadge verdict={r.verdict} showGloss={false} /> : <Badge tone="muted">{r.verdict}</Badge>}
                </Td>
                <Td>
                  <Badge tone={r.receiptStanding === 'VALID' ? 'ok' : 'warn'}>{r.receiptStanding}</Badge>
                </Td>
                <Td>
                  <HashValue value={r.proofHash} />
                </Td>
                <Td mono>
                  <time dateTime={r.createdAt}>{formatDateTime(r.createdAt, locale)}</time>
                </Td>
                <Td>
                  <Link to={`/receipts/${r.id}`} className="text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                    {t('receipts.open')}
                  </Link>
                </Td>
              </tr>
            ))}
          </DataTable>
          <div className="mt-3 flex items-center justify-between text-xs text-ink3">
            <span>
              {t('receipts.range', {
                from: list.data.total === 0 ? 0 : offset + 1,
                to: Math.min(offset + PAGE_SIZE, list.data.total),
                total: list.data.total,
              })}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                {t('receipts.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= list.data.total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                {t('receipts.next')}
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </Section>
  );
}

export default function VerifyPage(): ReactNode {
  const t = useT();
  return (
    <div data-testid="verify-page">
      <PageHeader title={t('verify.title')} lede={t('verify.lede')} />
      <VerifyPanel />
      <DemoPanel />
      <ReceiptsPanel />
    </div>
  );
}
