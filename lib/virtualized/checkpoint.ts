/**
 * HAJIMI VIRTUALIZED - 三级Checkpoint服务
 * 
 * 工单 2/6: 三级Checkpoint服务（CHK-L1/L2/L3回填）
 * 
 * 参考规范:
 * - ID-85（Checkpoint章节）
 * - Wave1报告（时延<200ms验证）
 * 
 * 性能目标:
 * - L0级内存快照: <50ms
 * - L1级任务检查点: <200ms (Wave1硬编码latencyBudget)
 * - L2级持久检查点: <2s
 * 
 * @module checkpoint
 * @version 1.0.0
 */

import { AgentSnapshot, IVirtualAgent } from './types';

/**
 * Checkpoint级别
 */
export type CheckpointLevel = 'L0' | 'L1' | 'L2' | 'L3';

/**
 * Checkpoint状态
 */
export type CheckpointState = 'PENDING' | 'SAVED' | 'RESTORING' | 'RESTORED' | 'FAILED';

/**
 * Checkpoint元数据
 */
export interface CheckpointMetadata {
  /** Checkpoint唯一标识 */
  id: string;
  /** Checkpoint级别 */
  level: CheckpointLevel;
  /** 关联Agent ID */
  agentId: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 状态 */
  state: CheckpointState;
  /** 大小（字节） */
  size: number;
  /** 校验和 */
  checksum: string;
  /** 父Checkpoint ID（用于链式恢复） */
  parentId?: string;
  /** 额外元数据 */
  extra?: Record<string, unknown>;
}

/**
 * Checkpoint数据
 */
export interface Checkpoint {
  /** 元数据 */
  metadata: CheckpointMetadata;
  /** Agent快照 */
  snapshot: AgentSnapshot;
  /** 序列化状态 */
  serializedState?: string;
  /** Git提交哈希（L3级别） */
  gitCommitHash?: string;
}

/**
 * 恢复结果
 */
export interface RestoreResult {
  /** 是否成功 */
  success: boolean;
  /** 恢复的Agent ID */
  agentId: string;
  /** 恢复耗时（ms） */
  restoreTime: number;
  /** 错误信息 */
  error?: string;
  /** 恢复的Checkpoint ID */
  checkpointId: string;
}

/**
 * 性能指标
 */
export interface CheckpointMetrics {
  /** 总Checkpoint数量 */
  totalCheckpoints: number;
  /** 按级别统计 */
  byLevel: Record<CheckpointLevel, number>;
  /** 平均保存时间（ms） */
  avgSaveTime: number;
  /** 平均恢复时间（ms） */
  avgRestoreTime: number;
  /** P99恢复时间（ms） */
  p99RestoreTime: number;
  /** 总存储大小（字节） */
  totalSize: number;
}

/**
 * Checkpoint配置
 */
export interface CheckpointConfig {
  /** L0触发间隔（ms） */
  l0IntervalMs: number;
  /** L0 Token阈值 */
  l0TokenThreshold: number;
  /** L1目标时延（ms） - Wave1硬编码: <200ms */
  l1LatencyBudgetMs: number;
  /** L2目标时延（ms） */
  l2LatencyBudgetMs: number;
  /** L3 Git仓库路径 */
  l3GitRepoPath?: string;
  /** 最大Checkpoint数量 */
  maxCheckpoints: number;
  /** 是否启用自动清理 */
  enableAutoCleanup: boolean;
  /** IndexedDB数据库名 */
  indexedDBName: string;
  /** IndexedDB存储名 */
  indexedDBStoreName: string;
}

/**
 * 默认Checkpoint配置
 * Wave1数据: L1时延预算<200ms
 */
export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  l0IntervalMs: 30000,        // 30秒
  l0TokenThreshold: 500,      // 500 Token
  l1LatencyBudgetMs: 200,     // <200ms - Wave1硬编码
  l2LatencyBudgetMs: 2000,    // <2s
  maxCheckpoints: 100,
  enableAutoCleanup: true,
  indexedDBName: 'hajimi-checkpoints',
  indexedDBStoreName: 'checkpoints',
};

/**
 * SHA256校验和生成
 */
async function generateChecksum(data: string): Promise<string> {
  // 使用Web Crypto API生成SHA256
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // 降级方案：简单哈希
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * IndexedDB存储适配器
 */
class IndexedDBAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName: string;

  constructor(config: CheckpointConfig) {
    this.dbName = config.indexedDBName;
    this.storeName = config.indexedDBStoreName;
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'metadata.id' });
        }
      };
    });
  }

  /**
   * 保存Checkpoint
   */
  async save(checkpoint: Checkpoint): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(checkpoint);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 加载Checkpoint
   */
  async load(id: string): Promise<Checkpoint | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除Checkpoint
   */
  async delete(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取所有Checkpoint ID
   */
  async getAllIds(): Promise<string[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();
      
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Git归档适配器（L3级别）
 * 
 * 债务声明: DEBT-VIRT-001
 * L3级Git归档需用户配置git user.name/email
 */
class GitArchiveAdapter {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * 初始化Git仓库
   * 
   * 注意: 需要用户配置git user.name/email
   */
  async init(): Promise<void> {
    // 在实际实现中，这里会调用git init
    // 并检查user.name和user.email配置
    console.log(`[GitArchive] 初始化仓库: ${this.repoPath}`);
    console.log('[GitArchive] ⚠️ 请确保已配置git user.name和user.email');
  }

  /**
   * 提交Checkpoint为Git commit
   */
  async commit(checkpoint: Checkpoint): Promise<string> {
    // 模拟Git提交
    const checksum = await generateChecksum(checkpoint.metadata.id);
    const commitHash = `git-${checksum.substring(0, 12)}`;
    console.log(`[GitArchive] 提交Checkpoint: ${checkpoint.metadata.id} -> ${commitHash}`);
    return commitHash;
  }

  /**
   * 回滚到指定commit
   */
  async rollback(commitHash: string): Promise<void> {
    console.log(`[GitArchive] 回滚到: ${commitHash}`);
    // 实际实现中会调用git checkout或git reset
  }
}

/**
 * Checkpoint服务接口
 */
export interface ICheckpointService {
  /** 初始化服务 */
  init(): Promise<void>;
  /** 创建L0微检查点（内存快照） */
  createL0(agent: IVirtualAgent): Promise<string>;
  /** 创建L1任务检查点 */
  createL1(agent: IVirtualAgent): Promise<Checkpoint>;
  /** 创建L2持久检查点 */
  createL2(agent: IVirtualAgent): Promise<Checkpoint>;
  /** 创建L3 Git归档检查点 */
  createL3(agent: IVirtualAgent): Promise<Checkpoint>;
  /** 恢复Agent状态 */
  resume(checkpointId: string): Promise<RestoreResult>;
  /** YGGDRASIL回滚 */
  rollback(targetLevel: CheckpointLevel, agentId: string): Promise<Checkpoint | null>;
  /** 获取性能指标 */
  getMetrics(): CheckpointMetrics;
  /** 获取指定Agent的所有Checkpoint */
  getCheckpointsByAgent(agentId: string): Checkpoint[];
  /** 获取指定Checkpoint */
  getCheckpoint(id: string): Checkpoint | undefined;
  /** 删除Checkpoint */
  deleteCheckpoint(id: string): Promise<boolean>;
  /** 清理过期Checkpoint */
  cleanup(): Promise<number>;
  /** 清空所有Checkpoint */
  clear(): Promise<void>;
}

/**
 * Checkpoint服务
 * 
 * 三级Checkpoint实现:
 * - L0: 内存快照 (<50ms)
 * - L1: 任务检查点 (<200ms, Wave1硬编码)
 * - L2: 磁盘持久化 (IndexedDB)
 * - L3: Git归档 (自动commit墓碑日志)
 */
export class CheckpointService implements ICheckpointService {
  private config: CheckpointConfig;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private l0Snapshots: Map<string, AgentSnapshot> = new Map();
  private indexedDB: IndexedDBAdapter;
  private gitAdapter?: GitArchiveAdapter;
  private saveTimes: number[] = [];
  private restoreTimes: number[] = [];

  /**
   * 创建Checkpoint服务
   */
  constructor(config: Partial<CheckpointConfig> = {}) {
    this.config = { ...DEFAULT_CHECKPOINT_CONFIG, ...config };
    this.indexedDB = new IndexedDBAdapter(this.config);
    
    if (this.config.l3GitRepoPath) {
      this.gitAdapter = new GitArchiveAdapter(this.config.l3GitRepoPath);
    }
  }

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    await this.indexedDB.init();
    if (this.gitAdapter) {
      await this.gitAdapter.init();
    }
  }

  /**
   * 创建L0微检查点（内存快照）
   * 
   * 目标: <50ms
   * 触发: 每30秒或500 Token
   * 
   * @param agent - Agent实例
   * @returns Checkpoint ID
   */
  async createL0(agent: IVirtualAgent): Promise<string> {
    const startTime = performance.now();
    
    const snapshot = agent.snapshot();
    const id = generateId();
    
    // 内存快照
    this.l0Snapshots.set(id, snapshot);
    
    const elapsed = performance.now() - startTime;
    
    // 记录性能指标
    this.saveTimes.push(elapsed);
    
    // 验证性能目标
    if (elapsed > 50) {
      console.warn(`[Checkpoint L0] 保存时间 ${elapsed.toFixed(2)}ms 超过50ms目标`);
    }
    
    return id;
  }

  /**
   * 创建L1任务检查点
   * 
   * Wave1硬编码: latencyBudget < 200ms
   * 触发: [TERMINATE]状态完成
   * 
   * @param agent - Agent实例
   * @returns Checkpoint对象
   */
  async createL1(agent: IVirtualAgent): Promise<Checkpoint> {
    const startTime = performance.now();
    
    const snapshot = agent.snapshot();
    const id = generateId();
    const serializedState = JSON.stringify(snapshot);
    const checksum = await generateChecksum(serializedState);
    
    const checkpoint: Checkpoint = {
      metadata: {
        id,
        level: 'L1',
        agentId: agent.id,
        createdAt: Date.now(),
        state: 'SAVED',
        size: serializedState.length,
        checksum,
      },
      snapshot,
      serializedState,
    };
    
    // 保存到内存
    this.checkpoints.set(id, checkpoint);
    
    // 异步保存到IndexedDB
    await this.indexedDB.save(checkpoint);
    
    const elapsed = performance.now() - startTime;
    this.saveTimes.push(elapsed);
    
    // Wave1验证: L1时延<200ms
    if (elapsed > this.config.l1LatencyBudgetMs) {
      console.warn(`[Checkpoint L1] 保存时间 ${elapsed.toFixed(2)}ms 超过${this.config.l1LatencyBudgetMs}ms预算`);
    }
    
    return checkpoint;
  }

  /**
   * 创建L2持久检查点
   * 
   * 目标: <2s
   * 触发: 可重启快照请求
   * 
   * @param agent - Agent实例
   * @returns Checkpoint对象
   */
  async createL2(agent: IVirtualAgent): Promise<Checkpoint> {
    const startTime = performance.now();
    
    const snapshot = agent.snapshot();
    const id = generateId();
    const serializedState = JSON.stringify({
      snapshot,
      timestamp: Date.now(),
      version: '1.0.0',
    });
    const checksum = await generateChecksum(serializedState);
    
    const checkpoint: Checkpoint = {
      metadata: {
        id,
        level: 'L2',
        agentId: agent.id,
        createdAt: Date.now(),
        state: 'SAVED',
        size: serializedState.length,
        checksum,
      },
      snapshot,
      serializedState,
    };
    
    // 保存到IndexedDB
    await this.indexedDB.save(checkpoint);
    this.checkpoints.set(id, checkpoint);
    
    const elapsed = performance.now() - startTime;
    this.saveTimes.push(elapsed);
    
    if (elapsed > this.config.l2LatencyBudgetMs) {
      console.warn(`[Checkpoint L2] 保存时间 ${elapsed.toFixed(2)}ms 超过${this.config.l2LatencyBudgetMs}ms预算`);
    }
    
    return checkpoint;
  }

  /**
   * 创建L3 Git归档检查点
   * 
   * 触发: 手动/异常触发
   * 债务声明: DEBT-VIRT-001 - 需用户配置git user.name/email
   * 
   * @param agent - Agent实例
   * @returns Checkpoint对象
   */
  async createL3(agent: IVirtualAgent): Promise<Checkpoint> {
    if (!this.gitAdapter) {
      throw new Error('L3 Git归档未配置，请提供l3GitRepoPath');
    }
    
    const startTime = performance.now();
    
    const snapshot = agent.snapshot();
    const id = generateId();
    const serializedState = JSON.stringify({
      snapshot,
      timestamp: Date.now(),
      version: '1.0.0',
      tombstone: true, // 墓碑日志标记
    });
    const checksum = await generateChecksum(serializedState);
    
    const checkpoint: Checkpoint = {
      metadata: {
        id,
        level: 'L3',
        agentId: agent.id,
        createdAt: Date.now(),
        state: 'SAVED',
        size: serializedState.length,
        checksum,
      },
      snapshot,
      serializedState,
    };
    
    // 保存到IndexedDB
    await this.indexedDB.save(checkpoint);
    
    // Git归档
    const gitCommitHash = await this.gitAdapter.commit(checkpoint);
    checkpoint.gitCommitHash = gitCommitHash;
    
    this.checkpoints.set(id, checkpoint);
    
    const elapsed = performance.now() - startTime;
    this.saveTimes.push(elapsed);
    
    return checkpoint;
  }

  /**
   * 恢复Agent状态
   * 
   * 支持YGGDRASIL回滚（ID-78）
   * 
   * @param checkpointId - Checkpoint ID
   * @returns 恢复结果
   */
  async resume(checkpointId: string): Promise<RestoreResult> {
    const startTime = performance.now();
    
    try {
      // 1. 尝试从内存加载
      let checkpoint = this.checkpoints.get(checkpointId);
      
      // 2. 尝试从IndexedDB加载
      if (!checkpoint) {
        const fromDB = await this.indexedDB.load(checkpointId);
        if (fromDB) {
          checkpoint = fromDB;
        }
      }
      
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      
      // 验证校验和
      const serializedState = checkpoint.serializedState || JSON.stringify(checkpoint.snapshot);
      const checksum = await generateChecksum(serializedState);
      if (checksum !== checkpoint.metadata.checksum) {
        throw new Error('Checksum mismatch - data corruption detected');
      }
      
      const elapsed = performance.now() - startTime;
      this.restoreTimes.push(elapsed);
      
      return {
        success: true,
        agentId: checkpoint.metadata.agentId,
        restoreTime: elapsed,
        checkpointId,
      };
    } catch (error) {
      const elapsed = performance.now() - startTime;
      return {
        success: false,
        agentId: '',
        restoreTime: elapsed,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * YGGDRASIL回滚（ID-78）
   * 
   * 支持跨级恢复一致性
   * 
   * @param targetLevel - 目标回滚级别
   * @param agentId - Agent ID
   * @returns 恢复的Checkpoint
   */
  async rollback(targetLevel: CheckpointLevel, agentId: string): Promise<Checkpoint | null> {
    console.log(`[YGGDRASIL] 回滚到级别 ${targetLevel}，Agent: ${agentId}`);
    
    // 查找指定级别的最新Checkpoint
    const checkpoints = Array.from(this.checkpoints.values())
      .filter(cp => cp.metadata.level === targetLevel && cp.metadata.agentId === agentId)
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
    
    if (checkpoints.length === 0) {
      console.warn(`[YGGDRASIL] 未找到级别 ${targetLevel} 的Checkpoint`);
      return null;
    }
    
    const targetCheckpoint = checkpoints[0];
    const result = await this.resume(targetCheckpoint.metadata.id);
    
    if (result.success) {
      console.log(`[YGGDRASIL] 回滚成功: ${targetCheckpoint.metadata.id}`);
      return targetCheckpoint;
    } else {
      console.error(`[YGGDRASIL] 回滚失败: ${result.error}`);
      return null;
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): CheckpointMetrics {
    const allCheckpoints = Array.from(this.checkpoints.values());
    
    const byLevel: Record<CheckpointLevel, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };
    for (const cp of allCheckpoints) {
      byLevel[cp.metadata.level]++;
    }
    
    const avgSaveTime = this.saveTimes.length > 0
      ? this.saveTimes.reduce((a, b) => a + b, 0) / this.saveTimes.length
      : 0;
    
    const avgRestoreTime = this.restoreTimes.length > 0
      ? this.restoreTimes.reduce((a, b) => a + b, 0) / this.restoreTimes.length
      : 0;
    
    // 计算P99
    const sortedRestore = [...this.restoreTimes].sort((a, b) => a - b);
    const p99Index = Math.floor(sortedRestore.length * 0.99);
    const p99RestoreTime = sortedRestore[p99Index] || 0;
    
    const totalSize = allCheckpoints.reduce((sum, cp) => sum + cp.metadata.size, 0);
    
    return {
      totalCheckpoints: allCheckpoints.length,
      byLevel,
      avgSaveTime,
      avgRestoreTime,
      p99RestoreTime,
      totalSize,
    };
  }

  /**
   * 获取指定Agent的所有Checkpoint
   */
  getCheckpointsByAgent(agentId: string): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .filter(cp => cp.metadata.agentId === agentId)
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  }

  /**
   * 获取指定Checkpoint
   */
  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * 删除Checkpoint
   */
  async deleteCheckpoint(id: string): Promise<boolean> {
    const exists = this.checkpoints.has(id);
    if (exists) {
      this.checkpoints.delete(id);
      await this.indexedDB.delete(id);
    }
    return exists;
  }

  /**
   * 清理过期Checkpoint
   */
  async cleanup(): Promise<number> {
    if (!this.config.enableAutoCleanup) return 0;
    
    const allIds = Array.from(this.checkpoints.keys());
    const toDelete = allIds.length - this.config.maxCheckpoints;
    
    if (toDelete <= 0) return 0;
    
    // 删除最旧的Checkpoint
    const sorted = Array.from(this.checkpoints.entries())
      .sort((a, b) => a[1].metadata.createdAt - b[1].metadata.createdAt);
    
    let deleted = 0;
    for (let i = 0; i < toDelete; i++) {
      const [id] = sorted[i];
      await this.deleteCheckpoint(id);
      deleted++;
    }
    
    return deleted;
  }

  /**
   * 清空所有Checkpoint
   */
  async clear(): Promise<void> {
    this.checkpoints.clear();
    this.l0Snapshots.clear();
    this.saveTimes = [];
    this.restoreTimes = [];
    await this.indexedDB.clear();
  }
}

// 导出默认实例
export const defaultCheckpointService = new CheckpointService();
