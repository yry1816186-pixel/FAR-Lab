// C2 eval-ring 诚实降级审计：评测环代码路径层 + 数据层双层断言
// 权威 SSOT：FAR_CHAIN_DEV_SPEC/10_CI_pipeline.md §0 ⑦ + §1 STEP 10
//           FAR_CHAIN_DEV_SPEC/02_数据契约_DATA_CONTRACT.md §6.6（eval-ring 通道隔离 SSOT）
// 降级口径：类型层软隔离（PurposeTag 枚举）+ CI 事后审计，非进程级物理隔离

import type Database from 'better-sqlite3';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditViolation {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

/**
 * 数据层审计结果（real pass/fail on real DB rows）。
 * `ok` 仅在真实扫描了记录后由违规数判定。
 */
export interface AuditResult {
  readonly violations: readonly AuditViolation[];
  readonly ok: boolean;
}

/**
 * 代码路径层审计的诚实三态（HANDOFF §5.2 / 02 §7.2 反假绿）。
 * - `not_applicable`：eval-ring 模块不存在（V1 无评测环代码）或目录无 .ts 文件——
 *   审计零文件，**禁声称 "passed"**（对空集做空断言却声称通过 = 静默假绿）。
 * - `passed`：实际审计 ≥1 个 .ts 文件且零违规（真断言，非空断言）。
 * - `failed`：发现违规 import。
 */
export type EvalRingCodePathStatus = 'not_applicable' | 'passed' | 'failed';

export interface EvalRingCodePathResult {
  readonly status: EvalRingCodePathStatus;
  readonly violations: readonly AuditViolation[];
  /** 实际扫描的 .ts 文件数；not_applicable 时为 0。 */
  readonly auditedFiles: number;
}

// 评测环代码路径层违规 import 模式（命中即评测环直连模型调用层·破坏盲评诚实性）
// 权威：10_CI_pipeline.md §1 STEP 10 头部注释 + 02_数据契约 §6.6
const CODE_PATH_VIOLATION_PATTERNS: readonly {
  readonly rule: string;
  readonly pattern: RegExp;
}[] = [
  { rule: 'eval_ring_imports_aliyun_qwen_adapter', pattern: /from\s+['"][^'"]*llm_gateway\/adapters\/aliyun_qwen/ },
  { rule: 'eval_ring_imports_provider_index', pattern: /from\s+['"][^'"]*provider\/index/ },
  { rule: 'eval_ring_calls_competition_credential', pattern: /callForCompetitionCredential/ },
  { rule: 'eval_ring_calls_bailian_cred', pattern: /callBailianForCred/ },
];

// 评测环三通道（与 src/schema/enums.ts EVAL_RING_PURPOSES 同步）
const EVAL_RING_PURPOSE_TAGS: readonly string[] = ['eval', 'scoring', 'gt_read'];

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walkTsFiles(dir: string): readonly string[] {
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = readdirSync(dir);
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      const nested = walkTsFiles(fullPath);
      for (const file of nested) {
        results.push(file);
      }
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * C2 断言 1（代码路径层）：扫描 `${srcDir}/eval-ring/` 下所有 .ts 文件，
 * 命中违规 import（competition adapter / 旧 provider 出口 / 旧 competition 调用入口）即记录。
 *
 * 诚实三态（HANDOFF §5.2 反假绿·禁 `if [ ! -d ]; exit 0` 静默绿）：
 *   - 评测环目录不存在 / 无 .ts 文件 → `not_applicable`（审计零文件，禁声称 passed）。
 *   - 审计 ≥1 文件零违规 → `passed`（真断言）。
 *   - 发现违规 → `failed`。
 *
 * 评测环模块属 V2 范围，V1 不强制存在；目录缺失时不阻断 CI，但**绑定不变量**由
 * `auditEvalRingDataLayer`（数据层 purpose_tag 审计）+ 单元测试（含正负 fixture）强制。
 * 权威：10_CI_pipeline.md §1 STEP 10 断言 1 + HANDOFF §5.2。
 */
export function auditEvalRingCodePath(srcDir: string): EvalRingCodePathResult {
  const evalRingDir = join(srcDir, 'eval-ring');
  if (!existsSync(evalRingDir)) {
    return { status: 'not_applicable', violations: [], auditedFiles: 0 };
  }
  const dirStat = statSync(evalRingDir);
  if (!dirStat.isDirectory()) {
    return { status: 'not_applicable', violations: [], auditedFiles: 0 };
  }

  const files = walkTsFiles(evalRingDir);
  if (files.length === 0) {
    // 目录存在但无 .ts 文件——仍是无代码可审计，禁声称 passed（反假绿）。
    return { status: 'not_applicable', violations: [], auditedFiles: 0 };
  }
  const violations: AuditViolation[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const { rule, pattern } of CODE_PATH_VIOLATION_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            rule,
            file,
            line: index + 1,
            snippet: line.trim(),
          });
        }
      }
    }
  }
  if (violations.length > 0) {
    return { status: 'failed', violations, auditedFiles: files.length };
  }
  return { status: 'passed', violations: [], auditedFiles: files.length };
}

/**
 * C2 断言 2（数据层）：查询 call_records 中 purpose_tag IN ('eval','scoring','gt_read')
 * 的 record，检查 response_payload 是否含 dashscope ChatCompletion 响应特征。
 *
 * 违规判定（dashscope 响应特征）：
 *   - response_payload JSON 解析成功且含 `choices` 字段 → 违规（ChatCompletion 响应骨架）
 *   - response_payload JSON 解析成功且含 `dashscope_request_id` 字段 → 违规（原始响应回写）
 *   - response_payload 非 JSON（plain text）→ 不违规（评测环自身结构化输出）
 *
 * 权威：10_CI_pipeline.md §1 STEP 10 断言 2 + 02_数据契约 §6.6。
 */
export function auditEvalRingDataLayer(db: Database.Database): AuditResult {
  const placeholders = EVAL_RING_PURPOSE_TAGS.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT seq, purpose_tag, response_payload
       FROM call_records
       WHERE purpose_tag IN (${placeholders})`,
    )
    .all(...EVAL_RING_PURPOSE_TAGS) as readonly {
    readonly seq: number;
    readonly purpose_tag: string;
    readonly response_payload: string;
  }[];

  const violations: AuditViolation[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.response_payload);
    } catch {
      // 非 JSON（plain text）—— 评测环自身结构化输出，不违规
      continue;
    }
    if (!isStringRecord(parsed)) {
      // JSON 但非对象（纯数字/字符串/数组）—— 非模型响应特征，不违规
      continue;
    }
    if ('choices' in parsed) {
      violations.push({
        rule: 'eval_ring_data_dashscope_choices',
        file: `call_records#seq=${row.seq}`,
        line: row.seq,
        snippet: `purpose_tag=${row.purpose_tag}; response_payload contains "choices" (dashscope ChatCompletion shape)`,
      });
    }
    if ('dashscope_request_id' in parsed) {
      violations.push({
        rule: 'eval_ring_data_dashscope_request_id',
        file: `call_records#seq=${row.seq}`,
        line: row.seq,
        snippet: `purpose_tag=${row.purpose_tag}; response_payload contains "dashscope_request_id" key`,
      });
    }
  }
  return { violations, ok: violations.length === 0 };
}
