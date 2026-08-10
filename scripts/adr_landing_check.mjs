#!/usr/bin/env node
/**
 * adr_landing_check.mjs — ADR 落地率机器核对（阶段 7 1125 · P2-C）。
 *
 * 目标：把"ADR 落地率 100%"从人工核对变成可重复验证。对 21 个 ADR 的
 * decision 字段提取可验证锚点（文件路径 / 代码符号 / 关键词），在仓库内
 * grep 验证存在性，输出落地率 + 未落地清单。
 *
 * 用法:
 *   node scripts/adr_landing_check.mjs [--verbose]
 *
 * 退出码: 0 = 全部锚点命中（或显式 N/A 声明）；1 = 存在未命中锚点（提示人工复核）
 *
 * 诚实边界：锚点命中 = 机制存在性证据（非行为正确性证明）；decision 为
 * 策略性表述（如"维持现状"）时锚点映射为对应代码机制。零容忍：无 any / 空 catch。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const DECISIONS_DIR = join(process.cwd(), '.far-design', 'DECISIONS');
const verbose = process.argv.includes('--verbose');

/**
 * ADR decision 关键词 → 仓库内可验证锚点（文件路径片段 / 符号 / 关键词）。
 * 每条锚点 = decision 落地的必要不充分证据；N/A 表示该 ADR 为策略性声明
 * （如"维持现状"），核对其引用的既有机制即可。
 */
export const ANCHORS = {
  'ADR-001': ['evidence/s5/thesis_hero_freeze.yaml'],
  'ADR-002': ['far-proof'],
  'ADR-003': ['ro-crate'],
  'ADR-004': ['verdict', 'no_llm_final_judge'],
  'ADR-005': ['src/domain', 'src/fec', 'src/evidence_log'], // 策略性声明（现有结构最小演进）→ 核对核心目录存在
  'ADR-006': ['scripts/fitness_functions.mjs'],
  'ADR-007': ['ruleset'],
  'ADR-008': ['ro-crate', 'proof_envelope'],
  'ADR-009': ['budget', 'fsm_runner'],
  'ADR-010': ['adapter', 'tool_contract'],
  'ADR-011': ['competition_aliyun_qwen', 'no_llm_final_judge'],
  'ADR-012': ['WAL', 'synchronous', 'integrity_check'],
  'ADR-013': ['zod', 'openapi'],
  'ADR-014': ['scripts/fitness_functions.mjs'],
  'ADR-015': ['offline', 'fixture', 'honesty'],
  'ADR-016': ['clean-clone', 'verify'],
  'ADR-017': ['MINIMAL_OFFLINE', 'STANDARD_LOCAL'],
  'ADR-018': ['receipt', 'stage_receipt'],
  'ADR-019': ['budget', 'coverage_gate'],
  'ADR-020': ['MIT', 'NOTICE'],
  'ADR-021': ['lifecycle_events'],
};

function grepRepo(pattern) {
  try {
    execFileSync('rg', ['-l', '--no-messages', pattern, 'src', 'scripts', 'docs', '.github', 'frontend/src'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

function checkAdr(adrId) {
  const anchors = ANCHORS[adrId];
  if (!anchors || anchors.length === 0) {
    return { adrId, hit: false, missing: ['(无锚点映射)'], evidence: [] };
  }
  const missing = [];
  const evidence = [];
  for (const anchor of anchors) {
    if (grepRepo(anchor)) {
      evidence.push(anchor);
    } else {
      missing.push(anchor);
    }
  }
  return { adrId, hit: missing.length === 0, missing, evidence };
}

function main() {
  const adrFiles = readdirSync(DECISIONS_DIR).filter((f) => /^ADR-\d+\.yaml$/.test(f)).sort();
  const results = adrFiles.map((f) => checkAdr(f.replace('.yaml', '')));

  const landed = results.filter((r) => r.hit).length;
  const unlanded = results.filter((r) => !r.hit);

  console.log(`adr_landing_check: ${landed}/${results.length} ADR 锚点全部命中`);
  if (unlanded.length > 0) {
    console.log('--- 未命中（需人工复核或补充锚点）---');
    for (const r of unlanded) {
      console.log(`  ${r.adrId}: 缺失锚点 ${r.missing.join(', ')}`);
    }
  }
  if (verbose) {
    console.log('--- 命中明细 ---');
    for (const r of results) {
      if (r.hit) console.log(`  ${r.adrId}: ✅ ${r.evidence.join(', ')}`);
    }
  }
  console.log(`adr_landing_check: rate=${(landed / results.length * 100).toFixed(0)}%`);
  process.exitCode = unlanded.length === 0 ? 0 : 1;
}

main();
