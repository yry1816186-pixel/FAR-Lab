/**
 * model_neutrality 测试——src/api/ 模型中立 grep（24§0.1 红线）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/24_API网关与接口规范_API_GATEWAY.md §0.1.
 *
 * 覆盖：
 *   - src/api/ 不含 Qwen 字面量（注释剥离后·避免文档性注释误报）
 *   - src/api/ 不含 百炼 字面量（注释剥离后）
 *   - src/api/ 不含 DashScope 字面量（注释剥离后）
 *   - src/api/ 目录结构存在（server.ts + routes/ + auth/ + errors/·健全性检查）
 *
 * 红线合规：模型中立铁律要求 Core 不出现 Qwen/百炼/DashScope 字面量（这些只允许
 * 出现在 llm_gateway/adapters/aliyun_qwen + competition_aliyun_qwen）。
 * 测试采用注释剥离策略（与 zero_tolerance_scan.mjs stripLineComment 对齐），
 * 避免对文档性注释（如「无 Qwen / 百炼 / DashScope 字面量」）产生误报。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const apiDir = fileURLToPath(new URL('../../src/api/', import.meta.url));

function walkApiDir(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkApiDir(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 剥离行注释（与 scripts/zero_tolerance_scan.mjs stripLineComment 对齐）。
 *
 * 设计理由：注释中提及禁用字面量（如「无 Qwen / 百炼 / DashScope 字面量」）是合法
 * 文档化反 theater 实践，不应触发红线 grep；真实代码违规仍会被捕获。
 */
function stripLineComment(filePath: string, rawLine: string): string {
  const ext = extname(filePath).toLowerCase();
  const trimmed = rawLine.trimStart();

  if (trimmed === '') return '';
  if (trimmed.startsWith('*')) return '';
  if (trimmed.startsWith('/*')) return '';
  if (trimmed.startsWith('*/')) return '';

  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
    const idx = rawLine.indexOf('//');
    if (idx >= 0) {
      return rawLine.slice(0, idx);
    }
    return rawLine;
  }

  return rawLine;
}

function findLiteralInApi(literalPattern: RegExp): string[] {
  const findings: string[] = [];
  for (const file of walkApiDir(apiDir)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const [idx, rawLine] of lines.entries()) {
      const stripped = stripLineComment(file, rawLine);
      if (literalPattern.test(stripped)) {
        findings.push(`${file}:${idx + 1}: ${rawLine.trim()}`);
      }
    }
  }
  return findings;
}

test('src/api/ has no Qwen literal (model neutrality red line)', () => {
  const findings = findLiteralInApi(/qwen/i);
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/api/ has no 百炼 literal (model neutrality red line)', () => {
  const findings = findLiteralInApi(/百炼/);
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/api/ has no DashScope literal (model neutrality red line)', () => {
  const findings = findLiteralInApi(/dashscope/i);
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('src/api/ directory structure exists with expected files', () => {
  const files = walkApiDir(apiDir);
  assert.ok(files.length >= 10, `expected at least 10 .ts files in src/api/, got ${files.length}`);

  const relativePaths = files.map((f) => f.replace(/\\/g, '/').replace(/.*src\/api\//, ''));
  assert.ok(relativePaths.includes('server.ts'), 'missing server.ts');
  assert.ok(relativePaths.includes('types.ts'), 'missing types.ts');
  assert.ok(relativePaths.some((p) => p.startsWith('routes/')), 'missing routes/');
  assert.ok(relativePaths.some((p) => p.startsWith('auth/')), 'missing auth/');
  assert.ok(relativePaths.some((p) => p.startsWith('errors/')), 'missing errors/');
});
