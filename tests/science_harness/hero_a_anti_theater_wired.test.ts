// tests/science_harness/hero_a_anti_theater_wired.test.ts
//
// FUSION-OS-1 闭合物证（:387 load-bearing）：proof_test 直接驱动 buildHeroAChain（生产 caller），
// 注入 seed-cherry 攻击 → 经 :387 fecAppendClaim(antiTheaterReport) 真实 kernel 路径触发
// decisiveRuleId=ANTI_THEATER_FAIL。hero_a 是 full-scope（scopeNarrowerThanClaim=false）→ R4 不 fire
// → anti-theater verdict_kernel_v2.ts:373 可达（c_astro cached_fixture 被 R4 :345 shadow·结构性不可达）。
//
// :387 突变（不传 antiTheaterReport）→ buildHeroAChain verdict 回 R7 CONFIRMED → 本测试 FAIL：
// 故 controlled-mutation base（revert :387）/ head（:387）= base FAIL / head PASS，depth_evidence bot
// 双跑可证 :387 caller 接线 load-bearing（base touches proof_caller hero_a_pipeline.ts·非 pre-existing 投影 theater）。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-1 + CLAUDE.md §4 P-FUSION FUSION-OS-1。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import { buildHeroAChain, HERO_A_SEED } from '../../src/science_harness/hero_a_pipeline.ts';

test('hero_a_full_scope_seed_cherry_drives_ANTI_THEATER_FAIL: buildHeroAChain (full-scope, R4 no shadow) + injected seed-cherry -> :387 -> ANTI_THEATER_FAIL (FUSION-OS-1 closure)', () => {
  const db = new Database(':memory:');
  try {
    // 注入 seed-cherry（declaredSeeds 含 runRegistry 未跑的种子）→ 生产 caller :387 真跑 lint 产 fail finding
    // → fecAppendClaim(antiTheaterReport) → kernel :373（full-scope·R4 不 shadow）→ UNTESTED/ANTI_THEATER_FAIL。
    const chain = buildHeroAChain(db, {
      antiTheaterDeclaredSeeds: [HERO_A_SEED, 999],
      antiTheaterRunRegistrySeeds: [HERO_A_SEED],
    });

    // 生产 caller 真跑 lint 产 fail finding（:387 物证）。
    assert.equal(chain.antiTheaterReport.hasFail, true, 'buildHeroAChain must run real runAntiTheaterLint yielding hasFail=true (seed-cherry)');
    assert.ok(
      chain.antiTheaterReport.findings.some((f) => f.attackKind === 'seed-cherry-picking' && f.outcome === 'FAIL'),
      `findings must contain a real seed-cherry-picking FAIL, got: ${JSON.stringify(chain.antiTheaterReport.findings.map((f) => ({ kind: f.attackKind, outcome: f.outcome })))}`,
    );

    // 经 :387 fecAppendClaim(antiTheaterReport) 真实 kernel 路径：full-scope → R4 不 fire → :373 → ANTI_THEATER_FAIL。
    assert.equal(chain.kernelOutput.verdict, 'UNTESTED', 'full-scope + anti-theater fail must drive kernel UNTESTED via production caller :387');
    assert.equal(
      chain.kernelOutput.decisiveRuleId,
      'ANTI_THEATER_FAIL',
      `decisiveRuleId must be ANTI_THEATER_FAIL (:373 reached through production caller :387, NOT shadowed by R4); got ${chain.kernelOutput.decisiveRuleId}`,
    );
    assert.ok(chain.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'));
    assert.notEqual(chain.machineVerdict, 'CONFIRMED', 'anti-theater fail must block CONFIRMED through the real full-scope production caller');
  } finally {
    db.close();
  }
});

test('hero_a_clean_no_attack_reaches_R7_CONFIRMED: contrast proving the attack (and :387 wiring) is load-bearing', () => {
  // 同一生产 caller 不传攻击 → 干净 single-seed → 无 seed-cherry → R7 CONFIRMED。
  // 反证 :387 wiring 是 ANTI_THEATER_FAIL 的唯一原因（突变 :387 不传 report 亦回 CONFIRMED → 双跑 base FAIL）。
  const db = new Database(':memory:');
  try {
    const chain = buildHeroAChain(db);
    assert.equal(chain.machineVerdict, 'CONFIRMED', 'clean buildHeroAChain (no attack) must reach R7 CONFIRMED (full-scope, channel off)');
    assert.ok(!chain.kernelOutput.reasonCodes.includes('ANTI_THEATER_FAIL'));
    assert.equal(chain.antiTheaterReport.hasFail, false, 'clean run must produce no anti-theater fail');
  } finally {
    db.close();
  }
});
