/**
 * B-06 React Hooks 测试
 * 
 * 测试项:
 * - TEST-007: useTSA Hook
 * - TEST-008: useAgent Hook
 * - TEST-009: useGovernance Hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTSA } from '@/app/hooks/useTSA';
import { useAgent } from '@/app/hooks/useAgent';
import { useGovernance } from '@/app/hooks/useGovernance';

// ============================================================================
// Mock fetch API
// ============================================================================
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ============================================================================
// useTSA Hook Tests (TEST-007)
// ============================================================================
describe('useTSA Hook (TEST-007)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TEST-007-01: 初始加载状态正确
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
   * TEST-007-02: 数据读写正常
   */
  it('should read and write data correctly', async () => {
    // 使用autoLoad: false来避免初始加载竞争条件
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
      await result.current.set({ name: 'updated' }, { tier: 'HOT' });
    });

    expect(result.current.value).toEqual({ name: 'updated' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /**
   * TEST-007-03: 错误处理正确（加载失败时error状态）
   */
  it('should handle fetch errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTSA('error-key', null));

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Network error');
    // 加载出错时initialized保持false
    expect(result.current.initialized).toBe(false);
  });

  /**
   * TEST-007-04: 重试逻辑正常（refresh功能）
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
   * TEST-007-05: 组件卸载时清理（防止内存泄漏）
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

    // 验证abort被调用（清理pending请求）
    expect(abortSpy).toHaveBeenCalled();
    
    abortSpy.mockRestore();
  });

  /**
   * TEST-007-06: 404时使用默认值
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
   * TEST-007-07: 删除操作正常
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
});

// ============================================================================
// useAgent Hook Tests (TEST-008)
// ============================================================================
describe('useAgent Hook (TEST-008)', () => {
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
   * TEST-008-01: 初始状态正确
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
   * TEST-008-02: 消息发送正常
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
   * TEST-008-03: 历史加载正常
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
   * TEST-008-04: 加载状态变化正确
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
   * TEST-008-05: 错误处理正确
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
   * TEST-008-06: 清除消息正常
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
   * TEST-008-07: 刷新Agent信息正常
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
   * TEST-008-08: 空消息不发送
   */
  it('should not send empty messages', async () => {
    const { result } = renderHook(() => useAgent('agent-001'));

    const sent = await act(async () => {
      return await result.current.sendMessage('   ');
    });

    expect(sent).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ============================================================================
// useGovernance Hook Tests (TEST-009)
// ============================================================================
describe('useGovernance Hook (TEST-009)', () => {
  const mockProposal = {
    id: 'prop-001',
    title: 'Test Proposal',
    description: 'Test description',
    proposer: 'pm' as const,
    targetState: 'DESIGN' as const,
    status: 'voting' as const,
    votes: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  };

  const mockVoteResult = {
    proposalId: 'prop-001',
    totalVotes: 1,
    totalWeight: 2,
    approveWeight: 2,
    rejectWeight: 0,
    abstainWeight: 0,
    approvalRate: 1,
    rejectionRate: 0,
    hasQuorum: false,
    hasApprovalThreshold: true,
    shouldExecute: false,
    shouldReject: false,
    status: 'voting' as const,
    votedRoles: ['pm'],
    pendingRoles: ['arch', 'qa', 'engineer', 'mike'],
    voteDetails: [{ voter: 'pm', choice: 'approve', timestamp: Date.now(), weight: 2 }],
    timeRemaining: 29 * 60 * 1000,
  };

  beforeEach(() => {
    mockFetch.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * TEST-009-01: 提案列表加载正常
   */
  it('should load proposals list correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { 
          proposals: [mockProposal],
          total: 1,
        } 
      }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.proposals).toHaveLength(1);
    expect(result.current.proposals[0].title).toBe('Test Proposal');
    expect(result.current.error).toBeNull();
  });

  /**
   * TEST-009-02: 创建提案正常
   */
  it('should create proposal successfully', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const newProposal = await act(async () => {
      return await result.current.createProposal({
        title: 'New Proposal',
        description: 'New description',
        targetState: 'CODE',
        proposer: 'pm',
      });
    });

    expect(newProposal).not.toBeNull();
    expect(newProposal?.title).toBe('Test Proposal');
    expect(result.current.proposals).toHaveLength(1);
  });

  /**
   * TEST-009-03: 投票正常
   */
  it('should vote successfully', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { proposals: [mockProposal], total: 1 } 
      }),
    });

    const { result } = renderHook(() => useGovernance('arch', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 投票
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockVoteResult }),
    });

    // 刷新提案列表（投票后会触发）
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { 
          proposals: [{ ...mockProposal, votes: [{ voter: 'arch', choice: 'approve' }] }], 
          total: 1 
        } 
      }),
    });

    const voteResult = await act(async () => {
      return await result.current.vote('prop-001', 'approve', 'Good idea');
    });

    expect(voteResult).not.toBeNull();
    expect(voteResult?.totalVotes).toBe(1);
  });

  /**
   * TEST-009-04: 自动刷新逻辑正确
   */
  it('should auto refresh at specified interval', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { proposals: [mockProposal], total: 1 } 
      }),
    });

    renderHook(() => useGovernance('pm', { autoRefresh: true, refreshInterval: 5000 }));

    // 等待初始加载
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // 快进5秒，应该触发刷新
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // 再快进5秒
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
  });

  /**
   * TEST-009-05: 错误处理正确
   */
  it('should handle errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch proposals'));

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Failed to fetch proposals');
  });

  /**
   * TEST-009-06: 获取单个提案正常
   */
  it('should get single proposal correctly', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 获取单个提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const proposal = await act(async () => {
      return await result.current.getProposal('prop-001');
    });

    expect(proposal).not.toBeNull();
    expect(proposal?.id).toBe('prop-001');
  });

  /**
   * TEST-009-07: 获取投票统计正常
   */
  it('should get vote stats correctly', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 获取投票统计
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockVoteResult }),
    });

    const stats = await act(async () => {
      return await result.current.getVoteStats('prop-001');
    });

    expect(stats).not.toBeNull();
    expect(stats?.totalVotes).toBe(1);
    expect(stats?.approvalRate).toBe(1);
  });

  /**
   * TEST-009-08: 手动刷新正常
   */
  it('should support manual refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 手动刷新
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { proposals: [mockProposal], total: 1 } 
      }),
    });

    await act(async () => {
      await result.current.refreshProposals();
    });

    expect(result.current.proposals).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
