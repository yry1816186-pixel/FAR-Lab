import type { DictKey, Lang } from '../i18n/dict';
import { useI18n } from '../i18n/LanguageContext';

/**
 * W-C bilingual display layer: prefer the zh rendering when the reader chose zh
 * and the object carries one. Display-only — the canonical object (what the
 * researcher edits, what exports carry) is always the original statement.
 */
export const zhFirst = (statement: string, statementZh: string | undefined, lang: Lang): string =>
  lang === 'zh' && statementZh !== undefined && statementZh.trim().length > 0 ? statementZh : statement;

/**
 * Scorecard dimension names: closed snake_case enum → researcher language.
 * Unknown values pass through verbatim (honest, never a wrong label).
 */
const DIMENSION_KEYS: Record<string, DictKey> = {
  scientific_plausibility: 'dim.scientific_plausibility',
  evidence_grounding: 'dim.evidence_grounding',
  counter_evidence_exposure: 'dim.counter_evidence_exposure',
  novelty: 'dim.novelty',
  falsifiability: 'dim.falsifiability',
  testability: 'dim.testability',
  data_availability: 'dim.data_availability',
  methodological_soundness: 'dim.methodological_soundness',
  expected_information_gain: 'dim.expected_information_gain',
  resource_cost: 'dim.resource_cost',
  risk: 'dim.risk',
  uncertainty: 'dim.uncertainty',
};
export const dimensionLabel = (name: string, t: ReturnType<typeof useI18n>['t']): string =>
  DIMENSION_KEYS[name] !== undefined ? t(DIMENSION_KEYS[name]) : name;

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

/**
 * Decode the closed set of HTML entities that source APIs put inside titles
 * (live-observed 2026-08-29: PubMed-style "&lt;i&gt;LMX1A&lt;/i&gt; …" rendered verbatim
 * on the map). Display-layer only — stored metadata stays byte-faithful to the
 * API response it was verified against.
 */
export const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
