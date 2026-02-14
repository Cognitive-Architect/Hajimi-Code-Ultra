/**
 * B-08 Hooks测试 - useAgent Hook
 * 
 * 覆盖率目标: 整体≥80%
 * @cov COV-001
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgent } from '@/app/hooks/useAgent';

// ============================================================================
// Mock fetch API
// ============================================================================
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

describe('useAgent Hook (COV-001)', () => {
  const mockAgent = {
    id: 'agent-001',
    name: 'Test Agent',
    role: 'assistant',
    status: 'online' as const,
    capabilities: ['chat', 'code'],
  };

  const mockMessage = {
    id: 'msg-001',
    sender: 'user',
    receiver: 'agent-001',
    content: 'Hello',
    timestamp: Date.now(),
    type: 'chat' as const,
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  /**
   * 测试: 初始状态正确
   */
  it('should have correct initial state', () => {
    const { result } = renderHook(() => useAgent('agent-001'));

    expect(result.current.agent).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * 测试: 消息发送正常
   */
  it('should send message successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockMessage }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      const sent = await result.current.sendMessage('Hello');
      expect(sent).not.toBeNull();
      expect(sent?.content).toBe('Hello');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello');
    expect(result.current.sending).toBe(false);
  });

  /**
   * 测试: 历史加载正常
   */
  it('should load message history correctly', async () => {
    const mockHistory = [
      { ...mockMessage, id: 'msg-001', content: 'First' },
      { ...mockMessage, id: 'msg-002', content: 'Second' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockHistory }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.loadHistory({ limit: 10 });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('First');
    expect(result.current.messages[1].content).toBe('Second');
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 加载状态变化正确
   */
  it('should update loading states correctly', async () => {
    mockFetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ success: true, data: [] }),
          });
        }, 50);
      })
    );

    const { result } = renderHook(() => useAgent('agent-001'));

    // 触发加载
    act(() => {
      result.current.loadHistory();
    });

    // 检查加载中状态
    expect(result.current.loading).toBe(true);

    // 等待完成
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  /**
   * 测试: 错误处理正确
   */
  it('should handle errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to load history'));

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Failed to load history');
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 清除消息正常
   */
  it('should clear messages correctly', async () => {
    // 先加载一些消息
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: [{ ...mockMessage, id: 'msg-001' }] 
      }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.messages).toHaveLength(1);

    // 清除消息
    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  /**
   * 测试: 刷新Agent信息正常
   */
  it('should refresh agent info correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { agent: mockAgent } }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.refreshAgent();
    });

    expect(result.current.agent).toEqual(mockAgent);
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 空消息不发送
   */
  it('should not send empty messages', async () => {
    const { result } = renderHook(() => useAgent('agent-001'));

    const sent = await act(async () => {
      return await result.current.sendMessage('   ');
    });

    expect(sent).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  /**
   * 测试: 带选项发送消息
   */
  it('should send message with options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockMessage, type: 'proposal', metadata: { key: 'value' } } 
      }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.sendMessage('Proposal message', {
        type: 'proposal',
        metadata: { key: 'value' },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe('proposal');
  });

  /**
   * 测试: 发送消息API错误
   */
  it('should handle send message API error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAgent('agent-001'));

    const sent = await act(async () => {
      return await result.current.sendMessage('Test');
    });

    expect(sent).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.sending).toBe(false);
  });

  /**
   * 测试: 加载历史带时间参数
   */
  it('should load history with time parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.loadHistory({ 
        before: 1234567890, 
        after: 1234567800,
        limit: 20 
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('before=1234567890'),
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('after=1234567800'),
      expect.any(Object)
    );
  });

  /**
   * 测试: 刷新Agent信息错误
   */
  it('should handle refresh agent error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Agent not found'));

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.refreshAgent();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.agent).toBeNull();
  });

  /**
   * 测试: 组件卸载时取消请求
   */
  it('should abort request on unmount', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result, unmount } = renderHook(() => useAgent('agent-001'));

    act(() => {
      result.current.sendMessage('Test');
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();
    
    abortSpy.mockRestore();
  });

  /**
   * 测试: API返回非成功状态
   */
  it('should handle API non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 获取Agent信息API错误
   */
  it('should handle refresh agent API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.refreshAgent();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 发送消息后返回数据为空
   */
  it('should handle empty message response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      const sent = await result.current.sendMessage('Test message');
      expect(sent).toBeNull();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  /**
   * 测试: 消息类型为system
   */
  it('should support system message type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockMessage, type: 'system' } 
      }),
    });

    const { result } = renderHook(() => useAgent('agent-001'));

    await act(async () => {
      await result.current.sendMessage('System message', { type: 'system' });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe('system');
  });
});
