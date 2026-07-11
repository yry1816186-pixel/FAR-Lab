// scripts/dead_code_scan.mjs
//
// 死代码扫描脚本（Phase 4.3 SubTask 4.3.2）·精确版
// 复用 scripts/lib/code_analysis.mjs 的 codeOnlySource（TypeScript Compiler API）。
//
// 判定逻辑（精确版）：
//   对每个 export 名，扫所有文件（src/ + tests/ + scripts/）的 codeOnlySource（注释/字符串已剥），
//   统计该名字出现的次数，排除：
//     - 定义行自身（export function X / export const X / ...）
//     - import 语句行（import { X } / import X from）
//     - re-export 语句行（export { X } / export * from）
//   如果剩余出现次数 = 0，则该 export 无任何引用 = 死导出。
//
//   同文件内引用（如 `type StageId = (typeof STAGE_ORDER)[number]` 引用同文件 const STAGE_ORDER）
//   会被捕获——因为 StageId 定义行不是 STAGE_ORDER 的定义行，也不是 import/export 行。
//
// 性能：预先把所有文件 codeOnlySource 拼成大字符串 + 行映射，然后对每个 export 做一次 regex。
// 不阻断 CI（仅扫描输出 JSON）。

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnlySource } from './lib/code_analysis.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = __dirname.replace(/[\\/]scripts$/, '');

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

const srcFiles = walk('src').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).map(normalize);
const testFiles = walk('tests').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).map(normalize);
const scriptFiles = walk('scripts').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).map(normalize);
const allScanFiles = [...srcFiles, ...testFiles, ...scriptFiles];

// ===== Pass 1: 收集 export 声明 =====
const exports = []; // { name, file, line, kind, isType, isDefault, defLineText }
const exportRe = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|enum|abstract\s+class|interface|type)\s+([A-Za-z_$][\w$]*)/;

for (const rel of srcFiles) {
  const raw = readCode(rel);
  const code = codeOnlySource(raw);
  const lines = code.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(exportRe);
    if (m) {
      const keyword = line.match(/^export\s+(?:default\s+)?(?:async\s+)?(function|const|class|enum|abstract\s+class|interface|type)\b/);
      const kind = keyword ? keyword[1] : 'unknown';
      const isType = kind === 'interface' || kind === 'type';
      const isDefault = /^export\s+default\b/.test(line);
      exports.push({ name: m[1], file: rel, line: i + 1, kind, isType, isDefault, defLineText: line });
    }
  }
}

// ===== Pass 2: 对每个 export 名，扫所有文件统计引用 =====
// 预先把所有文件 codeOnlySource 读出来，按文件存
const fileCodes = new Map(); // rel → { code, lines }
for (const rel of allScanFiles) {
  const code = codeOnlySource(readCode(rel));
  fileCodes.set(rel, { code, lines: code.split(/\r?\n/) });
}

// 判定一行是否是 import / re-export 语句（这些行的引用不算"使用"）
function isImportOrReExportLine(line) {
  return /^\s*import\s/.test(line) || /^\s*export\s+[\{\*]/.test(line);
}

// 判定一行是否是某 symbol 的定义行（export function X / export const X / function X / const X / class X / interface X / type X）
function isDefinitionLine(line, symbol) {
  // export 定义
  const defRe = new RegExp(`^export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class|enum|abstract\\s+class|interface|type)\\s+${symbol}\\b`);
  if (defRe.test(line.trim())) return true;
  // 非 export 定义（function X / const X）——可能被同文件其他 export 引用
  const localDefRe = new RegExp(`^(?:async\\s+)?(?:function|const|let|class|enum|abstract\\s+class|interface|type)\\s+${symbol}\\b`);
  if (localDefRe.test(line.trim())) return true;
  return false;
}

const deadExports = [];
const aliveExports = [];

for (const exp of exports) {
  const sym = exp.name;
  const symRe = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  let refCount = 0;
  const refLocations = [];

  for (const [rel, { lines }] of fileCodes) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 排除定义行（自身）
      if (rel === exp.file && i + 1 === exp.line) continue;
      // 排除 import / re-export 行
      if (isImportOrReExportLine(line)) continue;
      // 排除同文件内其他定义行（function X / const X / class X / interface X / type X）
      if (isDefinitionLine(line, sym)) continue;

      // 统计该 symbol 在此行的出现次数
      let count = 0;
      let m;
      symRe.lastIndex = 0;
      while ((m = symRe.exec(line)) !== null) {
        count++;
      }
      if (count > 0) {
        refCount += count;
        if (refLocations.length < 3) {
          refLocations.push({ file: rel, line: i + 1, count });
        }
      }
    }
  }

  if (refCount === 0) {
    deadExports.push({
      ...exp,
      reason: '全仓零引用（src/ + tests/ + scripts/ 内无 import / CallExpression / 类型注解 / 标识符引用，排除定义行 + import/export 行）',
    });
  } else {
    aliveExports.push({
      ...exp,
      refCount,
      sampleRefs: refLocations,
    });
  }
}

// 输出
const result = {
  totalExports: exports.length,
  deadCount: deadExports.length,
  aliveCount: aliveExports.length,
  dead: deadExports.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
};
console.log(JSON.stringify(result, null, 2));
