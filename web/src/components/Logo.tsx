/**
 * FAR-Lab mark: the four epistemic glyphs (verified / refuted / unknown /
 * caution) in a 2×2 quadrant — the product's own evidence semantics as the
 * brand signature (craft-spec-v2 §8, PX-C6 "signature = abstraction of the
 * product's own semantics"). Colors come from the verified palette tokens so
 * the mark follows the theme; it is the ONE place saturated colors appear
 * outside evidence content, because the mark IS the evidence language.
 */
export function LogoMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="FAR-Lab"
      className="logo-mark"
    >
      <rect x="1" y="1" width="17" height="17" rx="3.5" className="logo-cell logo-cell--verified" />
      <rect x="22" y="1" width="17" height="17" rx="3.5" className="logo-cell logo-cell--refuted" />
      <rect x="1" y="22" width="17" height="17" rx="3.5" className="logo-cell logo-cell--unknown" />
      <rect x="22" y="22" width="17" height="17" rx="3.5" className="logo-cell logo-cell--caution" />
      <text x="9.5" y="14.5" textAnchor="middle" className="logo-glyph logo-glyph--verified">✓</text>
      <text x="30.5" y="14.5" textAnchor="middle" className="logo-glyph logo-glyph--refuted">✗</text>
      <text x="9.5" y="35.5" textAnchor="middle" className="logo-glyph logo-glyph--unknown">▲</text>
      <text x="30.5" y="35.5" textAnchor="middle" className="logo-glyph logo-glyph--caution">—</text>
    </svg>
  );
}

export function LogoFull({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <span className="logo-full">
      <LogoMark size={size} />
      <span className="logo-word">FAR-Lab</span>
    </span>
  );
}
