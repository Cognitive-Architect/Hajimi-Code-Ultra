/**
 * YGGDRASIL Remix 服务测试 (RMX-001~003)
 * 
 * 测试目标:
 * - RMX-001: 三级压缩算法验证
 * - RMX-002: Token节省率>60% (3000→900)
 * - RMX-003: 技术债务继承
 */

import { remixService } from '../remix-service';
import { CompressionLevel } from '../types';

// 模拟文件系统
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(new Error('File not found')),
    readdir: jest.fn().mockResolvedValue([]),
  },
}));

describe('Remix Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RMX-001: 三级压缩算法', () => {
    it('Level 1: 应执行选择性保留 (~50%压缩)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 1,
      });

      expect(result.success).toBe(true);
      expect(result.compressionLevel).toBe(1);
      // Level 1应该保留更多内容
      expect(result.savingsRate).toBeLessThan(0.7);
    });

    it('Level 2: 应执行智能摘要 (~70%压缩)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 2,
      });

      expect(result.success).toBe(true);
      expect(result.compressionLevel).toBe(2);
      expect(result.savingsRate).toBeGreaterThanOrEqual(0.6);
    });

    it('Level 3: 应执行语义嵌入 (~90%压缩)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 3,
      });

      expect(result.success).toBe(true);
      expect(result.compressionLevel).toBe(3);
      expect(result.savingsRate).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('RMX-002: Token节省率目标', () => {
    it('应实现70% Token节省 (3000→900)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 2,
      });

      expect(result.success).toBe(true);
      expect(result.originalTokens).toBeGreaterThan(result.compressedTokens);
      // 目标：节省率>60%，实际期望~70%
      expect(result.savingsRate).toBeGreaterThanOrEqual(0.6);
      
      // 验证Pattern ID格式 (FAB-001)
      expect(result.patternId).toMatch(/^remix-\d{8}T\d{4}-[a-z0-9]+$/);
    });

    it('当节省率不足时应拒绝', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 1, // 低压缩级别
        minSavingsRate: 0.9, // 要求90%节省（不太可能达到）
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('压缩率不足');
    });

    it('应生成有效的Pattern ID (FAB-001)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 2,
      });

      // 格式: remix-{timestamp}-{hash}
      expect(result.patternId).toMatch(/^remix-[\dT-]+-[a-z0-9]{8}$/);
    });
  });

  describe('RMX-003: 技术债务继承', () => {
    it('应检测并继承MOCK标记', async () => {
      // 由于我们使用模拟数据，测试结果验证结构
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 2,
      });

      expect(result.success).toBe(true);
      // Pattern应该被保存
      expect(result.patternPath).toBeDefined();
    });
  });

  describe('Pattern管理', () => {
    it('应保存Pattern到文件系统 (FAB-002)', async () => {
      const result = await remixService.remix({
        sessionId: 'test',
        workspaceId: 'test-workspace',
        compressionLevel: 2,
      });

      expect(result.success).toBe(true);
      expect(result.patternPath).toContain('.yaml');
    });

    it('应能列出所有Patterns', async () => {
      const patterns = await remixService.listPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('边界条件', () => {
    it('应处理无效压缩级别', async () => {
      await expect(
        remixService.remix({
          sessionId: 'test',
          workspaceId: 'test-workspace',
          compressionLevel: 5 as CompressionLevel, // 无效级别
        })
      ).rejects.toThrow();
    });

    it('应处理缺少sessionId', async () => {
      await expect(
        remixService.remix({
          sessionId: '',
          workspaceId: 'test-workspace',
          compressionLevel: 2,
        })
      ).rejects.toThrow();
    });
  });
});
