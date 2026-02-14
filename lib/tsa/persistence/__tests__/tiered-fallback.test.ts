/**
 * B-05/09: TSA 三层降级韧性 - 单元测试
 * 
 * 自测点：
 * - [RES-001] Redis失败降级IndexedDB
 * - [RES-002] IndexedDB失败降级内存
 * - [RES-003] 服务恢复自动升级
 */

import { TieredFallback, TierLevel, DEFAULT_FALLBACK_CONFIG } from '../TieredFallback';
import { StorageAdapter, SetOptions } from '../IndexedDBStore';

// ==================== Mock 存储实现 ====================

class MockRedisStore implements StorageAdapter {
  readonly name = 'MockRedisStore';
  readonly isAvailable = true;
  private _isConnected = false;
  private _shouldFail = false;
  private store = new Map<string, unknown>();

  get isConnected(): boolean {
    return this._isConnected;
  }

  setShouldFail(shouldFail: boolean): void {
    this._shouldFail = shouldFail;
  }

  async initialize(): Promise<boolean> {
    this._isConnected = true;
    return true;
  }

  async close(): Promise<void> {
    this._isConnected = false;
    this.store.clear();
  }

  async healthCheck(): Promise<boolean> {
    return this._isConnected && !this._shouldFail;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    return this.store.has(key);
  }

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.store.get(key);
      if (value !== undefined) {
        result.set(key, value as T);
      }
    }
    return result;
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    for (const { key, value } of entries) {
      this.store.set(key, value);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    return Array.from(this.store.keys());
  }

  async clear(): Promise<void> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    this.store.clear();
  }

  async cleanup(): Promise<number> {
    if (this._shouldFail) throw new Error('Redis connection failed');
    return 0;
  }
}

class MockIndexedDBStore implements StorageAdapter {
  readonly name = 'MockIndexedDBStore';
  readonly isAvailable = true;
  private _isConnected = false;
  private _shouldFail = false;
  private store = new Map<string, unknown>();

  get isConnected(): boolean {
    return this._isConnected;
  }

  setShouldFail(shouldFail: boolean): void {
    this._shouldFail = shouldFail;
  }

  async initialize(): Promise<boolean> {
    this._isConnected = true;
    return true;
  }

  async close(): Promise<void> {
    this._isConnected = false;
    this.store.clear();
  }

  async healthCheck(): Promise<boolean> {
    return this._isConnected && !this._shouldFail;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    return this.store.has(key);
  }

  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.store.get(key);
      if (value !== undefined) {
        result.set(key, value as T);
      }
    }
    return result;
  }

  async mset<T>(entries: Array<{ key: string; value: T }>, options?: SetOptions): Promise<void> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    for (const { key, value } of entries) {
      this.store.set(key, value);
    }
  }

  async mdelete(keys: string[]): Promise<void> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    return Array.from(this.store.keys());
  }

  async clear(): Promise<void> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    this.store.clear();
  }

  async cleanup(): Promise<number> {
    if (this._shouldFail) throw new Error('IndexedDB connection failed');
    return 0;
  }
}

// ==================== 测试套件 ====================

describe('TieredFallback - 三层降级韧性', () => {
  let redisStore: MockRedisStore;
  let indexedDBStore: MockIndexedDBStore;
  let fallback: TieredFallback;

  beforeEach(() => {
    redisStore = new MockRedisStore();
    indexedDBStore = new MockIndexedDBStore();
    fallback = new TieredFallback(
      redisStore,
      indexedDBStore,
      {
        ...DEFAULT_FALLBACK_CONFIG,
        recoverIntervalMs: 100,
        maxRetries: 1,
        retryDelayMs: 10,
      }
    );
  });

  afterEach(async () => {
    await fallback.close();
  });

  describe('[RES-001] Redis失败降级IndexedDB', () => {
    it('初始化时应从Redis开始', async () => {
      await fallback.initialize();
      expect(fallback.currentTierLevel).toBe(TierLevel.REDIS);
      expect(fallback.currentTierName).toBe('RedisStore');
    });

    it('Redis失败时应降级到IndexedDB', async () => {
      await fallback.initialize();
      expect(fallback.currentTierLevel).toBe(TierLevel.REDIS);

      redisStore.setShouldFail(true);

      const events: Array<{ from: TierLevel; to: TierLevel }> = [];
      fallback.on('failover', (event) => {
        events.push({ from: event.fromTier, to: event.toTier });
      });

      await fallback.set('test-key', 'test-value');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(fallback.currentTierLevel).toBe(TierLevel.INDEXEDDB);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toEqual({ from: TierLevel.REDIS, to: TierLevel.INDEXEDDB });
    });

    it('Redis失败后数据应写入IndexedDB', async () => {
      await fallback.initialize();
      redisStore.setShouldFail(true);

      await fallback.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 50));

      const value = await indexedDBStore.get('key1');
      expect(value).toBe('value1');
    });
  });

  describe('[RES-002] IndexedDB失败降级内存', () => {
    it('Redis和IndexedDB都失败时应降级到内存', async () => {
      await fallback.initialize();

      redisStore.setShouldFail(true);
      indexedDBStore.setShouldFail(true);

      const events: Array<{ from: TierLevel; to: TierLevel }> = [];
      fallback.on('failover', (event) => {
        events.push({ from: event.fromTier, to: event.toTier });
      });

      await fallback.set('test-key', 'test-value');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fallback.currentTierLevel).toBe(TierLevel.MEMORY);
    });

    it('所有层都失败时应返回默认值', async () => {
      await fallback.initialize();

      redisStore.setShouldFail(true);
      indexedDBStore.setShouldFail(true);

      const value = await fallback.get('non-existent-key');
      expect(value).toBeNull();
    });
  });

  describe('[RES-003] 服务恢复自动升级', () => {
    it('Redis恢复后应自动升级', async () => {
      await fallback.initialize();

      redisStore.setShouldFail(true);
      await fallback.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fallback.currentTierLevel).toBe(TierLevel.INDEXEDDB);

      redisStore.setShouldFail(false);
      await new Promise(resolve => setTimeout(resolve, 200));

      const statuses = fallback.getTierStatuses();
      const redisStatus = statuses.find(s => s.level === TierLevel.REDIS);
      expect(redisStatus?.isConnected).toBe(true);
    });
  });

  describe('通用功能测试', () => {
    it('应支持基本的CRUD操作', async () => {
      await fallback.initialize();

      await fallback.set('key1', 'value1');
      await fallback.set('key2', 'value2');

      const value1 = await fallback.get('key1');
      expect(value1).toBe('value1');

      const exists = await fallback.exists('key1');
      expect(exists).toBe(true);

      await fallback.delete('key1');
      const valueAfterDelete = await fallback.get('key1');
      expect(valueAfterDelete).toBeNull();
    });

    it('应支持批量操作', async () => {
      await fallback.initialize();

      await fallback.mset([
        { key: 'batch1', value: 'value1' },
        { key: 'batch2', value: 'value2' },
        { key: 'batch3', value: 'value3' },
      ]);

      const values = await fallback.mget(['batch1', 'batch2', 'batch3']);
      expect(values.get('batch1')).toBe('value1');
      expect(values.get('batch2')).toBe('value2');
      expect(values.get('batch3')).toBe('value3');
    });

    it('应支持TTL选项', async () => {
      await fallback.initialize();

      await fallback.set('ttl-key', 'ttl-value', { ttl: 50 });

      const value1 = await fallback.get('ttl-key');
      expect(value1).toBe('ttl-value');

      await new Promise(resolve => setTimeout(resolve, 100));

      const value2 = await fallback.get('ttl-key');
      expect(value2).toBeNull();
    });

    it('应正确报告各层状态', async () => {
      await fallback.initialize();

      const statuses = fallback.getTierStatuses();
      expect(statuses).toHaveLength(3);

      expect(statuses[0].level).toBe(TierLevel.REDIS);
      expect(statuses[1].level).toBe(TierLevel.INDEXEDDB);
      expect(statuses[2].level).toBe(TierLevel.MEMORY);
    });
  });
});
