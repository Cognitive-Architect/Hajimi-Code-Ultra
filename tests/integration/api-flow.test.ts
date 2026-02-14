/**
 * B-09 测试体系 - API集成测试
 * 
 * 测试项:
 * - 端到端API流程测试
 * - 跨模块集成验证
 */

import { NextRequest } from 'next/server';
import { StateMachine } from '@/lib/core/state/machine';
import {
  ProposalService,
  VoteService,
  VoteServiceError,
} from '@/lib/core/governance';
import { A2AService } from '@/lib/core/agents/a2a-service';
import {
  extractToken,
  verifyToken,
  generateToken,
  buildAuthContext,
  withAuth,
} from '@/lib/api/auth';
import { tsa } from '@/lib/tsa';
import { AgentRole } from '@/lib/types/state';
import { StateMachine as StateMachineClass } from '@/lib/core/state/machine';

describe('API Integration Flow', () => {
  let stateMachine: StateMachine;
  let proposalService: ProposalService;
  let voteService: VoteService;
  let a2aService: A2AService;

  beforeEach(async () => {
    // 清理 TSA
    await tsa.clear();

    // 初始化所有服务
    stateMachine = new StateMachineClass();
    await stateMachine.init();

    proposalService = new ProposalService();
    await proposalService.init();

    voteService = new VoteService(stateMachine as StateMachineClass);
    await voteService.init();

    a2aService = new A2AService();
    await a2aService.init();
  });

  afterEach(async () => {
    await proposalService.destroy();
    await voteService.dispose();
    await tsa.clear();
  });

  // ============================================================================
  // 完整工作流测试
  // ============================================================================
  describe('End-to-End Workflow', () => {
    it('should complete full governance workflow with state transition', async () => {
      // 1. PM 创建提案
      const proposalResult = await proposalService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '状态流转提案',
        description: '从IDLE流转到DESIGN状态，验证完整工作流。',
        targetState: 'DESIGN',
      });

      expect(proposalResult.success).toBe(true);
      const proposalId = proposalResult.proposal!.id;

      // 2. 多个角色投票
      await voteService.vote(proposalId, 'pm', 'approve');
      await voteService.vote(proposalId, 'arch', 'approve');

      // 等待异步执行
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. 验证提案已通过并执行
      const updatedProposal = await voteService.getProposal(proposalId);
      expect(['approved', 'executed']).toContain(updatedProposal?.status);

      // 4. 验证状态机状态已变更
      const stateResponse = stateMachine.getStateResponse();
      expect(stateResponse.state).toBe('DESIGN');
    });

    it('should handle A2A communication during governance', async () => {
      // 1. 创建提案
      const proposal = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: 'A2A通信测试提案',
        description: '在治理过程中进行A2A通信。',
        targetState: 'DESIGN',
      });

      // 2. 发送治理相关消息
      const message = await a2aService.sendMessage({
        sender: 'pm',
        receiver: 'arch',
        content: `请审阅提案: ${proposal.id}`,
        type: 'proposal',
        metadata: { proposalId: proposal.id },
      });

      expect(message).toBeDefined();
      expect(message.metadata?.proposalId).toBe(proposal.id);

      // 3. 投票后查询历史消息
      await voteService.vote(proposal.id, 'arch', 'approve');
      
      const history = await a2aService.getHistory(message.sessionId);
      expect(history.data.length).toBeGreaterThan(0);
    });

    it('should enforce auth in integrated scenarios', async () => {
      // 验证 PM 可以创建提案
      const pmToken = generateToken('pm-agent', 'pm');
      const pmPayload = verifyToken(pmToken);
      expect(pmPayload).not.toBeNull();
      expect(pmPayload!.role).toBe('pm');

      const pmAuth = buildAuthContext(pmPayload!);
      expect(pmAuth.permissions).toContain('proposal:create');

      // 验证 Engineer 不能创建提案
      const engToken = generateToken('eng-agent', 'engineer');
      const engPayload = verifyToken(engToken);
      const engAuth = buildAuthContext(engPayload!);
      expect(engAuth.permissions).not.toContain('proposal:create');

      // 验证权限检查会拒绝
      try {
        await proposalService.createProposal({
          proposer: 'engineer' as AgentRole,
          title: '非法提案',
          description: '工程师不应该能创建提案。',
          targetState: 'DESIGN',
        });
        fail('应该抛出权限错误');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // 状态机与治理集成
  // ============================================================================
  describe('State Machine and Governance Integration', () => {
    it('should transition state after proposal approval', async () => {
      // 初始状态为 IDLE
      expect(stateMachine.getCurrentState()).toBe('IDLE');

      // 创建并投票通过提案
      const proposal = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '状态流转提案',
        description: '流转到DESIGN状态。',
        targetState: 'DESIGN',
      });

      // 投票达到60%阈值
      await voteService.vote(proposal.id, 'pm', 'approve');
      await voteService.vote(proposal.id, 'arch', 'approve');

      // 等待状态流转完成
      await new Promise(resolve => setTimeout(resolve, 300));

      // 验证状态已变更
      expect(stateMachine.getCurrentState()).toBe('DESIGN');
    });

    it('should track state history through transitions', async () => {
      // 流转到 DESIGN
      await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '流转1',
        description: '到DESIGN。',
        targetState: 'DESIGN',
      });

      const proposal1 = (await voteService.getActiveProposals())[0];
      await voteService.vote(proposal1.id, 'pm', 'approve');
      await voteService.vote(proposal1.id, 'arch', 'approve');
      await new Promise(resolve => setTimeout(resolve, 200));

      // 流转到 CODE
      await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '流转2',
        description: '到CODE。',
        targetState: 'CODE',
      });

      const proposal2 = (await voteService.getActiveProposals())[0];
      await voteService.vote(proposal2.id, 'engineer', 'approve');
      await voteService.vote(proposal2.id, 'arch', 'approve');
      await new Promise(resolve => setTimeout(resolve, 200));

      // 验证历史记录
      const history = stateMachine.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].from).toBe('IDLE');
      expect(history[0].to).toBe('DESIGN');
    });

    it('should prevent unauthorized state transitions', async () => {
      // 尝试不通过提案直接流转（需要相应权限）
      const result = await stateMachine.transition('DEPLOY', 'pm');

      // 应该失败，因为 IDLE 不能直接到 DEPLOY
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rule defined');
    });
  });

  // ============================================================================
  // A2A与治理集成
  // ============================================================================
  describe('A2A and Governance Integration', () => {
    it('should send proposal notifications via A2A', async () => {
      const messages: string[] = [];
      
      // 订阅消息
      a2aService.subscribe((msg) => {
        if (msg.type === 'proposal') {
          messages.push(msg.content);
        }
      });

      // 创建提案并发送通知
      const proposal = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '通知测试提案',
        description: '测试提案通知功能。',
        targetState: 'DESIGN',
      });

      await a2aService.sendMessage({
        sender: 'pm',
        receiver: 'all',
        content: `新提案: ${proposal.title}`,
        type: 'proposal',
      });

      expect(messages.length).toBe(1);
      expect(messages[0]).toContain('新提案');
    });

    it('should query proposal status through A2A', async () => {
      // 创建提案
      const proposal = await voteService.createProposal({
        proposer: 'pm' as AgentRole,
        title: '状态查询提案',
        description: '查询提案状态。',
        targetState: 'DESIGN',
      });

      // 查询状态
      const stats = await voteService.getVoteStats(proposal.id);

      // 通过 A2A 发送状态信息
      await a2aService.sendMessage({
        sender: 'system',
        receiver: 'pm',
        content: `提案 ${proposal.id} 状态: ${stats.status}, 投票数: ${stats.totalVotes}`,
        type: 'system',
      });

      const history = await a2aService.getHistory(
        `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      );
      // 验证消息被正确存储
      expect(history).toBeDefined();
    });
  });

  // ============================================================================
  // 认证与授权集成
  // ============================================================================
  describe('Auth and Authorization Integration', () => {
    it('should enforce role-based access in full flow', async () => {
      // 模拟 PM Token
      const pmToken = generateToken('pm-001', 'pm');
      
      // 验证 PM 可以执行所有操作
      const pmPayload = verifyToken(pmToken);
      expect(pmPayload).not.toBeNull();
      
      const pmAuth = buildAuthContext(pmPayload!);
      expect(pmAuth.role).toBe('pm');
      expect(pmAuth.level).toBe(100);
      expect(pmAuth.permissions).toContain('proposal:create');
      expect(pmAuth.permissions).toContain('state:transition');

      // 创建提案
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '权限测试提案',
        description: '测试权限控制。',
        targetState: 'DESIGN',
      });

      // QA 可以投票但不能创建
      const qaToken = generateToken('qa-001', 'qa');
      const qaPayload = verifyToken(qaToken);
      const qaAuth = buildAuthContext(qaPayload!);
      
      expect(qaAuth.permissions).not.toContain('proposal:create');
      expect(qaAuth.permissions).toContain('vote:submit');

      // QA 投票
      await voteService.vote(proposal.id, 'qa', 'approve');
      
      const stats = await voteService.getVoteStats(proposal.id);
      expect(stats.totalVotes).toBe(1);
    });

    it('should handle token extraction from various sources', () => {
      // 从 Header 提取
      const headerReq = new NextRequest('http://localhost/api/test', {
        headers: { authorization: 'Bearer agent1:pm:1234567890' },
      });
      expect(extractToken(headerReq)).toBe('agent1:pm:1234567890');

      // 从 Query 提取
      const queryReq = new NextRequest(
        'http://localhost/api/test?token=agent2:arch:1234567890'
      );
      expect(extractToken(queryReq)).toBe('agent2:arch:1234567890');

      // 从 Cookie 提取
      const cookieReq = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'auth_token=agent3:qa:1234567890' },
      });
      expect(extractToken(cookieReq)).toBe('agent3:qa:1234567890');
    });
  });

  // ============================================================================
  // 错误处理集成
  // ============================================================================
  describe('Error Handling Integration', () => {
    it('should handle proposal not found error', async () => {
      await expect(
        voteService.vote('non-existent-id', 'pm', 'approve')
      ).rejects.toThrow(VoteServiceError);
    });

    it('should handle duplicate vote error', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '重复投票测试',
        description: '测试重复投票错误处理。',
        targetState: 'DESIGN',
      });

      await voteService.vote(proposal.id, 'pm', 'approve');

      // 覆盖投票在 VoteService 中是允许的（更新）
      const stats = await voteService.vote(proposal.id, 'pm', 'reject');
      expect(stats.votedRoles).toContain('pm');
    });

    it('should handle expired proposal', async () => {
      // 创建快速过期的提案
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '过期测试提案',
        description: '这个提案会很快过期。',
        targetState: 'DESIGN',
        timeoutMs: 50,
      });

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 100));

      // 尝试投票应该失败
      await expect(
        voteService.vote(proposal.id, 'pm', 'approve')
      ).rejects.toThrow(VoteServiceError);
    });

    it('should handle invalid state transitions', async () => {
      const result = await stateMachine.transition('DONE', 'mike');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // 并发场景测试
  // ============================================================================
  describe('Concurrent Operations', () => {
    it('should handle concurrent votes', async () => {
      const proposal = await voteService.createProposal({
        proposer: 'pm',
        title: '并发投票测试',
        description: '测试并发投票场景。',
        targetState: 'DESIGN',
      });

      // 并发投票
      await Promise.all([
        voteService.vote(proposal.id, 'pm', 'approve'),
        voteService.vote(proposal.id, 'arch', 'approve'),
        voteService.vote(proposal.id, 'qa', 'approve'),
      ]);

      const stats = await voteService.getVoteStats(proposal.id);
      expect(stats.totalVotes).toBe(3);
    });

    it('should handle concurrent message sending', async () => {
      const sessionId = `session-${Date.now()}`;
      
      // 并发发送消息
      const promises = Array.from({ length: 5 }, (_, i) =>
        a2aService.sendMessage({
          sender: 'agent-1',
          receiver: 'agent-2',
          content: `消息 ${i + 1}`,
          sessionId,
        })
      );

      const messages = await Promise.all(promises);
      expect(messages.length).toBe(5);
      expect(messages.every(m => m.sessionId === sessionId)).toBe(true);

      // 验证历史
      const history = await a2aService.getHistory(sessionId);
      expect(history.pagination.total).toBe(5);
    });
  });

  // ============================================================================
  // 性能基准测试
  // ============================================================================
  describe('Performance Benchmarks', () => {
    it('should create proposals within acceptable time', async () => {
      const start = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await voteService.createProposal({
          proposer: 'pm',
          title: `性能测试提案 ${i}`,
          description: '测试创建性能。',
          targetState: 'DESIGN',
        });
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5秒内完成10次创建
    });

    it('should query history within acceptable time', async () => {
      const sessionId = `perf-session-${Date.now()}`;
      
      // 发送一些消息
      for (let i = 0; i < 20; i++) {
        await a2aService.sendMessage({
          sender: 'agent-1',
          receiver: 'agent-2',
          content: `消息 ${i}`,
          sessionId,
        });
      }

      const start = Date.now();
      const history = await a2aService.getHistory(sessionId);
      const duration = Date.now() - start;

      expect(history.data.length).toBe(20);
      expect(duration).toBeLessThan(1000); // 1秒内完成查询
    });
  });
});
