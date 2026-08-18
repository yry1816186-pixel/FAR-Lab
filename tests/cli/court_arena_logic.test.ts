import { test } from 'node:test';
import assert from 'node:assert';

import { computeAgreement } from '../../src/cli/commands/court.ts';
import { detectRefuterAttack } from '../../src/cli/commands/arena.ts';

test('computeAgreement: identical complete verdicts are unanimous', () => {
  assert.strictEqual(computeAgreement(['CONFIRMED', 'CONFIRMED', 'CONFIRMED']), 'unanimous');
  assert.strictEqual(computeAgreement(['REFUTED']), 'unanimous');
});

test('computeAgreement: two complete verdict values are majority', () => {
  assert.strictEqual(computeAgreement(['CONFIRMED', 'CONFIRMED', 'REFUTED']), 'majority');
  assert.strictEqual(computeAgreement(['CONFIRMED', 'REFUTED']), 'majority');
});

test('computeAgreement: three or more complete verdict values are split', () => {
  assert.strictEqual(
    computeAgreement(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE']),
    'split',
  );
  assert.strictEqual(
    computeAgreement(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'UNTESTED']),
    'split',
  );
});

test('computeAgreement: any missing verdict makes agreement inconclusive', () => {
  assert.strictEqual(computeAgreement(['CONFIRMED', null]), 'inconclusive');
  assert.strictEqual(computeAgreement([null, null]), 'inconclusive');
  assert.strictEqual(computeAgreement([]), 'inconclusive');
});

test('detectRefuterAttack: a different non-null verdict lands', () => {
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'REFUTED'), true);
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'INCONCLUSIVE'), true);
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'UNTESTED'), true);
});

test('detectRefuterAttack: an identical verdict is held', () => {
  assert.strictEqual(detectRefuterAttack('CONFIRMED', 'CONFIRMED'), false);
  assert.strictEqual(detectRefuterAttack('REFUTED', 'REFUTED'), false);
});

test('detectRefuterAttack: missing verdicts are not counted as landed attacks', () => {
  assert.strictEqual(detectRefuterAttack('CONFIRMED', null), false);
  assert.strictEqual(detectRefuterAttack(null, 'REFUTED'), false);
  assert.strictEqual(detectRefuterAttack(null, null), false);
});

test('detectRefuterAttack covers every pair in the five-value verdict alphabet', () => {
  const verdicts = ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'] as const;
  for (const original of verdicts) {
    for (const refuter of verdicts) {
      assert.strictEqual(
        detectRefuterAttack(original, refuter),
        original !== refuter,
        `original=${original} refuter=${refuter}`,
      );
    }
  }
});
