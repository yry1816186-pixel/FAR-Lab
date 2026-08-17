#!/usr/bin/env node
/**
 * novelty_wording_lint —— 公开面新颖性声明措辞 lint（CORE-NOVELTY-001）。
 *
 * 宪法：新颖性声明必须分级（ConjectureState 梯度：RAW_IDEA→…→KERNEL_ADJUDICATED→…）。
 * 本 lint 扫公开声明面（README 双语）的「新颖性超纲声明词」——命中即要求
 * ci/NOVELTY_RECEIPTS.yaml 收据绑定（出现级）：state ≥ CORROBORATED 才可声明 novel 级词、
 * state ≥ KERNEL_ADJUDICATED 才可声明 first-ever/首创/unprecedented 级词。
 *
 * 检测器特异性（防误伤，与 uncertainty 措辞审查同纪律）：
 *   命中词 = 无序数用法的超纲声明词（first-ever/unprecedented/breakthrough/novel
 *   breakthrough/首创/首创性/突破性/开创性/全新方案）。
 *   排除词 = 有合法序数/设计用法的词（first/novel/首次 单用——'first release'、
 *   'first-class'、'novelty 维度讨论' 是合法用法，不构成新颖性声明）。
 *
 * 规则：
 *   R1 命中行必须有收据覆盖（file+pattern）
 *   R2 收据 pattern 仍须匹配 ≥1 行（防陈旧收据）
 *   R3 超纲最高级（first-ever/首创/unprecedented/开创性）要求 state ≥ KERNEL_ADJUDICATED
 *   R4 证据非空且 state ∈ ConjectureState
 * 无收据文件 + 零命中 → PASS（当前面干净；出现声明时 fail-closed 并给绑定指引）。
 * 退出码：0 PASS / 1 FAIL / 2 参数错误。
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const SURFACES = ['README.md', 'README.zh-CN.md'];

/** 新颖性声明词（无歧义超纲级）——命中即需收据。 */
const NOVELTY_CLAIM_DETECTORS = [
  { name: 'first-ever', re: /\bfirst-ever\b/i, minState: 'KERNEL_ADJUDICATED' },
  { name: 'unprecedented', re: /\bunprecedented\b/i, minState: 'KERNEL_ADJUDICATED' },
  { name: 'breakthrough', re: /\bbreakthrough\b/i, minState: 'KERNEL_ADJUDICATED' },
  { name: '首创', re: /首创(?!次)/, minState: 'KERNEL_ADJUDICATED' },
  { name: '突破性', re: /突破性/, minState: 'KERNEL_ADJUDICATED' },
  { name: '开创性', re: /开创性/, minState: 'KERNEL_ADJUDICATED' },
  { name: 'novel-grade-claim', re: /\b(?:a|the) novel (?:system|method|approach|framework|engine)\b/i, minState: 'CORROBORATED' },
];

/** ConjectureState 梯度序（与 src/discovery/types.ts 同源镜像；漂移由测试对拍锁死）。 */
export const CONJECTURE_STATE_ORDER = [
  'RAW_IDEA',
  'STRUCTURED_CONJECTURE',
  'CORROBORATED',
  'KERNEL_ADJUDICATED',
  'REDISCOVERY',
  'NOVEL_VALIDATED',
];

const RECEIPTS_PATH = 'ci/NOVELTY_RECEIPTS.yaml';

export function stateRank(state) {
  return CONJECTURE_STATE_ORDER.indexOf(state);
}

export function scanSurfaces(surfaceTexts) {
  const hits = [];
  for (const [file, text] of Object.entries(surfaceTexts)) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const det of NOVELTY_CLAIM_DETECTORS) {
        if (det.re.test(line)) {
          hits.push({ file, lineNo: i + 1, line: line.trim(), detector: det.name, minState: det.minState });
        }
      }
    });
  }
  return hits;
}

export function lintNovelty(surfaceTexts, receiptsRaw) {
  const failures = [];
  const hits = scanSurfaces(surfaceTexts);
  const receipts = receiptsRaw !== null ? (parseYaml(receiptsRaw).receipts ?? []) : [];
  // 收据形状预检（与命中无关——孤儿坏收据同样 fail-closed）
  for (const r of receipts) {
    if (!CONJECTURE_STATE_ORDER.includes(r.state)) {
      failures.push(`R4 收据 ${r.id ?? '(no-id)'} state '${r.state}' 不在 ConjectureState 梯度`);
    }
    if (!Array.isArray(r.evidence) || r.evidence.length === 0) {
      failures.push(`R4 收据 ${r.id ?? '(no-id)'} evidence 为空`);
    }
  }
  for (const hit of hits) {
    const receipt = receipts.find(
      (r) => r.file === hit.file && typeof r.pattern === 'string' && r.pattern.length > 0
        && new RegExp(r.pattern, 'i').test(hit.line),
    );
    if (receipt === undefined) {
      failures.push(
        `R1 ${hit.file}:${hit.lineNo} [${hit.detector}] 未绑定收据 —— 在 ${RECEIPTS_PATH} 登记该出现（file+pattern 覆盖本行，state ≥ ${hit.minState}，evidence 非空）`,
      );
      continue;
    }
    if (!CONJECTURE_STATE_ORDER.includes(receipt.state)) {
      failures.push(`R4 ${receipt.id ?? '(no-id)'} state '${receipt.state}' ∉ ConjectureState 梯度`);
      continue;
    }
    if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0) {
      failures.push(`R4 ${receipt.id ?? '(no-id)'} evidence 为空`);
      continue;
    }
    if (stateRank(receipt.state) < stateRank(hit.minState)) {
      failures.push(
        `R3 ${hit.file}:${hit.lineNo} [${hit.detector}] 需 state ≥ ${hit.minState}，收据仅 ${receipt.state} —— 新颖性声明不得超出分级证据`,
      );
    }
  }
  // R2 陈旧收据：pattern 在登记面上已无任何命中
  for (const r of receipts) {
    if (typeof r.pattern !== 'string' || r.pattern.length === 0) continue;
    const stillMatches = Object.values(surfaceTexts).some((text) =>
      text.split(/\r?\n/).some((l) => new RegExp(r.pattern, 'i').test(l)),
    );
    if (!stillMatches) {
      failures.push(`R2 收据 ${r.id ?? '(no-id)'} pattern '${r.pattern}' 已不匹配任何行（陈旧收据→删除或更新）`);
    }
  }
  return { hits, failures };
}

function main() {
  if (process.argv.length > 2 && process.argv[2] !== '--check') {
    console.error('usage: node scripts/novelty_wording_lint.mjs [--check]');
    process.exit(2);
  }
  const surfaceTexts = {};
  for (const f of SURFACES) {
    if (!existsSync(f)) {
      console.error(`novelty_wording_lint: surface missing: ${f}`);
      process.exit(1);
    }
    surfaceTexts[f] = readFileSync(f, 'utf8');
  }
  const receiptsRaw = existsSync(RECEIPTS_PATH) ? readFileSync(RECEIPTS_PATH, 'utf8') : null;
  const { hits, failures } = lintNovelty(surfaceTexts, receiptsRaw);
  if (failures.length > 0) {
    console.error(`novelty_wording_lint: FAIL — ${failures.length} finding(s)`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`novelty_wording_lint: PASS — ${hits.length} novelty claim(s), all receipt-bound`);
  process.exit(0);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('novelty_wording_lint.mjs')) {
  main();
}
