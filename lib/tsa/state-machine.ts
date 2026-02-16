/**
 * TSA状态机引擎
 * 
 * 七状态机实现 + 12条流转规则
 * 
 * @module lib/tsa/state-machine
 * @version 1.3.0
 */

import {
  AgentState,
  StateTransition,
  TransitionContext,
  StateHistoryEntry,
  STANDARD_TRANSITIONS,
} from './types';

// ========== 状态机类 ==========

export class TSAStateMachine {
  private currentState: AgentState = 'IDLE';
  private history: StateHistoryEntry[] = [];
  private stateEnterTime: number = Date.now();
  private transitions: Map<string, StateTransition> = new Map();
  private listeners: Set<(from: AgentState, to: AgentState, trigger: string) => void> = new Set();

  constructor(
    private agentId: string,
    initialState: AgentState = 'IDLE',
    customTransitions: StateTransition[] = []
  ) {
    this.currentState = initialState;
    this.stateEnterTime = Date.now();
    this.registerTransitions([...STANDARD_TRANSITIONS, ...customTransitions]);
  }

  // ========== 核心方法 ==========

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * 获取状态历史
   */
  getHistory(): StateHistoryEntry[] {
    return [...this.history];
  }

  /**
   * 触发状态流转
   */
  transition(trigger: string, payload?: unknown): boolean {
    const transitionKey = `${this.currentState}:${trigger}`;
    const transition = this.transitions.get(transitionKey);

    if (!transition) {
      console.warn(`[TSAStateMachine] Invalid transition: ${this.currentState} -> ${trigger}`);
      return false;
    }

    // 执行guard检查
    if (transition.guard) {
      const context: TransitionContext = {
        agentId: this.agentId,
        fromState: this.currentState,
        toState: transition.to,
        trigger,
        payload,
        timestamp: Date.now(),
      };
      
      if (!transition.guard(context)) {
        return false;
      }
    }

    // 执行流转
    const now = Date.now();
    const duration = now - this.stateEnterTime;
    const fromState = this.currentState;
    const toState = transition.to;

    // 记录历史
    this.history.push({
      from: fromState,
      to: toState,
      trigger,
      timestamp: now,
      duration,
    });

    // 更新状态
    this.currentState = toState;
    this.stateEnterTime = now;

    // 执行action
    if (transition.action) {
      transition.action({
        agentId: this.agentId,
        fromState,
        toState,
        trigger,
        payload,
        timestamp: now,
      });
    }

    // 通知监听器
    this.listeners.forEach((listener) => listener(fromState, toState, trigger));

    return true;
  }

  /**
   * 注册状态流转规则
   */
  private registerTransitions(transitions: StateTransition[]): void {
    for (const t of transitions) {
      const key = `${t.from}:${t.trigger}`;
      this.transitions.set(key, t);
    }
  }

  /**
   * 添加状态变更监听器
   */
  onTransition(listener: (from: AgentState, to: AgentState, trigger: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 检查是否可以流转
   */
  canTransition(trigger: string): boolean {
    const transitionKey = `${this.currentState}:${trigger}`;
    return this.transitions.has(transitionKey);
  }

  /**
   * 获取可用触发器
   */
  getAvailableTriggers(): string[] {
    const triggers: string[] = [];
    for (const [key, transition] of this.transitions) {
      if (transition.from === this.currentState) {
        triggers.push(transition.trigger);
      }
    }
    return triggers;
  }

  /**
   * 序列化状态
   */
  serialize(): {
    agentId: string;
    state: AgentState;
    history: StateHistoryEntry[];
    stateEnterTime: number;
  } {
    return {
      agentId: this.agentId,
      state: this.currentState,
      history: [...this.history],
      stateEnterTime: this.stateEnterTime,
    };
  }

  /**
   * 恢复状态
   */
  restore(data: {
    state: AgentState;
    history: StateHistoryEntry[];
    stateEnterTime: number;
  }): void {
    this.currentState = data.state;
    this.history = [...data.history];
    this.stateEnterTime = data.stateEnterTime;
  }

  /**
   * 获取在当前状态的持续时间
   */
  getStateDuration(): number {
    return Date.now() - this.stateEnterTime;
  }
}

// ========== 工厂函数 ==========

export function createStateMachine(
  agentId: string,
  initialState?: AgentState,
  customTransitions?: StateTransition[]
): TSAStateMachine {
  return new TSAStateMachine(agentId, initialState, customTransitions);
}

export default TSAStateMachine;
