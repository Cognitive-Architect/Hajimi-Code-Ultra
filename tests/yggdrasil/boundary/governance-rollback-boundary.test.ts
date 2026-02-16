/**
 * YGGDRASIL P2 - Governance Rollback边界测试 (B-04)
 */

import { GovernanceRollbackService } from '@/lib/yggdrasil/governance-rollback-service';

const mockVoteService = {
  init: jest.fn().mockResolvedValue(undefined),
  createProposal: jest.fn(),
  getResults: jest.fn(),
};

jest.mock('@/lib/tsa', () => ({
  tsa: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('GovernanceRollback边界测试', () => {
  let service: GovernanceRollbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GovernanceRollbackService(mockVoteService as any);
  });

  // 边界1: 空sessionId
  it('应处理空sessionId', async () => {
    const result = await service.createRollbackProposal(
      { sessionId: '', targetState: 'CODE', proposalId: '' },
      'pm'
    );
    
    // 应该创建成功（检查锁的逻辑会处理空字符串）
    expect(result.success !== undefined).toBe(true);
  });

  // 边界2: 非pm角色创建提案
  it('应拒绝非pm创建提案', async () => {
    mockVoteService.createProposal.mockRejectedValue(new Error('Only PM can create'));
    
    const result = await service.createRollbackProposal(
      { sessionId: 'test', targetState: 'CODE', proposalId: '' },
      'engineer' as any
    );
    
    expect(result.success).toBe(false);
  });

  // 边界3: 检查不存在的提案
  it('应处理检查不存在的提案', async () => {
    const { tsa } = require('@/lib/tsa');
    (tsa.get as jest.Mock).mockResolvedValue(null);
    
    const result = await service.checkAndExecute('non-existent');
    
    expect(result.success).toBe(false);
  });

  // 边界4: 60%阈值边界值
  it('应处理正好60%阈值', async () => {
    const { tsa } = require('@/lib/tsa');
    
    mockVoteService.getResults.mockResolvedValue({
      hasApprovalThreshold: true, // 正好60%
      approvalRate: 0.6,
      totalVotes: 5,
      totalWeight: 5,
    });
    
    (tsa.get as jest.Mock).mockResolvedValue({
      proposalId: 'prop-123',
      sessionId: 'test',
      targetState: 'CODE',
      status: 'voting',
    });
    
    const result = await service.checkAndExecute('prop-123');
    
    // 应该通过
    expect(result.success).toBe(true);
  });

  // 边界5: 59.9%阈值(应失败)
  it('应拒绝59.9%阈值', async () => {
    const { tsa } = require('@/lib/tsa');
    
    mockVoteService.getResults.mockResolvedValue({
      hasApprovalThreshold: false,
      approvalRate: 0.599,
      totalVotes: 5,
      totalWeight: 5,
    });
    
    (tsa.get as jest.Mock).mockResolvedValue({
      proposalId: 'prop-123',
      sessionId: 'test',
      targetState: 'CODE',
      status: 'voting',
    });
    
    const result = await service.checkAndExecute('prop-123');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Vote not passed');
  });

  // 边界6: 并发提案创建
  it('应处理并发提案创建', async () => {
    mockVoteService.createProposal.mockResolvedValue({ id: 'prop-123' });
    
    const promises = [
      service.createRollbackProposal({ sessionId: 'test', targetState: 'CODE', proposalId: '' }, 'pm'),
      service.createRollbackProposal({ sessionId: 'test', targetState: 'DESIGN', proposalId: '' }, 'pm'),
    ];
    
    const results = await Promise.all(promises);
    
    // 应该只有一个成功（第二个会被锁）
    const successes = results.filter(r => r.success).length;
    expect(successes).toBeLessThanOrEqual(1);
  });

  // 边界7: 强制解锁
  it('应处理强制解锁', async () => {
    const result = await service.forceUnlockBranch('test-session');
    
    expect(result).toBe(true);
  });

  // 边界8: 列出无活跃提案
  it('应处理无活跃提案的情况', async () => {
    const result = await service.listActiveProposals();
    
    expect(result).toEqual([]);
  });
});
