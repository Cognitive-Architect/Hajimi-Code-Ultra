/**
 * YGGDRASIL P1 - 冲突检测与解决测试 (BRH-004~006)
 */

import { branchingConflictResolver } from '@/lib/yggdrasil/branching-conflict-resolver';
import { tsa } from '@/lib/tsa';

jest.mock('@/lib/tsa', () => ({
  tsa: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockReturnValue([]),
  },
}));

describe('BranchingConflictResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BRH-004: 冲突检测', () => {
    it('应检测到共同键的冲突', async () => {
      const { tsa } = require('@/lib/tsa');
      
      // 模拟两个分支有相同的键但不同值
      (tsa.keys as jest.Mock).mockReturnValue([
        'branch:source:key1',
        'branch:target:key1',
      ]);
      (tsa.get as jest.Mock)
        .mockResolvedValueOnce({ data: 'source-value' })
        .mockResolvedValueOnce({ data: 'target-value' });

      const result = await branchingConflictResolver.detectConflicts('source', 'target');

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts.length).toBe(1);
    });

    it('无共同键时无冲突', async () => {
      const { tsa } = require('@/lib/tsa');
      
      (tsa.keys as jest.Mock).mockReturnValue([
        'branch:source:key1',
        'branch:target:key2',
      ]);

      const result = await branchingConflictResolver.detectConflicts('source', 'target');

      expect(result.hasConflict).toBe(false);
    });
  });

  describe('BRH-005: 自动解决策略', () => {
    it('应使用Last-Write-Win策略', async () => {
      const { tsa } = require('@/lib/tsa');
      
      // 冲突数据带resolution标记
      const conflicts = [{
        key: 'key1',
        sourceValue: 'new-value',
        targetValue: 'old-value',
        sourceTimestamp: 2000,
        targetTimestamp: 1000,
        resolution: 'source' as const, // Last-Write-Win选择source
      }];

      const result = await branchingConflictResolver.applyAutoResolutions('target', conflicts as any);

      expect(result.applied).toBe(1);
      expect(tsa.set).toHaveBeenCalledWith(
        'branch:target:key1',
        'new-value',
        expect.any(Object)
      );
    });
  });

  describe('BRH-006: 分支清理', () => {
    it('应清理分支数据', async () => {
      const { tsa } = require('@/lib/tsa');
      
      (tsa.keys as jest.Mock).mockReturnValue([
        'branch:old-branch:key1',
        'branch:old-branch:key2',
        'branch:old-branch:snapshot:1',
      ]);

      const result = await branchingConflictResolver.cleanupBranchData('old-branch', false);

      expect(result.success).toBe(true);
      expect(result.deletedKeys).toBe(3);
    });

    it('保留快照时应跳过snapshot键', async () => {
      const { tsa } = require('@/lib/tsa');
      
      (tsa.keys as jest.Mock).mockReturnValue([
        'branch:old-branch:key1',
        'branch:old-branch:snapshot:1',
      ]);

      const result = await branchingConflictResolver.cleanupBranchData('old-branch', true);

      expect(result.deletedKeys).toBe(1); // 只删key1
    });
  });
});
