/**
 * ArenaPage —— 对抗科学竞技场可视化（W3 / FI-2）。
 *
 * Authority: src/api/internal/arena_service.ts ArenaResult + GET /api/v1/arena/demo。
 *
 * 三组件：
 *   1. RobustHero — ROBUST/BREACHED 徽章 + 着陆攻击数 + arena ID。
 *   2. RefuterScoreboard — 每个 refuter 的反驳尝试（refuter / verdict / landed?held）。
 *   3. HonestyAlert — 诚实声明（offline_replay 同 fixture→robust·真实对抗需凭据门·arbiter 确定性非 LLM）。
 *
 * 诚实定位（红线）：
 *   - demo 用 offline_replay（零 key·同 fixture），verdict 必然与原始相同 → ROBUST——展示「竞技场框架
 *     + deterministic arbiter + 记分板」，非真实抗攻击能力。
 *   - arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁。
 *   - 真实对抗须 far arena --refuters 接真实 provider（凭据门）。
 */

import { useArenaDemo } from '@/lib/api_client';
import type { VerdictValue } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { VerdictBadge } from '@/components/VerdictBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Swords, Loader2, ShieldCheck, ShieldAlert, Swords as SwordIcon } from 'lucide-react';

const FIVE_VERDICTS = new Set<string>([
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
]);

function isVerdictValue(v: string): v is VerdictValue {
  return FIVE_VERDICTS.has(v);
}

export default function ArenaPage() {
  const { data: result, isLoading, isError, error } = useArenaDemo();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="text-muted-foreground">正在运行对抗竞技场（offline_replay proponent + 3 refuter）…</span>
      </div>
    );
  }

  if (isError || result === undefined) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">对抗科学竞技场</h1>
          <p className="mt-1 text-muted-foreground">Adversarial Science Arena · W3 / FI-2</p>
        </header>
        <Alert variant="destructive">
          <AlertTitle>竞技场会话失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Swords className="h-7 w-7" aria-hidden="true" />
          对抗科学竞技场
        </h1>
        <p className="mt-1 text-muted-foreground">
          Adversarial Science Arena · proponent 裁决 + N refuter 反驳 + deterministic arbiter 判定着陆
        </p>
      </header>

      {/* RobustHero */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result.robust ? (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            )}
            竞技场裁决
          </CardTitle>
          <CardDescription>hypothesis：{result.hypothesis}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Badge variant={result.robust ? 'default' : 'destructive'} className="text-base">
            {result.robust ? 'ROBUST（无有效攻击）' : `BREACHED（${result.landedCount} 次有效攻击）`}
          </Badge>
          <span className="text-sm text-muted-foreground">
            原始裁决：
            {result.originalVerdict !== null && isVerdictValue(result.originalVerdict) ? (
              <VerdictBadge decision={result.originalVerdict} size="sm" />
            ) : (
              <span className="text-muted-foreground">无裁决</span>
            )}
            {result.originalRule !== null && (
              <code className="ml-2 text-xs">{result.originalRule}</code>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            arena：<code className="rounded bg-muted px-1.5 py-0.5">{result.arenaId}</code>
          </span>
        </CardContent>
      </Card>

      {/* RefuterScoreboard */}
      <Card>
        <CardHeader>
          <CardTitle>反驳记分板</CardTitle>
          <CardDescription>
            每个 refuter 独立反驳 hypothesis，arbiter 检测 verdict 是否与原始分歧（landed = 有效攻击）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refuter</TableHead>
                <TableHead>裁决</TableHead>
                <TableHead>攻击结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.attempts.map((a) => (
                <TableRow key={a.refuter}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1">
                      <SwordIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      {a.refuter}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.verdict !== null && isVerdictValue(a.verdict) ? (
                      <VerdictBadge decision={a.verdict} size="sm" />
                    ) : (
                      <Badge variant="destructive">错误</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.attackLanded ? (
                      <Badge variant="destructive">✗ LANDED（有效攻击）</Badge>
                    ) : (
                      <Badge variant="secondary">✓ held（抗住）</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* HonestyAlert */}
      <Alert>
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>诚实声明</AlertTitle>
        <AlertDescription>
          <p>{result.honestNote}</p>
          <p className="mt-2">
            <strong>红线</strong>：arbiter 是确定性规则（verdict 分歧检测），非 LLM 仲裁。
            真实对抗须 <code className="rounded bg-muted px-1">far arena --refuters</code> 接真实 provider（凭据门）。
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
