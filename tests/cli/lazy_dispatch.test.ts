/**
 * CLI cold-start architecture regression.
 *
 * `far --help` must not evaluate command implementations: on a WSL 9p-mounted
 * worktree the old eager registry loaded almost the entire source tree before it
 * could print usage, turning every spawned CLI assertion into seconds of startup.
 * The performance gate measures the user-visible wall clock; this test pins the
 * structural cause so a fast workstation cannot hide an eager-import regression.
 *
 * Boundary: static import shape does not prove every dynamically loaded command
 * works. The rest of tests/cli exercises those command paths end to end.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const FAR_ENTRY = new URL('../../src/cli/far.ts', import.meta.url);

function eagerCommandImports(source: string): readonly string[] {
  const file = ts.createSourceFile('far.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: string[] = [];
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.isTypeOnly !== true &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('./commands/')
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return imports;
}

test('far entry keeps every command implementation behind dynamic dispatch', () => {
  const source = readFileSync(FAR_ENTRY, 'utf8');
  assert.deepEqual(
    eagerCommandImports(source),
    [],
    'top-level command imports make --help load command dependency graphs before dispatch',
  );
});

test('lazy-dispatch guard detects an eager command import counterexample', () => {
  const counterexample = "import { runDemo } from './commands/demo.ts';\nvoid runDemo;\n";
  assert.deepEqual(eagerCommandImports(counterexample), ['./commands/demo.ts']);
});
