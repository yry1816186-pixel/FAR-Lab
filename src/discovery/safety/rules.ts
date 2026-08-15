/**
 * discovery/safety/rules — dual-use screening rules (directive §2.6).
 *
 * Design: each rule is a CONJUNCTION GROUP — every pattern in the group must
 * co-occur (word-boundary, case-insensitive) in the candidate text. This is
 * deliberately NOT a single-keyword blocklist: legitimate science discusses
 * pathogens and synthesis constantly; what this gate targets is the
 * CONVERGENCE of a harmful-target term with an enabling-action term (the
 * §2.6 adversarial sample: an astronomy-skinned bio-synthesis request must
 * hit BIO-1 regardless of the skin, because the convergence is semantic).
 *
 * Transparency (§2.6 "规则透明"): the full rule list is exported and pinned by
 * tests (append-only, unique ids). The published boundary statement names the
 * CATEGORIES covered; the regex sources stay in-repo (defensive detail is not
 * operational guidance — a researcher reading this file learns nothing about
 * executing anything harmful).
 *
 * Completeness honesty: this lexicon is NOT exhaustive — the model layer
 * (dual_use_gate.ts) screens for lexically-disguised risk, and the gate's
 * boundary statement names what the two layers cannot prove.
 */

/** One conjunction-group rule: ALL patterns must match for the rule to fire. */
export interface DualUseRule {
  readonly id: string;
  readonly category: 'biological' | 'chemical' | 'nuclear' | 'cyber';
  readonly severity: 'block';
  /** Every regex source must match (word-boundary applied by the matcher). */
  readonly allOf: readonly string[];
}

/**
 * Dual-use rule catalog (append-only; ids pinned by tests). Each entry is a
 * target×action convergence, never a bare topic word. Stems carry `\w*`
 * suffixes so morphological variants match inside the matcher's boundaries
 * ("aerosolized", "synthesizing", "weaponization" all hit their stems).
 */
export const DUAL_USE_RULES: readonly DualUseRule[] = [
  {
    id: 'BIO-SYNTH-PATHOGEN',
    category: 'biological',
    severity: 'block',
    allOf: ['synthesi[sz]\\w*|production|assembly', 'pathogen\\w*|virus|virulence|toxin\\w*|bacterium|bacteria'],
  },
  {
    id: 'BIO-GAIN-OF-FUNCTION',
    category: 'biological',
    severity: 'block',
    allOf: ['gain[- ]of[- ]function|increased transmissibility|enhanced virulence|host range expansion'],
  },
  {
    id: 'BIO-SELECT-AGENT-CULTURE',
    category: 'biological',
    severity: 'block',
    allOf: ['cultivat\\w*|culture|fermentation', 'select agent|dangerous pathogen|high consequence pathogen'],
  },
  {
    id: 'BIO-DELIVERY-VEHICLE',
    category: 'biological',
    severity: 'block',
    allOf: ['aerosoli[sz]\\w*|dispersion|delivery vehicle|release protocol', 'pathogen\\w*|toxin\\w*|biological agent'],
  },
  {
    id: 'CHEM-WEAPON-SYNTH',
    category: 'chemical',
    severity: 'block',
    allOf: ['synthesi[sz]\\w*|route|precursor', 'nerve agent|chemical weapon|sarin|novichok|weapons[- ]grade'],
  },
  {
    id: 'CHEM-TOXIN-SCALE',
    category: 'chemical',
    severity: 'block',
    allOf: ['large[- ]scale|industrial scale|mass production', 'toxin\\w*|poison\\w*|lethal compound'],
  },
  {
    id: 'NUC-ENRICH-WEAPON',
    category: 'nuclear',
    severity: 'block',
    allOf: ['enrichment|centrifuge|reprocessing|critical mass', 'uranium|plutonium|weapon[- ]grade|nuclear weapon'],
  },
  {
    id: 'NUC-IMPLOSION-DESIGN',
    category: 'nuclear',
    severity: 'block',
    allOf: ['implosion|detonation|triggering', 'fissile|nuclear weapon|warhead'],
  },
  {
    id: 'CYBER-OFFENSIVE-CHAIN',
    category: 'cyber',
    severity: 'block',
    allOf: ['exploit chain|zero[- ]day|malware|ransomware', 'weaponi[sz]\\w*|mass[- ]target\\w*|deploy against|widespread deployment'],
  },
  {
    id: 'CYBER-INFRA-TARGET',
    category: 'cyber',
    severity: 'block',
    allOf: ['attack\\w*|exploit\\w*|intrusion\\w*', 'critical infrastructure|power grid|hospital|water treatment'],
  },
];

/** Evaluate one rule against candidate text (word-boundary, case-insensitive). */
export function ruleMatches(rule: DualUseRule, text: string): boolean {
  const haystack = text.toLowerCase();
  return rule.allOf.every((source) => {
    const re = new RegExp(`(?:^|[^a-z0-9])${source}(?:[^a-z0-9]|$)`, 'i');
    return re.test(haystack);
  });
}

/** All rules fired by a candidate text (empty = lexically clear). */
export function matchedDualUseRules(text: string): readonly DualUseRule[] {
  return DUAL_USE_RULES.filter((rule) => ruleMatches(rule, text));
}
