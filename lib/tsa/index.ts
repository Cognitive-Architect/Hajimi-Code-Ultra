/**
 * TSA模块入口
 * 
 * @module lib/tsa
 * @version 1.3.0
 */

// ========== 核心类型导出 ==========
export type {
  // B-01/09 FIX: 导出TSA核心类型
  StorageTier,
  TierMetrics,
  TSAMetrics,
  TSAStats,
} from './types';

// B-01/09 FIX: 导出tsa命名空间
export { tsa } from './types';

// 重新导出其他模块
export * from './types';
export * from './state-machine';
export * from './middleware';
export { useTSA, useAgentLifecycle } from './hooks/useTSA';
export { default } from './state-machine';

// DEBT-007 FIX: 导出TSA状态持久化
export {
  TSAState,
  TSAStatePersistence,
  IndexedDBStateStorage,
  RedisStateStorage,
  tsaStatePersistence,
  type PersistedState,
  type StateStorageAdapter,
} from './state-persistence';
