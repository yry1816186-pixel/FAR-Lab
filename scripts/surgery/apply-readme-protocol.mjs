#!/usr/bin/env node
/**
 * Anchored insertion patch for README.md — adds the research-protocol-layer
 * feature bullet after the experiment-execution bullet. Fail-loud unique
 * anchor; idempotent re-runs.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'README.md';
let src = readFileSync(PATH, 'utf8');

const MARKER = '- **Research protocol layer (paradigm-honest execution)**';
if (src.includes(MARKER)) {
  console.log('[surgery:readme] protocol bullet already present — nothing to do');
  process.exit(0);
}

const anchor = '- **Experiment execution layer** — Python sidecar (`experiment-runtime/`) with durable scheduler, dataset acquisition (ARFF/CSV/OpenML), train/eval with mechanical statistical verdicts, exploratory CodeAct analysis op under dual static gates (TS policy gate + Python AST mirror, dunder-traversal escape banned) in a restricted sandbox namespace — outputs are candidate findings only, never verdicts; remote execution over stdio JSON protocol\n';
const insertion = [
  '- **Research protocol layer (paradigm-honest execution)** — when a plan\'s real-world legs (bench / field / human-subjects / engineering / archive / theory) cannot run computationally, the execute stage registers a FROZEN protocol: preregistered materials, instruments, arms and sampling, a code-committed randomization sequence (seeded by the plan hash — regenerated, never re-randomized), steps with explicit human-confirmation requirements, measurement variables with declarative QC, fail-closed ethics gates and stop conditions. Execution is tracked in an append-only HUMAN-ATTESTED ledger — the software never claims execution, it awaits real-world records; completed (or explicitly published) outcomes re-enter the causal loop as experiment feedback. HTTP: `GET /api/v1/runs/:id/protocol`, `POST /api/v1/runs/:id/protocol/records`',
  '',
].join('\n');

const count = src.split(anchor).length - 1;
if (count !== 1) {
  console.error(`[surgery:readme] anchor not unique (found ${count})`);
  process.exit(1);
}
src = src.replace(anchor, anchor + insertion);
writeFileSync(PATH, src);
console.log('[surgery:readme] protocol feature bullet inserted');
