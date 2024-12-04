import pluginJs from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'unused-imports': unusedImports,
      'simple-import-sort': simpleImportSort,
      'import': importPlugin
    },
    rules: {
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          'argsIgnorePattern': '^_'
        }
      ],
      '@typescript-eslint/no-use-before-define': 'off',
      'unused-imports/no-unused-imports': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'import/extensions': 'off',
      'import/no-duplicates': 'error',
      'import/no-extraneous-dependencies': 'off',
      'import/no-unresolved': 'off',
      'import/prefer-default-export': 'off',
      'import/newline-after-import': ['error', { 'count': 1 }],
      'camelcase': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'arrow-parens': ['error', 'as-needed'],
      'comma-dangle': ['error', 'only-multiline'],
      'func-names': ['error', 'as-needed'],
      'function-paren-newline': 'off',
      'implicit-arrow-linebreak': 'off',
      'quotes': ['error', 'single', { 'allowTemplateLiterals': false, 'avoidEscape': true }],
      'max-len': [
        'error',
        {
          'code': 160,
          'ignoreStrings': true
        }
      ],
      'indent': 'off',
      'no-await-in-loop': 'off',
      'no-confusing-arrow': 'off',
      'no-continue': 'off',
      'no-console': [
        'error',
        {
          'allow': ['warn', 'error', 'debug']
        }
      ],
      'no-nested-ternary': 'off',
      'no-plusplus': 'off',
      'no-redeclare': 'off',
      'no-restricted-syntax': 'off',
      'no-undef': 'off',
      'no-underscore-dangle': 'off',
      'no-unused-vars': [
        'error',
        {
          'argsIgnorePattern': '^_'
        }
      ],
      'no-shadow': 'off',
      'operator-linebreak': 'off',
      'no-bitwise': 'off'
    }
  }
];