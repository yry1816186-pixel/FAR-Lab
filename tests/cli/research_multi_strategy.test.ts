// tests/cli/research_multi_strategy.test.ts
// `far research start` 假设生成策略的 CLI 契约（offline replay·不触网·临时 store root）：
//   - 参数解析：默认 multi_strategy（b3 翻转）/ --legacy-generation 回退 / --strategies 子集（目录序）
//     / 坏名 fail-closed / --strategies 与 --legacy-generation 互斥
//   - 端到端冒烟：multi 模式全 8 阶段 → exit 0 + stderr fan-out/锦标赛摘要 + stdout JSON
//     候选带 strategyOrigin + checkpoint 持久化 hypothesisGenerationStrategy（resume 稳定性）
//   - 端到端冒烟：legacy 显式回退 → legacy receipt（research_hypotheses）且无 fan-out 摘要

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseResearchArgs } from '../../src/cli/commands/research.ts';
import type { RunCheckpoint } from '../../src/research/run_lifecycle.ts';

test('parseResearchArgs: default is the multi-strategy fan-out (b3 flip)', () => {
  const parsed = parseResearchArgs(['q?']);
  assert.equal(parsed.generationStrategy, 'multi_strategy');
  assert.equal(parsed.strategies, null);
});

test('parseResearchArgs: --strategies (catalog-ordered subset, multi default)', () => {
  const parsed = parseResearchArgs(['q?', '--strategies', 'analogy,induction']);
  assert.equal(parsed.generationStrategy, 'multi_strategy');
  // Catalog order regardless of user input order (determinism).
  assert.deepEqual(parsed.strategies, ['induction', 'analogy']);
});

test('parseResearchArgs: --multi-strategy accepted as compat no-op (already default)', () => {
  const parsed = parseResearchArgs(['q?', '--multi-strategy']);
  assert.equal(parsed.generationStrategy, 'multi_strategy');
});

test('parseResearchArgs: --legacy-generation opts back into the single-shot path', () => {
  const parsed = parseResearchArgs(['q?', '--legacy-generation']);
  assert.equal(parsed.generationStrategy, 'legacy');
});

test('parseResearchArgs: unknown strategy name fails closed', () => {
  assert.throws(
    () => parseResearchArgs(['q?', '--strategies', 'telepathy']),
    /unknown strategy id\(s\): telepathy/,
  );
});

test('parseResearchArgs: --strategies with --legacy-generation is rejected', () => {
  assert.throws(
    () => parseResearchArgs(['q?', '--legacy-generation', '--strategies', 'induction']),
    /incompatible with --legacy-generation/,
  );
});

test('far research start --profile offline_replay (bare) → exit 0 + fan-out + tournament + persisted mode', () => {
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
    // The deterministic tournament board is rendered after the run lands.
    assert.match(r.stderr, /discovery tournament: \d+ matches/);

    // stdout JSON: candidates carry strategy attribution; discovery block persisted (v4).
    const run = JSON.parse(r.stdout) as {
      runId: string;
      schemaVersion: number;
      discovery: {
        strategy: string;
        fanout: { strategiesPlanned: string[] } | null;
        tournament: { ratings: { id: string; rank: number; elo: number }[] } | null;
      } | null;
      hypotheses: { strategyOrigin?: string }[];
    };
    assert.ok(run.hypotheses.length >= 2);
    assert.ok(run.hypotheses.every((h) => typeof h.strategyOrigin === 'string'));
    assert.equal(run.schemaVersion, 4);
    assert.ok(run.discovery !== null && run.discovery.strategy === 'multi_strategy');
    assert.ok(run.discovery.fanout !== null);
    assert.deepEqual(run.discovery.fanout.strategiesPlanned, [
      'induction',
      'analogy',
      'contradiction_mining',
    ]);
    // Tournament rankings cover every candidate, ranks are 1..N without gaps.
    assert.ok(run.discovery.tournament !== null);
    const ranks = run.discovery.tournament.ratings.map((x) => x.rank).sort((a, b) => a - b);
    assert.deepEqual(ranks, run.discovery.tournament.ratings.map((_, i) => i + 1));

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

test('far research start --legacy-generation → legacy receipt, no fan-out/tournament summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-research-legacy-'));
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
        '--legacy-generation',
        '--json',
      ],
      {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, FAR_RESEARCH_RUNS_DIR: runsRoot },
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /discovery fan-out:/);

    const run = JSON.parse(r.stdout) as {
      runId: string;
      schemaVersion: number;
      discovery: { strategy: string; fanout: null; tournament: { ratings: unknown[] } | null } | null;
      stageReceipts: { stageId: string }[];
    };
    assert.equal(run.discovery?.strategy, 'legacy');
    assert.equal(run.discovery?.fanout, null);
    // Legacy runs still get the deterministic tournament (ranking is
    // strategy-agnostic) but never a fan-out block.
    assert.ok(run.discovery!.tournament !== null);
    assert.ok(run.discovery!.tournament.ratings.length >= 2);
    assert.ok(run.stageReceipts.some((x) => x.stageId === 'research_hypotheses'));
    assert.ok(!run.stageReceipts.some((x) => x.stageId === 'discovery_fanout'));

    const cp = JSON.parse(
      readFileSync(join(runsRoot, run.runId, 'checkpoint.json'), 'utf8'),
    ) as RunCheckpoint;
    assert.equal(cp.hypothesisGenerationStrategy, 'legacy');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
