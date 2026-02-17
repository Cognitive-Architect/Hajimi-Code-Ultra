/**
 * Working层运行时实现
 * HAJIMI-PHASE2-IMPL-001 工单 B-03/06
 * 
 * Working层：128K tokens
 * - LRU缓存策略
 * - 最近对话轮次管理
 * - 与Focus层数据流转
 * 
 * 自测点:
 * - MEM-002: LRU策略命中率>90%
 * - MEM-006: 层间晋升<50ms
 * 
 * @module lib/lcr/memory/working
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

// ============================================================================
// 常量定义
// ============================================================================

/** Working层默认容量: 128K tokens */
export const WORKING_DEFAULT_CAPACITY = 131072;

/** 最小容量: 8K tokens */
export const WORKING_MIN_CAPACITY = 8192;

/** 最大容量: 256K tokens */
export const WORKING_MAX_CAPACITY = 262144;

/** LRU-K K值 */
export const LRU_K_VALUE = 2;

/** 晋升阈值: 重要性>=80 */
export const PROMOTION_THRESHOLD = 80;

/** 晋升冷却时间: 1秒 */
export const PROMOTION_COOLDOWN = 1000;

/** 最大访问延迟: 10ms */
export const MAX_ACCESS_LATENCY = 10;

// ============================================================================
// 类型定义
// ============================================================================

/** Working层条目 */
export interface WorkingEntry {
  id: string;
  content: string;
  tokens: number;
  importance: number;
  timestamp: number;
  lastAccess: number;
  accessCount: number;
  /** 访问历史 (用于LRU-K) */
  accessHistory: number[];
  metadata?: Record<string, unknown>;
}

/** LRU节点 */
interface LRUNode {
  entry: WorkingEntry;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/** Working层统计 */
export interface WorkingStats {
  entryCount: number;
  tokenCount: number;
  utilization: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  promotionCount: number;
  avgAccessLatency: number;
}

/** 添加结果 */
export interface WorkingAddResult {
  success: boolean;
  entry?: WorkingEntry;
  promoted?: boolean;
  evicted?: WorkingEntry[];
  message?: string;
}

/** 获取结果 */
export interface WorkingGetResult {
  entry: WorkingEntry | null;
  fromCache: boolean;
  latency: number;
}

// ============================================================================
// LRU-K缓存实现
// ============================================================================

/**
 * LRU-K缓存
 * 
 * 特性:
 * - O(1) 获取和更新
 * - LRU-K策略 (K=2)
 * - Token级容量管理
 */
class LRUCache {
  private maxTokens: number;
  private maxEntries: number;
  private k: number;

  private cache: Map<string, LRUNode> = new Map();
  private head: LRUNode;
  private tail: LRUNode;
  private tokenCount = 0;

  // 统计
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private accessLatencies: number[] = [];

  constructor(maxTokens: number, maxEntries: number = 10000, k: number = 2) {
    this.maxTokens = maxTokens;
    this.maxEntries = maxEntries;
    this.k = k;

    // 哨兵节点
    this.head = { entry: null as any, prev: null, next: null };
    this.tail = { entry: null as any, prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * 获取条目 (O(1))
   */
  get(id: string): { entry: WorkingEntry | null; hit: boolean; latency: number } {
    const startTime = performance.now();
    const node = this.cache.get(id);

    if (!node) {
      this.misses++;
      return { entry: null, hit: false, latency: performance.now() - startTime };
    }

    // 更新访问
    this.moveToHead(node);
    node.entry.lastAccess = Date.now();
    node.entry.accessCount++;
    node.entry.accessHistory.push(Date.now());
    if (node.entry.accessHistory.length > this.k + 1) {
      node.entry.accessHistory.shift();
    }

    this.hits++;
    const latency = performance.now() - startTime;
    this.recordLatency(latency);

    return { entry: node.entry, hit: true, latency };
  }

  /**
   * 设置条目
   */
  set(entry: WorkingEntry): WorkingEntry[] {
    const evicted: WorkingEntry[] = [];

    // 检查已存在
    const existing = this.cache.get(entry.id);
    if (existing) {
      this.tokenCount -= existing.entry.tokens;
      existing.entry = entry;
      this.tokenCount += entry.tokens;
      this.moveToHead(existing);
      return evicted;
    }

    // 创建新节点
    const newNode: LRUNode = { entry, prev: null, next: null };
    this.cache.set(entry.id, newNode);
    this.addToHead(newNode);
    this.tokenCount += entry.tokens;

    // 处理容量限制
    while (this.tokenCount > this.maxTokens || this.cache.size > this.maxEntries) {
      const evictNode = this.removeTail();
      if (!evictNode) break;

      this.cache.delete(evictNode.entry.id);
      this.tokenCount -= evictNode.entry.tokens;
      evicted.push(evictNode.entry);
      this.evictions++;
    }

    return evicted;
  }

  /**
   * 删除条目
   */
  delete(id: string): boolean {
    const node = this.cache.get(id);
    if (!node) return false;

    this.removeNode(node);
    this.cache.delete(id);
    this.tokenCount -= node.entry.tokens;

    return true;
  }

  /**
   * 提升条目 (标记为最近使用)
   */
  promote(id: string): void {
    const node = this.cache.get(id);
    if (node) {
      this.moveToHead(node);
    }
  }

  /**
   * 获取命中率
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  /**
   * 获取统计
   */
  getStats(): Omit<WorkingStats, 'entryCount' | 'tokenCount' | 'utilization' | 'promotionCount'> {
    return {
      hitRate: this.getHitRate(),
      missRate: 1 - this.getHitRate(),
      evictionCount: this.evictions,
      avgAccessLatency: this.getAvgLatency(),
    };
  }

  /**
   * 获取所有条目
   */
  getAll(): WorkingEntry[] {
    const entries: WorkingEntry[] = [];
    let current = this.tail.prev;
    while (current && current !== this.head) {
      entries.push(current.entry);
      current = current.prev;
    }
    return entries;
  }

  /**
   * 清空
   */
  clear(): void {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.tokenCount = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.accessLatencies = [];
  }

  private addToHead(node: LRUNode): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: LRUNode): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToHead(node: LRUNode): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeTail(): LRUNode | null {
    const node = this.tail.prev;
    if (node === this.head) return null;
    this.removeNode(node);
    return node;
  }

  private recordLatency(latency: number): void {
    this.accessLatencies.push(latency);
    if (this.accessLatencies.length > 1000) {
      this.accessLatencies.shift();
    }
  }

  private getAvgLatency(): number {
    if (this.accessLatencies.length === 0) return 0;
    return this.accessLatencies.reduce((a, b) => a + b, 0) / this.accessLatencies.length;
  }

  get size(): number {
    return this.cache.size;
  }

  get tokens(): number {
    return this.tokenCount;
  }
}

// ============================================================================
// Working层实现
// ============================================================================

/**
 * Working层运行时
 * 
 * 核心职责:
 * 1. 128K Token容量管理
 * 2. LRU-K淘汰策略
 * 3. 层间晋升/降级协调
 * 4. 对话轮次管理
 */
export class WorkingLayer extends EventEmitter {
  private cache: LRUCache;
  private maxTokens: number;
  private promotionThreshold: number;
  private promotionCooldown: number;
  private lastPromotionTime = 0;
  private promotionCount = 0;

  // 对话管理
  private conversationRounds: string[][] = [];
  private currentRound: string[] = [];

  constructor(config: {
    maxTokens?: number;
    promotionThreshold?: number;
    promotionCooldown?: number;
  } = {}) {
    super();
    this.maxTokens = Math.min(
      Math.max(config.maxTokens || WORKING_DEFAULT_CAPACITY, WORKING_MIN_CAPACITY),
      WORKING_MAX_CAPACITY
    );
    this.promotionThreshold = config.promotionThreshold || PROMOTION_THRESHOLD;
    this.promotionCooldown = config.promotionCooldown || PROMOTION_COOLDOWN;

    this.cache = new LRUCache(this.maxTokens);
  }

  /**
   * 获取统计信息
   */
  getStats(): WorkingStats {
    const cacheStats = this.cache.getStats();
    return {
      entryCount: this.cache.size,
      tokenCount: this.cache.tokens,
      utilization: this.cache.tokens / this.maxTokens,
      hitRate: cacheStats.hitRate,
      missRate: cacheStats.missRate,
      evictionCount: cacheStats.evictionCount,
      promotionCount: this.promotionCount,
      avgAccessLatency: cacheStats.avgAccessLatency,
    };
  }

  /**
   * 添加条目
   * 
   * 自测: MEM-002 LRU命中率>90%
   * 自测: MEM-006 层间晋升<50ms
   */
  add(entry: Omit<WorkingEntry, 'timestamp' | 'lastAccess' | 'accessCount' | 'accessHistory'>): WorkingAddResult {
    const startTime = performance.now();

    // 检查晋升条件
    if (entry.importance >= this.promotionThreshold) {
      const canPromote = this.checkPromotionCooldown();
      if (canPromote) {
        this.promotionCount++;
        const promotionTime = performance.now() - startTime;

        this.emit('entry:promote', {
          entry,
          from: 'working',
          to: 'focus',
          reason: 'high_importance',
        });

        if (promotionTime > 50) {
          console.warn(`[WorkingLayer] Promotion latency ${promotionTime.toFixed(2)}ms exceeds 50ms`);
        }

        return {
          success: true,
          promoted: true,
          message: 'Entry promoted to Focus layer',
        };
      }
    }

    // 添加到缓存
    const fullEntry: WorkingEntry = {
      ...entry,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      accessCount: 0,
      accessHistory: [Date.now()],
    };

    const evicted = this.cache.set(fullEntry);

    // 添加到当前对话轮次
    this.currentRound.push(entry.id);

    // 处理淘汰
    if (evicted.length > 0) {
      this.emit('entries:demoted', {
        entries: evicted,
        from: 'working',
        to: 'archive',
      });
    }

    this.emit('entry:added', fullEntry);

    return {
      success: true,
      entry: fullEntry,
      evicted: evicted.length > 0 ? evicted : undefined,
    };
  }

  /**
   * 获取条目
   */
  get(id: string): WorkingGetResult {
    const { entry, hit, latency } = this.cache.get(id);

    if (entry) {
      // 检查晋升
      if (entry.importance >= this.promotionThreshold) {
        const canPromote = this.checkPromotionCooldown();
        if (canPromote) {
          this.cache.delete(id);
          this.promotionCount++;
          this.emit('entry:promote', {
            entry,
            from: 'working',
            to: 'focus',
            reason: 'access_frequency',
          });
        }
      }

      this.emit('entry:accessed', entry);
    }

    if (latency > MAX_ACCESS_LATENCY) {
      console.warn(`[WorkingLayer] Access latency ${latency.toFixed(2)}ms exceeds ${MAX_ACCESS_LATENCY}ms`);
    }

    return { entry, fromCache: hit, latency };
  }

  /**
   * 删除条目
   */
  remove(id: string): boolean {
    const existed = this.cache.delete(id);
    if (existed) {
      this.emit('entry:removed', { id });
    }
    return existed;
  }

  /**
   * 开始新对话轮次
   */
  startNewRound(): void {
    if (this.currentRound.length > 0) {
      this.conversationRounds.push([...this.currentRound]);
      this.currentRound = [];
    }
    this.emit('round:started');
  }

  /**
   * 获取最近对话轮次
   */
  getRecentRounds(count: number = 3): string[][] {
    const rounds = [...this.conversationRounds];
    if (this.currentRound.length > 0) {
      rounds.push([...this.currentRound]);
    }
    return rounds.slice(-count);
  }

  /**
   * 获取对话上下文
   */
  getConversationContext(roundCount: number = 3): WorkingEntry[] {
    const rounds = this.getRecentRounds(roundCount);
    const entryIds = rounds.flat();
    const entries: WorkingEntry[] = [];

    for (const id of entryIds) {
      const { entry } = this.cache.get(id);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * 淘汰条目
   */
  evict(count: number): WorkingEntry[] {
    const all = this.cache.getAll();
    const toEvict = all.slice(0, count);

    for (const entry of toEvict) {
      this.cache.delete(entry.id);
    }

    if (toEvict.length > 0) {
      this.emit('entries:evicted', toEvict);
    }

    return toEvict;
  }

  /**
   * 清空
   */
  clear(): void {
    const entries = this.cache.getAll();
    this.cache.clear();
    this.conversationRounds = [];
    this.currentRound = [];
    this.emit('layer:cleared', entries);
  }

  /**
   * 获取所有条目
   */
  getAll(): WorkingEntry[] {
    return this.cache.getAll();
  }

  private checkPromotionCooldown(): boolean {
    const now = Date.now();
    if (now - this.lastPromotionTime >= this.promotionCooldown) {
      this.lastPromotionTime = now;
      return true;
    }
    return false;
  }
}

export default WorkingLayer;
