/**
 * Quintant 服务类型定义
 * 
 * 标准接口类型 + A2A适配器类型 + 隔离级别枚举
 * 
 * @module lib/quintant/types
 * @version 1.3.0
 */

import { z } from 'zod';

// ========== Zod Schema 定义 ==========

/**
 * 隔离级别枚举
 */
export const IsolationLevelSchema = z.enum(['HARD', 'SOFT']);

/**
 * 代理状态枚举
 */
export const AgentStatusSchema = z.enum([
  'SPAWNING',    // 孵化中
  'IDLE',        // 空闲
  'BUSY',        // 工作中
  'VACUUMING',   // 整理记忆中
  'TERMINATING', // 终止中
  'TERMINATED',  // 已终止
  'ERROR',       // 错误状态
]);

/**
 * 代理配置Schema
 */
export const AgentConfigSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(64),
  model: z.string().optional(),
  isolation: IsolationLevelSchema.default('SOFT'),
  memoryLimit: z.number().int().positive().default(1024 * 1024 * 100), // 100MB
  timeout: z.number().int().positive().default(30000), // 30s
  metadata: z.record(z.unknown()).optional(),
});

/**
 * 代理实例Schema
 */
export const AgentInstanceSchema = z.object({
  id: z.string(),
  config: AgentConfigSchema,
  status: AgentStatusSchema,
  createdAt: z.number(), // timestamp
  lastActiveAt: z.number(),
  memory: z.object({
    used: z.number().int(),
    limit: z.number().int(),
    contexts: z.array(z.string()),
  }),
  metrics: z.object({
    requestCount: z.number().int(),
    errorCount: z.number().int(),
    avgLatency: z.number(),
  }),
});

/**
 * 生成请求Schema
 */
export const SpawnRequestSchema = z.object({
  config: AgentConfigSchema,
  context: z.record(z.unknown()).optional(),
});

/**
 * 生命周期操作Schema
 */
export const LifecycleRequestSchema = z.object({
  agentId: z.string(),
  action: z.enum(['pause', 'resume', 'reset']),
  payload: z.record(z.unknown()).optional(),
});

/**
 * 终止请求Schema
 */
export const TerminateRequestSchema = z.object({
  agentId: z.string(),
  force: z.boolean().default(false),
  reason: z.string().optional(),
});

/**
 * 内存整理请求Schema
 */
export const VacuumRequestSchema = z.object({
  agentId: z.string(),
  strategy: z.enum(['light', 'deep', 'aggressive']).default('light'),
  keepContexts: z.array(z.string()).optional(),
});

/**
 * 状态查询Schema
 */
export const StatusQuerySchema = z.object({
  agentId: z.string().optional(),
  filter: z.object({
    status: z.array(AgentStatusSchema).optional(),
    role: z.string().optional(),
  }).optional(),
});

/**
 * 标准响应Schema
 */
export const QuintantResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }).optional(),
  meta: z.object({
    timestamp: z.number(),
    requestId: z.string(),
    latency: z.number(),
  }),
});

// ========== TypeScript 类型导出 ==========

export type IsolationLevel = z.infer<typeof IsolationLevelSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentInstance = z.infer<typeof AgentInstanceSchema>;
export type SpawnRequest = z.infer<typeof SpawnRequestSchema>;
export type LifecycleRequest = z.infer<typeof LifecycleRequestSchema>;
export type TerminateRequest = z.infer<typeof TerminateRequestSchema>;
export type VacuumRequest = z.infer<typeof VacuumRequestSchema>;
export type StatusQuery = z.infer<typeof StatusQuerySchema>;
export type QuintantResponse<T = unknown> = {
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
};

// ========== 适配器接口定义 ==========

/**
 * A2A适配器接口
 * 所有适配器必须实现此接口以保持行为一致
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

// ========== 错误码定义 ==========

export const QuintantErrorCode = {
  // 输入错误 4xx
  VALIDATION_ERROR: 'QUIN-400',
  AGENT_NOT_FOUND: 'QUIN-404',
  AGENT_EXISTS: 'QUIN-409',
  
  // 运行时错误 5xx
  SPAWN_FAILED: 'QUIN-500',
  LIFECYCLE_FAILED: 'QUIN-501',
  TERMINATE_FAILED: 'QUIN-502',
  VACUUM_FAILED: 'QUIN-503',
  STATUS_FAILED: 'QUIN-504',
  
  // 适配器错误 6xx
  ADAPTER_ERROR: 'QUIN-600',
  ADAPTER_TIMEOUT: 'QUIN-601',
  ADAPTER_UNAUTHORIZED: 'QUIN-602',
  
  // 隔离错误 7xx
  ISOLATION_VIOLATION: 'QUIN-700',
  CONTEXT_LEAK: 'QUIN-701',
} as const;

export type QuintantErrorCodeType = typeof QuintantErrorCode[keyof typeof QuintantErrorCode];

// ========== 配置类型 ==========

export interface QuintantConfig {
  defaultAdapter: string;
  defaultIsolation: IsolationLevel;
  adapters: Record<string, AdapterConfig>;
}

export interface AdapterConfig {
  type: 'mock' | 'secondme' | 'custom';
  endpoint?: string;
  apiKey?: string;
  timeout: number;
  retries: number;
  options?: Record<string, unknown>;
}
