// design-palette-probe.mjs — FAR-Lab 方向①「证据排印」色板 v1 计算与验证
// 方法：OKLCH -> sRGB（CSS Color 4 矩阵）-> WCAG 相对亮度对比度；全部数值实算，无口说。
// 用法：node spikes/design-palette-probe.mjs
// 输出：终端表格 + research/wave-product-reports/design-palette-v1.json

const oklchToHex = (L, C, H) => {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  let clamped = false;
  const enc = (x) => {
    let v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    if (v < 0) { v = 0; clamped = true; }
    if (v > 1) { v = 1; clamped = true; }
    return Math.round(v * 255);
  };
  const hex = '#' + [r, g, bl].map((x) => enc(x).toString(16).padStart(2, '0')).join('');
  return { hex, clamped, oklch: { L: +L.toFixed(3), C: +C.toFixed(3), H } };
};

const luminance = (hex) => {
  const n = hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255);
  const lin = n.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const fmt = (x) => x.toFixed(2);

// 在 [lo, hi] 内以 step 搜索满足对比度约束的最大 L（美观上尽量保留原 L）
const searchL = (C, H, bgHex, minContrast, { lo = 0.2, hi = 0.9, step = 0.005, dir = 'down' } = {}) => {
  if (dir === 'down') {
    for (let L = hi; L >= lo; L -= step) {
      const t = oklchToHex(L, C, H);
      if (contrast(t.hex, bgHex) >= minContrast) return { ...t, L: +L.toFixed(3), ratio: contrast(t.hex, bgHex) };
    }
  } else {
    for (let L = lo; L <= hi; L += step) {
      const t = oklchToHex(L, C, H);
      if (contrast(t.hex, bgHex) >= minContrast) return { ...t, L: +L.toFixed(3), ratio: contrast(t.hex, bgHex) };
    }
  }
  return null;
};

// ---------- 亮色模式 ----------
const NEUTRAL_HUE = 250;
const NEUTRAL_C = 0.004;
const light = {};
light.pageBg = oklchToHex(0.965, NEUTRAL_C, NEUTRAL_HUE);
light.surface = oklchToHex(0.99, NEUTRAL_C, NEUTRAL_HUE);
light.surface2 = oklchToHex(0.945, NEUTRAL_C, NEUTRAL_HUE);
light.border = oklchToHex(0.87, NEUTRAL_C, NEUTRAL_HUE);
// 分隔线(decorative)不需要 3:1；表单控件边框取 WCAG 1.4.11 的 3:1：
const formBorder = searchL(NEUTRAL_C, NEUTRAL_HUE, light.surface.hex, 3.0, { hi: 0.75, dir: 'down' });
light.formBorder = { ...oklchToHex(formBorder.L, NEUTRAL_C, NEUTRAL_HUE), note: '3:1 表单边框' };
light.text3 = searchL(NEUTRAL_C, NEUTRAL_HUE, light.surface.hex, 3.0, { hi: 0.7, dir: 'down' });
light.text2 = searchL(NEUTRAL_C, NEUTRAL_HUE, light.surface.hex, 4.5, { hi: 0.6, dir: 'down' });
light.text1 = searchL(NEUTRAL_C, NEUTRAL_HUE, light.surface.hex, 7.0, { hi: 0.42, dir: 'down' });
light.btnInk = oklchToHex(0.18, 0.008, NEUTRAL_HUE); // 近黑主按钮

// 状态色：文本变体须 ≥4.5:1 on surface；tint 底 L~0.95 + 同色系文本须 ≥4.5:1 on tint
const STATES = [
  { key: 'verified', hue: 150, C: 0.125 },   // 已验证（受保护 anchor）
  { key: 'refuted', hue: 27, C: 0.155 },     // 已反驳/失败
  { key: 'unknown', hue: 300, C: 0.13 },     // 未知/未验证
  { key: 'caution', hue: 95, C: 0.115 },     // 弱化/部分
  { key: 'info', hue: 250, C: 0.13 },        // 运行中/信息
];
const lightStates = {};
for (const s of STATES) {
  const txt = searchL(s.C, s.hue, light.surface.hex, 4.5, { hi: 0.62, lo: 0.25, dir: 'down' });
  const tintC = Math.min(s.C, 0.045);
  const tint = oklchToHex(0.96, tintC, s.hue);
  // 徽章专用：tint 底上的文本须独立满足 4.5（Primer/Carbon 双文本变体法）
  const txtOnTint = searchL(s.C, s.hue, tint.hex, 4.5, { hi: 0.55, lo: 0.2, dir: 'down' });
  const onTint = contrast(txtOnTint.hex, tint.hex);
  lightStates[s.key] = { text: txt, tint, textOnTint: txtOnTint, onTintRatio: +onTint.toFixed(2), tintPass: onTint >= 4.5 };
}

// ---------- 暗色模式 ----------
const dark = {};
dark.pageBg = oklchToHex(0.165, 0.005, NEUTRAL_HUE);
dark.surface = oklchToHex(0.205, 0.005, NEUTRAL_HUE);
dark.surface2 = oklchToHex(0.245, 0.005, NEUTRAL_HUE);
dark.border = oklchToHex(0.31, 0.005, NEUTRAL_HUE);
const darkFormBorder = searchL(NEUTRAL_C, NEUTRAL_HUE, dark.surface.hex, 3.0, { lo: 0.3, hi: 0.6, dir: 'up' });
dark.formBorder = { ...oklchToHex(darkFormBorder.L, NEUTRAL_C, NEUTRAL_HUE), note: '3:1 表单边框' };
dark.text2 = searchL(NEUTRAL_C, NEUTRAL_HUE, dark.surface.hex, 4.5, { lo: 0.55, hi: 0.75, dir: 'up' });
dark.text1 = searchL(NEUTRAL_C, NEUTRAL_HUE, dark.surface.hex, 7.0, { lo: 0.75, hi: 0.95, dir: 'up' });
dark.btnInk = oklchToHex(0.88, 0.008, NEUTRAL_HUE); // 暗色下主按钮=高亮中性（非彩色）

const darkStates = {};
for (const s of STATES) {
  const txt = searchL(s.C, s.hue, dark.surface.hex, 4.5, { lo: 0.6, hi: 0.9, dir: 'up' });
  const tint = oklchToHex(0.27, Math.min(s.C, 0.055), s.hue);
  const txtOnTint = searchL(s.C, s.hue, tint.hex, 4.5, { lo: 0.62, hi: 0.95, dir: 'up' });
  const onTint = contrast(txtOnTint.hex, tint.hex);
  darkStates[s.key] = { text: txt, tint, textOnTint: txtOnTint, onTintRatio: +onTint.toFixed(2), tintPass: onTint >= 4.5 };
}

// ---------- 输出 ----------
const row = (name, tok, ratio, need, pass) =>
  `${name.padEnd(16)} ${String(tok.hex).padEnd(8)} oklch(${tok.oklch.L} ${tok.oklch.C} ${tok.oklch.H})  ${fmt(ratio)}:1  (需${need}) ${pass ? 'PASS' : 'FAIL'}`;

console.log('=== 亮色 · 中性阶（surface=' + light.surface.hex + '）===');
console.log(row('text-1 主文本', light.text1, contrast(light.text1.hex, light.surface.hex), 7.0, contrast(light.text1.hex, light.surface.hex) >= 7));
console.log(row('text-2 次文本', light.text2, contrast(light.text2.hex, light.surface.hex), 4.5, contrast(light.text2.hex, light.surface.hex) >= 4.5));
console.log(row('text-3 占位', light.text3, contrast(light.text3.hex, light.surface.hex), 3.0, contrast(light.text3.hex, light.surface.hex) >= 3));
console.log(row('form-border', light.formBorder, contrast(light.formBorder.hex, light.surface.hex), 3.0, contrast(light.formBorder.hex, light.surface.hex) >= 3));
console.log(row('btn-ink 底', light.btnInk, contrast('#ffffff', light.btnInk.hex), 4.5, contrast('#ffffff', light.btnInk.hex) >= 4.5));
console.log('border(装饰) ' + light.border.hex + ' vs surface ' + fmt(contrast(light.border.hex, light.surface.hex)) + ':1（装饰线不适用 1.4.11）');

console.log('\n=== 亮色 · 认知状态色（文本 on surface ≥4.5；tint 上同文本 ≥4.5）===');
for (const [k, v] of Object.entries(lightStates)) {
  console.log(`${k.padEnd(10)} text=${v.text.hex} (L=${v.text.L}) on-surface ${fmt(contrast(v.text.hex, light.surface.hex))}:1  tint=${v.tint.hex} on-tint ${fmt(v.onTintRatio)}:1 ${v.tintPass ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== 暗色 · 中性阶（surface=' + dark.surface.hex + '）===');
console.log(row('text-1', dark.text1, contrast(dark.text1.hex, dark.surface.hex), 7.0, contrast(dark.text1.hex, dark.surface.hex) >= 7));
console.log(row('text-2', dark.text2, contrast(dark.text2.hex, dark.surface.hex), 4.5, contrast(dark.text2.hex, dark.surface.hex) >= 4.5));
console.log(row('form-border', dark.formBorder, contrast(dark.formBorder.hex, dark.surface.hex), 3.0, contrast(dark.formBorder.hex, dark.surface.hex) >= 3));
console.log('btn-ink 底 ' + dark.btnInk.hex + ' 上黑字 ' + fmt(contrast('#101114', dark.btnInk.hex)) + ':1');

console.log('\n=== 暗色 · 认知状态色 ===');
for (const [k, v] of Object.entries(darkStates)) {
  console.log(`${k.padEnd(10)} text=${v.text.hex} (L=${v.text.L}) on-surface ${fmt(contrast(v.text.hex, dark.surface.hex))}:1  tint=${v.tint.hex} on-tint ${fmt(v.onTintRatio)}:1 ${v.tintPass ? 'PASS' : 'FAIL'}`);
}

// 焦点指示环：用 text-1 同色，对 pageBg 验 3:1（SC 2.4.11）
console.log('\n焦点环=' + light.text1.hex + ' vs pageBg ' + fmt(contrast(light.text1.hex, light.pageBg.hex)) + ':1 (SC 2.4.11 需 3.0)');

const out = {
  generatedAt: new Date().toISOString(),
  method: 'OKLCH->sRGB (CSS Color 4) -> WCAG relative luminance contrast; L search to satisfy thresholds; no manual eyeballing',
  light: {
    neutrals: { pageBg: light.pageBg.hex, surface: light.surface.hex, surface2: light.surface2.hex, border: light.border.hex, formBorder: light.formBorder.hex, text3: light.text3.hex, text2: light.text2.hex, text1: light.text1.hex, btnInk: light.btnInk.hex },
    states: Object.fromEntries(Object.entries(lightStates).map(([k, v]) => [k, { text: v.text.hex, tint: v.tint.hex, textOnTint: v.textOnTint.hex, onSurface: +contrast(v.text.hex, light.surface.hex).toFixed(2), onTint: v.onTintRatio }])),
  },
  dark: {
    neutrals: { pageBg: dark.pageBg.hex, surface: dark.surface.hex, surface2: dark.surface2.hex, border: dark.border.hex, formBorder: dark.formBorder.hex, text2: dark.text2.hex, text1: dark.text1.hex, btnInk: dark.btnInk.hex },
    states: Object.fromEntries(Object.entries(darkStates).map(([k, v]) => [k, { text: v.text.hex, tint: v.tint.hex, textOnTint: v.textOnTint.hex, onSurface: +contrast(v.text.hex, dark.surface.hex).toFixed(2), onTint: v.onTintRatio }])),
  },
};
const fs = await import('node:fs');
fs.writeFileSync('research/wave-product-reports/design-palette-v1.json', JSON.stringify(out, null, 2) + '\n');
console.log('\nJSON -> research/wave-product-reports/design-palette-v1.json');
