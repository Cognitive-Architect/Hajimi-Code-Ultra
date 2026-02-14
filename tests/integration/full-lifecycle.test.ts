/**
 * B-08/09 端到端完整工作流测试
 * 
 * 测试项:
 * - E2E-001: 快乐路径全流程（完整七权流转）
 * - E2E-002: 非法流转拦截（错误注入）
 * - E2E-003: 并发提案冲突（并发场景）
 */

import { StateMachine } from '@/lib/core/state/machine';
import { ProposalService, VoteService } from '@/lib/core/governance';
import { AgentRole, PowerState } from '@/lib/types/state';
import { tsa } from '@/lib/tsa';

describe('E2E Full Lifecycle Workflow Tests', () => {
  let stateMachine: StateMachine;
  let proposalService: ProposalService;
  let voteService: VoteService;

  beforeEach(async () => {
    // 清理 TSA 确保测试隔离
    await tsa.clear();

    // 初始化所有服务
    stateMachine = new StateMachine();
    await stateMachine.init();

    proposalService = new ProposalService();
    await proposalService.init();

    voteService = new VoteService(stateMachine);
    await voteService.init();
  });

  afterEach(async () => {
    await proposalService?.destroy?.();
    await voteService?.dispose?.();
    await tsa.clear();
  });

  // ============================================================================
  // E2E-001: 快乐路径全流程（≥2个测试）
  // ============================================================================
  describe('E2E-001: Happy Path Full Workflow', () => {
    it('E2E-001-01: 应完成完整的七权流转 IDLE→DESIGN→CODE→AUDIT→BUILD→DEPLOY→DONE', async () => {
      // 1. 验证系统初始状态为 IDLE
      const initialState = stateMachine.getCurrentState();
      expect(initialState).toBe('IDLE');

      // 2. IDLE → DESIGN (PM提案, 投票通过)
      const proposal1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入设计阶段',
        description: '从IDLE流转到DESIGN状态',
        targetState: 'DESIGN',
      }, 'pm');
      expect(proposal1.status).toBe('voting');

      // 投票通过（需要3票，60%通过率）
      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');

      // 等待异步执行
      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证状态已流转到 DESIGN
      expect(stateMachine.getCurrentState()).toBe('DESIGN');
      const proposal1Updated = voteService.getProposal(proposal1.id);
      expect(['approved', 'executed']).toContain(proposal1Updated?.status);

      // 3. DESIGN → CODE (工程师提案, 投票通过)
      const proposal2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入编码阶段',
        description: '从DESIGN流转到CODE状态',
        targetState: 'CODE',
      }, 'pm');

      await voteService.vote(proposal2.id, 'pm', 'approve');
      await voteService.vote(proposal2.id, 'engineer', 'approve');
      await voteService.vote(proposal2.id, 'arch', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('CODE');

      // 4. CODE → AUDIT (工程师提案, 投票通过)
      const proposal3 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入审计阶段',
        description: '从CODE流转到AUDIT状态',
        targetState: 'AUDIT',
      }, 'pm');

      await voteService.vote(proposal3.id, 'pm', 'approve');
      await voteService.vote(proposal3.id, 'engineer', 'approve');
      await voteService.vote(proposal3.id, 'qa', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('AUDIT');

      // 5. AUDIT → BUILD (QA提案, 投票通过)
      const proposal4 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入构建阶段',
        description: '从AUDIT流转到BUILD状态',
        targetState: 'BUILD',
      }, 'pm');

      await voteService.vote(proposal4.id, 'pm', 'approve');
      await voteService.vote(proposal4.id, 'qa', 'approve');
      await voteService.vote(proposal4.id, 'arch', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('BUILD');

      // 6. BUILD → DEPLOY (system提案, 投票通过)
      const proposal5 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入部署阶段',
        description: '从BUILD流转到DEPLOY状态',
        targetState: 'DEPLOY',
      }, 'pm');

      await voteService.vote(proposal5.id, 'pm', 'approve');
      await voteService.vote(proposal5.id, 'mike', 'approve');
      await voteService.vote(proposal5.id, 'system', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('DEPLOY');

      // 7. DEPLOY → DONE (mike提案, 投票通过)
      const proposal6 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '完成任务',
        description: '从DEPLOY流转到DONE状态',
        targetState: 'DONE',
      }, 'pm');

      await voteService.vote(proposal6.id, 'pm', 'approve');
      await voteService.vote(proposal6.id, 'mike', 'approve');
      await voteService.vote(proposal6.id, 'qa', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('DONE');

      // 8. 验证完整链路历史
      const history = stateMachine.getHistory();
      expect(history.length).toBe(6);
      expect(history[0].from).toBe('IDLE');
      expect(history[0].to).toBe('DESIGN');
      expect(history[1].from).toBe('DESIGN');
      expect(history[1].to).toBe('CODE');
      expect(history[2].from).toBe('CODE');
      expect(history[2].to).toBe('AUDIT');
      expect(history[3].from).toBe('AUDIT');
      expect(history[3].to).toBe('BUILD');
      expect(history[4].from).toBe('BUILD');
      expect(history[4].to).toBe('DEPLOY');
      expect(history[5].from).toBe('DEPLOY');
      expect(history[5].to).toBe('DONE');
    });

    it('E2E-001-02: 应允许中间状态跳转回退（DESIGN→IDLE, CODE→DESIGN）', async () => {
      // 先流转到 DESIGN
      const proposal1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入设计阶段',
        description: '从IDLE流转到DESIGN状态',
        targetState: 'DESIGN',
      }, 'pm');

      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // 通过状态机直接流转回 IDLE（PM角色）
      const backToIdle = await stateMachine.transition('IDLE', 'pm', { reason: '取消设计' });
      expect(backToIdle.success).toBe(true);
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 重新流转到 DESIGN
      const proposal2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '重新进入设计阶段',
        description: '再次从IDLE流转到DESIGN状态',
        targetState: 'DESIGN',
      }, 'pm');

      await voteService.vote(proposal2.id, 'pm', 'approve');
      await voteService.vote(proposal2.id, 'arch', 'approve');
      await voteService.vote(proposal2.id, 'qa', 'approve');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // 流转到 CODE
      const proposal3 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入编码阶段',
        description: '从DESIGN流转到CODE状态',
        targetState: 'CODE',
      }, 'pm');

      await voteService.vote(proposal3.id, 'pm', 'approve');
      await voteService.vote(proposal3.id, 'engineer', 'approve');
      await voteService.vote(proposal3.id, 'arch', 'approve');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(stateMachine.getCurrentState()).toBe('CODE');

      // 通过状态机直接流转回 DESIGN（arch角色）
      const backToDesign = await stateMachine.transition('DESIGN', 'arch', { reason: '架构需要重新设计' });
      expect(backToDesign.success).toBe(true);
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // 验证历史记录包含回退
      const history = stateMachine.getHistory();
      expect(history.length).toBe(4); // DESIGN→IDLE→DESIGN→CODE→DESIGN
      expect(history[0].to).toBe('DESIGN');
      expect(history[1].to).toBe('IDLE');
      expect(history[2].to).toBe('DESIGN');
      expect(history[3].to).toBe('CODE');
    });
  });

  // ============================================================================
  // E2E-002: 非法流转拦截（≥3个测试）
  // ============================================================================
  describe('E2E-002: Invalid Transition Blocking', () => {
    it('E2E-002-01: 应拒绝从IDLE直接到DEPLOY的非法流转', async () => {
      // 验证初始状态
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 尝试直接流转到 DEPLOY
      const result = await stateMachine.transition('DEPLOY', 'pm', { reason: '尝试非法跳转' });

      // 验证被拒绝
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rule defined');
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 验证历史记录为空（没有发生流转）
      const history = stateMachine.getHistory();
      expect(history.length).toBe(0);
    });

    it('E2E-002-02: 应拒绝从CODE直接到DONE的非法流转', async () => {
      // 先正常流转到 CODE
      await stateMachine.transition('DESIGN', 'pm');
      await stateMachine.transition('CODE', 'engineer');
      expect(stateMachine.getCurrentState()).toBe('CODE');

      // 尝试直接流转到 DONE
      const result = await stateMachine.transition('DONE', 'mike', { reason: '尝试跳过中间状态' });

      // 验证被拒绝
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rule defined');
      expect(stateMachine.getCurrentState()).toBe('CODE');
    });

    it('E2E-002-03: 应拒绝非授权角色的流转尝试', async () => {
      // 测试1: engineer尝试从IDLE到DESIGN（应该被拒绝，需要pm或arch）
      const result1 = await stateMachine.transition('DESIGN', 'engineer');
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('not authorized');
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 测试2: qa尝试从CODE到AUDIT（应该被拒绝，需要engineer）
      await stateMachine.transition('DESIGN', 'pm');
      await stateMachine.transition('CODE', 'engineer');

      const result2 = await stateMachine.transition('AUDIT', 'qa');
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('not authorized');
      expect(result2.error).toContain('Required: engineer');
      expect(stateMachine.getCurrentState()).toBe('CODE');

      // 测试3: engineer尝试从AUDIT到BUILD（应该被拒绝，需要qa）
      await stateMachine.transition('AUDIT', 'engineer');

      const result3 = await stateMachine.transition('BUILD', 'engineer');
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('not authorized');
      expect(result3.error).toContain('Required: qa');
      expect(stateMachine.getCurrentState()).toBe('AUDIT');
    });

    it('E2E-002-04: 应拒绝从DONE状态继续流转', async () => {
      // 先完成完整流转到 DONE
      const steps: Array<{ to: PowerState; agent: AgentRole }> = [
        { to: 'DESIGN', agent: 'pm' },
        { to: 'CODE', agent: 'engineer' },
        { to: 'AUDIT', agent: 'engineer' },
        { to: 'BUILD', agent: 'qa' },
        { to: 'DEPLOY', agent: 'system' },
        { to: 'DONE', agent: 'mike' },
      ];

      for (const step of steps) {
        const result = await stateMachine.transition(step.to, step.agent);
        expect(result.success).toBe(true);
      }

      expect(stateMachine.getCurrentState()).toBe('DONE');

      // 尝试从 DONE 流转回任何状态
      const result1 = await stateMachine.transition('IDLE', 'pm');
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('No rule defined');

      const result2 = await stateMachine.transition('DEPLOY', 'mike');
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('No rule defined');

      // 验证状态仍然是 DONE
      expect(stateMachine.getCurrentState()).toBe('DONE');
    });

    it('E2E-002-05: 应拒绝投票未达到阈值的提案', async () => {
      // 创建提案
      const proposal = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '测试提案',
        description: '测试投票阈值',
        targetState: 'DESIGN',
      }, 'pm');

      // 只投2票（需要3票达到法定人数）
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证提案仍在投票状态
      const updatedProposal = voteService.getProposal(proposal.id);
      expect(updatedProposal?.status).toBe('voting');

      // 验证状态未改变
      expect(stateMachine.getCurrentState()).toBe('IDLE');
    });
  });

  // ============================================================================
  // E2E-003: 并发提案冲突（≥3个测试）
  // ============================================================================
  describe('E2E-003: Concurrent Proposal Conflicts', () => {
    it('E2E-003-01: 应正确处理同时创建的多个提案', async () => {
      // 同时创建3个提案
      const [proposal1, proposal2, proposal3] = await Promise.all([
        voteService.createProposal({
          proposer: 'pm' as AgentRole,
          title: '提案1',
          description: '第一个并发提案',
          targetState: 'DESIGN',
        }, 'pm'),
        voteService.createProposal({
          proposer: 'pm' as AgentRole,
          title: '提案2',
          description: '第二个并发提案',
          targetState: 'DESIGN',
        }, 'pm'),
        voteService.createProposal({
          proposer: 'pm' as AgentRole,
          title: '提案3',
          description: '第三个并发提案',
          targetState: 'DESIGN',
        }, 'pm'),
      ]);

      // 验证所有提案都被创建
      expect(proposal1.id).toBeDefined();
      expect(proposal2.id).toBeDefined();
      expect(proposal3.id).toBeDefined();
      expect(proposal1.id).not.toBe(proposal2.id);
      expect(proposal2.id).not.toBe(proposal3.id);

      // 验证提案独立性
      expect(voteService.getProposal(proposal1.id)).toBeDefined();
      expect(voteService.getProposal(proposal2.id)).toBeDefined();
      expect(voteService.getProposal(proposal3.id)).toBeDefined();

      // 获取所有活跃提案
      const activeProposals = voteService.getActiveProposals();
      expect(activeProposals.length).toBe(3);
    });

    it('E2E-003-02: 应验证对不同提案的投票互不干扰', async () => {
      // 创建两个提案
      const proposal1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '提案A',
        description: '测试独立投票A',
        targetState: 'DESIGN',
      }, 'pm');

      const proposal2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '提案B',
        description: '测试独立投票B',
        targetState: 'DESIGN',
      }, 'pm');

      // 只对proposal1投票
      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证proposal1已通过
      const stats1 = await voteService.getVoteStats(proposal1.id);
      expect(stats1.totalVotes).toBe(3);
      expect(['approved', 'executed']).toContain(stats1.status);

      // 验证proposal2未受影响
      const stats2 = await voteService.getVoteStats(proposal2.id);
      expect(stats2.totalVotes).toBe(0);
      expect(stats2.status).toBe('voting');
    });

    it('E2E-003-03: 应验证并发投票的正确性', async () => {
      // 创建两个提案
      const proposal1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '并发投票提案1',
        description: '测试并发投票',
        targetState: 'DESIGN',
      }, 'pm');

      const proposal2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '并发投票提案2',
        description: '测试并发投票',
        targetState: 'DESIGN',
      }, 'pm');

      // 并发对两个提案投票
      await Promise.all([
        voteService.vote(proposal1.id, 'pm', 'approve'),
        voteService.vote(proposal1.id, 'arch', 'approve'),
        voteService.vote(proposal1.id, 'qa', 'approve'),
        voteService.vote(proposal2.id, 'pm', 'approve'),
        voteService.vote(proposal2.id, 'engineer', 'approve'),
        voteService.vote(proposal2.id, 'mike', 'approve'),
      ]);

      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证两个提案都达到阈值
      const stats1 = await voteService.getVoteStats(proposal1.id);
      const stats2 = await voteService.getVoteStats(proposal2.id);

      expect(stats1.totalVotes).toBe(3);
      expect(stats2.totalVotes).toBe(3);
      expect(stats1.approvalRate).toBe(1); // 100% 通过
      expect(stats2.approvalRate).toBe(1); // 100% 通过
    });

    it('E2E-003-04: 应正确处理一个通过后另一个仍在投票的状态', async () => {
      // 创建两个相同目标的提案
      const proposal1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '快速通过提案',
        description: '这个提案会快速通过',
        targetState: 'DESIGN',
      }, 'pm');

      const proposal2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '慢速提案',
        description: '这个提案投票较慢',
        targetState: 'DESIGN',
      }, 'pm');

      // proposal1快速通过
      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await voteService.vote(proposal1.id, 'qa', 'approve');

      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证状态已改变
      expect(stateMachine.getCurrentState()).toBe('DESIGN');

      // proposal2仍在投票中
      const stats2 = await voteService.getVoteStats(proposal2.id);
      expect(stats2.totalVotes).toBe(0);
      expect(stats2.status).toBe('voting');

      // 继续对proposal2投票（验证不影响已改变的状态）
      await voteService.vote(proposal2.id, 'engineer', 'approve');
      await voteService.vote(proposal2.id, 'mike', 'approve');

      const stats2Updated = await voteService.getVoteStats(proposal2.id);
      expect(stats2Updated.totalVotes).toBe(2);
      expect(stats2Updated.status).toBe('voting'); // 未达到3票，仍在投票

      // 状态仍然是DESIGN
      expect(stateMachine.getCurrentState()).toBe('DESIGN');
    });
  });

  // ============================================================================
  // 完整工作流验证（额外测试）
  // ============================================================================
  describe('Complete Workflow Validation', () => {
    it('应验证完整工作流中的状态历史记录准确性', async () => {
      // 流转到 DESIGN
      const prop1 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入设计',
        description: '进入设计阶段',
        targetState: 'DESIGN',
      }, 'pm');
      await voteService.vote(prop1.id, 'pm', 'approve');
      await voteService.vote(prop1.id, 'arch', 'approve');
      await voteService.vote(prop1.id, 'qa', 'approve');
      await new Promise(resolve => setTimeout(resolve, 300));

      // 流转到 CODE
      const prop2 = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '进入编码',
        description: '进入编码阶段',
        targetState: 'CODE',
      }, 'pm');
      await voteService.vote(prop2.id, 'pm', 'approve');
      await voteService.vote(prop2.id, 'engineer', 'approve');
      await voteService.vote(prop2.id, 'arch', 'approve');
      await new Promise(resolve => setTimeout(resolve, 300));

      // 获取状态响应
      const stateResponse = stateMachine.getStateResponse();

      // 验证响应结构
      expect(stateResponse).toHaveProperty('state');
      expect(stateResponse).toHaveProperty('history');
      expect(stateResponse).toHaveProperty('timestamp');
      expect(stateResponse.state).toBe('CODE');
      expect(Array.isArray(stateResponse.history)).toBe(true);
      expect(stateResponse.history.length).toBe(2);

      // 验证历史记录详情
      expect(stateResponse.history[0]).toMatchObject({
        from: 'IDLE',
        to: 'DESIGN',
      });
      expect(stateResponse.history[1]).toMatchObject({
        from: 'DESIGN',
        to: 'CODE',
      });

      // 验证每条记录都有必要的字段
      stateResponse.history.forEach(record => {
        expect(record).toHaveProperty('id');
        expect(record).toHaveProperty('from');
        expect(record).toHaveProperty('to');
        expect(record).toHaveProperty('timestamp');
        expect(record).toHaveProperty('agent');
        expect(typeof record.timestamp).toBe('number');
        expect(record.timestamp).toBeGreaterThan(0);
      });
    });

    it('应验证不同角色权限在完整工作流中的正确性', async () => {
      const permissionMatrix = [
        { from: 'IDLE', to: 'DESIGN', allowed: ['pm', 'arch'], denied: ['qa', 'engineer', 'mike'] },
        { from: 'DESIGN', to: 'CODE', allowed: ['arch', 'engineer'], denied: ['pm', 'qa', 'mike'] },
        { from: 'CODE', to: 'AUDIT', allowed: ['engineer'], denied: ['pm', 'arch', 'qa', 'mike'] },
        { from: 'AUDIT', to: 'BUILD', allowed: ['qa'], denied: ['pm', 'arch', 'engineer', 'mike'] },
        { from: 'BUILD', to: 'DEPLOY', allowed: ['system', 'mike'], denied: ['pm', 'arch', 'qa', 'engineer'] },
        { from: 'DEPLOY', to: 'DONE', allowed: ['mike', 'system'], denied: ['pm', 'arch', 'qa', 'engineer'] },
      ];

      for (const test of permissionMatrix) {
        // 重置到正确的起始状态
        await stateMachine.reset();
        
        // 按需前置流转
        if (test.from === 'DESIGN') {
          await stateMachine.transition('DESIGN', 'pm');
        } else if (test.from === 'CODE') {
          await stateMachine.transition('DESIGN', 'pm');
          await stateMachine.transition('CODE', 'engineer');
        } else if (test.from === 'AUDIT') {
          await stateMachine.transition('DESIGN', 'pm');
          await stateMachine.transition('CODE', 'engineer');
          await stateMachine.transition('AUDIT', 'engineer');
        } else if (test.from === 'BUILD') {
          await stateMachine.transition('DESIGN', 'pm');
          await stateMachine.transition('CODE', 'engineer');
          await stateMachine.transition('AUDIT', 'engineer');
          await stateMachine.transition('BUILD', 'qa');
        } else if (test.from === 'DEPLOY') {
          await stateMachine.transition('DESIGN', 'pm');
          await stateMachine.transition('CODE', 'engineer');
          await stateMachine.transition('AUDIT', 'engineer');
          await stateMachine.transition('BUILD', 'qa');
          await stateMachine.transition('DEPLOY', 'system');
        }

        // 验证允许的角色
        for (const role of test.allowed) {
          // 注意：这里只验证权限检查，不实际执行
          const canTransition = stateMachine.canTransition(test.to, role as AgentRole);
          expect(canTransition).toBe(true);
        }

        // 验证拒绝的角色
        for (const role of test.denied) {
          const canTransition = stateMachine.canTransition(test.to, role as AgentRole);
          expect(canTransition).toBe(false);
        }
      }
    });
  });
});
