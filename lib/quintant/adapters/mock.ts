/**
 * Mock A2A适配器
 * 
 * P0核心交付物 - 用于开发和测试
 * 模拟Quintant标准接口行为，无需外部依赖
 * 
 * @module lib/quintant/adapters/mock
 * @version 1.3.0
 * @priority P0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  A2AAdapter,
  AgentInstance,
  AgentStatus,
  IsolationLevel,
  QuintantResponse,
  SpawnRequest,
  LifecycleRequest,
  TerminateRequest,
  VacuumRequest,
  StatusQuery,
  AgentConfig,
  QuintantErrorCode,
} from '../types';

// ========== Mock数据存储 ==========

interface MockAgentData {
  instance: AgentInstance;
  internalMemory: Map<string, unknown>;
  contexts: Set<string>;
}

class MockAgentStore {
  private agents: Map<string, MockAgentData> = new Map();
  private idCounter = 0;

  generateId(): string {
    return `mock-agent-${++this.idCounter}-${Date.now().toString(36)}`;
  }

  get(id: string): MockAgentData | undefined {
    return this.agents.get(id);
  }

  set(id: string, data: MockAgentData): void {
    this.agents.set(id, data);
  }

  delete(id: string): boolean {
    return this.agents.delete(id);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  getAll(): MockAgentData[] {
    return Array.from(this.agents.values());
  }

  clear(): void {
    this.agents.clear();
    this.idCounter = 0;
  }
}

// ========== Mock适配器实现 ==========

export class MockAdapter implements A2AAdapter {
  readonly name = 'mock';
  readonly version = '1.3.0';
  readonly isolationSupport: IsolationLevel[] = ['HARD', 'SOFT'];

  private store: MockAgentStore;
  private latencyMin: number;
  private latencyMax: number;

  constructor(options?: { latencyMin?: number; latencyMax?: number }) {
    this.store = new MockAgentStore();
    this.latencyMin = options?.latencyMin ?? 10;
    this.latencyMax = options?.latencyMax ?? 100;
  }

  // ========== 辅助方法 ==========

  /**
   * 模拟网络延迟
   */
  private async simulateLatency(): Promise<void> {
    const latency = Math.random() * (this.latencyMax - this.latencyMin) + this.latencyMin;
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  /**
   * 创建标准响应
   */
  private createResponse<T>(
    success: boolean,
    data?: T,
    error?: { code: string; message: string; details?: Record<string, unknown> }
  ): QuintantResponse<T> {
    return {
      success,
      data,
      error,
      meta: {
        timestamp: Date.now(),
        requestId: uuidv4(),
        latency: 0, // 由调用方填充
      },
    };
  }

  /**
   * 创建模拟代理实例
   */
  private createAgentInstance(config: AgentConfig, context?: Record<string, unknown>): AgentInstance {
    const now = Date.now();
    return {
      id: config.id,
      config,
      status: 'IDLE',
      createdAt: now,
      lastActiveAt: now,
      memory: {
        used: 0,
        limit: config.memoryLimit,
        contexts: context ? Object.keys(context) : [],
      },
      metrics: {
        requestCount: 0,
        errorCount: 0,
        avgLatency: 0,
      },
    };
  }

  // ========== A2A适配器接口实现 ==========

  /**
   * Spawn - 生成代理
   */
  async spawn(request: SpawnRequest): Promise<QuintantResponse<AgentInstance>> {
    await this.simulateLatency();

    const { config, context } = request;

    // 检查ID是否已存在
    if (this.store.has(config.id)) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.AGENT_EXISTS,
          message: `Agent with id '${config.id}' already exists`,
        }
      );
    }

    // 创建代理实例
    const instance = this.createAgentInstance(config, context);
    instance.status = 'SPAWNING';

    // 存储代理数据
    const mockData: MockAgentData = {
      instance,
      internalMemory: new Map(),
      contexts: new Set(context ? Object.keys(context) : []),
    };

    // 模拟启动延迟
    await this.simulateLatency();
    
    instance.status = 'IDLE';
    instance.lastActiveAt = Date.now();
    
    this.store.set(config.id, mockData);

    return this.createResponse(true, instance);
  }

  /**
   * Lifecycle - 生命周期管理
   */
  async lifecycle(request: LifecycleRequest): Promise<QuintantResponse<AgentInstance>> {
    await this.simulateLatency();

    const { agentId, action, payload } = request;

    const mockData = this.store.get(agentId);
    if (!mockData) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.AGENT_NOT_FOUND,
          message: `Agent not found: ${agentId}`,
        }
      );
    }

    const { instance } = mockData;

    switch (action) {
      case 'pause':
        if (instance.status === 'BUSY') {
          instance.status = 'IDLE';
        }
        break;

      case 'resume':
        if (instance.status === 'IDLE') {
          instance.status = 'BUSY';
        }
        break;

      case 'reset':
        // 重置内存和指标，但保留ID和配置
        instance.memory.used = 0;
        instance.memory.contexts = [];
        instance.metrics.requestCount = 0;
        instance.metrics.errorCount = 0;
        instance.metrics.avgLatency = 0;
        mockData.internalMemory.clear();
        mockData.contexts.clear();
        instance.status = 'IDLE';
        break;

      default:
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.LIFECYCLE_FAILED,
            message: `Unknown lifecycle action: ${action}`,
          }
        );
    }

    instance.lastActiveAt = Date.now();
    return this.createResponse(true, instance);
  }

  /**
   * Terminate - 终止代理
   */
  async terminate(request: TerminateRequest): Promise<QuintantResponse<void>> {
    await this.simulateLatency();

    const { agentId, force } = request;

    if (!this.store.has(agentId)) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.AGENT_NOT_FOUND,
          message: `Agent not found: ${agentId}`,
        }
      );
    }

    const mockData = this.store.get(agentId)!;
    
    if (!force && mockData.instance.status === 'BUSY') {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.TERMINATE_FAILED,
          message: 'Agent is busy, use force=true to terminate anyway',
        }
      );
    }

    mockData.instance.status = 'TERMINATING';
    await this.simulateLatency();

    // 完全清理
    mockData.instance.status = 'TERMINATED';
    this.store.delete(agentId);

    return this.createResponse(true, undefined);
  }

  /**
   * Vacuum - 内存整理
   */
  async vacuum(request: VacuumRequest): Promise<QuintantResponse<{ freed: number }>> {
    await this.simulateLatency();

    const { agentId, strategy, keepContexts } = request;

    const mockData = this.store.get(agentId);
    if (!mockData) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.AGENT_NOT_FOUND,
          message: `Agent not found: ${agentId}`,
        }
      );
    }

    const { instance, internalMemory, contexts } = mockData;

    // 保存之前的状态
    const beforeMemory = instance.memory.used;
    instance.status = 'VACUUMING';

    // 根据策略清理
    let freed = 0;
    const keepSet = new Set(keepContexts || []);

    switch (strategy) {
      case 'light':
        // 仅清理过期上下文引用
        for (const key of contexts) {
          if (!keepSet.has(key) && !internalMemory.has(key)) {
            contexts.delete(key);
            freed += 1024; // 模拟1KB
          }
        }
        break;

      case 'deep':
        // 清理所有非保留上下文
        for (const key of contexts) {
          if (!keepSet.has(key)) {
            contexts.delete(key);
            internalMemory.delete(key);
            freed += 10240; // 模拟10KB
          }
        }
        break;

      case 'aggressive':
        // 清空所有内存，仅保留保留项
        internalMemory.clear();
        contexts.clear();
        for (const key of keepSet) {
          contexts.add(key);
        }
        freed = instance.memory.used;
        break;
    }

    // 更新内存使用
    instance.memory.used = Math.max(0, instance.memory.used - freed);
    instance.memory.contexts = Array.from(contexts);
    instance.status = 'IDLE';
    instance.lastActiveAt = Date.now();

    return this.createResponse(true, { freed });
  }

  /**
   * Status - 状态查询
   */
  async status(query: StatusQuery): Promise<QuintantResponse<AgentInstance | AgentInstance[]>> {
    await this.simulateLatency();

    const { agentId, filter } = query;

    // 查询单个代理
    if (agentId) {
      const mockData = this.store.get(agentId);
      if (!mockData) {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.AGENT_NOT_FOUND,
            message: `Agent not found: ${agentId}`,
          }
        );
      }
      return this.createResponse(true, mockData.instance);
    }

    // 查询代理列表
    let agents = this.store.getAll().map((data) => data.instance);

    // 应用过滤器
    if (filter) {
      if (filter.status && filter.status.length > 0) {
        agents = agents.filter((agent) => filter.status!.includes(agent.status));
      }
      if (filter.role) {
        agents = agents.filter((agent) => agent.config.role === filter.role);
      }
    }

    return this.createResponse(true, agents);
  }

  // ========== Mock专用方法 ==========

  /**
   * 清理所有Mock数据（仅测试使用）
   */
  clearAll(): void {
    this.store.clear();
  }

  /**
   * 获取Mock存储大小
   */
  getStoreSize(): number {
    return this.store.getAll().length;
  }

  /**
   * 模拟代理活动（用于测试）
   */
  simulateActivity(agentId: string, duration: number): void {
    const mockData = this.store.get(agentId);
    if (mockData) {
      mockData.instance.status = 'BUSY';
      mockData.instance.metrics.requestCount++;
      mockData.instance.memory.used += Math.floor(Math.random() * 1000);
      
      setTimeout(() => {
        if (this.store.has(agentId)) {
          const data = this.store.get(agentId)!;
          data.instance.status = 'IDLE';
          data.instance.lastActiveAt = Date.now();
        }
      }, duration);
    }
  }
}

// ========== 导出 ==========

export default MockAdapter;
