/**
 * features/about/AboutPage — what FAR-Lab is, how it works, and — most
 * importantly — what it cannot prove. The limits list is normative honesty,
 * not marketing footnote.
 */

import { useT } from '@/shared/i18n/index.tsx';
import { PageHeader } from '@/shared/ui/JsonBlock.tsx';
import { Section } from '@/shared/ui/StateBlock.tsx';

const LIMIT_KEYS = ['about.limits.1', 'about.limits.2', 'about.limits.3', 'about.limits.4'] as const;

export default function AboutPage() {
  const t = useT();
  return (
    <div data-testid="about-page" className="max-w-3xl">
      <PageHeader title={t('about.title')} />

      <Section title={t('about.what.title')}>
        <p className="text-sm leading-relaxed text-ink2">{t('about.what.body')}</p>
      </Section>

      <Section title={t('about.how.title')}>
        <p className="text-sm leading-relaxed text-ink2">{t('about.how.body')}</p>
      </Section>

      <Section title={t('about.limits.title')}>
        <ul className="list-disc space-y-2 rounded border border-warn/50 bg-warn/5 px-4 py-3 pl-9 text-sm text-ink2" data-testid="about-limits">
          {LIMIT_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('about.cli.title')}>
        <p className="text-sm leading-relaxed text-ink2">{t('about.cli.body')}</p>
        <p className="mt-2 rounded border border-border bg-surface2 px-3 py-2 font-mono text-xs text-ink">
          far demo · far research · far verify · far export · far bench · far api
        </p>
      </Section>
    </div>
  );
}
