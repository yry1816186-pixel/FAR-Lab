/**
 * campaign/report_generator — 战役报告生成器（2.md §10·night-r7 S3）。
 *
 * 战役结束（或中断）后，从事件账本 + 终态 + run 摘要产出结构化战役报告：
 * 报告是"AI 产出的科研档案"而非营销文档——失败如实入报告（负结果台账，
 * crash-retry 后成功的失败尝试也保留在负结果里），熔断/预算状态如实呈现，
 * 证据锚定到事件账本（eventCount + lastEventHash，可对照 replay 校验）。
 *
 * 确定性（纯函数）：generatedAt 默认取账本最后一个事件的 at（"截至账本"
 * 的确定性时刻），调用方可通过 now 显式注入墙钟；两个渲染器对同一
 * CampaignReport 字节恒等（无 Date.now / 无随机 / 无 locale 依赖）。
 *
 * Cannot-prove（不可隐藏）：
 *   - 本报告反映的是「账本与状态记录了什么」；run 级证据链的健全性是每个
 *     run 自身 verify chain 的职责，报告不代其作保（收尾诚实行即此义）。
 *   - runSummaries 由调用方注入，报告不验证其与底层 run 文件的一致性
 *     （与 run 文件的交叉锚定是 store/loader 的验证面）。
 */

import { escapeLatex } from '../report/latex_renderer.ts';
import type { CampaignEvent, CampaignState } from './types.ts';

// ---------------------------------------------------------------------------
// 报告数据类型
// ---------------------------------------------------------------------------

/** 单个战役问题在报告中的行（errorKind/detail = 最后一次记录的失败细节，即使后来重试成功也保留）。 */
export interface CampaignReportQuestion {
  readonly question: string;
  readonly status: string;
  readonly runId: string | null;
  readonly tokens: number;
  readonly errorKind?: string;
  readonly detail?: string;
}

/** 聚合后的战役报告（渲染器的唯一事实源；markdown / latex 同源零二次事实源）。 */
export interface CampaignReport {
  readonly campaignId: string;
  readonly topic: string;
  /** 生成时刻 ISO-8601（注入时钟：默认 = 账本最后事件的 at）。 */
  readonly generatedAt: string;
  readonly totals: {
    readonly completed: number;
    readonly failed: number;
    readonly pending: number;
    readonly tokens: number;
    readonly breakerTripped: boolean;
  };
  readonly questions: readonly CampaignReportQuestion[];
  /** §10 负结果台账：失败如实入报告（含 crash-retry 后已成功的历史失败）。 */
  readonly negativeResults: ReadonlyArray<{
    readonly question: string;
    readonly errorKind: string;
    readonly detail: string;
  }>;
  readonly evidence: {
    readonly eventCount: number;
    readonly lastEventHash: string;
  };
}

/** 生成输入（runSummaries 按问题文本匹配——输入契约如此；重复问题文本会共享归属，已知限制）。 */
export interface CampaignReportInput {
  readonly campaignId: string;
  readonly events: readonly CampaignEvent[];
  readonly state: CampaignState;
  readonly runSummaries: ReadonlyArray<{
    readonly question: string;
    readonly runId: string;
    readonly tokens: number;
    readonly verdictCounts?: Readonly<Record<string, number>>;
  }>;
  /** 可选墙钟注入（ISO-8601）；缺省取账本最后事件的 at —— 保证默认路径确定性。 */
  readonly now?: string;
}

// ---------------------------------------------------------------------------
// 失败细节提取
// ---------------------------------------------------------------------------

interface FailureInfo {
  readonly errorKind: string;
  readonly detail: string;
}

/**
 * 从事件账本提取每个问题的最后一条失败细节（key = 问题 index，唯一无碰撞；
 * 后写覆盖 → 同一问题多次失败时取最后一条）。crash-retry 语义：重试成功后
 * 历史失败仍保留在提取结果中（供负结果台账使用——双时态）。
 */
function extractFailures(events: readonly CampaignEvent[]): Map<number, FailureInfo> {
  const failures = new Map<number, FailureInfo>();
  for (const event of events) {
    if (event.payload.type !== 'question_failed') continue;
    failures.set(event.payload.index, {
      errorKind: event.payload.errorKind,
      detail: event.payload.detail,
    });
  }
  return failures;
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/**
 * generateCampaignReport —— 聚合账本 + 终态 + run 摘要为战役报告（纯函数）。
 *
 * 语义约定（诚实优先）：
 *   - totals.tokens = state.cumulativeTokens（账本为 SSOT，不重算 runSummaries 之和）；
 *   - 每问题 tokens = 该问题全部 run 尝试之和（重试的开销也是开销），runId = 最后一次尝试；
 *   - totals.pending = 'pending' + 'running'（未终结即待办，保证三计数之和 = 问题总数；
 *     精确状态在问题表逐行保留）；
 *   - negativeResults 含历史失败（即使当前状态已 OK）——双时态：终态与历史并存。
 */
export function generateCampaignReport(input: CampaignReportInput): CampaignReport {
  const failures = extractFailures(input.events);

  let completed = 0;
  let failed = 0;
  let pending = 0;
  for (const q of input.state.questions) {
    if (q.status === 'OK') completed += 1;
    else if (q.status === 'failed') failed += 1;
    else pending += 1; // pending / running：未终结
  }

  const questions: CampaignReportQuestion[] = input.state.questions.map((q) => {
    const runs = input.runSummaries.filter((r) => r.question === q.question);
    const lastRun = runs.at(-1); // 数组序 = 时间序（契约）：最后一次尝试
    const tokens = runs.reduce((sum, r) => sum + r.tokens, 0);
    const failure = failures.get(q.index);
    return {
      question: q.question,
      status: q.status,
      runId: lastRun !== undefined ? lastRun.runId : null,
      tokens,
      ...(failure !== undefined ? { errorKind: failure.errorKind, detail: failure.detail } : {}),
    };
  });

  const negativeResults = questions
    .filter((q) => q.errorKind !== undefined)
    .map((q) => ({
      question: q.question,
      errorKind: q.errorKind ?? 'unknown',
      detail: q.detail ?? 'no failure detail recorded in the event ledger',
    }));

  const lastEvent = input.events.at(-1);

  return {
    campaignId: input.campaignId,
    topic: input.state.topic,
    generatedAt: input.now ?? lastEvent?.at ?? '',
    totals: {
      completed,
      failed,
      pending,
      tokens: input.state.cumulativeTokens,
      breakerTripped: input.state.breakerTripped,
    },
    questions,
    negativeResults,
    evidence: {
      eventCount: input.events.length,
      lastEventHash: lastEvent?.eventHash ?? '',
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown 渲染（确定性：同 CampaignReport 字节恒等）
// ---------------------------------------------------------------------------

/** 表格单元格转义：管道与换行是 Markdown 表格的结构破坏者，转义之；其余原样（保真）。 */
function escapeTableCell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderCampaignReportMarkdown(report: CampaignReport): string {
  const lines: string[] = [];

  // ---- 报告头 ----
  lines.push('# FAR-Lab Campaign Report');
  lines.push('');
  lines.push(`**Campaign ID**: ${report.campaignId}`);
  lines.push(`**Topic**: ${escapeTableCell(report.topic)}`);
  lines.push(`**Generated at**: ${report.generatedAt}`);
  lines.push(
    `**Events recorded**: ${report.evidence.eventCount} (last event hash \`${report.evidence.lastEventHash}\`)`,
  );
  lines.push('');

  // ---- 总量 ----
  lines.push('## Totals');
  lines.push('');
  lines.push('| Completed | Failed | Pending | Tokens | Breaker |');
  lines.push('|---|---|---|---|---|');
  lines.push(
    `| ${report.totals.completed} | ${report.totals.failed} | ${report.totals.pending} | ${report.totals.tokens} | ${
      report.totals.breakerTripped ? 'TRIPPED' : 'intact'
    } |`,
  );
  lines.push('');

  // ---- 逐问题表 ----
  lines.push('## Questions');
  lines.push('');
  lines.push('| # | Question | Status | Run | Tokens |');
  lines.push('|---|---|---|---|---|');
  report.questions.forEach((q, i) => {
    lines.push(
      `| ${i + 1} | ${escapeTableCell(q.question)} | ${q.status} | ${escapeTableCell(q.runId ?? '—')} | ${q.tokens} |`,
    );
  });
  lines.push('');

  // ---- 负结果（§10：失败如实入报告）----
  lines.push('## Negative results');
  lines.push('');
  if (report.negativeResults.length === 0) {
    lines.push('No negative results recorded.');
  } else {
    for (const n of report.negativeResults) {
      lines.push(`- **${escapeTableCell(n.question)}** — [${n.errorKind}] ${escapeTableCell(n.detail)}`);
    }
  }
  lines.push('');

  // ---- 熔断状态 ----
  lines.push('## Breaker status');
  lines.push('');
  lines.push(
    report.totals.breakerTripped
      ? '- Circuit breaker: **TRIPPED** — budget guard halted the campaign.'
      : '- Circuit breaker: intact (not tripped).',
  );
  lines.push('');

  // ---- 收尾诚实行（cannot-prove）----
  lines.push('---');
  lines.push('');
  lines.push(
    "*This campaign report reflects recorded events; run-level soundness is each run's verify chain's job.*",
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LaTeX 渲染（复用 report/latex_renderer 的 escapeLatex；编译就绪前导）
// ---------------------------------------------------------------------------

/**
 * verbatim 块（保真负结果细节）。内嵌 \\end{verbatim*} 双写防注入——镜像
 * report/latex_renderer.ts 的同名守卫（彼处未导出，此处局部副本并注明来源）。
 */
function latexVerbatim(body: string): string {
  const sanitized = body.replaceAll('\\end{verbatim*}', '\\\\end{verbatim*}');
  return `\\begin{verbatim*}\n${sanitized}\n\\end{verbatim*}`;
}

function renderQuestionsLongtable(report: CampaignReport): string {
  const rows = report.questions
    .map(
      (q, i) =>
        `${i + 1} & ${escapeLatex(q.question)} & ${escapeLatex(q.status)} & ${escapeLatex(
          q.runId ?? '--',
        )} & ${q.tokens} \\\\`,
    )
    .join('\n');
  return `\\begin{longtable}{p{0.06\\textwidth}p{0.40\\textwidth}p{0.14\\textwidth}p{0.24\\textwidth}r}
\\toprule
\\textbf{\\#} & \\textbf{Question} & \\textbf{Status} & \\textbf{Run} & \\textbf{Tokens} \\\\
\\midrule
\\endfirsthead
\\toprule
\\textbf{\\#} & \\textbf{Question} & \\textbf{Status} & \\textbf{Run} & \\textbf{Tokens} \\\\
\\midrule
\\endhead
\\bottomrule
\\endlastfoot
${rows}
\\end{longtable}
`;
}

/** 渲染完整可编译 .tex 战役报告（纯函数·确定性：同 CampaignReport 字节恒等）。 */
export function renderCampaignReportLatex(report: CampaignReport): string {
  const totalsRows = [
    `Completed & ${report.totals.completed} \\\\`,
    `Failed & ${report.totals.failed} \\\\`,
    `Pending & ${report.totals.pending} \\\\`,
    `Tokens & ${report.totals.tokens} \\\\`,
    `Breaker & ${report.totals.breakerTripped ? 'tripped' : 'intact'} \\\\`,
  ].join('\n');

  const negativeBlocks =
    report.negativeResults.length === 0
      ? 'No negative results recorded.\n'
      : report.negativeResults
          .map(
            (n) =>
              `\\paragraph{${escapeLatex(n.question)}} \\textbf{[${escapeLatex(n.errorKind)}]}\n${latexVerbatim(n.detail)}`,
          )
          .join('\n\n');

  return `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage[hidelinks]{hyperref}
\\title{FAR-Lab Campaign Report\\\\\\large campaign ${escapeLatex(report.campaignId)}}
\\date{${escapeLatex(report.generatedAt)}}
\\begin{document}
\\maketitle
\\paragraph{Topic} ${escapeLatex(report.topic)}

\\section*{Totals}
\\begin{tabular}{lr}
\\toprule
\\textbf{Metric} & \\textbf{Value} \\\\
\\midrule
${totalsRows}
\\bottomrule
\\end{tabular}

\\section*{Questions}
${renderQuestionsLongtable(report)}
\\section*{Negative results}
${negativeBlocks}
\\paragraph{Circuit breaker} ${report.totals.breakerTripped ? 'TRIPPED --- budget guard halted the campaign.' : 'intact (not tripped).'}

\\paragraph*{Scope of this report} This campaign report reflects recorded events; run-level soundness is each run's verify chain's job.
\\end{document}
`;
}
