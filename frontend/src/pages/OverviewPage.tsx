import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useHealth, useVerdictList } from '@/lib/api_client';
import { ShieldCheck, Eye, Repeat, Terminal, Activity } from 'lucide-react';

const PILLARS = [
  { title: '可证伪', subtitle: 'Falsifiable', description: '每一个科学断言都可以被反驳、降级或标记为未测试。', icon: ShieldCheck },
  { title: '篡改可检测', subtitle: 'Tamper-Evident', description: 'append-only hash 链 + Merkle root 让任何篡改可被重算发现（篡改可检测，非物理不可改）。', icon: Eye },
  { title: '可独立复算', subtitle: 'Independently Re-computable', description: '评委可在自己机器上重算 proof head / verdict trace / 关键 hash，重算失败给出结构化差异。', icon: Repeat },
] as const;

const RUN_COMMANDS = [
  { cmd: 'npm run dev', desc: '启动前端开发服务器 (http://localhost:5173)' },
  { cmd: 'npm run build', desc: '类型检查 + 生产构建' },
  { cmd: 'npm run test', desc: '运行 Vitest 单元测试' },
  { cmd: 'npm run typecheck', desc: '仅运行 TypeScript 类型检查' },
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
          <CardTitle className="text-lg">后端健康状态</CardTitle>
        </div>
        <CardDescription>GET /health — 后端 API 网关（spec 24）存活探针</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">检测中…</p>}
        {isError && (
          <Alert variant="destructive" data-testid="health-error">
            <AlertTitle>后端不可达</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : '未知错误'}<br />
              请确认后端已启动在 http://localhost:3000
            </AlertDescription>
          </Alert>
        )}
        {data !== undefined && (
          <div className="space-y-2" data-testid="health-data">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">状态：</span>
              <Badge variant={data.status === 'ok' ? 'success' : 'warning'} data-testid="health-status">{data.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">服务：<span className="font-mono text-foreground">{data.service}</span></div>
            <div className="text-sm text-muted-foreground">时间戳：<span className="font-mono text-foreground">{data.timestamp}</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 最近裁决卡片：从 GET /api/v1/verdict 拉取真实裁决（非占位数据）。
 * 诚信墙：后端不可达 / 暂无裁决时显示诚实空状态，绝不渲染伪造的假设记录。
 */
function RecentVerdictsCard() {
  const { data, isLoading, isError } = useVerdictList(5, 0);
  const items = data?.items ?? [];
  return (
    <Card data-testid="recent-verdicts">
      <CardHeader>
        <CardTitle className="text-lg">最近裁决</CardTitle>
        <CardDescription>GET /api/v1/verdict — 最近 5 条真实裁决（运行 agent loop 后产生）</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {isError && (
          <Alert variant="destructive" data-testid="recent-verdicts-error">
            <AlertTitle>后端不可达</AlertTitle>
            <AlertDescription>
              无法获取裁决列表。请确认后端已启动在 http://localhost:3000，或运行一次 agent loop 产生裁决记录。
            </AlertDescription>
          </Alert>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="recent-verdicts-empty">
            暂无裁决记录。运行一次 agent loop（POST /api/v1/hypothesize）后，裁决将真实出现在此处——此处从不显示占位数据。
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
        <p className="mt-1 text-muted-foreground">Falsification-Anchored Research Chain — AI4S 研究智能体 harness</p>
      </header>
      <section aria-labelledby="pillars-heading">
        <h2 id="pillars-heading" className="mb-4 text-xl font-semibold">三大支柱</h2>
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
        <h2 id="commands-heading" className="mb-4 text-xl font-semibold">运行命令</h2>
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
        <h2 id="status-heading" className="sr-only">运行状态</h2>
        <HealthCard />
        <RecentVerdictsCard />
      </section>
    </div>
  );
}
