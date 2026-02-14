# 第3章 治理引擎-提案系统（B-02）

> **工单**: B-02/09 治理引擎提案系统  
> **任务**: 实现提案创建、查询、过期管理（PM专属权限）  
> **工期**: 2天  
> **依赖**: Task 1 (状态机类型)  

---

## 3.1 ProposalService类设计

### 3.1.1 类结构

```typescript
// lib/core/governance/proposal-service.ts

import { TSA, StorageTier } from '@/lib/tsa';
import { Proposal, ProposalStatus, ProposalFilter, CreateProposalRequest } from './types';
import { AgentRole, PowerState } from '@/lib/types';
import { EventEmitter } from 'events';

/**
 * 提案服务 - 治理引擎核心组件
 * 职责: 提案生命周期管理、权限控制、过期检查
 */
export class ProposalService extends EventEmitter {
  private tsa: TSA;
  private config: ProposalServiceConfig;
  private expirationTimer: NodeJS.Timeout | null = null;
  
  // TSA存储键前缀
  private static readonly PROPOSAL_KEY_PREFIX = 'governance:proposal:';
  private static readonly PROPOSAL_INDEX_KEY = 'governance:proposals:index';

  constructor(tsa: TSA, config?: Partial<ProposalServiceConfig>) {
    super();
    this.tsa = tsa;
    this.config = {
      expirationCheckInterval: 60 * 1000, // 1分钟检查一次
      defaultExpirationMinutes: 30,        // 默认30分钟过期
      maxProposalsPerAgent: 10,            // 每个Agent最多10个活跃提案
      ...config,
    };
  }

  /**
   * 初始化服务 - 启动过期检查定时器
   */
  async init(): Promise<void> {
    this.startExpirationCheck();
    console.log('[ProposalService] 初始化完成');
  }

  /**
   * 销毁服务 - 清理定时器
   */
  destroy(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  // ============ 核心方法 ============

  /**
   * 创建提案 - 仅PM角色可调用
   * @param request 创建请求
   * @returns 创建的提案
   * @throws PermissionDeniedError 非PM角色
   * @throws ValidationError 参数校验失败
   */
  async createProposal(request: CreateProposalRequest): Promise<Proposal>;

  /**
   * 获取提案列表 - 按时间倒序
   * @param filter 过滤条件
   * @returns 提案列表
   */
  async getProposals(filter?: ProposalFilter): Promise<Proposal[]>;

  /**
   * 获取单个提案
   * @param id 提案ID
   * @returns 提案或null
   */
  async getProposal(id: string): Promise<Proposal | null>;

  /**
   * 更新提案状态 - 内部使用
   * @param id 提案ID
   * @param status 新状态
   */
  private async updateProposalStatus(
    id: string, 
    status: ProposalStatus
  ): Promise<void>;

  /**
   * 检查并处理过期提案
   */
  private async checkExpiration(): Promise<void>;

  /**
   * 启动过期检查定时器
   */
  private startExpirationCheck(): void;
}
```

### 3.1.2 完整实现

```typescript
// lib/core/governance/proposal-service.ts (完整实现)

import { v4 as uuidv4 } from 'uuid';
import { TSA, StorageTier } from '@/lib/tsa';
import { 
  Proposal, 
  ProposalStatus, 
  ProposalFilter, 
  CreateProposalRequest,
  PermissionDeniedError,
  ValidationError,
  ProposalNotFoundError,
} from './types';
import { AgentRole, PowerState } from '@/lib/types';
import { EventEmitter } from 'events';

export interface ProposalServiceConfig {
  expirationCheckInterval: number;  // 过期检查间隔(ms)
  defaultExpirationMinutes: number; // 默认过期时间(分钟)
  maxProposalsPerAgent: number;     // 每个Agent最大活跃提案数
}

export class ProposalService extends EventEmitter {
  private tsa: TSA;
  private config: ProposalServiceConfig;
  private expirationTimer: NodeJS.Timeout | null = null;
  
  private static readonly PROPOSAL_KEY_PREFIX = 'governance:proposal:';
  private static readonly PROPOSAL_INDEX_KEY = 'governance:proposals:index';

  constructor(tsa: TSA, config?: Partial<ProposalServiceConfig>) {
    super();
    this.tsa = tsa;
    this.config = {
      expirationCheckInterval: 60 * 1000,
      defaultExpirationMinutes: 30,
      maxProposalsPerAgent: 10,
      ...config,
    };
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

  /**
   * 创建提案 - PM专属权限
   */
  async createProposal(request: CreateProposalRequest): Promise<Proposal> {
    // GOV-001: PM权限检查
    if (request.proposer !== 'pm') {
      throw new PermissionDeniedError(
        'ONLY_PM_CAN_CREATE_PROPOSAL',
        '只有PM角色可以创建提案',
        403
      );
    }

    // 参数校验
    this.validateCreateRequest(request);

    const now = Date.now();
    const expirationMs = this.config.defaultExpirationMinutes * 60 * 1000;

    const proposal: Proposal = {
      id: uuidv4(),
      title: request.title,
      description: request.description,
      proposer: request.proposer,
      targetState: request.targetState,
      status: 'pending',
      votes: [],
      createdAt: now,
      expiresAt: now + expirationMs,
    };

    // 存储到TSA - 使用Staging层持久化
    const key = ProposalService.PROPOSAL_KEY_PREFIX + proposal.id;
    await this.tsa.set(key, proposal, { 
      tier: StorageTier.STAGING,
      ttl: expirationMs + 60 * 1000, // TTL比过期时间多1分钟
    });

    // 更新索引
    await this.addToIndex(proposal.id, proposal.createdAt);

    // 触发事件
    this.emit('proposal:created', proposal);

    console.log(`[ProposalService] 提案创建成功: ${proposal.id}`);
    return proposal;
  }

  /**
   * 获取提案列表 - GOV-002: 按时间倒序
   */
  async getProposals(filter?: ProposalFilter): Promise<Proposal[]> {
    const index = await this.getIndex();
    let proposalIds = index;

    // 按状态过滤
    if (filter?.status) {
      const allProposals = await Promise.all(
        index.map(id => this.getProposal(id))
      );
      proposalIds = allProposals
        .filter(p => p && filter.status!.includes(p.status))
        .map(p => p!.id);
    }

    // 获取完整提案数据
    const proposals = await Promise.all(
      proposalIds.map(id => this.getProposal(id))
    );

    // 过滤null并排序 (GOV-002: 按时间倒序)
    return proposals
      .filter((p): p is Proposal => p !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取单个提案
   */
  async getProposal(id: string): Promise<Proposal | null> {
    const key = ProposalService.PROPOSAL_KEY_PREFIX + id;
    return await this.tsa.get<Proposal>(key);
  }

  /**
   * 更新提案状态
   */
  private async updateProposalStatus(
    id: string, 
    status: ProposalStatus
  ): Promise<void> {
    const proposal = await this.getProposal(id);
    if (!proposal) {
      throw new ProposalNotFoundError(id);
    }

    const oldStatus = proposal.status;
    proposal.status = status;
    proposal.updatedAt = Date.now();

    const key = ProposalService.PROPOSAL_KEY_PREFIX + id;
    await this.tsa.set(key, proposal, { tier: StorageTier.STAGING });

    this.emit('proposal:statusChanged', { 
      proposalId: id, 
      oldStatus, 
      newStatus: status 
    });

    console.log(`[ProposalService] 提案状态更新: ${id} ${oldStatus} -> ${status}`);
  }

  /**
   * GOV-003: 检查并处理过期提案
   */
  private async checkExpiration(): Promise<void> {
    const now = Date.now();
    const proposals = await this.getProposals({ status: ['pending', 'voting'] });

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

  /**
   * 启动过期检查定时器
   */
  private startExpirationCheck(): void {
    if (this.expirationTimer) return;

    this.expirationTimer = setInterval(() => {
      this.checkExpiration().catch(err => {
        console.error('[ProposalService] 过期检查失败:', err);
      });
    }, this.config.expirationCheckInterval);

    console.log(`[ProposalService] 过期检查已启动 (间隔: ${this.config.expirationCheckInterval}ms)`);
  }

  // ============ 私有辅助方法 ============

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
    const index = await this.tsa.get<string[]>(
      ProposalService.PROPOSAL_INDEX_KEY
    );
    return index || [];
  }

  private async addToIndex(id: string, timestamp: number): Promise<void> {
    const index = await this.getIndex();
    index.push(id);
    await this.tsa.set(
      ProposalService.PROPOSAL_INDEX_KEY, 
      index, 
      { tier: StorageTier.STAGING }
    );
  }
}

// ============ 错误类 ============

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
```

---

## 3.2 提案存储设计

### 3.2.1 TSA存储方案

```
┌─────────────────────────────────────────────────────────────┐
│                    提案存储架构                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Transient (热层) - 高频访问的活跃提案                │   │
│  │  - 当前正在投票的提案                                 │   │
│  │  - 最近创建的提案                                     │   │
│  │  - TTL: 5分钟                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼ 晋升                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Staging (温层) - 持久化存储                         │   │
│  │  - 所有提案数据 (IndexedDB)                          │   │
│  │  - 提案索引列表                                       │   │
│  │  - TTL: 30分钟 + 缓冲                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼ 归档                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Archive (冷层) - 历史归档                           │   │
│  │  - 已结束/过期的提案                                  │   │
│  │  - 投票历史记录                                       │   │
│  │  - 存储: JSON文件                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2.2 数据结构设计

```typescript
// lib/core/governance/types.ts

import { AgentRole, PowerState } from '@/lib/types';

/**
 * 提案状态
 */
export type ProposalStatus = 
  | 'pending'    // 待投票
  | 'voting'     // 投票中
  | 'approved'   // 已通过
  | 'rejected'   // 已拒绝
  | 'expired';   // 已过期

/**
 * 投票记录
 */
export interface Vote {
  voter: AgentRole;           // 投票人
  choice: 'approve' | 'reject' | 'abstain';
  reason?: string;            // 投票理由
  timestamp: number;          // 投票时间
  weight?: number;            // 投票权重
}

/**
 * 提案数据结构
 */
export interface Proposal {
  id: string;                 // 唯一标识 (UUID)
  title: string;              // 提案标题 (max 200 chars)
  description: string;        // 提案描述 (max 5000 chars)
  proposer: AgentRole;        // 提案人
  targetState: PowerState;    // 目标状态
  status: ProposalStatus;     // 当前状态
  votes: Vote[];              // 投票列表
  createdAt: number;          // 创建时间戳
  expiresAt: number;          // 过期时间戳 (GOV-003)
  updatedAt?: number;         // 更新时间戳
  executedAt?: number;        // 执行时间戳
  executionResult?: {         // 执行结果
    success: boolean;
    message?: string;
  };
}

/**
 * 创建提案请求
 */
export interface CreateProposalRequest {
  proposer: AgentRole;        // 提案人 (必须为 'pm')
  title: string;              // 标题
  description: string;        // 描述
  targetState: PowerState;    // 目标状态
}

/**
 * 提案过滤条件
 */
export interface ProposalFilter {
  status?: ProposalStatus[];  // 状态过滤
  proposer?: AgentRole;       // 提案人过滤
  fromDate?: number;          // 开始时间
  toDate?: number;            // 结束时间
}

/**
 * 提案统计
 */
export interface ProposalStats {
  total: number;              // 总提案数
  pending: number;            // 待投票数
  voting: number;             // 投票中数
  approved: number;           // 已通过数
  rejected: number;           // 已拒绝数
  expired: number;            // 已过期数
}
```

### 3.2.3 存储键命名规范

```typescript
// 存储键前缀定义
const STORAGE_KEYS = {
  // 单个提案: governance:proposal:{proposalId}
  PROPOSAL: (id: string) => `governance:proposal:${id}`,
  
  // 提案索引: governance:proposals:index
  PROPOSAL_INDEX: 'governance:proposals:index',
  
  // 按状态索引: governance:proposals:status:{status}
  PROPOSALS_BY_STATUS: (status: ProposalStatus) => 
    `governance:proposals:status:${status}`,
  
  // 按提案人索引: governance:proposals:proposer:{agentRole}
  PROPOSALS_BY_PROPOSER: (proposer: AgentRole) => 
    `governance:proposals:proposer:${proposer}`,
  
  // 提案统计: governance:proposals:stats
  PROPOSAL_STATS: 'governance:proposals:stats',
} as const;
```

---

## 3.3 API路由实现

### 3.3.1 路由结构

```
/api/v1/governance/
├── proposals/           # 提案列表/创建
│   ├── GET             # 获取提案列表
│   └── POST            # 创建提案 (PM only)
├── proposals/[id]/      # 单个提案
│   └── GET             # 获取提案详情
└── vote/               # 投票 (下一章实现)
    └── POST
```

### 3.3.2 提案列表/创建路由

```typescript
// app/api/v1/governance/proposals/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proposalService } from '@/lib/core/governance';
import { AgentRole, PowerState } from '@/lib/types';

// 请求验证Schema
const CreateProposalSchema = z.object({
  proposer: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  targetState: z.enum([
    'IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'
  ]),
});

const QueryFilterSchema = z.object({
  status: z.string().optional(), // 逗号分隔的状态列表
  proposer: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike']).optional(),
  limit: z.string().transform(Number).default('50'),
  offset: z.string().transform(Number).default('0'),
});

/**
 * GET /api/v1/governance/proposals
 * 获取提案列表 - 按时间倒序
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    
    // 解析查询参数
    const rawParams = {
      status: searchParams.get('status') || undefined,
      proposer: searchParams.get('proposer') || undefined,
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const params = QueryFilterSchema.parse(rawParams);

    // 构建过滤器
    const filter: ProposalFilter = {};
    if (params.status) {
      filter.status = params.status.split(',') as ProposalStatus[];
    }
    if (params.proposer) {
      filter.proposer = params.proposer as AgentRole;
    }

    // 获取提案列表
    const proposals = await proposalService.getProposals(filter);

    // 分页
    const total = proposals.length;
    const paginatedProposals = proposals.slice(
      params.offset,
      params.offset + params.limit
    );

    return NextResponse.json({
      success: true,
      data: {
        proposals: paginatedProposals,
        pagination: {
          total,
          limit: params.limit,
          offset: params.offset,
          hasMore: params.offset + params.limit < total,
        },
      },
    });

  } catch (error) {
    console.error('[API] 获取提案列表失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PARAMS', message: '参数格式错误' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/governance/proposals
 * 创建提案 - PM专属权限
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    
    // 验证请求体
    const validatedData = CreateProposalSchema.parse(body);

    // GOV-001: PM权限检查 (Service层也会检查，这里提前返回更友好)
    if (validatedData.proposer !== 'pm') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'PERMISSION_DENIED', 
          message: '只有PM角色可以创建提案',
          requiredRole: 'pm',
          currentRole: validatedData.proposer,
        },
        { status: 403 }
      );
    }

    // 创建提案
    const proposal = await proposalService.createProposal(validatedData);

    return NextResponse.json({
      success: true,
      data: { proposal },
      message: '提案创建成功',
    }, { status: 201 });

  } catch (error) {
    console.error('[API] 创建提案失败:', error);

    // Zod验证错误
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'VALIDATION_ERROR', 
          message: '请求参数验证失败',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    // 权限错误
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        { 
          success: false, 
          error: error.code, 
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    // 验证错误
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { 
          success: false, 
          error: error.code, 
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' },
      { status: 500 }
    );
  }
}
```

### 3.3.3 提案详情路由

```typescript
// app/api/v1/governance/proposals/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proposalService } from '@/lib/core/governance';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/v1/governance/proposals/:id
 * 获取提案详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // 验证参数
    const { id } = ParamsSchema.parse(await params);

    // 获取提案
    const proposal = await proposalService.getProposal(id);

    if (!proposal) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'PROPOSAL_NOT_FOUND', 
          message: '提案不存在' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { proposal },
    });

  } catch (error) {
    console.error('[API] 获取提案详情失败:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ID', message: '提案ID格式错误' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' },
      { status: 500 }
    );
  }
}
```

### 3.3.4 服务导出

```typescript
// lib/core/governance/index.ts

import { tsa } from '@/lib/tsa';
import { ProposalService } from './proposal-service';

// 单例导出
export const proposalService = new ProposalService(tsa);

// 类型导出
export * from './types';
export * from './proposal-service';
```

---

## 3.4 YAML规则补充

### 3.4.1 治理规则配置

```yaml
# config/governance/rules.yaml

# ============================================
# 治理引擎规则配置
# 版本: v1.0
# 说明: 提案、投票、状态流转规则
# ============================================

governance:
  # 提案规则
  proposal:
    # 创建权限
    creation:
      allowedRoles:
        - pm          # 只有PM可以创建提案
      
      # 内容限制
      constraints:
        title:
          minLength: 1
          maxLength: 200
        description:
          minLength: 1
          maxLength: 5000
      
      # 频率限制
      rateLimit:
        maxPerAgent: 10          # 每个Agent最多10个活跃提案
        cooldownMinutes: 5       # 创建间隔5分钟
    
    # 过期规则 (GOV-003)
    expiration:
      enabled: true
      defaultMinutes: 30         # 默认30分钟过期
      checkInterval: 60          # 每60秒检查一次
      
      # 按状态设置过期时间
      byStatus:
        pending: 30              # 待投票: 30分钟
        voting: 30               # 投票中: 30分钟
    
    # 状态流转
    statusFlow:
      pending:
        - voting
        - expired
      voting:
        - approved
        - rejected
        - expired
      approved: []               # 终态
      rejected: []               # 终态
      expired: []                # 终态

  # 投票规则 (预留，下一章详细实现)
  voting:
    # 法定人数
    quorum: 3                    # 最少3人投票
    
    # 通过阈值
    approvalThreshold: 0.6       # 60%赞成票通过
    
    # 角色权重
    weights:
      pm: 2
      arch: 2
      qa: 1
      engineer: 1
      mike: 1
    
    # 投票超时
    timeout: 1800000             # 30分钟 (ms)

  # 自动执行规则
  autoExecution:
    enabled: true                # 通过提案自动执行
    delayMs: 5000                # 通过后延迟5秒执行
```

### 3.4.2 配置加载器

```typescript
// lib/core/governance/config-loader.ts

import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';

export interface GovernanceConfig {
  proposal: {
    creation: {
      allowedRoles: string[];
      constraints: {
        title: { minLength: number; maxLength: number };
        description: { minLength: number; maxLength: number };
      };
      rateLimit: {
        maxPerAgent: number;
        cooldownMinutes: number;
      };
    };
    expiration: {
      enabled: boolean;
      defaultMinutes: number;
      checkInterval: number;
      byStatus: Record<string, number>;
    };
    statusFlow: Record<string, string[]>;
  };
  voting: {
    quorum: number;
    approvalThreshold: number;
    weights: Record<string, number>;
    timeout: number;
  };
  autoExecution: {
    enabled: boolean;
    delayMs: number;
  };
}

let cachedConfig: GovernanceConfig | null = null;

export function loadGovernanceConfig(): GovernanceConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = join(process.cwd(), 'config', 'governance', 'rules.yaml');
  const fileContent = readFileSync(configPath, 'utf-8');
  const parsed = parse(fileContent);
  
  cachedConfig = parsed.governance as GovernanceConfig;
  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
```

---

## 3.5 自测点（必须包含验证命令）

### 3.5.1 自测矩阵

| 自测ID | 测试场景 | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|----------|------|
| GOV-001 | PM创建提案 | `curl -X POST ...` | 返回201，提案创建成功 | 🔴 |
| GOV-001 | 非PM创建被拒 | `curl -X POST ...` | 返回403，权限错误 | 🔴 |
| GOV-002 | 列表倒序排列 | `curl -X GET ...` | 按createdAt降序 | 🔴 |
| GOV-003 | 30分钟过期 | 等待30分钟 | 状态变为expired | 🔴 |

### 3.5.2 详细验证命令

#### GOV-001: PM权限验证

```bash
# ========== GOV-001-A: PM创建提案成功 ==========

curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "pm",
    "title": "测试提案-状态流转到DESIGN",
    "description": "这是一个测试提案，用于验证PM创建权限",
    "targetState": "DESIGN"
  }'

# 通过标准:
# - HTTP状态码: 201 Created
# - 响应体包含: success: true
# - 响应体包含: data.proposal.id (UUID格式)
# - 响应体包含: data.proposal.status: "pending"
# - 响应体包含: data.proposal.proposer: "pm"

# 预期响应:
{
  "success": true,
  "data": {
    "proposal": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "测试提案-状态流转到DESIGN",
      "description": "这是一个测试提案，用于验证PM创建权限",
      "proposer": "pm",
      "targetState": "DESIGN",
      "status": "pending",
      "votes": [],
      "createdAt": 1707830400000,
      "expiresAt": 1707832200000
    }
  },
  "message": "提案创建成功"
}
```

```bash
# ========== GOV-001-B: 非PM创建被拒绝 ==========

# 测试arch角色
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "arch",
    "title": "非法提案",
    "description": "非PM创建的提案应该被拒绝",
    "targetState": "DESIGN"
  }'

# 测试qa角色
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "qa",
    "title": "非法提案",
    "description": "非PM创建的提案应该被拒绝",
    "targetState": "CODE"
  }'

# 通过标准:
# - HTTP状态码: 403 Forbidden
# - 响应体包含: success: false
# - 响应体包含: error: "PERMISSION_DENIED" 或 "ONLY_PM_CAN_CREATE_PROPOSAL"
# - 响应体包含: message: 包含"只有PM角色可以创建提案"
# - 响应体包含: currentRole 和 requiredRole

# 预期响应:
{
  "success": false,
  "error": "PERMISSION_DENIED",
  "message": "只有PM角色可以创建提案",
  "requiredRole": "pm",
  "currentRole": "arch"
}
```

#### GOV-002: 列表倒序排列

```bash
# ========== GOV-002: 提案列表按时间倒序 ==========

# 1. 先创建多个提案（按顺序）
for i in 1 2 3; do
  curl -X POST http://localhost:3000/api/v1/governance/proposals \
    -H "Content-Type: application/json" \
    -d "{\n      \"proposer\": \"pm\",\n      \"title\": \"提案-$i\",\n      \"description\": \"第$i个测试提案\",\n      \"targetState\": \"DESIGN\"\n    }"
  sleep 1
done

# 2. 获取提案列表
curl -X GET "http://localhost:3000/api/v1/governance/proposals?limit=10"

# 通过标准:
# - HTTP状态码: 200 OK
# - 响应体包含: success: true
# - proposals数组按createdAt降序排列
# - 第一个元素的title应该是"提案-3" (最后创建的)
# - 最后一个元素的title应该是"提案-1" (最早创建的)

# 预期响应:
{
  "success": true,
  "data": {
    "proposals": [
      { "title": "提案-3", "createdAt": 1707830403000, ... },  // 最新
      { "title": "提案-2", "createdAt": 1707830402000, ... },
      { "title": "提案-1", "createdAt": 1707830401000, ... }   // 最旧
    ],
    "pagination": {
      "total": 3,
      "limit": 10,
      "offset": 0,
      "hasMore": false
    }
  }
}

# 3. 验证排序算法
curl -X GET "http://localhost:3000/api/v1/governance/proposals" | \
  jq '.data.proposals | map(.createdAt) | to_entries | .[0].value > .[1].value'

# 应该返回: true (表示倒序正确)
```

#### GOV-003: 30分钟过期机制

```bash
# ========== GOV-003: 30分钟自动过期 ==========

# 方案A: 实际等待30分钟（生产验证）
# ============================================

# 1. 创建一个测试提案
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "pm",
    "title": "过期测试提案",
    "description": "用于测试30分钟过期机制",
    "targetState": "DESIGN"
  }'

# 记录返回的proposal.id
PROPOSAL_ID="<返回的ID>"

# 2. 立即查询，状态应为pending
curl -X GET "http://localhost:3000/api/v1/governance/proposals/${PROPOSAL_ID}"
# 预期: status: "pending"

# 3. 等待30分钟...
echo "等待30分钟..."
sleep 1800  # 1800秒 = 30分钟

# 4. 30分钟后查询，状态应为expired
curl -X GET "http://localhost:3000/api/v1/governance/proposals/${PROPOSAL_ID}"
# 预期: status: "expired"

# 通过标准:
# - 创建时: status = "pending"
# - 30分钟后: status = "expired"
```

```bash
# 方案B: 缩短过期时间测试（开发验证）
# ============================================

# 修改配置: config/governance/rules.yaml
# proposal.expiration.defaultMinutes: 1  # 改为1分钟

# 1. 创建提案
curl -X POST http://localhost:3000/api/v1/governance/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "pm",
    "title": "快速过期测试",
    "description": "1分钟后过期",
    "targetState": "DESIGN"
  }'

# 2. 等待70秒
echo "等待70秒..."
sleep 70

# 3. 查询状态
curl -X GET "http://localhost:3000/api/v1/governance/proposals" | \
  jq '.data.proposals[] | select(.title == "快速过期测试") | .status'

# 预期输出: "expired"
```

```bash
# 方案C: 单元测试验证（推荐）
# ============================================

# tests/unit/governance/proposal-service.test.ts

describe('GOV-003: 提案过期机制', () => {
  it('应该在30分钟后自动过期', async () => {
    // 使用jest fake timers
    jest.useFakeTimers();
    
    // 创建提案
    const proposal = await proposalService.createProposal({
      proposer: 'pm',
      title: '过期测试',
      description: '测试过期',
      targetState: 'DESIGN',
    });
    
    expect(proposal.status).toBe('pending');
    
    // 快进30分钟
    jest.advanceTimersByTime(30 * 60 * 1000);
    
    // 触发过期检查
    await proposalService.checkExpiration();
    
    // 验证状态
    const expired = await proposalService.getProposal(proposal.id);
    expect(expired?.status).toBe('expired');
    
    jest.useRealTimers();
  });
});
```

---

## 3.6 文件变更清单

### 3.6.1 新增文件

| 序号 | 文件路径 | 类型 | 说明 | 行数(预估) |
|------|----------|------|------|-----------|
| 1 | `lib/core/governance/proposal-service.ts` | 新增 | ProposalService核心类 | ~350行 |
| 2 | `lib/core/governance/types.ts` | 新增 | 治理引擎类型定义 | ~120行 |
| 3 | `lib/core/governance/index.ts` | 新增 | 模块导出 | ~15行 |
| 4 | `lib/core/governance/config-loader.ts` | 新增 | YAML配置加载器 | ~60行 |
| 5 | `app/api/v1/governance/proposals/route.ts` | 新增 | 提案列表/创建API | ~180行 |
| 6 | `app/api/v1/governance/proposals/[id]/route.ts` | 新增 | 提案详情API | ~60行 |
| 7 | `config/governance/rules.yaml` | 新增 | 治理规则配置 | ~80行 |
| 8 | `tests/unit/governance/proposal-service.test.ts` | 新增 | 单元测试 | ~200行 |

### 3.6.2 修改文件

| 序号 | 文件路径 | 类型 | 修改内容 | 影响范围 |
|------|----------|------|----------|----------|
| 1 | `lib/types/index.ts` | 修改 | 添加AgentRole/PowerState类型 | 全局类型 |
| 2 | `lib/tsa/index.ts` | 修改 | 确保TSA单例导出 | 存储层 |
| 3 | `package.json` | 修改 | 添加yaml解析依赖 | 依赖管理 |

### 3.6.3 目录结构

```
lib/core/governance/
├── proposal-service.ts      # 核心服务类 (新增)
├── types.ts                 # 类型定义 (新增)
├── index.ts                 # 模块导出 (新增)
└── config-loader.ts         # 配置加载 (新增)

app/api/v1/governance/
├── proposals/
│   ├── route.ts             # 列表/创建 (新增)
│   └── [id]/
│       └── route.ts         # 详情 (新增)
└── vote/                    # 预留 (下一章)
    └── route.ts

config/governance/
└── rules.yaml               # 治理规则 (新增)

tests/unit/governance/
└── proposal-service.test.ts # 单元测试 (新增)
```

---

## 3.7 技术债务声明

### 3.7.1 Mock清单（当前实现中使用的Mock/占位）

| # | Mock项 | 位置 | 说明 | 解决计划 |
|---|--------|------|------|----------|
| 1 | TSA存储 | `proposal-service.ts` | 使用内存/IndexedDB模拟 | Phase 1已完成，无需Mock |
| 2 | 认证中间件 | `route.ts` | 直接读取proposer字段，无JWT验证 | Task 5实现统一认证 |
| 3 | 状态机联动 | `proposal-service.ts` | 提案通过不触发实际状态流转 | Task 3实现VoteService后联动 |
| 4 | 通知机制 | `proposal-service.ts` | EventEmitter仅本地，无WebSocket | Phase 4扩展 |
| 5 | 持久化归档 | `proposal-service.ts` | Archive层未完整实现 | Phase 1后续完善 |

### 3.7.2 已知限制

| # | 限制项 | 影响 | 缓解措施 |
|---|--------|------|----------|
| 1 | 单节点部署 | 无分布式一致性 | MVP阶段单实例部署 |
| 2 | 无事务保证 | TSA操作非原子性 | 关键操作添加补偿逻辑 |
| 3 | 定时器精度 | 过期检查间隔1分钟 | 过期时间有±1分钟误差 |
| 4 | 索引无清理 | 提案索引只增不减 | 定期重建索引或添加清理逻辑 |

### 3.7.3 后续优化项

| 优先级 | 优化项 | 预期收益 | 工作量 |
|--------|--------|----------|--------|
| P1 | 添加WebSocket实时通知 | 提案状态变更实时推送 | ~1天 |
| P1 | 提案索引优化 | 大数据量查询性能提升 | ~0.5天 |
| P2 | 提案搜索功能 | 支持标题/描述搜索 | ~1天 |
| P2 | 提案分类标签 | 按类型/模块分类 | ~0.5天 |
| P2 | 提案历史归档 | 自动归档过期提案 | ~1天 |

### 3.7.4 依赖声明

```
本实现依赖以下前置条件:
✅ TSA存储层已实现 (Phase 1)
✅ 基础类型定义已存在 (Phase 0)
⏳ 状态机类型需要Task 1提供
⏳ 统一认证中间件需要Task 5提供

当前实现使用临时方案:
- 认证: 直接读取请求体proposer字段
- 权限: Service层硬编码检查
- 状态: 仅存储targetState，不实际流转
```

---

## 附录: 快速验证脚本

```bash
#!/bin/bash
# scripts/verify-governance.sh
# 治理引擎提案系统快速验证脚本

set -e

BASE_URL="http://localhost:3000"

echo "=== HAJIMI-V2.1 治理引擎提案系统验证 ==="
echo ""

# 检查服务是否运行
if ! curl -s "${BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "❌ 服务未启动，请先运行 npm run dev"
  exit 1
fi
echo "✅ 服务运行正常"
echo ""

# GOV-001: PM创建提案
echo "=== GOV-001: PM创建提案 ==="
PM_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/governance/proposals" \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "pm",
    "title": "验证测试提案",
    "description": "用于自动化验证的测试提案",
    "targetState": "DESIGN"
  }')

if echo "$PM_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PM创建提案成功"
  PROPOSAL_ID=$(echo "$PM_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "   提案ID: $PROPOSAL_ID"
else
  echo "❌ PM创建提案失败"
  echo "$PM_RESPONSE"
  exit 1
fi
echo ""

# GOV-001: 非PM创建被拒绝
echo "=== GOV-001: 非PM创建被拒绝 ==="
ARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/v1/governance/proposals" \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "arch",
    "title": "非法提案",
    "description": "应该被拒绝",
    "targetState": "DESIGN"
  }')

HTTP_CODE=$(echo "$ARCH_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "403" ]; then
  echo "✅ 非PM创建正确返回403"
else
  echo "❌ 非PM创建应该返回403，实际返回 $HTTP_CODE"
  exit 1
fi
echo ""

# GOV-002: 列表倒序
echo "=== GOV-002: 列表倒序验证 ==="
# 创建第二个提案
sleep 1
curl -s -X POST "${BASE_URL}/api/v1/governance/proposals" \
  -H "Content-Type: application/json" \
  -d '{
    "proposer": "pm",
    "title": "第二个提案",
    "description": "用于验证倒序",
    "targetState": "CODE"
  }' > /dev/null

LIST_RESPONSE=$(curl -s "${BASE_URL}/api/v1/governance/proposals")
FIRST_TITLE=$(echo "$LIST_RESPONSE" | grep -o '"title":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$FIRST_TITLE" = "第二个提案" ]; then
  echo "✅ 列表按时间倒序排列正确"
else
  echo "❌ 列表排序错误，第一个提案标题: $FIRST_TITLE"
  exit 1
fi
echo ""

echo "=== 所有验证通过! ==="
echo ""
echo "GOV-003 (30分钟过期) 需要手动验证或运行单元测试:"
echo "  npm test -- tests/unit/governance/proposal-service.test.ts"
```

---

**文档版本**: v1.0  
**最后更新**: 2026-02-13  
**作者**: B-02 治理引擎提案系统  
**审核状态**: 待审核
