import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIALOGUE_TOOL_IDS,
  DIALOGUE_TOOLS,
  assertAllToolsReadonly,
  getDialogueTool,
  invokeDialogueTool,
} from '../../src/dialogue/tool_registry.ts';

test('DIALOGUE_TOOLS has exactly 4 tools', () => {
  assert.equal(DIALOGUE_TOOLS.length, 4);
});

test('DIALOGUE_TOOL_IDS has exactly 4 ids', () => {
  assert.equal(DIALOGUE_TOOL_IDS.length, 4);
  assert.deepEqual([...DIALOGUE_TOOL_IDS], [
    'search_literature', 'fetch_baseline', 'check_dataset', 'lookup_glossary',
  ]);
});

test('all 4 tools are readonly=true', () => {
  for (const tool of DIALOGUE_TOOLS) {
    assert.equal(tool.readonly, true, `tool ${tool.toolId} is not readonly`);
  }
});

test('assertAllToolsReadonly does not throw', () => {
  assert.doesNotThrow(() => assertAllToolsReadonly());
});

test('search_literature returns citations for astronomy', () => {
  const result = invokeDialogueTool('search_literature', { keyword: 'astronomy' });
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.ok(result.data.citationCount !== undefined);
});

test('search_literature returns error for empty keyword', () => {
  const result = invokeDialogueTool('search_literature', {});
  assert.equal(result.ok, false);
  assert.notEqual(result.error, null);
});

test('fetch_baseline returns description for random_forest', () => {
  const result = invokeDialogueTool('fetch_baseline', { name: 'random_forest' });
  assert.equal(result.ok, true);
  assert.match(result.data.description as string, /Random Forest/);
});

test('fetch_baseline returns error for unknown baseline', () => {
  const result = invokeDialogueTool('fetch_baseline', { name: 'nonexistent' });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /not found/);
});

test('check_dataset returns availability for gaia_dr3', () => {
  const result = invokeDialogueTool('check_dataset', { datasetId: 'gaia_dr3' });
  assert.equal(result.ok, true);
  assert.equal(result.data.available, true);
});

test('check_dataset returns unavailable for hypothetical_v1', () => {
  const result = invokeDialogueTool('check_dataset', { datasetId: 'hypothetical_v1' });
  assert.equal(result.ok, true);
  assert.equal(result.data.available, false);
});

test('lookup_glossary returns definition for falsifiability', () => {
  const result = invokeDialogueTool('lookup_glossary', { term: 'falsifiability' });
  assert.equal(result.ok, true);
  assert.match(result.data.definition as string, /Falsifiability/);
});

test('getDialogueTool returns null for unknown toolId', () => {
  assert.equal(getDialogueTool('nonexistent_tool'), null);
});

test('invokeDialogueTool returns error for unknown toolId', () => {
  const result = invokeDialogueTool('nonexistent_tool', {});
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /unknown toolId/);
});
