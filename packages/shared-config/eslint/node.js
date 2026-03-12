import globals from 'globals';
import tseslint from 'typescript-eslint';

import baseConfig from './base.js';

/**
 * ESLint flat config for Node.js server applications (Express, workers).
 * Extends the base TypeScript config with Node-specific rules.
 */
export default tseslint.config(
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Node.js specific
      'no-process-exit': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

      // Stricter TypeScript for server code
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
    },
  },
);
