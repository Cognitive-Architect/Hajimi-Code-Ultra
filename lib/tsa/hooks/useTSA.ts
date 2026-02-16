/**
 * TSA React Hooks
 * 
 * @module lib/tsa/hooks/useTSA
 * @version 1.3.0
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TSAStateMachine, createStateMachine } from '../state-machine';
import { AgentState, TSAConfig } from '../types';
import { TSAManager } from '../middleware';

// ========== useTSA Hook ==========

export interface UseTSAReturn {
  state: AgentState;
  history: ReturnType<TSAStateMachine['getHistory']>;
  transition: (trigger: string, payload?: unknown) => boolean;
  canTransition: (trigger: string) => boolean;
  availableTriggers: string[];
  stateDuration: number;
}

export function useTSA(
  agentId: string,
  config?: Partial<TSAConfig>
): UseTSAReturn {
  const managerRef = useRef<TSAManager | null>(null);
  const machineRef = useRef<TSAStateMachine | null>(null);
  
  const [state, setState] = useState<AgentState>('IDLE');
  const [history, setHistory] = useState<ReturnType<TSAStateMachine['getHistory']>>([]);
  const [stateDuration, setStateDuration] = useState(0);

  // 初始化Manager
  useEffect(() => {
    const fullConfig: TSAConfig = {
      persistence: { enabled: true, storage: 'localStorage', key: 'tsa-state' },
      middleware: { logging: true, persistence: true, monitoring: true },
      isolation: 'SOFT',
      ...config,
    };
    
    managerRef.current = new TSAManager(fullConfig);
    machineRef.current = managerRef.current.createMachine(agentId);
    
    setState(machineRef.current.getState());
    setHistory(machineRef.current.getHistory());

    // 监听状态变更
    const unsubscribe = machineRef.current.onTransition((from, to, trigger) => {
      setState(to);
      setHistory(machineRef.current!.getHistory());
    });

    return () => {
      unsubscribe();
      managerRef.current?.removeMachine(agentId);
    };
  }, [agentId]);

  // 更新状态持续时间
  useEffect(() => {
    if (!machineRef.current) return;
    
    const interval = setInterval(() => {
      setStateDuration(machineRef.current!.getStateDuration());
    }, 1000);

    return () => clearInterval(interval);
  }, [state]);

  const transition = useCallback((trigger: string, payload?: unknown): boolean => {
    if (!machineRef.current) return false;
    return machineRef.current.transition(trigger, payload);
  }, []);

  const canTransition = useCallback((trigger: string): boolean => {
    if (!machineRef.current) return false;
    return machineRef.current.canTransition(trigger);
  }, []);

  const availableTriggers = machineRef.current?.getAvailableTriggers() ?? [];

  return {
    state,
    history,
    transition,
    canTransition,
    availableTriggers,
    stateDuration,
  };
}

// ========== useAgentLifecycle Hook ==========

export interface AgentLifecycleState {
  isActive: boolean;
  isSuspended: boolean;
  isTerminated: boolean;
  isError: boolean;
}

export interface UseAgentLifecycleReturn extends AgentLifecycleState {
  activate: () => boolean;
  suspend: () => boolean;
  resume: () => boolean;
  terminate: () => boolean;
  recover: () => boolean;
  reset: () => void;
}

export function useAgentLifecycle(agentId: string): UseAgentLifecycleReturn {
  const { state, transition } = useTSA(agentId);

  const lifecycleState: AgentLifecycleState = {
    isActive: state === 'ACTIVE',
    isSuspended: state === 'SUSPENDED',
    isTerminated: state === 'TERMINATED',
    isError: state === 'ERROR',
  };

  const activate = useCallback(() => transition('activate'), [transition]);
  const suspend = useCallback(() => transition('suspend'), [transition]);
  const resume = useCallback(() => transition('resume'), [transition]);
  const terminate = useCallback(() => transition('terminate'), [transition]);
  const recover = useCallback(() => transition('recover'), [transition]);
  const reset = useCallback(() => {
    // 创建新的状态机实例
    transition('terminate');
  }, [transition]);

  return {
    ...lifecycleState,
    activate,
    suspend,
    resume,
    terminate,
    recover,
    reset,
  };
}

export default useTSA;
