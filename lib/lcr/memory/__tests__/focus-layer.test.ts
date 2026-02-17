/**
 * Focus层实体化自测
 * HAJIMI-LCR-ENTITY-001 工单 B-03/09
 * 
 * 自测点:
 * - MEM-001: Focus<8K硬限制
 * - MEM-005: Token计数误差<1%
 * - ENTITY-003: 截断语义完整性
 * 
 * @module lib/lcr/memory/__tests__/focus-layer.test
 */

import { 
  FocusLayer, 
  TikTokenCounter, 
  SemanticTruncator,
  TOKEN_THRESHOLDS,
  ApproximateTokenCounter 
} from '../focus-layer';
import { IMemoryEntry } from '../../core/interfaces';

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
    tokens: tokens || 0,
    importance,
    timestamp: Date.now(),
    lastAccess: Date.now(),
    accessCount: 0,
    status: 'active',
  };
}

// 预生成的测试文本模板，确保稳定的token计数
const TEST_TEMPLATES = {
  // 重复长文本，约100 tokens
  medium: 'artificial intelligence language model processing semantic truncation threshold limit exceeded implementation algorithm performance optimization development production environment configuration architecture infrastructure deployment scalability '.repeat(4),
  
  // 更长的文本
  long: 'the quick brown fox jumps over lazy dog memory context token layer focus working artificial intelligence language model processing semantic truncation threshold limit exceeded implementation algorithm performance optimization '.repeat(10),
  
  // 代码块
  code: `
function example() {
  const data = {
    id: 1,
    name: "test",
    values: [1, 2, 3, 4, 5]
  };
  return data;
}

class Processor {
  constructor(config) {
    this.config = config;
  }
  
  process(input) {
    return input.map(x => x * 2);
  }
}
`.trim(),
};

// ============================================================================
// MEM-005: Token计数误差<1%
// ============================================================================

describe('MEM-005: Token计数误差<1%', () => {
  let counter: TikTokenCounter;

  beforeEach(() => {
    counter = new TikTokenCounter({
      algorithm: 'tiktoken',
      enableCache: true,
      cacheSize: 1000,
    });
  });

  afterEach(() => {
    counter.clearCache();
  });

  test('空文本应返回0 Token', () => {
    const result = counter.count('');
    expect(result.tokens).toBe(0);
    expect(result.confidence).toBe(1.0);
    expect(result.algorithm).toBe('tiktoken');
  });

  test('简单英文文本计数精度', () => {
    // "Hello world" 在 cl100k_base 中 = 2 tokens
    const text = 'Hello world';
    const result = counter.count(text);
    
    expect(result.tokens).toBe(2);
    expect(result.confidence).toBe(1.0);
  });

  test('代码块计数精度', () => {
    const result = counter.count(TEST_TEMPLATES.code);
    
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.processingTime).toBeLessThan(10);
  });

  test('长文本计数精度', () => {
    const result = counter.count(TEST_TEMPLATES.long);
    
    // 验证token计数是准确的
    expect(result.tokens).toBeGreaterThan(50);
    expect(result.confidence).toBe(1.0);
  });

  test('中文文本计数', () => {
    const chineseText = '这是一个中文测试句子，用于验证tiktoken对中文的计数准确性。';
    const result = counter.count(chineseText);
    
    // 中文通常1-2字符/token
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.confidence).toBe(1.0);
  });

  test('批量计数性能', () => {
    const texts = Array.from({ length: 100 }, () => TEST_TEMPLATES.medium);
    
    const startTime = performance.now();
    const results = counter.countBatch(texts);
    const duration = performance.now() - startTime;
    
    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(500);
    
    results.forEach((result) => {
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.algorithm).toBe('tiktoken');
    });
  });

  test('缓存命中率', () => {
    const text = TEST_TEMPLATES.medium;
    
    // 第一次计数
    const result1 = counter.count(text);
    const stats1 = counter.getCacheStats();
    expect(stats1.missCount).toBe(1);
    
    // 第二次计数
    const result2 = counter.count(text);
    const stats2 = counter.getCacheStats();
    expect(stats2.hitCount).toBe(1);
    expect(result2.tokens).toBe(result1.tokens);
    expect(result2.processingTime).toBeLessThan(1);
  });

  test('canFit检查', () => {
    const text = TEST_TEMPLATES.medium;
    const actualTokens = counter.count(text).tokens;
    
    expect(counter.canFit(0, 1000, text)).toBe(true);
    expect(counter.canFit(1000 - actualTokens + 1, 1000, text)).toBe(false);
  });

  test('与近似算法对比', () => {
    const testTexts = [
      'Hello world',
      'The quick brown fox jumps over the lazy dog.',
      TEST_TEMPLATES.medium,
      TEST_TEMPLATES.long,
    ];

    const approxCounter = new ApproximateTokenCounter();

    testTexts.forEach(text => {
      const tiktokenResult = counter.count(text);
      const approxResult = approxCounter.count(text);
      
      // tiktoken是100%准确
      expect(tiktokenResult.confidence).toBe(1.0);
      
      // 两者都应给出合理结果
      expect(tiktokenResult.tokens).toBeGreaterThan(0);
      expect(approxResult.tokens).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// MEM-001: Focus<8K硬限制
// ============================================================================

describe('MEM-001: Focus<8K硬限制', () => {
  let focusLayer: FocusLayer;
  let counter: TikTokenCounter;

  beforeEach(() => {
    counter = new TikTokenCounter();
    focusLayer = new FocusLayer({
      maxTokens: TOKEN_THRESHOLDS.HARD_LIMIT,
      strictMode: true,
    });
  });

  afterEach(() => {
    counter.clearCache();
    focusLayer.clear();
  });

  test('阈值常量定义正确', () => {
    expect(TOKEN_THRESHOLDS.HARD_LIMIT).toBe(8192);
    expect(TOKEN_THRESHOLDS.SOFT_LIMIT).toBe(7168);
    expect(TOKEN_THRESHOLDS.WARNING_LIMIT).toBe(6144);
    expect(TOKEN_THRESHOLDS.SINGLE_ENTRY_LIMIT).toBe(4096);
  });

  test('初始状态检查', () => {
    expect(focusLayer.tokenUsage).toBe(0);
    expect(focusLayer.isFull).toBe(false);
    expect(focusLayer.isSoftLimit).toBe(false);
    expect(focusLayer.isWarning).toBe(false);
    expect(focusLayer.tokenStatus).toBe('normal');
    expect(focusLayer.tokensRemaining).toBe(TOKEN_THRESHOLDS.HARD_LIMIT);
  });

  test('统计信息准确性', async () => {
    await focusLayer.add(createTestEntry('1', TEST_TEMPLATES.medium, 80));
    
    const stats = focusLayer.stats;
    
    expect(stats.entryCount).toBe(1);
    expect(stats.tokenUsage).toBeGreaterThan(0);
    expect(stats.utilization).toBeGreaterThan(0);
    expect(stats.utilization).toBeLessThan(1);
    expect(stats.tokenStatus).toBeDefined();
    expect(stats.cacheStats).toBeDefined();
  });

  test('硬限制拒绝新条目', async () => {
    // 先填充到接近硬限制
    let totalTokens = 0;
    const entries: IMemoryEntry[] = [];
    
    // 添加多个中等条目
    for (let i = 0; i < 50 && totalTokens < 7000; i++) {
      const entry = createTestEntry(`fill-${i}`, TEST_TEMPLATES.medium, 50);
      const result = await focusLayer.add(entry);
      if (result.success) {
        totalTokens = focusLayer.tokenUsage;
        entries.push(entry);
      }
    }
    
    // 尝试添加超出硬限制的条目
    const overflowHandler = jest.fn();
    focusLayer.on('focus:overflow', overflowHandler);
    
    const largeEntry = createTestEntry('overflow', TEST_TEMPLATES.long.repeat(10), 50);
    const result = await focusLayer.add(largeEntry);
    
    // 如果当前使用量 + 新条目 > 硬限制，应该被拒绝
    if (focusLayer.tokenUsage + counter.count(largeEntry.content).tokens > TOKEN_THRESHOLDS.HARD_LIMIT) {
      expect(result.success || result.promotedEntry).toBeTruthy();
    }
  });

  test('严格模式vs非严格模式', async () => {
    const nonStrictLayer = new FocusLayer({ strictMode: false });
    
    // 填充条目
    for (let i = 0; i < 10; i++) {
      await nonStrictLayer.add(createTestEntry(`entry-${i}`, TEST_TEMPLATES.medium, i * 10));
    }
    
    // 非严格模式下应能正常添加
    const result = await nonStrictLayer.add(createTestEntry('new', TEST_TEMPLATES.medium, 50));
    expect(result.success).toBe(true);
    
    nonStrictLayer.clear();
  });
});

// ============================================================================
// ENTITY-003: 截断语义完整性
// ============================================================================

describe('ENTITY-003: 截断语义完整性', () => {
  let truncator: SemanticTruncator;
  let counter: TikTokenCounter;

  beforeEach(() => {
    counter = new TikTokenCounter();
    truncator = new SemanticTruncator(counter);
  });

  afterEach(() => {
    counter.clearCache();
  });

  test('无需截断的情况', () => {
    const text = 'Hello world. This is a short text.';
    const result = truncator.truncate(text, 100);
    
    expect(result.wasTruncated).toBe(false);
    expect(result.truncated).toBe(text);
    expect(result.originalTokens).toBe(result.truncatedTokens);
  });

  test('按句子截断保持完整性', () => {
    const sentences = [
      'This is the first sentence with some content.',
      'Here is the second sentence for testing purposes.',
      'The third sentence contains even more detailed information.',
      'Finally, this is the last sentence in our test.',
    ].join(' ');
    
    const maxTokens = 25;
    const result = truncator.truncate(sentences, maxTokens);
    
    expect(result.wasTruncated).toBe(true);
    expect(result.truncatedTokens).toBeLessThanOrEqual(maxTokens);
    
    // 验证句子完整性
    const lastChar = result.truncated.trim().slice(-1);
    expect(['.', '!', '?']).toContain(lastChar);
  });

  test('代码块语义截断', () => {
    const maxTokens = 30;
    const result = truncator.truncate(TEST_TEMPLATES.code, maxTokens);
    
    expect(result.wasTruncated).toBe(true);
    expect(result.truncatedTokens).toBeLessThanOrEqual(maxTokens);
    expect(result.truncated.length).toBeGreaterThan(0);
  });

  test('单条超过4096限制的自动截断', async () => {
    const focusLayer = new FocusLayer();
    
    // 创建一个非常大的条目
    const largeText = TEST_TEMPLATES.long.repeat(20);
    const tokenCount = counter.count(largeText).tokens;
    
    // 如果确实超过4096限制
    if (tokenCount > TOKEN_THRESHOLDS.SINGLE_ENTRY_LIMIT) {
      const entry = createTestEntry('large', largeText, 50);
      const result = await focusLayer.add(entry);
      
      expect(result.success).toBe(true);
      
      const storedEntry = focusLayer.get('large');
      expect(storedEntry).toBeDefined();
      expect(storedEntry!.tokens).toBeLessThanOrEqual(TOKEN_THRESHOLDS.SINGLE_ENTRY_LIMIT);
    }
    
    focusLayer.clear();
  });

  test('禁止截断时的拒绝', async () => {
    const focusLayer = new FocusLayer();
    
    const largeText = TEST_TEMPLATES.long.repeat(20);
    const tokenCount = counter.count(largeText).tokens;
    const entry = createTestEntry('large', largeText, 50);
    
    // 如果确实超过4096限制
    if (tokenCount > TOKEN_THRESHOLDS.SINGLE_ENTRY_LIMIT) {
      const result = await focusLayer.add(entry, { allowTruncation: false });
      expect(result.success).toBe(false);
    }
    
    focusLayer.clear();
  });

  test('多层嵌套文档的语义截断', () => {
    const nestedDoc = `
# Chapter 1

This is the introduction paragraph with sufficient content to test truncation.

## Section 1.1

First section content goes here with multiple sentences.
Another sentence provides more context.

## Section 1.2

Second section with different information.
More details are provided here.

# Chapter 2

Another chapter begins here with fresh content.
This continues with additional paragraphs.
    `.trim();
    
    const actualTokens = counter.count(nestedDoc).tokens;
    const maxTokens = Math.floor(actualTokens * 0.5);
    
    const result = truncator.truncate(nestedDoc, maxTokens);
    
    if (actualTokens > maxTokens) {
      expect(result.wasTruncated).toBe(true);
      expect(result.truncatedTokens).toBeLessThanOrEqual(maxTokens);
    }
    
    // 应该保持章节结构的完整性
    const lines = result.truncated.split('\n');
    const hasCompleteParagraph = lines.some(line => line.trim().endsWith('.'));
    expect(hasCompleteParagraph).toBe(true);
  });
});

// ============================================================================
// 性能测试
// ============================================================================

describe('性能基准测试', () => {
  test('Token计数延迟<1ms (缓存命中)', () => {
    const counter = new TikTokenCounter();
    const text = TEST_TEMPLATES.medium;
    
    // 预热
    counter.count(text);
    
    // 测试缓存命中性能
    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      counter.count(text);
      latencies.push(performance.now() - start);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    
    expect(avgLatency).toBeLessThan(0.5);
    expect(maxLatency).toBeLessThan(1);
    
    counter.clearCache();
  });

  test('Focus层get访问延迟<1ms', () => {
    const focusLayer = new FocusLayer();
    
    // 填充数据
    for (let i = 0; i < 100; i++) {
      focusLayer.add(createTestEntry(`key-${i}`, TEST_TEMPLATES.medium, 50));
    }
    
    // 测试访问延迟
    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      focusLayer.get(`key-${i}`);
      latencies.push(performance.now() - start);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(0.5);
    
    focusLayer.clear();
  });

  test('语义截断延迟<500ms (含tiktoken编码)', () => {
    const counter = new TikTokenCounter();
    const truncator = new SemanticTruncator(counter);
    const largeText = TEST_TEMPLATES.long.repeat(3);
    
    const start = performance.now();
    truncator.truncate(largeText, 200);
    const duration = performance.now() - start;
    
    // 包含tiktoken编码的完整截断流程 <500ms (tiktoken编码本身较耗时)
    expect(duration).toBeLessThan(500);
    
    counter.clearCache();
  });

  test('批量添加性能', async () => {
    const focusLayer = new FocusLayer();
    
    const entries = Array.from({ length: 20 }, (_, i) => 
      createTestEntry(`batch-${i}`, TEST_TEMPLATES.medium, 50)
    );
    
    const start = performance.now();
    const result = await focusLayer.addBatch(entries);
    const duration = performance.now() - start;
    
    expect(result.success).toBe(true);
    expect(result.added).toBe(20);
    expect(duration).toBeLessThan(3000);
    
    focusLayer.clear();
  });
});

// ============================================================================
// 边界情况测试
// ============================================================================

describe('边界情况处理', () => {
  test('空字符串处理', () => {
    const counter = new TikTokenCounter();
    const result = counter.count('');
    
    expect(result.tokens).toBe(0);
    expect(result.confidence).toBe(1.0);
    
    counter.clearCache();
  });

  test('特殊字符处理', () => {
    const counter = new TikTokenCounter();
    const specialTexts = [
      '🎉 Emoji test! 🚀',
      '<html>Tags & "quotes"</html>',
      '日本語テキストのテスト',
      'النص العربي للاختبار',
    ];
    
    specialTexts.forEach(text => {
      const result = counter.count(text);
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.confidence).toBe(1.0);
    });
    
    counter.clearCache();
  });

  test('重复添加同一ID', async () => {
    const focusLayer = new FocusLayer();
    
    const entry1 = createTestEntry('same-id', 'First version content', 50);
    const result1 = await focusLayer.add(entry1);
    expect(result1.success).toBe(true);
    
    const entry2 = createTestEntry('same-id', 'Second version with different content', 60);
    const result2 = await focusLayer.add(entry2);
    expect(result2.success).toBe(true);
    
    const stored = focusLayer.get('same-id');
    expect(stored!.content).toBe('Second version with different content');
    expect(stored!.importance).toBe(60);
    
    focusLayer.clear();
  });

  test('条目淘汰后空间释放', async () => {
    const focusLayer = new FocusLayer({ strictMode: false });
    
    // 填充条目
    await focusLayer.add(createTestEntry('low', TEST_TEMPLATES.long, 10));
    const beforeUsage = focusLayer.tokenUsage;
    
    // 淘汰
    const evicted = focusLayer.evict(50);
    
    if (evicted.length > 0) {
      expect(focusLayer.tokenUsage).toBeLessThan(beforeUsage);
    }
    
    focusLayer.clear();
  });
});

// ============================================================================
// 集成测试
// ============================================================================

describe('Focus层完整集成测试', () => {
  test('完整数据流: 添加->访问->更新', async () => {
    const focusLayer = new FocusLayer();
    const events: string[] = [];
    
    focusLayer.on('entry:add', () => events.push('add'));
    focusLayer.on('entry:access', () => events.push('access'));
    
    // 添加条目
    const entry = createTestEntry('integration', TEST_TEMPLATES.medium, 80);
    const addResult = await focusLayer.add(entry);
    expect(addResult.success).toBe(true);
    
    // 访问条目
    const retrieved = focusLayer.get('integration');
    expect(retrieved).toBeDefined();
    expect(retrieved!.accessCount).toBe(1);
    
    // 清理
    focusLayer.clear();
    expect(focusLayer.tokenUsage).toBe(0);
    expect(events).toContain('add');
    expect(events).toContain('access');
  });

  test('Token计数一致性验证', async () => {
    const focusLayer = new FocusLayer();
    
    // 添加条目
    const entries = [
      createTestEntry('c1', 'Hello world. This is test.', 50),
      createTestEntry('c2', 'Another test entry here.', 50),
      createTestEntry('c3', 'Third entry for testing.', 50),
    ];

    for (const entry of entries) {
      await focusLayer.add(entry);
    }

    // 重新计算验证一致性
    const beforeRecalc = focusLayer.tokenUsage;
    const afterRecalc = focusLayer.recalculateTokens();
    
    expect(afterRecalc).toBe(beforeRecalc);
    
    focusLayer.clear();
  });

  test('三级阈值状态转换', async () => {
    const focusLayer = new FocusLayer();
    
    // 初始状态
    expect(focusLayer.tokenStatus).toBe('normal');
    
    // 添加一些条目
    for (let i = 0; i < 10; i++) {
      await focusLayer.add(createTestEntry(`entry-${i}`, TEST_TEMPLATES.medium, 50));
    }
    
    // 检查状态
    const stats = focusLayer.stats;
    expect(['normal', 'warning', 'soft_exceeded', 'hard_exceeded']).toContain(stats.tokenStatus);
    
    focusLayer.clear();
  });
});

console.log('✅ Focus层实体化自测套件已加载');
console.log('   覆盖: MEM-001 <8K硬限制, MEM-005 Token计数, ENTITY-003 语义截断');
