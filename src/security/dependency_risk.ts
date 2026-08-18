/**
 * dependency_risk — SEC-DEPENDENCY-001 依赖风险管理。
 *
 * 职责：
 *   - `buildDependencyInventory(repoRoot)`：读真实 package.json（prod+dev 全量）
 *     + pnpm-lock.yaml 行级扫描提取 sha512 integrity → inventory；
 *   - `licenseGate(entries)`：许可证 allow/deny 门——gate **独立于调用方预填的
 *     licenseClass 重新分类原始 license 字符串**（防字段美化绕过）；copyleft/
 *     REVIEW 阻断；读得到但认不出的 unknown license → fail-closed 阻断发布；
 *     环境性读不到（依赖未安装）→ unverifiable 警告不阻断（与
 *     scripts/license_audit.mjs 非 strict 模式语义一致）；
 *   - ADVISORY_FEED（模拟撤包/投毒公告·全部标记 simulated）+
 *     `compromisedPackageDrill(dep)`：命中公告 → 隔离 + `scanPackageImports`
 *     真实扫描 src/ 中 import 该包的文件（爆炸半径）+ drill receipt；
 *   - `exportSbom(entries)`：CycloneDX-lite JSON（name/version/license/hash）；
 *   - `checkDependencyAdditions(prev, current)`：新增依赖必须携带书面理由
 *     （为何现有能力不能满足——宪法原文）。
 *
 * 与 scripts/license_audit.mjs 的分工：脚本是 CI 一次性入口（npm+Python 双轴），
 * 本模块是可 import/可测试的程序化库（inventory/drill/SBOM）——同一分类语义。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - integrity 来自 lockfile 自述——它证明「安装时校验过哈希」，不证明该哈希
 *     对应的包内容无害（代码内容审计不在范围内）；
 *   - license 分类基于 package.json 声明——不验证声明真实性（恶意包谎报 MIT
 *     检测不出）；
 *   - drill 是演练（simulated）——证明「流程可执行且爆炸半径可计算」，不证明
 *     真实撤包事件的响应时效；
 *   - import 扫描只覆盖 src 树全部 .ts/.tsx 文件的静态字面量 import——动态拼接的
 *     require 字符串模板检测不到。
 *
 * 零新依赖。模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// inventory
// ---------------------------------------------------------------------------

export type DependencyKind = 'prod' | 'dev';
export type LicenseClass = 'allowed' | 'review' | 'unknown' | 'unverifiable';

export interface DependencyEntry {
  readonly name: string;
  /** 从 specifier 提取的已装版本（lockfile/packages 实际版本）。 */
  readonly version: string;
  readonly kind: DependencyKind;
  /** package.json 中的原始 specifier（如 ^3.25.76）。 */
  readonly specifier: string;
  /** pnpm-lock.yaml 提取的 sha512 integrity（缺 lockfile/未命中 → undefined）。 */
  readonly integrity?: string | undefined;
  /** node_modules/<pkg>/package.json 声明的 license（读不到 → 'unverifiable'）。 */
  readonly license: string;
  readonly licenseClass: LicenseClass;
}

export interface DependencyInventory {
  readonly entries: readonly DependencyEntry[];
  readonly lockfileFound: boolean;
}

/** specifier → 版本串（^1.2.3 / ~1.2.3 / >=1.2.3 / 1.x → 提取首个版本形态）。 */
export function extractVersion(specifier: string): string {
  const m = /[0-9]+(\.[0-9]+)+(-[A-Za-z0-9.]+)?/.exec(specifier);
  return m ? m[0] : specifier;
}

/** 行级扫描 pnpm-lock.yaml：提取指定包的 integrity（确定性·零 YAML 依赖）。 */
export function extractLockIntegrity(lockContent: string, packageName: string): string | undefined {
  const lines = lockContent.split('\n');
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entryRe = new RegExp(`^  '${escaped}@[0-9][^']*':$`);
  const entryReUnquoted = new RegExp(`^  ${escaped}@[0-9][^:]*:$`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!entryRe.test(line) && !entryReUnquoted.test(line)) continue;
    // 向下找 resolution 行（最多 4 行——pnpm-lock 结构固定）。
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const m = /integrity: (sha512-[A-Za-z0-9+/=]+)/.exec(lines[j] ?? '');
      if (m?.[1]) return m[1];
      if ((lines[j] ?? '').startsWith('  ')) {
        // 仍是当前包的属性行——继续；遇到下一个包入口（2 空格 + 名字）即停。
        continue;
      }
    }
  }
  return undefined;
}

/** 读 node_modules/<pkg>/package.json 的 license 声明（读不到 → 'unverifiable'）。 */
function resolveLicense(repoRoot: string, packageName: string): string {
  const pkgPath = join(repoRoot, 'node_modules', packageName, 'package.json');
  if (!existsSync(pkgPath)) return 'unverifiable';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    if (typeof pkg.license === 'string') return pkg.license;
    if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
      const first = (pkg.licenses as readonly { type?: unknown }[])[0];
      if (first && typeof first.type === 'string') return first.type;
    }
    return 'unknown';
  } catch {
    return 'unverifiable';
  }
}

/** 原始 license 字符串 → 分类（gate 的独立复核 SSOT·大小写不敏感）。 */
export function classifyLicense(raw: string): LicenseClass {
  const norm = raw.trim().toLowerCase();
  if (norm === 'unverifiable') return 'unverifiable';
  const allowed = [
    /^mit(\b|$|\))/,
    /^apache(-2\.0| 2\.0| license|\b)/,
    /^bsd(-[23]|zero)?(-clause)?\b/,
    /^(bsd|new bsd|modified bsd)\b/,
    /^0bsd\b/,
    /^isc\b/,
    /^python-2\.0\b|^psf\b/,
    /^unlicense\b/,
    /^mpl-2\.0\b/,
    /^cc0(-1\.0)?\b/,
    /^zlib\b/,
    /^wtfpl\b/,
    /^blueoak-1\.0\.0\b/,
  ];
  if (allowed.some((re) => re.test(norm))) return 'allowed';
  const review = [
    /(^|\b)(gpl|agpl|lgpl|sspl)(-[0-9.]+)?(\b|$|\))/,
    /cc-by-nc/,
    /\bunlicensed\b/,
    /proprietary|commercial|all rights reserved/,
    /commons clause/,
    /busl-1\.1/,
  ];
  if (review.some((re) => re.test(norm))) return 'review';
  return 'unknown';
}

/** 构建依赖 inventory（真实 package.json + pnpm-lock.yaml + node_modules）。 */
export function buildDependencyInventory(repoRoot: string): DependencyInventory {
  const pkgJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lockPath = join(repoRoot, 'pnpm-lock.yaml');
  const lockfileFound = existsSync(lockPath);
  const lockContent = lockfileFound ? readFileSync(lockPath, 'utf8') : '';
  const entries: DependencyEntry[] = [];
  const seen = new Set<string>();
  const sections: readonly [DependencyKind, Record<string, string>][] = [
    ['prod', pkgJson.dependencies ?? {}],
    ['dev', pkgJson.devDependencies ?? {}],
  ];
  for (const [kind, deps] of sections) {
    for (const name of Object.keys(deps).sort()) {
      if (seen.has(name)) continue; // prod 优先（同名列表去重）
      seen.add(name);
      const specifier = deps[name] ?? '';
      const license = resolveLicense(repoRoot, name);
      entries.push({
        name,
        version: extractVersion(specifier),
        kind,
        specifier,
        integrity: lockfileFound ? extractLockIntegrity(lockContent, name) : undefined,
        license,
        licenseClass: classifyLicense(license),
      });
    }
  }
  return { entries, lockfileFound };
}

// ---------------------------------------------------------------------------
// license 门（fail-closed）
// ---------------------------------------------------------------------------

export interface LicenseGateResult {
  readonly ok: boolean;
  readonly blocked: readonly { name: string; license: string; reason: string }[];
  readonly warnings: readonly { name: string; note: string }[];
}

/**
 * 许可证发布门。**独立复核**每条 entry 的原始 license 字符串（不信任预填
 * licenseClass）——copyleft(REVIEW) 与 unknown fail-closed 阻断；unverifiable
 * （环境性读不到 node_modules）警告不阻断。
 */
export function licenseGate(entries: readonly DependencyEntry[]): LicenseGateResult {
  const blocked: { name: string; license: string; reason: string }[] = [];
  const warnings: { name: string; note: string }[] = [];
  for (const e of entries) {
    const reclassified = classifyLicense(e.license);
    if (reclassified === 'review') {
      blocked.push({ name: e.name, license: e.license, reason: `copyleft/proprietary license blocks release: ${e.license}` });
    } else if (reclassified === 'unknown') {
      blocked.push({ name: e.name, license: e.license, reason: `unknown license — fail-closed: release blocked until human adjudication` });
    } else if (reclassified === 'unverifiable') {
      warnings.push({ name: e.name, note: 'license unverifiable (package not installed in this environment)' });
    }
  }
  return { ok: blocked.length === 0, blocked, warnings };
}

// ---------------------------------------------------------------------------
// import 扫描（爆炸半径 SSOT）
// ---------------------------------------------------------------------------

function walkTsFiles(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of sorted) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walkTsFiles(full, out);
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
}

/** import 说明符 → npm 包名（@scope/name 取前两段·否则首段）。 */
function packageNameOfSpecifier(spec: string): string {
  const parts = spec.split('/');
  if (spec.startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? spec;
}

/**
 * 真实扫描 repoRoot/src 全量 .ts/.tsx 文件的 import 语句，返回 import 了指定
 * 包的文件清单（POSIX 相对路径·确定性排序）。精确包名匹配——'zod' 不会命中
 * 'zod-to-json-schema'。
 */
export function scanPackageImports(repoRoot: string, packageName: string): readonly string[] {
  const srcDir = join(repoRoot, 'src');
  if (!existsSync(srcDir)) return [];
  const files: string[] = [];
  walkTsFiles(srcDir, files);
  const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  const hits: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    importRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const spec = m[1] ?? '';
      // 相对/绝对/协议内导入不是 npm 包。
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      if (packageNameOfSpecifier(spec) === packageName) {
        hits.push(relative(repoRoot, file).replace(/\\/g, '/'));
        break; // 每文件记一次
      }
    }
  }
  return hits.sort();
}

// ---------------------------------------------------------------------------
// 模拟公告 feed + 撤包演练
// ---------------------------------------------------------------------------

export type AdvisorySeverity = 'critical' | 'high' | 'medium' | 'low';

/** 受影响版本约束。 */
export type AffectedVersions =
  | { readonly kind: 'all' }
  | { readonly kind: 'prefix'; readonly prefix: string }
  | { readonly kind: 'lt'; readonly version: string };

export interface AdvisoryEntry {
  readonly id: string;
  readonly packageName: string;
  readonly severity: AdvisorySeverity;
  readonly summary: string;
  readonly affectedVersions: AffectedVersions;
  readonly publishedAt: string;
  /** 演练公告必须显式标记 simulated（不冒充真实 CVE）。 */
  readonly simulated: boolean;
}

/**
 * 模拟公告 feed（drill 用·全部 simulated）：覆盖 miss 案例（repo 未用包）与
 * 演练案例说明。真实 feed 接入（OSV/npm advisory）是 V2 项——当前零网络。
 */
export const ADVISORY_FEED: readonly AdvisoryEntry[] = [
  {
    id: 'FAR-SIM-0001',
    packageName: 'event-stream-like-pkg',
    severity: 'critical',
    summary: '[SIMULATED] maintainer-transfer compromise drill (event-stream pattern)',
    affectedVersions: { kind: 'all' },
    publishedAt: '2026-08-01T00:00:00.000Z',
    simulated: true,
  },
  {
    id: 'FAR-SIM-0002',
    packageName: 'left-pad-like-pkg',
    severity: 'high',
    summary: '[SIMULATED] package withdrawal drill (left-pad pattern)',
    affectedVersions: { kind: 'prefix', prefix: '0.' },
    publishedAt: '2026-08-05T00:00:00.000Z',
    simulated: true,
  },
];

/** 简化 semver 比较（major.minor.patch 数值比较；非版本形态按字典序回退）。 */
function versionLt(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10));
  const pb = b.split('.').map((x) => Number.parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return a < b;
    if (x !== y) return x < y;
  }
  return false;
}

export function versionAffected(installed: string, affected: AffectedVersions): boolean {
  switch (affected.kind) {
    case 'all':
      return true;
    case 'prefix':
      return installed.startsWith(affected.prefix);
    case 'lt':
      return versionLt(installed, affected.version);
  }
}

export interface DrillReceipt {
  readonly receiptId: string;
  readonly packageName: string;
  readonly installedVersion: string;
  /** 'quarantined'（命中公告并隔离）| 'clean'（无命中）。 */
  readonly status: 'quarantined' | 'clean';
  readonly advisoryId: string | null;
  readonly severity: AdvisorySeverity | null;
  /** 真实 src/ import 扫描的爆炸半径（clean 时为空数组）。 */
  readonly blastRadius: readonly string[];
  /** sha256(排序文件清单 join)——爆炸半径指纹。 */
  readonly blastRadiusHash: string;
  readonly simulated: boolean;
  readonly drilledAt: string;
}

export interface DrillOptions {
  readonly repoRoot: string;
  /** 覆盖默认 ADVISORY_FEED（演练注入）。 */
  readonly feed?: readonly AdvisoryEntry[];
  /** 覆盖已安装版本（默认从 package.json specifier 提取）。 */
  readonly installedVersion?: string;
  readonly drilledAt?: string;
}

/**
 * 撤包/投毒演练：命中公告 → 隔离状态 + 真实扫描 import 爆炸半径 + receipt。
 * 演练不改动磁盘（quarantine 是状态标记 + 证据收集，物理隔离是 CI/运维动作）。
 */
export function compromisedPackageDrill(dep: string, options: DrillOptions): DrillReceipt {
  const feed = options.feed ?? ADVISORY_FEED;
  const inventory = buildDependencyInventory(options.repoRoot);
  const fromInv = inventory.entries.find((e) => e.name === dep);
  const installedVersion = options.installedVersion ?? fromInv?.version ?? 'not-installed';
  const hit = feed.find((a) => a.packageName === dep && versionAffected(installedVersion, a.affectedVersions));
  if (!hit) {
    return {
      receiptId: `drill-${dep}`,
      packageName: dep,
      installedVersion,
      status: 'clean',
      advisoryId: null,
      severity: null,
      blastRadius: [],
      blastRadiusHash: createHash('sha256').update('').digest('hex'),
      simulated: true,
      drilledAt: options.drilledAt ?? new Date().toISOString(),
    };
  }
  const blastRadius = scanPackageImports(options.repoRoot, dep);
  const blastRadiusHash = createHash('sha256').update(blastRadius.join('\n')).digest('hex');
  return {
    receiptId: `drill-${hit.id}-${dep}`,
    packageName: dep,
    installedVersion,
    status: 'quarantined',
    advisoryId: hit.id,
    severity: hit.severity,
    blastRadius,
    blastRadiusHash,
    simulated: hit.simulated,
    drilledAt: options.drilledAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// SBOM（CycloneDX-lite）
// ---------------------------------------------------------------------------

export interface SbomComponent {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /** lockfile integrity（sha512-…；未命中 → undefined）。 */
  readonly hash: string | undefined;
}

export interface Sbom {
  readonly bomFormat: 'CycloneDX';
  readonly specVersion: '1.5-lite';
  readonly components: readonly SbomComponent[];
}

/** SBOM 导出（确定性——按 name 排序；hash 未命中留 undefined 显式可见）。 */
export function exportSbom(entries: readonly DependencyEntry[]): Sbom {
  const components = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((e) => ({ name: e.name, version: e.version, license: e.license, hash: e.integrity }));
  return { bomFormat: 'CycloneDX', specVersion: '1.5-lite', components };
}

// ---------------------------------------------------------------------------
// 新增依赖门（书面理由强制）
// ---------------------------------------------------------------------------

export interface DependencyAddition {
  readonly name: string;
  readonly requiredJustification: string;
}

/**
 * 检出新增依赖（current - prev）——每个新增必须附书面理由说明为何现有能力
 * 不能满足（宪法 SEC-DEPENDENCY-001）。删除不触发（收紧总是允许）。
 */
export function checkDependencyAdditions(
  prevNames: readonly string[],
  currentNames: readonly string[],
): readonly DependencyAddition[] {
  const prev = new Set(prevNames);
  return currentNames
    .filter((n) => !prev.has(n))
    .sort()
    .map((name) => ({
      name,
      requiredJustification: `why existing capabilities cannot satisfy the need (为何现有能力不能满足——书面说明强制，见 SECURITY.md 依赖纪律)`,
    }));
}
