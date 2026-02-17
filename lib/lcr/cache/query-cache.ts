/**
 * 查询缓存层实现 (LRU)
 * HAJIMI-PERF-OPT-001 工单 B-01/03: OPT-CACHE-001
 * 
 * 功能：LRU策略、SHA256缓存键、5分钟TTL、<50MB内存、命中率监控
 * 
 * @module lib/lcr/cache/query-cache
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import { IQueryResult } from '../types/lazy-rag';

/** 默认容量：1000条 */
export const DEFAULT_CACHE_CAPACITY = 1000;
/** 默认TTL：5分钟 */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** 最大内存：50MB */
export const MAX_MEMORY_BUDGET_BYTES = 50 * 1024 * 1024;
/** 命中率目标：>25% */
export const TARGET_HIT_RATE = 0.25;

/** 缓存指标 */
export interface CacheMetrics {
  hitRate: number;
  hits: number;
  misses: number;
  total: number;
  size: number;
  memoryUsage: number;
  evictions: number;
  ttlExpirations: number;
  avgEntrySize: number;
}

/** 查询缓存接口 */
export interface IQueryCache {
  get(key: string): IQueryResult | undefined;
  set(key: string, result: IQueryResult): void;
  invalidate(pattern?: string): void;
  getMetrics(): CacheMetrics;
  clear(): void;
  has(key: string): boolean;
}

/** 缓存条目 */
interface CacheEntry {
  key: string;
  result: IQueryResult;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
}

/** LRU节点 */
interface LRUNode {
  key: string;
  entry: CacheEntry;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/** 缓存键选项 */
export interface CacheKeyOptions {
  queryVector?: number[];
  queryText?: string;
  topK: number;
  threshold?: number;
}

/** LRU查询缓存 */
export class QueryCache implements IQueryCache {
  private _capacity: number;
  private _ttlMs: number;
  private _maxMemoryBytes: number;
  private _cache: Map<string, LRUNode>;
  private _head: LRUNode;
  private _tail: LRUNode;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _ttlExpirations = 0;
  private _totalMemoryBytes = 0;

  constructor(options?: { capacity?: number; ttlMs?: number; maxMemoryBytes?: number }) {
    this._capacity = options?.capacity ?? DEFAULT_CACHE_CAPACITY;
    this._ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this._maxMemoryBytes = options?.maxMemoryBytes ?? MAX_MEMORY_BUDGET_BYTES;
    this._cache = new Map();
    this._head = { key: '', entry: null as any, prev: null, next: null };
    this._tail = { key: '', entry: null as any, prev: null, next: null };
    this._head.next = this._tail;
    this._tail.prev = this._head;
  }

  get capacity() { return this._capacity; }
  get size() { return this._cache.size; }

  get(key: string): IQueryResult | undefined {
    const node = this._cache.get(key);
    if (!node) { this._misses++; return undefined; }
    if (this._isExpired(node.entry)) {
      this._removeNode(node); this._cache.delete(key);
      this._totalMemoryBytes -= node.entry.sizeBytes;
      this._ttlExpirations++; this._misses++;
      return undefined;
    }
    this._moveToHead(node);
    node.entry.lastAccessedAt = Date.now();
    node.entry.accessCount++;
    this._hits++;
    return node.entry.result;
  }

  set(key: string, result: IQueryResult): void {
    const existingNode = this._cache.get(key);
    const entrySize = this._calculateEntrySize(result);
    if (entrySize > this._maxMemoryBytes * 0.1) {
      console.warn(`[QueryCache] Entry too large (${entrySize} bytes), skipping cache`);
      return;
    }
    const now = Date.now();
    const newEntry: CacheEntry = { key, result, createdAt: now, lastAccessedAt: now, accessCount: 1, sizeBytes: entrySize };
    if (existingNode) {
      this._totalMemoryBytes -= existingNode.entry.sizeBytes;
      existingNode.entry = newEntry;
      this._totalMemoryBytes += entrySize;
      this._moveToHead(existingNode);
    } else {
      const newNode: LRUNode = { key, entry: newEntry, prev: null, next: null };
      this._cache.set(key, newNode);
      this._addToHead(newNode);
      this._totalMemoryBytes += entrySize;
    }
    this._enforceLimits();
  }

  invalidate(pattern?: string): void {
    if (!pattern) { this.clear(); return; }
    try {
      const regex = new RegExp(pattern);
      const keysToRemove: string[] = [];
      for (const [key, node] of this._cache) {
        if (regex.test(key)) keysToRemove.push(key);
      }
      for (const key of keysToRemove) {
        const node = this._cache.get(key);
        if (node) {
          this._removeNode(node); this._cache.delete(key);
          this._totalMemoryBytes -= node.entry.sizeBytes;
        }
      }
    } catch (error) {
      console.error(`[QueryCache] Invalid pattern: ${pattern}`, error);
    }
  }

  getMetrics(): CacheMetrics {
    const total = this._hits + this._misses;
    const avgEntrySize = this._cache.size > 0 ? this._totalMemoryBytes / this._cache.size : 0;
    return {
      hitRate: total > 0 ? this._hits / total : 0,
      hits: this._hits, misses: this._misses, total,
      size: this._cache.size, memoryUsage: this._totalMemoryBytes,
      evictions: this._evictions, ttlExpirations: this._ttlExpirations,
      avgEntrySize: Math.round(avgEntrySize),
    };
  }

  clear(): void {
    this._cache.clear();
    this._head.next = this._tail; this._tail.prev = this._head;
    this._totalMemoryBytes = 0; this._hits = 0; this._misses = 0;
    this._evictions = 0; this._ttlExpirations = 0;
  }

  has(key: string): boolean {
    const node = this._cache.get(key);
    if (!node) return false;
    return !this._isExpired(node.entry);
  }

  private _isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > this._ttlMs;
  }

  private _enforceLimits(): void {
    while (this._cache.size > this._capacity) this._evictLRU();
    while (this._totalMemoryBytes > this._maxMemoryBytes && this._cache.size > 0) this._evictLRU();
  }

  private _evictLRU(): void {
    const lruNode = this._tail.prev;
    if (!lruNode || lruNode === this._head) return;
    this._removeNode(lruNode); this._cache.delete(lruNode.key);
    this._totalMemoryBytes -= lruNode.entry.sizeBytes;
    this._evictions++;
  }

  private _addToHead(node: LRUNode): void {
    node.prev = this._head; node.next = this._head.next;
    this._head.next!.prev = node; this._head.next = node;
  }

  private _removeNode(node: LRUNode): void {
    node.prev!.next = node.next; node.next!.prev = node.prev;
  }

  private _moveToHead(node: LRUNode): void {
    this._removeNode(node); this._addToHead(node);
  }

  private _calculateEntrySize(result: IQueryResult): number {
    let size = 200;
    size += result.queryId.length * 2;
    for (const item of result.results) {
      size += 100 + item.id.length * 2 + item.content.length * 2 + 32;
      if (item.metadata) size += JSON.stringify(item.metadata).length * 2;
    }
    if (result.telemetry) size += JSON.stringify(result.telemetry).length * 2;
    return size;
  }
}

/** 生成缓存键 */
export function generateCacheKey(options: CacheKeyOptions): string {
  let hashInput: string;
  if (options.queryVector?.length) hashInput = options.queryVector.join(',');
  else if (options.queryText) hashInput = options.queryText.trim().toLowerCase();
  else throw new Error('Either queryVector or queryText must be provided');
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return `${hash}:${options.topK}:${(options.threshold ?? 0.5).toFixed(2)}`;
}

export function generateCacheKeyFromText(queryText: string, topK = 5, threshold = 0.5): string {
  return generateCacheKey({ queryText, topK, threshold });
}

export function generateCacheKeyFromVector(queryVector: number[], topK = 5, threshold = 0.5): string {
  return generateCacheKey({ queryVector, topK, threshold });
}

let globalCache: QueryCache | null = null;
export function getQueryCache(): QueryCache {
  if (!globalCache) {
    globalCache = new QueryCache({ capacity: DEFAULT_CACHE_CAPACITY, ttlMs: DEFAULT_TTL_MS, maxMemoryBytes: MAX_MEMORY_BUDGET_BYTES });
  }
  return globalCache;
}

export function resetQueryCache(): void {
  if (globalCache) globalCache.clear();
  globalCache = null;
}

/** 带缓存的查询执行 */
export async function executeWithCache(
  queryFn: () => Promise<IQueryResult>, cacheKey: string, cache?: QueryCache
): Promise<{ result: IQueryResult; cacheHit: boolean; cacheKey?: string; originalLatency?: number }> {
  const queryCache = cache || getQueryCache();
  const cached = queryCache.get(cacheKey);
  if (cached) return { result: cached, cacheHit: true, cacheKey };
  const startTime = performance.now();
  const result = await queryFn();
  const originalLatency = performance.now() - startTime;
  queryCache.set(cacheKey, result);
  return { result, cacheHit: false, cacheKey, originalLatency };
}

export default {
  QueryCache, generateCacheKey, generateCacheKeyFromText, generateCacheKeyFromVector,
  getQueryCache, resetQueryCache, executeWithCache,
  DEFAULT_CACHE_CAPACITY, DEFAULT_TTL_MS, MAX_MEMORY_BUDGET_BYTES, TARGET_HIT_RATE,
};
