import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'build/**', 'node_modules/**', 'coverage/**', 'web/**', 'desktop/**', 'artifacts/**', 'evidence/**', '.far-run/**', '.cache/**', '.control/**', 'research/**', 'zcode-harness/**', 'spikes/**', '.playwright-mcp/**', '.ruff_cache/**', 'experiment-runtime/.venv/**', '**/frontend/dist/**', '.far/**', '.zcode/**', 'far-lab-suite/**', 'work/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
