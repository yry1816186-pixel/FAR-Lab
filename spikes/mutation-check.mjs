#!/usr/bin/env node
/**
 * W7 mutation spot-checks: inject a defect into each new fault-tolerance branch,
 * run the guarding test file, assert it goes RED, restore. Exit 0 = all three
 * mutations were caught (tests are discriminating); exit 1 = a mutation survived.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (cmd) => execFileSync(cmd, { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const testsRed = (file) => {
  try {
    const out = stripAnsi(run(`npx vitest run ${file} --reporter=basic 2>&1`));
    return /Tests\s+\d+ failed/.test(out) || /Test Files\s+\d+ failed/.test(out);
  } catch (e) {
    const out = stripAnsi(String(e.stdout ?? '') + String(e.stderr ?? ''));
    return /Tests\s+\d+ failed/.test(out) || /Test Files\s+\d+ failed/.test(out);
  }
};

const cases = [
  {
    name: 'M1 legacy quote scan: stop escaping inner quotes (emit the quote raw and close the string)',
    file: 'src/providers/http.ts',
    test: 'tests/json-repair.test.ts',
    mutate: (s) => s.replace("out += '\\\\\"';", "out += ch; inString = false;"),
  },
  {
    name: 'M2 truncation gate: ignore finish_reason (always allow the repair engine)',
    file: 'src/providers/http.ts',
    test: 'tests/providers.test.ts',
    mutate: (s) => s.replace("const truncationConfirmed = attempt.finishReason === 'length';", "const truncationConfirmed = false;"),
  },
  {
    name: 'M3 engine: drop the missing-object-end completion (R10)',
    file: 'src/providers/json-repair.ts',
    test: 'tests/json-repair.test.ts',
    mutate: (s) => s.replace("output = insertBeforeLastWhitespace(output, '}'); // repair missing end bracket", "/* mutated */"),
  },
];

let allCaught = true;
for (const c of cases) {
  const backup = `${c.file}.mutation-bak`;
  copyFileSync(c.file, backup);
  const original = readFileSync(c.file, 'utf8');
  const mutated = c.mutate(original);
  if (mutated === original) {
    console.log(`[SKIP-MISMATCH] ${c.name} — anchor not found, mutation NOT applied`);
    allCaught = false;
    continue;
  }
  writeFileSync(c.file, mutated);
  const red = testsRed(c.test);
  copyFileSync(backup, c.file);
  console.log(`${red ? '[CAUGHT]' : '[SURVIVED]'} ${c.name}`);
  if (!red) allCaught = false;
}
console.log(allCaught ? 'MUTATION CHECK: all mutations caught (tests discriminate)' : 'MUTATION CHECK: FAILURE — a mutation survived');
process.exit(allCaught ? 0 : 1);
