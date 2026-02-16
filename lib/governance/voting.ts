/**
 * 投票系统
 * 
 * 七权投票权重 + 通过阈值计算
 * 
 * @module lib/governance/voting
 * @version 1.3.0
 */

import { Proposal, Vote, VoteResult, VOTING_WEIGHTS, RoleWeight } from './types';
import { ProposalManager } from './proposal';

// ========== 投票权重计算器 ==========

export class VotingWeightCalculator {
  /**
   * 获取角色权重
   */
  getWeight(role: string): number {
    if (!role) return 0;
    const normalizedRole = role.toUpperCase();
    
    // 角色映射
    const roleMap: Record<string, RoleWeight> = {
      'PM': 'PM',
      'SOYORIN': 'PM',
      'ARCHITECT': 'ARCHITECT',
      'MORTIS': 'ARCHITECT',
      'QA': 'QA',
      'TOMORI': 'QA',
      'ENGINEER': 'ENGINEER',
      'ANON': 'ENGINEER',
      'AUDIT': 'AUDIT',
      'TAKI': 'AUDIT',
      'ORCHESTRATOR': 'ORCHESTRATOR',
      'SERVICE': 'ORCHESTRATOR',
    };

    const weightKey = roleMap[normalizedRole];
    return weightKey ? VOTING_WEIGHTS[weightKey] : 0;
  }

  /**
   * 计算加权票数
   */
  calculateWeightedVotes(votes: Vote[]): { for: number; against: number; abstain: number } {
    let weightedFor = 0;
    let weightedAgainst = 0;
    let weightedAbstain = 0;

    for (const vote of votes) {
      if (!vote.voterRole) continue;
      const weight = this.getWeight(vote.voterRole);
      
      switch (vote.vote) {
        case 'FOR':
          weightedFor += weight;
          break;
        case 'AGAINST':
          weightedAgainst += weight;
          break;
        case 'ABSTAIN':
          weightedAbstain += weight;
          break;
      }
    }

    return {
      for: weightedFor,
      against: weightedAgainst,
      abstain: weightedAbstain,
    };
  }
}

// ========== 投票管理器 ==========

export class VotingManager {
  private weightCalculator: VotingWeightCalculator;
  private proposalManager: ProposalManager;

  constructor(proposalManager: ProposalManager) {
    this.weightCalculator = new VotingWeightCalculator();
    this.proposalManager = proposalManager;
  }

  /**
   * 投票
   */
  vote(
    proposalId: string,
    voterId: string,
    voterRole: string,
    vote: 'FOR' | 'AGAINST' | 'ABSTAIN',
    comment?: string
  ): { success: boolean; proposal?: Proposal; error?: string } {
    const proposal = this.proposalManager.getProposal(proposalId);
    
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }

    if (proposal.status !== 'VOTING') {
      return { success: false, error: 'Proposal is not in voting status' };
    }

    if (Date.now() > proposal.expiresAt) {
      return { success: false, error: 'Proposal has expired' };
    }

    // 检查是否已投票
    if (proposal.votes[voterId]) {
      return { success: false, error: 'Already voted' };
    }

    const weight = this.weightCalculator.getWeight(voterRole);
    if (weight === 0) {
      return { success: false, error: 'Invalid voter role' };
    }

    // 记录投票
    const updatedProposal: Proposal = {
      ...proposal,
      votes: {
        ...proposal.votes,
        [voterId]: vote,
      },
      voteHistory: [
        ...proposal.voteHistory,
        {
          voterId,
          vote,
          timestamp: Date.now(),
          weight,
        },
      ],
    };

    this.proposalManager['storage'].save(updatedProposal);

    return { success: true, proposal: updatedProposal };
  }

  /**
   * 计算投票结果
   */
  calculateResult(proposalId: string): VoteResult | null {
    const proposal = this.proposalManager.getProposal(proposalId);
    if (!proposal) return null;

    const votes = proposal.voteHistory;
    const weighted = this.weightCalculator.calculateWeightedVotes(votes);

    const totalVotes = votes.length;
    const forVotes = votes.filter((v) => v.vote === 'FOR').length;
    const againstVotes = votes.filter((v) => v.vote === 'AGAINST').length;
    const abstainVotes = votes.filter((v) => v.vote === 'ABSTAIN').length;

    const forPercentage = totalVotes > 0 ? forVotes / totalVotes : 0;
    const againstPercentage = totalVotes > 0 ? againstVotes / totalVotes : 0;

    // 检查Audit否决
    const auditVeto = votes.some(
      (v) => v.voterId.toUpperCase().includes('AUDIT') && v.vote === 'AGAINST'
    );

    // 判断是否通过
    // 规则: >60%同意 且 Audit不反对
    let status: VoteResult['status'] = 'PENDING';
    
    if (Date.now() > proposal.expiresAt) {
      if (forPercentage > proposal.requiredApprovals && !auditVeto) {
        status = 'PASSED';
      } else {
        status = 'REJECTED';
      }
    }

    if (auditVeto) {
      status = 'BLOCKED';
    }

    return {
      proposalId,
      totalVotes,
      forVotes,
      againstVotes,
      abstainVotes,
      forPercentage,
      againstPercentage,
      weightedFor: weighted.for,
      weightedAgainst: weighted.against,
      status,
      auditVeto,
      timestamp: Date.now(),
    };
  }

  /**
   * 结束投票并确定结果
   */
  finalizeVoting(proposalId: string): { success: boolean; proposal?: Proposal; result?: VoteResult } {
    const proposal = this.proposalManager.getProposal(proposalId);
    if (!proposal) {
      return { success: false };
    }

    const result = this.calculateResult(proposalId);
    if (!result) {
      return { success: false };
    }

    let newStatus: Proposal['status'];
    switch (result.status) {
      case 'PASSED':
        newStatus = 'APPROVED';
        break;
      case 'REJECTED':
      case 'BLOCKED':
        newStatus = 'REJECTED';
        break;
      default:
        newStatus = proposal.status;
    }

    const updatedProposal: Proposal = {
      ...proposal,
      status: newStatus,
    };

    this.proposalManager['storage'].save(updatedProposal);
    
    // 归档到链
    this.proposalManager.archiveToChain(updatedProposal);

    return { success: true, proposal: updatedProposal, result };
  }

  /**
   * 获取投票统计
   */
  getVotingStats(proposalId: string): {
    totalWeight: number;
    forWeight: number;
    againstWeight: number;
    participationRate: number;
  } | null {
    const proposal = this.proposalManager.getProposal(proposalId);
    if (!proposal) return null;

    const votes = proposal.voteHistory;
    const weighted = this.weightCalculator.calculateWeightedVotes(votes);

    const totalWeight = Object.values(VOTING_WEIGHTS).reduce((a, b) => a + b, 0);
    const votedWeight = weighted.for + weighted.against + weighted.abstain;

    return {
      totalWeight,
      forWeight: weighted.for,
      againstWeight: weighted.against,
      participationRate: votedWeight / totalWeight,
    };
  }
}

export default VotingManager;
