/**
 * Quintant 服务标准化接口
 * 
 * 5个核心方法：spawn / lifecycle / terminate / vacuum / status
 * 支持A2A适配器模式，HARD/SOFT隔离级别
 * 
 * @module lib/quintant/standard-interface
 * @version 1.3.0
 * @see HAJIMI-V1.3.0-白皮书-v1.0.md 第4章
 */

import { v4 as uuidv4 } from 'uuid';
import {
  // 类型
  A2AAdapter,
  AgentInstance,
  AgentStatus,
  IsolationLevel,
  QuintantConfig,
  QuintantResponse,
  SpawnRequest,
  LifecycleRequest,
  TerminateRequest,
  VacuumRequest,
  StatusQuery,
  
  // Schema
  SpawnRequestSchema,
  LifecycleRequestSchema,
  TerminateRequestSchema,
  VacuumRequestSchema,
  StatusQuerySchema,
  AgentInstanceSchema,
  
  // 错误码
  QuintantErrorCode,
} from './types';

// ========== 类型守卫 ==========

/**
 * 检查是否为有效的隔离级别
 */
function isValidIsolationLevel(level: string): level is IsolationLevel {
  return level === 'HARD' || level === 'SOFT';
}

/**
 * 检查是否为有效的代理状态
 */
function isValidAgentStatus(status: string): status is AgentStatus {
  const validStatuses: AgentStatus[] = [
    'SPAWNING', 'IDLE', 'BUSY', 'VACUUMING', 
    'TERMINATING', 'TERMINATED', 'ERROR'
  ];
  return validStatuses.includes(status as AgentStatus);
}

// ========== 上下文管理器 ==========

/**
 * 隔离上下文管理器
 * HARD模式：完全隔离，上下文清零
 * SOFT模式：允许共享基础上下文
 */
class IsolationContextManager {
  private hardContexts: Map<string, Map<string, unknown>> = new Map();
  private softSharedContext: Map<string, unknown> = new Map();

  /**
   * 创建隔离上下文
   */
  createContext(agentId: string, isolation: IsolationLevel): Map<string, unknown> {
    if (isolation === 'HARD') {
      // HARD模式：独立上下文，完全隔离
      const context = new Map<string, unknown>();
      this.hardContexts.set(agentId, context);
      return context;
    } else {
      // SOFT模式：共享基础上下文
      return this.softSharedContext;
    }
  }

  /**
   * 获取上下文
   */
  getContext(agentId: string, isolation: IsolationLevel): Map<string, unknown> | undefined {
    if (isolation === 'HARD') {
      return this.hardContexts.get(agentId);
    }
    return this.softSharedContext;
  }

  /**
   * 清理上下文
   * HARD模式：完全删除
   * SOFT模式：仅清理该代理的专属数据
   */
  clearContext(agentId: string, isolation: IsolationLevel): void {
    if (isolation === 'HARD') {
      // HARD模式：完全删除，零残留
      this.hardContexts.delete(agentId);
    }
    // SOFT模式：共享上下文保留，已清理的隔离由调用方处理
  }

  /**
   * 验证上下文是否已清零（HARD模式）
   */
  isContextClean(agentId: string): boolean {
    return !this.hardContexts.has(agentId);
  }
}

// ========== 核心服务类 ==========

export class QuintantService {
  private adapters: Map<string, A2AAdapter> = new Map();
  private config: QuintantConfig;
  private contextManager: IsolationContextManager;
  private activeAgents: Map<string, { adapter: string; isolation: IsolationLevel }> = new Map();

  constructor(config: QuintantConfig) {
    this.config = config;
    this.contextManager = new IsolationContextManager();
  }

  /**
   * 注册适配器
   */
  registerAdapter(name: string, adapter: A2AAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * 获取适配器
   */
  private getAdapter(name?: string): A2AAdapter {
    const adapterName = name || this.config.defaultAdapter;
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }
    return adapter;
  }

  /**
   * 创建标准响应
   */
  private createResponse<T>(
    success: boolean,
    data?: T,
    error?: { code: string; message: string; details?: Record<string, unknown> },
    startTime: number = Date.now()
  ): QuintantResponse<T> {
    return {
      success,
      data,
      error,
      meta: {
        timestamp: Date.now(),
        requestId: uuidv4(),
        latency: Date.now() - startTime,
      },
    };
  }

  // ========== 标准5方法实现 ==========

  /**
   * QUIN-001: Spawn - 生成代理
   * 
   * 创建新的代理实例，根据隔离级别分配上下文
   */
  async spawn(request: SpawnRequest): Promise<QuintantResponse<AgentInstance>> {
    const startTime = Date.now();
    
    try {
      // Zod校验
      const validated = SpawnRequestSchema.parse(request);
      
      // 确定隔离级别
      const isolation = validated.config.isolation || this.config.defaultIsolation;
      
      // 选择适配器
      const adapter = this.getAdapter();
      
      // 创建隔离上下文
      const context = this.contextManager.createContext(validated.config.id, isolation);
      
      // 注入上下文到请求
      const enrichedRequest = {
        ...validated,
        context: {
          ...validated.context,
          _isolation: isolation,
          _contextId: validated.config.id,
        },
      };

      // 调用适配器
      const response = await adapter.spawn(enrichedRequest);
      
      if (response.success && response.data) {
        // 记录活跃代理
        this.activeAgents.set(response.data.id, {
          adapter: this.config.defaultAdapter,
          isolation,
        });
      }

      return {
        ...response,
        meta: {
          ...response.meta,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: { errors: error.message },
          },
          startTime
        );
      }
      
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.SPAWN_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        startTime
      );
    }
  }

  /**
   * QUIN-001: Lifecycle - 生命周期管理
   * 
   * 暂停、恢复、重置代理状态
   */
  async lifecycle(request: LifecycleRequest): Promise<QuintantResponse<AgentInstance>> {
    const startTime = Date.now();
    
    try {
      // Zod校验
      const validated = LifecycleRequestSchema.parse(request);
      
      // 检查代理是否存在
      if (!this.activeAgents.has(validated.agentId)) {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.AGENT_NOT_FOUND,
            message: `Agent not found: ${validated.agentId}`,
          },
          startTime
        );
      }

      // 获取适配器
      const adapter = this.getAdapter();
      
      // 调用适配器
      const response = await adapter.lifecycle(validated);
      
      return {
        ...response,
        meta: {
          ...response.meta,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: { errors: error.message },
          },
          startTime
        );
      }
      
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.LIFECYCLE_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        startTime
      );
    }
  }

  /**
   * QUIN-001: Terminate - 终止代理
   * 
   * 终止代理实例，HARD模式下清零上下文
   */
  async terminate(request: TerminateRequest): Promise<QuintantResponse<void>> {
    const startTime = Date.now();
    
    try {
      // Zod校验
      const validated = TerminateRequestSchema.parse(request);
      
      // 检查代理是否存在
      const agentInfo = this.activeAgents.get(validated.agentId);
      if (!agentInfo) {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.AGENT_NOT_FOUND,
            message: `Agent not found: ${validated.agentId}`,
          },
          startTime
        );
      }

      // 获取适配器
      const adapter = this.getAdapter();
      
      // 调用适配器终止
      const response = await adapter.terminate(validated);
      
      if (response.success) {
        // 清理上下文
        this.contextManager.clearContext(validated.agentId, agentInfo.isolation);
        
        // 从活跃列表移除
        this.activeAgents.delete(validated.agentId);
        
        // HARD模式验证：确保上下文已清零
        if (agentInfo.isolation === 'HARD' && !this.contextManager.isContextClean(validated.agentId)) {
          return this.createResponse(
            false,
            undefined,
            {
              code: QuintantErrorCode.CONTEXT_LEAK,
              message: 'Context leak detected in HARD isolation mode',
              details: { agentId: validated.agentId },
            },
            startTime
          );
        }
      }

      return {
        ...response,
        meta: {
          ...response.meta,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: { errors: error.message },
          },
          startTime
        );
      }
      
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.TERMINATE_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        startTime
      );
    }
  }

  /**
   * QUIN-001: Vacuum - 内存整理
   * 
   * 整理代理内存，回收未使用的上下文
   */
  async vacuum(request: VacuumRequest): Promise<QuintantResponse<{ freed: number }>> {
    const startTime = Date.now();
    
    try {
      // Zod校验
      const validated = VacuumRequestSchema.parse(request);
      
      // 检查代理是否存在
      if (!this.activeAgents.has(validated.agentId)) {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.AGENT_NOT_FOUND,
            message: `Agent not found: ${validated.agentId}`,
          },
          startTime
        );
      }

      // 获取适配器
      const adapter = this.getAdapter();
      
      // 调用适配器
      const response = await adapter.vacuum(validated);
      
      return {
        ...response,
        meta: {
          ...response.meta,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: { errors: error.message },
          },
          startTime
        );
      }
      
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.VACUUM_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        startTime
      );
    }
  }

  /**
   * QUIN-001: Status - 状态查询
   * 
   * 查询代理或代理列表状态
   */
  async status(query: StatusQuery): Promise<QuintantResponse<AgentInstance | AgentInstance[]>> {
    const startTime = Date.now();
    
    try {
      // Zod校验
      const validated = StatusQuerySchema.parse(query);
      
      // 获取适配器
      const adapter = this.getAdapter();
      
      // 调用适配器
      const response = await adapter.status(validated);
      
      return {
        ...response,
        meta: {
          ...response.meta,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return this.createResponse(
          false,
          undefined,
          {
            code: QuintantErrorCode.VALIDATION_ERROR,
            message: 'Query validation failed',
            details: { errors: error.message },
          },
          startTime
        );
      }
      
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.STATUS_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        startTime
      );
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 获取活跃代理数量
   */
  getActiveAgentCount(): number {
    return this.activeAgents.size;
  }

  /**
   * 获取代理隔离级别
   */
  getAgentIsolation(agentId: string): IsolationLevel | undefined {
    return this.activeAgents.get(agentId)?.isolation;
  }

  /**
   * 验证HARD模式上下文是否清零
   */
  isHardContextClean(agentId: string): boolean {
    return this.contextManager.isContextClean(agentId);
  }
}

// ========== 导出工厂函数 ==========

/**
 * 创建Quintant服务实例
 */
export function createQuintantService(config: QuintantConfig): QuintantService {
  return new QuintantService(config);
}

// ========== 默认导出 ==========

export default QuintantService;
