import { Fragment, useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';

/**
 * R3 (PLAN-reuse-adoption §2「词级 diff」): word-level version compare via jsdiff
 * (BSD-3, npm) instead of two raw <pre> blocks. Rendering contract:
 *  - added text   -> .diff-add  (green tint: it is in the AFTER version)
 *  - removed text -> .diff-del  (red tint, NO strikethrough — removed text is the
 *    content under review, it must stay fully readable)
 *  - unchanged    -> plain text
 *
 * CJK note: diffWordsWithSpace tokenizes on whitespace/word boundaries designed
 * for space-delimited scripts; Chinese/Japanese revisions would diff as long
 * blocks. The planned adaptation is a browser Intl.Segmenter-based tokenizer
 * adapter — deferred until CJK revision content actually appears (recorded in
 * the reuse plan), not speculatively built.
 */
export function DiffText({ before, after }: { before: string; after: string }): JSX.Element {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  return (
    <Fragment>
      {parts.map((part, i) =>
        part.added === true ? (
          <span key={i} className="diff-add">{part.value}</span>
        ) : part.removed === true ? (
          <span key={i} className="diff-del">{part.value}</span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </Fragment>
  );
}
