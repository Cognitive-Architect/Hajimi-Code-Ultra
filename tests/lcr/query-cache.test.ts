/**
 * 查询缓存层自测 - HAJIMI-PERF-OPT-001 / OPT-CACHE-001
 * 自测：CACHE-001 命中率>25%, CACHE-002 P95降低>10ms, CACHE-003 内存<50MB
 */

import {
  QueryCache, generateCacheKey, generateCacheKeyFromText, generateCacheKeyFromVector,
  executeWithCache, DEFAULT_CACHE_CAPACITY, DEFAULT_TTL_MS, MAX_MEMORY_BUDGET_BYTES, TARGET_HIT_RATE,
} from '@/lib/lcr/cache/query-cache';
import { IQueryResult, IQueryResultItem } from '@/lib/lcr/types/lazy-rag';

// 工具函数
const createMockResult = (queryId = `query-${Date.now()}`, resultCount = 5, baseLatency = 80): IQueryResult => ({
  queryId, status: 'success',
  results: Array.from({ length: resultCount }, (_, i) => ({
    id: `doc-${i}`, content: `Document ${i} content `.repeat(10), score: 0.9 - i * 0.05,
    source: i < 3 ? 'vector' : 'bm25', metadata: { source: 'test', type: 'document' },
  } as IQueryResultItem)),
  total: resultCount, latency: baseLatency, fallback: false,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// CACHE-001: 命中率>25%
describe('CACHE-001: 命中率>25%', () => {
  let cache: QueryCache;
  beforeEach(() => { cache = new QueryCache({ capacity: 100, ttlMs: 60000 }); });
  afterEach(() => { cache.clear(); });

  test('基础命中率', () => {
    const key = 'test-query'; cache.set(key, createMockResult());
    cache.get(key); cache.get(key);
    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(2); expect(metrics.misses).toBe(0);
  });

  test('热点查询模式命中率>25%', () => {
    const hotQueries = Array.from({ length: 20 }, (_, i) => `hot-${i}`);
    const coldQueries = Array.from({ length: 80 }, (_, i) => `cold-${i}`);
    let hits = 0, misses = 0;
    for (let i = 0; i < 1000; i++) {
      const key = Math.random() < 0.8 
        ? hotQueries[Math.floor(Math.random() * 20)]
        : coldQueries[Math.floor(Math.random() * 80)];
      if (cache.get(key)) hits++; else { misses++; cache.set(key, createMockResult()); }
    }
    expect(hits / (hits + misses)).toBeGreaterThanOrEqual(TARGET_HIT_RATE);
  });

  test('LRU保留热数据', () => {
    const smallCache = new QueryCache({ capacity: 10 });
    const hotKeys = ['hot-1', 'hot-2', 'hot-3'];
    hotKeys.forEach(k => smallCache.set(k, createMockResult()));
    for (let i = 0; i < 5; i++) smallCache.set(`cold-${i}`, createMockResult());
    for (let i = 0; i < 10; i++) hotKeys.forEach(k => smallCache.get(k));
    for (let i = 0; i < 5; i++) smallCache.set(`extra-${i}`, createMockResult());
    hotKeys.forEach(k => expect(smallCache.has(k)).toBe(true));
    smallCache.clear();
  });
});

// CACHE-002: P95降低>10ms
describe('CACHE-002: P95降低>10ms', () => {
  let cache: QueryCache;
  beforeEach(() => { cache = new QueryCache({ capacity: 100, ttlMs: 60000 }); });
  afterEach(() => { cache.clear(); });

  test('缓存命中延迟<1ms', () => {
    cache.set('key', createMockResult());
    const latencies = Array.from({ length: 100 }, () => {
      const start = performance.now(); cache.get('key'); return performance.now() - start;
    });
    expect(latencies.reduce((a, b) => a + b) / latencies.length).toBeLessThan(1);
  });

  test('缓存加速>10ms', async () => {
    const slowQuery = async () => { await sleep(50); return createMockResult('slow', 5, 50); };
    const start1 = performance.now(); await executeWithCache(slowQuery, 'key', cache);
    const duration1 = performance.now() - start1;
    const start2 = performance.now(); await executeWithCache(slowQuery, 'key', cache);
    const duration2 = performance.now() - start2;
    expect(duration1 - duration2).toBeGreaterThan(10);
  });
});

// CACHE-003: 内存<50MB
describe('CACHE-003: 内存<50MB', () => {
  test('默认容量1000', () => {
    const c = new QueryCache(); expect(c.capacity).toBe(DEFAULT_CACHE_CAPACITY); c.clear();
  });

  test('满载1000条内存<50MB', () => {
    const cache = new QueryCache({ capacity: 1000, maxMemoryBytes: MAX_MEMORY_BUDGET_BYTES });
    for (let i = 0; i < 1000; i++) cache.set(`k-${i}`, createMockResult(`q-${i}`, 10));
    expect(cache.size).toBe(1000);
    const metrics = cache.getMetrics();
    expect(metrics.memoryUsage).toBeLessThan(MAX_MEMORY_BUDGET_BYTES);
    cache.clear();
  });

  test('内存限制触发淘汰', () => {
    const cache = new QueryCache({ capacity: 1000, maxMemoryBytes: 20000 });
    for (let i = 0; i < 50; i++) {
      const r = createMockResult(`m-${i}`, 10);
      for (let j = 0; j < 5; j++) r.results.push({ id: `e-${j}`, content: 'x'.repeat(500), score: 0.5, source: 'vector' });
      cache.set(`k-${i}`, r);
    }
    expect(cache.getMetrics().memoryUsage).toBeLessThanOrEqual(30000);
    cache.clear();
  });
});

// 其他功能测试
describe('缓存功能', () => {
  let cache: QueryCache;
  beforeEach(() => { cache = new QueryCache(); });
  afterEach(() => { cache.clear(); });

  test('缓存键生成', () => {
    const k1 = generateCacheKeyFromText('hello', 5, 0.5);
    const k2 = generateCacheKeyFromText('Hello', 5, 0.5);
    expect(k1).toBe(k2);
    expect(k1.split(':').length).toBe(3);
    expect(generateCacheKeyFromText('a', 5)).not.toBe(generateCacheKeyFromText('a', 10));
  });

  test('TTL过期', async () => {
    const c = new QueryCache({ ttlMs: 50 });
    c.set('k', createMockResult()); expect(c.has('k')).toBe(true);
    await sleep(100); expect(c.get('k')).toBeUndefined(); expect(c.has('k')).toBe(false);
    c.clear();
  });

  test('模式失效', () => {
    cache.set('a-1', createMockResult()); cache.set('a-2', createMockResult()); cache.set('b-1', createMockResult());
    cache.invalidate('a-.*');
    expect(cache.has('a-1')).toBe(false); expect(cache.has('a-2')).toBe(false); expect(cache.has('b-1')).toBe(true);
  });

  test('清空缓存', () => {
    for (let i = 0; i < 10; i++) cache.set(`k-${i}`, createMockResult());
    expect(cache.size).toBe(10); cache.clear(); expect(cache.size).toBe(0);
  });
});

console.log('✅ 查询缓存自测套件已加载 - CACHE-001/002/003');
