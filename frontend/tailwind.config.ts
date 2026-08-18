import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// ============================================================
// FAR-Lab Design Token System (R-09)
// 视觉气质:Precise · Calm · Evidentiary (严谨 / 可信 / 科学 / 学术)
// 参考:Apple HIG / Linear / Vercel / Anthropic / DeepMind
// 所有颜色经 CSS 变量(hsl(var(--x)))消费,亮暗主题在 index.css 分别精调。
// ============================================================

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // ---- shadcn 语义层(经 CSS 变量,亮暗主题化) ----
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // ---- Overlay(PR-03 主题契约):Dialog/AlertDialog 遮罩,不再硬编码 black/80 ----
        overlay: 'hsl(var(--overlay) / var(--overlay-opacity))',

        // ---- Brand 主色(ink-blue 11 阶,亮暗共用) ----
        brand: {
          50: 'hsl(var(--brand-50))',
          100: 'hsl(var(--brand-100))',
          200: 'hsl(var(--brand-200))',
          300: 'hsl(var(--brand-300))',
          400: 'hsl(var(--brand-400))',
          500: 'hsl(var(--brand-500))',
          600: 'hsl(var(--brand-600))',
          700: 'hsl(var(--brand-700))',
          800: 'hsl(var(--brand-800))',
          900: 'hsl(var(--brand-900))',
          950: 'hsl(var(--brand-950))',
        },

        // ---- Accent(品牌对比色 · cyan-teal,克制用于强调) ----
        brandaccent: {
          400: 'hsl(var(--accent-brand-400))',
          500: 'hsl(var(--accent-brand-500))',
        },

        // ---- 5 值裁决色阶(vivid=icon/border · solid=badge bg+白字 AA) ----
        verdict: {
          confirmed: 'hsl(var(--verdict-confirmed))',
          'confirmed-solid': 'hsl(var(--verdict-confirmed-solid))',
          'confirmed-foreground': 'hsl(var(--verdict-confirmed-foreground))',
          refuted: 'hsl(var(--verdict-refuted))',
          'refuted-solid': 'hsl(var(--verdict-refuted-solid))',
          'refuted-foreground': 'hsl(var(--verdict-refuted-foreground))',
          inconclusive: 'hsl(var(--verdict-inconclusive))',
          'inconclusive-foreground': 'hsl(var(--verdict-inconclusive-foreground))',
          degraded: 'hsl(var(--verdict-degraded))',
          'degraded-solid': 'hsl(var(--verdict-degraded-solid))',
          'degraded-foreground': 'hsl(var(--verdict-degraded-foreground))',
          untested: 'hsl(var(--verdict-untested))',
          'untested-foreground': 'hsl(var(--verdict-untested-foreground))',
        },

        // ---- 语义状态色(success/warning · D-04 token 供给,亮暗主题化) ----
        // warning 不设 solid 变体(黄底+白字不达 AA,配 warning-foreground 深字)。
        success: {
          DEFAULT: 'hsl(var(--success))',
          solid: 'hsl(var(--success-solid))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
      },

      // ---- 字体族 ----
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        display: ['Geist', 'Inter', '"PingFang SC"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      // ---- 字号阶(1.25 modular scale 基底) ----
      fontSize: {
        // 2xs:微标/徽章内文本(11px),收敛 text-[10px]/text-[11px] 任意值(D-04 供给)
        '2xs': ['0.6875rem', { lineHeight: '1.4' }],
        // display:hero/页面主标题(responsive clamp)
        display: ['clamp(2rem, 5vw, 3.5rem)', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        h1: ['1.875rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.015em' }],
        h2: ['1.5rem', { lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }],
        h3: ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        h4: ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        h5: ['1rem', { lineHeight: '1.45', fontWeight: '600' }],
        h6: ['0.875rem', { lineHeight: '1.5', fontWeight: '600' }],
        // body 默认 1rem 由 Tailwind base 提供;caption/sm = 0.875rem
      },

      // ---- 圆角阶(学术偏小) ----
      borderRadius: {
        none: '0',
        sm: '0.125rem', // 2px
        md: '0.25rem', // 4px
        lg: 'var(--radius)', // 8px (shadcn baseline)
        xl: '0.75rem', // 12px
        '2xl': '1rem', // 16px
        full: '9999px',
      },

      // ---- 阴影阶(克制 · slate-900 投影,避免堆叠) ----
      boxShadow: {
        xs: '0 1px 2px 0 hsl(222 47% 11% / 0.04)',
        sm: '0 1px 3px 0 hsl(222 47% 11% / 0.06), 0 1px 2px -1px hsl(222 47% 11% / 0.05)',
        md: '0 4px 6px -1px hsl(222 47% 11% / 0.07), 0 2px 4px -2px hsl(222 47% 11% / 0.05)',
        lg: '0 10px 15px -3px hsl(222 47% 11% / 0.08), 0 4px 6px -4px hsl(222 47% 11% / 0.05)',
        xl: '0 20px 25px -5px hsl(222 47% 11% / 0.1), 0 8px 10px -6px hsl(222 47% 11% / 0.05)',
        '2xl': '0 25px 50px -12px hsl(222 47% 11% / 0.18)',
        inner: 'inset 0 2px 4px 0 hsl(222 47% 11% / 0.05)',
      },

      // ---- 动效曲线(precise/standard/spring · 不覆盖 Tailwind 默认 ease-*) ----
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        precise: 'cubic-bezier(0.4, 0, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      // ---- 动效时长(fast/normal/slow/very-slow 语义别名) ----
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
        'very-slow': '600ms',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
