/**
 * TSA 持久化层
 * 
 * B-04/09: 实现TSA真实Redis持久化层
 * B-05/09: 实现TSA三层降级韧性（Redis→IndexedDB→Memory）
 * 
 * 提供多种存储适配器：
 * - RedisStore: Upstash Redis REST API 支持
 * - IndexedDBStore: 浏览器 IndexedDB 本地持久化
 * - MemoryStore: 内存存储（兜底方案）
 * - TieredFallback: 三层韧性管理器（自动故障转移）
 * 
 * 三层降级架构：
 * Tier 1: RedisStore（高性能远程存储）
 *    ↓ 失败时降级
 * Tier 2: IndexedDBStore（本地持久化）
 *    ↓ 失败时降级
 * Tier 3: MemoryStore（内存兜底）
 * 
 * DEBT-004 清偿标记: TSA虚假持久化 → 已实现三层韧性存储
 */

// B-04: Redis 存储
export { RedisStore, StorageAdapter, createRedisStore } from './RedisStore';
export type { RedisConfig } from './RedisStore';

// B-05/09: IndexedDB 存储
export { IndexedDBStore, DataPriority } from './IndexedDBStore';
export type { 
  StorageAdapter as IStorageAdapter, 
  SetOptions,
  IndexedDBStoreConfig,
  IndexedDBStoredItem,
} from './IndexedDBStore';

// B-05/09: 三层韧性管理器
export { 
  TieredFallback, 
  MemoryStore,
  TierLevel,
  DEFAULT_FALLBACK_CONFIG,
} from './TieredFallback';
export type { 
  FallbackConfig, 
  TierStatus, 
  FallbackEvent,
  FallbackEventHandler,
} from './TieredFallback';

// 默认导出
export { TieredFallback as default } from './TieredFallback';
