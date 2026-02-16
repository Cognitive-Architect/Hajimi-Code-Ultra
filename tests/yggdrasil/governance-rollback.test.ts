/**
 * YGGDRASIL P1 - Governance Rollback测试 (GRB-001~003)
 */

import { GovernanceRollbackService } from '@/lib/yggdrasil/governance-rollback-service';

// Mock vote-service
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

jest.mock('@/lib/core/state', () => ({
  stateMachine: {
    getCurrentState: jest.fn().mockReturnValue('DESIGN'),
  },
}));

jest.mock('@/lib/yggdrasil/rollback-service', () => ({
  rollbackService: {
    governanceRollback: jest.fn().mockResolvedValue({
      success: true,
      type: 'governance',
      previousState: 'DESIGN',
      currentState: 'CODE',
      durationMs: 100,
      restoredKeys: 0,
    }),
  },
}));

describe('GovernanceRollbackService', () => {
  let service: GovernanceRollbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GovernanceRollbackService(mockVoteService as any);
  });

  describe('GRB-001: 提案创建触发Vote Service', () => {
    it('应创建投票提案', async () => {
      mockVoteService.createProposal.mockResolvedValue({
        id: 'prop-123',
        status: 'voting',
      });

      const result = await service.createRollbackProposal(
        { sessionId: 'test', targetState: 'CODE', proposalId: '' },
        'pm'
      );

      expect(result.success).toBe(true);
      expect(mockVoteService.createProposal).toHaveBeenCalled();
    });
  });

  describe('GRB-002: 60%阈值检查', () => {
    it('通过阈值后执行回滚', async () => {
      const { tsa } = require('@/lib/tsa');
      
      mockVoteService.getResults.mockResolvedValue({
        hasApprovalThreshold: true,
        approvalRate: 0.75,
        totalVotes: 6,
        totalWeight: 6,
        rejectionRate: 0.25,
      });
      
      (tsa.get as jest.Mock).mockResolvedValue({
        proposalId: 'prop-123',
        sessionId: 'test',
        targetState: 'CODE',
        status: 'voting',
      });

      const result = await service.checkAndExecute('prop-123');

      expect(result.success).toBe(true);
    });

    it('未通过阈值时不执行', async () => {
      const { tsa } = require('@/lib/tsa');
      
      mockVoteService.getResults.mockResolvedValue({
        hasApprovalThreshold: false,
        approvalRate: 0.4,
        totalVotes: 6,
        totalWeight: 6,
        rejectionRate: 0.6,
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
  });

  describe('GRB-003: 分支锁定', () => {
    it('创建提案时应锁定分支', async () => {
      const { tsa } = require('@/lib/tsa');
      
      mockVoteService.createProposal.mockResolvedValue({
        id: 'prop-123',
        status: 'voting',
      });

      await service.createRollbackProposal(
        { sessionId: 'test', targetState: 'CODE', proposalId: '' },
        'pm'
      );

      expect(tsa.set).toHaveBeenCalledWith(
        'yggdrasil:rollback:lock:test',
        expect.objectContaining({ locked: true }),
        expect.any(Object)
      );
    });

    it('重复创建应因锁定失败', async () => {
      const { tsa } = require('@/lib/tsa');
      
      (tsa.get as jest.Mock).mockResolvedValue({ locked: true, proposalId: 'prop-123' });

      const result = await service.createRollbackProposal(
        { sessionId: 'test', targetState: 'CODE', proposalId: '' },
        'pm'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch locked');
    });
  });
});
