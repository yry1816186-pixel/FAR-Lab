import {
  ShieldCheck,
  ShieldAlert,
  Eye,
  Repeat,
  FlaskConical,
  Fingerprint,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Hash,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------- Types ----------

interface AssuranceDimensionCardProps {
  dimension: string;
  outcome: string;
  detail: string;
  reasonCodes: readonly string[];
}

// ---------- Dimension meta ----------

const DIMENSION_META: Record<
  string,
  { icon: typeof ShieldCheck; label: string; color: string }
> = {
  provenance: { icon: Fingerprint, label: 'Provenance', color: 'text-info' },
  integrity: { icon: ShieldCheck, label: 'Integrity', color: 'text-success' },
  identity: { icon: Eye, label: 'Identity', color: 'text-purple-400' },
  processConformance: {
    icon: Repeat,
    label: 'Process Conformance',
    color: 'text-cyan-400',
  },
  executionReproduction: {
    icon: Hash,
    label: 'Execution Reproduction',
    color: 'text-warning',
  },
  scientificVerdict: {
    icon: FlaskConical,
    label: 'Scientific Verdict',
    color: 'text-warning',
  },
};

// ---------- Outcome color mapping ----------

const OUTCOME_META: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  PASS: {
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/100/10 border-success/40',
    label: 'PASS',
  },
  FAIL: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/30',
    label: 'FAIL',
  },
  WARN: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/100/10 border-warning/40',
    label: 'WARN',
  },
  SKIP: {
    icon: MinusCircle,
    color: 'text-gray-400',
    bg: 'bg-muted0/10 border-border/30',
    label: 'SKIP',
  },
  NOT_APPLICABLE: {
    icon: MinusCircle,
    color: 'text-gray-500',
    bg: 'bg-muted0/5 border-border/20',
    label: 'N/A',
  },
};

// ---------- Component ----------

export function AssuranceDimensionCard({
  dimension,
  outcome,
  detail,
  reasonCodes,
}: AssuranceDimensionCardProps) {
  const meta = DIMENSION_META[dimension];
  const outcomeMeta = OUTCOME_META[outcome] ?? OUTCOME_META.SKIP;

  const Icon = meta?.icon ?? ShieldAlert;
  const OutcomeIcon = outcomeMeta.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 transition-colors',
        outcomeMeta.bg,
      )}
    >
      <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', meta?.color ?? 'text-gray-400')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{meta?.label ?? dimension}</span>
          <Badge variant="outline" className={cn('text-xs gap-1', outcomeMeta.color)}>
            <OutcomeIcon className="w-3 h-3" />
            {outcomeMeta.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {reasonCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {reasonCodes.map((code) => (
              <Badge key={code} variant="destructive" className="text-xs font-mono">
                {code}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssuranceDimensionCard;
