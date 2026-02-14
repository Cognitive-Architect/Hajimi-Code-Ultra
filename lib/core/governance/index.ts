/**
 * B-02 治理引擎 - 提案系统
 * B-03 治理引擎 - 投票系统
 */

// 类型导出
export type {
  ProposalStatus,
  VoteType,
  VoteChoice,
  ProposalType,
  Vote,
  Proposal,
  CreateProposalRequest,
  ProposalFilter,
  VoteResult,
  VoteStats,
  ProposalListResponse,
  GovernanceConfig,
  VoteEventType,
  VoteEvent,
  VoteSubmittedEvent,
  ProposalStatusEvent,
  VoteEventHandler,
  CastVoteRequest,
  SubmitVoteRequest,
  ProposalCreateResult,
  ProposalVoteResult,
  SubmitVoteResponse,
  GetVoteStatsResponse,
  ListActiveProposalsResponse,
} from './types';

export {
  ROLE_WEIGHTS,
  VOTING_RULES,
  VOTABLE_ROLES,
  DEFAULT_GOVERNANCE_CONFIG,
  PermissionDeniedError,
  ValidationError,
  ProposalNotFoundError,
  VoteServiceError,
} from './types';

// ProposalService 导出
export { ProposalService, proposalService } from './proposal-service';

// VoteService 导出
export { VoteService, voteService } from './vote-service';
