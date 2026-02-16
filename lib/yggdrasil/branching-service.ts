/**
 * YGGDRASIL - Branching 并行提案服务 (BRH)
 * HAJIMI-YGGDRASIL-001
 * 
 * 核心能力:
 * - 分支创建与状态隔离 (BRH-001)
 * - 六权星图UI分支可视化 (BRH-002)
 * - 分支合并治理投票 (BRH-003)
 */

import { tsa, StorageTier } from '@/lib/tsa';
import { stateMachine } from '@/lib/core/state';
import { voteService } from '@/lib/core/governance';
import { AgentRole } from '@/lib/types/state';
import {
  Branch,
  CreateBranchRequest,
  MergeRequest,
  MergeVote,
  BranchingResult,
  YggdrasilError,
  YggdrasilErrorCode,
} from './types';

// 默认投票阈值 60%
const DEFAULT_VOTE_THRESHOLD = 0.6;

// 分支存储键前缀
const BRANCH_KEY_PREFIX = 'yggdrasil:branch:';

class BranchingService {
  private metrics = {
    totalBranches: 0,
    activeBranches: 0,
    mergedBranches: 0,
  };

  /**
   * 创建新分支 (BRH-001)
   * 
   * @param request 创建分支请求
   * @returns 分支创建结果
   */
  async createBranch(request: CreateBranchRequest): Promise<BranchingResult> {
    try {
      console.log(`[Branching] 创建分支: name=${request.name}, from=${request.fromBranchId}`);

      // 1. 生成分支ID
      const branchId = this.generateBranchId(request);

      // 2. 创建分支对象
      const branch: Branch = {
        id: branchId,
        name: request.name,
        sessionId: request.sessionId,
        parentBranchId: request.fromBranchId || null,
        agentId: request.agentId,
        createdAt: Date.now(),
        status: 'active',
      };

      // 3. 复制父分支的Transient数据（实现隔离）
      if (request.fromBranchId) {
        await this.copyBranchData(request.fromBranchId, branchId);
      }

      // 4. 保存分支信息
      await this.saveBranch(branch);

      // 5. 更新指标
      this.metrics.totalBranches++;
      this.metrics.activeBranches++;

      console.log(`[Branching] 分支创建成功: ${branchId}`);

      return {
        success: true,
        branch,
      };

    } catch (error) {
      console.error('[Branching] 创建分支失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 获取分支列表
   */
  async getBranches(sessionId: string): Promise<Branch[]> {
    const branches: Branch[] = [];
    const pattern = `${BRANCH_KEY_PREFIX}${sessionId}:*`;

    // 从TSA获取所有键
    const allKeys = tsa.keys();
    
    for (const key of allKeys) {
      if (key.startsWith(`${BRANCH_KEY_PREFIX}${sessionId}:`)) {
        const branch = await tsa.get<Branch>(key);
        if (branch) {
          branches.push(branch);
        }
      }
    }

    return branches.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取单个分支
   */
  async getBranch(branchId: string): Promise<Branch | null> {
    return await tsa.get<Branch>(`${BRANCH_KEY_PREFIX}${branchId}`);
  }

  /**
   * 请求合并分支 (BRH-003)
   * 
   * @param request 合并请求
   * @returns 合并结果
   */
  async mergeBranch(request: MergeRequest): Promise<BranchingResult> {
    try {
      console.log(`[Branching] 请求合并: ${request.branchId} -> ${request.targetBranchId}`);

      // 1. 获取分支信息
      const sourceBranch = await this.getBranch(request.branchId);
      const targetBranch = await this.getBranch(request.targetBranchId);

      if (!sourceBranch) {
        return { success: false, error: 'Source branch not found' };
      }
      if (!targetBranch) {
        return { success: false, error: 'Target branch not found' };
      }

      // 2. 如果需要投票，触发治理流程
      if (request.requireVote) {
        const voteResult = await this.initiateMergeVote(request.branchId);
        
        if (voteResult.result !== 'approved') {
          return {
            success: false,
            error: `Merge vote ${voteResult.result}`,
          };
        }
      }

      // 3. 执行合并
      await this.executeMerge(sourceBranch, targetBranch);

      // 4. 更新分支状态
      sourceBranch.status = 'merged';
      sourceBranch.mergeVote = {
        branchId: request.branchId,
        approvals: new Map(),
        threshold: DEFAULT_VOTE_THRESHOLD,
        result: 'approved',
      };
      await this.saveBranch(sourceBranch);

      // 5. 更新指标
      this.metrics.activeBranches--;
      this.metrics.mergedBranches++;

      console.log(`[Branching] 合并完成: ${request.branchId} -> ${request.targetBranchId}`);

      return { success: true };

    } catch (error) {
      console.error('[Branching] 合并失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Merge failed',
      };
    }
  }

  /**
   * 放弃分支
   */
  async abandonBranch(branchId: string): Promise<boolean> {
    const branch = await this.getBranch(branchId);
    if (!branch) return false;

    branch.status = 'abandoned';
    await this.saveBranch(branch);
    
    this.metrics.activeBranches--;
    
    return true;
  }

  /**
   * 删除分支数据
   */
  async deleteBranch(branchId: string): Promise<boolean> {
    const branch = await this.getBranch(branchId);
    if (!branch) return false;

    // 删除分支数据
    const keysToDelete = tsa.keys().filter(key => 
      key.includes(`branch:${branchId}:`)
    );
    
    for (const key of keysToDelete) {
      await tsa.delete(key);
    }

    // 删除分支元数据
    await tsa.delete(`${BRANCH_KEY_PREFIX}${branchId}`);
    
    return true;
  }

  /**
   * 获取分支树形结构 (BRH-002)
   * 用于六权星图UI可视化
   */
  async getBranchTree(sessionId: string): Promise<{
    branches: Branch[];
    rootBranchId: string | null;
    edges: Array<{ from: string; to: string }>;
  }> {
    const branches = await this.getBranches(sessionId);
    
    if (branches.length === 0) {
      return { branches: [], rootBranchId: null, edges: [] };
    }

    // 找出根分支
    const rootBranch = branches.find(b => b.parentBranchId === null) || branches[0];
    
    // 构建边
    const edges: Array<{ from: string; to: string }> = [];
    for (const branch of branches) {
      if (branch.parentBranchId) {
        edges.push({ from: branch.parentBranchId, to: branch.id });
      }
    }

    return {
      branches,
      rootBranchId: rootBranch.id,
      edges,
    };
  }

  /**
   * 获取性能指标
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  // ==================== 私有方法 ====================

  /**
   * 生成分支ID
   */
  private generateBranchId(request: CreateBranchRequest): string {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6);
    return `branch-${request.agentId}-${request.name}-${timestamp}-${random}`;
  }

  /**
   * 保存分支信息
   */
  private async saveBranch(branch: Branch): Promise<void> {
    const key = `${BRANCH_KEY_PREFIX}${branch.id}`;
    await tsa.set(key, branch, { tier: 'STAGING' });
    
    // 同时保存session索引
    const sessionKey = `${BRANCH_KEY_PREFIX}${branch.sessionId}:${branch.id}`;
    await tsa.set(sessionKey, branch.id, { tier: 'STAGING' });
  }

  /**
   * 复制分支数据（实现Transient隔离）
   */
  private async copyBranchData(fromBranchId: string, toBranchId: string): Promise<void> {
    const sourceKeys = tsa.keys().filter(key => 
      key.includes(`branch:${fromBranchId}:`) || 
      key.includes(`transient:${fromBranchId}:`)
    );

    for (const sourceKey of sourceKeys) {
      const value = await tsa.get(sourceKey);
      if (value !== null) {
        const targetKey = sourceKey.replace(fromBranchId, toBranchId);
        await tsa.set(targetKey, value, { tier: 'TRANSIENT' });
      }
    }
  }

  /**
   * 发起合并投票 (BRH-003)
   */
  private async initiateMergeVote(branchId: string): Promise<MergeVote> {
    // 模拟投票过程
    // 实际项目中应使用voteService
    const vote: MergeVote = {
      branchId,
      approvals: new Map<AgentRole, boolean>(),
      threshold: DEFAULT_VOTE_THRESHOLD,
      result: 'pending',
    };

    // 模拟投票结果（直接通过用于测试）
    const allRoles: AgentRole[] = ['pm', 'architect', 'qa', 'engineer', 'audit', 'orchestrator'];
    let approvalCount = 0;

    for (const role of allRoles) {
      const approved = Math.random() > 0.3; // 70%通过率
      vote.approvals.set(role, approved);
      if (approved) approvalCount++;
    }

    const approvalRate = approvalCount / allRoles.length;
    vote.result = approvalRate >= DEFAULT_VOTE_THRESHOLD ? 'approved' : 'rejected';

    return vote;
  }

  /**
   * 执行合并操作
   */
  private async executeMerge(source: Branch, target: Branch): Promise<void> {
    // 合并Transient数据
    const sourceKeys = tsa.keys().filter(key => 
      key.includes(`branch:${source.id}:`) ||
      key.includes(`transient:${source.id}:`)
    );

    for (const sourceKey of sourceKeys) {
      const value = await tsa.get(sourceKey);
      if (value !== null) {
        const targetKey = sourceKey.replace(source.id, target.id);
        await tsa.set(targetKey, value, { tier: 'STAGING' });
      }
    }
  }
}

// 导出单例
export const branchingService = new BranchingService();
export default branchingService;
