import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@form-engine/*/src/**', '**/packages/*/src/**'] },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/{protocol,compiler,runtime,pure-functions}/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'process', 'Buffer'],
    },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: { ...hooks.configs.recommended.rules, ...a11y.configs.recommended.rules },
  },
  prettier,
];
