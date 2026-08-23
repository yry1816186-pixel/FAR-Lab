import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '../../i18n/LanguageContext';

/**
 * Rendered markdown for research deliverables (HX5): the paper skeleton and
 * the verification report are markdown today, and pipeline prose carries bare
 * hyp_/clm_ ids. Before rendering, ids are swapped for the same human labels
 * used across the workbench (假设 №N / 主张 N); the downloaded file keeps the
 * raw ids, so the audit path stays intact. An outline (sticky) is derived
 * from the headings for IMRaD-length documents.
 */
const ID_RE = /\b(hyp_[a-z0-9]+|clm_[a-z0-9]+)\b/g;

interface OutlineEntry { id: string; level: 2 | 3; text: string }

export function MarkdownDoc({
  markdown,
  hypLabels,
  claimLabels,
  withOutline = true,
}: {
  markdown: string;
  hypLabels?: Map<string, string>;
  claimLabels?: Map<string, string>;
  withOutline?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const { doc, outline } = useMemo(() => {
    let text = markdown;
    if (hypLabels !== undefined || claimLabels !== undefined) {
      text = text.replace(ID_RE, (id) => {
        if (id.startsWith('hyp_')) return hypLabels?.get(id) ?? id;
        return claimLabels?.get(id) ?? id;
      });
    }
    const entries: OutlineEntry[] = [];
    text.split('\n').forEach((line) => {
      const m = /^(#{2,3})\s+(.+)$/.exec(line.trim());
      if (m === null || m[1] === undefined || m[2] === undefined) return;
      const heading = m[2].replace(/[*`]/g, '').trim();
      entries.push({ id: slug(heading), level: m[1].length === 2 ? 2 : 3, text: heading });
    });
    return { doc: text, outline: entries };
  }, [markdown, hypLabels, claimLabels]);

  return (
    <div className="doc-render">
      {withOutline && outline.length > 1 && (
        <nav className="doc-outline" aria-label={t('doc.outlineLabel')}>
          {outline.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`doc-outline-item doc-outline-item--${o.level === 2 ? 'h2' : 'h3'}`}
              onClick={() => {
                // scrollIntoView, NOT a hash anchor — the app's hash router owns
                // location.hash and would treat #doc-… as an unknown route.
                document.getElementById(o.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {o.text.length > 44 ? `${o.text.slice(0, 44)}…` : o.text}
            </button>
          ))}
        </nav>
      )}
      <div className="doc-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="doc-h1">{children}</h1>,
            h2: ({ children }) => <h2 className="doc-h2" id={slug(flatText(children))}>{children}</h2>,
            h3: ({ children }) => <h3 className="doc-h3" id={slug(flatText(children))}>{children}</h3>,
            blockquote: ({ children }) => <blockquote className="doc-quote">{children}</blockquote>,
            table: ({ children }) => <div className="table-scroll"><table className="data-table">{children}</table></div>,
          }}
        >
          {doc}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Extract plain text from React children for slug computation (display only). */
function flatText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flatText).join('');
  return '';
}

/** Anchor slug for headings (same page only — no routing impact). */
function slug(text: string): string {
  return `doc-${text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 48)}`;
}
