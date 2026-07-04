// scripts/lib/code_analysis.mjs
//
// 代码/注释/字符串分离器（基于 TypeScript Compiler API）。
//
// 替代 scripts/depth_gate.mjs 原手写状态机 tokenize()（R1+R2+R6）。
// 原实现逐字符扫描约 135 行，边界情况易出错且无独立测试；现改用 TypeScript
// 官方解析器，自动处理转义、模板字面量 ${}、装饰器、JSX/TSX 等语法，
// 可靠性与可维护性显著提升。
//
// 接口契约（与原 tokenize 一致，depth_gate.mjs 无需改动调用方）：
//   tokenize(source) → [{ text, kind: 'code'|'comment'|'string', line, col }]
//   codeOnlySource(source) → string（注释/字符串替换为等长空白，保留行号）

import ts from 'typescript';

// 返回 token 数组，每个 token = { text, kind: 'code'|'comment'|'string', line, col }。
// token 连续覆盖整个 source（无间隙），line/col 为 1-based。
// 「kind === 'code'」的 token 才参与符号命中判定。
export function tokenize(source) {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    source,
    ts.ScriptTarget.Latest,
    true,  // setParentNodes
    ts.ScriptKind.TS,
  );

  const ranges = [];

  // 1. 从 AST 收集字符串/模板字面量范围
  //    TemplateExpression 覆盖整个 `...${...}...`（含 ${} 内表达式），
  //    与原实现「模板整体当 string」语义一致。
  function visit(node) {
    if (
      node.kind === ts.SyntaxKind.StringLiteral ||
      node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      node.kind === ts.SyntaxKind.TemplateExpression
    ) {
      ranges.push({ start: node.getStart(sourceFile), end: node.getEnd(), kind: 'string' });
      return;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);

  // 2. 用 scanner 收集全部注释范围（scanner 是 TS 官方词法器，权威处理 /* */ // ）
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,  // skipTrivia = false → 发射注释 trivia token
    ts.LanguageVariant.Standard,
    source,
  );
  while (true) {
    const tokenKind = scanner.scan();
    if (tokenKind === ts.SyntaxKind.EndOfFileToken) break;
    if (
      tokenKind === ts.SyntaxKind.SingleLineCommentTrivia ||
      tokenKind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      ranges.push({
        start: scanner.getTokenStart(),
        end: scanner.getTokenEnd(),
        kind: 'comment',
      });
    }
  }

  // 3. 按起始位置排序；同位置时范围大的在前（字符串优先于内部注释）
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  // 4. 剔除嵌套范围（如模板 ${} 内的注释已被外层 string 覆盖）
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) continue;
    merged.push(r);
  }

  // 5. 构建连续 token 流：range 之间的间隙为 code
  const tokens = [];
  let pos = 0;
  const pushToken = (start, end, kind) => {
    const text = source.substring(start, end);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    tokens.push({ text, kind, line: line + 1, col: character + 1 });
  };
  for (const r of merged) {
    if (r.start > pos) pushToken(pos, r.start, 'code');
    pushToken(r.start, r.end, r.kind);
    pos = r.end;
  }
  if (pos < source.length) pushToken(pos, source.length, 'code');

  return tokens;
}

// 把 tokens 里 kind=code 的文本拼回「等效源码」（保留 \n 以维持行号），
// 注释/字符串替换为等长空白，使行号与原文件一致。
export function codeOnlySource(source) {
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
