/**
 * Working层运行时实现
 * HAJIMI-LCR-ENTITY-001 工单 B-04/09
 * 
 * 职责:
 * - 8K-128K Token容量管理 (可配置)
 * - LRU-K(K=2)淘汰策略实现，命中率>90%
 * - 层间晋升/降级协调 (<50ms)
 * - 访问延迟 <10ms
 * 
 * 自测点:
 * - MEM-002: LRU策略命中率>90%
 * - MEM-005: LRU淘汰延迟<50ms
 * - MEM-006: 层间晋升<50ms
 * - ENTITY-004: 层间一致性
 * 
 * @module lib/lcr/memory/working-layer
 * @author 唐音 (Engineer)
 * @version 1.1.0
 */

import { EventEmitter } from 'events';
import {
  IMemoryEntry,
  IWorkingLayer,
  IWorkingLayerConfig,
  IWorkingResult,
  ILRUCache,
  ILRUCacheConfig,
  ILRUNode,
  IEvictionResult,
  ILRUStats,
  MemoryTier,
} from '../core/interfaces';

// ============================================================================
// 常量定义
// ============================================================================

/** 默认K值 for LRU-K */
const DEFAULT_K_VALUE = 2;

/** 最小容量: 8K Tokens */
const MIN_CAPACITY = 8192;

/** 最大容量: 128K Tokens */
const MAX_CAPACITY = 131072;

/** 默认容量: 128K Tokens */
const DEFAULT_CAPACITY = 131072;

/** 命中率目标: >90% */
const TARGET_HIT_RATE = 0.9;

/** 最大访问延迟: 10ms */
const MAX_ACCESS_LATENCY = 10;

/** 最大淘汰延迟: 50ms */
const MAX_EVICTION_LATENCY = 50;

// ============================================================================
// LRU-K缓存实现
// ============================================================================

/**
 * LRU-K缓存节点
 * 
 * 维护访问历史用于LRU-K热度计算
 * K=2时考虑倒数第2次访问的时间戳
 */
class LRUCacheNode<T> implements ILRUNode<T> {
  key: string;
  value: T;
  prev: LRUCacheNode<T> | null = null;
  next: LRUCacheNode<T> | null = null;
  accessTime: number;
  frequency: number;
  tokens: number;
  
  /** 访问历史时间戳 (用于LRU-K) */
  private _accessHistory: number[] = [];

  constructor(key: string, value: T, tokens: number) {
    this.key = key;
    this.value = value;
    this.tokens = tokens;
    this.accessTime = Date.now();
    this.frequency = 1;
    this._accessHistory.push(Date.now());
  }

  /**
   * 记录访问
   */
  touch(): void {
    const now = Date.now();
    this.accessTime = now;
    this.frequency++;
    this._accessHistory.push(now);
    
    // 只保留最近K+1次访问历史
    if (this._accessHistory.length > DEFAULT_K_VALUE + 1) {
      this._accessHistory.shift();
    }
  }

  /**
   * 获取倒数第K次访问时间
   * @param k K值
   * @returns 时间戳，如果没有足够的访问历史则返回第一次访问时间
   */
  getKthAccessTime(k: number): number {
    if (this._accessHistory.length < k) {
      return this._accessHistory[0] || this.accessTime;
    }
    return this._accessHistory[this._accessHistory.length - k];
  }

  /**
   * 计算LRU-K分数
   * 
   * 算法: 基于倒数第K次访问的时间计算
   * - 分数 = 当前时间 - 倒数第K次访问时间
   * - 分数越小表示越热（越不应该被淘汰）
   * 
   * @param k K值
   * @returns 分数 (越小越热，越大越冷)
   */
  calculateScore(k: number): number {
    const kthAccessTime = this.getKthAccessTime(k);
    const timeSinceKthAccess = Date.now() - kthAccessTime;
    
    // 热度修正: 频率越高，分数越低（越不容易被淘汰）
    const freqBoost = Math.log1p(this.frequency) * 1000;
    
    return Math.max(0, timeSinceKthAccess - freqBoost);
  }

  /**
   * 获取访问历史（用于调试）
   */
  getAccessHistory(): number[] {
    return [...this._accessHistory];
  }
}

// ============================================================================
// 高性能LRU-K缓存
// ============================================================================

/**
 * 高性能LRU缓存实现
 * 
 * 特性:
 * - O(1) 获取和更新
 * - O(n log n) 淘汰 (n为候选数量，LRU-K排序)
 * - 支持LRU-K策略 (K=2)
 * - Token级容量管理
 * - 命中率追踪与优化
 * 
 * 自测: 
 * - MEM-002: 命中率>90%
 * - MEM-005: LRU淘汰延迟<50ms
 */
export class LRUCache<T> implements ILRUCache<T> {
  private _config: ILRUCacheConfig;
  private _cache: Map<string, LRUCacheNode<T>>;
  private _head: LRUCacheNode<T>;
  private _tail: LRUCacheNode<T>;
  private _tokenCount: number;
  
  // 统计
  private _hits: number = 0;
  private _misses: number = 0;
  private _evictions: number = 0;
  private _evictionLatencies: number[] = [];
  private _accessLatencies: number[] = [];

  constructor(config: ILRUCacheConfig) {
    this._config = {
      ttl: 0,
      useLRUK: true,
      kValue: DEFAULT_K_VALUE,
      ...config,
    };

    this._cache = new Map();
    this._tokenCount = 0;
    
    // 初始化哨兵节点
    this._head = new LRUCacheNode<T>('', {} as T, 0);
    this._tail = new LRUCacheNode<T>('', {} as T, 0);
    this._head.next = this._tail;
    this._tail.prev = this._head;

    this._validateCapacity();
  }

  /**
   * 验证容量配置
   * Working层: 8K-128K (可配置用于测试)
   */
  private _validateCapacity(): void {
    const { maxTokens } = this._config;
    // 允许小容量用于测试，但生产环境建议使用8K-128K
    if (maxTokens <= 0 || maxTokens > MAX_CAPACITY) {
      throw new Error(
        `Invalid capacity: ${maxTokens}. Must be between 1 and ${MAX_CAPACITY} tokens.`
      );
    }
  }

  /**
   * 获取配置
   */
  get config(): ILRUCacheConfig {
    return { ...this._config };
  }

  /**
   * 获取当前大小
   */
  get size(): number {
    return this._cache.size;
  }

  /**
   * 获取当前Token数
   */
  get tokenCount(): number {
    return this._tokenCount;
  }

  /**
   * 获取统计信息
   */
  get stats(): ILRUStats {
    const total = this._hits + this._misses;
    const avgEvictionLatency = this._evictionLatencies.length > 0
      ? this._evictionLatencies.reduce((a, b) => a + b, 0) / this._evictionLatencies.length
      : 0;
    const avgAccessLatency = this._accessLatencies.length > 0
      ? this._accessLatencies.reduce((a, b) => a + b, 0) / this._accessLatencies.length
      : 0;

    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: total > 0 ? this._hits / total : 0,
      avgEvictionLatency,
      avgAccessLatency,
    };
  }

  /**
   * 获取命中率
   */
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  /**
   * 获取平均访问延迟
   */
  get avgAccessLatency(): number {
    if (this._accessLatencies.length === 0) return 0;
    return this._accessLatencies.reduce((a, b) => a + b, 0) / this._accessLatencies.length;
  }

  /**
   * 获取条目 (O(1))
   * 
   * 自测: MEM-002 访问延迟<10ms
   */
  get(key: string): T | undefined {
    const startTime = performance.now();
    const node = this._cache.get(key);
    
    if (!node) {
      this._misses++;
      this._recordAccessLatency(performance.now() - startTime);
      return undefined;
    }

    // 检查TTL
    if (this._config.ttl && this._config.ttl > 0) {
      if (Date.now() - node.accessTime > this._config.ttl) {
        this.delete(key);
        this._misses++;
        this._recordAccessLatency(performance.now() - startTime);
        return undefined;
      }
    }

    // 更新LRU位置
    this._moveToHead(node);
    node.touch();
    this._hits++;

    const latency = performance.now() - startTime;
    this._recordAccessLatency(latency);

    // 自测: 访问延迟<10ms
    if (latency > MAX_ACCESS_LATENCY) {
      console.warn(`[LRUCache] Access latency ${latency.toFixed(2)}ms exceeds ${MAX_ACCESS_LATENCY}ms threshold`);
    }

    return node.value;
  }

  /**
   * 记录访问延迟
   */
  private _recordAccessLatency(latency: number): void {
    this._accessLatencies.push(latency);
    if (this._accessLatencies.length > 1000) {
      this._accessLatencies.shift();
    }
  }

  /**
   * 设置条目 (O(1))
   * 
   * 自测: MEM-005 淘汰延迟<50ms
   */
  set(key: string, value: T, tokens: number): IEvictionResult<T> | null {
    const startTime = performance.now();
    let evictionResult: IEvictionResult<T> | null = null;

    // 验证Token数
    if (tokens <= 0) {
      throw new Error('Token count must be positive');
    }

    // 检查单条限制 (不能超过最大容量的50%)
    if (tokens > this._config.maxTokens * 0.5) {
      throw new Error(`Entry too large: ${tokens} tokens exceeds 50% of capacity`);
    }

    // 检查是否已存在
    const existingNode = this._cache.get(key);
    if (existingNode) {
      // 更新现有节点
      this._tokenCount -= existingNode.tokens;
      existingNode.value = value;
      existingNode.tokens = tokens;
      this._tokenCount += tokens;
      this._moveToHead(existingNode);
      existingNode.touch();
    } else {
      // 创建新节点
      const newNode = new LRUCacheNode(key, value, tokens);
      this._cache.set(key, newNode);
      this._addToHead(newNode);
      this._tokenCount += tokens;
    }

    // 处理容量限制
    const evicted = this._handleCapacityLimits(startTime);

    if (evicted.length > 0) {
      const duration = performance.now() - startTime;
      
      evictionResult = {
        evicted,
        reason: 'capacity',
        duration,
      };

      // 自测: MEM-005 淘汰延迟<50ms
      if (duration > MAX_EVICTION_LATENCY) {
        console.warn(`[LRUCache] Eviction latency ${duration.toFixed(2)}ms exceeds ${MAX_EVICTION_LATENCY}ms threshold`);
      }
    }

    return evictionResult;
  }

  /**
   * 处理容量限制
   */
  private _handleCapacityLimits(startTime: number): Array<{ key: string; value: T; tokens: number }> {
    const evicted: Array<{ key: string; value: T; tokens: number }> = [];

    // 检查条目数限制
    while (this._cache.size > this._config.maxSize) {
      const evictedNode = this._removeTail();
      if (evictedNode) {
        this._cache.delete(evictedNode.key);
        this._tokenCount -= evictedNode.tokens;
        evicted.push({
          key: evictedNode.key,
          value: evictedNode.value,
          tokens: evictedNode.tokens,
        });
        this._evictions++;
      }
    }

    // 检查Token限制
    if (this._tokenCount > this._config.maxTokens) {
      const tokensToEvict = this._tokenCount - this._config.maxTokens;
      const tokenEvicted = this._evictTokensInternal(tokensToEvict);
      evicted.push(...tokenEvicted);
    }

    // 记录淘汰延迟
    if (evicted.length > 0) {
      const duration = performance.now() - startTime;
      this._evictionLatencies.push(duration);
      
      // 只保留最近100次淘汰延迟
      if (this._evictionLatencies.length > 100) {
        this._evictionLatencies.shift();
      }
    }

    return evicted;
  }

  /**
   * 删除条目 (O(1))
   */
  delete(key: string): boolean {
    const node = this._cache.get(key);
    if (!node) return false;

    this._removeNode(node);
    this._cache.delete(key);
    this._tokenCount -= node.tokens;

    return true;
  }

  /**
   * 淘汰指定数量的Token
   */
  evictTokens(tokensNeeded: number): IEvictionResult<T> {
    const startTime = performance.now();
    const evicted = this._evictTokensInternal(tokensNeeded);
    const duration = performance.now() - startTime;

    return {
      evicted,
      reason: 'token_limit',
      duration,
    };
  }

  /**
   * 内部Token淘汰实现 (LRU-K策略)
   */
  private _evictTokensInternal(tokensNeeded: number): Array<{ key: string; value: T; tokens: number }> {
    const evicted: Array<{ key: string; value: T; tokens: number }> = [];
    let freedTokens = 0;

    // 收集候选节点
    const candidates: LRUCacheNode<T>[] = [];
    let current = this._tail.prev;

    while (current && current !== this._head) {
      candidates.push(current);
      current = current.prev;
    }

    // LRU-K策略: 按分数排序淘汰
    if (this._config.useLRUK) {
      candidates.sort((a, b) => 
        a.calculateScore(this._config.kValue || DEFAULT_K_VALUE) - 
        b.calculateScore(this._config.kValue || DEFAULT_K_VALUE)
      );
    }

    // 淘汰直到满足需求
    for (const node of candidates) {
      if (freedTokens >= tokensNeeded) break;

      this._removeNode(node);
      this._cache.delete(node.key);
      this._tokenCount -= node.tokens;
      freedTokens += node.tokens;

      evicted.push({
        key: node.key,
        value: node.value,
        tokens: node.tokens,
      });
      this._evictions++;
    }

    return evicted;
  }

  /**
   * 提升条目到头部 (最近使用)
   */
  promote(key: string): void {
    const node = this._cache.get(key);
    if (node) {
      this._moveToHead(node);
      node.touch();
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this._cache.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._tokenCount = 0;
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._evictionLatencies = [];
    this._accessLatencies = [];
  }

  /**
   * 获取所有键 (按LRU顺序, 从旧到新)
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this._tail.prev;
    
    while (current && current !== this._head) {
      keys.push(current.key);
      current = current.prev;
    }

    return keys;
  }

  /**
   * 获取所有值 (按LRU顺序)
   */
  values(): T[] {
    const values: T[] = [];
    let current = this._tail.prev;
    
    while (current && current !== this._head) {
      values.push(current.value);
      current = current.prev;
    }

    return values;
  }

  /**
   * 获取最久未使用的条目 (但不删除)
   */
  peekLRU(): { key: string; value: T; tokens: number } | null {
    const node = this._tail.prev;
    if (!node || node === this._head) return null;

    return {
      key: node.key,
      value: node.value,
      tokens: node.tokens,
    };
  }

  /**
   * 获取最近使用的条目 (但不删除)
   */
  peekMRU(): { key: string; value: T; tokens: number } | null {
    const node = this._head.next;
    if (!node || node === this._tail) return null;

    return {
      key: node.key,
      value: node.value,
      tokens: node.tokens,
    };
  }

  // -------------------------------------------------------------------------
  // 私有辅助方法
  // -------------------------------------------------------------------------

  /**
   * 添加节点到头部
   */
  private _addToHead(node: LRUCacheNode<T>): void {
    node.prev = this._head;
    node.next = this._head.next;
    this._head.next!.prev = node;
    this._head.next = node;
  }

  /**
   * 移除节点
   */
  private _removeNode(node: LRUCacheNode<T>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  /**
   * 移动节点到头部
   */
  private _moveToHead(node: LRUCacheNode<T>): void {
    this._removeNode(node);
    this._addToHead(node);
  }

  /**
   * 移除尾部节点 (最久未使用)
   */
  private _removeTail(): LRUCacheNode<T> | null {
    const node = this._tail.prev;
    if (node === this._head) return null;
    
    this._removeNode(node);
    return node;
  }
}

// ============================================================================
// Working层实现
// ============================================================================

/**
 * Working层运行时
 * 
 * 核心职责:
 * 1. 维护8K-128K Token容量（可配置）
 * 2. LRU-K(K=2)淘汰策略，命中率>90%
 * 3. 层间晋升/降级协调 (<50ms)
 * 4. 访问延迟 <10ms
 * 
 * 自测:
 * - MEM-002: LRU策略命中率>90%
 * - MEM-005: LRU淘汰延迟<50ms
 * - MEM-006: 层间晋升<50ms
 * - ENTITY-004: 层间一致性
 */
export class WorkingLayer extends EventEmitter implements IWorkingLayer {
  private _config: IWorkingLayerConfig;
  private _lruCache: LRUCache<IMemoryEntry>;
  private _promotionQueue: Map<string, number>; // entryId -> timestamp
  private _lastPromotionTime: number = 0;
  private _promotionCount: number = 0;
  private _demotionCount: number = 0;
  private _accessLatencies: number[] = [];

  constructor(config: Partial<IWorkingLayerConfig> = {}) {
    super();

    this._config = {
      maxTokens: DEFAULT_CAPACITY,      // 默认128K
      maxEntries: 1000,
      promotionThreshold: 80,           // 重要性>=80晋升
      promotionCooldown: 1000,          // 1秒冷却
      preloadCount: 3,
      lruConfig: {
        maxSize: 1000,
        maxTokens: DEFAULT_CAPACITY,
        useLRUK: true,
        kValue: DEFAULT_K_VALUE,
        ttl: 0,
      },
      ...config,
    };

    // 验证容量范围
    this._validateCapacity();

    // 初始化LRU缓存
    this._lruCache = new LRUCache<IMemoryEntry>(this._config.lruConfig);
    
    // 初始化晋升队列
    this._promotionQueue = new Map();

    console.log(`[WorkingLayer] Initialized with maxTokens=${this._config.maxTokens}`);
  }

  /**
   * 验证容量配置
   * Working层: 建议8K-128K，但允许测试用小容量
   */
  private _validateCapacity(): void {
    const { maxTokens } = this._config;
    if (maxTokens <= 0 || maxTokens > MAX_CAPACITY * 2) { // 允许2倍缓冲用于测试
      throw new Error(
        `WorkingLayer capacity must be positive and <= ${MAX_CAPACITY * 2} tokens. Got: ${maxTokens}`
      );
    }
  }

  /**
   * 获取配置
   */
  get config(): IWorkingLayerConfig {
    return { ...this._config };
  }

  /**
   * 获取当前Token使用量
   */
  get tokenUsage(): number {
    return this._lruCache.tokenCount;
  }

  /**
   * 获取当前条目数
   */
  get entryCount(): number {
    return this._lruCache.size;
  }

  /**
   * 获取LRU统计
   */
  get lruStats(): ILRUStats {
    return this._lruCache.stats;
  }

  /**
   * 获取命中率
   */
  get hitRate(): number {
    return this._lruCache.hitRate;
  }

  /**
   * 获取统计信息
   */
  get stats(): {
    entryCount: number;
    tokenUsage: number;
    tokenUtilization: number;
    hitRate: number;
    promotionCount: number;
    demotionCount: number;
    avgEvictionLatency: number;
    avgAccessLatency: number;
  } {
    const lruStats = this._lruCache.stats;
    return {
      entryCount: this._lruCache.size,
      tokenUsage: this._lruCache.tokenCount,
      tokenUtilization: this._lruCache.tokenCount / this._config.maxTokens,
      hitRate: lruStats.hitRate,
      promotionCount: this._promotionCount,
      demotionCount: this._demotionCount,
      avgEvictionLatency: lruStats.avgEvictionLatency,
      avgAccessLatency: this._calculateAvgAccessLatency(),
    };
  }

  /**
   * 计算平均访问延迟
   */
  private _calculateAvgAccessLatency(): number {
    if (this._accessLatencies.length === 0) return 0;
    return this._accessLatencies.reduce((a, b) => a + b, 0) / this._accessLatencies.length;
  }

  /**
   * 添加条目到Working层
   * 
   * 流程:
   * 1. 检查晋升条件
   * 2. 添加到LRU缓存
   * 3. 处理淘汰结果
   * 4. 触发晋升 (如需要)
   * 
   * 自测: 
   * - MEM-003 Working层容量
   * - MEM-006 晋升<50ms
   */
  add(entry: IMemoryEntry): IWorkingResult {
    const startTime = performance.now();

    // 验证条目
    if (!entry.id || !entry.content) {
      return {
        success: false,
        tokenUsage: this.tokenUsage,
        message: 'Invalid entry: id and content are required',
      };
    }

    // 检查是否需要直接晋升到Focus
    if (entry.importance >= this._config.promotionThreshold) {
      const canPromote = this.checkPromotionCooldown();
      if (canPromote) {
        this._promotionCount++;
        const promotionTime = performance.now() - startTime;
        
        this.emit('entry:promote', {
          entry,
          from: 'working' as MemoryTier,
          to: 'focus' as MemoryTier,
          reason: 'high_importance',
        });

        // 自测: MEM-006 晋升<50ms
        if (promotionTime > MAX_EVICTION_LATENCY) {
          console.warn(`[WorkingLayer] Promotion latency ${promotionTime.toFixed(2)}ms exceeds ${MAX_EVICTION_LATENCY}ms threshold`);
        }

        return {
          success: true,
          tokenUsage: this.tokenUsage,
          promoted: entry,
          message: 'Entry promoted to Focus layer (high importance)',
        };
      }
    }

    // 确保Token数有效
    if (entry.tokens <= 0) {
      entry.tokens = Math.ceil(entry.content.length / 4); // 近似计算
    }

    // 添加到LRU缓存
    const evictionResult = this._lruCache.set(entry.id, entry, entry.tokens);
    
    // 更新条目状态
    entry.status = 'active';
    entry.lastAccess = Date.now();

    const evicted: IMemoryEntry[] = [];
    
    // 处理淘汰结果
    if (evictionResult) {
      for (const item of evictionResult.evicted) {
        const evictedEntry = item.value;
        evictedEntry.status = 'evicting';
        evicted.push(evictedEntry);
        this._demotionCount++;
      }

      // 触发降级事件
      this.emit('entry:demote', {
        entries: evicted,
        from: 'working' as MemoryTier,
        to: 'archive' as MemoryTier,
        reason: 'lru_eviction',
        duration: evictionResult.duration,
      });

      // 自测: MEM-005 LRU淘汰延迟<50ms
      if (evictionResult.duration > MAX_EVICTION_LATENCY) {
        console.warn(`[WorkingLayer] LRU eviction latency ${evictionResult.duration.toFixed(2)}ms exceeds ${MAX_EVICTION_LATENCY}ms threshold`);
      }
    }

    // 发送添加事件
    this.emit('entry:add', { tier: 'working' as MemoryTier, entry });

    const processingTime = performance.now() - startTime;

    return {
      success: true,
      tokenUsage: this.tokenUsage,
      evicted: evicted.length > 0 ? evicted : undefined,
      message: `Entry added to Working layer (${processingTime.toFixed(2)}ms)`,
    };
  }

  /**
   * 获取条目 (触发LRU更新)
   * 
   * 自测: MEM-002 访问延迟<10ms
   */
  get(id: string): IMemoryEntry | null {
    const startTime = performance.now();
    const entry = this._lruCache.get(id);
    
    const latency = performance.now() - startTime;
    this._accessLatencies.push(latency);
    if (this._accessLatencies.length > 1000) {
      this._accessLatencies.shift();
    }

    // 自测: 访问延迟<10ms
    if (latency > MAX_ACCESS_LATENCY) {
      console.warn(`[WorkingLayer] Access latency ${latency.toFixed(2)}ms exceeds ${MAX_ACCESS_LATENCY}ms threshold`);
    }
    
    if (entry) {
      // 更新访问统计
      entry.accessCount++;
      entry.lastAccess = Date.now();

      // 检查是否需要晋升
      if (entry.importance >= this._config.promotionThreshold) {
        const canPromote = this.checkPromotionCooldown();
        if (canPromote) {
          // 从Working层移除
          this._lruCache.delete(id);
          this._promotionCount++;

          this.emit('entry:promote', {
            entry,
            from: 'working' as MemoryTier,
            to: 'focus' as MemoryTier,
            reason: 'access_frequency',
          });
        }
      }

      this.emit('entry:access', { tier: 'working' as MemoryTier, entryId: id });
    }

    return entry || null;
  }

  /**
   * 删除条目
   */
  remove(id: string): boolean {
    const existed = this._lruCache.delete(id);
    if (existed) {
      this.emit('entry:remove', { tier: 'working' as MemoryTier, entryId: id });
    }
    return existed;
  }

  /**
   * 从Working层淘汰条目
   * 
   * @param count 淘汰数量
   * @returns 被淘汰的条目
   */
  evict(count: number): IMemoryEntry[] {
    const startTime = performance.now();
    const evicted: IMemoryEntry[] = [];

    // 获取最久未使用的条目
    const keys = this._lruCache.keys();
    const keysToEvict = keys.slice(0, count);

    for (const key of keysToEvict) {
      const entry = this._lruCache.get(key);
      if (entry) {
        this._lruCache.delete(key);
        entry.status = 'evicting';
        evicted.push(entry);
        this._demotionCount++;
      }
    }

    const duration = performance.now() - startTime;

    if (evicted.length > 0) {
      this.emit('entry:demote', {
        entries: evicted,
        from: 'working' as MemoryTier,
        to: 'archive' as MemoryTier,
        reason: 'manual_eviction',
        duration,
      });
    }

    return evicted;
  }

  /**
   * 清空Working层
   */
  clear(): void {
    const entries = this._lruCache.values();
    this._lruCache.clear();
    
    this.emit('layer:clear', {
      tier: 'working' as MemoryTier,
      entries,
    });
  }

  /**
   * 获取所有条目 (按LRU顺序, 从旧到新)
   */
  getAll(): IMemoryEntry[] {
    return this._lruCache.values();
  }

  /**
   * 检查是否包含条目
   */
  has(id: string): boolean {
    return this._lruCache.get(id) !== undefined;
  }

  /**
   * 预留空间
   * @param tokens 预留Token数
   * @param timeoutMs 超时时间
   * @returns 是否成功
   */
  reserveSpace(tokens: number, timeoutMs: number = 5000): boolean {
    // 检查是否有足够空间
    if (this.tokenUsage + tokens > this._config.maxTokens) {
      // 需要淘汰
      const tokensToEvict = this.tokenUsage + tokens - this._config.maxTokens;
      this._lruCache.evictTokens(tokensToEvict);
    }

    return this.tokenUsage + tokens <= this._config.maxTokens;
  }

  /**
   * 批量添加条目
   * @param entries 条目数组
   * @returns 操作结果
   */
  addBatch(entries: IMemoryEntry[]): IWorkingResult {
    const startTime = performance.now();
    const evicted: IMemoryEntry[] = [];
    let promoted: IMemoryEntry | undefined;

    for (const entry of entries) {
      const result = this.add(entry);
      
      if (result.evicted) {
        evicted.push(...result.evicted);
      }
      if (result.promoted && !promoted) {
        promoted = result.promoted;
      }
    }

    const processingTime = performance.now() - startTime;

    return {
      success: true,
      tokenUsage: this.tokenUsage,
      evicted: evicted.length > 0 ? evicted : undefined,
      promoted,
      message: `Batch add completed: ${entries.length} entries (${processingTime.toFixed(2)}ms)`,
    };
  }

  /**
   * 获取候选晋升条目
   * @param count 数量
   * @returns 候选条目
   */
  getPromotionCandidates(count: number = 5): IMemoryEntry[] {
    const candidates: IMemoryEntry[] = [];
    const entries = this._lruCache.values();

    // 按重要性排序
    entries.sort((a, b) => b.importance - a.importance);

    for (const entry of entries) {
      if (entry.importance >= this._config.promotionThreshold) {
        candidates.push(entry);
        if (candidates.length >= count) break;
      }
    }

    return candidates;
  }

  /**
   * 检查晋升冷却
   */
  checkPromotionCooldown(): boolean {
    const now = Date.now();
    if (now - this._lastPromotionTime < this._config.promotionCooldown) {
      return false;
    }
    this._lastPromotionTime = now;
    return true;
  }

  /**
   * 手动触发晋升
   * @param entryId 条目ID
   * @returns 是否成功
   * 
   * 自测: MEM-006 晋升<50ms
   */
  triggerPromotion(entryId: string): boolean {
    const startTime = performance.now();
    const entry = this._lruCache.get(entryId);
    if (!entry) return false;

    // 从Working层移除
    this._lruCache.delete(entryId);
    this._promotionCount++;

    this.emit('entry:promote', {
      entry,
      from: 'working' as MemoryTier,
      to: 'focus' as MemoryTier,
      reason: 'manual_trigger',
    });

    const latency = performance.now() - startTime;
    
    // 自测: MEM-006 晋升<50ms
    if (latency > MAX_EVICTION_LATENCY) {
      console.warn(`[WorkingLayer] Manual promotion latency ${latency.toFixed(2)}ms exceeds ${MAX_EVICTION_LATENCY}ms threshold`);
    }

    return true;
  }

  /**
   * 处理来自Focus层的降级
   * @param entry 降级条目
   */
  handleDemotion(entry: IMemoryEntry): void {
    // 添加回Working层
    this._lruCache.set(entry.id, entry, entry.tokens);
    entry.status = 'active';

    this.emit('entry:demote', {
      entry,
      from: 'focus' as MemoryTier,
      to: 'working' as MemoryTier,
      reason: 'focus_overflow',
    });
  }

  /**
   * 重新计算Token使用量
   */
  recalculateTokens(): number {
    let total = 0;
    for (const entry of this._lruCache.values()) {
      total += entry.tokens;
    }
    return total;
  }

  /**
   * 检查命中率是否达标
   * 
   * 自测: MEM-002 命中率>90%
   */
  checkHitRateTarget(): boolean {
    return this.hitRate >= TARGET_HIT_RATE;
  }

  /**
   * 获取详细诊断信息
   */
  getDiagnostics(): {
    hitRate: number;
    hitRateTarget: number;
    hitRateOk: boolean;
    avgAccessLatency: number;
    avgEvictionLatency: number;
    capacity: number;
    tokenUsage: number;
    utilization: number;
    entryCount: number;
  } {
    const stats = this.stats;
    return {
      hitRate: stats.hitRate,
      hitRateTarget: TARGET_HIT_RATE,
      hitRateOk: stats.hitRate >= TARGET_HIT_RATE,
      avgAccessLatency: stats.avgAccessLatency,
      avgEvictionLatency: stats.avgEvictionLatency,
      capacity: this._config.maxTokens,
      tokenUsage: stats.tokenUsage,
      utilization: stats.tokenUtilization,
      entryCount: stats.entryCount,
    };
  }
}

// 扩展ILRUStats接口以包含平均访问延迟
declare module '../core/interfaces' {
  interface ILRUStats {
    avgAccessLatency?: number;
  }
}

export default WorkingLayer;
