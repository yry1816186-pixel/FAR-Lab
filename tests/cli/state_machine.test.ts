// tests/cli/state_machine.test.ts
// 端到端测试：9-state CLI 协议 FSM + per-stage stageReceipt 哈希链。
// 真实依赖：transition（state_machine）+ computeStageReceipt（sha256 + hashCanonicalJson，非 mock）。

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runFsmAdvance } from '../../src/cli/commands/fsm.ts';
import type { FsmStateFile } from '../../src/cli/commands/fsm.ts';
import {
  computeStageReceipt,
  GENESIS_RECEIPT,
  type StageReceipt,
  verifyStageReceiptChain,
} from '../../src/cli/stage_receipt.ts';
import {
  CliEvent,
  CliState,
  transition,
} from '../../src/cli/state_machine.ts';

const LEGAL_CHAIN: ReadonlyArray<{ readonly event: CliEvent; readonly expected: CliState }> = [
  { event: CliEvent.ADVANCE_CLAIM_CANDIDATE, expected: CliState.CLAIM_CANDIDATE },
  { event: CliEvent.ADVANCE_FEC_PROPOSE, expected: CliState.FEC_PROPOSED },
  { event: CliEvent.ADVANCE_FEC_COMPILE, expected: CliState.FEC_VALIDATED },
  { event: CliEvent.ADVANCE_EVIDENCE_GATHER, expected: CliState.EVIDENCE_GATHERED },
  { event: CliEvent.ADVANCE_STATISTICS, expected: CliState.STATISTICS_COMPUTED },
  { event: CliEvent.ADVANCE_VERDICT, expected: CliState.VERDICT_RENDERED },
  { event: CliEvent.ADVANCE_PROOF_SEAL, expected: CliState.PROOF_SEALED },
  { event: CliEvent.ADVANCE_AUDITABLE, expected: CliState.AUDITABLE },
  { event: CliEvent.ADVANCE_VERIFIED, expected: CliState.VERIFIED },
];

test('legal transition chain: INITIAL → … → VERIFIED all GREEN (transition pure function)', () => {
  let current: CliState = CliState.INITIAL;
  for (const step of LEGAL_CHAIN) {
    const r = transition(current, step.event);
    assert.equal(r.ok, true, `transition(${current}, ${step.event}) should be ok`);
    if (!r.ok) return;
    assert.equal(r.next, step.expected);
    current = r.next;
  }
  assert.equal(current, CliState.VERIFIED);
});

test('illegal transition: INITIAL → VERIFIED yields PROTOCOL_DEVIATION_CRITICAL (fail-closed, no silent overwrite)', () => {
  const r = transition(CliState.INITIAL, CliEvent.ADVANCE_VERIFIED);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'PROTOCOL_DEVIATION_CRITICAL');
  assert.equal(r.from, CliState.INITIAL);
  assert.equal(r.attempted, CliState.VERIFIED);
});

test('illegal transition: from VERIFIED (terminal) yields PROTOCOL_DEVIATION_CRITICAL', () => {
  const r = transition(CliState.VERIFIED, CliEvent.ADVANCE_CLAIM_CANDIDATE);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'PROTOCOL_DEVIATION_CRITICAL');
  assert.equal(r.from, CliState.VERIFIED);
});

test('stageReceipt chain reproducible: replay identical inputs → identical receipts (byte equality)', () => {
  const stageOutputs: ReadonlyArray<Record<string, unknown>> = [
    { claimId: 'C-ASTRO-0001', body: 'macro_f1 >= 0.80' },
    { fecHash: 'a'.repeat(64), plan: { statLock: { hash: 'b'.repeat(64) } } },
    { evidence: [{ id: 'EV-1', value: 0.85 }] },
    { statistics: { pValue: 0.001, effectSize: 0.6 } },
    { verdict: 'CONFIRMED', decisiveRuleId: 'R1' },
  ];

  const buildChain = (): readonly { readonly output: Record<string, unknown>; readonly receipt: string }[] => {
    let prev = GENESIS_RECEIPT;
    const out: { output: Record<string, unknown>; receipt: string }[] = [];
    for (const o of stageOutputs) {
      const r = computeStageReceipt(prev, o);
      out.push({ output: o, receipt: r });
      prev = r;
    }
    return out;
  };

  const chain1 = buildChain();
  const chain2 = buildChain();

  assert.equal(chain1.length, chain2.length);
  for (let i = 0; i < chain1.length; i += 1) {
    const c1 = chain1[i];
    const c2 = chain2[i];
    if (c1 === undefined || c2 === undefined) {
      assert.fail(`chain[${i}] undefined`);
      return;
    }
    assert.equal(
      c1.receipt,
      c2.receipt,
      `receipt[${i}] must be byte-equal on identical input (got ${c1.receipt.slice(0, 16)}… vs ${c2.receipt.slice(0, 16)}…)`,
    );
    assert.equal(c1.receipt.length, 64, 'sha256 hex digest must be 64 chars');
    assert.match(c1.receipt, /^[0-9a-f]{64}$/);
  }
});

test('tampered stageOutput → receipt mismatch (hash chain detects tampering)', () => {
  const original = { claimId: 'C-X', value: 0.85 };
  const tampered = { claimId: 'C-X', value: 0.86 };

  const r1 = computeStageReceipt(GENESIS_RECEIPT, original);
  const r2 = computeStageReceipt(GENESIS_RECEIPT, tampered);

  assert.notEqual(r1, r2, 'tampered stageOutput must produce different receipt');
});

test('verifyStageReceiptChain: end-to-end via runFsmAdvance (real CLI entry, real sha256)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-fsm-'));
  try {
    const stateFile = join(tmp, 'fsm_state.json');
    const inputFiles: ReadonlyArray<{ readonly event: CliEvent; readonly path: string }> =
      LEGAL_CHAIN.map((step, idx) => {
        const p = join(tmp, `stage-${idx}-${step.expected}.json`);
        writeFileSync(p, `${JSON.stringify({ stage: step.expected, idx, payload: `data-${idx}` })}\n`, 'utf8');
        return { event: step.event, path: p };
      });

    const receipts: StageReceipt[] = [];
    for (const f of inputFiles) {
      const r = runFsmAdvance({ event: f.event, inputPath: f.path, stateFile });
      assert.equal(r.ok, true, `runFsmAdvance(${f.event}) should succeed`);
      if (!r.ok) return;
      receipts.push(r.receipt);
    }

    // 1. 末位字节重算：verifyStageReceiptChain 逐位复算 → true。
    assert.equal(
      verifyStageReceiptChain(receipts),
      true,
      'verifyStageReceiptChain must be true for untampered chain',
    );

    // 2. 末位 receipt 长度 64（sha256 hex）。
    const last = receipts[receipts.length - 1];
    if (last === undefined) {
      assert.fail('receipts should be non-empty');
      return;
    }
    assert.equal(last.receipt.length, 64);
    assert.match(last.receipt, /^[0-9a-f]{64}$/);

    // 3. state file 终态 = VERIFIED + prevReceipt = last receipt。
    const written = JSON.parse(readFileSync(stateFile, 'utf8')) as FsmStateFile;
    assert.equal(written.state, CliState.VERIFIED);
    assert.equal(written.prevReceipt, last.receipt);
    assert.equal(written.history.length, LEGAL_CHAIN.length);

    // 4. 篡改 history[3].outputHash → verifyStageReceiptChain 必须 false。
    const orig3 = written.history[3];
    if (orig3 === undefined) {
      assert.fail('history[3] missing');
      return;
    }
    const tamperedHistory: StageReceipt[] = [...written.history];
    tamperedHistory[3] = {
      stage: orig3.stage,
      prevReceipt: orig3.prevReceipt,
      outputHash: 'f'.repeat(64),
      receipt: orig3.receipt,
    };
    assert.equal(
      verifyStageReceiptChain(tamperedHistory),
      false,
      'tampered outputHash must be detected by chain verification',
    );

    // 5. 篡改 history[3].receipt（保留 outputHash）→ verifyStageReceiptChain 必须 false。
    const tamperedReceiptHistory: StageReceipt[] = [...written.history];
    tamperedReceiptHistory[3] = {
      stage: orig3.stage,
      prevReceipt: orig3.prevReceipt,
      outputHash: orig3.outputHash,
      receipt: 'e'.repeat(64),
    };
    assert.equal(
      verifyStageReceiptChain(tamperedReceiptHistory),
      false,
      'tampered receipt must be detected by chain verification',
    );

    // 6. 推进一次非法事件（INITIAL→VERIFIED 已经走完，再推进任意 event 应 PROTOCOL_DEVIATION_CRITICAL）。
    const firstInput = inputFiles[0];
    if (firstInput === undefined) {
      assert.fail('inputFiles[0] missing');
      return;
    }
    const illegal = runFsmAdvance({
      event: CliEvent.ADVANCE_CLAIM_CANDIDATE,
      inputPath: firstInput.path,
      stateFile,
    });
    assert.equal(illegal.ok, false, 'terminal state VERIFIED should reject further advance');
    if (illegal.ok) return;
    assert.equal(illegal.exitCode, 7);
    assert.match(illegal.error, /PROTOCOL_DEVIATION_CRITICAL/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runFsmAdvance rejects illegal event from INITIAL (INITIAL → VERIFIED skip)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-fsm-illegal-'));
  try {
    const stateFile = join(tmp, 'fsm_state.json');
    const inputPath = join(tmp, 'stage.json');
    writeFileSync(inputPath, `${JSON.stringify({ foo: 'bar' })}\n`, 'utf8');

    // INITIAL → ADVANCE_VERIFIED (should be FEC_VALIDATED → EVIDENCE_GATHERED step skipped entirely).
    const r = runFsmAdvance({
      event: CliEvent.ADVANCE_VERIFIED,
      inputPath,
      stateFile,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.exitCode, 7);
    assert.match(r.error, /PROTOCOL_DEVIATION_CRITICAL/);
    assert.match(r.error, /from=INITIAL/);
    assert.match(r.error, /attempted=VERIFIED/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
