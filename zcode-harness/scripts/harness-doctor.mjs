import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const warnings = [];
const ok = [];
const exists = rel => fs.existsSync(path.join(root, rel));

const required = [
  'AGENTS.md','START_HERE.md','FINAL_BUILD_PROMPT.md','BUNDLE_MANIFEST.json',
  '.control/EXECUTION_STATE.json','.control/ACCEPTANCE_STATUS.json','.control/BLOCKERS.json','.control/DECISIONS.jsonl',
  'project-spec/COMPETITION.md','project-spec/PRODUCT.md','project-spec/REQUIREMENTS.md','project-spec/SCIENTIFIC_MODEL.md',
  'project-spec/ARCHITECTURE.md','project-spec/INTERFACES.md','project-spec/EVALUATION.md','project-spec/ACCEPTANCE.md','project-spec/BUILD_PLAN.md',
  'project-spec/policies/README.md','research/EVIDENCE_INDEX.md',
  'zcode-harness/README.md','zcode-harness/COMPATIBILITY.md','zcode-harness/ZCODE_SETTINGS.md','zcode-harness/marketplace.json',
  'zcode-harness/plugins/farlab-control-plane/.zcode-plugin/plugin.json','zcode-harness/plugins/farlab-control-plane/hooks/hooks.json'
];
for (const rel of required) exists(rel) ? ok.push(`exists:${rel}`) : errors.push(`missing:${rel}`);

for (const obsolete of ['.control/ACCEPTANCE_MATRIX.json','research/LEGACY_DECOMPOSITION.md','eslint.config.js']) {
  if (exists(obsolete)) warnings.push(`obsolete-or-redundant-present:${obsolete}`);
}

const parseJson = rel => {
  try { const v = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); ok.push(`json:${rel}`); return v; }
  catch (e) { errors.push(`invalid-json:${rel}:${e.message}`); return null; }
};
const market = exists('zcode-harness/marketplace.json') ? parseJson('zcode-harness/marketplace.json') : null;
const manifest = exists('zcode-harness/plugins/farlab-control-plane/.zcode-plugin/plugin.json') ? parseJson('zcode-harness/plugins/farlab-control-plane/.zcode-plugin/plugin.json') : null;
const hooks = exists('zcode-harness/plugins/farlab-control-plane/hooks/hooks.json') ? parseJson('zcode-harness/plugins/farlab-control-plane/hooks/hooks.json') : null;
for (const rel of ['.control/EXECUTION_STATE.json','.control/ACCEPTANCE_STATUS.json','.control/BLOCKERS.json','BUNDLE_MANIFEST.json']) if (exists(rel)) parseJson(rel);

if (market) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(market.name || '')) errors.push('market-name-invalid');
  const entry = Array.isArray(market.plugins) ? market.plugins.find(p => p.name === 'farlab-control-plane') : null;
  if (!entry) errors.push('market-missing-plugin-entry');
  else {
    const resolved = path.normalize(path.join(root, 'zcode-harness', market.pluginRoot || '', entry.source || ''));
    if (!fs.existsSync(resolved)) errors.push(`market-plugin-source-missing:${path.relative(root, resolved)}`);
    else ok.push('market-plugin-source-resolves');
    if (manifest?.version && entry.version && manifest.version !== entry.version) errors.push(`market-plugin-version-mismatch:${entry.version}!=${manifest.version}`);
  }
}
if (manifest) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(manifest.name || '')) errors.push('plugin-name-invalid');
  for (const key of ['commands','skills','agents']) if (!manifest[key]) warnings.push(`plugin-manifest-missing-${key}-declaration`);
  if (manifest.hooks === 'hooks/hooks.json') warnings.push('plugin-standard-hooks-redeclared: standard hooks/hooks.json auto-loads; remove duplicate manifest declaration');
}

const pluginRoot = path.join(root, 'zcode-harness/plugins/farlab-control-plane');
const validateFrontmatterDir = (subdir, kind, requireName) => {
  const dir = path.join(pluginRoot, subdir);
  if (!fs.existsSync(dir)) return errors.push(`${kind}-dir-missing`);
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = ent.isDirectory() ? path.join(dir, ent.name, 'SKILL.md') : path.join(dir, ent.name);
    if (ent.isDirectory() && kind !== 'skill') continue;
    if (!ent.isDirectory() && !ent.name.endsWith('.md')) continue;
    if (!fs.existsSync(file)) { errors.push(`${kind}-file-missing:${ent.name}`); continue; }
    const text = fs.readFileSync(file, 'utf8');
    const head = text.match(/^---\n([\s\S]*?)\n---/);
    if (!head || !/^description:\s*.+$/m.test(head[1]) || (requireName && !/^name:\s*.+$/m.test(head[1]))) errors.push(`${kind}-frontmatter-invalid:${ent.name}`);
    else ok.push(`${kind}:${ent.name}`);
  }
};
validateFrontmatterDir('skills','skill',true);
validateFrontmatterDir('commands','command',false);
validateFrontmatterDir('agents','agent',true);

if (hooks) {
  const serialized = JSON.stringify(hooks);
  for (const script of ['session-context.mjs','destructive-guard.mjs','failure-discipline.mjs']) {
    if (!serialized.includes(script)) errors.push(`hook-not-referenced:${script}`);
    if (!exists(`zcode-harness/plugins/farlab-control-plane/hooks/${script}`)) errors.push(`hook-script-missing:${script}`);
    else ok.push(`hook-script:${script}`);
  }
  if (hooks?.hooks?.Stop) warnings.push('Stop-hook-present-review-necessity');
}

for (const s of ['completion-gate.mjs','control-doctor.mjs','secret-scan.mjs','path-hygiene.mjs','test-hooks.mjs']) {
  exists(`zcode-harness/scripts/${s}`) ? ok.push(`script:${s}`) : errors.push(`script-missing:${s}`);
}

const agentsText = exists('AGENTS.md') ? fs.readFileSync(path.join(root,'AGENTS.md'),'utf8') : '';
if (agentsText.length > 8000) warnings.push(`agents-kernel-large:${agentsText.length}-chars`);

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 18) errors.push(`node-too-old:${process.versions.node}`); else ok.push(`node:${process.versions.node}`);

console.log(JSON.stringify({status: errors.length ? 'FAILED' : 'PASS', root, okCount: ok.length, warnings, errors, runtimeNote:'Offline PASS does not prove ZCode plugin/runtime loading; verify in a fresh ZCode session.'}, null, 2));
process.exit(errors.length ? 1 : 0);
