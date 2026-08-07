import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useEvidenceChain } from '@/lib/api_client';
import type { GraphSubtree, GraphNodeDto } from '@/lib/types';
import { VERDICT_CONFIG, FALLBACK_VERDICT_COLOR, VerdictBadge } from '@/components/VerdictBadge';
import { DecisionTracePanel, extractDecisionTrace } from '@/components/EvidenceTimeline';
import * as d3 from 'd3';
import { Search, Loader2, AlertTriangle, Network, X } from 'lucide-react';

// ---------- 语义色板（HSL 函数记法·派生自 Design Token）----------

/**
 * 节点颜色 —— 按 nodeKind 分类（保留作为辅助图例）。
 * 颜色值使用 HSL 函数记法（设计 Token 派生），不硬编码 #RRGGBB。
 */
const NODE_KIND_COLOR_MAP: Record<string, { fill: string; stroke: string; label: string }> = {
  hypothesis: { fill: 'hsl(217.2, 91.2%, 59.8%)', stroke: 'hsl(217.2, 91.2%, 45%)', label: 'Blue' },
  evidence:   { fill: 'hsl(142.1, 70.6%, 45.3%)', stroke: 'hsl(142.1, 70.6%, 32%)', label: 'Green' },
  method:     { fill: 'hsl(262.1, 83.3%, 57.8%)', stroke: 'hsl(262.1, 83.3%, 43%)', label: 'Purple' },
  plan:       { fill: 'hsl(32.1, 94.6%, 43.7%)', stroke: 'hsl(32.1, 94.6%, 33%)', label: 'Orange' },
  feedback:   { fill: 'hsl(47.9, 95.8%, 53.1%)', stroke: 'hsl(47.9, 95.8%, 40%)', label: 'Yellow' },
  root:       { fill: 'hsl(215.4, 16.3%, 46.9%)', stroke: 'hsl(215.4, 16.3%, 35%)', label: 'Gray' },
};

/** 按 verdict（5 值裁决）获取节点颜色 —— ProofChainViz 主着色依据 */
function verdictNodeColor(decision: string): { fill: string; stroke: string } {
  const config = VERDICT_CONFIG[decision as keyof typeof VERDICT_CONFIG];
  if (config !== undefined) {
    return { fill: config.fill, stroke: config.stroke };
  }
  return FALLBACK_VERDICT_COLOR;
}

/**
 * 边样式 —— 按 edgeKind 区分。
 */
const EDGE_STYLE_MAP: Record<string, { color: string; dashArray: string | null; width: number }> = {
  supports:     { color: 'hsl(142.1, 70.6%, 45.3%)', dashArray: null,       width: 2 },
  refutes:      { color: 'hsl(0, 84.2%, 60.2%)',      dashArray: '8,4',     width: 2.5 },
  derives_from: { color: 'hsl(215.4, 16.3%, 65%)',    dashArray: null,       width: 1.5 },
  tests:        { color: 'hsl(217.2, 91.2%, 59.8%)',  dashArray: '4,3',     width: 2 },
  iterates:     { color: 'hsl(32.1, 94.6%, 43.7%)',   dashArray: '3,3',     width: 2 },
};

const FALLBACK_EDGE_STYLE = { color: 'hsl(215.4, 16.3%, 70%)', dashArray: null, width: 1.5 };

// ---------- 类型收窄 ----------

function isGraphSubtree(value: unknown): value is GraphSubtree {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.rootId === 'string' &&
    Array.isArray(obj.nodes) &&
    Array.isArray(obj.edges)
  );
}

// ---------- 常量 ----------

const NO_SOURCE_ANCHOR = '(node DTO has no sourceAnchor)';
const NO_HASH = '(node DTO has no hash)';

// ---------- NodeKind · Verdict 中文标签 ----------

const NODE_KIND_LABEL: Record<string, string> = {
  hypothesis: 'Hypothesis',
  evidence: 'Evidence',
  method: 'Method',
  plan: 'Plan',
  feedback: 'Feedback',
  root: 'Root',
};

const NODE_KIND_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  hypothesis: 'default',
  evidence: 'success',
  method: 'secondary',
  plan: 'warning',
  feedback: 'outline',
  root: 'secondary',
};

// ---------- D3 simulation helper types ----------

type SimNode = d3.SimulationNodeDatum & GraphNodeDto;

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  readonly edgeId: string;
  readonly edgeKind: string;
  readonly weight: number | null;
  readonly createdAt: string;
}

// ---------- 力导向图面板 ----------

interface ForceGraphPanelProps {
  readonly subtree: GraphSubtree;
  readonly onSelectNode: (node: GraphNodeDto) => void;
}

/** D3 力导向图 —— 同步 tick(300) 收敛 + 实时 drag 交互，节点颜色按 verdict 映射，tooltip 由 React state 安全渲染。 */
function ForceGraphPanel({ subtree, onSelectNode }: ForceGraphPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNodeDto | null>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    const containerEl = containerRef.current;
    if (!svgEl || !containerEl) return;

    const { nodes, edges } = subtree;
    if (nodes.length === 0) return;

    const width = containerEl.clientWidth;
    const height = Math.max(500, containerEl.clientHeight);

    // 清空旧内容
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    // 构建 D3 simulation data（泛型约束消除重复类型断言）
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const simLinks: SimLink[] = edges.map((e) => ({
      source: e.fromNode,
      target: e.toNode,
      edgeId: e.edgeId,
      edgeKind: e.edgeKind,
      weight: e.weight,
      createdAt: e.createdAt,
    }));

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.nodeId)
          .distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(40));

    // 缩放交互（zoom + pan）—— 直接调用，移除 jsdom 不兼容的 viewBox type-guard
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform.toString());
    });
    svg.call(zoom);

    // 绘制边
    const linkGroup = g.append('g').attr('class', 'links');
    const linkSelection = linkGroup
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) => (EDGE_STYLE_MAP[d.edgeKind] ?? FALLBACK_EDGE_STYLE).color)
      .attr('stroke-width', (d) => (EDGE_STYLE_MAP[d.edgeKind] ?? FALLBACK_EDGE_STYLE).width)
      .attr('stroke-dasharray', (d) => (EDGE_STYLE_MAP[d.edgeKind] ?? FALLBACK_EDGE_STYLE).dashArray ?? 'none')
      .attr('stroke-opacity', 0.7);

    // 绘制节点
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodeSelection = nodeGroup
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onSelectNode(d));

    // 节点圆 —— 按 verdict 着色
    nodeSelection
      .append('circle')
      .attr('r', 22)
      .attr('fill', (d) => verdictNodeColor(d.decision).fill)
      .attr('stroke', (d) => verdictNodeColor(d.decision).stroke)
      .attr('stroke-width', 2.5)
      .attr('data-testid', (d) => `node-circle-${d.nodeId}`);

    // SVG <title> 悬停提示（基础 tooltip·jsdom 兼容）
    nodeSelection
      .append('title')
      .text((d) => {
        const verdictLabel = VERDICT_CONFIG[d.decision as keyof typeof VERDICT_CONFIG]?.label ?? d.decision;
        const kindLabel = NODE_KIND_LABEL[d.nodeKind] ?? d.nodeKind;
        const metric = d.metricValue !== null ? d.metricValue.toFixed(4) : '—';
        const conflicts = d.conflictingEvidenceCount;
        return [
          `Node: ${d.nodeId}`,
          `Evidence ID: ${d.evidenceId}`,
          `Type: ${kindLabel}`,
          `Verdict: ${verdictLabel} (${d.decision})`,
          `Metric: ${metric}`,
          `Conflicting evidence: ${conflicts}`,
          `Created: ${d.createdAt}`,
        ].join('\n');
      });

    // 富 tooltip — 通过 React state 驱动内容安全渲染（零 innerHTML）
    const tooltipEl = tooltipRef.current;
    nodeSelection
      .on('mouseenter', (event: MouseEvent, d) => {
        setHoveredNode(d);
        if (tooltipEl) {
          tooltipEl.style.display = 'block';
          tooltipEl.style.left = `${event.offsetX + 12}px`;
          tooltipEl.style.top = `${event.offsetY - 10}px`;
        }
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
        if (tooltipEl) {
          tooltipEl.style.display = 'none';
        }
      })
      .on('mousemove', (event: MouseEvent) => {
        if (tooltipEl) {
          tooltipEl.style.left = `${event.offsetX + 12}px`;
          tooltipEl.style.top = `${event.offsetY - 10}px`;
        }
      });

    // 节点标签（截断长文本）
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', 'hsl(0, 0%, 100%)')
      .attr('font-size', 10)
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .text((d) => (d.nodeKind.length > 6 ? d.nodeKind.slice(0, 6) : d.nodeKind));

    // 节点拖拽（d3.drag 重启 simulation 实现实时力反馈）
    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (_event, d) => {
        if (!_event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (_event, d) => {
        if (!_event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    nodeSelection.call(dragBehavior);

    // 每帧更新位置（simulation on('tick') 驱动 SVG 更新）
    function ticked() {
      linkSelection
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      nodeSelection.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    simulation.on('tick', ticked);

    // 同步收敛 300 tick 完成初始布局
    for (let i = 0; i < 300; i++) simulation.tick();

    return () => {
      simulation.stop();
      svg.selectAll('*').remove();
    };
  }, [subtree, onSelectNode]);

  // 工具提示内容（JSX 声明式安全渲染，替代 innerHTML）
  const tooltipContent = hoveredNode !== null ? (
    <div className="space-y-1">
      <div className="font-mono text-xs font-semibold">{hoveredNode.nodeId}</div>
      <div className="text-xs text-muted-foreground">Evidence ID: {hoveredNode.evidenceId}</div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Type:</span>
        <span>{NODE_KIND_LABEL[hoveredNode.nodeKind] ?? hoveredNode.nodeKind}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Verdict:</span>
        <span className="font-semibold">
          {VERDICT_CONFIG[hoveredNode.decision as keyof typeof VERDICT_CONFIG]?.label ?? hoveredNode.decision}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        Metric: {hoveredNode.metricValue !== null ? hoveredNode.metricValue.toFixed(4) : '—'}
      </div>
      <div className="text-xs text-muted-foreground">Conflicting evidence: {hoveredNode.conflictingEvidenceCount}</div>
      <div className="text-xs text-muted-foreground font-mono">{hoveredNode.createdAt.slice(0, 10)}</div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="flex-1 min-h-[500px] rounded-lg border bg-card relative" data-testid="force-graph-container">
      <svg ref={svgRef} className="w-full h-full" data-testid="force-graph-svg" />
      {/* 富 tooltip 覆盖层 —— 由 React state 驱动，零 innerHTML */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none z-50 max-w-[260px] rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
        style={{ display: 'none' }}
        role="tooltip"
        aria-hidden="true"
        data-testid="graph-tooltip"
      >
        {tooltipContent}
      </div>
    </div>
  );
}

// ---------- 节点详情侧栏 ----------

interface NodeDetailSidebarProps {
  readonly node: GraphNodeDto;
  readonly onClose: () => void;
}

function NodeDetailSidebar({ node, onClose }: NodeDetailSidebarProps) {
  // B3 透明度层：宽容提取 decisionTrace，无数据（null/undefined）则整个面板不渲染
  const decisionTrace = extractDecisionTrace(node.decisionTrace);
  return (
    <Card className="w-80 shrink-0 self-start" data-testid="node-detail-sidebar">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Node details</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close sidebar">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <DetailRow label="Node ID" value={node.nodeId} mono />
        <DetailRow label="Evidence ID" value={node.evidenceId} mono />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-20 shrink-0">Node kind</span>
          <Badge variant={NODE_KIND_BADGE_VARIANT[node.nodeKind] ?? 'outline'}>
            {NODE_KIND_LABEL[node.nodeKind] ?? node.nodeKind}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-20 shrink-0">Verdict</span>
          {node.decision in VERDICT_CONFIG ? (
            <VerdictBadge
              decision={node.decision as keyof typeof VERDICT_CONFIG}
              size="sm"
            />
          ) : (
            <Badge variant="outline">{node.decision}</Badge>
          )}
        </div>
        {decisionTrace !== null && <DecisionTracePanel trace={decisionTrace} />}
        {node.metricValue !== null && (
          <DetailRow label="Metric" value={String(node.metricValue)} />
        )}
        {node.conflictingEvidenceCount > 0 && (
          <DetailRow label="Conflicting evidence" value={String(node.conflictingEvidenceCount)} />
        )}
        {node.scopeSlipText !== null && (
          <DetailRow label="Scope slip" value={node.scopeSlipText} />
        )}
        {node.untestedReason !== null && (
          <DetailRow label="Untested reason" value={node.untestedReason} />
        )}
        {node.parentNodeId !== null && (
          <DetailRow label="Parent node" value={node.parentNodeId} mono />
        )}
        <DetailRow label="sourceAnchor" value={NO_SOURCE_ANCHOR} />
        <DetailRow label="hash" value={NO_HASH} />
        <DetailRow label="Created" value={node.createdAt} mono />
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, mono }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs break-all' : 'text-xs break-all'}>{value}</span>
    </div>
  );
}

// ---------- 图例 ----------

/** 裁决图例（主着色依据） */
function VerdictLegend() {
  const entries = Object.entries(VERDICT_CONFIG) as readonly (readonly [string, { fill: string; label: string }])[];
  return (
    <div className="flex flex-wrap gap-3" data-testid="verdict-legend">
      {entries.map(([key, { fill, label }]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: fill }}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** 节点类型图例（辅助参考） */
function NodeLegend() {
  const entries = Object.entries(NODE_KIND_COLOR_MAP);
  return (
    <div className="flex flex-wrap gap-3" data-testid="node-legend">
      {entries.map(([kind, { fill }]) => (
        <div key={kind} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full border border-border"
            style={{ backgroundColor: fill }}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">{NODE_KIND_LABEL[kind] ?? kind}</span>
        </div>
      ))}
    </div>
  );
}

function EdgeLegend() {
  return (
    <div className="flex flex-wrap gap-3" data-testid="edge-legend">
      {(
        [
          ['supports', 'Supports'],
          ['refutes', 'Refutes'],
          ['derives_from', 'Derives'],
          ['tests', 'Tests'],
          ['iterates', 'Iterates'],
        ] as const
      ).map(([kind, label]) => {
        const style = EDGE_STYLE_MAP[kind] ?? FALLBACK_EDGE_STYLE;
        return (
          <div key={kind} className="flex items-center gap-1.5">
            <svg width="32" height="12" aria-hidden="true">
              <line
                x1={2}
                y1={6}
                x2={30}
                y2={6}
                stroke={style.color}
                strokeWidth={style.width}
                strokeDasharray={style.dashArray ?? 'none'}
              />
            </svg>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 主页面 ----------

export default function VizPage() {
  const [searchInput, setSearchInput] = useState('');
  const [headHash, setHeadHash] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNodeDto | null>(null);

  const { data, isLoading, isError, error } = useEvidenceChain(headHash);

  const handleSearch = useCallback(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 0) return;
    setSelectedNode(null);
    setHeadHash(trimmed);
  }, [searchInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const subtree: GraphSubtree | null =
    data !== undefined && isGraphSubtree(data.graphSubtree) ? data.graphSubtree : null;

  const hasSearched = headHash.length > 0;
  const isEmpty = hasSearched && !isLoading && !isError && subtree !== null && subtree.nodes.length === 0;

  return (
    <div className="space-y-6" data-testid="viz-page">
      {/* 页头 */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Evidence chain visualization</h1>
        <p className="mt-1 text-muted-foreground">
          Enter an evidence-chain head hash (headHash) to browse evidence nodes and edges as a force-directed DAG. Node colors map to the 5-value verdict; hover for details.
        </p>
      </header>

      {/* 搜索栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2" data-testid="search-bar">
            <label htmlFor="headhash-input" className="sr-only">
              Evidence-chain head hash
            </label>
            <input
              id="headhash-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter headHash (64-hex)"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="headhash-input"
            />
            <Button onClick={handleSearch} disabled={isLoading} data-testid="search-button">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Search</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 错误状态 */}
      {isError && (
        <Alert variant="destructive" data-testid="viz-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to fetch evidence chain</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}

      {/* 空数据状态 */}
      {isEmpty && (
        <Alert data-testid="viz-empty">
          <Network className="h-4 w-4" />
          <AlertTitle>Empty evidence chain</AlertTitle>
          <AlertDescription>
            The evidence chain for this headHash contains no graph nodes. Possible reasons: the hash does not exist, the chain has not been built yet, or the data has been purged.
          </AlertDescription>
        </Alert>
      )}

      {/* 图例 */}
      {subtree !== null && subtree.nodes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Legend</CardTitle>
            <CardDescription>Node colors map to the 5-value verdict (primary); node kinds and edge styles provide secondary distinction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm font-medium">Verdict coloring (primary)</span>
              <div className="mt-2">
                <VerdictLegend />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">Node kind (secondary)</span>
              <div className="mt-2">
                <NodeLegend />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium">Edge type</span>
              <div className="mt-2">
                <EdgeLegend />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 图 + 侧栏 */}
      {subtree !== null && subtree.nodes.length > 0 && (
        <div className="flex gap-4 items-start" data-testid="viz-graph-area">
          <ForceGraphPanel subtree={subtree} onSelectNode={setSelectedNode} />
          {selectedNode !== null && (
            <NodeDetailSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </div>
      )}

      {/* 无数据（已搜索但无合法 graphSubtree） */}
      {hasSearched && !isLoading && !isError && subtree === null && (
        <Alert data-testid="viz-no-subtree">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not parse evidence-chain graph data</AlertTitle>
          <AlertDescription>
            The graphSubtree returned by the API does not match the expected shape (missing rootId / nodes / edges). Check that the backend API version matches.
          </AlertDescription>
        </Alert>
      )}

      {/* 初始空态（未搜索） */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-20 text-center" data-testid="viz-initial">
          <Network className="h-16 w-16 text-muted-foreground/40" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Enter a headHash to start exploring</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            The evidence-chain visualization renders support, refutation, derivation, testing, and iteration relationships between evidence nodes as a force-directed DAG. Each node is an auditable verdict record; colors map to the 5-value verdict, and hover reveals evidence details.
          </p>
        </div>
      )}
    </div>
  );
}
