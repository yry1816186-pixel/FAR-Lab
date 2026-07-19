import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_KINDS,
  FINISH_REASONS,
  PAYLOAD_KINDS,
  PURPOSE_TAGS,
  REPRO_RUN_STATUSES,
  VERDICTS,
  VERDICT_NODE_KINDS,
} from '../../src/schema/enums.ts';
import {
  BACKEND_KINDS,
  MATH_CLAIM_KINDS,
  VERIFICATION_LEVELS,
  VERIFICATION_OUTCOMES,
} from '../../src/math/math_claim.ts';

// T3 moved every migration under schema/migrations/ and renumbered them
// contiguously: 0001_initial / 0002_add_dialogue_tables / 0003_math_verification.
const ddl = readFileSync(new URL('../../schema/migrations/0001_initial.sql', import.meta.url), 'utf8');
const mathDdl = readFileSync(new URL('../../schema/migrations/0003_math_verification.sql', import.meta.url), 'utf8');

function extractCheckValuesFrom(sql: string, columnName: string, occurrence = 0): string[] {
  const pattern = new RegExp(
    `${columnName}\\s+TEXT\\s+NOT NULL[\\s\\S]*?CHECK\\s*\\(\\s*${columnName}\\s+IN\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
    'g',
  );
  const matches = [...sql.matchAll(pattern)];
  const match = matches[occurrence];
  if (match === undefined) {
    throw new Error(`missing CHECK values for ${columnName} occurrence ${occurrence}`);
  }
  const valuesText = match[1];
  if (valuesText === undefined) {
    throw new Error(`empty CHECK capture for ${columnName}`);
  }
  return [...valuesText.matchAll(/'([^']+)'/g)].map((valueMatch) => {
    const value = valueMatch[1];
    if (value === undefined) {
      throw new Error(`invalid CHECK value for ${columnName}`);
    }
    return value;
  });
}

function extractCheckValues(columnName: string, occurrence = 0): string[] {
  return extractCheckValuesFrom(ddl, columnName, occurrence);
}

test('payload_kind CHECK values match TS enum', () => {
  assert.deepEqual(extractCheckValues('payload_kind', 0), [...PAYLOAD_KINDS]);
  assert.deepEqual(extractCheckValues('payload_kind', 1), [...PAYLOAD_KINDS]);
});

test('purpose_tag CHECK values match the 9-value TS enum', () => {
  assert.deepEqual(extractCheckValues('purpose_tag'), [...PURPOSE_TAGS]);
  assert.equal(PURPOSE_TAGS.includes('dialogue'), true);
  assert.equal(PURPOSE_TAGS.includes('baseline_exempt'), true);
});

test('finish_reason, verdict, edge, and repro status CHECK values match TS enums', () => {
  assert.deepEqual(extractCheckValues('finish_reason'), [...FINISH_REASONS]);
  assert.deepEqual(extractCheckValues('node_kind'), [...VERDICT_NODE_KINDS]);
  assert.deepEqual(extractCheckValues('verdict'), [...VERDICTS]);
  assert.deepEqual(extractCheckValues('edge_kind'), [...EDGE_KINDS]);
  assert.deepEqual(extractCheckValues('status'), [...REPRO_RUN_STATUSES]);
});

// ============================================================
// 0003 math_verification schema enum sync (spec 38 · Epic N)
// ============================================================
test('0003 math_claims.claim_kind CHECK values match TS MATH_CLAIM_KINDS (12 values)', () => {
  assert.deepEqual(extractCheckValuesFrom(mathDdl, 'claim_kind'), [...MATH_CLAIM_KINDS]);
});

test('0003 math_claims.required_level CHECK values match TS VERIFICATION_LEVELS (4 values)', () => {
  assert.deepEqual(extractCheckValuesFrom(mathDdl, 'required_level'), [...VERIFICATION_LEVELS]);
});

test('0003 math_claims.expected_outcome CHECK values match TS VERIFICATION_OUTCOMES (3 values)', () => {
  assert.deepEqual(extractCheckValuesFrom(mathDdl, 'expected_outcome'), [...VERIFICATION_OUTCOMES]);
});

test('0003 math_verifications.backend_kind CHECK values match TS BACKEND_KINDS (5 values)', () => {
  assert.deepEqual(extractCheckValuesFrom(mathDdl, 'backend_kind'), [...BACKEND_KINDS]);
});

test('0003 math_verifications.outcome CHECK values match TS VERIFICATION_OUTCOMES (3 values)', () => {
  assert.deepEqual(extractCheckValuesFrom(mathDdl, 'outcome'), [...VERIFICATION_OUTCOMES]);
});
