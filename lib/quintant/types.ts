/**
 * Quintant 核心类型定义
 * HAJIMI-OR-IPDIRECT 项目
 * 
 * @module lib/quintant/types
 */

// 导出错误码定义
export {
  QuintantErrorCode,
  ErrorCode,
  type QuintantErrorCodeType,
  type ErrorCodeType,
} from './error-codes';

// ============================================================================
// 基础类型
// ============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ============================================================================
// 请求/响应类型
// ============================================================================

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' };
}

export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<Message>;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }[];
}

// ============================================================================
// 适配器接口
// ============================================================================

export interface AdapterCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;
  maxTokens: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastChecked: Date;
  error?: string;
}

/**
 * Quintant 适配器标准接口
 * 所有 LLM 服务适配器必须实现此契约
 */
export interface QuintantAdapter {
  readonly provider: string;
  readonly capabilities: AdapterCapabilities;

  /**
   * 非流式聊天完成
   */
  chatCompletion(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 流式聊天完成
   */
  chatCompletionStream(
    request: ChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    onError?: (error: Error) => void
  ): Promise<void>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * 获取可用模型列表
   */
  listModels(): Promise<string[]>;
}

// ============================================================================
// OpenRouter IP直连 专属类型
// ============================================================================

export interface ORIPDirectConfig {
  /** API密钥 (从环境变量注入) */
  apiKey: string;
  
  /** Cloudflare IP池配置 */
  ipPool: {
    /** 主IP */
    primary: string;
    /** 备用IP列表 */
    backups: string[];
    /** 健康检查间隔 (ms) */
    healthCheckInterval: number;
    /** TCP连接超时 (ms) */
    connectTimeout: number;
    /** HTTP请求超时 (ms) */
    requestTimeout: number;
  };
  
  /** TLS配置 */
  tls: {
    /** 是否验证证书 (风险配置) */
    rejectUnauthorized: boolean;
    /** SNI伪装域名 */
    servername: string;
    /** IP白名单 CIDR列表 */
    pinnedIPRanges: string[];
  };
  
  /** 模型映射表 */
  modelMapping: Record<string, string>;
  
  /** 熔断器配置 */
  circuitBreaker: {
    /** 连续失败阈值 */
    failureThreshold: number;
    /** 熔断后重置超时 (ms) */
    resetTimeout: number;
    /** 半开状态最大试探请求数 */
    halfOpenMaxCalls: number;
  };
  
  /** 遥测配置 */
  telemetry: {
    /** 是否启用详细日志 */
    verbose: boolean;
    /** 采样率 (0-1) */
    sampleRate: number;
  };
}

/**
 * IP池状态
 */
export interface IPPoolState {
  ip: string;
  isHealthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  averageLatency: number;
}

/**
 * 调用结果元数据
 */
export interface CallMetadata {
  traceId: string;
  spanId: string;
  startTime: number;
  endTime: number;
  usedIP: string;
  modelId: string;
  resolvedModel: string;
  statusCode: number;
  errorType?: string;
}

// ============================================================================
// 错误类型
// ============================================================================

export class QuintantError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QuintantError';
  }
}

export class IPDirectError extends QuintantError {
  constructor(
    message: string,
    code: 'IP_UNREACHABLE' | 'TLS_HANDSHAKE_FAILED' | 'CIRCUIT_OPEN' | 'MODEL_NOT_FOUND',
    metadata?: Record<string, unknown>
  ) {
    super(message, code, undefined, metadata);
    this.name = 'IPDirectError';
  }
}

// ============================================================================
// A2A Quintant 服务类型 - DEBT-001 修复新增
// ============================================================================

import { z } from 'zod';

/**
 * 隔离级别
 */
export type IsolationLevel = 'HARD' | 'SOFT';

/**
 * 代理状态
 */
export type AgentStatus = 
  | 'SPAWNING' 
  | 'IDLE' 
  | 'BUSY' 
  | 'VACUUMING' 
  | 'TERMINATING' 
  | 'TERMINATED' 
  | 'ERROR';

// ============================================================================
// Zod Schema 定义（前置，用于类型推导）
// ============================================================================

/**
 * AgentConfig Schema
 */
export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  isolation: z.enum(['HARD', 'SOFT']).optional(),
}).passthrough();

/**
 * 代理配置类型
 */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * AgentInstance Schema
 */
export const AgentInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  status: z.enum(['SPAWNING', 'IDLE', 'BUSY', 'VACUUMING', 'TERMINATING', 'TERMINATED', 'ERROR']),
  isolation: z.enum(['HARD', 'SOFT']),
  createdAt: z.number(),
  updatedAt: z.number(),
  context: z.record(z.unknown()).optional(),
});

/**
 * 代理实例类型
 */
export type AgentInstance = z.infer<typeof AgentInstanceSchema>;

/**
 * SpawnRequest Schema
 */
export const SpawnRequestSchema = z.object({
  config: AgentConfigSchema,
  context: z.record(z.unknown()).optional(),
});

/**
 * Spawn 请求类型
 */
export type SpawnRequest = z.infer<typeof SpawnRequestSchema>;

/**
 * LifecycleRequest Schema
 */
export const LifecycleRequestSchema = z.object({
  agentId: z.string().min(1),
  action: z.enum(['pause', 'resume', 'reset']),
});

/**
 * Lifecycle 请求类型
 */
export type LifecycleRequest = z.infer<typeof LifecycleRequestSchema>;

/**
 * TerminateRequest Schema
 */
export const TerminateRequestSchema = z.object({
  agentId: z.string().min(1),
  force: z.boolean().optional(),
});

/**
 * Terminate 请求类型
 */
export type TerminateRequest = z.infer<typeof TerminateRequestSchema>;

/**
 * VacuumRequest Schema
 */
export const VacuumRequestSchema = z.object({
  agentId: z.string().min(1),
  strategy: z.enum(['light', 'deep', 'full']),
});

/**
 * Vacuum 请求类型
 */
export type VacuumRequest = z.infer<typeof VacuumRequestSchema>;

/**
 * StatusQuery Schema
 */
export const StatusQuerySchema = z.object({
  agentId: z.string().optional(),
});

/**
 * Status 查询类型
 */
export type StatusQuery = z.infer<typeof StatusQuerySchema>;

/**
 * Quintant 响应
 */
export interface QuintantResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    timestamp: number;
    requestId: string;
    latency: number;
  };
}

/**
 * Quintant 配置
 */
export interface QuintantConfig {
  defaultAdapter: string;
  defaultIsolation: IsolationLevel;
  adapters: Record<string, AdapterConfig>;
}

/**
 * 适配器配置
 */
export interface AdapterConfig {
  type: string;
  timeout: number;
  retries: number;
  [key: string]: unknown;
}

/**
 * A2A 适配器接口
 */
export interface A2AAdapter {
  readonly name: string;
  readonly version: string;
  readonly isolationSupport: IsolationLevel[];
  
  spawn(request: SpawnRequest): Promise<QuintantResponse<AgentInstance>>;
  lifecycle(request: LifecycleRequest): Promise<QuintantResponse<AgentInstance>>;
  terminate(request: TerminateRequest): Promise<QuintantResponse<void>>;
  vacuum(request: VacuumRequest): Promise<QuintantResponse<{ freed: number }>>;
  status(query: StatusQuery): Promise<QuintantResponse<AgentInstance | AgentInstance[]>>;
}

/**
 * Quintant 配置
 */
export interface QuintantConfig {
  defaultAdapter: string;
  defaultIsolation: IsolationLevel;
  adapters: Record<string, AdapterConfig>;
}

/**
 * 适配器配置
 */
export interface AdapterConfig {
  type: string;
  timeout: number;
  retries: number;
  [key: string]: unknown;
}

/**
 * A2A 适配器接口
 */
export interface A2AAdapter {
  readonly name: string;
  readonly version: string;
  readonly isolationSupport: IsolationLevel[];
  
  spawn(request: SpawnRequest): Promise<QuintantResponse<AgentInstance>>;
  lifecycle(request: LifecycleRequest): Promise<QuintantResponse<AgentInstance>>;
  terminate(request: TerminateRequest): Promise<QuintantResponse<void>>;
  vacuum(request: VacuumRequest): Promise<QuintantResponse<{ freed: number }>>;
  status(query: StatusQuery): Promise<QuintantResponse<AgentInstance | AgentInstance[]>>;
}


