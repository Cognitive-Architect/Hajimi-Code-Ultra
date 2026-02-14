/**
 * Jest 测试环境设置
 */
import '@testing-library/jest-dom';

// Mock fetch API
global.fetch = jest.fn();
