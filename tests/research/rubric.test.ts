/**
 * tests/research/rubric.test.ts — 盲评工具契约（2.md §4.4，day-r13）。
 *
 * 证明：
 *   - 去标识：包内 items 不含 strategyOrigin/模型身份；钥匙映射完备可还原
 *   - 确定性：同 runs+seed → 同呈现序；异 seed → 序变化（洗牌真实生效）
 *   - CSV 解析：坏表头/坏分值/未知 scale → 带行号的错误（fail-closed）
 *   - κ/α 数学：完全一致=1；手工算例（2×2 全分歧）α=-0.75；单评分者=null
 *   - 聚合：均值±sd 正确、缺行显式警告、单评分者 κ/α 诚实降级
 *   - CLI 端到端：package→填写→aggregate 出报告；exit 2/3 路径
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import { createReplayAdapter } from '../../src/retrieval/index.ts';
import { runResearch } from '../../src/research/orchestrator.ts';
import {
  aggregateRatings,
  buildBlindPackage,
  cohensKappa,
  krippendorffAlphaNominal,
  parseRatingsCsv,
  renderRubricReport,
  RUBRIC_SCALES,
  type RatingRow,
} from '../../src/research/evaluation/rubric.ts';
import { runRubricPackage, runRubricAggregate } from '../../src/cli/commands/rubric.ts';
import { RESEARCH_DEMO_DOCS, RESEARCH_DEMO_FIXTURES } from '../../src/research/research_fixtures.ts';

const QUESTION = 'Why are hot Jupiter radii larger than structure models predict?';

function buildGateway() {
  return createLlmGateway([createOfflineReplayAdapter({ fixtures: RESEARCH_DEMO_FIXTURES })]);
}

async function demoRun() {
  return runResearch({
    question: QUESTION,
    gateway: buildGateway(),
    profile: 'offline_replay',
    grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
    targetHypothesisCount: 3,
  });
}

const FIXED_NOW = () => new Date('2026-08-17T00:00:00.000Z');

test('rubric: package de-identifies, shuffles deterministically, key roundtrips', async () => {
  const run = await demoRun();
  const a = buildBlindPackage([run], { seed: 42, now: FIXED_NOW });
  const b = buildBlindPackage([run], { seed: 42, now: FIXED_NOW });

  // Determinism: identical seed → byte-identical order.
  assert.deepEqual(a.pkg.items.map((i) => i.blindId), b.pkg.items.map((i) => i.blindId));
  assert.deepEqual(
    a.pkg.items.map((i) => i.statement),
    b.pkg.items.map((i) => i.statement),
  );
  // Shuffle real: a different seed must move something for a 3-item pack
  // (assert order differs for at least one seed among a few).
  const orders = new Set([0, 1, 2, 3].map((s) => buildBlindPackage([run], { seed: s, now: FIXED_NOW }).pkg.items.map((i) => i.statement).join('||')));
  assert.ok(orders.size > 1, 'seeded shuffle must actually permute presentation order');

  // De-identification: no origin leakage anywhere in the serialized pack.
  const serialized = JSON.stringify(a.pkg);
  for (const h of run.hypotheses) {
    assert.ok(!serialized.includes(h.strategyOrigin ?? 'STRATEGY_SENTINEL'), 'no strategy ids in pack');
  }
  // Blind ids sequential H-01..H-NN; key maps every one back.
  assert.deepEqual(a.pkg.items.map((i) => i.blindId), a.pkg.items.map((_, i) => `H-${String(i + 1).padStart(2, '0')}`));
  for (const item of a.pkg.items) {
    const m = a.key.mapping[item.blindId];
    assert.ok(m !== undefined, `key covers ${item.blindId}`);
    assert.ok(run.hypotheses.some((h) => h.id === m.hypothesisId), 'mapping points at a real hypothesis');
  }
  assert.equal(a.pkg.sourceRunCount, 1);
});

test('rubric: parseRatingsCsv — valid rows parse; malformed rows fail closed with line numbers', () => {
  const good = [
    'rater,item,scale,score,comment',
    'alice,H-01,novelty,4,sharp',
    'bob,H-01,novelty,5,',
  ].join('\n');
  const rows = parseRatingsCsv(good);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { rater: 'alice', blindId: 'H-01', scale: 'novelty', score: 4, comment: 'sharp' });

  assert.throws(() => parseRatingsCsv('a,b,c\n1,2,3'), /header must be/);
  assert.throws(() => parseRatingsCsv('rater,item,scale,score,comment\nx,H-01,novelty,9'), /score must be an integer 1-5/);
  assert.throws(() => parseRatingsCsv('rater,item,scale,score,comment\nx,H-01,wrongscale,3'), /unknown scale/);
  assert.throws(() => parseRatingsCsv('rater,item,scale,score,comment\nx,not-an-id,novelty,3'), /item must look like/);
  assert.throws(() => parseRatingsCsv(''), /empty/);
});

test('rubric: cohensKappa — 1 on perfect agreement; hand case for disagreement', () => {
  assert.equal(cohensKappa(['1', '1', '2'], ['1', '1', '2']), 1);
  // Hand-computed: po = 2/4, pe = (0.5·0.5)+(0.5·0.5) = 0.5 → κ = (0.5−0.5)/(1−0.5) = 0
  const k = cohensKappa(['1', '1', '2', '2'], ['1', '2', '1', '2']);
  assert.ok(k !== null && Math.abs(k) < 1e-12, `expected 0, got ${k}`);
  assert.equal(cohensKappa([], []), null);
});

test('rubric: krippendorffAlphaNominal — 1 on agreement; hand-computed −0.75 on full disagreement', () => {
  // Perfect agreement (2 raters × 3 units): no off-diagonal coincidence → α=1.
  const agree = new Map([['u1', ['1', '1']], ['u2', ['2', '2']], ['u3', ['1', '1']]]);
  assert.equal(krippendorffAlphaNominal(agree), 1);
  // Hand computation (2 raters × 4 units, every pair disagrees):
  //   coincidence o = [[0,4],[4,0]], n=8 → Do=1, De=(4·4+4·4)/(8·7)=32/56 → α=1−56/32=−0.75
  const disagree = new Map([
    ['u1', ['1', '2']], ['u2', ['1', '2']], ['u3', ['2', '1']], ['u4', ['2', '1']],
  ]);
  const alpha = krippendorffAlphaNominal(disagree);
  assert.ok(alpha !== null && Math.abs(alpha - -0.75) < 1e-12, `expected −0.75, got ${alpha}`);
  // Single rater: no pairs → null (honest undefined, not a fake number).
  assert.equal(krippendorffAlphaNominal(new Map([['u1', ['3']]])), null);
});

function row(rater: string, blindId: string, scale: string, score: number): RatingRow {
  return { rater, blindId, scale: scale as RatingRow['scale'], score, comment: '' };
}

test('rubric: aggregateRatings — means, agreement, honest degradation', () => {
  const items = ['H-01', 'H-02'];
  const rows: RatingRow[] = [];
  for (const item of items) {
    for (const scale of RUBRIC_SCALES) {
      rows.push(row('alice', item, scale, 4));
      rows.push(row('bob', item, scale, 4));
    }
  }
  const agg = aggregateRatings('pkg-t', rows);
  assert.equal(agg.raterCount, 2);
  for (const stat of agg.itemStats) {
    assert.equal(stat.mean, 4);
    assert.equal(stat.sd, 0);
    assert.equal(stat.n, 2);
  }
  for (const a of agg.agreement) {
    assert.equal(a.meanPairwiseKappa, 1, 'identical raters agree perfectly (κ degenerate=1)');
    assert.equal(a.krippendorffAlpha, 1);
  }

  // Single rater → κ/α null + warning; means still reported.
  const single = aggregateRatings('pkg-t', [row('solo', 'H-01', 'novelty', 5)]);
  const novelty = single.agreement.find((a) => a.scale === 'novelty')!;
  assert.equal(novelty.meanPairwiseKappa, null);
  assert.equal(novelty.krippendorffAlpha, null);
  assert.ok(single.warnings.some((w) => w.includes('single rater')));

  // Duplicate rows from one rater → warning, first kept.
  const dup = aggregateRatings('pkg-t', [
    row('alice', 'H-01', 'novelty', 5),
    row('alice', 'H-01', 'novelty', 1),
    row('bob', 'H-01', 'novelty', 5),
  ]);
  const dupStat = dup.itemStats.find((s) => s.blindId === 'H-01' && s.scale === 'novelty')!;
  assert.equal(dupStat.mean, 5, 'first alice row kept (5,5), duplicate 1 not averaged in');
  assert.ok(dup.warnings.some((w) => w.includes('duplicate rating row')));

  // Unrated item/scale combination → explicit warning, no fabricated stat.
  const partial = aggregateRatings('pkg-t', [row('alice', 'H-01', 'novelty', 3)]);
  assert.ok(partial.warnings.some((w) => w.includes('unrated by everyone')));
});

test('rubric: report renders agreement + per-item table + cannot-prove note', () => {
  const rows = [
    row('alice', 'H-01', 'novelty', 4), row('bob', 'H-01', 'novelty', 4),
  ];
  const agg = aggregateRatings('pkg-t', rows);
  const key = { packageId: 'pkg-t', seed: 42, mapping: { 'H-01': { runId: 'run-x', hypothesisId: 'hyp-y' } } };
  const md = renderRubricReport(agg, key);
  assert.ok(md.includes('# Rubric aggregation — pkg-t'));
  assert.ok(md.includes('| novelty | 2 |'));
  assert.ok(md.includes('| H-01 | run-x | hyp-y | novelty |'));
  assert.ok(md.includes('cannot-prove'));
});

test('rubric CLI: package → aggregate end-to-end on a real offline run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-rubric-'));
  process.env.FAR_RUBRIC_DIR = join(dir, 'keys');
  process.env.FAR_RUBRIC_PACK_DIR = join(dir, 'packs');
  try {
    // A real lifecycle-persisted run in a temp store (the CLI loads through it).
    const { executeResearchRun, RunStore } = await import('../../src/research/run_lifecycle.ts');
    const store = new RunStore(join(dir, 'runs'));
    const run = await executeResearchRun({
      question: QUESTION,
      gateway: buildGateway(),
      profile: 'offline_replay',
      grounding: { adapter: createReplayAdapter('openalex', 'OpenAlex', RESEARCH_DEMO_DOCS) },
      targetHypothesisCount: 3,
      store,
    });

    const rc = runRubricPackage({ runIds: [run.runId], store });
    assert.equal(rc, 0);

    // Locate the package + key produced (single package in the temp roots).
    const packRoot = process.env.FAR_RUBRIC_PACK_DIR;
    const keyRoot = process.env.FAR_RUBRIC_DIR;
    const { readdirSync } = await import('node:fs');
    const [packageIdRaw] = readdirSync(packRoot);
    const packageId = packageIdRaw as string;
    const template = readFileSync(join(packRoot, packageId, 'ratings-template.csv'), 'utf8');
    assert.ok(existsSync(join(packRoot, packageId, 'SHA256SUMS')));
    // Blind side never contains the key mapping or strategy origins.
    const packReadme = readFileSync(join(packRoot, packageId, 'README.md'), 'utf8');
    assert.ok(!packReadme.includes('runId'), 'README must not leak run identity');
    assert.ok(template.startsWith('rater,item,scale,score,comment'));

    // Two raters each return their own filled CSV with identical scores → κ/α = 1.
    const fill = (rater: string): string =>
      template
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l, i) => (i === 0 ? l : l.replace('YOUR_RATER_ID', rater).replace(/,$/, '4,')))
        .join('\n');
    const csvA = join(dir, 'alice.csv');
    const csvB = join(dir, 'bob.csv');
    writeFileSync(csvA, fill('alice'), 'utf8');
    writeFileSync(csvB, fill('bob'), 'utf8');
    const rc2 = runRubricAggregate({ packageId, ratingsPaths: [csvA, csvB] });
    assert.equal(rc2, 0);
    const report = readFileSync(join(keyRoot, packageId, 'aggregation.md'), 'utf8');
    assert.ok(report.includes('| 1.000 | 1.000 |'), 'identical raters → κ=α=1 in report');

    // Malformed CSV → exit 3 (parse failure surfaces, nothing aggregated away).
    const bad = join(dir, 'bad.csv');
    writeFileSync(bad, 'rater,item,scale,score,comment\nx,H-01,novelty,9\n', 'utf8');
    assert.equal(runRubricAggregate({ packageId, ratingsPaths: [bad] }), 3);
    // Unknown package → exit 2.
    assert.equal(runRubricAggregate({ packageId: 'rubric-1999-00000', ratingsPaths: [csvA] }), 2);
  } finally {
    delete process.env.FAR_RUBRIC_DIR;
    delete process.env.FAR_RUBRIC_PACK_DIR;
    delete process.env.FAR_RESEARCH_RUNS_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
