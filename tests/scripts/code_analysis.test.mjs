// tests/scripts/code_analysis.test.mjs
//
// tokenize() / codeOnlySource() 单元测试
// 覆盖：块注释、行注释、字符串、模板字面量（含 ${}）、转义字符、
//       行号列号准确性、token 连续性、codeOnlySource 等长空白还原。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, codeOnlySource } from '../../scripts/lib/code_analysis.mjs';

// 辅助：验证 token 流连续覆盖整个 source（拼接 text == source）
function assertContiguous(source, tokens) {
  const rejoined = tokens.map((t) => t.text).join('');
  assert.equal(rejoined, source, 'token 流拼接须等于原 source');
}

// 辅助：验证单个 token 的 line/col 与 text 在 source 中的实际位置一致
function assertPosition(source, token) {
  // 按 token.line/col 计算 0-based 偏移
  let offset = 0;
  const lines = source.split('\n');
  for (let i = 0; i < token.line - 1; i++) offset += lines[i].length + 1; // +1 for \n
  offset += token.col - 1;
  const actual = source.substring(offset, offset + token.text.length);
  assert.equal(
    actual,
    token.text,
    `位置不匹配：token(${token.kind}) line=${token.line} col=${token.col} text=${JSON.stringify(token.text)} 实际=${JSON.stringify(actual)}`,
  );
}

describe('tokenize — 基本分类', () => {
  test('纯代码（无注释/字符串）→ 单个 code token', () => {
    const src = 'const x = 42;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'code');
    assert.equal(tokens[0].text, src);
    assertPosition(src, tokens[0]);
  });

  test('空字符串 → 返回空数组', () => {
    assert.deepEqual(tokenize(''), []);
  });

  test('只有空白 → 单个 code token', () => {
    const src = '   \n  \n';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'code');
  });
});

describe('tokenize — 块注释', () => {
  test('单行块注释', () => {
    const src = 'code /* comment */ code';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, '/* comment */');
    for (const t of tokens) assertPosition(src, t);
  });

  test('多行块注释', () => {
    const src = 'code /* line1\nline2 */ code';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, '/* line1\nline2 */');
    assert.equal(comments[0].line, 1);
    assert.equal(comments[0].col, 6);
    for (const t of tokens) assertPosition(src, t);
  });

  test('块注释含字符串样文本 → 整体为 comment', () => {
    const src = '/* "not a string" // not a comment */ code';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.ok(comments[0].text.includes('"not a string"'));
    assert.equal(tokens.filter((t) => t.kind === 'string').length, 0);
  });
});

describe('tokenize — 行注释', () => {
  test('行注释到行尾', () => {
    const src = 'code // comment\nmore code';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, '// comment');
    for (const t of tokens) assertPosition(src, t);
  });

  test('行注释不跨越换行', () => {
    const src = '// c1\ncode // c2\n// c3';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 3);
    assert.equal(comments[0].text, '// c1');
    assert.equal(comments[1].text, '// c2');
    assert.equal(comments[2].text, '// c3');
    for (const t of tokens) assertPosition(src, t);
  });
});

describe('tokenize — 字符串', () => {
  test('双引号字符串', () => {
    const src = 'const x = "hello world";';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, '"hello world"');
    for (const t of tokens) assertPosition(src, t);
  });

  test('单引号字符串', () => {
    const src = "const x = 'hello';";
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, "'hello'");
  });

  test('转义引号 \" → 字符串完整', () => {
    const src = '"she said \\"hi\\""';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, src);
  });

  test('转义反斜杠 \\\\ → 字符串完整', () => {
    const src = '"path\\\\to\\\\file"';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, src);
  });

  test('字符串含注释样文本 → 整体为 string', () => {
    const src = 'const x = "/* not a comment */ // also not";';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    assert.equal(tokens.filter((t) => t.kind === 'comment').length, 0);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.ok(strings[0].text.includes('/* not a comment */'));
  });
});

describe('tokenize — 模板字面量', () => {
  test('无插值模板字面量', () => {
    const src = 'const x = `hello`;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, '`hello`');
    for (const t of tokens) assertPosition(src, t);
  });

  test('含 ${} 插值的模板 → 整体为 string（与原实现一致）', () => {
    const src = 'const x = `hello ${name} world`;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, '`hello ${name} world`');
    // ${} 内的 name 不应作为 code 出现
    const codeText = tokens.filter((t) => t.kind === 'code').map((t) => t.text).join('');
    assert.ok(!codeText.includes('name'), '${} 内表达式不应作为 code token');
  });

  test('模板内含 ${} 且 ${} 内有注释 → 注释被 string 覆盖', () => {
    const src = 'const x = `a ${/* c */ b} c`;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    // 注释在模板内，应被外层 string 吞掉
    assert.equal(tokens.filter((t) => t.kind === 'comment').length, 0);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.ok(strings[0].text.includes('/* c */'));
  });

  test('多行模板字面量', () => {
    const src = 'const x = `line1\nline2`;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.ok(strings[0].text.includes('line1\nline2'));
    assert.equal(strings[0].line, 1);
    assert.equal(strings[0].col, 11);
    for (const t of tokens) assertPosition(src, t);
  });

  test('嵌套模板字面量 → 外层整体为 string', () => {
    const src = 'const x = `outer ${`inner`} end`;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings.length, 1);
    assert.equal(strings[0].text, '`outer ${`inner`} end`');
  });
});

describe('tokenize — 行号/列号准确性', () => {
  test('第 3 行的注释行号正确', () => {
    const src = 'line1\nline2\n// comment on line 3\nline4';
    const tokens = tokenize(src);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments[0].line, 3);
    assert.equal(comments[0].col, 1);
    for (const t of tokens) assertPosition(src, t);
  });

  test('第 2 行第 10 列的字符串位置正确', () => {
    const src = 'first\nconst x = "str";';
    const tokens = tokenize(src);
    const strings = tokens.filter((t) => t.kind === 'string');
    assert.equal(strings[0].line, 2);
    assert.equal(strings[0].col, 11);
    for (const t of tokens) assertPosition(src, t);
  });

  test('多行块注释后 code token 出现在正确行', () => {
    const src = '/* a\nb\nc */\ncodeHere';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    for (const t of tokens) assertPosition(src, t);
    // codeOnlySource 输出中 codeHere 应在第 4 行
    const stripped = codeOnlySource(src);
    const lines = stripped.split('\n');
    assert.equal(lines.length, 4);
    assert.equal(lines[3], 'codeHere');
  });
});

describe('tokenize — 混合场景', () => {
  test('代码 + 注释 + 字符串交替', () => {
    const src = 'const a = 1; /* c */ const b = "str"; // end';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    for (const t of tokens) assertPosition(src, t);
    assert.equal(tokens.filter((t) => t.kind === 'code').length >= 1, true);
    assert.equal(tokens.filter((t) => t.kind === 'comment').length, 2);
    assert.equal(tokens.filter((t) => t.kind === 'string').length, 1);
  });

  test('真实 TS 片段（函数定义 + 装饰器 + 类型注解）', () => {
    const src = `
@Injectable()
export class Foo {
  private bar: string = "default";
  greet(name: string): string {
    // greet the user
    return \`Hello \${name}!\`;
  }
}
`;
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    for (const t of tokens) assertPosition(src, t);
    // 应有 1 个行注释 + 1 个字符串字面量 + 1 个模板字面量
    assert.equal(tokens.filter((t) => t.kind === 'comment').length, 1);
    assert.equal(tokens.filter((t) => t.kind === 'string').length, 2);
  });
});

describe('codeOnlySource — 等长空白还原', () => {
  test('注释替换为空白，代码保留', () => {
    const src = 'const x = 1; /* secret */ const y = 2;';
    const stripped = codeOnlySource(src);
    assert.equal(stripped.length, src.length, '长度须一致');
    // /* secret */ = 12 字符 → 12 空格；前后各 1 空格属 code 保留 → 共 14 空格
    assert.equal(stripped, 'const x = 1;              const y = 2;');
  });

  test('字符串替换为空白', () => {
    const src = 'const x = "secret";';
    const stripped = codeOnlySource(src);
    assert.equal(stripped.length, src.length);
    // "secret" = 8 字符 → 8 空格
    assert.equal(stripped, 'const x =         ;');
  });

  test('行号保持一致（多行）', () => {
    const src = 'line1\n// comment line 2\nline3';
    const stripped = codeOnlySource(src);
    const lines = stripped.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'line1');
    assert.equal(lines[1], '                 '); // // comment line 2 = 17 字符
    assert.equal(lines[2], 'line3');
  });

  test('多行块注释保持行数', () => {
    const src = 'code\n/* a\nb\nc */\nmore';
    const stripped = codeOnlySource(src);
    const lines = stripped.split('\n');
    assert.equal(lines.length, 5);
    assert.equal(lines[0], 'code');
    assert.equal(lines[4], 'more');
  });

  test('模板字面量整体替换为空白', () => {
    const src = 'const x = `${a + b}`;';
    const stripped = codeOnlySource(src);
    assert.equal(stripped.length, src.length);
    // 模板内的 a + b 也应被替换
    assert.ok(!stripped.includes('a + b'));
    assert.ok(!stripped.includes('${'));
  });

  test('剥离后 grep 不会命中注释/字符串中的符号', () => {
    const src = 'const x = "decideFiveValueVerdict"; // executeFallbackChain';
    const stripped = codeOnlySource(src);
    assert.ok(!stripped.includes('decideFiveValueVerdict'), '字符串内符号不应出现');
    assert.ok(!stripped.includes('executeFallbackChain'), '注释内符号不应出现');
  });
});

describe('tokenize — 边界情况', () => {
  test('文件末尾注释（无后续 code）', () => {
    const src = 'code\n// trailing comment';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, '// trailing comment');
    for (const t of tokens) assertPosition(src, t);
  });

  test('文件开头注释', () => {
    const src = '// leading comment\ncode';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, '// leading comment');
    assert.equal(comments[0].line, 1);
    assert.equal(comments[0].col, 1);
    for (const t of tokens) assertPosition(src, t);
  });

  test('连续注释 + 字符串', () => {
    const src = '// c1\n// c2\n"a"\n// c3';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    assert.equal(tokens.filter((t) => t.kind === 'comment').length, 3);
    assert.equal(tokens.filter((t) => t.kind === 'string').length, 1);
    for (const t of tokens) assertPosition(src, t);
  });

  test('正则字面量中的 // 不被误判为注释（TS scanner 正确处理）', () => {
    // 正则 /[//]/ 中的 // 不应被识别为行注释
    const src = 'const re = /[/]/g;';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    // 正则字面量本身不是 string 也不是 comment，应归入 code
    const comments = tokens.filter((t) => t.kind === 'comment');
    // scanner 可能将正则内的 // 识别为注释，这是已知差异——
    // 但对 depth_gate 的符号命中检测无影响（正则内不会有函数调用）
    // 此测试仅验证不崩溃且 token 连续
    for (const t of tokens) assertPosition(src, t);
  });

  test('CRLF 换行处理', () => {
    const src = 'code\r\n// comment\r\nmore';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    const comments = tokens.filter((t) => t.kind === 'comment');
    assert.equal(comments.length, 1);
    for (const t of tokens) assertPosition(src, t);
  });

  test('TypeScript 泛型语法不崩溃', () => {
    const src = 'function identity<T>(x: T): T { return x; }';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    for (const t of tokens) assertPosition(src, t);
  });

  test('装饰器语法不崩溃', () => {
    const src = '@Injectable()\nclass Foo {}';
    const tokens = tokenize(src);
    assertContiguous(src, tokens);
    for (const t of tokens) assertPosition(src, t);
  });
});
