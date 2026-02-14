/**
 * TSA 生命周期管理类型定义
 * 
 * 功能：
 * - TTL 策略配置
 * - LRU 淘汰策略
 * - 生命周期事件钩子
 */

import { Tier, DataEntry } from '../migration/TierMigration';

// ============================================================================
// TTL 策略
// ============================================================================

export interface TTLPolicy {
  /** 默认 TTL（毫秒），-1 表示永不过期 */
  defaultTTL: number;
  /** 每层特定 TTL 配置 */
  tierTTL: Record<Tier, number>;
  /** 是否启用动态 TTL 调整 */
  enableDynamicTTL: boolean;
  /** 动态 TTL 调整因子（0-1之间） */
  dynamicFactor: number;
}

export const DEFAULT_TTL_POLICY: TTLPolicy = {
  defaultTTL: 60 * 60 * 1000, // 1小时
  tierTTL: {
    transient: 5 * 60 * 1000,   // 5分钟
    staging: 60 * 60 * 1000,    // 1小时
    archive: -1,                // 永不过期
  },
  enableDynamicTTL: false,
  dynamicFactor: 0.5,
};

// ============================================================================
// LRU 淘汰策略
// ============================================================================

export interface LRUPolicy {
  /** 最大内存条目数 */
  maxEntries: number;
  /** 内存压力阈值（0-1之间） */
  memoryPressureThreshold: number;
  /** 每次淘汰比例（0-1之间） */
  evictionRatio: number;
  /** 最小保留条目数 */
  minEntries: number;
  /** 是否启用访问计数加权 */
  useWeightedAccess: boolean;
}

export const DEFAULT_LRU_POLICY: LRUPolicy = {
  maxEntries: 10000,
  memoryPressureThreshold: 0.8,
  evictionRatio: 0.1,
  minEntries: 100,
  useWeightedAccess: true,
};

export interface MemoryPressure {
  /** 当前内存使用比例（0-1之间） */
  usedRatio: number;
  /** 是否达到压力阈值 */
  isUnderPressure: boolean;
  /** 建议淘汰数量 */
  suggestedEvictionCount: number;
}

// ============================================================================
// 生命周期事件钩子
// ============================================================================

export type LifecycleHookType = 
  | 'onPersist'   // 持久化前
  | 'onRestore'   // 恢复后
  | 'onEvict'     // 淘汰时
  | 'onError'     // 错误时
  | 'onExpire'    // 过期时
  | 'onAccess'    // 访问时
  | 'onMigrate';  // 迁移时

export interface LifecycleHookContext {
  key: string;
  tier: Tier;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PersistContext extends LifecycleHookContext {
  value: unknown;
  targetTier: Tier;
}

export interface RestoreContext extends LifecycleHookContext {
  value: unknown;
  sourceTier: Tier;
}

export interface EvictContext extends LifecycleHookContext {
  reason: 'ttl' | 'lru' | 'manual' | 'memory_pressure';
  value?: unknown;
}

export interface ErrorContext extends LifecycleHookContext {
  error: Error;
  operation: string;
}

export interface ExpireContext extends LifecycleHookContext {
  expiredAt: number;
  ttl: number;
}

export interface AccessContext extends LifecycleHookContext {
  accessCount: number;
  lastAccessed: number;
}

export interface MigrateContext extends LifecycleHookContext {
  fromTier: Tier;
  toTier: Tier;
  value: unknown;
}

export type LifecycleHook<T = LifecycleHookContext> = (context: T) => void | Promise<void>;

export interface LifecycleHooks {
  onPersist?: LifecycleHook<PersistContext>;
  onRestore?: LifecycleHook<RestoreContext>;
  onEvict?: LifecycleHook<EvictContext>;
  onError?: LifecycleHook<ErrorContext>;
  onExpire?: LifecycleHook<ExpireContext>;
  onAccess?: LifecycleHook<AccessContext>;
  onMigrate?: LifecycleHook<MigrateContext>;
}

// ============================================================================
// 扩展配置
// ============================================================================

export interface ExtendedLifecycleConfig {
  /** TTL 策略 */
  ttlPolicy: TTLPolicy;
  /** LRU 策略 */
  lruPolicy: LRUPolicy;
  /** 生命周期钩子 */
  hooks: LifecycleHooks;
  /** 扫描间隔（毫秒） */
  scanInterval: number;
  /** 是否启用自动扫描 */
  enableAutoScan: boolean;
  /** 单次最大扫描条目数 */
  maxScanPerRun: number;
}

export const DEFAULT_EXTENDED_LIFECYCLE_CONFIG: ExtendedLifecycleConfig = {
  ttlPolicy: DEFAULT_TTL_POLICY,
  lruPolicy: DEFAULT_LRU_POLICY,
  hooks: {},
  scanInterval: 30 * 1000, // 30秒
  enableAutoScan: true,
  maxScanPerRun: 500,
};

// ============================================================================
// TTL 管理器接口
// ============================================================================

export interface ITTLManager {
  /** 设置条目 TTL */
  setTTL(key: string, ttl: number): void;
  /** 获取条目 TTL */
  getTTL(key: string): number | undefined;
  /** 检查条目是否过期 */
  isExpired(entry: DataEntry, customTTL?: number): boolean;
  /** 获取过期时间 */
  getExpirationTime(entry: DataEntry, customTTL?: number): number;
  /** 计算动态 TTL */
  calculateDynamicTTL(entry: DataEntry): number;
}

// ============================================================================
// LRU 管理器接口
// ============================================================================

export interface ILRUManager {
  /** 记录访问 */
  recordAccess(key: string): void;
  /** 获取访问计数 */
  getAccessCount(key: string): number;
  /** 检查内存压力 */
  checkMemoryPressure(currentEntries: number): MemoryPressure;
  /** 选择要淘汰的条目 */
  selectForEviction<T>(entries: DataEntry<T>[], count: number): DataEntry<T>[];
  /** 更新内存使用统计 */
  updateMemoryStats(usedEntries: number, totalEntries: number): void;
}

// ============================================================================
// 钩子管理器接口
// ============================================================================

export interface IHookManager {
  /** 注册钩子 */
  register<T>(type: LifecycleHookType, hook: LifecycleHook<T>): () => void;
  /** 触发钩子 */
  emit<T>(type: LifecycleHookType, context: T): Promise<void>;
  /** 检查是否有钩子 */
  hasHook(type: LifecycleHookType): boolean;
  /** 清除所有钩子 */
  clear(): void;
}

// ============================================================================
// 操作结果
// ============================================================================

export interface TTLScanResult {
  /** 扫描的条目数 */
  scanned: number;
  /** 发现的过期条目 */
  expired: string[];
  /** 已清理的条目数 */
  cleaned: number;
  /** 错误信息 */
  errors: string[];
}

export interface LRUEvictionResult {
  /** 淘汰的条目数 */
  evicted: number;
  /** 淘汰的键列表 */
  evictedKeys: string[];
  /** 内存压力状态 */
  memoryPressure: MemoryPressure;
  /** 错误信息 */
  errors: string[];
}

export interface HookExecutionResult {
  /** 钩子类型 */
  type: LifecycleHookType;
  /** 是否成功 */
  success: boolean;
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 错误信息 */
  error?: string;
}
