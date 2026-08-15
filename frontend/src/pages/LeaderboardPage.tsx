/**
 * LeaderboardPage —— Science-125 完整性广度套件的公开 leaderboard（Task #10 惊艳核心）。
 *
 * Authority: §1（Science125 种子）+ 09 §4（integrity root）+ 23 §5.2.
 *
 * 六大组件（基于后端 GET /api/v1/benchmark 预生成报告）：
 *   1. HeroSuiteRoot        — 套件级聚合 Merkle 根（所有 problem 单链根再折叠·套件密码学指纹）
 *   2. SuiteVerifier        — 浏览器用 Web Crypto 独立重算套件根并比对报告根（可验证 leaderboard·差异化灵魂）
 *      内嵌 Tamper Theatre — 翻转报告根末位 hex → 浏览器重算立即不符 → 篡改可观测
 *   3. VerdictDistribution  — 5 verdict 计数 + 占比条（FEC 真实裁决分布·非全过）
 *   4. DomainDistribution   — 科学领域覆盖广度
 *   5. ProblemTable         — 每个 problem 的完整性条目（verdict/integrityRoot/leafCount/链验证）
 *   6. HonestyWall          — 诚实声明（fixture verdict·非科学排名·suiteIntegrityRoot 确定性）
 *
 * 诚实定位（红线·与 HonestyWall 同源）：
 *   - leaderboard 展示「工程完整性广度」非「科学结论排名」。
 *   - verdict 由 offline fixture 产出（非真实 LLM·非真实裁决）。
 *   - suiteIntegrityRoot 确定可复现（CI golden 锚）；reproHash 是 run 实例标识（每次不同）。
 *   - SuiteVerifier 的浏览器重算与后端 aggregator 字节相等（同算法·跨语言 SHA-256 契约）——
 *     它证明「报告根确实是 entries 折叠出来的」，非后端自说自话。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / innerHTML / 桩。
 * 无障碍：可交互元素均有 aria-label；图标 aria-hidden。
 * useEffect：useSuiteRootRecompute 含 1 个（浏览器独立重算套件根·cancelled flag cleanup）。
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { useBenchmark } from '@/lib/api_client';
import { useTimeout } from '@/lib/useTimeout';
import { computeMerkleRoot, flipLastHexChar } from '@/lib/merkle';
import type { BenchmarkEntryDto, BenchmarkReportDto, VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Trophy,
  ShieldCheck,
  Network,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  ScrollText,
  Lock,
  Layers,
  Globe,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------- verdict → badge 映射 ----------

type BadgeVariant = 'success' | 'destructive' | 'secondary' | 'warning' | 'outline';

const VERDICT_META: Readonly<Record<VerdictValue, { readonly variant: BadgeVariant; readonly label: string }>> = {
  CONFIRMED: { variant: 'success', label: 'CONFIRMED' },
  REFUTED: { variant: 'destructive', label: 'REFUTED' },
  INCONCLUSIVE: { variant: 'secondary', label: 'INCONCLUSIVE' },
  DEGRADED_SCOPE: { variant: 'warning', label: 'DEGRADED_SCOPE' },
  UNTESTED: { variant: 'outline', label: 'UNTESTED' },
};

const VERDICT_ORDER: readonly VerdictValue[] = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
];

/** 占比条颜色（Tailwind 调色板类·与 badge.tsx 同源·非硬编码 hex）。 */
function barColor(variant: BadgeVariant): string {
  switch (variant) {
    case 'success':
      return 'bg-emerald-500';
    case 'destructive':
      return 'bg-destructive';
    case 'warning':
      return 'bg-amber-500';
    case 'secondary':
      return 'bg-secondary-foreground';
    case 'outline':
      return 'bg-muted-foreground';
  }
}

// ---------- helpers ----------

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function shortHash(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-4)}`;
}

// ---------- 复制按钮 ----------

function CopyHashButton({
  value,
  label,
  testId,
}: {
  readonly value: string;
  readonly label: string;
  readonly testId: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const schedule = useTimeout();
  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      schedule(() => setCopied(false), 1500);
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} aria-label={label} data-testid={testId}>
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {copied ? t('common.copied') : t('common.copy')}
    </Button>
  );
}

// ---------- 浏览器侧套件根独立重算 hook（差异化护城河可视化）----------

function useSuiteRootRecompute(entries: readonly BenchmarkEntryDto[]): {
  readonly root: string | null;
  readonly error: string | null;
} {
  const [root, setRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const leaves = entries.map((entry) => entry.integrityRoot);
    computeMerkleRoot(leaves)
      .then((computed) => {
        if (!cancelled) {
          setRoot(computed);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return { root, error };
}

// ---------- 2. SuiteVerifier（可验证 leaderboard·浏览器独立验证套件根）----------

function SuiteVerifier({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  const [tampered, setTampered] = useState(false);
  const { root, error } = useSuiteRootRecompute(report.entries);

  const reportRoot = tampered ? flipLastHexChar(report.suiteIntegrityRoot) : report.suiteIntegrityRoot;
  const matches = root !== null && root === reportRoot;

  return (
    <Card data-testid="suite-verifier">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.suiteTitle')}</CardTitle>
        </div>
        <CardDescription>
          {t('leaderboard.suiteDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {root === null && error === null && (
          <div className="flex items-center gap-2 text-muted-foreground" data-testid="suite-verifying">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('leaderboard.verifying')}
          </div>
        )}
        {error !== null && (
          <Alert variant="destructive" data-testid="suite-verify-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t('leaderboard.suiteError', { msg: error })}</AlertDescription>
          </Alert>
        )}
        {root !== null && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('leaderboard.recomputedLabel', { n: report.entries.length })}
                </span>
                <CopyHashButton value={root} label={t('leaderboard.recomputedCopy')} testId="suite-recomputed-root-copy" />
              </div>
              <code
                className="block break-all rounded bg-muted px-3 py-2 font-mono text-xs"
                data-testid="suite-recomputed-root"
              >
                {root}
              </code>
            </div>
            <div
              className={cn(
                'rounded-md border p-4',
                matches ? 'border-emerald-500 bg-emerald-500/5' : 'border-destructive bg-destructive/5',
              )}
              data-testid="suite-verify-result"
            >
              {matches ? (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div className="space-y-1">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400" data-testid="suite-verify-ok">
                      {t('leaderboard.suiteOk')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('leaderboard.suiteOkDesc', { n: report.entries.length })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="space-y-1">
                    <div className="font-semibold text-destructive" data-testid="suite-verify-mismatch">
                      {t('leaderboard.suiteMismatch')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('leaderboard.suiteMismatchDesc')}
                    </div>
                    {tampered && (
                      <Badge variant="destructive" data-testid="suite-tamper-detected">
                        {t('leaderboard.tamperDetected')}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.tamperTheatre')}
              </span>
              {!tampered ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setTampered(true)}
                  data-testid="suite-tamper-btn"
                  aria-label={t('leaderboard.tamperAria')}
                >
                  {t('leaderboard.tamperBtn')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTampered(false)}
                  data-testid="suite-restore-btn"
                  aria-label={t('leaderboard.restoreAria')}
                >
                  {t('leaderboard.restoreBtn')}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- 1. HeroSuiteRoot ----------

function HeroSuiteRoot({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  return (
    <Card data-testid="hero-suite-root">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.heroTitle')}</CardTitle>
        </div>
        <CardDescription>
          {t('leaderboard.heroDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('leaderboard.suiteRootLabel')}</span>
            <CopyHashButton value={report.suiteIntegrityRoot} label={t('leaderboard.suiteRootCopy')} testId="suite-integrity-root-copy" />
          </div>
          <code
            className="block break-all rounded bg-muted px-3 py-2 font-mono text-xs"
            data-testid="suite-integrity-root"
          >
            {report.suiteIntegrityRoot}
          </code>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label={t('leaderboard.problemCount')}
            value={report.problemCount}
            testId="problem-count"
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
          />
          <Stat
            label={t('leaderboard.totalLeaves')}
            value={report.totalLeaves}
            testId="total-leaves"
            icon={<Network className="h-4 w-4" aria-hidden="true" />}
          />
          <Stat
            label={t('leaderboard.domainCount')}
            value={Object.keys(report.domainDistribution).length}
            testId="domain-count"
            icon={<Globe className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  testId,
  icon,
}: {
  readonly label: string;
  readonly value: number;
  readonly testId: string;
  readonly icon: ReactNode;
}) {
  return (
    <div className="rounded border bg-muted/40 px-3 py-2" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <code className="font-mono text-2xl font-bold">{value}</code>
    </div>
  );
}

// ---------- 2. VerdictDistribution ----------

function VerdictDistributionSection({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  const total = report.problemCount;
  return (
    <Card data-testid="verdict-distribution">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.distTitle')}</CardTitle>
        </div>
        <CardDescription>
          {t('leaderboard.distDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {VERDICT_ORDER.map((v) => {
          const count = report.verdictDistribution[v] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const meta = VERDICT_META[v];
          return (
            <div key={v} className="space-y-1.5" data-testid={`verdict-row-${v}`}>
              <div className="flex items-center justify-between text-sm">
                <Badge variant={meta.variant} data-testid={`verdict-badge-${v}`}>
                  {meta.label}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {t('leaderboard.distRatio', { count, total, pct })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', barColor(meta.variant))}
                  style={{ width: `${pct}%` }}
                  data-testid={`verdict-bar-${v}`}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- 3. DomainDistribution ----------

function DomainDistributionSection({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  const domains = Object.entries(report.domainDistribution);
  return (
    <Card data-testid="domain-distribution">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.domainTitle')}</CardTitle>
        </div>
        <CardDescription>{t('leaderboard.domainDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2" data-testid="domain-list">
          {domains.map(([domain, count]) => (
            <Badge key={domain} variant="secondary" data-testid={`domain-${domain}`}>
              {domain}
              <span className="ml-1 rounded-full bg-background/50 px-1.5 font-mono">{count}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- 4. ProblemTable ----------

function ProblemTableSection({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  return (
    <Card data-testid="problem-table">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.tableTitle')}</CardTitle>
        </div>
        <CardDescription>
          {t('leaderboard.tableDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('leaderboard.col.problem')}</TableHead>
              <TableHead>{t('leaderboard.col.domain')}</TableHead>
              <TableHead>{t('leaderboard.col.verdict')}</TableHead>
              <TableHead>{t('leaderboard.col.integrity')}</TableHead>
              <TableHead>{t('leaderboard.col.leaves')}</TableHead>
              <TableHead>{t('leaderboard.col.root')}</TableHead>
              <TableHead>{t('leaderboard.col.run')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.entries.map((entry) => (
              <ProblemRow key={entry.problemId} entry={entry} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProblemRow({ entry }: { readonly entry: BenchmarkEntryDto }) {
  const t = useT();
  const meta = VERDICT_META[entry.verdict];
  return (
    <TableRow data-testid={`entry-${entry.problemId}`}>
      <TableCell>
        <div className="font-mono text-xs font-semibold">{entry.problemId}</div>
        <div className="text-xs text-muted-foreground">{entry.problemTitle}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{entry.domain}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={meta.variant} data-testid={`entry-${entry.problemId}-verdict`}>
          {meta.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1">
            {entry.chainVerified ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            )}
            <span className="text-muted-foreground">
              {entry.chainVerified ? t('leaderboard.chainOk') : t('leaderboard.chainFail')} · {entry.stagesCompleted}/6
            </span>
          </span>
          <span className="text-muted-foreground">{entry.converged ? t('leaderboard.converged') : t('leaderboard.notConverged')}</span>
        </div>
      </TableCell>
      <TableCell>
        <code className="font-mono text-sm">{entry.leafCount}</code>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <code
            className="font-mono text-xs text-muted-foreground"
            data-testid={`entry-${entry.problemId}-integrity`}
          >
            {shortHash(entry.integrityRoot)}
          </code>
          <CopyHashButton
            value={entry.integrityRoot}
            label={t('leaderboard.copyRootAria', { id: entry.problemId })}
            testId={`entry-${entry.problemId}-integrity-copy`}
          />
        </div>
      </TableCell>
      <TableCell>
        <code
          className="font-mono text-xs text-muted-foreground"
          title={entry.reproHash}
          data-testid={`entry-${entry.problemId}-repro`}
        >
          {shortHash(entry.reproHash)}
        </code>
      </TableCell>
    </TableRow>
  );
}

// ---------- 5. HonestyWall ----------

function HonestyWall({ report }: { readonly report: BenchmarkReportDto }) {
  const t = useT();
  return (
    <Card data-testid="honesty-wall">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <CardTitle className="text-xl">{t('leaderboard.honestyTitle')}</CardTitle>
        </div>
        <CardDescription>{t('leaderboard.honestyDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {report.honestyNotes.map((note, idx) => (
            <li key={idx} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="text-xs text-muted-foreground" data-testid={`honesty-note-${idx}`}>
                {note}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- 页面主体 ----------

export default function LeaderboardPage() {
  const t = useT();
  const { data, isLoading, isError, error } = useBenchmark();

  return (
    <div className="space-y-6" data-testid="leaderboard-page">
      <header>
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">{t('leaderboard.title')}</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          {t('leaderboard.subtitle')}
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground" data-testid="benchmark-loading">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('leaderboard.loading')}
        </div>
      )}

      {isError && !isLoading && (
        <Alert variant="destructive" data-testid="benchmark-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('leaderboard.errorTitle')}</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : t('leaderboard.errorDesc')}
          </AlertDescription>
        </Alert>
      )}

      {data !== undefined && (
        <>
          <HeroSuiteRoot report={data} />
          <SuiteVerifier report={data} />
          <VerdictDistributionSection report={data} />
          <DomainDistributionSection report={data} />
          <ProblemTableSection report={data} />
          <HonestyWall report={data} />
        </>
      )}
    </div>
  );
}
