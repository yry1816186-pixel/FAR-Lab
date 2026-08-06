import type {
  CodeLocation,
  ReplayProver,
  SourceAnchor,
} from '../evidence_log/types.ts';
import type {
  FalsificationSpec,
  ThresholdSemantics,
  ThresholdSpec,
} from './types.ts';

/**
 * Parses and validates an untrusted JSON value into a {@link FalsificationSpec}.
 * Fails closed on any missing or invalid field.
 *
 * @param value - The untrusted JSON value.
 * @returns A validated `FalsificationSpec`.
 * @throws {Error} if any field is missing, wrong type, or non-finite.
 */
export function parseFalsificationSpec(value: unknown): FalsificationSpec {
  const record = requireRecord(value, 'FalsificationSpec');
  return {
    prediction: requireString(record, 'prediction', 'FalsificationSpec'),
    metric: requireString(record, 'metric', 'FalsificationSpec'),
    falsificationThreshold: requireFiniteNumber(record, 'falsificationThreshold', 'FalsificationSpec'),
    thresholdSemantics: parseThresholdSemantics(
      requireString(record, 'thresholdSemantics', 'FalsificationSpec'),
      'FalsificationSpec.thresholdSemantics',
    ),
  };
}

/**
 * Parses and validates an untrusted JSON value into a {@link ThresholdSpec}.
 * Supports single-value and range semantics; validates finite numbers.
 *
 * @param value - The untrusted JSON value.
 * @returns A validated `ThresholdSpec`.
 * @throws {Error} if any field is missing, wrong type, or non-finite.
 */
export function parseThresholdSpec(value: unknown): ThresholdSpec {
  const record = requireRecord(value, 'ThresholdSpec');
  const spec: ThresholdSpec = {
    semantics: parseThresholdSemantics(
      requireString(record, 'semantics', 'ThresholdSpec'),
      'ThresholdSpec.semantics',
    ),
  };
  const valueField = optionalFiniteNumber(record, 'value', 'ThresholdSpec');
  const lower = optionalFiniteNumber(record, 'lower', 'ThresholdSpec');
  const upper = optionalFiniteNumber(record, 'upper', 'ThresholdSpec');
  return {
    ...spec,
    ...(valueField === undefined ? {} : { value: valueField }),
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
  };
}

/**
 * Parses and validates an untrusted JSON value into a {@link SourceAnchor}.
 *
 * @param value - The untrusted JSON value.
 * @returns A validated `SourceAnchor`.
 * @throws {Error} if required fields are missing or wrong type.
 */
export function parseSourceAnchor(value: unknown): SourceAnchor {
  const record = requireRecord(value, 'SourceAnchor');
  const dashscopeRequestId = optionalNullableString(record, 'dashscopeRequestId', 'SourceAnchor');
  const codeLocation = optionalCodeLocation(record, 'codeLocation', 'SourceAnchor');
  return {
    gitCommitSha: requireString(record, 'gitCommitSha', 'SourceAnchor'),
    dashscopeRequestId,
    isoTimestamp: requireString(record, 'isoTimestamp', 'SourceAnchor'),
    rawResponseHash: requireString(record, 'rawResponseHash', 'SourceAnchor'),
    ...(codeLocation === undefined ? {} : { codeLocation }),
  };
}

/**
 * Parses and validates an untrusted JSON value into a {@link ReplayProver}.
 * Ensures `messages` is an array and `params` is a record.
 *
 * @param value - The untrusted JSON value.
 * @returns A validated `ReplayProver`.
 * @throws {Error} if structure is invalid.
 */
export function parseReplayProver(value: unknown): ReplayProver {
  const record = requireRecord(value, 'ReplayProver');
  const messages = record.messages;
  if (!Array.isArray(messages)) {
    throw new Error('ReplayProver.messages must be an array');
  }
  const params = requireRecord(record.params, 'ReplayProver.params');
  const expectedResponseHash = optionalString(record, 'expectedResponseHash', 'ReplayProver');
  return {
    modelSnapshot: requireString(record, 'modelSnapshot', 'ReplayProver'),
    messages,
    seed: requireFiniteNumber(record, 'seed', 'ReplayProver'),
    params,
    ...(expectedResponseHash === undefined ? {} : { expectedResponseHash }),
  };
}

/**
 * Parses a JSON string and returns the result, wrapping parse errors with
 * the provided context string for better diagnostics.
 *
 * @param text - The JSON string to parse.
 * @param context - A label prepended to error messages for traceability.
 * @returns The parsed JSON value.
 * @throws {Error} if `text` is not valid JSON.
 */
export function parseJsonObject(text: string, context: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${context}: invalid JSON: ${error.message}`, { cause: error });
    }
    throw new Error(`${context}: invalid JSON`, { cause: error });
  }
}

function parseThresholdSemantics(value: string, context: string): ThresholdSemantics {
  if (value === 'gt' || value === 'lt' || value === 'range') {
    return value;
  }
  throw new Error(`${context} must be one of gt, lt, range`);
}

function optionalCodeLocation(
  record: Record<string, unknown>,
  key: string,
  context: string,
): CodeLocation | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  const locationRecord = requireRecord(value, `${context}.${key}`);
  const lineNumber = optionalFiniteNumber(locationRecord, 'lineNumber', `${context}.${key}`);
  return {
    filePath: requireString(locationRecord, 'filePath', `${context}.${key}`),
    location: requireString(locationRecord, 'location', `${context}.${key}`),
    ...(lineNumber === undefined ? {} : { lineNumber }),
  };
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${context} must be an object`);
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${context}.${key} must be a string`);
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${context}.${key} must be a string when present`);
}

function optionalNullableString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`${context}.${key} must be a string or null`);
}

function requireFiniteNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`${context}.${key} must be a finite number`);
}

function optionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`${context}.${key} must be a finite number when present`);
}
