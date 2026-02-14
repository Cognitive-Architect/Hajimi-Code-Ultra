/**
 * Agents Core Module
 * 
 * B-04 A2A消息模块统一导出
 */

// A2A服务
export {
  A2AService,
  a2aService,
} from './a2a-service';

// 类型导出（从types模块重新导出以便使用）
export type {
  A2AMessage,
  A2AMessageType,
  SendMessageRequest,
  PaginationOptions,
  PaginatedResponse,
  MessageListener,
  MessageChunk,
  MessageChunkCallback,
  A2AServiceConfig,
} from '@/lib/types/a2a';

// 工具函数
export {
  generateMessageId,
  generateSessionId,
  DEFAULT_A2A_SERVICE_CONFIG,
} from '@/lib/types/a2a';
