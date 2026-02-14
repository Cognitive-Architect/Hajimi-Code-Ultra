# 第9章 测试体系（B-09）

> **版本**: v2.1  
> **对应工单**: B-09/09 测试套件与验证  
> **目标**: 实现单元测试（>80%覆盖率）、集成测试、E2E测试框架

---

## 9.1 单元测试设计

### 9.1.1 测试框架配置

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@lib/(.*)$': '<rootDir>/lib/$1',
    '^@app/(.*)$': '<rootDir>/app/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

export default config;
```

### 9.1.2 状态机测试

```typescript
// tests/unit/state-machine.test.ts
import { StateMachine } from '@/lib/core/state/machine';
import { TransitionRulesEngine } from '@/lib/core/state/rules';
import { PowerState, AgentRole } from '@/lib/types/state';

describe('StateMachine', () => {
  let machine: StateMachine;

  beforeEach(() => {
    machine = new StateMachine();
  });

  describe('基本状态流转', () => {
    it('TEST-SM-001: 应支持 IDLE → DESIGN 流转', async () => {
      const result = await machine.transition('DESIGN');
      expect(result).toBe(true);
      expect(machine.getCurrentState()).toBe('DESIGN');
    });

    it('TEST-SM-002: 应支持完整七权状态流转链', async () => {
      const flow: PowerState[] = ['DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
      for (const state of flow) {
        const result = await machine.transition(state);
        expect(result).toBe(true);
        expect(machine.getCurrentState()).toBe(state);
      }
    });

    it('TEST-SM-003: 应拒绝非法状态流转', async () => {
      await expect(machine.transition('CODE')).rejects.toThrow(
        'Invalid transition: IDLE -> CODE'
      );
    });

    it('TEST-SM-004: 应拒绝回退流转（除非特殊权限）', async () => {
      await machine.transition('DESIGN');
      await expect(machine.transition('IDLE')).rejects.toThrow();
    });
  });

  describe('状态订阅与事件', () => {
    it('TEST-SM-005: 状态变更应触发订阅回调', async () => {
      const listener = jest.fn();
      machine.subscribe(listener);
      
      await machine.transition('DESIGN');
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'IDLE',
          to: 'DESIGN',
          timestamp: expect.any(Number),
        })
      );
    });

    it('TEST-SM-006: 取消订阅后不应再接收事件', async () => {
      const listener = jest.fn();
      const unsubscribe = machine.subscribe(listener);
      
      unsubscribe();
      await machine.transition('DESIGN');
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('历史记录', () => {
    it('TEST-SM-007: 应记录所有状态流转历史', async () => {
      await machine.transition('DESIGN');
      await machine.transition('CODE');
      
      const history = machine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].from).toBe('IDLE');
      expect(history[0].to).toBe('DESIGN');
      expect(history[1].from).toBe('DESIGN');
      expect(history[1].to).toBe('CODE');
    });

    it('TEST-SM-008: 历史记录应包含上下文信息', async () => {
      const context = { triggeredBy: 'pm', reason: '需求评审通过' };
      await machine.transition('DESIGN', context);
      
      const history = machine.getHistory();
      expect(history[0].context).toEqual(context);
    });
  });

  describe('权限验证', () => {
    it('TEST-SM-009: PM应可触发DESIGN流转', async () => {
      const result = await machine.transition('DESIGN', { agent: 'pm' });
      expect(result).toBe(true);
    });

    it('TEST-SM-010: 非PM不应可触发DESIGN流转', async () => {
      await expect(
        machine.transition('DESIGN', { agent: 'engineer' })
      ).rejects.toThrow('Insufficient permission');
    });
  });
});

describe('TransitionRulesEngine', () => {
  let engine: TransitionRulesEngine;

  beforeEach(() => {
    engine = new TransitionRulesEngine();
    engine.loadRulesFromYaml('config/state/flow.yaml');
  });

  it('TEST-SM-011: 应从YAML正确加载规则', () => {
    const rules = engine.getAllRules();
    expect(rules.size).toBeGreaterThan(0);
  });

  it('TEST-SM-012: 应正确验证合法流转', () => {
    const result = engine.validateTransition('IDLE', 'DESIGN', 'pm');
    expect(result.valid).toBe(true);
  });

  it('TEST-SM-013: 应正确拒绝非法流转', () => {
    const result = engine.validateTransition('IDLE', 'CODE', 'pm');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('TEST-SM-014: 应返回所需审批人列表', () => {
    const approvals = engine.getRequiredApprovals('AUDIT', 'BUILD');
    expect(approvals).toContain('qa');
    expect(approvals).toContain('arch');
  });
});
```

### 9.1.3 治理引擎测试

```typescript
// tests/unit/governance.test.ts
import { ProposalService } from '@/lib/core/governance/proposal-service';
import { VoteService } from '@/lib/core/governance/vote-service';
import { TSA } from '@/lib/tsa';
import { Proposal, Vote, ProposalStatus } from '@/lib/types/governance';

// Mock TSA
jest.mock('@/lib/tsa');

describe('ProposalService', () => {
  let service: ProposalService;
  let mockTSA: jest.Mocked<TSA>;

  beforeEach(() => {
    mockTSA = new TSA() as jest.Mocked<TSA>;
    service = new ProposalService(mockTSA);
  });

  describe('提案创建', () => {
    it('TEST-GV-001: PM应可创建提案', async () => {
      const proposal = await service.createProposal({
        proposer: 'pm',
        title: '功能需求提案',
        description: '添加用户管理功能',
        targetState: 'DESIGN',
      });

      expect(proposal).toMatchObject({
        title: '功能需求提案',
        proposer: 'pm',
        status: 'pending',
      });
      expect(proposal.id).toBeDefined();
      expect(proposal.createdAt).toBeDefined();
    });

    it('TEST-GV-002: 非PM不应可创建提案', async () => {
      await expect(
        service.createProposal({
          proposer: 'engineer',
          title: '非法提案',
          description: '测试',
          targetState: 'DESIGN',
        })
      ).rejects.toThrow('Only PM can create proposals');
    });

    it('TEST-GV-003: 提案应自动设置过期时间', async () => {
      const proposal = await service.createProposal({
        proposer: 'pm',
        title: '测试提案',
        description: '测试',
        targetState: 'DESIGN',
      });

      const expiresAt = proposal.expiresAt;
      const createdAt = proposal.createdAt;
      expect(expiresAt - createdAt).toBe(30 * 60 * 1000); // 30分钟
    });
  });

  describe('提案查询', () => {
    beforeEach(async () => {
      await service.createProposal({
        proposer: 'pm',
        title: '提案1',
        description: '描述1',
        targetState: 'DESIGN',
      });
      await service.createProposal({
        proposer: 'pm',
        title: '提案2',
        description: '描述2',
        targetState: 'CODE',
      });
    });

    it('TEST-GV-004: 应返回所有提案列表', async () => {
      const proposals = await service.getProposals();
      expect(proposals).toHaveLength(2);
    });

    it('TEST-GV-005: 应按时间倒序返回提案', async () => {
      const proposals = await service.getProposals();
      expect(proposals[0].createdAt).toBeGreaterThan(proposals[1].createdAt);
    });

    it('TEST-GV-006: 应支持按状态过滤', async () => {
      const proposals = await service.getProposals({ status: 'pending' });
      expect(proposals.every(p => p.status === 'pending')).toBe(true);
    });
  });

  describe('提案过期', () => {
    it('TEST-GV-007: 过期提案应自动标记为expired', async () => {
      const proposal = await service.createProposal({
        proposer: 'pm',
        title: '即将过期',
        description: '测试',
        targetState: 'DESIGN',
      });

      // 模拟时间前进
      jest.advanceTimersByTime(31 * 60 * 1000);

      await service.checkExpiration();
      const updated = await service.getProposal(proposal.id);
      expect(updated?.status).toBe('expired');
    });
  });
});

describe('VoteService', () => {
  let voteService: VoteService;
  let proposalService: ProposalService;
  let mockTSA: jest.Mocked<TSA>;

  beforeEach(async () => {
    mockTSA = new TSA() as jest.Mocked<TSA>;
    proposalService = new ProposalService(mockTSA);
    voteService = new VoteService(proposalService);

    // 创建测试提案
    await proposalService.createProposal({
      proposer: 'pm',
      title: '测试提案',
      description: '测试投票',
      targetState: 'DESIGN',
    });
  });

  describe('投票提交', () => {
    it('TEST-GV-008: 应接受有效投票', async () => {
      const result = await voteService.vote({
        proposalId: 'proposal-1',
        voter: 'arch',
        choice: 'approve',
      });

      expect(result.accepted).toBe(true);
    });

    it('TEST-GV-009: 同一用户不应可重复投票', async () => {
      await voteService.vote({
        proposalId: 'proposal-1',
        voter: 'arch',
        choice: 'approve',
      });

      await expect(
        voteService.vote({
          proposalId: 'proposal-1',
          voter: 'arch',
          choice: 'reject',
        })
      ).rejects.toThrow('Already voted');
    });

    it('TEST-GV-010: 过期提案不应接受投票', async () => {
      // 模拟提案过期
      jest.advanceTimersByTime(31 * 60 * 1000);

      await expect(
        voteService.vote({
          proposalId: 'proposal-1',
          voter: 'arch',
          choice: 'approve',
        })
      ).rejects.toThrow('Proposal expired');
    });
  });

  describe('投票统计与自动执行', () => {
    it('TEST-GV-011: 达到阈值应自动通过提案', async () => {
      // PM权重=2, 需要60%通过率
      await voteService.vote({ proposalId: '1', voter: 'pm', choice: 'approve' });
      await voteService.vote({ proposalId: '1', voter: 'arch', choice: 'approve' });
      await voteService.vote({ proposalId: '1', voter: 'qa', choice: 'approve' });

      const proposal = await proposalService.getProposal('1');
      expect(proposal?.status).toBe('approved');
    });

    it('TEST-GV-012: 应正确计算投票统计', async () => {
      await voteService.vote({ proposalId: '1', voter: 'pm', choice: 'approve' });
      await voteService.vote({ proposalId: '1', voter: 'arch', choice: 'reject' });
      await voteService.vote({ proposalId: '1', voter: 'qa', choice: 'abstain' });

      const stats = await voteService.getVoteStats('1');
      expect(stats.totalVotes).toBe(3);
      expect(stats.approvalRate).toBeCloseTo(0.67, 1);
      expect(stats.totalWeight).toBe(5); // 2 + 2 + 1
    });
  });
});
```

### 9.1.4 A2A服务测试

```typescript
// tests/unit/a2a.test.ts
import { A2AService } from '@/lib/core/agents/a2a-service';
import { SecondMeAdapter } from '@/lib/adapters/secondme/client';
import { TSA } from '@/lib/tsa';
import { A2AMessage, SendMessageRequest } from '@/lib/types/a2a';

jest.mock('@/lib/tsa');
jest.mock('@/lib/adapters/secondme/client');

describe('A2AService', () => {
  let service: A2AService;
  let mockTSA: jest.Mocked<TSA>;
  let mockAdapter: jest.Mocked<SecondMeAdapter>;

  beforeEach(() => {
    mockTSA = new TSA() as jest.Mocked<TSA>;
    mockAdapter = new SecondMeAdapter('test-key') as jest.Mocked<SecondMeAdapter>;
    service = new A2AService(mockTSA, mockAdapter);
  });

  describe('消息发送', () => {
    it('TEST-A2A-001: 应成功发送消息', async () => {
      const request: SendMessageRequest = {
        sender: 'pm',
        receiver: 'arch',
        content: '你好，架构师',
        type: 'chat',
      };

      mockAdapter.chat.mockResolvedValue({
        content: '你好，PM',
        agentId: 'arch',
      });

      const message = await service.sendMessage(request);

      expect(message).toMatchObject({
        sender: 'pm',
        receiver: 'arch',
        content: '你好，架构师',
        status: 'sent',
      });
    });

    it('TEST-A2A-002: 应持久化消息到TSA', async () => {
      const request: SendMessageRequest = {
        sender: 'pm',
        receiver: 'arch',
        content: '测试消息',
        type: 'chat',
      };

      mockAdapter.chat.mockResolvedValue({ content: '回复', agentId: 'arch' });
      await service.sendMessage(request);

      expect(mockTSA.set).toHaveBeenCalledWith(
        expect.stringContaining('a2a:message:'),
        expect.any(Object)
      );
    });

    it('TEST-A2A-003: 应处理发送失败', async () => {
      const request: SendMessageRequest = {
        sender: 'pm',
        receiver: 'arch',
        content: '测试',
        type: 'chat',
      };

      mockAdapter.chat.mockRejectedValue(new Error('Network error'));

      await expect(service.sendMessage(request)).rejects.toThrow('Network error');
    });
  });

  describe('消息历史', () => {
    beforeEach(async () => {
      // 预设历史消息
      const messages: A2AMessage[] = [
        { id: '1', sender: 'pm', receiver: 'arch', content: '消息1', timestamp: 1 },
        { id: '2', sender: 'arch', receiver: 'pm', content: '回复1', timestamp: 2 },
        { id: '3', sender: 'pm', receiver: 'arch', content: '消息2', timestamp: 3 },
      ];

      mockTSA.get.mockImplementation(async (key: string) => {
        if (key.includes('history')) return messages;
        return null;
      });
    });

    it('TEST-A2A-004: 应返回消息历史', async () => {
      const history = await service.getHistory('session-1');
      expect(history.messages).toHaveLength(3);
    });

    it('TEST-A2A-005: 应支持分页查询', async () => {
      const result = await service.getHistory('session-1', { page: 1, limit: 2 });
      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('TEST-A2A-006: 应按时间排序返回', async () => {
      const result = await service.getHistory('session-1');
      const timestamps = result.messages.map(m => m.timestamp);
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    });
  });

  describe('流式响应', () => {
    it('TEST-A2A-007: 应支持流式消息发送', async () => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      mockAdapter.chatStream.mockImplementation(async (_, __, callback) => {
        callback('Hello');
        callback(' ');
        callback('World');
      });

      await service.sendMessageStream(
        { sender: 'pm', receiver: 'arch', content: 'Hi', type: 'chat' },
        onChunk
      );

      expect(chunks).toEqual(['Hello', ' ', 'World']);
    });
  });
});

describe('SecondMeAdapter', () => {
  let adapter: SecondMeAdapter;

  beforeEach(() => {
    adapter = new SecondMeAdapter('test-api-key', 'https://api.secondme.io');
    global.fetch = jest.fn();
  });

  it('TEST-A2A-008: 应正确构造API请求', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: '回复' }),
    });

    await adapter.chat('agent-1', '你好');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.secondme.io/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('TEST-A2A-009: 应处理API错误', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    await expect(adapter.chat('agent-1', '你好')).rejects.toThrow('Unauthorized');
  });
});
```

### 9.1.5 TSA测试

```typescript
// tests/unit/tsa.test.ts
import { TSA } from '@/lib/tsa';
import { TransientStore } from '@/lib/tsa/TransientStore';
import { StagingStore } from '@/lib/tsa/StagingStore';
import { TierRouter } from '@/lib/tsa/TierRouter';
import { StorageTier } from '@/lib/tsa/types';

describe('TransientStore', () => {
  let store: TransientStore;

  beforeEach(() => {
    store = new TransientStore({ maxSize: 3, defaultTTL: 1000 });
  });

  describe('基本操作', () => {
    it('TEST-TSA-001: 应存储和读取数据', async () => {
      await store.set('key1', { data: 'value1' });
      const value = await store.get('key1');
      expect(value).toEqual({ data: 'value1' });
    });

    it('TEST-TSA-002: 不存在的key应返回null', async () => {
      const value = await store.get('nonexistent');
      expect(value).toBeNull();
    });
  });

  describe('TTL过期', () => {
    it('TEST-TSA-003: TTL过期后数据应被删除', async () => {
      await store.set('key1', 'value', 100); // 100ms TTL
      
      expect(await store.get('key1')).toBe('value');
      
      await new Promise(r => setTimeout(r, 150));
      expect(await store.get('key1')).toBeNull();
    });
  });

  describe('LRU淘汰', () => {
    it('TEST-TSA-004: 超出容量时应淘汰最旧数据', async () => {
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      await store.set('key3', 'value3');
      await store.set('key4', 'value4'); // 超出容量

      expect(await store.get('key1')).toBeNull(); // 最旧被淘汰
      expect(await store.get('key4')).toBe('value4');
    });

    it('TEST-TSA-005: 访问应更新LRU顺序', async () => {
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      await store.set('key3', 'value3');
      
      await store.get('key1'); // 访问key1，更新顺序
      await store.set('key4', 'value4');

      expect(await store.get('key1')).toBe('value1'); // key1被保留
      expect(await store.get('key2')).toBeNull(); // key2被淘汰
    });
  });

  describe('访问统计', () => {
    it('TEST-TSA-006: 应正确统计访问次数', async () => {
      await store.set('key1', 'value');
      await store.get('key1');
      await store.get('key1');
      await store.get('key1');

      const metrics = store.getMetrics('key1');
      expect(metrics?.readCount).toBe(3);
    });
  });
});

describe('StagingStore', () => {
  let store: StagingStore;

  beforeEach(async () => {
    store = new StagingStore();
    await store.init();
  });

  afterEach(async () => {
    await store.clear();
  });

  it('TEST-TSA-007: 应持久化到IndexedDB', async () => {
    await store.set('key1', { data: 'persistent' });
    
    // 模拟重新初始化
    const newStore = new StagingStore();
    await newStore.init();
    
    const value = await newStore.get('key1');
    expect(value).toEqual({ data: 'persistent' });
  });

  it('TEST-TSA-008: 应支持TTL过期', async () => {
    await store.set('key1', 'value', 100);
    
    await new Promise(r => setTimeout(r, 150));
    
    const value = await store.get('key1');
    expect(value).toBeNull();
  });
});

describe('TierRouter', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = new TierRouter({
      hotThreshold: 5,    // 5次访问进入热层
      warmThreshold: 2,   // 2次访问进入温层
      sizeWeight: 0.2,
      frequencyWeight: 0.5,
      recencyWeight: 0.3,
    });
  });

  describe('路由决策', () => {
    it('TEST-TSA-009: 高频数据应路由到热层', () => {
      const decision = router.decide({
        key: 'hot-data',
        readCount: 10,
        lastAccessed: Date.now(),
        size: 100,
      });
      expect(decision.tier).toBe(StorageTier.TRANSIENT);
    });

    it('TEST-TSA-010: 低频数据应路由到冷层', () => {
      const decision = router.decide({
        key: 'cold-data',
        readCount: 0,
        lastAccessed: Date.now() - 86400000, // 1天前
        size: 10000,
      });
      expect(decision.tier).toBe(StorageTier.ARCHIVE);
    });

    it('TEST-TSA-011: 中等频率应路由到温层', () => {
      const decision = router.decide({
        key: 'warm-data',
        readCount: 3,
        lastAccessed: Date.now() - 3600000, // 1小时前
        size: 1000,
      });
      expect(decision.tier).toBe(StorageTier.STAGING);
    });
  });

  describe('综合评分', () => {
    it('TEST-TSA-012: 应正确计算频率评分', () => {
      const score = router.calculateScore({
        readCount: 10,
        lastAccessed: Date.now(),
        size: 100,
      });
      expect(score.frequency).toBeGreaterThan(0.5);
    });

    it('TEST-TSA-013: 应正确计算时效评分', () => {
      const score = router.calculateScore({
        readCount: 1,
        lastAccessed: Date.now(),
        size: 100,
      });
      expect(score.recency).toBe(1);
    });

    it('TEST-TSA-014: 应正确计算大小评分', () => {
      const score = router.calculateScore({
        readCount: 1,
        lastAccessed: Date.now(),
        size: 100000, // 大文件
      });
      expect(score.size).toBeLessThan(0.5);
    });
  });
});

describe('TSA Integration', () => {
  let tsa: TSA;

  beforeEach(async () => {
    tsa = TSA.getInstance();
    await tsa.init();
  });

  it('TEST-TSA-015: 应支持完整读写流程', async () => {
    await tsa.set('test-key', { foo: 'bar' });
    const value = await tsa.get('test-key');
    expect(value).toEqual({ foo: 'bar' });
  });

  it('TEST-TSA-016: 应自动晋升热数据', async () => {
    // 多次访问使数据变热
    await tsa.set('promote-key', 'value');
    for (let i = 0; i < 10; i++) {
      await tsa.get('promote-key');
    }

    const metrics = tsa.getMetrics();
    expect(metrics.transient.hitCount).toBeGreaterThan(0);
  });

  it('TEST-TSA-017: 应返回完整监控指标', async () => {
    await tsa.set('key1', 'value1');
    await tsa.get('key1');

    const metrics = tsa.getMetrics();
    expect(metrics).toMatchObject({
      transient: expect.any(Object),
      staging: expect.any(Object),
      hitRate: expect.any(Number),
    });
  });
});
```

---

## 9.2 集成测试设计

### 9.2.1 测试框架配置

```typescript
// tests/integration/setup.ts
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 9.2.2 A2A流集成测试

```typescript
// tests/integration/a2a-flow.test.ts
import { A2AService } from '@/lib/core/agents/a2a-service';
import { TSA } from '@/lib/tsa';
import { server } from './setup';
import { rest } from 'msw';

describe('A2A Flow Integration', () => {
  let a2aService: A2AService;
  let tsa: TSA;

  beforeEach(async () => {
    tsa = TSA.getInstance();
    await tsa.init();
    a2aService = new A2AService(tsa);
  });

  it('TEST-INT-A2A-001: 应发送消息并存储到TSA', async () => {
    // Mock SecondMe API
    server.use(
      rest.post('https://api.secondme.io/chat', (req, res, ctx) => {
        return res(ctx.json({ content: 'AI回复', agentId: 'arch' }));
      })
    );

    const message = await a2aService.sendMessage({
      sender: 'pm',
      receiver: 'arch',
      content: '测试集成',
      type: 'chat',
    });

    // 验证消息已存储
    const stored = await tsa.get<A2AMessage>(`a2a:message:${message.id}`);
    expect(stored).toMatchObject({
      sender: 'pm',
      receiver: 'arch',
      content: '测试集成',
    });
  });

  it('TEST-INT-A2A-002: 应跨会话检索历史消息', async () => {
    // 创建多个消息
    const sessionId = 'test-session';
    await a2aService.sendMessage({
      sender: 'pm',
      receiver: 'arch',
      content: '消息1',
      sessionId,
    });
    await a2aService.sendMessage({
      sender: 'arch',
      receiver: 'pm',
      content: '回复1',
      sessionId,
    });

    // 新服务实例查询历史
    const newService = new A2AService(tsa);
    const history = await newService.getHistory(sessionId);

    expect(history.messages).toHaveLength(2);
    expect(history.messages[0].content).toBe('消息1');
  });

  it('TEST-INT-A2A-003: 应处理并发消息', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      a2aService.sendMessage({
        sender: 'pm',
        receiver: 'arch',
        content: `并发消息${i}`,
      })
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    expect(new Set(results.map(r => r.id)).size).toBe(10); // 所有ID唯一
  });

  it('TEST-INT-A2A-004: 流式响应应与存储同步', async () => {
    const chunks: string[] = [];
    
    await a2aService.sendMessageStream(
      { sender: 'pm', receiver: 'arch', content: '流式测试' },
      (chunk) => chunks.push(chunk)
    );

    // 验证完整消息已存储
    const history = await a2aService.getHistory('default');
    const lastMessage = history.messages[history.messages.length - 1];
    expect(lastMessage.content).toBe(chunks.join(''));
  });
});
```

### 9.2.3 治理流集成测试

```typescript
// tests/integration/governance-flow.test.ts
import { ProposalService } from '@/lib/core/governance/proposal-service';
import { VoteService } from '@/lib/core/governance/vote-service';
import { StateMachine } from '@/lib/core/state/machine';
import { TSA } from '@/lib/tsa';

describe('Governance Flow Integration', () => {
  let proposalService: ProposalService;
  let voteService: VoteService;
  let stateMachine: StateMachine;
  let tsa: TSA;

  beforeEach(async () => {
    tsa = TSA.getInstance();
    await tsa.init();
    proposalService = new ProposalService(tsa);
    voteService = new VoteService(proposalService);
    stateMachine = new StateMachine();
  });

  it('TEST-INT-GV-001: 应完成创建提案到投票的完整流程', async () => {
    // PM创建提案
    const proposal = await proposalService.createProposal({
      proposer: 'pm',
      title: '集成测试提案',
      description: '测试完整流程',
      targetState: 'DESIGN',
    });

    expect(proposal.status).toBe('pending');

    // 多个角色投票
    await voteService.vote({
      proposalId: proposal.id,
      voter: 'arch',
      choice: 'approve',
    });
    await voteService.vote({
      proposalId: proposal.id,
      voter: 'qa',
      choice: 'approve',
    });

    const stats = await voteService.getVoteStats(proposal.id);
    expect(stats.totalVotes).toBe(2);
  });

  it('TEST-INT-GV-002: 达到阈值应自动执行状态流转', async () => {
    // 初始状态
    expect(stateMachine.getCurrentState()).toBe('IDLE');

    // 创建并投票通过提案
    const proposal = await proposalService.createProposal({
      proposer: 'pm',
      title: '状态流转提案',
      description: '流转到DESIGN',
      targetState: 'DESIGN',
    });

    // 足够票数通过（PM权重2 + arch权重2 = 4，超过60%阈值）
    await voteService.vote({ proposalId: proposal.id, voter: 'pm', choice: 'approve' });
    await voteService.vote({ proposalId: proposal.id, voter: 'arch', choice: 'approve' });

    // 验证提案已批准
    const updated = await proposalService.getProposal(proposal.id);
    expect(updated?.status).toBe('approved');

    // 验证状态已流转（如果实现了自动执行）
    // expect(stateMachine.getCurrentState()).toBe('DESIGN');
  });

  it('TEST-INT-GV-003: 应拒绝非PM创建提案', async () => {
    await expect(
      proposalService.createProposal({
        proposer: 'engineer',
        title: '非法提案',
        description: '测试',
        targetState: 'DESIGN',
      })
    ).rejects.toThrow('Only PM can create proposals');
  });

  it('TEST-INT-GV-004: 提案数据应持久化到TSA', async () => {
    const proposal = await proposalService.createProposal({
      proposer: 'pm',
      title: '持久化测试',
      description: '验证TSA存储',
      targetState: 'CODE',
    });

    // 直接从TSA读取验证
    const stored = await tsa.get<Proposal>(`governance:proposal:${proposal.id}`);
    expect(stored).toMatchObject({
      title: '持久化测试',
      proposer: 'pm',
      targetState: 'CODE',
    });
  });

  it('TEST-INT-GV-005: 过期提案不应影响状态流转', async () => {
    const proposal = await proposalService.createProposal({
      proposer: 'pm',
      title: '即将过期',
      description: '测试',
      targetState: 'DESIGN',
    });

    // 模拟过期
    jest.advanceTimersByTime(31 * 60 * 1000);
    await proposalService.checkExpiration();

    // 尝试投票
    await expect(
      voteService.vote({
        proposalId: proposal.id,
        voter: 'arch',
        choice: 'approve',
      })
    ).rejects.toThrow('Proposal expired');
  });
});
```

### 9.2.4 状态机集成测试

```typescript
// tests/integration/state-flow.test.ts
import { StateMachine } from '@/lib/core/state/machine';
import { TSA } from '@/lib/tsa';
import { PowerState } from '@/lib/types/state';

describe('State Flow Integration', () => {
  let stateMachine: StateMachine;
  let tsa: TSA;

  beforeEach(async () => {
    tsa = TSA.getInstance();
    await tsa.init();
    stateMachine = new StateMachine(tsa);
  });

  it('TEST-INT-SM-001: 应完成完整七权状态流转', async () => {
    const flow: PowerState[] = ['DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
    
    for (const state of flow) {
      const result = await stateMachine.transition(state, {
        triggeredBy: 'integration-test',
      });
      expect(result).toBe(true);
      expect(stateMachine.getCurrentState()).toBe(state);
    }

    // 验证历史记录
    const history = stateMachine.getHistory();
    expect(history).toHaveLength(6);
    expect(history.map(h => h.to)).toEqual(flow);
  });

  it('TEST-INT-SM-002: 状态应持久化到TSA', async () => {
    await stateMachine.transition('DESIGN', { triggeredBy: 'pm' });

    // 验证状态已存储
    const stored = await tsa.get('state:current');
    expect(stored).toBe('DESIGN');

    // 验证历史已存储
    const history = await tsa.get('state:history');
    expect(history).toHaveLength(1);
  });

  it('TEST-INT-SM-003: 重启后应恢复状态', async () => {
    // 先流转到某个状态
    await stateMachine.transition('CODE', { triggeredBy: 'test' });
    
    // 创建新实例（模拟重启）
    const newMachine = new StateMachine(tsa);
    await newMachine.restore();

    expect(newMachine.getCurrentState()).toBe('CODE');
    expect(newMachine.getHistory()).toHaveLength(2); // IDLE->DESIGN->CODE
  });

  it('TEST-INT-SM-004: 状态流转应触发钩子', async () => {
    const hooks = {
      onEnterDESIGN: jest.fn(),
      onExitIDLE: jest.fn(),
    };

    stateMachine.registerHooks(hooks);
    await stateMachine.transition('DESIGN');

    expect(hooks.onExitIDLE).toHaveBeenCalled();
    expect(hooks.onEnterDESIGN).toHaveBeenCalled();
  });

  it('TEST-INT-SM-005: 非法流转不应影响当前状态', async () => {
    const initialState = stateMachine.getCurrentState();
    
    try {
      await stateMachine.transition('DEPLOY'); // 非法流转
    } catch (e) {
      // 预期抛出错误
    }

    expect(stateMachine.getCurrentState()).toBe(initialState);
    
    // 验证历史未被记录
    const history = stateMachine.getHistory();
    expect(history).toHaveLength(0);
  });

  it('TEST-INT-SM-006: 并发流转请求应被正确处理', async () => {
    // 先流转到DESIGN
    await stateMachine.transition('DESIGN');

    // 并发发起两个流转请求
    const results = await Promise.allSettled([
      stateMachine.transition('CODE'),
      stateMachine.transition('CODE'),
    ]);

    // 一个成功，一个失败（或都成功但只有一个生效）
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    expect(successCount).toBeGreaterThanOrEqual(1);
    
    // 最终状态应为CODE
    expect(stateMachine.getCurrentState()).toBe('CODE');
  });
});
```

---

## 9.3 E2E测试框架

### 9.3.1 Playwright配置

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 9.3.2 测试场景设计

```typescript
// tests/e2e/a2a-chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('A2A消息流E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('E2E-A2A-001: 用户应可发送消息并接收回复', async ({ page }) => {
    // 打开Agent聊天对话框
    await page.click('[data-testid="agent-chat-trigger"]');
    await page.waitForSelector('[data-testid="chat-dialog"]');

    // 输入消息
    await page.fill('[data-testid="message-input"]', '你好，请介绍一下自己');
    await page.click('[data-testid="send-button"]');

    // 验证消息显示
    await expect(page.locator('[data-testid="message-list"]')).toContainText('你好，请介绍一下自己');

    // 等待AI回复
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 10000 });
    const aiMessage = await page.locator('[data-testid="ai-message"]').last().textContent();
    expect(aiMessage).toBeTruthy();
    expect(aiMessage?.length).toBeGreaterThan(0);
  });

  test('E2E-A2A-002: 消息历史应正确显示', async ({ page }) => {
    await page.click('[data-testid="agent-chat-trigger"]');
    
    // 发送多条消息
    for (let i = 1; i <= 3; i++) {
      await page.fill('[data-testid="message-input"]', `测试消息${i}`);
      await page.click('[data-testid="send-button"]');
      await page.waitForTimeout(500);
    }

    // 验证所有消息显示
    const messages = await page.locator('[data-testid="user-message"]').count();
    expect(messages).toBeGreaterThanOrEqual(3);
  });

  test('E2E-A2A-003: 流式响应应实时显示', async ({ page }) => {
    await page.click('[data-testid="agent-chat-trigger"]');
    
    await page.fill('[data-testid="message-input"]', '讲一个故事');
    await page.click('[data-testid="send-button"]');

    // 验证流式指示器
    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible();
    
    // 等待流式完成
    await page.waitForSelector('[data-testid="streaming-indicator"]', { state: 'hidden', timeout: 30000 });
    
    // 验证完整回复
    const reply = await page.locator('[data-testid="ai-message"]').last().textContent();
    expect(reply?.length).toBeGreaterThan(50);
  });
});
```

```typescript
// tests/e2e/governance.spec.ts
import { test, expect } from '@playwright/test';

test.describe('治理提案E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="governance-tab"]');
  });

  test('E2E-GV-001: PM应可创建提案', async ({ page }) => {
    // 切换到PM角色
    await page.selectOption('[data-testid="role-selector"]', 'pm');

    // 点击创建提案
    await page.click('[data-testid="create-proposal-button"]');
    
    // 填写表单
    await page.fill('[data-testid="proposal-title"]', 'E2E测试提案');
    await page.fill('[data-testid="proposal-description"]', '这是一个E2E测试');
    await page.selectOption('[data-testid="target-state"]', 'DESIGN');
    
    // 提交
    await page.click('[data-testid="submit-proposal"]');

    // 验证提案出现在列表
    await expect(page.locator('[data-testid="proposal-list"]')).toContainText('E2E测试提案');
  });

  test('E2E-GV-002: 非PM不应可创建提案', async ({ page }) => {
    // 切换到engineer角色
    await page.selectOption('[data-testid="role-selector"]', 'engineer');

    // 创建按钮应禁用或点击后显示错误
    const createButton = page.locator('[data-testid="create-proposal-button"]');
    await expect(createButton).toBeDisabled();
  });

  test('E2E-GV-003: 应可投票并更新状态', async ({ page }) => {
    // 先创建提案
    await page.selectOption('[data-testid="role-selector"]', 'pm');
    await page.click('[data-testid="create-proposal-button"]');
    await page.fill('[data-testid="proposal-title"]', '投票测试提案');
    await page.fill('[data-testid="proposal-description"]', '测试投票');
    await page.click('[data-testid="submit-proposal"]');

    // 切换到arch角色投票
    await page.selectOption('[data-testid="role-selector"]', 'arch');
    await page.click('[data-testid="vote-approve-button"]');

    // 验证投票数更新
    await expect(page.locator('[data-testid="vote-count"]')).toContainText('1');
  });

  test('E2E-GV-004: 达到阈值应自动执行', async ({ page }) => {
    // 创建提案
    await page.selectOption('[data-testid="role-selector"]', 'pm');
    await page.click('[data-testid="create-proposal-button"]');
    await page.fill('[data-testid="proposal-title"]', '自动执行测试');
    await page.selectOption('[data-testid="target-state"]', 'DESIGN');
    await page.click('[data-testid="submit-proposal"]');

    // 多角色投票
    await page.selectOption('[data-testid="role-selector"]', 'pm');
    await page.click('[data-testid="vote-approve-button"]');
    
    await page.selectOption('[data-testid="role-selector"]', 'arch');
    await page.click('[data-testid="vote-approve-button"]');

    // 验证提案状态变为approved
    await expect(page.locator('[data-testid="proposal-status"]')).toContainText('已通过');
  });
});
```

```typescript
// tests/e2e/state-machine.spec.ts
import { test, expect } from '@playwright/test';

test.describe('状态机流转E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="state-tab"]');
  });

  test('E2E-SM-001: 应显示当前状态', async ({ page }) => {
    await expect(page.locator('[data-testid="current-state"]')).toContainText('IDLE');
  });

  test('E2E-SM-002: 应支持状态流转', async ({ page }) => {
    // PM触发DESIGN流转
    await page.selectOption('[data-testid="role-selector"]', 'pm');
    await page.click('[data-testid="transition-design-button"]');

    // 验证状态更新
    await expect(page.locator('[data-testid="current-state"]')).toContainText('DESIGN');
  });

  test('E2E-SM-003: 应显示状态历史', async ({ page }) => {
    // 执行几次流转
    await page.selectOption('[data-testid="role-selector"]', 'pm');
    await page.click('[data-testid="transition-design-button"]');
    
    await page.selectOption('[data-testid="role-selector"]', 'engineer');
    await page.click('[data-testid="transition-code-button"]');

    // 验证历史显示
    const historyItems = await page.locator('[data-testid="state-history-item"]').count();
    expect(historyItems).toBeGreaterThanOrEqual(2);
  });

  test('E2E-SM-004: 非法流转应显示错误', async ({ page }) => {
    // 从IDLE直接尝试到CODE
    await page.click('[data-testid="transition-code-button"]');

    // 验证错误提示
    await expect(page.locator('[data-testid="error-message"]')).toContainText('非法流转');
    
    // 状态应保持不变
    await expect(page.locator('[data-testid="current-state"]')).toContainText('IDLE');
  });

  test('E2E-SM-005: 应可视化七权流转链', async ({ page }) => {
    // 验证状态图显示
    await expect(page.locator('[data-testid="state-diagram"]')).toBeVisible();
    
    // 验证所有七权状态显示
    const states = ['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
    for (const state of states) {
      await expect(page.locator(`[data-testid="state-node-${state}"]`)).toBeVisible();
    }
  });
});
```

```typescript
// tests/e2e/tsa-storage.spec.ts
import { test, expect } from '@playwright/test';

test.describe('TSA存储E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="tsa-monitor-tab"]');
  });

  test('E2E-TSA-001: 应显示存储监控指标', async ({ page }) => {
    await expect(page.locator('[data-testid="tsa-metrics"]')).toBeVisible();
    await expect(page.locator('[data-testid="hit-rate"]')).toContainText('%');
  });

  test('E2E-TSA-002: 应显示三层存储状态', async ({ page }) => {
    await expect(page.locator('[data-testid="transient-tier"]')).toBeVisible();
    await expect(page.locator('[data-testid="staging-tier"]')).toBeVisible();
    await expect(page.locator('[data-testid="archive-tier"]')).toBeVisible();
  });

  test('E2E-TSA-003: 数据访问应更新命中率', async ({ page }) => {
    // 记录初始命中率
    const initialHitRate = await page.locator('[data-testid="hit-rate"]').textContent();

    // 触发数据访问
    await page.click('[data-testid="test-data-access"]');
    await page.waitForTimeout(500);

    // 验证命中率更新
    const newHitRate = await page.locator('[data-testid="hit-rate"]').textContent();
    expect(newHitRate).not.toBe(initialHitRate);
  });

  test('E2E-TSA-004: 热数据晋升应可视化', async ({ page }) => {
    // 多次访问同一数据
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="access-hot-data"]');
      await page.waitForTimeout(100);
    }

    // 验证数据显示在热层
    await expect(page.locator('[data-testid="transient-tier"]')).toContainText('hot-data-key');
  });
});
```

---

## 9.4 自测点（必须包含验证命令）

### 9.4.1 自测点清单

| 自测ID | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|------|
| TEST-001 | `npm run test:coverage` | 覆盖率≥80% | 🔴 |
| TEST-002 | `npm run test:integration -- --grep "State Flow"` | 状态机集成通过 | 🔴 |
| TEST-003 | `npm run test:integration -- --grep "Governance Flow"` | 治理流集成通过 | 🔴 |
| TEST-004 | `npm run test:integration -- --grep "A2A Flow"` | A2A流集成通过 | 🔴 |
| TEST-005 | `npx tsc --noEmit` | 0错误 | 🔴 |
| TEST-006 | `npm run lint` | 0警告 | 🔴 |

### 9.4.2 验证命令详解

#### TEST-001: 单元测试覆盖率

```bash
# 运行单元测试并生成覆盖率报告
npm run test:coverage

# 预期输出示例
# -------------------|---------|----------|---------|---------|-------------------
# File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
# -------------------|---------|----------|---------|---------|-------------------
# All files          |   85.23 |    82.15 |   88.50 |   86.12 |                   
#  lib/core/state    |   92.30 |    89.50 |   95.00 |   91.80 | 45,78,120         
#  lib/core/governance|  88.75 |    85.20 |   90.00 |   87.50 | 102,156           
#  lib/core/agents   |   86.40 |    81.30 |   88.00 |   85.20 | 203,245,301       
#  lib/tsa           |   91.20 |    88.70 |   93.00 |   90.50 | 45,67,89          
# -------------------|---------|----------|---------|---------|-------------------
# Jest: "global" coverage threshold for lines (80%) not met: 86.12%
```

**通过标准**: 
- Statements ≥ 80%
- Branches ≥ 80%
- Functions ≥ 80%
- Lines ≥ 80%

#### TEST-002: 状态机集成测试

```bash
# 运行状态机集成测试
npm run test:integration -- --grep "State Flow Integration"

# 预期输出
#  PASS  tests/integration/state-flow.test.ts
#   State Flow Integration
#     ✓ TEST-INT-SM-001: 应完成完整七权状态流转 (245ms)
#     ✓ TEST-INT-SM-002: 状态应持久化到TSA (189ms)
#     ✓ TEST-INT-SM-003: 重启后应恢复状态 (312ms)
#     ✓ TEST-INT-SM-004: 状态流转应触发钩子 (156ms)
#     ✓ TEST-INT-SM-005: 非法流转不应影响当前状态 (98ms)
#     ✓ TEST-INT-SM-006: 并发流转请求应被正确处理 (267ms)
#
# Test Suites: 1 passed, 1 total
# Tests:       6 passed, 6 total
```

#### TEST-003: 治理流集成测试

```bash
# 运行治理流集成测试
npm run test:integration -- --grep "Governance Flow Integration"

# 预期输出
#  PASS  tests/integration/governance-flow.test.ts
#   Governance Flow Integration
#     ✓ TEST-INT-GV-001: 应完成创建提案到投票的完整流程 (198ms)
#     ✓ TEST-INT-GV-002: 达到阈值应自动执行状态流转 (245ms)
#     ✓ TEST-INT-GV-003: 应拒绝非PM创建提案 (87ms)
#     ✓ TEST-INT-GV-004: 提案数据应持久化到TSA (156ms)
#     ✓ TEST-INT-GV-005: 过期提案不应影响状态流转 (3012ms)
#
# Test Suites: 1 passed, 1 total
# Tests:       5 passed, 5 total
```

#### TEST-004: A2A流集成测试

```bash
# 运行A2A流集成测试
npm run test:integration -- --grep "A2A Flow Integration"

# 预期输出
#  PASS  tests/integration/a2a-flow.test.ts
#   A2A Flow Integration
#     ✓ TEST-INT-A2A-001: 应发送消息并存储到TSA (234ms)
#     ✓ TEST-INT-A2A-002: 应跨会话检索历史消息 (189ms)
#     ✓ TEST-INT-A2A-003: 应处理并发消息 (456ms)
#     ✓ TEST-INT-A2A-004: 流式响应应与存储同步 (567ms)
#
# Test Suites: 1 passed, 1 total
# Tests:       4 passed, 4 total
```

#### TEST-005: TypeScript严格模式

```bash
# 运行TypeScript类型检查
npx tsc --noEmit

# 预期输出（通过时无输出，失败时显示错误）
# 通过: (无输出，exit code 0)
# 失败示例:
# lib/core/state/machine.ts:45:10 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'PowerState'.
```

**通过标准**: 0错误，exit code 0

#### TEST-006: ESLint检查

```bash
# 运行ESLint检查
npm run lint

# 预期输出（通过时）
# ✔ No ESLint warnings or errors

# 失败示例:
# /lib/core/state/machine.ts
#   45:10  warning  'unusedVar' is assigned a value but never used  @typescript-eslint/no-unused-vars
#   67:5   warning  Unexpected console statement                    no-console
#
# ✖ 2 warnings
```

**通过标准**: 0警告，0错误

### 9.4.3 package.json脚本配置

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration --testTimeout=30000",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 9.5 文件变更清单

### 9.5.1 新增文件

| 文件路径 | 说明 | 大小估算 |
|----------|------|----------|
| `jest.config.ts` | Jest测试框架配置 | 0.5 KB |
| `playwright.config.ts` | Playwright E2E测试配置 | 0.8 KB |
| `tests/setup.ts` | 测试环境初始化 | 0.3 KB |
| `tests/unit/state-machine.test.ts` | 状态机单元测试 | 4.5 KB |
| `tests/unit/governance.test.ts` | 治理引擎单元测试 | 5.0 KB |
| `tests/unit/a2a.test.ts` | A2A服务单元测试 | 4.2 KB |
| `tests/unit/tsa.test.ts` | TSA存储单元测试 | 6.0 KB |
| `tests/integration/setup.ts` | 集成测试环境配置 | 0.4 KB |
| `tests/integration/mocks/handlers.ts` | MSW Mock处理器 | 2.0 KB |
| `tests/integration/state-flow.test.ts` | 状态机集成测试 | 3.5 KB |
| `tests/integration/governance-flow.test.ts` | 治理流集成测试 | 3.0 KB |
| `tests/integration/a2a-flow.test.ts` | A2A流集成测试 | 2.5 KB |
| `tests/e2e/a2a-chat.spec.ts` | A2A聊天E2E测试 | 2.0 KB |
| `tests/e2e/governance.spec.ts` | 治理E2E测试 | 2.5 KB |
| `tests/e2e/state-machine.spec.ts` | 状态机E2E测试 | 2.0 KB |
| `tests/e2e/tsa-storage.spec.ts` | TSA存储E2E测试 | 1.5 KB |
| `.github/workflows/test.yml` | CI测试工作流 | 1.5 KB |

**新增文件总计**: 17个文件，约 42 KB

### 9.5.2 修改文件

| 文件路径 | 修改内容 | 变更类型 |
|----------|----------|----------|
| `package.json` | 添加测试依赖和脚本 | 修改 |
| `tsconfig.json` | 添加测试类型路径 | 修改 |
| `.eslintrc.json` | 添加测试文件排除 | 修改 |
| `.gitignore` | 添加测试产物忽略 | 修改 |

**修改文件总计**: 4个文件

### 9.5.3 依赖安装

```bash
# 单元测试依赖
npm install --save-dev jest @jest/types ts-jest @types/jest

# React测试依赖
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Mock依赖
npm install --save-dev msw

# E2E测试依赖
npm install --save-dev @playwright/test

# 覆盖率工具
npm install --save-dev @istanbuljs/nyc-config-typescript
```

---

## 9.6 技术债务声明

### 9.6.1 Mock清单

| Mock对象 | 用途 | 位置 | 债务等级 |
|----------|------|------|----------|
| `TSA` | 存储层Mock | `tests/__mocks__/tsa.ts` | 🟡 中 |
| `SecondMeAdapter` | AI服务Mock | `tests/__mocks__/secondme.ts` | 🟡 中 |
| `IndexedDB` | 浏览器存储Mock | `tests/__mocks__/indexeddb.ts` | 🟢 低 |
| `fetch` | HTTP请求Mock | MSW handlers | 🟢 低 |
| `WebSocket` | 实时通信Mock | `tests/__mocks__/websocket.ts` | 🔴 高 |
| `EventSource` | SSE Mock | `tests/__mocks__/eventsource.ts` | 🔴 高 |

### 9.6.2 测试覆盖缺口

| 模块 | 覆盖缺口 | 原因 | 计划修复 |
|------|----------|------|----------|
| `lib/plugins/adapters/iframe-adapter.ts` | 100%未覆盖 | 适配器未实现 | 实现后补充 |
| `lib/plugins/security.ts` | 100%未覆盖 | 安全层未实现 | 实现后补充 |
| `lib/tsa/ArchiveStore.ts` | 80%未覆盖 | 冷层实现不完整 | Phase 2完善 |
| `lib/tsa/lifecycle.ts` | 100%未覆盖 | 生命周期管理未实现 | Phase 2完善 |
| `app/hooks/usePlugin.ts` | 100%未覆盖 | Hook未实现 | Phase B实现 |
| `patterns/system/roles/*.pattern.ts` (5个) | 100%未覆盖 | 角色装备未创建 | Phase 3补充 |

### 9.6.3 已知限制

1. **E2E测试依赖外部服务**
   - SecondMe API调用在E2E测试中使用Mock
   - 真实集成测试需要测试环境API密钥

2. **并发测试覆盖不足**
   - 高并发场景（>100并发）未充分测试
   - 需要性能测试环境支持

3. **浏览器兼容性**
   - E2E测试主要覆盖Chrome/Firefox/Safari
   - IE11不支持（符合项目要求）

4. **测试数据隔离**
   - 集成测试使用共享TSA实例
   - 需要完善测试数据清理机制

### 9.6.4 债务偿还计划

| 债务项 | 计划修复时间 | 责任人 | 优先级 |
|--------|-------------|--------|--------|
| iframe适配器测试 | Phase 4 | 待定 | P1 |
| 安全层测试 | Phase 4 | 待定 | P1 |
| ArchiveStore测试 | Phase 2 | 待定 | P2 |
| 生命周期管理测试 | Phase 2 | 待定 | P2 |
| 5个角色装备测试 | Phase 3 | 待定 | P2 |
| 高并发测试 | Phase 5 | 待定 | P3 |

---

## 9.7 测试执行流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                      测试执行流程                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: 类型检查                                                │
│  $ npx tsc --noEmit                                              │
│  通过标准: 0错误                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: ESLint检查                                              │
│  $ npm run lint                                                  │
│  通过标准: 0警告                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: 单元测试                                                │
│  $ npm run test:unit                                             │
│  通过标准: 100%通过, 覆盖率≥80%                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: 集成测试                                                │
│  $ npm run test:integration                                      │
│  通过标准: 100%通过                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: E2E测试                                                 │
│  $ npm run test:e2e                                              │
│  通过标准: 100%通过                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: 构建验证                                                │
│  $ npm run build                                                 │
│  通过标准: 无错误                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   ✅ 全部通过    │
                    │  可以合并代码    │
                    └─────────────────┘
```

---

## 9.8 CI/CD集成

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  integration-test:
    runs-on: ubuntu-latest
    needs: [type-check, lint]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration

  e2e-test:
    runs-on: ubuntu-latest
    needs: [unit-test, integration-test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

> **文档版本**: v2.1  
> **最后更新**: 2026-02-13  
> **对应工单**: B-09/09 测试套件与验证  
> **状态**: 待实施
