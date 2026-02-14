# 第3章 治理引擎-投票系统（B-03）

> **工单编号**: B-03/09  
> **任务目标**: 实现投票提交、阈值计算、自动执行  
> **输入基线**: 白皮书第7章投票规则 + fix.md Task 3  
> **预计工期**: 2天

---

## 3.1 VoteService类设计

### 3.1.1 类结构概览

```typescript
// lib/core/governance/vote-service.ts

import { TSA } from '@/lib/tsa';
import { ProposalService } from './proposal-service';
import { StateMachine } from '@/lib/core/state/machine';
import { 
  Vote, 
  VoteChoice, 
  VoteResult, 
  VoteStats, 
  Proposal, 
  ProposalStatus,
  AgentRole 
} from '@/lib/types/governance';

/**
 * 投票服务
 * 负责投票提交、统计计算、自动执行
 */
export class VoteService {
  private tsa: TSA;
  private proposalService: ProposalService;
  private stateMachine: StateMachine;
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    tsa: TSA, 
    proposalService: ProposalService,
    stateMachine: StateMachine
  ) {
    this.tsa = tsa;
    this.proposalService = proposalService;
    this.stateMachine = stateMachine;
  }

  // ═══════════════════════════════════════════════════════════════
  // 核心方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 提交投票
   * @param proposalId - 提案ID
   * @param voter - 投票者角色
   * @param choice - 投票选择 (approve/reject/abstain)
   * @param reason - 投票理由（可选）
   * @returns 投票结果
   */
  async vote(
    proposalId: string,
    voter: AgentRole,
    choice: VoteChoice,
    reason?: string
  ): Promise<VoteResult>;

  /**
   * 计算投票结果
   * @param proposal - 提案对象
   * @returns 投票统计结果
   */
  private calculateResult(proposal: Proposal): VoteResult;

  /**
   * 自动执行通过提案
   * @param proposal - 已通过的提案
   */
  private async autoExecute(proposal: Proposal): Promise<void>;

  /**
   * 获取投票统计
   * @param proposalId - 提案ID
   * @returns 投票统计数据
   */
  async getVoteStats(proposalId: string): Promise<VoteStats>;

  /**
   * 检查并处理超时提案
   */
  private async checkTimeout(proposalId: string): Promise<void>;
}
```

### 3.1.2 完整实现代码

```typescript
// lib/core/governance/vote-service.ts

import { TSA } from '@/lib/tsa';
import { ProposalService } from './proposal-service';
import { StateMachine } from '@/lib/core/state/machine';
import { VotingRules } from '@/config/governance/rules';
import { 
  Vote, 
  VoteChoice, 
  VoteResult, 
  VoteStats, 
  Proposal, 
  ProposalStatus,
  AgentRole,
  VoteRecord
} from '@/lib/types/governance';

// 七权角色权重配置
const ROLE_WEIGHTS: Record<AgentRole, number> = {
  'pm': 2,        // 产品经理 - 权重2
  'arch': 2,      // 架构师 - 权重2
  'qa': 1,        // 测试工程师 - 权重1
  'engineer': 1,  // 开发工程师 - 权重1
  'mike': 1,      // 产品经理助理 - 权重1
};

// 投票规则配置
const VOTING_CONFIG = {
  QUORUM: 3,                    // 最低投票人数
  APPROVAL_THRESHOLD: 0.6,      // 通过阈值 60%
  TIMEOUT_MS: 30 * 60 * 1000,   // 30分钟超时
};

/**
 * 投票服务实现
 */
export class VoteService {
  private tsa: TSA;
  private proposalService: ProposalService;
  private stateMachine: StateMachine;
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    tsa: TSA, 
    proposalService: ProposalService,
    stateMachine: StateMachine
  ) {
    this.tsa = tsa;
    this.proposalService = proposalService;
    this.stateMachine = stateMachine;
  }

  /**
   * 提交投票
   * GOV-004: 投票提交并正确统计
   */
  async vote(
    proposalId: string,
    voter: AgentRole,
    choice: VoteChoice,
    reason?: string
  ): Promise<VoteResult> {
    // 1. 获取提案
    const proposal = await this.proposalService.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    // 2. 验证提案状态
    if (proposal.status !== 'voting') {
      throw new Error(`Proposal is not in voting status: ${proposal.status}`);
    }

    // 3. 验证是否已投票
    const existingVote = proposal.votes.find(v => v.voter === voter);
    if (existingVote) {
      throw new Error(`Agent ${voter} has already voted on this proposal`);
    }

    // 4. 创建投票记录
    const voteRecord: VoteRecord = {
      voter,
      choice,
      reason,
      timestamp: Date.now(),
      weight: ROLE_WEIGHTS[voter],
    };

    // 5. 更新提案投票列表
    proposal.votes.push(voteRecord);
    await this.tsa.set(
      `governance:proposal:${proposalId}`,
      proposal,
      { tier: StorageTier.STAGING }
    );

    // 6. 计算投票结果
    const result = this.calculateResult(proposal);

    // 7. 检查是否达到阈值
    if (result.shouldExecute) {
      await this.autoExecute(proposal);
    }

    return result;
  }

  /**
   * 计算投票结果
   * 使用加权投票算法
   */
  private calculateResult(proposal: Proposal): VoteResult {
    const votes = proposal.votes;
    
    // 计算加权票数
    let totalWeight = 0;
    let approveWeight = 0;
    let rejectWeight = 0;
    let abstainWeight = 0;

    for (const vote of votes) {
      const weight = ROLE_WEIGHTS[vote.voter];
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

    // 计算通过比例
    const approvalRate = totalWeight > 0 ? approveWeight / totalWeight : 0;
    const rejectionRate = totalWeight > 0 ? rejectWeight / totalWeight : 0;

    // 判断是否达到执行条件
    // 条件1: 达到最低投票人数
    const hasQuorum = votes.length >= VOTING_CONFIG.QUORUM;
    // 条件2: 通过率达到60%
    const hasApprovalThreshold = approvalRate >= VOTING_CONFIG.APPROVAL_THRESHOLD;
    // 条件3: 拒绝率未达到60%（防止提前结束）
    const notRejected = rejectionRate < VOTING_CONFIG.APPROVAL_THRESHOLD;

    const shouldExecute = hasQuorum && hasApprovalThreshold && notRejected;
    const shouldReject = hasQuorum && rejectionRate >= VOTING_CONFIG.APPROVAL_THRESHOLD;

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

  /**
   * 自动执行通过提案
   * GOV-005: 60%阈值自动通过并执行状态流转
   */
  private async autoExecute(proposal: Proposal): Promise<void> {
    console.log(`[VoteService] Auto-executing proposal: ${proposal.id}`);

    try {
      // 1. 更新提案状态为 approved
      proposal.status = 'approved';
      proposal.executedAt = Date.now();
      
      await this.tsa.set(
        `governance:proposal:${proposal.id}`,
        proposal,
        { tier: StorageTier.STAGING }
      );

      // 2. 触发状态流转
      if (proposal.targetState) {
        await this.stateMachine.transition(proposal.targetState, {
          proposalId: proposal.id,
          triggeredBy: 'governance_auto_execute',
        });
        
        console.log(`[VoteService] State transitioned to: ${proposal.targetState}`);
      }

      // 3. 清除超时定时器
      this.clearTimeoutTimer(proposal.id);

      // 4. 发送通知（通过事件总线）
      this.emitVoteEvent('proposal_executed', {
        proposalId: proposal.id,
        targetState: proposal.targetState,
        executedAt: proposal.executedAt,
      });

    } catch (error) {
      console.error(`[VoteService] Auto-execution failed:`, error);
      throw error;
    }
  }

  /**
   * 获取投票统计
   */
  async getVoteStats(proposalId: string): Promise<VoteStats> {
    const proposal = await this.proposalService.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const result = this.calculateResult(proposal);
    
    // 计算剩余时间
    const timeRemaining = Math.max(0, proposal.expiresAt - Date.now());
    
    // 获取已投票角色列表
    const votedRoles = proposal.votes.map(v => v.voter);
    
    // 获取未投票角色列表
    const allRoles = Object.keys(ROLE_WEIGHTS) as AgentRole[];
    const pendingRoles = allRoles.filter(r => !votedRoles.includes(r));

    return {
      proposalId,
      status: proposal.status,
      ...result,
      timeRemaining,
      votedRoles,
      pendingRoles,
      voteDetails: proposal.votes,
    };
  }

  /**
   * 启动提案超时监控
   * GOV-006: 30分钟超时自动关闭
   */
  startTimeoutMonitor(proposalId: string, expiresAt: number): void {
    const delay = expiresAt - Date.now();
    
    if (delay <= 0) {
      // 已过期，立即处理
      this.handleTimeout(proposalId);
      return;
    }

    // 设置超时定时器
    const timer = setTimeout(() => {
      this.handleTimeout(proposalId);
    }, delay);

    this.timeoutTimers.set(proposalId, timer);
    console.log(`[VoteService] Timeout monitor started for proposal: ${proposalId}, expires in ${delay}ms`);
  }

  /**
   * 处理提案超时
   */
  private async handleTimeout(proposalId: string): Promise<void> {
    console.log(`[VoteService] Proposal timeout: ${proposalId}`);

    const proposal = await this.proposalService.getProposal(proposalId);
    if (!proposal || proposal.status !== 'voting') {
      return; // 提案不存在或已处理
    }

    // 计算当前结果
    const result = this.calculateResult(proposal);

    // 根据结果决定状态
    if (result.shouldExecute) {
      // 达到通过条件，执行
      await this.autoExecute(proposal);
    } else {
      // 未达到条件，标记为过期
      proposal.status = 'expired';
      proposal.expiredAt = Date.now();
      
      await this.tsa.set(
        `governance:proposal:${proposalId}`,
        proposal,
        { tier: StorageTier.STAGING }
      );

      this.emitVoteEvent('proposal_expired', {
        proposalId,
        expiredAt: proposal.expiredAt,
        finalStats: result,
      });
    }

    this.clearTimeoutTimer(proposalId);
  }

  /**
   * 清除超时定时器
   */
  private clearTimeoutTimer(proposalId: string): void {
    const timer = this.timeoutTimers.get(proposalId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(proposalId);
    }
  }

  /**
   * 发送投票事件
   */
  private emitVoteEvent(event: string, data: unknown): void {
    // 通过全局事件总线发送
    if (typeof window !== 'undefined' && window.EventBus) {
      window.EventBus.emit(`governance:${event}`, data);
    }
  }

  /**
   * 清理所有定时器（用于测试或关闭）
   */
  cleanup(): void {
    for (const [proposalId, timer] of this.timeoutTimers) {
      clearTimeout(timer);
      console.log(`[VoteService] Cleaned up timer for proposal: ${proposalId}`);
    }
    this.timeoutTimers.clear();
  }
}

// 导出单例工厂函数
export function createVoteService(
  tsa: TSA,
  proposalService: ProposalService,
  stateMachine: StateMachine
): VoteService {
  return new VoteService(tsa, proposalService, stateMachine);
}
```

---

## 3.2 七权权重配置

### 3.2.1 权重配置文件

```yaml
# config/governance/voting-rules.yaml

voting_rules:
  # 最低投票人数（法定人数）
  quorum: 3
  
  # 通过阈值（60%）
  approval_threshold: 0.6
  
  # 超时时间（30分钟 = 1800000毫秒）
  timeout_ms: 1800000
  
  # 各角色投票权重
  weights:
    pm: 2        # 产品经理 - 权重2（决策权重）
    arch: 2      # 架构师 - 权重2（技术决策）
    qa: 1        # 测试工程师 - 权重1
    engineer: 1  # 开发工程师 - 权重1
    mike: 1      # 产品经理助理 - 权重1
  
  # 角色说明
  roles:
    pm:
      name: "产品经理"
      description: "产品方向决策"
      can_create_proposal: true
    arch:
      name: "架构师"
      description: "技术架构决策"
      can_create_proposal: true
    qa:
      name: "测试工程师"
      description: "质量保障决策"
      can_create_proposal: false
    engineer:
      name: "开发工程师"
      description: "实现方案决策"
      can_create_proposal: false
    mike:
      name: "产品助理"
      description: "辅助决策"
      can_create_proposal: false
```

### 3.2.2 TypeScript配置类型

```typescript
// lib/types/governance.ts

/**
 * 七权角色类型
 */
export type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';

/**
 * 投票选择
 */
export type VoteChoice = 'approve' | 'reject' | 'abstain';

/**
 * 投票记录
 */
export interface VoteRecord {
  voter: AgentRole;
  choice: VoteChoice;
  reason?: string;
  timestamp: number;
  weight: number;
}

/**
 * 提案状态
 */
export type ProposalStatus = 
  | 'pending'     // 待审核
  | 'voting'      // 投票中
  | 'approved'    // 已通过
  | 'rejected'    // 已拒绝
  | 'expired';    // 已过期

/**
 * 提案
 */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  targetState?: string;
  status: ProposalStatus;
  votes: VoteRecord[];
  createdAt: number;
  expiresAt: number;
  executedAt?: number;
  expiredAt?: number;
}

/**
 * 投票结果
 */
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
}

/**
 * 投票统计
 */
export interface VoteStats extends VoteResult {
  timeRemaining: number;
  votedRoles: AgentRole[];
  pendingRoles: AgentRole[];
  voteDetails: VoteRecord[];
}

/**
 * 投票规则配置
 */
export interface VotingRules {
  quorum: number;
  approvalThreshold: number;
  timeoutMs: number;
  weights: Record<AgentRole, number>;
}
```

### 3.2.3 权重计算示例

```
═══════════════════════════════════════════════════════════════
                    七权投票权重计算示例
═══════════════════════════════════════════════════════════════

场景: 5人全部投票，PM和Arch投approve

投票情况:
┌────────────┬─────────┬──────────┐
│   角色      │  权重   │  投票    │
├────────────┼─────────┼──────────┤
│ PM         │    2    │ approve  │
│ Arch       │    2    │ approve  │
│ QA         │    1    │ reject   │
│ Engineer   │    1    │ abstain  │
│ Mike       │    1    │ approve  │
└────────────┴─────────┴──────────┘

计算:
  总权重 = 2 + 2 + 1 + 1 + 1 = 7
  通过权重 = 2 + 2 + 1 = 5
  拒绝权重 = 1
  弃权权重 = 1
  
  通过率 = 5 / 7 ≈ 71.4% > 60% ✓
  投票人数 = 5 >= 3 ✓
  
结果: 达到阈值，自动执行状态流转

═══════════════════════════════════════════════════════════════

场景: 3人投票，仅Engineer和Mike投approve

投票情况:
┌────────────┬─────────┬──────────┐
│   角色      │  权重   │  投票    │
├────────────┼─────────┼──────────┤
│ PM         │    2    │ -        │
│ Arch       │    2    │ -        │
│ QA         │    1    │ reject   │
│ Engineer   │    1    │ approve  │
│ Mike       │    1    │ approve  │
└────────────┴─────────┴──────────┘

计算:
  总权重 = 1 + 1 + 1 = 3
  通过权重 = 1 + 1 = 2
  拒绝权重 = 1
  
  通过率 = 2 / 3 ≈ 66.7% > 60% ✓
  投票人数 = 3 >= 3 ✓
  
结果: 达到阈值，自动执行状态流转

═══════════════════════════════════════════════════════════════
```

---

## 3.3 API路由实现

### 3.3.1 投票API路由

```typescript
// app/api/v1/governance/vote/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { voteService } from '@/lib/core/governance';
import { withAuth, requireRole } from '@/lib/api/auth';
import { handleAPIError, APIError } from '@/lib/api/error-handler';

// 请求体验证Schema
const VoteRequestSchema = z.object({
  proposalId: z.string().uuid(),
  choice: z.enum(['approve', 'reject', 'abstain']),
  reason: z.string().max(500).optional(),
});

type VoteRequest = z.infer<typeof VoteRequestSchema>;

/**
 * POST /api/v1/governance/vote
 * 提交投票
 * 
 * 请求体:
 * {
 *   "proposalId": "uuid-string",
 *   "choice": "approve" | "reject" | "abstain",
 *   "reason": "optional reason"
 * }
 * 
 * 响应:
 * {
 *   "success": true,
 *   "data": {
 *     "proposalId": "uuid-string",
 *     "status": "voting" | "approved" | "rejected",
 *     "totalVotes": 3,
 *     "approvalRate": 0.71,
 *     "shouldExecute": true
 *   }
 * }
 */
export const POST = withAuth(
  requireRole(['pm', 'arch', 'qa', 'engineer', 'mike']),
  async (request: NextRequest, context: AuthContext): Promise<NextResponse> => {
    try {
      // 1. 解析请求体
      const body = await request.json();
      
      // 2. 验证请求数据
      const validation = VoteRequestSchema.safeParse(body);
      if (!validation.success) {
        throw new APIError(
          'VALIDATION_ERROR',
          `Invalid request: ${validation.error.message}`,
          400
        );
      }

      const { proposalId, choice, reason } = validation.data;

      // 3. 提交投票
      const result = await voteService.vote(
        proposalId,
        context.agentRole,
        choice,
        reason
      );

      // 4. 返回结果
      return NextResponse.json({
        success: true,
        data: {
          proposalId: result.proposalId,
          status: result.status,
          totalVotes: result.totalVotes,
          totalWeight: result.totalWeight,
          approveWeight: result.approveWeight,
          rejectWeight: result.rejectWeight,
          approvalRate: result.approvalRate,
          rejectionRate: result.rejectionRate,
          hasQuorum: result.hasQuorum,
          hasApprovalThreshold: result.hasApprovalThreshold,
          shouldExecute: result.shouldExecute,
          votedBy: context.agentRole,
          votedAt: Date.now(),
        },
      }, { status: 200 });

    } catch (error) {
      return handleAPIError(error);
    }
  }
);

/**
 * GET /api/v1/governance/vote?proposalId=xxx
 * 获取投票统计
 */
export const GET = withAuth(
  async (request: NextRequest): Promise<NextResponse> => {
    try {
      const { searchParams } = new URL(request.url);
      const proposalId = searchParams.get('proposalId');

      if (!proposalId) {
        throw new APIError(
          'MISSING_PARAMETER',
          'proposalId is required',
          400
        );
      }

      const stats = await voteService.getVoteStats(proposalId);

      return NextResponse.json({
        success: true,
        data: stats,
      });

    } catch (error) {
      return handleAPIError(error);
    }
  }
);
```

### 3.3.2 路由索引导出

```typescript
// app/api/v1/governance/route.ts

import { NextResponse } from 'next/server';

/**
 * GET /api/v1/governance
 * 治理引擎信息
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    data: {
      version: '1.0.0',
      endpoints: [
        { path: '/api/v1/governance/proposals', methods: ['GET', 'POST'] },
        { path: '/api/v1/governance/vote', methods: ['GET', 'POST'] },
        { path: '/api/v1/governance/rules', methods: ['GET'] },
      ],
      votingRules: {
        quorum: 3,
        approvalThreshold: '60%',
        timeout: '30 minutes',
        weights: {
          pm: 2,
          arch: 2,
          qa: 1,
          engineer: 1,
          mike: 1,
        },
      },
    },
  });
}
```

### 3.3.3 API错误处理

```typescript
// lib/api/error-handler.ts

import { NextResponse } from 'next/server';

/**
 * API错误类
 */
export class APIError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * 统一错误处理
 */
export function handleAPIError(error: unknown): NextResponse {
  // 已知API错误
  if (error instanceof APIError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.statusCode }
    );
  }

  // Zod验证错误
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }

  // 治理引擎错误
  if (error instanceof Error) {
    if (error.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        },
        { status: 404 }
      );
    }

    if (error.message.includes('already voted')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_VOTED',
            message: error.message,
          },
        },
        { status: 409 }
      );
    }

    if (error.message.includes('not in voting status')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: error.message,
          },
        },
        { status: 400 }
      );
    }
  }

  // 未知错误
  console.error('[API Error]', error);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    { status: 500 }
  );
}
```

---

## 3.4 自动执行机制

### 3.4.1 执行流程图

```
┌─────────────────────────────────────────────────────────────────┐
                     投票自动执行流程
├─────────────────────────────────────────────────────────────────┤

  ┌──────────┐
  │ 提交投票  │
  └────┬─────┘
       │
       ▼
  ┌──────────────────┐
  │ 1. 验证投票有效性 │
  │    - 提案存在    │
  │    - 状态为voting│
  │    - 未重复投票  │
  └────┬─────────────┘
       │
       ▼
  ┌──────────────────┐
  │ 2. 记录投票      │
  │    - 存储到TSA   │
  └────┬─────────────┘
       │
       ▼
  ┌──────────────────┐
  │ 3. 计算投票结果   │
  │    - 加权统计    │
  │    - 计算通过率  │
  └────┬─────────────┘
       │
       ▼
  ┌──────────────────────┐     否     ┌──────────────┐
  │ 4. 检查是否达到阈值?  │───────────▶│ 返回投票结果  │
  │    - 人数 >= 3       │            │ status: voting│
  │    - 通过率 >= 60%   │            └──────────────┘
  └────┬─────────────────┘
       │ 是
       ▼
  ┌──────────────────┐
  │ 5. 自动执行提案   │
  │    - 更新状态    │
  │    - 触发状态流转│
  └────┬─────────────┘
       │
       ▼
  ┌──────────────────┐
  │ 6. 发送通知      │
  │    - 事件总线    │
  │    - UI更新      │
  └────┬─────────────┘
       │
       ▼
  ┌──────────────┐
  │ 返回执行结果  │
  │ status: approved│
  └──────────────┘

┌─────────────────────────────────────────────────────────────────┐
                     超时处理流程
├─────────────────────────────────────────────────────────────────┤

  提案创建
     │
     ▼
  启动30分钟定时器
     │
     │◄──────────────────────────────┐
     │                               │
     ▼                               │
  等待投票...                        │
     │                               │
     │    收到投票                   │
     │◄──────────────────────────────┘
     │
     │    30分钟超时
     ▼
  ┌──────────────────────┐
  │ 检查当前投票结果      │
  └────┬─────────────────┘
       │
       ▼
  ┌──────────────────────┐     否     ┌──────────────┐
  │ 是否达到通过阈值?     │───────────▶│ 标记为expired│
  └────┬─────────────────┘            └──────────────┘
       │ 是
       ▼
  ┌──────────────────┐
  │ 执行提案         │
  │ 标记为approved   │
  └──────────────────┘

└─────────────────────────────────────────────────────────────────┘
```

### 3.4.2 状态流转触发

```typescript
// lib/core/state/machine.ts (相关片段)

/**
 * 状态机 - 治理触发流转
 */
export class StateMachine {
  
  /**
   * 由治理引擎触发的状态流转
   */
  async transitionFromGovernance(
    targetState: PowerState,
    context: {
      proposalId: string;
      votes: VoteRecord[];
      approvalRate: number;
    }
  ): Promise<StateTransition> {
    console.log(`[StateMachine] Governance transition to: ${targetState}`);

    // 1. 验证流转合法性
    if (!this.canTransition(targetState)) {
      throw new Error(
        `Invalid transition from ${this.currentState} to ${targetState}`
      );
    }

    // 2. 记录治理上下文
    const transition: StateTransition = {
      from: this.currentState,
      to: targetState,
      timestamp: Date.now(),
      triggeredBy: 'governance',
      context: {
        proposalId: context.proposalId,
        voteCount: context.votes.length,
        approvalRate: context.approvalRate,
      },
    };

    // 3. 执行流转
    this.currentState = targetState;
    this.history.push(transition);

    // 4. 通知监听器
    this.notifyListeners(transition);

    // 5. 持久化状态
    await this.persistState();

    return transition;
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): PowerState {
    return this.currentState;
  }

  /**
   * 获取流转历史
   */
  getHistory(): StateTransition[] {
    return [...this.history];
  }
}
```

### 3.4.3 事件通知机制

```typescript
// lib/core/governance/event-emitter.ts

/**
 * 治理事件类型
 */
export type GovernanceEvent = 
  | 'proposal_created'
  | 'proposal_voting'
  | 'proposal_voted'
  | 'proposal_approved'
  | 'proposal_rejected'
  | 'proposal_expired'
  | 'proposal_executed'
  | 'state_transitioned';

/**
 * 治理事件发射器
 */
export class GovernanceEventEmitter {
  private listeners: Map<GovernanceEvent, Set<(data: unknown) => void>> = new Map();

  /**
   * 订阅事件
   */
  on(event: GovernanceEvent, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * 发射事件
   */
  emit(event: GovernanceEvent, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (error) {
          console.error(`[GovernanceEvent] Error in listener:`, error);
        }
      });
    }
  }

  /**
   * 只监听一次
   */
  once(event: GovernanceEvent, callback: (data: unknown) => void): void {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });
  }
}

// 导出单例
export const governanceEvents = new GovernanceEventEmitter();
```

---

## 3.5 自测点（必须包含验证命令）

### 3.5.1 自测点清单

| 自测ID | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|------|
| GOV-004 | `curl -X POST http://localhost:3000/api/v1/governance/vote -H "Content-Type: application/json" -d '{"proposalId":"test-proposal-001","choice":"approve"}'` | 投票提交成功，返回200，包含投票统计 | 🔴 |
| GOV-005 | 连续发送4个approve投票（PM+Arch+2其他） | 60%阈值自动通过，状态变为approved，触发状态流转 | 🔴 |
| GOV-006 | 创建提案后等待30分钟不投票 | 超时自动关闭，状态变为expired | 🔴 |

### 3.5.2 GOV-004: 投票提交并正确统计

```bash
# ═══════════════════════════════════════════════════════════════
# GOV-004: 投票提交并正确统计
# ═══════════════════════════════════════════════════════════════

# Step 1: 先创建一个测试提案（如果还没有）
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "title": "测试提案-GOV004",
    "description": "用于测试投票提交功能",
    "targetState": "DESIGN"
  }'

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "id": "test-proposal-001",
#     "status": "voting",
#     "expiresAt": 1234567890
#   }
# }

# Step 2: 提交投票
curl -X POST http://localhost:3000/api/v1/governance/vote \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "proposalId": "test-proposal-001",
    "choice": "approve",
    "reason": "同意此提案"
  }'

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "proposalId": "test-proposal-001",
#     "status": "voting",
#     "totalVotes": 1,
#     "totalWeight": 2,
#     "approveWeight": 2,
#     "approvalRate": 1.0,
#     "hasQuorum": false,
#     "hasApprovalThreshold": true,
#     "shouldExecute": false,
#     "votedBy": "pm",
#     "votedAt": 1234567890
#   }
# }

# Step 3: 验证投票统计
curl "http://localhost:3000/api/v1/governance/vote?proposalId=test-proposal-001" \
  -H "X-Agent-Role: pm"

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "proposalId": "test-proposal-001",
#     "status": "voting",
#     "totalVotes": 1,
#     "votedRoles": ["pm"],
#     "pendingRoles": ["arch", "qa", "engineer", "mike"],
#     "voteDetails": [{
#       "voter": "pm",
#       "choice": "approve",
#       "weight": 2,
#       "timestamp": 1234567890
#     }]
#   }
# }

# ═══════════════════════════════════════════════════════════════
# GOV-004 通过标准:
# ✓ 投票提交返回200状态码
# ✓ 响应包含正确的投票统计
# ✓ votedRoles包含pm
# ✓ pendingRoles不包含pm
# ✓ voteDetails包含投票记录
# ═══════════════════════════════════════════════════════════════
```

### 3.5.3 GOV-005: 60%阈值自动通过并执行状态流转

```bash
# ═══════════════════════════════════════════════════════════════
# GOV-005: 60%阈值自动通过并执行状态流转
# ═══════════════════════════════════════════════════════════════

# 前置条件: 已创建提案 test-proposal-002

# Step 1: PM投票 (权重2)
curl -X POST http://localhost:3000/api/v1/governance/vote \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "proposalId": "test-proposal-002",
    "choice": "approve"
  }'

# Step 2: Arch投票 (权重2)
curl -X POST http://localhost:3000/api/v1/governance/vote \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: arch" \
  -d '{
    "proposalId": "test-proposal-002",
    "choice": "approve"
  }'

# Step 3: QA投票 (权重1) - 此时总权重5，通过权重5，通过率100%
curl -X POST http://localhost:3000/api/v1/governance/vote \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: qa" \
  -d '{
    "proposalId": "test-proposal-002",
    "choice": "approve"
  }'

# 预期响应 (达到阈值，自动执行):
# {
#   "success": true,
#   "data": {
#     "proposalId": "test-proposal-002",
#     "status": "approved",
#     "totalVotes": 3,
#     "totalWeight": 5,
#     "approveWeight": 5,
#     "approvalRate": 1.0,
#     "hasQuorum": true,
#     "hasApprovalThreshold": true,
#     "shouldExecute": true,
#     "executedAt": 1234567890
#   }
# }

# Step 4: 验证提案状态
curl "http://localhost:3000/api/v1/governance/proposals/test-proposal-002" \
  -H "X-Agent-Role: pm"

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "id": "test-proposal-002",
#     "status": "approved",
#     "executedAt": 1234567890,
#     "stateTransition": {
#       "from": "IDLE",
#       "to": "DESIGN"
#     }
#   }
# }

# Step 5: 验证状态机状态
curl http://localhost:3000/api/v1/state/current

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "state": "DESIGN",
#     "lastTransition": {
#       "from": "IDLE",
#       "to": "DESIGN",
#       "triggeredBy": "governance_auto_execute"
#     }
#   }
# }

# ═══════════════════════════════════════════════════════════════
# GOV-005 通过标准:
# ✓ 第3票提交后status变为approved
# ✓ shouldExecute为true
# ✓ 状态机状态流转到目标状态
# ✓ lastTransition.triggeredBy为governance_auto_execute
# ═══════════════════════════════════════════════════════════════
```

### 3.5.4 GOV-006: 30分钟超时自动关闭

```bash
# ═══════════════════════════════════════════════════════════════
# GOV-006: 30分钟超时自动关闭
# ═══════════════════════════════════════════════════════════════

# 方法1: 实际等待30分钟（生产环境）
# Step 1: 创建提案
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "title": "超时测试提案",
    "description": "用于测试超时自动关闭",
    "targetState": "DESIGN"
  }'

# Step 2: 等待30分钟后检查
echo "等待30分钟..."
sleep 1800  # 30分钟 = 1800秒

# Step 3: 验证提案已过期
curl "http://localhost:3000/api/v1/governance/proposals/timeout-test-001"

# 预期响应:
# {
#   "success": true,
#   "data": {
#     "id": "timeout-test-001",
#     "status": "expired",
#     "expiredAt": 1234567890
#   }
# }

# ═══════════════════════════════════════════════════════════════
# 方法2: 使用测试模式缩短超时时间（开发/测试环境）
# ═══════════════════════════════════════════════════════════════

# 设置环境变量缩短超时时间为5秒
export GOVERNANCE_TIMEOUT_MS=5000

# 创建提案并快速检查
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "title": "快速超时测试",
    "description": "5秒后自动过期",
    "targetState": "DESIGN"
  }'

echo "等待5秒..."
sleep 5

# 检查提案状态
curl "http://localhost:3000/api/v1/governance/proposals/quick-timeout-001"

# ═══════════════════════════════════════════════════════════════
# GOV-006 通过标准:
# ✓ 30分钟后提案状态变为expired
# ✓ expiredAt字段有值
# ✓ 未执行的提案不会触发状态流转
# ═══════════════════════════════════════════════════════════════
```

### 3.5.5 自动化测试脚本

```bash
#!/bin/bash
# tests/e2e/governance-vote.test.sh
# 治理投票系统E2E测试脚本

set -e

BASE_URL="http://localhost:3000"
PROPOSAL_ID=""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           治理引擎投票系统 E2E 测试                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 辅助函数
check_response() {
  if echo "$1" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "Response: $1"
    ((TESTS_FAILED++))
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════
# GOV-004: 投票提交并正确统计
# ═══════════════════════════════════════════════════════════════
echo ""
echo "【GOV-004】投票提交并正确统计"
echo "───────────────────────────────────────────────────────────────"

# 创建测试提案
echo "Step 1: 创建测试提案..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/governance/proposals" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "title": "GOV-004测试提案",
    "description": "测试投票提交功能",
    "targetState": "DESIGN"
  }')
PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Created proposal: $PROPOSAL_ID"
check_response "$RESPONSE"

# 提交投票
echo "Step 2: PM提交投票..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/governance/vote" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d "{\"
    proposalId\": \"$PROPOSAL_ID\",\"
    choice\": \"approve\",\"
    reason\": \"测试投票\"\"
  }")
check_response "$RESPONSE"

# 验证统计
echo "Step 3: 验证投票统计..."
RESPONSE=$(curl -s "$BASE_URL/api/v1/governance/vote?proposalId=$PROPOSAL_ID" \
  -H "X-Agent-Role: pm")
check_response "$RESPONSE"

# ═══════════════════════════════════════════════════════════════
# GOV-005: 60%阈值自动通过
# ═══════════════════════════════════════════════════════════════
echo ""
echo "【GOV-005】60%阈值自动通过并执行状态流转"
echo "───────────────────────────────────────────────────────────────"

# 创建新提案
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/governance/proposals" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d '{
    "title": "GOV-005测试提案",
    "description": "测试自动通过功能",
    "targetState": "DESIGN"
  }')
PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Created proposal: $PROPOSAL_ID"

# 记录当前状态
echo "Step 1: 记录当前状态..."
BEFORE_STATE=$(curl -s "$BASE_URL/api/v1/state/current" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
echo "Before state: $BEFORE_STATE"

# PM投票
echo "Step 2: PM投票 (权重2)..."
curl -s -X POST "$BASE_URL/api/v1/governance/vote" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: pm" \
  -d "{\"proposalId\": \"$PROPOSAL_ID\", \"choice\": \"approve\"}" > /dev/null

# Arch投票
echo "Step 3: Arch投票 (权重2)..."
curl -s -X POST "$BASE_URL/api/v1/governance/vote" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: arch" \
  -d "{\"proposalId\": \"$PROPOSAL_ID\", \"choice\": \"approve\"}" > /dev/null

# QA投票 - 触发自动执行
echo "Step 4: QA投票 (权重1) - 应触发自动执行..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/governance/vote" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Role: qa" \
  -d "{\"proposalId\": \"$PROPOSAL_ID\", \"choice\": \"approve\"}")

if echo "$RESPONSE" | grep -q '"status":"approved"'; then
  echo -e "${GREEN}✓ 提案已自动通过${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ 提案未自动通过${NC}"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi

# 验证状态流转
echo "Step 5: 验证状态流转..."
AFTER_STATE=$(curl -s "$BASE_URL/api/v1/state/current" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
echo "After state: $AFTER_STATE"

if [ "$BEFORE_STATE" != "$AFTER_STATE" ]; then
  echo -e "${GREEN}✓ 状态已流转${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${RED}✗ 状态未流转${NC}"
  ((TESTS_FAILED++))
fi

# ═══════════════════════════════════════════════════════════════
# 测试总结
# ═══════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      测试总结                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  通过: $TESTS_PASSED                                          ║"
echo "║  失败: $TESTS_FAILED                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}所有测试通过!${NC}"
  exit 0
else
  echo -e "${RED}存在失败的测试${NC}"
  exit 1
fi
```

---

## 3.6 文件变更清单

### 3.6.1 新增文件

| # | 文件路径 | 说明 | 代码行数(预估) |
|---|----------|------|----------------|
| 1 | `lib/core/governance/vote-service.ts` | 投票服务核心实现 | ~350行 |
| 2 | `lib/core/governance/event-emitter.ts` | 治理事件发射器 | ~80行 |
| 3 | `lib/core/governance/index.ts` | 治理模块导出 | ~30行 |
| 4 | `app/api/v1/governance/vote/route.ts` | 投票API路由 | ~120行 |
| 5 | `config/governance/voting-rules.yaml` | 投票规则配置 | ~40行 |
| 6 | `lib/types/governance.ts` | 治理类型定义 | ~100行 |
| 7 | `tests/e2e/governance-vote.test.sh` | E2E测试脚本 | ~150行 |
| 8 | `tests/unit/vote-service.test.ts` | 单元测试 | ~200行 |

### 3.6.2 修改文件

| # | 文件路径 | 修改说明 | 影响范围 |
|---|----------|----------|----------|
| 1 | `lib/core/state/machine.ts` | 添加治理触发流转方法 | +30行 |
| 2 | `lib/core/governance/proposal-service.ts` | 集成超时监控 | +20行 |
| 3 | `app/api/v1/governance/proposals/route.ts` | 创建提案时启动超时监控 | +10行 |
| 4 | `lib/api/error-handler.ts` | 添加治理相关错误码 | +15行 |

### 3.6.3 文件依赖关系

```
lib/core/governance/
├── vote-service.ts
│   ├── 依赖: lib/tsa (TSA存储)
│   ├── 依赖: proposal-service.ts (提案服务)
│   ├── 依赖: lib/core/state/machine.ts (状态机)
│   └── 依赖: config/governance/voting-rules.yaml (规则配置)
├── event-emitter.ts
│   └── 被依赖: vote-service.ts
└── index.ts
    └── 导出: vote-service, event-emitter

app/api/v1/governance/
├── vote/route.ts
│   ├── 依赖: vote-service
│   ├── 依赖: lib/api/auth.ts (认证)
│   └── 依赖: lib/api/error-handler.ts (错误处理)
└── proposals/route.ts
    └── 修改: 集成超时监控
```

---

## 3.7 技术债务声明

### 3.7.1 Mock清单（当前实现中的临时方案）

| # | Mock项 | 位置 | 原因 | 计划替换方案 |
|---|--------|------|------|--------------|
| 1 | `EventBus` 全局对象 | `vote-service.ts` | 事件总线未实现 | 实现统一的事件总线模块 |
| 2 | `X-Agent-Role` Header | API路由 | 认证系统未实现 | 集成JWT/OAuth认证 |
| 3 | 内存超时定时器 | `timeoutTimers` Map | 需要持久化 | 使用Redis/数据库定时任务 |
| 4 | 硬编码权重配置 | `ROLE_WEIGHTS` | 配置系统待完善 | 从YAML配置动态加载 |
| 5 | 状态机持久化 | `persistState()` | TSA集成待完善 | 完整TSA持久化实现 |

### 3.7.2 已知限制

```
═══════════════════════════════════════════════════════════════
                      技术债务清单
═══════════════════════════════════════════════════════════════

【P0 - 阻塞发布】
□ 无 - 当前实现满足MVP要求

【P1 - 影响体验】
□ 超时定时器在服务器重启后丢失
  - 影响: 重启后超时提案可能无法正确处理
  - 缓解: 启动时扫描所有voting状态提案，重新设置定时器
  
□ 事件通知仅支持浏览器环境
  - 影响: SSR场景下事件可能丢失
  - 缓解: 使用服务端事件总线

【P2 - 增强功能】
□ 缺少投票撤销功能
  - 影响: 用户无法修改投票
  - 计划: MVP后添加

□ 缺少批量投票查询API
  - 影响: 需要多次请求获取多个提案统计
  - 计划: 添加 /api/v1/governance/votes/batch

□ 缺少投票历史记录
  - 影响: 无法追溯投票变更
  - 计划: 添加投票历史表

═══════════════════════════════════════════════════════════════
```

### 3.7.3 后续优化计划

| 优先级 | 优化项 | 预计工作量 | 计划版本 |
|--------|--------|------------|----------|
| P1 | 持久化超时定时器 | 1天 | v2.1.1 |
| P1 | 服务端事件总线 | 2天 | v2.1.1 |
| P2 | 投票撤销功能 | 0.5天 | v2.1.2 |
| P2 | 批量查询API | 0.5天 | v2.1.2 |
| P2 | 投票历史记录 | 1天 | v2.2.0 |

---

## 附录: 快速参考

### A. 七权角色速查表

| 角色ID | 中文名 | 权重 | 可创建提案 |
|--------|--------|------|------------|
| pm | 产品经理 | 2 | ✓ |
| arch | 架构师 | 2 | ✓ |
| qa | 测试工程师 | 1 | ✗ |
| engineer | 开发工程师 | 1 | ✗ |
| mike | 产品助理 | 1 | ✗ |

### B. 投票规则速查表

| 规则项 | 值 | 说明 |
|--------|-----|------|
| 最低投票人数 | 3 | 法定人数 |
| 通过阈值 | 60% | 加权通过率 |
| 超时时间 | 30分钟 | 提案有效期 |

### C. API端点速查表

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /api/v1/governance/vote | 提交投票 |
| GET | /api/v1/governance/vote?proposalId=xxx | 获取投票统计 |
| POST | /api/v1/governance/proposals | 创建提案 |
| GET | /api/v1/governance/proposals | 获取提案列表 |

---

**文档版本**: v1.0  
**最后更新**: 2026-02-13  
**作者**: B-03 治理引擎投票系统  
**审核状态**: 待审核
