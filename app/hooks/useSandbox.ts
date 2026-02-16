/**
 * B-04/06 React Hook - 沙盒执行
 * 唐音·工程师 - 前端沙盒执行Hook
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  ExecutionContext, 
  ExecutionResult, 
  RiskAssessment,
  SandboxExecution,
  AuditLogEntry,
  ExecutionStatus,
} from '@/lib/sandbox/executor';
import type { Proposal, VoteResult } from '@/lib/core/governance/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface SandboxState {
  /** 当前执行状态 */
  status: ExecutionStatus;
  /** 是否加载中 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 执行结果 */
  result: ExecutionResult | null;
  /** 风险评估结果 */
  riskAssessment: RiskAssessment | null;
  /** 关联的治理提案 */
  proposal: Proposal | null;
  /** 执行ID */
  executionId: string | null;
  /** 审计日志 */
  auditLogs: AuditLogEntry[];
}

export interface UseSandboxReturn extends SandboxState {
  /** 在沙盒中执行代码 */
  executeInSandbox: (code: string, context?: ExecutionContext) => Promise<ExecutionResult | null>;
  /** 仅进行风险评估 */
  assessCode: (code: string) => Promise<RiskAssessment | null>;
  /** 重置状态 */
  reset: () => void;
  /** 获取执行状态 */
  refreshStatus: () => Promise<void>;
  /** 投票支持 */
  approve: (reason?: string) => Promise<VoteResult | null>;
  /** 投票反对 */
  reject: (reason?: string) => Promise<VoteResult | null>;
  /** 清除审计日志 */
  clearLogs: () => void;
}

export interface UseSandboxOptions {
  /** 自动刷新状态间隔(ms) */
  autoRefresh?: boolean;
  refreshInterval?: number;
  /** 默认执行上下文 */
  defaultContext?: Partial<ExecutionContext>;
  /** 执行者角色 */
  voterRole?: 'pm' | 'arch' | 'qa' | 'engineer' | 'mike';
}

// ============================================================================
// 初始状态
// ============================================================================

const initialState: SandboxState = {
  status: 'idle',
  loading: false,
  error: null,
  result: null,
  riskAssessment: null,
  proposal: null,
  executionId: null,
  auditLogs: [],
};

// ============================================================================
// Hook 实现
// ============================================================================

export function useSandbox(options: UseSandboxOptions = {}): UseSandboxReturn {
  const {
    autoRefresh = false,
    refreshInterval = 5000,
    defaultContext = {},
    voterRole = 'engineer',
  } = options;

  const [state, setState] = useState<SandboxState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // 清理函数
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && state.executionId) {
      refreshTimerRef.current = setInterval(() => {
        refreshStatus();
      }, refreshInterval);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, state.executionId]);

  /**
   * 在沙盒中执行代码
   */
  const executeInSandbox = useCallback(async (
    code: string,
    context: ExecutionContext = {}
  ): Promise<ExecutionResult | null> => {
    // 重置状态
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      // 步骤1: 风险评估
      const assessResponse = await fetch('/api/v1/sandbox/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: abortControllerRef.current.signal,
      });

      if (!assessResponse.ok) {
        throw new Error(`风险评估失败: ${assessResponse.statusText}`);
      }

      const assessData = await assessResponse.json();
      const riskAssessment: RiskAssessment = assessData.data;

      if (isMountedRef.current) {
        setState(prev => ({ ...prev, riskAssessment }));
      }

      // 步骤2: 如果需要治理，提交提案
      let proposal: Proposal | null = null;
      if (riskAssessment.requiresGovernance) {
        const proposeResponse = await fetch('/api/v1/sandbox/propose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, context: { ...defaultContext, ...context } }),
          signal: abortControllerRef.current.signal,
        });

        if (!proposeResponse.ok) {
          throw new Error(`提交提案失败: ${proposeResponse.statusText}`);
        }

        const proposeData = await proposeResponse.json();
        proposal = proposeData.data;

        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            proposal,
            executionId: (proposal?.context?.executionId as string | null) || null,
            status: 'voting',
          }));
        }

        // 高风险代码需要等待治理通过
        return null;
      }

      // 步骤3: 低风险直接执行
      const executeResponse = await fetch('/api/v1/sandbox/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          context: { ...defaultContext, ...context },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!executeResponse.ok) {
        throw new Error(`执行失败: ${executeResponse.statusText}`);
      }

      const executeData = await executeResponse.json();
      const result: ExecutionResult = executeData.data;

      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          result,
          executionId: result.executionId,
          status: result.success ? 'completed' : 'failed',
          loading: false,
        }));
      }

      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          error,
          status: 'failed',
          loading: false,
        }));
      }
      return null;
    }
  }, [defaultContext]);

  /**
   * 仅进行风险评估
   */
  const assessCode = useCallback(async (code: string): Promise<RiskAssessment | null> => {
    try {
      const response = await fetch('/api/v1/sandbox/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`风险评估失败: ${response.statusText}`);
      }

      const data = await response.json();
      const riskAssessment: RiskAssessment = data.data;

      if (isMountedRef.current) {
        setState(prev => ({ ...prev, riskAssessment }));
      }

      return riskAssessment;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState(prev => ({ ...prev, error }));
      }
      return null;
    }
  }, []);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setState(initialState);
    abortControllerRef.current?.abort();
  }, []);

  /**
   * 刷新执行状态
   */
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!state.executionId) return;

    try {
      const response = await fetch(`/api/v1/sandbox/execution/${state.executionId}`);
      
      if (!response.ok) {
        throw new Error(`获取状态失败: ${response.statusText}`);
      }

      const data = await response.json();
      const execution: SandboxExecution = data.data;

      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: execution.status,
          result: execution.result || prev.result,
          auditLogs: execution.auditLogs,
        }));
      }
    } catch (err) {
      console.error('刷新状态失败:', err);
    }
  }, [state.executionId]);

  /**
   * 投票支持
   */
  const approve = useCallback(async (reason?: string): Promise<VoteResult | null> => {
    if (!state.proposal?.id) return null;

    setState(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/v1/governance/proposals/${state.proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter: voterRole, choice: 'approve', reason }),
      });

      if (!response.ok) {
        throw new Error(`投票失败: ${response.statusText}`);
      }

      const data = await response.json();
      const voteResult: VoteResult = data.data;

      // 如果投票通过，自动执行
      if (voteResult.shouldExecute && state.executionId) {
        const executeResponse = await fetch('/api/v1/sandbox/execute-approved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            executionId: state.executionId,
            proposalId: state.proposal.id,
          }),
        });

        if (executeResponse.ok) {
          const execData = await executeResponse.json();
          if (isMountedRef.current) {
            setState(prev => ({
              ...prev,
              result: execData.data,
              status: execData.data.success ? 'completed' : 'failed',
              loading: false,
            }));
          }
        }
      } else {
        if (isMountedRef.current) {
          setState(prev => ({ ...prev, loading: false }));
        }
      }

      return voteResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState(prev => ({ ...prev, error, loading: false }));
      }
      return null;
    }
  }, [state.proposal, state.executionId, voterRole]);

  /**
   * 投票反对
   */
  const reject = useCallback(async (reason?: string): Promise<VoteResult | null> => {
    if (!state.proposal?.id) return null;

    setState(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/v1/governance/proposals/${state.proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter: voterRole, choice: 'reject', reason }),
      });

      if (!response.ok) {
        throw new Error(`投票失败: ${response.statusText}`);
      }

      const data = await response.json();
      const voteResult: VoteResult = data.data;

      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: voteResult.shouldReject ? 'rejected' : prev.status,
          loading: false,
        }));
      }

      return voteResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setState(prev => ({ ...prev, error, loading: false }));
      }
      return null;
    }
  }, [state.proposal, voterRole]);

  /**
   * 清除审计日志
   */
  const clearLogs = useCallback(() => {
    setState(prev => ({ ...prev, auditLogs: [] }));
  }, []);

  return {
    ...state,
    executeInSandbox,
    assessCode,
    reset,
    refreshStatus,
    approve,
    reject,
    clearLogs,
  };
}

// ============================================================================
// 便捷Hook导出
// ============================================================================

/**
 * 仅用于代码风险检查的Hook
 */
export function useCodeRiskAssessment() {
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(false);

  const assess = useCallback(async (code: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/sandbox/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      setRisk(data.data);
      return data.data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { risk, loading, assess };
}

/**
 * 用于执行历史查询的Hook
 */
export function useExecutionHistory(limit: number = 10) {
  const [executions, setExecutions] = useState<SandboxExecution[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/sandbox/executions?limit=${limit}`);
      const data = await response.json();
      setExecutions(data.data || []);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { executions, loading, refresh };
}

export type { ExecutionContext, ExecutionResult, RiskAssessment, AuditLogEntry, ExecutionStatus };
