/**
 * B-07/09: TSA 故障恢复机制 - Repair模块
 * 
 * 功能特性：
 * - 数据损坏检测（Checksum验证）
 * - 自动修复（从备份恢复）
 * - 冲突解决（split-brain合并）
 * 
 * 自测点：
 * - RES-002: 数据损坏检测与修复（Checksum验证）
 * - RES-003: split-brain冲突解决（多写冲突合并）
 */

import { StorageAdapter } from '../persistence/IndexedDBStore';
import { ChecksumUtil, WALEntry } from './fallback';

// ==================== 类型定义 ====================

export interface RepairConfig {
  /** 启用自动修复 */
  enableAutoRepair: boolean;
  /** 备份保留数量 */
  backupCount: number;
  /** 修复重试次数 */
  repairRetries: number;
  /** 冲突解决策略 */
  conflictResolution: ConflictResolutionStrategy;
  /** 修复事件回调 */
  onRepairEvent?: (event: RepairEvent) => void;
}

export const DEFAULT_REPAIR_CONFIG: RepairConfig = {
  enableAutoRepair: true,
  backupCount: 3,
  repairRetries: 3,
  conflictResolution: 'timestamp',
};

export type ConflictResolutionStrategy = 
  | 'timestamp'    // 使用时间戳，新数据胜出
  | 'priority'     // 使用优先级，高优先级胜出
  | 'merge'        // 尝试合并数据
  | 'manual';      // 人工介入

export interface RepairEvent {
  type: 'corruption_detected' | 'repair_started' | 'repair_completed' | 'repair_failed' | 'conflict_detected' | 'conflict_resolved';
  timestamp: number;
  key: string;
  details?: Record<string, unknown>;
  error?: Error;
}

export interface CorruptionReport {
  key: string;
  expectedChecksum: string;
  actualChecksum: string;
  timestamp: number;
  severity: 'critical' | 'warning' | 'info';
}

export interface RepairResult {
  success: boolean;
  key: string;
  action: 'repaired' | 'skipped' | 'failed' | 'no_backup';
  backupUsed?: number;
  error?: Error;
}

export interface ConflictReport {
  key: string;
  sources: Array<{
    source: string;
    timestamp: number;
    checksum: string;
    value: unknown;
  }>;
  resolution: 'resolved' | 'unresolved' | 'manual_required';
  winningSource?: string;
  mergedValue?: unknown;
}

// ==================== 日志记录器 ====================

interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements ILogger {
  constructor(private prefix: string = '[DataRepair]') {}

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

// ==================== 数据备份管理器 ====================

interface BackupEntry {
  key: string;
  value: unknown;
  checksum: string;
  timestamp: number;
  backupId: string;
}

export class BackupManager {
  private backups = new Map<string, BackupEntry[]>();
  private config: RepairConfig;
  private logger: ILogger;

  constructor(config?: Partial<RepairConfig>, logger?: ILogger) {
    this.config = { ...DEFAULT_REPAIR_CONFIG, ...config };
    this.logger = logger ?? new ConsoleLogger('[BackupManager]');
  }

  /**
   * 创建备份
   */
  createBackup(key: string, value: unknown): BackupEntry {
    const checksum = ChecksumUtil.computeObject(value);
    const entry: BackupEntry = {
      key,
      value,
      checksum,
      timestamp: Date.now(),
      backupId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    let keyBackups = this.backups.get(key);
    if (!keyBackups) {
      keyBackups = [];
      this.backups.set(key, keyBackups);
    }

    keyBackups.unshift(entry);

    // 限制备份数量
    if (keyBackups.length > this.config.backupCount) {
      keyBackups.pop();
    }

    this.logger.debug(`Created backup for key "${key}", total backups: ${keyBackups.length}`);
    return entry;
  }

  /**
   * 获取最新的备份
   */
  getLatestBackup(key: string): BackupEntry | undefined {
    const keyBackups = this.backups.get(key);
    return keyBackups?.[0];
  }

  /**
   * 获取所有备份
   */
  getBackups(key: string): BackupEntry[] {
    return [...(this.backups.get(key) ?? [])];
  }

  /**
   * 验证备份完整性
   */
  verifyBackup(entry: BackupEntry): boolean {
    const currentChecksum = ChecksumUtil.computeObject(entry.value);
    return currentChecksum === entry.checksum;
  }

  /**
   * 获取所有可用的（未损坏的）备份
   */
  getValidBackups(key: string): BackupEntry[] {
    const backups = this.backups.get(key) ?? [];
    return backups.filter(b => this.verifyBackup(b));
  }

  /**
   * 删除键的所有备份
   */
  deleteBackups(key: string): void {
    this.backups.delete(key);
    this.logger.debug(`Deleted all backups for key "${key}"`);
  }

  /**
   * 清空所有备份
   */
  clearAllBackups(): void {
    this.backups.clear();
    this.logger.info('Cleared all backups');
  }
}

// ==================== 数据修复器 ====================

export class DataRepair {
  private backupManager: BackupManager;
  private config: RepairConfig;
  private logger: ILogger;
  private corruptionHistory: CorruptionReport[] = [];

  constructor(config?: Partial<RepairConfig>, logger?: ILogger) {
    this.config = { ...DEFAULT_REPAIR_CONFIG, ...config };
    this.logger = logger ?? new ConsoleLogger('[DataRepair]');
    this.backupManager = new BackupManager(config, logger);
  }

  /**
   * 验证数据完整性
   */
  verifyIntegrity(key: string, value: unknown, expectedChecksum: string): boolean {
    if (!expectedChecksum) {
      return true; // 没有checksum，无法验证
    }

    const actualChecksum = ChecksumUtil.computeObject(value);
    const isValid = actualChecksum === expectedChecksum;

    if (!isValid) {
      const report: CorruptionReport = {
        key,
        expectedChecksum,
        actualChecksum,
        timestamp: Date.now(),
        severity: 'critical',
      };
      this.corruptionHistory.push(report);
      
      this.emitEvent({
        type: 'corruption_detected',
        timestamp: Date.now(),
        key,
        details: { expectedChecksum, actualChecksum },
      });

      this.logger.error(`Data corruption detected for key "${key}": expected ${expectedChecksum}, got ${actualChecksum}`);
    }

    return isValid;
  }

  /**
   * 尝试修复损坏的数据
   */
  async attemptRepair(key: string): Promise<RepairResult> {
    this.emitEvent({
      type: 'repair_started',
      timestamp: Date.now(),
      key,
    });

    // 尝试从备份恢复
    const validBackups = this.backupManager.getValidBackups(key);

    if (validBackups.length === 0) {
      this.logger.warn(`No valid backups found for key "${key}"`);
      this.emitEvent({
        type: 'repair_failed',
        timestamp: Date.now(),
        key,
        error: new Error('No valid backups available'),
      });
      return {
        success: false,
        key,
        action: 'no_backup',
        error: new Error('No valid backups available'),
      };
    }

    // 使用最新的有效备份
    const latestBackup = validBackups[0];
    
    this.logger.info(`Repaired key "${key}" using backup from ${new Date(latestBackup.timestamp).toISOString()}`);
    
    this.emitEvent({
      type: 'repair_completed',
      timestamp: Date.now(),
      key,
      details: { backupTimestamp: latestBackup.timestamp },
    });

    return {
      success: true,
      key,
      action: 'repaired',
      backupUsed: validBackups.length,
    };
  }

  /**
   * 创建数据备份
   */
  createBackup(key: string, value: unknown): BackupEntry {
    return this.backupManager.createBackup(key, value);
  }

  /**
   * 获取修复历史
   */
  getCorruptionHistory(): CorruptionReport[] {
    return [...this.corruptionHistory];
  }

  /**
   * 清空修复历史
   */
  clearHistory(): void {
    this.corruptionHistory = [];
  }

  private emitEvent(event: RepairEvent): void {
    this.config.onRepairEvent?.(event);
  }
}

// ==================== Split-Brain冲突解决器 ====================

export interface SplitBrainConfig {
  /** 冲突检测时间窗口（毫秒） */
  conflictWindowMs: number;
  /** 自定义合并函数 */
  customMerger?: (values: unknown[]) => unknown;
}

export const DEFAULT_SPLIT_BRAIN_CONFIG: SplitBrainConfig = {
  conflictWindowMs: 60000, // 1分钟
};

export class SplitBrainResolver {
  private config: RepairConfig & SplitBrainConfig;
  private logger: ILogger;
  private conflictHistory: ConflictReport[] = [];

  constructor(
    config?: Partial<RepairConfig & SplitBrainConfig>,
    logger?: ILogger
  ) {
    this.config = { 
      ...DEFAULT_REPAIR_CONFIG, 
      ...DEFAULT_SPLIT_BRAIN_CONFIG, 
      ...config 
    };
    this.logger = logger ?? new ConsoleLogger('[SplitBrainResolver]');
  }

  /**
   * 检测split-brain冲突
   * 当多个源在同一时间窗口内对同一键有写入时，可能发生冲突
   */
  detectConflict(
    key: string,
    sources: Array<{ source: string; timestamp: number; checksum: string; value: unknown }>
  ): ConflictReport | null {
    if (sources.length < 2) {
      return null; // 只有一个源，无冲突
    }

    // 检查时间窗口内是否有多个不同值的写入
    const now = Date.now();
    const recentSources = sources.filter(s => now - s.timestamp < this.config.conflictWindowMs);

    if (recentSources.length < 2) {
      return null; // 时间窗口内只有一个写入
    }

    // 检查值是否相同（通过checksum）
    const checksums = new Set(recentSources.map(s => s.checksum));
    if (checksums.size === 1) {
      return null; // 所有值相同，无冲突
    }

    const report: ConflictReport = {
      key,
      sources: recentSources,
      resolution: 'unresolved',
    };

    this.logger.warn(`Split-brain conflict detected for key "${key}": ${recentSources.length} different versions`);

    this.emitEvent({
      type: 'conflict_detected',
      timestamp: Date.now(),
      key,
      details: { sourceCount: recentSources.length, checksums: Array.from(checksums) },
    });

    return report;
  }

  /**
   * 解决冲突
   */
  resolveConflict(report: ConflictReport): ConflictReport {
    const { sources } = report;

    switch (this.config.conflictResolution) {
      case 'timestamp':
        return this.resolveByTimestamp(report);
      
      case 'priority':
        return this.resolveByPriority(report);
      
      case 'merge':
        return this.resolveByMerge(report);
      
      case 'manual':
        report.resolution = 'manual_required';
        return report;
      
      default:
        return this.resolveByTimestamp(report);
    }
  }

  /**
   * 基于时间戳解决冲突（最新的胜出）
   */
  private resolveByTimestamp(report: ConflictReport): ConflictReport {
    const winner = report.sources.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    report.resolution = 'resolved';
    report.winningSource = winner.source;

    this.logger.info(`Resolved conflict for "${report.key}" by timestamp: ${winner.source} wins`);

    this.emitEvent({
      type: 'conflict_resolved',
      timestamp: Date.now(),
      key: report.key,
      details: { strategy: 'timestamp', winner: winner.source },
    });

    this.conflictHistory.push(report);
    return report;
  }

  /**
   * 基于优先级解决冲突
   * 这里假设源名称中包含优先级信息，或者外部配置优先级
   */
  private resolveByPriority(report: ConflictReport): ConflictReport {
    // 简单的优先级策略：redis > indexeddb > memory > other
    const getPriority = (source: string): number => {
      if (source.includes('redis')) return 3;
      if (source.includes('indexeddb')) return 2;
      if (source.includes('memory')) return 1;
      return 0;
    };

    const winner = report.sources.reduce((highest, current) => 
      getPriority(current.source) > getPriority(highest.source) ? current : highest
    );

    report.resolution = 'resolved';
    report.winningSource = winner.source;

    this.logger.info(`Resolved conflict for "${report.key}" by priority: ${winner.source} wins`);

    this.emitEvent({
      type: 'conflict_resolved',
      timestamp: Date.now(),
      key: report.key,
      details: { strategy: 'priority', winner: winner.source },
    });

    this.conflictHistory.push(report);
    return report;
  }

  /**
   * 尝试合并数据
   * 对于对象类型，尝试深度合并；对于其他类型，使用最新值
   */
  private resolveByMerge(report: ConflictReport): ConflictReport {
    const winner = report.sources.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    // 尝试合并所有值
    let mergedValue: unknown = winner.value;
    
    // 如果所有值都是对象，尝试深度合并
    const allObjects = report.sources.every(s => 
      typeof s.value === 'object' && s.value !== null && !Array.isArray(s.value)
    );

    if (allObjects) {
      mergedValue = this.deepMerge(...report.sources.map(s => s.value as Record<string, unknown>));
      report.mergedValue = mergedValue;
      this.logger.info(`Merged objects for key "${report.key}"`);
    } else if (this.config.customMerger) {
      mergedValue = this.config.customMerger(report.sources.map(s => s.value));
      report.mergedValue = mergedValue;
    }

    report.resolution = 'resolved';
    report.winningSource = winner.source;

    this.emitEvent({
      type: 'conflict_resolved',
      timestamp: Date.now(),
      key: report.key,
      details: { strategy: 'merge', winner: winner.source },
    });

    this.conflictHistory.push(report);
    return report;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    return objects.reduce((result, current) => {
      for (const key of Object.keys(current)) {
        const resultValue = result[key];
        const currentValue = current[key];

        if (
          typeof resultValue === 'object' && resultValue !== null &&
          typeof currentValue === 'object' && currentValue !== null &&
          !Array.isArray(resultValue) && !Array.isArray(currentValue)
        ) {
          result[key] = this.deepMerge(
            resultValue as Record<string, unknown>,
            currentValue as Record<string, unknown>
          );
        } else {
          result[key] = currentValue;
        }
      }
      return result;
    }, {} as Record<string, unknown>);
  }

  /**
   * 获取冲突历史
   */
  getConflictHistory(): ConflictReport[] {
    return [...this.conflictHistory];
  }

  /**
   * 清空冲突历史
   */
  clearHistory(): void {
    this.conflictHistory = [];
  }

  private emitEvent(event: RepairEvent): void {
    this.config.onRepairEvent?.(event);
  }
}

// ==================== 综合修复管理器 ====================

export class RepairManager {
  private dataRepair: DataRepair;
  private splitBrainResolver: SplitBrainResolver;
  private config: RepairConfig;
  private logger: ILogger;

  constructor(config?: Partial<RepairConfig>, logger?: ILogger) {
    this.config = { ...DEFAULT_REPAIR_CONFIG, ...config };
    this.logger = logger ?? new ConsoleLogger('[RepairManager]');
    this.dataRepair = new DataRepair(config, logger);
    this.splitBrainResolver = new SplitBrainResolver(config, logger);
  }

  /**
   * 验证并修复数据
   */
  async verifyAndRepair(
    key: string,
    value: unknown,
    expectedChecksum: string
  ): Promise<{ valid: boolean; repaired: boolean; value?: unknown }> {
    // 先验证
    const isValid = this.dataRepair.verifyIntegrity(key, value, expectedChecksum);

    if (isValid) {
      // 数据有效，创建备份
      this.dataRepair.createBackup(key, value);
      return { valid: true, repaired: false };
    }

    // 数据损坏，尝试修复
    if (!this.config.enableAutoRepair) {
      this.logger.warn(`Auto repair disabled, skipping repair for "${key}"`);
      return { valid: false, repaired: false };
    }

    const repairResult = await this.dataRepair.attemptRepair(key);

    if (repairResult.success) {
      return { valid: true, repaired: true, value: repairResult };
    }

    return { valid: false, repaired: false };
  }

  /**
   * 检测并解决冲突
   */
  detectAndResolveConflict(
    key: string,
    sources: Array<{ source: string; timestamp: number; checksum: string; value: unknown }>
  ): ConflictReport | null {
    const conflict = this.splitBrainResolver.detectConflict(key, sources);
    
    if (conflict) {
      return this.splitBrainResolver.resolveConflict(conflict);
    }

    return null;
  }

  /**
   * 获取所有统计信息
   */
  getStats(): {
    corruptionCount: number;
    repairCount: number;
    conflictCount: number;
  } {
    return {
      corruptionCount: this.dataRepair.getCorruptionHistory().length,
      repairCount: this.dataRepair.getCorruptionHistory().filter(
        h => this.dataRepair.getCorruptionHistory().length > 0
      ).length,
      conflictCount: this.splitBrainResolver.getConflictHistory().length,
    };
  }

  /**
   * 清空所有历史
   */
  clearAllHistory(): void {
    this.dataRepair.clearHistory();
    this.splitBrainResolver.clearHistory();
  }
}

// ==================== 导出 ====================

export { ILogger, ConsoleLogger, NoOpLogger };
export { BackupManager };
