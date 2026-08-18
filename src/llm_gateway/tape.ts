// src/llm_gateway/tape.ts
// Model Tape: record real LIVE model calls and replay them deterministically.
//
// Integrity contract:
//   - recording is content-addressed by the exact canonical request;
//   - canonical request, response, and complete entry hashes are verified on every read;
//   - missing, corrupt, and version-drifted tapes fail closed;
//   - replay is always labelled RECORDED_REPLAY and never masquerades as LIVE.
//
// This integrity layer detects accidental corruption and edits whose hashes were not
// deliberately recomputed. It does not authenticate the external provider or protect
// against a writer who can rewrite the tape and all hashes; those require a signed
// provider receipt or another independent verification channel.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import stableStringify from 'fast-json-stable-stringify';
import { z } from 'zod';

import { detectCachedSecret } from '../retrieval/cache.ts';

/** Tape storage root (runtime artifact; gitignored). */
export const TAPE_ROOT = '.far/tapes';

/** Version 2 adds response and whole-entry integrity hashes. */
export const TAPE_SCHEMA_VERSION = 2;

/** Replay mode labels shared with the research execution model. */
export type ReplayMode = 'LIVE' | 'RECORDED_REPLAY';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SAFE_STAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const TapeEntryBodySchema = z.object({
  schemaVersion: z.literal(TAPE_SCHEMA_VERSION),
  /** Content-address key = sha256(profile + canonical request). */
  requestHash: z.string().regex(SHA256_HEX),
  /** sha256 of responseJson bytes. */
  responseHash: z.string().regex(SHA256_HEX),
  stageId: z.string().regex(SAFE_STAGE_ID),
  profile: z.string().min(1),
  /** Canonical request captured after the secret scan. */
  requestJson: z.string().min(1),
  /** Canonical response captured after the secret scan. */
  responseJson: z.string().min(1),
  /** Recording fact: only a real LIVE call may be written. */
  mode: z.literal('LIVE'),
  recordedAt: z.string().datetime({ offset: true }),
  /** Build/version that produced the live response. */
  codeVersion: z.string().min(1),
  /** A failed scan is never written. */
  secretScan: z.object({ passed: z.literal(true), detector: z.null() }).strict(),
}).strict();

export const TapeEntrySchema = TapeEntryBodySchema.extend({
  /** sha256 of the canonical entry body (all fields except entryHash). */
  entryHash: z.string().regex(SHA256_HEX),
}).strict();

export type TapeEntry = z.infer<typeof TapeEntrySchema>;
type TapeEntryBody = z.infer<typeof TapeEntryBodySchema>;

/** Missing tape: replay never falls through to network, fixtures, or an empty response. */
export class MissingTapeError extends Error {
  readonly stageId: string;
  readonly requestHash: string;

  constructor(stageId: string, requestHash: string) {
    super(
      `missing tape for stage '${stageId}' (requestHash ${requestHash.slice(0, 12)}...) ` +
        '- no tape, no replay (fail-closed)',
    );
    this.name = 'MissingTapeError';
    this.stageId = stageId;
    this.requestHash = requestHash;
  }
}

/** A tape file exists but is malformed or has failed an integrity check. */
export class CorruptTapeError extends Error {
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`corrupt tape '${path}': ${reason} - replay blocked (fail-closed)`);
    this.name = 'CorruptTapeError';
    this.path = path;
    this.reason = reason;
  }
}

/** An existing content address contains different recorded evidence. */
export class TapeAlreadyExistsError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`tape already exists at '${path}' with different recorded evidence`);
    this.name = 'TapeAlreadyExistsError';
    this.path = path;
  }
}

/** Existing tape uses a schema that this runtime cannot verify. */
export class UnsupportedTapeSchemaError extends Error {
  readonly path: string;
  readonly foundVersion: unknown;
  readonly supportedVersion: number;

  constructor(path: string, foundVersion: unknown) {
    super(
      `unsupported tape schema in '${path}': found ${String(foundVersion)}, ` +
        `requires ${TAPE_SCHEMA_VERSION} - replay blocked`,
    );
    this.name = 'UnsupportedTapeSchemaError';
    this.path = path;
    this.foundVersion = foundVersion;
    this.supportedVersion = TAPE_SCHEMA_VERSION;
  }
}

/** Tape version drift: the current build must explicitly decide whether to proceed. */
export class TapeVersionDriftError extends Error {
  readonly recorded: string;
  readonly current: string;

  constructor(recorded: string, current: string) {
    super(
      `tape version drift: recorded under '${recorded}' but current build is '${current}' ` +
        '- replay invalid without explicit decision',
    );
    this.name = 'TapeVersionDriftError';
    this.recorded = recorded;
    this.current = current;
  }
}

function canonicalJson(value: unknown, context: string): string {
  assertCanonicalJsonValue(value, context);
  const canonical = stableStringify(value);
  if (canonical === undefined) {
    throw new Error(`${context}: value is not canonical-JSON serializable`);
  }
  return canonical;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertCanonicalJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object> = new WeakSet<object>(),
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path}: NaN and Infinity are not allowed in Model Tape JSON`);
    }
    return;
  }
  if (
    value === undefined ||
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    throw new Error(`${path}: ${typeof value} is not allowed in Model Tape JSON`);
  }
  if (typeof value !== 'object') {
    throw new Error(`${path}: unsupported value in Model Tape JSON`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${path}: cyclic objects are not allowed in Model Tape JSON`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        assertCanonicalJsonValue(item, `${path}[${index}]`, ancestors);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `${path}: only plain objects and arrays are allowed in Model Tape JSON`,
      );
    }
    for (const [key, item] of Object.entries(value)) {
      assertCanonicalJsonValue(item, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertTapeRoot(root: string): void {
  if (root.trim().length === 0) {
    throw new Error('Model Tape root must be non-empty');
  }
}

function assertProfile(profile: string): void {
  if (profile.trim().length === 0) {
    throw new Error('Model Tape profile must be non-empty');
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

/** Exact request -> content address. */
export function tapeRequestHash(profile: string, request: unknown): string {
  assertProfile(profile);
  return sha256Text(canonicalJson({ profile, request }, 'tapeRequestHash'));
}

function tapeEntryHash(body: TapeEntryBody): string {
  return sha256Text(canonicalJson(body, 'tapeEntryHash'));
}

function assertSafeStageId(stageId: string): void {
  if (!SAFE_STAGE_ID.test(stageId)) {
    throw new Error(
      `invalid tape stageId '${stageId}': expected ${SAFE_STAGE_ID.source} (path separators forbidden)`,
    );
  }
}

function tapePath(root: string, stageId: string, requestHash: string): string {
  assertTapeRoot(root);
  assertSafeStageId(stageId);
  if (!SHA256_HEX.test(requestHash)) {
    throw new Error('invalid tape requestHash: expected lowercase sha256 hex');
  }
  return join(root, `${stageId}-${requestHash}.json`);
}

function entryBody(entry: TapeEntry): TapeEntryBody {
  return {
    schemaVersion: entry.schemaVersion,
    requestHash: entry.requestHash,
    responseHash: entry.responseHash,
    stageId: entry.stageId,
    profile: entry.profile,
    requestJson: entry.requestJson,
    responseJson: entry.responseJson,
    mode: entry.mode,
    recordedAt: entry.recordedAt,
    codeVersion: entry.codeVersion,
    secretScan: entry.secretScan,
  };
}

function verifyTapeEntry(entry: TapeEntry, path: string): TapeEntry {
  let request: unknown;
  try {
    request = JSON.parse(entry.requestJson) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CorruptTapeError(path, `requestJson is invalid JSON (${reason})`);
  }
  if (canonicalJson(request, 'verifyTapeEntry.request') !== entry.requestJson) {
    throw new CorruptTapeError(path, 'requestJson is not canonical JSON');
  }

  const expectedRequestHash = tapeRequestHash(entry.profile, request);
  if (entry.requestHash !== expectedRequestHash) {
    throw new CorruptTapeError(path, 'requestHash does not match profile + requestJson');
  }

  const expectedResponseHash = sha256Text(entry.responseJson);
  if (entry.responseHash !== expectedResponseHash) {
    throw new CorruptTapeError(path, 'responseHash does not match responseJson');
  }
  let response: unknown;
  try {
    response = JSON.parse(entry.responseJson) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CorruptTapeError(path, `responseJson is invalid JSON (${reason})`);
  }
  if (canonicalJson(response, 'verifyTapeEntry.response') !== entry.responseJson) {
    throw new CorruptTapeError(path, 'responseJson is not canonical JSON');
  }

  const expectedEntryHash = tapeEntryHash(entryBody(entry));
  if (entry.entryHash !== expectedEntryHash) {
    throw new CorruptTapeError(path, 'entryHash does not match canonical tape metadata');
  }

  return entry;
}

export interface RecordTapeInput {
  readonly stageId: string;
  readonly profile: string;
  readonly request: unknown;
  readonly response: unknown;
  readonly codeVersion: string;
  readonly recordedAt?: string;
}

export type RecordTapeResult =
  | { readonly ok: true; readonly entry: TapeEntry; readonly path: string }
  | { readonly ok: false; readonly reason: 'secret-detected'; readonly detector: string };

/**
 * Record one real LIVE call. The caller must invoke this only after a successful live call.
 * Request and response are canonicalized and scanned before any bytes are written.
 */
export function recordTapeCall(root: string, input: RecordTapeInput): RecordTapeResult {
  assertTapeRoot(root);
  assertSafeStageId(input.stageId);
  assertProfile(input.profile);
  if (input.profile === 'offline_replay') {
    throw new Error('recordTapeCall: offline_replay is not a LIVE provider profile');
  }
  if (input.codeVersion.trim().length === 0) {
    throw new Error('recordTapeCall: codeVersion must be non-empty');
  }
  const requestJson = canonicalJson(input.request, 'recordTapeCall.request');
  const responseJson = canonicalJson(input.response, 'recordTapeCall.response');

  for (const [label, text] of [
    ['request', requestJson],
    ['response', responseJson],
  ] as const) {
    const detector = detectCachedSecret(text);
    if (detector !== null) {
      return { ok: false, reason: 'secret-detected', detector: `${label}:${detector}` };
    }
  }

  const body = TapeEntryBodySchema.parse({
    schemaVersion: TAPE_SCHEMA_VERSION,
    requestHash: tapeRequestHash(input.profile, input.request),
    responseHash: sha256Text(responseJson),
    stageId: input.stageId,
    profile: input.profile,
    requestJson,
    responseJson,
    mode: 'LIVE',
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    codeVersion: input.codeVersion,
    secretScan: { passed: true, detector: null },
  });
  const entry = TapeEntrySchema.parse({ ...body, entryHash: tapeEntryHash(body) });

  mkdirSync(root, { recursive: true });
  const path = tapePath(root, entry.stageId, entry.requestHash);
  try {
    writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error: unknown) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error;
    }
    const existing = loadTapeEntry(root, input.stageId, input.profile, input.request);
    if (
      existing !== null &&
      existing.responseHash === entry.responseHash &&
      existing.codeVersion === entry.codeVersion
    ) {
      return { ok: true, entry: existing, path };
    }
    throw new TapeAlreadyExistsError(path);
  }
  return { ok: true, entry, path };
}

/**
 * Load and verify a tape. Missing returns null; malformed/tampered/unsupported files throw.
 */
export function loadTapeEntry(
  root: string,
  stageId: string,
  profile: string,
  request: unknown,
): TapeEntry | null {
  const requestHash = tapeRequestHash(profile, request);
  const path = tapePath(root, stageId, requestHash);
  if (!existsSync(path)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CorruptTapeError(path, `file is not valid JSON (${reason})`);
  }

  if (
    typeof decoded === 'object' &&
    decoded !== null &&
    'schemaVersion' in decoded &&
    decoded.schemaVersion !== TAPE_SCHEMA_VERSION
  ) {
    throw new UnsupportedTapeSchemaError(path, decoded.schemaVersion);
  }

  const parsed = TapeEntrySchema.safeParse(decoded);
  if (!parsed.success) {
    throw new CorruptTapeError(path, parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  return verifyTapeEntry(parsed.data, path);
}

export interface ReplayedCall<T> {
  readonly response: T;
  readonly mode: ReplayMode;
  readonly tapeEntry: TapeEntry;
}

/**
 * Replay the exact canonical recorded response. Missing, corrupt, and version-drifted tapes fail closed.
 */
export function replayFromTape<T>(
  root: string,
  stageId: string,
  profile: string,
  request: unknown,
  currentCodeVersion: string,
  options: { readonly allowVersionDrift?: boolean } = {},
): ReplayedCall<T> {
  const entry = loadTapeEntry(root, stageId, profile, request);
  if (entry === null) {
    throw new MissingTapeError(stageId, tapeRequestHash(profile, request));
  }
  if (entry.codeVersion !== currentCodeVersion && options.allowVersionDrift !== true) {
    throw new TapeVersionDriftError(entry.codeVersion, currentCodeVersion);
  }
  return {
    response: JSON.parse(entry.responseJson) as T,
    mode: 'RECORDED_REPLAY',
    tapeEntry: entry,
  };
}

export interface PartialReplayReport {
  readonly requested: readonly { stageId: string; profile: string; request: unknown }[];
  readonly covered: readonly string[];
  readonly missing: readonly string[];
  readonly partial: boolean;
}

/** Report exact replay coverage; corruption propagates instead of being counted as missing. */
export function partialReplayReport(
  root: string,
  requested: readonly { stageId: string; profile: string; request: unknown }[],
): PartialReplayReport {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const item of requested) {
    if (loadTapeEntry(root, item.stageId, item.profile, item.request) !== null) {
      covered.push(item.stageId);
    } else {
      missing.push(item.stageId);
    }
  }
  return { requested, covered, missing, partial: missing.length > 0 && covered.length > 0 };
}
