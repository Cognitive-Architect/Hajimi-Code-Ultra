/**
 * B-08 Hooks测试 - useTSA Hook
 * 
 * 覆盖率目标: 整体≥80%
 * @cov COV-001
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTSA } from '@/app/hooks/useTSA';

// ============================================================================
// Mock fetch API
// ============================================================================
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

describe('useTSA Hook (COV-001)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * 测试: 初始加载状态正确
   */
  it('should have correct initial loading state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: 'test-value' }),
    });

    const { result } = renderHook(() => useTSA('test-key', 'default-value'));

    // 初始状态检查
    expect(result.current.value).toBe('default-value');
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.initialized).toBe(false);

    // 等待加载完成
    await waitFor(() => expect(result.current.initialized).toBe(true));
    
    expect(result.current.loading).toBe(false);
    expect(result.current.value).toBe('test-value');
  });

  /**
   * 测试: 数据读写正常
   */
  it('should read and write data correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useTSA('user-data', { name: 'default' }, { autoLoad: false }));

    // 初始状态
    expect(result.current.value).toEqual({ name: 'default' });
    expect(result.current.initialized).toBe(false);

    // 写入数据
    await act(async () => {
      await result.current.set({ name: 'updated' });
    });

    expect(result.current.value).toEqual({ name: 'updated' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 错误处理正确
   */
  it('should handle fetch errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTSA('error-key', null));

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.initialized).toBe(false);
  });

  /**
   * 测试: 重试逻辑正常
   */
  it('should support retry via refresh', async () => {
    // 第一次加载失败
    mockFetch.mockRejectedValueOnce(new Error('First attempt failed'));

    const { result } = renderHook(() => useTSA('retry-key', null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    // 重试成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: 'retry-success' }),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.value).toBe('retry-success');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 组件卸载时清理
   */
  it('should cleanup on unmount to prevent memory leaks', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    
    mockFetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ success: true, data: 'value' }),
          });
        }, 100);
      })
    );

    const { result, unmount } = renderHook(() => useTSA('cleanup-key', null));

    // 触发加载
    await act(async () => {
      result.current.refresh();
    });

    // 卸载组件
    unmount();

    // 验证abort被调用
    expect(abortSpy).toHaveBeenCalled();
    
    abortSpy.mockRestore();
  });

  /**
   * 测试: 404时使用默认值
   */
  it('should use default value when key not found (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const { result } = renderHook(() => useTSA('missing-key', 'fallback'));

    await waitFor(() => expect(result.current.initialized).toBe(true));

    expect(result.current.value).toBe('fallback');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 删除操作正常
   */
  it('should delete data correctly', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: 'to-be-deleted' }),
    });

    const { result } = renderHook(() => useTSA('delete-key', 'default'));

    await waitFor(() => expect(result.current.initialized).toBe(true));
    expect(result.current.value).toBe('to-be-deleted');

    // 删除数据
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.value).toBe('default');
  });

  /**
   * 测试: 空key错误处理
   */
  it('should handle empty key error', async () => {
    const { result } = renderHook(() => useTSA('', 'default'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Key is required');
  });

  /**
   * 测试: 带存储层级的设置
   */
  it('should support setting with storage tier', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useTSA('tier-key', 'default', { defaultTier: 'HOT' }));

    await act(async () => {
      await result.current.set('value', { tier: 'COLD', ttl: 3600 });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tsa/set',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('COLD'),
      })
    );
  });

  /**
   * 测试: 自动刷新功能
   */
  it('should auto refresh at specified interval', async () => {
    jest.useFakeTimers();
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: 'refreshed' }),
    });

    renderHook(() => useTSA('auto-refresh-key', null, { refreshInterval: 5000 }));

    // 等待初始加载
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // 快进5秒，应该触发刷新
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    jest.useRealTimers();
  });

  /**
   * 测试: 非autoLoad模式
   */
  it('should not auto load when autoLoad is false', () => {
    renderHook(() => useTSA('no-auto-key', 'default', { autoLoad: false }));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  /**
   * 测试: 设置操作API错误
   */
  it('should handle set API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Server Error',
    });

    const { result } = renderHook(() => useTSA('set-error-key', 'default', { autoLoad: false }));

    await expect(act(async () => {
      await result.current.set('new-value');
    })).rejects.toThrow();
  });

  /**
   * 测试: 删除操作API错误
   */
  it('should handle remove API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Server Error',
    });

    const { result } = renderHook(() => useTSA('remove-error-key', 'default', { autoLoad: false }));

    await expect(act(async () => {
      await result.current.remove();
    })).rejects.toThrow();
  });

  /**
   * 测试: API返回错误
   */
  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useTSA('api-error-key', null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 非成功响应数据处理
   */
  it('should handle non-success response data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'Data corruption' }),
    });

    const { result } = renderHook(() => useTSA('data-error-key', 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.initialized).toBe(true);
    expect(result.current.value).toBe('default');
  });

  /**
   * 测试: 500错误响应
   */
  it('should handle 500 error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useTSA('server-error-key', 'default'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.initialized).toBe(false);
  });

  /**
   * 测试: 自动加载时key为空
   */
  it('should not auto load when key is empty', () => {
    renderHook(() => useTSA('', 'default'));

    // 空key时不应触发fetch
    expect(mockFetch).not.toHaveBeenCalled();
  });

  /**
   * 测试: refreshInterval为0或负数
   */
  it('should not auto refresh when interval is 0', () => {
    jest.useFakeTimers();
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: 'value' }),
    });

    renderHook(() => useTSA('no-refresh-key', null, { refreshInterval: 0 }));

    // 快进时间不应触发刷新
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // 只应有一次初始加载
    expect(mockFetch).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
