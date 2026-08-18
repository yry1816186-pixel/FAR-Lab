import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CorruptTapeError,
  TapeAlreadyExistsError,
  TAPE_SCHEMA_VERSION,
  UnsupportedTapeSchemaError,
  recordTapeCall,
  replayFromTape,
} from '../../src/llm_gateway/tape.ts';

const CODE_VERSION = 'a'.repeat(40);

function recordOne(root: string): { readonly path: string } {
  const result = recordTapeCall(root, {
    stageId: 'stage1_understanding',
    profile: 'competition_aliyun_qwen',
    request: { messages: [{ role: 'user', content: 'question' }] },
    response: { content: 'answer', providerRequestId: 'req-1' },
    codeVersion: CODE_VERSION,
    recordedAt: '2026-08-18T08:00:00.000Z',
  });
  if (!result.ok) {
    throw new Error(`recording unexpectedly rejected: ${result.detector}`);
  }
  assert.equal(result.ok, true);
  return { path: result.path };
}

test('Model Tape v2 records request, response, and whole-entry integrity hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    const { path } = recordOne(root);
    const entry = JSON.parse(readFileSync(path, 'utf8')) as {
      readonly schemaVersion?: number;
      readonly requestHash?: string;
      readonly responseHash?: string;
      readonly entryHash?: string;
    };
    assert.equal(entry.schemaVersion, TAPE_SCHEMA_VERSION);
    assert.match(entry.requestHash ?? '', /^[0-9a-f]{64}$/);
    assert.match(entry.responseHash ?? '', /^[0-9a-f]{64}$/);
    assert.match(entry.entryHash ?? '', /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('response tampering is detected instead of replayed', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    const { path } = recordOne(root);
    const entry = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    entry.responseJson = '{"content":"fabricated answer","providerRequestId":"req-1"}';
    writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');

    assert.throws(
      () =>
        replayFromTape(
          root,
          'stage1_understanding',
          'competition_aliyun_qwen',
          { messages: [{ role: 'user', content: 'question' }] },
          CODE_VERSION,
        ),
      (error: unknown) =>
        error instanceof CorruptTapeError && /responseHash/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('metadata tampering is detected by the whole-entry hash', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    const { path } = recordOne(root);
    const entry = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    entry.recordedAt = '2030-01-01T00:00:00.000Z';
    writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');

    assert.throws(
      () =>
        replayFromTape(
          root,
          'stage1_understanding',
          'competition_aliyun_qwen',
          { messages: [{ role: 'user', content: 'question' }] },
          CODE_VERSION,
        ),
      (error: unknown) =>
        error instanceof CorruptTapeError && /entryHash/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy tapes without integrity fields fail with an explicit schema error', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    const { path } = recordOne(root);
    const entry = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    entry.schemaVersion = 1;
    delete entry.responseHash;
    delete entry.entryHash;
    writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');

    assert.throws(
      () =>
        replayFromTape(
          root,
          'stage1_understanding',
          'competition_aliyun_qwen',
          { messages: [{ role: 'user', content: 'question' }] },
          CODE_VERSION,
        ),
      UnsupportedTapeSchemaError,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stage identifiers cannot escape the tape root', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    assert.throws(
      () =>
        recordTapeCall(root, {
          stageId: '../escape',
          profile: 'competition_aliyun_qwen',
          request: { q: 'x' },
          response: { a: 'y' },
          codeVersion: CODE_VERSION,
        }),
      /path separators forbidden/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('identical recording retries are idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    const first = recordOne(root);
    const retried = recordOne(root);
    assert.equal(retried.path, first.path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a different response cannot overwrite an existing content address', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    recordOne(root);
    assert.throws(
      () =>
        recordTapeCall(root, {
          stageId: 'stage1_understanding',
          profile: 'competition_aliyun_qwen',
          request: { messages: [{ role: 'user', content: 'question' }] },
          response: { content: 'different answer', providerRequestId: 'req-2' },
          codeVersion: CODE_VERSION,
          recordedAt: '2026-08-18T08:01:00.000Z',
        }),
      TapeAlreadyExistsError,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-finite values cannot be silently normalized into a tape', () => {
  const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
  try {
    assert.throws(
      () =>
        recordTapeCall(root, {
          stageId: 'stage1_understanding',
          profile: 'competition_aliyun_qwen',
          request: { temperature: Number.NaN },
          response: { content: 'answer' },
          codeVersion: CODE_VERSION,
        }),
      /NaN and Infinity are not allowed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Date, Map, Set, and class instances cannot define tape identity implicitly', () => {
  class CustomPayload {
    readonly content = 'answer';
  }

  const nonPlainValues: readonly unknown[] = [
    new Date('2026-08-18T08:00:00.000Z'),
    new Map([['content', 'answer']]),
    new Set(['answer']),
    new CustomPayload(),
  ];

  for (const value of nonPlainValues) {
    const root = mkdtempSync(join(tmpdir(), 'far-tape-integrity-'));
    try {
      assert.throws(
        () =>
          recordTapeCall(root, {
            stageId: 'stage1_understanding',
            profile: 'competition_aliyun_qwen',
            request: { q: 'x' },
            response: value,
            codeVersion: CODE_VERSION,
          }),
        /only plain objects and arrays are allowed/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
