/**
 * SecondMe Adapter Type Definitions
 * 
 * @deprecated DEPRECATED - HAJIMI-DEBT-CLEARANCE-001
 *   迁移目标: lib/quintant/types.ts (类型已内聚)
 *   迁移时间: 2026-02-17
 *   保留原因: 向后兼容
 *   计划移除: v1.6.0
 * 
 * 迁移来源: src/lib/secondme/types.ts
 * 迁移方式: 完全保留 (B-04阶段)
 * 
 * @see lib/quintant/types.ts - 新类型定义位置
 * @see HAJIMI-V1.5.0-DEBT-AUDIT-REPORT-v1.0.md - 审计报告
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/** SecondMe API 配置 */
export interface SecondMeConfig {
  /** API 基础URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 请求超时 (毫秒) */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 模型名称 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大Token数 */
  maxTokens: number;
}

/** 默认配置 */
export const DEFAULT_SECONDME_CONFIG: SecondMeConfig = {
  baseUrl: 'https://api.secondme.io',
  apiKey: '',
  timeout: 30000,
  maxRetries: 3,
  model: 'secondme-v1',
  temperature: 0.7,
  maxTokens: 4096,
};

// ============================================================================
// 聊天请求/响应类型
// ============================================================================

/** 聊天完成请求 */
export interface ChatCompletionRequest {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 模型名称 */
  model?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大Token数 */
  max_tokens?: number;
  /** 是否流式响应 */
  stream?: boolean;
  /** 停止词 */
  stop?: string[];
  /** 存在惩罚 */
  presence_penalty?: number;
  /** 频率惩罚 */
  frequency_penalty?: number;
  /** Top P 采样 */
  top_p?: number;
  /** 用户标识 */
  user?: string;
}

/** 聊天消息 */
export interface ChatMessage {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 消息名称 (可选) */
  name?: string;
  /** 工具调用 (可选) */
  tool_calls?: ToolCall[];
  /** 工具调用ID (可选) */
  tool_call_id?: string;
}

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 工具调用 */
export interface ToolCall {
  /** 调用ID */
  id: string;
  /** 调用类型 */
  type: 'function';
  /** 函数调用 */
  function: FunctionCall;
}

/** 函数调用 */
export interface FunctionCall {
  /** 函数名称 */
  name: string;
  /** 函数参数 (JSON字符串) */
  arguments: string;
}

/** 聊天完成响应 */
export interface ChatCompletionResponse {
  /** 响应ID */
  id: string;
  /** 对象类型 */
  object: 'chat.completion';
  /** 创建时间戳 */
  created: number;
  /** 模型名称 */
  model: string;
  /** 选择列表 */
  choices: CompletionChoice[];
  /** Token使用统计 */
  usage: TokenUsage;
}

/** 完成选择 */
export interface CompletionChoice {
  /** 选择索引 */
  index: number;
  /** 消息 */
  message: ChatMessage;
  /** 完成原因 */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** 日志概率 (可选) */
  logprobs?: LogProbs;
}

/** Token使用统计 */
export interface TokenUsage {
  /** 提示Token数 */
  prompt_tokens: number;
  /** 完成Token数 */
  completion_tokens: number;
  /** 总Token数 */
  total_tokens: number;
}

/** 日志概率 */
export interface LogProbs {
  /** Token日志概率 */
  tokens: string[];
  /** Token日志概率值 */
  token_logprobs: number[];
  /** Top日志概率 */
  top_logprobs: Record<string, number>[];
  /** 文本偏移 */
  text_offset: number[];
}

// ============================================================================
// 流式响应类型
// ============================================================================

/** 流式聊天完成块 */
export interface ChatCompletionChunk {
  /** 响应ID */
  id: string;
  /** 对象类型 */
  object: 'chat.completion.chunk';
  /** 创建时间戳 */
  created: number;
  /** 模型名称 */
  model: string;
  /** 选择列表 */
  choices: ChunkChoice[];
}

/** 流式选择块 */
export interface ChunkChoice {
  /** 选择索引 */
  index: number;
  /** 增量消息 */
  delta: MessageDelta;
  /** 完成原因 */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/** 消息增量 */
export interface MessageDelta {
  /** 角色 (仅在第一条) */
  role?: MessageRole;
  /** 内容增量 */
  content?: string;
  /** 工具调用增量 */
  tool_calls?: ToolCall[];
}

// ============================================================================
// 模型类型
// ============================================================================

/** 模型信息 */
export interface ModelInfo {
  /** 模型ID */
  id: string;
  /** 对象类型 */
  object: 'model';
  /** 创建时间戳 */
  created: number;
  /** 模型所有者 */
  owned_by: string;
  /** 模型权限 */
  permission: ModelPermission[];
  /** 根模型 */
  root: string;
  /** 父模型 */
  parent: string | null;
}

/** 模型权限 */
export interface ModelPermission {
  /** 权限ID */
  id: string;
  /** 对象类型 */
  object: 'model_permission';
  /** 创建时间戳 */
  created: number;
  /** 是否允许创建引擎 */
  allow_create_engine: boolean;
  /** 是否允许采样 */
  allow_sampling: boolean;
  /** 是否允许日志概率 */
  allow_logprobs: boolean;
  /** 是否允许搜索索引 */
  allow_search_indices: boolean;
  /** 是否允许查看 */
  allow_view: boolean;
  /** 是否允许微调 */
  allow_fine_tuning: boolean;
  /** 组织 */
  organization: string;
  /** 组 */
  group: string | null;
  /** 是否阻塞 */
  is_blocking: boolean;
}

/** 模型列表响应 */
export interface ModelListResponse {
  /** 对象类型 */
  object: 'list';
  /** 模型列表 */
  data: ModelInfo[];
}

// ============================================================================
// 嵌入类型
// ============================================================================

/** 嵌入请求 */
export interface EmbeddingRequest {
  /** 输入文本 */
  input: string | string[];
  /** 模型名称 */
  model: string;
  /** 编码格式 */
  encoding_format?: 'float' | 'base64';
  /** 维度 */
  dimensions?: number;
  /** 用户标识 */
  user?: string;
}

/** 嵌入响应 */
export interface EmbeddingResponse {
  /** 对象类型 */
  object: 'list';
  /** 嵌入列表 */
  data: Embedding[];
  /** 模型名称 */
  model: string;
  /** Token使用统计 */
  usage: TokenUsage;
}

/** 嵌入数据 */
export interface Embedding {
  /** 对象类型 */
  object: 'embedding';
  /** 嵌入索引 */
  index: number;
  /** 嵌入向量 */
  embedding: number[];
}

// ============================================================================
// 错误类型
// ============================================================================

/** SecondMe API 错误 */
export interface SecondMeError {
  /** 错误对象 */
  error: {
    /** 错误消息 */
    message: string;
    /** 错误类型 */
    type: string;
    /** 参数 */
    param: string | null;
    /** 错误代码 */
    code: string | null;
  };
}

/** 错误代码 */
export type SecondMeErrorCode =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'rate_limit_error'
  | 'server_error'
  | 'timeout_error'
  | 'connection_error';

// ============================================================================
// 工具类型
// ============================================================================

/** 工具定义 */
export interface ToolDefinition {
  /** 工具类型 */
  type: 'function';
  /** 函数定义 */
  function: FunctionDefinition;
}

/** 函数定义 */
export interface FunctionDefinition {
  /** 函数名称 */
  name: string;
  /** 函数描述 */
  description: string;
  /** 参数定义 (JSON Schema) */
  parameters: FunctionParameters;
}

/** 函数参数 */
export interface FunctionParameters {
  /** 参数类型 */
  type: 'object';
  /** 属性定义 */
  properties: Record<string, ParameterProperty>;
  /** 必需参数列表 */
  required?: string[];
}

/** 参数属性 */
export interface ParameterProperty {
  /** 参数类型 */
  type: string;
  /** 参数描述 */
  description: string;
  /** 枚举值 */
  enum?: string[];
}

// ============================================================================
// 会话类型
// ============================================================================

/** 会话状态 */
export interface SessionState {
  /** 会话ID */
  sessionId: string;
  /** 消息历史 */
  messages: ChatMessage[];
  /** 上下文信息 */
  context?: SessionContext;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 会话上下文 */
export interface SessionContext {
  /** 任务ID */
  taskId?: string;
  /** 项目ID */
  projectId?: string;
  /** 用户ID */
  userId?: string;
  /** 自定义上下文 */
  custom?: Record<string, unknown>;
}

// ============================================================================
// 适配器接口
// ============================================================================

/** LLM 适配器接口 */
export interface LLMAdapter {
  /** 发送聊天完成请求 */
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  
  /** 发送流式聊天完成请求 */
  chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<void>;
  
  /** 获取模型列表 */
  listModels(): Promise<ModelListResponse>;
  
  /** 创建嵌入 */
  createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  
  /** 检查健康状态 */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建用户消息
 */
export function createUserMessage(content: string): ChatMessage {
  return {
    role: 'user',
    content,
  };
}

/**
 * 创建系统消息
 */
export function createSystemMessage(content: string): ChatMessage {
  return {
    role: 'system',
    content,
  };
}

/**
 * 创建助手消息
 */
export function createAssistantMessage(content: string): ChatMessage {
  return {
    role: 'assistant',
    content,
  };
}

/**
 * 计算Token数量 (估算)
 */
export function estimateTokenCount(text: string): number {
  // 简单估算: 1 token ≈ 4 字符 (英文) 或 1 字符 (中文)
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars + otherChars / 4);
}

/**
 * 截断消息历史以适应Token限制
 */
export function truncateMessages(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  let totalTokens = 0;
  const result: ChatMessage[] = [];
  
  // 从最新消息开始累加
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const tokens = estimateTokenCount(message.content);
    
    if (totalTokens + tokens > maxTokens) {
      break;
    }
    
    totalTokens += tokens;
    result.unshift(message);
  }
  
  return result;
}
