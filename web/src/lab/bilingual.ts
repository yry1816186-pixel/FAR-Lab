import type { Lang } from '../i18n/dict';

/**
 * W-C bilingual display layer: prefer the zh rendering when the reader chose zh
 * and the object carries one. Display-only — the canonical object (what the
 * researcher edits, what exports carry) is always the original statement.
 */
export const zhFirst = (statement: string, statementZh: string | undefined, lang: Lang): string =>
  lang === 'zh' && statementZh !== undefined && statementZh.trim().length > 0 ? statementZh : statement;

/**
 * Localize a closed set of code-generated marker strings (scientific-state.ts
 * templateEvidence). The set is produced by OUR projection code — translating
 * it at the display layer loses nothing; unknown markers pass through verbatim
 * (never guess at domain content).
 */
export const markerZh = (marker: string, lang: Lang): string => {
  if (lang !== 'zh') return marker;
  const hyp = /^(\d+)\/(\d+) active hypotheses are offline-template statements$/.exec(marker);
  if (hyp !== null) {
    return `${hyp[1]}/${hyp[2]} 个活跃假设是离线模板语句`;
  }
  if (marker === 'scope domain is the offline scope template') {
    return '研究范围的领域值是离线范围模板';
  }
  return marker;
};
