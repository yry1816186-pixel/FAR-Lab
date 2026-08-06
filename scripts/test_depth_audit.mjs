#!/usr/bin/env node
/**
 * test_depth_audit.mjs — 测试有效性审计
 *
 * 替代覆盖率作为质量指标。覆盖率只衡量"代码被触及"，
 * 本工具衡量"代码被真正验证"。
 *
 * 验证深度等级:
 *   L1: 只调用不验证 (toBeDefined/toBeDefined/typeof check)
 *   L2: 验证happy path (toBe/equal具体值)
 *   L3: 验证边界/错误 (toThrow/rejects/error path)
 *   L4: 验证不变量 (tamper/mutation detection)
 *   L5: 对抗性测试 (attack corpus/property-based)
 *
 * 用法: node scripts/test_depth_audit.mjs [test-dir]
 * 输出: 每个文件的深度等级 + 总体统计
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.argv[2] || 'tests';

// Patterns that indicate each depth level
const L1_PATTERNS = [
  /toBeDefined\s*\(\s*\)/g,
  /toBeTruthy\s*\(\s*\)/g,
  /toBeDefined\s*\(\s*\)/g,
  /typeof\s+\w+\s*===\s*['"]\w+['"]/g,
];

const L2_PATTERNS = [
  /\.toBe\s*\(\s*[^u]/g,  // toBe(non-undefined)
  /\.toEqual\s*\(/g,
  /\.strictEqual\s*\(/g,
  /\.deepEqual\s*\(/g,
  /\.match\s*\(/g,
  /assert\.equal\s*\(/g,
];

const L3_PATTERNS = [
  /\.toThrow\s*\(/g,
  /\.rejects\s*\(/g,
  /assert\.throws\s*\(/g,
  /\.status.*[^0-9]0\b/g,  // error exit code
  /Error|error|fail|reject|invalid|invalid/i,
];

const L4_PATTERNS = [
  /tamper|mutat|inject|forge|forge|corrupt/i,
  /\.rejects\s*\(/g,
  /before.*after.*different/i,
];

const L5_PATTERNS = [
  /attack|adversarial|property.based|fuzz|chaos/i,
  /for\s+\w+\s+of\s+\w*attack/i,
  /corpus/i,
];

function countMatches(text, patterns) {
  let count = 0;
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

function classifyFile(content, filename) {
  const l1 = countMatches(content, L1_PATTERNS);
  const l2 = countMatches(content, L2_PATTERNS);
  const l3 = countMatches(content, L3_PATTERNS);
  const l4 = countMatches(content, L4_PATTERNS);
  const l5 = countMatches(content, L5_PATTERNS);

  // Determine file's max depth level
  let maxLevel = 0;
  if (l1 > 0) maxLevel = Math.max(maxLevel, 1);
  if (l2 > 0) maxLevel = Math.max(maxLevel, 2);
  if (l3 > 0) maxLevel = Math.max(maxLevel, 3);
  if (l4 > 0) maxLevel = Math.max(maxLevel, 4);
  if (l5 > 0) maxLevel = Math.max(maxLevel, 5);

  // Flag shallow files: mostly L1 with few L2+ assertions
  const total = l1 + l2 + l3 + l4 + l5;
  const shallowRatio = total > 0 ? l1 / total : 1;
  const isShallow = shallowRatio > 0.5 && total < 5;

  return { filename, l1, l2, l3, l4, l5, total, maxLevel, isShallow };
}

function walkDir(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.mjs')) {
      results.push(full);
    }
  }
  return results;
}

// Main
const files = walkDir(ROOT);
const analyses = [];
let shallowCount = 0;
const levelCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const analysis = classifyFile(content, file);
  analyses.push(analysis);
  if (analysis.isShallow) shallowCount++;
  levelCounts[analysis.maxLevel]++;
}

// Print report
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  TEST DEPTH AUDIT REPORT');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`Total test files: ${files.length}`);
console.log(`Shallow files (mostly L1): ${shallowCount} (${Math.round(shallowCount/files.length*100)}%)`);
console.log('');

console.log('Verification depth distribution:');
console.log('  L5 (adversarial):  ' + '█'.repeat(Math.round(levelCounts[5]/files.length*40)) + ` ${levelCounts[5]} files`);
console.log('  L4 (invariant):    ' + '█'.repeat(Math.round(levelCounts[4]/files.length*40)) + ` ${levelCounts[4]} files`);
console.log('  L3 (boundary):     ' + '█'.repeat(Math.round(levelCounts[3]/files.length*40)) + ` ${levelCounts[3]} files`);
console.log('  L2 (happy path):   ' + '█'.repeat(Math.round(levelCounts[2]/files.length*40)) + ` ${levelCounts[2]} files`);
console.log('  L1 (shallow):      ' + '█'.repeat(Math.round(levelCounts[1]/files.length*40)) + ` ${levelCounts[1]} files`);
console.log('  L0 (no assertions):' + '█'.repeat(Math.round(levelCounts[0]/files.length*40)) + ` ${levelCounts[0]} files`);

const l3plus = levelCounts[3] + levelCounts[4] + levelCounts[5];
const l3plusRatio = Math.round(l3plus / files.length * 100);
console.log('');
console.log(`L3+ ratio: ${l3plus}% (${l3plus}/${files.length}) — target: 80%+`);

if (shallowCount > 0) {
  console.log('\n⚠ SHALLOW TEST FILES (need rewrite):');
  analyses.filter(a => a.isShallow).forEach(a => {
    console.log(`  ${a.filename} — L${a.maxLevel}, ${a.total} assertions (mostly L1)`);
  });
}

// Exit code: 1 if too many shallow tests
if (shallowCount > files.length * 0.1) {
  console.log('\n✗ FAIL: Too many shallow test files (>10%)');
  process.exit(1);
}
if (l3plusRatio < 60) {
  console.log('\n✗ FAIL: L3+ ratio below 60%');
  process.exit(1);
}

console.log('\n✓ PASS');
process.exit(0);
