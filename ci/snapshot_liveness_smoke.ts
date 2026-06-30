// ci/snapshot_liveness_smoke.ts
// 职责：C8 每日 snapshot 存活监控 smoke（CI STEP 13·仅 schedule/workflow_dispatch 触发）
// 权威 SSOT：10_CI_pipeline.md §0 ⑧ / 00_项目宪法 §1.4 snapshot 监控 4 点策略第 1 点
//
// [须day-1核验·E1·方法:配 DASHSCOPE_API_KEY 调 GET /v1/models 确认 snapshot 在线]
// 状态词（02 §7.4）：NEEDS_REAL_ENV。诚实铁律：无 key graceful skip ≠ 通过（snapshot 未实测在线）。
// 维护期半项（~2026-07-08）无自动检测——人工读响应/百炼控制台。详见 docs/DAY1_VERIFICATION.md §E1。
// 实现：
//   1. 读取 DASHSCOPE_API_KEY 环境变量（无 key 时 graceful skip · exit 0）
//   2. fetch GET ${COMPETITION_BASE_URL}/models（Authorization: Bearer $KEY）
//   3. 用类型守卫从 unknown 收窄 fetch 响应（禁 as 强转）
//   4. 校验 COMPETITION_MODEL_SNAPSHOT 在 data[].id 在线列表中
//   5. 存活 → SNAPSHOT_LIVENESS_SMOKE: OK · exit 0；下线 → FAIL · exit 1
// 无 :any / @ts-ignore / as unknown as / as 强转

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  COMPETITION_BASE_URL,
  COMPETITION_MODEL_SNAPSHOT,
} from '../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';

interface ModelEntry {
  readonly id: string;
}

interface ModelListResponse {
  readonly data: ReadonlyArray<ModelEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModelEntry(value: unknown): value is ModelEntry {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string';
}

function isModelListResponse(value: unknown): value is ModelListResponse {
  if (!isRecord(value)) {
    return false;
  }
  const data = value.data;
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every((entry) => isModelEntry(entry));
}

function fail(message: string): never {
  console.error(`SNAPSHOT_LIVENESS_SMOKE: FAIL (${message})`);
  process.exit(1);
}

export async function main(): Promise<void> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.log('SNAPSHOT_LIVENESS_SMOKE: SKIP (no key)');
    return;
  }

  const url = `${COMPETITION_BASE_URL}/models`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    fail(`fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    fail(`HTTP ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  if (!isModelListResponse(json)) {
    fail('invalid response shape (expected { data: [{ id: string }] })');
  }

  const ids: string[] = json.data.map((entry) => entry.id);
  if (!ids.includes(COMPETITION_MODEL_SNAPSHOT)) {
    const preview = ids.slice(0, 30).join(', ');
    fail(`snapshot ${COMPETITION_MODEL_SNAPSHOT} not in model list; online (first 30): ${preview}`);
  }

  console.log('SNAPSHOT_LIVENESS_SMOKE: OK');
}

const here = dirname(fileURLToPath(import.meta.url));
const argv1 = process.argv[1];
const invokedDirectly = argv1 !== undefined
  && pathToFileURL(argv1).href === `file://${here.split(/[\\/]/).join('/')}/snapshot_liveness_smoke.ts`
  && import.meta.url === pathToFileURL(argv1).href;
if (invokedDirectly) {
  void main();
}
