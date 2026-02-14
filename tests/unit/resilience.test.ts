/**
 * B-07/09: TSA 故障恢复机制 - 单元测试
 * 
 * 自测点：
 * - [RES-001] Redis故障时自动降级File存储（无数据丢失）
 * - [RES-002] 数据损坏检测与修复（Checksum验证）
 * - [RES-003] split-brain冲突解决（多写冲突合并）
 */

import {
  // Fallback
  FallbackMemoryStore,
  createFallbackManager,
  ChecksumUtil,
  DEFAULT_FALLBACK_STORAGE_CONFIG,
  
  // Repair
  DataRepair,
  BackupManager,
  SplitBrainResolver,
  RepairManager,
  DEFAULT_REPAIR_CONFIG,
  
  // Controller
  TSAResilienceController,
  createResilienceController,
  
  // Types
  type ResilienceEvent,
  type ConflictReport,
  type RepairResult,
} from '../../lib/tsa/resilience';

import { StorageAdapter, SetOptions } from '../../lib/tsa/persistence/IndexedDBStore';

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

// ==================== 测试套件 ====================

describe('B-07/09 TSA故障恢复机制', () => {
  
  // ==================== RES-001: Fallback降级测试 ====================
  
  describe('[RES-001] Redis故障时自动降级File存储（无数据丢失）', () => {
    let fallbackStore: FallbackMemoryStore;
    let fallbackManager: ReturnType<typeof createFallbackManager>;
    let redisStore: MockRedisStore;

    beforeEach(async () => {
      fallbackStore = new FallbackMemoryStore(DEFAULT_FALLBACK_STORAGE_CONFIG);
      await fallbackStore.initialize();
      fallbackManager = createFallbackManager(DEFAULT_FALLBACK_STORAGE_CONFIG);
      await fallbackManager.fallbackStore.initialize();
      redisStore = new MockRedisStore();
      await redisStore.initialize();
    });

    afterEach(async () => {
      await fallbackStore.close();
      await redisStore.close();
    });

    it('降级存储应支持基本的CRUD操作', async () => {
      await fallbackStore.set('key1', 'value1');
      await fallbackStore.set('key2', { name: 'test', data: [1, 2, 3] });

      const value1 = await fallbackStore.get('key1');
      expect(value1).toBe('value1');

      const value2 = await fallbackStore.get('key2');
      expect(value2).toEqual({ name: 'test', data: [1, 2, 3] });

      const exists = await fallbackStore.exists('key1');
      expect(exists).toBe(true);

      await fallbackStore.delete('key1');
      const deleted = await fallbackStore.get('key1');
      expect(deleted).toBeNull();
    });

    it('进入降级模式时应记录原因', () => {
      expect(fallbackManager.isFallbackMode).toBe(false);
      
      fallbackManager.enterFallbackMode('Redis connection timeout');
      
      expect(fallbackManager.isFallbackMode).toBe(true);
      
      const stats = fallbackManager.getFallbackStats();
      expect(stats.reason).toBe('Redis connection timeout');
      expect(stats.enterTime).toBeDefined();
    });

    it('退出降级模式时应计算持续时间', async () => {
      fallbackManager.enterFallbackMode('Test reason');
      
      // 模拟一些时间流逝
      await new Promise(resolve => setTimeout(resolve, 50));
      
      fallbackManager.exitFallbackMode();
      
      const stats = fallbackManager.getFallbackStats();
      expect(stats.exitTime).toBeDefined();
      expect(stats.exitTime! - stats.enterTime!).toBeGreaterThanOrEqual(50);
    });

    it('降级期间写入的数据应在同步后保留', async () => {
      // 模拟降级
      fallbackManager.enterFallbackMode('Redis failure');
      
      // 写入数据到降级存储
      const fallbackStore = fallbackManager.fallbackStore;
      await fallbackStore.set('degraded_key1', 'value1');
      await fallbackStore.set('degraded_key2', { data: 'important' });

      // 恢复Redis并同步
      fallbackManager.exitFallbackMode();
      
      const syncResult = await fallbackManager.syncToPrimary(redisStore);
      
      expect(syncResult.success).toBe(true);
      expect(syncResult.syncedKeys).toContain('degraded_key1');
      expect(syncResult.syncedKeys).toContain('degraded_key2');
      expect(syncResult.syncedCount).toBe(2);

      // 验证数据已同步到Redis
      const syncedValue1 = await redisStore.get('degraded_key1');
      expect(syncedValue1).toBe('value1');

      const syncedValue2 = await redisStore.get('degraded_key2');
      expect(syncedValue2).toEqual({ data: 'important' });
    });

    it('应统计降级期间的读写操作', async () => {
      fallbackManager.enterFallbackMode('Test');
      
      const store = fallbackManager.fallbackStore;
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      await store.get('key1');
      await store.get('key2');
      await store.get('nonexistent');

      const stats = fallbackManager.getFallbackStats();
      expect(stats.totalWrites).toBe(2);
      expect(stats.totalReads).toBe(3); // 3 gets (nonexistent also counts)
    });

    it('WAL应记录所有写操作', async () => {
      const store = new FallbackMemoryStore({ enableWAL: true });
      await store.initialize();

      await store.set('wal_key1', 'value1');
      await store.set('wal_key2', 'value2');
      await store.delete('wal_key1');

      const walEntries = store.getWALEntries();
      expect(walEntries.length).toBe(3);
      expect(walEntries[0].operation).toBe('set');
      expect(walEntries[0].key).toBe('wal_key1');
      expect(walEntries[2].operation).toBe('delete');
      expect(walEntries[2].key).toBe('wal_key1');

      await store.close();
    });
  });

  // ==================== RES-002: 数据损坏检测与修复测试 ====================

  describe('[RES-002] 数据损坏检测与修复（Checksum验证）', () => {
    let dataRepair: DataRepair;
    let backupManager: BackupManager;

    beforeEach(() => {
      dataRepair = new DataRepair(DEFAULT_REPAIR_CONFIG);
      backupManager = new BackupManager(DEFAULT_REPAIR_CONFIG);
    });

    it('ChecksumUtil应正确计算校验和', () => {
      const checksum1 = ChecksumUtil.compute('test data');
      const checksum2 = ChecksumUtil.compute('test data');
      const checksum3 = ChecksumUtil.compute('different data');

      expect(checksum1).toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
      expect(checksum1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('ChecksumUtil应正确计算对象校验和', () => {
      const obj1 = { name: 'test', value: 123 };
      const obj2 = { name: 'test', value: 123 };
      const obj3 = { name: 'test', value: 456 };

      const checksum1 = ChecksumUtil.computeObject(obj1);
      const checksum2 = ChecksumUtil.computeObject(obj2);
      const checksum3 = ChecksumUtil.computeObject(obj3);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).not.toBe(checksum3);
    });

    it('应能检测数据损坏', () => {
      const key = 'test_key';
      const value = { data: 'original' };
      const checksum = ChecksumUtil.computeObject(value);

      // 验证正确的数据
      const isValid = dataRepair.verifyIntegrity(key, value, checksum);
      expect(isValid).toBe(true);

      // 验证损坏的数据（修改值但保持原checksum）
      const corruptedValue = { data: 'corrupted' };
      const isCorrupted = dataRepair.verifyIntegrity(key, corruptedValue, checksum);
      expect(isCorrupted).toBe(false);
    });

    it('应能创建和管理备份', () => {
      const key = 'backup_key';
      const value1 = { version: 1 };
      const value2 = { version: 2 };
      const value3 = { version: 3 };

      backupManager.createBackup(key, value1);
      backupManager.createBackup(key, value2);
      backupManager.createBackup(key, value3);

      const backups = backupManager.getBackups(key);
      expect(backups.length).toBe(3);
      expect(backups[0].value).toEqual({ version: 3 }); // 最新的在前
      expect(backups[2].value).toEqual({ version: 1 });
    });

    it('备份数量应受限制', () => {
      const key = 'limited_backup_key';
      const config = { ...DEFAULT_REPAIR_CONFIG, backupCount: 3 };
      const limitedManager = new BackupManager(config);

      for (let i = 1; i <= 5; i++) {
        limitedManager.createBackup(key, { version: i });
      }

      const backups = limitedManager.getBackups(key);
      expect(backups.length).toBe(3);
      expect(backups[0].value).toEqual({ version: 5 });
      expect(backups[2].value).toEqual({ version: 3 });
    });

    it('应能验证备份完整性', () => {
      const key = 'verify_key';
      const value = { data: 'important' };
      
      const backup = backupManager.createBackup(key, value);
      expect(backupManager.verifyBackup(backup)).toBe(true);

      // 模拟损坏（直接修改备份值）
      (backup as { value: unknown }).value = { data: 'corrupted' };
      expect(backupManager.verifyBackup(backup)).toBe(false);
    });

    it('RepairManager应能修复损坏的数据', async () => {
      const key = 'repair_key';
      const originalValue = { data: 'original', timestamp: Date.now() };
      
      const repairManager = new RepairManager({ enableAutoRepair: true });
      
      // 先创建备份
      repairManager.verifyAndRepair(key, originalValue, ChecksumUtil.computeObject(originalValue));
      
      // 模拟数据损坏
      const corruptedValue = { data: 'corrupted', timestamp: Date.now() };
      const originalChecksum = ChecksumUtil.computeObject(originalValue);
      
      // 尝试修复
      const result = await repairManager.verifyAndRepair(key, corruptedValue, originalChecksum);
      
      expect(result.valid).toBe(true);
      expect(result.repaired).toBe(true);
    });

    it('应记录损坏历史', () => {
      const key1 = 'corrupt_key1';
      const key2 = 'corrupt_key2';
      const value = { data: 'test' };
      const wrongChecksum = 'deadbeef';

      dataRepair.verifyIntegrity(key1, value, wrongChecksum);
      dataRepair.verifyIntegrity(key2, value, wrongChecksum);

      const history = dataRepair.getCorruptionHistory();
      expect(history.length).toBe(2);
      expect(history[0].key).toBe(key1);
      expect(history[1].key).toBe(key2);
      expect(history[0].severity).toBe('critical');
    });
  });

  // ==================== RES-003: Split-Brain冲突解决测试 ====================

  describe('[RES-003] split-brain冲突解决（多写冲突合并）', () => {
    let resolver: SplitBrainResolver;

    beforeEach(() => {
      resolver = new SplitBrainResolver({
        conflictResolution: 'timestamp',
        conflictWindowMs: 60000,
      });
    });

    it('应能检测split-brain冲突', () => {
      const key = 'conflict_key';
      const sources = [
        { source: 'redis-1', timestamp: Date.now() - 1000, checksum: 'abc123', value: { data: 'v1' } },
        { source: 'redis-2', timestamp: Date.now() - 500, checksum: 'def456', value: { data: 'v2' } },
      ];

      const conflict = resolver.detectConflict(key, sources);
      
      expect(conflict).not.toBeNull();
      expect(conflict!.key).toBe(key);
      expect(conflict!.sources.length).toBe(2);
      expect(conflict!.resolution).toBe('unresolved');
    });

    it('相同值不应产生冲突', () => {
      const key = 'same_value_key';
      const sources = [
        { source: 'redis-1', timestamp: Date.now() - 1000, checksum: 'same123', value: { data: 'v1' } },
        { source: 'redis-2', timestamp: Date.now() - 500, checksum: 'same123', value: { data: 'v1' } },
      ];

      const conflict = resolver.detectConflict(key, sources);
      
      expect(conflict).toBeNull();
    });

    it('时间窗口外的写入不应产生冲突', () => {
      const key = 'old_write_key';
      const now = Date.now();
      const sources = [
        { source: 'redis-1', timestamp: now - 120000, checksum: 'old123', value: { data: 'old' } },
        { source: 'redis-2', timestamp: now - 1000, checksum: 'new456', value: { data: 'new' } },
      ];

      const conflict = resolver.detectConflict(key, sources);
      
      // 只有一个在时间窗口内
      expect(conflict).toBeNull();
    });

    it('应使用timestamp策略解决冲突', () => {
      const key = 'timestamp_conflict';
      const now = Date.now();
      const sources = [
        { source: 'redis-1', timestamp: now - 2000, checksum: 'older', value: { data: 'older' } },
        { source: 'redis-2', timestamp: now - 1000, checksum: 'newer', value: { data: 'newer' } },
        { source: 'redis-3', timestamp: now - 500, checksum: 'newest', value: { data: 'newest' } },
      ];

      const conflict = resolver.detectConflict(key, sources);
      const resolved = resolver.resolveConflict(conflict!);
      
      expect(resolved.resolution).toBe('resolved');
      expect(resolved.winningSource).toBe('redis-3'); // 最新的胜出
    });

    it('应使用priority策略解决冲突', () => {
      const priorityResolver = new SplitBrainResolver({
        conflictResolution: 'priority',
        conflictWindowMs: 60000,
      });

      const key = 'priority_conflict';
      const now = Date.now();
      const sources = [
        { source: 'memory-node-1', timestamp: now - 1000, checksum: 'mem1', value: { data: 'mem' } },
        { source: 'indexeddb-node-1', timestamp: now - 2000, checksum: 'idx1', value: { data: 'idx' } },
        { source: 'redis-node-1', timestamp: now - 3000, checksum: 'red1', value: { data: 'red' } },
      ];

      const conflict = priorityResolver.detectConflict(key, sources);
      const resolved = priorityResolver.resolveConflict(conflict!);
      
      expect(resolved.resolution).toBe('resolved');
      expect(resolved.winningSource).toBe('redis-node-1'); // Redis优先级最高
    });

    it('应使用merge策略合并对象', () => {
      const mergeResolver = new SplitBrainResolver({
        conflictResolution: 'merge',
        conflictWindowMs: 60000,
      });

      const key = 'merge_conflict';
      const now = Date.now();
      const sources = [
        { 
          source: 'node-1', 
          timestamp: now - 1000, 
          checksum: 'chk1', 
          value: { name: 'Alice', age: 30 } 
        },
        { 
          source: 'node-2', 
          timestamp: now - 500, 
          checksum: 'chk2', 
          value: { age: 31, city: 'NYC' } 
        },
      ];

      const conflict = mergeResolver.detectConflict(key, sources);
      const resolved = mergeResolver.resolveConflict(conflict!);
      
      expect(resolved.resolution).toBe('resolved');
      expect(resolved.mergedValue).toEqual({
        name: 'Alice',
        age: 31,  // 较新的值
        city: 'NYC',
      });
    });

    it('manual策略应标记为需要人工介入', () => {
      const manualResolver = new SplitBrainResolver({
        conflictResolution: 'manual',
        conflictWindowMs: 60000,
      });

      const key = 'manual_conflict';
      const sources = [
        { source: 'node-1', timestamp: Date.now() - 1000, checksum: 'chk1', value: { data: 'v1' } },
        { source: 'node-2', timestamp: Date.now() - 500, checksum: 'chk2', value: { data: 'v2' } },
      ];

      const conflict = manualResolver.detectConflict(key, sources);
      const resolved = manualResolver.resolveConflict(conflict!);
      
      expect(resolved.resolution).toBe('manual_required');
    });

    it('应记录冲突历史', () => {
      const key = 'history_key';
      const sources = [
        { source: 'node-1', timestamp: Date.now() - 1000, checksum: 'chk1', value: { data: 'v1' } },
        { source: 'node-2', timestamp: Date.now() - 500, checksum: 'chk2', value: { data: 'v2' } },
      ];

      const conflict = resolver.detectConflict(key, sources);
      resolver.resolveConflict(conflict!);

      const history = resolver.getConflictHistory();
      expect(history.length).toBe(1);
      expect(history[0].key).toBe(key);
    });
  });

  // ==================== 集成测试 ====================

  describe('TSAResilienceController 集成测试', () => {
    let controller: TSAResilienceController;
    let redisStore: MockRedisStore;
    let events: ResilienceEvent[] = [];

    beforeEach(async () => {
      controller = createResilienceController({ enableDebugLogs: false });
      await controller.initialize();
      redisStore = new MockRedisStore();
      await redisStore.initialize();
      controller.setPrimaryStore(redisStore);
      
      events = [];
      controller.onEvent((event) => events.push(event));
    });

    afterEach(async () => {
      await controller.close();
      await redisStore.close();
    });

    it('应能进入和退出降级模式', () => {
      controller.enterFallbackMode('Redis failure');
      
      const status1 = controller.getStatus();
      expect(status1.fallbackMode).toBe(true);
      expect(status1.fallbackReason).toBe('Redis failure');

      controller.exitFallbackMode();
      
      const status2 = controller.getStatus();
      expect(status2.fallbackMode).toBe(false);
    });

    it('应能验证和修复数据', async () => {
      const key = 'verify_key';
      const value = { data: 'important' };
      const checksum = ChecksumUtil.computeObject(value);

      // 首次验证应创建备份
      const result1 = await controller.verifyData(key, value, checksum);
      expect(result1.valid).toBe(true);
      expect(result1.repaired).toBe(false);

      // 损坏的数据应被修复
      const corruptedValue = { data: 'corrupted' };
      const result2 = await controller.verifyData(key, corruptedValue, checksum);
      expect(result2.valid).toBe(true);
      expect(result2.repaired).toBe(true);
    });

    it('应能检测和解决冲突', () => {
      const key = 'conflict_key';
      const sources = [
        { source: 'redis-1', timestamp: Date.now() - 1000, checksum: 'abc', value: { v: 1 } },
        { source: 'redis-2', timestamp: Date.now() - 500, checksum: 'def', value: { v: 2 } },
      ];

      const result = controller.resolveConflict(key, sources);
      
      expect(result).not.toBeNull();
      expect(result!.resolution).toBe('resolved');
    });

    it('应发出正确的事件', async () => {
      controller.enterFallbackMode('Test');
      
      const fallbackEvents = events.filter(e => e.type === 'fallback_entered');
      expect(fallbackEvents.length).toBe(1);
      expect(fallbackEvents[0]).toMatchObject({
        type: 'fallback_entered',
        reason: 'Test',
      });

      await controller.exitFallbackMode();
      
      const exitEvents = events.filter(e => e.type === 'fallback_exited');
      expect(exitEvents.length).toBe(1);
    });

    it('应提供正确的统计信息', async () => {
      // 触发一些操作
      controller.enterFallbackMode('Test');
      
      const fallbackStore = controller.getFallbackStore();
      await fallbackStore.set('stat_key1', 'value1');
      
      // 修复一个损坏的数据
      const key = 'stat_corrupt';
      const value = { data: 'test' };
      const checksum = ChecksumUtil.computeObject(value);
      await controller.verifyData(key, value, checksum);
      await controller.verifyData(key, { data: 'corrupt' }, checksum);

      // 解决一个冲突
      controller.resolveConflict('stat_conflict', [
        { source: 'n1', timestamp: Date.now() - 1000, checksum: 'a', value: { v: 1 } },
        { source: 'n2', timestamp: Date.now() - 500, checksum: 'b', value: { v: 2 } },
      ]);

      const stats = controller.getStatus();
      expect(stats.fallbackMode).toBe(true);
      expect(stats.corruptionDetected).toBeGreaterThanOrEqual(0);
      expect(stats.conflictsDetected).toBeGreaterThanOrEqual(0);
    });

    it('同步应在退出降级模式时自动触发', async () => {
      controller.enterFallbackMode('Redis down');
      
      const fallbackStore = controller.getFallbackStore();
      await fallbackStore.set('auto_sync_key', 'value');

      // 模拟Redis恢复
      await controller.exitFallbackMode();

      // 等待同步完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证数据已同步
      const synced = await redisStore.get('auto_sync_key');
      expect(synced).toBe('value');
    });
  });

  // ==================== 故障注入测试 ====================

  describe('故障注入测试', () => {
    it('应处理Redis故障并降级', async () => {
      const redis = new MockRedisStore();
      await redis.initialize();
      
      const controller = createResilienceController();
      await controller.initialize();
      controller.setPrimaryStore(redis);

      // 正常写入
      await redis.set('key1', 'value1');
      expect(await redis.get('key1')).toBe('value1');

      // Redis故障
      redis.setShouldFail(true);
      
      // 进入降级模式
      controller.enterFallbackMode('Redis connection failed');
      
      // 降级存储应可写入
      const fallbackStore = controller.getFallbackStore();
      await fallbackStore.set('degraded_key', 'degraded_value');
      expect(await fallbackStore.get('degraded_key')).toBe('degraded_value');

      // Redis恢复
      redis.setShouldFail(false);
      
      // 退出降级模式，数据应同步
      await controller.exitFallbackMode();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(await redis.get('degraded_key')).toBe('degraded_value');

      await controller.close();
      await redis.close();
    });

    it('应处理数据损坏并修复', async () => {
      const repairManager = new RepairManager({ enableAutoRepair: true });
      const key = 'corrupt_key';
      const originalValue = { data: 'original', id: 123 };
      
      // 创建初始备份
      await repairManager.verifyAndRepair(key, originalValue, ChecksumUtil.computeObject(originalValue));

      // 模拟数据损坏（不同的checksum）
      const corruptedChecksum = 'deadbeef';
      const repairResult = await repairManager.verifyAndRepair(key, originalValue, corruptedChecksum);
      
      // 应检测到损坏并修复
      expect(repairResult.valid).toBe(true);
    });

    it('应处理Split-Brain场景', () => {
      const controller = createResilienceController({
        repair: { conflictResolution: 'timestamp' },
      });

      // 模拟两个节点同时写入
      const key = 'split_brain_key';
      const now = Date.now();
      const node1Write = {
        source: 'node-1',
        timestamp: now - 1000,
        checksum: ChecksumUtil.computeObject({ writer: 'node1', data: 'A' }),
        value: { writer: 'node1', data: 'A' },
      };
      const node2Write = {
        source: 'node-2',
        timestamp: now - 500,
        checksum: ChecksumUtil.computeObject({ writer: 'node2', data: 'B' }),
        value: { writer: 'node2', data: 'B' },
      };

      const result = controller.resolveConflict(key, [node1Write, node2Write]);
      
      expect(result).not.toBeNull();
      expect(result!.resolution).toBe('resolved');
      expect(result!.winningSource).toBe('node-2'); // node-2时间戳更新
    });
  });
});
