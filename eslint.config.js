/**
 * ESLint flat config —— 根后端 src/ 零容忍闸门 #2。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/10_CI_pipeline.md §2 STEP3（lint = eslint src --max-warnings 0）/
 *            CLAUDE.md 零容忍 Z1（:any）/ Z2（@ts-ignore / @ts-nocheck）/ Z3（空 catch）。
 *
 * 与 frontend/eslint.config.js 同构（@eslint/js + typescript-eslint recommended + 零容忍三条 error），
 * 仅剥离 react / react-hooks 插件（后端无 JSX）。
 *
 * 与 scripts/zero_tolerance_scan.mjs 互补：zero_tolerance_scan 是项目自定义 Z1–Z16 扫描（含 F4 禁词 /
 * 百炼 SDK 幻觉源 / X-DashScope-Enable-Thinking 等项目专属模式）；ESLint 是通用 JS/TS 闸门（unused-vars /
 * no-empty / ts-comment 等）。两者共同构成 STEP1（zero-tolerance）+ STEP3（lint）双闸门。
 *
 * 模型中立：本配置文件不持 Qwen / 百炼 / DashScope 字面量（src/ 受 R9-2-14 模型中立 grep 守护）。
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // 零容忍 Z1：禁裸 any（与 zero_tolerance_scan Z1 双重守护）
      '@typescript-eslint/no-explicit-any': 'error',
      // 零容忍 Z2：禁 @ts-ignore / @ts-nocheck（ban-ts-comment 含完整性校验）
      '@typescript-eslint/ban-ts-comment': 'error',
      // 零容忍 Z3：禁空 catch 块（allowEmptyCatch: false）
      'no-empty': ['error', { allowEmptyCatch: false }],
      // 下划线前缀参数 / catch-error = 有意未使用（签名契约占位 / 强制 catch 形参）。
      // 故意不配 varsIgnorePattern：局部变量赋值未用仍报错（捕获真死代码，非契约）。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // 只 lint src/（`eslint src` 范围）；防御性忽略其余目录与配置文件
    ignores: ['dist/', 'node_modules/', 'frontend/', 'tests/', 'scripts/', 'ci/', '*.config.*'],
  },
);
