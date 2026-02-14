/**
 * B-02 治理引擎 - 提案系统类型定义
 * B-03 治理引擎 - 投票系统类型定义
 */

import type { AgentRole, PowerState } from '@/lib/types/state';

export type { AgentRole, PowerState };

// ============================================================================
// 基础类型定义
// ============================================================================

export type ProposalStatus = 'pending' | 'voting' | 'approved' | 'rejected' | 'expired' | 'executed';

export type VoteType = 'approve' | 'reject' | 'abstain';

export type VoteChoice = VoteType;

export type ProposalType = 'state_transition' | 'config_change' | 'rule_change' | 'custom';

export interface Vote {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
  timestamp: number;
  weight?: number;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  targetState: PowerState;
  status: ProposalStatus;
  votes: Vote[];
  createdAt: number;
  expiresAt: number;
  updatedAt?: number;
  executedAt?: number;
  type?: ProposalType;
  executionResult?: { success: boolean; message?: string };
  context?: Record<string, unknown>;
}

export interface CreateProposalRequest {
  proposer: AgentRole;
  title: string;
  description: string;
  targetState: PowerState;
  type?: ProposalType;
  context?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ProposalFilter {
  status?: ProposalStatus[];
  proposer?: AgentRole;
  targetState?: PowerState;
  fromDate?: number;
  toDate?: number;
  includeExpired?: boolean;
}

export interface VoteResult {
  proposalId: string;
  totalVotes: number;
  totalWeight: number;
  approveWeight: number;
  rejectWeight: number;
  abstainWeight: number;
  approvalRate: number;
  rejectionRate: number;
  hasQuorum: boolean;
  hasApprovalThreshold: boolean;
  shouldExecute: boolean;
  shouldReject: boolean;
  status: ProposalStatus;
  votedRoles?: AgentRole[];
  pendingRoles?: AgentRole[];
}

export interface VoteStats extends VoteResult {
  timeRemaining: number;
  votedRoles: AgentRole[];
  pendingRoles: AgentRole[];
  voteDetails: Vote[];
}

export interface ProposalListResponse {
  proposals: Proposal[];
  total: number;
  page: number;
  pageSize: number;
  stats?: Record<string, number>;
}

export interface GovernanceConfig {
  proposalTimeoutMinutes: number;
  proposalTimeoutMs?: number;
  minVoters: number;
  minVotes?: number;
  minApproveRatio: number;
  checkIntervalMs: number;
  proposalCreators?: AgentRole[];
  allowedVoters?: AgentRole[];
}

// 角色权重
export const ROLE_WEIGHTS: Record<AgentRole, number> = {
  pm: 2,
  arch: 2,
  qa: 1,
  engineer: 1,
  mike: 1,
  system: 0,
};

// 投票规则
export const VOTING_RULES = {
  QUORUM: 3,
  APPROVAL_THRESHOLD: 0.6,
  TIMEOUT_MS: 30 * 60 * 1000,
};

// 可投票角色
export const VOTABLE_ROLES: AgentRole[] = ['pm', 'arch', 'qa', 'engineer', 'mike'];

// 默认配置
export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  proposalTimeoutMinutes: 30,
  proposalTimeoutMs: 30 * 60 * 1000,
  minVoters: 3,
  minVotes: 3,
  minApproveRatio: 0.6,
  checkIntervalMs: 30000,
  proposalCreators: ['pm'],
  allowedVoters: ['pm', 'arch', 'qa', 'engineer', 'mike'],
};

// 事件相关
export type VoteEventType = 'vote:submitted' | 'proposal:created' | 'proposal:approved' | 'proposal:rejected' | 'proposal:expired' | 'proposal:executed';

export interface VoteEvent {
  type: VoteEventType;
  timestamp: number;
  data: unknown;
}

export interface VoteSubmittedEvent extends VoteEvent {
  type: 'vote:submitted';
  data: {
    proposalId: string;
    voter: AgentRole;
    choice: VoteChoice;
  };
}

export interface ProposalStatusEvent extends VoteEvent {
  type: 'proposal:created' | 'proposal:approved' | 'proposal:rejected' | 'proposal:expired' | 'proposal:executed';
  data: {
    proposalId: string;
    status: ProposalStatus;
    timestamp: number;
  };
}

export type VoteEventHandler = (event: VoteEvent) => void;

// API 类型
export interface CastVoteRequest {
  proposalId: string;
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
}

export interface SubmitVoteRequest {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
}

export interface ProposalCreateResult {
  proposal: Proposal;
  success: boolean;
  message?: string;
}

export interface ProposalVoteResult {
  result: VoteResult;
  success: boolean;
  message?: string;
}

export interface SubmitVoteResponse {
  success: boolean;
  result?: VoteResult;
  error?: string;
}

export interface GetVoteStatsResponse {
  success: boolean;
  stats?: VoteStats;
  error?: string;
}

export interface ListActiveProposalsResponse {
  success: boolean;
  proposals?: Proposal[];
  total?: number;
  error?: string;
}

// 错误类
export class PermissionDeniedError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 403
  ) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class ValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ProposalNotFoundError extends Error {
  constructor(public proposalId: string) {
    super(`提案不存在: ${proposalId}`);
    this.name = 'ProposalNotFoundError';
  }
}

export class VoteServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'VoteServiceError';
  }
}
