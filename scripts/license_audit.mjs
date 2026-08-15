/**
 * license_audit.mjs — DEF-15 偿还：依赖许可证合规扫描（发布前供应链门禁）。
 *
 * 职责：扫描 package.json 直接依赖 + pyproject.toml 核心依赖的许可证，按白名单/审查清单分类，
 *   任一非白名单（copyleft/proprietary/unknown）→ exit 1（发布前必须人工裁决）。
 *
 * 机制（零新依赖·确定性·离线·不触网）：
 *   - npm 直依：读 node_modules/<dep>/package.json 的 license/licenses 字段；
 *   - Python 直依：读 .venv/Lib/site-packages 或 .python-deps/<pkg>*.dist-info/METADATA 的
 *     License: 行 + Classifier: License :: 行（.venv 优先，.python-deps 为 fallback）；
 *   - 读不到（依赖未安装）→ 'unverifiable'（warn·非 fail，避免在未 install 环境误报）。
 *
 * 分类：
 *   ALLOWED    — 宽松许可证（MIT/Apache-2.0/BSD/ISC/0BSD/Python-2.0/Unlicense/MPL-2.0/CC0/Zlib/WTFPL）
 *   REVIEW     — copyleft 或专有（GPL/AGPL/LGPL/SSPL/CC-BY-NC/UNLICENSED/proprietary/Commons Clause）
 *   UNKNOWN    — 不在白名单且非明显 copyleft（发布前需人工核实）
 *
 * 退出码：REVIEW 或 UNKNOWN 任一命中 → exit 1；全 ALLOWED（或仅 unverifiable）→ exit 0。
 *
 * 权威：供应链纪律 + SECURITY.md 许可证合规。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回。
 *
 * 用法：
 *   node scripts/license_audit.mjs              扫描并打印分类报告
 *   node scripts/license_audit.mjs --strict     unverifiable 也算 fail（CI 严格模式）
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');

// 宽松许可证白名单（SPDX 或常见写法·大小写不敏感）。
const ALLOWED_PATTERNS = [
  // PyPI Classifier 权威信号（OSI Approved 宽松许可·numpy/sympy 等用此形式）
  /OSI Approved :: (BSD|MIT|Apache Software|ISC|Python Software Foundation|Mozilla Public|The Unlicense|Unicode|Boost Software|X11) License/i,
  /^mit(\b|$|\))/i,
  /^apache(?:-2\.0| 2\.0| license|-2\.0)/i,
  /^bsd-([23]|zero)-clause\b/i,
  /^(bsd|bsd license|bsd 3-clause|bsd 2-clause|modified bsd|new bsd)\b/i,
  /^0bsd\b/i,
  /^isc\b/i,
  /^python-2\.0\b|^psf(?:-2\.0)?\b|^python software foundation license\b/i,
  /^unlicense\b/i,
  /^mpl-2\.0\b/i,
  /^cc0-1\.0\b|^cc0\b/i,
  /^zlib\b/i,
  /^wtfpl\b/i,
  /^blueoak-1\.0\.0\b/i,
];

// copyleft / 专有 / 不可分发（须人工裁决·默认阻断发布）。
const REVIEW_PATTERNS = [
  /(^|\b)(gpl|agpl|lgpl|sspl)(-[0-9.]+)?(\b|$|\))/i,
  /cc-by-nc/i,
  /\bunlicensed\b/i,
  /proprietary|commercial|\"all rights reserved\"/i,
  /commons clause/i,
  /busl-1\.1/i,
  /polyform/i,
  /fair source/i,
];

function classify(raw) {
  const norm = String(raw ?? '').trim();
  if (norm.length === 0) return 'unknown';
  if (REVIEW_PATTERNS.some((re) => re.test(norm))) return 'review';
  if (ALLOWED_PATTERNS.some((re) => re.test(norm))) return 'allowed';
  return 'unknown';
}

function readNpmLicense(dep) {
  // pnpm：直接依赖在 node_modules/<dep>/ 有符号链接到 .pnpm 真实副本，package.json 可读。
  const pjPath = join(ROOT, 'node_modules', dep, 'package.json');
  if (!existsSync(pjPath)) return null; // unverifiable（未安装）
  try {
    const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
    if (typeof pj.license === 'string') return pj.license;
    if (Array.isArray(pj.licenses) && pj.licenses.length > 0) {
      return pj.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join('/');
    }
    if (pj.license !== undefined && typeof pj.license === 'object' && pj.license.type) return pj.license.type;
    return null;
  } catch {
    return null;
  }
}

function readPythonLicense(pkgSpec) {
  // pkgSpec 形如 "numpy>=1.24,<2.0" → 取包名 numpy
  const pkgName = pkgSpec.split(/[<>=!\\[]/)[0].trim().replace(/-/g, '_').toLowerCase();
  // 候选探测目录：活跃 .venv 优先（site-packages 为平台标准路径），旧 .python-deps 作 fallback，
  // 再加系统解释器 site-packages（CI setup-python 无 .venv 时 numpy 等装在系统环境）。
  const candidates = [
    join(ROOT, '.venv', 'Lib', 'site-packages'),
    join(ROOT, '.venv', 'lib', `python${process.env.PYTHON_VERSION ?? '3'}.${process.env.PYTHON_MINOR ?? '1'}`.replace(/^python/, ''), 'site-packages'),
    join(ROOT, '.python-deps'),
  ];
  // 动态探测当前 python 解释器的 site-packages（离线·确定性；python 不可用时静默跳过）
  try {
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const probe = spawnSync(pyCmd, ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    });
    const sysSp = probe.status === 0 && probe.stdout !== null ? probe.stdout.trim() : '';
    if (sysSp.length > 0 && !candidates.includes(sysSp)) candidates.push(sysSp);
  } catch {
    // python 不可用：静默跳过系统 site-packages 探测（回退到 .venv/.python-deps）
  }
  for (const depsDir of candidates) {
    if (!existsSync(depsDir)) continue;
    // 找匹配的 dist-info 目录
    const distInfo = readdirSync(depsDir).find(
      (d) => d.toLowerCase().endsWith('.dist-info') && d.toLowerCase().startsWith(pkgName),
    );
    if (distInfo === undefined) continue;
    const metaPath = join(depsDir, distInfo, 'METADATA');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = readFileSync(metaPath, 'utf8');
      const licLine = meta.split('\n').find((l) => /^License:/i.test(l));
      const licField = licLine !== undefined ? licLine.replace(/^License:/i, '').trim() : '';
      // PEP 639：numpy 2.5+ 等新包用 License-Expression: 字段（SPDX 表达式），替代旧 License: 行
      const licExprLine = meta.split('\n').find((l) => /^License-Expression:/i.test(l));
      const licExprField = licExprLine !== undefined ? licExprLine.replace(/^License-Expression:/i, '').trim() : '';
      // License: 字段常为 "UNKNOWN" 占位；回退读 Classifier: License :: 行
      const classifiers = meta
        .split('\n')
        .filter((l) => /^Classifier: License ::/i.test(l))
        .map((l) => l.replace(/^Classifier: License ::/, '').trim());
      const merged = [licField, licExprField, ...classifiers]
        .filter((s) => s.length > 0 && s.toUpperCase() !== 'UNKNOWN')
        .join(' | ');
      return merged.length > 0 ? merged : null;
    } catch {
      return null;
    }
  }
  return null;
}

function collectNpmDeps() {
  const pjPath = join(ROOT, 'package.json');
  if (!existsSync(pjPath)) return [];
  const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
  return Object.keys(pj.dependencies ?? {});
}

function collectPythonDeps() {
  const pyPath = join(ROOT, 'pyproject.toml');
  if (!existsSync(pyPath)) return [];
  const text = readFileSync(pyPath, 'utf8');
  // 朴素解析 [project] dependencies = [ ... ]（pyproject 段；不引 toml 依赖）。
  const m = text.match(/\[project\][\s\S]*?^dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (m === null || m[1] === undefined) return [];
  return m[1]
    .split('\n')
    .map((l) => l.trim().replace(/,$/, '').replace(/^["']|["']$/g, ''))
    .filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------

const findings = [];

for (const dep of collectNpmDeps()) {
  const lic = readNpmLicense(dep);
  const verdict = lic === null ? 'unverifiable' : classify(lic);
  findings.push({ ecosystem: 'npm', dep, license: lic ?? '(未安装/读不到)', verdict });
}

for (const spec of collectPythonDeps()) {
  const lic = readPythonLicense(spec);
  const verdict = lic === null ? 'unverifiable' : classify(lic);
  findings.push({ ecosystem: 'pypi', dep: spec, license: lic ?? '(未安装/读不到)', verdict });
}

const blocked = findings.filter((f) => {
  if (STRICT) return f.verdict === 'review' || f.verdict === 'unknown' || f.verdict === 'unverifiable';
  return f.verdict === 'review' || f.verdict === 'unknown';
});

console.log('═══════════════════════════════════════════');
console.log('  FAR-Lab License Audit (DEF-15 · 发布前供应链合规)');
console.log('═══════════════════════════════════════════');
for (const f of findings) {
  const tag = f.verdict === 'allowed' ? '[OK]   ' : f.verdict === 'review' ? '[BLOCK]' : f.verdict === 'unknown' ? '[CHECK]' : '[N/A]   ';
  console.log(`${tag} ${f.ecosystem.padEnd(4)} ${f.dep.padEnd(34)} ${f.license}`);
}
console.log('───────────────────────────────────────────');
const allowed = findings.filter((f) => f.verdict === 'allowed').length;
const unverifiable = findings.filter((f) => f.verdict === 'unverifiable').length;
console.log(`ALLOWED=${allowed}  REVIEW/UNKNOWN=${blocked.length}  UNVERIFIABLE=${unverifiable}  (strict=${STRICT})`);

if (blocked.length > 0) {
  console.error(`❌ license_audit: FAIL — ${blocked.length} 项需人工裁决:`);
  for (const f of blocked) console.error(`     ${f.ecosystem} ${f.dep}: ${f.license} [${f.verdict}]`);
  process.exit(1);
}
console.log(`✅ license_audit: PASS — ${allowed}/${findings.length} 直依为白名单宽松许可${unverifiable > 0 ? `（${unverifiable} 项未安装/读不到，非阻断·--strict 升级）` : ''}`);
process.exit(0);
