/**
 * Vitest 全局测试初始化。
 *
 * - 注入 @testing-library/jest-dom 自定义匹配器（toBeInTheDocument 等）。
 * - jsdom 不实现 fetch / matchMedia / crypto.subtle，使用 vi.stubGlobal / defineProperty 提供默认 mock。
 * - 每个用例后清理 DOM 与 mock 调用记录，避免跨用例污染。
 */
import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 不实现 fetch，提供默认 mock（返回 503 占位）；测试用例按需覆盖。
vi.stubGlobal('fetch', vi.fn());

// jsdom 的 window.crypto 不实现 subtle.digest（jsdom issue #2400，长期未实现）。
// 注入 Node WebCrypto（完整 Crypto 对象·含 subtle），使浏览器侧 merkle 重算（crypto.subtle.digest）
// 在测试里跑真实 SHA-256 算法而非 mock——这样 IntegrityPage 的 golden 向量断言验证的是真实的
// 跨语言密码学一致性（浏览器 Web Crypto === Node/Python golden）。
// 仅测试环境生效：test-setup.ts 不进 vite build 生产 bundle（生产浏览器原生提供 crypto.subtle）。
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// jsdom 不实现 window.matchMedia（ThemeProvider 依赖）。
// 提供最小 mock：默认匹配亮色模式，支持 addEventListener/removeEventListener。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    dispatchEvent: vi.fn(),
  })),
});

// jsdom's window.scrollTo exists but prints a console notice on every call.
// on every call. Replace it with a silent no-op so RouteEffects' scroll-to-top
// (and any future scroll call) runs cleanly in the test environment. No test
// asserts on real scroll offsets today; if one needs to, it can spy/restore.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
