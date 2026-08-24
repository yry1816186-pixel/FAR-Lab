/**
 * Live-core tests (node:test, deterministic — no network): SSE incremental
 * parsing (frame splits, comments, multi-line data, CR stripping), backoff
 * policy, and the incremental stage merge vs the reference full-list
 * derivation.
 * Run: node --experimental-strip-types --test test/liveCore.test.ts
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  applyEventToStages, backoffDelayMs, emptySseState, parseSseChunk, stagesFromEvents, stageRows,
} from '../src/liveCore.ts';
import { deriveStages } from '../src/narrative.ts';
import type { RunEvent } from '../src/api.ts';

test('parseSseChunk: complete frames in one chunk', () => {
  const { messages } = parseSseChunk(emptySseState(),
    ': stream open\n\n' +
    'id: 7\nevent: run-event\ndata: {"seq":7}\n\n' +
    ': ping\n\n');
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.id, 7);
  assert.equal(messages[0]!.event, 'run-event');
  assert.equal(messages[0]!.data, '{"seq":7}');
});

test('parseSseChunk: frames split across chunks reassemble (id/data/blank-line splits)', () => {
  const wire = 'id: 12\nevent: run-event\ndata: {"seq":12,"type":"stage_done"}\n\n';
  // split at every single-char boundary position — the parser must never lose or duplicate content
  for (let cut = 1; cut < wire.length - 1; cut += 1) {
    let parseState = emptySseState();
    const first = parseSseChunk(parseState, wire.slice(0, cut));
    parseState = first.state;
    const second = parseSseChunk(parseState, wire.slice(cut));
    const all = [...first.messages, ...second.messages];
    assert.equal(all.length, 1, `cut at ${cut}`);
    assert.equal(all[0]!.id, 12, `cut at ${cut}`);
    assert.equal(JSON.parse(all[0]!.data).type, 'stage_done', `cut at ${cut}`);
    assert.equal(second.state.tail, '', `cut at ${cut}`);
  }
});

test('parseSseChunk: CRLF wires parse identically; multi-line data joins with \\n', () => {
  const { messages } = parseSseChunk(emptySseState(), 'id: 3\r\ndata: line1\r\ndata: line2\r\n\r\n');
  assert.equal(messages[0]!.data, 'line1\nline2');
});

test('parseSseChunk: comment-only keep-alives produce no messages; unknown fields ignored', () => {
  const { messages } = parseSseChunk(emptySseState(), ': ping\nretry: 5000\n\n');
  assert.equal(messages.length, 0);
});

test('backoffDelayMs: 500ms base, doubling, capped at 8s', () => {
  assert.equal(backoffDelayMs(0), 500);
  assert.equal(backoffDelayMs(1), 1_000);
  assert.equal(backoffDelayMs(2), 2_000);
  assert.equal(backoffDelayMs(3), 4_000);
  assert.equal(backoffDelayMs(4), 8_000);
  assert.equal(backoffDelayMs(50), 8_000);
  assert.equal(backoffDelayMs(-3), 500); // defensive clamp
});

const ev = (seq: number, type: string, stage: string, summary?: string): RunEvent => ({
  seq, at: new Date(2026, 0, 1, 0, 0, seq).toISOString(), type, stage,
  ...(summary !== undefined ? { detail: { summary } } : {}),
});

test('applyEventToStages: incremental merge equals the full-list derivation', () => {
  const events: RunEvent[] = [
    ev(1, 'stage_started', 'scope', '开始界定'),
    ev(2, 'stage_done', 'scope'),
    ev(3, 'stage_failed', 'retrieve', '网络错误'),
    ev(4, 'stage_started', 'retrieve'),
    ev(5, 'stage_done', 'retrieve', '检索 12 篇'),
    ev(6, 'run_note', 'scope'), // non-transition types are ignored by both paths
  ];
  let map = stagesFromEvents(events.slice(0, 0));
  for (const e of events) map = applyEventToStages(map, e);
  const incremental = stageRows(map);
  const reference = deriveStages(events);
  assert.deepEqual(
    incremental.map((r) => [r.stage, r.status]),
    reference.map((r) => [r.stage, r.status]),
  );
  // summary keeps the last non-empty value (retrieve's later '检索 12 篇' wins)
  const retrieve = incremental.find((r) => r.stage === 'retrieve')!;
  assert.equal(retrieve.summary, '检索 12 篇');
  // newest first
  assert.equal(incremental[0]!.stage, 'retrieve');
});

test('applyEventToStages: input map is never mutated (pure)', () => {
  const base = stagesFromEvents([ev(1, 'stage_done', 'scope')]);
  const snapshot = new Map(base);
  applyEventToStages(base, ev(2, 'stage_started', 'retrieve'));
  assert.deepEqual(base, snapshot);
});
