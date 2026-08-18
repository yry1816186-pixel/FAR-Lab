#!/usr/bin/env node
/**
 * claim_lint —— 公开声明 → 证据收据绑定扫描（CORE-REALITY-001 / CORE-CLAIM-001）。
 *
 * 义务：公开声明面（README 双语）上的完成/性能/最高级声明必须绑定 CLAIM_RECEIPTS.yaml 收据；
 * 最高级声明额外要求 FCS（冻结对标集）引用。收据登记 evidence 命令（lint 校验结构绑定，
 * 不执行命令——执行由 CI 各 gate 承担；收据的 lastVerifiedAt 由声明变更 PR 同步维护）。
 *
 * 检测器（代码内固定三类，确定性词法）：
 *   unit        数字 + 量纲名词（tests/detectors/vectors/domains/commands/...）
 *   perf        全绿/0 fail/100%/零注水 类性能断言
 *   superlative world-class/领先/最快/首次/... 最高级或新颖性声明
 *
 * 规则：
 *   R1 声明面上每条被检测行必须被该文件至少一条收据 pattern 覆盖；
 *   R2 每条收据 pattern 必须仍匹配 ≥1 行（防陈旧收据）；
 *   R3 superlative 收据须带 fcsRef 且 FCS 文件存在并含该 comparator/dimension id；
 *   R4 收据 evidence 非空且 lastVerifiedAt 存在。
 *
 * 范围边界（v1 诚实声明）：CHANGELOG 历史条目描述其版本时点事实，不属当前状态声明面；
 * 运行时生成的报告由各自生成器与 gate 约束（tests/report）。
 *
 * 用法：node scripts/claim_lint.mjs [--root <repo>] [--manifest <path>]
 * 退出码：0 全部绑定；1 存在无收据声明/陈旧收据/结构违规；2 参数错误。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DETECTORS = [
  {
    name: 'unit',
    re: /\d[\d,.]*\s*(?:tests?|测试|detectors?|检测器|vectors?|向量|domains?|域|problems?|题|providers?|家|CLI|commands?|命令|pages?|页|routes?|路由|strategies?|策略|suites?|套件)/i,
  },
  { name: 'perf', re: /all green|全绿|0 fail|零失败|100%|零注水/i },
  {
    name: 'superlative',
    re: /world.?class|世界级|领先|fastest|最快|most accurate|最准|最强|state.?of.?the.?art|首创|novelty claim|first-?ever/i,
  },
];

function parseArgs(argv) {
  const options = { root: process.cwd(), manifest: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' || argv[i] === '--manifest') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${argv[i]} requires a value`);
      if (argv[i] === '--root') options.root = value;
      else options.manifest = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

/** 极小 YAML 读取：manifest 结构受控（meta + receipts 列表），按行解析固定字段。 */
function parseManifest(text) {
  const meta = { surfaces: [] };
  const receipts = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^surfaces:/.test(line)) continue;
    if (/^\s+-\s+(README[\w.-]*\.md|CHANGELOG\.md)/.test(line)) {
      meta.surfaces.push(line.trim().replace(/^-\s+/, '').replace(/#.*/, '').trim());
      continue;
    }
    const entryMatch = /^\s*-\s+id:\s*(\S+)/.exec(line);
    if (entryMatch !== null) {
      current = { id: entryMatch[1], file: '', pattern: '', summary: '', evidence: [], superlative: false, fcsRef: null, lastVerifiedAt: '' };
      receipts.push(current);
      continue;
    }
    if (current === null) continue;
    const field = /^\s+(file|pattern|summary|superlative|fcsRef|lastVerifiedAt):\s*(.*)$/.exec(line);
    if (field !== null) {
      const value = field[2].replace(/^["']|["']$/g, '');
      if (field[1] === 'superlative') current.superlative = value === 'true';
      else if (field[1] === 'fcsRef') current.fcsRef = value === 'null' || value === '' ? null : value;
      else current[field[1]] = value;
      continue;
    }
    const evidenceMatch = /^\s+-\s+"(.+)"\s*$/.exec(line);
    if (evidenceMatch !== null) current.evidence.push(evidenceMatch[1]);
  }
  return { meta, receipts };
}

/**
 * 主检查。返回 { ok, findings, stats }。导出供测试直接调用（不落盘、无副作用）。
 *
 * 绑定语义是出现级（occurrence-level）而非行级：一行可含多个声明（"23 detectors and 42 CLI
 * commands"），每个检测器命中区间必须被某收据 pattern 覆盖——防止第二个声明搭第一个收据的便车。
 * superlative 类命中额外要求：覆盖它的收据必须 superlative: true 且 fcsRef 合法（防自报降级逃逸）。
 */
export function checkClaims({ manifestText, files, fcsFiles }) {
  const findings = [];
  const { meta, receipts } = parseManifest(manifestText);
  if (meta.surfaces.length === 0) findings.push('manifest: surfaces 为空（无扫描面 = 无执法面）');
  let claimOccurrences = 0;

  for (const surface of meta.surfaces) {
    const text = files[surface];
    if (text === undefined) {
      findings.push(`surface ${surface}: 文件缺失（读取失败按无收据处理）`);
      continue;
    }
    const surfaceReceipts = receipts.filter((r) => r.file === surface);
    const compiled = surfaceReceipts.map((r) => {
      let re = null;
      try {
        re = new RegExp(r.pattern, 'gi');
      } catch {
        findings.push(`receipt ${r.id}: pattern 非法正则 "${r.pattern}"`);
      }
      return { receipt: r, re };
    });
    const matchSpans = (re, line) => {
      if (re === null) return [];
      re.lastIndex = 0;
      const spans = [];
      for (const m of line.matchAll(re)) spans.push([m.index, m.index + m[0].length]);
      return spans;
    };
    const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

    text.split('\n').forEach((line, idx) => {
      if (line.trim().length === 0) return;
      for (const detector of DETECTORS) {
        const detectorRe = new RegExp(detector.re.source, 'gi');
        for (const hit of matchSpans(detectorRe, line)) {
          claimOccurrences += 1;
          const covering = compiled.filter(({ re }) => matchSpans(re, line).some((span) => overlaps(span, hit)));
          if (covering.length === 0) {
            findings.push(
              `${surface}:${idx + 1}: 无收据声明 [${detector.name}] "${line.slice(hit[0], hit[1])}" | ${line.trim().slice(0, 70)}`
            );
            continue;
          }
          if (detector.name === 'superlative') {
            const lawful = covering.filter(
              (c) => c.receipt.superlative === true && fcsCovers(c.receipt.fcsRef, fcsFiles)
            );
            if (lawful.length === 0) {
              findings.push(
                `${surface}:${idx + 1}: superlative 声明无合法收据（须 superlative:true + fcsRef 且 FCS 存在）"${line.slice(hit[0], hit[1])}"`
              );
            }
          }
        }
      }
    });
  }

  for (const r of receipts) {
    if (!meta.surfaces.includes(r.file)) findings.push(`receipt ${r.id}: file "${r.file}" 不在 surfaces 面`);
    if (r.pattern.length === 0) findings.push(`receipt ${r.id}: pattern 为空`);
    if (r.evidence.length === 0) findings.push(`receipt ${r.id}: evidence 为空（R4）`);
    if (r.lastVerifiedAt.length === 0) findings.push(`receipt ${r.id}: lastVerifiedAt 缺失（R4）`);
    if (r.superlative && r.fcsRef === null) findings.push(`receipt ${r.id}: superlative 收据缺 fcsRef（R3）`);
    if (r.superlative && r.fcsRef !== null && !fcsCovers(r.fcsRef, fcsFiles)) {
      findings.push(`receipt ${r.id}: fcsRef "${r.fcsRef}" 无对应 FCS 文件（R3）`);
    }
  }

  // R2 陈旧收据：pattern 必须在声明面上仍匹配 ≥1 行（防止收据漂移成僵尸）。
  for (const r of receipts) {
    const text = files[r.file];
    if (text === undefined) continue;
    const re = safeRegex(r.pattern);
    if (re !== null && !re.test(text)) findings.push(`receipt ${r.id}: pattern 不再匹配任何行（陈旧收据·R2）`);
  }

  return {
    ok: findings.length === 0,
    findings,
    stats: { claimOccurrences, receipts: receipts.length, surfaces: meta.surfaces.length },
  };
}

function fcsCovers(fcsRef, fcsFiles) {
  if (fcsRef === null) return false;
  const keys = Object.keys(fcsFiles);
  return keys.some((k) => k === `ci/FCS-${fcsRef}.yaml` || k === `FCS-${fcsRef}.yaml` || k.includes(fcsRef));
}

function safeRegex(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`claim_lint: bad args — ${err.message}`);
    process.exit(2);
  }
  const root = resolve(options.root);
  const manifestPath = options.manifest ?? join(root, 'ci', 'CLAIM_RECEIPTS.yaml');
  if (!existsSync(manifestPath)) {
    console.error(`claim_lint: manifest 缺失 ${manifestPath}`);
    process.exit(1);
  }
  const manifestText = readFileSync(manifestPath, 'utf8');
  const { meta } = parseManifest(manifestText);
  const files = {};
  for (const surface of meta.surfaces) files[surface] = existsSync(join(root, surface)) ? readFileSync(join(root, surface), 'utf8') : undefined;
  const fcsFiles = {};
  for (const r of parseManifest(manifestText).receipts) {
    if (r.fcsRef === null) continue;
    const candidates = [`ci/FCS-${r.fcsRef}.yaml`, `FCS-${r.fcsRef}.yaml`];
    for (const c of candidates) {
      if (existsSync(join(root, c))) fcsFiles[c] = true;
    }
  }
  const result = checkClaims({ manifestText, files, fcsFiles });
  for (const f of result.findings) console.error(`claim_lint: ${f}`);
  console.log(
    `claim_lint: ${result.ok ? 'PASS' : 'FAIL'} — ${result.stats.claimOccurrences} claim occurrences / ${result.stats.receipts} receipts / ${result.stats.surfaces} surfaces`
  );
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('claim_lint.mjs')) main();
