/**
 * YGGDRASIL P2 - 冲突解决器边界测试 (B-04)
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

describe('ConflictResolver边界测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 边界1: 空分支ID
  it('应处理空分支ID', async () => {
    const result = await branchingConflictResolver.detectConflicts('', '');
    
    expect(result.hasConflict).toBe(false);
  });

  // 边界2: 相同分支
  it('应处理相同分支比较', async () => {
    const { tsa } = require('@/lib/tsa');
    (tsa.keys as jest.Mock).mockReturnValue(['branch:same:key1']);
    
    const result = await branchingConflictResolver.detectConflicts('same', 'same');
    
    expect(result.hasConflict).toBe(false);
  });

  // 边界3: 大量冲突(1000个)
  it('应处理1000个冲突', async () => {
    const { tsa } = require('@/lib/tsa');
    
    const keys = Array.from({ length: 1000 }, (_, i) => `branch:source:key${i}`);
    (tsa.keys as jest.Mock).mockReturnValue(keys);
    (tsa.get as jest.Mock).mockImplementation((key: string) => {
      return Promise.resolve({ value: key.includes('source') ? 'v1' : 'v2' });
    });
    
    const result = await branchingConflictResolver.detectConflicts('source', 'target');
    
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  // 边界4: applyAutoResolutions空数组
  it('应处理空冲突数组', async () => {
    const result = await branchingConflictResolver.applyAutoResolutions('target', []);
    
    expect(result.applied).toBe(0);
  });

  // 边界5: 清理不存在的分支
  it('应处理清理不存在的分支', async () => {
    const result = await branchingConflictResolver.cleanupBranchData('non-existent');
    
    expect(result.success).toBe(true);
    expect(result.deletedKeys).toBe(0);
  });

  // 边界6: 时间戳完全相同
  it('应处理相同时间戳的冲突', async () => {
    const conflicts = [{
      key: 'key1',
      sourceValue: 'v1',
      targetValue: 'v2',
      sourceTimestamp: 1000,
      targetTimestamp: 1000, // 相同
      resolution: null as any,
    }];
    
    const result = await branchingConflictResolver.applyAutoResolutions('target', conflicts);
    
    // LWW策略无法决定，应有0个应用
    expect(result.applied).toBe(0);
  });

  // 边界7: preMergeCheck活跃分支
  it('应处理已合并分支的检查', async () => {
    const sourceBranch = {
      id: 'source',
      name: 'feature',
      sessionId: 'test',
      parentBranchId: null,
      agentId: 'engineer',
      createdAt: Date.now(),
      status: 'merged' as const,
    };
    
    const targetBranch = {
      id: 'target',
      name: 'main',
      sessionId: 'test',
      parentBranchId: null,
      agentId: 'pm',
      createdAt: Date.now(),
      status: 'active' as const,
    };
    
    const result = await branchingConflictResolver.preMergeCheck(sourceBranch, targetBranch);
    
    expect(result.warnings).toContain('Source branch is merged');
  });

  // 边界8: 并发冲突检测
  it('应处理并发冲突检测', async () => {
    const { tsa } = require('@/lib/tsa');
    (tsa.keys as jest.Mock).mockReturnValue(['branch:a:key1', 'branch:b:key1']);
    
    const promises = [
      branchingConflictResolver.detectConflicts('a', 'b'),
      branchingConflictResolver.detectConflicts('b', 'a'),
      branchingConflictResolver.detectConflicts('a', 'c'),
    ];
    
    const results = await Promise.all(promises);
    
    expect(results.length).toBe(3);
  });
});
