import { readFileSync, writeFileSync } from 'node:fs';

function edit(path, replacements) {
  let source = readFileSync(path, 'utf8');
  let changes = 0;
  for (const [from, to] of replacements) {
    if (source.includes(from)) {
      source = source.replaceAll(from, to);
      changes += 1;
    } else if (!source.includes(to)) {
      throw new Error(`${path}: expected source fragment not found: ${from.slice(0, 120)}`);
    }
  }
  writeFileSync(path, source);
  console.log(`${path}: ${changes} replacement groups applied`);
}

edit('frontend/src/App.tsx', [
  ["import { I18nProvider, useI18n } from '@/lib/i18n';", "import { I18nProvider, useI18n, useT } from '@/lib/i18n';"],
  ["function RouteFallback() {\n  return (", "function RouteFallback() {\n  const t = useT();\n  return ("],
  ['aria-label="Loading page"', "aria-label={t('app.loadingPage')}"],
]);

edit('frontend/src/components/EvidenceTimeline.tsx', [
  ["import { cn } from '@/lib/utils';", "import { cn } from '@/lib/utils';\nimport { useT } from '@/lib/i18n';"],
  ["function SourceCard({ sourceAnchor }: { sourceAnchor: SourceAnchorSafe }) {\n  return (", "function SourceCard({ sourceAnchor }: { sourceAnchor: SourceAnchorSafe }) {\n  const t = useT();\n  return ("],
  ['Source Anchor', "{t('ev.sourceTitle')}"],
  ['>Commit:</span>', ">{t('ev.commit')}</span>"],
  ['>Time:</span>', ">{t('ev.time')}</span>"],
  ['>Request ID:</span>', ">{t('ev.requestId')}</span>"],
  ['>credentials missing (null)</span>', ">{t('ev.credentialMissing')}</span>"],
  ['>Response hash:</span>', ">{t('ev.responseHash')}</span>"],
  ['>DOI/arXiv:</span>', ">{t('ev.doi')}</span>"],
  ['>Code:</span>', ">{t('ev.code')}</span>"],
  ["function HashChainReplay({ prevHash, currentHash }: { prevHash: string; currentHash: string }) {\n  const isGenesis", "function HashChainReplay({ prevHash, currentHash }: { prevHash: string; currentHash: string }) {\n  const t = useT();\n  const isGenesis"],
  ['Hash Chain Replay', "{t('ev.chainTitle')}"],
  ["{isGenesis ? 'Genesis hash' : 'Previous hash (prevHash)'}", "{isGenesis ? t('ev.genesis') : t('ev.prevHash')}"],
  ["{isGenesis ? '0×64 (GENESIS)' : truncateHash(prevHash)}", "{isGenesis ? t('ev.genesisValue') : truncateHash(prevHash)}"],
  ['>Current hash (currentHash)</span>', ">{t('ev.currentHash')}</span>"],
  ['Verification: sha256(prevHash ‖ payload) = currentHash. Chain integrity guarantees the evidence was not tampered with.', "{t('ev.chainVerify')}"],
  ["export function DecisionTracePanel({ trace }: { trace: DecisionTraceSafe }) {\n  const gate", "export function DecisionTracePanel({ trace }: { trace: DecisionTraceSafe }) {\n  const t = useT();\n  const gate"],
  ['Decision Trace', "{t('evidence.decisionTrace')}"],
  ['fired: {trace.firedRuleId}', "{t('evidence.firedRule', { id: trace.firedRuleId })}"],
  ['>R7 gate</span>', ">{t('evidence.r7Gate')}</span>"],
  ['ALL PASS', "{t('evidence.allPass')}"],
  ['BLOCKED', "{t('evidence.blocked')}"],
  ["{passed ? 'PASS' : 'FAIL'}", "{passed ? t('evidence.pass') : t('evidence.fail')}"],
  ['>Key metrics</span>', ">{t('evidence.keyMetrics')}</span>"],
  ["function FalsificationSpecSummary({ item }: { item: HonestVerdictDto }) {  const semanticsLabel", "function FalsificationSpecSummary({ item }: { item: HonestVerdictDto }) {\n  const t = useT();\n  const semanticsLabel"],
  ['>Falsifiable claim:</span>', ">{t('ev.falsAssertion')}</span>"],
  ["function TimelineEntry({ item, isExpanded, onToggle }: TimelineEntryProps) {\n  const config", "function TimelineEntry({ item, isExpanded, onToggle }: TimelineEntryProps) {\n  const t = useT();\n  const config"],
  ['aria-label={`Verdict ${item.verdictId} - ${config.label}`}', "aria-label={t('ev.entryAria', { id: item.verdictId, label: config.label })}"],
  ["aria-label={isExpanded ? 'Collapse details' : 'Expand details'}", "aria-label={isExpanded ? t('ev.collapseAria') : t('ev.expandAria')}"],
  ['>Node type</span>', ">{t('ev.nodeKind')}</span>"],
  ['>Metric value</span>', ">{t('ev.metricValue')}</span>"],
  ['>Conflicting evidence</span>', ">{t('ev.conflicts')}</span>"],
  ['>Created at</span>', ">{t('ev.createdAt')}</span>"],
  ['No parseable source anchor', "{t('ev.sourceEmpty')}"],
  ['>Scope degradation note:</span>', ">{t('evidence.scopeDegradation')}</span>"],
  ['>Untested reason:</span>', ">{t('ev.untestedLabel')}</span>"],
  ['sourceAnchor data unavailable', "{t('ev.sourceUnavailable')}"],
  ["export function EvidenceTimeline({ items, expandedIds, onToggleExpand }: EvidenceTimelineProps) {\n  if (items.length", "export function EvidenceTimeline({ items, expandedIds, onToggleExpand }: EvidenceTimelineProps) {\n  const t = useT();\n  if (items.length"],
  ['<p>No timeline entries yet</p>', "<p>{t('ev.empty')}</p>"],
  ['>End of evidence chain</span>', ">{t('ev.chainEnd')}</span>"],
]);

edit('frontend/src/pages/ResearchWorkbenchPage.tsx', [
  ["function HypothesisTable({ run }: { readonly run: ResearchRunDto }) {\n  return (", "function HypothesisTable({ run }: { readonly run: ResearchRunDto }) {\n  const t = useT();\n  return ("],
  ['>Hypothesis</th>', ">{t('research.hypothesis')}</th>"],
  ['>Deterministic grades</th>', ">{t('research.deterministicGrades')}</th>"],
  ['>Model grades</th>', ">{t('research.modelGrades')}</th>"],
  ['>Citations</th>', ">{t('research.citations')}</th>"],
  ['>Status</th>', ">{t('research.status')}</th>"],
  ['<div>supporting: {h.supportingCitations.length}</div>', "<div>{t('research.supporting')}: {h.supportingCitations.length}</div>"],
  ['<div>counter: {h.counterEvidenceCitations.length}</div>', "<div>{t('research.counter')}: {h.counterEvidenceCitations.length}</div>"],
  ['<div className="text-destructive">unbound: {binding.unbound.length}</div>', "<div className=\"text-destructive\">{t('research.unbound')}: {binding.unbound.length}</div>"],
  ['<Badge data-testid="primary-badge">PRIMARY</Badge>', "<Badge data-testid=\"primary-badge\">{t('research.primary')}</Badge>"],
  ['>Pareto\n                    </Badge>', ">{t('research.pareto')}\n                    </Badge>"],
  ["function PlanSection({ run }: { readonly run: ResearchRunDto }) {\n  const p", "function PlanSection({ run }: { readonly run: ResearchRunDto }) {\n  const t = useT();\n  const p"],
  ['>Objectives: </span>', ">{t('research.objectives')}: </span>"],
  ['>Design: </span>', ">{t('research.design')}: </span>"],
  ['>Analysis DAG: </span>', ">{t('research.analysisDag')}: </span>"],
  ["'(none)'", "`(${t('research.none')})`"],
  ['>Statistical methods: </span>', ">{t('research.statisticalMethods')}: </span>"],
  ['>Stopping conditions: </span>', ">{t('research.stoppingConditions')}: </span>"],
  ['>Human approval required: </span>', ">{t('research.humanApprovalRequired')}: </span>"],
]);
