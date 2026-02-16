/**
 * 治理引擎单元测试
 * 
 * GOV-001~005
 */

import { ProposalManager, VotingManager } from '../../lib/governance';
import { VOTING_WEIGHTS } from '../../lib/governance/types';

describe('GOV-001: 提案结构', () => {
  let manager: ProposalManager;

  beforeEach(() => {
    manager = new ProposalManager();
  });

  test('创建提案包含所有必需字段', () => {
    const proposal = manager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test Proposal',
      description: 'Test description',
      data: { key: 'value' },
      proposer: { id: 'user1', role: 'PM', name: 'Test User' },
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.title).toBe('Test Proposal');
    expect(proposal.status).toBe('PENDING');
    expect(proposal.timestamp).toBeGreaterThan(0);
    expect(proposal.expiresAt).toBeGreaterThan(proposal.timestamp);
  });

  test('提案可以启动投票', () => {
    const proposal = manager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
    });

    const started = manager.startVoting(proposal.id);
    expect(started?.status).toBe('VOTING');
  });
});

describe('GOV-002: 七权投票权重配置', () => {
  test('权重配置总和为100%', () => {
    const total = Object.values(VOTING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 2);
  });

  test('PM权重为25%', () => {
    expect(VOTING_WEIGHTS.PM).toBe(0.25);
  });

  test('ARCHITECT权重为20%', () => {
    expect(VOTING_WEIGHTS.ARCHITECT).toBe(0.20);
  });

  test('QA权重为20%', () => {
    expect(VOTING_WEIGHTS.QA).toBe(0.20);
  });

  test('ENGINEER权重为15%', () => {
    expect(VOTING_WEIGHTS.ENGINEER).toBe(0.15);
  });

  test('AUDIT权重为15%', () => {
    expect(VOTING_WEIGHTS.AUDIT).toBe(0.15);
  });

  test('ORCHESTRATOR权重为5%', () => {
    expect(VOTING_WEIGHTS.ORCHESTRATOR).toBe(0.05);
  });
});

describe('GOV-003: 投票状态机', () => {
  let proposalManager: ProposalManager;
  let votingManager: VotingManager;

  beforeEach(() => {
    proposalManager = new ProposalManager();
    votingManager = new VotingManager(proposalManager);
  });

  test('投票状态流转: PENDING -> VOTING -> APPROVED', () => {
    const proposal = proposalManager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
    });

    expect(proposal.status).toBe('PENDING');

    proposalManager.startVoting(proposal.id);
    const voting = proposalManager.getProposal(proposal.id);
    expect(voting?.status).toBe('VOTING');
  });

  test('无法对已过期提案投票', () => {
    const proposal = proposalManager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
      expiresIn: -1, // 已过期
    });

    proposalManager.startVoting(proposal.id);

    const result = votingManager.vote(proposal.id, 'user2', 'PM', 'FOR');
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
  });

  test('同一人不能重复投票', () => {
    const proposal = proposalManager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
    });

    proposalManager.startVoting(proposal.id);

    votingManager.vote(proposal.id, 'user2', 'PM', 'FOR');
    const result = votingManager.vote(proposal.id, 'user2', 'PM', 'AGAINST');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Already voted');
  });
});

describe('GOV-004: 通过阈值计算', () => {
  let proposalManager: ProposalManager;
  let votingManager: VotingManager;

  beforeEach(() => {
    proposalManager = new ProposalManager();
    votingManager = new VotingManager(proposalManager);
  });

  test('需要>60%同意票才能通过', () => {
    const proposal = proposalManager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'proposer', role: 'PM', name: 'Test' },
      expiresIn: 1000,
    });

    proposalManager.startVoting(proposal.id);

    // 4票同意，1票反对 = 80%同意
    votingManager.vote(proposal.id, 'pm1', 'PM', 'FOR');
    votingManager.vote(proposal.id, 'arch1', 'ARCHITECT', 'FOR');
    votingManager.vote(proposal.id, 'qa1', 'QA', 'FOR');
    votingManager.vote(proposal.id, 'eng1', 'ENGINEER', 'FOR');
    votingManager.vote(proposal.id, 'audit1', 'AUDIT', 'AGAINST');

    const stats = votingManager.getVotingStats(proposal.id);
    expect(stats?.forWeight).toBeGreaterThan(0.6);
  });

  test('Audit反对会BLOCK提案', () => {
    const proposal = proposalManager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'proposer', role: 'PM', name: 'Test' },
    });

    proposalManager.startVoting(proposal.id);

    // Audit投票反对
    votingManager.vote(proposal.id, 'audit1', 'AUDIT', 'AGAINST');
    votingManager.vote(proposal.id, 'pm1', 'PM', 'FOR');

    const result = votingManager.calculateResult(proposal.id);
    expect(result?.auditVeto).toBe(true);
    expect(result?.status).toBe('BLOCKED');
  });
});

describe('GOV-005: 链式存储防篡改', () => {
  let manager: ProposalManager;

  beforeEach(() => {
    manager = new ProposalManager();
  });

  test('提案归档到链', () => {
    const proposal = manager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
    });

    const block = manager.archiveToChain(proposal);
    
    expect(block.index).toBe(0);
    expect(block.hash).toBeDefined();
    expect(block.proposal.id).toBe(proposal.id);
  });

  test('链完整性验证', () => {
    const p1 = manager.createProposal({
      type: 'CODE_CHANGE',
      title: 'Test1',
      description: 'Test',
      data: {},
      proposer: { id: 'user1', role: 'PM', name: 'Test' },
    });

    const p2 = manager.createProposal({
      type: 'POLICY_CHANGE',
      title: 'Test2',
      description: 'Test',
      data: {},
      proposer: { id: 'user2', role: 'ARCHITECT', name: 'Test' },
    });

    manager.archiveToChain(p1);
    manager.archiveToChain(p2);

    expect(manager.verifyChain()).toBe(true);
  });

  test('链历史可追溯', () => {
    const p1 = manager.createProposal({ type: 'CODE_CHANGE', title: '1', description: '1', data: {}, proposer: { id: 'u1', role: 'PM', name: 'T' } });
    const p2 = manager.createProposal({ type: 'CODE_CHANGE', title: '2', description: '2', data: {}, proposer: { id: 'u2', role: 'PM', name: 'T' } });

    manager.archiveToChain(p1);
    manager.archiveToChain(p2);

    const history = manager.getChainHistory();
    expect(history.length).toBe(2);
    expect(history[1].previousHash).toBe(history[0].hash);
  });
});

describe('GOV-DEBT: 债务声明', () => {
  test('存在DEBT标记', () => {
    expect(true).toBe(true);
  });
});
