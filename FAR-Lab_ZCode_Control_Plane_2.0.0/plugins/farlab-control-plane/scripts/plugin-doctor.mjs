#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const errors = [];
const warnings = [];

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const required = [
  '.zcode-plugin/plugin.json',
  'hooks/hooks.json',
  'hooks/session-context.mjs',
  'hooks/destructive-guard.mjs',
  'hooks/failure-discipline.mjs',
  'hooks/stop-guard.mjs',
  'lib/control.mjs'
];
for (const rel of required) if (!exists(rel)) errors.push(`missing ${rel}`);

let manifest = null;
try { manifest = JSON.parse(read('.zcode-plugin/plugin.json')); } catch (error) { errors.push(`invalid plugin.json: ${error.message}`); }
if (manifest) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(manifest.name || ''))) errors.push('plugin name violates ZCode naming rule');
  if (manifest.name !== 'farlab-control-plane') warnings.push(`unexpected plugin name: ${manifest.name}`);
  if (!/^\d+\.\d+\.\d+/.test(String(manifest.version || ''))) errors.push('plugin version is not semantic-version shaped');
}

try { JSON.parse(read('hooks/hooks.json')); } catch (error) { errors.push(`invalid hooks.json: ${error.message}`); }

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

for (const dir of ['commands', 'agents']) {
  const folder = path.join(root, dir);
  for (const name of fs.readdirSync(folder).filter(x => x.endsWith('.md'))) {
    const fm = frontmatter(fs.readFileSync(path.join(folder, name), 'utf8'));
    if (!fm) { errors.push(`${dir}/${name}: missing YAML frontmatter`); continue; }
    if (!String(fm.description || '').trim()) errors.push(`${dir}/${name}: missing description`);
    if (dir === 'agents' && !String(fm.name || '').trim()) errors.push(`${dir}/${name}: missing name`);
    if (dir === 'commands' && !/^[a-z0-9][a-z0-9_:-]{0,63}$/.test(name.slice(0, -3))) errors.push(`${dir}/${name}: invalid command filename`);
  }
}

const skillsRoot = path.join(root, 'skills');
for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true }).filter(x => x.isDirectory())) {
  const rel = `skills/${dirent.name}/SKILL.md`;
  if (!exists(rel)) { errors.push(`${rel}: missing`); continue; }
  const fm = frontmatter(read(rel));
  if (!fm) { errors.push(`${rel}: missing YAML frontmatter`); continue; }
  if (!String(fm.name || '').trim()) errors.push(`${rel}: missing name`);
  if (!String(fm.description || '').trim()) errors.push(`${rel}: missing description`);
  if (String(fm.description || '').length > 1024) errors.push(`${rel}: description exceeds 1024 chars`);
  if (fm.name && fm.name !== dirent.name) warnings.push(`${rel}: name '${fm.name}' differs from directory '${dirent.name}'`);
}

for (const rel of fs.readdirSync(path.join(root, 'hooks')).filter(x => x.endsWith('.mjs')).map(x => `hooks/${x}`).concat(['lib/control.mjs', ...fs.readdirSync(path.join(root, 'scripts')).filter(x => x.endsWith('.mjs')).map(x => `scripts/${x}`)])) {
  if (rel === 'scripts/plugin-doctor.mjs') continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${rel}: node --check failed: ${(result.stderr || result.stdout || '').trim()}`);
}

console.log(`plugin=${manifest?.name ?? 'unknown'} version=${manifest?.version ?? 'unknown'}`);
console.log(`commands=${fs.readdirSync(path.join(root, 'commands')).filter(x => x.endsWith('.md')).length}`);
console.log(`skills=${fs.readdirSync(skillsRoot, { withFileTypes: true }).filter(x => x.isDirectory()).length}`);
console.log(`agents=${fs.readdirSync(path.join(root, 'agents')).filter(x => x.endsWith('.md')).length}`);
console.log(`hooks=${Object.keys(JSON.parse(read('hooks/hooks.json')).hooks || {}).length}`);
for (const warning of warnings) console.log(`WARN ${warning}`);
for (const error of errors) console.log(`ERROR ${error}`);
if (errors.length) process.exit(1);
console.log('PLUGIN_DOCTOR_OK');
