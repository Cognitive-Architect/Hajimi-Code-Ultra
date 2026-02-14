/**
 * A2A (Agent-to-Agent) Protocol Type Definitions
 * 
 * 迁移来源: src/lib/a2a/types.ts
 * 迁移方式: 完全保留
 * 代码行数: ~200行
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/** A2A 消息类型 */
export type A2AMessageType = 
  | 'chat'           // 普通聊天消息
  | 'proposal'       // 提案消息
  | 'vote'           // 投票消息
  | 'state_change'   // 状态变更消息
  | 'system'         // 系统消息
  | 'error';         // 错误消息

/** A2A 消息优先级 */
export type MessagePriority = 'high' | 'normal' | 'low';

/** Agent 角色类型 */
export type AgentRole = 
  | 'pm'        // 产品经理 (Product Manager)
  | 'arch'      // 架构师 (Architect)
  | 'qa'        // QA工程师
  | 'engineer'  // 开发工程师
  | 'mike'      // 打包者 (Mike)
  | 'ops'       // 运维工程师
  | 'system';   // 系统

// ============================================================================
// 核心消息类型
// ============================================================================

/** A2A 消息基础接口 */
export interface A2AMessage {
  /** 消息唯一标识 */
  id: string;
  
  /** 消息类型 */
  type: A2AMessageType;
  
  /** 发送者ID */
  senderId: string;
  
  /** 发送者角色 */
  senderRole: AgentRole;
  
  /** 接收者ID (可选，为空表示广播) */
  recipientId?: string;
  
  /** 消息内容 */
  content: string;
  
  /** 消息负载数据 */
  payload?: MessagePayload;
  
  /** 消息优先级 */
  priority: MessagePriority;
  
  /** 创建时间戳 */
  timestamp: number;
  
  /** 会话ID */
  sessionId: string;
  
  /** 父消息ID (用于回复) */
  parentId?: string;
  
  /** 消息元数据 */
  metadata?: MessageMetadata;
}

/** 消息负载数据类型 */
export type MessagePayload =
  | ChatPayload
  | ProposalPayload
  | VotePayload
  | StateChangePayload
  | SystemPayload
  | ErrorPayload;

/** 聊天消息负载 */
export interface ChatPayload {
  type: 'chat';
  /** 消息文本内容 */
  text: string;
  /** 附件列表 */
  attachments?: Attachment[];
  /** 引用消息 */
  references?: string[];
}

/** 提案消息负载 */
export interface ProposalPayload {
  type: 'proposal';
  /** 提案ID */
  proposalId: string;
  /** 提案标题 */
  title: string;
  /** 提案描述 */
  description: string;
  /** 提案类型 */
  proposalType: ProposalType;
  /** 目标状态 */
  targetState: string;
  /** 所需投票数 */
  requiredVotes: number;
  /** 提案过期时间 */
  expiresAt: number;
}

/** 投票消息负载 */
export interface VotePayload {
  type: 'vote';
  /** 提案ID */
  proposalId: string;
  /** 投票者ID */
  voterId: string;
  /** 投票结果 */
  vote: 'approve' | 'reject' | 'abstain';
  /** 投票理由 */
  reason?: string;
}

/** 状态变更消息负载 */
export interface StateChangePayload {
  type: 'state_change';
  /** 原状态 */
  fromState: string;
  /** 新状态 */
  toState: string;
  /** 变更原因 */
  reason: string;
  /** 触发者 */
  triggeredBy: string;
}

/** 系统消息负载 */
export interface SystemPayload {
  type: 'system';
  /** 系统事件类型 */
  eventType: SystemEventType;
  /** 事件数据 */
  eventData: Record<string, unknown>;
}

/** 错误消息负载 */
export interface ErrorPayload {
  type: 'error';
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: Record<string, unknown>;
  /** 原始消息ID */
  originalMessageId?: string;
}

// ============================================================================
// 辅助类型
// ============================================================================

/** 附件类型 */
export interface Attachment {
  /** 附件ID */
  id: string;
  /** 附件名称 */
  name: string;
  /** 附件类型 */
  mimeType: string;
  /** 附件大小 (字节) */
  size: number;
  /** 附件URL */
  url: string;
}

/** 消息元数据 */
export interface MessageMetadata {
  /** 消息来源 */
  source?: string;
  /** 客户端信息 */
  clientInfo?: ClientInfo;
  /** 处理时间 */
  processingTime?: number;
  /** 自定义字段 */
  custom?: Record<string, unknown>;
}

/** 客户端信息 */
export interface ClientInfo {
  /** 客户端类型 */
  type: 'web' | 'mobile' | 'desktop' | 'api';
  /** 客户端版本 */
  version: string;
  /** 用户代理 */
  userAgent?: string;
}

/** 提案类型 */
export type ProposalType = 
  | 'state_transition'  // 状态流转提案
  | 'config_change'     // 配置变更提案
  | 'agent_add'         // 添加Agent提案
  | 'rule_change'       // 规则变更提案
  | 'custom';           // 自定义提案

/** 系统事件类型 */
export type SystemEventType =
  | 'agent_joined'      // Agent加入
  | 'agent_left'        // Agent离开
  | 'session_started'   // 会话开始
  | 'session_ended'     // 会话结束
  | 'config_updated'    // 配置更新
  | 'error_occurred';   // 错误发生

// ============================================================================
// 会话类型
// ============================================================================

/** A2A 会话 */
export interface A2ASession {
  /** 会话ID */
  id: string;
  /** 会话名称 */
  name: string;
  /** 参与Agent列表 */
  participants: SessionParticipant[];
  /** 会话状态 */
  status: SessionStatus;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActivityAt: number;
  /** 会话元数据 */
  metadata?: SessionMetadata;
}

/** 会话参与者 */
export interface SessionParticipant {
  /** Agent ID */
  agentId: string;
  /** Agent角色 */
  role: AgentRole;
  /** 加入时间 */
  joinedAt: number;
  /** 是否在线 */
  isOnline: boolean;
  /** 最后活动时间 */
  lastActivityAt: number;
}

/** 会话状态 */
export type SessionStatus = 'active' | 'paused' | 'closed' | 'archived';

/** 会话元数据 */
export interface SessionMetadata {
  /** 关联任务ID */
  taskId?: string;
  /** 关联项目ID */
  projectId?: string;
  /** 自定义字段 */
  custom?: Record<string, unknown>;
}

// ============================================================================
// 消息查询与分页
// ============================================================================

/** 消息查询参数 */
export interface MessageQuery {
  /** 会话ID */
  sessionId?: string;
  /** 发送者ID */
  senderId?: string;
  /** 消息类型 */
  type?: A2AMessageType;
  /** 起始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 关键词搜索 */
  keyword?: string;
  /** 分页参数 */
  pagination?: PaginationParams;
}

/** 分页参数 */
export interface PaginationParams {
  /** 页码 (从1开始) */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/** 分页结果 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  items: T[];
  /** 总数量 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
  /** 是否有下一页 */
  hasNext: boolean;
  /** 是否有上一页 */
  hasPrev: boolean;
}

/** 消息分页结果 */
export type MessagePaginatedResult = PaginatedResult<A2AMessage>;

// ============================================================================
// 事件类型
// ============================================================================

/** A2A 事件类型 */
export type A2AEventType =
  | 'message:received'
  | 'message:sent'
  | 'message:updated'
  | 'message:deleted'
  | 'session:created'
  | 'session:updated'
  | 'session:closed'
  | 'participant:joined'
  | 'participant:left'
  | 'typing:start'
  | 'typing:stop'
  | 'error';

/** A2A 事件 */
export interface A2AEvent {
  /** 事件类型 */
  type: A2AEventType;
  /** 事件数据 */
  data: unknown;
  /** 事件时间戳 */
  timestamp: number;
}

/** 消息接收事件 */
export interface MessageReceivedEvent extends A2AEvent {
  type: 'message:received';
  data: A2AMessage;
}

/** 打字状态事件 */
export interface TypingEvent extends A2AEvent {
  type: 'typing:start' | 'typing:stop';
  data: {
    agentId: string;
    sessionId: string;
  };
}

// ============================================================================
// API 请求/响应类型
// ============================================================================

/** 发送消息请求 */
export interface SendMessageRequest {
  /** 消息类型 */
  type: A2AMessageType;
  /** 接收者ID */
  recipientId?: string;
  /** 消息内容 */
  content: string;
  /** 消息负载 */
  payload?: MessagePayload;
  /** 优先级 */
  priority?: MessagePriority;
  /** 父消息ID */
  parentId?: string;
  /** 元数据 */
  metadata?: MessageMetadata;
}

/** 发送消息响应 */
export interface SendMessageResponse {
  /** 是否成功 */
  success: boolean;
  /** 消息ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
}

/** 获取消息历史请求 */
export interface GetMessageHistoryRequest {
  /** 会话ID */
  sessionId: string;
  /** 分页参数 */
  pagination: PaginationParams;
  /** 过滤条件 */
  filter?: {
    type?: A2AMessageType;
    senderId?: string;
    startTime?: number;
    endTime?: number;
  };
}

/** 获取消息历史响应 */
export interface GetMessageHistoryResponse {
  /** 是否成功 */
  success: boolean;
  /** 消息列表 */
  messages?: A2AMessage[];
  /** 分页信息 */
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 工具函数类型
// ============================================================================

/** 消息验证函数 */
export type MessageValidator = (message: A2AMessage) => ValidationResult;

/** 验证结果 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/** 消息处理器 */
export type MessageHandler = (message: A2AMessage) => Promise<void> | void;

/** 事件处理器 */
export type EventHandler<T extends A2AEvent = A2AEvent> = (event: T) => Promise<void> | void;

// ============================================================================
// 配置类型
// ============================================================================

/** A2A 配置 */
export interface A2AConfig {
  /** 消息最大长度 */
  maxMessageLength: number;
  /** 附件最大大小 (MB) */
  maxAttachmentSize: number;
  /** 消息保留时间 (天) */
  messageRetentionDays: number;
  /** 是否启用消息加密 */
  enableEncryption: boolean;
  /** 心跳间隔 (毫秒) */
  heartbeatInterval: number;
  /** 重连间隔 (毫秒) */
  reconnectInterval: number;
  /** 最大重连次数 */
  maxReconnectAttempts: number;
}

/** 默认配置 */
export const DEFAULT_A2A_CONFIG: A2AConfig = {
  maxMessageLength: 10000,
  maxAttachmentSize: 50,
  messageRetentionDays: 30,
  enableEncryption: true,
  heartbeatInterval: 30000,
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
};
