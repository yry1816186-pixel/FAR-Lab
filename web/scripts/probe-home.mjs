import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:3290/#/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const probe = await page.evaluate(() => {
  const q = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { sel, visible: r.width > 0 && r.height > 0, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, placeholder: el.getAttribute('placeholder'), bg: cs.backgroundColor, border: cs.borderColor, color: cs.color, fontSize: cs.fontSize };
  };
  return {
    qwelcome: q('.qwelcome'),
    input: q('.qw-input'),
    go: q('.qw-go'),
    goDisabled: document.querySelector('.qw-go')?.disabled,
    chips: [...document.querySelectorAll('.qw-chip')].map((c) => c.textContent?.trim()),
    note: document.querySelector('.qw-note')?.textContent,
    rows: [...document.querySelectorAll('.queue-item')].slice(0, 4).map((r) => ({ cls: r.className, dot: getComputedStyle(r.querySelector('.q-dot')).backgroundColor, title: r.querySelector('.q-title')?.textContent?.slice(0, 50), act: r.querySelector('.q-act')?.textContent })),
  };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
