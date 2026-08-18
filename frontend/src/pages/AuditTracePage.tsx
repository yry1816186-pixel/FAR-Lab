/**
 * AuditTracePage — honest cross-layer provenance lookup.
 *
 * Backend capability boundary:
 * - hypothesis/claim ID → verdict + lifecycle APIs
 * - 64-hex chain head   → evidence-chain API
 *
 * The backend does not currently expose a reliable hypothesis → chain-head mapping,
 * so this surface never passes a claim ID to the chain endpoint or fabricates a link.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useVerdictByHypothesis,
  useEvidenceChain,
  useLifecycleEvents,
  type LifecycleEventsResponse,
} from '@/lib/api_client';
import type { HonestVerdictDto, EvidenceChainResponse } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VerdictBadge } from '@/components/VerdictBadge';
import { isVerdictValue } from '@/lib/verdict';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, Search } from 'lucide-react';

const CHAIN_HEAD_PATTERN = /^[0-9a-f]{64}$/i;

export default function AuditTracePage() {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isChainLookup = CHAIN_HEAD_PATTERN.test(submitted);
  const claimId = submitted.length > 0 && !isChainLookup ? submitted : '';
  const chainHead = isChainLookup ? submitted.toLowerCase() : '';

  const verdict = useVerdictByHypothesis(claimId);
  const chain = useEvidenceChain(chainHead);
  const lifecycle = useLifecycleEvents(claimId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isLoading = verdict.isLoading || chain.isLoading || lifecycle.isLoading;
  const lookupError = verdict.error ?? chain.error ?? lifecycle.error;
  const hasClaimTrace = verdict.data !== undefined || (lifecycle.data?.events.length ?? 0) > 0;
  const hasChainTrace = chain.data !== undefined;
  const hasTrace = isChainLookup ? hasChainTrace : hasClaimTrace;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitted(draft.trim());
  }

  return (
    <div className="space-y-6" data-testid="audit-trace-page">
      <PageHeader
        title={t('audit.title')}
        description={t('audit.subtitle')}
        icon={GitCompare}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('audit.entryTitle')}</CardTitle>
          <CardDescription>{t('audit.entryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
            <Input
              ref={inputRef}
              aria-label={t('audit.inputAria')}
              placeholder={t('audit.placeholder')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="font-mono"
              autoComplete="off"
            />
            <Button type="submit" disabled={draft.trim().length === 0} className="shrink-0">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('audit.run')}
            </Button>
          </form>
          {submitted.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {isChainLookup ? t('audit.lookupChain') : t('audit.lookupClaim')}
              </Badge>
              <code className="break-all">{submitted}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {submitted.length > 0 && !isChainLookup && (
        <Alert data-testid="audit-chain-capability-note">
          <AlertTitle>{t('audit.evidenceChain')}</AlertTitle>
          <AlertDescription>{t('audit.chainNeedsHash')}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-3" role="status" aria-label={t('audit.loading')} data-testid="audit-loading">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-28 w-full" />
          <span className="sr-only">{t('audit.loading')}</span>
        </div>
      )}

      {lookupError !== null && (
        <Alert variant="destructive" data-testid="audit-error">
          <AlertTitle>{t('audit.failureTitle')}</AlertTitle>
          <AlertDescription>{lookupError.message}</AlertDescription>
        </Alert>
      )}

      {submitted.length > 0 && !isLoading && lookupError === null && !hasTrace && (
        <Alert data-testid="audit-empty">
          <AlertTitle>{t('audit.emptyTitle')}</AlertTitle>
          <AlertDescription>{t('audit.emptyDescription', { id: submitted })}</AlertDescription>
        </Alert>
      )}

      {hasTrace && (
        <div className="space-y-4">
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={t('audit.title')}>
            <Badge variant="outline" className="max-w-full font-mono">
              <span className="truncate">{submitted}</span>
            </Badge>
            <span aria-hidden="true">→</span>
            {isChainLookup ? (
              <Badge variant="secondary">{t('audit.evidenceChain')}</Badge>
            ) : (
              <>
                <Badge variant="secondary">
                  {verdict.data !== undefined ? t('audit.verdict') : `${t('audit.verdict')} (${t('audit.none')})`}
                </Badge>
                <span aria-hidden="true">→</span>
                <Badge variant="secondary">
                  {t('audit.lifecycle')} ({lifecycle.data?.events.length ?? 0})
                </Badge>
              </>
            )}
          </nav>

          {verdict.data !== undefined && <VerdictCard verdict={verdict.data} />}
          {chain.data !== undefined && <ChainCard chain={chain.data} />}
          {lifecycle.data !== undefined && lifecycle.data.events.length > 0 && (
            <LifecycleCard lifecycle={lifecycle.data} />
          )}
        </div>
      )}
    </div>
  );
}

function VerdictCard({ verdict }: { readonly verdict: HonestVerdictDto }) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('audit.verdictTitle')}</CardTitle>
        <CardDescription>{t('audit.verdictDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('audit.decision')}:</span>
          {isVerdictValue(verdict.decision) ? (
            <VerdictBadge decision={verdict.decision} size="sm" />
          ) : (
            <Badge>{verdict.decision}</Badge>
          )}
        </div>
        {verdict.nodeKind !== undefined && (
          <MetadataRow label={t('audit.nodeKind')} value={verdict.nodeKind} />
        )}
        {verdict.untestedReason !== null && verdict.untestedReason.length > 0 && (
          <MetadataRow label={t('audit.untestedReason')} value={verdict.untestedReason} />
        )}
        {verdict.scopeSlipText !== null && verdict.scopeSlipText.length > 0 && (
          <MetadataRow label={t('audit.scopeSlip')} value={verdict.scopeSlipText} />
        )}
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="text-xs font-medium text-muted-foreground">{t('audit.currentHash')}</div>
          <code className="mt-1 block break-all font-mono text-xs">{verdict.currentHash}</code>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

function ChainCard({ chain }: { readonly chain: EvidenceChainResponse }) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('audit.chainTitle')}</CardTitle>
        <CardDescription>{t('audit.chainDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {chain.callRecord === null ? (
          <p className="text-sm text-muted-foreground">{t('audit.noCallRecord')}</p>
        ) : (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{chain.callRecord.seq}</Badge>
              <span>{chain.callRecord.stageId}</span>
              <span className="text-muted-foreground">{chain.callRecord.payloadKind}</span>
            </div>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">{t('audit.model')}</dt>
              <dd className="break-all font-mono">{chain.callRecord.modelId}</dd>
              <dt className="text-muted-foreground">{t('audit.finish')}</dt>
              <dd>{chain.callRecord.finishReason}</dd>
              <dt className="text-muted-foreground">ISO</dt>
              <dd className="font-mono">{chain.callRecord.isoTimestamp}</dd>
            </dl>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              <HashField label={t('audit.prev')} value={chain.callRecord.prevHash} />
              <HashField label={t('audit.curr')} value={chain.callRecord.currentHash} />
            </div>
          </div>
        )}
        <HashField label={t('audit.headHash')} value={chain.headHash} />
      </CardContent>
    </Card>
  );
}

function HashField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 p-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="mt-1 block break-all font-mono text-xs">{value}</code>
    </div>
  );
}

function LifecycleCard({ lifecycle }: { readonly lifecycle: LifecycleEventsResponse }) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('audit.lifecycleTitle')}</CardTitle>
        <CardDescription>{t('audit.lifecycleDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lifecycle.events.map((event) => (
          <article key={event.eventId} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{event.fromState}</Badge>
              <span aria-hidden="true">→</span>
              <Badge
                variant={event.toState === 'corrected' || event.toState === 'retracted' ? 'destructive' : 'secondary'}
              >
                {event.toState}
              </Badge>
              <span className="text-muted-foreground">
                {t('audit.by')}: {event.actor}
              </span>
            </div>
            <p className="mt-2">{event.reason}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <time dateTime={event.createdAt}>{event.createdAt}</time>
              <span className="break-all">{event.currentHash}</span>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
