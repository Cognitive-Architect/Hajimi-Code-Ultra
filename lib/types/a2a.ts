/**
 * A2A (Agent-to-Agent) Message Type Definitions
 * 
 * B-04 A2A消息模块类型定义
 */

/** A2A 消息类型 */
export type A2AMessageType = 'chat' | 'proposal' | 'vote' | 'system';

/** A2A 消息接口 */
export interface A2AMessage {
  /** 消息唯一标识 */
  id: string;
  /** 发送者标识 */
  sender: string;
  /** 接收者标识 */
  receiver: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 消息类型 */
  type: A2AMessageType;
  /** 会话标识 */
  sessionId: string;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

/** 发送消息请求 */
export interface SendMessageRequest {
  /** 发送者标识 */
  sender: string;
  /** 接收者标识 */
  receiver: string;
  /** 消息内容 */
  content: string;
  /** 消息类型（可选，默认为 'chat'） */
  type?: A2AMessageType;
  /** 会话标识（可选） */
  sessionId?: string;
  /** 扩展元数据（可选） */
  metadata?: Record<string, unknown>;
}

/** 分页选项 */
export interface PaginationOptions {
  /** 页码（从1开始，默认为1） */
  page?: number;
  /** 每页大小（默认为20） */
  pageSize?: number;
  /** 排序方式（默认为 'desc'） */
  order?: 'asc' | 'desc';
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  data: T[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页大小 */
    pageSize: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
    /** 是否有下一页 */
    hasNext: boolean;
    /** 是否有上一页 */
    hasPrev: boolean;
  };
}

/** 消息变更监听器 */
export type MessageListener = (message: A2AMessage) => void;

/** 流式消息块 */
export interface MessageChunk {
  /** 块内容 */
  content: string;
  /** 是否结束 */
  done: boolean;
  /** 消息ID */
  messageId?: string;
}

/** 流式消息回调 */
export type MessageChunkCallback = (chunk: MessageChunk) => void;

/** A2A服务配置 */
export interface A2AServiceConfig {
  /** 消息TTL（毫秒），默认7天 */
  messageTtl?: number;
  /** 默认页大小 */
  defaultPageSize?: number;
  /** 最大页大小 */
  maxPageSize?: number;
}

/** 默认配置 */
export const DEFAULT_A2A_SERVICE_CONFIG: A2AServiceConfig = {
  messageTtl: 7 * 24 * 60 * 60 * 1000, // 7天
  defaultPageSize: 20,
  maxPageSize: 100,
};

/** 生成消息ID */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** 生成会话ID */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
