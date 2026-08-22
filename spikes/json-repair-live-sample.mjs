import { readFileSync } from 'node:fs';
// Legacy scan (same algorithm as src/providers/http.ts repairUnescapedQuotes)
const repairUnescapedQuotes = (raw) => {
  let out = '';
  let inString = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charAt(i);
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '\\') { out += ch + raw.charAt(i + 1); i += 1; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw.charAt(j))) j += 1;
      const next = j < raw.length ? raw.charAt(j) : undefined;
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') { inString = false; out += ch; }
      else out += '\\"';
      continue;
    }
    if (ch.charCodeAt(0) < 0x20) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
};
const captured = JSON.parse(readFileSync(new URL('./output/strict-fc-corrupted-args.json', import.meta.url), 'utf8'));
const argsFull = captured.argsFull;
try {
  const out = repairUnescapedQuotes(argsFull);
  JSON.parse(out);
  console.log('LEGACY SCAN: repairs full sample OK');
} catch (e) {
  console.log('LEGACY SCAN THROWS:', e.message);
  const m = /position (\d+)/.exec(e.message ?? '');
  if (m) { const p = Number(m[1]); console.log('at', p, JSON.stringify(argsFull.slice(Math.max(0, p - 70), p + 40))); }
}
// What does the head look like? The corrupted-args doc structure
console.log('head:', JSON.stringify(argsFull.slice(0, 200)));
