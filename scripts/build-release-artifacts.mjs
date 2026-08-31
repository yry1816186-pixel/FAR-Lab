#!/usr/bin/env node
import { buildReleaseArtifacts, writeGithubOutputs } from './release-artifacts-lib.mjs';

const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};

try {
  const result = buildReleaseArtifacts({
    exportRoot: value('--export-root', 'build/public-release'),
    sbomPath: value('--sbom', 'build/release-sbom.cdx.json'),
    outDir: value('--out', 'build/release'),
  });
  writeGithubOutputs(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`release artifact build failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
