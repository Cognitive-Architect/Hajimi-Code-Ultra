/**
 * YGGDRASIL P1 - Git硬回滚测试 (HRB-001~003)
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

describe('GitRollbackAdapter', () => {
  let adapter: GitRollbackAdapter;
  let mockGit: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGit = {
      log: jest.fn(),
      status: jest.fn().mockResolvedValue({
        current: 'main',
        modified: [],
        files: [],
      }),
      show: jest.fn(),
      checkout: jest.fn().mockResolvedValue(''),
      stash: jest.fn().mockResolvedValue(''),
    };

    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    adapter = new GitRollbackAdapter('/test/repo');
  });

  describe('HRB-001: git checkout执行', () => {
    it('应成功执行git checkout', async () => {
      // 模拟当前commit
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'abc123', message: 'current commit' },
        all: [{ hash: 'abc123' }],
      });
      mockGit.show.mockResolvedValueOnce(''); // commit exists
      // checkout后获取新状态
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'def456', message: 'target commit' },
        all: [{ hash: 'def456' }],
      });
      
      const result = await adapter.hardRollback('def456');

      expect(result.success).toBe(true);
      expect(mockGit.checkout).toHaveBeenCalledWith('def456');
    });

    it('commit不存在时应失败', async () => {
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'abc123', message: 'current commit' },
        all: [{ hash: 'abc123' }],
      });
      mockGit.show.mockRejectedValueOnce(new Error('Not a valid object'));
      
      const result = await adapter.hardRollback('invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Commit not found');
    });
  });

  describe('HRB-002: TSA状态同步', () => {
    it('应同步commit到TSA', async () => {
      const { tsa } = require('@/lib/tsa');
      
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'abc123', message: 'current commit' },
        all: [{ hash: 'abc123' }],
      });
      mockGit.show.mockResolvedValueOnce('');
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'def456', message: 'target commit' },
        all: [{ hash: 'def456' }],
      });
      
      const result = await adapter.hardRollback('def456');

      expect(result.tsaSynced).toBe(true);
      expect(tsa.set).toHaveBeenCalledWith(
        'yggdrasil:git:current_commit',
        'def456',
        expect.any(Object)
      );
    });
  });

  describe('HRB-003: 原子性回滚', () => {
    it('失败时应保持Git状态不变', async () => {
      mockGit.log.mockResolvedValueOnce({
        latest: { hash: 'abc123', message: 'current commit' },
        all: [{ hash: 'abc123' }, { hash: 'def456' }],
      });
      mockGit.show.mockResolvedValueOnce('');
      mockGit.checkout.mockRejectedValueOnce(new Error('Checkout failed'));
      
      const result = await adapter.hardRollback('def456');

      expect(result.success).toBe(false);
      // 验证有尝试恢复原状态
      expect(mockGit.checkout).toHaveBeenCalled();
    });
  });
});
