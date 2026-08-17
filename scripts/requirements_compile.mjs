#!/usr/bin/env node
/**
 * far requirements 编译入口（GOV-COMPILE-001 / GOV-LINT-001 / GOV-DERIVE-001）。
 *
 * 用法：
 *   node scripts/requirements_compile.mjs [--src <dir>] [--out <dir>] [--check] [--quiet]
 *
 * 默认源 .far/constitution（机器不可用时 exit 3 fail-closed——与无 key LIVE 能力同语义，
 * 禁止静默回退到仓库内任何替代源）。默认输出 .far/requirements 五件套 + COMPILE_RECEIPT.json。
 * --check：内存再生成后与磁盘字节比对，任何漂移（手工编辑）exit 1。
 * 退出码：0 编译+lint 通过；1 lint FAIL 或 --check 漂移；2 参数错误；3 规范源缺失。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  TOOL_VERSION,
  buildCompileReceipt,
  compileRegistry,
  lintRegistry,
  loadBlockPattern,
  renderAcceptanceYaml,
  renderCoverageYaml,
  renderGatesYaml,
  renderOwnerMapYaml,
  renderRequirementsYaml,
  sha256,
} from './requirements_registry.mjs';

function parseArgs(argv) {
  const options = { src: '.far/constitution', out: '.far/requirements', check: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--src' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`${arg} requires a directory argument`);
      }
      options[arg === '--src' ? 'src' : 'out'] = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function readSource(srcDir, name) {
  const path = join(srcDir, name);
  if (!existsSync(path)) {
    console.error(`requirements_compile: FAIL — constitution source missing: ${path}`);
    console.error('  宪法包未安装。安装方式：解压业主交付包到 .far/constitution/（含 MACHINE_SCHEMAS.yaml）后重试。');
    process.exit(3);
  }
  return readFileSync(path, 'utf8');
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function renderAll(registry) {
  return [
    ['REQUIREMENTS.yaml', renderRequirementsYaml(registry)],
    ['ACCEPTANCE.yaml', renderAcceptanceYaml(registry)],
    ['COVERAGE.yaml', renderCoverageYaml(registry)],
    ['OWNER_MAP.yaml', renderOwnerMapYaml(registry)],
    ['GATES.yaml', renderGatesYaml(registry)],
  ];
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`requirements_compile: bad args — ${err.message}`);
    process.exit(2);
  }
  const srcDir = resolve(options.src);
  const outDir = resolve(options.out);

  const schemas = readSource(srcDir, 'MACHINE_SCHEMAS.yaml');
  const pattern = loadBlockPattern(schemas);
  if (!pattern.ok) {
    console.error(`requirements_compile: FAIL — ${pattern.error}`);
    process.exit(1);
  }
  const statusInputPath = join(outDir, 'status_input.json');
  const statusInput = existsSync(statusInputPath) ? JSON.parse(readFileSync(statusInputPath, 'utf8')) : null;

  const registry = compileRegistry({
    coreText: readSource(srcDir, 'CORE_CONSTITUTION.md'),
    coreFile: 'CORE_CONSTITUTION.md',
    domainText: readSource(srcDir, 'DOMAIN_PROTOCOLS.md'),
    domainFile: 'DOMAIN_PROTOCOLS.md',
    pattern: pattern.pattern,
    statusInput,
  });
  const lint = lintRegistry(registry);
  if (!registry.ok) {
    for (const err of registry.parseErrors) console.error(`requirements_compile: PARSE — ${err}`);
    console.error(`requirements_compile: FAIL — ${registry.parseErrors.length} parse error(s); spec source wins, registry not regenerated`);
    process.exit(1);
  }
  const rendered = renderAll(registry);

  if (options.check) {
    const drift = rendered.filter(([name]) => {
      const path = join(outDir, name);
      return !existsSync(path) || readFileSync(path, 'utf8') !== Object.fromEntries(rendered)[name];
    });
    if (drift.length > 0) {
      console.error(`requirements_compile: DRIFT — generated views differ or missing: ${drift.map(([n]) => n).join(', ')}`);
      console.error('  manualEditPolicy: forbidden。请运行 node scripts/requirements_compile.mjs 重新生成。');
      process.exit(1);
    }
  }
  if (!lint.ok) {
    for (const finding of lint.findings) console.error(`requirements_compile: LINT — ${finding}`);
    console.error(`requirements_compile: FAIL — ${lint.findings.length} governance lint finding(s)`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const outputs = [];
  for (const [name, content] of rendered) {
    writeFileSync(join(outDir, name), content, 'utf8');
    outputs.push({ file: name, sha256: sha256(content), bytes: Buffer.byteLength(content, 'utf8') });
  }
  const startedAt = new Date();
  const receipt = buildCompileReceipt({
    registry,
    lint,
    outputs,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    commit: gitCommit(),
    sources: registry.sources,
  });
  writeFileSync(join(outDir, 'COMPILE_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  if (!options.quiet) {
    const byTier = receipt.counts.byTier;
    console.log(
      `requirements_compile: PASS — ${receipt.counts.requirements} requirements ` +
        `(T0=${byTier.T0} T1=${byTier.T1} T2=${byTier.T2} T3=${byTier.T3}) → ${outDir} (tool v${TOOL_VERSION})`
    );
  }
  process.exit(0);
}

main();
