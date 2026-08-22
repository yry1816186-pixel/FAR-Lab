import { tokenizeCsvLine, type ParsedCsv } from './csv.js';

/**
 * Minimal ARFF reader for OpenML downloads (E2). Supports the dense subset: comments,
 * @relation/@attribute/@data, quoted nominal values; '?' (missing) passes through as its
 * own categorical level. Sparse ARFF ({idx val,...}) and multiline-quoted values are
 * rejected with explicit errors rather than half-parsed.
 */
export const parseArff = (text: string, opts: { maxRows?: number } = {}): ParsedCsv => {
  const maxRows = opts.maxRows ?? 500_000;
  const header: string[] = [];
  const rows: string[][] = [];
  let inData = false;
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('%')) continue;
    if (!inData) {
      const lower = line.toLowerCase();
      if (lower.startsWith('@attribute')) {
        const rest = line.slice('@attribute'.length).trim();
        let name: string;
        if (rest.startsWith("'") || rest.startsWith('"')) {
          const quote = rest.charAt(0);
          const end = rest.indexOf(quote, 1);
          if (end < 0) throw new Error('arff: unterminated attribute name');
          name = rest.slice(1, end);
        } else {
          const m = /^\S+/.exec(rest);
          if (m === null) throw new Error('arff: attribute without a name');
          name = m[0];
        }
        if (header.includes(name)) throw new Error(`arff: duplicate attribute name '${name}'`);
        header.push(name);
        continue;
      }
      if (lower.startsWith('@data')) { inData = true; continue; }
      if (lower.startsWith('@relation')) continue;
      throw new Error(`arff: unsupported directive '${line.slice(0, 40)}'`);
    } else {
      if (line.startsWith('{')) throw new Error('arff: sparse format not supported');
      const fields = tokenizeCsvLine(line).map((v) => {
        let out = v;
        if (out.startsWith("'") && out.endsWith("'") && out.length >= 2) out = out.slice(1, -1);
        return out;
      });
      if (header.length === 0) throw new Error('arff: @data before any @attribute');
      if (fields.length !== header.length) {
        throw new Error(`arff data row has ${fields.length} fields, header has ${header.length}`);
      }
      rows.push(fields);
      if (rows.length > maxRows) throw new Error(`arff exceeds maxRows=${maxRows}`);
    }
  }
  if (!inData) throw new Error('arff: no @data section');
  if (rows.length === 0) throw new Error('arff: @data section has no rows');
  return { header, rows };
};
