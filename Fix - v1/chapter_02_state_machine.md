# 第2章 状态机实现（B-01）

> **工单编号**: B-01/09  
> **任务目标**: 实现七权状态机核心流转引擎  
> **参考文档**: 
> - 白皮书第7章状态机设计
> - fix.md Task 1
> - diff.md 状态机相关差异
> - HAJIMI-V2.1-开发自测表-v1.0.md

---

## 2.1 StateMachine类设计

### 2.1.1 状态定义

```typescript
// lib/types/state.ts

/**
 * 七权状态定义
 * IDLE → DESIGN → CODE → AUDIT → BUILD → DEPLOY → DONE
 */
export type PowerState = 
  | 'IDLE'      // 空闲状态，等待任务
  | 'DESIGN'    // 设计阶段，架构师主导
  | 'CODE'      // 编码阶段，工程师主导
  | 'AUDIT'     // 审计阶段，QA主导
  | 'BUILD'     // 构建阶段，自动化执行
  | 'DEPLOY'    // 部署阶段，运维主导
  | 'DONE';     // 完成状态

/**
 * 七权角色定义
 */
export type AgentRole = 
  | 'pm'        // 产品经理
  | 'arch'      // 架构师
  | 'qa'        // 质量保证
  | 'engineer'  // 工程师
  | 'mike'      // 运维
  | 'system';   // 系统角色

/**
 * 状态流转记录
 */
export interface StateTransition {
  id: string;
  from: PowerState;
  to: PowerState;
  timestamp: number;
  agent: AgentRole;
  reason?: string;
  context?: Record<string, unknown>;
}

/**
 * 状态响应
 */
export interface StateResponse {
  state: PowerState;
  history: StateTransition[];
  timestamp: number;
}

/**
 * 流转响应
 */
export interface TransitionResponse {
  success: boolean;
  from: PowerState;
  to: PowerState;
  transition?: StateTransition;
  error?: string;
}
```

### 2.1.2 StateMachine类实现

```typescript
// lib/core/state/machine.ts

import { 
  PowerState, 
  AgentRole, 
  StateTransition, 
  StateResponse, 
  TransitionResponse 
} from '@/lib/types/state';
import { TransitionRulesEngine } from './rules';
import { tsa } from '@/lib/tsa';
import { v4 as uuidv4 } from 'uuid';

// TSA存储键
const STATE_KEY = 'state:current';
const HISTORY_KEY = 'state:history';

export class StateMachine {
  private currentState: PowerState = 'IDLE';
  private history: StateTransition[] = [];
  private listeners: Set<(transition: StateTransition) => void> = new Set();
  private rulesEngine: TransitionRulesEngine;
  private initialized = false;

  constructor() {
    this.rulesEngine = new TransitionRulesEngine();
  }

  /**
   * 初始化状态机
   * 从TSA加载历史状态
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 从TSA加载当前状态
      const savedState = await tsa.get<PowerState>(STATE_KEY);
      if (savedState) {
        this.currentState = savedState;
      }

      // 从TSA加载历史记录
      const savedHistory = await tsa.get<StateTransition[]>(HISTORY_KEY);
      if (savedHistory) {
        this.history = savedHistory;
      }

      this.initialized = true;
      console.log(`[StateMachine] 初始化完成，当前状态: ${this.currentState}`);
    } catch (error) {
      console.error('[StateMachine] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 状态流转
   * @param to 目标状态
   * @param agent 触发角色
   * @param context 上下文信息
   * @returns 流转结果
   */
  async transition(
    to: PowerState, 
    agent: AgentRole = 'system',
    context?: Record<string, unknown>
  ): Promise<TransitionResponse> {
    this.ensureInitialized();

    const from = this.currentState;

    // 1. 验证流转是否允许
    const validation = this.rulesEngine.validateTransition(from, to, agent);
    if (!validation.valid) {
      return {
        success: false,
        from,
        to,
        error: validation.reason || 'Invalid transition',
      };
    }

    // 2. 检查是否需要额外审批
    const requiredApprovals = this.rulesEngine.getRequiredApprovals(from, to);
    if (requiredApprovals.length > 0 && !requiredApprovals.includes(agent)) {
      return {
        success: false,
        from,
        to,
        error: `Transition requires approval from: ${requiredApprovals.join(', ')}`,
      };
    }

    // 3. 执行流转
    const transition: StateTransition = {
      id: uuidv4(),
      from,
      to,
      timestamp: Date.now(),
      agent,
      reason: context?.reason as string,
      context,
    };

    // 4. 更新状态
    this.currentState = to;
    this.history.push(transition);

    // 5. 持久化到TSA
    await this.persistState();

    // 6. 通知订阅者
    this.notifyListeners(transition);

    console.log(`[StateMachine] 状态流转: ${from} → ${to} (by ${agent})`);

    return {
      success: true,
      from,
      to,
      transition,
    };
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): PowerState {
    return this.currentState;
  }

  /**
   * 获取完整状态响应
   */
  getStateResponse(): StateResponse {
    return {
      state: this.currentState,
      history: [...this.history],
      timestamp: Date.now(),
    };
  }

  /**
   * 获取流转历史
   */
  getHistory(): StateTransition[] {
    return [...this.history];
  }

  /**
   * 检查流转是否允许
   */
  canTransition(to: PowerState, agent?: AgentRole): boolean {
    const validation = this.rulesEngine.validateTransition(
      this.currentState, 
      to, 
      agent || 'system'
    );
    return validation.valid;
  }

  /**
   * 获取允许的流转目标
   */
  getAllowedTransitions(agent?: AgentRole): PowerState[] {
    const allStates: PowerState[] = ['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
    return allStates.filter(state => 
      this.canTransition(state, agent)
    );
  }

  /**
   * 订阅状态变更
   * @param listener 回调函数
   * @returns 取消订阅函数
   */
  subscribe(listener: (transition: StateTransition) => void): () => void {
    this.listeners.add(listener);
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 重置状态机（仅用于测试）
   */
  async reset(): Promise<void> {
    this.currentState = 'IDLE';
    this.history = [];
    await this.persistState();
    console.log('[StateMachine] 状态已重置');
  }

  /**
   * 持久化状态到TSA
   */
  private async persistState(): Promise<void> {
    try {
      await tsa.set(STATE_KEY, this.currentState, { tier: 'TRANSIENT' });
      await tsa.set(HISTORY_KEY, this.history, { tier: 'STAGING' });
    } catch (error) {
      console.error('[StateMachine] 状态持久化失败:', error);
      throw error;
    }
  }

  /**
   * 通知所有订阅者
   */
  private notifyListeners(transition: StateTransition): void {
    this.listeners.forEach(listener => {
      try {
        listener(transition);
      } catch (error) {
        console.error('[StateMachine] 订阅者通知失败:', error);
      }
    });
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('StateMachine not initialized. Call init() first.');
    }
  }
}

// 导出单例
export const stateMachine = new StateMachine();
```

### 2.1.3 状态流转流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        状态流转流程                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────┐    1.验证    ┌─────────┐   2.检查审批   ┌─────────┐      │
│   │  开始   │ ──────────▶ │  规则   │ ─────────────▶ │  权限   │      │
│   └─────────┘             └─────────┘                └─────────┘      │
│                                │                          │            │
│                                ▼                          ▼            │
│                         ┌─────────┐                ┌─────────┐        │
│                         │  拒绝   │                │  拒绝   │        │
│                         └─────────┘                └─────────┘        │
│                                │                          │            │
│                                ▼                          ▼            │
│                         ┌─────────┐                ┌─────────┐        │
│                         │返回错误 │                │返回错误 │        │
│                         └─────────┘                └─────────┘        │
│                                                                         │
│   ┌─────────┐    3.执行    ┌─────────┐   4.持久化   ┌─────────┐       │
│   │  通过   │ ──────────▶ │  更新   │ ───────────▶ │  TSA    │       │
│   └─────────┘             └─────────┘              └─────────┘       │
│                                │                                       │
│                                ▼                                       │
│                         ┌─────────┐    5.通知     ┌─────────┐        │
│                         │  订阅者 │ ────────────▶ │  回调   │        │
│                         └─────────┘               └─────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2.2 TransitionRulesEngine

### 2.2.1 规则引擎设计

```typescript
// lib/core/state/rules.ts

import { PowerState, AgentRole } from '@/lib/types/state';
import { loadYamlConfig } from '@/lib/config/loader';

/**
 * 流转规则
 */
export interface TransitionRule {
  from: PowerState;
  to: PowerState;
  allowed: boolean;
  requiredRoles?: AgentRole[];
  description?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * YAML配置结构
 */
interface StateFlowConfig {
  states: {
    name: PowerState;
    description: string;
  }[];
  transitions: {
    from: PowerState;
    to: PowerState;
    allowed: boolean;
    requiredRoles?: AgentRole[];
    description?: string;
  }[];
}

export class TransitionRulesEngine {
  private rules: Map<string, TransitionRule> = new Map();
  private configLoaded = false;

  constructor() {
    // 加载默认规则
    this.loadDefaultRules();
  }

  /**
   * 从YAML配置文件加载规则
   * @param path 配置文件路径
   */
  loadRulesFromYaml(path: string): void {
    try {
      const config = loadYamlConfig<StateFlowConfig>(path);
      
      config.transitions.forEach(t => {
        const key = this.getRuleKey(t.from, t.to);
        this.rules.set(key, {
          from: t.from,
          to: t.to,
          allowed: t.allowed,
          requiredRoles: t.requiredRoles,
          description: t.description,
        });
      });

      this.configLoaded = true;
      console.log(`[TransitionRulesEngine] 从 ${path} 加载了 ${config.transitions.length} 条规则`);
    } catch (error) {
      console.warn(`[TransitionRulesEngine] 加载配置文件失败，使用默认规则:`, error);
    }
  }

  /**
   * 验证流转是否允许
   * @param from 源状态
   * @param to 目标状态
   * @param agent 触发角色
   * @returns 验证结果
   */
  validateTransition(
    from: PowerState, 
    to: PowerState, 
    agent: AgentRole
  ): ValidationResult {
    // 1. 检查是否为相同状态
    if (from === to) {
      return { valid: false, reason: 'Cannot transition to the same state' };
    }

    // 2. 查找规则
    const key = this.getRuleKey(from, to);
    const rule = this.rules.get(key);

    if (!rule) {
      return { valid: false, reason: `No rule defined for transition: ${from} → ${to}` };
    }

    // 3. 检查是否允许
    if (!rule.allowed) {
      return { valid: false, reason: `Transition ${from} → ${to} is not allowed` };
    }

    // 4. 检查角色权限
    if (rule.requiredRoles && rule.requiredRoles.length > 0) {
      if (!rule.requiredRoles.includes(agent)) {
        return { 
          valid: false, 
          reason: `Agent role '${agent}' is not authorized for this transition. Required: ${rule.requiredRoles.join(', ')}` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * 获取所需审批角色
   * @param from 源状态
   * @param to 目标状态
   * @returns 所需角色列表
   */
  getRequiredApprovals(from: PowerState, to: PowerState): AgentRole[] {
    const key = this.getRuleKey(from, to);
    const rule = this.rules.get(key);
    return rule?.requiredRoles || [];
  }

  /**
   * 获取所有规则
   */
  getAllRules(): TransitionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: TransitionRule): void {
    const key = this.getRuleKey(rule.from, rule.to);
    this.rules.set(key, rule);
  }

  /**
   * 生成规则键
   */
  private getRuleKey(from: PowerState, to: PowerState): string {
    return `${from}→${to}`;
  }

  /**
   * 加载默认规则
   * 七权状态机标准流转规则
   */
  private loadDefaultRules(): void {
    const defaultTransitions: TransitionRule[] = [
      // IDLE 流转
      { from: 'IDLE', to: 'DESIGN', allowed: true, requiredRoles: ['pm', 'arch'], description: 'PM或架构师启动设计' },
      
      // DESIGN 流转
      { from: 'DESIGN', to: 'CODE', allowed: true, requiredRoles: ['arch', 'engineer'], description: '设计完成，进入编码' },
      { from: 'DESIGN', to: 'IDLE', allowed: true, requiredRoles: ['pm'], description: 'PM取消设计' },
      
      // CODE 流转
      { from: 'CODE', to: 'AUDIT', allowed: true, requiredRoles: ['engineer'], description: '编码完成，提交审计' },
      { from: 'CODE', to: 'DESIGN', allowed: true, requiredRoles: ['arch'], description: '架构师要求重新设计' },
      
      // AUDIT 流转
      { from: 'AUDIT', to: 'BUILD', allowed: true, requiredRoles: ['qa'], description: '审计通过，进入构建' },
      { from: 'AUDIT', to: 'CODE', allowed: true, requiredRoles: ['qa'], description: 'QA要求修复问题' },
      
      // BUILD 流转
      { from: 'BUILD', to: 'DEPLOY', allowed: true, requiredRoles: ['system', 'mike'], description: '构建成功，进入部署' },
      { from: 'BUILD', to: 'CODE', allowed: true, requiredRoles: ['system'], description: '构建失败，返回编码' },
      
      // DEPLOY 流转
      { from: 'DEPLOY', to: 'DONE', allowed: true, requiredRoles: ['mike', 'system'], description: '部署成功，任务完成' },
      { from: 'DEPLOY', to: 'BUILD', allowed: true, requiredRoles: ['mike'], description: '部署失败，重新构建' },
      
      // DONE 流转（终态，不可流转）
      // 无出边
    ];

    defaultTransitions.forEach(rule => {
      const key = this.getRuleKey(rule.from, rule.to);
      this.rules.set(key, rule);
    });

    console.log(`[TransitionRulesEngine] 加载了 ${defaultTransitions.length} 条默认规则`);
  }
}
```

### 2.2.2 YAML配置文件

```yaml
# config/state/flow.yaml

states:
  - name: IDLE
    description: 空闲状态，等待任务启动
  - name: DESIGN
    description: 设计阶段，架构师主导
  - name: CODE
    description: 编码阶段，工程师主导
  - name: AUDIT
    description: 审计阶段，QA主导
  - name: BUILD
    description: 构建阶段，自动化执行
  - name: DEPLOY
    description: 部署阶段，运维主导
  - name: DONE
    description: 完成状态，任务结束

transitions:
  # IDLE 流转
  - from: IDLE
    to: DESIGN
    allowed: true
    requiredRoles: [pm, arch]
    description: PM或架构师启动设计

  # DESIGN 流转
  - from: DESIGN
    to: CODE
    allowed: true
    requiredRoles: [arch, engineer]
    description: 设计完成，进入编码
  - from: DESIGN
    to: IDLE
    allowed: true
    requiredRoles: [pm]
    description: PM取消设计

  # CODE 流转
  - from: CODE
    to: AUDIT
    allowed: true
    requiredRoles: [engineer]
    description: 编码完成，提交审计
  - from: CODE
    to: DESIGN
    allowed: true
    requiredRoles: [arch]
    description: 架构师要求重新设计

  # AUDIT 流转
  - from: AUDIT
    to: BUILD
    allowed: true
    requiredRoles: [qa]
    description: 审计通过，进入构建
  - from: AUDIT
    to: CODE
    allowed: true
    requiredRoles: [qa]
    description: QA要求修复问题

  # BUILD 流转
  - from: BUILD
    to: DEPLOY
    allowed: true
    requiredRoles: [system, mike]
    description: 构建成功，进入部署
  - from: BUILD
    to: CODE
    allowed: true
    requiredRoles: [system]
    description: 构建失败，返回编码

  # DEPLOY 流转
  - from: DEPLOY
    to: DONE
    allowed: true
    requiredRoles: [mike, system]
    description: 部署成功，任务完成
  - from: DEPLOY
    to: BUILD
    allowed: true
    requiredRoles: [mike]
    description: 部署失败，重新构建

# 非法流转（明确禁止）
forbiddenTransitions:
  - from: IDLE
    to: CODE
    reason: 必须先经过设计阶段
  - from: IDLE
    to: DEPLOY
    reason: 必须经过完整流程
  - from: DONE
    to: ANY
    reason: 终态不可流转
```

### 2.2.3 状态流转图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        七权状态机流转图                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────┐         ┌────────┐         ┌────────┐         ┌────────┐   │
│   │ IDLE │ ──────▶ │ DESIGN │ ──────▶ │  CODE  │ ──────▶ │ AUDIT  │   │
│   └──────┘  pm/    └────────┘  arch/  └────────┘  eng    └────────┘   │
│      ▲      arch      │   │    eng      │   ▲        │   │            │
│      │                │   │             │   │        │   │            │
│      │                │   ▼             │   │        ▼   │            │
│      │                │  (取消)         │   │      (修复) │            │
│      │                │                 │   │              │            │
│   ┌──────┐         ┌────────┐         ┌────────┐         ┌────────┐   │
│   │ DONE │ ◀────── │ DEPLOY │ ◀────── │ BUILD  │ ◀────── │        │   │
│   └──────┘  mike/   └────────┘  sys/   └────────┘   qa    └────────┘   │
│              sys      │   ▲              │   ▲                        │
│                       │   │              │   │                        │
│                       └───┘              └───┘                        │
│                      (重部署)           (重构建)                       │
│                                                                         │
│   图例: ───▶ 合法流转    ─ ─ ▶ 非法流转                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2.3 API路由实现

### 2.3.1 当前状态查询接口

```typescript
// app/api/v1/state/current/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';

/**
 * GET /api/v1/state/current
 * 获取当前状态和历史记录
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // 确保状态机已初始化
    await stateMachine.init();

    // 获取状态响应
    const response = stateMachine.getStateResponse();

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[API] 获取状态失败:', error);
    
    return NextResponse.json(
      { 
        error: 'INTERNAL_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to get state' 
      },
      { status: 500 }
    );
  }
}
```

### 2.3.2 状态流转接口

```typescript
// app/api/v1/state/transition/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { PowerState, AgentRole } from '@/lib/types/state';
import { z } from 'zod';

/**
 * 请求体验证Schema
 */
const TransitionRequestSchema = z.object({
  to: z.enum(['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE']),
  agent: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']).optional(),
  reason: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

/**
 * POST /api/v1/state/transition
 * 执行状态流转
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();

    // 2. 验证请求体
    const validation = TransitionRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR', 
          message: 'Invalid request body',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const { to, agent = 'system', reason, context } = validation.data;

    // 3. 确保状态机已初始化
    await stateMachine.init();

    // 4. 执行流转
    const result = await stateMachine.transition(to, agent, {
      reason,
      ...context,
    });

    // 5. 返回结果
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(
        { 
          error: 'TRANSITION_REJECTED', 
          message: result.error,
          from: result.from,
          to: result.to,
        },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('[API] 状态流转失败:', error);
    
    return NextResponse.json(
      { 
        error: 'INTERNAL_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to transition state' 
      },
      { status: 500 }
    );
  }
}
```

### 2.3.3 允许的流转查询接口

```typescript
// app/api/v1/state/allowed/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { AgentRole } from '@/lib/types/state';

/**
 * GET /api/v1/state/allowed?agent={role}
 * 获取当前状态下允许的流转目标
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 获取查询参数
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent') as AgentRole | undefined;

    // 2. 确保状态机已初始化
    await stateMachine.init();

    // 3. 获取允许的流转
    const allowedTransitions = stateMachine.getAllowedTransitions(agent);
    const currentState = stateMachine.getCurrentState();

    return NextResponse.json({
      currentState,
      allowedTransitions,
      agent,
      timestamp: Date.now(),
    }, { status: 200 });
  } catch (error) {
    console.error('[API] 获取允许流转失败:', error);
    
    return NextResponse.json(
      { 
        error: 'INTERNAL_ERROR', 
        message: error instanceof Error ? error.message : 'Failed to get allowed transitions' 
      },
      { status: 500 }
    );
  }
}
```

### 2.3.4 API响应示例

**获取当前状态响应:**
```json
{
  "state": "CODE",
  "history": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "from": "IDLE",
      "to": "DESIGN",
      "timestamp": 1707830400000,
      "agent": "arch",
      "reason": "开始架构设计"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "from": "DESIGN",
      "to": "CODE",
      "timestamp": 1707834000000,
      "agent": "engineer",
      "reason": "设计评审通过"
    }
  ],
  "timestamp": 1707837600000
}
```

**状态流转请求:**
```json
{
  "to": "AUDIT",
  "agent": "engineer",
  "reason": "编码完成，提交审计"
}
```

**状态流转成功响应:**
```json
{
  "success": true,
  "from": "CODE",
  "to": "AUDIT",
  "transition": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "from": "CODE",
    "to": "AUDIT",
    "timestamp": 1707837600000,
    "agent": "engineer",
    "reason": "编码完成，提交审计"
  }
}
```

**状态流转失败响应:**
```json
{
  "error": "TRANSITION_REJECTED",
  "message": "Agent role 'pm' is not authorized for this transition. Required: engineer",
  "from": "CODE",
  "to": "AUDIT"
}
```

---

## 2.4 自测点

### 2.4.1 自测清单

| 自测ID | 测试项 | 验证命令 | 通过标准 | 状态 |
|--------|--------|----------|----------|------|
| STM-001 | 获取当前状态 | `curl http://localhost:3000/api/v1/state/current` | 返回JSON含`state`和`history`字段 | 🔴 |
| STM-002 | 合法流转IDLE→DESIGN | `curl -X POST -H "Content-Type: application/json" -d '{"to":"DESIGN","agent":"pm"}' http://localhost:3000/api/v1/state/transition` | 返回`success: true` | 🔴 |
| STM-003 | 合法流转DESIGN→CODE | `curl -X POST -H "Content-Type: application/json" -d '{"to":"CODE","agent":"engineer"}' http://localhost:3000/api/v1/state/transition` | 返回`success: true` | 🔴 |
| STM-004 | 非法流转被拒绝 | `curl -X POST -H "Content-Type: application/json" -d '{"to":"DEPLOY","agent":"pm"}' http://localhost:3000/api/v1/state/transition` | 返回403错误和`TRANSITION_REJECTED` | 🔴 |
| STM-005 | 状态历史记录完整 | `curl http://localhost:3000/api/v1/state/current` | `history`数组包含所有流转记录 | 🔴 |
| STM-006 | 订阅通知机制 | WebSocket/EventSource测试 | 状态变更时触发回调 | 🔴 |
| STM-007 | 权限验证 | `curl -X POST -H "Content-Type: application/json" -d '{"to":"AUDIT","agent":"pm"}' http://localhost:3000/api/v1/state/transition` | 返回403，提示需要engineer角色 | 🔴 |
| STM-008 | 完整流转链路 | 脚本执行IDLE→DESIGN→CODE→AUDIT→BUILD→DEPLOY→DONE | 每个流转都成功 | 🔴 |

### 2.4.2 验证命令详解

#### STM-001: 获取当前状态
```bash
curl -s http://localhost:3000/api/v1/state/current | jq .
```

**通过标准:**
- HTTP状态码: 200
- 响应包含 `state` 字段（值为七权状态之一）
- 响应包含 `history` 字段（数组类型）
- 响应包含 `timestamp` 字段（数字类型）

#### STM-002: 合法流转IDLE→DESIGN
```bash
# 1. 先重置状态机（如需要）
curl -X POST -H "Content-Type: application/json" \
  -d '{"action":"reset"}' \
  http://localhost:3000/api/v1/state/reset 2>/dev/null || true

# 2. 执行流转
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"to":"DESIGN","agent":"pm","reason":"开始设计阶段"}' \
  http://localhost:3000/api/v1/state/transition | jq .
```

**通过标准:**
- HTTP状态码: 200
- `success: true`
- `from: "IDLE"`
- `to: "DESIGN"`
- `transition` 对象完整

#### STM-003: 合法流转DESIGN→CODE
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"to":"CODE","agent":"engineer","reason":"设计完成"}' \
  http://localhost:3000/api/v1/state/transition | jq .
```

**通过标准:**
- HTTP状态码: 200
- `success: true`
- `from: "DESIGN"`
- `to: "CODE"`

#### STM-004: 非法流转被拒绝
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"to":"DEPLOY","agent":"pm"}' \
  http://localhost:3000/api/v1/state/transition | jq .
```

**通过标准:**
- HTTP状态码: 403
- `error: "TRANSITION_REJECTED"`
- `message` 字段包含拒绝原因

#### STM-005: 状态历史记录完整
```bash
curl -s http://localhost:3000/api/v1/state/current | jq '.history | length'
```

**通过标准:**
- `history` 数组长度 > 0
- 每条记录包含 `id`, `from`, `to`, `timestamp`, `agent` 字段

#### STM-006: 订阅通知机制
```typescript
// 测试代码示例
import { stateMachine } from '@/lib/core/state/machine';

// 订阅状态变更
const unsubscribe = stateMachine.subscribe((transition) => {
  console.log('状态变更:', transition.from, '→', transition.to);
});

// 执行流转（应触发回调）
await stateMachine.transition('DESIGN', 'pm');

// 取消订阅
unsubscribe();
```

**通过标准:**
- 订阅回调在状态变更时被调用
- 回调参数包含完整的流转信息

#### STM-007: 权限验证
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"to":"AUDIT","agent":"pm"}' \
  http://localhost:3000/api/v1/state/transition | jq .
```

**通过标准:**
- HTTP状态码: 403
- `message` 包含 "not authorized" 或 "Required: engineer"

#### STM-008: 完整流转链路
```bash
#!/bin/bash
# test-full-flow.sh

BASE_URL="http://localhost:3000"

echo "=== 完整流转链路测试 ==="

# 定义流转步骤
declare -a steps=(
  "DESIGN:pm:开始设计"
  "CODE:engineer:设计完成"
  "AUDIT:qa:编码完成"
  "BUILD:system:审计通过"
  "DEPLOY:mike:构建成功"
  "DONE:mike:部署成功"
)

for step in "${steps[@]}"; do
  IFS=':' read -r state agent reason <<< "$step"
  echo -n "流转到 $state (by $agent)... "
  
  response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"to\":\"$state\",\"agent\":\"$agent\",\"reason\":\"$reason\"}" \
    "$BASE_URL/api/v1/state/transition")
  
  if echo "$response" | grep -q '"success":true'; then
    echo "✅ 成功"
  else
    echo "❌ 失败: $(echo "$response" | jq -r '.message')"
    exit 1
  fi
done

echo "=== 所有流转完成 ==="
curl -s "$BASE_URL/api/v1/state/current" | jq '.state'
```

**通过标准:**
- 所有流转步骤返回 `success: true`
- 最终状态为 `DONE`

---

## 2.5 文件变更清单

### 2.5.1 新增文件

| 序号 | 文件路径 | 类型 | 说明 |
|------|----------|------|------|
| 1 | `lib/core/state/machine.ts` | 新增 | StateMachine核心类 |
| 2 | `lib/core/state/rules.ts` | 新增 | TransitionRulesEngine规则引擎 |
| 3 | `lib/core/state/index.ts` | 新增 | 状态模块导出 |
| 4 | `lib/types/state.ts` | 新增 | 状态机类型定义 |
| 5 | `app/api/v1/state/current/route.ts` | 新增 | 当前状态查询API |
| 6 | `app/api/v1/state/transition/route.ts` | 新增 | 状态流转API |
| 7 | `app/api/v1/state/allowed/route.ts` | 新增 | 允许流转查询API |
| 8 | `config/state/flow.yaml` | 新增 | 状态流转配置 |
| 9 | `tests/unit/state-machine.test.ts` | 新增 | 状态机单元测试 |
| 10 | `tests/integration/state-flow.test.ts` | 新增 | 状态流集成测试 |

### 2.5.2 修改文件

| 序号 | 文件路径 | 类型 | 说明 |
|------|----------|------|------|
| 1 | `lib/types/index.ts` | 修改 | 导出状态机类型 |
| 2 | `lib/config/loader.ts` | 修改 | 添加YAML加载工具 |
| 3 | `app/api/v1/state/route.ts` | 修改 | 状态API路由聚合 |

### 2.5.3 目录结构

```
lib/
├── core/
│   └── state/
│       ├── index.ts          # 模块导出
│       ├── machine.ts        # StateMachine类
│       └── rules.ts          # TransitionRulesEngine
├── types/
│   └── state.ts              # 状态机类型定义
└── config/
    └── loader.ts             # 配置加载工具

app/
└── api/
    └── v1/
        └── state/
            ├── current/
            │   └── route.ts  # GET /api/v1/state/current
            ├── transition/
            │   └── route.ts  # POST /api/v1/state/transition
            └── allowed/
                └── route.ts  # GET /api/v1/state/allowed

config/
└── state/
    └── flow.yaml             # 状态流转配置

tests/
├── unit/
│   └── state-machine.test.ts
└── integration/
    └── state-flow.test.ts
```

---

## 2.6 技术债务声明

### 2.6.1 Mock清单

| 序号 | Mock项 | 原因 | 预计替换时间 |
|------|--------|------|--------------|
| 1 | TSA存储层 | 当前使用内存Map模拟 | Phase 1完成后 |
| 2 | YAML配置加载 | 当前使用硬编码规则 | Phase 2完成后 |
| 3 | 权限验证 | 当前仅验证角色，无用户系统 | Phase 3完成后 |
| 4 | 通知机制 | 当前仅支持同步回调 | Phase 4完成后 |

### 2.6.2 需真实实现

| 序号 | 实现项 | 依赖 | 优先级 |
|------|--------|------|--------|
| 1 | TSA持久化 | Phase 1 TSA存储 | P0 |
| 2 | YAML配置热加载 | 配置文件系统 | P1 |
| 3 | WebSocket通知 | 实时通信模块 | P2 |
| 4 | 审计日志 | 日志系统 | P2 |
| 5 | 状态快照 | 备份恢复模块 | P3 |

### 2.6.3 已知限制

1. **并发处理**: 当前实现未处理并发流转请求，可能存在竞态条件
2. **分布式支持**: 当前为单实例设计，不支持多实例状态同步
3. **性能优化**: 历史记录未分页，大量流转后可能影响性能
4. **错误恢复**: 持久化失败时未实现自动重试机制

### 2.6.4 后续优化计划

| 阶段 | 优化项 | 目标 |
|------|--------|------|
| Phase 2 | 添加并发锁 | 防止竞态条件 |
| Phase 3 | 历史分页 | 支持大量历史记录 |
| Phase 4 | 分布式锁 | 支持多实例部署 |
| Phase 5 | 性能监控 | 添加流转耗时统计 |

---

## 2.7 附录

### 2.7.1 状态机配置示例

```typescript
// 使用示例
import { stateMachine } from '@/lib/core/state/machine';

// 初始化
await stateMachine.init();

// 订阅状态变更
const unsubscribe = stateMachine.subscribe((transition) => {
  console.log(`状态变更: ${transition.from} → ${transition.to}`);
});

// 执行流转
const result = await stateMachine.transition('DESIGN', 'pm', {
  reason: '开始设计阶段',
});

if (result.success) {
  console.log('流转成功');
} else {
  console.log('流转失败:', result.error);
}

// 取消订阅
unsubscribe();
```

### 2.7.2 错误码说明

| 错误码 | 说明 | HTTP状态码 |
|--------|------|------------|
| `VALIDATION_ERROR` | 请求体验证失败 | 400 |
| `TRANSITION_REJECTED` | 流转被拒绝 | 403 |
| `INTERNAL_ERROR` | 内部服务器错误 | 500 |
| `NOT_INITIALIZED` | 状态机未初始化 | 500 |

### 2.7.3 参考文档

- [白皮书第7章状态机设计](/mnt/okcomputer/upload/HAJIMI-V2.1-重建白皮书-v1.0.md)
- [fix.md Task 1](/mnt/okcomputer/upload/fix.md)
- [diff.md 状态机差异](/mnt/okcomputer/upload/diff.md)
- [开发自测表](/mnt/okcomputer/upload/HAJIMI-V2.1-开发自测表-v1.0.md)

---

> **文档版本**: v1.0  
> **生成日期**: 2026-02-13  
> **作者**: B-01 状态机流转引擎  
> **审核状态**: 待审核
