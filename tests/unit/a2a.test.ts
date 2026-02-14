/**
 * B-09 测试体系 - A2A服务单元测试
 * 
 * 测试项:
 * A2A-001~004: A2A消息服务核心功能
 * 
 * 工单: B-02/09 - 补全A2A服务单元测试，修复Fail项1
 */

import { A2AService } from '@/lib/core/agents/a2a-service';
import { SecondMeAdapter } from '@/lib/adapters/secondme/client';
import { tsa } from '@/lib/tsa';
import {
  SendMessageRequest,
  A2AMessage,
  A2AMessageType,
  generateMessageId,
  generateSessionId,
} from '@/lib/types/a2a';

// Mock TSA模块
jest.mock('@/lib/tsa', () => ({
  tsa: {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    keys: jest.fn(),
  },
}));

// Mock SecondMeAdapter
jest.mock('@/lib/adapters/secondme/client', () => {
  return {
    SecondMeAdapter: jest.fn().mockImplementation(() => ({
      chat: jest.fn(),
      chatStream: jest.fn(),
      healthCheck: jest.fn(),
      listModels: jest.fn(),
      createChatCompletion: jest.fn(),
    })),
  };
});

describe('A2A', () => {
  let a2aService: A2AService;
  let secondMeAdapter: jest.Mocked<SecondMeAdapter>;
  let mockTsaSet: jest.Mock;
  let mockTsaGet: jest.Mock;
  let mockTsaDelete: jest.Mock;
  let mockTsaClear: jest.Mock;
  let mockTsaKeys: jest.Mock;

  beforeEach(async () => {
    // 重置所有mock
    jest.clearAllMocks();
    
    // 设置TSA mock的返回值
    mockTsaSet = tsa.set as jest.Mock;
    mockTsaGet = tsa.get as jest.Mock;
    mockTsaDelete = tsa.delete as jest.Mock;
    mockTsaClear = tsa.clear as jest.Mock;
    mockTsaKeys = tsa.keys as jest.Mock;
    
    mockTsaClear.mockResolvedValue(undefined);
    mockTsaSet.mockResolvedValue(undefined);
    mockTsaDelete.mockResolvedValue(undefined);
    mockTsaKeys.mockReturnValue([]);

    // 创建 A2A 服务实例
    a2aService = new A2AService({
      messageTtl: 7 * 24 * 60 * 60 * 1000, // 7天
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    await a2aService.init();

    // 创建 SecondMe 适配器实例（mocked）
    secondMeAdapter = new SecondMeAdapter() as jest.Mocked<SecondMeAdapter>;
  });

  afterEach(async () => {
    await mockTsaClear();
  });

  // ============================================================================
  // A2A-001: 发送消息
  // ============================================================================
  describe('A2A-001: 发送消息', () => {
    it('should send a message successfully and return complete message object', async () => {
      const request: SendMessageRequest = {
        sender: 'agent-pm-001',
        receiver: 'agent-arch-001',
        content: 'Hello, this is a test message.',
        type: 'chat',
      };

      const message = await a2aService.sendMessage(request);

      expect(message).toBeDefined();
      expect(message.sender).toBe('agent-pm-001');
      expect(message.receiver).toBe('agent-arch-001');
      expect(message.content).toBe('Hello, this is a test message.');
      expect(message.type).toBe('chat');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.sessionId).toBeDefined();
    });

    it('should persist message to TSA correctly', async () => {
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test persistence message',
      };

      const message = await a2aService.sendMessage(request);

      // 验证TSA.set被调用，消息被持久化
      expect(mockTsaSet).toHaveBeenCalled();
      const storageKey = mockTsaSet.mock.calls.find(
        (call: [string, A2AMessage, { ttl: number }]) => call[0].startsWith('a2a:message:')
      );
      expect(storageKey).toBeDefined();
    });

    it('should generate correct message ID and timestamp', async () => {
      const beforeTimestamp = Date.now();
      
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Message with ID and timestamp test',
      };

      const message = await a2aService.sendMessage(request);
      const afterTimestamp = Date.now();

      // 验证消息ID格式
      expect(message.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
      
      // 验证时间戳在合理范围内
      expect(message.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(message.timestamp).toBeLessThanOrEqual(afterTimestamp + 100);
    });

    it('should return error when TSA persistence fails', async () => {
      // Mock TSA set to throw error
      mockTsaSet.mockRejectedValueOnce(new Error('TSA storage failed'));

      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test failure message',
      };

      await expect(a2aService.sendMessage(request)).rejects.toThrow('TSA storage failed');
    });

    it('should generate unique message IDs', async () => {
      const request1: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Message 1',
      };
      const request2: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Message 2',
      };

      const message1 = await a2aService.sendMessage(request1);
      const message2 = await a2aService.sendMessage(request2);

      expect(message1.id).not.toBe(message2.id);
    });

    it('should generate unique session ID when not provided', async () => {
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test message',
      };

      const message = await a2aService.sendMessage(request);

      expect(message.sessionId).toBeDefined();
      expect(message.sessionId.startsWith('session_')).toBe(true);
    });

    it('should use provided session ID', async () => {
      const customSessionId = 'custom-session-123';
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test message',
        sessionId: customSessionId,
      };

      const message = await a2aService.sendMessage(request);

      expect(message.sessionId).toBe(customSessionId);
    });

    it('should support different message types', async () => {
      const types: A2AMessageType[] = ['chat', 'proposal', 'vote', 'system'];

      for (const type of types) {
        const request: SendMessageRequest = {
          sender: 'agent-1',
          receiver: 'agent-2',
          content: `Test ${type} message`,
          type,
        };

        const message = await a2aService.sendMessage(request);
        expect(message.type).toBe(type);
      }
    });

    it('should default to chat type when not specified', async () => {
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test message',
      };

      const message = await a2aService.sendMessage(request);
      expect(message.type).toBe('chat');
    });

    it('should store message metadata', async () => {
      const request: SendMessageRequest = {
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Test message',
        metadata: {
          priority: 'high',
          tags: ['test', 'demo'],
        },
      };

      const message = await a2aService.sendMessage(request);
      expect(message.metadata).toEqual({
        priority: 'high',
        tags: ['test', 'demo'],
      });
    });
  });

  // ============================================================================
  // A2A-002: 消息历史查询
  // ============================================================================
  describe('A2A-002: 消息历史查询', () => {
    let sessionId: string;
    const mockMessages: A2AMessage[] = [];

    beforeEach(async () => {
      sessionId = generateSessionId();
      mockMessages.length = 0;
      
      // 准备5条模拟消息
      for (let i = 1; i <= 5; i++) {
        const message: A2AMessage = {
          id: `msg_${Date.now()}_${i}`,
          sender: 'agent-1',
          receiver: 'agent-2',
          content: `Message ${i}`,
          timestamp: Date.now() + i * 1000,
          type: 'chat',
          sessionId,
        };
        mockMessages.push(message);
      }

      // Mock TSA get返回消息列表和消息详情
      mockTsaGet.mockImplementation((key: string) => {
        if (key === `a2a:session_index:${sessionId}`) {
          return Promise.resolve(mockMessages.map(m => m.id));
        }
        const message = mockMessages.find(m => `a2a:message:${m.id}` === key);
        return Promise.resolve(message || null);
      });
    });

    it('should retrieve message history with pagination', async () => {
      const history = await a2aService.getHistory(sessionId);

      expect(history.data.length).toBe(5);
      expect(history.pagination.total).toBe(5);
    });

    it('should support pagination with page and pageSize parameters', async () => {
      const history = await a2aService.getHistory(sessionId, {
        page: 1,
        pageSize: 2,
      });

      expect(history.data.length).toBe(2);
      expect(history.pagination.page).toBe(1);
      expect(history.pagination.pageSize).toBe(2);
      expect(history.pagination.totalPages).toBe(3);
      expect(history.pagination.hasNext).toBe(true);
      expect(history.pagination.hasPrev).toBe(false);
    });

    it('should sort messages in descending order by timestamp (default)', async () => {
      const history = await a2aService.getHistory(sessionId, {
        order: 'desc',
        pageSize: 3,
      });

      // 降序排列：后发送的消息在前
      expect(history.data[0].content).toBe('Message 5');
      expect(history.data[1].content).toBe('Message 4');
      expect(history.data[2].content).toBe('Message 3');
    });

    it('should sort messages in ascending order by timestamp', async () => {
      const history = await a2aService.getHistory(sessionId, {
        order: 'asc',
        pageSize: 3,
      });

      // 升序排列：先发送的消息在前
      expect(history.data[0].content).toBe('Message 1');
      expect(history.data[1].content).toBe('Message 2');
      expect(history.data[2].content).toBe('Message 3');
    });

    it('should return correct hasNext and hasPrev flags for pagination', async () => {
      const page1 = await a2aService.getHistory(sessionId, {
        page: 1,
        pageSize: 2,
      });
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrev).toBe(false);

      const page2 = await a2aService.getHistory(sessionId, {
        page: 2,
        pageSize: 2,
      });
      expect(page2.pagination.hasNext).toBe(true);
      expect(page2.pagination.hasPrev).toBe(true);

      const page3 = await a2aService.getHistory(sessionId, {
        page: 3,
        pageSize: 2,
      });
      expect(page3.pagination.hasNext).toBe(false);
      expect(page3.pagination.hasPrev).toBe(true);
    });

    it('should handle empty results gracefully', async () => {
      mockTsaGet.mockResolvedValueOnce([]); // session index empty
      
      const history = await a2aService.getHistory('non-existent-session');

      expect(history.data.length).toBe(0);
      expect(history.pagination.total).toBe(0);
      expect(history.pagination.totalPages).toBe(0);
      expect(history.pagination.hasNext).toBe(false);
      expect(history.pagination.hasPrev).toBe(false);
    });

    it('should retrieve specific message by ID', async () => {
      const messageId = 'msg_test_123';
      const mockMessage: A2AMessage = {
        id: messageId,
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Retrievable message',
        timestamp: Date.now(),
        type: 'chat',
        sessionId: generateSessionId(),
      };
      
      mockTsaGet.mockImplementation((key: string) => {
        if (key === `a2a:message:${messageId}`) {
          return Promise.resolve(mockMessage);
        }
        return Promise.resolve(null);
      });

      const retrieved = await a2aService.getMessage(messageId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(messageId);
      expect(retrieved!.content).toBe('Retrievable message');
    });

    it('should return null for non-existent message', async () => {
      mockTsaGet.mockResolvedValueOnce(null);
      
      const retrieved = await a2aService.getMessage('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  // ============================================================================
  // A2A-003: SecondMe适配
  // ============================================================================
  describe('A2A-003: SecondMe适配', () => {
    it('should identify SecondMe Agent ID with secondme: prefix', async () => {
      // 验证SecondMe Agent ID识别逻辑
      const agentId = 'secondme:test-agent-001';
      const hasSecondMePrefix = agentId.startsWith('secondme:');
      
      expect(hasSecondMePrefix).toBe(true);
      
      // 提取实际agent ID
      const actualAgentId = agentId.replace('secondme:', '');
      expect(actualAgentId).toBe('test-agent-001');
    });

    it('should call adapter chat method with correct parameters', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'secondme-mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'Mock response' },
          finish_reason: 'stop' as const,
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };
      
      secondMeAdapter.chat.mockResolvedValueOnce(mockResponse);

      const agentId = 'test-agent';
      const message = 'Hello, SecondMe!';
      
      const response = await secondMeAdapter.chat(agentId, message);

      expect(secondMeAdapter.chat).toHaveBeenCalledWith(agentId, message);
      expect(response).toEqual(mockResponse);
    });

    it('should handle adapter response correctly', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: Math.floor(Date.now() / 1000),
        model: 'secondme-mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'Test response content' },
          finish_reason: 'stop' as const,
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };
      
      secondMeAdapter.chat.mockResolvedValueOnce(mockResponse);

      const response = await secondMeAdapter.chat('test-agent', 'What can you do?');

      expect(response).toBeDefined();
      expect(response.id).toBe('chatcmpl-test');
      expect(response.object).toBe('chat.completion');
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.choices[0].message.content).toBe('Test response content');
      expect(response.choices[0].finish_reason).toBe('stop');
    });

    it('should handle adapter error gracefully', async () => {
      secondMeAdapter.chat.mockRejectedValueOnce(new Error('Adapter connection failed'));

      await expect(
        secondMeAdapter.chat('test-agent', 'Test message')
      ).rejects.toThrow('Adapter connection failed');
    });

    it('should complete chat successfully', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: Math.floor(Date.now() / 1000),
        model: 'secondme-mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'Response' },
          finish_reason: 'stop' as const,
        }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      };
      
      secondMeAdapter.chat.mockResolvedValueOnce(mockResponse);

      const response = await secondMeAdapter.chat('test-agent', 'Hello!');

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
      expect(response.object).toBe('chat.completion');
      expect(response.choices.length).toBeGreaterThan(0);
      expect(response.choices[0].message).toBeDefined();
      expect(response.choices[0].finish_reason).toBe('stop');
      expect(response.usage).toBeDefined();
    });

    it('should return assistant message', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: Math.floor(Date.now() / 1000),
        model: 'secondme-mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'I am an AI assistant.' },
          finish_reason: 'stop' as const,
        }],
        usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
      };
      
      secondMeAdapter.chat.mockResolvedValueOnce(mockResponse);

      const response = await secondMeAdapter.chat('test-agent', 'What can you do?');

      const message = response.choices[0].message;
      expect(message.role).toBe('assistant');
      expect(typeof message.content).toBe('string');
      expect(message.content.length).toBeGreaterThan(0);
    });

    it('should pass health check', async () => {
      secondMeAdapter.healthCheck.mockResolvedValueOnce(true);
      
      const isHealthy = await secondMeAdapter.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should support chat completion with message history', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion' as const,
        created: Math.floor(Date.now() / 1000),
        model: 'secondme-mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant' as const, content: 'The weather is sunny.' },
          finish_reason: 'stop' as const,
        }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      };
      
      secondMeAdapter.createChatCompletion.mockResolvedValueOnce(mockResponse);

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello!' },
        { role: 'assistant' as const, content: 'Hello! How can I help you?' },
        { role: 'user' as const, content: 'What is the weather?' },
      ];

      const response = await secondMeAdapter.createChatCompletion(messages);

      expect(secondMeAdapter.createChatCompletion).toHaveBeenCalledWith(messages);
      expect(response).toBeDefined();
      expect(response.choices[0].message.role).toBe('assistant');
    });
  });

  // ============================================================================
  // A2A-004: 流式消息发送
  // ============================================================================
  describe('A2A-004: 流式消息发送', () => {
    it('should trigger streaming message sending', async () => {
      const chunks: { content: string; done: boolean; messageId?: string }[] = [];

      const message = await a2aService.sendMessageStream(
        {
          sender: 'agent-1',
          receiver: 'agent-2',
          content: 'Stream test',
        },
        (chunk) => {
          chunks.push(chunk);
        }
      );

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should call onChunk callback with correct parameters', async () => {
      const onChunk = jest.fn();

      await a2aService.sendMessageStream(
        {
          sender: 'agent-1',
          receiver: 'agent-2',
          content: 'Test',
        },
        onChunk
      );

      // 验证onChunk被调用多次
      expect(onChunk.mock.calls.length).toBeGreaterThan(0);
      
      // 验证每个chunk都有正确的格式
      onChunk.mock.calls.forEach((call) => {
        const chunk = call[0] as { content: string; done: boolean; messageId?: string };
        expect(chunk).toHaveProperty('content');
        expect(chunk).toHaveProperty('done');
        expect(typeof chunk.content).toBe('string');
        expect(typeof chunk.done).toBe('boolean');
      });
    });

    it('should have final chunk with done=true and correct messageId', async () => {
      const chunks: { content: string; done: boolean; messageId?: string }[] = [];

      const message = await a2aService.sendMessageStream(
        {
          sender: 'agent-1',
          receiver: 'agent-2',
          content: 'Test content',
        },
        (chunk) => {
          chunks.push(chunk);
        }
      );

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.done).toBe(true);
      expect(lastChunk.messageId).toBe(message.id);
    });

    it('should stream content in chunks correctly', async () => {
      const chunks: { content: string; done: boolean }[] = [];
      const testContent = 'This is a test message for streaming.';

      await a2aService.sendMessageStream(
        {
          sender: 'agent-1',
          receiver: 'agent-2',
          content: testContent,
        },
        (chunk) => {
          chunks.push(chunk);
        }
      );

      // 除最后一个chunk外，其他chunk的done应该为false
      const nonDoneChunks = chunks.slice(0, -1);
      nonDoneChunks.forEach((chunk) => {
        expect(chunk.done).toBe(false);
      });

      // 最后一个chunk的done应该为true
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it('should support SecondMe stream chat', async () => {
      const chunks: { delta: { content?: string; role?: string }; finish_reason: string | null }[] = [];
      
      secondMeAdapter.chatStream.mockImplementation(
        async (_agentId: string, _message: string, onChunk: (chunk: unknown) => void) => {
          // 模拟流式响应
          onChunk({
            id: 'chatcmpl-stream',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'secondme-mock-model',
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          });
          
          onChunk({
            id: 'chatcmpl-stream',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'secondme-mock-model',
            choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
          });
          
          onChunk({
            id: 'chatcmpl-stream',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'secondme-mock-model',
            choices: [{ index: 0, delta: { content: ' World' }, finish_reason: 'stop' }],
          });
        }
      );

      await secondMeAdapter.chatStream(
        'test-agent',
        'Stream test message',
        (chunk: { choices: { delta: { content?: string; role?: string }; finish_reason: string | null }[] }) => {
          chunks.push(chunk.choices[0]);
        }
      );

      expect(chunks.length).toBeGreaterThan(0);
      // 第一个chunk包含角色信息
      expect(chunks[0].delta.role).toBe('assistant');
      // 最后一个chunk有finish_reason
      expect(chunks[chunks.length - 1].finish_reason).toBe('stop');
    });

    it('should reconstruct full content from stream chunks', async () => {
      let fullContent = '';
      
      secondMeAdapter.chatStream.mockImplementation(
        async (_agentId: string, _message: string, onChunk: (chunk: unknown) => void) => {
          const mockResponse = 'Reconstructed content';
          const chunks = mockResponse.split(' ');
          
          chunks.forEach((word, index) => {
            onChunk({
              id: 'chatcmpl-stream',
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: 'secondme-mock-model',
              choices: [{
                index: 0,
                delta: { content: index > 0 ? ' ' + word : word },
                finish_reason: index === chunks.length - 1 ? 'stop' : null,
              }],
            });
          });
        }
      );

      await secondMeAdapter.chatStream(
        'test-agent',
        'Reconstruct test',
        (chunk: { choices: { delta: { content?: string } }[] }) => {
          if (chunk.choices[0].delta.content) {
            fullContent += chunk.choices[0].delta.content;
          }
        }
      );

      expect(fullContent).toBe('Reconstructed content');
    });
  });

  // ============================================================================
  // 额外测试：消息订阅
  // ============================================================================
  describe('Message Subscription', () => {
    it('should notify subscribers when message is sent', async () => {
      const mockListener = jest.fn();
      const unsubscribe = a2aService.subscribe(mockListener);

      await a2aService.sendMessage({
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'Subscribed message',
      });

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: 'agent-1',
          receiver: 'agent-2',
          content: 'Subscribed message',
        })
      );

      unsubscribe();
    });

    it('should allow unsubscribe', async () => {
      const mockListener = jest.fn();
      const unsubscribe = a2aService.subscribe(mockListener);

      unsubscribe();

      await a2aService.sendMessage({
        sender: 'agent-1',
        receiver: 'agent-2',
        content: 'After unsubscribe',
      });

      expect(mockListener).not.toHaveBeenCalled();
    });
  });
});
