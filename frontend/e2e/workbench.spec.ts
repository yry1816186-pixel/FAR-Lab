// frontend/e2e/workbench.spec.ts — 科研工作台浏览器端到端（CPS-5 第一步）
//
// 诚实边界：这些测试验证「工作台真实渲染 + 真实 API 链路 + 失败如实呈现」；
// 它们不验证科学结论（模型账户欠费时提交断言应如实呈现失败，而非伪造裁决）。
import { test, expect } from '@playwright/test';

test('首页渲染：品牌、主导航、断言输入、运行时状态', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FAR-Lab/);
  await expect(page.getByRole('link', { name: /FAR-Lab/ })).toBeVisible();
  for (const nav of ['检验', '证据', '运行', '证明']) {
    await expect(page.getByRole('link', { name: nav, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('textbox', { name: '要核验的科学断言' })).toBeVisible();
  // 运行时状态徽标（API 健康检查的真实结果）。
  await expect(page.getByText(/API:/)).toBeVisible();
});

test('导航可达：证据页与证明页路由真实渲染', async ({ page }) => {
  await page.goto('/evidence');
  await expect(page).toHaveTitle(/FAR-Lab/);
  await page.goto('/verify');
  await expect(page).toHaveTitle(/FAR-Lab/);
});

test('提交断言：模型不可用时如实呈现失败（不伪造裁决/信封）', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '要核验的科学断言' });
  await input.fill('在 TESS 系外行星样本上，行星半径与 log10(辐照) 显著相关。');
  await page.getByRole('button', { name: '运行判定' }).click();
  // 失败路径如实呈现：alert 说明运行未能完成判定 + 下一步指引；不产出伪造裁决。
  await expect(page.getByRole('alert')).toContainText('运行未能完成判定');
  await expect(page.getByRole('alert')).toContainText('下一步');
});
