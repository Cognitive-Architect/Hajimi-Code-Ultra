/** @type {import('jest').Config} */

// Hooks 测试专用配置 - 使用 jsdom 环境
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/tests/unit/hooks/**/*.test.ts'],
  collectCoverageFrom: [
    'app/hooks/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};

module.exports = config;
