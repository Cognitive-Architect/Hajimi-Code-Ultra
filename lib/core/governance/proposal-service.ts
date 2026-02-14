/**
 * B-02 治理引擎 - 提案服务核心类
 */

import { EventEmitter } from 'events';
import { tsa } from '@/lib/tsa';
import type { AgentRole, PowerState } from '@/lib/types/state';
import {
  Proposal,
  ProposalStatus,
  CreateProposalRequest,
  ProposalFilter,
  ProposalListResponse,
  GovernanceConfig,
  Vote,
  VoteChoice,
  DEFAULT_GOVERNANCE_CONFIG,
  PermissionDeniedError,
  ValidationError,
  ProposalNotFoundError,
} from './types';

const PROPOSAL_KEY_PREFIX = 'governance:proposal:';
const PROPOSAL_INDEX_KEY = 'governance:proposals:index';

export class ProposalService extends EventEmitter {
  private config: GovernanceConfig;
  private expirationTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<GovernanceConfig>) {
    super();
    this.config = { ...DEFAULT_GOVERNANCE_CONFIG, ...config };
  }

  async init(): Promise<void> {
    this.startExpirationCheck();
    console.log('[ProposalService] 初始化完成');
  }

  destroy(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  async createProposal(request: CreateProposalRequest): Promise<Proposal> {
    if (request.proposer !== 'pm') {
      throw new PermissionDeniedError(
        'ONLY_PM_CAN_CREATE_PROPOSAL',
        '只有PM角色可以创建提案',
        403
      );
    }

    this.validateCreateRequest(request);

    const now = Date.now();
    const expirationMs = request.timeoutMs || this.config.proposalTimeoutMs || 30 * 60 * 1000;

    const proposal: Proposal = {
      id: `prop_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: request.title,
      description: request.description,
      proposer: request.proposer,
      targetState: request.targetState,
      status: 'voting',
      votes: [],
      createdAt: now,
      expiresAt: now + expirationMs,
      type: request.type || 'state_transition',
      context: request.context,
    };

    const key = `${PROPOSAL_KEY_PREFIX}${proposal.id}`;
    await tsa.set(key, proposal, { tier: 'STAGING' });
    await this.addToIndex(proposal.id, proposal.createdAt);

    this.emit('proposal:created', proposal);
    console.log(`[ProposalService] 提案创建成功: ${proposal.id}`);
    return proposal;
  }

  async getProposals(filter?: ProposalFilter): Promise<ProposalListResponse> {
    const index = await this.getIndex();
    let proposals: Proposal[] = [];

    for (const id of index) {
      const proposal = await this.getProposal(id);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    if (filter?.status) {
      proposals = proposals.filter(p => filter.status?.includes(p.status));
    }
    if (filter?.proposer) {
      proposals = proposals.filter(p => p.proposer === filter.proposer);
    }
    if (filter?.targetState) {
      proposals = proposals.filter(p => p.targetState === filter.targetState);
    }
    if (!filter?.includeExpired) {
      proposals = proposals.filter(p => p.status !== 'expired');
    }

    proposals.sort((a, b) => b.createdAt - a.createdAt);

    const total = proposals.length;
    const stats: Record<string, number> = {
      pending: 0,
      voting: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      executed: 0,
    };
    for (const p of proposals) {
      stats[p.status] = (stats[p.status] || 0) + 1;
    }

    return {
      proposals,
      total,
      page: 1,
      pageSize: total,
      stats,
    };
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const key = `${PROPOSAL_KEY_PREFIX}${id}`;
    return await tsa.get<Proposal>(key);
  }

  async getProposalOrThrow(id: string): Promise<Proposal> {
    const proposal = await this.getProposal(id);
    if (!proposal) {
      throw new ProposalNotFoundError(id);
    }
    return proposal;
  }

  async updateProposalStatus(id: string, status: ProposalStatus): Promise<void> {
    const proposal = await this.getProposalOrThrow(id);
    const oldStatus = proposal.status;
    proposal.status = status;
    proposal.updatedAt = Date.now();

    const key = `${PROPOSAL_KEY_PREFIX}${id}`;
    await tsa.set(key, proposal, { tier: 'STAGING' });

    this.emit('proposal:statusChanged', { proposalId: id, oldStatus, newStatus: status });
  }

  async castVote(proposalId: string, voter: AgentRole, choice: VoteChoice, reason?: string): Promise<Proposal> {
    const proposal = await this.getProposalOrThrow(proposalId);
    
    if (proposal.status !== 'voting') {
      throw new ValidationError('PROPOSAL_NOT_VOTING', '提案不在投票状态');
    }

    const allowedVoters = this.config.allowedVoters || ['pm', 'arch', 'qa', 'engineer', 'mike'];
    if (!allowedVoters.includes(voter)) {
      throw new PermissionDeniedError('NOT_ALLOWED_TO_VOTE', '该角色不允许投票', 403);
    }

    const existingIndex = proposal.votes.findIndex(v => v.voter === voter);
    const vote: Vote = {
      voter,
      choice,
      reason,
      timestamp: Date.now(),
      weight: this.getRoleWeight(voter),
    };

    if (existingIndex >= 0) {
      proposal.votes[existingIndex] = vote;
    } else {
      proposal.votes.push(vote);
    }

    const key = `${PROPOSAL_KEY_PREFIX}${proposalId}`;
    await tsa.set(key, proposal, { tier: 'STAGING' });

    this.emit('vote:cast', { proposalId, voter, choice });
    return proposal;
  }

  private getRoleWeight(role: AgentRole): number {
    const weights: Record<AgentRole, number> = {
      pm: 2, arch: 2, qa: 1, engineer: 1, mike: 1, system: 0,
    };
    return weights[role] || 1;
  }

  private async checkExpiration(): Promise<void> {
    const now = Date.now();
    const { proposals } = await this.getProposals({ status: ['pending', 'voting'] });

    let expiredCount = 0;
    for (const proposal of proposals) {
      if (proposal.expiresAt <= now) {
        await this.updateProposalStatus(proposal.id, 'expired');
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[ProposalService] 过期提案清理完成: ${expiredCount}个`);
    }
  }

  private startExpirationCheck(): void {
    if (this.expirationTimer) return;

    this.expirationTimer = setInterval(() => {
      this.checkExpiration().catch(err => {
        console.error('[ProposalService] 过期检查失败:', err);
      });
    }, this.config.checkIntervalMs);
  }

  private validateCreateRequest(request: CreateProposalRequest): void {
    if (!request.title || request.title.trim().length === 0) {
      throw new ValidationError('TITLE_REQUIRED', '提案标题不能为空');
    }
    if (request.title.length > 200) {
      throw new ValidationError('TITLE_TOO_LONG', '提案标题不能超过200字符');
    }
    if (!request.description || request.description.trim().length === 0) {
      throw new ValidationError('DESCRIPTION_REQUIRED', '提案描述不能为空');
    }
    if (request.description.length > 5000) {
      throw new ValidationError('DESCRIPTION_TOO_LONG', '提案描述不能超过5000字符');
    }
    if (!request.targetState) {
      throw new ValidationError('TARGET_STATE_REQUIRED', '目标状态不能为空');
    }
  }

  private async getIndex(): Promise<string[]> {
    return await tsa.get<string[]>(PROPOSAL_INDEX_KEY) || [];
  }

  private async addToIndex(id: string, _timestamp: number): Promise<void> {
    const index = await this.getIndex();
    if (!index.includes(id)) {
      index.push(id);
      await tsa.set(PROPOSAL_INDEX_KEY, index, { tier: 'STAGING' });
    }
  }
}

export const proposalService = new ProposalService();
