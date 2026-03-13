import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@semkiest/shared-config$': '<rootDir>/../../packages/shared-config/src',
    '^@semkiest/shared-types$': '<rootDir>/../../packages/shared-types/src',
    '^@semkiest/shared-utils$': '<rootDir>/../../packages/shared-utils/src',
    '^@semkiest/db$': '<rootDir>/../../packages/db/src',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
};

export default config;
