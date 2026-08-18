import {
  ClipboardCheck,
  FileText,
  FlaskConical,
  Gavel,
  GitCompare,
  Info,
  LayoutDashboard,
  Network,
  Radio,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export type NavLabelKey =
  | 'nav.research' | 'nav.overview' | 'nav.viz' | 'nav.integrity' | 'nav.leaderboard'
  | 'nav.court' | 'nav.arena' | 'nav.honesty' | 'nav.ablation'
  | 'nav.report' | 'nav.about' | 'nav.versions' | 'nav.wizard'
  | 'nav.v2receipt' | 'nav.events' | 'nav.planning' | 'nav.audit';

export type NavGroupKey = 'nav.group.research' | 'nav.group.tools';

export interface NavItem {
  readonly to: string;
  readonly labelKey: NavLabelKey;
  readonly icon: LucideIcon;
  /** Stable English search aliases for expert keyboard navigation. */
  readonly keywords: readonly string[];
}

export interface NavGroup {
  readonly id: 'research' | 'tools';
  readonly labelKey: NavGroupKey;
  readonly kind: 'primary' | 'tools';
  readonly items: readonly NavItem[];
}

/**
 * Product information architecture SSOT.
 *
 * Keep every real route reachable while making the research workflow primary.
 * Consumers: AppShell, command center, document titles, navigation tests.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'research',
    labelKey: 'nav.group.research',
    kind: 'primary',
    items: [
      { to: '/research', labelKey: 'nav.research', icon: FlaskConical, keywords: ['question', 'research', 'run', 'workbench'] },
      { to: '/planning', labelKey: 'nav.planning', icon: ClipboardCheck, keywords: ['plan', 'protocol', 'workflow'] },
      { to: '/versions', labelKey: 'nav.versions', icon: GitCompare, keywords: ['compare', 'diff', 'revision', 'version'] },
      { to: '/events', labelKey: 'nav.events', icon: Radio, keywords: ['events', 'live', 'stream', 'status'] },
      { to: '/report', labelKey: 'nav.report', icon: FileText, keywords: ['export', 'report', 'result'] },
    ],
  },
  {
    id: 'tools',
    labelKey: 'nav.group.tools',
    kind: 'tools',
    items: [
      { to: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard, keywords: ['dashboard', 'overview', 'system'] },
      { to: '/wizard', labelKey: 'nav.wizard', icon: Sparkles, keywords: ['verify', 'wizard'] },
      { to: '/v2-receipt', labelKey: 'nav.v2receipt', icon: ScrollText, keywords: ['receipt', 'provenance', 'verify'] },
      { to: '/viz', labelKey: 'nav.viz', icon: Network, keywords: ['evidence', 'graph', 'visualization'] },
      { to: '/integrity', labelKey: 'nav.integrity', icon: ShieldCheck, keywords: ['hash', 'integrity', 'merkle', 'proof'] },
      { to: '/court', labelKey: 'nav.court', icon: Gavel, keywords: ['court', 'judge', 'decision'] },
      { to: '/arena', labelKey: 'nav.arena', icon: Swords, keywords: ['arena', 'comparison', 'pairwise'] },
      { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy, keywords: ['benchmark', 'leaderboard', 'ranking'] },
      { to: '/honesty', labelKey: 'nav.honesty', icon: ShieldAlert, keywords: ['honesty', 'negative', 'limitations'] },
      { to: '/ablation', labelKey: 'nav.ablation', icon: FlaskConical, keywords: ['ablation', 'experiment', 'sensitivity'] },
      { to: '/audit', labelKey: 'nav.audit', icon: GitCompare, keywords: ['audit', 'trace', 'provenance'] },
      { to: '/about', labelKey: 'nav.about', icon: Info, keywords: ['about', 'help', 'version'] },
    ],
  },
] as const;

export const PRIMARY_ITEMS: readonly NavItem[] = NAV_GROUPS[0].items;
export const TOOLS_ITEMS: readonly NavItem[] = NAV_GROUPS[1].items;
export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const NAV_TITLE_BY_PATH: Readonly<Record<string, NavLabelKey>> = {
  '/': 'nav.research',
  ...Object.fromEntries(ALL_NAV_ITEMS.map((item) => [item.to, item.labelKey] as const)),
};
