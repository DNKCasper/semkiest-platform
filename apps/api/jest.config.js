/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@semkiest/db$': '<rootDir>/../../../packages/db/src/index.ts',
    '^@semkiest/shared-config$': '<rootDir>/../../../packages/shared-config/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.test.ts', '!**/index.ts'],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 70 },
  },
};
