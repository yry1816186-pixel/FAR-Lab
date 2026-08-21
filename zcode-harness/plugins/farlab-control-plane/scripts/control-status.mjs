#!/usr/bin/env node
import { summarizeWorkspace } from '../lib/control.mjs';

const cwd = process.argv[2] || process.cwd();
const requireFrontier = process.argv.includes('--no-frontier') ? false : true;
const summary = summarizeWorkspace(cwd, { requireFrontier });
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
