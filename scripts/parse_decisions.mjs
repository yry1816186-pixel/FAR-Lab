#!/usr/bin/env node
/**
 * parse_decisions —— 决策台账 schema 校验入口（CORE-DECISION-001）。
 *
 * node scripts/parse_decisions.mjs [--file <path>] [--check]
 *   解析 .far/agent/decisions.md（默认）→ parseDecisionLedger → 任何结构违规 exit 1。
 *   --check 语义与无参一致（解析本身就是校验）；私有层缺失 exit 3 fail-closed
 *   （CI skip-if-absent 契约与 requirements:compile / constitution_manifest 同）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDecisionLedger } from '../src/governance/adr_schema.ts';

const DEFAULT_PATH = join(process.cwd(), '.far', 'agent', 'decisions.md');

function main() {
  const argv = process.argv.slice(2);
  const fileIdx = argv.indexOf('--file');
  const path = fileIdx !== -1 ? argv[fileIdx + 1] : DEFAULT_PATH;
  if (path === undefined) {
    console.error('parse_decisions: --file requires a path');
    process.exit(2);
  }
  if (!existsSync(path)) {
    console.error(`parse_decisions: ledger missing: ${path}（私有层未安装——本地校验，CI skip-if-absent）`);
    process.exit(3);
  }
  const { entries, violations } = parseDecisionLedger(readFileSync(path, 'utf8'));
  if (violations.length > 0) {
    console.error(`parse_decisions: FAIL — ${violations.length} malformed decision block(s):`);
    for (const v of violations) {
      console.error(`  ${v.heading}: missing/invalid [${v.missingFields.join(', ')}]`);
    }
    process.exit(1);
  }
  console.log(`parse_decisions: PASS — ${entries.length} decision(s), all 7-slot complete`);
  process.exit(0);
}

main();
