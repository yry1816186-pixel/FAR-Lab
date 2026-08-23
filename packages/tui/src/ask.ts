/**
 * One-line stdin ask, robust where raw mode is unavailable (mintty/Git Bash,
 * piped stdin, CI). Three traps killed the naive versions (2026-08-23 live
 * probe, Node v24/Windows):
 *  1. `readline/promises` question() — the second sequential question never
 *     settles on piped stdin (unsettled top-level await);
 *  2. a fresh interface per question — readline reads stdin in chunks, so a
 *     later line is already buffered in the PREVIOUS interface and dies with
 *     its close();
 *  3. attaching a once('line') only while asking — a 'line' event emitted
 *     with no listener is silently dropped by EventEmitter, and after EOF
 *     the dead interface throws 'readline was closed' on the next prompt().
 * Hence: ONE persistent interface with an ALWAYS-ON 'line' listener feeding
 * a queue; ask() drains the queue, else parks a waiter. EOF resolves '' so
 * callers decide honestly instead of hanging.
 */
import * as readline from 'node:readline';

const queued: string[] = [];
const waiters: Array<(line: string) => void> = [];
let iface: readline.Interface | null = null;

function start(): readline.Interface {
  if (iface !== null) return iface;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line: string): void => {
    const next = waiters.shift();
    if (next !== undefined) next(line);
    else queued.push(line);
  });
  rl.on('close', (): void => {
    iface = null;
    for (const w of waiters.splice(0)) w('');
  });
  iface = rl;
  return rl;
}

export function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    if (iface === null && waiters.length === 0 && queued.length === 0 && !process.stdin.readable) {
      // Session already ended (EOF consumed everything) — resolve honestly.
      process.stdout.write(prompt);
      resolve('');
      return;
    }
    const rl = start();
    rl.setPrompt(prompt);
    rl.prompt();
    const buffered = queued.shift();
    if (buffered !== undefined) resolve(buffered);
    else waiters.push(resolve);
  });
}

/** End-of-session cleanup for the caller's finally block. */
export function closeAsk(): void {
  iface?.close();
  iface = null;
}
