// tests/cli/governance.test.ts
// far governance CLI 端到端测试（真实引擎 + 临时登记文件，无 mock）。
// 覆盖：lint 通过/违规、stale 命中、trigger 状态转换 + 不可变账目追加、
// fail-closed 路径（源缺失 exit 3 / 非法转换 exit 7 / 用法错误 exit 2）。

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runGovernanceFromArgs } from '../../src/cli/commands/governance.ts';

let tmp: string;
let stdout: string;
let stderr: string;

function capture(fn: () => number | Promise<number>): number | Promise<number> {
  const prevOut = process.stdout.write.bind(process.stdout);
  const prevErr = process.stderr.write.bind(process.stderr);
  let out = '';
  let err = '';
  process.stdout.write = ((chunk: unknown): boolean => {
    out += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    err += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    if (code instanceof Promise) {
      return code.then((c): number => {
        stdout = out;
        stderr = err;
        return c;
      });
    }
    stdout = out;
    stderr = err;
    return code;
  } finally {
    process.stdout.write = prevOut;
    process.stderr.write = prevErr;
  }
}

test.before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'far-governance-'));
});

test.after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const REGISTRY_YAML = `unknowns:
  - id: UNK-1
    what: 对账是否闭合
    whyUnknown: 台账未导出
    impact: 成本声明不可发布
    investigation: 导出台账对拍
    blocking:
      - DEC-cost
    owner: coordinator
    targetEvidence:
      - 对拍记录
    status: OPEN
    resolvedAt: null
    resolutionEvidence: []
assumptions:
  - id: ASM-1
    statement: 测试强度充分
    evidence:
      - 实跑记录
    confidence: 0.8
    affectedDecisions:
      - DEC-cost
      - DEC-strength
    invalidationTrigger: 变异存活出现
    reviewDate: 2026-08-10
    reviewEvent: null
    status: ACTIVE
    invalidatedAt: null
    invalidationReason: null
`;

function writeRegistry(name = 'registry.yaml', content = REGISTRY_YAML): string {
  const p = join(tmp, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

test('lint: clean registry → exit 0; violation registry → exit 7 with rule detail', () => {
  const clean = writeRegistry('clean.yaml');
  const okCode = capture(() => runGovernanceFromArgs(['lint', '--registry', clean]));
  assert.equal(okCode, 0);
  assert.match(stdout, /PASS — 1 unknown\(s\), 1 assumption\(s\), 0 violation/);

  // 破坏：假设缺 review anchor + 未知项 RESOLVED 无证据
  const dirty = REGISTRY_YAML
    .replace('reviewDate: 2026-08-10', 'reviewDate: null')
    .replace('status: OPEN', 'status: RESOLVED');
  const dirtyPath = writeRegistry('dirty.yaml', dirty);
  const badCode = capture(() => runGovernanceFromArgs(['lint', '--registry', dirtyPath]));
  assert.equal(badCode, 7);
  assert.match(stdout, /assumption_missing_review_anchor/);
  assert.match(stdout, /unknown_resolved_without_evidence/);
});

test('lint fail-closed: missing registry source → exit 3; schema violation → exit 7', () => {
  const missing = capture(() => runGovernanceFromArgs(['lint', '--registry', join(tmp, 'nope.yaml')]));
  assert.equal(missing, 3);
  assert.match(stderr, /fail-closed/);

  const badSchema = writeRegistry('bad.yaml', 'unknowns: "not a list"\nassumptions: []\n');
  const bad = capture(() => runGovernanceFromArgs(['lint', '--registry', badSchema]));
  assert.equal(bad, 7);
  assert.match(stderr, /schema SSOT/);
});

test('stale: overdue assumption → exit 7 listing degraded conclusions', () => {
  const p = writeRegistry('stale.yaml'); // reviewDate 2026-08-10 < today
  const code = capture(() => runGovernanceFromArgs(['stale', '--registry', p, '--today', '2026-08-17']));
  assert.equal(code, 7);
  assert.match(stdout, /1 stale assumption/);
  assert.match(stdout, /DEGRADED DEC-cost <- ASM-1 \(stale\)/);

  const future = REGISTRY_YAML.replace('reviewDate: 2026-08-10', 'reviewDate: 2027-01-01');
  const futurePath = writeRegistry('fresh.yaml', future);
  const ok = capture(() => runGovernanceFromArgs(['stale', '--registry', futurePath, '--today', '2026-08-17']));
  assert.equal(ok, 0);
});

test('trigger: invalidation converts registry, appends immutable log, then rejects replay', () => {
  const p = writeRegistry('trigger.yaml');
  const logPath = join(tmp, 'reopen.jsonl');
  const eventJson = JSON.stringify({
    trigger: 'invalidated_assumption',
    at: '2026-08-17',
    assumptionId: 'ASM-1',
    reason: '变异存活出现',
  });

  const code = capture(() => runGovernanceFromArgs(['trigger', eventJson, '--registry', p, '--log', logPath]));
  assert.equal(code, 0);
  assert.match(stdout, /2 event\(s\)/);
  assert.match(stdout, /DEC-cost <- ASM-1/);

  // 登记已转换：ASM-1 → INVALIDATED（带理由）
  const updated = readFileSync(p, 'utf8');
  assert.match(updated, /status: INVALIDATED/);
  assert.match(updated, /invalidationReason: 变异存活出现/);
  // 账目：2 行 JSON（reopen + 无 impacted？DEC-cost 与 ASM-1 自身…… ASM-1 已失效不传播）
  const logLines = readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(logLines.length, 2);
  const first = JSON.parse(logLines[0]!) as { kind: string; subjectId: string; seq: number };
  assert.equal(first.kind, 'reopen');
  assert.equal(first.subjectId, 'DEC-cost');
  assert.equal(first.seq, 0);

  // 幂等失败路径：同一事件重放 → 非法转换 exit 7（只有 ACTIVE 可失效）
  const replay = capture(() => runGovernanceFromArgs(['trigger', eventJson, '--registry', p, '--log', logPath]));
  assert.equal(replay, 7);
  assert.match(stderr, /only ACTIVE assumptions can be invalidated/);
  // 账目未被污染（仍是 2 行）
  assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 2);
});

test('trigger: dry-run leaves registry and log untouched', () => {
  const p = writeRegistry('dry.yaml');
  const logPath = join(tmp, 'dry-log.jsonl');
  const eventJson = JSON.stringify({
    trigger: 'new_evidence',
    at: '2026-08-17',
    unknownId: 'UNK-1',
    resolutionEvidence: ['对拍记录 2026-08-17'],
  });
  const code = capture(() =>
    runGovernanceFromArgs(['trigger', eventJson, '--registry', p, '--log', logPath, '--dry-run']),
  );
  assert.equal(code, 0);
  assert.match(stdout, /dry-run/);
  assert.match(readFileSync(p, 'utf8'), /status: OPEN/);
  assert.equal(existsSync(logPath), false);
});

test('trigger usage errors: bad JSON and empty subjects → exit 2', () => {
  const p = writeRegistry('usage.yaml');
  assert.equal(capture(() => runGovernanceFromArgs(['trigger', '{not json', '--registry', p])), 2);
  assert.equal(
    capture(() =>
      runGovernanceFromArgs([
        'trigger',
        JSON.stringify({ trigger: 'regression', at: '2026-08-17', subjectIds: [], causeRef: 'x', reason: 'r' }),
        '--registry',
        p,
      ]),
    ),
    7, // 合法 JSON 但空 subjects → 引擎非法转换（exit 7 而非 2：形状对、语义拒）
  );
  assert.equal(capture(() => runGovernanceFromArgs(['nonsense'])), 2);
});
