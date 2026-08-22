/**
 * FAR-Lab JSON repair engine — algorithm EXTRACT of jsonrepair 3.15.0
 * (https://github.com/josdejong/jsonrepair), ISC License, Copyright (c) 2020-2026
 * by Jos de Jong. Rewritten as a zero-dependency TypeScript port of the upstream
 * "regular" recursive-descent variant; algorithm-faithful including its repair
 * heuristics and error behavior (D-044, blueprint research/wave7-reports/jsonrepair.md).
 *
 * Repair philosophy (content preservation): content is never silently REWRITTEN —
 * repairs insert/remove structural characters (quotes, commas, colons, brackets),
 * quote-wrap bare tokens, escape quotes/control characters in place, and normalize a
 * small set of bare literals (undefined→null, Python True/False/None, truncated
 * numbers, HTML entities — all pinned by the upstream suite). A quote that cannot be
 * a structural close (verified by delimiter lookahead, bracket-balance counting and
 * next-quote peeking) is escaped in place — the same legality rule class as the
 * retired repairUnescapedQuotes, strictly stronger. Unrepairable input throws
 * JsonRepairError; callers fail visibly and fall back to the bounded corrective
 * re-ask. Equivalence evidence (two independent oracles): the 83-entry corpus
 * (spikes/output/json-repair-oracle.json) matches byte-for-byte including throw
 * cases, AND the upstream project's own suite (tests/json-repair-upstream.test.ts,
 * retargeted imports only) passes 78/78 against this port.
 */

/** charAt with upstream text[index] semantics: undefined past end (diagnostics parity). */
const charAtOrUndefined = (text: string, index: number): string | undefined =>
  index < text.length ? text.charAt(index) : undefined;

/** Error thrown when the text cannot be repaired into valid JSON. Mirrors the upstream class byte-for-byte: message carries an ` at position N` suffix and no custom name. */
export class JsonRepairError extends Error {
  public readonly position: number;
  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.position = position;
  }
}

const CONTROL_CHARACTERS: Readonly<Record<string, string>> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

const ESCAPE_CHARACTERS: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  // \u is handled separately in parseString()
};

const CODE_SPACE = 0x20;
const CODE_NEWLINE = 0x0a;
const CODE_TAB = 0x09;
const CODE_RETURN = 0x0d;
const CODE_NON_BREAKING_SPACE = 0x00a0;
const CODE_MONGOLIAN_VOWEL_SEPARATOR = 0x180e;
const CODE_EN_QUAD = 0x2000;
const CODE_ZERO_WIDTH_SPACE = 0x200b;
const CODE_NARROW_NO_BREAK_SPACE = 0x202f;
const CODE_MEDIUM_MATHEMATICAL_SPACE = 0x205f;
const CODE_IDEOGRAPHIC_SPACE = 0x3000;
const CODE_ZERO_WIDTH_NO_BREAK_SPACE = 0xfeff;

const isHex = (char: string): boolean => /^[0-9A-Fa-f]$/.test(char);
const isDigit = (char: string): boolean => char >= '0' && char <= '9';
const isValidStringCharacter = (char: string): boolean => char >= ' ';
const isDelimiter = (char: string): boolean => ',:[]/{}()\n+'.includes(char);
const isFunctionNameCharStart = (char: string): boolean =>
  (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === '$';
const isFunctionNameChar = (char: string): boolean =>
  isFunctionNameCharStart(char) || (char >= '0' && char <= '9');
const isUnquotedStringDelimiter = (char: string): boolean => ',[]/{}\n+'.includes(char);
const isStartOfValue = (char: string): boolean => isQuote(char) || /^[[{\w-]$/.test(char);
const isControlCharacter = (char: string): boolean =>
  char === '\n' || char === '\r' || char === '\t' || char === '\b' || char === '\f';

const regexUrlStart = /^(http|https|ftp|mailto|file|data|irc):\/\/$/;
const regexUrlChar = /^[A-Za-z0-9-._~:/?#@!$&'()*+;=]$/;

const isDoubleQuoteLike = (char: string): boolean => char === '"' || char === '\u201c' || char === '\u201d';
const isDoubleQuote = (char: string): boolean => char === '"';
const isSingleQuoteLike = (char: string): boolean => char === "'" || char === '\u2018' || char === '\u2019' || char === '`' || char === '\u00b4';
const isSingleQuote = (char: string): boolean => char === "'";
const isQuote = (char: string): boolean => isDoubleQuoteLike(char) || isSingleQuoteLike(char);

const isWhitespace = (text: string, index: number): boolean => {
  const code = text.charCodeAt(index);
  return code === CODE_SPACE || code === CODE_NEWLINE || code === CODE_TAB || code === CODE_RETURN;
};
const isWhitespaceExceptNewline = (text: string, index: number): boolean => {
  const code = text.charCodeAt(index);
  return code === CODE_SPACE || code === CODE_TAB || code === CODE_RETURN;
};
const isSpecialWhitespace = (text: string, index: number): boolean => {
  const code = text.charCodeAt(index);
  return (
    code === CODE_NON_BREAKING_SPACE ||
    code === CODE_MONGOLIAN_VOWEL_SEPARATOR ||
    (code >= CODE_EN_QUAD && code <= CODE_ZERO_WIDTH_SPACE) ||
    code === CODE_NARROW_NO_BREAK_SPACE ||
    code === CODE_MEDIUM_MATHEMATICAL_SPACE ||
    code === CODE_IDEOGRAPHIC_SPACE ||
    code === CODE_ZERO_WIDTH_NO_BREAK_SPACE
  );
};

const stripLastOccurrence = (text: string, textToStrip: string, stripRemainingText = false): string => {
  const index = text.lastIndexOf(textToStrip);
  return index !== -1 ? text.substring(0, index) + (stripRemainingText ? '' : text.substring(index + 1)) : text;
};
const insertBeforeLastWhitespace = (text: string, textToInsert: string): string => {
  let index = text.length;
  if (!isWhitespace(text, index - 1)) return text + textToInsert;
  while (isWhitespace(text, index - 1)) index -= 1;
  return text.substring(0, index) + textToInsert + text.substring(index);
};
const removeAtIndex = (text: string, start: number, count: number): string =>
  text.substring(0, start) + text.substring(start + count);
const endsWithCommaOrNewline = (text: string): boolean => /[,\n][ \t\r]*$/.test(text);
const countOccurrences = (text: string, char: string): number => {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charAt(i) === char) count += 1;
  return count;
};
/** True when closeChar is a closing bracket with a still-unmatched opener inside text (end of text is inside the brackets). */
const isInsideUnclosedBracket = (text: string, closeChar: string): boolean => {
  switch (closeChar) {
    case ')': return countOccurrences(text, '(') > countOccurrences(text, ')');
    case ']': return countOccurrences(text, '[') > countOccurrences(text, ']');
    case '}': return countOccurrences(text, '{') > countOccurrences(text, '}');
    default: return false;
  }
};

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&apos;': "'",
};
const MAX_HTML_ENTITY_LENGTH = 12;
interface HtmlEntityMatch {
  char: string;
  length: number;
}
const matchHtmlEntity = (fragment: string): HtmlEntityMatch | null => {
  if (fragment.charAt(0) !== '&') return null;
  const semicolon = fragment.indexOf(';');
  if (semicolon === -1) return null;
  const entity = fragment.substring(0, semicolon + 1);
  const named = NAMED_HTML_ENTITIES[entity];
  if (named !== undefined) return { char: named, length: entity.length };
  if (fragment.charAt(1) === '#') {
    const body = fragment.substring(2, semicolon);
    const hex = body.charAt(0) === 'x' || body.charAt(0) === 'X';
    const digits = hex ? body.substring(1) : body;
    if (digits.length > 0) {
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isNaN(code) && code >= 0 && code <= 0x10ffff) {
        return { char: String.fromCodePoint(code), length: entity.length };
      }
    }
  }
  return null;
};
const isDoubleQuoteEntity = (match: HtmlEntityMatch | null): boolean => match !== null && match.char === '"';
const isSingleQuoteEntity = (match: HtmlEntityMatch | null): boolean => match !== null && match.char === "'";

/**
 * Repair a text containing an invalid JSON document into valid JSON text.
 * Throws JsonRepairError when the text cannot be repaired.
 */
export const repairJson = (input: string): string => {
  const text = input;
  let i = 0;
  let output = '';

  parseMarkdownCodeBlock(['```', '[```', '{```']);
  const processed = parseValue();
  if (!processed) {
    throw new JsonRepairError('Unexpected end of json string', text.length);
  }
  parseMarkdownCodeBlock(['```', '```]', '```}']);
  const processedComma = parseCharacter(',');
  if (processedComma) {
    parseWhitespaceAndSkipComments();
  }
  if (isStartOfValue(text.charAt(i)) && endsWithCommaOrNewline(output)) {
    // start of a new value after the root value: newline delimited JSON -> array
    if (!processedComma) {
      output = insertBeforeLastWhitespace(output, ',');
    }
    parseNewlineDelimitedJSON();
  } else if (processedComma) {
    output = stripLastOccurrence(output, ',');
  }

  // repair redundant end quotes
  while (text.charAt(i) === '}' || text.charAt(i) === ']') {
    i += 1;
    parseWhitespaceAndSkipComments();
  }
  if (i >= text.length) {
    return output;
  }
  throw new JsonRepairError(`Unexpected character ${JSON.stringify(charAtOrUndefined(text, i))}`, i);

  function parseValue(): boolean {
    parseWhitespaceAndSkipComments();
    const processed =
      parseObject() || parseArray() || parseString() || parseNumber() ||
      parseKeywords() || parseUnquotedString(false) || parseRegex();
    parseWhitespaceAndSkipComments();
    return processed;
  }

  function parseWhitespaceAndSkipComments(skipNewline = true): boolean {
    const start = i;
    parseWhitespace(skipNewline);
    let changed = parseComment();
    while (changed) {
      changed = parseWhitespace(skipNewline);
      if (changed) changed = parseComment();
    }
    return i > start;
  }

  function parseWhitespace(skipNewline: boolean): boolean {
    const isWs = skipNewline ? isWhitespace : isWhitespaceExceptNewline;
    let whitespace = '';
    for (;;) {
      if (isWs(text, i)) {
        whitespace += text.charAt(i);
        i += 1;
      } else if (isSpecialWhitespace(text, i)) {
        whitespace += ' '; // repair special whitespace
        i += 1;
      } else {
        break;
      }
    }
    if (whitespace.length > 0) {
      output += whitespace;
      return true;
    }
    return false;
  }

  function parseComment(): boolean {
    if (text.charAt(i) === '/' && text.charAt(i + 1) === '*') {
      // repair block comment by skipping it
      while (i < text.length && !atEndOfBlockComment(i)) i += 1;
      i += 2;
      return true;
    }
    if (text.charAt(i) === '/' && text.charAt(i + 1) === '/') {
      // repair line comment by skipping it
      while (i < text.length && text.charAt(i) !== '\n') i += 1;
      return true;
    }
    return false;
  }

  function parseMarkdownCodeBlock(blocks: readonly string[]): boolean {
    if (skipMarkdownCodeBlock(blocks)) {
      if (isFunctionNameCharStart(text.charAt(i))) {
        // strip the optional language specifier like "json"
        while (i < text.length && isFunctionNameChar(text.charAt(i))) i += 1;
      }
      parseWhitespaceAndSkipComments();
      return true;
    }
    return false;
  }

  function skipMarkdownCodeBlock(blocks: readonly string[]): boolean {
    parseWhitespace(true); // upstream: fences may carry leading whitespace (upstream regular :171)
    for (const block of blocks) {
      const end = i + block.length;
      if (text.substring(i, end) === block) {
        i = end;
        return true;
      }
    }
    return false;
  }

  function parseCharacter(char: string): boolean {
    if (text.charAt(i) === char) {
      output += text.charAt(i);
      i += 1;
      return true;
    }
    return false;
  }

  function skipCharacter(char: string): boolean {
    if (text.charAt(i) === char) {
      i += 1;
      return true;
    }
    return false;
  }

  function skipEscapeCharacter(): boolean {
    return skipCharacter('\\');
  }

  function skipEllipsis(): boolean {
    parseWhitespaceAndSkipComments();
    if (text.charAt(i) === '.' && text.charAt(i + 1) === '.' && text.charAt(i + 2) === '.') {
      // repair: remove the ellipsis (three dots) and optionally a comma
      i += 3;
      parseWhitespaceAndSkipComments();
      skipCharacter(',');
      return true;
    }
    return false;
  }

  function parseObject(): boolean {
    if (text.charAt(i) === '{') {
      output += '{';
      i += 1;
      parseWhitespaceAndSkipComments();

      if (skipCharacter(',')) {
        parseWhitespaceAndSkipComments(); // repair: skip leading comma like in {, message: "hi"}
      }
      let initial = true;
      while (i < text.length && text.charAt(i) !== '}') {
        if (!initial) {
          const processedComma = parseCharacter(',');
          if (!processedComma) {
            output = insertBeforeLastWhitespace(output, ','); // repair missing comma
          }
          parseWhitespaceAndSkipComments();
        }
        skipEllipsis();
        const processedKey = parseString() || parseUnquotedString(true);
        if (!processedKey) {
          if (text.charAt(i) === '}' || text.charAt(i) === '{' || text.charAt(i) === ']' || text.charAt(i) === '[' || i >= text.length) {
            if (!initial) {
              output = stripLastOccurrence(output, ','); // repair trailing comma
            }
          } else {
            throw new JsonRepairError('Object key expected', i);
          }
          break;
        }
        parseWhitespaceAndSkipComments();
        const colon = parseCharacter(':');
        const truncatedText = i >= text.length;
        if (!colon) {
          if (isStartOfValue(text.charAt(i)) || truncatedText) {
            output = insertBeforeLastWhitespace(output, ':'); // repair missing colon
          } else {
            throw new JsonRepairError('Colon expected', i);
          }
        }
        const processedValue = parseValue();
        if (!processedValue) {
          if (colon || truncatedText) {
            output += 'null'; // repair missing object value
          } else {
            throw new JsonRepairError('Colon expected', i);
          }
        }
        initial = false;
      }
      if (text.charAt(i) === '}') {
        output += '}';
        i += 1;
      } else {
        output = insertBeforeLastWhitespace(output, '}'); // repair missing end bracket
      }
      return true;
    }
    return false;
  }

  function parseArray(): boolean {
    if (text.charAt(i) === '[') {
      output += '[';
      i += 1;
      parseWhitespaceAndSkipComments();

      if (skipCharacter(',')) {
        parseWhitespaceAndSkipComments(); // repair: skip leading comma like in [,1,2,3]
      }
      let initial = true;
      while (i < text.length && text.charAt(i) !== ']') {
        if (!initial) {
          const processedComma = parseCharacter(',');
          if (!processedComma) {
            output = insertBeforeLastWhitespace(output, ','); // repair missing comma
          }
        }
        skipEllipsis();
        const processedValue = parseValue();
        if (!processedValue) {
          if (!initial) {
            output = stripLastOccurrence(output, ','); // repair trailing comma
          }
          break;
        }
        initial = false;
      }
      if (text.charAt(i) === ']') {
        output += ']';
        i += 1;
      } else {
        output = insertBeforeLastWhitespace(output, ']'); // repair missing closing bracket
      }
      return true;
    }
    return false;
  }

  function parseNewlineDelimitedJSON(): void {
    let initial = true;
    let processedValue = true;
    while (processedValue) {
      if (!initial) {
        const processedComma = parseCharacter(',');
        if (!processedComma) {
          output = insertBeforeLastWhitespace(output, ','); // repair: add missing comma
        }
      } else {
        initial = false;
      }
      processedValue = parseValue();
    }
    if (!processedValue) {
      output = stripLastOccurrence(output, ','); // repair: remove trailing comma
    }
    output = `[\n${output}\n]`; // repair: wrap the output inside array brackets
  }

  function htmlEntityWindow(at: number): string {
    return at < i + MAX_HTML_ENTITY_LENGTH ? text.substring(at, i + MAX_HTML_ENTITY_LENGTH) : '';
  }

  function parseString(stopAtDelimiter = false, stopAtIndex = -1, depth = 0): boolean {
    // Recursion guard (WP2): each retry re-entry can itself hit the retry conditions
    // again; a future grammar change could chain retries unboundedly on crafted input.
    // Same discipline as zodToStrictJsonSchema's depth cap. (2026-08-22 probing found no
    // currently-craftable divergent input — this is defense-in-depth, not a live fix.)
    if (depth > 20) {
      throw new JsonRepairError('String parsing depth exceeded', i);
    }
    const skipEscapeChars = text.charAt(i) === '\\';
    if (skipEscapeChars) {
      i += 1; // repair: remove the first escape character
      if (!isQuote(text.charAt(i))) {
        throw new JsonRepairError(`Unexpected character ${JSON.stringify(charAtOrUndefined(text, i))}`, i);
      }
    }

    const openEntity = text.charAt(i) === '&' ? matchHtmlEntity(htmlEntityWindow(i)) : null;
    const openedByEntity = isDoubleQuoteEntity(openEntity) || isSingleQuoteEntity(openEntity);
    if (isQuote(text.charAt(i)) || openedByEntity) {
      const isEndQuote = isDoubleQuote(text.charAt(i))
        ? isDoubleQuote
        : isSingleQuote(text.charAt(i))
          ? isSingleQuote
          : isSingleQuoteLike(text.charAt(i))
            ? isSingleQuoteLike
            : isDoubleQuoteLike;
      const iBefore = i;
      const oBefore = output.length;
      let str = '"';
      i += openedByEntity && openEntity ? openEntity.length : 1;
      for (;;) {
        if (i >= text.length) {
          const iPrev = prevNonWhitespaceIndex(i - 1);
          if (!stopAtDelimiter && isDelimiter(text.charAt(iPrev))) {
            // the text ends with a delimiter like ["hello, — the missing end quote
            // belongs right before it: retry stopping at the first next delimiter
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(true, -1, depth + 1);
          }
          str = insertBeforeLastWhitespace(str, '"'); // repair missing quote
          output += str;
          return true;
        }
        if (i === stopAtIndex) {
          str = insertBeforeLastWhitespace(str, '"'); // repair missing quote at the stop index from iteration one
          output += str;
          return true;
        }

        const entity = openedByEntity && text.charAt(i) === '&' ? matchHtmlEntity(htmlEntityWindow(i)) : null;
        const isEnd = entity && openEntity ? entity.char === openEntity.char : isEndQuote(text.charAt(i));
        if (isEnd) {
          // candidate end quote — verify against what is before and after it
          const iQuote = i;
          const oQuote = str.length;
          str += '"';
          i += entity ? entity.length : 1;
          output += str;
          parseWhitespaceAndSkipComments(false);
          if (
            stopAtDelimiter || i >= text.length ||
            (isDelimiter(text.charAt(i)) && !isInsideUnclosedBracket(str, text.charAt(i))) ||
            (isQuote(text.charAt(i)) && !nextQuoteIsEndQuote(i)) ||
            isDigit(text.charAt(i))
          ) {
            // the quote is followed by end of text, a delimiter, or a next value: it is the real end
            parseConcatenatedString();
            return true;
          }
          if (text.charAt(i) === '\\') {
            throw new JsonRepairError(`Unexpected character ${JSON.stringify(charAtOrUndefined(text, i))}`, i);
          }
          const iPrevChar = prevNonWhitespaceIndex(iQuote - 1);
          const prevChar = text.charAt(iPrevChar);
          if (prevChar === ',') {
            // '{"a":"b,c,"d":"e"}': the end quote should have been right before the comma
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(false, iPrevChar, depth + 1);
          }
          if (isDelimiter(prevChar)) {
            // not the right end quote (preceded by a delimiter, not followed by one):
            // an end quote is missing — re-parse stopping at the first next delimiter
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(true, -1, depth + 1);
          }

          // revert to right after the quote and continue parsing the string
          output = output.substring(0, oBefore);
          i = iQuote + (entity ? entity.length : 1);
          str = `${str.substring(0, oQuote)}\\${str.substring(oQuote)}`; // repair unescaped quote
        } else if (stopAtDelimiter && isUnquotedStringDelimiter(text.charAt(i))) {
          // end-quote-missing mode: stop the string at the first delimiter
          if (text.charAt(i - 1) === ':' && regexUrlStart.test(text.substring(iBefore + 1, i + 2))) {
            while (i < text.length && regexUrlChar.test(text.charAt(i))) {
              str += text.charAt(i); // url like "https://..." — keep the slashes
              i += 1;
            }
          }
          str = insertBeforeLastWhitespace(str, '"'); // repair missing quote
          output += str;
          parseConcatenatedString();
          return true;
        } else if (entity) {
          // decode an HTML entity inside the string as content
          const char = entity.char;
          if (char === '"') {
            str += '\\"'; // repair unescaped double quote
          } else if (isControlCharacter(char)) {
            str += CONTROL_CHARACTERS[char] ?? char;
          } else {
            str += char;
          }
          i += entity.length;
        } else if (text.charAt(i) === '\\') {
          const char = text.charAt(i + 1);
          const escapeChar = ESCAPE_CHARACTERS[char];
          if (escapeChar !== undefined) {
            str += text.substring(i, i + 2);
            i += 2;
          } else if (char === 'u') {
            let j = 2;
            while (j < 6 && isHex(text.charAt(i + j))) j += 1;
            if (j === 6) {
              str += text.substring(i, i + 6);
              i += 6;
            } else if (i + j >= text.length) {
              // repair invalid or truncated unicode char at the end of the text
              i = text.length;
            } else {
              throw new JsonRepairError(`Invalid unicode character "${text.substring(i, i + 6)}"`, i);
            }
          } else if (char === '\n') {
            str += '\\n'; // repair a backslash escaped newline (like in Bash)
            i += 2;
          } else {
            str += char; // repair invalid escape character: remove it
            i += 2;
          }
        } else {
          const char = text.charAt(i);
          if (char === '"' && text.charAt(i - 1) !== '\\') {
            str += `\\${char}`; // repair unescaped double quote
            i += 1;
          } else if (isControlCharacter(char)) {
            str += CONTROL_CHARACTERS[char] ?? char; // unescaped control character
            i += 1;
          } else {
            if (!isValidStringCharacter(char)) {
              throw new JsonRepairError(`Invalid character ${JSON.stringify(char)}`, i);
            }
            str += char;
            i += 1;
          }
        }
        if (skipEscapeChars) {
          skipEscapeCharacter(); // repair: skipped escape character (nothing to do)
        }
      }
    }
    return false;
  }

  function parseConcatenatedString(): boolean {
    let parsed = false;
    parseWhitespaceAndSkipComments();
    while (text.charAt(i) === '+') {
      parsed = true;
      i += 1;
      parseWhitespaceAndSkipComments();

      output = stripLastOccurrence(output, '"', true); // repair: remove the end quote of the first string
      const start = output.length;
      const parsedStr = parseString();
      if (parsedStr) {
        output = removeAtIndex(output, start, 1); // repair: remove the start quote of the second string
      } else {
        output = insertBeforeLastWhitespace(output, '"'); // repair: remove the + because it is not followed by a string
      }
    }
    return parsed;
  }

  function parseNumber(): boolean {
    const start = i;
    let num = '';
    let invalid = false;
    if (text.charAt(i) === '-') {
      num += text.charAt(i);
      i += 1;
      if (!isDigit(text.charAt(i)) && atEndOfNumber()) {
        num += '0'; // repair missing zero after minus like in "-.2" or "-"
      }
    }
    if (text.charAt(i) === '0' && isDigit(text.charAt(i + 1))) {
      invalid = true; // leading zeros like "00123" — kept as a string to preserve content
    }
    while (isDigit(text.charAt(i))) {
      num += text.charAt(i);
      i += 1;
    }
    if (text.charAt(i) === '.') {
      if (num === '' || num === '-') {
        num += '0'; // repair missing leading zero before dot
      }
      num += text.charAt(i);
      i += 1;
      if (!isDigit(text.charAt(i))) {
        num += '0'; // repair a truncated number like "2." into "2.0"
      }
      while (isDigit(text.charAt(i))) {
        num += text.charAt(i);
        i += 1;
      }
    }
    if (i > start) {
      if (text.charAt(i) === 'e' || text.charAt(i) === 'E') {
        if (num === '-') {
          invalid = true;
        }
        num += text.charAt(i);
        i += 1;
        if (text.charAt(i) === '-' || text.charAt(i) === '+') {
          num += text.charAt(i);
          i += 1;
        }
        if (!isDigit(text.charAt(i))) {
          num += '0'; // repair a truncated number like "2e" into "2e0"
        }
        while (isDigit(text.charAt(i))) {
          num += text.charAt(i);
          i += 1;
        }
      }
      if (!atEndOfNumber()) {
        i = start; // not at the end of the number — let another type parse it (e.g. "1.2.3" as string)
        return false;
      }
      output += invalid ? `"${text.substring(start, i)}"` : num;
      return true;
    }
    return false;
  }

  function parseKeywords(): boolean {
    return (
      parseKeyword('true', 'true') || parseKeyword('false', 'false') || parseKeyword('null', 'null') ||
      parseKeyword('True', 'true') || parseKeyword('False', 'false') || parseKeyword('None', 'null') // repair Python keywords
    );
  }

  function parseKeyword(name: string, value: string): boolean {
    if (text.substring(i, i + name.length) === name && !isFunctionNameChar(text.charAt(i + name.length))) {
      output += value;
      i += name.length;
      return true;
    }
    return false;
  }

  function parseUnquotedString(isKey: boolean): boolean {
    const start = i;
    if (isFunctionNameCharStart(text.charAt(i))) {
      while (i < text.length && isFunctionNameChar(text.charAt(i))) i += 1;
      let j = i;
      while (isWhitespace(text, j)) j += 1;
      if (text.charAt(j) === '(') {
        // repair a MongoDB function call like NumberLong("2")
        // repair a JSONP function call like callback({...});
        i = j + 1;
        parseValue();
        if (text.charAt(i) === ')') {
          i += 1; // repair: skip close bracket of function call
          if (text.charAt(i) === ';') {
            i += 1; // repair: skip semicolon after JSONP call
          }
        }
        return true;
      }
    }
    while (i < text.length && !isUnquotedStringDelimiter(text.charAt(i)) && !isQuote(text.charAt(i)) && (!isKey || text.charAt(i) !== ':')) {
      i += 1;
    }
    if (text.charAt(i - 1) === ':' && regexUrlStart.test(text.substring(start, i + 2))) {
      while (i < text.length && regexUrlChar.test(text.charAt(i))) i += 1; // url like https://...
    }
    if (i > start) {
      // repair unquoted string; also repair undefined into null.
      // first go back to prevent trailing whitespaces in the string
      while (isWhitespace(text, i - 1) && i > 0) i -= 1;
      const symbol = text.substring(start, i);
      output += symbol === 'undefined' ? 'null' : JSON.stringify(symbol);
      if (text.charAt(i) === '"') {
        i += 1; // missing start quote, but the end quote is right here — skip it
      }
      return true;
    }
    return false;
  }

  function parseRegex(): boolean {
    if (text.charAt(i) === '/') {
      const start = i;
      i += 1;
      while (i < text.length && (text.charAt(i) !== '/' || text.charAt(i - 1) === '\\')) i += 1;
      i += 1;
      output += JSON.stringify(text.substring(start, i));
      return true;
    }
    return false;
  }

  function prevNonWhitespaceIndex(start: number): number {
    let prev = start;
    while (prev > 0 && isWhitespace(text, prev)) prev -= 1;
    return prev;
  }

  function nextQuoteIsEndQuote(index: number): boolean {
    // precondition: text[index] is a quote. Peek past it: if nothing meaningful
    // follows, that quote is the true end and this one is embedded (e.g. "The TV is 72"")
    let next = index + 1;
    while (next < text.length && isWhitespace(text, next)) next += 1;
    return next >= text.length || isDelimiter(text.charAt(next));
  }

  function atEndOfNumber(): boolean {
    return i >= text.length || isDelimiter(text.charAt(i)) || isWhitespace(text, i);
  }

  function atEndOfBlockComment(index: number): boolean {
    return text.charAt(index) === '*' && text.charAt(index + 1) === '/';
  }
};
