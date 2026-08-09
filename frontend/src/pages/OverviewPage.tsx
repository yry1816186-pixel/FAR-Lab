import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useHealth, useReceiptList } from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import {
  Activity,
  Sparkles,
  ScrollText,
  Network,
  ShieldCheck,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import type { V2StoredReceipt } from '@/lib/types';

// ---------- Quick entry cards ----------
//
// 工作台首屏的"快速入口":把用户最常用的 4 条路径前置为可点卡片,
// 让研究者一进来就能开始一个验证任务,而不是先读"三大支柱"介绍。
//
// titleKey/descKey are i18n keys looked up in render (constants can't call hooks).

const QUICK_ENTRIES: readonly {
  readonly to: string;
  readonly titleKey: 'overview.quick.wizard.title' | 'overview.quick.v2receipt.title' | 'overview.quick.viz.title' | 'overview.quick.integrity.title';
  readonly descKey: 'overview.quick.wizard.desc' | 'overview.quick.v2receipt.desc' | 'overview.quick.viz.desc' | 'overview.quick.integrity.desc';
  readonly icon: typeof Sparkles;
  readonly testId: string;
}[] = [
  { to: '/wizard', titleKey: 'overview.quick.wizard.title', descKey: 'overview.quick.wizard.desc', icon: Sparkles, testId: 'quick-wizard' },
  { to: '/v2-receipt', titleKey: 'overview.quick.v2receipt.title', descKey: 'overview.quick.v2receipt.desc', icon: ScrollText, testId: 'quick-v2receipt' },
  { to: '/viz', titleKey: 'overview.quick.viz.title', descKey: 'overview.quick.viz.desc', icon: Network, testId: 'quick-viz' },
  { to: '/integrity', titleKey: 'overview.quick.integrity.title', descKey: 'overview.quick.integrity.desc', icon: ShieldCheck, testId: 'quick-integrity' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  CONFIRMED: 'success', REFUTED: 'destructive', INCONCLUSIVE: 'warning', DEGRADED_SCOPE: 'secondary', UNTESTED: 'outline',
};

function HealthCard() {
  const t = useT();
  // GET /health → { status: 'ok'|'degraded', service: 'far-chain-api', timestamp }
  const { data, isLoading, isError, error } = useHealth();
  return (
    <Card data-testid="health-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" aria-hidden="true" />
          <CardTitle className="text-lg">{t('overview.health.title')}</CardTitle>
        </div>
        <CardDescription>{t('overview.health.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t('overview.health.checking')}</p>}
        {isError && (
          <Alert variant="destructive" data-testid="health-error">
            <AlertTitle>{t('overview.health.errorTitle')}</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : t('overview.health.errorDesc')}<br />
              {t('overview.health.errorDesc')}
            </AlertDescription>
          </Alert>
        )}
        {data !== undefined && (
          <div className="space-y-2" data-testid="health-data">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('overview.health.status')}</span>
              <Badge variant={data.status === 'ok' ? 'success' : 'warning'} data-testid="health-status">{data.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">{t('overview.health.service')} <span className="font-mono text-foreground">{data.service}</span></div>
            <div className="text-sm text-muted-foreground">{t('overview.health.timestamp')} <span className="font-mono text-foreground">{data.timestamp}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recent receipts card: the user's most recently persisted V2 receipts.
 *
 * 工作台核心——研究者回到首页时第一眼看到"我最近验证过什么",而非项目介绍。
 * 空态引导(counter-case 4):无收据时展示样例收据卡 + CTA,让用户知道收据长什么样。
 */
function RecentReceiptsCard() {
  const t = useT();
  const { data, isLoading, isError } = useReceiptList(5, 0);
  const receipts: readonly V2StoredReceipt[] = data?.receipts ?? [];
  return (
    <Card data-testid="recent-receipts">
      <CardHeader>
        <CardTitle className="text-lg">{t('overview.recent.title')}</CardTitle>
        <CardDescription>{t('overview.recent.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t('overview.recent.loading')}</p>}
        {isError && (
          <p className="text-sm text-muted-foreground" data-testid="recent-receipts-error">
            {t('overview.recent.error')}
          </p>
        )}
        {!isLoading && !isError && receipts.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-6 text-center" data-testid="recent-receipts-empty">
            <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t('overview.recent.empty')}
            </p>
            {/* counter-case 4: 样例收据卡——让用户直观看到"验证后会长什么样" */}
            <div className="w-full rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-left" data-testid="recent-receipts-sample">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">rcpt-sample-0001</span>
                <Badge variant="success">CONFIRMED</Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Does catalyst X achieve higher CO₂ reduction efficiency than catalyst Y?
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/wizard">
                <Sparkles className="mr-2 h-4 w-4" />{t('overview.recent.emptyCta')}
              </Link>
            </Button>
          </div>
        )}
        {receipts.length > 0 && (
          <ul className="space-y-2" data-testid="recent-receipts-list">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border p-2">
                <span className="font-mono text-xs truncate max-w-[140px]">{r.id}</span>
                <span className="flex-1 truncate px-3 text-sm">{r.claimText}</span>
                <Badge variant={STATUS_VARIANT[r.verdict] ?? 'outline'}>{r.verdict}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const t = useT();
  return (
    <div className="space-y-8" data-testid="overview-page">
      {/* Workbench header */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('overview.title')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('overview.subtitle')}
        </p>
      </header>

      {/* Primary CTA: start a new verification */}
      <Card className="border-primary/30 bg-primary/5" data-testid="workbench-cta">
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-lg font-semibold">{t('overview.ctaTitle')}</p>
            <p className="text-sm text-muted-foreground">
              {t('overview.ctaDesc')}
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link to="/wizard">
              <Sparkles className="mr-2 h-4 w-4" />{t('overview.ctaBtn')}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Quick entries */}
      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="mb-4 text-xl font-semibold">{t('overview.quickHeading')}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="quick-entries">
          {QUICK_ENTRIES.map((e) => (
            <Link
              key={e.to}
              to={e.to}
              data-testid={e.testId}
              className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <e.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="font-medium">{t(e.titleKey)}</span>
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t(e.descKey)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* System status + recent receipts */}
      <section aria-labelledby="status-heading" className="grid gap-4 md:grid-cols-2">
        <h2 id="status-heading" className="sr-only">{t('overview.runtimeStatus')}</h2>
        <HealthCard />
        <RecentReceiptsCard />
      </section>
    </div>
  );
}
