/**
 * 治理引擎类型定义
 * 
 * 提案与投票系统
 * 
 * @module lib/governance/types
 * @version 1.3.0
 */

import { z } from 'zod';

// ========== 七权投票权重配置 ==========

export const VOTING_WEIGHTS = {
  PM: 0.25,        // Soyorin
  ARCHITECT: 0.20, // 黄瓜睦
  QA: 0.20,        // 咕咕嘎嘎
  ENGINEER: 0.15,  // 唐音
  AUDIT: 0.15,     // 压力怪
  ORCHESTRATOR: 0.05, // 客服小祥
} as const;

export type RoleWeight = keyof typeof VOTING_WEIGHTS;

// ========== 提案类型 ==========

export const ProposalTypeSchema = z.enum([
  'CODE_CHANGE',
  'ARCHITECTURE_DECISION',
  'DEPLOYMENT',
  'DEBT_REGRADE',
  'POLICY_CHANGE',
]);

export type ProposalType = z.infer<typeof ProposalTypeSchema>;

// ========== 提案Schema ==========

export const ProposalSchema = z.object({
  id: z.string(),
  type: ProposalTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  data: z.record(z.unknown()),
  proposer: z.object({
    id: z.string(),
    role: z.string(),
    name: z.string(),
  }),
  timestamp: z.number(),
  status: z.enum(['PENDING', 'VOTING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  votes: z.record(z.enum(['FOR', 'AGAINST', 'ABSTAIN'])),
  voteHistory: z.array(z.object({
    voterId: z.string(),
    vote: z.enum(['FOR', 'AGAINST', 'ABSTAIN']),
    timestamp: z.number(),
    weight: z.number(),
  })),
  expiresAt: z.number(),
  requiredApprovals: z.number().default(0.60), // 60%通过阈值
});

export type Proposal = z.infer<typeof ProposalSchema>;

// ========== 投票Schema ==========

export const VoteSchema = z.object({
  proposalId: z.string(),
  voterId: z.string(),
  voterRole: z.string(),
  vote: z.enum(['FOR', 'AGAINST', 'ABSTAIN']),
  timestamp: z.number(),
  comment: z.string().optional(),
});

export type Vote = z.infer<typeof VoteSchema>;

// ========== 投票结果 ==========

export interface VoteResult {
  proposalId: string;
  totalVotes: number;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  forPercentage: number;
  againstPercentage: number;
  weightedFor: number;
  weightedAgainst: number;
  status: 'PENDING' | 'PASSED' | 'REJECTED' | 'BLOCKED';
  auditVeto: boolean;
  timestamp: number;
}

// ========== 提案存储 ==========

export interface ProposalStorage {
  proposals: Map<string, Proposal>;
  history: Proposal[];
  
  save(proposal: Proposal): void;
  get(id: string): Proposal | undefined;
  getAll(): Proposal[];
  getHistory(): Proposal[];
}

// ========== 链式存储（防篡改） ==========

export interface ChainBlock {
  index: number;
  timestamp: number;
  proposal: Proposal;
  previousHash: string;
  hash: string;
}

export interface ChainStorage {
  blocks: ChainBlock[];
  
  addBlock(proposal: Proposal): ChainBlock;
  verifyChain(): boolean;
  getHistory(): ChainBlock[];
}
