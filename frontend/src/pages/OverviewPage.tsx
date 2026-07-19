import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHealth, useVerdictList } from '@/lib/api_client';
import { ShieldCheck, Eye, Repeat, Terminal, Activity } from 'lucide-react';

const PILLARS = [
  { title: 'Falsifiable', subtitle: 'testable claims', description: 'Every scientific assertion can be refuted, downgraded, or marked as untested.', icon: ShieldCheck },
  { title: 'Tamper-Evident', subtitle: 'hash-chain verified', description: 'An append-only hash chain + Merkle root means any tampering is detectable by recomputation (tamper-detectable, not physically immutable).', icon: Eye },
  { title: 'Independently Re-computable', subtitle: 'verify it yourself', description: 'Reviewers can recompute the proof head / verdict trace / critical hashes on their own machine; a failed recompute yields a structured diff.', icon: Repeat },
] as const;

const RUN_COMMANDS = [
  { cmd: 'npm run dev', desc: 'Start the frontend dev server (http://localhost:5173)' },
  { cmd: 'npm run build', desc: 'Type-check + production build' },
  { cmd: 'npm run test', desc: 'Run the Vitest unit tests' },
  { cmd: 'npm run typecheck', desc: 'Run the TypeScript type-check only' },
] as const;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  CONFIRMED: 'success', REFUTED: 'destructive', INCONCLUSIVE: 'warning', DEGRADED_SCOPE: 'secondary', UNTESTED: 'outline',
};

function HealthCard() {
  // GET /health → { status: 'ok'|'degraded', service: 'far-chain-api', timestamp }
  const { data, isLoading, isError, error } = useHealth();
  return (
    <Card data-testid="health-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" aria-hidden="true" />
          <CardTitle className="text-lg">Backend health</CardTitle>
        </div>
        <CardDescription>GET /health — liveness probe for the backend API gateway (spec 24)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}
        {isError && (
          <Alert variant="destructive" data-testid="health-error">
            <AlertTitle>Backend unreachable</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unknown error'}<br />
              Make sure the backend is running at http://localhost:3000
            </AlertDescription>
          </Alert>
        )}
        {data !== undefined && (
          <div className="space-y-2" data-testid="health-data">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={data.status === 'ok' ? 'success' : 'warning'} data-testid="health-status">{data.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">Service: <span className="font-mono text-foreground">{data.service}</span></div>
            <div className="text-sm text-muted-foreground">Timestamp: <span className="font-mono text-foreground">{data.timestamp}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recent verdicts card: pulls real verdicts from GET /api/v1/verdict (not placeholder data).
 * Honesty wall: when the backend is unreachable or there are no verdicts yet, show an honest
 * empty state — never render fabricated placeholder records.
 */
function RecentVerdictsCard() {
  const { data, isLoading, isError } = useVerdictList(5, 0);
  const items = data?.items ?? [];
  return (
    <Card data-testid="recent-verdicts">
      <CardHeader>
        <CardTitle className="text-lg">Recent verdicts</CardTitle>
        <CardDescription>GET /api/v1/verdict — the 5 most recent real verdicts (produced by running the agent loop)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && (
          <Alert variant="destructive" data-testid="recent-verdicts-error">
            <AlertTitle>Backend unreachable</AlertTitle>
            <AlertDescription>
              Could not fetch the verdict list. Make sure the backend is running at http://localhost:3000, or run the agent loop once to produce verdict records.
            </AlertDescription>
          </Alert>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="recent-verdicts-empty">
            No verdict records yet. After you run the agent loop once (POST /api/v1/hypothesize), real verdicts will appear here — this view never shows placeholder data.
          </p>
        )}
        {items.length > 0 && (
          <ul className="space-y-2" data-testid="recent-verdicts-list">
            {items.map((v) => (
              <li key={v.verdictId} className="flex items-center justify-between rounded border p-2">
                <span className="font-mono text-xs">{v.verdictId}</span>
                <span className="flex-1 truncate px-3 text-sm">{v.nodeKind}</span>
                <Badge variant={STATUS_VARIANT[v.decision] ?? 'outline'}>{v.decision}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  return (
    <div className="space-y-8" data-testid="overview-page">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">FAR-Chain</h1>
        <p className="mt-1 text-muted-foreground">Falsification-Anchored Research Chain — an AI4S research-agent harness</p>
      </header>
      <section aria-labelledby="pillars-heading">
        <h2 id="pillars-heading" className="mb-4 text-xl font-semibold">Three pillars</h2>
        <div className="grid gap-4 md:grid-cols-3" data-testid="pillars">
          {PILLARS.map((p) => (
            <Card key={p.title}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-lg">{p.title}</CardTitle>
                  <span className="text-xs text-muted-foreground">{p.subtitle}</span>
                </div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{p.description}</p></CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section aria-labelledby="commands-heading">
        <h2 id="commands-heading" className="mb-4 text-xl font-semibold">Run commands</h2>
        <Card><CardContent className="pt-6">
          <ul className="space-y-3" data-testid="run-commands">
            {RUN_COMMANDS.map((c) => (
              <li key={c.cmd} className="flex flex-col gap-1">
                <code className="inline-flex items-center gap-2 rounded bg-muted px-2 py-1 font-mono text-sm">
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />{c.cmd}
                </code>
                <span className="text-sm text-muted-foreground">{c.desc}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      </section>
      <section aria-labelledby="status-heading" className="grid gap-4 md:grid-cols-2">
        <h2 id="status-heading" className="sr-only">Runtime status</h2>
        <HealthCard />
        <RecentVerdictsCard />
      </section>
    </div>
  );
}
