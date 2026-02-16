/**
 * YGGDRASIL P2 - Git硬回滚边界测试 (B-04)
 */

import { GitRollbackAdapter } from '@/lib/yggdrasil/git-rollback-adapter';
import simpleGit from 'simple-git';

jest.mock('simple-git');
jest.mock('@/lib/tsa', () => ({
  tsa: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockReturnValue([]),
  },
}));

describe('GitRollback边界测试', () => {
  let adapter: GitRollbackAdapter;
  let mockGit: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGit = {
      log: jest.fn(),
      status: jest.fn().mockResolvedValue({ current: 'main', files: [] }),
      show: jest.fn(),
      checkout: jest.fn(),
      stash: jest.fn(),
    };

    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    adapter = new GitRollbackAdapter('/test/repo');
  });

  // 边界1: 空commitId
  it('应拒绝空commitId', async () => {
    mockGit.log.mockResolvedValueOnce({
      latest: { hash: 'abc123' },
      all: [{ hash: 'abc123' }],
    });
    mockGit.show.mockRejectedValueOnce(new Error('Invalid'));
    
    const result = await adapter.hardRollback('');
    
    expect(result.success).toBe(false);
  });

  // 边界2: 超长commitId
  it('应处理超长commitId', async () => {
    const longCommitId = 'abc'.repeat(100);
    
    mockGit.log.mockResolvedValueOnce({
      latest: { hash: 'current' },
      all: [{ hash: 'current' }],
    });
    mockGit.show.mockRejectedValueOnce(new Error('Not found'));
    
    const result = await adapter.hardRollback(longCommitId);
    
    expect(result.success).toBe(false);
  });

  // 边界3: 有未提交更改 + stash失败
  it('应在stash失败时继续执行', async () => {
    mockGit.log.mockResolvedValueOnce({
      latest: { hash: 'abc123' },
      all: [{ hash: 'abc123' }],
    });
    mockGit.status.mockResolvedValueOnce({
      current: 'main',
      files: [{ path: 'modified.ts' }], // 有未提交更改
    });
    mockGit.stash.mockRejectedValueOnce(new Error('Stash failed'));
    
    const result = await adapter.hardRollback('def456');
    
    // stash失败不应阻止checkout
    expect(mockGit.checkout).toHaveBeenCalled();
  });

  // 边界4: checkout成功但TSA同步失败
  it('应在TSA同步失败时返回警告', async () => {
    const { tsa } = require('@/lib/tsa');
    
    mockGit.log
      .mockResolvedValueOnce({ latest: { hash: 'abc123' }, all: [{ hash: 'abc123' }] })
      .mockResolvedValueOnce({ latest: { hash: 'def456' }, all: [{ hash: 'def456' }] });
    mockGit.show.mockResolvedValueOnce('');
    (tsa.set as jest.Mock).mockRejectedValueOnce(new Error('TSA error'));
    
    const result = await adapter.hardRollback('def456');
    
    expect(result.success).toBe(true);
    expect(result.tsaSynced).toBe(false);
  });

  // 边界5: 并发回滚请求
  it('应处理并发回滚请求', async () => {
    mockGit.log.mockResolvedValue({
      latest: { hash: 'abc123' },
      all: [{ hash: 'abc123' }],
    });
    mockGit.show.mockResolvedValue('');
    
    const promises = [
      adapter.hardRollback('def456'),
      adapter.hardRollback('def789'),
      adapter.hardRollback('def012'),
    ];
    
    const results = await Promise.all(promises);
    
    // 都应有结果（可能成功或失败）
    expect(results.length).toBe(3);
  });

  // 边界6: 获取commit历史边界
  it('应处理maxCount=0', async () => {
    mockGit.log.mockResolvedValueOnce({ all: [] });
    
    const history = await adapter.getCommitHistory(0);
    
    expect(history).toEqual([]);
  });
});
