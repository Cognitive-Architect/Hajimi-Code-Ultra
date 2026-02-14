/**
 * TSA Orchestrator V2 - B-01/09 FIX
 * 
 * 修复TSA状态机跨步骤状态丢失问题
 * - 支持proposalId隔离
 * - 状态自动持久化到Redis
 * - 添加状态变更监听器
 * - 跨层级状态一致性保证
 */

import { PowerState, AgentRole, StateTransition, StateResponse, TransitionResponse } from '@/lib/types/state';
import { TransitionRulesEngine } from '@/lib/core/state/rules';
import { tsa, StorageTier } from '@/lib/tsa';

// 状态存储配置
const STATE_TIER: StorageTier = 'STAGING';  // FIX: 使用STAGING而非TRANSIENT
const HISTORY_TIER: StorageTier = 'ARCHIVE'; // 历史记录使用ARCHIVE

/**
 * 状态变更事件
 */
export interface StateChangeEvent {
  proposalId: string;
  from: PowerState;
  to: PowerState;
  agent: AgentRole;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * 状态变更监听器
 */
export type StateChangeListener = (event: StateChangeEvent) => void | Promise<void>;

/**
 * 持久化验证结果
 */
export interface PersistenceVerificationResult {
  success: boolean;
  memoryState: PowerState;
  redisState: PowerState | null;
  consistent: boolean;
  error?: string;
}

/**
 * TSA State Machine V2 - 修复状态丢失问题
 * 
 * 关键改进：
 * 1. 支持proposalId隔离，每个提案独立状态
 * 2. 状态键命名: `state:current:${proposalId}`
 * 3. 使用STAGING tier持久化（非TRANSIENT）
 * 4. 添加持久化验证机制
 */
export class TSAStateMachineV2 {
  private proposalId: string;
  private currentState: PowerState = 'IDLE';
  private history: StateTransition[] = [];
  private listeners: Set<StateChangeListener> = new Set();
  private rulesEngine: TransitionRulesEngine;
  private initialized = false;

  constructor(proposalId: string) {
    this.proposalId = proposalId;
    this.rulesEngine = new TransitionRulesEngine();
  }

  /**
   * 获取状态存储键
   * FIX: 使用proposalId隔离
   */
  private getStateKey(): string {
    return `state:current:${this.proposalId}`;
  }

  /**
   * 获取历史记录存储键
   */
  private getHistoryKey(): string {
    return `state:history:${this.proposalId}`;
  }

  /**
   * 初始化状态机
   * FIX: 从TSA加载时包含proposalId
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 确保TSA已初始化
      if (!tsa.isInitialized()) {
        await tsa.init();
      }

      // 从TSA加载当前状态（带proposalId）
      const savedState = await tsa.get<PowerState>(this.getStateKey());
      if (savedState) {
        this.currentState = savedState;
        console.log(`[TSAStateMachineV2:${this.proposalId}] 从Redis恢复状态: ${this.currentState}`);
      }

      // 从TSA加载历史记录
      const savedHistory = await tsa.get<StateTransition[]>(this.getHistoryKey());
      if (savedHistory) {
        this.history = savedHistory;
      }

      this.initialized = true;
      console.log(`[TSAStateMachineV2:${this.proposalId}] 初始化完成，当前状态: ${this.currentState}`);
    } catch (error) {
      console.error(`[TSAStateMachineV2:${this.proposalId}] 初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 状态流转
   * FIX: 
   * 1. 确保await persistState()
   * 2. 持久化后验证
   * 3. 通知监听器
   */
  async transition(
    to: PowerState,
    agent: AgentRole = 'system',
    context?: Record<string, unknown>
  ): Promise<TransitionResponse> {
    this.ensureInitialized();

    const from = this.currentState;

    // 0. 幂等性检查
    if (from === to) {
      return {
        success: true,
        from,
        to,
        transition: {
          id: this.generateId(),
          from,
          to,
          timestamp: Date.now(),
          agent,
          reason: 'Idempotent transition - already in target state',
          context,
        },
      };
    }

    // 1. 验证流转是否允许
    const validation = this.rulesEngine.validateTransition(from, to, agent);
    if (!validation.valid) {
      return {
        success: false,
        from,
        to,
        error: validation.reason || 'Invalid transition',
      };
    }

    // 2. 检查是否需要额外审批
    const requiredApprovals = this.rulesEngine.getRequiredApprovals(from, to);
    if (requiredApprovals.length > 0 && !requiredApprovals.includes(agent)) {
      return {
        success: false,
        from,
        to,
        error: `Transition requires approval from: ${requiredApprovals.join(', ')}`,
      };
    }

    // 3. 创建流转记录
    const transition: StateTransition = {
      id: this.generateId(),
      from,
      to,
      timestamp: Date.now(),
      agent,
      reason: context?.reason as string,
      context,
    };

    // 4. 更新内存状态
    this.currentState = to;
    this.history.push(transition);

    // 5. 持久化到TSA（FIX: 确保await）
    try {
      await this.persistState();
      
      // FIX: 验证持久化成功
      const verifyResult = await this.verifyPersistence();
      if (!verifyResult.consistent) {
        console.error(`[TSAStateMachineV2:${this.proposalId}] 持久化验证失败:`, verifyResult.error);
        // 回滚内存状态
        this.currentState = from;
        this.history.pop();
        return {
          success: false,
          from,
          to,
          error: `Persistence verification failed: ${verifyResult.error}`,
        };
      }
    } catch (error) {
      console.error(`[TSAStateMachineV2:${this.proposalId}] 持久化失败:`, error);
      // 回滚内存状态
      this.currentState = from;
      this.history.pop();
      return {
        success: false,
        from,
        to,
        error: `Persistence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 6. 通知监听器
    const event: StateChangeEvent = {
      proposalId: this.proposalId,
      from,
      to,
      agent,
      timestamp: Date.now(),
      context,
    };
    await this.notifyListeners(event);

    console.log(`[TSAStateMachineV2:${this.proposalId}] 状态流转: ${from} → ${to} (by ${agent})`);

    return {
      success: true,
      from,
      to,
      transition,
    };
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): PowerState {
    return this.currentState;
  }

  /**
   * 获取完整状态响应
   */
  getStateResponse(): StateResponse {
    return {
      state: this.currentState,
      history: [...this.history],
      timestamp: Date.now(),
    };
  }

  /**
   * 获取流转历史
   */
  getHistory(): StateTransition[] {
    return [...this.history];
  }

  /**
   * 检查流转是否允许
   */
  canTransition(to: PowerState, agent?: AgentRole): boolean {
    const validation = this.rulesEngine.validateTransition(
      this.currentState,
      to,
      agent || 'system'
    );
    return validation.valid;
  }

  /**
   * 获取允许的流转目标
   */
  getAllowedTransitions(agent?: AgentRole): PowerState[] {
    const allStates: PowerState[] = ['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
    return allStates.filter(state => this.canTransition(state, agent));
  }

  /**
   * 订阅状态变更
   */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 重置状态机（仅用于测试）
   */
  async reset(): Promise<void> {
    this.currentState = 'IDLE';
    this.history = [];
    await this.persistState();
    console.log(`[TSAStateMachineV2:${this.proposalId}] 状态已重置`);
  }

  /**
   * 持久化状态到TSA
   * FIX: 
   * 1. 使用proposalId隔离的键
   * 2. 使用STAGING tier而非TRANSIENT
   */
  private async persistState(): Promise<void> {
    try {
      await tsa.set(this.getStateKey(), this.currentState, { tier: STATE_TIER });
      await tsa.set(this.getHistoryKey(), this.history, { tier: HISTORY_TIER });
      
      console.log(`[TSAStateMachineV2:${this.proposalId}] 状态已持久化: ${this.currentState}`);
    } catch (error) {
      console.error(`[TSAStateMachineV2:${this.proposalId}] 状态持久化失败:`, error);
      throw error;
    }
  }

  /**
   * 验证持久化一致性
   * FIX: 确保Memory和Redis状态一致
   */
  private async verifyPersistence(): Promise<PersistenceVerificationResult> {
    try {
      const redisState = await tsa.get<PowerState>(this.getStateKey());
      const memoryState = this.currentState;
      
      const consistent = redisState === memoryState;
      
      if (!consistent) {
        return {
          success: false,
          memoryState,
          redisState,
          consistent: false,
          error: `State mismatch: memory=${memoryState}, redis=${redisState}`,
        };
      }
      
      return {
        success: true,
        memoryState,
        redisState,
        consistent: true,
      };
    } catch (error) {
      return {
        success: false,
        memoryState: this.currentState,
        redisState: null,
        consistent: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 异步通知所有监听器
   */
  private async notifyListeners(event: StateChangeEvent): Promise<void> {
    const promises = Array.from(this.listeners).map(async listener => {
      try {
        await listener(event);
      } catch (error) {
        console.error(`[TSAStateMachineV2:${this.proposalId}] 监听器通知失败:`, error);
      }
    });
    await Promise.all(promises);
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TSAStateMachineV2 not initialized. Call init() first.');
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取proposalId
   */
  getProposalId(): string {
    return this.proposalId;
  }
}

/**
 * TSA Orchestrator V2
 * 
 * 管理多个proposal的状态机实例
 * 提供状态持久化验证和跨提案协调
 */
export class TSAOrchestratorV2 {
  private machines: Map<string, TSAStateMachineV2> = new Map();
  private globalListeners: Set<StateChangeListener> = new Set();

  /**
   * 获取或创建状态机实例
   */
  async getMachine(proposalId: string): Promise<TSAStateMachineV2> {
    let machine = this.machines.get(proposalId);
    if (!machine) {
      machine = new TSAStateMachineV2(proposalId);
      await machine.init();
      
      // 注册全局监听器
      machine.subscribe(async (event) => {
        await this.notifyGlobalListeners(event);
      });
      
      this.machines.set(proposalId, machine);
    }
    return machine;
  }

  /**
   * 订阅全局状态变更
   */
  subscribeGlobal(listener: StateChangeListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * 获取所有活跃提案ID
   */
  getActiveProposalIds(): string[] {
    return Array.from(this.machines.keys());
  }

  /**
   * 释放状态机实例
   */
  releaseMachine(proposalId: string): void {
    this.machines.delete(proposalId);
  }

  /**
   * 清理所有状态机
   */
  clear(): void {
    this.machines.clear();
  }

  /**
   * 验证所有状态机持久化一致性
   */
  async verifyAll(): Promise<Map<string, PersistenceVerificationResult>> {
    const results = new Map<string, PersistenceVerificationResult>();
    
    for (const [proposalId, machine] of this.machines) {
      const result = await this.verifyMachine(proposalId);
      results.set(proposalId, result);
    }
    
    return results;
  }

  /**
   * 验证单个状态机持久化
   */
  async verifyMachine(proposalId: string): Promise<PersistenceVerificationResult> {
    const machine = this.machines.get(proposalId);
    if (!machine) {
      return {
        success: false,
        memoryState: 'IDLE',
        redisState: null,
        consistent: false,
        error: 'Machine not found',
      };
    }

    const memoryState = machine.getCurrentState();
    const redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
    
    const consistent = redisState === memoryState;
    
    return {
      success: consistent,
      memoryState,
      redisState,
      consistent,
      error: consistent ? undefined : `State mismatch: memory=${memoryState}, redis=${redisState}`,
    };
  }

  /**
   * 通知全局监听器
   */
  private async notifyGlobalListeners(event: StateChangeEvent): Promise<void> {
    const promises = Array.from(this.globalListeners).map(async listener => {
      try {
        await listener(event);
      } catch (error) {
        console.error('[TSAOrchestratorV2] 全局监听器通知失败:', error);
      }
    });
    await Promise.all(promises);
  }
}

// 导出单例
export const tsaOrchestratorV2 = new TSAOrchestratorV2();
export default tsaOrchestratorV2;
