import { useI18n } from '@/lib/i18n';

export default function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="py-20 text-center" data-testid="about-page">
      <h1 className="text-2xl font-bold">{t('about.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('about.subtitle')}</p>
      <p className="mt-4 text-sm text-muted-foreground">{t('about.tagline')}</p>
    </div>
  );
}
