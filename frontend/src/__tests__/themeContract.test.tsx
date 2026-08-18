import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThemeProvider, useTheme } from '@/components/theme/ThemeProvider';

/**
 * 主题契约测试(PR-03 · 主题面缺口补齐 + D-15 配套守护)。
 *
 * 两个锁定面(全部真实断言,无空检查):
 *   A. ThemeProvider 三态行为契约——此前组件行为零测试覆盖(仅 darkFoucPreload
 *      锁了 index.html 预绘脚本的源码事实,与组件运行时行为互不重叠):
 *        1. localStorage 持久化:setTheme/toggleTheme 写入 far-chain-theme,
 *           且再次挂载时以存储值为初始状态(跨会话连续性);
 *        2. system 模式跟随 OS:matchMedia 翻转 → .dark class 同步翻转;
 *        3. class 切换:resolvedTheme 与 <html>.dark 严格一致,显式偏好不被
 *           OS 翻转干扰;
 *        4. 键名与 index.html 预绘脚本同源(far-chain-theme)——漂移即暗色冷启动白闪。
 *   B. index.css / tailwind.config.ts 主题面契约:
 *        1. :root 与 .dark 均声明 color-scheme(原生控件/滚动条跟随主题);
 *        2. ::selection 消费 selection token(亮暗各一套);
 *        3. --overlay / --overlay-opacity 双调在场且经 tailwind overlay 色供给,
 *           dialog 遮罩不再硬编码 black(防第二套遮罩色源)。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'index.css'), 'utf-8');
const tailwindConfig = readFileSync(join(HERE, '..', '..', 'tailwind.config.ts'), 'utf-8');
const dialogSrc = readFileSync(join(HERE, '..', 'components', 'ui', 'dialog.tsx'), 'utf-8');
const workbenchSrc = readFileSync(join(HERE, '..', 'pages', 'ResearchWorkbenchPage.tsx'), 'utf-8');

/** 抽取顶层 `selector { ... }` 块体(token 声明无嵌套花括号)。 */
function blockOf(selector: ':root' | '.dark'): string {
  const match = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`index.css 缺少 ${selector} 块`);
  return match[1];
}

function tokenValue(block: string, name: string): string | undefined {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  return match?.[1].trim();
}

const ROOT = blockOf(':root');
const DARK = blockOf('.dark');

/* ======================== A. ThemeProvider 三态行为 ======================== */

/** 可控 matchMedia 工厂:测试内翻转 matches 并真实触发 change 监听器。 */
function makeMql(initiallyDark: boolean) {
  const listeners = new Set<(e: unknown) => void>();
  const mql = {
    matches: initiallyDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, fn: (e: unknown) => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: (e: unknown) => void) => void listeners.delete(fn),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    /** 模拟 OS 主题翻转:改 matches 并通知所有已注册监听器。 */
    setDark(next: boolean) {
      mql.matches = next;
      for (const fn of [...listeners]) fn({ matches: next });
    },
  };
  return mql;
}

/** 暴露 context 值的探针组件。 */
function Probe() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <span data-testid="probe" data-theme={theme} data-resolved={resolvedTheme}>
      {`${theme}/${resolvedTheme}`}
    </span>
  );
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('ThemeProvider 三态行为契约(PR-03)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('system 首访跟随 OS 偏好(暗)且持久化为 system', () => {
    const mql = makeMql(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(true);
    // 首访未交互 → 偏好仍为 system(不把 OS 推断写死成用户偏好)
    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-theme')).toBe('system');
  });

  it('system 模式下 OS 偏好翻转 → .dark class 同步翻转', () => {
    const mql = makeMql(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(false);
    act(() => mql.setDark(true));
    expect(isDark()).toBe(true);
    act(() => mql.setDark(false));
    expect(isDark()).toBe(false);
  });

  it('setTheme 持久化到 far-chain-theme 且 .dark class 与 resolvedTheme 一致', () => {
    const mql = makeMql(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    let setTheme!: (t: 'light' | 'dark' | 'system') => void;
    function Capture() {
      ({ setTheme } = useTheme());
      return null;
    }
    render(
      <ThemeProvider>
        <Capture />
      </ThemeProvider>,
    );
    act(() => setTheme('dark'));
    expect(localStorage.getItem('far-chain-theme')).toBe('dark');
    expect(isDark()).toBe(true);
    act(() => setTheme('light'));
    expect(localStorage.getItem('far-chain-theme')).toBe('light');
    expect(isDark()).toBe(false);
  });

  it('再次挂载以存储值为初始状态(跨会话连续性)', () => {
    const mql = makeMql(false); // OS 说亮色,但用户显式存了 dark
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    localStorage.setItem('far-chain-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(true);
    expect(document.querySelector('[data-testid="probe"]')?.textContent).toBe('dark/dark');
  });

  it('显式偏好不被 OS 翻转干扰(仅 system 模式跟随)', () => {
    const mql = makeMql(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    localStorage.setItem('far-chain-theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(false);
    act(() => mql.setDark(true));
    // 用户显式选了 light → OS 翻暗不得越权改页面主题
    expect(isDark()).toBe(false);
  });

  it('toggleTheme 取反 resolved 并持久化', () => {
    const mql = makeMql(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    let toggleTheme!: () => void;
    function Capture() {
      ({ toggleTheme } = useTheme());
      return null;
    }
    render(
      <ThemeProvider>
        <Capture />
      </ThemeProvider>,
    );
    act(() => toggleTheme());
    expect(localStorage.getItem('far-chain-theme')).toBe('dark');
    expect(isDark()).toBe(true);
    act(() => toggleTheme());
    expect(localStorage.getItem('far-chain-theme')).toBe('light');
    expect(isDark()).toBe(false);
  });

  it('存储键与 index.html 预绘脚本同源(键名漂移即暗色冷启动白闪)', () => {
    const html = readFileSync(join(HERE, '..', '..', 'index.html'), 'utf-8');
    expect(html).toContain("localStorage.getItem('far-chain-theme')");
    // 组件运行时确实使用该键
    localStorage.setItem('far-chain-theme', 'dark');
    const mql = makeMql(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(true);
  });

  it('非法存储值回退 system(不崩溃不残留)', () => {
    const mql = makeMql(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    localStorage.setItem('far-chain-theme', 'hotdog-dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-theme')).toBe('system');
    expect(isDark()).toBe(true); // 跟随 OS 暗
  });
});

/* ======================== B. index.css / config 主题面契约 ======================== */

describe('主题面契约 — color-scheme / selection / overlay(PR-03)', () => {
  it.each([
    [':root', ROOT, 'light'],
    ['.dark', DARK, 'dark'],
  ] as const)('%s 声明 color-scheme: %s(原生控件/滚动条跟随主题)', (_label, block, expected) => {
    expect(block).toContain(`color-scheme: ${expected}`);
  });

  it('::selection 消费 selection token 且亮暗双调 token 齐备', () => {
    const rule = /::selection\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'index.css 缺少 ::selection 规则').not.toBeNull();
    const body = rule !== null ? rule[1] : '';
    expect(body).toContain('hsl(var(--selection) / var(--selection-alpha))');
    for (const [label, block] of [
      [':root', ROOT],
      ['.dark', DARK],
    ] as const) {
      expect(tokenValue(block, 'selection'), `${label} 缺 --selection`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
      expect(tokenValue(block, 'selection-alpha'), `${label} 缺 --selection-alpha`).toMatch(/^0?\.\d+$|^1(\.0+)?$/);
    }
    // 亮暗必须不同调(单调选区即回归)
    expect(tokenValue(ROOT, 'selection')).not.toBe(tokenValue(DARK, 'selection'));
  });

  it('--overlay / --overlay-opacity 双调在场且经 tailwind overlay 色供给', () => {
    for (const [label, block] of [
      [':root', ROOT],
      ['.dark', DARK],
    ] as const) {
      expect(tokenValue(block, 'overlay'), `${label} 缺 --overlay`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
      expect(tokenValue(block, 'overlay-opacity'), `${label} 缺 --overlay-opacity`).toMatch(/^0?\.\d+$/);
    }
    expect(tailwindConfig).toContain("overlay: 'hsl(var(--overlay) / var(--overlay-opacity))'");
  });

  it('dialog 遮罩消费 overlay token,硬编码黑遮罩清零', () => {
    expect(dialogSrc).toContain('bg-overlay');
    expect(dialogSrc).not.toMatch(/bg-black\/?\d*/);
  });

  it('D-15:needs-API-key 徽章消费 warning token 配对(amber 硬编码清零)', () => {
    // liveNeedsKey 徽章段内不得再出现 amber-* 原始调色板类名
    const badgeSegment = workbenchSrc.split("t('research.mode.liveNeedsKey')")[0].split('keyConfigured === false')[1];
    expect(badgeSegment, '未找到 needs-API-key 徽章段').toBeDefined();
    expect(badgeSegment).not.toContain('amber-');
    expect(badgeSegment).toContain('bg-warning');
    expect(badgeSegment).toContain('text-warning-foreground');
  });
});
