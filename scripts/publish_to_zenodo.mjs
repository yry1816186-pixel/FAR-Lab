#!/usr/bin/env node
/**
 * publish_to_zenodo.mjs — Zenodo DOI 发布脚本（DX3-01 · 1118 预备）。
 *
 * 用法:
 *   node scripts/publish_to_zenodo.mjs --check    校验 .zenodo.json + token 状态（不发布）
 *   node scripts/publish_to_zenodo.mjs --publish  发布（需 ZENODO_TOKEN）
 *
 * 行为:
 *   - ZENODO_TOKEN 未设置 → graceful skip + 指引（exit 0 · 不报错）
 *   - --check: 校验 .zenodo.json schema（title/creators/license/upload_type 必填）
 *   - --publish: 调 Zenodo Deposits API（POST /api/deposit/depositions）
 *
 * 诚实边界：不编造 DOI；发布成功才输出 DOI URL；失败 fail-closed。
 * 零容忍：无 any / @ts-ignore / 空 catch / 硬编码 token。
 *
 * 环境变量:
 *   ZENODO_TOKEN     Zenodo API token（https://zenodo.org/account/settings/applications/tokens/）
 *   ZENODO_SANDBOX   "1" 或 "true" 时使用 sandbox.zenodo.org（测试·不产真实 DOI）
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOKEN = process.env.ZENODO_TOKEN;
const SANDBOX = process.env.ZENODO_SANDBOX === '1' || process.env.ZENODO_SANDBOX === 'true';
const BASE = SANDBOX ? 'https://sandbox.zenodo.org' : 'https://zenodo.org';
const DEPOSITIONS_URL = `${BASE}/api/deposit/depositions`;

const REQUIRED_FIELDS = ['title', 'upload_type', 'creators', 'license'];

// ---------------------------------------------------------------------------
// 读取与校验
// ---------------------------------------------------------------------------

function readZenodoJson(cwd = ROOT) {
  const p = join(cwd, '.zenodo.json');
  if (!existsSync(p)) return { kind: 'missing' };
  try {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { kind: 'invalid', reason: '.zenodo.json 顶层不是 JSON 对象' };
    }
    return { kind: 'ok', data };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { kind: 'invalid', reason };
  }
}

function validate(loaded) {
  if (loaded.kind === 'missing') return { ok: false, missing: ['.zenodo.json 文件缺失'] };
  if (loaded.kind === 'invalid') return { ok: false, missing: [`.zenodo.json 解析失败: ${loaded.reason}`] };
  const data = loaded.data;
  const missing = [];
  for (const key of REQUIRED_FIELDS) {
    const v = data[key];
    if (v === undefined || v === null || v === '') {
      missing.push(key);
      continue;
    }
    if (Array.isArray(v) && v.length === 0) {
      missing.push(`${key} (空数组)`);
      continue;
    }
    if (key === 'creators' && Array.isArray(v)) {
      const badCreator = v.find(
        (c) => c === null || typeof c !== 'object' || typeof c.name !== 'string' || c.name.trim() === '',
      );
      if (badCreator !== undefined) {
        missing.push('creators[].name (缺失或空)');
      }
    }
  }
  return { ok: missing.length === 0, missing, data };
}

// ---------------------------------------------------------------------------
// 输出辅助
// ---------------------------------------------------------------------------

function header(title) {
  console.log('═══════════════════════════════════════════');
  console.log(`  ${title}`);
  console.log('═══════════════════════════════════════════');
}

function printSummary(data) {
  console.log('.zenodo.json:');
  console.log(`  title:       ${String(data.title).slice(0, 70)}`);
  console.log(`  upload_type: ${data.upload_type}`);
  console.log(`  license:     ${data.license}`);
  const creatorCount = Array.isArray(data.creators) ? data.creators.length : 0;
  console.log(`  creators:    ${creatorCount} 项`);
  const kwCount = Array.isArray(data.keywords) ? data.keywords.length : 0;
  if (kwCount > 0) console.log(`  keywords:    ${kwCount} 项`);
}

function printTokenStatus() {
  const has = typeof TOKEN === 'string' && TOKEN.length > 0;
  console.log('───────────────────────────────────────────');
  console.log(`ZENODO_TOKEN: ${has ? '[SET · 已配置]' : '[MISSING · 未设置]'}`);
  console.log(`Endpoint:     ${BASE}${SANDBOX ? ' (sandbox · 测试)' : ' (production · 生产)'}`);
  if (!has) {
    console.log('指引:');
    console.log('  1. 创建 token: https://zenodo.org/account/settings/applications/tokens/');
    console.log('  2. PowerShell: $env:ZENODO_TOKEN="<your-token>"');
    console.log('     bash:       export ZENODO_TOKEN="<your-token>"');
    console.log('  3. 测试用 sandbox（不产真实 DOI）: 再设 ZENODO_SANDBOX=1');
    console.log('  4. 重跑: node scripts/publish_to_zenodo.mjs --publish');
  }
  return has;
}

// ---------------------------------------------------------------------------
// 模式解析
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let mode = null;
if (argv.includes('--publish')) mode = 'publish';
else if (argv.includes('--check')) mode = 'check';

if (mode === null) {
  console.error('用法: node scripts/publish_to_zenodo.mjs --check | --publish');
  console.error('  --check    校验 .zenodo.json + token 状态（不发布）');
  console.error('  --publish  发布（需 ZENODO_TOKEN；缺失则 graceful skip）');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// --check 模式
// ---------------------------------------------------------------------------

if (mode === 'check') {
  header('FAR-Lab Zenodo DOI Pre-flight (DX3-01 · --check)');
  const loaded = readZenodoJson();
  const result = validate(loaded);
  if (result.ok) {
    printSummary(result.data);
  } else {
    console.log('.zenodo.json:');
    for (const m of result.missing) console.log(`  [MISSING] ${m}`);
  }
  printTokenStatus();
  console.log('───────────────────────────────────────────');
  if (!result.ok) {
    console.error(`❌ zenodo_check: FAIL — 必填字段缺失/无效: ${result.missing.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ zenodo_check: PASS — .zenodo.json 必填字段齐全（token 状态见上，--check 不要求 token）');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --publish 模式
// ---------------------------------------------------------------------------

header('FAR-Lab Zenodo DOI Publish (DX3-01 · --publish)');
const loaded = readZenodoJson();
const result = validate(loaded);

if (!result.ok) {
  console.error(`❌ zenodo_publish: FAIL — .zenodo.json 必填字段缺失，拒绝发布: ${result.missing.join(', ')}`);
  console.error('   先运行并通过: node scripts/publish_to_zenodo.mjs --check');
  process.exit(1);
}

printSummary(result.data);
const hasToken = printTokenStatus();

if (!hasToken) {
  console.log('───────────────────────────────────────────');
  console.log('⏭  zenodo_publish: SKIP — ZENODO_TOKEN 未设置（graceful skip · 非错误 · exit 0）');
  console.log('   这是预期行为：DX3-01 外部授权未就绪时不阻断流程。');
  console.log('   配置 token 后重跑: node scripts/publish_to_zenodo.mjs --publish');
  process.exit(0);
}

if (SANDBOX) {
  console.log('⚠  使用 sandbox 端点（测试·不会产出真实 DOI）');
}
console.log('───────────────────────────────────────────');
console.log(`POST ${DEPOSITIONS_URL}`);

try {
  const resp = await fetch(DEPOSITIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ metadata: result.data }),
  });

  const bodyText = await resp.text();

  if (!resp.ok) {
    console.error(`❌ zenodo_publish: FAIL — HTTP ${resp.status} ${resp.statusText}`);
    console.error(`   响应体（前 500 字符）: ${bodyText.slice(0, 500)}`);
    console.error('   常见原因: token 失效 / 权限不足 / 字段格式不符 Zenodo schema');
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch (parseErr) {
    const reason = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(`❌ zenodo_publish: FAIL — 响应非 JSON: ${reason}`);
    console.error(`   响应体（前 200 字符）: ${bodyText.slice(0, 200)}`);
    process.exit(1);
  }

  const id = typeof json === 'object' && json !== null ? json.id : undefined;
  const doiRaw =
    typeof json === 'object' && json !== null
      ? json.doi ?? (json.metadata && json.metadata.doi) ?? (json.prereserve_doi && json.prereserve_doi.doi)
      : undefined;
  const doi = typeof doiRaw === 'string' && doiRaw.length > 0 ? doiRaw : undefined;

  console.log(`✅ zenodo_publish: SUCCESS — deposition_id=${id ?? '(unknown)'}`);
  if (doi !== undefined) {
    console.log(`   DOI: ${doi}`);
    console.log(`   URL: https://doi.org/${doi}`);
  } else {
    console.log('   注意: 新建 deposition 未立即 mint DOI；');
    console.log('         需上传文件后调用 PUT /api/deposit/depositions/:id/actions/publish 才正式发布。');
    if (typeof id === 'number') {
      console.log(`   Deposition URL: ${BASE}/deposit/${id}`);
    }
  }
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`❌ zenodo_publish: FAIL — 网络/请求异常: ${msg}`);
  console.error('   可能原因: 离线 / DNS 解析失败 / Zenodo 服务不可达');
  process.exit(1);
}
