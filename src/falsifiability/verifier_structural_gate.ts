/**
 * verifier 加载期 AST 结构门（FUSION-OS-5）—— TS Compiler API 扫描确定性裁决内核 +
 * anti-theater detector 源码，禁止 forbidden network/IO/LLM call·fail-closed。
 *
 * 反剧场红线（CLAUDE.md §5 + FUSION_OPEN_SCIENCE_DESIGN.md §F-5）：deterministic R0-R9 内核 +
 * 20 detector 必须全程无 network/IO/LLM call（F3 deterministic·LLM 不作最终裁决者）。
 * 本门在 runAntiTheaterLint 入口（每次 verdict 路径）加载期自检源码纯度。
 *
 * 机制（TS Compiler API·非手写状态机——对齐 scripts/lib/code_analysis.mjs 既定范式，非正则）：
 *   ts.createSourceFile 解析 .ts 源 → 全树遍历 → forbidden static import / dynamic import / require /
 *   global call 命中即记 hit。全树（非仅顶层）：kernel helper 函数被实际调用，内层 network call 会执行，
 *   须同等拦截。type-only import（`import type`）编译期擦除、非运行时依赖 → 放行。
 *
 * 生产接线：runAntiTheaterLint 入口（src/anti_theater/lint.ts）调 assertVerifierModulesClean（memoized·首次扫描后 O(1)）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export type ForbiddenCallKind =
  | 'forbidden-import'
  | 'forbidden-require'
  | 'forbidden-dynamic-import'
  | 'forbidden-global-call';

export interface ForbiddenCallHit {
  readonly fileName: string;
  readonly line: number;
  readonly kind: ForbiddenCallKind;
  readonly specifier?: string;
  readonly callee?: string;
  readonly text: string;
}

export class VerifierStructuralGateError extends Error {
  public override readonly name = 'VerifierStructuralGateError';
  readonly hits: readonly ForbiddenCallHit[];
  constructor(hits: readonly ForbiddenCallHit[]) {
    const detail = hits
      .map((h) => `  ${h.fileName}:${h.line} [${h.kind}]${h.specifier !== undefined ? ` specifier=${h.specifier}` : ''}${h.callee !== undefined ? ` callee=${h.callee}` : ''} :: ${h.text}`)
      .join('\n');
    super(`verifier structural gate: ${hits.length} forbidden call(s) detected:\n${detail}`);
    this.hits = hits;
  }
}

// 禁模块清单：network / IO / 进程 / LLM SDK / fetch 库。命中即违反确定性内核纯度。
const FORBIDDEN_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  'fs', 'node:fs', 'fs/promises', 'node:fs/promises',
  'http', 'node:http', 'https', 'node:https',
  'net', 'node:net', 'dns', 'node:dns', 'tls', 'node:tls', 'dgram', 'node:dgram',
  'child_process', 'node:child_process',
  'openai', '@anthropic-ai/sdk', '@azure/openai', '@google/generative-ai',
  'node-fetch', 'axios', 'got', 'undici', 'request', 'sync-request',
  'ws', 'socket.io',
]);

// 禁全局 call：bare identifier call（无 import 亦可用的全局，如 fetch / WebSocket / child_process 导出的）。
const FORBIDDEN_GLOBAL_CALLS: ReadonlySet<string> = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'exec', 'execSync', 'spawn', 'spawnSync', 'fork', 'execFile', 'execFileSync',
]);

// 任意路径含 llm_gateway 的 import/require——LLM 网关是裁决禁止依赖。
const LLM_GATEWAY_PATH = /llm_gateway/;

function isForbiddenModuleSpecifier(spec: string): boolean {
  return FORBIDDEN_MODULE_SPECIFIERS.has(spec) || LLM_GATEWAY_PATH.test(spec);
}

function literalText(node: ts.Node): string | null {
  if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    return (node as ts.StringLiteralLike).text;
  }
  return null;
}

/**
 * 扫描单段源码字符串，返回全部 forbidden 命中（全树遍历·不抛）。
 * 纯函数·独立可测：fixture 模拟 dirty 源 → 非空命中。
 */
export function scanSourceForForbiddenCalls(source: string, fileName: string): readonly ForbiddenCallHit[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: ForbiddenCallHit[] = [];

  const lineOf = (node: ts.Node): number => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const snippet = (node: ts.Node): string => sourceFile.text.slice(node.getStart(sourceFile), node.getEnd()).slice(0, 80);

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      // type-only import 编译期擦除、非运行时依赖 → 放行（importClause.isTypeOnly）。
      const isTypeOnly = node.importClause?.isTypeOnly === true;
      if (!isTypeOnly) {
        const spec = literalText(node.moduleSpecifier);
        if (spec !== null && isForbiddenModuleSpecifier(spec)) {
          hits.push({ fileName, line: lineOf(node), kind: 'forbidden-import', specifier: spec, text: snippet(node) });
        }
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const firstArg = node.arguments[0];
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        // dynamic import('...')
        if (firstArg !== undefined) {
          const spec = literalText(firstArg);
          if (spec !== null && isForbiddenModuleSpecifier(spec)) {
            hits.push({ fileName, line: lineOf(node), kind: 'forbidden-dynamic-import', specifier: spec, text: snippet(node) });
          }
        }
      } else if (ts.isIdentifier(callee) && callee.text === 'require') {
        // require('...')
        if (firstArg !== undefined) {
          const spec = literalText(firstArg);
          if (spec !== null && isForbiddenModuleSpecifier(spec)) {
            hits.push({ fileName, line: lineOf(node), kind: 'forbidden-require', specifier: spec, text: snippet(node) });
          }
        }
      } else if (ts.isIdentifier(callee) && FORBIDDEN_GLOBAL_CALLS.has(callee.text)) {
        hits.push({ fileName, line: lineOf(node), kind: 'forbidden-global-call', callee: callee.text, text: snippet(node) });
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);

  return hits;
}

/** 断言单段源码干净——非空命中即抛 VerifierStructuralGateError。 */
export function assertSourceClean(source: string, fileName: string): void {
  const hits = scanSourceForForbiddenCalls(source, fileName);
  if (hits.length > 0) {
    throw new VerifierStructuralGateError(hits);
  }
}

// ===== 确定性内核模块清单（加载期自检对象·red-line 守护范围）=====

const GATE_DIR = dirname(fileURLToPath(import.meta.url));

interface DeterministicModule {
  readonly label: string;
  readonly path: string;
}

function listDeterministicModules(): readonly DeterministicModule[] {
  const modules: DeterministicModule[] = [
    { label: 'falsifiability/verdict_kernel_v2', path: join(GATE_DIR, 'verdict_kernel_v2.ts') },
    { label: 'anti_theater/lint', path: join(GATE_DIR, '..', 'anti_theater', 'lint.ts') },
    { label: 'anti_theater/constraint', path: join(GATE_DIR, '..', 'anti_theater', 'constraint.ts') },
    { label: 'anti_theater/score', path: join(GATE_DIR, '..', 'anti_theater', 'score.ts') },
  ];
  const detectorsDir = join(GATE_DIR, '..', 'anti_theater', 'detectors');
  for (const name of readdirSync(detectorsDir)) {
    if (name.endsWith('.ts') && name !== 'index.ts') {
      modules.push({ label: `anti_theater/detectors/${name}`, path: join(detectorsDir, name) });
    }
  }
  return modules;
}

/**
 * 扫描全部确定性内核模块（read 真实 .ts 源 + AST 解析），返回命中清单（不抛·不 memoize）。
 * 真实生产依赖：readFileSync 读 verdict_kernel_v2.ts + anti_theater/{lint,constraint,score} + 20 detector 源 →
 * ts.createSourceFile 真实 AST 解析（非正则/非桩）。
 */
export function scanDeterministicModules(): readonly ForbiddenCallHit[] {
  const allHits: ForbiddenCallHit[] = [];
  for (const mod of listDeterministicModules()) {
    const source = readFileSync(mod.path, 'utf8');
    const hits = scanSourceForForbiddenCalls(source, mod.label);
    for (const hit of hits) {
      allHits.push(hit);
    }
  }
  return allHits;
}

let checkCompleted = false;
let cachedError: VerifierStructuralGateError | null = null;

/**
 * 加载期自检确定性内核全模块源码无 forbidden call——fail-closed。
 * memoized：每进程首次扫描后缓存；命中缓存错误后续重复抛（不静默放过）。
 * 文件读失败 → fail-closed 抛错（无法验证纯度 = 拒绝放行）。
 *
 * 生产入口：runAntiTheatorLint 每次调用先过此门（src/anti_theater/lint.ts）。
 */
export function assertVerifierModulesClean(): void {
  if (checkCompleted) {
    if (cachedError !== null) {
      throw cachedError;
    }
    return;
  }
  let hits: readonly ForbiddenCallHit[];
  try {
    hits = scanDeterministicModules();
  } catch (err) {
    // fail-closed：读不到源 = 无法验证 → 拒绝（不吞错·不静默放过），cause 保留原始栈。
    throw new Error(`verifier structural gate: cannot scan deterministic modules: ${(err as Error).message}`, { cause: err });
  }
  checkCompleted = true;
  if (hits.length > 0) {
    cachedError = new VerifierStructuralGateError(hits);
    throw cachedError;
  }
}
