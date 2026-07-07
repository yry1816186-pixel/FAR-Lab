import { useState, useCallback } from 'react';
import {
  ShieldCheck,
  Eye,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  AlertTriangle,
  Hash,
  Gavel,
  FlaskConical,
  PackageOpen,
  ScrollText,
  Info,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------- 8 幕场景定义 ----------
// demo-03 诚实标注（2026-06-29）：当前 8 幕是「FAR 功能导览子集」——每幕介绍一个概念
// （可信点 + 诚实标注 + 关联页面跳转），非 spec 16 §2 八幕可信链现场演示
// （claim→SciIR→falsification→sandbox→reproHash→verdict→ProofEnvelope→.far-proof 数据流转 +
// 幕6 INCONCLUSIVE 灵魂时刻 + 降级加演幕）。spec 16 完整八幕引导向导 = T-W5-05〔路线图项〕
// （22 T-W5-05 状态 MVP必须实现·待实现）。V1 交付功能导览子集，不声称已实现 spec 16 现场演示。

interface DemoScene {
  /** 幕编号 1-8 */
  readonly act: number;
  /** 幕标题 */
  readonly title: string;
  /** 幕副标题 */
  readonly subtitle: string;
  /** 图标组件 */
  readonly icon: typeof ShieldCheck;
  /** 可信点列表 */
  readonly credibilityPoints: readonly string[];
  /** 诚实标注 */
  readonly honestyNote: string;
  /** 关联页面路径 */
  readonly relatedPath: string;
  /** 关联页面标签 */
  readonly relatedLabel: string;
}

const DEMO_SCENES: readonly DemoScene[] = [
  {
    act: 1,
    title: 'FAR 三大支柱',
    subtitle: '可证伪 · 篡改可检测 · 可独立复算',
    icon: ShieldCheck,
    credibilityPoints: [
      '每个科学断言都附带可证伪规范（FalsificationSpec）：预测值、度量指标、证伪阈值、阈值语义',
      '全证据链哈希链接（SHA-256），任意篡改即时检测——追加只写，不可删除或修改',
      '确定性重放门：同一输入 + 同一模型快照 → 同一哈希，漂移暴露而非隐藏',
    ],
    honestyNote:
      'FAR-Chain 不声称绝对科学真理。它提供的是可靠性证据包（reliability evidence package），不是真理证明。CONFIRMED 裁决需要人类科学评审，即使全部门禁通过，也只是“可复审”而非“已证实”。',
    relatedPath: '/',
    relatedLabel: '总览页',
  },
  {
    act: 2,
    title: '证据链',
    subtitle: 'Hash-Linked Evidence Log',
    icon: Hash,
    credibilityPoints: [
      '每条证据 entry 由 canonicalHash（fast-json-stable-stringify + SHA-256）唯一标识',
      '四字段白名单（stageId, cred, payloadKind, prevHash）确保哈希可跨语言复现',
      'Genesis prevHash 硬编码为全零，所有证据链从同一锚点出发，不可伪造起点',
    ],
    honestyNote:
      'Cross-language 哈希对齐（TS ↔ Python）目前通过 golden_vectors 验证（E4 gate），但尚未覆盖所有边界情况。整数/浮点边界（N1-N4）的语义等价性仍需人工抽检。',
    relatedPath: '/viz',
    relatedLabel: '证据链图',
  },
  {
    act: 3,
    title: '5 值裁决系统',
    subtitle: 'CONFIRMED · REFUTED · INCONCLUSIVE · DEGRADED_SCOPE · UNTESTED',
    icon: Gavel,
    credibilityPoints: [
      '裁决由确定性规则树决定，不存在 LLM 自评——禁止任何 LLM-as-judge 循环',
      '优先级顺序：DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED',
      '反剧场约束（F1）：proof_envelopes 中检查结论含“WARN”时禁止密封为 CONFIRMED',
    ],
    honestyNote:
      'CONFIRMED 裁决需满足严格条件——falsificationSpec 已通过、sourceAnchor 存在、reproHash 已验证、prevProofHash 有效、安全检查全部 PASS。门槛高，多数实验室假设止于 INCONCLUSIVE。',
    relatedPath: '/honesty',
    relatedLabel: '诚信墙',
  },
  {
    act: 4,
    title: '诚信墙',
    subtitle: 'HonestyWall · 全裁决公开',
    icon: Eye,
    credibilityPoints: [
      '所有裁决实时可见，按 5 值分类展示：已确认、已驳斥、无定论、降级范围、未测试',
      '每条裁决可展开查看完整证据时间线：哈希链、来源锚点、证伪阈值、度量值',
      '分页浏览全量裁决，不隐藏负面结果——REFUTED 与 CONFIRMED 同等重要',
    ],
    honestyNote:
      '诚信墙数据来自后端 /api/v1/verdict 端点，仅在本地运行时可访问。生产部署需要额外的访问控制与速率限制。墙为空说明尚未运行实验，而非无数据被隐瞒。',
    relatedPath: '/honesty',
    relatedLabel: '诚信墙',
  },
  {
    act: 5,
    title: '可证伪性合约',
    subtitle: 'Falsifiability Contract · 预注册 · Bonferroni 校正',
    icon: ScrollText,
    credibilityPoints: [
      '预注册哈希（preregistrationHash）在实验前锁定：假设 → 度量 → 阈值 → α = 0.0125',
      '伪随机种子固定为 42（F8 反 p-hacking）——禁止动态种子',
      'Bonferroni 校正默认 applied=1（单假设）——多假设时自动累积',
      '审计器 4 规则：has_falsification_spec, has_preregistration_hash, has_evidence_hash_chain, has_sealed_proof_envelope',
    ],
    honestyNote:
      'FalsificationSufficiencyAuditor 使用正则启发式（V1），不执行完整语义验证。规则 id 2（bonferroni_correction_applied）仅在多假设时 WARN 而非 FAIL——允许单假设场景通过。',
    relatedPath: '/ablation',
    relatedLabel: '消融实验',
  },
  {
    act: 6,
    title: '消融实验',
    subtitle: 'Ablation Study · 组件移除对比',
    icon: FlaskConical,
    credibilityPoints: [
      '系统化移除 FAR-Chain 组件后比较输出漂移，量化每个组件的信息贡献',
      '消融矩阵：移除 vs 保留 × 6 阶段，每格报告哈希差异与裁决变化',
      '消融结果本身受哈希链保护——消融实验的输出也是证据链的一部分',
    ],
    honestyNote:
      '消融实验验证的是组件对输出的影响，不是“组件是否必要”。零差异不意味组件无用——可能该组件在特定输入下才激活（coverage gap）。W1 消融为框架级，不覆盖所有输入分布。',
    relatedPath: '/ablation',
    relatedLabel: '消融实验',
  },
  {
    act: 7,
    title: '证明包导出',
    subtitle: '.far-proof · 七分量证据包',
    icon: PackageOpen,
    credibilityPoints: [
      '七分量 + code/MANIFEST.md：ro-crate-metadata.json, prov.ttl, proof_envelopes.jsonl, repro_runs.jsonl, call_records.redacted.jsonl, data_manifest.json, README_REPLAY.md',
      '导出锚定 gitCommitSha + envHash（fresh-clone 重放锁），call_records 已脱敏（排除 request/response payload 中的 API key）',
      '真实脚本可现场运行：pnpm exec tsx scripts/replay_demo_chain.ts（构造 C-ASTRO-0001 证明链 → 导出 → 字节级重算 proofHash）',
    ],
    honestyNote:
      '导出的 RO-Crate 与 PROV-O 文件不声称通过第三方验证器（W3C PROV validator、RO-Crate validator）——这是 V3 路线图项而非 W1 交付项。脱敏策略可能遗漏边缘字段，导出前应人工抽检。',
    relatedPath: '/report',
    relatedLabel: '研究报告',
  },
  {
    act: 8,
    title: '复现与审计',
    subtitle: 'Reproducibility · 独立验证流程',
    icon: Repeat,
    credibilityPoints: [
      '现场重放三步（均有真实脚本）：ci/verify_chain_smoke.ts 验证哈希链 → scripts/recompute_proof_hashes.ts 字节级重算 proofHash → scripts/replay_demo_chain.ts 端到端重放 C-ASTRO-0001',
      'Golden vectors (8 组) 覆盖 N1-N4 数值边界与 Unicode 样本，cross_lang CI gate 双向验证',
      'CI 流水线：typecheck → lint → test → cross_lang → anti-theater → model_neutrality → security',
    ],
    honestyNote:
      '全复现需要锁定环境（Node ≥ 24, Python ≥ 3.12, 无全局工具差异）。某些系统级差异（文件路径编码、操作系统换行符）可能引入非确定性，但核心哈希路径已规范化以避免。W1 不声称物理过程隔离。',
    relatedPath: '/about',
    relatedLabel: '关于',
  },
];

// ---------- 辅助组件 ----------

function CreditPoint({ index, text }: { readonly index: number; readonly text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-success"
        aria-hidden="true"
      />
      <span>
        <span className="font-medium text-foreground">可信点 {index + 1}:</span>{' '}
        <span className="text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}

function HonestyPopover({
  note,
  visible,
  onToggle,
}: {
  readonly note: string;
  readonly visible: boolean;
  readonly onToggle: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="relative mt-4 rounded-lg border border-warning/40 bg-warning/5 p-4"
      role="alert"
      data-testid="honesty-popover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div>
            <h4 className="text-sm font-semibold text-warning-foreground">
              诚实标注
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{note}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="关闭诚实标注"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------- 进度指示器 ----------

function ProgressDots({
  total,
  current,
  onGoTo,
}: {
  readonly total: number;
  readonly current: number;
  readonly onGoTo: (index: number) => void;
}) {
  return (
    <nav aria-label="场景进度" className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <button
          type="button"
          key={i}
          onClick={() => onGoTo(i)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
            i === current
              ? 'bg-primary text-primary-foreground'
              : i < current
                ? 'bg-success/20 text-success-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
          )}
          aria-label={`第${i + 1}幕 ${i === current ? '(当前)' : ''}`}
          aria-current={i === current ? 'step' : undefined}
          data-testid={`progress-dot-${i}`}
        >
          {i < current ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Circle className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ---------- 页面主体 ----------

export default function DemoModePage() {
  const [currentScene, setCurrentScene] = useState(0);
  const [honestyVisible, setHonestyVisible] = useState(false);

  const scene = DEMO_SCENES[currentScene];
  const total = DEMO_SCENES.length;
  const isFirst = currentScene === 0;
  const isLast = currentScene === total - 1;

  const goTo = useCallback((index: number) => {
    setCurrentScene(Math.max(0, Math.min(total - 1, index)));
    setHonestyVisible(false);
  }, [total]);

  const goNext = useCallback(() => {
    if (!isLast) {
      goTo(currentScene + 1);
    }
  }, [currentScene, isLast, goTo]);

  const goPrev = useCallback(() => {
    if (!isFirst) {
      goTo(currentScene - 1);
    }
  }, [currentScene, isFirst, goTo]);

  const Icon = scene.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="demo-mode-page">
      {/* 页头 */}
      <header className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Info className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">演示模式</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Demo Mode · 8 幕功能导览 · 每幕展示可信点与诚实标注
        </p>
        <p
          className="mx-auto mt-2 max-w-xl text-xs text-muted-foreground"
          data-testid="demo-v1-scope-note"
        >
          V1 边界：当前为 FAR 功能导览子集，非 spec 16 §2 八幕可信链现场演示
          （claim→SciIR→falsification→sandbox→reproHash→verdict→ProofEnvelope→.far-proof）。
          完整八幕引导向导见 T-W5-05（路线图项，非 V1 交付）。
        </p>
      </header>

      {/* 进度指示器 */}
      <ProgressDots total={total} current={currentScene} onGoTo={goTo} />

      {/* 当前幕卡片 */}
      <Card data-testid={`scene-card-${currentScene}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  第 {scene.act} / {total} 幕
                </Badge>
              </div>
              <CardTitle className="mt-1 text-xl">{scene.title}</CardTitle>
              <CardDescription className="mt-0.5">{scene.subtitle}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 可信点列表 */}
          <section aria-labelledby={`cred-points-${scene.act}`}>
            <h3
              id={`cred-points-${scene.act}`}
              className="mb-3 text-sm font-semibold text-foreground"
            >
              可信点
            </h3>
            <ul className="space-y-3" data-testid="credibility-points">
              {scene.credibilityPoints.map((point, i) => (
                <CreditPoint key={i} index={i} text={point} />
              ))}
            </ul>
          </section>

          {/* 诚实标注切换按钮 */}
          {!honestyVisible && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHonestyVisible(true)}
              aria-label="显示诚实标注"
              data-testid="show-honesty-btn"
            >
              <AlertTriangle className="mr-2 h-4 w-4 text-warning" aria-hidden="true" />
              查看诚实标注
            </Button>
          )}

          {/* 诚实标注弹出 */}
          <HonestyPopover
            note={scene.honestyNote}
            visible={honestyVisible}
            onToggle={() => setHonestyVisible(false)}
          />

          {/* 关联页面跳转 */}
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              相关页面：
              <span className="ml-1 font-medium text-foreground">{scene.relatedLabel}</span>
            </span>
            <a
              href={scene.relatedPath}
              className="text-sm font-medium text-primary hover:underline"
              data-testid="related-link"
            >
              前往 {scene.relatedLabel} →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* 导航按钮 */}
      <nav
        className="flex items-center justify-between"
        aria-label="场景导航"
        data-testid="demo-navigation"
      >
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={isFirst}
          aria-label="上一幕"
          data-testid="prev-scene-btn"
        >
          <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          上一幕
        </Button>

        <span className="text-sm text-muted-foreground" data-testid="scene-counter">
          {currentScene + 1} / {total}
        </span>

        <Button
          variant="outline"
          onClick={goNext}
          disabled={isLast}
          aria-label="下一幕"
          data-testid="next-scene-btn"
        >
          下一幕
          <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
