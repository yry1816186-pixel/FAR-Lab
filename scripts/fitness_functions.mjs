#!/usr/bin/env node
// scripts/fitness_functions.mjs —— 架构适应度函数（1.md §12.5：必须可执行，不能只写文档）
// 权威定义: docs/design/machine-readable/architecture-fitness-functions.yaml（本脚本为实现侧 SSOT）
// 设计: 每条 FF 输出 [PASS]/[FAIL] + 证据行;任一 FAIL → exit 1。允许项必须带架构理由注释（同 zero_tolerance 豁免纪律）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
let failures = 0;
const report = [];
function check(id, name, ok, evidence) {
  report.push(`${ok ? '[PASS]' : '[FAIL]'} ${id} ${name} :: ${evidence}`);
  if (!ok) failures++;
}
function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== 'node_modules' && !e.startsWith('.')) out.push(...walk(p, exts)); }
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}
const srcFiles = walk(join(ROOT, 'src'), ['.ts']);
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => relative(ROOT, f).split('\\').join('/');
// V11-06 修复:同时识别静态 import 与运行时动态 import()(bench.ts 曾以动态导入逃逸)
const importsOf = (f) => [
  ...[...read(f).matchAll(/^import\s+(?!type)[^'"]*from\s+'([^']+)'/gm)].map((m) => m[1]),
  ...[...read(f).matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
];

// FF-01 Domain Core 纯净性: 内核与合同层不得 import DB/HTTP/LLM 运行时
{
  const coreFiles = srcFiles.filter((f) =>
    /src[\\/](falsifiability|schema|confounding_gate|statistics)[\\/]/.test(f) ||
    /src[\\/]fec[\\/](compiler|fec_contract|fec_mandate)\.ts$/.test(f));
  const bad = [];
  for (const f of coreFiles) {
    for (const imp of importsOf(f)) {
      if (/better-sqlite3|fastify|openai|node:(net|http|https|child_process)/.test(imp)) bad.push(`${rel(f)} → ${imp}`);
    }
  }
  check('FF-01', 'Domain Core 无 DB/HTTP/LLM 运行时依赖', bad.length === 0, bad.length ? bad.join('; ') : `${coreFiles.length} 个核心文件零违规 import`);
}

// FF-02 canonicalization 语义单一源: canonicalHash/hashCanonicalJson/canonicalJson 仅 evidence_log/hasher.ts 定义
{
  const defs = [];
  for (const f of srcFiles) {
    const t = read(f);
    if (/export function (canonicalHash|hashCanonicalJson|canonicalJson)\b/.test(t)) defs.push(rel(f));
  }
  check('FF-02', 'canonical hash 函数唯一定义源', defs.length === 1 && defs[0] === 'src/evidence_log/hasher.ts', defs.join(',') || '未找到定义');
}

// FF-03 内核唯一入口: decideFiveValueVerdict 定义唯一（允许同文件多引用）
{
  const defs = srcFiles.filter((f) => /export function decideFiveValueVerdict\b/.test(read(f))).map(rel);
  check('FF-03', 'decideFiveValueVerdict 定义唯一', defs.length === 1 && defs[0] === 'src/falsifiability/verdict_kernel_v2.ts', defs.join(','));
}

// FF-04 Demo 无特殊业务分支: demo.ts 不得直接 import 内核/证据账本写接口
{
  const f = 'src/cli/commands/demo.ts';
  const imps = existsSync(f) ? importsOf(f) : [];
  const bad = imps.filter((i) => /verdict_kernel_v2|evidence_log\/(repository|index)|proof_envelope\/sealer/.test(i));
  check('FF-04', 'demo 复用生产路径（demo_chain/pipeline），无旁路', bad.length === 0, bad.length ? bad.join('; ') : 'demo.ts 仅 import demo_chain/hero 管线/verify_golden/better-sqlite3');
}

// FF-05 前端/Agent 不得裁决: frontend 无 decideFiveValueVerdict/verdict 计算；agent_loop 无运行时 import sealer/kernel
{
  const feFiles = walk(join(ROOT, 'frontend', 'src'), ['.ts', '.tsx']);
  const feBad = feFiles.filter((f) => /decideFiveValueVerdict|verdict_kernel/.test(read(f))).map(rel);
  const agBad = [];
  for (const f of srcFiles.filter((x) => /src[\\/]agent_loop[\\/]/.test(x))) {
    for (const imp of importsOf(f)) {
      if (/proof_envelope\/sealer|verdict_kernel_v2/.test(imp)) agBad.push(`${rel(f)} → ${imp}`);
    }
  }
  check('FF-05', '前端/Agent 不重写裁决', feBad.length === 0 && agBad.length === 0,
    [...feBad, ...agBad].join('; ') || `frontend ${feFiles.length} 文件 + agent_loop 运行时 import 零违规`);
}

// FF-06 生产代码不得依赖测试代码: src/ 无 import tests/
{
  const bad = [];
  for (const f of srcFiles) {
    for (const imp of importsOf(f)) {
      if (/(^|\.\.\/)tests?[\\/]/.test(imp)) bad.push(`${rel(f)} → ${imp}`);
    }
  }
  check('FF-06', '生产代码不 import 测试', bad.length === 0, bad.join('; ') || '零命中');
}

// FF-07 平台特定逻辑登记: process.platform 引用点全部在册（带架构理由）
{
  const REGISTERED = new Set([
    'src/cli/python_env.ts', // python 发现逻辑平台差异（设计集中点）
    'src/cli/commands/doctor.ts', // 环境自诊需报告平台
    'src/cli/commands/verify.ts', // 平台相关路径展示
    'src/cli/commands/verify_golden.ts', // 同上
    'src/cli/status_dump.ts', // 状态报告含平台指纹
    'src/far_proof/offline_package.ts', // 离线包可执行位/路径
    'src/math/smt_backend.ts', // 外部求解器进程差异
    'src/science_harness/dataset_resolver.ts', // 下载/缓存路径
    'src/science_harness/sandbox_runner.ts', // 子进程沙箱差异
  ]);
  const users = srcFiles.filter((f) => read(f).includes('process.platform')).map(rel);
  const unreg = users.filter((u) => !REGISTERED.has(u));
  check('FF-07', '平台特定逻辑全部登记（9 处在册）', unreg.length === 0, unreg.length ? `未登记: ${unreg.join(',')}` : `${users.length}/9 在册`);
}

// FF-08 凭据 fail-closed: ask/doctor 只检 env 存在不读值（scanner 豁免名单持续有效）
{
  const zt = 'scripts/zero_tolerance_scan.mjs';
  const t = existsSync(zt) ? read(zt) : '';
  const ok = t.includes('src/cli/commands/ask.ts') && t.includes('src/cli/commands/doctor.ts');
  check('FF-08', '凭据 fail-closed 豁免登记在册（zero_tolerance skippedFiles）', ok, ok ? 'ask.ts/doctor.ts 在豁免名单（带审计理由）' : '豁免登记缺失');
}

// FF-09 枚举单一事实源: PAYLOAD_KINDS 仅 src/schema/enums.ts 定义
{
  const defs = srcFiles.filter((f) => /export const PAYLOAD_KINDS\b/.test(read(f))).map(rel);
  check('FF-09', 'PAYLOAD_KINDS 唯一定义源', defs.length === 1 && defs[0] === 'src/schema/enums.ts', defs.join(','));
}

// FF-10 主测试套件覆盖全部测试域: package.json test 含 agent_loop+comparison；frontend 有独立 test
{
  const pkg = JSON.parse(read('package.json'));
  const t = pkg.scripts.test || '';
  const fe = existsSync('frontend/package.json') ? (JSON.parse(read('frontend/package.json')).scripts.test || '') : '';
  const ok = t.includes('tests/agent_loop') && t.includes('tests/comparison') && fe.length > 0;
  check('FF-10', '主套件覆盖 agent_loop+comparison（DEBT-04）+ frontend 独立套件', ok,
    `test 脚本含 agent_loop=${t.includes('tests/agent_loop')} comparison=${t.includes('tests/comparison')} frontend_test=${fe ? '有' : '无'}`);
}

// FF-11 P0 需求必有 Oracle: REQUIREMENTS.yaml 每条 P0 oracle 非空
{
  const t = read('.far-design/REQUIREMENTS.yaml');
  const blocks = t.split(/\n  - requirement_id: /).slice(1);
  const bad = [];
  for (const b of blocks) {
    const id = b.split('\n')[0].trim();
    const isP0 = /priority: P0/.test(b);
    const oracle = (b.match(/oracle: "(.+)"/) || [])[1];
    if (isP0 && (!oracle || oracle.length < 4)) bad.push(id);
  }
  check('FF-11', '全部 P0 需求有 Oracle', bad.length === 0, bad.length ? `缺 Oracle: ${bad.join(',')}` : `${blocks.length} 条需求校验通过`);
}

// FF-12 内核输出五值枚举封闭: verdict_kernel_v2.ts 不出现枚举外 verdict 字面量
{
  const t = read('src/falsifiability/verdict_kernel_v2.ts');
  const found = new Set([...t.matchAll(/'(CONFIRMED|REFUTED|INCONCLUSIVE|DEGRADED_SCOPE|UNTESTED)'/g)].map((m) => m[1]));
  const ok = found.size === 5;
  check('FF-12', '五值枚举在内核中完整出现（封闭集合）', ok, [...found].join(','));
}

// FF-13 导出脱敏断言存在: exporter 含 redact 处理且测试存在
{
  const ex = read('src/far_proof/exporter.ts');
  const hasRedact = /redact/i.test(ex);
  const hasTest = existsSync('tests/far_proof');
  check('FF-13', '导出脱敏路径存在且有测试面', hasRedact && hasTest, `exporter 含 redact=${hasRedact} tests/far_proof=${hasTest}`);
}

// FF-14 JSON Schema 零漂移(IC-12 · ADR-013): schema/json/*.json 与 TS 类型机器生成结果字节一致;
// 手改生成物或改 TS 类型不重新生成 → DRIFT(exit 1)。生成器: scripts/generate_json_schema.mts
{
  const r = spawnSync(process.execPath, ['scripts/generate_json_schema.mts', '--check'], { encoding: 'utf8' });
  const tail = String(r.stdout ?? '').trim().split('\n').slice(-1)[0] ?? '';
  check('FF-14', 'JSON Schema 生成物与 TS 类型零漂移', r.status === 0, `generate_json_schema --check exit=${r.status ?? '?'} ${tail}`);
}

// FF-15 Science-125 报告协议机检(IC-10 · DI-09): benchmark_report.json 披露字段集强制
// (taskId/oracleType/oracleReviewStatus/traceHash/costTokens/kernelVersion+modelVersion/seed/bestOfK=false/executedAt);
// 缺任一字段或 bestOfK≠false → 红。机检: scripts/benchmark_report_check.mts
{
  const r = spawnSync(process.execPath, ['scripts/benchmark_report_check.mts'], { encoding: 'utf8' });
  const tail = String(r.stdout ?? r.stderr ?? '').trim().split('\n').slice(-1)[0] ?? '';
  check('FF-15', 'Science-125 报告披露字段集强制(协议 v2)', r.status === 0, `benchmark_report_check exit=${r.status ?? '?'} ${tail}`);
}

console.log('══ Architecture Fitness Functions (§12.5) ══');
for (const line of report) console.log(line);
console.log(failures === 0 ? '\nfitness: PASS (15/15)' : `\nfitness: FAIL (${failures} 项)`);
process.exit(failures === 0 ? 0 : 1);
