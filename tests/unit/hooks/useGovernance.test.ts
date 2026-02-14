/**
 * B-08 Hooks测试 - useGovernance Hook
 * 
 * 覆盖率目标: 整体≥80%
 * @cov COV-001
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useGovernance } from '@/app/hooks/useGovernance';

// ============================================================================
// Mock fetch API
// ============================================================================
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

describe('useGovernance Hook (COV-001)', () => {
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
   * 测试: 提案列表加载正常
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
   * 测试: 创建提案正常
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
   * 测试: 投票正常
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

    // 刷新提案列表
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
   * 测试: 自动刷新逻辑正确
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
   * 测试: 错误处理正确
   */
  it('should handle errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch proposals'));

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('Failed to fetch proposals');
  });

  /**
   * 测试: 获取单个提案正常
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
   * 测试: 获取投票统计正常
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
   * 测试: 手动刷新正常
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

  /**
   * 测试: 拒绝投票
   */
  it('should handle reject vote', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { proposals: [mockProposal], total: 1 } 
      }),
    });

    const { result } = renderHook(() => useGovernance('qa', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 投票拒绝
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockVoteResult, rejectWeight: 1, approvalRate: 0 } 
      }),
    });

    // 刷新提案列表
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { 
          proposals: [{ ...mockProposal, votes: [{ voter: 'qa', choice: 'reject' }] }], 
          total: 1 
        } 
      }),
    });

    const voteResult = await act(async () => {
      return await result.current.vote('prop-001', 'reject', 'Needs improvement');
    });

    expect(voteResult).not.toBeNull();
  });

  /**
   * 测试: 弃权投票
   */
  it('should handle abstain vote', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { proposals: [mockProposal], total: 1 } 
      }),
    });

    const { result } = renderHook(() => useGovernance('engineer', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 投票弃权
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockVoteResult, abstainWeight: 1 } 
      }),
    });

    // 刷新提案列表
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { 
          proposals: [{ ...mockProposal, votes: [{ voter: 'engineer', choice: 'abstain' }] }], 
          total: 1 
        } 
      }),
    });

    const voteResult = await act(async () => {
      return await result.current.vote('prop-001', 'abstain');
    });

    expect(voteResult).not.toBeNull();
  });

  /**
   * 测试: 获取提案API错误
   */
  it('should handle get proposal API error', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockRejectedValueOnce(new Error('Proposal not found'));

    const proposal = await act(async () => {
      return await result.current.getProposal('prop-999');
    });

    expect(proposal).toBeNull();
  });

  /**
   * 测试: 获取投票统计API错误
   */
  it('should handle get vote stats API error', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockRejectedValueOnce(new Error('Stats unavailable'));

    const stats = await act(async () => {
      return await result.current.getVoteStats('prop-001');
    });

    expect(stats).toBeNull();
  });

  /**
   * 测试: 创建提案API错误
   */
  it('should handle create proposal API error', async () => {
    // 初始加载
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    const { result } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockRejectedValueOnce(new Error('Unauthorized'));

    const proposal = await act(async () => {
      return await result.current.createProposal({
        title: 'Test',
        description: 'Test desc',
        targetState: 'CODE',
        proposer: 'pm',
      });
    });

    expect(proposal).toBeNull();
    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 投票API错误
   */
  it('should handle vote API error', async () => {
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

    mockFetch.mockRejectedValueOnce(new Error('Voting failed'));

    const voteResult = await act(async () => {
      return await result.current.vote('prop-001', 'approve');
    });

    expect(voteResult).toBeNull();
  });

  /**
   * 测试: 组件卸载时清理
   */
  it('should cleanup on unmount', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { unmount } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    unmount();

    expect(abortSpy).toHaveBeenCalled();
    
    abortSpy.mockRestore();
  });

  /**
   * 测试: 使用默认autoRefresh值
   */
  it('should use default autoRefresh value', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposals: [], total: 0 } }),
    });

    // 不提供autoRefresh选项，默认为true
    const { result } = renderHook(() => useGovernance('pm'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 应该加载提案
    expect(mockFetch).toHaveBeenCalled();
  });

  /**
   * 测试: 组件卸载时清理
   */
  it('should cleanup on unmount', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { unmount } = renderHook(() => useGovernance('pm', { autoRefresh: false }));

    unmount();

    expect(abortSpy).toHaveBeenCalled();
    
    abortSpy.mockRestore();
  });
});
