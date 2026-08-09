import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = [
  'src',
  'repro',
  'schema',
  'scripts',
  'tests',
  'ci',
  'docs',
  'package.json',
  'pyproject.toml',
  // SECURITY（深度对抗轮）：.env / .env.example 须扫 hardcoded_secret_shape（sk-... 明文密钥）。
  // .env 被 .gitignore 排除不会进版本库，但本地工作树若含明文密钥会被此门捕获（防 IDE 索引/备份/sync 泄露）。
  '.env',
  '.env.example',
];

// 环境变量模板文件：DASHSCOPE_API_KEY 字面量合法（env 变量名·非密钥值），仅对这些文件跳过
// dashscope_env_reference 检查；hardcoded_secret_shape 等其余检查仍全量生效。
const envTemplateFiles = new Set(['.env', '.env.example']);

// ── markdown 文档豁免（2026-08-08 S-大修复·blocking_gates 首次真正跑通）──
// 代码级反模式检查对纯文本文档无意义：文档引用禁用 token 字面量是合法表达
// （政策阐述 / 反剧场成果说明 / 历史评审记录 / 命令帮助文本），与 skippedFiles 中
// 20+ 文档豁免条目（docs/installation.md / docs/design/09 等）的既定约定完全一致。
// 仅保留 hardcoded_secret_shape：sk- 明文密钥检测对文档有真实安全价值（防文档泄露密钥）。
// 审计依据：docs/ 全部命中经分类统计均为代码级检查假阳性（ts_ignore 34 / todo_marker 27 /
// dashscope_env_reference 22 / stub 11 / ts_any 4 / empty_catch 2 / unsafe_html 2 /
// unknown_double_assert 2），无 hardcoded_secret_shape 命中——文档无明文密钥风险。
const markdownSkippedChecks = new Set([
  'ts_any',
  'unknown_double_assert',
  'ts_ignore',
  'empty_catch',
  'todo_marker',
  'stub_or_mock_return',
  'unsafe_html',
  'dashscope_env_reference',
  'bailian_extra_body_hallucination',
  'bailian_thinking_header_hallucination',
  'bailian_default_headers_enable_hallucination',
]);

const checks = [
  { name: 'ts_any', pattern: /: any\b/ },
  { name: 'unknown_double_assert', pattern: /as unknown as/ },
  { name: 'ts_ignore', pattern: /@ts-ignore|@ts-nocheck/ },
  // empty_catch 由文件级跨行正则统一处理（单行+多行形态·SA9 修复——见主循环下方）
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

// 文件级空 catch 正则（阶段 7 P0-2b · SA9 修复）：单行正则 `catch...{}` 不跨行——
// 多行形态 `catch (e) {\n}` 漏检。改为剥离注释后的全文跨行匹配（\s* 含换行；
// 单行形态同样命中·统一单一通道防重复报告）。
// 语义与历史单行检查一致：**空 catch = catch 体内无任何内容（含注释）**——体内仅注释的
// catch（如「// best-effort」「// 不可读跳过」）是文档化降级（作者已给出 why），非静默吞错，
// 不检出；无任何内容的静默 catch 检出。候选区间在原始文本复核（含 // 或 /* 或字符串引号 →
// 注释/字符串中的 catch 字面量·跳过）。
const emptyCatchRe = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;

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
  // far ask CLI —— profile 凭据门：合法引用 FAR_DASHSCOPE_API_KEY 环境变量名（无 key → fail-closed 指引，
  // 非 secret 值）。经人工审计零容忍合规：无 :any / as unknown as / @ts-ignore / 空 catch / extra_body / header 幻觉 / sk- 明文。
  'src/cli/commands/ask.ts',
  // cli_error_paths 测试 —— 断言 fail-closed stderr 含 FAR_DASHSCOPE_API_KEY 指引（合法验证 env 名，非 secret）。
  // 经审计零容忍合规。
  'tests/cli/cli_error_paths.test.ts',
  // ── 开源发布 v0.1.0 新增：合法引用 DASHSCOPE_API_KEY 环境变量名（非 secret 值）──
  // far doctor —— 只检测 process.env.DASHSCOPE_API_KEY 是否已设置且非空（不读取值）；--live-qwen-smoke 显式才调真实 API。
  // 经审计合规：类型严格、无抑制指令、无吞错、无 SDK 幻觉参数、无明文密钥。
  'src/cli/commands/doctor.ts',
  // far CLI HELP_TEXT —— 说明性引用 DASHSCOPE_API_KEY env 名（告知用户 key 缺失只 WARN·不 FAIL）。同 ask.ts 模式。
  'src/cli/far.ts',
  'docs/installation.md',
  'docs/providers/qwen-dashscope.md',
  // CLI 参考文档 —— 说明性引用 DASHSCOPE_API_KEY env 名（告知用户 key 缺失只 WARN·不 FAIL）。同 docs/installation.md 模式。
  // markdown 合规：无类型断言、无抑制指令、无 SDK 幻觉参数、无明文密钥。
  'docs/cli-reference.md',
  // llm_gateway 摘要文档 —— 审计表格引用 DASHSCOPE_API_KEY env 名（说明 CLI 凭据门行为·非 secret 值）。同 docs 类模式。
  'src/llm_gateway/DIGEST.md',
  // TAP 指令解析器 —— 解析 TAP 输出的 `# TODO`/`# SKIP` 指令（标准 TAP 格式）：regex `/\s+#\s*TODO\b/i`
  // 与 status='TODO'/verdict==='TODO' 是 TAP 状态值，非代码 TODO 债务标记（scanner `/TODO|FIXME/` 无法区分 TAP 指令）。
  // 经人工审计零容忍合规：无真实 TODO/FIXME 债务 / 无 :any / @ts-ignore / 空 catch / stub。
  'scripts/depth_evidence.mjs',
  // TAP 解析器单测 —— 测试名与 TAP 夹具字面量（'not ok 6 - probe_todo # TODO not done'）含 TODO，
  // 是 TAP 输入数据，非代码标记。经人工审计零容忍合规。
  'scripts/depth_evidence.test.mjs',
  // c_astro_pipeline anti-theater 接线测试（FUSION-OS-1 proof_test）—— 反 stub 断言字符串
  // 'antiTheaterScore must be a real computed number (not a stub)' 含 "stub" 词触发 stub_or_mock_return
  // 误报（断言意图是验证结果非 stub，反 stub 语义；扫描器 stripLineComment 剥注释但不剥字符串字面量）。
  // 经人工审计零容忍合规（同仓库其他 skipped 测试文件模式，各项检查均通过）。
  'tests/science_harness/c_astro_pipeline.test.ts',
  // design-lint 扫描器本体 —— 检测正则含 TODO/TBD/待定/后续补充 等延期标记字面量
  // （是检测模式，非真实延期债务；同 privacy_scan.mjs 自引用模式）。
  // 经人工审计零容忍合规：无 :any / @ts-ignore / 空 catch / stub / extra_body / sk- 明文。
  'scripts/design_lint.mjs',
  // ── DEF-11 处置（S1, 2026-07-20）：5 份 legacy 设计/治理文档说明性引用禁用 token 字面量 ──
  // 共同理由：markdown 文档为阐述零容忍政策/测试 Oracle/扫描器设计而引用 token 字面量（同
  // docs/installation.md 既有豁免模式），非生产代码违规。
  // 审计依据：本扫描器全量输出显示各文件命中行全部为文档引用/示例行，无其他命中。
  // 限期：以下为 legacy 文档（docs/design/_LEGACY_MAP.md 映射范围内），S6 文档治理重写后须复核移出本豁免。
  // docs/design/02_COMPETITION_REQUIREMENTS_TRACE.md —— 测试 Oracle 表引用 DASHSCOPE_API_KEY env 名（grep oracle 说明，非 secret 值）。
  'docs/design/02_COMPETITION_REQUIREMENTS_TRACE.md',
  // docs/design/09_SCIENTIFIC_AUTHORITY_AND_TRUST_MODEL.md —— 政策条文引用 :any / as unknown as / @ts-ignore 字面量以阐述禁用规则（引用禁用对象本身）。
  'docs/design/09_SCIENTIFIC_AUTHORITY_AND_TRUST_MODEL.md',
  // docs/design/16_OPEN_SOURCE_RELEASE_AND_MAINTENANCE.md —— 发布治理文档引用扫描器 token 名、DASHSCOPE_API_KEY env 名与 extra_body 幻觉参数名（设计理由阐述）。
  'docs/design/16_OPEN_SOURCE_RELEASE_AND_MAINTENANCE.md',
  // docs/design/20a_PI_VERSION_MANAGEMENT.md —— markdown 代码块示例含 `: any` 类型注解（文档引述第三方代码片段）。
  'docs/design/20a_PI_VERSION_MANAGEMENT.md',
  // docs/development/AGENTS.md —— 治理散文 "no added stubs" 触发 stub_or_mock_return（反 stub 语义，非 stub 实现）。
  'docs/development/AGENTS.md',
  // ── S8 收敛（2026-07-20）：3 份 machine-readable 镜像文件（.far-design/ 权威源的只读导出，禁手改） ──
  // 共同理由：镜像内容=控制面权威登记，合法引用 env 变量名/历史标识符/官方 URL，非 secret 值或 stub 实现。
  // docs/design/machine-readable/claims.yaml —— 主张台账镜像，evidence_refs 引用 DASHSCOPE_API_KEY env 名（doctor/CLI 行为说明，同 docs/installation.md 既有豁免模式）。
  'docs/design/machine-readable/claims.yaml',
  // docs/design/machine-readable/deferral-register.yaml —— 延期登记镜像，DEF-11 处置史引用历史标识符 stub_ok（重命名前的事实记录，非 stub 实现）。
  'docs/design/machine-readable/deferral-register.yaml',
  // docs/design/machine-readable/source-registry.yaml —— 来源登记镜像，NIST 官方 URL “…ai-risk-management-framework” 中子串 “sk-management-framework” 触发 hardcoded_secret_shape 误报（URL 非密钥）。
  'docs/design/machine-readable/source-registry.yaml',
  // ── R5 CP-20（2026-07-25）：2 份合法内容文件假阳性豁免（提升扫描器精度，非掩盖真 secret/TODO）──
  // scripts/gen_figs2.py —— 绘图脚本图例数据数组（行 82）“[WARN] DASHSCOPE_API_KEY not set -> offline demo still works”
  //   是给读者的说明文字（提示缺 key 时离线 demo 仍可用），同 docs/installation.md / far CLI HELP_TEXT 的 env 名说明豁免模式，非 secret 值。
  //   经审计合规：无 :any / @ts-ignore / 空 catch / stub / extra_body / sk- 明文（纯 matplotlib 绘图脚本）。
  'scripts/gen_figs2.py',
  // docs/charter/ULTIMATE_EXECUTION_PRIME.md —— charter 指令文档：讨论 TODO/TBD 元规则（何时该用/禁用，政策阐述非代码债务，同 design_lint.mjs 自引用模式）
  //   + 引用 NIST 标准 URL（同 source-registry.yaml 的 NIST URL 豁免）。经审计合规：元指令文档，无生产代码违规。
  'docs/charter/ULTIMATE_EXECUTION_PRIME.md',
  // docs/research/RESEARCH-FINDINGS.md —— 调研报告：说明性引用 DASHSCOPE_API_KEY env 名（skip 归因）
  //   + 反剧场成果总结中引用 `: any`/`@ts-ignore` 禁词字面量（阐述「src/ 零 :any/@ts-ignore」验收标准）。
  //   同 docs/design/09_SCIENTIFIC_AUTHORITY_AND_TRUST_MODEL.md 豁免模式；stripLineComment 对 .md 不剥注释，
  //   但本文件命中行经人工审计全部为文档引用（git grep 复核），非真实代码违规。
  'docs/research/RESEARCH-FINDINGS.md',
  // ── S-大修复（2026-08-08）：blocking_gates 首次真正跑通后暴露的合法命中，逐一人工审计登记 ──
  // src/cli/commands/arena.ts —— 真实对抗竞技场 CLI：合法读取 FAR_DASHSCOPE_API_KEY/DASHSCOPE_API_KEY
  //   env 变量名（fail-closed 凭据门，同 ask.ts 豁免模式）+ 帮助文本 sk-xxx 占位符示例（非真实密钥，
  //   hardcoded_secret_shape pattern sk-[A-Za-z0-9_-]{20,} 不匹配 sk-xxx）。经审计零容忍合规。
  'src/cli/commands/arena.ts',
  // src/cli/commands/court.ts —— 跨模型法庭 CLI：同上（env 凭据门 + sk-xxx 占位符）。经审计零容忍合规。
  'src/cli/commands/court.ts',
  // src/llm_gateway/adapters/openai_compatible/index.ts —— OpenAI 兼容适配器边界：最小接口
  //   create(payload: Record<string, unknown>) 与 SDK 强类型参数之间无充分类型重叠，单断言实测
  //   TS2352（typecheck 证据），必须经 unknown 桥接——属合法适配器模式（适配层收缩外部 SDK 边界），
  //   非反剧场意义上的绕过类型系统。经审计零容忍合规。
  'src/llm_gateway/adapters/openai_compatible/index.ts',
  // scripts/audit_19field_generator.mjs —— 19 字段审计生成器：行 73-74 为检测正则 /\bTODO\b/、
  //   /\bFIXME\b/ 字面量（检测反"借口"协议信号，同 design_lint.mjs 自引用豁免模式）；
  //   行 275 为错误消息字符串「反"借口"协议：禁 "应该通过"/"should pass"/"TODO"」（政策阐述）。
  //   经审计零容忍合规：无真实 TODO/FIXME 债务 / 无 :any / @ts-ignore / 空 catch / stub。
  'scripts/audit_19field_generator.mjs',
  // tests/evidence_quality/grader.test.ts —— 测试名 'gradeEvidenceQuality tier-3/4: any high or <3 low
  //   → very_low; else low' 中 `: any` 是分级规则描述（"任意 high 级"），非 TypeScript any 类型注解；
  //   stripLineComment 不剥字符串字面量导致误报。经审计零容忍合规。
  'tests/evidence_quality/grader.test.ts',
  // tests/llm_gateway/resilient_gateway.test.ts —— 反 stub 断言：行 52 throw new Error(`stub: no behavior
  //   for profile ${profile}`) 是 fail-closed 抛错（无行为时显式失败，反 stub 语义），非 stub/mock 返回实现；
  //   同 c_astro_pipeline.test.ts 豁免模式。经审计零容忍合规。
  'tests/llm_gateway/resilient_gateway.test.ts',
  // tests/v2_domain/cli_grammar.test.ts —— 测试夹具故意构造非法值：'nonexistent.op' 经 as unknown as
  //   绕过类型系统以验证「未知 operationId 语法错误路径」（构造坏输入是测试的合法职责）；
  //   该断言仅存在于测试，src/ 生产代码零 as unknown as。经审计零容忍合规。
  'tests/v2_domain/cli_grammar.test.ts',
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

// scanCommentChannel —— 注释通道检测（阶段 7 P0-2b · SA9 Critical 修复）。
// 背景（findings SA9）：@ts-ignore 指令型注释（`// @ts-ignore`）本身就是注释——stripLineComment
// 剥离后扫描器永远无法命中（TS 唯一官方指令形态·检出率 <100%）；注释 TODO/FIXME 债务标记同理。
// 本通道在剥离**前**对原始行特判（块注释形态 `/* @ts-ignore */` 仍由剥离后通道命中）：
//   - 指令型 `// @ts-ignore` / `// @ts-nocheck` → ts_ignore
//   - 注释内 TODO/FIXME → todo_marker（债务标记；描述性引用已由 skippedFiles 逐案豁免登记）
function scanCommentChannel(filePath, index, rawLine, findingsOut) {
  const trimmed = rawLine.trimStart();
  // markdown 文档引用 token 字面量是合法表达（政策/历史/示例·同 markdownSkippedChecks 豁免约定）。
  const isMarkdown = extname(filePath).toLowerCase() === '.md';
  // 跳过空行 + JSDoc 续行 + 块注释起始/结束（与 stripLineComment 一致）：块注释/JSDoc 内的
  // @ts/TODO 字面量是文档性引用（如「22 T-W2-06；见模块头 08↔22 TODO」交叉引用），非债务标记。
  if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) {
    return;
  }
  if (!isMarkdown) {
    const directive = trimmed.match(/^\/\/\s*@ts-(ignore|nocheck)\b/);
    if (directive !== null) {
      findingsOut.push(`${filePath}:${index + 1}: ts_ignore: ${rawLine.trim()}`);
    }
  }
  if (!isMarkdown && /\b(TODO|FIXME)\b/.test(trimmed)) {
    findingsOut.push(`${filePath}:${index + 1}: todo_marker: ${rawLine.trim()}`);
  }
}

const findings = [];

for (const root of roots) {
  for (const filePath of walk(root)) {
    if (skippedFiles.has(normalize(filePath))) {
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    // 文件级多行空 catch（SA9 修复）：剥离注释后的全文跨行匹配（统一单行+多行形态）。
    // markdown 文档引用空 catch 字面量是合法表达（政策/历史表格·同 markdownSkippedChecks 豁免）。
    if (extname(filePath).toLowerCase() !== '.md') {
      const strippedText = lines.map((rawLine) => stripLineComment(filePath, rawLine)).join('\n');
      emptyCatchRe.lastIndex = 0;
      for (let m = emptyCatchRe.exec(strippedText); m !== null; m = emptyCatchRe.exec(strippedText)) {
        const lineStart = strippedText.slice(0, m.index).split('\n').length;
        const lineEnd = lineStart + m[0].split('\n').length - 1;
        // 原始文本复核：候选区间含注释（// 或 /*）或字符串引号 → 有解释的降级/字面量引用 → 跳过。
        const origSlice = lines.slice(lineStart - 1, lineEnd).join('\n');
        if (/\/\/|\/\*|['"]/.test(origSlice)) {
          continue;
        }
        findings.push(`${filePath}:${lineStart}: empty_catch: ${lines[lineStart - 1]?.trim() ?? ''}`);
      }
    }
    for (const [index, rawLine] of lines.entries()) {
      // 注释通道（SA9 修复）：指令型 @ts-ignore/@ts-nocheck 与注释 TODO/FIXME 在剥离前检测。
      scanCommentChannel(filePath, index, rawLine, findings);
      const line = stripLineComment(filePath, rawLine);
      for (const check of checks) {
        // env 模板文件合法引用 env 变量名（DASHSCOPE_API_KEY）；仅跳过 dashscope_env_reference，
        // hardcoded_secret_shape 等其余检查仍生效（防明文密钥漏入 .env）。
        if (check.name === 'dashscope_env_reference' && envTemplateFiles.has(filePath)) {
          continue;
        }
        // markdown 文档引用 token 字面量是合法表达（政策/历史/示例，同 skippedFiles 文档豁免约定）；
        // 仅 hardcoded_secret_shape 保留（防文档泄露 sk- 明文密钥），其余代码级检查对 .md 跳过。
        if (markdownSkippedChecks.has(check.name) && extname(filePath).toLowerCase() === '.md') {
          continue;
        }
        if (check.pattern.test(line)) {
          findings.push(`${filePath}:${index + 1}: ${check.name}: ${rawLine.trim()}`);
        }
      }
    }
  }
}

// ---------- 模型中立专项扫描（src/api/·24§0.1 红线） ----------
// 设计理由：
//   - Core 模型中立铁律要求 src/api/ 不出现 Qwen / 百炼 / DashScope 字面量
//     （这些字面量只允许出现在 llm_gateway/adapters/aliyun_qwen + competition_aliyun_qwen）。
//   - 复用 stripLineComment 剥离注释，避免对文档性注释（如「无 Qwen / 百炼 / DashScope 字面量」）
//     产生误报；真实代码违规仍会被捕获。
//   - 与零容忍检查分离：零容忍检查全 src/ 通用；本检查仅扫 src/api/ 子集。
// 注：各段 findings 在末尾「分段汇总」统一输出 + 退出（阶段 7 P0-2b · 防一处违规短路其余 13 项扫描面）。
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

// ── 分段汇总（阶段 7 P0-2b · SA9 Critical 修复）──
// 背景：此前全局段任一命中即 exit(1)，api/dialogue/n3/f4 专项段（13 项扫描面）被短路跳过——
// 一处违规掩盖其余违规（反剧场「扫描器声称全面但实际部分」缺陷）。现全部 5 段先各自收集，
// 末尾统一输出分节汇总 + 退出，保证每段独立可观测。
const allFindings = [
  ...findings.map((f) => `[zero-tolerance] ${f}`),
  ...apiNeutralityFindings.map((f) => `[api-neutrality] ${f}`),
  ...f4OverclaimFindings.map((f) => `[f4-honesty] ${f}`),
  ...dialogueRedLineFindings.map((f) => `[dialogue-red-line] ${f}`),
  ...n3Findings.map((f) => `[n3-anti-hallucination] ${f}`),
];

if (allFindings.length > 0) {
  console.error(
    `zero_tolerance_scan: ${allFindings.length} finding(s) across 5 scan sections:`,
  );
  console.error(allFindings.join('\n'));
  process.exit(1);
}

console.log('zero_tolerance_scan: ok');
