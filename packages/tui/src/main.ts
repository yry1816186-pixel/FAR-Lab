#!/usr/bin/env node
/**
 * Entry: full-screen Ink when the terminal can actually enter raw mode;
 * otherwise degrade to line-mode readline (Scout B: mintty/Git Bash throws on
 * setRawMode — the fallback is an architectural requirement, not a nicety).
 */
import { runInk } from './ink.ts';
import { runReadline } from './fallback.ts';

function rawModeWorks(): boolean {
  if (process.stdin.isTTY !== true) return false;
  try {
    const before = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.setRawMode(before ?? false);
    return true;
  } catch {
    return false;
  }
}

if (rawModeWorks()) {
  runInk();
} else {
  runReadline();
}
