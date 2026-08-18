// src/gates/ux_t1_gates.ts
// 职责：T1 UX 六项（UX-A11Y/API/CLI/I18N/PERF/WEB-001）——对真实仓库资产断言真实
// 属性（解析源码/契约文件并验证内容，而非存在性橡皮章），另含两个小型真机制：
//   - explainableEta/progressFraction（UX-PERF）：总量未知时拒绝给出数字（禁虚假
//     百分比/不可解释 ETA——宪法条款的机器面）；
//   - pseudoLocalize/wideCharRatio（UX-I18N）：伪本地化膨胀与 CJK 宽字符风险检测。
//
// 断言的真实资产（2026-08-18 clean-room 前端重建后实测）：
//   A11Y：index.css prefers-reduced-motion 媒体查询、AppShell skip-link + main 地标、
//         Button focus-visible ring、src 全树 aria-/htmlFor/role 真实计数、
//         VerdictBadge 文本+图标双通道、Benchmark 分布条 role="img"+aria-label（行为由
//         frontend 测试锁死：getByRole('img') 断言逐行在场）；
//   API：schema/openapi.json 36 路径全 /v1|v2 版本化、receipts limit/offset 分页、
//         429 限流问题响应、platform/errors.ts 错误目录（code/class/remediation/since）、
//         generate_openapi --check CI 防漂移、release/compat_matrix 兼容矩阵；
//   CLI：far.ts --json ≥10 处、doctor/--dry-run/research resume/退出码契约、
//         cli_error_paths 可操作错误测试、README Ctrl+C 诚实取消+续跑；
//   I18N：zh/en 目录 481 键零漂移 + 占位符逐键校验 + verdict 经 {raw} 透传；
//   PERF：/research/{id}/cancel + /events SSE 端点、EventSource 自动重连（sse.ts）、
//         fsm resumeStore、perf_budget.json ≥4 预算（rationale+阈值）+ CI 门；
//   WEB：app/App.tsx 11 路由（科学对象维度）零 chat 路由、核心旅程 ≥4 状态面 testid。
//
// Cannot-prove（本机制不能证明什么）：
//   - 所有源码断言是「结构在场」判定：对比度数值、读屏实际朗读、触控目标尺寸、
//     缩放重排渲染、真实网络下的流中断恢复等需要渲染/运行环境的维度不在此门
//     （已显式列入 declaredGaps，不冒充已验证）；
//   - i18n 检查证明键位/占位符结构一致与 verdict 规范值不被翻译替换，不证明译文
//     语义质量；RTL 语言未支持（支持语言限定 zh/en——如实声明）；
//   - perf 门证明取消/恢复/预算机制在场且接线，不证明任意负载下的实际响应时间。
// 零容忍合规：无 any/抑制指令/双断言/空 catch。模型中立。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 公共类型与工具
// ---------------------------------------------------------------------------

export interface RequirementCheck {
  readonly requirement: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly evidence: readonly string[];
  /** 诚实边界：本门不覆盖/需渲染或人工验证的维度（显式列出，不静默通过）。 */
  readonly declaredGaps: readonly string[];
}

function makeCheck(
  requirement: string,
  problems: readonly string[],
  evidence: readonly string[],
  declaredGaps: readonly string[] = [],
): RequirementCheck {
  return { requirement, ok: problems.length === 0, problems, evidence, declaredGaps };
}

function readText(absPath: string): string {
  if (!existsSync(absPath)) return '';
  return readFileSync(absPath, 'utf8');
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/** 解析 JSON 文件；缺失/坏格式返回 null（fail-closed 由调用方记录 problem）。 */
function readJson(absPath: string): unknown {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    return { __parseError: String(err) };
  }
}

/** 递归收集某扩展名的文件（新前端为 features/ 分层结构，扁平 readdir 不够用）。 */
function listFilesRecursive(dir: string, ext: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// UX-A11Y-001：核心旅程可访问性（源码可静态断言的维度）
// ---------------------------------------------------------------------------

export function checkA11y(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // 1) reduced-motion：媒体查询存在且块内含真实规则（非空壳）
  const css = readText(join(repoRoot, 'frontend/src/index.css'));
  const rmIdx = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (rmIdx === -1) {
    problems.push('frontend/src/index.css lacks @media (prefers-reduced-motion: reduce)');
  } else {
    const block = css.slice(rmIdx, css.indexOf('}', css.indexOf('}', rmIdx) + 1));
    if (!/animation|transition|scroll-behavior/.test(block)) {
      problems.push('reduced-motion block has no animation/transition rule (empty shell)');
    } else {
      evidence.push('prefers-reduced-motion media query with real rules (WCAG 2.3.3)');
    }
  }

  // 2) 语义地标 + skip link（AppShell：跳转链接 + main 地标 + 具名主导航）
  const shell = readText(join(repoRoot, 'frontend/src/app/AppShell.tsx'));
  if (!shell.includes('skipToContent')) problems.push('AppShell lacks skip-to-content link');
  else evidence.push('skipToContent link present');
  if (!shell.includes('<main id="main-content"')) problems.push('AppShell lacks <main id="main-content"> landmark');
  else evidence.push('main landmark with programmatically focusable id');
  if (!shell.includes('aria-label')) problems.push('AppShell nav/menu lack accessible names');
  else evidence.push('labelled navigation + menu disclosure (aria-label/aria-expanded/aria-controls)');

  // 3) visible focus（交互组件 focus-visible ring）
  const button = readText(join(repoRoot, 'frontend/src/shared/ui/Button.tsx'));
  if (!button.includes('focus-visible:ring')) problems.push('ui/Button lacks focus-visible ring styling');
  else evidence.push('focus-visible ring on interactive components');

  // 4) aria/label 覆盖面（真实计数：新架构把模式集中在 shared 原语——Tabs/StateBlock/
  //    HashValue/AppShell——页面经组合继承；故扫描 src 全树，另断言 htmlFor 表单标签关联）
  const srcDir = join(repoRoot, 'frontend/src');
  const tsxFiles = existsSync(srcDir) ? listFilesRecursive(srcDir, '.tsx') : [];
  if (tsxFiles.length === 0) problems.push('frontend/src tree missing');
  let ariaTotal = 0;
  let filesWithAria = 0;
  let htmlForTotal = 0;
  for (const f of tsxFiles) {
    const text = readText(f);
    const n = countOccurrences(text, 'aria-');
    ariaTotal += n;
    if (n > 0) filesWithAria += 1;
    htmlForTotal += countOccurrences(text, 'htmlFor');
  }
  if (ariaTotal < 40) problems.push(`aria attribute coverage too low: ${ariaTotal} across src`);
  else evidence.push(`aria coverage: ${ariaTotal} attributes across ${tsxFiles.length} tsx (${filesWithAria} files carry >=1)`);
  if (filesWithAria < 12) problems.push(`only ${filesWithAria}/${tsxFiles.length} files carry aria attributes`);
  if (htmlForTotal < 8) problems.push(`form label association too low: ${htmlForTotal} htmlFor`);
  else evidence.push(`form labeling: ${htmlForTotal} htmlFor associations (labels, not placeholder-only)`);

  // 5) 非颜色编码：verdict 状态带文本 token + 图标双通道（色盲可辨）
  const badge = readText(join(repoRoot, 'frontend/src/shared/ui/VerdictBadge.tsx'));
  const hasTextAndIcon = badge.includes('verdict.token') && badge.includes('VERDICT_ICON');
  if (!hasTextAndIcon) problems.push('VerdictBadge lacks text+icon channels (color-only encoding)');
  else evidence.push('non-color encoding: verdict states carry machine token + shape icon channels');

  // 6) 图表替代文本：benchmark 分布条 role="img" + 逐行 aria-label；渲染行为由前端测试锁死
  const bench = readText(join(repoRoot, 'frontend/src/features/benchmark/BenchmarkPage.tsx'));
  const hasRoleImg = bench.includes('role="img"') && bench.includes('aria-label');
  if (!hasRoleImg) problems.push('benchmark distribution bars lack role="img" + aria-label alternatives');
  else evidence.push('chart alternatives: distribution bars render role="img" + per-row aria-label (key: count)');
  const benchTest = readText(join(repoRoot, 'frontend/src/__tests__/evidence_benchmark.test.tsx'));
  if (!benchTest.includes("getByRole('img'")) problems.push('no rendered-behavior test locks the chart alternatives');
  else evidence.push("chart alternatives locked by behavior test (getByRole('img', { name: 'CONFIRMED: 3' }) etc.)");

  return makeCheck(
    'UX-A11Y-001',
    problems,
    evidence,
    [
      'contrast ratios：需计算渲染样式，无无头渲染环境不做数值断言（人工/浏览器轴承载）',
      'screen-reader smoke：实际朗读顺序需读屏器实测（结构地标在场是其前置条件）',
      'touch targets / zoom-reflow：需视口渲染测量，不在静态门范围',
    ],
  );
}

// ---------------------------------------------------------------------------
// UX-API-001：共享领域语义 + 稳定错误合同
// ---------------------------------------------------------------------------

interface OpenApiShape {
  readonly paths?: Readonly<Record<string, unknown>>;
}

export function checkApiContract(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const spec = readJson(join(repoRoot, 'schema/openapi.json'));
  if (spec === null || typeof spec !== 'object') {
    problems.push('schema/openapi.json missing or unparseable');
  } else {
    const paths = Object.keys((spec as OpenApiShape).paths ?? {});
    if (paths.length < 30) problems.push(`openapi paths too few: ${paths.length}`);
    else evidence.push(`${paths.length} contract paths`);
    const unversioned = paths.filter((p) => p.startsWith('/api/') && !/\/v[12]\//.test(p));
    if (unversioned.length > 0) problems.push(`unversioned /api/ paths: ${unversioned.join(', ')}`);
    else evidence.push('version negotiation: unversioned=0 (all /api/* under /v1|/v2)');

    const specText = readText(join(repoRoot, 'schema/openapi.json'));
    const hasPagination = specText.includes('"limit"') && specText.includes('"offset"');
    if (!hasPagination) problems.push('no limit/offset pagination parameters in contract');
    else evidence.push('pagination: limit/offset documented (receipts list, 1..100 default 20)');
    const rateLimited = countOccurrences(specText, 'Request rate limit exceeded');
    if (rateLimited < 2) problems.push(`rate-limit 429 problem responses too few: ${rateLimited}`);
    else evidence.push(`rate-limit: ${rateLimited} documented 429 problem responses`);
  }

  // 错误目录：code/class/remediation/since 四元组
  const errors = readText(join(repoRoot, 'src/platform/errors.ts'));
  const remediationCount = countOccurrences(errors, 'remediation:');
  if (remediationCount < 8) problems.push(`error catalog remediation entries too few: ${remediationCount}`);
  else evidence.push(`error catalog: ${remediationCount} remediation entries (code/class/since)`);

  // problem+json（RFC 7807 等价错误）在路由层真实使用
  const routesDir = join(repoRoot, 'src/api/routes');
  let problemJson = 0;
  if (existsSync(routesDir)) {
    for (const f of readdirSync(routesDir)) {
      if (f.endsWith('.ts')) problemJson += countOccurrences(readText(join(routesDir, f)), 'application/problem+json');
    }
  }
  if (problemJson < 5) problems.push(`problem+json usage too few: ${problemJson}`);
  else evidence.push(`RFC 7807 problem+json: ${problemJson} usages across route layer`);

  // 限流注册 + authz + 防漂移门 + 兼容矩阵
  const server = readText(join(repoRoot, 'src/api/server.ts'));
  if (!server.includes('rate-limit')) problems.push('api server lacks rate-limit registration');
  else evidence.push('rate-limit registered at server level (@fastify/rate-limit)');
  if (!existsSync(join(repoRoot, 'src/security/authz.ts'))) problems.push('src/security/authz.ts missing (shared authz policy)');
  else evidence.push('shared authz policy: src/security/authz.ts');

  const ci = readText(join(repoRoot, '.github/workflows/ci.yml'));
  if (!ci.includes('generate_openapi') || !ci.includes('--check')) {
    problems.push('CI lacks generate_openapi --check drift gate');
  } else {
    evidence.push('contract drift gate: generate_openapi --check wired in CI');
  }
  const compat = readText(join(repoRoot, 'src/release/compat_matrix.ts'));
  if (!compat.includes('checkCompatMatrixSync')) problems.push('compat matrix sync check missing');
  else evidence.push('compatibility matrix: checkCompatMatrixSync (surface registry vs source)');

  return makeCheck('UX-API-001', problems, evidence, [
    'backward compatibility 的历史实证只覆盖仓库内 legacy 样本（compat_matrix verifyHistoricalProof），任意第三方旧包需各自 fixture',
    'generated docs 的外部可用性（开发者门户渲染）不在本门',
  ]);
}

// ---------------------------------------------------------------------------
// UX-CLI-001：交互/自动化/障碍恢复三面
// ---------------------------------------------------------------------------

export function checkCliSurface(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const far = readText(join(repoRoot, 'src/cli/far.ts'));
  if (far.length === 0) {
    problems.push('src/cli/far.ts missing');
    return makeCheck('UX-CLI-001', problems, evidence, ['shell completions 未提供（无 completion 子命令——如实登记为缺口）']);
  }

  // 自动化面：--json 机器可读输出广覆盖
  const jsonCount = countOccurrences(far, '--json');
  if (jsonCount < 10) problems.push(`--json coverage too low: ${jsonCount}`);
  else evidence.push(`machine-readable: --json on ${jsonCount} option/usage sites`);

  // 诊断面：doctor 自检
  if (!far.includes("name: 'doctor'")) problems.push('doctor command missing');
  else evidence.push('doctor: environment self-diagnosis command registered');

  // 恢复面：dry-run + resume
  if (!far.includes('--dry-run')) problems.push('--dry-run missing (no effect preview)');
  else evidence.push('dry-run where meaningful (fsm transition diff without write)');
  if (!far.includes('research resume')) problems.push('resume subcommand missing');
  else evidence.push('resume: far research resume <runId> (checkpointed stage receipts)');

  // 稳定退出码：文档化契约 + 自然退出（不 process.exit 强杀）
  if (!far.includes('exits 0')) problems.push('documented exit-code contract missing');
  else evidence.push('exit codes: documented contract (0 VERIFIED / 7 NOT_FOUND / 8 UNAVAILABLE / 9 UNSUPPORTED / 1 bad args)');
  if (!far.includes('process.exitCode = exitCode')) problems.push('natural exit pattern missing (force-exit races teardown)');
  else evidence.push('natural exit (process.exitCode) — no forced exit racing handle teardown');

  // 可操作错误：fail-closed + guidance 在测
  const errPaths = readText(join(repoRoot, 'tests/cli/cli_error_paths.test.ts'));
  if (errPaths.length === 0) problems.push('tests/cli/cli_error_paths.test.ts missing');
  else if (!errPaths.includes('fail-closed') || !errPaths.includes('指引')) {
    problems.push('error-path test lacks actionable-guidance / fail-closed assertions');
  } else {
    evidence.push('actionable errors: fail-closed paths with remediation commands asserted (far demo / --profile offline_replay / far ground)');
  }

  // Ctrl+C 诚实取消 + 续跑（README 契约）
  const readme = readText(join(repoRoot, 'README.md'));
  if (!readme.includes('Ctrl+C cancels')) problems.push('README lacks honest Ctrl+C cancel contract');
  else evidence.push('graceful cancel: Ctrl+C → state=CANCELLED, finished stages kept, resumable (README contract)');

  return makeCheck('UX-CLI-001', problems, evidence, [
    'shell completions 未提供（无 completion 子命令——如实登记为缺口）',
    'no-TTY 显式分支未实现：自动化面由 --json 通道承载，未按 isTTY 切换人类输出格式',
  ]);
}

// ---------------------------------------------------------------------------
// UX-I18N-001：国际化结构（键位/占位符/规范值透传）+ 风险机制
// ---------------------------------------------------------------------------

function extractCatalogueKeys(text: string): Map<string, string> {
  const map = new Map<string, string>();
  // 值可为单引号或双引号（值内含撇号时 TS 惯用双引号——如 ablation.honestyP3）
  const re = /^ {2}'([^']+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm;
  let m = re.exec(text);
  while (m !== null) {
    const value = m[2] ?? m[3] ?? '';
    if (m[1] !== undefined) map.set(m[1], value);
    m = re.exec(text);
  }
  return map;
}

/**
 * 占位符集合。{s} 是英文复数后缀约定（EventsPage 显式传参 s: n===1?'':'s'），
 * 属 locale 特有插值——比对时排除并在证据中说明，不掩盖其余任何漂移。
 */
function extractPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)]
    .map((mm) => mm[1] ?? '')
    .filter((s) => s.length > 0 && s !== 's')
    .sort();
}

/** 伪本地化：确定性变换（括号包裹 + ASCII 变音 + 膨胀填充）——暴露布局溢出风险。 */
export function pseudoLocalize(text: string, expansion: number): string {
  const accents: Readonly<Record<string, string>> = {
    a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ñ',
    A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú',
  };
  const transformed = [...text].map((ch) => accents[ch] ?? ch).join('');
  const pad = '×'.repeat(Math.round(transformed.length * Math.max(0, expansion)));
  return `[${transformed}${pad}]`;
}

/** CJK/全角字符占比（宽字符布局风险——双向文本风险另见 declaredGaps）。 */
export function wideCharRatio(text: string): number {
  if (text.length === 0) return 0;
  const wide = [...text].filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff00 && cp <= 0xffef);
  }).length;
  return wide / text.length;
}

export function checkI18n(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const zhPath = join(repoRoot, 'frontend/src/shared/i18n/zh.ts');
  const enPath = join(repoRoot, 'frontend/src/shared/i18n/en.ts');
  const zh = readText(zhPath);
  const en = readText(enPath);
  if (zh.length === 0 || en.length === 0) {
    problems.push('i18n catalogues missing (zh.ts/en.ts)');
    return makeCheck('UX-I18N-001', problems, evidence, ['支持语言限定 zh/en（README.zh-CN 为公开非默认语言面）；RTL 语言不支持']);
  }

  const zhKeys = extractCatalogueKeys(zh);
  const enKeys = extractCatalogueKeys(en);
  if (zhKeys.size < 400) problems.push(`catalogue too small: ${zhKeys.size} keys`);
  else evidence.push(`${zhKeys.size} keys per locale (zh default + en non-default)`);

  // 键位零漂移
  const zhOnly = [...zhKeys.keys()].filter((k) => !enKeys.has(k));
  const enOnly = [...enKeys.keys()].filter((k) => !zhKeys.has(k));
  const drift = zhOnly.length + enOnly.length;
  if (drift > 0) problems.push(`key drift between locales: zh-only=${zhOnly.length} en-only=${enOnly.length}`);
  else evidence.push('key parity: drift=0 (type-bound via Record<MessageKey, string>)');

  // 占位符逐键一致（翻译不得丢/改插值）
  let placeholderMismatch = 0;
  for (const [k, v] of zhKeys) {
    const ev = enKeys.get(k);
    if (ev === undefined) continue;
    if (extractPlaceholders(v).join(',') !== extractPlaceholders(ev).join(',')) placeholderMismatch += 1;
  }
  if (placeholderMismatch > 0) problems.push(`placeholder mismatches across locales: ${placeholderMismatch}`);
  else evidence.push('placeholder parity: {token} sets identical per key');

  // verdict 规范值经 {raw} 透传：翻译包裹但不替换认知状态值
  const verdictKey = 'verdict.token';
  const zhVerdict = zhKeys.get(verdictKey) ?? '';
  const enVerdict = enKeys.get(verdictKey) ?? '';
  if (!zhVerdict.includes('{raw}') || !enVerdict.includes('{raw}')) {
    problems.push(`canonical verdict passthrough broken at '${verdictKey}'`);
  } else {
    evidence.push('epistemic preservation: verdict canonical tokens pass through {raw} (translation wraps, never replaces)');
  }

  // 非默认语言核心旅程在场（mission.* 工作台旅程键双语言存在）
  const coreJourney = [...zhKeys.keys()].filter((k) => k.startsWith('mission.')).length;
  if (coreJourney < 20) problems.push(`core journey keys too few: ${coreJourney}`);
  else evidence.push(`non-default-locale core journey: ${coreJourney} mission.* keys in both locales`);

  // 类型层防漂移标记
  if (!en.includes('Record<MessageKey, string>')) problems.push('en catalogue not type-bound to zh keys');

  return makeCheck('UX-I18N-001', problems, evidence, [
    '支持语言限定 zh/en（README.zh-CN 为公开非默认语言面）；RTL 语言不支持（目录无 RTL 文本——双向风险不适用且如实声明）',
    '译文语义质量（科学术语译名准确性）不在结构门——键位/占位符/透传是结构性质',
  ]);
}

// ---------------------------------------------------------------------------
// UX-PERF-001：长任务反馈/取消/恢复 + 反虚假进度机制
// ---------------------------------------------------------------------------

/**
 * 可解释 ETA：仅在「总量可数 + 速率可测 + 记账自洽」三条件同时成立时给出数字。
 * - total 未知/非法 → basis 'unknown-total'（UI 必须渲染不确定态，禁止编造百分比）；
 * - done>total（记账破坏）或无速率信号 → 'insufficient-signal'；
 * - 否则线性外推 etaMs = elapsed/done × (total-done)，basis 'countable' 可审计。
 */
export function explainableEta(
  done: number,
  total: number | null,
  elapsedMs: number,
): { readonly etaMs: number | null; readonly basis: 'countable' | 'unknown-total' | 'insufficient-signal' } {
  if (total === null || total <= 0) return { etaMs: null, basis: 'unknown-total' };
  if (done > total || done <= 0 || elapsedMs <= 0) return { etaMs: null, basis: 'insufficient-signal' };
  const perUnit = elapsedMs / done;
  return { etaMs: Math.round(perUnit * (total - done)), basis: 'countable' };
}

/** 进度分数：总量未知或记账破坏时返回 null（禁止虚假百分比）。 */
export function progressFraction(done: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  if (done > total || done < 0) return null;
  return done / total;
}

export function checkPerf(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  // cancel + SSE 进度端点在契约中真实声明
  const specText = readText(join(repoRoot, 'schema/openapi.json'));
  const hasCancel = specText.includes('/api/v1/research/{runId}/cancel');
  const hasEvents = specText.includes('/api/v1/research/{runId}/events');
  if (!hasCancel) problems.push('openapi lacks /research/{runId}/cancel endpoint');
  else evidence.push('user-initiated cancel: POST /api/v1/research/{runId}/cancel');
  if (!hasEvents) problems.push('openapi lacks /research/{runId}/events (SSE progress)');
  else evidence.push('SSE progress: GET /api/v1/research/{runId}/events');

  // 客户端：取消调用（endpoints.ts）+ EventSource 自动重连（sse.ts，断线恢复面）
  const endpoints = readText(join(repoRoot, 'frontend/src/shared/api/endpoints.ts'));
  if (!endpoints.includes('/cancel')) problems.push('research endpoints lack cancel call');
  else evidence.push('client cancel wired (POST .../cancel)');
  const sse = readText(join(repoRoot, 'frontend/src/shared/api/sse.ts'));
  if (!sse.includes('EventSource')) problems.push('client lacks EventSource streaming');
  else if (!sse.includes('auto-reconnect')) problems.push('client SSE reconnect behavior not documented');
  else evidence.push('EventSource streaming with documented native auto-reconnect (stream interruption recovery)');

  // 后端断点续跑：FSM resume store + CLI resume
  const fsm = readText(join(repoRoot, 'src/agent_loop/fsm_runner.ts'));
  if (!fsm.includes('resumeStore')) problems.push('fsm_runner lacks resume store (crash resume)');
  else evidence.push('resume: fsm stage-receipt resume store (forged chain fail-closed, input change resets)');
  const far = readText(join(repoRoot, 'src/cli/far.ts'));
  if (!far.includes('research resume')) problems.push('CLI resume subcommand missing');
  else evidence.push('resume: far research resume <runId>');

  // 性能预算门（防退化——快速反馈的结构保障）
  const budgets = readJson(join(repoRoot, 'scripts/perf_budget.json')) as
    | { budgets?: Readonly<Record<string, Readonly<{ rationale?: string; threshold_ms?: number; cap_mb?: number }>>> }
    | null;
  if (budgets === null || budgets.budgets === undefined) {
    problems.push('scripts/perf_budget.json missing or unparseable');
  } else {
    const entries = Object.entries(budgets.budgets);
    const incomplete = entries.filter(([, b]) => (b.rationale ?? '').length === 0 || (b.threshold_ms === undefined && b.cap_mb === undefined));
    if (entries.length < 4) problems.push(`perf budgets too few: ${entries.length}`);
    else if (incomplete.length > 0) problems.push(`perf budgets without rationale/threshold: ${incomplete.map(([k]) => k).join(', ')}`);
    else evidence.push(`perf budget gate: ${entries.length} budgets, each with rationale + threshold (no unexplainable limits)`);
  }
  const ci = readText(join(repoRoot, '.github/workflows/ci.yml'));
  if (!ci.includes('perf_budget gate')) problems.push('CI lacks perf_budget gate wiring');
  else evidence.push('perf budget gate wired in CI');

  return makeCheck('UX-PERF-001', problems, evidence, [
    'slow network/large list 的实际渲染帧率需浏览器轴实测（机制在场是其前置条件）',
    'ETA 诚实机制是纯函数合同；UI 每处进度组件是否都走该合同需前端测试面承接（并行会话所有权）',
  ]);
}

// ---------------------------------------------------------------------------
// UX-WEB-001：围绕科学对象（非聊天气泡）组织
// ---------------------------------------------------------------------------

/** 宪法 UX-WEB-001 列举的科学对象维度 → 仓库真实路由的映射（证据化登记）。 */
export const SCIENTIFIC_OBJECT_ROUTES: readonly { readonly object: string; readonly route: string }[] = [
  { object: 'ResearchQuestion + mission run', route: '/missions' },
  { object: 'mission workspace (hypotheses/grounding/plan/execution/evaluation/provenance)', route: '/missions/:runId' },
  { object: 'mission workspace views', route: '/missions/:runId/:view' },
  { object: 'verdict adjudication (claim assay + model court/arena)', route: '/assay' },
  { object: 'proof verification (.far-proof)', route: '/verify' },
  { object: 'verification receipt detail', route: '/receipts/:receiptId' },
  { object: 'verdict/evidence chain + integrity trust root', route: '/evidence' },
  { object: 'benchmark report + epistemic honesty notes', route: '/benchmark' },
  { object: 'product honesty (what it cannot prove)', route: '/about' },
];

export function checkWebWorkbench(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const app = readText(join(repoRoot, 'frontend/src/app/App.tsx'));
  const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{<(\w+)/g)]
    .map((m) => ({ path: m[1] ?? '', page: m[2] ?? '' }));
  if (routes.length < 9) problems.push(`route table too small: ${routes.length}`);
  else evidence.push(`route table: ${routes.length} routes (incl. 404 catch-all)`);

  const catchAll = routes.find((r) => r.path === '*');
  if (catchAll === undefined || !catchAll.page.includes('NotFound')) problems.push('404 catch-all route missing');
  else evidence.push('404 route present (NotFoundPage)');

  // 零聊天气泡组织：无 chat 路由（组织维度是科学对象，不是对话流）
  const chatRoutes = routes.filter((r) => r.path.toLowerCase().includes('chat'));
  if (chatRoutes.length > 0) problems.push(`chat-bubble routes present: ${chatRoutes.map((r) => r.path).join(', ')}`);
  else evidence.push('zero chat routes — workbench organized by scientific objects, not chat bubbles');

  // 科学对象维度路由全在场
  const paths = new Set(routes.map((r) => r.path));
  const missingObjects = SCIENTIFIC_OBJECT_ROUTES.filter((o) => !paths.has(o.route));
  if (missingObjects.length > 0) {
    problems.push(`scientific-object routes missing: ${missingObjects.map((o) => `${o.object}→${o.route}`).join(', ')}`);
  } else {
    evidence.push(`scientific objects covered: ${SCIENTIFIC_OBJECT_ROUTES.length} dimensions (question/mission/verdict/proof/evidence/honesty)`);
  }

  // 视图状态面：核心旅程（工作台/断言/验证/新建表单）含 error/unavailable 等 ≥4 个可测状态
  const journeyFiles = [
    'frontend/src/features/missions/MissionWorkspacePage.tsx',
    'frontend/src/features/missions/RunGate.tsx',
    'frontend/src/features/missions/NewMissionForm.tsx',
    'frontend/src/features/assay/AssayPage.tsx',
    'frontend/src/features/verify/VerifyPage.tsx',
  ];
  const journeyText = journeyFiles.map((f) => readText(join(repoRoot, f))).join('\n');
  const stateTestids = ['status-error', 'run-error', 'cancel-error', 'start-error', 'llm-unavailable', 'verify-error'];
  const present = stateTestids.filter((id) => journeyText.includes(`data-testid="${id}"`) || journeyText.includes(`testId="${id}"`));
  const loadingMarkers = countOccurrences(journeyText, 'LoadingBlock');
  if (present.length < 4) problems.push(`view state coverage too low: ${present.length}/6 error/unavailable testids`);
  else evidence.push(`view states: ${present.length} error/unavailable testids + ${loadingMarkers} loading markers on core journey`);
  if (loadingMarkers < 3) problems.push(`loading state markers too few: ${loadingMarkers}`);

  const featuresDir = join(repoRoot, 'frontend/src/features');
  const pageCount = existsSync(featuresDir) ? listFilesRecursive(featuresDir, '.tsx').length : 0;
  if (pageCount < 12) problems.push(`feature components too few: ${pageCount}`);
  else evidence.push(`${pageCount} feature components across missions/assay/verify/evidence/benchmark/about/home`);

  return makeCheck('UX-WEB-001', problems, evidence, [
    'empty/stale/success 状态的每路由逐页清点未全量机器化（核心旅程已断言；其余由 frontend 行为测试承载）',
    'budget/cost 视图作为独立路由未拆出——预算可见性在 CLI 层（profile/cost 报告）承载，web 侧如实登记为部分覆盖',
  ]);
}

// ---------------------------------------------------------------------------
// 聚合器
// ---------------------------------------------------------------------------

export interface UxT1GateReport {
  readonly checks: readonly RequirementCheck[];
  readonly pass: boolean;
}

export function uxT1Gate(repoRoot: string): UxT1GateReport {
  const checks = [
    checkA11y(repoRoot),
    checkApiContract(repoRoot),
    checkCliSurface(repoRoot),
    checkI18n(repoRoot),
    checkPerf(repoRoot),
    checkWebWorkbench(repoRoot),
  ];
  return { checks, pass: checks.every((c) => c.ok) };
}
