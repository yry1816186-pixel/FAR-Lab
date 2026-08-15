/**
 * PlanningPage —— 规划门禁方法论门禁面板（确定性机器门禁，无 LLM）。
 *
 * 4 个门禁卡片，对应 /api/v1/planning/* 端点：
 *   - Risk Grading（P0-P4 风险分级 · gradeRisk）
 *   - Plan Gate（计划 DAG 校验 · validatePlan）
 *   - Spec Gate（规格校验 · validateSpec）
 *   - Verification Gate（四步门函数报告 · buildGateReport）
 *
 * 契约：v1 统一信封 { ok: true, data }（parseV1Response 解包）+ RFC 7807 错误。
 * 展示 FAR-Lab 的确定性治理哲学：规划门禁由机器判定，可审计，可复现。
 */
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useT, type MessageKey } from '@/lib/i18n';
import {
  usePlanningGate,
  usePlanningPlan,
  usePlanningRisk,
  usePlanningSpec,
} from '@/lib/api_client';
import type {
  PlanningGateResult,
  PlanningPlanResult,
  PlanningRiskResult,
  PlanningSpecResult,
} from '@/lib/api_client';

const RISK_EXAMPLE = {
  readOnly: false,
  docOnly: false,
  boundedWrite: false,
  touchesTrustKernel: true,
  newCliOrApi: true,
  crossModule: true,
  destructive: false,
  irreversible: false,
  ambiguous: true,
};

const PLAN_EXAMPLE = {
  goal: 'add a new anti-theater detector',
  steps: [
    { id: 'T1', action: 'write failing tests', risk: 'P2', tools: ['Write'], dependsOn: [], verification: 'pnpm test -- tests/anti_theater/x.test.ts' },
    { id: 'T2', action: 'implement detector', risk: 'P2', tools: ['Edit'], dependsOn: ['T1'], verification: 'pnpm run typecheck && pnpm test' },
    { id: 'T3', action: 'full regression', risk: 'P2', tools: ['Bash'], dependsOn: ['T2'], verification: 'pnpm run typecheck && pnpm run lint && pnpm test' },
  ],
};

const SPEC_EXAMPLE = {
  story: 'researcher wants deterministic planning gates so agents never skip verification',
  delta: { added: ['src/planning/engine.ts', 'tests/planning/engine.test.ts'], modified: [], removed: [] },
  acceptanceCriteria: [
    { id: 'AC-1', statement: 'plan DAG cycles are rejected', verification: 'node --test tests/planning/plan.test.ts' },
    { id: 'AC-2', statement: 'spec requires 3+ verifiable ACs', verification: 'node --test tests/planning/spec.test.ts' },
    { id: 'AC-3', statement: 'gate reports not_run explicitly', verification: 'node --test tests/planning/gate.test.ts' },
  ],
  risk: 'P3',
};

const GATE_EXAMPLE = {
  items: [
    { id: 'typecheck', name: 'typecheck', command: 'pnpm run typecheck', expected: 'exit 0' },
    { id: 'lint', name: 'lint', command: 'pnpm run lint', expected: 'exit 0' },
    { id: 'test', name: 'test', command: 'pnpm test', expected: 'all green' },
  ],
  results: {
    typecheck: { status: 'pass', actual: 'exit 0' },
    lint: { status: 'pass', actual: 'exit 0' },
    test: { status: 'not_run', actual: '—' },
  },
};

interface GateCardProps {
  readonly titleKey: MessageKey;
  readonly descKey: MessageKey;
  readonly runKey: MessageKey;
  readonly initialJson: string;
  readonly badge: (result: GateCardResult, t: (key: MessageKey) => string) => ReactNode;
  readonly onRun: (json: unknown) => Promise<GateCardResult>;
}

type GateCardResult = PlanningRiskResult | PlanningPlanResult | PlanningSpecResult | PlanningGateResult;

/** 一个门禁卡片：示例 JSON 输入 + 运行 + 结果展示。 */
function GateCard({ titleKey, descKey, runKey, initialJson, badge, onRun }: GateCardProps) {
  const t = useT();
  const [input, setInput] = useState(initialJson);
  const [result, setResult] = useState<GateCardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRun(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      setError(t('planning.invalidJson'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      setResult(await onRun(parsed));
    } catch (e) {
      setError(`${t('planning.error')}${e instanceof Error ? e.message : String(e)}`);
      setResult(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t(titleKey)}</CardTitle>
        <CardDescription>{t(descKey)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`input-${titleKey}`}>
          {t('planning.input')}
        </label>
        <textarea
          id={`input-${titleKey}`}
          data-testid={`input-${titleKey}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          className="h-40 w-full resize-y rounded-md border border-input bg-muted/40 p-2 font-mono text-xs"
        />
        <Button onClick={handleRun} disabled={pending} data-testid={`run-${titleKey}`}>
          {pending ? t('common.loading') : t(runKey)}
        </Button>
        {error !== null && (
          <Alert variant="destructive">
            <AlertTitle>{t('common.errorBadge')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result !== null && (
          <div className="space-y-2" data-testid={`result-${titleKey}`}>
            <div className="flex items-center gap-2">{badge(result, t)}</div>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function riskBadge(result: GateCardResult, t: (key: MessageKey) => string): ReactNode {
  const r = result as PlanningRiskResult;
  const tone = r.level === 'P4' || r.level === 'P3' ? 'destructive' : r.level === 'P2' ? 'secondary' : 'default';
  return (
    <Badge variant={tone} data-testid="badge-risk">
      {t('planning.level')} {r.level}
    </Badge>
  );
}

function planBadge(result: GateCardResult, t: (key: MessageKey) => string): ReactNode {
  const r = result as PlanningPlanResult;
  return (
    <Badge variant={r.ok ? 'default' : 'destructive'} data-testid="badge-plan">
      {r.ok ? t('planning.gatePass') : t('planning.gateFail')}
    </Badge>
  );
}

function specBadge(result: GateCardResult, t: (key: MessageKey) => string): ReactNode {
  const r = result as PlanningSpecResult;
  return (
    <Badge variant={r.ok ? 'default' : 'destructive'} data-testid="badge-spec">
      {r.ok ? t('planning.gatePass') : t('planning.gateFail')}
    </Badge>
  );
}

function gateBadge(result: GateCardResult, t: (key: MessageKey) => string): ReactNode {
  const r = result as PlanningGateResult;
  const tone = r.conclusion === 'DONE' ? 'default' : r.conclusion === 'BLOCKED' ? 'destructive' : 'secondary';
  return (
    <Badge variant={tone} data-testid="badge-gate">
      {t('planning.conclusion')}: {r.conclusion}
    </Badge>
  );
}

export default function PlanningPage() {
  const t = useT();
  const riskMutation = usePlanningRisk();
  const planMutation = usePlanningPlan();
  const specMutation = usePlanningSpec();
  const gateMutation = usePlanningGate();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t('planning.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('planning.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GateCard
          titleKey="planning.risk.title"
          descKey="planning.risk.desc"
          runKey="planning.risk.run"
          initialJson={JSON.stringify(RISK_EXAMPLE, null, 2)}
          badge={riskBadge}
          onRun={(json) => riskMutation.mutateAsync(json as Parameters<typeof riskMutation.mutateAsync>[0])}
        />
        <GateCard
          titleKey="planning.plan.title"
          descKey="planning.plan.desc"
          runKey="planning.plan.run"
          initialJson={JSON.stringify(PLAN_EXAMPLE, null, 2)}
          badge={planBadge}
          onRun={(json) => planMutation.mutateAsync(json as Parameters<typeof planMutation.mutateAsync>[0])}
        />
        <GateCard
          titleKey="planning.spec.title"
          descKey="planning.spec.desc"
          runKey="planning.spec.run"
          initialJson={JSON.stringify(SPEC_EXAMPLE, null, 2)}
          badge={specBadge}
          onRun={(json) => specMutation.mutateAsync(json as Parameters<typeof specMutation.mutateAsync>[0])}
        />
        <GateCard
          titleKey="planning.gate.title"
          descKey="planning.gate.desc"
          runKey="planning.gate.run"
          initialJson={JSON.stringify(GATE_EXAMPLE, null, 2)}
          badge={gateBadge}
          onRun={(json) =>
            gateMutation.mutateAsync(json as Parameters<typeof gateMutation.mutateAsync>[0])
          }
        />
      </div>
    </div>
  );
}
