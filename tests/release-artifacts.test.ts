import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const created: string[] = [];

const write = (root: string, path: string, body: string) => {
  const absolute = join(root, path);
  mkdirSync(resolve(absolute, '..'), { recursive: true });
  writeFileSync(absolute, body);
};

const fixture = (ecosystems = ['npm', 'cargo', 'pypi']) => {
  const root = mkdtempSync(join(tmpdir(), 'farlab-release-test-'));
  created.push(root);
  const exportRoot = join(root, 'export');
  const exported = join(exportRoot, 'farlab-public-abcdef0');
  mkdirSync(exported, { recursive: true });
  const manifest = (name: string) => `${JSON.stringify({ name, version: '0.1.0' })}\n`;
  write(exported, 'package.json', manifest('far-lab'));
  write(exported, 'web/package.json', manifest('far-lab-web'));
  write(exported, 'packages/tui/package.json', manifest('@far-lab/tui'));
  write(exported, 'desktop/package.json', manifest('far-lab-desktop'));
  write(exported, 'desktop/src-tauri/tauri.conf.json', manifest('FAR-Lab'));
  write(exported, 'desktop/src-tauri/Cargo.toml', '[package]\nname = "far-lab-desktop"\nversion = "0.1.0"\n');
  write(exported, 'experiment-runtime/pyproject.toml', '[project]\nname = "farlab-experiment-runtime"\nversion = "0.1.0"\n');
  write(exported, 'CHANGELOG.md', '# Changelog\n\n## [0.1.0] - UNRELEASED\n\n- fixture\n');
  write(exported, 'PROVENANCE.json', `${JSON.stringify({
    schema: 'farlab.public-export-provenance.v1',
    sourceCommit: 'abcdef0123456789abcdef0123456789abcdef01',
    sourceCommittedAt: '2026-08-31T00:00:00Z',
  })}\n`);
  write(exported, 'src/example.ts', 'export const value = 1;\n');
  const sbom = join(root, 'sbom.cdx.json');
  writeFileSync(sbom, `${JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    components: ecosystems.map((name) => ({ type: 'library', name, version: '1.0.0', purl: `pkg:${name}/example@1.0.0` })),
  })}\n`);
  return { root, exportRoot, sbom };
};

const build = (exportRoot: string, sbom: string, out: string) => spawnSync(process.execPath, [
  join(ROOT, 'scripts/build-release-artifacts.mjs'),
  '--export-root', exportRoot,
  '--sbom', sbom,
  '--out', out,
], { cwd: ROOT, encoding: 'utf8' });

const onlyArtifact = (dir: string, suffix: string) => {
  const matches = readdirSync(dir).filter((name) => name.endsWith(suffix));
  expect(matches).toHaveLength(1);
  return join(dir, matches[0]);
};

afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform !== 'linux')('release artifact integrity', () => {
  it('builds a reproducible archive and independently verifies every payload hash', () => {
    const { root, exportRoot, sbom } = fixture();
    const first = join(root, 'release-a');
    const second = join(root, 'release-b');
    const a = build(exportRoot, sbom, first);
    const b = build(exportRoot, sbom, second);
    expect(a.status, a.stderr).toBe(0);
    expect(b.status, b.stderr).toBe(0);
    const archiveA = onlyArtifact(first, '.tar.gz');
    const archiveB = onlyArtifact(second, '.tar.gz');
    expect(readFileSync(archiveA).equals(readFileSync(archiveB))).toBe(true);
    const verify = spawnSync(process.execPath, [join(ROOT, 'scripts/verify-release-artifacts.mjs'), first], { encoding: 'utf8' });
    expect(verify.status, verify.stderr).toBe(0);
    expect(JSON.parse(verify.stdout).sbom.ecosystems).toEqual(['npm', 'cargo', 'pypi']);
  });

  it('rejects a checksummed artifact after tampering', () => {
    const { root, exportRoot, sbom } = fixture();
    const out = join(root, 'release');
    const result = build(exportRoot, sbom, out);
    expect(result.status, result.stderr).toBe(0);
    const manifest = onlyArtifact(out, '.manifest.json');
    writeFileSync(manifest, `${readFileSync(manifest, 'utf8')} `);
    const verify = spawnSync(process.execPath, [join(ROOT, 'scripts/verify-release-artifacts.mjs'), out], { encoding: 'utf8' });
    expect(verify.status).toBe(1);
    expect(verify.stderr).toContain('checksum mismatch');
  });

  it('refuses to label an npm-only inventory as a multi-ecosystem SBOM', () => {
    const { root, exportRoot, sbom } = fixture(['npm']);
    const result = build(exportRoot, sbom, join(root, 'release'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing lock ecosystems: cargo, pypi');
  });

  it('adds self-authenticating bundles without changing the already-attested checksum subject', () => {
    const { root, exportRoot, sbom } = fixture();
    const out = join(root, 'release');
    const result = build(exportRoot, sbom, out);
    expect(result.status, result.stderr).toBe(0);
    const before = readFileSync(join(out, 'SHA256SUMS'));
    const provenance = join(root, 'provenance.json');
    const sbomAttestation = join(root, 'sbom-attestation.json');
    writeFileSync(provenance, '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}\n');
    writeFileSync(sbomAttestation, '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}\n');
    const finalize = spawnSync(process.execPath, [
      join(ROOT, 'scripts/finalize-release-attestations.mjs'),
      '--release-dir', out,
      '--provenance', provenance,
      '--sbom', sbomAttestation,
    ], { cwd: ROOT, encoding: 'utf8' });
    expect(finalize.status, finalize.stderr).toBe(0);
    expect(readFileSync(join(out, 'SHA256SUMS')).equals(before)).toBe(true);
    expect(existsSync(join(out, 'provenance.sigstore.json'))).toBe(true);
    expect(existsSync(join(out, 'sbom-attestation.sigstore.json'))).toBe(true);
  });
});
