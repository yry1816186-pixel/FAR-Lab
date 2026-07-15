import { useState, useMemo, useCallback } from 'react';
import { useVerdictList } from '@/lib/api_client';
import type { HonestVerdictDto, VerdictValue } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VERDICT_CONFIG } from '@/components/VerdictBadge';
import {
  EvidenceTimeline,
  useTimelineExpansion,
} from '@/components/EvidenceTimeline';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CircleDashed,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------- 常量 ----------

const PAGE_SIZE = 12;

// ---------- 辅助组件 ----------

/** 顶部汇总统计条 */
function SummaryStats({ items }: { items: readonly HonestVerdictDto[] }) {
  const counts = useMemo(() => {
    const map: Record<VerdictValue, number> = {
      CONFIRMED: 0,
      REFUTED: 0,
      INCONCLUSIVE: 0,
      DEGRADED_SCOPE: 0,
      UNTESTED: 0,
    };
    for (const item of items) {
      map[item.decision] += 1;
    }
    return map;
  }, [items]);

  const STAT_ENTRIES: readonly {
    readonly key: VerdictValue;
  }[] = [
    { key: 'CONFIRMED' },
    { key: 'REFUTED' },
    { key: 'INCONCLUSIVE' },
    { key: 'DEGRADED_SCOPE' },
    { key: 'UNTESTED' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="summary-stats">
      {STAT_ENTRIES.map(({ key }) => {
        const config = VERDICT_CONFIG[key];
        const Icon = config.icon;
        return (
          <Card
            key={key}
            className={cn('text-center', config.cardClassName)}
            data-testid={`stat-${key.toLowerCase()}`}
          >
            <CardContent className="py-4">
              <Icon className={cn('mx-auto mb-1 h-5 w-5', config.iconClassName)} aria-hidden="true" />
              <div className="text-2xl font-bold text-foreground" data-testid={`stat-count-${key.toLowerCase()}`}>
                {counts[key]}
              </div>
              <div className="text-xs text-muted-foreground">{config.label}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- 页面主体 ----------

export default function HonestyWallPage() {
  const [offset, setOffset] = useState(0);
  const { expandedIds, toggleExpand } = useTimelineExpansion();

  const { data, isLoading, isError, error, isFetching } = useVerdictList(100, 0);

  const items = data?.items ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE);
  const pageItems = items.slice(offset, offset + PAGE_SIZE);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < items.length;

  const handlePrev = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
  }, []);

  const handleNext = useCallback(() => {
    setOffset((prev) => Math.min(items.length - 1, prev + PAGE_SIZE));
  }, [items.length]);

  return (
    <div className="space-y-6" data-testid="honesty-page">
      {/* 页头 */}
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">Honesty Wall</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          HonestyWall · interactive evidence timeline for the 5-value verdict — CONFIRMED · REFUTED · INCONCLUSIVE · DEGRADED_SCOPE · UNTESTED
        </p>
      </header>

      {/* Loading 状态 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20" data-testid="honesty-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="ml-3 text-muted-foreground">Loading verdict data…</span>
        </div>
      )}

      {/* Error 状态 */}
      {isError && !isLoading && (
        <Alert variant="destructive" data-testid="honesty-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Data load failed</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}

      {/* 数据就绪 */}
      {!isLoading && !isError && (
        <>
          {/* 汇总统计 */}
          <section aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="mb-3 text-lg font-semibold">
              Verdict summary
              {totalCount > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({totalCount} total)
                </span>
              )}
            </h2>
            <SummaryStats items={items} />
          </section>

          {/* 证据时间线 */}
          <section aria-labelledby="timeline-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="timeline-heading" className="text-lg font-semibold">
                Evidence timeline
                {items.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    page {currentPage + 1}/{totalPages}
                  </span>
                )}
              </h2>
              {isFetching && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Refreshing" />
              )}
            </div>

            {items.length === 0 ? (
              <Card data-testid="honesty-empty">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CircleDashed className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
                  <p>No experiments run yet — this wall is honestly empty</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <EvidenceTimeline
                  items={pageItems}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                />

                {/* 分页控件 */}
                <nav
                  className="flex items-center justify-between pt-4"
                  aria-label="Verdict pagination"
                  data-testid="pagination"
                >
                  <span className="text-sm text-muted-foreground">
                    {items.length} total, showing {offset + 1}–{Math.min(offset + PAGE_SIZE, items.length)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrev}
                      disabled={!hasPrev}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNext}
                      disabled={!hasNext}
                      aria-label="Next page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </nav>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
