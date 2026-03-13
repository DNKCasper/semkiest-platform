/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@semkiest/shared-types(.*)$': '<rootDir>/../../packages/shared-types/src$1',
    '^@semkiest/shared-utils(.*)$': '<rootDir>/../../packages/shared-utils/src$1',
    '^@semkiest/shared-config(.*)$': '<rootDir>/../../packages/shared-config/src$1',
    '^@semkiest/db(.*)$': '<rootDir>/../../packages/db/src$1',
  },
};
