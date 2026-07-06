import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = [
  'src',
  'repro',
  'schema',
  'scripts',
  'tests',
  'ci',
  'agent_execution_manifest.yaml',
  'docs',
  'package.json',
  'pyproject.toml',
];

const checks = [
  { name: 'ts_any', pattern: /: any\b/ },
  { name: 'unknown_double_assert', pattern: /as unknown as/ },
  { name: 'ts_ignore', pattern: /@ts-ignore|@ts-nocheck/ },
  { name: 'empty_catch', pattern: /catch\s*(\([^)]*\))?\s*\{\s*\}/ },
  { name: 'todo_marker', pattern: /TODO|FIXME/ },
  { name: 'stub_or_mock_return', pattern: /stub|mock.*return/ },
  { name: 'unsafe_html', pattern: /innerHTML|dangerouslySetInnerHTML/ },
  { name: 'dashscope_env_reference', pattern: /DASHSCOPE_API_KEY/ },
  { name: 'hardcoded_secret_shape', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  // 百炼 Node SDK 幻觉源：extra_body 是社区幻觉参数，百炼官方 SDK 不支持（enable_thinking 是顶层参数）
  { name: 'bailian_extra_body_hallucination', pattern: /extra_body/ },
  // 编造 header：X-DashScope-Enable-Thinking 不是真实百炼 header（thinking 控制走顶层参数）
  { name: 'bailian_thinking_header_hallucination', pattern: /X-DashScope-Enable-Thinking/ },
  // 编造 header 变体：defaultHeaders.*Enable 是同类幻觉（经 defaultHeaders 注入 thinking 开关）
  { name: 'bailian_default_headers_enable_hallucination', pattern: /defaultHeaders[^\n]*Enable/ },
];

const skippedFiles = new Set([
  'scripts/zero_tolerance_scan.mjs',
  // ci/snapshot_liveness_smoke.ts 合法读取 process.env.DASHSCOPE_API_KEY（env 变量名，非硬编码 secret）。
  // 跳过以避免 dashscope_env_reference 误报；该文件经人工审计无 :any / @ts-ignore / as unknown as / extra_body / header 幻觉。
  'ci/snapshot_liveness_smoke.ts',
  // ci/competition_qwen_smoke.ts —— 合法读取 DASHSCOPE_API_KEY（Competition 条件门真实调用需要）。
  // 经审计零容忍合规：无 :any / @ts-ignore / as unknown as / extra_body / header 幻觉。
  'ci/competition_qwen_smoke.ts',
  // tests/ci/competition_qwen_smoke.test.ts —— 单元测试中引用 DASHSCOPE_API_KEY 环境变量名
  // （用于 graceful skip 行为验证，非硬编码 secret 值）。
  'tests/ci/competition_qwen_smoke.test.ts',
  // 元测试：按设计含反模式字符串（': any' / 'extra_body' / 空 catch）以驱动扫描器；类比扫描器脚本自身跳过。
  'tests/ci/zero_tolerance_scan.test.ts',
  // CI 入口脚本 —— 合法读取 DASHSCOPE_API_KEY 环境变量名（用于 graceful skip 条件门判断）。
  // 经人工审计零容忍合规：无 :any / @ts-ignore / as unknown as / extra_body / header 幻觉。
  'scripts/ci_all.mjs',
  // fresh-clone smoke 脚本 —— 合法读取 DASHSCOPE_API_KEY 环境变量名（用于 graceful skip）。
  // 经人工审计零容忍合规。
  'scripts/fresh_clone_smoke.mjs',
  // Qwen-VL adapter —— 合法读取 DASHSCOPE_API_KEY 环境变量名（生产 VLM 调用需要）。
  // 经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / extra_body / header 幻觉。
  'src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts',
  // aliyun_qwen 文本-only adapter —— 合法读取 DASHSCOPE_API_KEY 环境变量名（生产文本调用需要，
  // 与姐妹 qwen_vl_adapter 同模式）。经人工审计零容忍合规：无 :any / as unknown as /
  // @ts-ignore / extra_body / header 幻觉。
  'src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts',
  // qwen_adapter fallback 测试 —— §5 临时清空 + 恢复 DASHSCOPE_API_KEY 验证 fail-closed key 门（无 key →
  // BailianHttpError(500,unknown_or_config)·证明真实 SDK 路径选定非 mock 短路）；§6 env-gated 真实 DashScope HTTP。
  // 合法读写环境变量名（非硬编码 secret 值）。经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore /
  // 空 catch / extra_body / header 幻觉 / sk- 明文。
  'tests/llm_gateway/qwen_adapter_fallback.test.ts',
  // Qwen-VL client —— 合法读取 DASHSCOPE_API_KEY 环境变量名（客户端配置读取）。
  // 经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / extra_body / header 幻觉。
  'src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_client.ts',
  // day1 状态报告器 —— 指令字符串含 DASHSCOPE_API_KEY 环境变量名（告诉用户如何配 key 跑 smoke，非硬编码 secret）。
  // 经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / 空 catch / extra_body / header 幻觉 / sk- 明文。
  'scripts/day1_verify.mjs',
  // far ask CLI —— profile 凭据门：合法引用 FAR_DASHSCOPE_API_KEY 环境变量名（无 key → fail-closed 指引，
  // 非 secret 值）。经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / 空 catch / extra_body / header 幻觉 / sk- 明文。
  'src/cli/commands/ask.ts',
  // cli_error_paths 测试 —— 断言 fail-closed stderr 含 FAR_DASHSCOPE_API_KEY 指引（合法验证 env 名，非 secret）。
  // 经审计零容忍合规。
  'tests/cli/cli_error_paths.test.ts',
  // credential_dual_run harness —— 一键跑 P1-2/3/6b inherent-limit proof（合法传递 DASHSCOPE_API_KEY env 名至子进程，非 secret 值）。
  'scripts/credential_dual_run.mjs',
  // E6 成本快照生成器 —— 指令字符串含 DASHSCOPE_API_KEY 环境变量名（非硬编码 secret；脚本本身不读 key）。
  // 经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / 空 catch / extra_body / header 幻觉 / sk- 明文。
  'scripts/generate_cost_snapshot.mjs',
  // day-1 实测文档 —— 运行指令含 DASHSCOPE_API_KEY 环境变量名（文档说明，非硬编码 secret）。
  // 经人工审计零容忍合规：markdown 文档无 :any / as / @ts-ignore / 空 catch / extra_body / sk- 明文。
  'docs/DAY1_VERIFICATION.md',
  // TAP 指令解析器 —— 解析 TAP 输出的 `# TODO`/`# SKIP` 指令（标准 TAP 格式）：regex `/\s+#\s*TODO\b/i`
  // 与 status='TODO'/verdict==='TODO' 是 TAP 状态值，非代码 TODO 债务标记（scanner `/TODO|FIXME/` 无法区分 TAP 指令）。
  // 经人工审计零容忍合规：无真实 TODO/FIXME 债务 / 无 :any / @ts-ignore / 空 catch / stub。
  'scripts/depth_evidence.mjs',
  // TAP 解析器单测 —— 测试名与 TAP 夹具字面量（'not ok 6 - probe_todo # TODO not done'）含 TODO，
  // 是 TAP 输入数据，非代码标记。经人工审计零容忍合规。
  'scripts/depth_evidence.test.mjs',
]);

function walk(path) {
  // 容错：root 可能因 worktree 清理而被删（如 docs/）。缺失则透明跳过（stderr 标注），
  // 不让 statSync ENOENT 崩溃整个扫描——其余现存 root 仍正常扫描，零静默。
  if (!existsSync(path)) {
    process.stderr.write(`zero_tolerance_scan: skip missing root '${path}'\n`);
    return [];
  }
  const stat = statSync(path);
  if (stat.isDirectory()) {
    if (path.endsWith('__pycache__')) {
      return [];
    }
    return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
  }
  if (path.endsWith('.pyc')) {
    return [];
  }
  // 二进制文件探测：含 0x00 字节 → 非源码 → 跳过。
  // 设计理由：scan 扫源码反模式（:any / @ts-ignore / stub 字面量），不扫二进制缓存泄漏。
  // Node V8 编译缓存（NODE_COMPILE_CACHE_DIR）泄漏进 src/ 下无扩展名二进制 blob
  // （src/statistics/0/v24.14.0-x64-.../fb3f0786），其字节流含 lodash 的 stubArray/_baseTimes
  // 等 ASCII 片段，readFileSync(utf8) 解码后误命中 stub_or_mock_return → 假绿/假红。
  // 标准文本/二进制启发式：0x00 字节仅存于二进制——真实源码（.ts/.js/.py/.md/.sql/.yaml/.toml/.json）
  // 永不含 0x00，零误跳。.gitignore（3019948）不解：scan 读磁盘非 git 索引。
  if (readFileSync(path).includes(0)) {
    return [];
  }
  return [path];
}

function normalize(filePath) {
  return filePath.split(/[\\/]/).join('/');
}

// stripLineComment —— 剥离行注释，保留代码部分，供扫描器检查。
// 设计理由：注释中提及禁用模式（如解释「禁用 defaultHeaders」「禁双重断言」）
// 是合法的文档化反 theater 实践，不应触发扫描器；真实代码违规仍会被捕获。
// 不同语言规则：TS/JS/MJS 剥离 双斜线 行注释；Python 剥离 井号 行注释（保留 shebang）；
// 所有语言跳过 JSDoc 续行（首字符为星号）+ 单行块注释起始/结束标记 + 空行。
// 多行块注释的状态跟踪未实现——这类罕见情形由人工审计兜底。
// 不在字符串字面量内的注释符号误剥离率低（仓库实际用例审计通过）。
// 参数：filePath（用扩展名判定语言）/ rawLine（原始行内容）
// 返回：剥离注释后的代码部分（空字符串表示该行纯注释）
function stripLineComment(filePath, rawLine) {
  const ext = extname(filePath).toLowerCase();
  const trimmed = rawLine.trimStart();

  // 跳过空行 + JSDoc 续行 + 单行块注释起始/结束
  if (trimmed === '') return '';
  if (trimmed.startsWith('*')) return '';
  if (trimmed.startsWith('/*')) return '';
  if (trimmed.startsWith('*/')) return '';

  // TS/JS/MJS: 剥离 `//` 行注释
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
    const idx = rawLine.indexOf('//');
    if (idx >= 0) {
      return rawLine.slice(0, idx);
    }
    return rawLine;
  }

  // Python: 剥离 `#` 行注释（保留 shebang `#!`）
  if (ext === '.py') {
    if (trimmed.startsWith('#!')) return rawLine;
    const idx = rawLine.indexOf('#');
    if (idx >= 0) {
      return rawLine.slice(0, idx);
    }
    return rawLine;
  }

  // YAML/JSON/其他: 不剥离（保守）
  return rawLine;
}

const findings = [];

for (const root of roots) {
  for (const filePath of walk(root)) {
    if (skippedFiles.has(normalize(filePath))) {
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = stripLineComment(filePath, rawLine);
      for (const check of checks) {
        if (check.pattern.test(line)) {
          findings.push(`${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`);
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exit(1);
}

// ---------- 模型中立专项扫描（src/api/·24§0.1 红线） ----------
// 设计理由：
//   - Core 模型中立铁律要求 src/api/ 不出现 Qwen / 百炼 / DashScope 字面量
//     （这些字面量只允许出现在 llm_gateway/adapters/aliyun_qwen + competition_aliyun_qwen）。
//   - 复用 stripLineComment 剥离注释，避免对文档性注释（如「无 Qwen / 百炼 / DashScope 字面量」）
//     产生误报；真实代码违规仍会被捕获。
//   - 与零容忍检查分离：零容忍检查全 src/ 通用；本检查仅扫 src/api/ 子集。
const apiNeutralityPatterns = [
  { name: 'qwen_in_api', pattern: /qwen/i },
  { name: 'bailian_in_api', pattern: /百炼/ },
  { name: 'dashscope_in_api', pattern: /dashscope/i },
];

const apiNeutralityFindings = [];
for (const filePath of walk('src/api')) {
  if (skippedFiles.has(normalize(filePath))) {
    continue;
  }
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = stripLineComment(filePath, rawLine);
    for (const check of apiNeutralityPatterns) {
      if (check.pattern.test(line)) {
        apiNeutralityFindings.push(
          `${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`,
        );
      }
    }
  }
}

if (apiNeutralityFindings.length > 0) {
  console.error(
    'src/api/ model neutrality violations (Qwen/百炼/DashScope forbidden in core):\n' +
      apiNeutralityFindings.join('\n'),
  );
  process.exit(1);
}

// ---------- F4 诚实边界专项扫描（science_harness / spec 12 · 02 §4） ----------
// 设计理由：
//   - F4 规定 V1 只做类型层约束（purpose_tag 枚举 + CI 审计断言）。
//   - 严禁在 V1 代码中声称进程级物理隔离 / strong isolation / tamper-proof / physically isolated——
//     这些是过度声称（overclaim），实际 venv 子进程隔离 + 出站封禁推迟到 V2+。
//   - 正确措辞：resource-bounded & network-restricted venv execution（资源受限 + 禁网的 venv 执行）。
//   - 复用 stripLineComment 剥离 JSDoc（如本扫描器自身解释禁词的文档行）以避免误报；
//     真实代码中的过度声称仍被捕获。
//   - 扫描范围 src/：F4 边界主要落在 science_harness + 任何声称沙箱隔离的生产代码。
const f4OverclaimPatterns = [
  { name: 'f4_overclaim_strong_isolation', pattern: /strong\s+isolation/i },
  { name: 'f4_overclaim_tamperproof', pattern: /tamper[-\s]?proof/i },
  { name: 'f4_overclaim_physically_isolated', pattern: /physically\s+isolated/i },
];

const f4OverclaimFindings = [];
for (const filePath of walk('src')) {
  if (skippedFiles.has(normalize(filePath))) {
    continue;
  }
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = stripLineComment(filePath, rawLine);
    for (const check of f4OverclaimPatterns) {
      if (check.pattern.test(line)) {
        f4OverclaimFindings.push(
          `${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`,
        );
      }
    }
  }
}

if (f4OverclaimFindings.length > 0) {
  console.error(
    'F4 honesty boundary overclaim (V1 must NOT claim process-level isolation; use "resource-bounded & network-restricted venv execution"):\n' +
      f4OverclaimFindings.join('\n'),
  );
  process.exit(1);
}

// ---------- dialogue 层红线专项扫描（src/dialogue/ · 模型中立层隔离） ----------
// 设计理由：
//   - src/dialogue/ 是模型中立层，禁止出现 verdict / qwen / 百炼 / @modelcontextprotocol 字面量
//     （这些属于裁决内核 / 模型适配层 / MCP 协议层，不应泄漏到 dialogue 层）。
//   - 合并自 tests/dialogue/red_line_grep.test.ts（P2-3 同义反复测试清理：
//     原 test 是「grep 缺词」类同义反复，CLAUDE.md §1）。
//   - 复用 stripLineComment 剥离注释，避免文档性注释误报；真实代码违规仍被捕获。
//   - 不合并原 test 的「至少 7 个 TS 文件」静态计数断言（同义反复，无扫描价值）。
const dialogueRedLinePatterns = [
  { name: 'verdict_in_dialogue', pattern: /verdict/i },
  { name: 'qwen_in_dialogue', pattern: /qwen/i },
  { name: 'bailian_in_dialogue', pattern: /百炼/ },
  { name: 'mcp_in_dialogue', pattern: /@modelcontextprotocol/i },
];

const dialogueRedLineFindings = [];
for (const filePath of walk('src/dialogue')) {
  if (skippedFiles.has(normalize(filePath))) {
    continue;
  }
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = stripLineComment(filePath, rawLine);
    for (const check of dialogueRedLinePatterns) {
      if (check.pattern.test(line)) {
        dialogueRedLineFindings.push(
          `${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`,
        );
      }
    }
  }
}

if (dialogueRedLineFindings.length > 0) {
  console.error(
    'src/dialogue/ red line violations (verdict/qwen/百炼/@modelcontextprotocol forbidden in dialogue layer):\n' +
      dialogueRedLineFindings.join('\n'),
  );
  process.exit(1);
}

// ---------- N3 反幻觉专项扫描（百炼 Node SDK 幻觉源 · spec 06 §0 R1 互斥铁律） ----------
// 设计理由：
//   - 百炼 Node SDK 不支持 defaultHeaders / extra_body / 编造的 thinking HTTP header
//     （thinking 控制走顶层参数 enable_thinking）。
//   - src/agent_loop/ + src/llm_gateway/adapters/aliyun_qwen/ + src/profiles/ 禁出现这三类幻觉源。
//   - 合并自 tests/agent_loop/n3_anti_hallucination.test.ts（P2-3 同义反复测试清理）。
//   - extra_body 与 X-DashScope-Enable-Thinking 已在全局 checks 中扫描（防御纵深·本节保留原禁词不变）；
//     defaultHeaders 字面量本节更严——全局只扫 defaultHeaders.*Enable，本节扫任何 defaultHeaders 出现。
//   - 原 test 的正向契约断言（enable_thinking?: boolean 必须存在于 create_params.ts）
//     已由 TypeScript 类型检查覆盖（params.enable_thinking 在 create_params.ts:42,49,57 使用），
//     删除原 test 不损失真实契约保护。
//   - 复用 stripLineComment 剥离注释。
const n3ScanRoots = [
  'src/agent_loop',
  'src/llm_gateway/adapters/aliyun_qwen',
  'src/profiles',
];

const n3ForbiddenPatterns = [
  { name: 'n3_default_headers', pattern: /defaultHeaders/ },
  { name: 'n3_thinking_header_hallucination', pattern: /X-DashScope-Enable-Thinking/ },
  { name: 'n3_extra_body_hallucination', pattern: /extra_body/ },
];

const n3Findings = [];
for (const root of n3ScanRoots) {
  for (const filePath of walk(root)) {
    if (skippedFiles.has(normalize(filePath))) {
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = stripLineComment(filePath, rawLine);
      for (const check of n3ForbiddenPatterns) {
        if (check.pattern.test(line)) {
          n3Findings.push(
            `${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`,
          );
        }
      }
    }
  }
}

if (n3Findings.length > 0) {
  console.error(
    'N3 anti-hallucination violations (defaultHeaders/X-DashScope-Enable-Thinking/extra_body forbidden in 百炼 SDK paths):\n' +
      n3Findings.join('\n'),
  );
  process.exit(1);
}

console.log('zero_tolerance_scan: ok');
