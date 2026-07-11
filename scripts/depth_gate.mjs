// scripts/depth_gate.mjs
//
// CI 深度门（machine-enforced hard gate · anti-skim 结构性硬核）
//
// 设计目的（为什么-不是什么）：
//   现有 12 个 scan 脚本全扫「禁用 token 出现」（:any / @ts-ignore / extra_body / secret），
//   对 skim 的核心模式（深度功能未接线 / 给占位补测试 / 重跑绿套件）零覆盖。
//   绿套件 = 虚假完成信号：CI 全绿但 decideFiveValueVerdict / executeFallbackChain
//   src/ 内零 AST CallExpression 生产 caller。本门把「深度功能是否真接到生产路径」
//   从软规则（CLAUDE.md §1/§4）变成 CI exit 1。
//
// 关键不变式：本门在「深度功能已建未接线」态必须 FAIL；在「真接线」态 GREEN。
//   FAIL 不是 bug 是特性——它强制别的窗口 agent 做真实接线（P0-2/P0-4/STAT-1/P1-2/P1-4），
//   而非重跑已绿套件找存在感。GREEN 也不等于「深度完成」——见 inherent_limits。
//
// 权威依据：CLAUDE.md §1（PROGRESS = 真实依赖端到端接线） / §4（P0-P3 backlog） /
//   §5 红线 RR（禁手填统计；LLM 不得终裁）。
//
// 抗博弈（红队修补并入，逐条对应逃生通道）：
//   R1 块注释吞噬：自写状态机逐字符扫描，进入 /* */ / // / '...' / "..." / `...` 后 token 不计命中。
//     不复用 zero_tolerance_scan.mjs 的 stripLineComment（其 :94 自承「多行块注释状态跟踪未实现」）。
//   R2 ghost-import / 类型注解 / 字符串字面量：命中须是 CallExpression（符号后紧跟 '(' 或 '<'）。
//   R3 假 caller 在死分支：保守的块内 dead-code 探测（if(false)/while(false)/恒假比较/0&&/return/throw 之后不计）。
//   R4 W1 字面 grep 绕过（fecV2: undefined / decoy fecV2 掩盖真可选字段）：遍历全部匹配，任一可选即 fail。
//   R4' parens/反射绕过 caller 计数：(symbol)(...) / symbol.call/apply/bind(...) 也计为 CallExpression。
//   R5 目录占位（4 个 return 0.03 的 .ts / 12 个 {} 的 .json / 箭头常量 / 字面量算术伪装）：
//     内容校验——占位函数多形态检测 + realMathSignal（Math.* / 循环 / 库函数）+ GV schema 字段语义。
//   R6 账本漂移：verifyLedger 与主检查用**同一份** tokenize+stripCode 读文件，禁双口径。
//   R7 手填 WIRED_GREEN：status=WIRED_GREEN 须配 evidence: 行（base≠head + SHA/runID 格式），agent 无写权限。
//   R8 账本指向幽灵测试：proof_test 路径必须 existsSync（防 ::missing_file 占位）。
//   R9 账本 closed_by 编造 sha：git rev-parse --verify 校验（非 git 目录跳过）。
//
// inherent_limits（诚实声明，不可省）：
//   静态门能证「符号被生产路径引用」「文件非占位」「账本不指幽灵」，但**不能**证：
//     (a) 运行时真执行到该 caller（死分支探测是保守启发式，非完备控制流分析）；
//     (b) caller 传的是真实数据而非预制常量（content-truth 需运行时探针）；
//     (c) closed_by sha 真做了接线（sha 存在 ≠ sha 含接线 diff）；
//     (d) RED→GREEN 双跑物证的防篡改来源（本门只校验 evidence 行格式；完整防护须 CI/branch protection）。
//   完整保证 = 本静态门 + depth-evidence bot（RED→GREEN 双跑）+ CODEOWNERS 护 DEPTH_LEDGER.md
//     + write-restricted token（agent 无写 evidence 权限）。当前 33 行 WIRED_GREEN 已有本地 bot 双跑物证，
//     但 GitHub 防篡改闭环仍依赖 maintainer 配置 required status check/CODEOWNERS；P1-3 维持 WIRED_RED。
//
// 依赖：node:fs / node:path / node:url / node:child_process 内置 + typescript（devDependency，CI 已安装）。
// 历史版本曾「零依赖」手写词法状态机（R1），但边界情况易出错且无独立测试；
// 现改用 TypeScript Compiler API（scripts/lib/code_analysis.mjs），可靠性由官方解析器保障。

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, codeOnlySource } from './lib/code_analysis.mjs';
import { parseLedgerTable, LEDGER_REL } from './lib/ledger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function walkUpRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'DEPTH_LEDGER.md'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return __dirname;
}

// REPO_ROOT 支持环境变量覆盖（DEPTH_GATE_ROOT）：仅用于本门自身对抗测试（scripts/depth_gate.evade.test.mjs
// 建桩仓验证每条红队规避都被捕获）。生产/CI 不设此变量 → 走 walkUpRepoRoot 真实定位。
const REPO_ROOT = process.env.DEPTH_GATE_ROOT || walkUpRepoRoot(__dirname);

function walk(relPath) {
  const abs = join(REPO_ROOT, relPath);
  if (!existsSync(abs)) return [];
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    if (abs.includes('node_modules') || abs.includes('.git') || abs.endsWith('__pycache__')) return [];
    return readdirSync(abs).flatMap((e) => walk(join(relPath, e)));
  }
  return [relPath];
}
const normalize = (p) => p.split(/[\\/]/).join('/');
const readCode = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

// ---------- R1+R2+R6: tokenize + codeOnlySource ----------
// 实现已提取至 scripts/lib/code_analysis.mjs（基于 TypeScript Compiler API）。
// 接口：tokenize(source) → [{ text, kind: 'code'|'comment'|'string', line, col }]
//       codeOnlySource(source) → string（注释/字符串替换为等长空白，保留行号）
// 「kind === 'code'」的 token 才参与符号命中判定。

// ---------- 通用工具（红队修补辅助） ----------
// 恒假数值比较判定：if(1>2)/if(2<1)/if(0===1) 等——两侧均为数字字面量，求值为假 → 死分支。
// 求值为真（if(1>0)）不跳过（可达分支）。防红队「永远 false 比较」伪装真实 caller。
function isConstantFalseComparison(ctx) {
  const m = ctx.match(/\bif\s*\(\s*(\d+(?:\.\d+)?)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*\)/);
  if (!m) return false;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  switch (m[2]) {
    case '>': return !(a > b);
    case '<': return !(a < b);
    case '>=': return !(a >= b);
    case '<=': return !(a <= b);
    case '===': case '==': return !(a === b);
    case '!==': case '!=': return !(a !== b);
    default: return false;
  }
}

// git commit sha 真实性校验（L1 用）：返回 sha 是否是仓库内真实 commit。
// 非 git 目录（temp 桩仓）→ 返回 'no-git'，调用方跳过（不误判）。防账本 closed_by 编造 sha。
// 用 `git cat-file -t <sha>` 而非 `rev-parse --verify <sha>^{commit}`：Windows cmd.exe 把
// ^{commit} 的 ^ 当转义符吞掉，误判真 sha 失败（实测 dca79ce 被 cmd 吞 ^ 后变 dca79ce{commit}）。
function isRealCommitSha(sha) {
  if (!existsSync(join(REPO_ROOT, '.git'))) return 'no-git';
  if (!/^[0-9a-f]{4,64}$/i.test(sha)) return false;
  try {
    const out = execSync(`git cat-file -t ${sha}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out === 'commit';
  } catch {
    return false;
  }
}

// R6: closed_by sha 的 diff 是否 touch 指定文件（闭合 inherent_limits (c)：sha 存在 ≠ sha 含接线 diff）。
// 防 dca79ce6 式攻击——closed_by 指向纯治理 commit（.github/docs/ledger，零 src/ diff）伪造 WIRED_GREEN。
// 返回 true/false；非 git 目录或 git 不可用 → 'skip'（不误判 temp 桩仓，与 isRealCommitSha 同口径）。
// 用数组形式 spawnSync 代替 execSync 字符串拼接：sha 已过 isRealCommitSha 的 ^[0-9a-f]{4,64}$ 校验
// （无 shell 元字符注入面），但数组形式更稳，消除跨平台引用差异。
function commitTouchesFile(sha, filePath) {
  if (!existsSync(join(REPO_ROOT, '.git'))) return 'skip';
  try {
    const out = execSync(
      `git diff-tree --no-commit-id --name-only -r ${sha}`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const touched = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(normalize);
    return touched.includes(normalize(filePath));
  } catch {
    return 'skip';
  }
}

// caller 文件是否含某符号的 CallExpression 形态（L1 WARN 用：proof_caller 行号/文件漂移检测）。
// 仅判「symbol(」形态存在性（含泛型），不排除定义文件——账本 proof_caller 指向定义文件也合法。
function fileHasCallShaped(symbol, file) {
  const rel = normalize(file);
  if (!existsSync(join(REPO_ROOT, rel))) return false;
  const code = codeOnlySource(readCode(rel));
  return new RegExp(`\\b${symbol}\\b\\s*(?:<[^>]*>)?\\s*\\(`).test(code);
}

// 冻结五值裁决枚举（CLAUDE.md §5 红线：禁第六值）。GV/账本引用须命中此集合。
const FROZEN_VERDICTS = new Set(['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED']);

// 账本 proof_caller 行可能涉及的接线符号（用于 L1 WARN 漂移检测）。
const KNOWN_WIRING_SYMBOLS = [
  'decideFiveValueVerdict', 'makeVerdict', 'compileFec', 'fecAppendClaim',
  'executeFallbackChain', 'computeFecHash', 'probePythonAxis', 'computeStageReceipt',
];

// ---------- 检查原语：AST CallExpression 生产 caller 计数 ----------
// 设计理由（红队 R2/R4' 修补）：grep \b${symbol}\b 命中 import / 类型注解 / 字符串字面量 /
//   const _ = X / Identifier-as-value-without-call。命中须是 CallExpression：
//   「符号 token 后跳过空白与 < ，紧跟 (」。排除：定义自身（export function X / function X）/
//   re-export（export { X } / export *）/ tests/ / barrel index.ts。
function countProductionCallers(symbol, opts = {}) {
  const minRequired = opts.minRequired ?? 1;
  const excludeFiles = new Set((opts.excludeFiles ?? []).map(normalize));
  const srcFiles = walk('src').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).map(normalize);
  const defRe = new RegExp(`\\bfunction\\s+${symbol}\\b`);
  const reexportRe = new RegExp(`\\bexport\\s*(\\{[^}]*\\b${symbol}\\b[^}]*\\}|\\*\\s+from)`);
  // R11 防 import 别名击穿 caller 计数：import { symbol as alias } 后用 alias(...) 调用，
  // 旧口径只数 symbol 字面 → 别名调用隐形（V1 makeVerdict 可被 import { makeVerdict as mv } + mv() 走私回生产）。
  // 全 src/ 扫「symbol as <local>」（symbol=导出名）收集别名，与 symbol 等价计入 caller。
  // 不误捕「foo as symbol」（symbol 作 local 别名指向他者）——该形态 symbol 非导出名，与本符号无关。
  const aliasRe = new RegExp(String.raw`\bimport\s*(?:type\s*)?\{[^}]*\b${symbol}\s+as\s+([A-Za-z_$][\w$]*)`);
  const aliases = [symbol];
  for (const rel of srcFiles) {
    if (rel.startsWith('tests/')) continue;
    if (excludeFiles.has(rel)) continue;
    const m = codeOnlySource(readCode(rel)).match(aliasRe);
    if (m) aliases.push(m[1]);
  }
  const symAlt = aliases.join('|');
  const callers = [];
  for (const rel of srcFiles) {
    if (rel.startsWith('tests/')) continue;
    if (excludeFiles.has(rel)) continue;
    const raw = readCode(rel);
    const code = codeOnlySource(raw); // R1: 注释/字符串已剥离
    const lines = code.split(/\r?\n/);
    // barrel 启发式（与 zero_tolerance 一致）
    const reexportLineCount = lines.filter((l) => /export\s+(\*|\{)/.test(l)).length;
    const nonEmpty = lines.filter((l) => l.trim() !== '').length;
    const isBarrel = (rel.endsWith('index.ts') || rel.endsWith('index.js')) && reexportLineCount >= Math.max(1, Math.ceil(nonEmpty / 2));
    let callHits = 0;
    const hitLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (defRe.test(line)) continue;
      if (reexportRe.test(line)) continue;
      const symRe = new RegExp(`\\b(?:${symAlt})\\b`, 'g');
      let m;
      while ((m = symRe.exec(line)) !== null) {
        const after = line.slice(m.index + m[0].length);
        const head = line.slice(0, m.index);
        // R4' 红队修补：CallExpression 形态扩展——
        //   direct:  symbol( / symbol<Gen>(
        //   parenWrap: (symbol)(  —— 包裹后反射调用，原 [<(] 漏判
        //   reflect:  symbol.call/apply/bind(  —— 反射调用
        const direct = /^\s*[<(]/.test(after);
        const parenWrap = /^\s*\)\s*[<(]/.test(after);
        const reflectCall = /^\s*\.\s*(?:call|apply|bind)\s*\(/.test(after);
        // R11：symbol 作 Reflect.apply/call 第一参（动态调度）—— head 末尾即 reflect 调用开启，
        //   symbol 后跟 , 非 (，旧 direct/parenWrap/reflectCall 均漏判。防 Reflect.apply(makeVerdict,null,[]) 走私 V1。
        const reflectFirstArg = /\b(?:Reflect|Function\.prototype)\.(?:apply|call)\s*\(\s*$/.test(head);
        if (!direct && !parenWrap && !reflectCall && !reflectFirstArg) continue;
        // R3 死分支探测（红队扩展，精确版——防「prev 行完整 while(false){...} 污染下一行调用」）：
        //   同行：dead-opener（if(false)/while(false)/恒假数值比较）出现在 symbol 之前 → 死。
        //   上行：仅当 prev 行以「开放 if()/while() 条件」结尾（body 在本行）且条件死 → 死。
        //   上行 return/throw; 或 字面量&& 结尾 → 本行不可达。
        const prevTrim = (lines[i - 1] || '').trim();
        const sameLineDead = /\bif\s*\(\s*(?:false|0|null|undefined)\s*\)/.test(head)
          || /\bwhile\s*\(\s*(?:false|0|null|undefined)\s*\)/.test(head)
          || isConstantFalseComparison(head);
        const openPrevDead = /\b(?:if|while)\s*\([^)]*\)\s*$/.test(prevTrim) && (
          /\bif\s*\(\s*(?:false|0|null|undefined)\s*\)/.test(prevTrim)
          || /\bwhile\s*\(\s*(?:false|0|null|undefined)\s*\)/.test(prevTrim)
          || isConstantFalseComparison(prevTrim)
        );
        const prevUnreachable = /(\breturn\b|\bthrow\b)[^;]*;\s*$/.test(prevTrim)
          || /\b(?:0|false|null|undefined)\s*&&\s*$/.test(prevTrim);
        if (sameLineDead || openPrevDead || prevUnreachable) continue;
        callHits++;
        hitLines.push(i + 1);
      }
    }
    if (callHits > 0 && !isBarrel) callers.push({ file: rel, callHits, hitLines });
  }
  return { count: callers.length, callers, minRequired, passed: callers.length >= minRequired };
}

// ---------- 检查原语：V1 残留检测（递归调用图，非白名单） ----------
// 设计理由（红队 R-rewrite 修补）：detectV1StillAlive 只扫白名单 4 文件，agent 把
//   makeVerdict 包进 legacy.ts wrapper 让白名单 0 命中。门改为：makeVerdict 定义文件
//   (src/falsifiability/verdict.ts) 在 src/ 内的全部 AST CallExpression caller 计数须 = 0
//   （排除定义自身 + tests/）。
function detectV1StillAlive(v1Symbol, v1DefFile) {
  const callers = countProductionCallers(v1Symbol, { minRequired: 0, excludeFiles: [v1DefFile] });
  return {
    passed: callers.count === 0,
    violations: callers.callers,
    reason: callers.count === 0 ? 'ok' : `V1 ${v1Symbol} 在 src/ 内仍有 ${callers.count} 个生产 caller（须全部替换为 V2）`,
  };
}

// ---------- 检查原语：fecV2 形参必选校验（R4 修补） ----------
// 设计理由：detectOptInGate 用「调用块文本含 fecV2 字面」可被 fecV2: undefined 绕过，
//   且红队用顶部 decoy `const fecV2: unknown = null` 让 exec() 只取首匹配（ decoy 非可选 → 误判通过），
//   掩盖下方真实 `fecV2?:`。门改为：遍历 target 内**全部**匹配，任一可选（? 或 | undefined 联合）即 fail。
//   tsc 在 strict + exactOptionalPropertyTypes 下编译期强制，agent 无法传 undefined
//   除非用 as any（被 zero_tolerance_scan 抓）。
// 两阶段查找：fecV2 可能是函数直接形参（function f(fecV2: X)），也可能是 args interface 字段
// （function f(args: { fecV2?: X })）。当前架构是后者——fecAppendClaim(db, args: FecAppendClaimArgs)，
// fecV2? 在 FecAppendClaimArgs interface。只扫形参块会漏报，故先扫形参块，找不到再扫全文件 interface 字段。
function detectOptionalParam(defFile, funcName, paramName) {
  // 防御：defFile 缺失时 fail-closed 结构化报错（非 ENOENT 崩溃丢诊断）。
  // 真实仓库该文件恒存在；桩仓 / 被删场景下给出清晰 reason 而非 stack trace。
  if (!existsSync(join(REPO_ROOT, defFile))) {
    return { passed: false, reason: `${defFile} 不存在——${funcName} 的 ${paramName} 形参无法校验（接线目标文件缺失）` };
  }
  const raw = readCode(defFile);
  const code = codeOnlySource(raw);
  const fieldRe = new RegExp(`(readonly\\s+)?${paramName}(\\?)?\\s*[:{]`, 'g');

  let paramBlock = '';
  const fnIdx = code.indexOf(`function ${funcName}`);
  if (fnIdx >= 0) {
    const start = code.indexOf('(', fnIdx);
    if (start >= 0) {
      let depth = 0;
      let end = start;
      for (let i = start; i < code.length; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      paramBlock = code.slice(start, end);
    }
  }

  const targets = paramBlock ? [paramBlock, code] : [code];
  // R4 红队修补：遍历 target 内全部匹配——任一可选即 fail（防 decoy 掩盖真实可选字段）。
  const optionalHits = [];
  let anyMatch = false;
  for (const target of targets) {
    fieldRe.lastIndex = 0;
    let m;
    while ((m = fieldRe.exec(target)) !== null) {
      anyMatch = true;
      const optionalByQ = m[2] === '?';
      // 抗博弈：fecV2: X | undefined 无 ? 但 caller 仍可传 undefined（绕过 ? 检查）—— 取声明后类型文本查 undefined。
      const after = target.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const typeEnd = after.search(/[;,\n}]/);
      const typeText = after.slice(0, typeEnd < 0 ? 80 : typeEnd);
      const optionalByUnion = /\bundefined\b/.test(typeText);
      if (optionalByQ || optionalByUnion) {
        const why = optionalByQ ? '带 ?' : '类型含 undefined 联合';
        const ctxSnippet = target.slice(Math.max(0, m.index - 8), m.index + m[0].length + 24).replace(/\s+/g, ' ').trim();
        optionalHits.push({ why, ctx: ctxSnippet });
      }
    }
  }
  if (!anyMatch) {
    return { passed: false, reason: `${paramName} 字段未在 ${defFile} 找到（既不在 ${funcName} 形参，也不在 args interface）` };
  }
  if (optionalHits.length > 0) {
    return {
      passed: false,
      reason: `${paramName} 有 ${optionalHits.length} 处可选声明（${optionalHits[0].why}）—— 生产 caller 可传 undefined，opt-in 死分支未强制。首处: "${optionalHits[0].ctx}"`,
      optionalHits,
    };
  }
  return { passed: true, reason: 'ok' };
}

// ---------- 检查原语：目录内容非占位（R5 修补 + R12 realMathSignal 收紧） ----------
// 红队扩展：占位检测覆盖 4 形态——
//   (1) export function F(...): number { return <literal|ident>; }
//   (2) export const F = (...) => <literal|ident>;           （箭头单行常量）
//   (3) return <literal> <op> <literal>;                     （0.5+0 / 0.03*1 常量折叠伪装）
// realMathSignal（R12 收紧）：旧口径「文件含 Math.* / 统计库函数 / for|while」被装饰性满足——
//   攻击者放一个 `const _ = Math.random();` 或空 `for(;;){}` 即过，return 仍是常量/三元。
//   新口径要求信号在 **return 路径** 或 **实质循环体**：
//     returnPathMath —— return 表达式含 Math.*(≠random) / 已知统计库函数 / 含标识符的算术 / 函数方法调用；
//     substantiveLoop —— for/while 体含赋值或自增自减（非空体，排 `for(;;){}` / `while(false){}`）。
//   Math.random 整体排除：非确定性与确定性统计验证相斥（真实 src/statistics 零 Math.random）。
function dirHasRealMath(relPath) {
  const files = walk(relPath).filter((f) => /\.ts$/.test(f) && !/(^|[\\/])index\.(ts|js)$/.test(f));
  const placeholders = [];
  let realMathSignal = false;
  const fnRe1 = /export\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*number\s*\{\s*return\s+([0-9.eE+-]+|[_A-Za-z][_A-Za-z0-9]*)\s*;?\s*\}/g;
  const fnRe2 = /export\s+(?:const|let)\s+(\w+)\s*=[^=]*=>\s*([0-9.eE+-]+|[_A-Za-z][_A-Za-z0-9]*)\s*;?/g;
  const arithRe = /return\s+([0-9.eE+-]+)\s*([+\-*/])\s*([0-9.eE+-]+)\s*;/g;
  const STAT_FNS = /\b(?:erf|normalCdf|normalSurvival|sampleMean|sampleStandardDeviation|tStatistic|chiSquareCdf|holmBonferrioni?|benjaminiHochberg|bonferroni|sampleVariance|weightedVariance|clampProbability|wilson|wald|welch)\b/;
  const MATH_CALL = /\bMath\.(?!random\b)\w+/;
  const CALL_OR_METHOD = /[_A-Za-z][_A-Za-z0-9.]*\s*\(/;
  const returnRe = /\breturn\s+([^;{}]+?)\s*[;]/g;
  const loopRe = /\b(?:for|while)\s*\(([^)]*)\)\s*\{([^{}]*)\}/g;
  for (const rel of files) {
    const code = codeOnlySource(readCode(rel));
    let rm;
    while ((rm = returnRe.exec(code)) !== null) {
      const expr = rm[1];
      const hasArith = /[+\-*/]/.test(expr) && /[A-Za-z_]/.test(expr);
      if (MATH_CALL.test(expr) || STAT_FNS.test(expr) || CALL_OR_METHOD.test(expr) || hasArith) {
        realMathSignal = true;
      }
    }
    let lm;
    while ((lm = loopRe.exec(code)) !== null) {
      const header = lm[1].trim();
      const body = lm[2];
      if (/^(?:false|0\b|;)/.test(header) || body.trim().length === 0) continue;
      if (/[+\-*/|&^]?=|[+\-]{2}/.test(body)) {
        realMathSignal = true;
      }
    }
    let m;
    while ((m = fnRe1.exec(code)) !== null) placeholders.push({ file: normalize(rel), fn: m[1], body: m[2], kind: 'fn-literal' });
    while ((m = fnRe2.exec(code)) !== null) placeholders.push({ file: normalize(rel), fn: m[1], body: m[2], kind: 'arrow-literal' });
    while ((m = arithRe.exec(code)) !== null) placeholders.push({ file: normalize(rel), fn: '(inline)', body: `${m[1]}${m[2]}${m[3]}`, kind: 'literal-arithmetic' });
  }
  return { realFileCount: files.length, files: files.map(normalize), placeholderCount: placeholders.length, placeholders, realMathSignal };
}

// ---------- 检查原语：GV schema 校验（R5 修补：字段语义，非仅键存在） ----------
// 红队扩展：expected.verdict 须命中冻结五值；expected.reasonCodes / input.evidences 须为非空数组。
//   防「GV-01.json = {expected:{verdict:"CONFIRMED"}, ...} 空证据占位」骗过仅查键存在的旧逻辑。
function gvCasesHaveSchema(relPath, requiredKeys) {
  const files = walk(relPath).filter((f) => /GV-\d+\.json$/.test(f));
  const bad = [];
  for (const rel of files) {
    let parsed;
    try { parsed = JSON.parse(readCode(rel)); } catch { bad.push({ file: normalize(rel), reason: 'JSON parse 失败' }); continue; }
    for (const k of requiredKeys) {
      const parts = k.split('.');
      let cur = parsed;
      for (const p of parts) { cur = cur?.[p]; if (cur === undefined) break; }
      if (cur === undefined) bad.push({ file: normalize(rel), reason: `缺字段 ${k}` });
    }
    const verdict = parsed?.expected?.verdict;
    if (typeof verdict !== 'string' || !FROZEN_VERDICTS.has(verdict)) {
      bad.push({ file: normalize(rel), reason: `expected.verdict="${String(verdict)}" 非冻结五值枚举（§5 红线）` });
    }
    const reasonCodes = parsed?.expected?.reasonCodes;
    if (!Array.isArray(reasonCodes) || reasonCodes.length === 0) {
      bad.push({ file: normalize(rel), reason: 'expected.reasonCodes 须为非空数组（防空理由码占位）' });
    }
    const evidences = parsed?.input?.evidences;
    // UNTESTED 允许空证据（合法 missing-FEC/missing-dataset 边界，如 GV-03/GV-04：
    // fec:null + evidences:[] + reasonCodes:["R1_FEC_NOT_COMPILABLE"] + untestedReason）。
    // 其余四值须非空证据——空证据却判 CONFIRMED/REFUTED = 占位攻击。
    if (!Array.isArray(evidences)) {
      bad.push({ file: normalize(rel), reason: 'input.evidences 须为数组' });
    } else if (evidences.length === 0 && verdict !== 'UNTESTED') {
      bad.push({ file: normalize(rel), reason: `verdict=${verdict} 但 input.evidences 为空（仅 UNTESTED 允许空证据）` });
    }
  }
  return { count: files.length, files: files.map(normalize), badCount: bad.length, bad };
}

// ---------- 检查原语：DEPTH_LEDGER §C 解析 + 诚实校验（R6 同口径 + R8/R9） ----------
// parseLedgerTable 已抽到 scripts/lib/ledger.mjs（R6 单口径：gate 与 depth_evidence bot 共用）。
function verifyDepthLedger() {
  const ledger = parseLedgerTable(REPO_ROOT);
  if (!ledger.exists) {
    return { passed: false, reason: 'FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md 不存在——无去窗口化深度状态 SSOT，每窗口重新 skim。须创建（schema 见 §C）' };
  }
  if (ledger.rows.length === 0) {
    return { passed: false, reason: 'DEPTH_LEDGER.md §C 表格未解析出任何行（schema 偏离？）' };
  }
  const stale = [];
  const illegal = [];
  const callerDrift = []; // WARN：proof_caller 文件不含 dep 提及的接线符号（行号/文件漂移）
  const validStatus = new Set(['NOT_BUILT', 'BUILT_UNWIRED', 'WIRED_OPT_IN', 'WIRED_RED', 'WIRED_GREEN']);
  for (const r of ledger.rows) {
    if (!validStatus.has(r.status)) illegal.push({ id: r.id, reason: `status=${r.status} 非 §B 枚举值` });
    const wiredSet = new Set(['WIRED_GREEN', 'WIRED_RED']);
    if (wiredSet.has(r.status)) {
      // R8: proof_test 路径必须存在（防 ::ghost_file 占位）
      const testPath = r.proofTest.split('::')[0].trim();
      if (testPath && !existsSync(join(REPO_ROOT, testPath))) {
        illegal.push({ id: r.id, reason: `proof_test 文件不存在: ${testPath}` });
      }
      // R3: proof_test ::test_name 须真实存在于测试文件（防 ::ghost_name 占位——文件存在但测试名编造）。
      // 兼带闭合 depth_evidence bot 的 NO_MATCH 攻击面：bot 按 TAP verdict 行精确名匹配，
      // 若账本名与真实 test() 名不符 → bot 报 NO_MATCH（ERROR/fail-closed）→ 该行永不可达 WIRED_GREEN。
      // 静态预拦在 gate 层，早于 bot 双跑暴露。
      const nameSep = r.proofTest.indexOf('::');
      if (nameSep >= 0 && testPath && existsSync(join(REPO_ROOT, testPath))) {
        const tname = r.proofTest.slice(nameSep + 2).trim();
        if (tname && !readFileSync(join(REPO_ROOT, testPath), 'utf8').includes(tname)) {
          illegal.push({ id: r.id, reason: `proof_test 测试名未在 ${testPath} 找到（::ghost_name 占位 / 名字漂移；兼防 bot NO_MATCH）: "${tname.slice(0, 60)}"` });
        }
      }
      // proof_caller 文件必须存在
      if (!existsSync(join(REPO_ROOT, r.callerFile))) {
        stale.push({ id: r.id, reason: `proof_caller 文件不存在: ${r.callerFile}` });
      }
      // WARN: dep 提及的接线符号须在 callerFile 有 CallExpression 形态（行号/文件漂移检测）
      const mentioned = KNOWN_WIRING_SYMBOLS.filter((s) => r.dep.includes(s) || r.id.includes(s.replace(/.*Verdict$/, 'verdict')));
      if (mentioned.length > 0 && existsSync(join(REPO_ROOT, r.callerFile))) {
        const anyPresent = mentioned.some((s) => fileHasCallShaped(s, r.callerFile));
        if (!anyPresent) {
          callerDrift.push({ id: r.id, reason: `proof_caller ${r.callerFile}:${r.callerLine} 不含 dep 提及的接线符号 CallExpression（${mentioned.join('/')}）——可能行号漂移或间接路径，请核验` });
        }
      }
    }
    if (r.status === 'WIRED_GREEN') {
      if (!r.closedBy || r.closedBy === '—') illegal.push({ id: r.id, reason: 'WIRED_GREEN 须填 closed_by commit sha' });
      // R9: closed_by sha 须是真实 commit（非 git 目录跳过，不误判 temp 桩仓）
      if (r.closedBy && r.closedBy !== '—') {
        const rev = isRealCommitSha(r.closedBy);
        if (rev === false) illegal.push({ id: r.id, reason: `closed_by="${r.closedBy}" 非本仓库真实 commit（git cat-file -t 失败）` });
        // R6: closed_by sha 的 diff 须 touch proof_caller 文件（闭合 inherent_limits (c)）。
        // 仅在 sha 真实且仓库可 git 时校验（rev===true）——no-git/error 跳过（不误判桩仓）。
        if (rev === true) {
          const touches = commitTouchesFile(r.closedBy, r.callerFile);
          if (touches === false) {
            illegal.push({ id: r.id, reason: `closed_by="${r.closedBy}" 的 git diff-tree 未 touch proof_caller ${r.callerFile}（sha 存在但不含接线 diff——inherent_limits (c) 活体，防纯治理 commit 伪造 WIRED_GREEN，如 dca79ce6 式攻击）` });
          }
        }
      }
    }
  }
  return {
    passed: stale.length === 0 && illegal.length === 0,
    reason: stale.length === 0 && illegal.length === 0 ? `ledger 解析 ${ledger.rows.length} 行，全合法` : `${stale.length} stale + ${illegal.length} illegal`,
    stale, illegal, callerDrift, rowCount: ledger.rows.length,
  };
}

// ---------- 检查原语：WIRED_GREEN evidence 行强制（R7 / §D 抗博弈 #6）----------
// 设计理由：§C line 41 + §D 抗博弈 #6 承诺「agent 手填 WIRED_GREEN 直接 exit 1」——
//   WIRED_GREEN 行须紧随 evidence: <base>→<head> 行，由 depth-evidence bot 用 GITHUB_TOKEN 写回
//   （agent 无该 token + CODEOWNERS 护 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md）。无 evidence 行 = 手填 = exit 1。
// 红队 #5 实时攻击：agent 手填 `evidence: depth_gate.ok → depth_gate.ok`（base=head 自指 + 非 SHA 格式）
//   骗过旧宽松正则。门收紧：base≠head + 每侧须为 40-hex SHA 或纯数字 run-ID。
function verifyWiredGreenEvidence() {
  const ledgerPath = join(REPO_ROOT, ...LEDGER_REL);
  if (!existsSync(ledgerPath)) return { passed: true, reason: '无 ledger（CHECK-L1 已报）' };
  const text = readFileSync(ledgerPath, 'utf8');
  const sectionC = text.split('## §C')[1] || '';
  const lines = sectionC.split(/\r?\n/);
  const missing = [];
  const forged = [];
  const tokenRe = /^[0-9a-f]{7,40}$/i; // SHA（短 7 位到全 40 位）或下方 runID 判定
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*([A-Za-z0-9-]+)\b.*?\|\s*WIRED_GREEN\s*\|/);
    if (m) {
      const tail = lines.slice(i, i + 7).join('\n');
      const ev = tail.match(/evidence\s*:\s*(\S+)\s*[→>]\s*(\S+)/i);
      if (!ev) {
        missing.push({ id: m[1], reason: 'WIRED_GREEN 行后 6 行内无 evidence: <base>→<head>（须 depth-evidence bot 写回，禁 agent 手填，见 §D 抗博弈 #6）' });
        continue;
      }
      const [, base, head] = ev;
      // 自指伪造（base === head）直接拒绝
      if (base === head) {
        forged.push({ id: m[1], reason: `evidence base=head="${base}"（自指伪造，须 base≠head 的真实 CI 双跑）` });
        continue;
      }
      // 每侧须为 SHA（hex）或 GitHub run-ID（纯数字）——拒绝任意字符串（如 depth_gate.ok）
      const baseOk = tokenRe.test(base) || /^\d+$/.test(base);
      const headOk = tokenRe.test(head) || /^\d+$/.test(head);
      if (!baseOk || !headOk) {
        forged.push({ id: m[1], reason: `evidence token 非法：base="${base}" head="${head}"（须 40-hex SHA 或纯数字 run-ID，禁自由字符串）` });
      }
    }
  }
  const allBad = [...missing, ...forged];
  return {
    passed: allBad.length === 0,
    reason: allBad.length === 0 ? 'WIRED_GREEN 行均配合法 evidence 行（base≠head + SHA/runID 格式）' : `${missing.length} 缺 evidence + ${forged.length} 伪造 evidence`,
    missing, forged,
  };
}

// ---------- WARN 检查（不阻断） ----------
function detectOrphanSymbolTest() {
  const warnings = [];
  // 孤立符号 = src/ 内 AST CallExpression 生产 caller = 0
  const probes = ['decideFiveValueVerdict', 'executeFallbackChain'];
  const orphanMap = {};
  for (const sym of probes) {
    const c = countProductionCallers(sym, { minRequired: 0 });
    if (c.count === 0) orphanMap[sym] = true;
  }
  const testFiles = walk('tests').filter((f) => /\.test\.(ts|tsx|js)$/.test(f));
  for (const rel of testFiles) {
    const code = codeOnlySource(readCode(rel));
    for (const sym of Object.keys(orphanMap)) {
      const symRe = new RegExp(`\\b${sym}\\b`);
      if (symRe.test(code)) {
        warnings.push({ file: normalize(rel), symbol: sym, kind: 'orphan_symbol_test', note: `测试引用孤立符号 ${sym}（src 内零生产 caller）；接线前补测试 = 同义反复绿墙` });
      }
    }
  }
  return { warnings };
}

// =====================================================================
// 深度门检查清单（HARD 失败 → process.exit(1)）
// =====================================================================

const hardFailures = [];
const warnings = [];

function hardCheck(name, fn) {
  const r = fn(); r.name = name;
  if (!r.passed) hardFailures.push(r);
  return r;
}

// CHECK-W1 (HARD): fecV2 形参必选（compileFec 真接线门）
hardCheck('CHECK-W1 fecV2 形参必选 (P0-1)', () =>
  detectOptionalParam('src/fec/orchestrator.ts', 'fecAppendClaim', 'fecV2'));

// CHECK-W2 (HARD): decideFiveValueVerdict AST CallExpression 生产 caller ≥ 1
hardCheck('CHECK-W2 decideFiveValueVerdict AST 生产 caller ≥ 1 (P0-2)', () =>
  countProductionCallers('decideFiveValueVerdict', { minRequired: 1 }));

// CHECK-W3 (HARD): executeFallbackChain AST CallExpression 生产 caller ≥ 1
hardCheck('CHECK-W3 executeFallbackChain AST 生产 caller ≥ 1 (P1-2)', () =>
  countProductionCallers('executeFallbackChain', { minRequired: 1 }));

// CHECK-W4 (HARD): makeVerdict 全 src/ 生产 caller = 0（V1 已被 V2 替换）
hardCheck('CHECK-W4 makeVerdict 全 src/ 生产 caller = 0 (P0-2 全替换)', () =>
  detectV1StillAlive('makeVerdict', 'src/falsifiability/verdict.ts'));

// CHECK-W5 (HARD): src/statistics/ 存在且非占位实现 + realMathSignal
hardCheck('CHECK-W5 src/statistics/ ≥4 真实数学模块 + realMathSignal (STAT-1)', () => {
  const d = dirHasRealMath('src/statistics');
  return {
    passed: d.realFileCount >= 4 && d.placeholderCount === 0 && d.realMathSignal,
    reason: d.realFileCount === 0
      ? 'src/statistics/ 不存在——全仓零真实 p-value/effect-size/CI/多重校正（违反 §5 RR 禁手填统计）'
      : `realFileCount=${d.realFileCount}（需 ≥4） placeholderCount=${d.placeholderCount} realMathSignal=${d.realMathSignal}`,
    realFileCount: d.realFileCount,
    placeholderCount: d.placeholderCount,
    realMathSignal: d.realMathSignal,
    placeholders: d.placeholders,
  };
});

// CHECK-W6 (HARD): golden_vectors/cases/ 有 ≥12 条带 schema 的 GV（字段语义校验）
hardCheck('CHECK-W6 golden_vectors/cases/ ≥12 条带 schema GV (P1-4)', () => {
  const gv = gvCasesHaveSchema('golden_vectors/cases', ['input.evidences', 'expected.verdict', 'expected.reasonCodes']);
  return {
    passed: gv.count >= 12 && gv.badCount === 0,
    reason: gv.count === 0
      ? 'golden_vectors/cases/ 不存在——裁决内核 GV oracle 未落盘（现有 golden_vectors.json 是 hash 标签文件非 verdict oracle）'
      : `count=${gv.count}/12 badSchema=${gv.badCount}`,
    count: gv.count,
    badCount: gv.badCount,
    bad: gv.bad,
  };
});

// CHECK-W6b (HARD): GV expected.verdict 与 V2 内核实际裁决逐条一致（R5 运行时校验）
//   W6 仅静态校 schema（字段在 / verdict∈五值 / 证据非空），证不了「expected.verdict 与内核实际输出一致」——
//   攻击者改 GV 的 expected.verdict 或改内核规则使两者静默分歧，W6 仍绿。R5 闭合：spawn
//   `node src/cli/far.ts verify-golden --backend node --all --json`，解析 dump.status/failed，FAIL 即本门 FAIL。
//   仅当 gate root 含真实 src/cli/far.ts + golden_vectors/cases 时运行（fixture/桩模式 skip——evade 测试隔离）。
hardCheck('CHECK-W6b GV expected.verdict 与内核一致（R5 运行时·verify_golden）', () => {
  const farTs = join(REPO_ROOT, 'src/cli/far.ts');
  const gvDir = join(REPO_ROOT, 'golden_vectors/cases');
  if (!existsSync(farTs) || !existsSync(gvDir)) {
    return { passed: true, reason: 'src/cli/far.ts 或 golden_vectors/cases 不存在（fixture/桩模式）——R5 运行时校验仅对真实仓库生效' };
  }
  const r = spawnSync('node', [farTs, 'verify-golden', '--backend', 'node', '--all', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) {
    const msg = r.error instanceof Error ? r.error.message : String(r.error);
    return { passed: false, reason: `verify-golden spawn 错误：${msg}` };
  }
  let dump;
  try {
    dump = JSON.parse(r.stdout);
  } catch {
    return { passed: false, reason: `verify-golden 输出非 JSON（exit=${r.status}）——stdout 头: ${(r.stdout || '').slice(0, 200)} stderr: ${(r.stderr || '').slice(0, 200)}` };
  }
  if (dump.status !== 'PASS' || (dump.failed ?? 0) > 0) {
    const failedCases = (dump.cases ?? [])
      .filter((c) => c.status === 'FAIL')
      .map((c) => `${c.caseId}: expected=${c.expectedVerdict} actual=${c.verdict} (${(c.errors ?? []).join('; ')})`);
    return {
      passed: false,
      reason: `GV expected.verdict 与 V2 内核不一致（R5）——${dump.failed ?? '?'} 条分歧：${failedCases.slice(0, 6).join(' | ') || '见 dump'}`,
    };
  }
  return { passed: true, reason: `verify-golden ${dump.passed}/${dump.total} PASS（GV expected.verdict/decisiveRuleId/reasonCodes 与 V2 内核逐条一致）` };
});

// CHECK-W7 (HARD): tests/real_backends/ 存在 + 真实 spawn/import 信号（防字符串自洽占位）
hardCheck('CHECK-W7 tests/real_backends/ 非空 + 真实 spawn 信号 (P2-1)', () => {
  const files = walk('tests/real_backends').filter((f) => /\.test\.ts$/.test(f));
  const hollow = [];
  for (const rel of files) {
    const code = codeOnlySource(readCode(rel));
    // 真实后端信号：child_process spawn 族（调用或 import）。三个真实测试（sympy/dafny/lean）均
    // `import { spawnSync } from 'node:child_process'` + spawnSync(python/dafny/lean) 真起子进程。
    // 不接受「字符串里提及 sympy/z3」——expect("sympy").toBe("sympy") 字符串自洽无 spawn 须判 hollow。
    const hasSpawn = /\b(?:spawnSync|execSync|spawn|fork)\s*\(/.test(code) || /from\s+['"]node:child_process['"]/.test(code);
    if (!hasSpawn) {
      hollow.push({ file: normalize(rel), reason: '无 child_process spawn 信号（防字符串自洽占位；真实测试须 spawnSync/execSync 真起子进程）' });
    }
  }
  return {
    passed: files.length >= 1 && hollow.length === 0,
    reason: files.length === 0 ? 'tests/real_backends/ 不存在——零真实后端 RED→GREEN 测试，绿套件无真实依赖锚点' : `${files.length} 文件，${hollow.length} 个无真实 spawn 信号`,
    count: files.length,
    hollow,
  };
});

// CHECK-L1 (HARD): DEPTH_LEDGER §C 存在且合法（含 R8 proof_test 存在 + R9 closed_by sha）
hardCheck('CHECK-L1 DEPTH_LEDGER §C 存在且合法', () => verifyDepthLedger());

// CHECK-L2 (HARD): WIRED_GREEN 须配合法 evidence: <base>→<head> 行（base≠head + SHA/runID 格式，禁手填）
hardCheck('CHECK-L2 WIRED_GREEN 须配合法 evidence 行 (禁手填/禁自指伪造)', () => verifyWiredGreenEvidence());

// WARN（不阻断）：orphan-symbol 测试检测 + ledger caller 漂移
{
  const orphan = detectOrphanSymbolTest();
  if (orphan.warnings.length > 0) warnings.push({ category: 'orphan_symbol_tests', items: orphan.warnings });
  const l1 = hardFailures.find((f) => f.name && f.name.includes('CHECK-L1'));
  if (l1 && l1.callerDrift && l1.callerDrift.length > 0) {
    warnings.push({ category: 'ledger_caller_drift', items: l1.callerDrift });
  }
}

// =====================================================================
// 输出 + exit code
// =====================================================================

console.log('=== depth_gate: 深度功能接线状态（AST CallExpression + 块注释状态机）===\n');

for (const c of hardFailures) {
  console.error(`[FAIL] ${c.name}`);
  console.error(`       reason: ${c.reason || JSON.stringify(c)}`);
  if (c.callers !== undefined) console.error(`       生产 callers: ${c.callers.length}（需 ≥${c.minRequired ?? 1}）`);
  if (c.violations) for (const v of c.violations.slice(0, 8)) console.error(`       violation: ${JSON.stringify(v)}`);
  if (c.placeholders) for (const s of c.placeholders.slice(0, 8)) console.error(`       placeholder: ${JSON.stringify(s)}`);
  if (c.bad) for (const b of c.bad.slice(0, 8)) console.error(`       badGV: ${JSON.stringify(b)}`);
  if (c.illegal) for (const il of c.illegal.slice(0, 8)) console.error(`       illegal: ${JSON.stringify(il)}`);
  if (c.missing) for (const mi of c.missing.slice(0, 8)) console.error(`       missing-evidence: ${JSON.stringify(mi)}`);
  if (c.forged) for (const fg of c.forged.slice(0, 8)) console.error(`       forged-evidence: ${JSON.stringify(fg)}`);
  console.error('');
}

if (warnings.length > 0) {
  console.log('--- WARN (不阻断 CI) ---');
  for (const w of warnings) {
    console.log(`[WARN] ${w.category}: ${w.items.length} 项`);
    for (const it of w.items.slice(0, 10)) console.log(`       ${it.file ?? it.id}: ${it.reason ?? it.note}`);
  }
  console.log('');
}

if (hardFailures.length > 0) {
  console.error(`=== depth_gate: ${hardFailures.length} 项 HARD 检查失败 ===`);
  console.error('深度功能未接线 / 账本不诚实——这是特性（强制 agent 做真实接线 + 禁手填 WIRED_GREEN，CLAUDE.md §1/§4/§5），不是 bug。');
  console.error('修复指引：');
  console.error('  W1 → src/fec/orchestrator.ts fecV2 移除 ? / | undefined（必选形参）');
  console.error('  W2 → P0-2: 生产 caller（orchestrator/verdict_stage/render/verify_golden）调 decideFiveValueVerdict');
  console.error('  W3 → P1-2: qwen_adapter/qwen_vl_adapter 真编排 executeFallbackChain');
  console.error('  W4 → 与 W2 互锁：makeVerdict 在 src/ 全部生产 caller = 0');
  console.error('  W5 → STAT-1: 建 src/statistics/{p_value,effect_size,ci,multiple_testing}.ts（非占位 + 真实数学信号）');
  console.error('  W6 → P1-4: 落盘 golden_vectors/cases/GV-01..GV-14.json（verdict∈五值 + 非空 reasonCodes/evidences）');
  console.error('  W7 → P2-1: 建 tests/real_backends/*.test.ts（真实 spawn/child_process，非字符串自洽）');
  console.error('  L1 → 修 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C（proof_test 须存在 + closed_by 须真实 sha + status∈枚举）');
  console.error('  L2 → WIRED_GREEN 行须紧随 evidence: <base_sha>→<head_sha>（base≠head + SHA/runID 格式，由 depth-evidence bot 写回，禁手填）');
  console.error('inherent_limits：静态门不证运行时执行/内容真实/RED→GREEN——完整保证须 depth-evidence bot + CODEOWNERS（见文件头）。');
  console.error('详见 FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §A (next_action) + §D + .agent/AGENT_ENTRY_PROTOCOL.md + .agent/AGENT_ANTISKIM_TRIPWIRES.md');
  process.exit(1);
}

console.log('=== depth_gate: ok（所有 HARD 检查通过 · inherent_limits 仍适用，见文件头） ===');
