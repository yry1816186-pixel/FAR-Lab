// C2 eval-ring 代码路径层审计脚本（CI gate·10_CI_pipeline.md §1 STEP 10 断言 1）
// 职责：扫描 src/eval-ring/ 下所有 .ts 文件，命中违规 import（competition adapter /
//       旧 provider 出口 / 旧 competition 调用入口）即 exit 1。
// 诚实三态（HANDOFF §5.2 反假绿·禁 `if [ ! -d ]; exit 0` 静默绿）：
//   - src/eval-ring/ 不存在或无 .ts 文件 → N/A（审计零文件，**绝不打印 "passed/OK"**）。
//     评测环模块属 V2 范围，V1 不强制存在；exit 0 不阻断 CI，但绑定不变量由
//     数据层审计（auditEvalRingDataLayer·purpose_tag）+ 单元测试（含正负 fixture）强制。
//   - 审计 ≥1 文件零违规 → OK（真断言，非空断言）。
//   - 发现违规 → FAIL exit 1。
// Node ESM .mjs（禁 import .ts·用 fs + path 直接扫描·类比 scripts/zero_tolerance_scan.mjs）

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here); // 仓库根（scripts/ 父目录）
const evalRingDir = join(repoRoot, 'src', 'eval-ring');

// 评测环代码路径层违规 import 模式（命中即评测环直连模型调用层）
const CODE_PATH_VIOLATION_PATTERNS = [
  { name: 'eval_ring_imports_aliyun_qwen_adapter', pattern: /from\s+['"][^'"]*llm_gateway\/adapters\/aliyun_qwen/ },
  { name: 'eval_ring_imports_provider_index', pattern: /from\s+['"][^'"]*provider\/index/ },
  { name: 'eval_ring_calls_competition_credential', pattern: /callForCompetitionCredential/ },
  { name: 'eval_ring_calls_bailian_cred', pattern: /callBailianForCred/ },
];

function walkTsFiles(dir) {
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = readdirSync(dir);
  const results = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!existsSync(evalRingDir)) {
  // 反假绿（HANDOFF §5.2）：目录缺失时禁声称 "passed/OK code-path audit"——审计零文件。
  // 绑定不变量 = 数据层 purpose_tag 审计 + 单元测试（tests/ci/eval_ring_audit.test.ts 含正负 fixture）。
  console.log(
    'EVAL_RING_AUDIT: code-path N/A — src/eval-ring/ 不存在（V1 无评测环模块·无代码路径可审计）',
  );
  console.log(
    'EVAL_RING_AUDIT: 绑定不变量 = 数据层审计（eval/scoring/gt_read 禁含 dashscope 响应），由 tests/ci/eval_ring_audit.test.ts 强制',
  );
  process.exitCode = 0;
} else {
  const files = walkTsFiles(evalRingDir);
  if (files.length === 0) {
    console.log(
      'EVAL_RING_AUDIT: code-path N/A — src/eval-ring/ 存在但无 .ts 文件（无代码路径可审计）',
    );
    process.exitCode = 0;
  } else {
    const findings = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const { name, pattern } of CODE_PATH_VIOLATION_PATTERNS) {
          if (pattern.test(line)) {
            findings.push(`${file}:${index + 1}: ${name}: ${line.trim()}`);
          }
        }
      }
    }
    if (findings.length > 0) {
      console.error(`EVAL_RING_AUDIT: FAIL (eval-ring code-path violations · audited ${files.length} files)`);
      console.error(findings.join('\n'));
      process.exitCode = 1;
    } else {
      // 真断言：实际审计了 ≥1 文件且零违规（非空断言·反假绿）。
      console.log(`EVAL_RING_AUDIT: OK (audited ${files.length} file(s), 0 code-path violations)`);
      process.exitCode = 0;
    }
  }
}
