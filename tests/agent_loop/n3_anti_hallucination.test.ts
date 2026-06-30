/**
 * N3 反幻觉测试：禁百炼 Node SDK 三大幻觉源（spec 06 §0 R1 互斥铁律 + N3 禁止项）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §0 N3 禁止项.
 *
 * N3 禁止项（绝不出现）：
 *   1. defaultHeaders —— 百炼 Node SDK 不支持此参数（OpenAI SDK 才有）
 *   2. 编造的 DashScope thinking HTTP header —— 百炼走顶层参数 enable_thinking
 *   3. OpenAI Python SDK 的 extra body 参数 —— Node SDK 无此参数
 *
 * 测试策略：扫 src/agent_loop/ + src/llm_gateway/adapters/aliyun_qwen/ 全部 .ts 文件，
 * 断言这三个字面量不出现（注释里的字面量也命中·强制零容忍）。
 *
 * 注：本测试文件用字符串拼接构造禁用字面量数组（避开 zero_tolerance_scan 字面量扫描），
 *     与 tests/ci/zero_tolerance_scan.test.ts 同属元测试（按设计含反模式字符串以驱动扫描器）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';


const SCAN_ROOTS = [
  'src/agent_loop',
  'src/llm_gateway/adapters/aliyun_qwen',
  'src/profiles',
] as const;

// 用字符串拼接构造禁用字面量数组（避开 zero_tolerance_scan 字面量扫描）
const N3_FORBIDDEN_LITERALS: readonly string[] = [
  'defaultHeaders',
  // 编造的 DashScope thinking header（百炼走顶层参数 enable_thinking·非 HTTP header）
  ['X-DashScope-', 'Enable-Thinking'].join(''),
  // OpenAI Python SDK 的 extra body 参数（Node SDK 无此参数）
  ['extra', '_body'].join(''),
];


function listTsFiles(dir: string, acc: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      listTsFiles(fullPath, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(fullPath);
    }
  }
  return acc;
}


test('N3：agent_loop + aliyun_qwen + profiles 全部 .ts 文件禁出现百炼 SDK 幻觉源', () => {
  const violations: string[] = [];
  for (const root of SCAN_ROOTS) {
    // [I] Warning：移除 try-catch 静默跳过——SCAN_ROOTS（agent_loop / aliyun_qwen / profiles）
    // 是项目核心目录，理应存在；若被重构移除，测试须 fail 暴露而非静默通过（N3 红线严肃性）。
    const files = listTsFiles(root);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const literal of N3_FORBIDDEN_LITERALS) {
        if (content.includes(literal)) {
          violations.push(`${file}: 含禁用字面量 "${literal}"`);
        }
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `N3 反幻觉违规（${violations.length} 处）:\n${violations.join('\n')}`,
  );
});


test('N3：enable_thinking 是顶层参数（非 header·非 Python SDK 参数）', () => {
  // 抽查 create_params.ts（aliyun_qwen adapter 的参数构造器）
  // [I] Warning：移除 try-catch 静默 return——文件已确认存在（adapter 已建全）；
  // 若未来被移除，测试须 fail 暴露（N3 第二条规则不可处于无验证状态）。
  const content = readFileSync(
    'src/llm_gateway/adapters/aliyun_qwen/create_params.ts',
    'utf8',
  );
  // enable_thinking 须作为 AliyunQwenCreateParams 的顶层字段（非嵌套在 headers/extra body 内）
  assert.equal(
    content.includes('enable_thinking?: boolean'),
    true,
    'create_params.ts 须含 `enable_thinking?: boolean` 顶层字段（N3：百炼顶层参数）',
  );
});
