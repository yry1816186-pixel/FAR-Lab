/**
 * Ink render helpers for chat rows and run sub-views (thin layer over the
 * pure chatCore view model — no logic lives here, so the semantics stay
 * node:test-testable in chatCore and this file stays visual-only).
 */
import React from 'react';
import { Box, Text } from 'ink';
import * as chatCore from './chatCore.ts';
import type { ChatRow } from './chatCore.ts';
import type { LineageGraph } from './api.ts';

const h = React.createElement;
type El = React.ReactElement;

const ROLE_COLOR: Record<'researcher' | 'agent' | 'automation', string> = {
  researcher: 'cyan',
  agent: 'green',
  automation: 'gray',
};

export function renderRow(row: ChatRow, key: string): El {
  switch (row.kind) {
    case 'turn':
      return h(Box, { key },
        h(Text, { bold: true, color: ROLE_COLOR[row.role] }, `${row.label}:`),
        h(Text, { color: row.failed === true ? 'yellow' : undefined }, ` ${row.text.slice(0, 200)}`),
      );
    case 'tools':
      return h(Box, { key, paddingLeft: 2 },
        h(Text, { dimColor: true },
          `工具 ${row.tools.map((t) => `${t.tool}${t.ok ? '✓' : '✗'}${t.durationMs !== undefined ? ` ${t.durationMs}ms` : ''}`).join(' · ')}`),
      );
    case 'proposal': {
      const p = row.proposal;
      const color = p.status === 'pending' ? 'yellow' : p.status === 'executed' ? 'green' : p.status === 'failed' ? 'red' : 'gray';
      return h(Box, { key, paddingLeft: 2, flexDirection: 'row' },
        h(Text, { color }, ` ▸ ${chatCore.proposalLine(p)}`),
      );
    }
    case 'candidates':
      return h(Box, { key, flexDirection: 'column' },
        h(Text, { bold: true }, '候选研究问题：'),
        ...row.items.map((c, i) => h(Text, { key: i }, `  ${i + 1}. ${c.text.slice(0, 90)}`)),
      );
    case 'usage':
      return h(Text, { key, dimColor: true }, `  ${row.line}`);
    case 'error':
      return h(Box, { key, flexDirection: 'column' },
        h(Text, { color: 'red' }, `  ✗ 回复失败: ${row.text.slice(0, 120)}`),
        row.retryHint ? h(Text, { dimColor: true }, '  （消息已保留；重试由服务端/API 提供）') : null,
      );
  }
}

export function renderRows(rows: ChatRow[]): El[] {
  return rows.map((r, i) => renderRow(r, String(i)));
}

// ---- run detail sub-views ----------------------------------------------------

type SubView =
  | { kind: 'hypotheses'; items: unknown[] }
  | { kind: 'evidence'; data: { claims: unknown[]; relations: unknown[] } }
  | { kind: 'lineage'; graph: LineageGraph };

const field = (v: unknown, k: string): string => {
  if (v === null || typeof v !== 'object') return '';
  const val = (v as Record<string, unknown>)[k];
  return typeof val === 'string' ? val : '';
};

export function renderSubView(sub: SubView): El {
  if (sub.kind === 'hypotheses') {
    if (sub.items.length === 0) return h(Text, { dimColor: true }, '（尚无假设）');
    return h(Box, { flexDirection: 'column' },
      h(Text, { bold: true }, `假设 (${sub.items.length})`),
      ...sub.items.slice(0, 20).map((hyp, i) => h(Text, { key: i },
        `  ${field(hyp, 'testability') || '—'} · ${field(hyp, 'noveltyLabel') || '—'} · ${field(hyp, 'statement').slice(0, 80)}`)),
    );
  }
  if (sub.kind === 'evidence') {
    const claims = sub.data.claims;
    if (claims.length === 0) return h(Text, { dimColor: true }, '（尚无证据主张）');
    return h(Box, { flexDirection: 'column' },
      h(Text, { bold: true }, `证据主张 (${claims.length}) · 关联 ${sub.data.relations.length}`),
      ...claims.slice(0, 20).map((c, i) => h(Text, { key: i }, `  [${field(c, 'bindingStatus') || '—'}] ${field(c, 'text').slice(0, 84)}`)),
    );
  }
  return h(Box, { flexDirection: 'column' },
    h(Text, { bold: true }, `谱系: ${sub.graph.nodes.length} 节点 · ${sub.graph.edges.length} 边`),
    ...sub.graph.edges.filter((e) => e.kind === 'revised_into').slice(0, 10).map((e, i) =>
      h(Text, { key: i }, `  修订链: ${e.from} → ${e.to}`)),
    h(Text, { dimColor: true },
      `  反证边 ${sub.graph.edges.filter((e) => e.kind === 'counter_evidence').length} · 其他边 ${sub.graph.edges.filter((e) => e.kind !== 'revised_into' && e.kind !== 'counter_evidence').length}`),
  );
}
