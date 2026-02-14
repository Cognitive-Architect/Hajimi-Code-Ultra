/**
 * B-03 治理引擎 - 投票服务核心类
 */

import { tsa } from '@/lib/tsa';
import { AgentRole } from '@/lib/types/state';
import { stateMachine, StateMachine } from '@/lib/core/state/machine';
import {
  Vote,
  VoteChoice,
  VoteResult,
  VoteStats,
  Proposal,
  ProposalStatus,
  CreateProposalRequest,
  ROLE_WEIGHTS,
  VOTING_RULES,
  VOTABLE_ROLES,
  VoteEvent,
  VoteEventType,
  VoteEventHandler,
  VoteSubmittedEvent,
  ProposalStatusEvent,
} from './types';

const PROPOSAL_KEY_PREFIX = 'governance:proposal:';
const ACTIVE_PROPOSALS_KEY = 'governance:active_proposals';

export class VoteService {
  private proposals: Map<string, Proposal> = new Map();
  private listeners: Map<VoteEventType, Set<VoteEventHandler>> = new Map();
  private checkIntervalId?: NodeJS.Timeout;
  private stateMachine: StateMachine;
  private initialized = false;

  constructor(stateMachineInstance: StateMachine = stateMachine) {
    this.stateMachine = stateMachineInstance;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.listeners.set('vote:submitted', new Set());
    this.listeners.set('proposal:created', new Set());
    this.listeners.set('proposal:approved', new Set());
    this.listeners.set('proposal:rejected', new Set());
    this.listeners.set('proposal:expired', new Set());
    this.listeners.set('proposal:executed', new Set());
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadProposalsFromStorage();
    this.startExpirationCheck();
    this.initialized = true;
    console.log('[VoteService] 初始化完成');
  }

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
    }
    this.listeners.clear();
    this.initialized = false;
  }

  async createProposal(request: CreateProposalRequest, proposer: AgentRole): Promise<Proposal> {
    if (proposer !== 'pm') {
      throw new Error('Only PM can create proposals');
    }

    const now = Date.now();
    const proposal: Proposal = {
      id: `prop_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: request.title,
      description: request.description,
      proposer: request.proposer,
      targetState: request.targetState,
      status: 'voting',
      votes: [],
      createdAt: now,
      expiresAt: now + VOTING_RULES.TIMEOUT_MS,
      type: request.type || 'state_transition',
      context: request.context,
    };

    this.proposals.set(proposal.id, proposal);
    await this.saveProposalToStorage(proposal);
    await this.addToActiveProposals(proposal.id);

    this.emitEvent({
      type: 'proposal:created',
      timestamp: now,
      data: { proposalId: proposal.id, status: 'voting', timestamp: now },
    } as ProposalStatusEvent);

    return proposal;
  }

  async vote(proposalId: string, voter: AgentRole, choice: VoteChoice, reason?: string): Promise<VoteResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    if (proposal.status !== 'voting') {
      throw new Error(`Proposal is not in voting status: ${proposal.status}`);
    }

    if (!VOTABLE_ROLES.includes(voter)) {
      throw new Error(`Role ${voter} is not allowed to vote`);
    }

    const existingVoteIndex = proposal.votes.findIndex(v => v.voter === voter);
    const voteRecord: Vote = {
      voter,
      choice,
      reason,
      timestamp: Date.now(),
      weight: ROLE_WEIGHTS[voter],
    };

    if (existingVoteIndex >= 0) {
      proposal.votes[existingVoteIndex] = voteRecord;
    } else {
      proposal.votes.push(voteRecord);
    }

    await this.saveProposalToStorage(proposal);

    this.emitEvent({
      type: 'vote:submitted',
      timestamp: Date.now(),
      data: { proposalId, voter, choice },
    } as VoteSubmittedEvent);

    const result = this.calculateResult(proposal);

    if (result.shouldExecute) {
      await this.executeProposal(proposal);
    } else if (result.shouldReject) {
      await this.rejectProposal(proposal);
    }

    return result;
  }

  private calculateResult(proposal: Proposal): VoteResult {
    const votes = proposal.votes;
    let totalWeight = 0;
    let approveWeight = 0;
    let rejectWeight = 0;
    let abstainWeight = 0;

    for (const vote of votes) {
      const weight = ROLE_WEIGHTS[vote.voter] || 1;
      totalWeight += weight;
      
      switch (vote.choice) {
        case 'approve':
          approveWeight += weight;
          break;
        case 'reject':
          rejectWeight += weight;
          break;
        case 'abstain':
          abstainWeight += weight;
          break;
      }
    }

    const approvalRate = totalWeight > 0 ? approveWeight / totalWeight : 0;
    const rejectionRate = totalWeight > 0 ? rejectWeight / totalWeight : 0;

    const hasQuorum = votes.length >= VOTING_RULES.QUORUM;
    const hasApprovalThreshold = approvalRate >= VOTING_RULES.APPROVAL_THRESHOLD;
    const notRejected = rejectionRate < VOTING_RULES.APPROVAL_THRESHOLD;

    const shouldExecute = hasQuorum && hasApprovalThreshold && notRejected;
    const shouldReject = hasQuorum && rejectionRate >= VOTING_RULES.APPROVAL_THRESHOLD;

    return {
      proposalId: proposal.id,
      totalVotes: votes.length,
      totalWeight,
      approveWeight,
      rejectWeight,
      abstainWeight,
      approvalRate,
      rejectionRate,
      hasQuorum,
      hasApprovalThreshold,
      shouldExecute,
      shouldReject,
      status: shouldExecute ? 'approved' : shouldReject ? 'rejected' : 'voting',
    };
  }

  private async executeProposal(proposal: Proposal): Promise<void> {
    console.log(`[VoteService] Executing proposal: ${proposal.id}`);

    try {
      proposal.status = 'executed' as ProposalStatus;
      proposal.executedAt = Date.now();
      proposal.executionResult = { success: true };
      
      await this.saveProposalToStorage(proposal);
      await this.removeFromActiveProposals(proposal.id);

      if (proposal.targetState) {
        await this.stateMachine.transition(proposal.targetState, 'system', {
          proposalId: proposal.id,
          triggeredBy: 'governance_auto_execute',
        });
      }

      this.emitEvent({
        type: 'proposal:executed',
        timestamp: Date.now(),
        data: { proposalId: proposal.id, status: 'executed', timestamp: Date.now() },
      } as ProposalStatusEvent);

    } catch (error) {
      console.error(`[VoteService] Execution failed:`, error);
      throw error;
    }
  }

  private async rejectProposal(proposal: Proposal): Promise<void> {
    proposal.status = 'rejected';
    proposal.updatedAt = Date.now();
    await this.saveProposalToStorage(proposal);
    await this.removeFromActiveProposals(proposal.id);

    this.emitEvent({
      type: 'proposal:rejected',
      timestamp: Date.now(),
      data: { proposalId: proposal.id, status: 'rejected', timestamp: Date.now() },
    } as ProposalStatusEvent);
  }

  async getVoteStats(proposalId: string): Promise<VoteStats> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const result = this.calculateResult(proposal);
    const timeRemaining = Math.max(0, proposal.expiresAt - Date.now());
    const votedRoles = proposal.votes.map(v => v.voter);
    const pendingRoles = VOTABLE_ROLES.filter(r => !votedRoles.includes(r));

    return {
      ...result,
      timeRemaining,
      votedRoles,
      pendingRoles,
      voteDetails: proposal.votes,
    };
  }

  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  getAllProposals(): Proposal[] {
    return Array.from(this.proposals.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getActiveProposals(): Proposal[] {
    return this.getAllProposals().filter(p => p.status === 'voting');
  }

  on(event: VoteEventType, handler: VoteEventHandler): () => void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.add(handler);
    }
    return () => {
      handlers?.delete(handler);
    };
  }

  private emitEvent(event: VoteEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[VoteService] Event handler error:`, error);
        }
      });
    }
  }

  private startExpirationCheck(): void {
    this.checkIntervalId = setInterval(() => {
      this.checkExpiredProposals();
    }, 30000);
  }

  private async checkExpiredProposals(): Promise<void> {
    const now = Date.now();
    for (const proposal of this.proposals.values()) {
      if (proposal.status === 'voting' && proposal.expiresAt <= now) {
        const result = this.calculateResult(proposal);
        if (result.shouldExecute) {
          await this.executeProposal(proposal);
        } else {
          proposal.status = 'expired';
          proposal.updatedAt = now;
          await this.saveProposalToStorage(proposal);
          await this.removeFromActiveProposals(proposal.id);
          
          this.emitEvent({
            type: 'proposal:expired',
            timestamp: now,
            data: { proposalId: proposal.id, status: 'expired', timestamp: now },
          } as ProposalStatusEvent);
        }
      }
    }
  }

  private async saveProposalToStorage(proposal: Proposal): Promise<void> {
    const key = `${PROPOSAL_KEY_PREFIX}${proposal.id}`;
    await tsa.set(key, proposal, { tier: 'STAGING' });
  }

  private async loadProposalsFromStorage(): Promise<void> {
    try {
      const activeIds = await tsa.get<string[]>(ACTIVE_PROPOSALS_KEY) || [];
      for (const id of activeIds) {
        const key = `${PROPOSAL_KEY_PREFIX}${id}`;
        const proposal = await tsa.get<Proposal>(key);
        if (proposal) {
          this.proposals.set(id, proposal);
        }
      }
    } catch (error) {
      console.error('[VoteService] Failed to load proposals:', error);
    }
  }

  private async addToActiveProposals(id: string): Promise<void> {
    const activeIds = await tsa.get<string[]>(ACTIVE_PROPOSALS_KEY) || [];
    if (!activeIds.includes(id)) {
      activeIds.push(id);
      await tsa.set(ACTIVE_PROPOSALS_KEY, activeIds, { tier: 'STAGING' });
    }
  }

  private async removeFromActiveProposals(id: string): Promise<void> {
    const activeIds = await tsa.get<string[]>(ACTIVE_PROPOSALS_KEY) || [];
    const index = activeIds.indexOf(id);
    if (index >= 0) {
      activeIds.splice(index, 1);
      await tsa.set(ACTIVE_PROPOSALS_KEY, activeIds, { tier: 'STAGING' });
    }
  }
}

export const voteService = new VoteService();
