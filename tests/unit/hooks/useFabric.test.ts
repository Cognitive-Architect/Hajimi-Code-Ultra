/**
 * B-08 Hooks测试 - useFabric Hook (useSandbox, useCodeRiskAssessment, useExecutionHistory)
 * 
 * 覆盖率目标: 整体≥80%
 * @cov COV-001
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { 
  useSandbox, 
  useCodeRiskAssessment, 
  useExecutionHistory 
} from '@/app/hooks/useSandbox';

// ============================================================================
// Mock fetch API
// ============================================================================
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
console.error = jest.fn();

describe('useSandbox Hook (COV-001)', () => {
  const mockRiskAssessment = {
    riskLevel: 'low',
    score: 25,
    requiresGovernance: false,
    violations: [],
  };

  const mockExecutionResult = {
    executionId: 'exec-001',
    success: true,
    output: 'Hello World',
    duration: 100,
  };

  const mockProposal = {
    id: 'prop-001',
    title: 'Code Execution Proposal',
    status: 'voting',
    context: { executionId: 'exec-001' },
  };

  beforeEach(() => {
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  /**
   * 测试: 初始状态正确
   */
  it('should have correct initial state', () => {
    const { result } = renderHook(() => useSandbox());

    expect(result.current.status).toBe('idle');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.riskAssessment).toBeNull();
    expect(result.current.proposal).toBeNull();
    expect(result.current.executionId).toBeNull();
    expect(result.current.auditLogs).toEqual([]);
  });

  /**
   * 测试: 执行低风险代码
   */
  it('should execute low-risk code directly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      const execResult = await result.current.executeInSandbox('console.log("hello")');
      expect(execResult).not.toBeNull();
    });

    await waitFor(() => expect(result.current.status).toBe('completed'));
    expect(result.current.result).toEqual(mockExecutionResult);
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 高风险代码需要治理
   */
  it('should require governance for high-risk code', async () => {
    const highRiskAssessment = {
      ...mockRiskAssessment,
      riskLevel: 'high',
      score: 80,
      requiresGovernance: true,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: highRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      const execResult = await result.current.executeInSandbox('eval("dangerous")');
      expect(execResult).toBeNull(); // 高风险返回null，等待治理
    });

    expect(result.current.status).toBe('voting');
    expect(result.current.proposal).toEqual(mockProposal);
    expect(result.current.riskAssessment).toEqual(highRiskAssessment);
  });

  /**
   * 测试: 仅进行风险评估
   */
  it('should assess code without execution', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      const assessment = await result.current.assessCode('const x = 1;');
      expect(assessment).toEqual(mockRiskAssessment);
    });

    expect(result.current.riskAssessment).toEqual(mockRiskAssessment);
  });

  /**
   * 测试: 重置状态
   */
  it('should reset state correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    expect(result.current.status).toBe('completed');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.riskAssessment).toBeNull();
  });

  /**
   * 测试: 刷新执行状态
   */
  it('should refresh execution status', async () => {
    const mockExecution = {
      id: 'exec-001',
      status: 'completed',
      result: mockExecutionResult,
      auditLogs: [{ timestamp: Date.now(), event: 'execution_completed' }],
    };

    // 先执行代码获取executionId
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    // 刷新状态
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecution }),
    });

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(result.current.auditLogs).toHaveLength(1);
  });

  /**
   * 测试: 投票支持
   */
  it('should approve proposal', async () => {
    const mockVoteResult = {
      proposalId: 'prop-001',
      shouldExecute: true,
      shouldReject: false,
    };

    // 先执行高风险代码创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockRiskAssessment, requiresGovernance: true, riskLevel: 'high' } 
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox({ voterRole: 'arch' }));

    await act(async () => {
      await result.current.executeInSandbox('eval("test")');
    });

    // 投票支持
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockVoteResult }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    await act(async () => {
      const voteResult = await result.current.approve('Looks good');
      expect(voteResult).toEqual(mockVoteResult);
    });
  });

  /**
   * 测试: 投票反对
   */
  it('should reject proposal', async () => {
    const mockVoteResult = {
      proposalId: 'prop-001',
      shouldExecute: false,
      shouldReject: true,
    };

    // 先执行高风险代码创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockRiskAssessment, requiresGovernance: true, riskLevel: 'high' } 
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox({ voterRole: 'qa' }));

    await act(async () => {
      await result.current.executeInSandbox('eval("test")');
    });

    // 投票反对
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockVoteResult }),
    });

    await act(async () => {
      const voteResult = await result.current.reject('Too risky');
      expect(voteResult).toEqual(mockVoteResult);
    });

    expect(result.current.status).toBe('rejected');
  });

  /**
   * 测试: 清除审计日志
   */
  it('should clear audit logs', async () => {
    const mockExecution = {
      id: 'exec-001',
      status: 'completed',
      auditLogs: [{ timestamp: Date.now(), event: 'test' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    // 模拟设置审计日志
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecution }),
    });

    await act(async () => {
      await result.current.refreshStatus();
    });

    act(() => {
      result.current.clearLogs();
    });

    expect(result.current.auditLogs).toEqual([]);
  });

  /**
   * 测试: 无提案时投票返回null
   */
  it('should return null when voting without proposal', async () => {
    const { result } = renderHook(() => useSandbox());

    const approveResult = await act(async () => {
      return await result.current.approve();
    });

    expect(approveResult).toBeNull();

    const rejectResult = await act(async () => {
      return await result.current.reject();
    });

    expect(rejectResult).toBeNull();
  });

  /**
   * 测试: 无executionId时刷新状态
   */
  it('should not refresh without executionId', async () => {
    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sandbox/execution/'),
      expect.anything()
    );
  });

  /**
   * 测试: 执行错误处理
   */
  it('should handle execution errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockRejectedValueOnce(new Error('Execution failed'));

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      const execResult = await result.current.executeInSandbox('invalid code');
      expect(execResult).toBeNull();
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 自动刷新功能
   */
  it('should auto refresh when enabled', async () => {
    jest.useFakeTimers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox({ autoRefresh: true, refreshInterval: 1000 }));

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    const mockExecution = {
      id: 'exec-001',
      status: 'completed',
      auditLogs: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockExecution }),
    });

    // 快进触发自动刷新
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

    jest.useRealTimers();
  });

  /**
   * 测试: 风险评估错误处理
   */
  it('should handle assess code error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Assessment failed'));

    const { result } = renderHook(() => useSandbox());

    const assessment = await act(async () => {
      return await result.current.assessCode('code');
    });

    expect(assessment).toBeNull();
    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 刷新状态API错误
   */
  it('should handle refresh status API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    // 刷新状态API错误
    mockFetch.mockRejectedValueOnce(new Error('Status refresh failed'));

    await act(async () => {
      await result.current.refreshStatus();
    });

    // 应该静默处理错误
    expect(result.current.error).toBeNull();
  });

  /**
   * 测试: 执行后投票未通过
   */
  it('should handle vote not executing immediately', async () => {
    const mockVoteResult = {
      proposalId: 'prop-001',
      shouldExecute: false,
      shouldReject: false,
    };

    // 先执行高风险代码创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockRiskAssessment, requiresGovernance: true, riskLevel: 'high' } 
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox({ voterRole: 'arch' }));

    await act(async () => {
      await result.current.executeInSandbox('eval("test")');
    });

    // 投票但不立即执行
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockVoteResult }),
    });

    await act(async () => {
      const voteResult = await result.current.approve('Approve but wait');
      expect(voteResult).toEqual(mockVoteResult);
    });

    // 状态应该保持为voting
    expect(result.current.status).toBe('voting');
  });

  /**
   * 测试: 投票API返回非成功状态
   */
  it('should handle vote API error', async () => {
    // 先执行高风险代码创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockRiskAssessment, requiresGovernance: true, riskLevel: 'high' } 
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox({ voterRole: 'arch' }));

    await act(async () => {
      await result.current.executeInSandbox('eval("test")');
    });

    // 投票API错误
    mockFetch.mockRejectedValueOnce(new Error('Vote submission failed'));

    await act(async () => {
      const voteResult = await result.current.approve();
      expect(voteResult).toBeNull();
    });

    expect(result.current.error).not.toBeNull();
  });

  /**
   * 测试: 执行批准的代码API错误
   */
  it('should handle execute-approved API error', async () => {
    // 先执行高风险代码创建提案
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        success: true, 
        data: { ...mockRiskAssessment, requiresGovernance: true, riskLevel: 'high' } 
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProposal }),
    });

    const { result } = renderHook(() => useSandbox({ voterRole: 'arch' }));

    await act(async () => {
      await result.current.executeInSandbox('eval("test")');
    });

    // 投票通过
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { proposalId: 'prop-001', shouldExecute: true, shouldReject: false } }),
    });

    // 但执行批准的代码API失败
    mockFetch.mockRejectedValueOnce(new Error('Execution failed'));

    await act(async () => {
      const voteResult = await result.current.approve();
      // API错误时返回null
      expect(voteResult).toBeNull();
    });

    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 刷新状态返回数据无result
   */
  it('should handle refresh status without result', async () => {
    const mockExecutionNoResult = {
      id: 'exec-001',
      status: 'running',
      auditLogs: [{ timestamp: Date.now(), event: 'executing' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockRiskAssessment }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionResult }),
    });

    const { result } = renderHook(() => useSandbox());

    await act(async () => {
      await result.current.executeInSandbox('console.log("test")');
    });

    // 刷新状态，无result
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutionNoResult }),
    });

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(result.current.status).toBe('running');
  });
});

describe('useCodeRiskAssessment Hook (COV-001)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  /**
   * 测试: 评估代码风险
   */
  it('should assess code risk', async () => {
    const mockAssessment = {
      riskLevel: 'medium',
      score: 50,
      requiresGovernance: false,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockAssessment }),
    });

    const { result } = renderHook(() => useCodeRiskAssessment());

    await act(async () => {
      const assessment = await result.current.assess('const x = 1;');
      expect(assessment).toEqual(mockAssessment);
    });

    expect(result.current.risk).toEqual(mockAssessment);
    expect(result.current.loading).toBe(false);
  });

  /**
   * 测试: 加载状态
   */
  it('should set loading state during assessment', async () => {
    mockFetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ success: true, data: { riskLevel: 'low', score: 10 } }),
          });
        }, 50);
      })
    );

    const { result } = renderHook(() => useCodeRiskAssessment());

    act(() => {
      result.current.assess('code');
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

describe('useExecutionHistory Hook (COV-001)', () => {
  const mockExecutions = [
    { id: 'exec-001', status: 'completed', createdAt: Date.now() },
    { id: 'exec-002', status: 'failed', createdAt: Date.now() },
  ];

  beforeEach(() => {
    mockFetch.mockClear();
  });

  /**
   * 测试: 加载执行历史
   */
  it('should load execution history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutions }),
    });

    const { result } = renderHook(() => useExecutionHistory(10));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.executions).toEqual(mockExecutions);
  });

  /**
   * 测试: 手动刷新历史
   */
  it('should refresh execution history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    const { result } = renderHook(() => useExecutionHistory(5));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockExecutions }),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.executions).toEqual(mockExecutions);
  });

  /**
   * 测试: 使用limit参数
   */
  it('should use limit parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    renderHook(() => useExecutionHistory(20));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=20')
    );
  });

  /**
   * 测试: limit变化时重新加载
   */
  it('should reload when limit changes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    const { rerender } = renderHook((props) => useExecutionHistory(props), {
      initialProps: 10,
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    rerender(20);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
