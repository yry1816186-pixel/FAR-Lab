import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 暗色 FOUC 预绘锁（审计批次 4·源码契约测试）。
 *
 * jsdom 无法加载 index.html 执行预绘脚本——本测试锁三个源码事实，任一丢失
 * 即红（回归到"React mount 后才加 .dark → 冷启动白闪一帧"）：
 *   1. <head> 内存在同步脚本且读取 localStorage['far-chain-theme']
 *      （与 ThemeProvider STORAGE_KEY 同源——键名漂移即红）；
 *   2. 脚本含 prefers-color-scheme 回退（首次访问用户跟随 OS）；
 *   3. 脚本预置 documentElement.classList.add('dark') 且在首个样式表/模块
 *      脚本之前（阻塞执行序——位置后移即失效）。
 */
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf-8');

describe('暗色 FOUC 预绘（index.html 源码契约）', () => {
  it('预绘脚本存在且与 ThemeProvider 同键（far-chain-theme）', () => {
    expect(html).toContain("localStorage.getItem('far-chain-theme')");
  });

  it('prefers-color-scheme 回退在场（首访跟随 OS）', () => {
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it('预置 .dark 且脚本阻塞位置先于 React 入口（<head> 内、main.tsx 之前）', () => {
    const scriptAt = html.indexOf("classList.add('dark')");
    const headEnd = html.indexOf('</head>');
    const entryAt = html.indexOf('/src/main.tsx');
    expect(scriptAt).toBeGreaterThan(0);
    // 预绘脚本必须在 <head> 内（首帧前执行）且先于 React 入口
    expect(scriptAt).toBeLessThan(headEnd);
    expect(scriptAt).toBeLessThan(entryAt);
  });

  it('theme-color 随应用内主题改写（不再仅跟随 OS media 查询）', () => {
    expect(html).toContain("meta.setAttribute('content', dark ? '#0a0e1a' : '#2258be')");
  });
});
