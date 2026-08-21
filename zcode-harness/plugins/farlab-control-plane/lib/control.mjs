import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN_VERSION = '2.0.0';
export const CONTROL_PROTOCOL_MAJOR = 2;

export function normalizeStatus(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function readJsonDetailed(cwd, rel) {
  const file = path.join(cwd, rel);
  if (!fs.existsSync(file)) return { rel, file, exists: false, value: null, error: null };
  try {
    return { rel, file, exists: true, value: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
  } catch (error) {
    return { rel, file, exists: true, value: null, error: String(error?.message || error) };
  }
}

function arrayFrom(obj, keys) {
  for (const key of keys) {
    if (Array.isArray(obj?.[key])) return obj[key];
  }
  return [];
}

function objectEntriesAsItems(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).map(([id, item]) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) return { id, ...item };
        return { id, status: item };
      });
    }
  }
  return [];
}

function hasEvidenceValue(value) {
  if (Array.isArray(value)) return value.some(hasEvidenceValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasEvidenceValue);
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined && value !== false;
}

export function itemHasEvidence(item) {
  return [
    item?.evidence,
    item?.evidenceRefs,
    item?.evidence_refs,
    item?.proof,
    item?.verification,
    item?.verificationEvidence,
    item?.artifact,
    item?.artifacts
  ].some(hasEvidenceValue);
}

const CLOSED = new Set(['resolved', 'closed', 'done', 'completed', 'complete', 'accepted', 'rejected', 'deferred', 'low_value', 'not_applicable']);
const PASS = new Set(['pass', 'passed', 'ready', 'verified', 'live_verified', 'accepted', 'satisfied', 'complete', 'completed', 'saturated']);
const FAIL = new Set(['failed', 'blocked', 'rejected', 'error', 'invalid']);
const GLOBAL_PAUSE = new Set(['paused', 'waiting_for_user', 'waiting_user', 'blocked_by_external', 'externally_blocked', 'budget_limited']);

function isClosedStatus(value) {
  return CLOSED.has(normalizeStatus(value));
}

function targetReached(item) {
  const status = normalizeStatus(item?.status);
  const target = normalizeStatus(item?.target ?? item?.targetStatus ?? item?.target_status);
  if (!status) return false;
  if (target) return status === target;
  return PASS.has(status);
}

function isFailed(item) {
  return FAIL.has(normalizeStatus(item?.status));
}

function priorityOf(item) {
  return normalizeStatus(item?.priority ?? item?.severity ?? item?.level ?? item?.class);
}

function isCriticalPriority(item) {
  const p = priorityOf(item);
  return ['p0', 'p1', 'critical', 'blocker'].includes(p);
}

function itemId(item, fallback) {
  return String(item?.id ?? item?.key ?? item?.name ?? item?.requirement ?? fallback);
}

export function summarizeAcceptance(cwd) {
  const file = readJsonDetailed(cwd, '.control/ACCEPTANCE_STATUS.json');
  const errors = [];
  if (file.error) errors.push(`ACCEPTANCE_STATUS.json malformed: ${file.error}`);
  if (!file.exists) {
    return {
      exists: false,
      ready: false,
      errors: ['Missing .control/ACCEPTANCE_STATUS.json'],
      totalItems: 0,
      criticalItems: 0,
      incomplete: [],
      missingEvidence: [],
      failed: [],
      failedGates: []
    };
  }
  if (!file.value) {
    return { exists: true, ready: false, errors, totalItems: 0, criticalItems: 0, incomplete: [], missingEvidence: [], failed: [], failedGates: [] };
  }

  const items = arrayFrom(file.value, ['items', 'requirements', 'acceptance', 'criteria']);
  const hasExplicitCritical = items.some(x => typeof x?.critical === 'boolean');
  const hasPriority = items.some(x => priorityOf(x));
  const critical = hasExplicitCritical
    ? items.filter(x => x?.critical === true)
    : hasPriority
      ? items.filter(isCriticalPriority)
      : items.filter(x => x?.required !== false);

  const incomplete = [];
  const missingEvidence = [];
  const failed = [];
  for (let i = 0; i < critical.length; i += 1) {
    const item = critical[i];
    const id = itemId(item, `item-${i + 1}`);
    if (isFailed(item)) failed.push(id);
    if (!targetReached(item)) incomplete.push(id);
    if (targetReached(item) && !itemHasEvidence(item)) missingEvidence.push(id);
  }

  let gates = arrayFrom(file.value, ['gates', 'qualityGates', 'quality_gates']);
  if (!gates.length) gates = objectEntriesAsItems(file.value, ['gates', 'qualityGates', 'quality_gates']);
  const failedGates = gates
    .filter(g => g?.required !== false)
    .filter(g => {
      if (typeof g?.status === 'boolean') return !g.status;
      return !PASS.has(normalizeStatus(g?.status ?? g?.result ?? g?.value));
    })
    .map((g, i) => itemId(g, `gate-${i + 1}`));

  if (!items.length) errors.push('Acceptance file contains no recognized items array.');
  if (items.length && !critical.length) errors.push('Acceptance file contains no recognized critical/required items.');

  return {
    exists: true,
    ready: errors.length === 0 && incomplete.length === 0 && missingEvidence.length === 0 && failed.length === 0 && failedGates.length === 0,
    errors,
    totalItems: items.length,
    criticalItems: critical.length,
    incomplete,
    missingEvidence,
    failed,
    failedGates
  };
}

export function summarizeBlockers(cwd) {
  const file = readJsonDetailed(cwd, '.control/BLOCKERS.json');
  if (!file.exists) return { exists: false, errors: [], open: [], criticalOpen: [] };
  if (file.error) return { exists: true, errors: [`BLOCKERS.json malformed: ${file.error}`], open: [], criticalOpen: [] };
  const items = arrayFrom(file.value, ['items', 'blockers']);
  const openItems = items.filter(x => !isClosedStatus(x?.status));
  return {
    exists: true,
    errors: [],
    open: openItems.map((x, i) => itemId(x, `blocker-${i + 1}`)),
    criticalOpen: openItems.filter(x => x?.critical === true || isCriticalPriority(x)).map((x, i) => itemId(x, `blocker-${i + 1}`))
  };
}

export function summarizeCriticalProblems(cwd) {
  const file = readJsonDetailed(cwd, '.control/EXECUTION_STATE.json');
  if (!file.exists) return { exists: false, errors: [], open: [], p0p1: [], nextAction: null, missionActive: false, globallyPausedOrBlocked: false, state: null };
  if (file.error) return { exists: true, errors: [`EXECUTION_STATE.json malformed: ${file.error}`], open: [], p0p1: [], nextAction: null, missionActive: false, globallyPausedOrBlocked: false, state: null };
  const state = file.value || {};
  const items = arrayFrom(state, ['criticalProblemSet', 'criticalProblems', 'critical_problem_set']);
  const openItems = items.filter(x => !isClosedStatus(x?.status));
  const explicitMission = state?.missionActive === true
    || state?.mission?.active === true
    || normalizeStatus(state?.stopGuard) === 'strict'
    || (normalizeStatus(state?.mode) === 'mission' && !GLOBAL_PAUSE.has(normalizeStatus(state?.mission?.status ?? state?.status)));
  const globalStatus = normalizeStatus(state?.mission?.status ?? state?.status);
  return {
    exists: true,
    errors: [],
    open: openItems.map((x, i) => itemId(x, `problem-${i + 1}`)),
    p0p1: openItems.filter(x => x?.critical === true || isCriticalPriority(x)).map((x, i) => itemId(x, `problem-${i + 1}`)),
    nextAction: state?.nextAction ?? state?.next_action ?? state?.mission?.nextAction ?? null,
    missionActive: explicitMission,
    globallyPausedOrBlocked: GLOBAL_PAUSE.has(globalStatus),
    state
  };
}

function protocolMajor(value) {
  const match = String(value ?? '').match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

export function summarizeProtocol(cwd) {
  const protocol = readJsonDetailed(cwd, '.control/CONTROL_PROTOCOL.json');
  const execution = readJsonDetailed(cwd, '.control/EXECUTION_STATE.json');
  const errors = [];
  if (protocol.error) errors.push(`CONTROL_PROTOCOL.json malformed: ${protocol.error}`);
  const version = protocol.value?.version
    ?? protocol.value?.controlProtocolVersion
    ?? execution.value?.controlProtocolVersion
    ?? execution.value?.protocolVersion
    ?? null;
  const major = protocolMajor(version);
  let compatibility = 'legacy_compatible';
  if (major === CONTROL_PROTOCOL_MAJOR) compatibility = 'compatible';
  else if (major !== null && major > CONTROL_PROTOCOL_MAJOR) compatibility = 'newer_unverified';
  else if (major !== null && major < CONTROL_PROTOCOL_MAJOR) compatibility = 'older_compatible';
  return { exists: protocol.exists, version, major, compatibility, errors };
}

function unresolvedOpportunity(item) {
  const status = normalizeStatus(item?.status);
  return !['resolved', 'completed', 'complete', 'rejected', 'deferred', 'low_value', 'blocked', 'not_applicable'].includes(status);
}

export function summarizeFrontier(cwd) {
  const file = readJsonDetailed(cwd, '.control/FRONTIER_STATUS.json');
  const errors = [];
  if (!file.exists) {
    return {
      exists: false,
      ready: false,
      errors: ['Missing .control/FRONTIER_STATUS.json (or equivalent canonical frontier record).'],
      dimensions: 0,
      incompleteDimensions: [],
      missingDimensionEvidence: [],
      independentAuditReady: false,
      opportunitySweepReady: false,
      unresolvedOpportunities: [],
      marginalValueReady: false
    };
  }
  if (file.error) errors.push(`FRONTIER_STATUS.json malformed: ${file.error}`);
  if (!file.value) return { exists: true, ready: false, errors, dimensions: 0, incompleteDimensions: [], missingDimensionEvidence: [], independentAuditReady: false, opportunitySweepReady: false, unresolvedOpportunities: [], marginalValueReady: false };

  let dimensions = arrayFrom(file.value, ['dimensions', 'frontierDimensions', 'frontier_dimensions']);
  if (!dimensions.length) dimensions = objectEntriesAsItems(file.value, ['dimensions', 'frontierDimensions', 'frontier_dimensions']);
  const required = dimensions.filter(x => x?.required !== false);
  const incompleteDimensions = required.filter(x => !targetReached(x)).map((x, i) => itemId(x, `dimension-${i + 1}`));
  const missingDimensionEvidence = required.filter(x => targetReached(x) && !itemHasEvidence(x)).map((x, i) => itemId(x, `dimension-${i + 1}`));

  const audit = file.value?.independentAudit ?? file.value?.independent_audit ?? {};
  const independentAuditReady = PASS.has(normalizeStatus(audit?.status ?? audit?.result)) && itemHasEvidence(audit);

  const sweep = file.value?.opportunitySweep ?? file.value?.frontierOpportunitySweep ?? file.value?.opportunity_sweep ?? {};
  const opportunities = arrayFrom(sweep, ['highValueOpportunities', 'opportunities', 'high_value_opportunities']);
  const unresolvedOpportunities = opportunities.filter(unresolvedOpportunity).map((x, i) => itemId(x, `opportunity-${i + 1}`));
  const sweepStatus = normalizeStatus(sweep?.status);
  const opportunitySweepReady = PASS.has(sweepStatus) && sweep?.decisionSaturation === true && itemHasEvidence(sweep) && unresolvedOpportunities.length === 0;

  const mv = file.value?.marginalValue ?? file.value?.marginal_value ?? {};
  const remaining = arrayFrom(mv, ['remainingHighValueWork', 'remaining', 'remaining_high_value_work']);
  const unresolvedRemaining = remaining.filter(unresolvedOpportunity);
  const marginalValueReady = PASS.has(normalizeStatus(mv?.status)) && unresolvedRemaining.length === 0 && (itemHasEvidence(mv) || String(mv?.reason ?? '').trim().length > 0);

  if (!dimensions.length) errors.push('Frontier record contains no recognized dimensions.');
  if (dimensions.length && !required.length) errors.push('Frontier record contains no required dimensions.');

  return {
    exists: true,
    ready: errors.length === 0
      && incompleteDimensions.length === 0
      && missingDimensionEvidence.length === 0
      && independentAuditReady
      && opportunitySweepReady
      && marginalValueReady,
    errors,
    dimensions: dimensions.length,
    incompleteDimensions,
    missingDimensionEvidence,
    independentAuditReady,
    opportunitySweepReady,
    unresolvedOpportunities,
    marginalValueReady
  };
}

export function summarizeWorkspace(cwd, { requireFrontier = true } = {}) {
  const acceptance = summarizeAcceptance(cwd);
  const blockers = summarizeBlockers(cwd);
  const problems = summarizeCriticalProblems(cwd);
  const frontier = requireFrontier ? summarizeFrontier(cwd) : null;
  const protocol = summarizeProtocol(cwd);
  const acceptanceFloorReady = acceptance.ready
    && blockers.errors.length === 0
    && problems.errors.length === 0
    && blockers.criticalOpen.length === 0
    && problems.p0p1.length === 0;
  const missionReady = acceptanceFloorReady && (!requireFrontier || frontier?.ready === true);
  return { acceptance, blockers, problems, frontier, protocol, acceptanceFloorReady, missionReady };
}

export function hasCompletionClaim(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text.trim()) return false;
  const patterns = [
    /\bmission\s+(?:is\s+)?complete\b/,
    /\bproject\s+(?:is\s+)?complete\b/,
    /\bfully\s+(?:done|complete|finished|delivered)\b/,
    /\bcompletion\s+gate\s+(?:has\s+)?passed\b/,
    /\bfrontier\s+gate\s+(?:has\s+)?passed\b/,
    /\bready\s+for\s+(?:final\s+)?release\b/,
    /任务.{0,8}(?:完成|结束)/,
    /项目.{0,8}(?:完成|全部完成|彻底完成)/,
    /已经.{0,6}(?:全部完成|彻底完成|最终完成)/,
    /可以.{0,6}(?:宣布完成|结束任务)/,
    /正式施工.{0,8}(?:完成|结束)/
  ];
  return patterns.some(re => re.test(text));
}

export function compactGateReason(summary, { requireFrontier = true } = {}) {
  const parts = [];
  const a = summary.acceptance;
  if (!a.ready) {
    if (a.errors.length) parts.push(`acceptance errors=${a.errors.slice(0, 2).join(' | ')}`);
    if (a.incomplete.length) parts.push(`acceptance incomplete=${a.incomplete.slice(0, 5).join(',')}`);
    if (a.missingEvidence.length) parts.push(`acceptance missing evidence=${a.missingEvidence.slice(0, 5).join(',')}`);
    if (a.failed.length) parts.push(`acceptance failed/blocked=${a.failed.slice(0, 5).join(',')}`);
    if (a.failedGates.length) parts.push(`acceptance gates=${a.failedGates.slice(0, 5).join(',')}`);
  }
  if (summary.blockers.criticalOpen.length) parts.push(`critical blockers=${summary.blockers.criticalOpen.slice(0, 5).join(',')}`);
  if (summary.problems.p0p1.length) parts.push(`P0/P1=${summary.problems.p0p1.slice(0, 5).join(',')}`);
  if (requireFrontier && summary.frontier && !summary.frontier.ready) {
    const f = summary.frontier;
    if (f.errors.length) parts.push(`frontier errors=${f.errors.slice(0, 2).join(' | ')}`);
    if (f.incompleteDimensions.length) parts.push(`frontier incomplete=${f.incompleteDimensions.slice(0, 5).join(',')}`);
    if (f.missingDimensionEvidence.length) parts.push(`frontier missing evidence=${f.missingDimensionEvidence.slice(0, 5).join(',')}`);
    if (!f.independentAuditReady) parts.push('independent audit not verified');
    if (!f.opportunitySweepReady) parts.push('frontier opportunity sweep not saturated');
    if (f.unresolvedOpportunities.length) parts.push(`high-value opportunities=${f.unresolvedOpportunities.slice(0, 5).join(',')}`);
    if (!f.marginalValueReady) parts.push('marginal-value gate not satisfied');
  }
  if (summary.problems.nextAction) parts.push(`nextAction=${String(summary.problems.nextAction).slice(0, 300)}`);
  return parts.join('; ') || 'required completion evidence is not yet ready';
}
