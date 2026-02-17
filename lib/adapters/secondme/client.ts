/**
 * SecondMe Adapter Client
 * 
 * @deprecated DEPRECATED - HAJIMI-DEBT-CLEARANCE-001
 *   迁移目标: lib/quintant/adapters/secondme.ts
 *   迁移时间: 2026-02-17
 *   保留原因: 向后兼容
 *   计划移除: v1.6.0
 * 
 * B-04 SecondMe适配器实现 (已迁移)
 * Mock实现，返回固定响应
 * 
 * @see lib/quintant/adapters/secondme.ts - 新实现位置
 * @see HAJIMI-V1.5.0-DEBT-AUDIT-REPORT-v1.0.md - 审计报告
 */

import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  createAssistantMessage,
  createUserMessage,
} from '@/lib/adapters/secondme/types';

/** 聊天上下文 */
export interface ChatContext {
  /** 会话ID */
  sessionId?: string;
  /** 自定义上下文数据 */
  custom?: Record<string, unknown>;
}

/** SecondMe适配器 */
export class SecondMeAdapter {
  private mockResponses: string[] = [
    '收到您的消息，我正在处理中...',
    '这是一个模拟的SecondMe响应。',
    '作为AI助手，我可以帮助您完成各种任务。',
    '我已经理解了您的需求，正在为您生成回复。',
    '根据您的问题，我建议采取以下方案...',
  ];

  /**
   * 普通聊天
   * @param agentId Agent标识
   * @param message 用户消息
   * @param context 聊天上下文（可选）
   * @returns 聊天完成响应
   */
  async chat(
    agentId: string,
    message: string,
    context?: ChatContext
  ): Promise<ChatCompletionResponse> {
    console.log(`[SecondMeAdapter] 聊天请求 - Agent: ${agentId}, Message: ${message}`);

    // Mock响应
    const mockResponse = this.getRandomResponse();
    const timestamp = Math.floor(Date.now() / 1000);

    const response: ChatCompletionResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: timestamp,
      model: 'secondme-mock-model',
      choices: [
        {
          index: 0,
          message: createAssistantMessage(mockResponse),
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: this.estimateTokens(message),
        completion_tokens: this.estimateTokens(mockResponse),
        total_tokens: this.estimateTokens(message) + this.estimateTokens(mockResponse),
      },
    };

    // 模拟网络延迟
    await this.delay(300);

    return response;
  }

  /**
   * 流式聊天
   * @param agentId Agent标识
   * @param message 用户消息
   * @param onChunk 流式回调
   * @param context 聊天上下文（可选）
   */
  async chatStream(
    agentId: string,
    message: string,
    onChunk: (chunk: ChatCompletionChunk) => void,
    context?: ChatContext
  ): Promise<void> {
    console.log(`[SecondMeAdapter] 流式聊天请求 - Agent: ${agentId}, Message: ${message}`);

    const mockResponse = this.getRandomResponse();
    const timestamp = Math.floor(Date.now() / 1000);
    const responseId = `chatcmpl-${Date.now()}`;
    const chunks = this.splitIntoChunks(mockResponse);

    // 发送角色信息
    const roleChunk: ChatCompletionChunk = {
      id: responseId,
      object: 'chat.completion.chunk',
      created: timestamp,
      model: 'secondme-mock-model',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        },
      ],
    };
    onChunk(roleChunk);
    await this.delay(50);

    // 发送内容块
    for (let i = 0; i < chunks.length; i++) {
      const chunk: ChatCompletionChunk = {
        id: responseId,
        object: 'chat.completion.chunk',
        created: timestamp,
        model: 'secondme-mock-model',
        choices: [
          {
            index: 0,
            delta: { content: chunks[i] },
            finish_reason: i === chunks.length - 1 ? 'stop' : null,
          },
        ],
      };
      onChunk(chunk);
      await this.delay(100);
    }
  }

  /**
   * 健康检查
   * @returns 是否健康
   */
  async healthCheck(): Promise<boolean> {
    // Mock实现，始终返回健康
    return true;
  }

  /**
   * 获取模型列表
   * @returns 模型列表
   */
  async listModels(): Promise<string[]> {
    return ['secondme-mock-model', 'secondme-v1', 'secondme-lite'];
  }

  /**
   * 创建聊天完成请求
   * @param messages 消息列表
   * @returns 聊天完成响应
   */
  async createChatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage?.content === 'string' 
      ? lastMessage.content 
      : '';
    
    return this.chat('default-agent', content);
  }

  /**
   * 获取随机响应
   */
  private getRandomResponse(): string {
    const index = Math.floor(Math.random() * this.mockResponses.length);
    return this.mockResponses[index];
  }

  /**
   * 将文本分割成块
   */
  private splitIntoChunks(text: string, chunkSize = 5): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 估算token数量
   */
  private estimateTokens(text: string): number {
    // 简单估算: 1 token ≈ 4 字符 (英文) 或 1 字符 (中文)
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars + otherChars / 4);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/** 导出单例实例 */
export const secondMeAdapter = new SecondMeAdapter();

export default SecondMeAdapter;
