/**
 * YGGDRASIL P1 - Governance Rollback服务
 * HAJIMI-YGGDRASIL-P1-02
 * 
 * 职责:
 * - Rollback提案创建触发Vote Service (GRB-001)
 * - 60%阈值通过后执行状态回滚 (GRB-002)
 * - 投票期间锁定目标分支防并发 (GRB-003)
 */

import { voteService, VoteService } from '@/lib/core/governance/vote-service';
import { rollbackService } from './rollback-service';
import { stateMachine } from '@/lib/core/state';
import { tsa } from '@/lib/tsa';
import { PowerState, AgentRole } from '@/lib/types/state';
import { 
  GovernanceRollbackRequest, 
  RollbackResult,
  RollbackType 
} from './types';

// 锁键前缀
const ROLLBACK_LOCK_PREFIX = 'yggdrasil:rollback:lock:';
const ROLLBACK_PROPOSAL_PREFIX = 'yggdrasil:rollback:proposal:';

export interface GovernanceRollbackProposal {
  proposalId: string;
  sessionId: string;
  targetState: PowerState;
  targetSnapshotId?: string;
  requester: AgentRole;
  status: 'pending' | 'voting' | 'approved' | 'rejected' | 'executed';
  createdAt: number;
  executedAt?: number;
  voteResult?: {
    totalVotes: number;
    approveCount: number;
    rejectCount: number;
    approvalRate: number;
  };
}

class GovernanceRollbackService {
  private voteService: VoteService;
  private initialized = false;

  constructor(voteServiceInstance: VoteService = voteService) {
    this.voteService = voteServiceInstance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.voteService.init();
    this.initialized = true;
    console.log('[GovernanceRollback] 初始化完成');
  }

  /**
   * 创建治理回滚提案 (GRB-001)
   */
  async createRollbackProposal(
    request: GovernanceRollbackRequest,
    requester: AgentRole
  ): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    try {
      console.log(`[GovernanceRollback] 创建回滚提案: targetState=${request.targetState}`);

      // GRB-003: 检查分支是否被锁定
      const lockKey = `${ROLLBACK_LOCK_PREFIX}${request.sessionId}`;
      const existingLock = await tsa.get<{ locked: boolean; proposalId: string }>(lockKey);
      
      if (existingLock?.locked) {
        return {
          success: false,
          error: `Branch locked by proposal: ${existingLock.proposalId}`,
        };
      }

      // 创建Governance提案
      const proposal = await this.voteService.createProposal(
        {
          proposer: requester,
          title: `Rollback to state: ${request.targetState}`,
          description: `Propose rolling back session ${request.sessionId} to state ${request.targetState}`,
          targetState: request.targetState,
          type: 'state_transition',
          context: {
            rollbackType: 'governance',
            sessionId: request.sessionId,
            proposalId: request.proposalId,
          },
        },
        requester
      );

      // 保存Rollback提案映射
      const rollbackProposal: GovernanceRollbackProposal = {
        proposalId: proposal.id,
        sessionId: request.sessionId,
        targetState: request.targetState,
        targetSnapshotId: undefined,
        requester,
        status: 'voting',
        createdAt: Date.now(),
      };

      await tsa.set(
        `${ROLLBACK_PROPOSAL_PREFIX}${proposal.id}`,
        rollbackProposal,
        { tier: 'STAGING' }
      );

      // GRB-003: 锁定分支
      await tsa.set(
        lockKey,
        { locked: true, proposalId: proposal.id, since: Date.now() },
        { tier: 'TRANSIENT', ttl: 600000 } // 10分钟超时
      );

      console.log(`[GovernanceRollback] 提案创建成功: ${proposal.id}`);

      return {
        success: true,
        proposalId: proposal.id,
      };

    } catch (error) {
      console.error('[GovernanceRollback] 创建提案失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查提案投票结果并执行 (GRB-002)
   */
  async checkAndExecute(proposalId: string): Promise<RollbackResult> {
    const startTime = performance.now();
    const previousState = stateMachine.getCurrentState();

    try {
      console.log(`[GovernanceRollback] 检查提案: ${proposalId}`);

      // 获取投票结果
      const voteResult = await this.voteService.getVoteStats(proposalId);
      const rollbackProposal = await tsa.get<GovernanceRollbackProposal>(
        `${ROLLBACK_PROPOSAL_PREFIX}${proposalId}`
      );

      if (!rollbackProposal) {
        throw new Error('Rollback proposal not found');
      }

      // GRB-002: 检查60%阈值
      if (!voteResult.hasApprovalThreshold) {
        return {
          success: false,
          type: 'governance' as RollbackType,
          previousState,
          currentState: previousState,
          durationMs: Math.round(performance.now() - startTime),
          restoredKeys: 0,
          error: `Vote not passed: approval rate ${(voteResult.approvalRate * 100).toFixed(1)}% < 60%`,
        };
      }

      // 执行治理回滚
      const result = await rollbackService.governanceRollback({
        sessionId: rollbackProposal.sessionId,
        proposalId,
        targetState: rollbackProposal.targetState,
      });

      // 更新提案状态
      rollbackProposal.status = 'executed';
      rollbackProposal.executedAt = Date.now();
      rollbackProposal.voteResult = {
        totalVotes: voteResult.totalVotes,
        approveCount: Math.floor(voteResult.totalWeight * voteResult.approvalRate),
        rejectCount: Math.floor((voteResult.totalWeight - voteResult.approveWeight) * voteResult.rejectionRate),
        approvalRate: voteResult.approvalRate,
      };

      await tsa.set(
        `${ROLLBACK_PROPOSAL_PREFIX}${proposalId}`,
        rollbackProposal,
        { tier: 'ARCHIVE' }
      );

      // 解锁分支
      await this.unlockBranch(rollbackProposal.sessionId);

      console.log(`[GovernanceRollback] 提案执行完成: ${proposalId}`);

      return result;

    } catch (error) {
      console.error('[GovernanceRollback] 执行失败:', error);
      return {
        success: false,
        type: 'governance' as RollbackType,
        previousState,
        currentState: previousState,
        durationMs: Math.round(performance.now() - startTime),
        restoredKeys: 0,
        error: error instanceof Error ? error.message : 'Execution failed',
      };
    }
  }

  /**
   * 获取提案状态
   */
  async getProposalStatus(proposalId: string): Promise<{
    exists: boolean;
    proposal?: GovernanceRollbackProposal;
    voteResult?: Awaited<ReturnType<VoteService['getVoteStats']>>;
  }> {
    const proposal = await tsa.get<GovernanceRollbackProposal>(
      `${ROLLBACK_PROPOSAL_PREFIX}${proposalId}`
    );

    if (!proposal) {
      return { exists: false };
    }

    const voteResult = await this.voteService.getVoteStats(proposalId);

    return {
      exists: true,
      proposal,
      voteResult,
    };
  }

  /**
   * 列出活跃的Rollback提案
   */
  async listActiveProposals(): Promise<GovernanceRollbackProposal[]> {
    const keys = Array.from(tsa.keys()).filter((k: string) => k.startsWith(ROLLBACK_PROPOSAL_PREFIX));
    const proposals: GovernanceRollbackProposal[] = [];

    for (const key of keys) {
      const proposal = await tsa.get<GovernanceRollbackProposal>(key);
      if (proposal && ['pending', 'voting'].includes(proposal.status)) {
        proposals.push(proposal);
      }
    }

    return proposals.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 手动解锁分支（用于紧急情况）
   */
  async forceUnlockBranch(sessionId: string): Promise<boolean> {
    console.warn(`[GovernanceRollback] 强制解锁分支: ${sessionId}`);
    return this.unlockBranch(sessionId);
  }

  /**
   * 解锁分支
   */
  private async unlockBranch(sessionId: string): Promise<boolean> {
    try {
      await tsa.remove(`${ROLLBACK_LOCK_PREFIX}${sessionId}`);
      return true;
    } catch {
      return false;
    }
  }
}

// 导出单例
export const governanceRollbackService = new GovernanceRollbackService();
export { GovernanceRollbackService };
export default governanceRollbackService;
