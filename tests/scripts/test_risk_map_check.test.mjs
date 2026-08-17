import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import {
  checkMap,
  REQUIRED_RISK_CLASSES,
} from '../../scripts/test_risk_map_check.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'far-risk-map-'));
  mkdirSync(join(root, 'tests'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(root, 'tests', 'representative.test.ts'), 'export {};\n', 'utf8');
  writeFileSync(join(root, 'scripts', 'gate.mjs'), 'process.exit(0);\n', 'utf8');
  writeFileSync(
    join(root, '.github', 'workflows', 'ci.yml'),
    [
      'name: ci',
      '# node scripts/comment-only.mjs',
      'jobs:',
      '  quality:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: real gate',
      '        run: node scripts/gate.mjs',
      '',
    ].join('\n'),
    'utf8',
  );
  return root;
}

function completeMap(asset = { kind: 'test', locator: 'tests/representative.test.ts' }) {
  return {
    schemaVersion: '1',
    riskClasses: REQUIRED_RISK_CLASSES.map((className) => ({
      class: className,
      risk: `risk covered by ${className}`,
      assets: [asset],
    })),
  };
}

function run(root, value) {
  return checkMap({ root, mapText: typeof value === 'string' ? value : stringify(value) });
}

test('repository map is structurally complete and all locators resolve', () => {
  const root = join(import.meta.dirname, '..', '..');
  const text = readFileSync(join(root, 'ci', 'TEST_RISK_MAP.yaml'), 'utf8');
  const result = checkMap({ root, mapText: text });
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.stats.gapped, 0);
});

test('additional classes cannot substitute for a missing Constitution taxonomy class', () => {
  const root = makeRepo();
  try {
    const map = completeMap();
    map.riskClasses = map.riskClasses
      .filter((entry) => entry.class !== 'metamorphic')
      .concat({ class: 'invented', risk: 'activity without required coverage', assets: [{ kind: 'test', locator: 'tests/representative.test.ts' }] });
    const result = run(root, map);
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes('map: missing required risk class "metamorphic"'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a well-formed additional risk class is allowed without weakening required coverage', () => {
  const root = makeRepo();
  try {
    const map = completeMap();
    map.riskClasses.push({
      class: 'adversarial-replay',
      risk: 'A replay-specific attack escapes the current mandatory taxonomy',
      assets: [{ kind: 'test', locator: 'tests/representative.test.ts' }],
    });
    const result = run(root, map);
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('schema rejects unknown fields instead of silently accepting misspelled controls', () => {
  const root = makeRepo();
  try {
    const map = completeMap();
    map.unexpected = true;
    map.riskClasses[0].asset = [{ kind: 'test', locator: 'tests/representative.test.ts' }];
    map.riskClasses[0].assets = [{
      kind: 'test',
      locator: 'tests/representative.test.ts',
      optional: true,
    }];
    const result = run(root, map);
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes('map: unknown top-level field "unexpected"'));
    assert.ok(result.findings.includes('riskClasses[0]: unknown field "asset"'));
    assert.ok(result.findings.some((finding) => finding.includes('asset has unknown field(s): optional')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package script and blocking_gates wire the executable checker exactly', () => {
  const root = join(import.meta.dirname, '..', '..');
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts?.['test:risk-map'], 'node scripts/test_risk_map_check.mjs');

  const workflowDocument = parseDocument(
    readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'),
    { prettyErrors: false, strict: true, uniqueKeys: true },
  );
  assert.deepEqual(workflowDocument.errors, []);
  const workflow = workflowDocument.toJS();
  const steps = workflow.jobs?.blocking_gates?.steps;
  assert.ok(Array.isArray(steps), 'blocking_gates.steps must be an array');
  const matchingSteps = steps.filter((step) => step?.run === 'pnpm run test:risk-map');
  assert.equal(matchingSteps.length, 1, 'blocking_gates must run exactly one risk-map gate');
});

test('arbitrary files and repository traversal cannot pose as test assets', () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, 'package.json'), '{}\n', 'utf8');
    writeFileSync(join(root, 'scripts', 'README.md'), '# not executable evidence\n', 'utf8');
    const arbitrary = run(root, completeMap({ kind: 'test', locator: 'package.json' }));
    assert.equal(arbitrary.ok, false);
    assert.ok(arbitrary.findings.some((finding) => finding.includes('test locator must live under')));

    const documentation = run(root, completeMap({ kind: 'script', locator: 'scripts/README.md' }));
    assert.equal(documentation.ok, false);
    assert.ok(documentation.findings.some((finding) => finding.includes('executable-source file')));

    const traversal = run(root, completeMap({ kind: 'test', locator: '../../../../etc/passwd' }));
    assert.equal(traversal.ok, false);
    assert.ok(traversal.findings.some((finding) => finding.includes('inside the repository')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CI evidence is matched against parsed jobs or exact run lines, not comments', () => {
  const root = makeRepo();
  try {
    const commentOnly = run(root, completeMap({ kind: 'ci_run', locator: 'node scripts/comment-only.mjs' }));
    assert.equal(commentOnly.ok, false);
    assert.ok(commentOnly.findings.some((finding) => finding.includes('exact CI run line not found')));

    assert.equal(run(root, completeMap({ kind: 'ci_job', locator: 'quality' })).ok, true);
    assert.equal(run(root, completeMap({ kind: 'ci_run', locator: 'node scripts/gate.mjs' })).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a declared gap is accountable but remains a failing incomplete state', () => {
  const root = makeRepo();
  try {
    const map = completeMap();
    map.riskClasses[0] = {
      class: REQUIRED_RISK_CLASSES[0],
      risk: 'unit risk',
      assets: [],
      gap: {
        rationale: 'A concrete missing capability is known and cannot be represented as test coverage yet.',
        owner: 'engineering',
        tracking: 'ENG-TEST-001',
        nextAction: 'implement the missing executable test',
      },
    };
    const result = run(root, map);
    assert.equal(result.ok, false);
    assert.equal(result.stats.gapped, 1);
    assert.ok(result.findings.some((finding) => finding.includes('keeps ENG-TEST-001 incomplete')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real YAML parsing accepts single-quoted scalars and rejects duplicate keys', () => {
  const root = makeRepo();
  try {
    const singleQuoted = [
      "schemaVersion: '1'",
      'riskClasses:',
      ...REQUIRED_RISK_CLASSES.flatMap((className) => [
        `  - class: '${className}'`,
        `    risk: 'risk for ${className}'`,
        '    assets:',
        "      - kind: 'test'",
        "        locator: 'tests/representative.test.ts'",
      ]),
      '',
    ].join('\n');
    assert.equal(run(root, singleQuoted).ok, true);

    const duplicate = singleQuoted.replace("schemaVersion: '1'", "schemaVersion: '1'\nschemaVersion: '1'");
    const result = run(root, duplicate);
    assert.equal(result.ok, false);
    assert.ok(result.findings[0]?.includes('invalid YAML/schema'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
