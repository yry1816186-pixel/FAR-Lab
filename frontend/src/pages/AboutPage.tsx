/**
 * AboutPage — project identity, trust boundary, pillars, stack, honesty.
 *
 * Replaces the former placeholder (title/subtitle/tagline only) with substantive
 * content that reflects FAR-Chain's real identity: a falsifiability-anchored
 * research-agent harness with a strict LLM-vs-deterministic-kernel trust boundary.
 *
 * Pillars are inlined in English (consistent with nav labels and OverviewPage);
 * prose sections (mission / trust / stack / honesty) are i18n-driven (zh + en).
 */

import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, Eye, Repeat, ShieldAlert, Server, Cpu } from 'lucide-react';

const PILLARS = [
  {
    title: 'Falsifiable',
    subtitle: 'testable claims',
    description:
      'Every scientific assertion can be refuted, downgraded, or marked as untested.',
    icon: ShieldCheck,
  },
  {
    title: 'Tamper-Evident',
    subtitle: 'hash-chain verified',
    description:
      'An append-only hash chain + Merkle root means any tampering is detectable by recomputation (tamper-detectable, not physically immutable).',
    icon: Eye,
  },
  {
    title: 'Independently Re-computable',
    subtitle: 'verify it yourself',
    description:
      'Reviewers can recompute the proof head / verdict trace on their own machine; a failed recompute yields a structured diff.',
    icon: Repeat,
  },
] as const;

export default function AboutPage() {
  const { t } = useI18n();
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
          {PILLARS.map((p) => (
            <Card key={p.title} data-testid={`about-pillar-${p.title.toLowerCase()}`}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">{p.title}</CardTitle>
                </div>
                <CardDescription>{p.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.description}</p>
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
