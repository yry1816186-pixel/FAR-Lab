#!/usr/bin/env node
import { addAttestationBundles } from './release-artifacts-lib.mjs';

const value = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

try {
  const provenanceBundle = value('--provenance') ?? process.env.PROVENANCE_BUNDLE;
  const sbomBundle = value('--sbom') ?? process.env.SBOM_BUNDLE;
  if (!provenanceBundle || !sbomBundle) throw new Error('--provenance and --sbom bundle paths are required');
  const result = addAttestationBundles({
    releaseDir: value('--release-dir') ?? process.env.RELEASE_DIR ?? 'build/release',
    provenanceBundle,
    sbomBundle,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`attestation finalization failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
