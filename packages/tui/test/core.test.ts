/**
 * Deterministic offline tests (node:test, zero deps) for the TUI v2 cores.
 * Run: node --experimental-strip-types --test test/core.test.ts
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  backspace, composerReady, composerText, emptyComposer, extractPaste, insertText, newline, sanitizeText,
} from '../src/composerCore.ts';
import { decide, isFinal } from '../src/approveCore.ts';

test('typing inserts at cursor across CJK multi-char IME payloads', () => {
  let st = emptyComposer();
  st = insertText(st, '为什么');
  st = insertText(st, '维D');
  assert.equal(composerText(st), '为什么维D');
  assert.equal(st.col, 5);
});

test('bracketed paste inserts verbatim, multi-line, never as command keys', () => {
  let st = emptyComposer();
  const pasted = extractPaste('\x1b[200~line1\nline2\nline3\x1b[201~');
  assert.ok(pasted !== null);
  st = insertText(st, pasted);
  assert.equal(composerText(st), 'line1\nline2\nline3');
  // a paste consisting solely of command letters must still be text:
  const evil = extractPaste('\x1b[200~jjjkkq\x1b[201~');
  assert.equal(evil, 'jjjkkq');
});

test('paste without terminator still yields its body (streamed paste)', () => {
  assert.equal(extractPaste('\x1b[200~partial'), 'partial');
  assert.equal(extractPaste('plain typing'), null);
});

test('control sequences never become buffer text', () => {
  assert.equal(sanitizeText('a\x1b[Ab'), 'ab');
  assert.equal(sanitizeText('x\x07y'), 'xy');
});

test('newline + backspace join/split behavior', () => {
  let st = insertText(emptyComposer(), 'ab');
  st = newline(st);
  st = insertText(st, 'cd');
  assert.equal(composerText(st), 'ab\ncd');
  st = backspace(st); // delete 'd'
  st = backspace(st); // delete 'c'  → row 1 is now empty
  assert.equal(composerText(st), 'ab\n');
  st = backspace(st); // empty row start → join onto row 0
  assert.equal(composerText(st), 'ab');
  assert.equal(st.col, 2);
});

test('ready gate: blank/whitespace never ready', () => {
  assert.equal(composerReady(emptyComposer()), false);
  assert.equal(composerReady(insertText(emptyComposer(), '   \n ')), false);
  assert.equal(composerReady(insertText(emptyComposer(), ' question ')), true);
});

test('approval vocabulary decides and filters non-applicable keys', () => {
  assert.equal(decide('y'), 'approved');
  assert.equal(decide('N'), 'denied');
  assert.equal(decide('a'), 'always');
  assert.equal(decide('s'), 'session');
  assert.equal(decide('d'), 'deny_remaining');
  assert.equal(decide('q'), 'abort');
  assert.equal(decide('\x1b'), 'abort');
  assert.equal(decide('x'), 'pending');
  assert.equal(isFinal('pending'), false);
  assert.equal(isFinal('approved'), true);
});
