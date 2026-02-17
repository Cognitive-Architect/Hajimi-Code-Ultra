/**
 * TSA (Time-Spatial Agent) 类型定义
 * 
 * @module lib/tsa/types
 * @version 1.3.0
 */

import { z } from 'zod';
import { TSAMonitor } from './monitor/TSAMonitor';

// ========== B-01/09 FIX: TSA核心类型导出 ==========

/**
 * TSA存储层级类型
 * - TRANSIENT: 临时层（内存）
 * - STAGING: 暂存层（Redis/IndexedDB）
 * - ARCHIVE: 归档层（文件系统）
 */
export type StorageTier = 'TRANSIENT' | 'STAGING' | 'ARCHIVE';

/**
 * 单层监控指标
 */
export interface TierMetrics {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

/**
 * TSA完整监控指标
 */
export interface TSAMetrics {
  transient: TierMetrics;
  staging: TierMetrics;
  archive: TierMetrics;
  overall: {
    totalReads: number;
    totalWrites: number;
    hitRate: number;
    avgResponseTime: number;
  };
}

/**
 * 存储统计信息
 */
export interface TSAStats {
  total: number;
  transient: number;
  staging: number;
  archive: number;
}

/**
 * TSA全局命名空间
 * 提供对TSA核心功能的访问
 */
export namespace tsa {
  // 监控器实例
  let monitorInstance: TSAMonitor | null = null;

  /**
   * 获取监控器实例（单例）
   */
  export function getMonitor(): TSAMonitor {
    if (!monitorInstance) {
      monitorInstance = new TSAMonitor();
    }
    return monitorInstance;
  }

  /**
   * 获取监控指标
   */
  export function getMetrics(): TSAMetrics {
    return getMonitor().getMetrics();
  }

  /**
   * 获取存储统计
   */
  export function getStats(): TSAStats {
    return {
      total: 0,
      transient: 0,
      staging: 0,
      archive: 0,
    };
  }

  /**
   * 重置监控指标
   */
  export function resetMetrics(): void {
    getMonitor().reset();
  }
  
  // ========== 存储操作 API (B-09 FIX) ==========
  
  // 内存存储（用于持久化）
  const storage = new Map<string, unknown>();
  let initialized = false;
  
  /**
   * 检查是否已初始化
   */
  export function isInitialized(): boolean {
    return initialized;
  }
  
  /**
   * 初始化TSA存储
   */
  export function init(): void {
    initialized = true;
  }
  
  /**
   * 存储数据
   * @param key 存储键
   * @param value 存储值
   * @param options 可选配置（ttl、tier等）
   */
  export function set<T>(key: string, value: T, options?: { ttl?: number; tier?: string }): void {
    storage.set(key, value);
    if (options?.ttl) {
      setTimeout(() => storage.delete(key), options.ttl);
    }
  }
  
  /**
   * 获取数据
   * @param key 存储键
   * @returns 存储值或undefined
   */
  export function get<T>(key: string): T | undefined {
    return storage.get(key) as T | undefined;
  }
  
  /**
   * 删除数据
   * @param key 存储键
   */
  export function remove(key: string): void {
    storage.delete(key);
  }
  
  /**
   * 获取所有键
   * @returns 键的迭代器
   */
  export function keys(): IterableIterator<string> {
    return storage.keys();
  }
  
  /**
   * 清空所有数据
   */
  export function clear(): void {
    storage.clear();
  }
  
  /**
   * 销毁TSA存储实例
   * 清理所有资源并重置状态
   */
  export function destroy(): void {
    storage.clear();
    initialized = false;
    monitorInstance = null;
  }
  
  /**
   * 获取TSA存储状态
   * @returns 当前状态信息
   */
  export function getStatus(): { 
    initialized: boolean; 
    size: number;
    backend: string;
    keyCount: number;
  } {
    return {
      initialized,
      size: storage.size,
      backend: 'memory',
      keyCount: storage.size,
    };
  }
}

// ========== 七状态机定义 ==========

export const AgentStateSchema = z.enum([
  'IDLE',        // 空闲
  'ACTIVE',      // 活跃
  'SUSPENDED',   // 暂停
  'TERMINATED',  // 已终止
  'ERROR',       // 错误
  'RECOVERING',  // 恢复中
  'MIGRATING',   // 迁移中
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

// ========== 状态流转规则 ==========

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  trigger: string;
  guard?: (context: TransitionContext) => boolean;
  action?: (context: TransitionContext) => void;
}

export interface TransitionContext {
  agentId: string;
  fromState: AgentState;
  toState: AgentState;
  trigger: string;
  payload?: unknown;
  timestamp: number;
}

// ========== 12条标准流转规则 ==========
export const STANDARD_TRANSITIONS: StateTransition[] = [
  { from: 'IDLE', to: 'ACTIVE', trigger: 'activate' },
  { from: 'ACTIVE', to: 'SUSPENDED', trigger: 'suspend' },
  { from: 'SUSPENDED', to: 'ACTIVE', trigger: 'resume' },
  { from: 'ACTIVE', to: 'TERMINATED', trigger: 'terminate' },
  { from: 'SUSPENDED', to: 'TERMINATED', trigger: 'terminate' },
  { from: 'ACTIVE', to: 'ERROR', trigger: 'error' },
  { from: 'SUSPENDED', to: 'ERROR', trigger: 'error' },
  { from: 'ERROR', to: 'RECOVERING', trigger: 'recover' },
  { from: 'RECOVERING', to: 'ACTIVE', trigger: 'recovered' },
  { from: 'RECOVERING', to: 'ERROR', trigger: 'recover_failed' },
  { from: 'ACTIVE', to: 'MIGRATING', trigger: 'migrate' },
  { from: 'MIGRATING', to: 'ACTIVE', trigger: 'migrated' },
];

// ========== TSA配置 ==========

export const TSAConfigSchema = z.object({
  persistence: z.object({
    enabled: z.boolean().default(true),
    storage: z.enum(['localStorage', 'memory']).default('localStorage'),
    key: z.string().default('tsa-state'),
  }),
  middleware: z.object({
    logging: z.boolean().default(true),
    persistence: z.boolean().default(true),
    monitoring: z.boolean().default(true),
  }),
  isolation: z.enum(['HARD', 'SOFT']).default('SOFT'),
});

export type TSAConfig = z.infer<typeof TSAConfigSchema>;

// ========== 状态历史 ==========

export interface StateHistoryEntry {
  from: AgentState;
  to: AgentState;
  trigger: string;
  timestamp: number;
  duration: number; // 在from状态的持续时间
}

// ========== BNF协议 ==========

export type BNFCommand = 
  | '[SPAWN]'
  | '[TERMINATE]'
  | '[VACUUM]'
  | '[SUSPEND]'
  | '[RESUME]'
  | '[MIGRATE]';

export interface BNFParsedCommand {
  command: BNFCommand;
  agentId?: string;
  payload?: Record<string, unknown>;
}
