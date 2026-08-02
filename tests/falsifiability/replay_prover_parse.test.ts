/**
 * replay_prover_parse.test.ts — parseReplayProver(falsifiability/schemas.ts)输入守卫。
 *
 * parseReplayProver 解析不可信 JSON(DB/外部 replay prover 描述)为 ReplayProver。
 * requireRecord/requireString/requireFiniteNumber 共享守卫 + 显式 messages-array 守卫
 * 此前零测覆盖(verdict_kernel 等测消费已构造的 ReplayProver,不测解析路径)。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReplayProver } from '../../src/falsifiability/schemas.ts';

const VALID = { modelSnapshot: 'qwen-2.5', messages: [{ role: 'user', content: 'q' }], seed: 42, params: { temperature: 0.7 } };

test('parseReplayProver: 根非对象 → requireRecord fail-closed', () => {
  assert.throws(() => parseReplayProver('not-object'), /ReplayProver must be an object/);
  assert.throws(() => parseReplayProver([1, 2, 3]), /ReplayProver must be an object/);
  assert.throws(() => parseReplayProver(null), /ReplayProver must be an object/);
});

test('parseReplayProver: messages 非数组 → fail-closed(显式守卫)', () => {
  assert.throws(
    () => parseReplayProver({ ...VALID, messages: 'not-array' }),
    /ReplayProver.messages must be an array/,
  );
  assert.throws(
    () => parseReplayProver({ ...VALID, messages: 123 }),
    /messages must be an array/,
  );
});

test('parseReplayProver: modelSnapshot 非串 → requireString fail-closed', () => {
  assert.throws(
    () => parseReplayProver({ messages: [], seed: 1, params: {} }),
    /ReplayProver\.modelSnapshot must be a string/,
  );
});

test('parseReplayProver: seed 非有限数 → requireFiniteNumber fail-closed', () => {
  assert.throws(
    () => parseReplayProver({ ...VALID, seed: 'x' }),
    /ReplayProver\.seed must be a finite number/,
  );
  assert.throws(
    () => parseReplayProver({ ...VALID, seed: NaN }),
    /seed must be a finite number/,
  );
});

test('parseReplayProver: params 非对象 → requireRecord fail-closed', () => {
  assert.throws(
    () => parseReplayProver({ ...VALID, params: 'x' }),
    /ReplayProver\.params must be an object/,
  );
});

test('parseReplayProver: 合法输入正常解析(回归基线)', () => {
  const result = parseReplayProver(VALID);
  assert.equal(result.modelSnapshot, 'qwen-2.5');
  assert.equal(result.seed, 42);
  assert.deepEqual(result.messages, [{ role: 'user', content: 'q' }]);
  assert.equal(result.expectedResponseHash, undefined);
});

test('parseReplayProver: expectedResponseHash 可选(有则保留·无则省)', () => {
  const withHash = parseReplayProver({ ...VALID, expectedResponseHash: 'abc123' });
  assert.equal(withHash.expectedResponseHash, 'abc123');
  const withoutHash = parseReplayProver(VALID);
  assert.equal(withoutHash.expectedResponseHash, undefined);
});
