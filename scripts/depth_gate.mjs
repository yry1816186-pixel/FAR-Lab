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
// 关键不变式：本门在当前仓库状态（深度功能已建未接线）下必须 FAIL。
// FAIL 不是 bug 是特性——它强制别的窗口 agent 做真实接线（P0-2/P0-4/STAT-1/P1-2/P1-4），
// 而非重跑已绿套件找存在感。门随 backlog 推进逐项变 GREEN，从不放宽。
//
// 权威依据：CLAUDE.md §1（PROGRESS = 真实依赖端到端接线） / §4（P0-P3 backlog） /
//   §5 红线 RR（禁手填统计；LLM 不得终裁）。recon 实据（2026-07 Read/Grep 复验）：
//   decideFiveValueVerdict 定义 src/falsifiability/verdict_kernel_v2.ts:195，src 内零生产 caller
//   executeFallbackChain 定义 src/llm_gateway/fallback_chain/fallback_chain.ts:78，src 内零生产 caller
//   compileFec src/fec/orchestrator.ts:93 调用但被 args.fecV2?（orchestrator.ts:59 可选）门控，
//     demo_chain.ts:180 fecAppendClaim 实参不含 fecV2 字段（180-226 行）→ 生产永不触发
//   evaluateStatistics verdict_kernel_v2.ts:450 定义，仅被 V2 内部（:264 :277）调用，V2 零生产 caller
//   src/statistics/ 不存在；golden_vectors/cases/ 不存在；tests/real_backends/ 不存在
//   tsconfig.json 未开 noUnusedLocals（strict:true 但无 unused 检查）→ 不能靠 tsc 抓 ghost-import
//
// 抗博弈（红队修补并入，逐条对应逃生通道）：
//   R1 块注释吞噬：自写状态机逐字符扫描，进入 /* */ / // / '...' / "..." / `...` 后 token 不计命中。
//     不复用 zero_tolerance_scan.mjs 的 stripLineComment（其 :94 自承「多行块注释状态跟踪未实现」）。
//   R2 ghost-import / 类型注解 / 字符串字面量：命中须是 CallExpression（符号后紧跟 '(' 或 '<'）。
//   R3 假 caller 在死分支：保守的块内 dead-code 探测（if(false)/0&&/return/throw 之后不计）。
//   R4 W1 字面 grep 绕过（fecV2: undefined）：fecV2 形参须无 OptionalToken（tsc 编译期强制）。
//   R5 目录占位（4 个 return 0.03 的 .ts / 12 个 {} 的 .json）：内容校验——非占位函数 + GV schema 字段。
//   R6 账本漂移：verifyLedger 与主检查用**同一份** tokenize+stripCode 读文件，禁双口径。
//   R7 手填 WIRED_GREEN：status=WIRED_GREEN 须配 evidence: 行，agent 无写权限。
//
// 零依赖（仅 node:fs / node:path / node:url 内置）。CI 任意环境可跑。

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const REPO_ROOT = walkUpRepoRoot(__dirname);

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

// ---------- R1+R2+R6: 状态机 tokenize ----------
// 逐字符扫描，区分代码 / 块注释 / 行注释 / 字符串 / 模板字面量。
// 返回 token 数组，每个 token = { text, kind: 'code'|'comment'|'string', line, col }。
// 「kind === 'code'」的 token 才参与符号命中判定。
function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let buf = '';
  let bufStartLine = 1;
  let bufStartCol = 1;
  const flush = (kind) => {
    if (buf.length > 0) {
      tokens.push({ text: buf, kind, line: bufStartLine, col: bufStartCol });
      buf = '';
    }
  };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    // 块注释 /* */
    if (ch === '/' && next === '*') {
      flush('code');
      bufStartLine = line; bufStartCol = col;
      buf = '/*'; i += 2; col += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') { line++; col = 1; } else col++;
        buf += source[i]; i++;
      }
      if (i < source.length) { buf += '*/'; i += 2; col += 2; }
      flush('comment');
      continue;
    }
    // 行注释 //
    if (ch === '/' && next === '/') {
      flush('code');
      bufStartLine = line; bufStartCol = col;
      buf = '//';
      i += 2; col += 2;
      while (i < source.length && source[i] !== '\n') { buf += source[i]; i++; col++; }
      flush('comment');
      continue;
    }
    // 字符串 ' "
    if (ch === "'" || ch === '"') {
      flush('code');
      const quote = ch;
      bufStartLine = line; bufStartCol = col;
      buf = ch; i++; col++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          buf += source[i]; i++; col++;
          if (source[i] === '\n') { line++; col = 1; } else col++;
          buf += source[i]; i++;
          continue;
        }
        if (source[i] === '\n') { line++; col = 1; } else col++;
        buf += source[i]; i++;
      }
      if (i < source.length) { buf += source[i]; i++; col++; }
      flush('string');
      continue;
    }
    // 模板字面量 ` （不追踪 ${}，模板整体当 string，对符号命中已足够保守）
    if (ch === '`') {
      flush('code');
      bufStartLine = line; bufStartCol = col;
      buf = '`'; i++; col++;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\' && i + 1 < source.length) {
          buf += source[i]; i++; col++;
          buf += source[i]; i++;
          if (source[i] === '\n') { line++; col = 1; } else col++;
          continue;
        }
        if (source[i] === '\n') { line++; col = 1; } else col++;
        buf += source[i]; i++;
      }
      if (i < source.length) { buf += source[i]; i++; col++; }
      flush('string');
      continue;
    }
    if (ch === '\n') { line++; col = 1; buf += ch; i++; continue; }
    if (buf.length === 0) { bufStartLine = line; bufStartCol = col; }
    buf += ch; i++; col++;
  }
  flush('code');
  return tokens;
}

// 把 tokens 里 kind=code 的文本拼回「等效源码」（保留 \n 以维持行号），
// 注释/字符串替换为等长空白，使行号与原文件一致。
function codeOnlySource(source) {
  const tokens = tokenize(source);
  let out = '';
  let curLine = 1;
  let curCol = 1;
  const padTo = (tLine, tCol) => {
    while (curLine < tLine) { out += '\n'; curLine++; curCol = 1; }
    while (curCol < tCol) { out += ' '; curCol++; }
  };
  for (const t of tokens) {
    padTo(t.line, t.col);
    if (t.kind === 'code') {
      out += t.text;
      const lines = t.text.split('\n');
      if (lines.length > 1) { curLine += lines.length - 1; curCol = lines[lines.length - 1].length + 1; }
      else curCol += t.text.length;
    } else {
      // 注释/字符串 → 等长空白（保留行号与列对齐）
      const text = t.text;
      const lines = text.split('\n');
      for (let k = 0; k < lines.length; k++) {
        if (k > 0) { out += '\n'; curLine++; curCol = 1; }
        for (let j = 0; j < lines[k].length; j++) { out += ' '; curCol++; }
      }
    }
  }
  return out;
}

// ---------- 检查原语：AST CallExpression 生产 caller 计数 ----------
// 设计理由（红队 R2 修补）：grep \b${symbol}\b 命中 import / 类型注解 / 字符串字面量 /
//   const _ = X / Identifier-as-value-without-call。命中须是 CallExpression：
//   「符号 token 后跳过空白与 < ，紧跟 (」。排除：定义自身（export function X / function X）/
//   re-export（export { X } / export *）/ tests/ / barrel index.ts。
function countProductionCallers(symbol, opts = {}) {
  const minRequired = opts.minRequired ?? 1;
  const excludeFiles = new Set((opts.excludeFiles ?? []).map(normalize));
  const srcFiles = walk('src').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).map(normalize);
  const defRe = new RegExp(`\\bfunction\\s+${symbol}\\b`);
  const reexportRe = new RegExp(`\\bexport\\s*(\\{[^}]*\\b${symbol}\\b[^}]*\\}|\\*\\s+from)`);
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (defRe.test(line)) continue;
      if (reexportRe.test(line)) continue;
      // 多次匹配：找 symbol 后是否紧跟 ( 或 <
      const symRe = new RegExp(`\\b${symbol}\\b`, 'g');
      let m;
      while ((m = symRe.exec(line)) !== null) {
        const after = line.slice(m.index + m[0].length);
        if (/^\s*[<(]/.test(after)) {
          // R3: 块内死分支探测（保守：本行或前一行含 if(false)/0&&/return/throw 后的跳过）
          const ctx = (lines[i - 1] || '') + '\n' + line;
          if (/\bif\s*\(\s*(false|0)\s*\)/.test(ctx)) continue;
          if (/\b0\s*&&/.test(ctx)) continue;
          if (/(\breturn\b|\bthrow\b)[^;]*;\s*$/.test(lines[i - 1] || '')) continue;
          callHits++;
        }
      }
    }
    if (callHits > 0 && !isBarrel) callers.push({ file: rel, callHits });
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
// 设计理由：detectOptInGate 用「调用块文本含 fecV2 字面」可被 fecV2: undefined 绕过。
//   门改为：orchestrator.ts 的 fecAppendClaim 形参列表中 fecV2 字段必须非可选（无 ?）。
//   tsc 在 strict + exactOptionalPropertyTypes 下编译期强制，agent 无法传 undefined
//   除非用 as any（被 zero_tolerance_scan 抓）。
// 两阶段查找：fecV2 可能是函数直接形参（function f(fecV2: X)），也可能是 args interface 字段
// （function f(args: { fecV2?: X })）。当前架构是后者——fecAppendClaim(db, args: FecAppendClaimArgs)，
// fecV2? 在 FecAppendClaimArgs interface。只扫形参块会漏报，故先扫形参块，找不到再扫全文件 interface 字段。
// 属性访问 args.fecV2 / args.fecV2?.contract 不匹配（后随 . 或三元 ? ，不跟 :/{ ）。
function detectOptionalParam(defFile, funcName, paramName) {
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
  for (const target of targets) {
    fieldRe.lastIndex = 0;
    const m = fieldRe.exec(target);
    if (m) {
      const optionalByQ = m[2] === '?';
      // 抗博弈：fecV2: X | undefined 无 ? 但 caller 仍可传 undefined（绕过 ? 检查）—— 取声明后类型文本查 undefined。
      const after = target.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const typeEnd = after.search(/[;,\n}]/);
      const typeText = after.slice(0, typeEnd < 0 ? 80 : typeEnd);
      const optionalByUnion = /\bundefined\b/.test(typeText);
      const isOptional = optionalByQ || optionalByUnion;
      const why = optionalByQ ? '带 ?' : '类型含 undefined 联合';
      return {
        passed: !isOptional,
        reason: isOptional ? `${paramName} 仍是可选（${why}）—— 生产 caller 可传 undefined，opt-in 死分支未强制` : 'ok',
      };
    }
  }
  return { passed: false, reason: `${paramName} 字段未在 ${defFile} 找到（既不在 ${funcName} 形参，也不在 args interface）` };
}

// ---------- 检查原语：目录内容非占位（R5 修补） ----------
function dirHasRealMath(relPath) {
  const files = walk(relPath).filter((f) => /\.ts$/.test(f) && !/(^|[\\/])index\.(ts|js)$/.test(f));
  const placeholders = [];
  for (const rel of files) {
    const code = codeOnlySource(readCode(rel));
    // 占位函数：函数体仅 return <numeric literal> / return <identifier>
    const fnRe = /export\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*number\s*\{\s*return\s+([0-9.eE+-]+|[_A-Za-z][_A-Za-z0-9]*)\s*;?\s*\}/g;
    let m;
    while ((m = fnRe.exec(code)) !== null) {
      placeholders.push({ file: normalize(rel), fn: m[1], body: m[2] });
    }
  }
  return { realFileCount: files.length, files: files.map(normalize), placeholderCount: placeholders.length, placeholders };
}

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
  }
  return { count: files.length, files: files.map(normalize), badCount: bad.length, bad };
}

// ---------- 检查原语：DEPTH_LEDGER §C 解析 + 诚实校验（R6 同口径） ----------
function parseLedgerTable() {
  const ledgerPath = join(REPO_ROOT, 'PROJECT_PLAN', 'DEPTH_LEDGER.md');
  if (!existsSync(ledgerPath)) return { exists: false, rows: [] };
  const text = readFileSync(ledgerPath, 'utf8');
  const rows = [];
  const sectionC = text.split('## §C')[1] || '';
  const tableMatch = sectionC.match(/\|[^\n]*\|\n([\s\S]*?)(?=\n[^|]|\n## |\n---|$)/);
  if (!tableMatch) return { exists: true, rows: [] };
  const body = tableMatch[1];
  const lineRe = /^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*(src\/[^\s|]+):(\d+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(\w+)\s*\|\s*([^|]*?)\s*\|\s*$/gm;
  let m;
  while ((m = lineRe.exec(body)) !== null) {
    rows.push({
      id: m[1].trim(),
      dep: m[2].trim(),
      callerFile: m[3].trim(), callerLine: parseInt(m[4], 10),
      proofTest: m[5].trim(),
      redCommit: m[6].trim(),
      status: m[7].trim(),
      closedBy: m[8].trim(),
    });
  }
  return { exists: true, rows };
}

function verifyDepthLedger() {
  const ledger = parseLedgerTable();
  if (!ledger.exists) {
    return { passed: false, reason: 'PROJECT_PLAN/DEPTH_LEDGER.md 不存在——无去窗口化深度状态 SSOT，每窗口重新 skim。须创建（schema 见 §C）' };
  }
  if (ledger.rows.length === 0) {
    return { passed: false, reason: 'DEPTH_LEDGER.md §C 表格未解析出任何行（schema 偏离？）' };
  }
  const stale = [];
  const illegal = [];
  const validStatus = new Set(['NOT_BUILT', 'BUILT_UNWIRED', 'WIRED_OPT_IN', 'WIRED_RED', 'WIRED_GREEN']);
  for (const r of ledger.rows) {
    if (!validStatus.has(r.status)) illegal.push({ id: r.id, reason: `status=${r.status} 非 §B 枚举值` });
    // R7: status=WIRED_GREEN 须配 evidence 行 + closed_by sha
    if (r.status === 'WIRED_GREEN') {
      if (!r.closedBy || r.closedBy === '—') illegal.push({ id: r.id, reason: 'WIRED_GREEN 须填 closed_by commit sha' });
      // 仅校验 proof_caller 文件存在（CI 双跑物证由 depth-evidence.yml 单独负责，本脚本不重复跑测试）
      if (!existsSync(join(REPO_ROOT, r.callerFile))) stale.push({ id: r.id, reason: `proof_caller 文件不存在: ${r.callerFile}` });
    }
  }
  return {
    passed: stale.length === 0 && illegal.length === 0,
    reason: stale.length === 0 && illegal.length === 0 ? `ledger 解析 ${ledger.rows.length} 行，全合法` : `${stale.length} stale + ${illegal.length} illegal`,
    stale, illegal, rowCount: ledger.rows.length,
  };
}

// ---------- 检查原语：WIRED_GREEN evidence 行强制（R7 / §D 抗博弈 #6）----------
// 设计理由：§C line 41 + §D 抗博弈 #6 承诺「agent 手填 WIRED_GREEN 直接 exit 1」——
//   WIRED_GREEN 行须紧随 evidence: <base>→<head> 行，由 depth-evidence bot 用 GITHUB_TOKEN 写回
//   （agent 无该 token + CODEOWNERS 护 PROJECT_PLAN/DEPTH_LEDGER.md）。无 evidence 行 = 手填 = exit 1。
//   当前零 WIRED_GREEN 行 → 本检查空过（不破坏诚实态）；行转 GREEN 时强制 evidence。
function verifyWiredGreenEvidence() {
  const ledgerPath = join(REPO_ROOT, 'PROJECT_PLAN', 'DEPTH_LEDGER.md');
  if (!existsSync(ledgerPath)) return { passed: true, reason: '无 ledger（CHECK-L1 已报）' };
  const text = readFileSync(ledgerPath, 'utf8');
  const sectionC = text.split('## §C')[1] || '';
  const lines = sectionC.split(/\r?\n/);
  const missing = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*([A-Za-z0-9-]+)\b.*?\|\s*WIRED_GREEN\s*\|/);
    if (m) {
      const tail = lines.slice(i, i + 7).join('\n');
      if (!/evidence\s*:\s*\S+\s*[→>]\s*\S+/i.test(tail)) {
        missing.push({ id: m[1], reason: 'WIRED_GREEN 行后 6 行内无 evidence: <base>→<head>（须 depth-evidence bot 写回，禁 agent 手填，见 §D 抗博弈 #6）' });
      }
    }
  }
  return {
    passed: missing.length === 0,
    reason: missing.length === 0 ? 'WIRED_GREEN 行均配 evidence 行（或零 WIRED_GREEN）' : `${missing.length} 个 WIRED_GREEN 行缺 evidence`,
    missing,
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

// CHECK-W5 (HARD): src/statistics/ 存在且非占位实现
hardCheck('CHECK-W5 src/statistics/ 存在且 ≥4 真实数学模块 (STAT-1)', () => {
  const d = dirHasRealMath('src/statistics');
  return {
    passed: d.realFileCount >= 4 && d.placeholderCount === 0,
    reason: d.realFileCount === 0
      ? 'src/statistics/ 不存在——全仓零真实 p-value/effect-size/CI/多重校正（违反 §5 RR 禁手填统计）'
      : `realFileCount=${d.realFileCount}（需 ≥4: p_value/effect_size/ci/multiple_testing） placeholderCount=${d.placeholderCount}`,
    realFileCount: d.realFileCount,
    placeholderCount: d.placeholderCount,
    placeholders: d.placeholders,
  };
});

// CHECK-W6 (HARD): golden_vectors/cases/ 有 ≥12 条带 schema 的 GV
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

// CHECK-W7 (HARD): tests/real_backends/ 存在且非空
hardCheck('CHECK-W7 tests/real_backends/ 非空 (P2-1)', () => {
  const files = walk('tests/real_backends').filter((f) => /\.test\.ts$/.test(f));
  return {
    passed: files.length >= 1,
    reason: files.length === 0 ? 'tests/real_backends/ 不存在——零真实后端 RED→GREEN 测试，绿套件无真实依赖锚点' : `${files.length} 个测试文件`,
    count: files.length,
  };
});

// CHECK-L1 (HARD): DEPTH_LEDGER §C 存在且合法
hardCheck('CHECK-L1 DEPTH_LEDGER §C 存在且合法', () => verifyDepthLedger());

// CHECK-L2 (HARD): WIRED_GREEN 须配 evidence: <base>→<head> 行（禁 agent 手填，见 §D 抗博弈 #6）
hardCheck('CHECK-L2 WIRED_GREEN 须配 evidence 行 (禁手填)', () => verifyWiredGreenEvidence());

// WARN（不阻断）：orphan-symbol 测试检测
{
  const orphan = detectOrphanSymbolTest();
  if (orphan.warnings.length > 0) warnings.push({ category: 'orphan_symbol_tests', items: orphan.warnings });
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
  console.error('');
}

if (warnings.length > 0) {
  console.log('--- WARN (不阻断 CI) ---');
  for (const w of warnings) {
    console.log(`[WARN] ${w.category}: ${w.items.length} 项`);
    for (const it of w.items.slice(0, 10)) console.log(`       ${it.file}: ${it.symbol} ${it.note}`);
  }
  console.log('');
}

if (hardFailures.length > 0) {
  console.error(`=== depth_gate: ${hardFailures.length} 项 HARD 检查失败 ===`);
  console.error('深度功能未接线——这是特性（强制 agent 做真实接线，CLAUDE.md §4 P0-P3），不是 bug。');
  console.error('修复指引：');
  console.error('  W1 → src/fec/orchestrator.ts:59 fecV2 移除 ?（必选形参）+ demo_chain.ts:180 实参传 fecV2.contract');
  console.error('  W2 → P0-2: 4 个生产 caller（orchestrator:116/verdict_stage:234/demo_chain:215/render:26）调 decideFiveValueVerdict');
  console.error('  W3 → P1-2: qwen_vl_adapter 真编排 executeFallbackChain');
  console.error('  W4 → 与 W2 互锁：makeVerdict 在 src/ 全部生产 caller = 0');
  console.error('  W5 → STAT-1: 建 src/statistics/{p_value,effect_size,ci,multiple_testing}.ts（非占位）');
  console.error('  W6 → P1-4: 落盘 golden_vectors/cases/GV-01..GV-12.json（带 input.evidences/expected.verdict/expected.reasonCodes）');
  console.error('  W7 → P2-1: 建 tests/real_backends/{sympy,z3,...}.test.ts（真实 spawn）');
  console.error('  L1 → 建/修 PROJECT_PLAN/DEPTH_LEDGER.md §C 表格（schema 见文件）');
  console.error('  L2 → WIRED_GREEN 行须紧随 evidence: <base>→<head>（由 depth-evidence bot 写回，禁手填）');
  console.error('详见 PROJECT_PLAN/DEPTH_LEDGER.md §A (next_action) + AGENT_ENTRY_PROTOCOL.md + AGENT_ANTISKIM_TRIPWIRES.md');
  process.exit(1);
}

console.log('=== depth_gate: ok（所有 HARD 检查通过） ===');
