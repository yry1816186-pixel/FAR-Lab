#!/usr/bin/env node
// scripts/calibration_report.mjs — 置信度校准评估报告（2.md §4.5 补遗 R10·T1）。
//
// 读取探针 JSON（默认 b7 泄漏探针 + b8 冷门探针，可传文件路径覆盖），
// 经 src/research/evaluation/calibration.ts（纯函数·ECE 走 statistics SSOT）
// 计算 ECE + 可靠性图 + 条款降级判定（ECE > 0.15 → 置信度展示降级为
// 高/中/低分档），打印到 stdout 并落盘 .far/eval/calibration-report.{json,md}
// （gitignored 运行时证据）。退出码：0 正常完成（降级判定为 true 是评估
// 发现而非脚本失败）；2 输入缺失/无有效样本。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  computeCalibration,
  pairsFromProbeJson,
  reliabilityDiagramAscii,
  DEGRADE_ECE_THRESHOLD,
  INSUFFICIENT_SAMPLE_SIZE,
  PROBE_HIT_MAPPING_NOTE,
  CALIBRATION_CANNOT_PROVE_NOTE,
} from '../src/research/evaluation/calibration.ts';

const ROOT = process.cwd();
const EVAL_DIR = join(ROOT, '.far', 'eval');
const DEFAULT_INPUTS = [join(EVAL_DIR, 'leakage-probe-b7.json'), join(EVAL_DIR, 'obscure-probe-b8.json')];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/calibration_report.mjs [probeJsonFile ...]');
  console.log('  default inputs: .far/eval/leakage-probe-b7.json + .far/eval/obscure-probe-b8.json');
  process.exit(0);
}
const inputFiles = args.length > 0 ? args.map((a) => join(ROOT, a)) : DEFAULT_INPUTS;

// ─── 读取 + 提取（逐文件账本，跳过项计数呈现，从不静默丢弃） ────────────────

const perFile = [];
const allPairs = [];
for (const file of inputFiles) {
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`calibration_report: cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  const ex = pairsFromProbeJson(json);
  perFile.push({ file, ...ex });
  allPairs.push(...ex.pairs);
}

if (allPairs.length === 0) {
  console.error('calibration_report: no usable pairs extracted from the given inputs.');
  process.exit(2);
}

// ─── 计算（合并样本·默认 10 均匀分箱） ───────────────────────────────────────

const result = computeCalibration(allPairs);
const diagram = reliabilityDiagramAscii(result.bins);
const verdict = result.degradeToBands
  ? `DEGRADE-TO-BANDS: ECE ${result.ece.toFixed(4)} > ${DEGRADE_ECE_THRESHOLD} — 置信度展示降级为分档（高/中/低），禁用伪精确小数`
  : `KEEP-NUMERIC: ECE ${result.ece.toFixed(4)} <= ${DEGRADE_ECE_THRESHOLD} — 数值置信度展示维持（阈值语义：严格大于才降级）`;

// ─── stdout 报告 ─────────────────────────────────────────────────────────────

const lines = [];
lines.push('# Confidence Calibration Report (R10 T1)');
lines.push('');
for (const f of perFile) {
  const rel = f.file.replace(ROOT + '/', '').replace(/\\/g, '/');
  lines.push(
    `- ${rel}: ${f.pairs.length} pairs of ${f.totalResults} results` +
      ` (skipped: nonAnswered=${f.skippedNonAnswered}, missingConfidence=${f.skippedMissingConfidence},` +
      ` unknownRecall=${f.skippedUnknownRecall}, malformed=${f.skippedMalformed})`,
  );
}
lines.push('');
lines.push(`sampleSize: ${result.sampleSize} (insufficient flag < ${INSUFFICIENT_SAMPLE_SIZE}: ${result.insufficientSample})`);
lines.push(`ECE: ${result.ece.toFixed(6)} (bins=${result.binCount}, threshold=${DEGRADE_ECE_THRESHOLD}, strictly-greater)`);
lines.push(`overallMeanConfidence: ${result.overallMeanConfidence.toFixed(4)} · overallHitRate: ${result.overallHitRate.toFixed(4)} · direction: ${result.overconfidenceDirection}`);
lines.push('');
lines.push(`VERDICT: ${verdict}`);
lines.push('');
lines.push('```');
lines.push(diagram);
lines.push('```');
lines.push('');
lines.push(`> ${PROBE_HIT_MAPPING_NOTE}`);
lines.push('');
lines.push(`> ${CALIBRATION_CANNOT_PROVE_NOTE}`);
const text = lines.join('\n');
console.log(text);

// ─── 落盘（运行时证据·.far/eval/） ───────────────────────────────────────────

mkdirSync(EVAL_DIR, { recursive: true });
const generatedAt = new Date().toISOString();
const reportJson = {
  schemaVersion: 1,
  generatedAt,
  clause: '2.md §4.5 补遗 R10 (T1): 置信度校准评估',
  inputFiles: perFile.map((f) => ({
    file: f.file.replace(ROOT + '/', '').replace(/\\/g, '/'),
    pairs: f.pairs.length,
    totalResults: f.totalResults,
    skipped: {
      nonAnswered: f.skippedNonAnswered,
      missingConfidence: f.skippedMissingConfidence,
      unknownRecall: f.skippedUnknownRecall,
      malformed: f.skippedMalformed,
    },
  })),
  thresholds: { degradeEce: DEGRADE_ECE_THRESHOLD, comparison: 'strictly-greater', insufficientSampleBelow: INSUFFICIENT_SAMPLE_SIZE },
  calibration: result,
  verdict: { degradeToBands: result.degradeToBands, text: verdict },
  reliabilityDiagramAscii: diagram,
  notes: { hitMapping: PROBE_HIT_MAPPING_NOTE, cannotProve: CALIBRATION_CANNOT_PROVE_NOTE },
};
writeFileSync(join(EVAL_DIR, 'calibration-report.json'), JSON.stringify(reportJson, null, 2) + '\n', 'utf8');
writeFileSync(join(EVAL_DIR, 'calibration-report.md'), text + `\n\n(generated ${generatedAt}; machine-readable twin: calibration-report.json)\n`, 'utf8');
console.log(`\nwritten: .far/eval/calibration-report.json + .far/eval/calibration-report.md`);
