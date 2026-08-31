#!/usr/bin/env node
import { verifyReleaseArtifacts } from './release-artifacts-lib.mjs';

const releaseDir = process.argv[2] ?? 'build/release';
try {
  console.log(JSON.stringify(verifyReleaseArtifacts(releaseDir), null, 2));
} catch (error) {
  console.error(`release artifact verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
