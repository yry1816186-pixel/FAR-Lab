/**
 * Display-layer ID discipline (HX4b): pipeline prose carries bare machine ids
 * (hyp_…/clm_…). This renderer swaps them for human labels — 假设 №N by
 * tournament rank, 主张 N by evidence order — while keeping the raw id one
 * hover away (title) for audit. Unknown ids stay verbatim (never silently
 * renumbered). The underlying data is untouched; this is presentation only.
 */
const ID_RE = /(hyp_[a-z0-9]+|clm_[a-z0-9]+)/g;

export function InlineIdRefs({
  text,
  hypLabels,
  claimLabels,
}: {
  text: string;
  hypLabels?: Map<string, string>;
  claimLabels?: Map<string, string>;
}): JSX.Element {
  const parts = text.split(ID_RE);
  return (
    <>
      {parts.map((part, i) => {
        // split() with a capturing group yields [text, id, text, id, …];
        // id slots always start with hyp_/clm_ — no stateful regex needed.
        if (!part.startsWith('hyp_') && !part.startsWith('clm_')) return part;
        if (part.startsWith('hyp_')) {
          const label = hypLabels?.get(part);
          return label !== undefined
            ? <span key={i} className="id-ref" title={part}>{label}</span>
            : <span key={i} className="mono id-ref-raw">{part}</span>;
        }
        const label = claimLabels?.get(part);
        return label !== undefined
          ? <span key={i} className="id-ref" title={part}>{label}</span>
          : <span key={i} className="mono id-ref-raw">{part}</span>;
      })}
    </>
  );
}

/** Rank-first labels for hypotheses (№N when ranked; otherwise the short tail). */
export function buildHypLabels(scorecards: { hypothesisId: string; rank: number }[], statements: Map<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of scorecards) {
    if (s.rank === 1) map.set(s.hypothesisId, '№1');
    else map.set(s.hypothesisId, `№${s.rank}`);
  }
  for (const [id, statement] of statements) {
    if (!map.has(id)) map.set(id, statement.length > 18 ? `${statement.slice(0, 18)}…` : statement);
  }
  return map;
}

/** Ordinal labels for claims by evidence order (e.g. 主张 1 / claim 1). */
export function buildClaimLabels(claimIds: string[], prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  claimIds.forEach((id, i) => map.set(id, `${prefix} ${i + 1}`));
  return map;
}
