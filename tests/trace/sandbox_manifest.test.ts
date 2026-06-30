/**
 * sandbox_manifest.test.ts —— M-08 分层沙箱清单单元测试。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/18 §4 (I4: Sandbox manifest + control-plane split)。
 *
 * 覆盖：
 *   - SandboxManifest 构建（10 工具覆盖）
 *   - globalHonestyTier 计算（当前全 manifest-only）
 *   - 未落地沙箱工具的检测（getUnresolvedSandboxTools）
 *   - 工具白名单一致性校验
 *   - 边界条件：非白名单工具名、空 tier 列表
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SANDHONESTY_TIERS,
  buildSandboxManifest,
  createSandboxToolEntry,
  getUnresolvedSandboxTools,
  isToolSandboxAllowed,
  lowestHonestyTier,
} from '../../src/tools/sandbox_manifest.ts';
import { TOOL_WHITELIST } from '../../src/tools/tool_whitelist.ts';
import type { SandboxHonestyTier } from '../../src/tools/sandbox_manifest.ts';

test('M-08 SANDHONESTY_TIERS: four tiers in ascending order', () => {
  assert.equal(SANDHONESTY_TIERS.length, 4);
  assert.deepEqual([...SANDHONESTY_TIERS], [
    'manifest-only',
    'process-isolation',
    'network-isolation',
    'full-vm-isolation',
  ]);
});

test('M-08 createSandboxToolEntry: produces valid entry for known tool', () => {
  const entry = createSandboxToolEntry({
    toolName: 'read_evidence',
    requiresSandbox: false,
    sideEffect: false,
  });

  assert.equal(entry.toolName, 'read_evidence');
  assert.equal(entry.requiresSandbox, false);
  assert.equal(entry.sideEffect, false);
  assert.equal(entry.honestyTier, 'manifest-only');
  assert.equal(entry.resourceLimits, null, 'manifest-only tools have null resource limits');
});

test('M-08 createSandboxToolEntry: write_evidence requires sandbox', () => {
  const entry = createSandboxToolEntry({
    toolName: 'write_evidence',
    requiresSandbox: true,
    sideEffect: true,
  });

  assert.equal(entry.requiresSandbox, true);
  assert.equal(entry.sideEffect, true);
  assert.equal(entry.honestyTier, 'manifest-only');
});

test('M-08 createSandboxToolEntry: rejects non-whitelisted tool', () => {
  assert.throws(
    () =>
      createSandboxToolEntry({
        toolName: 'not_a_real_tool',
        requiresSandbox: false,
        sideEffect: false,
      }),
    /is not in TOOL_WHITELIST/,
  );
});

test('M-08 buildSandboxManifest: covers all 10 whitelisted tools', () => {
  const manifest = buildSandboxManifest({
    generatedAt: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(manifest.version, 1);
  assert.equal(manifest.allowPersistentWorkspace, false);
  assert.ok(manifest.generatedAt.length > 0);

  const toolNames = Object.keys(manifest.tools);
  assert.equal(toolNames.length, TOOL_WHITELIST.length);
  assert.equal(toolNames.length, 10);

  for (const toolName of TOOL_WHITELIST) {
    assert.ok(toolName in manifest.tools, `manifest must include ${toolName}`);
    const entry = manifest.tools[toolName];
    assert.ok(entry !== undefined);
    assert.equal(entry.honestyTier, 'manifest-only');
    assert.equal(entry.resourceLimits, null);
  }
});

test('M-08 buildSandboxManifest: globalHonestyTier is manifest-only when all tools are manifest-only', () => {
  const manifest = buildSandboxManifest({
    generatedAt: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(manifest.globalHonestyTier, 'manifest-only');
  // §2.4: 未实现物理隔离前只标 manifest-only
  for (const entry of Object.values(manifest.tools)) {
    assert.equal(entry.honestyTier, 'manifest-only');
  }
});

test('M-08 getUnresolvedSandboxTools: identifies tools that need sandbox but are manifest-only', () => {
  const manifest = buildSandboxManifest({
    generatedAt: '2026-06-27T00:00:00.000Z',
  });

  const unresolved = getUnresolvedSandboxTools(manifest);

  // 当前 3 个工具 requiresSandbox=true 但 honestyTier=manifest-only
  // write_evidence, invoke_llm, run_python
  assert.equal(unresolved.length, 3);
  assert.ok(unresolved.includes('write_evidence'));
  assert.ok(unresolved.includes('invoke_llm'));
  assert.ok(unresolved.includes('run_python'));
});

test('M-08 isToolSandboxAllowed: whitelisted tools are allowed', () => {
  const manifest = buildSandboxManifest({
    generatedAt: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(isToolSandboxAllowed(manifest, 'read_evidence'), true);
  assert.equal(isToolSandboxAllowed(manifest, 'solve_symbolic'), true);
  assert.equal(isToolSandboxAllowed(manifest, 'not_a_tool'), false);
});

test('M-08 lowestHonestyTier: returns manifest-only for empty input', () => {
  assert.equal(lowestHonestyTier([]), 'manifest-only');
});

test('M-08 lowestHonestyTier: returns lowest tier in mixed list', () => {
  const tiers: SandboxHonestyTier[] = ['network-isolation', 'manifest-only', 'full-vm-isolation'];
  assert.equal(lowestHonestyTier(tiers), 'manifest-only');
});

test('M-08 lowestHonestyTier: process lower than network', () => {
  const tiers: SandboxHonestyTier[] = ['process-isolation', 'network-isolation'];
  assert.equal(lowestHonestyTier(tiers), 'process-isolation');
});

test('M-08 manifest does not claim physical isolation (§2.4 compliance)', () => {
  const manifest = buildSandboxManifest({
    generatedAt: '2026-06-27T00:00:00.000Z',
  });

  // 诚实声明：当前无实际隔离
  assert.notEqual(manifest.globalHonestyTier, 'process-isolation');
  assert.notEqual(manifest.globalHonestyTier, 'network-isolation');
  assert.notEqual(manifest.globalHonestyTier, 'full-vm-isolation');
  assert.equal(manifest.globalHonestyTier, 'manifest-only');
  assert.equal(manifest.allowPersistentWorkspace, false);

  // 所有工具 resourceLimits 均为 null
  for (const entry of Object.values(manifest.tools)) {
    assert.equal(entry.resourceLimits, null);
  }
});
