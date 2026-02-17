/**
 * LCR (Local Context Runtime) 本地适配器
 * HAJIMI-LCR-LUXURY-005 核心实现
 * 
 * 本地上下文运行时适配器，支持离线优先的本地 LLM 推理
 * 与云端适配器形成 Fallback 策略
 * 
 * @module lib/quintant/adapters/lcr-local
 * @version 1.4.0
 */

import { EventEmitter } from 'events';
import type {
  QuintantAdapter,
  AdapterCapabilities,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  HealthStatus,
  Message,
} from '../types';
import { QuintantError } from '../types';

// ============================================================================
// LCR 本地配置类型
// ============================================================================

export interface LCRLocalConfig {
  /** 本地模型端点 */
  endpoint: string;
  /** 默认模型 */
  defaultModel: string;
  /** 可用模型列表 */
  availableModels: string[];
  /** 最大上下文长度 */
  maxContextLength: number;
  /** 请求超时 (ms) */
  timeout: number;
  /** 健康检查间隔 (ms) */
  healthCheckInterval: number;
  /** 离线模式 */
  offlineMode: boolean;
  /** Fallback 策略 */
  fallback: {
    enabled: boolean;
    cloudAdapter: 'openrouter' | 'ip-direct' | null;
    fallbackThreshold: number; // 连续失败次数阈值
  };
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: LCRLocalConfig = {
  endpoint: process.env.LCR_LOCAL_ENDPOINT || 'http://localhost:11434',
  defaultModel: 'llama2',
  availableModels: ['llama2', 'llama3', 'mistral', 'codellama'],
  maxContextLength: 8192,
  timeout: 30000,
  healthCheckInterval: 30000,
  offlineMode: false,
  fallback: {
    enabled: true,
    cloudAdapter: 'ip-direct',
    fallbackThreshold: 3,
  },
};

// ============================================================================
// LCR 本地运行时错误
// ============================================================================

export class LCRLocalError extends QuintantError {
  constructor(
    message: string,
    code: 'MODEL_NOT_LOADED' | 'CONTEXT_OVERFLOW' | 'OFFLINE_MODE' | 'FALLBACK_TRIGGERED',
    metadata?: Record<string, unknown>
  ) {
    super(message, code, undefined, metadata);
    this.name = 'LCRLocalError';
  }
}

// ============================================================================
// LCR 本地适配器实现
// ============================================================================

export class LCRLocalAdapter extends EventEmitter implements QuintantAdapter {
  public readonly provider = 'lcr-local';
  
  public readonly capabilities: AdapterCapabilities = {
    streaming: true,
    functionCalling: false, // 本地模型通常不支持函数调用
    vision: false,
    jsonMode: true,
    maxTokens: 8192,
  };

  private config: LCRLocalConfig;
  private healthStatus: HealthStatus = {
    status: 'healthy',
    latency: 0,
    lastChecked: new Date(),
  };
  private healthCheckTimer?: NodeJS.Timeout;
  private consecutiveFailures = 0;

  constructor(config?: Partial<LCRLocalConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startHealthCheck();
  }

  // ========================================================================
  // 核心请求方法
  // ========================================================================

  async chatCompletion(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();

    this.log('info', `[LCR-LOCAL] Starting chat completion`, { 
      traceId, 
      model: request.model,
      messageCount: request.messages.length 
    });

    // 检查离线模式
    if (this.config.offlineMode && this.healthStatus.status !== 'healthy') {
      throw new LCRLocalError(
        'LCR is offline and offline mode is enabled',
        'OFFLINE_MODE',
        { traceId }
      );
    }

    // 检查上下文长度
    const estimatedTokens = this.estimateTokens(request.messages);
    if (estimatedTokens > this.config.maxContextLength) {
      throw new LCRLocalError(
        `Context length ${estimatedTokens} exceeds maximum ${this.config.maxContextLength}`,
        'CONTEXT_OVERFLOW',
        { traceId, estimatedTokens, maxContextLength: this.config.maxContextLength }
      );
    }

    try {
      const response = await this.makeLocalRequest(request);
      
      this.consecutiveFailures = 0;
      const latency = Date.now() - startTime;
      
      this.log('info', `[LCR-LOCAL] Request succeeded`, {
        traceId,
        duration: latency,
        model: request.model,
      });

      this.emit('request:success', { traceId, latency, model: request.model });
      return response;

    } catch (error) {
      this.consecutiveFailures++;
      const latency = Date.now() - startTime;

      this.log('error', `[LCR-LOCAL] Request failed`, {
        traceId,
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: this.consecutiveFailures,
      });

      // 检查是否需要触发 Fallback
      if (this.shouldTriggerFallback()) {
        this.emit('fallback:triggered', {
          traceId,
          reason: 'consecutive_failures',
          consecutiveFailures: this.consecutiveFailures,
        });
        throw new LCRLocalError(
          `LCR failed ${this.consecutiveFailures} times, fallback triggered`,
          'FALLBACK_TRIGGERED',
          { traceId, cloudAdapter: this.config.fallback.cloudAdapter }
        );
      }

      this.emit('request:failure', { traceId, latency, error });
      throw error;
    }
  }

  private async makeLocalRequest(request: ChatRequest): Promise<ChatResponse> {
    // 检测本地运行时类型 (Ollama, llama.cpp, etc.)
    const runtime = await this.detectRuntime();
    
    switch (runtime) {
      case 'ollama':
        return this.callOllama(request);
      case 'llamacpp':
        return this.callLlamaCpp(request);
      default:
        throw new LCRLocalError(
          `Unsupported local runtime: ${runtime}`,
          'MODEL_NOT_LOADED'
        );
    }
  }

  private async callOllama(request: ChatRequest): Promise<ChatResponse> {
    const model = this.resolveModel(request.model);
    
    const response = await fetch(`${this.config.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.max_tokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new LCRLocalError(
        `Ollama request failed: ${response.status} ${response.statusText}`,
        'MODEL_NOT_LOADED'
      );
    }

    const data = await response.json();
    
    return {
      id: `lcr-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.message?.content || '',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }

  private async callLlamaCpp(request: ChatRequest): Promise<ChatResponse> {
    // llama.cpp server 兼容 OpenAI API 格式
    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new LCRLocalError(
        `llama.cpp request failed: ${response.status} ${response.statusText}`,
        'MODEL_NOT_LOADED'
      );
    }

    return response.json() as Promise<ChatResponse>;
  }

  // ========================================================================
  // 流式请求 (骨架实现，待完善)
  // ========================================================================

  async chatCompletionStream(
    request: ChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    // TODO: 实现流式处理
    // 当前返回骨架，由后续迭代完善
    if (onError) {
      onError(new Error('LCR streaming not yet fully implemented'));
    }
  }

  // ========================================================================
  // 健康检查
  // ========================================================================

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const runtime = await this.detectRuntime();
      const latency = Date.now() - startTime;
      
      this.healthStatus = {
        status: runtime !== 'none' ? 'healthy' : 'unhealthy',
        latency,
        lastChecked: new Date(),
      };
      
      return this.healthStatus;
    } catch {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        lastChecked: new Date(),
        error: 'Failed to detect local runtime',
      };
    }
  }

  private async detectRuntime(): Promise<'ollama' | 'llamacpp' | 'none'> {
    try {
      // 尝试检测 Ollama
      const ollamaResponse = await fetch(`${this.config.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (ollamaResponse.ok) return 'ollama';
    } catch {
      // 继续检测其他运行时
    }

    try {
      // 尝试检测 llama.cpp
      const llamaResponse = await fetch(`${this.config.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (llamaResponse.ok) return 'llamacpp';
    } catch {
      // 无可用运行时
    }

    return 'none';
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.healthCheck();
    }, this.config.healthCheckInterval);
  }

  // ========================================================================
  // 模型列表
  // ========================================================================

  async listModels(): Promise<string[]> {
    try {
      const runtime = await this.detectRuntime();
      
      if (runtime === 'ollama') {
        const response = await fetch(`${this.config.endpoint}/api/tags`);
        if (response.ok) {
          const data = await response.json() as { models?: Array<{ name: string }> };
          return data.models?.map(m => m.name) || this.config.availableModels;
        }
      }
      
      return this.config.availableModels;
    } catch {
      return this.config.availableModels;
    }
  }

  // ========================================================================
  // Fallback 策略
  // ========================================================================

  private shouldTriggerFallback(): boolean {
    return (
      this.config.fallback.enabled &&
      this.consecutiveFailures >= this.config.fallback.fallbackThreshold
    );
  }

  /**
   * 获取 Fallback 配置
   */
  getFallbackConfig(): { enabled: boolean; cloudAdapter: string | null } {
    return {
      enabled: this.config.fallback.enabled,
      cloudAdapter: this.config.fallback.cloudAdapter,
    };
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private resolveModel(modelId: string): string {
    // 映射到本地模型名称
    const mapping: Record<string, string> = {
      'gpt-4': 'llama3',
      'gpt-3.5-turbo': 'llama2',
      'claude-3-sonnet': 'mistral',
      'deepseek-coder': 'codellama',
    };
    
    return mapping[modelId] || modelId;
  }

  private estimateTokens(messages: Message[]): number {
    // 简化的 token 估算 (1 token ≈ 4 chars)
    const text = messages.map(m => m.content).join('');
    return Math.ceil(text.length / 4) + messages.length * 4; // 角色标记估算
  }

  private generateTraceId(): string {
    return `lcr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const prefix = `[LCR-LOCAL] [${level.toUpperCase()}] [${timestamp}]`;
    
    if (meta) {
      console.log(prefix, message, meta);
    } else {
      console.log(prefix, message);
    }
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.removeAllListeners();
  }
}

// 默认导出
export default LCRLocalAdapter;
