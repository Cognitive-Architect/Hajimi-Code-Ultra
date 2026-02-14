# 🐍 Hajimi Code Ultra - 修复任务清单 (fix.md)

> **生成时间**: 2026-02-13  
> **基于分析**: diff.md 功能差异性报告  
> **目标**: 完成P0优先级任务，达成MVP发布标准  
> **预计工期**: 20天 (最短MVP路径)

---

## 📋 任务执行总览

```
Phase A: 核心业务逻辑 (8天)
├── Task 1: 状态机流转引擎
├── Task 2: 治理引擎提案系统
├── Task 3: 治理引擎投票系统
├── Task 4: A2A消息业务逻辑
└── Task 5: API路由业务实现

Phase B: 前端集成 (4天)
├── Task 6: React Hooks实现
└── Task 7: UI组件API联调

Phase C: 测试与完善 (8天)
├── Task 8: 单元测试补充
├── Task 9: 集成测试
├── Task 10: 5个角色装备补充
└── Task 11: Bug修复与优化
```

---

## Phase A: 核心业务逻辑 (Day 1-8)

### Task 1: 状态机流转引擎 [P0] ⏱️ 2天

#### 1.1 状态机核心实现
```typescript
// lib/core/state/machine.ts

export class StateMachine {
  private currentState: PowerState = 'IDLE';
  private history: StateTransition[] = [];
  private listeners: Set<(transition: StateTransition) => void> = new Set();

  // 状态流转
  async transition(to: PowerState, context?: Record<string, unknown>): Promise<boolean>;
  
  // 获取当前状态
  getCurrentState(): PowerState;
  
  // 获取流转历史
  getHistory(): StateTransition[];
  
  // 检查流转是否允许
  canTransition(to: PowerState): boolean;
  
  // 订阅状态变更
  subscribe(listener: (transition: StateTransition) => void): () => void;
}
```

#### 1.2 流转规则引擎
```typescript
// lib/core/state/rules.ts

// 从 config/state/flow.yaml 加载规则
export class TransitionRulesEngine {
  private rules: Map<string, TransitionRule>;
  
  loadRulesFromYaml(path: string): void;
  
  validateTransition(from: PowerState, to: PowerState, agent: AgentRole): ValidationResult;
  
  getRequiredApprovals(from: PowerState, to: PowerState): AgentRole[];
}
```

#### 1.3 API路由实现
```typescript
// app/api/v1/state/current/route.ts
export async function GET(): Promise<NextResponse<StateResponse>>;

// app/api/v1/state/transition/route.ts
export async function POST(request: Request): Promise<NextResponse<TransitionResponse>>;
```

**验收标准**:
- [ ] RSCH-502: 状态机流转E2E测试通过
- [ ] IDLE → DESIGN → CODE → AUDIT → BUILD → DEPLOY → DONE 完整流转
- [ ] 非法流转被拒绝并返回错误
- [ ] 状态变更订阅通知正常

**依赖**: 无

---

### Task 2: 治理引擎提案系统 [P0] ⏱️ 2天

#### 2.1 提案管理服务
```typescript
// lib/core/governance/proposal-service.ts

export class ProposalService {
  private tsa: TSA;
  
  // 创建提案 (仅PM可创建)
  async createProposal(
    proposer: AgentRole,
    title: string,
    description: string,
    targetState: PowerState
  ): Promise<Proposal>;
  
  // 获取提案列表
  async getProposals(filter?: ProposalFilter): Promise<Proposal[]>;
  
  // 获取单个提案
  async getProposal(id: string): Promise<Proposal | null>;
  
  // 更新提案状态 (内部使用)
  private async updateProposalStatus(id: string, status: ProposalStatus): Promise<void>;
  
  // 检查提案是否过期
  private async checkExpiration(): Promise<void>;
}
```

#### 2.2 提案存储
```typescript
// 使用TSA存储提案数据
const PROPOSAL_KEY_PREFIX = 'governance:proposal:';

// 提案数据结构
interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: AgentRole;
  targetState: PowerState;
  status: 'pending' | 'voting' | 'approved' | 'rejected' | 'expired';
  votes: Vote[];
  createdAt: number;
  expiresAt: number;
}
```

#### 2.3 API路由实现
```typescript
// app/api/v1/governance/proposals/route.ts
export async function GET(request: Request): Promise<NextResponse<ProposalsResponse>>;
export async function POST(request: Request): Promise<NextResponse<CreateProposalResponse>>;
```

**验收标准**:
- [ ] RSCH-503: PM可以创建提案
- [ ] 提案列表按时间倒序返回
- [ ] 提案自动过期机制正常工作
- [ ] 提案数据持久化到TSA

**依赖**: Task 1 (状态机类型)

---

### Task 3: 治理引擎投票系统 [P0] ⏱️ 2天

#### 3.1 投票服务
```typescript
// lib/core/governance/vote-service.ts

export class VoteService {
  private proposalService: ProposalService;
  
  // 投票
  async vote(
    proposalId: string,
    voter: AgentRole,
    choice: 'approve' | 'reject' | 'abstain',
    reason?: string
  ): Promise<VoteResult>;
  
  // 计算投票结果
  private calculateResult(proposal: Proposal): VoteResult;
  
  // 自动执行通过提案
  private async autoExecute(proposal: Proposal): Promise<void>;
  
  // 获取投票统计
  async getVoteStats(proposalId: string): Promise<VoteStats>;
}
```

#### 3.2 七权投票规则
```yaml
# 从 config/governance/rules.yaml 加载
voting_rules:
  quorum: 3              # 最低投票人数
  approval_threshold: 0.6  # 通过阈值 (60%)
  timeout: 1800000       # 30分钟超时
  
  # 各角色权重
  weights:
    pm: 2
    arch: 2
    qa: 1
    engineer: 1
    mike: 1
```

#### 3.3 API路由实现
```typescript
// app/api/v1/governance/vote/route.ts
export async function POST(request: Request): Promise<NextResponse<VoteResponse>>;
```

**验收标准**:
- [ ] RSCH-503: 投票提交正常
- [ ] 达到阈值自动通过提案
- [ ] 超时自动关闭提案
- [ ] 投票结果统计正确

**依赖**: Task 2

---

### Task 4: A2A消息业务逻辑 [P0] ⏱️ 1.5天

#### 4.1 A2A消息服务
```typescript
// lib/core/agents/a2a-service.ts

export class A2AService {
  private tsa: TSA;
  private secondMeAdapter: SecondMeAdapter;
  
  // 发送消息
  async sendMessage(message: SendMessageRequest): Promise<A2AMessage>;
  
  // 获取消息历史
  async getHistory(
    sessionId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<A2AMessage>>;
  
  // 处理流式响应
  async sendMessageStream(
    message: SendMessageRequest,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  
  // 消息持久化
  private async persistMessage(message: A2AMessage): Promise<void>;
}
```

#### 4.2 SecondMe适配器
```typescript
// lib/adapters/secondme/client.ts

export class SecondMeAdapter {
  private apiKey: string;
  private baseUrl: string;
  
  // 发送消息到SecondMe
  async chat(
    agentId: string,
    message: string,
    context?: ChatContext
  ): Promise<ChatResponse>;
  
  // 流式聊天
  async chatStream(
    agentId: string,
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  
  // 获取Agent信息
  async getAgentInfo(agentId: string): Promise<AgentInfo>;
}
```

#### 4.3 API路由实现
```typescript
// app/api/v1/a2a/send/route.ts
export async function POST(request: Request): Promise<NextResponse<SendResponse>>;

// app/api/v1/a2a/history/route.ts
export async function GET(request: Request): Promise<NextResponse<HistoryResponse>>;
```

**验收标准**:
- [ ] RSCH-501: 消息发送接收正常
- [ ] SecondMe API调用成功
- [ ] 消息历史查询正常
- [ ] 流式响应正常工作

**依赖**: 无

---

### Task 5: API路由业务实现 [P0] ⏱️ 0.5天

#### 5.1 统一错误处理
```typescript
// lib/api/error-handler.ts

export class APIError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

export function handleAPIError(error: unknown): NextResponse {
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.statusCode }
    );
  }
  
  return NextResponse.json(
    { error: 'INTERNAL_ERROR', message: 'Internal server error' },
    { status: 500 }
  );
}
```

#### 5.2 认证中间件
```typescript
// lib/api/auth.ts

export function withAuth(
  handler: (req: Request, context: AuthContext) => Promise<NextResponse>
): (req: Request) => Promise<NextResponse>;

// 验证Agent权限
export function requireRole(...roles: AgentRole[]): Middleware;
```

#### 5.3 请求验证
```typescript
// 使用Zod验证请求体
import { z } from 'zod';

const SendMessageSchema = z.object({
  sender: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike']),
  receiver: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike']),
  content: z.string().min(1).max(10000),
  type: z.enum(['chat', 'proposal', 'vote', 'system']).default('chat'),
});
```

**验收标准**:
- [ ] 所有API路由返回统一格式
- [ ] 错误处理正常工作
- [ ] 权限验证正常工作
- [ ] 请求验证正常工作

**依赖**: Task 1-4

---

## Phase B: 前端集成 (Day 9-12)

### Task 6: React Hooks实现 [P0] ⏱️ 3天

#### 6.1 useTSA Hook
```typescript
// app/hooks/useTSA.ts

import { useState, useEffect, useCallback } from 'react';
import { tsa } from '@/lib/tsa';

export function useTSA<T>(key: string, defaultValue?: T) {
  const [value, setValue] = useState<T | null>(defaultValue ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 读取数据
  useEffect(() => {
    tsa.get<T>(key)
      .then(setValue)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [key]);

  // 写入数据
  const set = useCallback(async (newValue: T) => {
    await tsa.set(key, newValue);
    setValue(newValue);
  }, [key]);

  return { value, set, loading, error };
}
```

#### 6.2 useAgent Hook
```typescript
// app/hooks/useAgent.ts

export function useAgent(agentId: string) {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  
  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    const response = await fetch('/api/v1/a2a/send', {
      method: 'POST',
      body: JSON.stringify({ sender: 'user', receiver: agentId, content }),
    });
    return response.json();
  }, [agentId]);

  // 加载历史消息
  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/v1/a2a/history?sessionId=${agentId}`);
    const data = await response.json();
    setMessages(data.messages);
  }, [agentId]);

  return { agent, messages, sendMessage, loadHistory };
}
```

#### 6.3 useGovernance Hook
```typescript
// app/hooks/useGovernance.ts

export function useGovernance() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取提案列表
  const fetchProposals = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/v1/governance/proposals');
    const data = await response.json();
    setProposals(data.proposals);
    setLoading(false);
  }, []);

  // 创建提案
  const createProposal = useCallback(async (proposal: CreateProposalRequest) => {
    const response = await fetch('/api/v1/governance/proposals', {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
    return response.json();
  }, []);

  // 投票
  const vote = useCallback(async (proposalId: string, choice: VoteChoice) => {
    const response = await fetch('/api/v1/governance/vote', {
      method: 'POST',
      body: JSON.stringify({ proposalId, choice }),
    });
    return response.json();
  }, []);

  return { proposals, loading, fetchProposals, createProposal, vote };
}
```

#### 6.4 useStateMachine Hook
```typescript
// app/hooks/useStateMachine.ts

export function useStateMachine() {
  const [currentState, setCurrentState] = useState<PowerState>('IDLE');
  const [history, setHistory] = useState<StateTransition[]>([]);

  // 获取当前状态
  const refreshState = useCallback(async () => {
    const response = await fetch('/api/v1/state/current');
    const data = await response.json();
    setCurrentState(data.state);
    setHistory(data.history);
  }, []);

  // 触发状态流转
  const transition = useCallback(async (to: PowerState) => {
    const response = await fetch('/api/v1/state/transition', {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
    const data = await response.json();
    if (data.success) {
      setCurrentState(to);
    }
    return data;
  }, []);

  return { currentState, history, refreshState, transition };
}
```

**验收标准**:
- [ ] useTSA: 数据读写正常，加载状态正确
- [ ] useAgent: 消息发送接收正常
- [ ] useGovernance: 提案CRUD正常
- [ ] useStateMachine: 状态流转正常

**依赖**: Task 1-5

---

### Task 7: UI组件API联调 [P0] ⏱️ 1天

#### 7.1 AgentChatDialog联调
```typescript
// 集成useAgent Hook
// - 发送消息调用API
// - 接收流式响应
// - 显示Agent回复
```

#### 7.2 ProposalPanel联调
```typescript
// 集成useGovernance Hook
// - 显示提案列表
// - 创建提案弹窗
// - 投票按钮功能
```

#### 7.3 StateIndicator联调
```typescript
// 集成useStateMachine Hook
// - 实时显示当前状态
// - 状态历史展示
```

#### 7.4 DemoPanel联调
```typescript
// 集成所有Hooks
// - 演示场景播放
// - 消息流展示
// - 状态变更追踪
```

**验收标准**:
- [ ] AgentChatDialog: 聊天功能完整
- [ ] ProposalPanel: 提案功能完整
- [ ] StateIndicator: 状态显示正确
- [ ] DemoPanel: 演示功能完整

**依赖**: Task 6

---

## Phase C: 测试与完善 (Day 13-20)

### Task 8: 单元测试补充 [P0] ⏱️ 3天

#### 8.1 TSA存储测试
```typescript
// tests/unit/tsa.test.ts

describe('TSA', () => {
  describe('TransientStore', () => {
    it('should store and retrieve data', async () => {});
    it('should respect TTL', async () => {});
    it('should evict LRU items', async () => {});
  });

  describe('StagingStore', () => {
    it('should persist to IndexedDB', async () => {});
    it('should promote to transient on access', async () => {});
  });

  describe('TierRouter', () => {
    it('should route based on frequency', async () => {});
    it('should calculate correct score', async () => {});
  });
});
```

#### 8.2 状态机测试
```typescript
// tests/unit/state-machine.test.ts

describe('StateMachine', () => {
  it('should transition IDLE → DESIGN', async () => {});
  it('should reject invalid transition', async () => {});
  it('should emit event on transition', async () => {});
  it('should persist history', async () => {});
});
```

#### 8.3 治理引擎测试
```typescript
// tests/unit/governance.test.ts

describe('Governance', () => {
  describe('ProposalService', () => {
    it('should create proposal', async () => {});
    it('should list proposals', async () => {});
    it('should auto-expire', async () => {});
  });

  describe('VoteService', () => {
    it('should accept vote', async () => {});
    it('should auto-approve on threshold', async () => {});
    it('should calculate correct stats', async () => {});
  });
});
```

#### 8.4 A2A服务测试
```typescript
// tests/unit/a2a.test.ts

describe('A2AService', () => {
  it('should send message', async () => {});
  it('should persist message', async () => {});
  it('should retrieve history', async () => {});
  it('should handle streaming', async () => {});
});
```

**验收标准**:
- [ ] RSCH-511: 单元测试覆盖率≥80%
- [ ] 核心逻辑全覆盖
- [ ] 所有测试通过

**依赖**: Task 1-7

---

### Task 9: 集成测试 [P0] ⏱️ 2天

#### 9.1 A2A流集成测试
```typescript
// tests/integration/a2a-flow.test.ts

describe('A2A Flow Integration', () => {
  it('should send message and store in TSA', async () => {});
  it('should retrieve history across sessions', async () => {});
  it('should handle concurrent messages', async () => {});
});
```

#### 9.2 治理流集成测试
```typescript
// tests/integration/governance-flow.test.ts

describe('Governance Flow Integration', () => {
  it('should create proposal and vote', async () => {});
  it('should auto-execute on approval', async () => {});
  it('should reject unauthorized creation', async () => {});
});
```

#### 9.3 状态机集成测试
```typescript
// tests/integration/state-flow.test.ts

describe('State Flow Integration', () => {
  it('should transition through all states', async () => {});
  it('should persist state across restarts', async () => {});
  it('should trigger hooks on transition', async () => {});
});
```

**验收标准**:
- [ ] RSCH-512: 集成测试通过率100%
- [ ] RSCH-501~506: E2E测试场景通过

**依赖**: Task 8

---

### Task 10: 5个角色装备补充 [P1] ⏱️ 2天

#### 10.1 黄瓜睦装备
```typescript
// patterns/system/roles/黄瓜睦.pattern.ts

export const 黄瓜睦Pattern = createRolePattern(
  'analyst-cucumber-mu',
  '黄瓜睦',
  {
    description: '数据分析型人格，擅长深度分析和逻辑推理',
    tokenLimit: 2000,
    compressionRatio: 0.25,
  }
);

export const 黄瓜睦Variables = {
  roleId: 'analyst-cucumber-mu',
  roleName: '黄瓜睦',
  roleDescription: '数据分析型AI助手，以逻辑严谨著称',
  coreBehavior: `...`,
  languageStyle: `...`,
  rules: `...`,
  signature: '—— 睦的分析报告 📊',
};
```

#### 10.2 唐音装备
```typescript
// patterns/system/roles/唐音.pattern.ts
// 创意型人格
```

#### 10.3 咕咕嘎嘎装备
```typescript
// patterns/system/roles/咕咕嘎嘎.pattern.ts
// 幽默型人格
```

#### 10.4 压力怪装备
```typescript
// patterns/system/roles/压力怪.pattern.ts
// 严格型人格
```

#### 10.5 奶龙娘装备
```typescript
// patterns/system/roles/奶龙娘.pattern.ts
// 可爱型人格
```

**验收标准**:
- [ ] RSCH-311~316: 5个角色装备文件存在
- [ ] 每个装备符合Pattern类型定义
- [ ] 装备注册中心可加载

**依赖**: 无 (可与Task 8-9并行)

---

### Task 11: Bug修复与优化 [P0] ⏱️ 1天

#### 11.1 类型检查清理
```bash
# 修复所有TypeScript错误
npx tsc --noEmit

# 修复ESLint警告
npm run lint
```

#### 11.2 性能优化
- [ ] TSA热层访问性能优化
- [ ] 消息列表虚拟滚动
- [ ] 提案列表分页加载

#### 11.3 边界情况处理
- [ ] 网络错误处理
- [ ] 存储空间不足处理
- [ ] 并发操作处理

#### 11.4 文档更新
- [ ] API文档更新
- [ ] 部署文档更新
- [ ] 使用说明更新

**验收标准**:
- [ ] RSCH-514: TypeScript严格模式0错误
- [ ] RSCH-515: ESLint 0警告
- [ ] RSCH-516: 构建成功

**依赖**: Task 8-10

---

## 📅 执行时间表

### Week 1 (Day 1-5): 核心业务逻辑
| Day | 任务 | 产出 |
|-----|------|------|
| 1 | Task 1.1-1.2 | 状态机核心+规则引擎 |
| 2 | Task 1.3 + Task 2.1 | 状态API + 提案服务 |
| 3 | Task 2.2-2.3 | 提案存储 + API |
| 4 | Task 3.1-3.2 | 投票服务 + 规则 |
| 5 | Task 3.3 + Task 4 | 投票API + A2A服务 |

### Week 2 (Day 6-10): 前端集成+测试
| Day | 任务 | 产出 |
|-----|------|------|
| 6 | Task 5 | API错误处理+认证 |
| 7 | Task 6.1-6.2 | useTSA + useAgent |
| 8 | Task 6.3-6.4 | useGovernance + useStateMachine |
| 9 | Task 7 | UI组件API联调 |
| 10 | Task 8.1-8.2 | TSA测试 + 状态机测试 |

### Week 3 (Day 11-15): 测试+角色装备
| Day | 任务 | 产出 |
|-----|------|------|
| 11 | Task 8.3-8.4 | 治理测试 + A2A测试 |
| 12 | Task 9.1-9.2 | A2A集成测试 + 治理集成测试 |
| 13 | Task 9.3 | 状态机集成测试 |
| 14 | Task 10.1-10.3 | 黄瓜睦 + 唐音 + 咕咕嘎嘎 |
| 15 | Task 10.4-10.5 | 压力怪 + 奶龙娘 |

### Week 4 (Day 16-20): 优化+验收
| Day | 任务 | 产出 |
|-----|------|------|
| 16 | Task 11.1-11.2 | 类型清理 + 性能优化 |
| 17 | Task 11.3-11.4 | 边界处理 + 文档更新 |
| 18 | Bug修复日 | 修复发现的问题 |
| 19 | 集成验证日 | 全链路验证 |
| 20 | 验收日 | MVP发布准备 |

---

## ✅ 验收检查清单

### MVP发布标准
- [ ] RSCH-501: A2A消息流E2E测试通过
- [ ] RSCH-502: 状态机流转E2E测试通过
- [ ] RSCH-503: 治理提案E2E测试通过
- [ ] RSCH-504: TSA存储E2E测试通过
- [ ] RSCH-511: 单元测试覆盖率≥80%
- [ ] RSCH-512: 集成测试通过率100%
- [ ] RSCH-514: TypeScript严格模式0错误
- [ ] RSCH-515: ESLint 0警告
- [ ] RSCH-516: 构建成功

### 功能验证
- [ ] AgentChatDialog: 可以正常聊天
- [ ] ProposalPanel: 可以创建提案和投票
- [ ] StateIndicator: 状态流转可视化
- [ ] DemoPanel: 演示场景完整播放

---

**报告生成**: Kimi Code CLI  
**执行建议**: 严格按照优先级执行，Task 1-5为阻塞项必须完成  
**风险提示**: 如工期紧张，Task 10 (角色装备) 可延后至MVP发布后
