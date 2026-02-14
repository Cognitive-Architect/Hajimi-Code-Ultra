/** @type {import('jest').Config} */

// B-02/04 FIX: 设置Redis环境变量
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/unit/hooks.test.ts',
  ],
  collectCoverageFrom: [
    'lib/core/**/*.ts',
    'lib/api/**/*.ts',
    'lib/tsa/**/*.ts',
    'app/hooks/**/*.ts',
    'patterns/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = config;
