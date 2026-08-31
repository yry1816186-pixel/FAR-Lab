import { lazy, Suspense, useMemo } from 'react';

// Hypothesis cards are on a deep research surface, and most statements contain
// no TeX at all. Keep KaTeX (runtime + fonts + CSS) out of the cold shell and
// request it only after the deterministic splitter finds a real math segment.
const InlineMathFragment = lazy(() => import('./InlineMathFragment'));

/**
 * R3 (PLAN-reuse-adoption §2「LaTeX 公式」): render `$...$` inline-math fragments
 * in domain text (hypothesis statements/mechanisms) with KaTeX via react-katex
 * v3.1.0. v1 scope: single-dollar INLINE math only — `$$...$$` display blocks
 * are a recorded follow-up (the splitter below degrades them to literal text
 * plus their inner expression, never a silent wrong render).
 *
 * Hardening note (CVE-2025-23207 class, KaTeX trust surface): react-katex v3
 * forwards only displayMode/errorColor/throwOnError to katex.renderToString,
 * so `trust`/`strict` cannot be passed as props through this library. The
 * secure behavior still holds — katex's `trust` defaults to FALSE (extension
 * commands like \\includegraphics/\\url are opt-in only, which is exactly the
 * CVE's attack surface), and parse errors are contained here via renderError
 * (react-katex sets throwOnError:true and hands ParseError to us), which is
 * strictly more visible than throwOnError:false's inline red error text.
 * Pinned katex 0.16.47 = patched line, deduped with react-katex's own range.
 */
export function WithMath({ text }: { text: string }): JSX.Element {
  const parts = useMemo(() => splitInlineMath(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.math ? (
          <Suspense
            key={i}
            fallback={<span className="math-fallback mono">{`$${part.value}$`}</span>}
          >
            <InlineMathFragment math={part.value} />
          </Suspense>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

interface MathPart {
  math: boolean;
  value: string;
}

/**
 * Split text into plain / inline-math segments on `$...$` pairs.
 * - An unterminated `$` stays literal text (never swallows the rest of a line).
 * - An empty pair `$$` yields a literal `$` (display-math v1 degradation).
 * - A math segment must be non-empty; surrounding whitespace stays in the
 *   expression only when inside the delimiters (matching KaTeX's own
 *   `$...$` inline parsing conventions).
 */
function splitInlineMath(text: string): MathPart[] {
  const out: MathPart[] = [];
  let rest = text;
  for (;;) {
    const start = rest.indexOf('$');
    if (start === -1) {
      if (rest.length > 0) out.push({ math: false, value: rest });
      return out;
    }
    if (start > 0) out.push({ math: false, value: rest.slice(0, start) });
    const end = rest.indexOf('$', start + 1);
    if (end === -1) {
      // no closing delimiter: the lone '$' is literal (e.g. prose about money)
      out.push({ math: false, value: rest.slice(start) });
      return out;
    }
    const expr = rest.slice(start + 1, end);
    if (expr.length === 0) {
      // '$$' — display math is out of v1 scope; emit a literal '$' and rescan
      // (the second '$' may open a real inline segment, e.g. "$$x$ and $y$")
      out.push({ math: false, value: '$' });
      rest = rest.slice(start + 1);
      continue;
    }
    out.push({ math: true, value: expr });
    rest = rest.slice(end + 1);
  }
}
