// tests/governance/tech_radar.test.ts
//
// GOV-RADAR-001 验收测试：雷达只作候选发现——adopted 必须挂可解析的外部
// 决策记录；radar 自引 = 循环依据 fail；终态不可回退；trialing 必须带试验证据。
// 纯函数确定性测试。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRadarTransition,
  canTransition,
  checkRadarDiscipline,
  RADAR_CATEGORIES,
  type RadarEntry,
} from '../../src/governance/tech_radar.ts';

const UNIVERSE = new Set(['BORROW-zod', 'BORROW-fastify', 'DEC-ed25519-native']);

function makeEntry(overrides: Partial<RadarEntry> = {}): RadarEntry {
  return {
    id: 'RADAR-1',
    technology: 'io-ts schema validation',
    category: 'evaluation-safety',
    status: 'candidate',
    note: 'zod 替代候选——尚未试验',
    ...overrides,
  };
}

test('candidate and trialing entries need no decision record; adopted resolves against universe', () => {
  const ok = checkRadarDiscipline(
    [
      makeEntry(),
      makeEntry({ id: 'RADAR-2', status: 'trialing', trialEvidence: ['tests/research/baseline.test.ts'] }),
      makeEntry({ id: 'RADAR-3', status: 'adopted', decisionRef: 'BORROW-zod', trialEvidence: ['tests/schema/*.test.ts'] }),
      makeEntry({ id: 'RADAR-4', status: 'rejected', decisionRef: undefined }),
    ],
    UNIVERSE,
  );
  assert.deepEqual(ok, { ok: true, problems: [] });
});

test('adopted without decisionRef fails — radar entry itself is never adoption evidence', () => {
  const r = checkRadarDiscipline([makeEntry({ status: 'adopted' })], UNIVERSE);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('requires decisionRef')));
});

test('adopted with unresolvable decisionRef fails (not in decision universe)', () => {
  const r = checkRadarDiscipline([makeEntry({ status: 'adopted', decisionRef: 'BORROW-does-not-exist' })], UNIVERSE);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('not found in the decision universe')));
});

test('self-referential decisionRef (radar citing itself) fails as circular evidence', () => {
  const r = checkRadarDiscipline([makeEntry({ id: 'RADAR-9', status: 'adopted', decisionRef: 'RADAR-9' })], new Set(['RADAR-9']));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('circular adoption evidence')));
});

test('fail-closed: empty decision universe rejects every adopted entry', () => {
  const r = checkRadarDiscipline([makeEntry({ status: 'adopted', decisionRef: 'BORROW-zod' })], new Set());
  assert.equal(r.ok, false);
});

test('trialing without trial evidence fails', () => {
  const r = checkRadarDiscipline([makeEntry({ status: 'trialing' })], UNIVERSE);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('trialEvidence')));
});

test('state machine: candidate→trialing→adopted legal; terminal states are not rewritable', () => {
  assert.ok(canTransition('candidate', 'trialing'));
  assert.ok(canTransition('trialing', 'adopted'));
  assert.ok(canTransition('trialing', 'rejected'));
  assert.ok(canTransition('candidate', 'rejected'));
  assert.equal(canTransition('adopted', 'trialing'), false);
  assert.equal(canTransition('rejected', 'candidate'), false);
  assert.equal(canTransition('adopted', 'rejected'), false);
});

test('applyRadarTransition: legal path updates immutably; illegal path leaves ledger untouched', () => {
  const base = [makeEntry({ status: 'trialing', trialEvidence: ['spike.ts'] })];
  const adopted = applyRadarTransition(base, 'RADAR-1', 'adopted', UNIVERSE);
  // trialing 无 decisionRef 的条目升 adopted 会被纪律检查拦下。
  assert.equal(adopted.ok, false);
  assert.equal(base[0]!.status, 'trialing', 'failed transition must not mutate the original');

  const withRef = [makeEntry({ status: 'trialing', trialEvidence: ['spike.ts'], decisionRef: 'DEC-ed25519-native' })];
  const ok = applyRadarTransition(withRef, 'RADAR-1', 'adopted', UNIVERSE);
  assert.equal(ok.ok, true);
  assert.equal(ok.next[0]!.status, 'adopted');
  assert.equal(withRef[0]!.status, 'trialing', 'transition returns a new array, never mutates');

  // 终态回退被拒，并给出终态说明。
  const back = applyRadarTransition(ok.next, 'RADAR-1', 'trialing', UNIVERSE);
  assert.equal(back.ok, false);
  assert.match(back.problem ?? '', /terminal/);

  // 幂等拒绝：同状态转移。
  const same = applyRadarTransition(ok.next, 'RADAR-1', 'adopted', UNIVERSE);
  assert.equal(same.ok, false);

  // 不存在的条目。
  const missing = applyRadarTransition(ok.next, 'RADAR-404', 'rejected', UNIVERSE);
  assert.equal(missing.ok, false);
});

test('category must come from the constitutional category list; duplicate ids rejected', () => {
  const r = checkRadarDiscipline(
    [makeEntry({ category: 'quantum-computing' as RadarEntry['category'] }), makeEntry()],
    UNIVERSE,
  );
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('unknown category')));
  assert.ok(r.problems.some((p) => p.includes('duplicate radar id')));
  assert.ok(RADAR_CATEGORIES.length >= 11, 'constitution J5 lists at least the 11 categories');
});
