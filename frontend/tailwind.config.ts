import type { Config } from 'tailwindcss';

/**
 * FAR-Lab design tokens — Tailwind maps the semantic names below onto the CSS
 * variables defined in src/index.css (light default + .dark overrides).
 * Color is semantic, never decorative: verdict/status hues exist only to
 * encode scientific state, always paired with a text label in the UI.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        border: 'var(--border)',
        borderStrong: 'var(--border-strong)',
        ink: 'var(--ink)',
        ink2: 'var(--ink-2)',
        ink3: 'var(--ink-3)',
        accent: 'var(--accent)',
        accentInk: 'var(--accent-ink)',
        ok: 'var(--ok)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        info: 'var(--info)',
        vConfirmed: 'var(--v-confirmed)',
        vRefuted: 'var(--v-refuted)',
        vInconclusive: 'var(--v-inconclusive)',
        vDegraded: 'var(--v-degraded)',
        vUntested: 'var(--v-untested)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          '"Cascadia Mono"',
          'Consolas',
          '"Roboto Mono"',
          'monospace',
        ],
      },
      fontSize: {
        // Label/micro type for section headers and table captions.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
      },
      maxWidth: {
        page: '76rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
