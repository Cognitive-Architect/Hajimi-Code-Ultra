/**
 * Quintant 错误码定义
 * 
 * DEBT-001: QuintantErrorCode 类型定义缺失修复
 * 
 * @module lib/quintant/error-codes
 * @version 1.0.0
 */

// ============================================================================
// 错误码枚举 - TypeScript 类型安全
// ============================================================================

/**
 * Quintant 标准错误码枚举
 * 用于 A2A 适配器和 QuintantService 的错误处理
 */
export enum QuintantErrorCode {
  // 操作失败错误
  SPAWN_FAILED = 'SPAWN_FAILED',
  LIFECYCLE_FAILED = 'LIFECYCLE_FAILED',
  VACUUM_FAILED = 'VACUUM_FAILED',
  TERMINATE_FAILED = 'TERMINATE_FAILED',
  STATUS_FAILED = 'STATUS_FAILED',

  // 验证错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // 代理状态错误
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_EXISTS = 'AGENT_EXISTS',

  // 隔离级别错误
  CONTEXT_LEAK = 'CONTEXT_LEAK',

  // 适配器错误
  ADAPTER_NOT_FOUND = 'ADAPTER_NOT_FOUND',
  ADAPTER_UNAUTHORIZED = 'ADAPTER_UNAUTHORIZED',
  ADAPTER_ERROR = 'ADAPTER_ERROR',
}

// ============================================================================
// 兼容常量对象 - JavaScript 运行时
// ============================================================================

/**
 * 兼容常量对象
 * 便于 JavaScript 代码和旧版本代码使用
 */
export const ErrorCode = {
  SPAWN_FAILED: 'SPAWN_FAILED',
  LIFECYCLE_FAILED: 'LIFECYCLE_FAILED',
  VACUUM_FAILED: 'VACUUM_FAILED',
  TERMINATE_FAILED: 'TERMINATE_FAILED',
  STATUS_FAILED: 'STATUS_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_EXISTS: 'AGENT_EXISTS',
  CONTEXT_LEAK: 'CONTEXT_LEAK',
  ADAPTER_NOT_FOUND: 'ADAPTER_NOT_FOUND',
  ADAPTER_UNAUTHORIZED: 'ADAPTER_UNAUTHORIZED',
  ADAPTER_ERROR: 'ADAPTER_ERROR',
} as const;

// ============================================================================
// 类型推导
// ============================================================================

/**
 * 错误码类型 - 从枚举推导
 */
export type QuintantErrorCodeType = `${QuintantErrorCode}`;

/**
 * 错误码类型 - 从常量对象推导
 */
export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];
