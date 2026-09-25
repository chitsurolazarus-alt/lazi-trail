import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'release'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['*.js', '*.config.ts', 'tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The desktop wrapper is a CommonJS Node/Electron script.
    files: ['desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, Response: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // The service worker runs in a worker scope, not in the page.
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
