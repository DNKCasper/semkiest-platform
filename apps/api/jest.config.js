/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@semkiest/db$': '<rootDir>/../../packages/db/src/index.ts',
    '^@semkiest/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@semkiest/shared-utils$': '<rootDir>/../../packages/shared-utils/src/index.ts',
    '^@semkiest/shared-config$': '<rootDir>/../../packages/shared-config/src/index.ts',
  },
};
