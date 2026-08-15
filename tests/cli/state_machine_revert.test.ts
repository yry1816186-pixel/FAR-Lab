/**
 * state_machine_revert.test.ts —— CLI 状态机反向转移（session revert）。
 *
 * 覆盖：
 *   1. 三组合法反向边：STATISTICS→EVIDENCE_GATHERED / VERDICT_RENDERED→STATISTICS /
 *      PROOF_SEALED→VERDICT_RENDERED（seal 前可回退）。
 *   2. 前进链保持字节一致（既有 ADVANCE 事件零回归）。
 *   3. seal 后不可回退：AUDITABLE/VERIFIED 无反向边（fail-closed PROTOCOL_DEVIATION_CRITICAL）。
 *   4. 从无关状态发 revert → fail-closed。
 *   5. revert 后可继续前进（完整闭环：回退 → 重做 → 再推进）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CliEvent, CliState, transition, type CliEvent as CliEventT, type CliState as CliStateT } from '../../src/cli/state_machine.ts';

function advanceChain(start: CliStateT, events: readonly CliEventT[]): CliStateT {
  let state = start;
  for (const e of events) {
    const r = transition(state, e);
    assert.equal(r.ok, true, `advance ${e} from ${state} must be legal`);
    if (r.ok) state = r.next;
  }
  return state;
}

test('revert edges: statistics -> evidence, verdict -> statistics, proof_sealed -> verdict', () => {
  // 前进到 STATISTICS_COMPUTED 再 revert 回 EVIDENCE_GATHERED
  const atStats = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
  ]);
  assert.equal(atStats, CliState.STATISTICS_COMPUTED);
  const rev1 = transition(atStats, CliEvent.REVERT_EVIDENCE_GATHER);
  assert.deepEqual(rev1, { ok: true, next: CliState.EVIDENCE_GATHERED });

  // 前进到 VERDICT_RENDERED 再 revert 回 STATISTICS_COMPUTED
  const atVerdict = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
    CliEvent.ADVANCE_VERDICT,
  ]);
  assert.equal(atVerdict, CliState.VERDICT_RENDERED);
  const rev2 = transition(atVerdict, CliEvent.REVERT_STATISTICS);
  assert.deepEqual(rev2, { ok: true, next: CliState.STATISTICS_COMPUTED });

  // 前进到 PROOF_SEALED 再 revert 回 VERDICT_RENDERED
  const atSeal = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
    CliEvent.ADVANCE_VERDICT,
    CliEvent.ADVANCE_PROOF_SEAL,
  ]);
  assert.equal(atSeal, CliState.PROOF_SEALED);
  const rev3 = transition(atSeal, CliEvent.REVERT_VERDICT);
  assert.deepEqual(rev3, { ok: true, next: CliState.VERDICT_RENDERED });
});

test('seal is a commit point: no revert edges after PROOF_SEALED', () => {
  const atAuditable = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
    CliEvent.ADVANCE_VERDICT,
    CliEvent.ADVANCE_PROOF_SEAL,
    CliEvent.ADVANCE_AUDITABLE,
  ]);
  for (const e of [CliEvent.REVERT_EVIDENCE_GATHER, CliEvent.REVERT_STATISTICS, CliEvent.REVERT_VERDICT]) {
    const r = transition(atAuditable, e);
    assert.equal(r.ok, false, `revert ${e} from AUDITABLE must be illegal`);
    assert.equal(r.ok ? '' : r.reason, 'PROTOCOL_DEVIATION_CRITICAL');
  }
  const atVerified = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
    CliEvent.ADVANCE_VERDICT,
    CliEvent.ADVANCE_PROOF_SEAL,
    CliEvent.ADVANCE_AUDITABLE,
    CliEvent.ADVANCE_VERIFIED,
  ]);
  const rv = transition(atVerified, CliEvent.REVERT_VERDICT);
  assert.equal(rv.ok, false);
});

test('revert from unrelated states is fail-closed', () => {
  const atEvidence = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
  ]);
  // EVIDENCE_GATHERED 没有更早的可回退阶段
  const r = transition(atEvidence, CliEvent.REVERT_EVIDENCE_GATHER);
  assert.equal(r.ok, false);
  assert.equal(r.ok ? '' : r.reason, 'PROTOCOL_DEVIATION_CRITICAL');
  // INITIAL 上任何 revert 都非法
  const r0 = transition(CliState.INITIAL, CliEvent.REVERT_VERDICT);
  assert.equal(r0.ok, false);
});

test('revert then re-advance closes the loop', () => {
  const atSeal = advanceChain(CliState.INITIAL, [
    CliEvent.ADVANCE_CLAIM_CANDIDATE,
    CliEvent.ADVANCE_FEC_PROPOSE,
    CliEvent.ADVANCE_FEC_COMPILE,
    CliEvent.ADVANCE_EVIDENCE_GATHER,
    CliEvent.ADVANCE_STATISTICS,
    CliEvent.ADVANCE_VERDICT,
    CliEvent.ADVANCE_PROOF_SEAL,
  ]);
  const back = transition(atSeal, CliEvent.REVERT_VERDICT);
  assert.ok(back.ok);
  if (back.ok) {
    const reSeal = advanceChain(back.next, [
      CliEvent.ADVANCE_STATISTICS,
      CliEvent.ADVANCE_VERDICT,
      CliEvent.ADVANCE_PROOF_SEAL,
    ]);
    assert.equal(reSeal, CliState.PROOF_SEALED, 're-advance after revert must reach seal again');
  }
});
