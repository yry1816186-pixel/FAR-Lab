/**
 * EvidenceTimeline — 交互式证据时间线组件。
 *
 * 将 5 值裁决（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED）
 * 渲染为垂直时间线。每条裁决可点击展开，展示 SourceCard（来源锚点详情）
 * 与哈希链回放（prevHash → currentHash 链式完整性可视化）。
 */

import { useState, useCallback } from 'react';
import type { HonestVerdictDto } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VERDICT_CONFIG, VerdictBadge } from './VerdictBadge';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  GitCommitHorizontal,
  Clock,
  Hash,
  Link2,
  FileCode,
  Globe,
} from 'lucide-react';

// ---------- 类型收窄 ----------

/** SourceAnchor 已知字段（从 HonestVerdictDto.sourceAnchor: unknown 安全提取） */
interface SourceAnchorSafe {
  gitCommitSha?: string;
  dashscopeRequestId?: string | null;
  isoTimestamp?: string;
  rawResponseHash?: string;
  doiOrArxivId?: string;
  codeLocation?: {
    filePath?: string;
    location?: string;
    lineNumber?: number;
  };
}

/** 运行时安全提取 sourceAnchor 字段 */
function extractSourceAnchor(value: unknown): SourceAnchorSafe | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const result: SourceAnchorSafe = {};
  if (typeof obj.gitCommitSha === 'string') result.gitCommitSha = obj.gitCommitSha;
  if (typeof obj.dashscopeRequestId === 'string' || obj.dashscopeRequestId === null) {
    result.dashscopeRequestId = obj.dashscopeRequestId;
  }
  if (typeof obj.isoTimestamp === 'string') result.isoTimestamp = obj.isoTimestamp;
  if (typeof obj.rawResponseHash === 'string') result.rawResponseHash = obj.rawResponseHash;
  if (typeof obj.doiOrArxivId === 'string') result.doiOrArxivId = obj.doiOrArxivId;
  if (obj.codeLocation !== null && obj.codeLocation !== undefined && typeof obj.codeLocation === 'object') {
    const cl = obj.codeLocation as Record<string, unknown>;
    result.codeLocation = {};
    if (typeof cl.filePath === 'string') result.codeLocation.filePath = cl.filePath;
    if (typeof cl.location === 'string') result.codeLocation.location = cl.location;
    if (typeof cl.lineNumber === 'number') result.codeLocation.lineNumber = cl.lineNumber;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** 截断 hex 哈希（前 8 后 6 位 + ...） */
function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---------- 子组件 ----------

/** 来源锚点卡片 — 展示证据的外部不可篡改锚点 */
function SourceCard({ sourceAnchor }: { sourceAnchor: SourceAnchorSafe }) {
  return (
    <div
      className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2 text-sm"
      data-testid="source-card"
    >
      <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
        Source Anchor
      </h4>
      <div className="grid grid-cols-1 gap-1.5">
        {sourceAnchor.gitCommitSha !== undefined && (
          <div className="flex items-center gap-1.5">
            <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">Commit:</span>
            <code className="font-mono text-xs text-foreground">{sourceAnchor.gitCommitSha.slice(0, 8)}</code>
          </div>
        )}
        {sourceAnchor.isoTimestamp !== undefined && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">Time:</span>
            <code className="font-mono text-xs text-foreground">{sourceAnchor.isoTimestamp}</code>
          </div>
        )}
        {sourceAnchor.dashscopeRequestId !== undefined && sourceAnchor.dashscopeRequestId !== null && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">Request ID:</span>
            <code className="font-mono text-xs text-foreground truncate max-w-[200px]">
              {sourceAnchor.dashscopeRequestId}
            </code>
          </div>
        )}
        {sourceAnchor.dashscopeRequestId === null && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">Request ID:</span>
            <span className="text-xs text-verdict-inconclusive font-medium">credentials missing (null)</span>
          </div>
        )}
        {sourceAnchor.rawResponseHash !== undefined && (
          <div className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">Response hash:</span>
            <code className="font-mono text-xs text-foreground">{truncateHash(sourceAnchor.rawResponseHash)}</code>
          </div>
        )}
        {sourceAnchor.doiOrArxivId !== undefined && (
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground text-xs">DOI/arXiv:</span>
            <code className="font-mono text-xs text-foreground">{sourceAnchor.doiOrArxivId}</code>
          </div>
        )}
        {sourceAnchor.codeLocation !== undefined &&
          sourceAnchor.codeLocation.filePath !== undefined && (
            <div className="flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground text-xs">Code:</span>
              <code className="font-mono text-xs text-foreground">
                {sourceAnchor.codeLocation.filePath}
                {sourceAnchor.codeLocation.location !== undefined
                  ? `:${sourceAnchor.codeLocation.location}`
                  : ''}
              </code>
            </div>
          )}
      </div>
    </div>
  );
}

/** 哈希链回放 — 展示 prevHash → currentHash 链式完整性 */
function HashChainReplay({ prevHash, currentHash }: { prevHash: string; currentHash: string }) {
  const isGenesis = prevHash === '0'.repeat(64);
  return (
    <div
      className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2 text-sm"
      data-testid="hash-chain-replay"
    >
      <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
        Hash Chain Replay
      </h4>
      <div className="flex flex-col items-center gap-1">
        {/* prevHash */}
        <div className="w-full rounded bg-background px-2 py-1 border">
          <span className="text-xs text-muted-foreground">
            {isGenesis ? 'Genesis hash' : 'Previous hash (prevHash)'}
          </span>
          <code className="block font-mono text-xs text-foreground break-all">
            {isGenesis ? '0×64 (GENESIS)' : truncateHash(prevHash)}
          </code>
        </div>
        {/* 链式连接箭头 */}
        <div className="flex items-center gap-1 text-muted-foreground" aria-hidden="true">
          <span className="text-lg leading-none">↓</span>
          <span className="text-[10px]">sha256</span>
        </div>
        {/* currentHash */}
        <div className="w-full rounded bg-background px-2 py-1 border border-primary/30">
          <span className="text-xs text-muted-foreground">Current hash (currentHash)</span>
          <code className="block font-mono text-xs text-primary font-semibold break-all">
            {truncateHash(currentHash)}
          </code>
        </div>
      </div>
      {!isGenesis && (
        <p className="text-[11px] text-muted-foreground text-center">
          Verification: sha256(prevHash ‖ payload) = currentHash. Chain integrity guarantees the evidence was not tampered with.
        </p>
      )}
    </div>
  );
}

/** 可证伪规格摘要 */
function FalsificationSpecSummary({ item }: { item: HonestVerdictDto }) {
  const semanticsLabel: Record<string, string> = {
    gt: '≥',
    lt: '≤',
    range: '∈',
  };
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Falsifiable claim:</span>
      <span className="font-medium text-foreground">{item.falsificationSpec.prediction}</span>
      <span className="text-muted-foreground">
        {' '}
        （{item.falsificationSpec.metric}{' '}
        {semanticsLabel[item.falsificationSpec.thresholdSemantics] ??
          item.falsificationSpec.thresholdSemantics}{' '}
        {item.falsificationSpec.falsificationThreshold}）
      </span>
    </div>
  );
}

// ---------- 时间线条目 ----------

interface TimelineEntryProps {
  readonly item: HonestVerdictDto;
  readonly isExpanded: boolean;
  readonly onToggle: (verdictId: string) => void;
}

function TimelineEntry({ item, isExpanded, onToggle }: TimelineEntryProps) {
  const config = VERDICT_CONFIG[item.decision];
  const Icon = config.icon;
  const sourceAnchor = extractSourceAnchor(item.sourceAnchor);

  const handleToggle = useCallback(() => {
    onToggle(item.verdictId);
  }, [item.verdictId, onToggle]);

  return (
    <div
      className="relative flex gap-4 pb-6"
      data-testid={`timeline-entry-${item.verdictId}`}
    >
      {/* 时间线竖线 + 圆点 */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border-2',
            config.iconClassName.replace('text-', 'border-'),
          )}
          style={{
            backgroundColor: config.fill,
            borderColor: config.stroke,
          }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        {/* 竖线延伸到下一个条目底部 */}
        <div className="w-0.5 flex-1 min-h-[16px] bg-border" aria-hidden="true" />
      </div>

      {/* 内容卡片 */}
      <Card
        className={cn(
          'flex-1 transition-shadow hover:shadow-md cursor-pointer',
          config.cardClassName,
        )}
        data-testid={`timeline-card-${item.verdictId}`}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Verdict ${item.verdictId} - ${config.label}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className={cn('h-5 w-5 shrink-0', config.iconClassName)} aria-hidden="true" />
              <CardTitle className="text-base truncate" title={item.verdictId}>
                {item.verdictId}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <VerdictBadge decision={item.decision} size="sm" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle();
                }}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* 折叠元信息（始终可见） */}
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Node type</span>
            <span className="font-mono text-foreground">{item.nodeKind}</span>

            <span className="text-muted-foreground">Metric value</span>
            <span className="font-mono text-foreground">
              {item.metricValue !== null ? item.metricValue.toFixed(4) : '—'}
            </span>

            <span className="text-muted-foreground">Conflicting evidence</span>
            <span className="font-mono text-foreground">{item.conflictingEvidenceCount}</span>

            <span className="text-muted-foreground">Created at</span>
            <span className="font-mono text-xs text-foreground">{item.createdAt}</span>
          </div>

          {/* 来源锚点摘要（始终可见） */}
          {sourceAnchor !== null && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground" data-testid={`source-anchor-summary-${item.verdictId}`}>
              {sourceAnchor.gitCommitSha !== undefined && (
                <span className="flex items-center gap-1">
                  <GitCommitHorizontal className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <code className="font-mono">{sourceAnchor.gitCommitSha.slice(0, 8)}</code>
                </span>
              )}
              {sourceAnchor.isoTimestamp !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <code className="font-mono">{sourceAnchor.isoTimestamp}</code>
                </span>
              )}
            </div>
          )}
          {sourceAnchor === null && (
            <div className="text-xs text-muted-foreground/60 italic" data-testid={`source-anchor-empty-${item.verdictId}`}>
              No parseable source anchor
            </div>
          )}

          {/* 可证伪规格 */}
          <FalsificationSpecSummary item={item} />

          {/* DEGRADED_SCOPE 高亮 */}
          {item.decision === 'DEGRADED_SCOPE' && item.scopeSlipText !== null && (
            <div
              className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm"
              data-testid={`scope-slip-${item.verdictId}`}
            >
              <span className="font-semibold text-orange-800">Scope degradation note:</span>
              <span className="text-orange-700 ml-1">{item.scopeSlipText}</span>
            </div>
          )}

          {/* UNTESTED 高亮 */}
          {item.decision === 'UNTESTED' && item.untestedReason !== null && (
            <div
              className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              data-testid={`untested-reason-${item.verdictId}`}
            >
              <span className="font-semibold text-gray-700">Untested reason:</span>
              <span className="text-gray-600 ml-1">{item.untestedReason}</span>
            </div>
          )}

          {/* 展开区域：SourceCard + 哈希链回放 */}
          {isExpanded && (
            <div className="space-y-3 pt-2" data-testid={`expanded-detail-${item.verdictId}`}>
              {sourceAnchor !== null ? (
                <SourceCard sourceAnchor={sourceAnchor} />
              ) : (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  sourceAnchor data unavailable
                </div>
              )}
              <HashChainReplay prevHash={item.prevHash} currentHash={item.currentHash} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- 主组件 ----------

export interface EvidenceTimelineProps {
  readonly items: readonly HonestVerdictDto[];
  readonly expandedIds: ReadonlySet<string>;
  readonly onToggleExpand: (verdictId: string) => void;
}

/** 交互式证据时间线 */
export function EvidenceTimeline({ items, expandedIds, onToggleExpand }: EvidenceTimelineProps) {
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center py-12 text-center text-muted-foreground"
        data-testid="timeline-empty"
      >
        <Hash className="h-10 w-10 mb-3 text-muted-foreground/40" aria-hidden="true" />
        <p>No timeline entries yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0" data-testid="evidence-timeline">
      {items.map((item) => (
        <TimelineEntry
          key={item.verdictId}
          item={item}
          isExpanded={expandedIds.has(item.verdictId)}
          onToggle={onToggleExpand}
        />
      ))}
      {/* 时间线末端标记 */}
      <div className="flex items-center gap-4 pb-2">
        <div className="flex flex-col items-center shrink-0">
          <div
            className="h-3 w-3 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
            data-testid="timeline-end-marker"
          />
        </div>
        <span className="text-xs text-muted-foreground">End of evidence chain</span>
      </div>
    </div>
  );
}

// ---------- 导出的 hook ----------

/** 管理展开/折叠状态的 hook */
export function useTimelineExpansion(): {
  expandedIds: ReadonlySet<string>;
  toggleExpand: (verdictId: string) => void;
  isExpanded: (verdictId: string) => boolean;
} {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpand = useCallback((verdictId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(verdictId)) {
        next.delete(verdictId);
      } else {
        next.add(verdictId);
      }
      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (verdictId: string) => expandedIds.has(verdictId),
    [expandedIds],
  );

  return { expandedIds, toggleExpand, isExpanded };
}
