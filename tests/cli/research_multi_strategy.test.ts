// tests/cli/research_multi_strategy.test.ts
// `far research start --multi-strategy` 的 CLI 契约（offline replay·不触网·临时 store root）：
//   - 参数解析：--multi-strategy / --strategies 子集（目录序）/ 坏名 fail-closed（exit 路径与消息）
//   - --strategies 无 --multi-strategy → 报错（子集只作用于 fan-out）
//   - 端到端冒烟：multi 模式全 8 阶段 → exit 0 + stderr fan-out 摘要三行 + stdout JSON
//     候选带 strategyOrigin + checkpoint 持久化 hypothesisGenerationStrategy（resume 稳定性）

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseResearchArgs } from '../../src/cli/commands/research.ts';
import type { RunCheckpoint } from '../../src/research/run_lifecycle.ts';

test('parseResearchArgs: --multi-strategy and --strategies (catalog-ordered subset)', () => {
  const parsed = parseResearchArgs([
    'q?',
    '--multi-strategy',
    '--strategies',
    'analogy,induction',
  ]);
  assert.equal(parsed.multiStrategy, true);
  // Catalog order regardless of user input order (determinism).
  assert.deepEqual(parsed.strategies, ['induction', 'analogy']);
});

test('parseResearchArgs: default is the legacy single-shot path', () => {
  const parsed = parseResearchArgs(['q?']);
  assert.equal(parsed.multiStrategy, false);
  assert.equal(parsed.strategies, null);
});

test('parseResearchArgs: unknown strategy name fails closed', () => {
  assert.throws(
    () => parseResearchArgs(['q?', '--multi-strategy', '--strategies', 'telepathy']),
    /unknown strategy id\(s\): telepathy/,
  );
});

test('parseResearchArgs: --strategies without --multi-strategy is rejected', () => {
  assert.throws(
    () => parseResearchArgs(['q?', '--strategies', 'induction']),
    /requires --multi-strategy/,
  );
});

test('far research start --multi-strategy --profile offline_replay → exit 0 + fan-out summary + persisted mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-multi-'));
  const runsRoot = join(dir, 'runs');
  try {
    const r = spawnSync(
      process.execPath,
      [
        'src/cli/far.ts',
        'research',
        'start',
        'Does stellar activity inflate hot Jupiter radii?',
        '--profile',
        'offline_replay',
        '--multi-strategy',
        '--strategies',
        'induction,analogy,contradiction_mining',
        '--json',
      ],
      {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, FAR_RESEARCH_RUNS_DIR: runsRoot },
      },
    );
    assert.equal(r.status, 0, r.stderr);

    // The fan-out summary is user-visible on stderr (honest accounting).
    assert.match(r.stderr, /discovery fan-out: 3 strategies → \d+ candidates kept/);
    assert.match(r.stderr, /induction: \d+ · analogy: \d+ · contradiction_mining: \d+/);
    assert.match(r.stderr, /dedup: exact \d+ · paraphrase \d+ · truncated \d+ · quota shortfall \d+/);

    // stdout JSON: candidates carry strategy attribution.
    const run = JSON.parse(r.stdout) as {
      runId: string;
      hypotheses: { strategyOrigin?: string }[];
    };
    assert.ok(run.hypotheses.length >= 2);
    assert.ok(run.hypotheses.every((h) => typeof h.strategyOrigin === 'string'));

    // The checkpoint persisted the strategy mode (resume never silently reverts).
    const cp = JSON.parse(
      readFileSync(join(runsRoot, run.runId, 'checkpoint.json'), 'utf8'),
    ) as RunCheckpoint;
    assert.equal(cp.hypothesisGenerationStrategy, 'multi_strategy');
    assert.deepEqual(cp.discoveryStrategies, [
      'induction',
      'analogy',
      'contradiction_mining',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
