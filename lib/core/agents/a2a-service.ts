/**
 * A2A Service Core Module
 * 
 * B-04 A2A消息服务核心实现
 * 使用TSA存储，消息TTL 7天
 */

import { tsa } from '@/lib/tsa';
import {
  A2AMessage,
  A2AMessageType,
  SendMessageRequest,
  PaginationOptions,
  PaginatedResponse,
  MessageListener,
  MessageChunk,
  MessageChunkCallback,
  A2AServiceConfig,
  DEFAULT_A2A_SERVICE_CONFIG,
  generateMessageId,
  generateSessionId,
} from '@/lib/types/a2a';

/** 存储键前缀 */
const STORAGE_KEY_PREFIX = 'a2a:message:';
const STORAGE_INDEX_KEY = 'a2a:session_index:';

/** A2A服务类 */
export class A2AService {
  private config: Required<A2AServiceConfig>;
  private listeners: Set<MessageListener> = new Set();
  private isInitialized = false;

  constructor(config: A2AServiceConfig = {}) {
    this.config = {
      ...DEFAULT_A2A_SERVICE_CONFIG,
      ...config,
    } as Required<A2AServiceConfig>;
  }

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;
    console.log('[A2AService] 服务已初始化');
  }

  /**
   * 获取存储键
   */
  private getStorageKey(messageId: string): string {
    return `${STORAGE_KEY_PREFIX}${messageId}`;
  }

  /**
   * 获取会话索引键
   */
  private getSessionIndexKey(sessionId: string): string {
    return `${STORAGE_INDEX_KEY}${sessionId}`;
  }

  /**
   * 发送消息
   * @param request 发送消息请求
   * @returns 创建的消息
   */
  async sendMessage(request: SendMessageRequest): Promise<A2AMessage> {
    await this.ensureInitialized();

    const timestamp = Date.now();
    const message: A2AMessage = {
      id: generateMessageId(),
      sender: request.sender,
      receiver: request.receiver,
      content: request.content,
      timestamp,
      type: request.type ?? 'chat',
      sessionId: request.sessionId ?? generateSessionId(),
      metadata: request.metadata,
    };

    // 持久化到TSA
    const storageKey = this.getStorageKey(message.id);
    await tsa.set(storageKey, message, {
      ttl: this.config.messageTtl,
    });

    // 更新会话索引
    await this.addToSessionIndex(message.sessionId, message.id);

    // 通知订阅者
    this.notifyListeners(message);

    console.log(`[A2AService] 消息已发送: ${message.id}`);
    return message;
  }

  /**
   * 发送消息（流式）
   * @param request 发送消息请求
   * @param onChunk 流式回调
   */
  async sendMessageStream(
    request: SendMessageRequest,
    onChunk: MessageChunkCallback
  ): Promise<A2AMessage> {
    await this.ensureInitialized();

    // 首先发送完整消息
    const message = await this.sendMessage(request);

    // 模拟流式响应
    const chunks = this.splitContentIntoChunks(message.content);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk: MessageChunk = {
        content: chunks[i],
        done: i === chunks.length - 1,
        messageId: message.id,
      };
      
      // 模拟延迟
      await this.delay(50);
      onChunk(chunk);
    }

    return message;
  }

  /**
   * 获取消息历史
   * @param sessionId 会话ID
   * @param options 分页选项
   * @returns 分页消息列表
   */
  async getHistory(
    sessionId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResponse<A2AMessage>> {
    await this.ensureInitialized();

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(
      options.pageSize ?? this.config.defaultPageSize,
      this.config.maxPageSize
    );
    const order = options.order ?? 'desc';

    // 获取会话消息ID列表
    const messageIds = await this.getSessionMessageIds(sessionId);
    
    // 按时间排序
    const sortedIds = order === 'asc' 
      ? messageIds 
      : [...messageIds].reverse();

    // 分页
    const total = sortedIds.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageIds = sortedIds.slice(start, end);

    // 获取消息详情
    const messages: A2AMessage[] = [];
    for (const id of pageIds) {
      const message = await tsa.get<A2AMessage>(this.getStorageKey(id));
      if (message) {
        messages.push(message);
      }
    }

    return {
      data: messages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * 订阅消息
   * @param listener 消息监听器
   * @returns 取消订阅函数
   */
  subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 取消订阅
   * @param listener 消息监听器
   */
  unsubscribe(listener: MessageListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 获取指定消息
   * @param messageId 消息ID
   * @returns 消息或null
   */
  async getMessage(messageId: string): Promise<A2AMessage | null> {
    await this.ensureInitialized();
    return tsa.get<A2AMessage>(this.getStorageKey(messageId));
  }

  /**
   * 删除消息
   * @param messageId 消息ID
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.ensureInitialized();
    
    const message = await this.getMessage(messageId);
    if (message) {
      await tsa.delete(this.getStorageKey(messageId));
      await this.removeFromSessionIndex(message.sessionId, messageId);
    }
  }

  /**
   * 获取会话列表
   * @returns 会话ID列表
   */
  async getSessions(): Promise<string[]> {
    await this.ensureInitialized();
    
    const keys = tsa.keys();
    const sessions = new Set<string>();
    
    for (const key of keys) {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        const message = await tsa.get<A2AMessage>(key);
        if (message) {
          sessions.add(message.sessionId);
        }
      }
    }
    
    return Array.from(sessions);
  }

  /**
   * 确保服务已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  /**
   * 添加到会话索引
   */
  private async addToSessionIndex(sessionId: string, messageId: string): Promise<void> {
    const indexKey = this.getSessionIndexKey(sessionId);
    const index = await tsa.get<string[]>(indexKey) ?? [];
    
    if (!index.includes(messageId)) {
      index.push(messageId);
      await tsa.set(indexKey, index, { ttl: this.config.messageTtl });
    }
  }

  /**
   * 从会话索引移除
   */
  private async removeFromSessionIndex(sessionId: string, messageId: string): Promise<void> {
    const indexKey = this.getSessionIndexKey(sessionId);
    const index = await tsa.get<string[]>(indexKey) ?? [];
    
    const newIndex = index.filter(id => id !== messageId);
    await tsa.set(indexKey, newIndex, { ttl: this.config.messageTtl });
  }

  /**
   * 获取会话消息ID列表
   */
  private async getSessionMessageIds(sessionId: string): Promise<string[]> {
    const indexKey = this.getSessionIndexKey(sessionId);
    return (await tsa.get<string[]>(indexKey)) || [];
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(message: A2AMessage): void {
    this.listeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('[A2AService] 监听器执行失败:', error);
      }
    });
  }

  /**
   * 将内容分割成块
   */
  private splitContentIntoChunks(content: string, chunkSize = 10): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks.length > 0 ? chunks : [''];
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/** 导出单例实例 */
export const a2aService = new A2AService();

export default A2AService;
