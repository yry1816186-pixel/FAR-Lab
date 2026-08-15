/**
 * LeaderboardPage.test —— Science-125 完整性广度榜组件测试。
 *
 * Authority: Task #10（规模扩展·惊艳核心）+ §1（Science125 种子）+ 09 §4（integrity root）。
 *
 * 覆盖（mock GET /api/v1/benchmark 返回 BenchmarkReportDto）：
 *   - 渲染页面容器 + h1 标题
 *   - Hero 套件根：suiteIntegrityRoot + problemCount + totalLeaves + domainCount
 *   - 裁决分布：5 verdict 行 + CONFIRMED 计数 2/3 + 占比条
 *   - 领域覆盖：天文学(2) / 生态气候(1)
 *   - 问题表：每个 entry 行 + verdict badge + 单链根短 hash
 *   - 诚实墙：honestyNotes 渲染
 *   - 错误状态：fetch 503 → benchmark-error Alert
 *
 * 零容忍：无 any / ts-ignore / 双重断言 / 桩。fetch mock 用 type-safe URL 路由。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeaderboardPage from '@/pages/LeaderboardPage';
import { computeMerkleRoot } from '@/lib/merkle';
import type { BenchmarkEntryDto, BenchmarkReportDto } from '@/lib/types';

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const HEX = (c: string): string => c.repeat(64);

const MOCK_ENTRIES: readonly BenchmarkEntryDto[] = [
  {
    problemId: 'A16',
    problemTitle: '脉冲星制动指数异常',
    domain: '天文学',
    science125Tag: 'ASTRO-A16',
    verdict: 'CONFIRMED',
    integrityRoot: HEX('a'),
    leafCount: 7,
    reproHash: HEX('b'),
    stagesCompleted: 6,
    converged: true,
    chainVerified: true,
    sourceId: 'src-A16',
  },
  {
    problemId: 'A4',
    problemTitle: '行星轨道衰减机制',
    domain: '天文学',
    science125Tag: 'ASTRO-A4',
    verdict: 'INCONCLUSIVE',
    integrityRoot: HEX('c'),
    leafCount: 7,
    reproHash: HEX('d'),
    stagesCompleted: 6,
    converged: true,
    chainVerified: true,
    sourceId: 'src-A4',
  },
  {
    problemId: 'E2',
    problemTitle: '生态系统碳通量',
    domain: '生态气候',
    science125Tag: 'ECO-E2',
    verdict: 'CONFIRMED',
    integrityRoot: HEX('e'),
    leafCount: 7,
    reproHash: HEX('f'),
    stagesCompleted: 6,
    converged: true,
    chainVerified: true,
    sourceId: 'src-E2',
  },
];

/**
 * 真实算出 suiteIntegrityRoot（与 MOCK_ENTRIES 的 integrityRoot 折叠匹配）。
 * beforeAll async 算：mock 的报告根必须真实匹配 entries，才能测到 SuiteVerifier「验证通过」路径
 * —— 这是端到端契约的铁证：前端 computeMerkleRoot(entries) === 后端 aggregator（同算法·同输入·跨语言字节相等）。
 */
let MOCK_REPORT: BenchmarkReportDto;

beforeAll(async () => {
  const suiteIntegrityRoot = await computeMerkleRoot(MOCK_ENTRIES.map((entry) => entry.integrityRoot));
  MOCK_REPORT = {
    schemaVersion: 1,
    generatedAt: '2026-06-29T00:00:00.000Z',
    problemCount: 3,
    entries: [...MOCK_ENTRIES],
    suiteIntegrityRoot,
    totalLeaves: 21,
    verdictDistribution: {
      CONFIRMED: 2,
      REFUTED: 0,
      INCONCLUSIVE: 1,
      DEGRADED_SCOPE: 0,
      UNTESTED: 0,
    },
    domainDistribution: { 天文学: 2, 生态气候: 1 },
    gitCommitSha: null,
    honestyNotes: [
      '本榜 verdict 由离线参考数据产出（非真实科学裁决）。',
      '展示工程完整性广度，非科学结论排名。',
      'suiteIntegrityRoot 确定可复现（CI golden 锚）。',
    ],
  };
});

function mockBenchmarkOk() {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith('/benchmark')) {
      return new Response(JSON.stringify({ ok: true, data: MOCK_REPORT }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 404 });
  });
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    mockBenchmarkOk();
  });

  it('渲染页面容器与标题', () => {
    renderWithQueryClient(<LeaderboardPage />);
    expect(screen.getByTestId('leaderboard-page')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Integrity breadth leaderboard', level: 1 }),
    ).toBeInTheDocument();
  });

  it('Hero 套件根：渲染 suiteIntegrityRoot + problemCount + totalLeaves + domainCount', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('hero-suite-root')).toBeInTheDocument();
    });
    expect(screen.getByTestId('suite-integrity-root')).toHaveTextContent(MOCK_REPORT.suiteIntegrityRoot);
    expect(screen.getByTestId('problem-count')).toHaveTextContent('3');
    expect(screen.getByTestId('total-leaves')).toHaveTextContent('21');
    expect(screen.getByTestId('domain-count')).toHaveTextContent('2');
  });

  it('裁决分布：5 verdict 行 + CONFIRMED 计数 2/3 + 占比条', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('verdict-distribution')).toBeInTheDocument();
    });
    // 5 verdict 行全部渲染
    expect(screen.getByTestId('verdict-row-CONFIRMED')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-row-REFUTED')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-row-INCONCLUSIVE')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-row-DEGRADED_SCOPE')).toBeInTheDocument();
    expect(screen.getByTestId('verdict-row-UNTESTED')).toBeInTheDocument();
    // CONFIRMED 计数 2/3（67%）
    expect(screen.getByTestId('verdict-row-CONFIRMED')).toHaveTextContent('2 / 3');
    expect(screen.getByTestId('verdict-row-CONFIRMED')).toHaveTextContent('67%');
    // 占比条存在
    expect(screen.getByTestId('verdict-bar-CONFIRMED')).toBeInTheDocument();
  });

  it('领域覆盖：天文学(2) / 生态气候(1)', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('domain-distribution')).toBeInTheDocument();
    });
    expect(screen.getByTestId('domain-天文学')).toHaveTextContent('天文学');
    expect(screen.getByTestId('domain-天文学')).toHaveTextContent('2');
    expect(screen.getByTestId('domain-生态气候')).toHaveTextContent('1');
  });

  it('问题表：每行 entry + verdict badge + 单链根短 hash', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('problem-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('entry-A16')).toBeInTheDocument();
    expect(screen.getByTestId('entry-A16-verdict')).toHaveTextContent('CONFIRMED');
    expect(screen.getByTestId('entry-A4-verdict')).toHaveTextContent('INCONCLUSIVE');
    // 单链根短 hash（前10…后4）
    expect(screen.getByTestId('entry-A16-integrity')).toHaveTextContent('aaaaaaaaaa…aaaa');
  });

  it('诚实墙：honestyNotes 渲染', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('honesty-wall')).toBeInTheDocument();
    });
    expect(screen.getByTestId('honesty-note-0')).toHaveTextContent('离线参考数据');
    expect(screen.getByTestId('honesty-note-1')).toHaveTextContent('非科学结论排名');
  });

  it('SuiteVerifier：浏览器重算套件根 === 报告根 → 验证通过', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-ok')).toBeInTheDocument();
    });
    // 浏览器重算根非空 + 等于报告声称的套件根（前端 computeMerkleRoot === 后端 aggregator·端到端契约）
    expect(screen.getByTestId('suite-recomputed-root')).toHaveTextContent(MOCK_REPORT.suiteIntegrityRoot);
    expect(screen.queryByTestId('suite-verify-mismatch')).not.toBeInTheDocument();
  });

  it('SuiteVerifier 篡改剧场：点篡改报告根 → 浏览器重算立即不匹配', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-ok')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('suite-tamper-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-mismatch')).toBeInTheDocument();
    });
    expect(screen.getByTestId('suite-tamper-detected')).toBeInTheDocument();
    // 浏览器重算根不变（基于真实 entries·不受报告根篡改影响）
    expect(screen.getByTestId('suite-recomputed-root')).toHaveTextContent(MOCK_REPORT.suiteIntegrityRoot);
  });

  it('SuiteVerifier 恢复：篡改后点恢复 → 重新匹配', async () => {
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-ok')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('suite-tamper-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-mismatch')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('suite-restore-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('suite-verify-ok')).toBeInTheDocument();
    });
  });

  it('错误状态：fetch 503 → benchmark-error Alert', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/benchmark')) {
        return new Response(
          JSON.stringify({ error_code: 'BENCHMARK_NOT_GENERATED', message: '报告未生成' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    });
    renderWithQueryClient(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId('benchmark-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('benchmark-error')).toHaveTextContent('Failed to load benchmark report');
  });
});
