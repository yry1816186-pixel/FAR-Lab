// tests/research/climate_adapter.test.ts
// climate 领域适配器（GISS GISTEMP v4）——真实 fixture 解析 + 趋势统计 +
// 领域门禁路由（CPS-4 第二领域最小垂直）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseGissAnnualGlob } from '../../src/research/adapters/climate_dataset.ts';
import { analyzeClimateTrend } from '../../src/research/adapters/climate_analysis.ts';
import { matchingDomain } from '../../src/research/domain_gates.ts';
import type { Observation } from '../../src/research/experiment.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, '..', 'fixtures', 'research', 'giss_zonann_annual.csv'), 'utf8');

test('parse: real GISS fixture yields the full annual record (1880-2025)', () => {
  const rows = parseGissAnnualGlob(FIXTURE);
  assert.equal(rows.length, 146, '1880..2025 = 146 annual points');
  assert.equal(rows[0]!.year, 1880);
  assert.equal(rows.at(-1)!.year, 2025);
  assert.ok(Math.abs(rows.at(-1)!.anomalyC - 1.19) < 1e-9, '2025 anomaly = +1.19 C (matches official GISTEMP)');
});

test('parse: header located dynamically (Glob column, not hardcoded position)', () => {
  // 模拟表头列序变化（Glob 移到第 5 列）——解析器必须仍找到正确列。
  const csv = 'Year,NHem,SHem,24N-90N,Glob\n1900,-.1,-.1,-.1,-.2\n1901,-.1,-.1,-.1,-.3\n';
  const rows = parseGissAnnualGlob(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.anomalyC, -0.2);
  assert.equal(rows[1]!.anomalyC, -0.3);
});

test('parse: fail-closed on noise (no Glob row → empty, no crash)', () => {
  assert.equal(parseGissAnnualGlob('not,a,csv\n1,2,3').length, 0);
  assert.equal(parseGissAnnualGlob('').length, 0);
});

test('trend: full record slope matches GISTEMP (~0.08-0.09 C/decade, significant)', () => {
  const rows = parseGissAnnualGlob(FIXTURE);
  const t = analyzeClimateTrend(rows);
  assert.equal(t.n, 146);
  assert.ok(t.trendPerDecadeC > 0.07 && t.trendPerDecadeC < 0.10,
    `full-record trend ${t.trendPerDecadeC.toFixed(3)} C/decade within GISTEMP range`);
  assert.ok(t.pValue < 0.001, 'full-record warming is significant');
  assert.equal(t.significantAt005, true);
  assert.equal(t.slopeIsZero, false);
});

test('trend: since-1975 window shows acceleration (~0.2 C/decade)', () => {
  const rows = parseGissAnnualGlob(FIXTURE).filter((p) => p.year >= 1975);
  const t = analyzeClimateTrend(rows);
  assert.ok(t.trendPerDecadeC > 0.15 && t.trendPerDecadeC < 0.25,
    `since-1975 trend ${t.trendPerDecadeC.toFixed(3)} C/decade (IPCC ~0.2)`);
  assert.equal(t.significantAt005, true);
  assert.ok(t.ci95PerDecadeC[0]! > 0, 'CI excludes zero');
});

test('trend: fewer than 3 points throws (no honest trend on nothing)', () => {
  assert.throws(() => analyzeClimateTrend([{ year: 2000, anomalyC: 0.1 }]), /at least 3/);
  assert.throws(() => analyzeClimateTrend([]), /at least 3/);
});

test('trend: flat series yields non-significant slope (null preserved)', () => {
  const flat = Array.from({ length: 20 }, (_, i) => ({ year: 2000 + i, anomalyC: 0.1 + (i % 2) * 0.001 }));
  const t = analyzeClimateTrend(flat);
  assert.equal(t.significantAt005, false);
  assert.equal(t.slopeIsZero, true);
});

test('domain gate: climate terms route to climate domain', () => {
  assert.equal(matchingDomain(null, 'What is the global warming trend in surface temperature anomalies?'), 'climate');
  assert.equal(matchingDomain('climatology', 'unrelated'), 'climate');
});

test('domain gate: single loose climate term is NOT enough (anti-grafting)', () => {
  // "temperature" 单独出现不命中（词项是 "surface temperature"/"temperature anomaly" 等复合词）。
  assert.equal(matchingDomain(null, 'the temperature of the sample was 25 C'), null);
});

// ── 路由端到端：climate run → runPlanExperiment → GISS 趋势观测（replay 路径）──

test('runPlanExperiment routes a climate run to the GISS trend adapter (replay)', async () => {
  const { runPlanExperiment } = await import('../../src/research/experiment.ts');
  const { adjudicateRunObservation } = await import('../../src/discovery/adjudication.ts');
  const baseRun = {
    runId: 'climate-run-1',
    question: 'What is the global warming trend of surface temperature anomalies?',
    discovery: null,
    gateReport: {
      question: 'q', verdict: 'RESEARCHABLE' as const, reasons: [], safetyRisks: [],
      scope: { domain: 'climate', domainHints: [], questionLength: 10 },
      decomposition: null, requiresEthicsGate: false, assessedAt: 't', schemaVersion: 1,
    },
    corpus: { snapshotId: 's', rootHash: 'r', documentCount: 0, documents: [], sourceQueries: [], createdAt: 't' },
    hypotheses: [{ id: 'h1' }] as never,
    bindings: {},
    critiques: {},
    scorecards: {},
    plan: {
      objectives: [], primaryHypothesisId: 'h1', alternativeHypothesisIds: [],
      preregisteredPredictions: [], dataRequirements: [], inclusionExclusionCriteria: [], variables: [],
    },
    observations: [],
    modes: { experimentExecutionMode: null },
    runMode: 'RECORDED_REPLAY',
    artifacts: { receipts: [], snapshots: [] },
    createdAt: 't',
    updatedAt: 't',
    status: 'COMPLETED' as const,
    schemaVersion: 1,
  };
  const rows = parseGissAnnualGlob(FIXTURE);
  const card = {
    source: 'NASA GISS GISTEMP v4 (Zonal Annual Means)',
    sourceUrl: 'https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts+dSST.csv',
    version: 'v4',
    persistentId: 'giss-gistemp-v4-zonann#glob',
    license: 'public-domain (NASA)',
    downloadedAt: '2026-08-21T00:00:00.000Z',
    query: 'Glob row · J-D (annual) column · full record',
    rawChecksum: '0'.repeat(64),
    rowCount: rows.length,
    fields: ['year', 'anomalyC'],
    units: { anomalyC: 'deg C (1951-1980 base)' },
    missingNotes: [],
    qualityNotes: [],
    allowedInference: 'trend over window',
    forbiddenInference: 'causal attribution',
    reproductionCommand: 'node -e "..."',
  };
  const result = await runPlanExperiment({
    run: baseRun as never,
    replayClimateRows: rows,
    replayClimateCard: card,
    now: () => new Date('2026-08-21T00:00:00.000Z'),
  });
  assert.equal(result.observation.adapter, 'giss-global-annual-trend');
  assert.equal(result.observation.mode, 'RECORDED_REPLAY');
  const t = (result.observation as Observation & { result: { trendPerDecadeC: number } }).result;
  assert.ok(t.trendPerDecadeC > 0.07 && t.trendPerDecadeC < 0.10);
  assert.equal(result.feedback.source, 'analysis');
  assert.match(result.feedback.text, /significant warming/);
  // climate 观测是有效观测但非决定性契约输入（裁决族仅覆盖 exoplanet 相关统计）→ 诚实 REFUSED。
  const adjudication = adjudicateRunObservation({ run: result.updatedRun, observation: result.observation });
  assert.equal(adjudication.status, 'REFUSED');
  assert.equal(adjudication.reason, 'observation_not_decisive');
});
