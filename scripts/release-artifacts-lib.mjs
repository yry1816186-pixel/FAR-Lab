import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const GENERATED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.cache',
  'coverage',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'test-results',
  'playwright-report',
]);

const fail = (message) => {
  throw new Error(message);
};

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON (${path}): ${error instanceof Error ? error.message : String(error)}`);
  }
};

const portable = (path) => path.split(sep).join('/');

export const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const validateRelativePath = (path, label) => {
  if (!path || isAbsolute(path) || path.includes('\\') || path.split('/').includes('..')) {
    fail(`${label} contains an unsafe path: ${JSON.stringify(path)}`);
  }
};

export const walkFiles = (root) => {
  const files = [];
  const caseFolded = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(dir, entry.name);
      const path = portable(relative(root, absolute));
      validateRelativePath(path, 'release tree');
      const segments = path.split('/');
      if (segments.some((segment) => GENERATED_SEGMENTS.has(segment))) {
        fail(`release tree contains generated content: ${path}`);
      }
      if (entry.isSymbolicLink()) fail(`release tree contains a symbolic link: ${path}`);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) fail(`release tree contains a non-file entry: ${path}`);
      const folded = path.toLocaleLowerCase('en-US');
      const prior = caseFolded.get(folded);
      if (prior !== undefined) fail(`release tree has a case-insensitive path collision: ${prior} / ${path}`);
      caseFolded.set(folded, path);
      const stat = lstatSync(absolute);
      files.push({ path, size: stat.size, sha256: sha256File(absolute) });
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
};

const manifestVersion = (path) => {
  const manifest = readJson(path, 'package manifest');
  if (typeof manifest.version !== 'string') fail(`package manifest has no version: ${path}`);
  return manifest.version;
};

const sectionVersion = (path, section) => {
  const source = readFileSync(path, 'utf8');
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${section}]`);
  if (start === -1) fail(`${path} has no [${section}] section`);
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\s*\[/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  const version = lines.slice(start + 1, end).join('\n').match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (version === undefined) fail(`${path} has no version in [${section}]`);
  return version;
};

export const verifyVersionConsistency = (root) => {
  const version = manifestVersion(join(root, 'package.json'));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) fail(`invalid release version: ${version}`);
  const observed = [
    ['web/package.json', manifestVersion(join(root, 'web', 'package.json'))],
    ['packages/tui/package.json', manifestVersion(join(root, 'packages', 'tui', 'package.json'))],
    ['desktop/package.json', manifestVersion(join(root, 'desktop', 'package.json'))],
    ['desktop/src-tauri/tauri.conf.json', manifestVersion(join(root, 'desktop', 'src-tauri', 'tauri.conf.json'))],
    ['desktop/src-tauri/Cargo.toml', sectionVersion(join(root, 'desktop', 'src-tauri', 'Cargo.toml'), 'package')],
    ['experiment-runtime/pyproject.toml', sectionVersion(join(root, 'experiment-runtime', 'pyproject.toml'), 'project')],
  ];
  const drift = observed.filter(([, value]) => value !== version);
  if (drift.length > 0) fail(`release version drift from ${version}: ${drift.map(([path, value]) => `${path}=${value}`).join(', ')}`);
  return version;
};

const releaseSection = (root, version) => {
  const source = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^## \\[${escaped}\\] - ([^\\r\\n]+)\\r?\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'm'));
  if (match === null) fail(`CHANGELOG.md has no section for ${version}`);
  return { marker: match[1].trim(), body: match[2].trim() };
};

export const verifyReleaseTag = (root, tag) => {
  const version = verifyVersionConsistency(root);
  if (tag !== `v${version}`) fail(`tag ${tag} does not match release version v${version}`);
  const section = releaseSection(root, version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(section.marker)) {
    fail(`CHANGELOG.md section ${version} is not release-dated (found ${section.marker})`);
  }
  return { version, notes: section.body };
};

const flattenComponents = (components, out = []) => {
  for (const component of components ?? []) {
    out.push(component);
    flattenComponents(component.components, out);
  }
  return out;
};

export const validateCycloneDx = (path) => {
  const sbom = readJson(path, 'SBOM');
  if (sbom.bomFormat !== 'CycloneDX' || typeof sbom.specVersion !== 'string') {
    fail('SBOM is not JSON CycloneDX');
  }
  const components = flattenComponents(sbom.components);
  if (components.length === 0) fail('CycloneDX SBOM contains no components');
  const purls = components.map((component) => component.purl).filter((purl) => typeof purl === 'string');
  const missing = ['npm', 'cargo', 'pypi'].filter((ecosystem) => !purls.some((purl) => purl.startsWith(`pkg:${ecosystem}/`)));
  if (missing.length > 0) fail(`CycloneDX SBOM is missing lock ecosystems: ${missing.join(', ')}`);
  return { specVersion: sbom.specVersion, components: components.length, ecosystems: ['npm', 'cargo', 'pypi'] };
};

const findExportDirectory = (exportRoot) => {
  const candidates = readdirSync(exportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('farlab-public-'))
    .map((entry) => join(exportRoot, entry.name));
  if (candidates.length !== 1) fail(`expected exactly one farlab-public-* directory in ${exportRoot}; found ${candidates.length}`);
  return candidates[0];
};

const requireGnuTar = () => {
  const version = execFileSync('tar', ['--version'], { encoding: 'utf8' });
  if (!version.includes('GNU tar')) fail('release archive construction requires GNU tar on the canonical Ubuntu release runner');
};

export const writeChecksums = (releaseDir) => {
  const entries = readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'SHA256SUMS')
    .map((entry) => entry.name)
    .sort();
  if (entries.length === 0) fail(`no release artifacts found in ${releaseDir}`);
  const lines = entries.map((name) => `${sha256File(join(releaseDir, name))}  ${name}`);
  writeFileSync(join(releaseDir, 'SHA256SUMS'), `${lines.join('\n')}\n`);
  return entries;
};

export const buildReleaseArtifacts = ({ exportRoot, sbomPath, outDir }) => {
  const resolvedExportRoot = resolve(exportRoot);
  const resolvedSbom = resolve(sbomPath);
  const resolvedOut = resolve(outDir);
  if (!existsSync(resolvedExportRoot)) fail(`export root does not exist: ${resolvedExportRoot}`);
  if (!existsSync(resolvedSbom)) fail(`SBOM does not exist: ${resolvedSbom}`);
  if (existsSync(resolvedOut) && readdirSync(resolvedOut).length > 0) fail(`release output directory must be empty: ${resolvedOut}`);
  mkdirSync(resolvedOut, { recursive: true });

  const exportDir = findExportDirectory(resolvedExportRoot);
  const provenance = readJson(join(exportDir, 'PROVENANCE.json'), 'export provenance');
  if (provenance.schema !== 'farlab.public-export-provenance.v1' || !/^[0-9a-f]{40,64}$/.test(provenance.sourceCommit ?? '')) {
    fail('export provenance has no valid source commit');
  }
  const sourceEpoch = Math.floor(Date.parse(provenance.sourceCommittedAt) / 1000);
  if (!Number.isSafeInteger(sourceEpoch)) fail(`invalid source commit timestamp: ${provenance.sourceCommittedAt}`);
  const version = verifyVersionConsistency(exportDir);
  const changelog = releaseSection(exportDir, version);
  const sbomSummary = validateCycloneDx(resolvedSbom);
  const shortSha = provenance.sourceCommit.slice(0, 7);
  const prefix = `farlab-public-${version}+${shortSha}`;
  const archivePath = join(resolvedOut, `${prefix}.tar.gz`);
  const manifestPath = join(resolvedOut, `${prefix}.manifest.json`);
  const copiedSbomPath = join(resolvedOut, `${prefix}.cdx.json`);
  const notesPath = join(resolvedOut, 'RELEASE_NOTES.md');
  copyFileSync(resolvedSbom, copiedSbomPath);

  const files = walkFiles(exportDir);
  const manifest = {
    schema: 'farlab.release-manifest.v1',
    version,
    sourceCommit: provenance.sourceCommit,
    sourceCommittedAt: provenance.sourceCommittedAt,
    rootDirectory: basename(exportDir),
    files,
    sbom: sbomSummary,
    reproducibility: {
      archive: 'GNU tar; sorted paths; source-commit mtime; numeric uid/gid 0; atime/ctime omitted',
      knownNonDeterminism: 'The separately checksummed SBOM records the scanner version and generation time.',
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(notesPath, `# FAR-Lab ${version}\n\nStatus: ${changelog.marker}\n\n${changelog.body}\n`);

  requireGnuTar();
  execFileSync('tar', [
    '--sort=name',
    '--format=pax',
    `--mtime=@${sourceEpoch}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '--pax-option=delete=atime,delete=ctime',
    '-czf',
    archivePath,
    '-C',
    dirname(exportDir),
    basename(exportDir),
  ], { stdio: 'inherit' });
  writeChecksums(resolvedOut);
  const verified = verifyReleaseArtifacts(resolvedOut);
  return { version, archive: archivePath, manifest: manifestPath, sbom: copiedSbomPath, notes: notesPath, checksums: join(resolvedOut, 'SHA256SUMS'), verified };
};

const parseChecksums = (releaseDir) => {
  const path = join(releaseDir, 'SHA256SUMS');
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const seen = new Set();
  const entries = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})[ ]{2}([^/\\]+)$/);
    if (match === null) fail(`malformed SHA256SUMS line: ${line}`);
    const [, expected, name] = match;
    if (seen.has(name)) fail(`duplicate SHA256SUMS entry: ${name}`);
    seen.add(name);
    const artifact = join(releaseDir, name);
    if (!existsSync(artifact) || !lstatSync(artifact).isFile()) fail(`checksummed artifact is missing: ${name}`);
    const actual = sha256File(artifact);
    if (actual !== expected) fail(`checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
    entries.push(name);
  }
  return entries;
};

const oneWithSuffix = (entries, suffix) => {
  const matches = entries.filter((name) => name.endsWith(suffix));
  if (matches.length !== 1) fail(`expected exactly one ${suffix} artifact; found ${matches.length}`);
  return matches[0];
};

export const verifyReleaseArtifacts = (releaseDir) => {
  const root = resolve(releaseDir);
  const entries = parseChecksums(root);
  const archiveName = oneWithSuffix(entries, '.tar.gz');
  const manifestName = oneWithSuffix(entries, '.manifest.json');
  const sbomName = oneWithSuffix(entries, '.cdx.json');
  if (!entries.includes('RELEASE_NOTES.md')) fail('SHA256SUMS does not cover RELEASE_NOTES.md');
  const sbom = validateCycloneDx(join(root, sbomName));
  const manifest = readJson(join(root, manifestName), 'release manifest');
  if (manifest.schema !== 'farlab.release-manifest.v1' || !Array.isArray(manifest.files)) fail('release manifest has an invalid schema');
  validateRelativePath(manifest.rootDirectory, 'release manifest rootDirectory');

  requireGnuTar();
  const archivePath = join(root, archiveName);
  const members = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const member of members) {
    const trimmed = member.endsWith('/') ? member.slice(0, -1) : member;
    validateRelativePath(trimmed, 'archive');
    if (trimmed !== manifest.rootDirectory && !trimmed.startsWith(`${manifest.rootDirectory}/`)) {
      fail(`archive member escapes declared root ${manifest.rootDirectory}: ${member}`);
    }
  }

  const scratch = mkdtempSync(join(tmpdir(), 'farlab-release-verify-'));
  try {
    execFileSync('tar', ['-xzf', archivePath, '--no-same-owner', '--no-same-permissions', '-C', scratch]);
    const extractedRoot = join(scratch, manifest.rootDirectory);
    const actualFiles = walkFiles(extractedRoot);
    if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) fail('archive contents do not match the release content manifest');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return { artifacts: entries.length, files: manifest.files.length, archive: archiveName, sbom };
};

export const addAttestationBundles = ({ releaseDir, provenanceBundle, sbomBundle }) => {
  const root = resolve(releaseDir);
  for (const [source, name] of [
    [provenanceBundle, 'provenance.sigstore.json'],
    [sbomBundle, 'sbom-attestation.sigstore.json'],
  ]) {
    if (!existsSync(source)) fail(`attestation bundle does not exist: ${source}`);
    copyFileSync(source, join(root, name));
    readJson(join(root, name), 'Sigstore attestation bundle');
  }
  // Do not rewrite SHA256SUMS here: the hosted provenance attestation signs
  // that exact checksum file. Signature bundles are self-authenticating and
  // intentionally sit outside the checksum set to avoid a signing cycle.
  return verifyReleaseArtifacts(root);
};

export const writeGithubOutputs = (result) => {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  for (const key of ['archive', 'manifest', 'sbom', 'notes', 'checksums']) {
    appendFileSync(output, `${key}=${result[key]}\n`);
  }
};
