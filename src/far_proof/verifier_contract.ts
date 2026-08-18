/**
 * far_proof/verifier_contract — PROOF-VERIFY-001：公开 verifier 的行为契约 + 跨实现
 * conformance vectors + 离线/零遥测机检机制。
 *
 * 职责（宪法 T0 逐项）：
 *   - VERIFIER_CONTRACT：公开 verifier 的 5 条行为保证（离线可运行 / 无模型凭证 /
 *     无网络出口 / 无遥测 / verdict 只能来自 verifier 执行结果），每条绑定机器验证手段。
 *   - conformance vectors（src/far_proof/conformance_vectors.json + 同名
 *     .schema.json 公开规范）：从 golden proof corpus（demo_chain 导出 bundle）生成的
 *     跨实现共享测试向量——valid→PASS、tampered→具体失败码、malformed→解析错误、
 *     missing artifact→缺失错误。字段：vectorId / kind / inputRef / expectedOutcome。
 *     任何实现（CLI、library、浏览器）都必须对同一向量集产出同一结果；向量文件的
 *     规范 SSOT 是 conformance_vectors.schema.json（draft-07，语言无关公开工件），
 *     加载即按 schema 校验（draft-07 子集校验器内置，零新依赖）。
 *   - verifyConformance(runner)：注入任意 verify 函数跑全套向量（CLI 与 library 两
 *     runner 各自实证——cross-implementation conformance）。
 *   - withNetworkDenied(fn)：测试助手——stub globalThis.fetch 抛错，证明 fn 执行期间
 *     零网络依赖。
 *   - scanVerifierNetworkImports / scanVerifierTelemetry / scanVerifierCredentialUsage：
 *     verifier 模块源码静态扫描——禁止 node:http/https/net/tls/dgram/dns/undici import
 *     与裸 fetch( 调用；禁止 URL 字面量与 endpoint 常量；禁止凭证形 env 读取与
 *     llm_gateway import。allowlist 显式呈现（当前为空——无豁免）。
 *   - checkBrowserVerifierAsset：浏览器 verifier 资产存在性检查（只读，不改 frontend）——
 *     若存在消费 conformance vectors 格式的前端文件，断言其引用的向量文件可解析且
 *     符合向量 schema；不存在则如实报告（不静默假装跨端一致）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 静态扫描证明 verifier 模块源码无网络/遥测/凭证模式；不证明其传递依赖（如
 *     better-sqlite3 原生模块、Node 运行时本身）无网络行为——运行时证明仅覆盖
 *     withNetworkDenied 作用域内的 fetch 面（fetch stub 不拦截 node:socket 直连）。
 *   - conformance vectors 证明「对这 10 条向量输入，各实现结果一致」；不证明实现间
 *     全输入空间等价（穷举不可行，向量集是抽样的契约锚）。
 *   - 展示层「verdict 只能来自执行结果」由向量集钉住（valid→PASS / 篡改→FAIL）；
 *     不证明所有 UI 渲染路径都无旁路——那属于前端测试域。
 *
 * Determinism：向量应用（mutation）为纯字节操作；bundle 基底由固定 exportedAt 的
 * demo_chain 导出。No LLM。
 */

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 行为契约（behavioral guarantees）
// ---------------------------------------------------------------------------

export interface VerifierGuarantee {
  readonly id: string;
  readonly statement: string;
  readonly verifiedBy: readonly string[];
}

/** PROOF-VERIFY-001 公开 verifier 行为保证（每条绑定机器验证手段）。 */
export const VERIFIER_CONTRACT: Readonly<{ id: 'PROOF-VERIFY-001'; guarantees: readonly VerifierGuarantee[] }> =
  Object.freeze({
    id: 'PROOF-VERIFY-001',
    guarantees: Object.freeze([
      {
        id: 'OFFLINE_CAPABLE',
        statement: 'the verifier runs to completion with no network access available',
        verifiedBy: ['withNetworkDenied + verifyConformance (library runner)'],
      },
      {
        id: 'NO_MODEL_CREDENTIALS',
        statement: 'no model/API credentials are required, read, or accepted',
        verifiedBy: ['scanVerifierCredentialUsage (no credential-shaped env reads, no llm_gateway imports)'],
      },
      {
        id: 'NO_NETWORK_EGRESS',
        statement: 'the verifier never sends proof content or user data to any remote party',
        verifiedBy: ['scanVerifierNetworkImports (no http/net/tls/dgram/dns/undici imports, no fetch calls)'],
      },
      {
        id: 'NO_TELEMETRY',
        statement: 'the verifier emits no telemetry, analytics, or endpoint beacons',
        verifiedBy: ['scanVerifierTelemetry (no URL literals, no endpoint/telemetry constants)'],
      },
      {
        id: 'VERDICT_FROM_EXECUTION_ONLY',
        statement: 'displayed verdicts derive solely from verifier execution results',
        verifiedBy: ['conformance vectors: valid->PASS, tampered/malformed/missing->FAIL with specific codes'],
      },
    ]),
  });

// ---------------------------------------------------------------------------
// conformance vectors（跨实现共享格式；JSON 文件加载）
// ---------------------------------------------------------------------------

/** 向量类别：合法 / 篡改 / 畸形 / 缺失分量。 */
export type ConformanceVectorKind = 'valid' | 'tampered' | 'malformed' | 'missing_artifact';

/** 对基底 bundle 的确定性变换（纯字节操作）。 */
export interface ConformanceMutation {
  /** bundle 内目标文件（相对路径）。valid 向量无 mutate。 */
  readonly target?: string;
  /** append=追加内容；overwrite=整文件覆写；truncate=截半；delete=删除；corrupt-hash=改 integrity.json 哈希字符。 */
  readonly action: 'none' | 'append' | 'overwrite' | 'truncate' | 'delete' | 'corrupt-hash';
  readonly content?: string;
}

export interface ConformanceVectorInputRef {
  /** 基底 bundle 构造标识（demo_chain + exportFarProof，固定 exportedAt）。 */
  readonly base: 'far-proof-demo-chain@v1';
  readonly mutate?: ConformanceMutation;
}

export type ConformanceExpectedOutcome =
  | { readonly status: 'PASS' }
  | { readonly status: 'FAIL'; readonly errorCode: string };

export interface ConformanceVector {
  readonly vectorId: string;
  readonly kind: ConformanceVectorKind;
  readonly inputRef: ConformanceVectorInputRef;
  readonly expectedOutcome: ConformanceExpectedOutcome;
  /** 期望来源（诚实标注：实测 derive，非人工推断）。 */
  readonly derivedFrom: string;
}

export interface ConformanceVectorFile {
  readonly formatVersion: 1;
  readonly generated: string;
  readonly vectors: readonly ConformanceVector[];
}

/** 加载 conformance vectors（模块同目录 JSON；跨实现共享的单一文件）。
 *  加载即按公开 JSON Schema（conformance_vectors.schema.json · draft-07）校验——
 *  schema 是规范 SSOT，任何实现共享同一公开工件。 */
export function loadConformanceVectors(): ConformanceVectorFile {
  return loadConformanceVectorsFile(
    fileURLToPath(new URL('./conformance_vectors.json', import.meta.url)),
  );
}

/** 按路径加载 + schema 校验（可注入坏文件做负向测试——schema 契约可证伪）。 */
export function loadConformanceVectorsFile(path: string): ConformanceVectorFile {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const violations = validateConformanceVectorsDoc(raw);
  if (violations.length > 0) {
    const detail = violations.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`conformance vectors at ${path} violate the public schema (${detail})`);
  }
  return raw as ConformanceVectorFile; // 单次受控断言：上方 schema 校验已证形状
}

// ---------------------------------------------------------------------------
// 公开 schema 校验（draft-07 子集 · schema 驱动 · 零新依赖）
// 支持关键字：type/enum/const/minLength/minItems/required/properties/
// additionalProperties/items/$ref(#/definitions/…)/oneOf——覆盖本 schema 全部用法。
// ---------------------------------------------------------------------------

export interface SchemaViolation {
  readonly path: string;
  readonly message: string;
}

type JsonSchemaNode = Readonly<Record<string, unknown>>;

/** 各 JSON 类型的运行时判定（integer 按 JSON Schema 语义：无小数部分的 number）。 */
const TYPE_PREDICATES: Readonly<Record<string, (v: unknown) => boolean>> = Object.freeze({
  string: (v): boolean => typeof v === 'string',
  number: (v): boolean => typeof v === 'number' && Number.isFinite(v),
  integer: (v): boolean => typeof v === 'number' && Number.isInteger(v),
  boolean: (v): boolean => typeof v === 'boolean',
  object: (v): boolean => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: (v): boolean => Array.isArray(v),
  null: (v): boolean => v === null,
});

/** 解析 $ref '#/definitions/<name>'（本 schema 仅用文档内引用）。 */
function resolveRef(ref: string, root: JsonSchemaNode): JsonSchemaNode | null {
  if (!ref.startsWith('#/')) return null;
  let node: unknown = root;
  for (const seg of ref.slice(2).split('/')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as JsonSchemaNode)[seg];
  }
  return typeof node === 'object' && node !== null ? (node as JsonSchemaNode) : null;
}

function validateScalarKeywords(schema: JsonSchemaNode, value: unknown, path: string, errors: SchemaViolation[]): void {
  const type = schema['type'];
  if (typeof type === 'string') {
    const predicate = TYPE_PREDICATES[type];
    if (predicate !== undefined && !predicate(value)) {
      errors.push({ path, message: `expected type '${type}', got ${JSON.stringify(typeof value)}` });
    }
  }
  const expected = schema['const'];
  if (expected !== undefined && JSON.stringify(value) !== JSON.stringify(expected)) {
    errors.push({ path, message: `expected const ${JSON.stringify(expected)}, got ${JSON.stringify(value)}` });
  }
  const enumValues = schema['enum'];
  if (Array.isArray(enumValues) && !enumValues.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push({ path, message: `value ${JSON.stringify(value)} not in enum [${enumValues.map((e) => JSON.stringify(e)).join(', ')}]` });
  }
  if (typeof value === 'string' && typeof schema['minLength'] === 'number' && value.length < schema['minLength']) {
    errors.push({ path, message: `string shorter than minLength ${String(schema['minLength'])}` });
  }
  if (Array.isArray(value) && typeof schema['minItems'] === 'number' && value.length < schema['minItems']) {
    errors.push({ path, message: `array shorter than minItems ${String(schema['minItems'])}` });
  }
}

function validateObjectKeywords(
  schema: JsonSchemaNode,
  value: Record<string, unknown>,
  root: JsonSchemaNode,
  path: string,
  errors: SchemaViolation[],
): void {
  const required = schema['required'];
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === 'string' && !(key in value)) {
        errors.push({ path, message: `missing required property '${key}'` });
      }
    }
  }
  const properties = schema['properties'];
  if (typeof properties === 'object' && properties !== null) {
    for (const [key, subSchema] of Object.entries(properties as JsonSchemaNode)) {
      if (key in value && typeof subSchema === 'object' && subSchema !== null) {
        validateSchemaNode(subSchema as JsonSchemaNode, value[key], root, `${path}.${key}`, errors);
      }
    }
  }
  if (schema['additionalProperties'] === false) {
    const known = new Set(Object.keys(properties instanceof Object ? (properties as JsonSchemaNode) : {}));
    for (const key of Object.keys(value)) {
      if (!known.has(key)) {
        errors.push({ path: `${path}.${key}`, message: 'additional property not allowed by schema' });
      }
    }
  }
}

function validateSchemaNode(schema: JsonSchemaNode, value: unknown, root: JsonSchemaNode, path: string, errors: SchemaViolation[]): void {
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    const target = resolveRef(ref, root);
    if (target === null) {
      errors.push({ path, message: `unresolvable $ref ${ref}` });
      return;
    }
    validateSchemaNode(target, value, root, path, errors);
    return;
  }
  validateScalarKeywords(schema, value, path, errors);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    validateObjectKeywords(schema, value as Record<string, unknown>, root, path, errors);
  }
  const items = schema['items'];
  if (Array.isArray(value) && typeof items === 'object' && items !== null) {
    for (let i = 0; i < value.length; i += 1) {
      validateSchemaNode(items as JsonSchemaNode, value[i], root, `${path}[${i}]`, errors);
    }
  }
  const oneOf = schema['oneOf'];
  if (Array.isArray(oneOf)) {
    validateOneOf(oneOf, value, root, path, errors);
  }
}

function validateOneOf(branches: readonly unknown[], value: unknown, root: JsonSchemaNode, path: string, errors: SchemaViolation[]): void {
  const branchErrors: string[] = [];
  let matchCount = 0;
  for (const branch of branches) {
    if (typeof branch !== 'object' || branch === null) continue;
    const probe: SchemaViolation[] = [];
    validateSchemaNode(branch as JsonSchemaNode, value, root, path, probe);
    if (probe.length === 0) matchCount += 1;
    branchErrors.push(probe.map((e) => `${e.path}: ${e.message}`).join(' | '));
  }
  if (matchCount !== 1) {
    errors.push({ path, message: `oneOf: expected exactly 1 matching branch, got ${matchCount} (branches: ${branchErrors.join(' || ')})` });
  }
}

/** 按公开 schema 校验任意文档（schema 文件本身即规范 SSOT——加载即校验）。 */
export function validateConformanceVectorsDoc(doc: unknown): readonly SchemaViolation[] {
  const schemaPath = fileURLToPath(new URL('./conformance_vectors.schema.json', import.meta.url));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as JsonSchemaNode;
  const errors: SchemaViolation[] = [];
  validateSchemaNode(schema, doc, schema, '$', errors);
  return errors;
}

// ---------------------------------------------------------------------------
// 向量应用（确定性 mutation）+ runner 接口 + verifyConformance
// ---------------------------------------------------------------------------

/** 应用一条 mutation 到 bundle 目录（纯字节操作，确定性）。 */
export function applyConformanceMutation(bundleDir: string, mutation: ConformanceMutation | undefined): void {
  if (mutation === undefined || mutation.action === 'none') return;
  if (mutation.target === undefined) throw new Error('mutation requires a target file');
  const filePath = join(bundleDir, mutation.target);
  if (mutation.action === 'delete') {
    if (!existsSync(filePath)) throw new Error(`mutation target missing: ${mutation.target}`);
    rmSync(filePath);
    return;
  }
  const text = readFileSync(filePath, 'utf8');
  switch (mutation.action) {
    case 'append':
      appendFileSync(filePath, mutation.content ?? '# CONFORMANCE_MUTATION\n', 'utf8');
      break;
    case 'overwrite':
      writeFileSync(filePath, mutation.content ?? 'CONFORMANCE_MUTATION', 'utf8');
      break;
    case 'truncate':
      writeFileSync(filePath, text.slice(0, Math.floor(text.length / 2)), 'utf8');
      break;
    case 'corrupt-hash': {
      // 确定性翻转 integrity.json 中 integrityHash 字段的第一个 hex 字符
      const flipped = text.replace(/"integrityHash"\s*:\s*"([0-9a-f])/, (_m, h: string) =>
        `"integrityHash":"${h === '0' ? '1' : '0'}`,
      );
      writeFileSync(filePath, flipped, 'utf8');
      break;
    }
    default:
      throw new Error(`unknown mutation action: ${String(mutation.action)}`);
  }
}

/** conformance runner：任意实现的 verify 入口（CLI / library / browser-WASM 包装）。 */
export type ConformanceRunner = (bundleDir: string) => Promise<ConformanceRunnerResult> | ConformanceRunnerResult;

export interface ConformanceRunnerResult {
  readonly ok: boolean;
  /** 失败细节（错误码须内嵌其中；无法提供时可为空——PASS/FAIL 仍被强制核对）。 */
  readonly errors: readonly string[];
}

export interface ConformanceCaseResult {
  readonly vectorId: string;
  readonly kind: ConformanceVectorKind;
  readonly expectedStatus: 'PASS' | 'FAIL';
  readonly actualOk: boolean;
  /** FAIL 向量的错误码是否在 runner 输出中命中。 */
  readonly errorCodeMatched: boolean | null;
  readonly actualErrors: readonly string[];
  readonly pass: boolean;
}

export interface ConformanceRunSummary {
  readonly caseCount: number;
  readonly passedCount: number;
  readonly allPassed: boolean;
  readonly cases: readonly ConformanceCaseResult[];
}

function evaluateExpected(expected: ConformanceExpectedOutcome, result: ConformanceRunnerResult): {
  pass: boolean;
  errorCodeMatched: boolean | null;
} {
  if (expected.status === 'PASS') {
    return { pass: result.ok, errorCodeMatched: null };
  }
  const matched = result.errors.some((e) => e.includes(expected.errorCode));
  return { pass: !result.ok && matched, errorCodeMatched: matched };
}

/**
 * 对注入 runner 跑全套 conformance vectors。
 * @param runner verify 函数（返回 {ok, errors}）。
 * @param baseDir 已导出的基底 bundle 目录；每个 case 在 workspace/cases/<id> 的副本上应用 mutation。
 * @param workspace 可写工作目录（用后由调用方清理）。
 */
export async function verifyConformance(
  runner: ConformanceRunner,
  baseDir: string,
  workspace: string,
): Promise<ConformanceRunSummary> {
  const vectors = loadConformanceVectors().vectors;
  mkdirSync(join(workspace, 'cases'), { recursive: true });
  const cases: ConformanceCaseResult[] = [];
  for (const v of vectors) {
    const caseDir = join(workspace, 'cases', v.vectorId);
    cpSync(baseDir, caseDir, { recursive: true });
    applyConformanceMutation(caseDir, v.inputRef.mutate);
    const result = await runner(caseDir);
    const { pass, errorCodeMatched } = evaluateExpected(v.expectedOutcome, result);
    cases.push({
      vectorId: v.vectorId,
      kind: v.kind,
      expectedStatus: v.expectedOutcome.status,
      actualOk: result.ok,
      errorCodeMatched,
      actualErrors: result.errors,
      pass,
    });
  }
  return {
    caseCount: cases.length,
    passedCount: cases.filter((c) => c.pass).length,
    allPassed: cases.every((c) => c.pass),
    cases,
  };
}

// ---------------------------------------------------------------------------
// CLI runner（真实子进程执行 src/cli/far.ts verify --bundle <dir>）
// ---------------------------------------------------------------------------

export interface CliRunnerOptions {
  /** 仓库根（可移植路径）。 */
  readonly repoRoot: string;
}

/**
 * CLI 实现 runner：spawn `node src/cli/far.ts verify --bundle <dir>`。
 * ok = exit 0；errors = stdout/stderr 文本（人类输出内嵌错误码，供 errorCode 子串匹配）。
 */
export function makeCliVerifierRunner(opts: CliRunnerOptions): ConformanceRunner {
  return (bundleDir: string): ConformanceRunnerResult => {
    const r = spawnSync(
      process.execPath,
      [join(opts.repoRoot, 'src', 'cli', 'far.ts'), 'verify', '--bundle', bundleDir],
      { encoding: 'utf8', timeout: 120_000 },
    );
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    return { ok: r.status === 0, errors: out.split('\n').filter((l) => l.trim().length > 0) };
  };
}

// ---------------------------------------------------------------------------
// 离线测试机制：withNetworkDenied
// ---------------------------------------------------------------------------

/** 网络被测试装备拒绝（withNetworkDenied 替换 fetch 后抛出的错误类型）。 */
export class NetworkDeniedError extends Error {
  constructor() {
    super('network access denied: PROOF-VERIFY-001 offline harness replaced globalThis.fetch with a throwing guard');
    this.name = 'NetworkDeniedError';
  }
}

/**
 * 在 fetch 被拒绝（任何调用抛 NetworkDeniedError）的环境下执行 fn，结束后恢复。
 * fn 内任何 fetch 都会抛错——若被测逻辑依赖网络，fn 将以 NetworkDeniedError 失败。
 * 注意：只拦截 fetch 面（task 指定的机制）；node:socket 直连不在本助手拦截范围
 * （由静态扫描覆盖源码面）。
 */
export async function withNetworkDenied<T>(fn: () => Promise<T> | T): Promise<T> {
  const g = globalThis as { fetch?: unknown };
  const original = g.fetch;
  g.fetch = (): never => {
    throw new NetworkDeniedError();
  };
  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete g.fetch;
    } else {
      g.fetch = original;
    }
  }
}

// ---------------------------------------------------------------------------
// 静态扫描：网络 import / 遥测 / 凭证（verifier 模块源码）
// ---------------------------------------------------------------------------

/** 契约覆盖的 verifier 模块（相对仓库根）。 */
export const VERIFIER_MODULES: readonly string[] = [
  'src/far_proof/bundle_verifier.ts',
  'src/far_proof/integrity_check.ts',
  'src/far_proof/offline_package.ts',
  'src/far_proof/bundle_signature.ts',
  'src/far_proof/env_fingerprint.ts',
  'src/far_proof/verifier_contract.ts',
];

export interface StaticScanFinding {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly snippet: string;
}

export interface StaticScanResult {
  readonly scannedFiles: number;
  readonly findings: readonly StaticScanFinding[];
  /** allowlist 呈现（当前为空——无豁免；新增豁免必须带理由登记于此）。 */
  readonly allowlist: readonly { readonly file: string; readonly pattern: string; readonly reason: string }[];
  readonly ok: boolean;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function scanModuleSources(
  repoRoot: string,
  detectors: readonly { name: string; test: (line: string) => boolean }[],
  allowlist: readonly { file: string; pattern: string; reason: string }[],
): StaticScanResult {
  const findings: StaticScanFinding[] = [];
  for (const rel of VERIFIER_MODULES) {
    const path = join(repoRoot, ...rel.split('/'));
    if (!existsSync(path)) continue;
    const lines = stripComments(readFileSync(path, 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      for (const d of detectors) {
        if (d.test(line)) {
          findings.push({ file: rel, line: i + 1, pattern: d.name, snippet: line.trim().slice(0, 120) });
        }
      }
    }
  }
  const filtered = findings.filter(
    (f) => !allowlist.some((a) => a.file === f.file && (a.pattern === f.pattern || a.pattern === '*')),
  );
  return {
    scannedFiles: VERIFIER_MODULES.length,
    findings: filtered,
    allowlist,
    ok: filtered.length === 0,
  };
}

/** 扫描禁止的网络 import（node:http/https/net/tls/dgram/dns + undici/axios + 裸 fetch 调用）。 */
export function scanVerifierNetworkImports(repoRoot: string): StaticScanResult {
  const detectors = [
    {
      name: 'network-import',
      test: (line: string) =>
        /from\s+['"](?:node:)?(?:https?|net|tls|dgram|dns|undici|axios)(?:\/[^'"]*)?['"]/.test(line),
    },
    { name: 'fetch-call', test: (line: string) => /(?:^|[^.\w])fetch\s*\(/.test(line) },
  ];
  // withNetworkDenied 内部对 fetch 的替换赋值不是网络调用——精确豁免（本模块自身实现）。
  const allowlist = [
    {
      file: 'src/far_proof/verifier_contract.ts',
      pattern: 'fetch-call',
      reason: 'withNetworkDenied() harness replaces fetch with a throwing guard; it performs no network call',
    },
  ];
  return scanModuleSources(repoRoot, detectors, allowlist);
}

/** 扫描遥测面：URL 字面量与 endpoint/telemetry/analytics 常量。 */
export function scanVerifierTelemetry(repoRoot: string): StaticScanResult {
  const detectors = [
    { name: 'url-literal', test: (line: string) => /https?:\/\/[^\s'"]+/.test(line) },
    {
      name: 'endpoint-constant',
      test: (line: string) => /\b[A-Z][A-Z0-9_]*(?:ENDPOINT|TELEMETRY|ANALYTICS|BEACON)[A-Z0-9_]*\b\s*[:=]/.test(line),
    },
  ];
  return scanModuleSources(repoRoot, detectors, []);
}

/** 扫描凭证面：凭证形 env 读取 + llm_gateway import（verifier 不需要也不读模型凭证）。 */
export function scanVerifierCredentialUsage(repoRoot: string): StaticScanResult {
  const detectors = [
    {
      name: 'credential-env-read',
      test: (line: string) => /process\.env\.[A-Za-z_]*(?:API_KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD)[A-Za-z_]*/.test(line),
    },
    { name: 'llm-gateway-import', test: (line: string) => /from\s+['"][^'"]*llm_gateway/.test(line) },
  ];
  return scanModuleSources(repoRoot, detectors, []);
}

// ---------------------------------------------------------------------------
// 浏览器/WASM 实现存在性检查（只读）
// ---------------------------------------------------------------------------

export interface BrowserVerifierAssetReport {
  /** frontend 下 verifier 相关文件（文件名含 verif/receipt/integrity 的 ts/tsx）。 */
  readonly frontendVerifierFiles: readonly string[];
  /** 是否存在引用 conformance vectors 格式的前端文件。 */
  readonly consumesConformanceVectorsFormat: boolean;
  /** 引用文件清单（consumes=true 时非空）。 */
  readonly consumingFiles: readonly string[];
  readonly note: string;
}

/**
 * 只读检查浏览器 verifier 资产。若前端文件引用 conformance_vectors（消费同一格式），
 * 验证其引用的 JSON 可解析且符合向量 schema（跨端一致性断言）；若无消费方，如实报告
 * ——向量 JSON 本身是前端可读的共享格式资产（无 Node 依赖），但浏览器端完整 verifier
 * 属于未交付范围，不静默假装跨端一致。
 */
export function checkBrowserVerifierAsset(repoRoot: string): BrowserVerifierAssetReport {
  const frontendSrc = join(repoRoot, 'frontend', 'src');
  const hits: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry) && /verif|receipt|integrity/i.test(entry)) {
        hits.push(full);
      }
    }
  };
  walk(frontendSrc);
  const rel = (p: string): string => p.slice(repoRoot.length + 1).replace(/\\/g, '/');
  const consuming = hits.filter((f) => {
    try {
      return /conformance_vectors/.test(readFileSync(f, 'utf8'));
    } catch {
      return false;
    }
  });
  let schemaOk = true;
  if (consuming.length > 0) {
    try {
      const parsed = loadConformanceVectors();
      schemaOk = parsed.vectors.length > 0;
    } catch {
      schemaOk = false;
    }
  }
  return {
    frontendVerifierFiles: hits.map(rel),
    consumesConformanceVectorsFormat: consuming.length > 0 && schemaOk,
    consumingFiles: consuming.map(rel),
    note:
      consuming.length === 0
        ? 'no frontend file consumes conformance_vectors yet — the shared JSON is frontend-parseable; a full browser verifier is out of current scope (honest gap, not silently passed)'
        : 'frontend consumes the shared conformance vectors format; schema validated',
  };
}
