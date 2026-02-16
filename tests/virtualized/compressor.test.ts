/**
 * HAJIMI VIRTUALIZED - ContextCompressor测试
 */

import { ContextCompressor } from '@/lib/fabric/compressor';

describe('ContextCompressor', () => {
  let compressor: ContextCompressor;

  beforeEach(() => {
    compressor = new ContextCompressor();
  });

  describe('[COMP-001] 压缩率>80%', () => {
    it('应达到目标压缩率', () => {
      const testData = '这是一段测试数据，包含足够的重复内容来测试压缩效果。'.repeat(100);
      
      const result = compressor.compress(testData);
      
      expect(result.success).toBe(true);
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0.8);
    });

    it('应支持不同压缩模式', () => {
      const testData = '测试数据'.repeat(200);
      
      const speedResult = compressor.compress(testData, 'SPEED');
      const sizeResult = compressor.compress(testData, 'SIZE');
      
      expect(speedResult.success).toBe(true);
      expect(sizeResult.success).toBe(true);
    });
  });

  describe('[COMP-002] Remix格式验证', () => {
    it('应生成有效Remix Pattern', () => {
      const testData = '测试数据'.repeat(50);
      
      const remix = compressor.remix(testData);
      
      expect(remix.type).toBe('REMIXED_CONTEXT');
      expect(remix.version).toBe('1.0.0');
      expect(remix.compression).toBeDefined();
      expect(remix.preservedKeys).toBeDefined();
      expect(remix.discardedDetails).toBeDefined();
      expect(remix.hashChain).toBeDefined();
    });
  });

  describe('[COMP-003] 哈希链完整性', () => {
    it('应维护哈希链', () => {
      compressor.compress('数据1');
      compressor.compress('数据2');
      compressor.compress('数据3');
      
      const hashChain = compressor.getHashChain();
      
      expect(hashChain.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('[COMP-004] 解压可恢复性', () => {
    it('应支持解压', () => {
      const originalData = '这是一段可以恢复的数据'.repeat(20);
      
      const compressed = compressor.compress(originalData);
      const decompressed = compressor.decompress(compressed);
      
      expect(decompressed).toBe(originalData);
    });
  });

  describe('性能测试', () => {
    it('压缩应在合理时间内完成', () => {
      const largeData = 'x'.repeat(10000);
      
      const start = performance.now();
      compressor.compress(largeData);
      const elapsed = performance.now() - start;
      
      expect(elapsed).toBeLessThan(5000); // <5秒
    });
  });
});
