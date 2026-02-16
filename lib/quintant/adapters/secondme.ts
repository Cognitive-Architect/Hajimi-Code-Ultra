/**
 * SecondMe A2A适配器
 * 
 * P2债务标记 - 真实SecondMe API调用
 * 实现Quintant标准接口，对接外部SecondMe服务
 * 
 * @module lib/quintant/adapters/secondme
 * @version 1.3.0
 * @priority P2
 * @debt QUIN-SECONDME-001
 */

import { v4 as uuidv4 } from 'uuid';
import {
  A2AAdapter,
  AgentInstance,
  IsolationLevel,
  QuintantResponse,
  SpawnRequest,
  LifecycleRequest,
  TerminateRequest,
  VacuumRequest,
  StatusQuery,
  QuintantErrorCode,
  AdapterConfig,
} from '../types';

// ========== SecondMe API 类型 ==========

interface SecondMeSpawnPayload {
  name: string;
  role: string;
  model?: string;
  configuration?: Record<string, unknown>;
}

interface SecondMeAgentResponse {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ========== SecondMe适配器实现 ==========

/**
 * **DEBT-QUIN-SECONDME-001**: 真实SecondMe API调用
 * 
 * - **优先级**: P2
 * - **状态**: 接口已定义，实现待外部服务凭证
 * - **阻塞因素**: 需要SecondMe API密钥和端点配置
 * - **降级方案**: 使用MockAdapter进行开发和测试
 * - **预计清偿**: v1.4.0
 */
export class SecondMeAdapter implements A2AAdapter {
  readonly name = 'secondme';
  readonly version = '1.3.0-P2-DEBT';
  readonly isolationSupport: IsolationLevel[] = ['SOFT']; // SecondMe仅支持SOFT隔离

  private config: AdapterConfig;
  private mockMode: boolean; // 降级到Mock模式

  constructor(config: AdapterConfig) {
    this.config = config;
    // 如果没有配置endpoint或apiKey，自动降级到Mock模式
    this.mockMode = !config.endpoint || !config.apiKey;
    
    if (this.mockMode) {
      console.warn('[SecondMeAdapter] Running in MOCK mode - external API credentials not configured');
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 检查是否为Mock模式
   */
  isMockMode(): boolean {
    return this.mockMode;
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
        latency: 0,
      },
    };
  }

  /**
   * 发送SecondMe API请求
   * **DEBT**: 真实实现需要外部API凭证
   */
  private async fetchSecondMe<T>(
    path: string,
    options?: RequestInit
  ): Promise<QuintantResponse<T>> {
    // P2债务：真实API调用待实现
    // 当前返回模拟响应
    return this.createResponse(
      false,
      undefined,
      {
        code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
        message: 'SecondMe API not configured (P2 debt: QUIN-SECONDME-001)',
        details: {
          debt: 'QUIN-SECONDME-001',
          priority: 'P2',
          planned: 'v1.4.0',
          mitigation: 'Use MockAdapter for development',
        },
      }
    );
  }

  /**
   * 转换SecondMe响应为Quintant AgentInstance
   */
  private convertToAgentInstance(secondMeResponse: SecondMeAgentResponse): AgentInstance {
    const now = Date.now();
    return {
      id: secondMeResponse.id,
      config: {
        id: secondMeResponse.id,
        name: secondMeResponse.name,
        role: (secondMeResponse.metadata?.role as string) || 'unknown',
        model: (secondMeResponse.metadata?.model as string) || undefined,
        isolation: 'SOFT',
        memoryLimit: 1024 * 1024 * 100,
        timeout: 30000,
      },
      status: this.mapSecondMeStatus(secondMeResponse.status),
      createdAt: new Date(secondMeResponse.created_at).getTime(),
      lastActiveAt: now,
      memory: {
        used: 0,
        limit: 1024 * 1024 * 100,
        contexts: [],
      },
      metrics: {
        requestCount: 0,
        errorCount: 0,
        avgLatency: 0,
      },
    };
  }

  /**
   * 映射SecondMe状态到Quintant状态
   */
  private mapSecondMeStatus(secondMeStatus: string): AgentInstance['status'] {
    const statusMap: Record<string, AgentInstance['status']> = {
      'active': 'IDLE',
      'inactive': 'TERMINATED',
      'error': 'ERROR',
    };
    return statusMap[secondMeStatus] || 'ERROR';
  }

  // ========== A2A适配器接口实现 ==========

  /**
   * Spawn - 生成代理
   * **DEBT**: 真实实现调用SecondMe /agents/create 端点
   */
  async spawn(request: SpawnRequest): Promise<QuintantResponse<AgentInstance>> {
    if (this.mockMode) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
          message: 'SecondMe API not configured - spawn unavailable',
          details: {
            debt: 'QUIN-SECONDME-001',
            priority: 'P2',
            action: 'Use MockAdapter or configure endpoint/apiKey',
          },
        }
      );
    }

    // P2债务：真实API调用待实现
    return this.fetchSecondMe<AgentInstance>('/agents/create', {
      method: 'POST',
      body: JSON.stringify(this.convertSpawnRequest(request)),
    });
  }

  /**
   * Lifecycle - 生命周期管理
   * **DEBT**: 真实实现调用SecondMe /agents/{id}/lifecycle 端点
   */
  async lifecycle(request: LifecycleRequest): Promise<QuintantResponse<AgentInstance>> {
    if (this.mockMode) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
          message: 'SecondMe API not configured - lifecycle unavailable',
          details: {
            debt: 'QUIN-SECONDME-001',
            priority: 'P2',
          },
        }
      );
    }

    return this.fetchSecondMe<AgentInstance>(`/agents/${request.agentId}/lifecycle`, {
      method: 'POST',
      body: JSON.stringify({ action: request.action }),
    });
  }

  /**
   * Terminate - 终止代理
   * **DEBT**: 真实实现调用SecondMe /agents/{id}/terminate 端点
   */
  async terminate(request: TerminateRequest): Promise<QuintantResponse<void>> {
    if (this.mockMode) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
          message: 'SecondMe API not configured - terminate unavailable',
          details: {
            debt: 'QUIN-SECONDME-001',
            priority: 'P2',
          },
        }
      );
    }

    return this.fetchSecondMe<void>(`/agents/${request.agentId}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ force: request.force }),
    });
  }

  /**
   * Vacuum - 内存整理
   * **DEBT**: SecondMe可能不支持此操作，需协商或模拟
   */
  async vacuum(request: VacuumRequest): Promise<QuintantResponse<{ freed: number }>> {
    if (this.mockMode) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
          message: 'SecondMe API not configured - vacuum unavailable',
          details: {
            debt: 'QUIN-SECONDME-001',
            note: 'Vacuum may not be supported by SecondMe API',
          },
        }
      );
    }

    return this.fetchSecondMe<{ freed: number }>(`/agents/${request.agentId}/vacuum`, {
      method: 'POST',
      body: JSON.stringify({ strategy: request.strategy }),
    });
  }

  /**
   * Status - 状态查询
   * **DEBT**: 真实实现调用SecondMe /agents/{id} 或 /agents 端点
   */
  async status(query: StatusQuery): Promise<QuintantResponse<AgentInstance | AgentInstance[]>> {
    if (this.mockMode) {
      return this.createResponse(
        false,
        undefined,
        {
          code: QuintantErrorCode.ADAPTER_UNAUTHORIZED,
          message: 'SecondMe API not configured - status unavailable',
          details: {
            debt: 'QUIN-SECONDME-001',
            priority: 'P2',
          },
        }
      );
    }

    if (query.agentId) {
      return this.fetchSecondMe<AgentInstance>(`/agents/${query.agentId}`);
    } else {
      return this.fetchSecondMe<AgentInstance[]>('/agents');
    }
  }

  // ========== 私有辅助方法 ==========

  private convertSpawnRequest(request: SpawnRequest): SecondMeSpawnPayload {
    return {
      name: request.config.name,
      role: request.config.role,
      model: request.config.model,
      configuration: {
        isolation: request.config.isolation,
        memory_limit: request.config.memoryLimit,
        timeout: request.config.timeout,
        ...request.context,
      },
    };
  }
}

// ========== 导出 ==========

export default SecondMeAdapter;
