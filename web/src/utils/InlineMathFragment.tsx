import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

/**
 * Heavy KaTeX boundary for WithMath. Kept in its own dynamic module so normal
 * prose never loads the renderer; parse failures remain visible as literal
 * source instead of disappearing or rendering unsafe trusted extensions.
 */
export default function InlineMathFragment({ math }: { math: string }): JSX.Element {
  return (
    <InlineMath
      math={math}
      renderError={(error) => (
        <span className="math-fallback mono" title={error.message}>{`$${math}$`}</span>
      )}
    />
  );
}
