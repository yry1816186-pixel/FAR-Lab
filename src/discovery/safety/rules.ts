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

// ─────────────────────────────────────────────────────────────────────────────
// Clinical / person-safety layer (night-r2 S3; directive §2.6 R10 clause).
//
// A SEPARATE rule family from DUAL_USE_RULES: dual-use rules protect third
// parties from ENABLEMENT of harm; the clinical layer protects the READER from
// acting on unvalidated output. Two actions exist:
//   refuse — dosage/prescription-generation or person-harm ingestion requests
//     → the gate holds the candidate fail-closed (SafetyHold, remediation
//     points to a licensed clinician). Deliberately NARROW (§2.6
//     over-blocking policy): "dose-response" methodology text, cohort studies,
//     and animal/lab exposure protocols must keep flowing.
//   advise — clinical/health vocabulary without refusal convergence
//     → NO hold; the run's outputs carry the forced bilingual banner
//     (CLINICAL_ADVISORY_BANNER) instead.
//
// CANNOT-PROVE statement: this clinical screen is a LEXICAL HEURISTIC — it
// cannot identify all clinically-actionable content (paraphrase, non-English
// beyond the pinned Chinese terms, and drug-name-only dosing questions fall
// through to the model layer or pass unflagged) and it cannot substitute for
// regulatory review. The refusal list is deliberately narrow
// (dosage/prescription/person-harm) to avoid over-blocking legitimate
// research; narrowness trades recall for precision by design.
// ─────────────────────────────────────────────────────────────────────────────

/** The action a clinical-safety rule demands of the gate. */
export type ClinicalSafetyAction = 'refuse' | 'advise';

/** Rule families (spec-pinned names). */
export type ClinicalSafetyFamily =
  | 'CLINICAL_DOSAGE_REFUSAL'
  | 'PERSON_HARM_REFUSAL'
  | 'CLINICAL_ADVISORY';

/** One clinical-safety rule; conjunction semantics identical to DualUseRule. */
export interface ClinicalSafetyRule {
  readonly id: string;
  readonly family: ClinicalSafetyFamily;
  readonly category: 'clinical' | 'person-safety';
  readonly action: ClinicalSafetyAction;
  /** Every regex source must match (word-boundary applied by the matcher). */
  readonly allOf: readonly string[];
}

/**
 * Forced bilingual advisory banner (byte-pinned by tests — em-dashes and
 * spacing are load-bearing; do not reformat).
 */
export const CLINICAL_ADVISORY_BANNER =
  '[FAR-Lab] Not medical advice — outputs are unvalidated AI-generated research conjectures; consult a licensed clinician before any health decision. / 非医疗建议——输出为未经人体验证的 AI 生成研究猜想，任何健康决策前请咨询执业医师。';

/**
 * Clinical-safety rule catalog (append-only; ids + families pinned by tests).
 * Conjunction groups, mirroring DUAL_USE_RULES:
 *   CLINICAL-DOSAGE-REFUSAL  = dosage/prescription term × person-directed
 *     intent ("should I/we/a…", "how much", me-directed generation, Chinese
 *     帮我/生成/开具…). Bare "dose-response" methodology text has no intent
 *     side and must NOT fire.
 *   PERSON-HARM-INGESTION    = person-ingestion verb × hazard/concentration
 *     term — fires through benign camouflage skins (the §2.6 astronomy
 *     homework vector). Deliberately excludes inject/inhal/consume stems:
 *     those collide with bench methodology (HPLC injection, animal inhalation
 *     toxicology); disguised person-harm there is the model layer's job.
 *   CLINICAL-ADVISORY        = single disjunction of clinical/epidemiology/
 *     toxicology/psych-intervention vocabulary — advisory only, never a hold.
 */
export const CLINICAL_SAFETY_RULES: readonly ClinicalSafetyRule[] = [
  {
    id: 'CLINICAL-DOSAGE-REFUSAL',
    family: 'CLINICAL_DOSAGE_REFUSAL',
    category: 'clinical',
    action: 'refuse',
    allOf: [
      'dos\\w*|prescri\\w*|剂量|处方|用药|服用',
      'should (?:i|we|a|an|my|someone|one)|how much|how many|for me|for my|(?:write|get|make|send|show|give|tell) me|safe to|safe for|给我|帮我|生成|开具|开一|用量|方法|该吃|吃多少|多少',
    ],
  },
  {
    id: 'PERSON-HARM-INGESTION',
    family: 'PERSON_HARM_REFUSAL',
    category: 'person-safety',
    action: 'refuse',
    allOf: [
      'drink\\w*|drank|ingest\\w*|swallow\\w*|喝|饮用|吞服|吞下|摄入',
      'concentration|isopropanol|isopropyl|methanol|bleach|acetone|toxic\\w*|poison\\w*|lethal|浓度|酒精|有毒|致死',
    ],
  },
  {
    id: 'CLINICAL-ADVISORY',
    family: 'CLINICAL_ADVISORY',
    category: 'clinical',
    action: 'advise',
    allOf: [
      'clinic\\w*|patient\\w*|therap\\w*|treatment\\w*|disease\\w*|syndrome\\w*|toxic\\w*|poison\\w*|epidemiolog\\w*|cohort\\w*|incidence|prevalence|mortality|placebo\\w*|adverse (?:event|effect|reaction)|side[- ]effect\\w*|antidepressant\\w*|antipsychotic\\w*|psychiatric\\w*|患者|临床|治疗|毒性|病人|疗效|药物|心理干预|精神科|抗抑郁',
    ],
  },
];

/** Evaluate one clinical-safety rule (same word-boundary matcher as DualUseRule). */
export function clinicalRuleMatches(rule: ClinicalSafetyRule, text: string): boolean {
  const haystack = text.toLowerCase();
  return rule.allOf.every((source) => {
    const re = new RegExp(`(?:^|[^a-z0-9])${source}(?:[^a-z0-9]|$)`, 'i');
    return re.test(haystack);
  });
}

/** All clinical-safety rules fired by a candidate text (empty = none). */
export function matchedClinicalSafetyRules(text: string): readonly ClinicalSafetyRule[] {
  return CLINICAL_SAFETY_RULES.filter((rule) => clinicalRuleMatches(rule, text));
}
