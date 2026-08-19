// src/plugins/runner.ts
// 插件子进程 runner——宿主 spawn 一个干净 node 进程执行本文件（Node 24 原生
// type stripping，仓库 bin 同款直跑 .ts 惯例），stdin 进 JSON、stdout 出 JSON。
//
// **本文件是插件真安全边界的内侧**：即使插件经原型链 Function constructor 逃出
// vm 层（Node vm 非安全机制，实测原型链可及 process），它能到达的只是这个子
// 进程——spawn 时不继承宿主环境（env 显式最小化：只有 Node 运行所需），无凭据、
// 无 .env、无 DB 句柄、无宿主状态。逃逸遏制由 tests/plugins/sandbox.test.ts 的
// 哨兵 canary 用例端到端证明。
//
// vm 层在本文件的职责是**确定性契约消毒**而非安全边界：删 Date（零时钟）、遮
// Math.random（零随机）、零宿主对象注入（字符串进出——原型链在子进程内亦无宿主
// 落点，纵深防御）。sandbox 完整契约声明见 src/plugins/sandbox.ts。

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

interface RunnerJob {
  pluginSource: string;
  inputJson: string;
  fixedTimestamp: string;
  maxDurationMs: number;
  pluginId: string;
  pluginVersion: string;
}

function fail(failure: string, detail: unknown): never {
  process.stdout.write(JSON.stringify({ ok: false, failure, detail: String(detail).slice(0, 512) }));
  process.exit(0); // 退出码恒 0：失败以 JSON 报告（宿主解析），与 spawn 级错误区分
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8'); // fd 0 = stdin（spawnSync input 一次给齐）
} catch (err) {
  fail('SOURCE_COMPILE', `stdin read failed: ${String(err)}`);
}

let job: RunnerJob;
try {
  job = JSON.parse(raw) as RunnerJob;
} catch (err) {
  fail('SOURCE_COMPILE', `job JSON invalid: ${String(err)}`);
}

// 裸 context：零宿主对象注入（宿主对象原型链直通宿主 realm——实测逃逸路径，
// 见 sandbox.ts 文档）。输入以 JSON 字符串内插、沙箱内解析重建。
const ctx = vm.createContext();
const boot = `
  delete globalThis.Date;                 // 零时钟（per-realm 内置，可删）
  Math.random = undefined;                // 零随机（不可配置属性，遮蔽为 undefined）
  globalThis.__FAR_INPUT_JSON__ = ${JSON.stringify(job.inputJson)};
  ${job.pluginSource}
  ;globalThis.__FAR_HAS_EVALUATE__ = typeof evaluate === 'function';
  globalThis.__FAR_RESULT_JSON__ = globalThis.__FAR_HAS_EVALUATE__
    ? JSON.stringify(evaluate(JSON.parse(globalThis.__FAR_INPUT_JSON__)))
    : undefined;
`;

try {
  vm.runInContext(boot, ctx, {
    filename: `plugin://${job.pluginId}@${job.pluginVersion}`,
    timeout: job.maxDurationMs,
    displayErrors: true,
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  fail(msg.includes('timed out') ? 'TIMEOUT' : 'PLUGIN_THREW', msg);
}

const hasEvaluate = vm.runInContext('globalThis.__FAR_HAS_EVALUATE__ === true', ctx) as boolean;
if (hasEvaluate !== true) {
  fail('NO_EVALUATE_EXPORT', 'plugin source did not define a global evaluate(input) function');
}

let resultJson: unknown;
try {
  resultJson = vm.runInContext('globalThis.__FAR_RESULT_JSON__', ctx);
} catch (err) {
  fail('PLUGIN_THREW', String(err));
}
if (typeof resultJson !== 'string') {
  fail('PLUGIN_THREW', 'evaluate returned a value that could not be serialized');
}
process.stdout.write(JSON.stringify({ ok: true, resultJson }));
