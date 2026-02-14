# 第4章 A2A消息（B-04）

> **工单编号**: B-04/09  
> **任务目标**: 实现消息发送、SecondMe适配、历史查询  
> **参考文档**: HAJIMI-V2.1-重建白皮书-v1.0.md 第4章A2A协议  
> **工期估算**: 1.5天  

---

## 4.1 A2AService类设计

### 4.1.1 类结构

```typescript
// lib/core/agents/a2a-service.ts

import { TSA } from '@/lib/tsa';
import { SecondMeAdapter } from '@/lib/adapters/secondme/client';
import { A2AMessage, SendMessageRequest, PaginationOptions, PaginatedResponse } from '@/lib/types/a2a';
import { v4 as uuidv4 } from 'uuid';

/**
 * A2A消息服务
 * 负责消息的发送、接收、持久化和历史查询
 */
export class A2AService {
  private tsa: TSA;
  private secondMeAdapter: SecondMeAdapter;
  private messageListeners: Set<(message: A2AMessage) => void> = new Set();
  
  // 消息存储Key前缀
  private static readonly MESSAGE_KEY_PREFIX = 'a2a:message:';
  private static readonly SESSION_KEY_PREFIX = 'a2a:session:';
  
  constructor(tsa: TSA, secondMeAdapter: SecondMeAdapter) {
    this.tsa = tsa;
    this.secondMeAdapter = secondMeAdapter;
  }

  /**
   * 发送消息
   * @param request 发送消息请求
   * @returns 发送成功的消息对象
   */
  async sendMessage(request: SendMessageRequest): Promise<A2AMessage> {
    const message: A2AMessage = {
      id: uuidv4(),
      sender: request.sender,
      receiver: request.receiver,
      content: request.content,
      timestamp: Date.now(),
      type: request.type || 'chat',
      sessionId: request.sessionId || this.generateSessionId(request.sender, request.receiver),
      metadata: request.metadata || {},
    };

    // 1. 持久化到TSA
    await this.persistMessage(message);

    // 2. 如果接收方是SecondMe Agent，调用API
    if (this.isSecondMeAgent(request.receiver)) {
      await this.sendToSecondMe(message);
    }

    // 3. 通知监听器
    this.notifyListeners(message);

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
    options?: PaginationOptions
  ): Promise<PaginatedResponse<A2AMessage>> {
    const { page = 1, pageSize = 20, order = 'desc' } = options || {};
    
    // 从TSA获取会话消息列表
    const sessionKey = `${A2AService.SESSION_KEY_PREFIX}${sessionId}`;
    const messageIds = await this.tsa.get<string[]>(sessionKey) || [];
    
    // 按时间排序
    const sortedIds = order === 'desc' 
      ? messageIds.reverse() 
      : messageIds;
    
    // 分页
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageIds = sortedIds.slice(start, end);
    
    // 获取消息详情
    const messages: A2AMessage[] = [];
    for (const id of pageIds) {
      const message = await this.tsa.get<A2AMessage>(`${A2AService.MESSAGE_KEY_PREFIX}${id}`);
      if (message) {
        messages.push(message);
      }
    }
    
    return {
      data: messages,
      pagination: {
        page,
        pageSize,
        total: messageIds.length,
        totalPages: Math.ceil(messageIds.length / pageSize),
        hasNext: end < messageIds.length,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * 发送消息并获取流式响应
   * @param request 发送消息请求
   * @param onChunk 流式响应回调
   */
  async sendMessageStream(
    request: SendMessageRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<A2AMessage> {
    const message = await this.sendMessage(request);
    
    if (this.isSecondMeAgent(request.receiver)) {
      await this.secondMeAdapter.chatStream(
        request.receiver,
        request.content,
        (chunk) => {
          onChunk({
            messageId: message.id,
            content: chunk,
            timestamp: Date.now(),
          });
        }
      );
    }
    
    return message;
  }

  /**
   * 订阅消息
   * @param listener 消息监听器
   * @returns 取消订阅函数
   */
  subscribe(listener: (message: A2AMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * 获取会话列表
   * @returns 会话ID列表
   */
  async getSessions(): Promise<string[]> {
    // 从TSA获取所有会话Key
    const pattern = `${A2AService.SESSION_KEY_PREFIX}*`;
    const keys = await this.tsa.keys(pattern);
    return keys.map(k => k.replace(A2AService.SESSION_KEY_PREFIX, ''));
  }

  // ============ 私有方法 ============

  /**
   * 持久化消息到TSA
   */
  private async persistMessage(message: A2AMessage): Promise<void> {
    // 1. 存储消息详情
    const messageKey = `${A2AService.MESSAGE_KEY_PREFIX}${message.id}`;
    await this.tsa.set(messageKey, message, { 
      tier: 'STAGING',
      ttl: 7 * 24 * 60 * 60 * 1000, // 7天
    });

    // 2. 更新会话消息列表
    const sessionKey = `${A2AService.SESSION_KEY_PREFIX}${message.sessionId}`;
    const existingIds = await this.tsa.get<string[]>(sessionKey) || [];
    existingIds.push(message.id);
    await this.tsa.set(sessionKey, existingIds, { 
      tier: 'STAGING',
      ttl: 7 * 24 * 60 * 60 * 1000,
    });
  }

  /**
   * 发送消息到SecondMe
   */
  private async sendToSecondMe(message: A2AMessage): Promise<void> {
    try {
      const response = await this.secondMeAdapter.chat(
        message.receiver,
        message.content,
        {
          sessionId: message.sessionId,
          sender: message.sender,
        }
      );

      // 保存SecondMe的回复
      if (response.content) {
        const replyMessage: A2AMessage = {
          id: uuidv4(),
          sender: message.receiver,
          receiver: message.sender,
          content: response.content,
          timestamp: Date.now(),
          type: 'chat',
          sessionId: message.sessionId,
          metadata: { replyTo: message.id },
        };
        await this.persistMessage(replyMessage);
        this.notifyListeners(replyMessage);
      }
    } catch (error) {
      console.error('[A2AService] Failed to send to SecondMe:', error);
      throw error;
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(sender: string, receiver: string): string {
    const sorted = [sender, receiver].sort();
    return `session:${sorted[0]}:${sorted[1]}`;
  }

  /**
   * 判断是否为SecondMe Agent
   */
  private isSecondMeAgent(agentId: string): boolean {
    // SecondMe Agent ID格式: secondme:{agentName}
    return agentId.startsWith('secondme:');
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(message: A2AMessage): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('[A2AService] Listener error:', error);
      }
    });
  }
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  messageId: string;
  content: string;
  timestamp: number;
}
```

### 4.1.2 类型定义

```typescript
// lib/types/a2a.ts

/**
 * A2A消息类型
 */
export type A2AMessageType = 'chat' | 'proposal' | 'vote' | 'system';

/**
 * A2A消息
 */
export interface A2AMessage {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: number;
  type: A2AMessageType;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * 发送消息请求
 */
export interface SendMessageRequest {
  sender: string;
  receiver: string;
  content: string;
  type?: A2AMessageType;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 分页选项
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  order?: 'asc' | 'desc';
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * 发送消息响应
 */
export interface SendMessageResponse {
  success: boolean;
  message?: A2AMessage;
  error?: string;
}

/**
 * 消息历史响应
 */
export interface HistoryResponse {
  success: boolean;
  data?: A2AMessage[];
  pagination?: PaginatedResponse<A2AMessage>['pagination'];
  error?: string;
}
```

---

## 4.2 SecondMeAdapter设计

### 4.2.1 适配器类

```typescript
// lib/adapters/secondme/client.ts

import { A2AMessageType } from '@/lib/types/a2a';

/**
 * SecondMe API配置
 */
interface SecondMeConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
}

/**
 * 聊天上下文
 */
export interface ChatContext {
  sessionId?: string;
  sender?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  metadata?: Record<string, unknown>;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  content: string;
  agentId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent信息
 */
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
}

/**
 * SecondMe适配器
 * 封装SecondMe API调用，支持普通和流式聊天
 */
export class SecondMeAdapter {
  private config: SecondMeConfig;

  constructor(config: SecondMeConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * 发送聊天消息
   * @param agentId Agent ID
   * @param message 消息内容
   * @param context 聊天上下文
   * @returns 聊天响应
   */
  async chat(
    agentId: string,
    message: string,
    context?: ChatContext
  ): Promise<ChatResponse> {
    const url = `${this.config.baseUrl}/api/chat`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        agent_id: agentId.replace('secondme:', ''),
        message,
        session_id: context?.sessionId,
        context: context?.history,
        metadata: context?.metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SecondMe API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.response || data.content || data.message,
      agentId,
      timestamp: Date.now(),
      metadata: data.metadata,
    };
  }

  /**
   * 流式聊天
   * @param agentId Agent ID
   * @param message 消息内容
   * @param onChunk 流式响应回调
   */
  async chatStream(
    agentId: string,
    message: string,
    onChunk: (chunk: string) => void,
    context?: ChatContext
  ): Promise<void> {
    const url = `${this.config.baseUrl}/api/chat/stream`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        agent_id: agentId.replace('secondme:', ''),
        message,
        session_id: context?.sessionId,
        context: context?.history,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SecondMe API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // 读取流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // 解析SSE格式
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || 
                             parsed.content || 
                             parsed.delta;
              if (content) {
                onChunk(content);
              }
            } catch {
              // 非JSON数据直接返回
              onChunk(data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 获取Agent信息
   * @param agentId Agent ID
   * @returns Agent信息
   */
  async getAgentInfo(agentId: string): Promise<AgentInfo> {
    const url = `${this.config.baseUrl}/api/agents/${agentId.replace('secondme:', '')}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get agent info: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 获取所有可用Agent
   * @returns Agent列表
   */
  async listAgents(): Promise<AgentInfo[]> {
    const url = `${this.config.baseUrl}/api/agents`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${response.status}`);
    }

    const data = await response.json();
    return data.agents || data;
  }
}
```

### 4.2.2 Mock实现（本地开发）

```typescript
// lib/adapters/secondme/mock.ts

import { SecondMeAdapter, ChatResponse, ChatContext, AgentInfo } from './client';

/**
 * Mock SecondMe适配器
 * 用于本地开发测试，无需真实SecondMe API
 */
export class MockSecondMeAdapter extends SecondMeAdapter {
  private mockAgents: Map<string, AgentInfo> = new Map([
    ['secondme:assistant', {
      id: 'secondme:assistant',
      name: 'AI助手',
      description: '通用AI助手',
      capabilities: ['chat', 'analysis', 'coding'],
      status: 'online',
    }],
    ['secondme:code-reviewer', {
      id: 'secondme:code-reviewer',
      name: '代码审查员',
      description: '专业的代码审查Agent',
      capabilities: ['code-review', 'suggestions'],
      status: 'online',
    }],
  ]);

  private mockResponses: Map<string, string[]> = new Map([
    ['default', [
      '我理解您的问题，让我来帮您分析。',
      '这是一个很好的问题，我有几点建议。',
      '收到，我正在处理您的请求。',
      '根据您的描述，我建议采取以下方案。',
    ]],
    ['code-review', [
      '代码整体结构良好，建议优化异常处理。',
      '发现一处潜在的性能问题，建议缓存结果。',
      '变量命名清晰，但缺少必要的注释。',
      '建议添加单元测试覆盖边界情况。',
    ]],
  ]);

  constructor() {
    super({ apiKey: 'mock-key', baseUrl: 'http://localhost:3001' });
  }

  async chat(
    agentId: string,
    message: string,
    context?: ChatContext
  ): Promise<ChatResponse> {
    // 模拟网络延迟
    await this.delay(500 + Math.random() * 1000);

    // 生成模拟响应
    const response = this.generateMockResponse(agentId, message);
    
    return {
      content: response,
      agentId,
      timestamp: Date.now(),
      metadata: { mock: true },
    };
  }

  async chatStream(
    agentId: string,
    message: string,
    onChunk: (chunk: string) => void,
    context?: ChatContext
  ): Promise<void> {
    const response = this.generateMockResponse(agentId, message);
    
    // 模拟流式输出
    const words = response.split('');
    for (const word of words) {
      await this.delay(30 + Math.random() * 50);
      onChunk(word);
    }
  }

  async getAgentInfo(agentId: string): Promise<AgentInfo> {
    await this.delay(100);
    
    const agent = this.mockAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    return agent;
  }

  async listAgents(): Promise<AgentInfo[]> {
    await this.delay(100);
    return Array.from(this.mockAgents.values());
  }

  /**
   * 添加Mock Agent
   */
  addMockAgent(agent: AgentInfo): void {
    this.mockAgents.set(agent.id, agent);
  }

  /**
   * 添加Mock响应
   */
  addMockResponse(pattern: string, responses: string[]): void {
    this.mockResponses.set(pattern, responses);
  }

  // ============ 私有方法 ============

  private generateMockResponse(agentId: string, message: string): string {
    // 根据Agent类型选择响应模板
    let templateKey = 'default';
    if (agentId.includes('code') || agentId.includes('review')) {
      templateKey = 'code-review';
    }

    const templates = this.mockResponses.get(templateKey) || this.mockResponses.get('default')!;
    const template = templates[Math.floor(Math.random() * templates.length)];

    // 根据消息内容生成个性化响应
    if (message.includes('?') || message.includes('？')) {
      return `${template}\n\n关于您的问题，我需要更多信息来给出准确的答案。`;
    }

    if (message.length > 100) {
      return `${template}\n\n您提供了详细的信息，这很有帮助。`;
    }

    return template;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建SecondMe适配器工厂
 * 根据环境变量决定使用真实还是Mock适配器
 */
export function createSecondMeAdapter(): SecondMeAdapter {
  const useMock = process.env.SECONDME_MOCK === 'true' || 
                  process.env.NODE_ENV === 'development';

  if (useMock) {
    console.log('[SecondMeAdapter] Using Mock adapter');
    return new MockSecondMeAdapter();
  }

  const apiKey = process.env.SECONDME_API_KEY;
  const baseUrl = process.env.SECONDME_BASE_URL || 'https://api.secondme.io';

  if (!apiKey) {
    console.warn('[SecondMeAdapter] SECONDME_API_KEY not set, falling back to mock');
    return new MockSecondMeAdapter();
  }

  console.log('[SecondMeAdapter] Using real adapter');
  return new SecondMeAdapter({ apiKey, baseUrl });
}
```

---

## 4.3 API路由实现

### 4.3.1 发送消息路由

```typescript
// app/api/v1/a2a/send/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { A2AService } from '@/lib/core/agents/a2a-service';
import { createSecondMeAdapter } from '@/lib/adapters/secondme/mock';
import { tsa } from '@/lib/tsa';

// 请求体验证Schema
const SendMessageSchema = z.object({
  sender: z.string().min(1).max(64),
  receiver: z.string().min(1).max(64),
  content: z.string().min(1).max(10000),
  type: z.enum(['chat', 'proposal', 'vote', 'system']).optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  stream: z.boolean().optional(),
});

// 初始化服务
let a2aService: A2AService | null = null;

async function getA2AService(): Promise<A2AService> {
  if (!a2aService) {
    await tsa.init();
    const secondMeAdapter = createSecondMeAdapter();
    a2aService = new A2AService(tsa, secondMeAdapter);
  }
  return a2aService;
}

/**
 * POST /api/v1/a2a/send
 * 发送A2A消息
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();
    
    // 2. 验证请求
    const validation = SendMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request',
          details: validation.error.issues 
        },
        { status: 400 }
      );
    }

    const { stream, ...messageData } = validation.data;
    const service = await getA2AService();

    // 3. 流式响应
    if (stream) {
      const encoder = new TextEncoder();
      const streamResponse = new TransformStream();
      const writer = streamResponse.writable.getWriter();

      // 异步处理流式响应
      (async () => {
        try {
          await service.sendMessageStream(
            messageData,
            (chunk) => {
              const data = JSON.stringify({
                type: 'chunk',
                data: chunk,
              });
              writer.write(encoder.encode(`data: ${data}\n\n`));
            }
          );
          
          writer.write(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errorData = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          writer.write(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          writer.close();
        }
      })();

      return new NextResponse(streamResponse.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 4. 普通响应
    const message = await service.sendMessage(messageData);
    
    return NextResponse.json({
      success: true,
      message,
    });

  } catch (error) {
    console.error('[API] /api/v1/a2a/send error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
```

### 4.3.2 消息历史路由

```typescript
// app/api/v1/a2a/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { A2AService } from '@/lib/core/agents/a2a-service';
import { createSecondMeAdapter } from '@/lib/adapters/secondme/mock';
import { tsa } from '@/lib/tsa';

// 查询参数验证Schema
const HistoryQuerySchema = z.object({
  sessionId: z.string().min(1),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// 初始化服务
let a2aService: A2AService | null = null;

async function getA2AService(): Promise<A2AService> {
  if (!a2aService) {
    await tsa.init();
    const secondMeAdapter = createSecondMeAdapter();
    a2aService = new A2AService(tsa, secondMeAdapter);
  }
  return a2aService;
}

/**
 * GET /api/v1/a2a/history
 * 获取消息历史
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析查询参数
    const { searchParams } = new URL(request.url);
    const query = {
      sessionId: searchParams.get('sessionId') || '',
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      order: searchParams.get('order'),
    };

    // 2. 验证参数
    const validation = HistoryQuerySchema.safeParse(query);
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters',
          details: validation.error.issues 
        },
        { status: 400 }
      );
    }

    const { sessionId, page, pageSize, order } = validation.data;
    const service = await getA2AService();

    // 3. 获取历史消息
    const result = await service.getHistory(sessionId, {
      page,
      pageSize,
      order,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });

  } catch (error) {
    console.error('[API] /api/v1/a2a/history error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
```

### 4.3.3 会话列表路由（可选）

```typescript
// app/api/v1/a2a/sessions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { A2AService } from '@/lib/core/agents/a2a-service';
import { createSecondMeAdapter } from '@/lib/adapters/secondme/mock';
import { tsa } from '@/lib/tsa';

let a2aService: A2AService | null = null;

async function getA2AService(): Promise<A2AService> {
  if (!a2aService) {
    await tsa.init();
    const secondMeAdapter = createSecondMeAdapter();
    a2aService = new A2AService(tsa, secondMeAdapter);
  }
  return a2aService;
}

/**
 * GET /api/v1/a2a/sessions
 * 获取会话列表
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const service = await getA2AService();
    const sessions = await service.getSessions();

    return NextResponse.json({
      success: true,
      sessions,
    });

  } catch (error) {
    console.error('[API] /api/v1/a2a/sessions error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
```

---

## 4.4 自测点（必须包含验证命令）

### 4.4.1 自测点清单

| 自测ID | 验证命令 | 通过标准 | 状态 |
|--------|----------|----------|------|
| A2A-001 | `curl -X POST http://localhost:3000/api/v1/a2a/send -H "Content-Type: application/json" -d '{"sender":"user1","receiver":"user2","content":"Hello"}'` | 返回success=true，message包含id/timestamp | 🔴 |
| A2A-002 | `curl -N http://localhost:3000/api/v1/a2a/send -H "Content-Type: application/json" -d '{"sender":"user1","receiver":"secondme:assistant","content":"Hi","stream":true}'` | 返回SSE流，包含data: chunks和data: [DONE] | 🔴 |
| A2A-003 | `curl "http://localhost:3000/api/v1/a2a/history?sessionId=session:user1:user2&page=1&pageSize=10"` | 返回success=true，data为消息数组，包含pagination | 🔴 |
| A2A-004 | 并发测试脚本 | 100条并发消息全部持久化，无丢失 | 🔴 |

### 4.4.2 详细验证命令

#### A2A-001: 消息发送并持久化到TSA

```bash
# 1. 发送消息
curl -X POST http://localhost:3000/api/v1/a2a/send \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "user1",
    "receiver": "user2",
    "content": "Hello, this is a test message!",
    "type": "chat"
  }'

# 预期响应
{
  "success": true,
  "message": {
    "id": "uuid-string",
    "sender": "user1",
    "receiver": "user2",
    "content": "Hello, this is a test message!",
    "timestamp": 1234567890,
    "type": "chat",
    "sessionId": "session:user1:user2"
  }
}

# 通过标准
# 1. HTTP状态码 200
# 2. success 为 true
# 3. message.id 存在且为有效UUID
# 4. message.timestamp 存在且为有效时间戳
```

#### A2A-002: SecondMe API流式响应正常

```bash
# 2. 流式发送消息到SecondMe Agent
curl -N http://localhost:3000/api/v1/a2a/send \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "user1",
    "receiver": "secondme:assistant",
    "content": "Hello, can you help me?",
    "stream": true
  }'

# 预期响应 (SSE格式)
data: {"type":"chunk","data":"Hello"}
data: {"type":"chunk","data":"!"}
data: {"type":"chunk","data":" I"}
data: {"type":"chunk","data":" can"}
...
data: [DONE]

# 通过标准
# 1. Content-Type: text/event-stream
# 2. 包含多个 data: 开头的行
# 3. 最后包含 data: [DONE]
# 4. 无错误响应
```

#### A2A-003: 消息历史分页查询

```bash
# 3. 查询消息历史
curl "http://localhost:3000/api/v1/a2a/history?sessionId=session:user1:user2&page=1&pageSize=5&order=desc"

# 预期响应
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "sender": "user1",
      "receiver": "user2",
      "content": "Hello, this is a test message!",
      "timestamp": 1234567890,
      "type": "chat",
      "sessionId": "session:user1:user2"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 5,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}

# 通过标准
# 1. HTTP状态码 200
# 2. success 为 true
# 3. data 为数组
# 4. pagination 包含完整分页信息
# 5. 消息按指定order排序
```

#### A2A-004: 并发消息不丢失

```bash
# 4. 并发测试脚本 (concurrent-test.sh)
#!/bin/bash

SESSION_ID="session:concurrent:test"
TOTAL=100

echo "Starting concurrent test with $TOTAL messages..."

# 发送并发请求
for i in $(seq 1 $TOTAL); do
  curl -s -X POST http://localhost:3000/api/v1/a2a/send \
    -H "Content-Type: application/json" \
    -d "{
      \"sender\": \"user1\",
      \"receiver\": \"user2\",
      \"content\": \"Message $i\",
      \"sessionId\": \"$SESSION_ID\"
    }" > /dev/null &
done

wait
echo "All requests sent."

# 等待数据持久化
sleep 2

# 验证消息数量
RESPONSE=$(curl -s "http://localhost:3000/api/v1/a2a/history?sessionId=$SESSION_ID&page=1&pageSize=$TOTAL")
COUNT=$(echo $RESPONSE | jq '.pagination.total')

echo "Expected: $TOTAL, Actual: $COUNT"

if [ "$COUNT" -eq "$TOTAL" ]; then
  echo "✅ A2A-004 PASSED: All messages persisted"
  exit 0
else
  echo "❌ A2A-004 FAILED: Message loss detected"
  exit 1
fi

# 通过标准
# 1. 发送的100条消息全部持久化
# 2. 查询返回的总数等于发送数
# 3. 无重复消息
```

---

## 4.5 文件变更清单

### 4.5.1 新增文件

| 文件路径 | 说明 | 大小估算 |
|----------|------|----------|
| `lib/core/agents/a2a-service.ts` | A2AService核心类 | ~350行 |
| `lib/adapters/secondme/client.ts` | SecondMe适配器 | ~200行 |
| `lib/adapters/secondme/mock.ts` | Mock适配器 | ~150行 |
| `lib/types/a2a.ts` | A2A类型定义 | ~80行 |
| `app/api/v1/a2a/send/route.ts` | 发送消息API | ~120行 |
| `app/api/v1/a2a/history/route.ts` | 历史查询API | ~80行 |
| `app/api/v1/a2a/sessions/route.ts` | 会话列表API | ~50行 |

### 4.5.2 修改文件

| 文件路径 | 修改说明 |
|----------|----------|
| `lib/tsa/index.ts` | 添加`keys()`方法支持模式匹配 |
| `.env.example` | 添加SecondMe相关环境变量 |

### 4.5.3 环境变量配置

```bash
# .env.example

# SecondMe API配置
SECONDME_API_KEY=your_api_key_here
SECONDME_BASE_URL=https://api.secondme.io

# Mock模式（开发环境使用）
SECONDME_MOCK=true
```

---

## 4.6 技术债务声明

### 4.6.1 Mock清单

| Mock项 | 说明 | 影响范围 | 替换条件 |
|--------|------|----------|----------|
| `MockSecondMeAdapter` | 本地模拟SecondMe API响应 | 开发环境 | 获得真实SecondMe API密钥 |
| `Mock Agent数据` | 预置的2个测试Agent | 开发/测试 | 接入真实Agent注册中心 |
| `Mock响应模板` | 固定的回复内容 | 开发/测试 | 接入真实LLM响应 |

### 4.6.2 SecondMe API可用性声明

```
⚠️ 技术债务声明

1. SecondMe API当前使用本地Mock实现
   - 文件: lib/adapters/secondme/mock.ts
   - 原因: 真实API密钥未配置/SecondMe服务不可用
   
2. Mock实现限制:
   - 响应内容为预设模板，非真实AI生成
   - 不支持复杂对话上下文
   - 不支持自定义Agent训练
   
3. 切换到真实API步骤:
   a. 获取SecondMe API密钥
   b. 配置环境变量 SECONDME_API_KEY
   c. 设置 SECONDME_MOCK=false
   d. 重启服务

4. 预计债务清理时间: 获得API访问权限后1小时内
```

### 4.6.3 待完善项

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 消息加密 | P2 | 敏感消息端到端加密 |
| 消息撤回 | P2 | 已发送消息撤回功能 |
| 消息已读回执 | P2 | 显示消息已读状态 |
| 文件附件 | P3 | 支持图片/文件传输 |
| 消息搜索 | P3 | 全文搜索历史消息 |

---

## 附录：快速开始

### 安装依赖

```bash
npm install uuid
npm install -D @types/uuid
```

### 启动开发服务器

```bash
# 使用Mock模式
SECONDME_MOCK=true npm run dev

# 或使用真实API（需配置密钥）
SECONDME_API_KEY=xxx npm run dev
```

### 运行自测

```bash
# 运行所有A2A自测
cd scripts
bash a2a-test-suite.sh

# 预期输出
# ✅ A2A-001 PASSED
# ✅ A2A-002 PASSED
# ✅ A2A-003 PASSED
# ✅ A2A-004 PASSED
```

---

> **文档版本**: v1.0  
> **最后更新**: 2026-02-13  
> **作者**: B-04 A2A消息业务逻辑专家  
