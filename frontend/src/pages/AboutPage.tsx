/**
 * AboutPage — project identity, trust boundary, pillars, stack, honesty.
 *
 * Replaces the former placeholder (title/subtitle/tagline only) with substantive
 * content that reflects FAR-Lab's real identity: a falsifiability-anchored
 * research-agent harness with a strict LLM-vs-deterministic-kernel trust boundary.
 *
 * Fully i18n-driven (R-08): all user-visible text resolves through the `t()`
 * hook; pillar definitions carry only the icon + locale-independent testId
 * slug + message keys, so zh/en stay in sync via the typed catalogue.
 */

import { useT, type MessageKey } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, Eye, Repeat, ShieldAlert, Server, Cpu } from 'lucide-react';

// `slug` is locale-independent so the data-testid stays stable across zh/en
// (tests assert on the `about-pillar-` prefix only, not the trailing slug).
const PILLAR_DEFS: readonly {
  readonly icon: typeof ShieldCheck;
  readonly slug: string;
  readonly titleKey: MessageKey;
  readonly subtitleKey: MessageKey;
  readonly descKey: MessageKey;
}[] = [
  {
    icon: ShieldCheck,
    slug: 'falsifiable',
    titleKey: 'about.pillar1.title',
    subtitleKey: 'about.pillar1.subtitle',
    descKey: 'about.pillar1.desc',
  },
  {
    icon: Eye,
    slug: 'tamper-evident',
    titleKey: 'about.pillar2.title',
    subtitleKey: 'about.pillar2.subtitle',
    descKey: 'about.pillar2.desc',
  },
  {
    icon: Repeat,
    slug: 'recomputable',
    titleKey: 'about.pillar3.title',
    subtitleKey: 'about.pillar3.subtitle',
    descKey: 'about.pillar3.desc',
  },
];

export default function AboutPage() {
  const t = useT();
  return (
    <div className="space-y-10" data-testid="about-page">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('about.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('about.subtitle')}</p>
        <p className="mt-3 inline-block rounded-full border px-4 py-1 text-sm font-medium">
          {t('about.tagline')}
        </p>
      </header>

      {/* Mission */}
      <section data-testid="about-mission">
        <p className="mx-auto max-w-2xl text-center text-base leading-relaxed text-muted-foreground">
          {t('about.mission')}
        </p>
      </section>

      {/* Three pillars */}
      <section aria-labelledby="about-pillars-heading">
        <h2 id="about-pillars-heading" className="mb-4 text-center text-xl font-semibold">
          {t('about.pillarsTitle')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLAR_DEFS.map((p) => (
            <Card key={p.slug} data-testid={`about-pillar-${p.slug}`}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">{t(p.titleKey)}</CardTitle>
                </div>
                <CardDescription>{t(p.subtitleKey)}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t(p.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Trust boundary */}
      <section data-testid="about-trust">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              {t('about.trustBoundaryTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('about.trustBoundaryBody')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Stack */}
      <section data-testid="about-stack">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" aria-hidden="true" />
              {t('about.stackTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('about.stackBody')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Honesty statement */}
      <Alert data-testid="about-honesty">
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4" aria-hidden="true" />
          {t('about.honestyTitle')}
        </AlertTitle>
        <AlertDescription>{t('about.honestyBody')}</AlertDescription>
      </Alert>
    </div>
  );
}
