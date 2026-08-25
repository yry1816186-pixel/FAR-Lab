import type { PaperOutline, SourceDocument } from '../domain/index.js';

/**
 * Lane-07 deterministic figure assembly (zero-dependency SVG). Every coordinate derives
 * from stored object values — a figure is a projection, not an illustration: no axis
 * number exists that is not a stored value or a fixed layout constant. Provenance lives
 * in <desc> so the figure carries its own sourcing even when detached from the paper.
 */

export interface FigureProvenance {
  runId: string;
  /** Caller-owned clock (deterministic re-render passes the bundle's createdAt). */
  generatedAt: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const truncate = (s: string, max: number): string => {
  const cps = [...s];
  return cps.length <= max ? s : `${cps.slice(0, max).join('')}…`;
};

const FONT = "font-family=\"ui-monospace, 'Cascadia Mono', Consolas, monospace\"";
const fmtNum = (n: number): string => Number(n.toFixed(4)).toString();

const svgWrap = (width: number, height: number, title: string, desc: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">\n`
  + `<title>${esc(title)}</title>\n<desc>${esc(desc)}</desc>\n${body}</svg>\n`;

/**
 * F1 — win rate per ranked hypothesis (tournament standings), horizontal bars.
 * Hypotheses without a win rate are listed in <desc> as omitted — never drawn as zero.
 */
export const buildWinRateFigure = (outline: PaperOutline, prov: FigureProvenance): string => {
  const omitted = outline.results.filter((r) => r.winRate === null).map((r) => r.hypothesisId);
  const labelW = 230;
  const plotW = 330;
  const valueW = 70;
  const padL = 12;
  const padR = 12;
  const rowH = 22;
  const gap = 10;
  const width = padL + labelW + plotW + valueW + padR;
  const headH = 34;
  const footH = 20;
  const height = headH + outline.results.length * (rowH + gap) + footH;

  const parts: string[] = [];
  parts.push(`<text x="${padL}" y="20" ${FONT} font-size="13" font-weight="bold">Win rate by ranked hypothesis</text>`);
  // x axis: 0..1 scale with three ticks — layout constants, not data invention.
  const x0 = padL + labelW;
  for (const tick of [0, 0.5, 1]) {
    const x = x0 + tick * plotW;
    parts.push(`<line x1="${x}" y1="${headH - 6}" x2="${x}" y2="${height - footH}" stroke="#999" stroke-width="1" stroke-dasharray="${tick === 0 ? '0' : '2,3'}"/>`);
    parts.push(`<text x="${x}" y="${height - footH + 13}" ${FONT} font-size="10" fill="#666" text-anchor="middle">${tick.toFixed(1)}</text>`);
  }
  outline.results.forEach((r, i) => {
    const y = headH + i * (rowH + gap);
    const rankLabel = r.rank !== null ? `#${r.rank} ` : '';
    parts.push(`<text x="${padL}" y="${y + 15}" ${FONT} font-size="11" fill="#222">${esc(truncate(`${rankLabel}${r.hypothesisId}`, 40))}</text>`);
    if (r.winRate !== null) {
      const w = Math.max(1, r.winRate * plotW);
      parts.push(`<rect x="${x0}" y="${y}" width="${w.toFixed(2)}" height="${rowH}" fill="#3b6ea5"/>`);
      parts.push(`<text x="${x0 + plotW + 6}" y="${y + 15}" ${FONT} font-size="11" fill="#222">${fmtNum(r.winRate)}</text>`);
    } else {
      parts.push(`<text x="${x0 + 4}" y="${y + 15}" ${FONT} font-size="11" fill="#999">no data (not contested)</text>`);
    }
  });

  const desc = `Deterministic projection of tournament standings for run ${prov.runId}; generated ${prov.generatedAt}; `
    + `values are stored winRate fields (uncalibrated decision aids, not probabilities). `
    + (outline.results.length === 0
      ? 'No ranked hypotheses are stored for this run.'
      : omitted.length > 0
        ? `Hypotheses without a stored win rate: ${omitted.join(', ')}.`
        : 'All listed hypotheses carry a stored win rate.');
  return svgWrap(width, Math.max(height, headH + footH), 'Win rate by ranked hypothesis', desc, `${parts.join('\n')}\n`);
};

/**
 * F2 — corpus composition by content depth (the evidence-ceiling disclosure as a figure).
 * All four depth categories are drawn (zero-count included) so the frame is stable across runs.
 */
export const buildCorpusDepthFigure = (sources: readonly SourceDocument[], prov: FigureProvenance): string => {
  const categories = ['metadata_only', 'abstract', 'full_text', 'data'] as const;
  const counts = categories.map((c) => sources.filter((s) => s.contentDepth === c).length);
  const maxCount = Math.max(1, ...counts);
  const width = 640;
  const padL = 40;
  const padR = 20;
  const headH = 34;
  const footH = 30;
  const plotH = 180;
  const plotW = width - padL - padR;
  const slot = plotW / categories.length;
  const barW = Math.min(80, slot - 20);
  const height = headH + plotH + footH;

  const parts: string[] = [];
  parts.push(`<text x="${padL}" y="20" ${FONT} font-size="13" font-weight="bold">Retrieved corpus by content depth (n=${sources.length})</text>`);
  // y ticks at 0 / half / max — rounded so tick labels are integers, gridlines stay layout-only.
  const yBase = headH + plotH;
  const tickStep = maxCount <= 4 ? 1 : Math.ceil(maxCount / 4);
  for (let t = 0; t <= maxCount; t += tickStep) {
    const y = yBase - (t / maxCount) * plotH;
    parts.push(`<line x1="${padL}" y1="${y.toFixed(2)}" x2="${width - padR}" y2="${y.toFixed(2)}" stroke="${t === 0 ? '#555' : '#ddd'}" stroke-width="1"/>`);
    parts.push(`<text x="${padL - 6}" y="${(y + 3).toFixed(2)}" ${FONT} font-size="10" fill="#666" text-anchor="end">${t}</text>`);
  }
  categories.forEach((cat, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = (counts[i]! / maxCount) * plotH;
    parts.push(`<rect x="${x.toFixed(2)}" y="${(yBase - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="#4d8a6a"/>`);
    parts.push(`<text x="${(x + barW / 2).toFixed(2)}" y="${(yBase - h - 5).toFixed(2)}" ${FONT} font-size="11" text-anchor="middle" fill="#222">${counts[i]}</text>`);
    parts.push(`<text x="${(x + barW / 2).toFixed(2)}" y="${yBase + 15}" ${FONT} font-size="10" text-anchor="middle" fill="#444">${esc(cat)}</text>`);
  });

  const desc = `Deterministic projection of source_document.contentDepth for run ${prov.runId}; generated ${prov.generatedAt}; `
    + `counts: ${categories.map((c, i) => `${c}=${counts[i]}`).join(', ')}. Claim extraction is capped at these depths.`;
  return svgWrap(width, height, 'Retrieved corpus by content depth', desc, `${parts.join('\n')}\n`);
};
