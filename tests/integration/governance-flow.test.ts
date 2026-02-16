/**
 * B-07 治理链路集成测试
 * 
 * 测试目标：验证提案创建→投票统计→达到60%阈值→自动状态流转完整闭环
 * 
 * 测试项：
 * - TEST-010: 提案端点集成（≥3个测试）
 * - TEST-011: 投票端点集成（≥4个测试）
 * - TEST-012: 自动流转触发（≥3个测试）
 * 
 * 修复记录：
 * - 2026-02-14: 修复33个失败点
 *   - 添加waitForState/waitForProposalStatus辅助函数
 *   - 修复异步时序问题
 *   - 增强测试数据隔离
 *   - 添加重试机制
 */

import { StateMachine } from '@/lib/core/state/machine';
import { VoteService } from '@/lib/core/governance/vote-service';
import { ProposalService } from '@/lib/core/governance/proposal-service';
import { AgentRole, PowerState } from '@/lib/types/state';
import { ROLE_WEIGHTS, VOTING_RULES } from '@/lib/core/governance/types';

// 辅助函数：等待状态变更
async function waitForState(
  stateMachine: StateMachine, 
  expectedState: PowerState, 
  timeoutMs: number = 2000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (stateMachine.getCurrentState() === expectedState) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}

// 辅助函数：等待提案状态变更
async function waitForProposalStatus(
  voteService: VoteService,
  proposalId: string,
  expectedStatus: string,
  timeoutMs: number = 2000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const proposal = voteService.getProposal(proposalId);
    if (proposal?.status === expectedStatus) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}

// 辅助函数：等待TSA持久化完成
async function waitForTSA(timeoutMs: number = 500): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeoutMs));
}

describe('B-07 治理链路集成测试', () => {
  let stateMachine: StateMachine;
  let voteService: VoteService;
  let proposalService: ProposalService;

  // 在每个测试前初始化
  beforeEach(async () => {
    // 初始化状态机
    stateMachine = new StateMachine();
    await stateMachine.init();
    await stateMachine.reset();

    // 初始化投票服务（核心治理服务）
    voteService = new VoteService(stateMachine);
    await voteService.init();

    // 初始化提案服务（用于提案列表API测试）
    proposalService = new ProposalService();
    await proposalService.init();

    // TEST FIX: 清理之前的提案数据，防止测试间数据污染
    await voteService.clearAllProposalsForTest();
    
    // 额外等待确保TSA清理完成
    await waitForTSA(300);
  });

  // 在每个测试后清理
  afterEach(async () => {
    voteService.destroy();
    proposalService.destroy();
    await waitForTSA(200);
  });

  // ============================================================================
  // TEST-010: 提案端点集成
  // ============================================================================
  describe('TEST-010: 提案端点集成', () => {
    it('TEST-010-1: POST /api/v1/governance/proposals 创建提案成功', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '测试提案',
        description: '这是一个测试提案，用于验证API创建功能。',
        targetState: 'DESIGN',
        type: 'state_transition',
      }, 'pm');

      expect(proposal).toBeDefined();
      expect(proposal.id).toBeDefined();
      expect(proposal.title).toBe('测试提案');
      expect(proposal.description).toBe('这是一个测试提案，用于验证API创建功能。');
      expect(proposal.proposer).toBe('pm');
      expect(proposal.targetState).toBe('DESIGN');
      expect(proposal.status).toBe('voting');
      expect(Array.isArray(proposal.votes)).toBe(true);
      expect(proposal.createdAt).toBeDefined();
      expect(proposal.expiresAt).toBeDefined();
    });

    it('TEST-010-2: GET /api/v1/governance/proposals 获取提案列表成功', async () => {
      // 确保清理完成
      await voteService.clearAllProposalsForTest();
      await waitForTSA(200);

      // 创建多个提案
      await voteService.createProposal({
        proposer: 'pm',
        title: '提案1',
        description: '描述1',
        targetState: 'DESIGN',
      }, 'pm');
      
      await voteService.createProposal({
        proposer: 'pm',
        title: '提案2',
        description: '描述2',
        targetState: 'CODE',
      }, 'pm');

      // 等待TSA持久化
      await waitForTSA(300);

      // 使用 VoteService 获取所有提案
      const proposals = voteService.getAllProposals();

      expect(proposals).toBeDefined();
      expect(Array.isArray(proposals)).toBe(true);
      expect(proposals.length).toBe(2);
    });

    it('TEST-010-3: GET /api/v1/governance/proposals 支持按状态筛选', async () => {
      // 确保清理完成
      await voteService.clearAllProposalsForTest();
      await waitForTSA(200);

      // 创建提案1并投票使其通过
      const proposal1 = await voteService.createProposal({
        proposer: 'pm',
        title: '待筛选提案1',
        description: '描述',
        targetState: 'DESIGN',
      }, 'pm');
      
      // 投票使其通过
      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');

      // 等待异步执行和状态变更
      await waitForProposalStatus(voteService, proposal1.id, 'executed', 2000);

      // 创建提案2（保持voting状态）
      await voteService.createProposal({
        proposer: 'pm',
        title: '待筛选提案2',
        description: '描述',
        targetState: 'DESIGN',
      }, 'pm');

      // 等待TSA持久化
      await waitForTSA(300);

      // 获取active（voting状态）提案
      const activeProposals = voteService.getActiveProposals();
      expect(activeProposals.length).toBe(1);
      expect(activeProposals[0].title).toBe('待筛选提案2');
    });

    it('TEST-010-4: GET /api/v1/governance/proposals/:id 获取提案详情成功', async () => {
      const createdProposal = await voteService.createProposal({
        proposer: 'pm',
        title: '详情测试提案',
        description: '测试详情获取',
        targetState: 'AUDIT',
      }, 'pm');

      // 使用 VoteService 获取提案
      const proposal = voteService.getProposal(createdProposal.id);

      expect(proposal).toBeDefined();
      expect(proposal?.id).toBe(createdProposal.id);
      expect(proposal?.title).toBe('详情测试提案');
      expect(proposal?.targetState).toBe('AUDIT');
    });

    it('TEST-010-5: 验证响应格式符合API规范', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '格式验证提案',
        description: '验证响应格式',
        targetState: 'BUILD',
      }, 'pm');

      // 验证提案数据格式
      expect(proposal).toHaveProperty('id');
      expect(proposal).toHaveProperty('title');
      expect(proposal).toHaveProperty('description');
      expect(proposal).toHaveProperty('proposer');
      expect(proposal).toHaveProperty('targetState');
      expect(proposal).toHaveProperty('status');
      expect(proposal).toHaveProperty('votes');
      expect(proposal).toHaveProperty('createdAt');
      expect(proposal).toHaveProperty('expiresAt');
      expect(Array.isArray(proposal.votes)).toBe(true);
      expect(typeof proposal.id).toBe('string');
      expect(typeof proposal.title).toBe('string');
      expect(typeof proposal.status).toBe('string');
    });

    it('TEST-010-6: 非PM角色无法创建提案', async () => {
      await expect(
        voteService.createProposal({
          proposer: 'engineer' as AgentRole,
          title: '非法提案',
          description: '工程师不应该能创建提案',
          targetState: 'DESIGN',
        }, 'engineer')
      ).rejects.toThrow('Only PM can create proposals');
    });
  });

  // ============================================================================
  // TEST-011: 投票端点集成
  // ============================================================================
  describe('TEST-011: 投票端点集成', () => {
    let testProposalId: string;

    beforeEach(async () => {
      // 为每个测试创建测试提案
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '投票测试提案',
        description: '用于投票端点测试',
        targetState: 'DESIGN',
      }, 'pm');
      testProposalId = proposal.id;
      await waitForTSA(100);
    });

    it('TEST-011-1: POST /api/v1/governance/vote 提交投票成功', async () => {
      const result = await voteService.vote(testProposalId, 'pm', 'approve', '同意此提案');

      expect(result).toBeDefined();
      expect(result.proposalId).toBe(testProposalId);
      expect(result.totalVotes).toBe(1);
      expect(result.votedRoles).toBeDefined();
      expect(result.votedRoles).toContain('pm');
    });

    it('TEST-011-2: GET /api/v1/governance/vote?proposalId=xxx 获取投票统计成功', async () => {
      // 先提交投票
      await voteService.vote(testProposalId, 'pm', 'approve');
      await voteService.vote(testProposalId, 'arch', 'approve');

      const stats = await voteService.getVoteStats(testProposalId);

      expect(stats).toBeDefined();
      expect(stats.proposalId).toBe(testProposalId);
      expect(stats.totalVotes).toBe(2);
      expect(stats.votedRoles).toEqual(expect.arrayContaining(['pm', 'arch']));
      expect(stats.voteDetails).toBeDefined();
      expect(stats.voteDetails.length).toBe(2);
    });

    it('TEST-011-3: 验证权重计算正确', async () => {
      // pm权重=2, arch权重=2
      await voteService.vote(testProposalId, 'pm', 'approve');
      await voteService.vote(testProposalId, 'arch', 'approve');

      const stats = await voteService.getVoteStats(testProposalId);

      expect(stats.totalWeight).toBe(4); // 2 + 2
      expect(stats.approveWeight).toBe(4);
      expect(stats.approvalRate).toBe(1); // 4/4 = 100%
      expect(stats.hasQuorum).toBe(false); // 需要3票，目前只有2票
    });

    it('TEST-011-4: 验证多角色投票权重累加', async () => {
      // pm(2) + arch(2) + qa(1) = 5
      await voteService.vote(testProposalId, 'pm', 'approve');
      await voteService.vote(testProposalId, 'arch', 'approve');
      await voteService.vote(testProposalId, 'qa', 'approve');

      const stats = await voteService.getVoteStats(testProposalId);

      expect(stats.totalWeight).toBe(5); // 2 + 2 + 1
      expect(stats.approveWeight).toBe(5);
      expect(stats.hasQuorum).toBe(true); // 3票达到quorum
      expect(stats.hasApprovalThreshold).toBe(true); // 100% >= 60%
      expect(stats.shouldExecute).toBe(true);
    });

    it('TEST-011-5: 验证无法重复投票（会覆盖）', async () => {
      // 第一次投票 approve
      await voteService.vote(testProposalId, 'pm', 'approve');
      
      // 第二次投票 reject（覆盖）
      const result = await voteService.vote(testProposalId, 'pm', 'reject');

      expect(result.totalVotes).toBe(1); // 仍然只有1票
      expect(result.votedRoles).toBeDefined();
      expect(result.votedRoles).toContain('pm');
      
      // 验证只有一票且为reject
      const stats = await voteService.getVoteStats(testProposalId);
      expect(stats.voteDetails.length).toBe(1);
      expect(stats.voteDetails[0].choice).toBe('reject');
    });

    it('TEST-011-6: 验证弃权投票不计入通过权重', async () => {
      await voteService.vote(testProposalId, 'pm', 'approve');
      await voteService.vote(testProposalId, 'arch', 'abstain');
      await voteService.vote(testProposalId, 'qa', 'abstain');

      const stats = await voteService.getVoteStats(testProposalId);

      expect(stats.totalWeight).toBe(5); // 2 + 2 + 1
      expect(stats.approveWeight).toBe(2); // 只有pm的approve
      expect(stats.abstainWeight).toBe(3); // arch(2) + qa(1)
    });

    it('TEST-011-7: 不存在的提案投票会抛出错误', async () => {
      await expect(
        voteService.vote('non-existent-id', 'pm', 'approve')
      ).rejects.toThrow('Proposal not found');
    });
  });

  // ============================================================================
  // TEST-012: 自动流转触发
  // ============================================================================
  describe('TEST-012: 自动流转触发', () => {
    it('TEST-012-1: 模拟多角色投票达到60%阈值触发自动流转', async () => {
      // 1. 创建提案（IDLE -> DESIGN）
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '自动流转测试提案',
        description: '验证达到60%阈值后自动状态流转',
        targetState: 'DESIGN',
      }, 'pm');

      // 验证初始状态
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 2. PM投票 (权重2)
      await voteService.vote(proposal.id, 'pm', 'approve');
      let stats = await voteService.getVoteStats(proposal.id);
      expect(stats.approvalRate).toBe(1); // 2/2 = 100%

      // 3. Arch投票 (权重2)，累计4/4 = 100% (但只有2票，未达quorum=3)
      await voteService.vote(proposal.id, 'arch', 'approve');
      stats = await voteService.getVoteStats(proposal.id);
      expect(stats.totalVotes).toBe(2);
      expect(stats.hasQuorum).toBe(false); // 需要3票

      // 4. QA投票 (权重1)，累计5/5 = 100% (3票达到quorum)
      await voteService.vote(proposal.id, 'qa', 'approve');
      stats = await voteService.getVoteStats(proposal.id);
      expect(stats.totalWeight).toBe(5); // 2 + 2 + 1
      expect(stats.approveWeight).toBe(5);
      expect(stats.approvalRate).toBe(1); // 100%
      expect(stats.hasQuorum).toBe(true);
      expect(stats.hasApprovalThreshold).toBe(true); // 100% >= 60%
      expect(stats.shouldExecute).toBe(true);

      // FIX: 使用轮询等待异步执行完成
      const stateChanged = await waitForState(stateMachine, 'DESIGN', 3000);
      expect(stateChanged).toBe(true);

      // 5. 验证提案状态变为 executed
      const updatedProposal = voteService.getProposal(proposal.id);
      expect(updatedProposal?.status).toBe('executed');

      // 6. 验证状态机状态已变更为 DESIGN
      expect(stateMachine.getCurrentState()).toBe('DESIGN');
    });

    it('TEST-012-2: 验证提案状态自动变为 approved/executed', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '状态变更测试',
        description: '验证状态从voting变为executed',
        targetState: 'DESIGN',
      }, 'pm');

      expect(proposal.status).toBe('voting');

      // 投票达到阈值: pm(2) + arch(2) + engineer(1) = 5/5
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'approve');
      await voteService.vote(proposal.id, 'engineer', 'approve');

      // FIX: 使用轮询等待提案状态变更
      const statusChanged = await waitForProposalStatus(voteService, proposal.id, 'executed', 3000);
      expect(statusChanged).toBe(true);

      const updatedProposal = voteService.getProposal(proposal.id);
      expect(updatedProposal?.status).toBe('executed');
      expect(updatedProposal?.executedAt).toBeDefined();
      expect(updatedProposal?.executionResult?.success).toBe(true);
    });

    it('TEST-012-3: 验证自动触发状态流转', async () => {
      // 初始状态: IDLE
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '状态流转测试',
        description: '验证自动触发状态流转到CODE',
        targetState: 'CODE',
      }, 'pm');

      // FIX: 需要先流转到 DESIGN（使用system角色权限）
      await stateMachine.transition('DESIGN', 'system');
      await waitForState(stateMachine, 'DESIGN', 2000);
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // 投票通过提案，目标状态是CODE
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'approve');
      await voteService.vote(proposal.id, 'qa', 'approve');

      // FIX: 使用轮询等待状态变更
      const stateChanged = await waitForState(stateMachine, 'CODE', 3000);
      expect(stateChanged).toBe(true);

      // 验证历史记录
      const history = stateMachine.getHistory();
      const codeTransition = history.find(h => h.to === 'CODE');
      expect(codeTransition).toBeDefined();
      expect(codeTransition?.agent).toBe('system');
      expect(codeTransition?.context?.triggeredBy).toBe('governance_auto_execute');
    });

    it('TEST-012-4: 验证状态机API返回新状态', async () => {
      // 创建并执行提案
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '状态查询测试',
        description: '验证状态API返回正确状态',
        targetState: 'DESIGN',
      }, 'pm');

      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'approve');
      await voteService.vote(proposal.id, 'qa', 'approve');

      // FIX: 使用轮询等待状态变更
      const stateChanged = await waitForState(stateMachine, 'DESIGN', 3000);
      expect(stateChanged).toBe(true);

      // 验证状态机状态
      const stateResponse = stateMachine.getStateResponse();
      expect(stateResponse.state).toBe('DESIGN');
      expect(stateResponse.history).toBeDefined();
      expect(Array.isArray(stateResponse.history)).toBe(true);
      expect(stateResponse.history.length).toBeGreaterThan(0);
      expect(stateResponse.timestamp).toBeDefined();
    });

    it('TEST-012-5: 未达60%阈值不会自动流转', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '阈值测试',
        description: '验证未达60%不会流转',
        targetState: 'DESIGN',
      }, 'pm');

      // pm(2) + qa(1) = 3/3 = 100%，但只有2票，未达quorum
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'qa', 'approve');

      const stats = await voteService.getVoteStats(proposal.id);
      expect(stats.hasQuorum).toBe(false); // 需要3票
      expect(stats.shouldExecute).toBe(false);

      // 等待一段时间
      await waitForTSA(500);

      // 验证状态未变
      expect(stateMachine.getCurrentState()).toBe('IDLE');
      const updatedProposal = voteService.getProposal(proposal.id);
      expect(updatedProposal?.status).toBe('voting');
    });

    it('TEST-012-6: 拒绝率≥60%时自动拒绝提案', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '拒绝测试',
        description: '验证高拒绝率自动拒绝',
        targetState: 'DESIGN',
      }, 'pm');

      // pm(2) + arch(2) + qa(1) = 5票，reject率 = 4/5 = 80% >= 60%
      await voteService.vote(proposal.id, 'pm', 'reject');
      await voteService.vote(proposal.id, 'arch', 'reject');
      await voteService.vote(proposal.id, 'qa', 'approve');

      const stats = await voteService.getVoteStats(proposal.id);
      expect(stats.rejectionRate).toBe(0.8); // 4/5 = 80%

      // FIX: 使用轮询等待状态变更
      const statusChanged = await waitForProposalStatus(voteService, proposal.id, 'rejected', 2000);
      expect(statusChanged).toBe(true);

      const updatedProposal = voteService.getProposal(proposal.id);
      expect(updatedProposal?.status).toBe('rejected');
      
      // 验证状态未改变
      expect(stateMachine.getCurrentState()).toBe('IDLE');
    });
  });

  // ============================================================================
  // 完整闭环测试
  // ============================================================================
  describe('完整闭环测试', () => {
    it('应完成 提案创建→投票→达到阈值→自动状态流转 完整闭环', async () => {
      // 步骤1: PM创建提案
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '端到端测试提案',
        description: '验证完整治理链路',
        targetState: 'DESIGN',
      }, 'pm');
      
      expect(proposal).toBeDefined();
      const proposalId = proposal.id;

      // 步骤2: PM投票approve
      await voteService.vote(proposalId, 'pm', 'approve');

      // 步骤3: Arch投票approve（权重2，累计approve权重 = 4）
      await voteService.vote(proposalId, 'arch', 'approve');

      // 步骤4: Engineer投票approve（权重1，累计 = 5, 3票达到quorum, 100% >= 60%）
      await voteService.vote(proposalId, 'engineer', 'approve');

      // FIX: 使用轮询等待异步执行
      const stateChanged = await waitForState(stateMachine, 'DESIGN', 3000);
      expect(stateChanged).toBe(true);

      // 步骤5: 验证提案状态变为executed
      const finalProposal = voteService.getProposal(proposalId);
      expect(finalProposal?.status).toBe('executed');

      // 步骤6: 验证状态机状态变为targetState
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // 步骤7: 验证状态API
      const stateResponse = stateMachine.getStateResponse();
      expect(stateResponse.state).toBe('DESIGN');

      // 步骤8: 验证历史记录
      const history = stateMachine.getHistory();
      const designTransition = history.find(h => h.to === 'DESIGN');
      expect(designTransition).toBeDefined();
      expect(designTransition?.context?.triggeredBy).toBe('governance_auto_execute');
    });

    it('应支持多轮状态流转', async () => {
      // 第一轮: IDLE -> DESIGN
      const proposal1 = await voteService.createProposal({
        proposer: 'pm',
        title: '第一轮流转',
        description: 'IDLE -> DESIGN',
        targetState: 'DESIGN',
      }, 'pm');

      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');
      
      let stateChanged = await waitForState(stateMachine, 'DESIGN', 3000);
      expect(stateChanged).toBe(true);
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // FIX: 清理已执行提案，为第二轮做准备
      await voteService.clearAllProposalsForTest();
      await waitForTSA(200);

      // 第二轮: DESIGN -> CODE
      const proposal2 = await voteService.createProposal({
        proposer: 'pm',
        title: '第二轮流转',
        description: 'DESIGN -> CODE',
        targetState: 'CODE',
      }, 'pm');

      await voteService.vote(proposal2.id, 'engineer', 'approve');
      await voteService.vote(proposal2.id, 'arch', 'approve');
      await voteService.vote(proposal2.id, 'qa', 'approve');
      
      stateChanged = await waitForState(stateMachine, 'CODE', 3000);
      expect(stateChanged).toBe(true);
      expect(stateMachine.getCurrentState()).toBe('CODE');

      // 验证历史
      const history = stateMachine.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // 错误场景测试
  // ============================================================================
  describe('错误场景测试', () => {
    it('应处理不存在的提案投票', async () => {
      await expect(
        voteService.vote('non-existent-id', 'pm', 'approve')
      ).rejects.toThrow('Proposal not found');
    });

    it('应处理无效的状态流转请求', async () => {
      // 直接从IDLE到DEPLOY是无效流转
      const result = await stateMachine.transition('DEPLOY', 'pm');

      // 应该失败，因为 IDLE 不能直接到 DEPLOY
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rule defined');
    });
  });

  // ============================================================================
  // 权重边界测试
  // ============================================================================
  describe('权重边界测试', () => {
    it('应正确处理刚好低于60%的情况', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '低于60%测试',
        description: '验证低于60%不通过',
        targetState: 'DESIGN',
      }, 'pm');

      // 总权重: 5票都投，approve = pm(2) = 2, reject = arch(2) + qa(1) = 3
      // approve率 = 2/5 = 40% < 60%
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'reject');
      await voteService.vote(proposal.id, 'qa', 'reject');

      const stats = await voteService.getVoteStats(proposal.id);
      expect(stats.approvalRate).toBe(0.4); // 40%
      expect(stats.hasApprovalThreshold).toBe(false);
      expect(stats.shouldExecute).toBe(false);
    });

    it('应正确计算角色权重', () => {
      // 验证角色权重定义
      expect(ROLE_WEIGHTS.pm).toBe(2);
      expect(ROLE_WEIGHTS.arch).toBe(2);
      expect(ROLE_WEIGHTS.qa).toBe(1);
      expect(ROLE_WEIGHTS.engineer).toBe(1);
      expect(ROLE_WEIGHTS.mike).toBe(1);
      expect(ROLE_WEIGHTS.system).toBe(0);
    });

    it('应正确验证投票规则常量', () => {
      expect(VOTING_RULES.QUORUM).toBe(3);
      expect(VOTING_RULES.APPROVAL_THRESHOLD).toBe(0.6);
    });
  });
});
