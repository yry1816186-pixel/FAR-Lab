/**
 * features/evidence/EvidencePage — the honesty surface: paginated verdict
 * ledger, evidence-by-ID lookup, chain-by-head-hash lookup, and the
 * whole-chain Merkle trust root with its portable snapshot receipt.
 */

import { useState, type FormEvent } from 'react';

import { useEvidence, useEvidenceChain, useIntegrityProof, useIntegrityRoot, useReproReceipt, useVerdictList } from '@/shared/api/endpoints.ts';
import { formatDateTime } from '@/shared/format.ts';
import { useI18n, useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { JsonBlock } from '@/shared/ui/JsonBlock.tsx';
import { KeyValue, KeyValueList } from '@/shared/ui/KeyValue.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { VerdictBadge } from '@/shared/ui/VerdictBadge.tsx';

const PAGE_SIZE = 25;
const HEX64 = /^[0-9a-f]{64}$/i;

function VerdictLedger() {
  const t = useT();
  const { locale } = useI18n();
  const [offset, setOffset] = useState(0);
  const list = useVerdictList(PAGE_SIZE, offset);

  return (
    <Section title={t('evidence.verdicts')}>
      {list.isPending ? <LoadingBlock /> : null}
      {list.isError ? <ErrorBlock error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && list.data.items.length === 0 ? <EmptyBlock title={t('evidence.verdictsEmpty')} /> : null}
      {list.isSuccess && list.data.items.length > 0 ? (
        <>
          <DataTable
            caption={t('evidence.verdicts')}
            head={[t('evidence.col.id'), t('evidence.col.decision'), t('evidence.col.metric'), t('evidence.col.kind'), t('evidence.col.created')]}
          >
            {list.data.items.map((v) => (
              <tr key={v.verdictId}>
                <Td>
                  <HashValue value={v.verdictId} />
                </Td>
                <Td>
                  <VerdictBadge verdict={v.decision} />
                </Td>
                <Td mono>{v.metricValue ?? '—'}</Td>
                <Td className="text-xs">{v.nodeKind}</Td>
                <Td mono>
                  <time dateTime={v.createdAt}>{formatDateTime(v.createdAt, locale)}</time>
                </Td>
              </tr>
            ))}
          </DataTable>
          <div className="mt-3 flex items-center justify-between text-xs text-ink3">
            <span>{t('evidence.range', { from: offset + 1, to: offset + list.data.items.length })}</span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                {t('evidence.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={list.data.items.length < PAGE_SIZE}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                {t('evidence.next')}
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </Section>
  );
}

function EvidenceLookup() {
  const t = useT();
  const { locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const evidence = useEvidence(query);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setQuery(draft.trim());
  };

  return (
    <Section title={t('evidence.lookup.title')}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="label-micro mb-1 block">{t('evidence.lookup.label')}</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <Button type="submit" disabled={draft.trim().length === 0}>
          {t('evidence.lookup.submit')}
        </Button>
      </form>
      {query !== '' && evidence.isPending ? <LoadingBlock /> : null}
      {query !== '' && evidence.isError ? (
        <ErrorBlock className="mt-3" error={evidence.error} testId="evidence-lookup-error" onRetry={() => void evidence.refetch()} />
      ) : null}
      {query !== '' && evidence.isSuccess ? (
        <div className="mt-3" data-testid="evidence-lookup-result">
          <KeyValueList>
            <KeyValue label={t('evidence.lookup.label')}>
              <HashValue value={evidence.data.evidenceId} truncate={false} />
            </KeyValue>
            <KeyValue label={t('evidence.chain.seq')}>
              <span className="font-mono text-xs">{evidence.data.callRecordSeq}</span>
            </KeyValue>
            <KeyValue label={t('evidence.chain.stage')}>{evidence.data.stageId}</KeyValue>
            <KeyValue label={t('evidence.lookup.payloadKind')}>{evidence.data.payloadKind}</KeyValue>
            <KeyValue label={t('evidence.col.created')}>
              <time dateTime={evidence.data.createdAt}>{formatDateTime(evidence.data.createdAt, locale)}</time>
            </KeyValue>
            {evidence.data.verdictNode !== null ? (
              <KeyValue label={t('receipts.verdict')}>
                <VerdictBadge verdict={evidence.data.verdictNode.decision} />
              </KeyValue>
            ) : null}
          </KeyValueList>
          <div className="mt-2">
            <h3 className="label-micro mb-1">{t('evidence.lookup.payload')}</h3>
            <JsonBlock value={evidence.data.evidencePayload} />
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function ChainLookup() {
  const t = useT();
  const { locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [formatError, setFormatError] = useState(false);
  const chain = useEvidenceChain(query);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const value = draft.trim();
    if (!HEX64.test(value)) {
      setFormatError(true);
      setQuery('');
      return;
    }
    setFormatError(false);
    setQuery(value);
  };

  return (
    <Section title={t('evidence.chain.title')}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="label-micro mb-1 block">{t('evidence.chain.label')}</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <Button type="submit" disabled={draft.trim().length === 0}>
          {t('evidence.chain.submit')}
        </Button>
      </form>
      {formatError ? (
        <p role="alert" className="mt-2 text-sm text-danger" data-testid="chain-format-error">
          {t('evidence.chain.label')}
        </p>
      ) : null}
      {query !== '' && chain.isPending ? <LoadingBlock /> : null}
      {query !== '' && chain.isError ? (
        <ErrorBlock className="mt-3" error={chain.error} testId="chain-error" onRetry={() => void chain.refetch()} />
      ) : null}
      {query !== '' && chain.isSuccess ? (
        <div className="mt-3" data-testid="chain-result">
          {chain.data.callRecord === null ? (
            <EmptyBlock title={t('evidence.chain.noRecord')} />
          ) : (
            <>
              <h3 className="label-micro mb-2">{t('evidence.chain.callRecord')}</h3>
              <KeyValueList>
                <KeyValue label={t('evidence.chain.seq')}>
                  <span className="font-mono text-xs">{chain.data.callRecord.seq}</span>
                </KeyValue>
                <KeyValue label={t('evidence.chain.stage')}>{chain.data.callRecord.stageId}</KeyValue>
                <KeyValue label={t('evidence.chain.model')}>
                  <span className="font-mono text-xs">{chain.data.callRecord.modelId}</span>
                </KeyValue>
                <KeyValue label={t('evidence.chain.reproHash')}>
                  <HashValue value={chain.data.callRecord.reproHash} />
                </KeyValue>
                <KeyValue label={t('evidence.chain.gitCommit')}>
                  <span className="font-mono text-xs">{chain.data.callRecord.gitCommitSha}</span>
                </KeyValue>
                <KeyValue label={t('evidence.chain.tokens')}>
                  <span className="font-mono text-xs">{chain.data.callRecord.usageTokensTotal ?? '—'}</span>
                </KeyValue>
                <KeyValue label={t('evidence.chain.finish')}>{chain.data.callRecord.finishReason}</KeyValue>
                <KeyValue label={t('evidence.col.created')}>
                  <time dateTime={chain.data.callRecord.isoTimestamp}>
                    {formatDateTime(chain.data.callRecord.isoTimestamp, locale)}
                  </time>
                </KeyValue>
              </KeyValueList>
              <div className="mt-2">
                <JsonBlock value={chain.data.graphSubtree} />
              </div>
            </>
          )}
        </div>
      ) : null}
    </Section>
  );
}

function IntegrityPanel() {
  const t = useT();
  const root = useIntegrityRoot();
  const receipt = useReproReceipt();
  const [copied, setCopied] = useState(false);

  const copyReceipt = (): void => {
    if (receipt.data === undefined) return;
    void navigator.clipboard?.writeText(JSON.stringify(receipt.data, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Section title={t('evidence.integrity.title')}>
      {root.isPending ? <LoadingBlock /> : null}
      {root.isError ? <ErrorBlock error={root.error} onRetry={() => void root.refetch()} /> : null}
      {root.isSuccess ? (
        <KeyValueList>
          <KeyValue label={t('evidence.integrity.merkleRoot')}>
            <HashValue value={root.data.merkleRoot} truncate={false} />
          </KeyValue>
          <KeyValue label={t('evidence.integrity.leafCount')}>
            <span className="font-mono text-xs">{root.data.leafCount}</span>
          </KeyValue>
          <KeyValue label={t('evidence.integrity.chainHead')}>
            {root.data.chainHeadHash !== null ? <HashValue value={root.data.chainHeadHash} truncate={false} /> : <span>—</span>}
          </KeyValue>
        </KeyValueList>
      ) : null}
      {receipt.isSuccess ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-ink3">{t('evidence.integrity.receipt')}</p>
          <Button variant="outline" size="sm" onClick={copyReceipt} data-testid="copy-receipt">
            {copied ? t('state.copied') : t('evidence.integrity.copyReceipt')}
          </Button>
          <JsonBlock className="mt-2" value={receipt.data} />
        </div>
      ) : null}
    </Section>
  );
}

function ProofLookup() {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [seq, setSeq] = useState(0);
  const proof = useIntegrityProof(seq);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const parsed = Number.parseInt(draft.trim(), 10);
    setSeq(Number.isInteger(parsed) && parsed > 0 ? parsed : 0);
  };

  return (
    <Section title={t('evidence.proof.title')}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="label-micro mb-1 block">{t('evidence.proof.label')}</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="numeric"
            className="w-full rounded border border-borderStrong bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <Button type="submit" disabled={draft.trim().length === 0}>
          {t('evidence.proof.submit')}
        </Button>
      </form>
      {seq > 0 && proof.isPending ? <LoadingBlock /> : null}
      {seq > 0 && proof.isError ? (
        <ErrorBlock className="mt-3" error={proof.error} testId="proof-error" onRetry={() => void proof.refetch()} />
      ) : null}
      {seq > 0 && proof.isSuccess ? (
        <div className="mt-3" data-testid="proof-result">
          <KeyValueList>
            <KeyValue label={t('evidence.proof.leaf')}>
              <HashValue value={proof.data.leaf} truncate={false} />
            </KeyValue>
            <KeyValue label={t('evidence.proof.leafIndex')}>
              <span className="font-mono text-xs">{proof.data.leafIndex}</span>
            </KeyValue>
            <KeyValue label={t('evidence.proof.expectedRoot')}>
              <HashValue value={proof.data.expectedRoot} truncate={false} />
            </KeyValue>
          </KeyValueList>
          <h3 className="label-micro mb-2 mt-3">{t('evidence.proof.siblings', { count: proof.data.siblings.length })}</h3>
          <ol className="space-y-1">
            {proof.data.siblings.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge tone="muted">{i}</Badge>
                <HashValue value={s} truncate={false} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Section>
  );
}

export default function EvidencePage() {
  const t = useT();
  return (
    <div data-testid="evidence-page">
      <PageHeader title={t('evidence.title')} lede={t('evidence.lede')} />
      <IntegrityPanel />
      <VerdictLedger />
      <EvidenceLookup />
      <ChainLookup />
      <ProofLookup />
    </div>
  );
}
