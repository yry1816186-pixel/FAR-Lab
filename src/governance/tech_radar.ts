/**
 * tech_radar — GOV-RADAR-001 技术雷达只作为候选发现系统。
 *
 * 核心政策（宪法原文语义的机器面）：radar 条目本身不得作为采用依据——
 *   - status 'adopted' 的条目必须携带 decisionRef，且该 ref 必须能在
 *     「决策记录宇宙」（borrow_registry 的 BORROW_INVENTORY 条目 id 或
 *     决策台账 decision id 集合）中解析到——radar 自引（decisionRef 指向
 *     另一个 radar 条目）= 采用依据循环，fail-closed 拒绝；
 *   - 'trialing'/'trial 标记的条目必须携带 trial 证据引用（真实存在的
 *     spike/ablation/测试路径），否则降级回 'candidate'；
 *   - 状态机：candidate→trialing→(adopted|rejected)；adopted/rejected 是
 *     终态，回退（adopted→trialing 等）= 历史重写，拒绝。
 *
 * 确定性：纯函数、无 IO（文件存在性校验由调用方在决策记录宇宙构建时完成）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 本模块证明「adopted 条目挂了某个决策引用」这个结构事实，不证明该
 *     决策记录的内容质量（比较是否充分是 CORE-BORROW-001 门职责）；
 *   - decisionRef 指向的记录是否仍然有效（未被后续决策推翻）不在检查面
 *     ——决策台账自身的复审机制负责；
 *   - radar 不证明技术的新颖性或正确性——它只是候选发现的登记面。
 */

export type RadarStatus = 'candidate' | 'trialing' | 'adopted' | 'rejected';

/** 允许的雷达分类（宪法 J5 节列举的覆盖面）。 */
export const RADAR_CATEGORIES = [
  'agent-workflow',
  'scientific-agents',
  'retrieval-evidence',
  'memory',
  'evaluation-safety',
  'provenance-research-objects',
  'software-supply-chain',
  'observability',
  'sandboxing',
  'ui-visualization',
  'interoperability-protocols',
] as const;
export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

export interface RadarEntry {
  readonly id: string;
  readonly technology: string;
  readonly category: RadarCategory;
  readonly status: RadarStatus;
  /** 采用/试验依据的外部决策引用（borrow_registry id / 决策台账 id）。adopted 必填。 */
  readonly decisionRef?: string | undefined;
  /** trial 证据引用（spike/ablation/测试路径）。trialing 时必填。 */
  readonly trialEvidence?: readonly string[] | undefined;
  readonly note: string;
}

export interface RadarCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

const TERMINAL: readonly RadarStatus[] = ['adopted', 'rejected'];

/** 状态机合法转移表（candidate 起点显式包含——新条目也是一次转移）。 */
const LEGAL_TRANSITIONS: Readonly<Record<RadarStatus, readonly RadarStatus[]>> = {
  candidate: ['trialing', 'rejected'],
  trialing: ['adopted', 'rejected'],
  adopted: [],
  rejected: [],
};

/**
 * 单条目纪律检查（需要 decisionUniverse：可解析的决策记录 id 集合——
 * 由调用方从 borrow_registry + 决策台账构建）。
 */
function checkEntry(entry: RadarEntry, decisionUniverse: ReadonlySet<string>, problems: string[]): void {
  const tag = entry.id || '<empty-id>';
  if (entry.id.trim().length === 0) problems.push(`radar entry id must be non-empty`);
  if (entry.technology.trim().length === 0) problems.push(`${tag}: technology must be non-empty`);
  if (!RADAR_CATEGORIES.includes(entry.category)) problems.push(`${tag}: unknown category ${entry.category}`);

  // 政策核心：adopted 无决策记录 = radar 自证采用 → fail。
  if (entry.status === 'adopted') {
    if (entry.decisionRef === undefined || entry.decisionRef.trim().length === 0) {
      problems.push(`${tag}: status 'adopted' requires decisionRef (radar entry itself is never adoption evidence)`);
    } else if (!decisionUniverse.has(entry.decisionRef)) {
      problems.push(`${tag}: decisionRef "${entry.decisionRef}" not found in the decision universe (borrow registry / decision ledger)`);
    } else if (entry.decisionRef === entry.id) {
      problems.push(`${tag}: decisionRef points to the radar entry itself — circular adoption evidence`);
    }
  }
  if (entry.status === 'trialing') {
    if (entry.trialEvidence === undefined || entry.trialEvidence.length === 0) {
      problems.push(`${tag}: status 'trialing' requires non-empty trialEvidence`);
    }
  }
  // adopted 也应能溯源试验（宪法 Search→Compare→Spike→Decision 顺序）——
  // 有 decisionRef 但完全无 trial 痕迹 → 警告级问题（决策可能引用了别处的 spike）。
  if (entry.status === 'adopted' && entry.trialEvidence !== undefined && entry.trialEvidence.length === 0) {
    problems.push(`${tag}: adopted entry declares empty trialEvidence — decision must cite its spike somewhere`);
  }
}

/**
 * 雷达纪律检查（全量）：结构合法 + adopted 决策可解析 + id 唯一。
 * decisionUniverse 为空时任何 adopted 都 fail（fail-closed：没有决策记录
 * 宇宙就没有采用依据）。
 */
export function checkRadarDiscipline(entries: readonly RadarEntry[], decisionUniverse: ReadonlySet<string>): RadarCheck {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) problems.push(`${entry.id}: duplicate radar id`);
    ids.add(entry.id);
    checkEntry(entry, decisionUniverse, problems);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * 状态转移纪律：newStatus 必须是 oldStatus 的合法后继（历史不可重写）。
 * 终态（adopted/rejected）无后继。
 */
export function canTransition(from: RadarStatus, to: RadarStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export interface TransitionResult {
  readonly ok: boolean;
  readonly problem: string | null;
  readonly next: readonly RadarEntry[];
}

/**
 * 应用一次状态转移（返回新数组——append-only 精神：不修改原条目，产生
 * 修订版）。非法转移（含终态回退）→ { ok:false, problem }，原样不动。
 */
export function applyRadarTransition(entries: readonly RadarEntry[], entryId: string, to: RadarStatus, decisionUniverse: ReadonlySet<string>): TransitionResult {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return { ok: false, problem: `radar entry ${entryId} not found`, next: entries };
  const current = entries[idx]!;
  if (current.status === to) {
    return { ok: false, problem: `${entryId} already in status ${to}`, next: entries };
  }
  if (!canTransition(current.status, to)) {
    return {
      ok: false,
      problem: `illegal transition ${current.status} → ${to}${TERMINAL.includes(current.status) ? ` (${current.status} is terminal — history is not rewritable)` : ''}`,
      next: entries,
    };
  }
  const next = entries.map((e, i) => (i === idx ? { ...e, status: to } : e));
  const check = checkRadarDiscipline(next, decisionUniverse);
  if (!check.ok) {
    return { ok: false, problem: `transition would violate radar discipline: ${check.problems.join('; ')}`, next: entries };
  }
  return { ok: true, problem: null, next };
}
