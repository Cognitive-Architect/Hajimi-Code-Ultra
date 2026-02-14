/**
 * TSA 生命周期管理模块
 * 
 * 导出所有生命周期相关功能：
 * - LifecycleManager: 生命周期管理器
 * - TTLManager: TTL 管理器
 * - LRUManager: LRU 管理器
 * - HookManager: 钩子管理器
 * - 类型定义
 */

// 主管理器
export { LifecycleManager, DEFAULT_LIFECYCLE_CONFIG } from './LifecycleManager';
export type { 
  LifecycleConfig, 
  CleanupResult, 
  MigrationReport,
  LifecycleEvent,
  LifecycleEventType,
  LifecycleEventHandler,
} from './LifecycleManager';

// TTL 管理器
export { TTLManager } from './TTLManager';
export type { TTLConfig } from './TTLManager';

// LRU 管理器
export { LRUManager } from './LRUManager';
export type { LRUConfig } from './LRUManager';

// 钩子管理器
export { HookManager, DEFAULT_HOOK_CONFIG } from './HookManager';
export type { HookConfig } from './HookManager';

// 类型定义
export type {
  // TTL
  TTLPolicy,
  ITTLManager,
  TTLScanResult,
  // LRU
  LRUPolicy,
  ILRUManager,
  MemoryPressure,
  LRUEvictionResult,
  // Hooks
  LifecycleHookType,
  LifecycleHook,
  LifecycleHookContext,
  LifecycleHooks,
  PersistContext,
  RestoreContext,
  EvictContext,
  ErrorContext,
  ExpireContext,
  AccessContext,
  MigrateContext,
  IHookManager,
  HookExecutionResult,
  // Extended Config
  ExtendedLifecycleConfig,
} from './types';

export {
  DEFAULT_TTL_POLICY,
  DEFAULT_LRU_POLICY,
  DEFAULT_EXTENDED_LIFECYCLE_CONFIG,
} from './types';
