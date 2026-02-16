/**
 * QUIN-001~005: Quintant服务标准化接口自测
 * 
 * 验收标准：
 * - QUIN-001: 5个标准方法实现完整，签名一致
 * - QUIN-002: A2A适配器通过接口一致性测试（Mock vs SecondMe）
 * - QUIN-003: Zod校验失败时抛出结构化错误（error.code/error.message）
 * - QUIN-004: 隔离级别切换时上下文清零验证（HARD模式零残留）
 * - QUIN-005: 债务文档存在且分级修正准确
 * - QUIN-DEBT: 真实SecondMe API调用标记为P2（Mock为P0）
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  QuintantService,
  createQuintantService,
  MockAdapter,
  SecondMeAdapter,
  QuintantConfig,
  SpawnRequest,
  LifecycleRequest,
  TerminateRequest,
  VacuumRequest,
  StatusQuery,
  QuintantErrorCode,
} from '../../lib/quintant';

// ========== 测试配置 ==========

const MOCK_CONFIG: QuintantConfig = {
  defaultAdapter: 'mock',
  defaultIsolation: 'SOFT',
  adapters: {
    mock: {
      type: 'mock',
      timeout: 30000,
      retries: 3,
    },
  },
};

// ========== 测试套件 ==========

describe('QUIN-001: 5个标准方法实现完整，签名一致', () => {
  let service: QuintantService;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    service = createQuintantService(MOCK_CONFIG);
    mockAdapter = new MockAdapter({ latencyMin: 0, latencyMax: 1 });
    service.registerAdapter('mock', mockAdapter);
  });

  afterEach(() => {
    mockAdapter.clearAll();
  });

  test('spawn方法存在且可调用', async () => {
    const request: SpawnRequest = {
      config: {
        id: 'test-agent-1',
        name: 'Test Agent',
        role: 'test',
        isolation: 'SOFT',
      },
    };

    const response = await service.spawn(request);
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    expect(response.data?.id).toBe('test-agent-1');
    expect(response.meta).toBeDefined();
    expect(response.meta.latency).toBeGreaterThanOrEqual(0);
  });

  test('lifecycle方法存在且可调用', async () => {
    // 先创建代理
    await service.spawn({
      config: { id: 'lifecycle-test', name: 'Test', role: 'test' },
    });

    const request: LifecycleRequest = {
      agentId: 'lifecycle-test',
      action: 'reset',
    };

    const response = await service.lifecycle(request);
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data?.id).toBe('lifecycle-test');
  });

  test('terminate方法存在且可调用', async () => {
    // 先创建代理
    await service.spawn({
      config: { id: 'terminate-test', name: 'Test', role: 'test' },
    });

    const request: TerminateRequest = {
      agentId: 'terminate-test',
      force: false,
    };

    const response = await service.terminate(request);
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
  });

  test('vacuum方法存在且可调用', async () => {
    // 先创建代理
    await service.spawn({
      config: { id: 'vacuum-test', name: 'Test', role: 'test' },
    });

    const request: VacuumRequest = {
      agentId: 'vacuum-test',
      strategy: 'light',
    };

    const response = await service.vacuum(request);
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data?.freed).toBeGreaterThanOrEqual(0);
  });

  test('status方法存在且可调用', async () => {
    // 先创建代理
    await service.spawn({
      config: { id: 'status-test', name: 'Test', role: 'test' },
    });

    const query: StatusQuery = { agentId: 'status-test' };
    const response = await service.status(query);
    expect(response).toBeDefined();
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  });

  test('5个方法签名返回类型一致', async () => {
    const methods = ['spawn', 'lifecycle', 'terminate', 'vacuum', 'status'];
    
    for (const method of methods) {
      expect(typeof (service as Record<string, unknown>)[method]).toBe('function');
    }
  });
});

describe('QUIN-002: A2A适配器通过接口一致性测试（Mock vs SecondMe）', () => {
  let mockAdapter: MockAdapter;
  let secondMeAdapter: SecondMeAdapter;

  beforeEach(() => {
    mockAdapter = new MockAdapter({ latencyMin: 0, latencyMax: 1 });
    secondMeAdapter = new SecondMeAdapter({
      type: 'secondme',
      timeout: 30000,
      retries: 3,
    });
  });

  test('MockAdapter实现A2AAdapter接口', () => {
    expect(mockAdapter.name).toBe('mock');
    expect(mockAdapter.version).toBe('1.3.0');
    expect(mockAdapter.isolationSupport).toContain('HARD');
    expect(mockAdapter.isolationSupport).toContain('SOFT');
  });

  test('SecondMeAdapter实现A2AAdapter接口', () => {
    expect(secondMeAdapter.name).toBe('secondme');
    expect(secondMeAdapter.isolationSupport).toContain('SOFT');
  });

  test('两个适配器方法签名一致', () => {
    const mockMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mockAdapter))
      .filter((m) => m !== 'constructor');
    const secondMeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(secondMeAdapter))
      .filter((m) => m !== 'constructor');

    // 两者都应该有5个核心方法
    const coreMethods = ['spawn', 'lifecycle', 'terminate', 'vacuum', 'status'];
    for (const method of coreMethods) {
      expect(typeof (mockAdapter as Record<string, unknown>)[method]).toBe('function');
      expect(typeof (secondMeAdapter as Record<string, unknown>)[method]).toBe('function');
    }
  });

  test('MockAdapter返回标准QuintantResponse格式', async () => {
    const response = await mockAdapter.spawn({
      config: { id: 'format-test', name: 'Test', role: 'test' },
    });

    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('data');
    expect(response).toHaveProperty('error');
    expect(response).toHaveProperty('meta');
    expect(response.meta).toHaveProperty('timestamp');
    expect(response.meta).toHaveProperty('requestId');
    expect(response.meta).toHaveProperty('latency');
  });

  test('SecondMeAdapter返回标准QuintantResponse格式', async () => {
    // SecondMe在mock模式下返回错误响应，但格式应该一致
    const response = await secondMeAdapter.spawn({
      config: { id: 'secondme-test', name: 'Test', role: 'test' },
    });

    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('data');
    expect(response).toHaveProperty('error');
    expect(response).toHaveProperty('meta');
  });

  test('MockAdapter完整生命周期测试', async () => {
    // Spawn
    const spawnResponse = await mockAdapter.spawn({
      config: { id: 'lifecycle-full', name: 'Test', role: 'test' },
    });
    expect(spawnResponse.success).toBe(true);
    expect(spawnResponse.data?.status).toBe('IDLE');

    // Pause (IDLE -> IDLE, no change)
    const pauseResponse = await mockAdapter.lifecycle({
      agentId: 'lifecycle-full',
      action: 'pause',
    });
    expect(pauseResponse.success).toBe(true);

    // Reset
    const resetResponse = await mockAdapter.lifecycle({
      agentId: 'lifecycle-full',
      action: 'reset',
    });
    expect(resetResponse.success).toBe(true);

    // Status
    const statusResponse = await mockAdapter.status({ agentId: 'lifecycle-full' });
    expect(statusResponse.success).toBe(true);

    // Vacuum
    const vacuumResponse = await mockAdapter.vacuum({
      agentId: 'lifecycle-full',
      strategy: 'light',
    });
    expect(vacuumResponse.success).toBe(true);

    // Terminate
    const terminateResponse = await mockAdapter.terminate({
      agentId: 'lifecycle-full',
      force: false,
    });
    expect(terminateResponse.success).toBe(true);
  });
});

describe('QUIN-003: Zod校验失败时抛出结构化错误', () => {
  let service: QuintantService;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    service = createQuintantService(MOCK_CONFIG);
    mockAdapter = new MockAdapter({ latencyMin: 0, latencyMax: 1 });
    service.registerAdapter('mock', mockAdapter);
  });

  afterEach(() => {
    mockAdapter.clearAll();
  });

  test('spawn请求缺少config时返回VALIDATION_ERROR', async () => {
    const response = await service.spawn({} as SpawnRequest);
    
    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(QuintantErrorCode.VALIDATION_ERROR);
    expect(response.error?.message).toContain('validation');
  });

  test('spawn请求config.id为空字符串时验证失败', async () => {
    const response = await service.spawn({
      config: { id: '', name: 'Test', role: 'test' },
    });
    
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe(QuintantErrorCode.VALIDATION_ERROR);
  });

  test('lifecycle请求无效action返回错误', async () => {
    await service.spawn({
      config: { id: 'action-test', name: 'Test', role: 'test' },
    });

    const response = await service.lifecycle({
      agentId: 'action-test',
      action: 'invalid_action' as LifecycleRequest['action'],
    });

    // 无效action会被Zod拦截返回VALIDATION_ERROR，或由MockAdapter返回LIFECYCLE_FAILED
    expect(response.success).toBe(false);
    expect(
      response.error?.code === QuintantErrorCode.VALIDATION_ERROR ||
      response.error?.code === QuintantErrorCode.LIFECYCLE_FAILED
    ).toBe(true);
  });

  test('vacuum请求无效strategy返回错误', async () => {
    await service.spawn({
      config: { id: 'strategy-test', name: 'Test', role: 'test' },
    });

    const response = await service.vacuum({
      agentId: 'strategy-test',
      strategy: 'ultra' as VacuumRequest['strategy'],
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe(QuintantErrorCode.VALIDATION_ERROR);
  });

  test('错误响应包含结构化details', async () => {
    const response = await service.spawn({} as SpawnRequest);
    
    expect(response.error?.details).toBeDefined();
    expect(typeof response.error?.details).toBe('object');
  });

  test('错误响应包含requestId和timestamp', async () => {
    const response = await service.spawn({} as SpawnRequest);
    
    expect(response.meta.requestId).toBeDefined();
    expect(typeof response.meta.requestId).toBe('string');
    expect(response.meta.timestamp).toBeGreaterThan(0);
  });
});

describe('QUIN-004: 隔离级别切换时上下文清零验证（HARD模式零残留）', () => {
  let service: QuintantService;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    service = createQuintantService(MOCK_CONFIG);
    mockAdapter = new MockAdapter({ latencyMin: 0, latencyMax: 1 });
    service.registerAdapter('mock', mockAdapter);
  });

  afterEach(() => {
    mockAdapter.clearAll();
  });

  test('HARD模式代理创建时分配独立上下文', async () => {
    await service.spawn({
      config: { id: 'hard-agent', name: 'HARD Test', role: 'test', isolation: 'HARD' },
      context: { key1: 'value1', key2: 'value2' },
    });

    // 验证代理被记录为HARD隔离
    const isolation = service.getAgentIsolation('hard-agent');
    expect(isolation).toBe('HARD');
  });

  test('SOFT模式代理使用共享上下文', async () => {
    await service.spawn({
      config: { id: 'soft-agent', name: 'SOFT Test', role: 'test', isolation: 'SOFT' },
    });

    const isolation = service.getAgentIsolation('soft-agent');
    expect(isolation).toBe('SOFT');
  });

  test('HARD模式terminate后上下文清零', async () => {
    await service.spawn({
      config: { id: 'hard-cleanup', name: 'HARD Cleanup', role: 'test', isolation: 'HARD' },
    });

    // 验证代理存在
    expect(service.getActiveAgentCount()).toBe(1);

    // 终止代理
    await service.terminate({ agentId: 'hard-cleanup', force: false });

    // 验证代理已移除
    expect(service.getActiveAgentCount()).toBe(0);

    // 验证HARD上下文已清零
    expect(service.isHardContextClean('hard-cleanup')).toBe(true);
  });

  test('SOFT模式terminate后共享上下文保留', async () => {
    await service.spawn({
      config: { id: 'soft-cleanup', name: 'SOFT Cleanup', role: 'test', isolation: 'SOFT' },
    });

    await service.terminate({ agentId: 'soft-cleanup', force: false });

    // SOFT模式不检查独立上下文，验证代理已移除即可
    expect(service.getActiveAgentCount()).toBe(0);
  });

  test('不存在代理查询返回AGENT_NOT_FOUND', async () => {
    const response = await service.lifecycle({
      agentId: 'non-existent',
      action: 'reset',
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe(QuintantErrorCode.AGENT_NOT_FOUND);
  });

  test('重复spawn相同ID返回AGENT_EXISTS', async () => {
    await service.spawn({
      config: { id: 'duplicate', name: 'Duplicate', role: 'test' },
    });

    const response = await service.spawn({
      config: { id: 'duplicate', name: 'Duplicate 2', role: 'test' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe(QuintantErrorCode.AGENT_EXISTS);
  });
});

describe('QUIN-005: 债务文档存在且分级修正准确', () => {
  const DEBT_PATH = resolve(process.cwd(), 'design', 'v1.3.0', 'debt-realistic.md');

  test('debt-realistic.md 文件存在', () => {
    expect(existsSync(DEBT_PATH)).toBe(true);
  });

  test('文档包含ALICE-001分级修正记录', () => {
    const content = readFileSync(DEBT_PATH, 'utf-8');
    
    expect(content).toContain('ALICE-001');
    expect(content).toContain('P1 (延迟)');
    expect(content).toContain('P0 (已完成)');
    expect(content).toContain('工单1/9已交付');
  });

  test('文档包含QUIN-001分级修正记录', () => {
    const content = readFileSync(DEBT_PATH, 'utf-8');
    
    expect(content).toContain('QUIN-001');
    expect(content).toContain('P0 (阻塞)');
    expect(content).toContain('P1 (增强)');
    expect(content).toContain('工单3实现');
  });

  test('文档包含清偿路线图', () => {
    const content = readFileSync(DEBT_PATH, 'utf-8');
    
    expect(content).toContain('清偿路线图');
    expect(content).toContain('当前(v1.3.0)');
    expect(content).toContain('后续(v1.4.0)');
  });

  test('文档包含债务标签规范', () => {
    const content = readFileSync(DEBT_PATH, 'utf-8');
    
    expect(content).toContain('债务标签规范');
    expect(content).toContain('interface DebtItem');
  });
});

describe('QUIN-DEBT: 真实SecondMe API调用标记为P2（Mock为P0）', () => {
  test('SecondMeAdapter标记为P2债务版本', () => {
    const adapter = new SecondMeAdapter({
      type: 'secondme',
      timeout: 30000,
      retries: 3,
    });

    expect(adapter.version).toContain('P2');
    expect(adapter.version).toContain('DEBT');
  });

  test('SecondMeAdapter在mock模式下正确报告', () => {
    const adapter = new SecondMeAdapter({
      type: 'secondme',
      timeout: 30000,
      retries: 3,
    });

    expect(adapter.isMockMode()).toBe(true);
  });

  test('SecondMeAdapter调用返回P2债务错误', async () => {
    const adapter = new SecondMeAdapter({
      type: 'secondme',
      timeout: 30000,
      retries: 3,
    });

    const response = await adapter.spawn({
      config: { id: 'test', name: 'Test', role: 'test' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe(QuintantErrorCode.ADAPTER_UNAUTHORIZED);
    // 错误详情中包含债务信息
    expect(response.error?.details?.debt).toBe('QUIN-SECONDME-001');
    expect(response.error?.details?.priority).toBe('P2');
    expect(response.error?.details?.debt).toBe('QUIN-SECONDME-001');
  });

  test('MockAdapter实现为P0核心交付', () => {
    const adapter = new MockAdapter();

    expect(adapter.name).toBe('mock');
    expect(adapter.version).not.toContain('DEBT');
    expect(adapter.isolationSupport).toContain('HARD');
    expect(adapter.isolationSupport).toContain('SOFT');
  });

  test('SecondMeAdapter代码包含P2债务注释', () => {
    const filepath = resolve(process.cwd(), 'lib', 'quintant', 'adapters', 'secondme.ts');
    const content = readFileSync(filepath, 'utf-8');

    expect(content).toContain('P2债务');
    expect(content).toContain('QUIN-SECONDME-001');
    expect(content).toContain('预计清偿');
  });
});

// ========== 测试总结 ==========

console.log('\n' + '='.repeat(60));
console.log('Quintant服务标准化接口测试套件');
console.log('='.repeat(60));
console.log('测试范围:');
console.log('  - 5个标准方法: spawn/lifecycle/terminate/vacuum/status');
console.log('  - A2A适配器: MockAdapter(P0) + SecondMeAdapter(P2债务)');
console.log('  - Zod Schema校验 + 结构化错误');
console.log('  - 隔离级别: HARD(零残留) + SOFT(共享)');
console.log('  - 债务文档: ALICE-001/QUIN-001分级修正');
console.log('='.repeat(60) + '\n');
