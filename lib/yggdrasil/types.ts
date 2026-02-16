/**
 * YGGDRASIL 四象限系统 - 核心类型定义
 * HAJIMI-YGGDRASIL-001
 * 
 * 四象限架构:
 * - Regenerate: 状态重置 (RST)
 * - Branching: 并行提案 (BRH)  
 * - Rollback: 三重回滚 (RLB)
 * - Remix: 上下文重生 (RMX)
 */

import { PowerState, AgentRole } from '@/lib/types/state';

// ==================== 四象限Action类型 ====================

export type QuadrantAction = 'REGENERATE' | 'BRANCH' | 'ROLLBACK' | 'REMIX';

/**
 * 四象限操作定义 (STM-001)
 * 这些是元操作，不改变State Machine状态
 */
export interface QuadrantActionConfig {
  type: QuadrantAction;
  name: string;
  description: string;
  affectsStateMachine: boolean;
  affectsTransient: boolean;
  affectsStaging: boolean;
  affectsArchive: boolean;
}

export const QUADRANT_ACTIONS: Record<QuadrantAction, QuadrantActionConfig> = {
  REGENERATE: {
    type: 'REGENERATE',
    name: '状态重置',
    description: '清空Transient层，释放内存',
    affectsStateMachine: false,
    affectsTransient: true,
    affectsStaging: false,
    affectsArchive: false,
  },
  BRANCH: {
    type: 'BRANCH',
    name: '并行提案',
    description: '创建并行分支',
    affectsStateMachine: false, // 元操作，不直接影响状态
    affectsTransient: true,
    affectsStaging: true,
    affectsArchive: false,
  },
  ROLLBACK: {
    type: 'ROLLBACK',
    name: '三重回滚',
    description: '状态回溯',
    affectsStateMachine: true, // 回滚会改变状态
    affectsTransient: true,
    affectsStaging: true,
    affectsArchive: false,
  },
  REMIX: {
    type: 'REMIX',
    name: '上下文重生',
    description: '压缩上下文，生成Pattern',
    affectsStateMachine: false,
    affectsTransient: true,
    affectsStaging: false,
    affectsArchive: true, // Pattern存储在Archive
  },
};

// ==================== Regenerate 类型 (RST) ====================

export interface RegenerateRequest {
  sessionId: string;
  preserveKeys?: string[];      // 保留的键列表
  preserveAgentState?: boolean; // 是否保留Agent状态
}

export interface RegenerateResult {
  success: boolean;
  clearedKeys: number;
  releasedBytes: number;
  durationMs: number;
  preservedKeys: string[];
  timestamp: number;
}

// ==================== Branching 类型 (BRH) ====================

export interface Branch {
  id: string;
  name: string;
  sessionId: string;
  parentBranchId: string | null;
  agentId: string;
  createdAt: number;
  status: 'active' | 'merged' | 'abandoned';
  mergeVote?: MergeVote;
}

export interface CreateBranchRequest {
  sessionId: string;
  name: string;
  fromBranchId: string;
  agentId: string;
}

export interface MergeRequest {
  branchId: string;
  targetBranchId: string;
  requireVote: boolean;
}

export interface MergeVote {
  branchId: string;
  approvals: Map<AgentRole, boolean>;
  threshold: number; // 默认60%
  result: 'pending' | 'approved' | 'rejected';
}

export interface BranchingResult {
  success: boolean;
  branch?: Branch;
  error?: string;
}

// ==================== Rollback 类型 (RLB) ====================

export type RollbackType = 'soft' | 'hard' | 'governance';

export interface RollbackSnapshot {
  id: string;
  sessionId: string;
  state: PowerState;
  timestamp: number;
  transientKeys: string[];
  stagingData: Record<string, unknown>;
  checksum: string;
}

export interface SoftRollbackRequest {
  sessionId: string;
  snapshotId: string;
}

export interface HardRollbackRequest {
  sessionId: string;
  commitId: string;
}

export interface GovernanceRollbackRequest {
  sessionId: string;
  proposalId: string;
  targetState: PowerState;
}

export interface RollbackResult {
  success: boolean;
  type: RollbackType;
  previousState: PowerState;
  currentState: PowerState;
  durationMs: number;
  restoredKeys: number;
  error?: string;
}

// ==================== Remix 类型 (RMX) ====================

export type CompressionLevel = 1 | 2 | 3;

export interface RemixRequest {
  sessionId: string;
  workspaceId: string;
  compressionLevel: CompressionLevel;
  minSavingsRate?: number; // 默认60%
  preserveCodeBlocks?: boolean;
  preserveDecisions?: boolean;
}

export interface RemixContext {
  summary: string;
  keyDecisions: KeyDecision[];
  codeBlocks: CodeBlock[];
  techDebt: TechDebtItem[];
  originalTokenCount: number;
}

export interface KeyDecision {
  id: string;
  content: string;
  timestamp: number;
  agent: AgentRole;
  impact: 'high' | 'medium' | 'low';
}

export interface CodeBlock {
  id: string;
  language: string;
  content: string;
  filename?: string;
  lineCount: number;
}

export interface TechDebtItem {
  type: 'MOCK' | 'TODO' | 'HACK' | 'REFACTOR';
  note: string;
  priority: 'P0' | 'P1' | 'P2';
  filePath?: string;
}

/**
 * Remix生成的Pattern (FAB-001)
 * 命名格式: remix-{timestamp}-{hash}
 */
export interface RemixPattern {
  metadata: {
    id: string;
    name: string;
    type: 'remix';
    version: string;
    createdAt: string;
    originalTokens: number;
    compressedTokens: number;
    savingsRate: number;
    compressionLevel: CompressionLevel;
  };
  context: RemixContext;
  prompt: {
    template: string;
    variables: string[];
  };
}

export interface RemixResult {
  success: boolean;
  patternId: string;
  originalTokens: number;
  compressedTokens: number;
  savingsRate: number;
  compressionLevel: CompressionLevel;
  patternPath?: string;
  error?: string;
}

// ==================== 性能指标类型 ====================

export interface YggdrasilMetrics {
  regenerate: {
    totalOperations: number;
    averageDurationMs: number;
    totalBytesReleased: number;
    lastOperationAt?: number;
  };
  branching: {
    totalBranches: number;
    activeBranches: number;
    mergedBranches: number;
  };
  rollback: {
    totalRollbacks: number;
    averageDurationMs: number;
    successRate: number;
  };
  remix: {
    totalPatterns: number;
    averageSavingsRate: number;
    totalTokensSaved: number;
  };
}

// ==================== 错误类型 ====================

export type YggdrasilErrorCode =
  | 'INVALID_SESSION'
  | 'INVALID_BRANCH'
  | 'INVALID_SNAPSHOT'
  | 'INVALID_COMPRESSION_LEVEL'
  | 'TRANSIENT_CLEAR_FAILED'
  | 'BRANCH_CREATE_FAILED'
  | 'BRANCH_MERGE_FAILED'
  | 'ROLLBACK_FAILED'
  | 'REMIX_FAILED'
  | 'PATTERN_SAVE_FAILED'
  | 'INSUFFICIENT_SAVINGS'
  | 'VOTE_REQUIRED'
  | 'VOTE_REJECTED'
  | 'STATE_MACHINE_ERROR';

export interface YggdrasilError {
  code: YggdrasilErrorCode;
  message: string;
  action?: QuadrantAction;
  recoverable: boolean;
}

// ==================== UI相关类型 ====================

export interface QuadrantUIState {
  activeAction: QuadrantAction | null;
  pendingAction: QuadrantAction | null;
  showBranchPanel: boolean;
  showRollbackPanel: boolean;
  showRemixPanel: boolean;
  lastOperationResult?: {
    action: QuadrantAction;
    success: boolean;
    message: string;
  };
}
