/**
 * Requirements Registry 编译器（GOV-COMPILE-001 / GOV-LINT-001 / GOV-DERIVE-001）。
 *
 * 规范语义 SSOT = .far/constitution/{CORE_CONSTITUTION.md, DOMAIN_PROTOCOLS.md}；
 * 本模块把 REQ 区块编译为机器执行视图 .far/requirements/REQUIREMENTS.yaml 与四个派生视图。
 * 约束（GOV-COMPILE-001）：
 *   - deterministic compile：相同输入字节 → 相同输出字节（视图文件不含时间戳）；
 *   - stable ordering：按 normativeSource.files 顺序 + lineStart 排序；
 *   - source-line mapping：每个 requirement 携带 file/heading/lineStart/lineEnd/sourceHash（区块文本哈希）；
 *   - manualEditPolicy: forbidden —— --check 模式对再生成结果做字节比对，漂移即 FAIL。
 *
 * 推断字段说明：modal 从 requirement 正文按 RFC 2119 关键词首个出现推断（MUST NOT 优先于 MUST）；
 * acceptance.method / evidence.kind 由确定性词法分类器推断。未命中分类器时取保守默认
 * （inspection / artifact），不虚构更细粒度。
 */

import { createHash } from 'node:crypto';

export const TOOL_VERSION = '1.0.0';

const FALLBACK_BLOCK_PATTERN =
  '^### \\[REQ:(?<id>[A-Z0-9-]+)\\]\\[(?<tier>T0|T1|T2|T3)\\]\\[owner:(?<owner>[^\\]]+)\\]\\[scope:(?<scope>[^\\]]+)\\] (?<title>.+)$';

const ID_PATTERN = '^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$';

const STATUS_VOCAB = ['PASS', 'FAIL', 'BLOCKED_EXTERNAL', 'DEFERRED', 'NOT_APPLICABLE'];
const FAILURE_STATUS_VOCAB = ['FAIL', 'BLOCKED_EXTERNAL', 'NOT_APPLICABLE'];
const TIERS = ['T0', 'T1', 'T2', 'T3'];

const REQ_ID_IN_TEXT = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/g;

/**
 * 从 MACHINE_SCHEMAS.yaml 提取规范区块正则（单行标量）。缺失或与编译器内置常量漂移即
 * fail-closed：区块模式是治理契约，静默分叉会让两边对同一规范源编译出不同 registry。
 * 标量按 YAML 单引号规则规范化（`\\` 字节对 → 正则转义 `\`），与 validate_prompt.py
 * 硬编码的 REQUIREMENT_RE 语义对齐——该 YAML 标量是文档性契约而非可执行源。
 */
export function loadBlockPattern(schemasText) {
  const m = /requirementBlockPattern:\s*'([^']*)'/m.exec(schemasText);
  if (m === null) {
    return { ok: false, error: 'MACHINE_SCHEMAS.yaml missing requirementBlockPattern (single-quoted scalar)' };
  }
  const normalized = m[1].replace(/\\\\/g, '\\');
  if (normalized !== FALLBACK_BLOCK_PATTERN) {
    return {
      ok: false,
      error: 'requirementBlockPattern drifted from compiler constant — update scripts/requirements_registry.mjs after governance review (GOV-GOVCHANGE-001)',
    };
  }
  return { ok: true, pattern: new RegExp(normalized) };
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function splitList(text) {
  return text
    .split(/[、;；,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * modal 推断：标题优先（标题陈述区块的主义务），标题无情态词时回退正文首个出现。
 * 例：GOV-COMPILE-001 标题「只能由规范源编译」→ MUST，尽管正文含「禁止手工双写」。
 */
const MODAL_PROBES = [
  { kw: /禁止|不得|MUST NOT/, modal: 'MUST_NOT' },
  { kw: /必须|只能|仅|需要|MUST|SHALL/, modal: 'MUST' },
  { kw: /应当?|\bSHOULD\b/, modal: 'SHOULD' },
  { kw: /可以|\bMAY\b/, modal: 'MAY' },
];

function firstModalIn(text) {
  let best = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const probe of MODAL_PROBES) {
    const m = probe.kw.exec(text);
    if (m !== null && m.index < bestIndex) {
      best = probe.modal;
      bestIndex = m.index;
    }
  }
  return best;
}

function inferModal(title, bodyText) {
  return firstModalIn(title) ?? firstModalIn(bodyText) ?? 'MUST';
}

/** acceptance.method 确定性分类（按序首个命中）。 */
function inferAcceptanceMethod(text) {
  if (/test|测试|property|tamper|篡改|golden|fuzz|负例|边界/.test(text)) return 'test';
  if (/^(claim-lint|far |pnpm |node |python |git )|command|命令/.test(text)) return 'command';
  if (/review|评审|审阅|red-team|红队/.test(text)) return 'review';
  if (/experiment|实验|spike|ablation|消融/.test(text)) return 'experiment';
  if (/外部|第三方|独立复现|external/.test(text)) return 'external_verification';
  return 'inspection';
}

/** evidence.kind 确定性分类（按序首个命中），未命中者归 artifact。 */
function inferEvidenceKind(text) {
  const map = [
    { kw: /receipt|收据/, kind: 'receipt' },
    { kw: /report|报告/, kind: 'report' },
    { kw: /\blog\b|日志/, kind: 'log' },
    { kw: /proof/, kind: 'proof' },
    { kw: /dataset|语料|数据集/, kind: 'dataset' },
    { kw: /review|评审/, kind: 'review' },
    { kw: /decision|决策/, kind: 'decision' },
    { kw: /snapshot|快照/, kind: 'source_snapshot' },
  ];
  for (const entry of map) {
    if (entry.kw.test(text)) return entry.kind;
  }
  return 'artifact';
}

function extractReqIds(text) {
  const ids = [];
  for (const m of text.matchAll(REQ_ID_IN_TEXT)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

const BODY_CLASSIFIER = [
  { key: 'acceptance', re: /^Acceptance[：:]/ },
  { key: 'evidence', re: /^Evidence[：:]/ },
  { key: 'failure', re: /^Failure[：:]/ },
  { key: 'depends', re: /^(依赖|Depends( on)?[：:])/ },
  { key: 'conflicts', re: /^(冲突|Conflicts( with)?[：:])/ },
  { key: 'supersedes', re: /^(取代|Supersedes[：:])/ },
];

/** 区块正文按引导词归类；非 bullet 续行归入当前类，其余进 requirement 正文。 */
function structureBlock(bodyLines) {
  const categories = { acceptance: [], evidence: [], failure: [], depends: [], conflicts: [], supersedes: [], requirement: [] };
  let current = 'requirement';
  for (const rawLine of bodyLines) {
    const line = rawLine.replace(/^[-*]\s+/, '').trim();
    if (line.length === 0) continue;
    const hit = BODY_CLASSIFIER.find((c) => c.re.test(line));
    if (hit !== undefined) {
      current = hit.key;
      categories[current].push(line.replace(hit.re, '').trim());
    } else {
      categories[current].push(line);
    }
  }
  return categories;
}

function buildAcceptance(reqId, texts) {
  const criteria = [];
  for (const text of texts) {
    for (const part of text.split(/[；;]/).map((s) => s.trim()).filter((s) => s.length > 0)) {
      criteria.push(part);
    }
  }
  return criteria.map((expected, i) => ({
    id: `${reqId}-ACC-${i + 1}`,
    method: inferAcceptanceMethod(expected),
    command: null,
    expected,
    environment: null,
    profile: null,
  }));
}

function buildEvidence(texts) {
  const entries = [];
  for (const text of texts) {
    for (const locator of splitList(text)) {
      entries.push({ kind: inferEvidenceKind(locator), locator, hash: null });
    }
  }
  return entries;
}

function buildFailure(texts) {
  const joined = texts.join('；');
  const statusHit = FAILURE_STATUS_VOCAB.find((s) => joined.includes(s)) ?? 'FAIL';
  const cleaned = joined
    .split(statusHit)
    .join('')
    .replace(/`/g, '')
    .replace(/^[\s：:；;，,。、]+/, '')
    .replace(/[\s：:；;，,。、]+$/, '');
  // 清理后过短（如「T0」）说明状态词就是失败语义主体——回退原文，不制造空洞 consequence。
  const consequence = cleaned.length >= 4 ? cleaned : joined;
  return { status: statusHit, consequence, reopen: [] };
}

/** 状态合并：无 receipt 输入的 requirement 默认 FAIL——未经证据验收即未通过门禁（0.3 状态语义）。 */
function applyStatus(record, statusInput) {
  const entry = statusInput?.[record.id];
  if (entry === undefined) {
    return { ...record, status: 'FAIL', lastVerifiedAt: null, lastVerifiedCommit: null, lastEvidence: [] };
  }
  return {
    ...record,
    status: entry.status,
    lastVerifiedAt: entry.lastVerifiedAt ?? null,
    lastVerifiedCommit: entry.lastVerifiedCommit ?? null,
    lastEvidence: Array.isArray(entry.lastEvidence) ? entry.lastEvidence : [],
  };
}

function parseFile({ text, file }, pattern) {
  const requirements = [];
  const errors = [];
  const lines = text.split('\n');
  let topSection = '';
  let subSection = '';
  let current = null;
  const flush = () => {
    if (current !== null) requirements.push(current);
    current = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^# [^#]/.test(line)) {
      flush();
      topSection = line.replace(/^#\s+/, '').trim();
      continue;
    }
    if (/^## /.test(line)) {
      flush();
      subSection = line.replace(/^##\s+/, '').trim();
      continue;
    }
    const m = pattern.exec(line);
    if (m !== null) {
      flush();
      current = {
        id: m.groups.id,
        tier: m.groups.tier,
        owner: m.groups.owner,
        scope: m.groups.scope,
        title: m.groups.title.trim(),
        file,
        heading: [topSection, subSection].filter((s) => s.length > 0).join(' > '),
        lineStart: i + 1,
        bodyLines: [],
      };
      continue;
    }
    if (/^### \[REQ:/.test(line)) {
      // near-miss：validate_prompt.py 同款防线——形似 REQ 标题但不匹配契约正则的行
      // 必须让编译失败，否则该义务会被静默丢弃。
      errors.push(`${file}:${i + 1}: malformed requirement heading: ${line.trim()}`);
      continue;
    }
    if (/^### /.test(line)) {
      flush();
      continue;
    }
    if (current !== null) {
      current.bodyLines.push(line);
      if (line.trim().length > 0) current.lastNonemptyLine = i + 1;
    }
  }
  flush();
  for (const req of requirements) {
    req.lineEnd = req.lastNonemptyLine ?? req.lineStart;
    delete req.lastNonemptyLine;
    req.blockHash = sha256(`${file}\n${req.lineStart}\n${req.bodyLines.join('\n')}`);
  }
  return { requirements, errors };
}

/** 区块哈希输入 = 文件 + 起始行 + 原始正文行（含空行，保证区块字节级可指纹）。 */

function structureRequirement(block, statusInput) {
  const categories = structureBlock(block.bodyLines);
  const requirementText = categories.requirement.join('\n');
  const record = {
    id: block.id,
    source: {
      file: block.file,
      heading: block.heading,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      sourceHash: block.blockHash,
    },
    title: block.title,
    modal: inferModal(block.title, requirementText),
    tier: block.tier,
    owner: block.owner,
    scope: block.scope
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    trigger: ['always_when_scope_applies'],
    requirement: requirementText,
    acceptance: buildAcceptance(block.id, categories.acceptance),
    evidence: buildEvidence(categories.evidence),
    failure: buildFailure(categories.failure),
    dependsOn: extractReqIds(categories.depends.join(' ')),
    conflictsWith: extractReqIds(categories.conflicts.join(' ')),
    supersedes: extractReqIds(categories.supersedes.join(' ')),
    risk: {},
  };
  return applyStatus(record, statusInput);
}

/**
 * 编译两个规范源为 registry。parseErrors 非空时 ok=false
 * （GOV-COMPILE-001：不一致时编译失败，规范源胜出并重新生成）。
 */
export function compileRegistry({ coreText, domainText, coreFile, domainFile, pattern, statusInput }) {
  const specs = [
    { text: coreText, file: coreFile },
    { text: domainText, file: domainFile },
  ];
  const sources = specs.map((spec) => ({
    file: spec.file,
    sha256: sha256(spec.text),
    lineCount: spec.text.split('\n').length,
  }));
  const requirements = [];
  const parseErrors = [];
  for (const spec of specs) {
    const rows = parseFile(spec, pattern);
    requirements.push(...rows.requirements);
    parseErrors.push(...rows.errors);
  }
  const structured = requirements.map((block) => structureRequirement(block, statusInput));
  return { ok: parseErrors.length === 0, requirements: structured, sources, parseErrors };
}

/** GOV-LINT-001：阻断结构性矛盾。findings 非空即 lint FAIL。 */
export function lintRegistry(registry) {
  const findings = [];
  const byId = new Map(registry.requirements.map((r) => [r.id, r]));
  const seen = new Set();
  for (const req of registry.requirements) {
    if (!new RegExp(ID_PATTERN).test(req.id)) findings.push(`${req.id}: id format invalid (expected ${ID_PATTERN})`);
    if (seen.has(req.id)) findings.push(`${req.id}: duplicate REQ-ID`);
    seen.add(req.id);
    if (!TIERS.includes(req.tier)) findings.push(`${req.id}: tier "${req.tier}" invalid`);
    if (req.owner.length === 0) findings.push(`${req.id}: owner empty`);
    if (req.scope.length === 0) findings.push(`${req.id}: scope empty`);
    if (req.requirement.length === 0) findings.push(`${req.id}: requirement text empty`);
    // requirementSchema：acceptance/evidence minItems 1 对全部 tier 生效；
    // failure consequence 完整性按 GOV-LINT-001 仅对 T0 阻断。
    if (req.acceptance.length === 0) findings.push(`${req.id}: missing acceptance`);
    if (req.evidence.length === 0) findings.push(`${req.id}: missing evidence`);
    if (req.tier === 'T0' && req.failure.consequence.length === 0) {
      findings.push(`${req.id}: T0 missing failure consequence`);
    }
    if (!STATUS_VOCAB.includes(req.status)) findings.push(`${req.id}: status "${req.status}" outside vocabulary`);
    if (req.tier === 'T0' && req.status === 'DEFERRED') findings.push(`${req.id}: T0 must not be DEFERRED`);
    if (!FAILURE_STATUS_VOCAB.includes(req.failure.status)) {
      findings.push(`${req.id}: failure.status "${req.failure.status}" outside vocabulary`);
    }
  }
  const refFields = [
    ['dependsOn', (r) => r.dependsOn],
    ['conflictsWith', (r) => r.conflictsWith],
    ['supersedes', (r) => r.supersedes],
  ];
  for (const req of registry.requirements) {
    for (const [field, get] of refFields) {
      for (const ref of get(req)) {
        if (!byId.has(ref)) findings.push(`${req.id}: ${field} dangling reference "${ref}"`);
        if (ref === req.id) findings.push(`${req.id}: ${field} self-reference`);
      }
    }
  }
  findings.push(...detectDependencyCycles(registry.requirements));
  return { ok: findings.length === 0, findings };
}

function detectDependencyCycles(requirements) {
  const findings = [];
  const known = new Set(requirements.map((r) => r.id));
  const graph = new Map(requirements.map((r) => [r.id, r.dependsOn.filter((d) => known.has(d))]));
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      findings.push(`dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(' -> ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const next of graph.get(id) ?? []) visit(next, [...path, id]);
    state.set(id, 'done');
  };
  for (const req of requirements) visit(req.id, []);
  return findings;
}

/** 极小确定性 YAML 序列化器：固定键序、块式集合、必要时引号；含换行的标量走双引号转义。 */
export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return typeof value === 'string' ? yamlScalar(value) : String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) =>
        item !== null && typeof item === 'object'
          ? `${pad}-\n${toYaml(item, indent + 2)}`
          : `${pad}- ${toYaml(item, 0)}`
      )
      .join('\n');
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  return entries
    .map(([key, v]) => {
      if (v !== null && typeof v === 'object') {
        const empty = Array.isArray(v) ? v.length === 0 : Object.entries(v).length === 0;
        if (empty) return `${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}`;
        return `${pad}${key}:\n${toYaml(v, indent + 2)}`;
      }
      return `${pad}${key}: ${toYaml(v, 0)}`;
    })
    .join('\n');
}

function yamlScalar(text) {
  if (text.includes('\n')) return JSON.stringify(text);
  const needsQuote = /[:#{}\[\],&*!|>'"%@`]|^\s|\s$|^$|^[-?]/.test(text) || /^(?:\d+\.?\d*|true|false|null|~)$/.test(text);
  return needsQuote ? `'${text.replace(/'/g, "''")}'` : text;
}

const generatedHeader = (role) =>
  [
    `# ${role} — GENERATED by scripts/requirements_compile.mjs v${TOOL_VERSION}.`,
    '# Manual edit forbidden (manualEditPolicy). Source of truth: .far/constitution/{CORE_CONSTITUTION.md, DOMAIN_PROTOCOLS.md}.',
    '# Deterministic regeneration: byte-identical output for identical sources (GOV-DERIVE-001).',
    '',
  ].join('\n');

export function renderRequirementsYaml(registry) {
  return `${generatedHeader('Requirement Registry')}${toYaml({ requirements: registry.requirements })}\n`;
}

export function renderAcceptanceYaml(registry) {
  const entries = registry.requirements.map((req) => ({
    id: req.id,
    tier: req.tier,
    owner: req.owner,
    status: req.status,
    acceptance: req.acceptance.map((a) => ({ id: a.id, method: a.method, command: a.command, expected: a.expected })),
  }));
  return `${generatedHeader('Acceptance Plan')}${toYaml({ entries })}\n`;
}

export function renderOwnerMapYaml(registry) {
  const owners = new Map();
  for (const req of registry.requirements) {
    const entry =
      owners.get(req.owner) ?? { owner: req.owner, requirementCount: 0, tiers: { T0: 0, T1: 0, T2: 0, T3: 0 }, requirementIds: [] };
    entry.requirementCount += 1;
    entry.tiers[req.tier] += 1;
    entry.requirementIds.push(req.id);
    owners.set(req.owner, entry);
  }
  const rows = [...owners.values()]
    .sort((a, b) => b.requirementCount - a.requirementCount || a.owner.localeCompare(b.owner))
    .map((e) => ({ ...e, requirementIds: [...e.requirementIds].sort() }));
  return `${generatedHeader('Owner / Delegation Map')}${toYaml({ owners: rows })}\n`;
}

const gateView = (registry, tier) => {
  const rows = registry.requirements.filter((r) => r.tier === tier);
  const byStatus = {};
  for (const status of STATUS_VOCAB) byStatus[status] = 0;
  for (const row of rows) byStatus[row.status] += 1;
  return {
    total: rows.length,
    byStatus,
    notPassing: rows.filter((r) => r.status !== 'PASS').map((r) => r.id).sort(),
  };
};

export function renderGatesYaml(registry) {
  return `${generatedHeader('T0 / T1 Gate View')}${toYaml({ t0: gateView(registry, 'T0'), t1: gateView(registry, 'T1') })}\n`;
}

export function renderCoverageYaml(registry) {
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const bySection = new Map();
  const byOwner = new Map();
  for (const req of registry.requirements) {
    byTier[req.tier] += 1;
    const section = req.source.heading.split(' > ')[0] || '(unsectioned)';
    bySection.set(section, (bySection.get(section) ?? 0) + 1);
    byOwner.set(req.owner, (byOwner.get(req.owner) ?? 0) + 1);
  }
  const sectionRows = [...bySection.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([section, count]) => ({ section, count }));
  const ownerRows = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([owner, count]) => ({ owner, count }));
  return `${generatedHeader('Coverage Ledger')}${toYaml({
    totals: { requirements: registry.requirements.length, byTier },
    sources: registry.sources,
    bySection: sectionRows,
    byOwner: ownerRows,
  })}\n`;
}

function countByTier(requirements) {
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const req of requirements) byTier[req.tier] += 1;
  return byTier;
}

/** 编译收据：时间戳/commit 只进 receipt，不进视图（保证视图再生成无 diff）。 */
export function buildCompileReceipt({ registry, lint, outputs, startedAt, finishedAt, commit, sources }) {
  return {
    toolVersion: TOOL_VERSION,
    startedAt,
    finishedAt,
    commit,
    sources,
    counts: { requirements: registry.requirements.length, byTier: countByTier(registry.requirements) },
    lint: { ok: lint.ok, findings: lint.findings },
    outputs,
  };
}
