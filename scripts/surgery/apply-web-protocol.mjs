#!/usr/bin/env node
/**
 * Anchored insertion patch for the web protocol surface (web slice 2,
 * 2026-08-29): StudyMap.tsx (import + state + fetch + band), dict.ts
 * (zh/en map.protocol.* keys), lab.css (band styles). Fail-loud unique
 * anchors; idempotent re-runs. Anchors are chosen as pure-JS lines that
 * survive generic/JSX-stripping remote reads verbatim.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const fail = (msg) => {
  console.error(`[surgery:web] ${msg}`);
  process.exit(1);
};

/** Split into lines; splice after/before/replace the unique matching line. */
const patchLines = (path, ops) => {
  let src = readFileSync(path, 'utf8');
  for (const op of ops) {
    if (op.done !== undefined && src.includes(op.done)) continue;
    const L = src.split('\n');
    const hits = L.map((l, i) => (op.match(l) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) {
      fail(`${path}: anchor for '${op.what}' matched ${hits.length} lines (need exactly 1)`);
    }
    if (op.where === 'replace') L.splice(hits[0], 1, ...op.lines);
    else L.splice(hits[0] + (op.where === 'before' ? 0 : 1), 0, ...op.lines);
    src = L.join('\n');
  }
  writeFileSync(path, src);
};

// ---------------------------------------------------------------------------
// StudyMap.tsx — import, state, fetch reset, fetch, band
// ---------------------------------------------------------------------------
const STUDYMAP = 'web/src/lab/StudyMap.tsx';
if (readFileSync(STUDYMAP, 'utf8').includes("import { ProtocolPanel } from './ProtocolPanel';")) {
  console.log('[surgery:web] StudyMap already patched — nothing to do');
} else {
  patchLines(STUDYMAP, [
    {
      what: 'ClaimInspector import',
      done: "import { ProtocolPanel } from './ProtocolPanel';",
      match: (l) => l.includes("import { ClaimInspector } from './ClaimInspector';"),
      where: 'after',
      lines: [
        "import { ProtocolPanel } from './ProtocolPanel';",
        "import { getProtocolState, type ProtocolStateView } from '../api/protocol';",
      ],
    },
    {
      what: 'spineUnavailable state line',
      done: 'const [protocol, setProtocol] = useState<ProtocolStateView | null>(null);',
      match: (l) => l.includes('const [spineUnavailable, setSpineUnavailable] = useState(false);'),
      where: 'after',
      lines: [
        '  // Protocol plane (web slice): frozen preregistration + human-attested',
        '  // ledger. A 404 is the common case (computational plan) — band absent.',
        '  const [protocol, setProtocol] = useState<ProtocolStateView | null>(null);',
        '  const [protocolError, setProtocolError] = useState<ApiError | null>(null);',
      ],
    },
    {
      what: 'run-switch effect line',
      done: 'setProtocol(null); setProtocolError(null); loadScience(run.id); }, [run.id, run.status, loadScience]);',
      match: (l) => l.includes('useEffect(() => { setInsp(null); setLoadError(null); setSpineUnavailable(false); loadScience(run.id); }, [run.id, run.status, loadScience]);'),
      where: 'replace',
      lines: [
        '  useEffect(() => { setInsp(null); setLoadError(null); setSpineUnavailable(false); setProtocol(null); setProtocolError(null); loadScience(run.id); }, [run.id, run.status, loadScience]);',
      ],
    },
    {
      what: 'getScience fetch line',
      done: 'void getProtocolState(rid, c.signal)',
      match: (l) => l.includes('void getScience(rid, c.signal)'),
      where: 'before',
      lines: [
        '    // Protocol projection (web slice): read-only view over the frozen',
        '    // preregistration + ledger. 404 = no protocol registered for this run',
        '    // (the plan ran computationally) — the band simply does not render.',
        '    void getProtocolState(rid, c.signal)',
        '      .then(setProtocol)',
        '      .catch((e: unknown) => {',
        '        if (e instanceof ApiError && e.status === 404) return;',
        "        setProtocolError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));",
        '      });',
      ],
    },
  ]);

  // Band insertion: before the <section> that opens the verdict fallback.
  // The verdict h2 line is pure-text findable; walk up (bounded) to its section.
  const L = readFileSync(STUDYMAP, 'utf8').split('\n');
  const verdictHits = L.map((l, i) => (l.includes("t('map.verdictLabel')") ? i : -1)).filter((i) => i >= 0);
  if (verdictHits.length !== 1) {
    fail(`StudyMap: verdict label matched ${verdictHits.length} lines (need exactly 1)`);
  }
  let sectionIdx = -1;
  for (let i = verdictHits[0]; i >= Math.max(0, verdictHits[0] - 6); i -= 1) {
    if (L[i].trim().startsWith('<section')) { sectionIdx = i; break; }
  }
  if (sectionIdx === -1) {
    fail('StudyMap: no <section opening within 6 lines above the verdict label');
  }
  L.splice(sectionIdx, 0,
    '        {(protocol !== null || protocolError !== null) && (',
    '          <ProtocolPanel',
    '            runId={run.id}',
    '            state={protocol}',
    '            fetchError={protocolError}',
    '            onMutated={() => { onMutated(); loadScience(run.id); }}',
    '          />',
    '        )}',
    '',
  );
  writeFileSync(STUDYMAP, L.join('\n'));
  console.log('[surgery:web] StudyMap patched: protocol band mounted before verdict fallback');
}

// ---------------------------------------------------------------------------
// dict.ts — zh/en map.protocol.* keys (DictKey must be keyof typeof zh)
// ---------------------------------------------------------------------------
const DICT = 'web/src/i18n/dict.ts';
const dictSrc = readFileSync(DICT, 'utf8');
const ZH_DONE = "'map.protocol.title': '研究协议";
const EN_DONE = "'map.protocol.title': 'Research protocol";
if (dictSrc.includes(ZH_DONE) && dictSrc.includes(EN_DONE)) {
  console.log('[surgery:web] dict already has map.protocol.* keys in both languages');
} else {
  if (!/^export type DictKey\b[^\n]*keyof typeof zh/m.test(dictSrc)) {
    fail('dict.ts: DictKey is not `keyof typeof zh` — protocol keys would not typecheck; inspect dict.ts head and adapt');
  }
  const ZH = [
    "  // Protocol band (web slice 2026-08-29) — paradigm-honest execution surface",
    "  'map.protocol.title': '研究协议（人工执行台账）',",
    "  'map.protocol.honesty': '此协议由人执行、由人背书——软件不执行、不代填、不推断。',",
    "  'map.protocol.paradigmLabel': '范式',",
    "  'map.protocol.planFrozen': '冻结于计划 {hash}',",
    "  'map.protocol.objective': '目标',",
    "  'map.protocol.setting': '执行场景',",
    "  'map.protocol.arms': '分组臂',",
    "  'map.protocol.armControl': '对照',",
    "  'map.protocol.sampling': '抽样',",
    "  'map.protocol.samplingDetail': '{n} {unit} · 盲法 {blinding}',",
    "  'map.protocol.allocation': '分配序列（种子 {seed}，确定性，不可重随机）',",
    "  'map.protocol.allocationNone': '非随机分配：{why}',",
    "  'map.protocol.ethics': '伦理',",
    "  'map.protocol.ethicsConsent': '需知情同意',",
    "  'map.protocol.ethicsPending': '伦理审批未记录——执行记录已封闭（fail-closed）。先录入审批，解锁后续记录。',",
    "  'map.protocol.draftNotes': '起草披露',",
    "  'map.protocol.actor': '记录人',",
    "  'map.protocol.actorPlaceholder': '姓名/工号（必填，随每条记录存档）',",
    "  'map.protocol.steps': '步骤台账',",
    "  'map.protocol.stepStart': '开始',",
    "  'map.protocol.stepComplete': '完成',",
    "  'map.protocol.stepDeps': '依赖：{deps}',",
    "  'map.protocol.stepDuration': '约 {value} {unit}',",
    "  'map.protocol.measures': '测量记录',",
    "  'map.protocol.measureVar': '变量',",
    "  'map.protocol.measureValue': '值',",
    "  'map.protocol.measureTimepoint': '时间点',",
    "  'map.protocol.measureSubmit': '记录测量',",
    "  'map.protocol.measureQcFail': 'QC 未过',",
    "  'map.protocol.measureQcDetail': '原因：{detail}',",
    "  'map.protocol.measureEmpty': '尚无测量记录',",
    "  'map.protocol.measureInputEmpty': '值不能为空',",
    "  'map.protocol.measureInputNotNumeric': '数值型变量需要合法数字',",
    "  'map.protocol.collectionForm': '采集表（预注册派生）',",
    "  'map.protocol.deviations': '偏差登记',",
    "  'map.protocol.deviate': '登记偏差',",
    "  'map.protocol.devWhat': '发生了什么',",
    "  'map.protocol.devWhy': '为什么',",
    "  'map.protocol.devConsequence': '后果',",
    "  'map.protocol.devSubmit': '写入台账',",
    "  'map.protocol.block': '暂停',",
    "  'map.protocol.unblock': '恢复',",
    "  'map.protocol.abort': '中止',",
    "  'map.protocol.abortConfirm': '确认中止？终态后不可再记录。',",
    "  'map.protocol.outcomePublished': '结果已作为实验反馈进入修订环',",
    "  'map.protocol.terminalNote': '台账已终态（{status}），只读。',",
    "  'map.protocol.fetchError': '协议视图加载失败',",
    "  'map.protocol.approvalBodyLabel': '审批机构',",
    "  'map.protocol.approvalIdLabel': '批号',",
    "  'map.protocol.approvedByLabel': '批准人',",
    "  'map.protocol.approveSubmit': '录入审批',",
    "  'map.protocol.approvedOn': '已审批：{body} · {id}',",
    "  'map.protocol.confirm.human_signed': '人工签字确认',",
    "  'map.protocol.confirm.instrument_record': '仪器记录确认',",
    "  'map.protocol.confirm.photo': '照片确认',",
    "  'map.protocol.confirm.witness': '见证人确认',",
    "  'map.protocol.confirm.none': '无需确认',",
    "  'map.protocol.paradigm.bench': '实验台（湿实验/材料/化学）',",
    "  'map.protocol.paradigm.field': '现场（观测/部署/生态）',",
    "  'map.protocol.paradigm.human_subjects': '人类被试（调查/临床/心理）',",
    "  'map.protocol.paradigm.engineering': '工程（装置/样机/硬件）',",
    "  'map.protocol.paradigm.theory': '理论（推导/证明/形式分析）',",
    "  'map.protocol.paradigm.archive': '档案（登记库/标本/记录）',",
    "  'map.protocol.paradigm.mixed': '混合',",
    "  'map.protocol.status.awaiting_approval': '等待伦理审批',",
    "  'map.protocol.status.awaiting_human': '等待人工执行',",
    "  'map.protocol.status.in_progress': '执行中',",
    "  'map.protocol.status.paused': '已暂停',",
    "  'map.protocol.status.completed': '已完成',",
    "  'map.protocol.status.aborted': '已中止',",
  ];
  const EN = [
    "  // Protocol band (web slice 2026-08-29) — paradigm-honest execution surface",
    "  'map.protocol.title': 'Research protocol (human-attested execution)',",
    "  'map.protocol.honesty': 'Executed and attested by humans — the software never executes, fills in, or infers.',",
    "  'map.protocol.paradigmLabel': 'Paradigm',",
    "  'map.protocol.planFrozen': 'Frozen to plan {hash}',",
    "  'map.protocol.objective': 'Objective',",
    "  'map.protocol.setting': 'Setting',",
    "  'map.protocol.arms': 'Arms',",
    "  'map.protocol.armControl': 'control',",
    "  'map.protocol.sampling': 'Sampling',",
    "  'map.protocol.samplingDetail': '{n} {unit} · blinding {blinding}',",
    "  'map.protocol.allocation': 'Allocation sequence (seed {seed}, deterministic, never re-randomized)',",
    "  'map.protocol.allocationNone': 'Non-randomized: {why}',",
    "  'map.protocol.ethics': 'Ethics',",
    "  'map.protocol.ethicsConsent': 'consent required',",
    "  'map.protocol.ethicsApprovalBody': 'approval body',",
    "  'map.protocol.ethicsPending': 'No approval recorded — execution records are closed (fail-closed). Record the approval first to unlock.',",
    "  'map.protocol.draftNotes': 'Draft disclosures',",
    "  'map.protocol.actor': 'Recorder',",
    "  'map.protocol.actorPlaceholder': 'name or id (required, archived with every record)',",
    "  'map.protocol.steps': 'Step ledger',",
    "  'map.protocol.stepStart': 'Start',",
    "  'map.protocol.stepComplete': 'Complete',",
    "  'map.protocol.stepDeps': 'Depends on: {deps}',",
    "  'map.protocol.stepDuration': '~{value} {unit}',",
    "  'map.protocol.measures': 'Measurements',",
    "  'map.protocol.measureVar': 'Variable',",
    "  'map.protocol.measureValue': 'Value',",
    "  'map.protocol.measureTimepoint': 'Timepoint',",
    "  'map.protocol.measureSubmit': 'Record measurement',",
    "  'map.protocol.measureQcFail': 'QC failed',",
    "  'map.protocol.measureQcDetail': 'Reason: {detail}',",
    "  'map.protocol.measureEmpty': 'No measurements recorded yet',",
    "  'map.protocol.measureInputEmpty': 'value must not be empty',",
    "  'map.protocol.measureInputNotNumeric': 'numeric variables need a valid number',",
    "  'map.protocol.collectionForm': 'Collection form (preregistration-derived)',",
    "  'map.protocol.deviations': 'Deviations',",
    "  'map.protocol.deviate': 'Log deviation',",
    "  'map.protocol.devWhat': 'What happened',",
    "  'map.protocol.devWhy': 'Why',",
    "  'map.protocol.devConsequence': 'Consequence',",
    "  'map.protocol.devSubmit': 'Write to ledger',",
    "  'map.protocol.block': 'Pause',",
    "  'map.protocol.unblock': 'Resume',",
    "  'map.protocol.abort': 'Abort',",
    "  'map.protocol.abortConfirm': 'Abort? Terminal — no further records accepted.',",
    "  'map.protocol.outcomePublished': 'Outcome published as experiment feedback into the revision loop',",
    "  'map.protocol.terminalNote': 'Ledger is terminal ({status}), read-only.',",
    "  'map.protocol.fetchError': 'Protocol view failed to load',",
    "  'map.protocol.approvalBodyLabel': 'Approval body',",
    "  'map.protocol.approvalIdLabel': 'Approval id',",
    "  'map.protocol.approvedByLabel': 'Approved by',",
    "  'map.protocol.approveSubmit': 'Record approval',",
    "  'map.protocol.approvedOn': 'Approved: {body} · {id}',",
    "  'map.protocol.confirm.human_signed': 'human-signed confirmation',",
    "  'map.protocol.confirm.instrument_record': 'instrument-record confirmation',",
    "  'map.protocol.confirm.photo': 'photo confirmation',",
    "  'map.protocol.confirm.witness': 'witness confirmation',",
    "  'map.protocol.confirm.none': 'no confirmation required',",
    "  'map.protocol.paradigm.bench': 'Bench (wet lab / materials / chemistry)',",
    "  'map.protocol.paradigm.field': 'Field (observation / deployment / ecology)',",
    "  'map.protocol.paradigm.human_subjects': 'Human subjects (survey / clinical / psychological)',",
    "  'map.protocol.paradigm.engineering': 'Engineering (rigs / prototypes / hardware)',",
    "  'map.protocol.paradigm.theory': 'Theory (derivations / proofs / formal analysis)',",
    "  'map.protocol.paradigm.archive': 'Archive (registries / specimens / records)',",
    "  'map.protocol.paradigm.mixed': 'Mixed',",
    "  'map.protocol.status.awaiting_approval': 'Awaiting ethics approval',",
    "  'map.protocol.status.awaiting_human': 'Awaiting human execution',",
    "  'map.protocol.status.in_progress': 'In progress',",
    "  'map.protocol.status.paused': 'Paused',",
    "  'map.protocol.status.completed': 'Completed',",
    "  'map.protocol.status.aborted': 'Aborted',",
  ];
  patchLines(DICT, [
    {
      what: 'zh object opener',
      done: ZH_DONE,
      match: (l) => /^export const zh\b.*\{\s*$/.test(l),
      where: 'after',
      lines: ZH,
    },
    {
      what: 'en object opener',
      done: EN_DONE,
      match: (l) => /^export const en\b.*\{\s*$/.test(l),
      where: 'after',
      lines: EN,
    },
  ]);
  console.log('[surgery:web] dict.ts: map.protocol.* keys added to zh + en');
}

// ---------------------------------------------------------------------------
// lab.css — append band styles (append-only, no anchor)
// ---------------------------------------------------------------------------
const CSS = 'web/src/lab/lab.css';
let css = readFileSync(CSS, 'utf8');
if (css.includes('.map-protocol-band')) {
  console.log('[surgery:web] lab.css already has protocol styles');
} else {
  css += `\n/* ---- Protocol band (web slice 2026-08-29): paradigm-honest execution ---- */
.map-protocol-band {
  margin: 18px 0;
  padding: 16px 18px;
  border: 1px solid rgba(125, 125, 125, 0.35);
  border-radius: 10px;
  background: rgba(125, 125, 125, 0.06);
}
.map-protocol-band > header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.map-protocol-band h2 { margin: 0; font-size: 1.02rem; }
.map-protocol-chip {
  font-size: 0.78rem;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(125, 125, 125, 0.4);
  opacity: 0.9;
}
.map-protocol-honesty { font-size: 0.8rem; opacity: 0.75; margin: 2px 0 10px; }
.map-protocol-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px 18px; font-size: 0.86rem; margin-bottom: 12px; }
.map-protocol-grid dt { opacity: 0.65; }
.map-protocol-grid dd { margin: 0; }
.map-protocol-steps { list-style: none; margin: 8px 0 14px; padding: 0; display: grid; gap: 8px; }
.map-protocol-step { padding: 8px 10px; border: 1px solid rgba(125, 125, 125, 0.28); border-radius: 8px; }
.map-protocol-step.is-done { opacity: 0.72; }
.map-protocol-step.is-in_progress { border-color: rgba(70, 130, 200, 0.6); }
.map-protocol-step-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 0.85rem; }
.map-protocol-step-action { font-size: 0.84rem; margin: 4px 0 6px; }
.map-protocol-meta { font-size: 0.76rem; opacity: 0.7; }
.map-protocol-form { display: grid; gap: 6px; padding: 10px; border: 1px dashed rgba(125, 125, 125, 0.35); border-radius: 8px; margin: 8px 0; font-size: 0.85rem; }
.map-protocol-form label { display: grid; gap: 2px; font-size: 0.78rem; opacity: 0.85; }
.map-protocol-form input, .map-protocol-form select, .map-protocol-form textarea {
  font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(125, 125, 125, 0.4);
  background: transparent; color: inherit;
}
.map-protocol-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.map-protocol-btn {
  font: inherit; font-size: 0.82rem; padding: 4px 12px; border-radius: 999px;
  border: 1px solid rgba(125, 125, 125, 0.45); background: transparent; color: inherit; cursor: pointer;
}
.map-protocol-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.map-protocol-btn.is-danger { border-color: rgba(190, 70, 70, 0.7); color: rgba(200, 80, 80, 1); }
.map-protocol-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 6px 0 12px; }
.map-protocol-table th, .map-protocol-table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid rgba(125, 125, 125, 0.22); }
.map-protocol-qcfail { color: var(--v2-refuted-on-tint, #c0564f); font-weight: 600; }
.map-protocol-error { color: var(--v2-refuted-on-tint, #c0564f); font-size: 0.82rem; margin: 6px 0; }
.map-protocol-note { font-size: 0.8rem; opacity: 0.75; }
`;
  writeFileSync(CSS, css);
  console.log('[surgery:web] lab.css: protocol band styles appended');
}
