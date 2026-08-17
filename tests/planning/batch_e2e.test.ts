// tests/planning/batch_e2e.test.ts
// CORE-BATCH-001 e2e 联测：plan → spec → batch contract → closure 对拍，全链走真实 CLI 子进程。
// 证明规划门禁族作为一个流水线协同工作（不是各自为政的孤立命令），且 batch 合同的
// 开批门（合同完整性）与收批门（closure-evidence-match）都通过同一入口可机检。
//
// 真实依赖：spawnSync 真跑 src/cli/far.ts（无 mock）；临时文件用 os.tmpdir + mkdtemp，
// 用后清理（不留工作树垃圾）。

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runPlanning(args: readonly string[]): CliResult {
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'planning', ...args], {
    encoding: 'utf8',
    timeout: 30000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** 与本批（CORE-BATCH-001）真实工件同构的合法流水线四件套。 */
function writePipeline(dir: string): { plan: string; spec: string; contract: string; closure: string } {
  const plan = join(dir, 'plan.json');
  writeFileSync(plan, JSON.stringify({
    goal: 'batch contract 机检化（CORE-BATCH-001）',
    steps: [
      { id: 's1', action: '实现 batch_contract.ts schema+引擎', risk: 'P2', tools: ['Write'], dependsOn: [], verification: 'node --test tests/planning/batch_contract.test.ts' },
      { id: 's2', action: '接线 CLI batch 子命令', risk: 'P2', tools: ['Edit'], dependsOn: ['s1'], verification: 'node src/cli/far.ts planning batch --help' },
      { id: 's3', action: 'e2e 联测', risk: 'P2', tools: ['Write'], dependsOn: ['s2'], verification: 'node --test tests/planning/batch_e2e.test.ts' },
    ],
  }));

  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify({
    story: 'agent 需要把 batch 十二字段合同与收尾对账变成确定性门禁，消除口头完成声明',
    delta: { added: ['src/planning/batch_contract.ts', 'tests/planning/batch_contract.test.ts'], modified: ['src/cli/commands/planning.ts'], removed: [] },
    acceptanceCriteria: [
      { id: 'AC-1', statement: '12 字段合同合法输入过门', verification: 'far planning batch contract.json → exit 0' },
      { id: 'AC-2', statement: 'rollback=none 被拒', verification: 'validateBatchContract → ROLLBACK_NONE' },
      { id: 'AC-3', statement: '收尾对账 not_run fail-closed', verification: 'far planning batch --closure → exit 7' },
    ],
    risk: 'P2',
  }));

  const contract = join(dir, 'contract.json');
  writeFileSync(contract, JSON.stringify({
    batchId: 'batch-12',
    objective: '每个 batch 成为有界实验单元（CORE-BATCH-001）',
    valueHypothesis: '把宪法 §4.2 十二字段从口头协议变成机检门禁',
    scope: ['src/planning/batch_contract.ts', 'src/cli/commands/planning.ts'],
    nonScope: ['frontend/'],
    requirementIds: ['CORE-BATCH-001'],
    verifiedFacts: ['planning 域既有 6 子命令全部确定性'],
    unknowns: ['e2e 子进程测试在 Windows 的稳定性'],
    dependencies: [],
    allowedWriteSet: ['src/planning/**', 'src/cli/**', 'tests/planning/**'],
    acceptanceCommands: [
      { id: 'AC-typecheck', command: 'pnpm run typecheck', expected: 'exit 0' },
      { id: 'AC-unit', command: 'node --test tests/planning/batch_contract.test.ts', expected: '15 pass' },
      { id: 'AC-e2e', command: 'node --test tests/planning/batch_e2e.test.ts', expected: 'all pass' },
    ],
    risk: 'P2',
    rollback: 'git revert 单提交回滚（纯新增模块 + CLI 增量子命令）',
    expectedInformationGain: '证明收尾对账可机检，not_run 不可蒙混',
    stopConditions: ['与既有 planning 子命令路由冲突'],
  }));

  const closure = join(dir, 'closure.json');
  writeFileSync(closure, JSON.stringify({
    outcomes: [
      { kind: 'CAPABILITY_INCREMENT', evidence: 'PR 合并（SHA 见 checkpoint 批 12）' },
    ],
    acceptanceResults: {
      'AC-typecheck': { status: 'pass', actual: '0 errors' },
      'AC-unit': { status: 'pass', actual: '15 pass / 0 fail' },
      'AC-e2e': { status: 'pass', actual: 'all pass' },
    },
    filesWritten: [
      'src/planning/batch_contract.ts',
      'src/cli/commands/planning.ts',
      'tests/planning/batch_contract.test.ts',
      'tests/planning/batch_e2e.test.ts',
    ],
    unachieved: [],
    unknownsResolved: ['e2e 子进程测试在 Windows 的稳定性'],
  }));

  return { plan, spec, contract, closure };
}

test('CORE-BATCH-001 e2e: plan → spec → batch 开批门 → 收批门全链 exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-batch-e2e-'));
  try {
    const { plan, spec, contract, closure } = writePipeline(dir);

    const planRun = runPlanning(['plan', plan]);
    assert.equal(planRun.status, 0, `plan gate must pass: ${planRun.stderr}`);
    assert.match(planRun.stdout, /PLAN GATE PASS/);

    const specRun = runPlanning(['spec', spec]);
    assert.equal(specRun.status, 0, `spec gate must pass: ${specRun.stderr}`);
    assert.match(specRun.stdout, /SPEC GATE PASS.*3 verifiable ACs/);

    const openRun = runPlanning(['batch', contract]);
    assert.equal(openRun.status, 0, `batch contract gate must pass: ${openRun.stderr}`);
    assert.match(openRun.stdout, /CONTRACT PASS.*CORE-BATCH-001/);

    const closeRun = runPlanning(['batch', contract, '--closure', closure]);
    assert.equal(closeRun.status, 0, `closure match must pass: ${closeRun.stderr}`);
    assert.match(closeRun.stdout, /CLOSURE MATCH PASS.*3\/3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CORE-BATCH-001 e2e fail-closed: not_run 验收收尾被拒（exit 7 + 违规码可机读）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-batch-e2e-'));
  try {
    const { contract, closure } = writePipeline(dir);
    const closureObj = JSON.parse(readFileSync(closure, 'utf8')) as { acceptanceResults: Record<string, { status: string; actual: string }> };
    closureObj.acceptanceResults['AC-e2e'] = { status: 'not_run', actual: 'CI 中断' };
    const badClosure = join(dir, 'closure-notrun.json');
    writeFileSync(badClosure, JSON.stringify(closureObj));

    const r = runPlanning(['batch', contract, '--closure', badClosure, '--json']);
    assert.equal(r.status, 7);
    const payload = JSON.parse(r.stdout) as { match: string; violations: { code: string }[] };
    assert.equal(payload.match, 'FAIL');
    assert.ok(payload.violations.some((v) => v.code === 'ACCEPTANCE_NOT_RUN'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CORE-BATCH-001 e2e fail-closed: rollback=none 合同开批即拒（exit 7）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-batch-e2e-'));
  try {
    const { contract } = writePipeline(dir);
    const obj = JSON.parse(readFileSync(contract, 'utf8')) as Record<string, unknown>;
    obj.rollback = 'none';
    const badContract = join(dir, 'contract-none.json');
    writeFileSync(badContract, JSON.stringify(obj));

    const r = runPlanning(['batch', badContract]);
    assert.equal(r.status, 7);
    assert.match(r.stderr, /ROLLBACK_NONE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CORE-BATCH-001 e2e fail-closed: 缺文件 → exit 2；缺 --closure 参数值 → exit 2', () => {
  assert.equal(runPlanning(['batch', 'Z:/no/such/contract.json']).status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'far-batch-e2e-'));
  try {
    const { contract } = writePipeline(dir);
    assert.equal(runPlanning(['batch', contract, '--closure']).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
