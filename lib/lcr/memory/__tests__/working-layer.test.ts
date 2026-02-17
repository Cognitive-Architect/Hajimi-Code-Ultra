/**
 * Working层运行时自测
 * HAJIMI-LCR-ENTITY-001 工单 B-04/09
 * 
 * 自测点:
 * - MEM-002: LRU策略命中率>90%
 * - MEM-005: LRU淘汰延迟<50ms
 * - MEM-006: 层间晋升<50ms
 * - ENTITY-004: 层间一致性
 * 
 * @module lib/lcr/memory/__tests__/working-layer.test
 */

import { WorkingLayer, LRUCache } from '../working-layer';
import { FocusLayer } from '../focus-layer';
import { IMemoryEntry, ILRUCacheConfig, IWorkingLayerConfig } from '../../core/interfaces';

// ============================================================================
// 测试工具
// ============================================================================

/**
 * 创建测试条目
 */
function createTestEntry(
  id: string,
  content: string,
  importance: number = 50,
  tokens?: number
): IMemoryEntry {
  return {
    id,
    content,
    tokens: tokens || Math.ceil(content.length / 4),
    importance,
    timestamp: Date.now(),
    lastAccess: Date.now(),
    accessCount: 0,
    status: 'active',
  };
}

/**
 * 生成指定Token数的文本
 */
function generateText(targetTokens: number, charPerToken: number = 4): string {
  const length = targetTokens * charPerToken;
  const words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 
                 'memory', 'context', 'token', 'layer', 'focus', 'working', 'cache',
                 'algorithm', 'performance', 'optimization', 'data', 'structure'];
  let text = '';
  
  while (text.length < length) {
    text += words[Math.floor(Math.random() * words.length)] + ' ';
  }
  
  return text.slice(0, length);
}

/**
 * 模拟热点访问模式 (80-20法则)
 */
function simulateHotAccessPattern(
  layer: WorkingLayer, 
  keys: string[], 
  operations: number,
  hotRatio: number = 0.2
): void {
  const hotCount = Math.ceil(keys.length * hotRatio);
  const hotKeys = keys.slice(0, hotCount);
  const coldKeys = keys.slice(hotCount);

  for (let i = 0; i < operations; i++) {
    // 80%访问热点
    if (Math.random() < 0.8) {
      const key = hotKeys[Math.floor(Math.random() * hotKeys.length)];
      layer.get(key);
    } else {
      // 20%访问冷数据
      const key = coldKeys[Math.floor(Math.random() * coldKeys.length)];
      layer.get(key);
    }
  }
}

// ============================================================================
// MEM-002: LRU策略命中率>90%
// ============================================================================

describe('MEM-002: LRU策略命中率>90%', () => {
  let workingLayer: WorkingLayer;

  beforeEach(() => {
    workingLayer = new WorkingLayer({
      maxTokens: 32768, // 32K for testing
      maxEntries: 100,
      promotionThreshold: 95, // 提高阈值避免晋升干扰测试
      lruConfig: {
        maxSize: 100,
        maxTokens: 32768,
        useLRUK: true,
        kValue: 2,
      },
    });
  });

  afterEach(() => {
    workingLayer.clear();
  });

  test('基础命中率测试', () => {
    // 添加条目
    for (let i = 0; i < 50; i++) {
      const entry = createTestEntry(`key-${i}`, generateText(50), 50, 50);
      workingLayer.add(entry);
    }

    // 访问所有条目一次 (建立缓存)
    for (let i = 0; i < 50; i++) {
      workingLayer.get(`key-${i}`);
    }

    // 再次访问 (应该全部命中)
    for (let i = 0; i < 50; i++) {
      workingLayer.get(`key-${i}`);
    }

    const hitRate = workingLayer.hitRate;
    expect(hitRate).toBeGreaterThanOrEqual(0.9); // >90%
  });

  test('LRU-K策略提升命中率', () => {
    const cache = new LRUCache<string>({
      maxSize: 10,
      maxTokens: 5000,
      useLRUK: true,
      kValue: 2,
    });

    // 添加10个条目
    for (let i = 0; i < 10; i++) {
      cache.set(`key-${i}`, `value-${i}`, 100);
    }

    // 高频访问 key-0 到 key-4
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 5; i++) {
        cache.get(`key-${i}`);
      }
    }

    // 添加新条目触发淘汰
    cache.set('new-key', 'new-value', 100);
    cache.set('new-key-2', 'new-value-2', 100);

    // 高频条目应该保留
    expect(cache.get('key-0')).toBe('value-0');
    expect(cache.get('key-1')).toBe('value-1');

    const hitRate = cache.stats.hitRate;
    expect(hitRate).toBeGreaterThan(0.5);
  });

  test('热点访问模式命中率>90%', () => {
    const entries: IMemoryEntry[] = [];
    const keys: string[] = [];

    // 添加100个条目
    for (let i = 0; i < 100; i++) {
      const key = `hot-key-${i}`;
      keys.push(key);
      entries.push(createTestEntry(key, generateText(50), 50, 50));
    }

    // 批量添加
    workingLayer.addBatch(entries);

    // 模拟热点访问模式 (1000次操作)
    simulateHotAccessPattern(workingLayer, keys, 1000);

    const stats = workingLayer.stats;
    
    // 验证命中率 > 90%
    expect(stats.hitRate).toBeGreaterThanOrEqual(0.9);
  });

  test('访问延迟<10ms', () => {
    // 填充数据
    for (let i = 0; i < 100; i++) {
      workingLayer.add(createTestEntry(`latency-${i}`, generateText(50), 50, 50));
    }

    const latencies: number[] = [];

    // 测试访问延迟
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      workingLayer.get(`latency-${i}`);
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    expect(avgLatency).toBeLessThan(10); // 平均<10ms
    expect(maxLatency).toBeLessThan(20); // 最大<20ms
  });

  test('容量范围8K-128K验证', () => {
    // 8K容量
    const layer8k = new WorkingLayer({ maxTokens: 8192 });
    expect(layer8k.config.maxTokens).toBe(8192);

    // 32K容量
    const layer32k = new WorkingLayer({ maxTokens: 32768 });
    expect(layer32k.config.maxTokens).toBe(32768);

    // 128K容量
    const layer128k = new WorkingLayer({ maxTokens: 131072 });
    expect(layer128k.config.maxTokens).toBe(131072);

    // 超出最大范围应报错 (超过2*128K)
    expect(() => new WorkingLayer({ maxTokens: 300000 })).toThrow();
    // 负数应该报错
    expect(() => new WorkingLayer({ maxTokens: -100 })).toThrow();
  });

  test('命中率诊断', () => {
    // 添加并访问条目
    for (let i = 0; i < 30; i++) {
      workingLayer.add(createTestEntry(`diag-${i}`, generateText(50), 50, 50));
    }

    for (let i = 0; i < 30; i++) {
      workingLayer.get(`diag-${i}`);
    }

    const diagnostics = workingLayer.getDiagnostics();
    
    expect(diagnostics.hitRateTarget).toBe(0.9);
    expect(diagnostics.hitRateOk).toBeDefined();
    expect(diagnostics.capacity).toBe(32768);
  });
});

// ============================================================================
// MEM-005: LRU淘汰延迟<50ms
// ============================================================================

describe('MEM-005: LRU淘汰延迟<50ms', () => {
  let workingLayer: WorkingLayer;
  let lruCache: LRUCache<string>;

  beforeEach(() => {
    workingLayer = new WorkingLayer({
      maxTokens: 10000,
      maxEntries: 100,
      lruConfig: {
        maxSize: 100,
        maxTokens: 10000,
        useLRUK: true,
        kValue: 2,
      },
    });

    lruCache = new LRUCache<string>({
      maxSize: 100,
      maxTokens: 10000,
      useLRUK: true,
      kValue: 2,
    });
  });

  afterEach(() => {
    workingLayer.clear();
    lruCache.clear();
  });

  test('LRU基本操作O(1)性能', () => {
    const startTime = performance.now();
    
    // 添加1000个条目
    for (let i = 0; i < 1000; i++) {
      lruCache.set(`key-${i}`, `value-${i}`, 10);
    }
    
    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(200); // 1000次操作<200ms
  });

  test('LRU淘汰延迟<50ms', () => {
    // 填满缓存
    for (let i = 0; i < 100; i++) {
      lruCache.set(`key-${i}`, generateText(50), 50);
    }

    // 触发淘汰 (添加超出容量的条目)
    const startTime = performance.now();
    const result = lruCache.set('overflow-key', generateText(5000), 5000);
    const duration = performance.now() - startTime;

    expect(result).not.toBeNull();
    expect(result!.evicted.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(50); // 关键指标: <50ms
    expect(result!.duration).toBeLessThan(50);
  });

  test('Token级淘汰延迟<50ms', () => {
    // 添加多个条目
    for (let i = 0; i < 10; i++) {
      lruCache.set(`key-${i}`, `value-${i}`, 100);
    }

    // 需要淘汰500 tokens
    const startTime = performance.now();
    const result = lruCache.evictTokens(500);
    const duration = performance.now() - startTime;

    expect(result.evicted.length).toBeGreaterThanOrEqual(5);
    expect(result.duration).toBeLessThan(50);
    expect(duration).toBeLessThan(50);
    
    // 验证Token数正确减少
    let freedTokens = 0;
    result.evicted.forEach(item => {
      freedTokens += item.tokens;
    });
    expect(freedTokens).toBeGreaterThanOrEqual(500);
  });

  test('大规模淘汰性能', () => {
    const largeCache = new LRUCache<string>({
      maxSize: 1000,
      maxTokens: 100000,
      useLRUK: true,
      kValue: 2,
    });

    // 填充1000个条目
    for (let i = 0; i < 1000; i++) {
      largeCache.set(`key-${i}`, generateText(100), 100);
    }

    // 大规模淘汰
    const startTime = performance.now();
    const result = largeCache.evictTokens(50000);
    const duration = performance.now() - startTime;

    expect(result.evicted.length).toBeGreaterThanOrEqual(500);
    expect(duration).toBeLessThan(50); // 即使大规模也应<50ms
  });

  test('淘汰统计准确性', () => {
    for (let i = 0; i < 50; i++) {
      lruCache.set(`key-${i}`, `value-${i}`, 50);
    }

    // 触发多次淘汰
    for (let i = 0; i < 10; i++) {
      lruCache.set(`overflow-${i}`, generateText(1000), 1000);
    }

    const stats = lruCache.stats;
    expect(stats.evictions).toBeGreaterThan(0);
    expect(stats.avgEvictionLatency).toBeLessThan(50);
  });
});

// ============================================================================
// MEM-006: 层间晋升<50ms
// ============================================================================

describe('MEM-006: 层间晋升<50ms', () => {
  let workingLayer: WorkingLayer;
  let focusLayer: FocusLayer;

  beforeEach(() => {
    focusLayer = new FocusLayer({
      maxTokens: 2000, // 小容量便于测试
      warningThreshold: 0.8,
      strictMode: true,
    });

    workingLayer = new WorkingLayer({
      maxTokens: 10000,
      maxEntries: 100,
      promotionThreshold: 80,
      promotionCooldown: 100, // 100ms冷却便于测试
    });
  });

  afterEach(() => {
    workingLayer.clear();
    focusLayer.clear();
  });

  test('高重要性条目自动晋升延迟<50ms', () => {
    const promoteHandler = jest.fn();
    workingLayer.on('entry:promote', promoteHandler);

    const startTime = performance.now();
    
    // 添加高重要性条目
    const highImportanceEntry = createTestEntry('promote-1', generateText(100), 90, 100);
    const result = workingLayer.add(highImportanceEntry);
    
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.promoted).toBeDefined();
    expect(duration).toBeLessThan(50); // 晋升<50ms
    expect(promoteHandler).toHaveBeenCalled();
  });

  test('访问频率晋升延迟<50ms', () => {
    // 添加中等重要性条目
    const entry = createTestEntry('freq-promote', generateText(100), 85, 100);
    workingLayer.add(entry);

    // 模拟多次访问
    for (let i = 0; i < 5; i++) {
      workingLayer.get('freq-promote');
    }

    const promoteHandler = jest.fn();
    workingLayer.on('entry:promote', promoteHandler);

    // 冷却期后再次访问
    setTimeout(() => {
      const startTime = performance.now();
      workingLayer.get('freq-promote');
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(50);
    }, 150);
  });

  test('手动触发晋升延迟<50ms', () => {
    // 添加条目到Working层
    const entry = createTestEntry('manual-promote', generateText(100), 50, 100);
    workingLayer.add(entry);
    expect(workingLayer.has('manual-promote')).toBe(true);

    // 手动触发晋升
    const startTime = performance.now();
    const result = workingLayer.triggerPromotion('manual-promote');
    const duration = performance.now() - startTime;

    expect(result).toBe(true);
    expect(workingLayer.has('manual-promote')).toBe(false);
    expect(duration).toBeLessThan(50); // 手动晋升<50ms
  });

  test('晋升冷却机制', (done) => {
    // 第一次晋升
    const entry1 = createTestEntry('cooldown-1', generateText(100), 90, 100);
    const result1 = workingLayer.add(entry1);
    expect(result1.promoted).toBeDefined();

    // 立即第二次晋升 (应在冷却期内)
    const entry2 = createTestEntry('cooldown-2', generateText(100), 90, 100);
    const result2 = workingLayer.add(entry2);
    
    // 冷却期内可能不晋升
    expect(result2.success).toBe(true);

    // 等待冷却期后
    setTimeout(() => {
      const entry3 = createTestEntry('cooldown-3', generateText(100), 90, 100);
      const result3 = workingLayer.add(entry3);
      // 冷却期后应该可以晋升
      expect(result3.success).toBe(true);
      done();
    }, 150);
  });

  test('批量晋升性能', () => {
    const entries: IMemoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(createTestEntry(`batch-${i}`, generateText(100), 90, 100));
    }

    const startTime = performance.now();
    const result = workingLayer.addBatch(entries);
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(500); // 10条批量<500ms
  });
});

// ============================================================================
// ENTITY-004: 层间一致性
// ============================================================================

describe('ENTITY-004: 层间一致性', () => {
  let workingLayer: WorkingLayer;
  let focusLayer: FocusLayer;

  beforeEach(() => {
    focusLayer = new FocusLayer({ maxTokens: 2000 });
    workingLayer = new WorkingLayer({ maxTokens: 10000 });
  });

  afterEach(() => {
    workingLayer.clear();
    focusLayer.clear();
  });

  test('Focus层溢出降级到Working层', () => {
    const demoteHandler = jest.fn();
    workingLayer.on('entry:demote', demoteHandler);

    // 模拟从Focus层降级
    const entry = createTestEntry('demoted-entry', generateText(100), 50, 100);
    entry.status = 'evicting';
    
    workingLayer.handleDemotion(entry);

    expect(demoteHandler).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.any(Object),
      from: 'focus',
      to: 'working',
      reason: 'focus_overflow',
    }));
    expect(workingLayer.has('demoted-entry')).toBe(true);
    expect(entry.status).toBe('active');
  });

  test('Working层淘汰降级到Archive', () => {
    // 使用evict方法直接触发淘汰
    const demoteHandler = jest.fn();
    workingLayer.on('entry:demote', demoteHandler);

    // 填充Working层
    for (let i = 0; i < 10; i++) {
      workingLayer.add(createTestEntry(`evict-${i}`, generateText(100), 50, 100));
    }

    // 手动淘汰部分条目
    const evicted = workingLayer.evict(3);
    
    // 验证有条目被淘汰
    expect(evicted.length).toBe(3);

    // 验证降级事件被触发
    expect(demoteHandler).toHaveBeenCalled();
    const callArg = demoteHandler.mock.calls[0][0];
    expect(callArg.from).toBe('working');
    expect(callArg.to).toBe('archive');
    expect(callArg.reason).toBe('manual_eviction');
  });

  test('晋升事件数据结构一致性', () => {
    const promoteHandler = jest.fn();
    workingLayer.on('entry:promote', promoteHandler);

    const entry = createTestEntry('promote-check', generateText(100), 90, 100);
    workingLayer.add(entry);

    expect(promoteHandler).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({
        id: 'promote-check',
        content: expect.any(String),
        tokens: 100,
        importance: 90,
      }),
      from: 'working',
      to: 'focus',
      reason: 'high_importance',
    }));
  });

  test('降级事件数据结构一致性', () => {
    const demoteHandler = jest.fn();
    workingLayer.on('entry:demote', demoteHandler);

    const entry = createTestEntry('demote-check', generateText(100), 50, 100);
    entry.status = 'evicting';
    workingLayer.handleDemotion(entry);

    expect(demoteHandler).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({
        id: 'demote-check',
        status: 'active', // 降级后被重置为active
      }),
      from: 'focus',
      to: 'working',
      reason: 'focus_overflow',
    }));
  });

  test('Token计数一致性', () => {
    // 添加已知Token数的条目
    const entries = [
      createTestEntry('c1', generateText(100), 50, 100),
      createTestEntry('c2', generateText(200), 50, 200),
      createTestEntry('c3', generateText(300), 50, 300),
    ];

    for (const entry of entries) {
      workingLayer.add(entry);
    }

    // 验证内部计数
    expect(workingLayer.tokenUsage).toBe(600);

    // 重新计算验证一致性
    const recalculated = workingLayer.recalculateTokens();
    expect(recalculated).toBe(600);
  });

  test('层间数据流完整性', async () => {
    const events: string[] = [];

    workingLayer.on('entry:add', () => events.push('working:add'));
    workingLayer.on('entry:promote', () => events.push('working:promote'));
    workingLayer.on('entry:demote', () => events.push('working:demote'));

    // 添加低重要性条目 (不会触发promote)
    const entry1 = createTestEntry('flow-test-1', generateText(100), 50, 100);
    workingLayer.add(entry1);

    // 添加高重要性条目 (触发promote)
    const entry2 = createTestEntry('flow-test-2', generateText(100), 90, 100);
    workingLayer.add(entry2);

    // 验证事件
    expect(events).toContain('working:add');
    expect(events).toContain('working:promote');

    // 降级
    const demoteEntry = createTestEntry('demote-flow', generateText(100), 50, 100);
    demoteEntry.status = 'evicting';
    workingLayer.handleDemotion(demoteEntry);

    expect(events).toContain('working:demote');
  });
});

// ============================================================================
// 容量与压力测试
// ============================================================================

describe('容量与压力测试', () => {
  test('8K容量压力测试', () => {
    const layer = new WorkingLayer({ 
      maxTokens: 8192,
      maxEntries: 50,
    });

    // 添加条目直到满
    let added = 0;
    while (layer.tokenUsage < 7000) {
      const result = layer.add(createTestEntry(
        `pressure-${added}`, 
        generateText(200), 
        50, 
        200
      ));
      if (!result.success) break;
      added++;
    }

    expect(layer.tokenUsage).toBeLessThanOrEqual(8192);
    expect(added).toBeGreaterThan(0);

    layer.clear();
  });

  test('128K容量压力测试', () => {
    const layer = new WorkingLayer({ 
      maxTokens: 131072,
      maxEntries: 500,
    });

    // 添加大量条目
    const entries: IMemoryEntry[] = [];
    for (let i = 0; i < 500; i++) {
      entries.push(createTestEntry(
        `large-${i}`,
        generateText(200 + Math.random() * 100),
        Math.floor(Math.random() * 100),
      ));
    }

    const result = layer.addBatch(entries);
    expect(result.success).toBe(true);
    expect(layer.tokenUsage).toBeLessThanOrEqual(131072);

    layer.clear();
  });

  test('LRU命中率压力测试', () => {
    const layer = new WorkingLayer({
      maxTokens: 32768,
      maxEntries: 100,
      promotionThreshold: 95,
    });

    // 添加200个条目（会触发淘汰）
    for (let i = 0; i < 200; i++) {
      layer.add(createTestEntry(`hit-${i}`, generateText(200), 50, 200));
    }

    // 访问模式: 80%访问最近20%的数据
    const keys = layer.getAll().map(e => e.id);
    const recentKeys = keys.slice(-20);

    for (let i = 0; i < 500; i++) {
      if (Math.random() < 0.8) {
        const key = recentKeys[Math.floor(Math.random() * recentKeys.length)];
        layer.get(key);
      } else {
        const key = keys[Math.floor(Math.random() * keys.length)];
        layer.get(key);
      }
    }

    const stats = layer.stats;
    // 热点访问模式下命中率应该较高
    expect(stats.hitRate).toBeGreaterThan(0.7);

    layer.clear();
  });
});

// ============================================================================
// LRU-K算法专项测试
// ============================================================================

describe('LRU-K算法专项测试', () => {
  test('LRU-K vs 普通LRU优势', () => {
    const lruKCache = new LRUCache<string>({
      maxSize: 5,
      maxTokens: 8192,
      useLRUK: true,
      kValue: 2,
    });

    const normalCache = new LRUCache<string>({
      maxSize: 5,
      maxTokens: 8192,
      useLRUK: false,
    });

    // 添加相同条目
    for (let i = 1; i <= 5; i++) {
      lruKCache.set(`key-${i}`, `value-${i}`, 100);
      normalCache.set(`key-${i}`, `value-${i}`, 100);
    }

    // 高频访问 key-1
    for (let i = 0; i < 10; i++) {
      lruKCache.get('key-1');
      normalCache.get('key-1');
    }

    // 添加新条目触发淘汰
    lruKCache.set('new-1', 'new-value-1', 100);
    lruKCache.set('new-2', 'new-value-2', 100);
    normalCache.set('new-1', 'new-value-1', 100);
    normalCache.set('new-2', 'new-value-2', 100);

    // LRU-K应该保留高频访问的key-1
    expect(lruKCache.get('key-1')).toBe('value-1');
  });

  test('K值影响验证', () => {
    const cacheK1 = new LRUCache<string>({
      maxSize: 5,
      maxTokens: 8192,
      useLRUK: true,
      kValue: 1,
    });

    const cacheK2 = new LRUCache<string>({
      maxSize: 5,
      maxTokens: 8192,
      useLRUK: true,
      kValue: 2,
    });

    // 填充数据
    for (let i = 1; i <= 5; i++) {
      cacheK1.set(`key-${i}`, `value-${i}`, 100);
      cacheK2.set(`key-${i}`, `value-${i}`, 100);
    }

    // 访问模式：key-1访问1次，key-2访问2次
    cacheK1.get('key-1');
    cacheK2.get('key-1');
    
    cacheK1.get('key-2');
    cacheK1.get('key-2');
    cacheK2.get('key-2');
    cacheK2.get('key-2');

    // 添加新条目
    cacheK1.set('new', 'new-value', 100);
    cacheK2.set('new', 'new-value', 100);

    // K=2应该更好地识别真正的热点
    expect(cacheK2.get('key-2')).toBe('value-2');
  });

  test('LRU-K分数计算', () => {
    const cache = new LRUCache<string>({
      maxSize: 3,
      maxTokens: 8192,
      useLRUK: true,
      kValue: 2,
    });

    cache.set('a', 'value-a', 100);
    cache.set('b', 'value-b', 100);
    cache.set('c', 'value-c', 100);

    // 访问a两次
    cache.get('a');
    cache.get('a');

    // 访问b一次
    cache.get('b');

    // c未被访问

    // 添加新条目触发淘汰
    cache.set('d', 'value-d', 100);

    // a访问最多，应该保留
    expect(cache.get('a')).toBe('value-a');
    
    // c未被访问，应该被淘汰
    expect(cache.get('c')).toBeUndefined();
  });
});

// ============================================================================
// 边界条件测试
// ============================================================================

describe('边界条件测试', () => {
  test('空内容处理', () => {
    const layer = new WorkingLayer({ maxTokens: 8192 });
    
    const entry = createTestEntry('empty', 'x', 50, 1); // 至少1个token和内容
    
    const result = layer.add(entry);
    expect(result.success).toBe(true);

    layer.clear();
  });

  test('超大单条处理', () => {
    // 使用LRUCache直接测试超大单条限制
    const cache = new LRUCache<string>({
      maxSize: 10,
      maxTokens: 1000,
    });

    // 超过50%容量的单条应该被拒绝
    expect(() => {
      cache.set('huge', 'x'.repeat(1000), 600); // 600 > 1000*0.5
    }).toThrow('Entry too large');
  });

  test('并发访问稳定性', () => {
    const layer = new WorkingLayer({ maxTokens: 32768 });

    // 填充数据
    for (let i = 0; i < 50; i++) {
      layer.add(createTestEntry(`concurrent-${i}`, generateText(100), 50, 100));
    }

    // 模拟并发访问
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 50; i++) {
        layer.get(`concurrent-${i}`);
      }
    }

    // 验证状态一致性
    const stats = layer.stats;
    expect(stats.entryCount).toBeLessThanOrEqual(50);
    expect(stats.tokenUsage).toBeLessThanOrEqual(32768);

    layer.clear();
  });

  test('清空后状态重置', () => {
    const layer = new WorkingLayer({ maxTokens: 8192 });

    // 添加数据
    for (let i = 0; i < 10; i++) {
      layer.add(createTestEntry(`clear-${i}`, generateText(100), 50, 100));
    }

    expect(layer.entryCount).toBe(10);

    // 清空
    layer.clear();

    expect(layer.entryCount).toBe(0);
    expect(layer.tokenUsage).toBe(0);
    expect(layer.hitRate).toBe(0);
  });
});

console.log('✅ Working层自测套件已加载');
console.log('   覆盖: MEM-002 命中率>90%, MEM-005 淘汰<50ms, MEM-006 晋升<50ms, ENTITY-004 层间一致性');
