import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../../src/schema/enums.ts';
import type { Verdict } from '../../src/schema/enums.ts';
import {
  decideFiveValueVerdict,
  type VerdictKernelInput,
} from '../../src/falsifiability/verdict_kernel_v2.ts';

interface ExpectedOracle {
  readonly verdict: Verdict;
  readonly decisiveRuleId: string;
  readonly reasonCodes: readonly string[];
  readonly untestedReason: string | null;
}

const CASE_DIR = fileURLToPath(new URL('../../golden_vectors/cases/', import.meta.url));

test('on-disk GV-01..GV-14 verdict oracle cases match the V2 kernel', () => {
  const files = readdirSync(CASE_DIR)
    .filter((file) => /^GV-\d+\.json$/.test(file))
    .sort();
  assert.equal(files.length, 14);

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(CASE_DIR, file), 'utf8'));
    const root = readRecord(parsed, file);
    const input = readRecord(root.input, `${file}.input`);
    const evidences = readArray(input.evidences, `${file}.input.evidences`);
    assert.ok(evidences.every(isRecord), `${file}.input.evidences entries must be objects`);

    const kernel = input.kernel;
    assert.ok(isVerdictKernelInput(kernel), `${file}.input.kernel must match VerdictKernelInput shape`);
    const expected = readExpected(readRecord(root.expected, `${file}.expected`), file);
    const output = decideFiveValueVerdict(kernel);

    assert.equal(output.verdict, expected.verdict, `${file} verdict`);
    assert.equal(output.decisiveRuleId, expected.decisiveRuleId, `${file} decisiveRuleId`);
    assert.deepEqual([...output.reasonCodes], [...expected.reasonCodes], `${file} reasonCodes`);
    assert.equal(output.untestedReason, expected.untestedReason, `${file} untestedReason`);
  }
});

function readExpected(value: Record<string, unknown>, file: string): ExpectedOracle {
  const verdict = readVerdict(value.verdict, `${file}.expected.verdict`);
  return {
    verdict,
    decisiveRuleId: readString(value.decisiveRuleId, `${file}.expected.decisiveRuleId`),
    reasonCodes: readStringArray(value.reasonCodes, `${file}.expected.reasonCodes`),
    untestedReason: readNullableString(value.untestedReason, `${file}.expected.untestedReason`),
  };
}

function isVerdictKernelInput(value: unknown): value is VerdictKernelInput {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Object.hasOwn(value, 'fec') &&
    Array.isArray(value.datasetBindings) &&
    Array.isArray(value.statistics) &&
    Array.isArray(value.protocolDeviations) &&
    Array.isArray(value.antiTheaterFindings) &&
    isRecord(value.evidenceSufficiency) &&
    Array.isArray(value.contradictionSet) &&
    Array.isArray(value.integrityFlags)
  );
}

function readRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context}: expected object`);
  }
  return value;
}

function readArray(value: unknown, context: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: expected array`);
  }
  return value;
}

function readString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context}: expected non-empty string`);
  }
  return value;
}

function readStringArray(value: unknown, context: string): readonly string[] {
  const raw = readArray(value, context);
  const strings: string[] = [];
  for (let index = 0; index < raw.length; index++) {
    strings.push(readString(raw[index], `${context}[${index}]`));
  }
  return strings;
}

function readNullableString(value: unknown, context: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, context);
}

function readVerdict(value: unknown, context: string): Verdict {
  const verdict = readString(value, context);
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    throw new Error(`${context}: unknown verdict ${verdict}`);
  }
  return verdict as Verdict;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
