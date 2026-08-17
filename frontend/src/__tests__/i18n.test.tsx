import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider, useI18n } from '@/lib/i18n';

/**
 * i18n Provider 测试 — locale 持久化 + <html lang> 镜像（WCAG 3.1.1）。
 *
 * 审计 F7 修复：头注释曾宣称 "mirrored to <html lang>" 但从未实现——
 * 中文界面配 lang="en" 会让读屏器用英文音素读中文。
 */

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="current-locale">{locale}</span>
      <button type="button" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} data-testid="switch-locale">
        switch
      </button>
    </div>
  );
}

describe('I18nProvider — <html lang> 镜像', () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    window.localStorage.clear();
  });

  it('locale 切换同步更新 documentElement.lang（zh ↔ en）', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    );
    expect(screen.getByTestId('current-locale')).toHaveTextContent(/en|zh/);
    await user.click(screen.getByTestId('switch-locale'));
    const after = screen.getByTestId('current-locale').textContent;
    expect(document.documentElement.lang).toBe(after); // zh→'zh', en→'en'
  });

  it('挂载即镜像当前 locale（冷启动读屏器即正确）', () => {
    window.localStorage.setItem('far-lang', 'zh');
    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    );
    expect(screen.getByTestId('current-locale')).toHaveTextContent('zh');
    expect(document.documentElement.lang).toBe('zh');
    act(() => {
      document.documentElement.lang = 'en'; // reset for afterEach cleanliness
    });
  });
});
