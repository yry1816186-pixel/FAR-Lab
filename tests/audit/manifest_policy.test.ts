import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_EXECUTION_MANIFEST,
  ROLE_NAMES,
  decideRoleAction,
  explainRoleAction,
  isRoleName,
} from '../../src/audit/manifest_policy.ts';

test('agent execution manifest is development-only and has all six roles', () => {
  assert.equal(AGENT_EXECUTION_MANIFEST.version, 1);
  assert.equal(AGENT_EXECUTION_MANIFEST.scope, 'development_only');
  assert.equal(AGENT_EXECUTION_MANIFEST.dialogueMode, 'disabled');

  for (const roleName of ROLE_NAMES) {
    const role = AGENT_EXECUTION_MANIFEST.roles[roleName];
    assert.ok(role.purpose.length > 0);
    assert.ok(role.allow.length > 0);
    assert.ok(role.ask.length > 0);
    assert.ok(role.deny.length > 0);
    assert.ok(role.requiredOutput.length > 0);
  }
});

test('builder cannot cross Ask-layer boundaries silently', () => {
  assert.equal(decideRoleAction('builder', 'edit_src'), 'allow');
  assert.equal(decideRoleAction('builder', 'edit_schema'), 'ask');
  assert.equal(decideRoleAction('builder', 'edit_ci'), 'ask');
  assert.equal(decideRoleAction('builder', 'add_dependency'), 'ask');
  assert.equal(decideRoleAction('builder', 'paid_api_call'), 'ask');
  assert.equal(decideRoleAction('builder', 'read_secret'), 'deny');
  assert.equal(decideRoleAction('builder', 'weaken_test'), 'deny');
  assert.equal(decideRoleAction('builder', 'use_any_escape'), 'deny');
});

test('research scout cannot edit production source', () => {
  assert.equal(decideRoleAction('research_scout', 'web_search'), 'allow');
  assert.equal(decideRoleAction('research_scout', 'edit_src'), 'deny');
  assert.equal(decideRoleAction('research_scout', 'add_verified_fact'), 'ask');
});

test('unknown role actions default to ask', () => {
  assert.equal(decideRoleAction('verifier_redteam', 'unexpected_action'), 'ask');
  assert.equal(explainRoleAction('builder', 'edit_schema'), 'builder:edit_schema:ask');
  assert.equal(isRoleName('builder'), true);
  assert.equal(isRoleName('not_a_role'), false);
});

test('yaml manifest contains the same role names as the tested policy', () => {
  const manifestText = readFileSync(new URL('../../agent_execution_manifest.yaml', import.meta.url), 'utf8');
  assert.match(manifestText, /scope: development_only/);
  for (const roleName of ROLE_NAMES) {
    assert.match(manifestText, new RegExp(`  ${roleName}:`));
  }
});
