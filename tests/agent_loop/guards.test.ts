/**
 * guards.test.ts — IC-02 G1 受保护动作闸门 + G2 写权限清单验收。
 *
 * 验收 Oracle(合同 contract-002):
 *   ② 受保护动作经 LLM 建议路径 → deny(全部 6 类动作 × llm_suggestion/external_content);
 *      默认 deny(未知动作/未知发起方);人类与确定性代码路径 allow。
 *   G2:写路径清单登记;清单外写入 → 拒绝。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTECTED_ACTIONS,
  protectedActionGuard,
  AGENT_WRITE_MANIFEST,
  isAgentWriteAllowed,
  assertAgentWriteAllowed,
} from '../../src/agent_loop/guards.ts';

test('② 全部受保护动作 × LLM 建议/外部内容 → deny(不经 LLM 判断)', () => {
  for (const action of PROTECTED_ACTIONS) {
    for (const initiator of ['llm_suggestion', 'external_content'] as const) {
      const decision = protectedActionGuard(action, initiator);
      assert.equal(decision.allow, false, `${action} via ${initiator} 应拒绝`);
      assert.match(decision.reason, /DENIED/);
    }
  }
});

test('人类通道与确定性代码 → allow;未知动作/未知发起方 → 默认 deny', () => {
  for (const action of PROTECTED_ACTIONS) {
    assert.equal(protectedActionGuard(action, 'cli_user').allow, true);
    assert.equal(protectedActionGuard(action, 'api_user').allow, true);
    assert.equal(protectedActionGuard(action, 'deterministic_code').allow, true);
  }
  assert.equal(protectedActionGuard('rm_rf', 'cli_user').allow, false);
  assert.equal(protectedActionGuard('seal', 'mystery_caller').allow, false);
});

test('G2 写路径清单:清单内允许,清单外 fail-closed', () => {
  assert.ok(AGENT_WRITE_MANIFEST.length >= 6, '清单须覆盖 db 与 fs 写面');
  assert.equal(isAgentWriteAllowed('db:call_records#appendRecord(LLM 调用证据行)'), true);
  assert.equal(isAgentWriteAllowed('db:sqlite_master#DROP TABLE'), false);
  assert.throws(() => assertAgentWriteAllowed('fs:/etc/passwd#overwrite'), /不在 AGENT_WRITE_MANIFEST/);
  assert.doesNotThrow(() => assertAgentWriteAllowed('fs:.far/fsm_state.json#fsm advance(非 dry-run)'));
});
