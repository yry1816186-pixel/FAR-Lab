import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProfileRegistryError,
  OFFLINE_REPLAY_PROFILE_META,
  registerProfile,
  replaceProfile,
  lookupProfile,
  requireProfile,
  listProfiles,
  listProfilesByCapability,
  getGateway,
  getDefaultGateway,
  clearProfileRegistry,
  resetProfileRegistry,
} from '../../src/profiles/index.ts';
import { createLlmGateway } from '../../src/llm_gateway/gateway.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';

function makeFakeGateway() {
  return createLlmGateway([createOfflineReplayAdapter()]);
}

beforeEach(() => {
  resetProfileRegistry();
});

afterEach(() => {
  resetProfileRegistry();
});

test('default registry has offline_replay only', () => {
  assert.deepEqual(listProfiles(), ['offline_replay']);
  const entry = requireProfile('offline_replay');
  assert.equal(entry.meta.name, 'offline_replay');
  assert.equal(entry.meta.requiresApiKey, false);
});

test('getDefaultGateway returns offline_replay', () => {
  const gw = getDefaultGateway();
  assert.equal(gw.registeredProfiles().length > 0, true);
});

test('registerProfile adds a new profile', () => {
  const gw = makeFakeGateway();
  registerProfile(
    {
      name: 'research_best_available',
      displayName: 'Research Best Available',
      description: 'Auto-select best available model.',
      defaultModel: 'qwen-max',
      capabilities: ['reasoning', 'structured'],
      requiresApiKey: true,
    },
    gw,
  );

  assert.deepEqual([...listProfiles()].sort(), ['offline_replay', 'research_best_available']);
  assert.equal(requireProfile('research_best_available').meta.defaultModel, 'qwen-max');
});

test('registerProfile throws on duplicate', () => {
  assert.throws(
    () => registerProfile(OFFLINE_REPLAY_PROFILE_META, makeFakeGateway()),
    ProfileRegistryError,
  );
});

test('replaceProfile swaps a registered profile', () => {
  const oldGw = getGateway('offline_replay');
  const newGw = makeFakeGateway();
  assert.notEqual(oldGw, newGw);

  replaceProfile(
    { ...OFFLINE_REPLAY_PROFILE_META, displayName: 'Replaced Offline' },
    newGw,
  );

  assert.equal(getGateway('offline_replay'), newGw);
});

test('replaceProfile throws for unknown profile', () => {
  assert.throws(
    () =>
      replaceProfile(
        {
          name: 'nonexistent',
          displayName: 'Nope',
          description: '',
          defaultModel: '',
          capabilities: [],
          requiresApiKey: false,
        },
        makeFakeGateway(),
      ),
    ProfileRegistryError,
  );
});

test('lookupProfile returns undefined for unknown', () => {
  assert.equal(lookupProfile('unknown'), undefined);
});

test('requireProfile throws for unknown', () => {
  assert.throws(() => requireProfile('unknown'), ProfileRegistryError);
});

test('listProfilesByCapability filters correctly', () => {
  const gw = makeFakeGateway();
  registerProfile(
    {
      name: 'competition_aliyun_qwen',
      displayName: 'Competition Aliyun Qwen',
      description: 'Competition profile for Qwen.',
      defaultModel: 'qwen3.7-max-2026-05-20',
      capabilities: ['reasoning', 'structured', 'vision'],
      requiresApiKey: true,
    },
    gw,
  );

  const reasoning = listProfilesByCapability('reasoning');
  assert.equal(reasoning.includes('offline_replay'), true);
  assert.equal(reasoning.includes('competition_aliyun_qwen'), true);

  const vision = listProfilesByCapability('vision');
  assert.deepEqual(vision, ['competition_aliyun_qwen']);
});

test('clearProfileRegistry empties everything', () => {
  clearProfileRegistry();
  assert.deepEqual(listProfiles(), []);
  assert.throws(() => getDefaultGateway(), ProfileRegistryError);
});

test('resetProfileRegistry restores to initial state', () => {
  const gw = makeFakeGateway();
  registerProfile(
    {
      name: 'local_open_weights',
      displayName: 'Local Open Weights',
      description: 'Locally served open-weight model.',
      defaultModel: 'qwen3-235b-a22b',
      capabilities: ['reasoning'],
      requiresApiKey: false,
    },
    gw,
  );
  assert.equal(listProfiles().length, 2);

  resetProfileRegistry();
  assert.deepEqual(listProfiles(), ['offline_replay']);
});
