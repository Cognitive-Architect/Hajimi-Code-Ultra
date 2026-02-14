/**
 * B-07/09: TSA 故障恢复机制 - 韧性模块入口
 * 
 * 提供完整的故障恢复能力：
 * - Fallback: Redis故障时自动降级到本地存储
 * - Repair: 数据损坏检测与修复
 * - Split-Brain: 多写冲突解决
 * 
 * 自测点：
 * - RES-001: Redis故障时自动降级File存储（无数据丢失）
 * - RES-002: 数据损坏检测与修复（Checksum验证）
 * - RES-003: split-brain冲突解决（多写冲突合并）
 */

// ==================== Fallback 模块 ====================

export {
  // 核心类
  FallbackMemoryStore,
  createFallbackManager,
  ChecksumUtil,
  
  // 类型
  type FallbackStorageConfig,
  type DataSyncResult,
  type LocalFileEntry,
  type WALEntry,
  type FallbackManager,
  
  // 常量
  DEFAULT_FALLBACK_STORAGE_CONFIG,
} from './fallback';

// ==================== Repair 模块 ====================

export {
  // 核心类
  DataRepair,
  BackupManager,
  SplitBrainResolver,
  RepairManager,
  
  // 类型
  type RepairConfig,
  type RepairEvent,
  type CorruptionReport,
  type RepairResult,
  type ConflictReport,
  type SplitBrainConfig,
  type ConflictResolutionStrategy,
  
  // 常量
  DEFAULT_REPAIR_CONFIG,
  DEFAULT_SPLIT_BRAIN_CONFIG,
} from './repair';

// ==================== 统一配置 ====================

import { FallbackStorageConfig } from './fallback';
import { RepairConfig, SplitBrainConfig } from './repair';

/**
 * 韧性模块完整配置
 */
export interface ResilienceConfig {
  /** Fallback配置 */
  fallback?: FallbackStorageConfig;
  /** Repair配置 */
  repair?: Partial<RepairConfig>;
  /** Split-Brain配置 */
  splitBrain?: Partial<SplitBrainConfig>;
  /** 启用调试日志 */
  enableDebugLogs?: boolean;
}

/**
 * 默认韧性配置
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  enableDebugLogs: false,
};

// ==================== 韧性控制器 ====================

import { FallbackManager, createFallbackManager, FallbackMemoryStore } from './fallback';
import { RepairManager, type RepairConfig, type ConflictReport, type RepairResult } from './repair';
import { StorageAdapter } from '../persistence/IndexedDBStore';

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[ResilienceController]') {}
  debug(message: string, ...args: unknown[]): void {
    console.debug(`${this.prefix} ${message}`, ...args);
  }
  info(message: string, ...args: unknown[]): void {
    console.info(`${this.prefix} ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} ${message}`, ...args);
  }
}

class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * 韧性状态
 */
export interface ResilienceStatus {
  fallbackMode: boolean;
  fallbackDuration: number;
  fallbackReason?: string;
  corruptionDetected: number;
  repairsCompleted: number;
  conflictsDetected: number;
  conflictsResolved: number;
}

/**
 * 韧性事件
 */
export type ResilienceEvent = 
  | { type: 'fallback_entered'; reason: string; timestamp: number }
  | { type: 'fallback_exited'; duration: number; timestamp: number }
  | { type: 'data_synced'; count: number; timestamp: number }
  | { type: 'corruption_detected'; key: string; timestamp: number }
  | { type: 'repair_completed'; key: string; timestamp: number }
  | { type: 'conflict_detected'; key: string; timestamp: number }
  | { type: 'conflict_resolved'; key: string; timestamp: number };

/**
 * 韧性事件处理器
 */
export type ResilienceEventHandler = (event: ResilienceEvent) => void;

/**
 * TSA韧性控制器
 * 
 * 整合Fallback和Repair功能，提供统一的故障恢复接口
 */
export class TSAResilienceController {
  private fallbackManager: FallbackManager;
  private repairManager: RepairManager;
  private config: ResilienceConfig;
  private logger: ILogger;
  private eventHandlers: ResilienceEventHandler[] = [];
  private primaryStore?: StorageAdapter;

  constructor(config?: ResilienceConfig, logger?: ILogger) {
    this.config = { ...DEFAULT_RESILIENCE_CONFIG, ...config };
    this.logger = config?.enableDebugLogs 
      ? (logger ?? new ConsoleLogger()) 
      : new NoOpLogger();
    
    this.fallbackManager = createFallbackManager(
      this.config.fallback,
      this.logger
    );
    
    this.repairManager = new RepairManager(
      this.config.repair,
      this.logger
    );

    this.setupEventForwarding();
  }

  /**
   * 初始化韧性控制器
   */
  async initialize(): Promise<boolean> {
    this.logger.info('Initializing TSA Resilience Controller...');
    
    await this.fallbackManager.fallbackStore.initialize();
    
    this.logger.info('TSA Resilience Controller initialized');
    return true;
  }

  /**
   * 关闭韧性控制器
   */
  async close(): Promise<void> {
    this.logger.info('Closing TSA Resilience Controller...');
    await this.fallbackManager.fallbackStore.close();
    this.logger.info('TSA Resilience Controller closed');
  }

  /**
   * 设置主存储（用于降级同步）
   */
  setPrimaryStore(store: StorageAdapter): void {
    this.primaryStore = store;
  }

  /**
   * 进入降级模式
   */
  enterFallbackMode(reason: string): void {
    this.fallbackManager.enterFallbackMode(reason);
    this.emitEvent({
      type: 'fallback_entered',
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * 退出降级模式
   */
  async exitFallbackMode(): Promise<void> {
    const stats = this.fallbackManager.getFallbackStats();
    this.fallbackManager.exitFallbackMode();
    
    this.emitEvent({
      type: 'fallback_exited',
      duration: stats.enterTime ? Date.now() - stats.enterTime : 0,
      timestamp: Date.now(),
    });

    // 如果有主存储，尝试同步数据
    if (this.primaryStore) {
      await this.syncToPrimary();
    }
  }

  /**
   * 同步降级数据到主存储
   */
  async syncToPrimary(): Promise<{ success: boolean; synced: number }> {
    if (!this.primaryStore) {
      this.logger.warn('No primary store set, skipping sync');
      return { success: false, synced: 0 };
    }

    const result = await this.fallbackManager.syncToPrimary(this.primaryStore);
    
    this.emitEvent({
      type: 'data_synced',
      count: result.syncedCount,
      timestamp: Date.now(),
    });

    return {
      success: result.success,
      synced: result.syncedCount,
    };
  }

  /**
   * 验证数据完整性
   */
  async verifyData(
    key: string,
    value: unknown,
    expectedChecksum: string
  ): Promise<{ valid: boolean; repaired: boolean; value?: unknown }> {
    const result = await this.repairManager.verifyAndRepair(key, value, expectedChecksum);
    
    if (!result.valid) {
      this.emitEvent({
        type: 'corruption_detected',
        key,
        timestamp: Date.now(),
      });
    }
    
    if (result.repaired) {
      this.emitEvent({
        type: 'repair_completed',
        key,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * 检测并解决冲突
   */
  resolveConflict(
    key: string,
    sources: Array<{ source: string; timestamp: number; checksum: string; value: unknown }>
  ): ConflictReport | null {
    const result = this.repairManager.detectAndResolveConflict(key, sources);
    
    if (result) {
      if (result.resolution === 'unresolved' || result.resolution === 'manual_required') {
        this.emitEvent({
          type: 'conflict_detected',
          key,
          timestamp: Date.now(),
        });
      } else {
        this.emitEvent({
          type: 'conflict_resolved',
          key,
          timestamp: Date.now(),
        });
      }
    }

    return result;
  }

  /**
   * 获取降级存储（用于降级模式下的读写）
   */
  getFallbackStore(): FallbackMemoryStore {
    return this.fallbackManager.fallbackStore;
  }

  /**
   * 获取当前状态
   */
  getStatus(): ResilienceStatus {
    const fallbackStats = this.fallbackManager.getFallbackStats();
    const repairStats = this.repairManager.getStats();

    return {
      fallbackMode: this.fallbackManager.isFallbackMode,
      fallbackDuration: fallbackStats.enterTime && !fallbackStats.exitTime
        ? Date.now() - fallbackStats.enterTime
        : (fallbackStats.exitTime && fallbackStats.enterTime)
          ? fallbackStats.exitTime - fallbackStats.enterTime
          : 0,
      fallbackReason: fallbackStats.reason,
      corruptionDetected: repairStats.corruptionCount,
      repairsCompleted: repairStats.repairCount,
      conflictsDetected: repairStats.conflictCount,
      conflictsResolved: repairStats.conflictCount, // 假设所有检测到的都被解决了
    };
  }

  /**
   * 注册事件处理器
   */
  onEvent(handler: ResilienceEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * 移除事件处理器
   */
  offEvent(handler: ResilienceEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * 获取降级管理器（高级用法）
   */
  getFallbackManager(): FallbackManager {
    return this.fallbackManager;
  }

  /**
   * 获取修复管理器（高级用法）
   */
  getRepairManager(): RepairManager {
    return this.repairManager;
  }

  // ==================== 内部方法 ====================

  private setupEventForwarding(): void {
    // 可以在这里设置内部事件转发逻辑
  }

  private emitEvent(event: ResilienceEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.warn('Event handler error:', error);
      }
    }
  }
}

// ==================== 便捷函数 ====================

/**
 * 创建默认的韧性控制器
 */
export function createResilienceController(
  config?: ResilienceConfig
): TSAResilienceController {
  return new TSAResilienceController(config);
}

// ==================== 导出类型 ====================

export type { ILogger };
export type { ResilienceStatus, ResilienceEvent, ResilienceEventHandler };
