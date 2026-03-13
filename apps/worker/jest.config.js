/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/index.ts'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@semkiest/shared-config/env/worker$':
      '<rootDir>/../../packages/shared-config/src/env/worker',
    '^@semkiest/shared-config/env/redis$':
      '<rootDir>/../../packages/shared-config/src/env/redis',
    '^@semkiest/shared-config(.*)$': '<rootDir>/../../packages/shared-config/src$1',
    '^@semkiest/shared-types(.*)$': '<rootDir>/../../packages/shared-types/src$1',
    '^@semkiest/shared-utils(.*)$': '<rootDir>/../../packages/shared-utils/src$1',
    '^@semkiest/db(.*)$': '<rootDir>/../../packages/db/src$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
};
