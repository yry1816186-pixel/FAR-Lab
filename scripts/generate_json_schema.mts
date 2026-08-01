/**
 * generate_json_schema.mts — IC-12:四类核心 JSON Schema 由 TS 类型机器生成(SSOT 单一源 · ADR-013)。
 *
 * 生成对象(合同 contract-012):
 *   1. schema/json/fec.schema.json             ← src/fec/fec_contract.ts FecContractV2
 *   2. schema/json/proof-envelope.schema.json  ← src/proof_envelope/types.ts ProofEnvelope
 *   3. schema/json/verdict.schema.json         ← src/schema/enums.ts VERDICTS
 *   4. schema/json/data-manifest.schema.json   ← src/far_proof/exporter.ts DataManifest
 *
 * 机制:TypeScript compiler API 语法树直读(不引第三方生成器包,零新增依赖):
 *   - interface → object(properties/required/additionalProperties:false,内联展开);
 *   - 字面量联合 → enum;`(typeof CONST)[number]` → const 数组 enum;
 *   - readonly X[]/X[] → array;X | null → anyOf[..., {type:'null'}];? → 非 required。
 *   未覆盖的构造 fail-closed 抛错(禁止静默产出错误 schema)。
 *
 * 用法:
 *   node scripts/generate_json_schema.mts           生成/覆盖 schema/json/*.json(确定性,无时间戳)
 *   node scripts/generate_json_schema.mts --check   漂移检查:重算并与盘上字节比对,drift → exit 1(FF-14)
 *   node scripts/generate_json_schema.mts --dir <d> 指定输出/检查目录(测试用)
 *
 * 零容忍合规:无 any / @ts-ignore / 空 catch / 双重断言。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

interface SchemaEntry {
  readonly file: string;
  readonly title: string;
  readonly source: string;
  readonly kind: 'interface' | 'const-array';
  readonly name: string;
}

const ENTRIES: readonly SchemaEntry[] = [
  { file: 'fec.schema.json', title: 'FAR-Lab Falsification Contract (FEC) V2', source: 'src/fec/fec_contract.ts#FecContractV2', kind: 'interface', name: 'FecContractV2' },
  { file: 'proof-envelope.schema.json', title: 'FAR-Lab ProofEnvelope', source: 'src/proof_envelope/types.ts#ProofEnvelope', kind: 'interface', name: 'ProofEnvelope' },
  { file: 'verdict.schema.json', title: 'FAR-Lab Five-Value Verdict', source: 'src/schema/enums.ts#VERDICTS', kind: 'const-array', name: 'VERDICTS' },
  { file: 'data-manifest.schema.json', title: 'FAR-Lab .far-proof data_manifest', source: 'src/far_proof/exporter.ts#DataManifest', kind: 'interface', name: 'DataManifest' },
];

type JsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 语法树索引
// ---------------------------------------------------------------------------

interface TypeIndex {
  readonly interfaces: Map<string, ts.InterfaceDeclaration>;
  readonly typeAliases: Map<string, ts.TypeNode>;
  readonly constArrays: Map<string, readonly string[]>;
  // DEBT-11 guard：被 >1 个源文件声明的同名类型集合；生成期解析到此类名字时 fail-closed 抛错，
  // 防止 buildIndex 的 last-wins 静默覆盖把错误源的形状写进 schema（历史 bug：fec_contract.ts
  // ThresholdSpec 被 falsifiability/types.ts 同名 ThresholdSpec 覆盖 → fec.schema.json threshold 形状错误）。
  readonly ambiguousNames: ReadonlySet<string>;
}

/** 记录每个顶层类型名的声明来源文件（DEBT-11 collision-guard 原始数据）。 */
function recordOrigin(map: Map<string, Set<string>>, name: string, file: string): void {
  let origins = map.get(name);
  if (origins === undefined) {
    origins = new Set<string>();
    map.set(name, origins);
  }
  origins.add(file);
}

/** 生成期断言：被解析的类型名无跨文件同名冲突，否则 fail-closed（DEBT-11）。 */
export function assertUnambiguous(index: TypeIndex, name: string): void {
  if (index.ambiguousNames.has(name)) {
    throw new Error(
      `ambiguous type reference '${name}' is declared in multiple source files in the indexed closure — ` +
        `silent schema-override risk (DEBT-11 guard). Rename one declaration to a unique name, then rerun generate_json_schema.mts.`,
    );
  }
}

export function buildIndex(root: string, entries: readonly SchemaEntry[] = ENTRIES): TypeIndex {
  const interfaces = new Map<string, ts.InterfaceDeclaration>();
  const typeAliases = new Map<string, ts.TypeNode>();
  const constArrays = new Map<string, readonly string[]>();
  const nameOrigins = new Map<string, Set<string>>();
  // 入口文件 + import 闭包自动纳入 program(避免全 src 扫描)
  const entryFiles = [...new Set(entries.map((e) => join(root, e.source.split('#')[0] ?? '')))];
  const program = ts.createProgram(entryFiles, { allowJs: false, noEmit: true, types: [] });
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const relFile = sf.fileName.replace(/\\/g, '/');
    if (!relFile.includes('/src/')) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node)) {
        recordOrigin(nameOrigins, node.name.text, relFile);
        interfaces.set(node.name.text, node);
      } else if (ts.isTypeAliasDeclaration(node)) {
        recordOrigin(nameOrigins, node.name.text, relFile);
        typeAliases.set(node.name.text, node.type);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
            const values = extractConstStringArray(decl.initializer);
            if (values !== null) {
              recordOrigin(nameOrigins, decl.name.text, relFile);
              constArrays.set(decl.name.text, values);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const ambiguousNames = new Set<string>();
  for (const [name, files] of nameOrigins) {
    if (files.size > 1) ambiguousNames.add(name);
  }
  return { interfaces, typeAliases, constArrays, ambiguousNames };
}

function extractConstStringArray(init: ts.Expression): readonly string[] | null {
  let expr: ts.Expression = init;
  if (ts.isAsExpression(expr)) expr = expr.expression;
  if (!ts.isArrayLiteralExpression(expr)) return null;
  const values: string[] = [];
  for (const el of expr.elements) {
    if (!ts.isStringLiteral(el)) return null;
    values.push(el.text);
  }
  return values;
}

// ---------------------------------------------------------------------------
// TypeNode → JSON Schema(fail-closed:未覆盖构造抛错)
// ---------------------------------------------------------------------------

function convertTypeNode(node: ts.TypeNode, index: TypeIndex, inProgress: ReadonlySet<string>): JsonSchema {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword: return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword: return { type: 'boolean' };
    case ts.SyntaxKind.UnknownKeyword: return {};
    default: break;
  }
  if (ts.isLiteralTypeNode(node)) {
    const lit = node.literal;
    if (ts.isStringLiteral(lit)) return { const: lit.text };
    if (ts.isNumericLiteral(lit)) return { const: Number(lit.text) };
    if (lit.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
    if (lit.kind === ts.SyntaxKind.TrueKeyword) return { const: true };
    if (lit.kind === ts.SyntaxKind.FalseKeyword) return { const: false };
    throw new Error(`unsupported literal kind ${lit.kind}`);
  }
  if (ts.isParenthesizedTypeNode(node)) return convertTypeNode(node.type, index, inProgress);
  if (ts.isTypeOperatorNode(node)) return convertTypeNode(node.type, index, inProgress); // readonly 等
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: convertTypeNode(node.elementType, index, inProgress) };
  if (ts.isTypeLiteralNode(node)) return convertMembers(node.members, index, inProgress); // 内联对象字面量类型
  if (ts.isUnionTypeNode(node)) return convertUnion(node, index, inProgress);
  if (ts.isIndexedAccessTypeNode(node)) return convertIndexedAccess(node, index);
  if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName)
      ? node.typeName.text
      : node.typeName.right.text;
    if (name === 'Array') {
      const arg = node.typeArguments?.[0];
      if (arg === undefined) throw new Error('Array<T> missing type argument');
      return { type: 'array', items: convertTypeNode(arg, index, inProgress) };
    }
    if (name === 'Record') {
      const valueArg = node.typeArguments?.[1];
      return { type: 'object', additionalProperties: valueArg === undefined ? true : convertTypeNode(valueArg, index, inProgress) };
    }
    const alias = index.typeAliases.get(name);
    if (alias !== undefined) {
      assertUnambiguous(index, name);
      return convertTypeNode(alias, index, inProgress);
    }
    const iface = index.interfaces.get(name);
    if (iface !== undefined) {
      assertUnambiguous(index, name);
      return convertInterface(name, iface, index, inProgress);
    }
    throw new Error(`unresolvable type reference '${name}'`);
  }
  throw new Error(`unsupported type node kind ${node.kind} — fail-closed,扩展转换器或改类型`);
}

function convertUnion(node: ts.UnionTypeNode, index: TypeIndex, inProgress: ReadonlySet<string>): JsonSchema {
  const parts = node.types.map((t) => convertTypeNode(t, index, inProgress));
  const allConst = parts.every((p) => 'const' in p);
  if (allConst) return { enum: parts.map((p) => p.const) };
  return { anyOf: parts };
}

function convertIndexedAccess(node: ts.IndexedAccessTypeNode, index: TypeIndex): JsonSchema {
  // (typeof CONST)[number] → const 数组 enum(indexType 为 number 关键字;objectType 可含括号)
  let objectType: ts.TypeNode = node.objectType;
  while (ts.isParenthesizedTypeNode(objectType)) objectType = objectType.type;
  if (
    ts.isTypeQueryNode(objectType) &&
    ts.isIdentifier(objectType.exprName) &&
    node.indexType.kind === ts.SyntaxKind.NumberKeyword
  ) {
    const values = index.constArrays.get(objectType.exprName.text);
    if (values === undefined) throw new Error(`const array '${objectType.exprName.text}' not found`);
    return { enum: [...values] };
  }
  throw new Error(`unsupported indexed access kind(fail-closed)`);
}

function convertMembers(
  members: ts.NodeArray<ts.TypeElement>,
  index: TypeIndex,
  inProgress: ReadonlySet<string>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member) || member.type === undefined) {
      throw new Error(`unsupported member kind ${member.kind}(fail-closed)`);
    }
    const propName = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
      ? member.name.text
      : (() => { throw new Error('unsupported property name kind(fail-closed)'); })();
    properties[propName] = convertTypeNode(member.type, index, inProgress);
    if (member.questionToken === undefined) required.push(propName);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

function convertInterface(
  name: string,
  decl: ts.InterfaceDeclaration,
  index: TypeIndex,
  inProgress: ReadonlySet<string>,
): JsonSchema {
  if (inProgress.has(name)) throw new Error(`cyclic interface reference: ${name}`);
  if (decl.heritageClauses !== undefined && decl.heritageClauses.length > 0) {
    throw new Error(`interface heritage not supported: ${name}(fail-closed)`);
  }
  const next = new Set(inProgress);
  next.add(name);
  return convertMembers(decl.members, index, next);
}

// ---------------------------------------------------------------------------
// 生成与检查
// ---------------------------------------------------------------------------

function generateEntry(entry: SchemaEntry, index: TypeIndex): string {
  let body: JsonSchema;
  if (entry.kind === 'interface') {
    const decl = index.interfaces.get(entry.name);
    if (decl === undefined) throw new Error(`interface ${entry.name} not found in program`);
    body = convertInterface(entry.name, decl, index, new Set());
  } else {
    const values = index.constArrays.get(entry.name);
    if (values === undefined) throw new Error(`const array ${entry.name} not found in program`);
    body = { enum: [...values] };
  }
  const doc: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://farlab.dev/schema/json/${entry.file}`,
    title: entry.title,
    'x-generated-by': 'scripts/generate_json_schema.mts(IC-12 · ADR-013 · 机器产物,禁手改)',
    'x-source': entry.source,
    ...body,
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

function main(): number {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dirIdx = args.indexOf('--dir');
  const outDir = dirIdx !== -1 ? args[dirIdx + 1] : join(process.cwd(), 'schema', 'json');
  if (outDir === undefined) throw new Error('--dir requires a value');

  const index = buildIndex(process.cwd());
  let drift = 0;
  for (const entry of ENTRIES) {
    const content = generateEntry(entry, index);
    const target = join(outDir, entry.file);
    if (check) {
      if (!existsSync(target)) {
        console.log(`[DRIFT] ${entry.file}: missing on disk`);
        drift += 1;
        continue;
      }
      const onDisk = readFileSync(target, 'utf8');
      if (onDisk === content) {
        console.log(`[OK] ${entry.file}`);
      } else {
        console.log(`[DRIFT] ${entry.file}: on-disk content differs from TS types(重跑 node scripts/generate_json_schema.mts)`);
        drift += 1;
      }
    } else {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(target, content, 'utf8');
      console.log(`[GEN] ${target}`);
    }
  }
  if (check) {
    console.log(drift === 0 ? `schema-drift: OK (${ENTRIES.length}/${ENTRIES.length})` : `schema-drift: DRIFT (${drift}/${ENTRIES.length})`);
    return drift === 0 ? 0 : 1;
  }
  return 0;
}

// 仅在直接执行时运行 main（被 import 时不运行，便于单测 buildIndex/assertUnambiguous）。
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  process.exit(main());
}
