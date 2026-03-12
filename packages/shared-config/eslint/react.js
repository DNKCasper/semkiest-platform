import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import baseConfig from './base.js';

/**
 * ESLint flat config for React / Next.js applications.
 * Extends the base TypeScript config with React-specific rules.
 */
export default tseslint.config(
  ...baseConfig,
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React core
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // TypeScript handles prop types
      'react/display-name': 'warn',
      'react/no-unescaped-entities': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-target-blank': ['error', { enforceDynamicLinks: 'always' }],
      'react/self-closing-comp': ['error', { component: true, html: true }],

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
