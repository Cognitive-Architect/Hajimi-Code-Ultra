import { 
  PowerState, 
  AgentRole, 
  StateTransition, 
  StateResponse, 
  TransitionResponse 
} from '@/lib/types/state';
import { TransitionRulesEngine } from './rules';
import { tsa, StorageTier } from '@/lib/tsa';

// B-01/09 FIX: 修改存储键命名，支持proposalId隔离
// 默认使用全局键，但支持传入proposalId生成隔离键
const DEFAULT_STATE_KEY = 'state:current';
const DEFAULT_HISTORY_KEY = 'state:history';

// FIX: 使用STAGING tier持久化状态（非TRANSIENT）
const STATE_TIER: StorageTier = 'STAGING';
const HISTORY_TIER: StorageTier = 'ARCHIVE';

/**
 * 状态机核心类
 * 管理七权状态的生命周期流转
 * 
 * B-01/09 FIX:
 * - 支持proposalId隔离
 * - 状态使用STAGING tier持久化
 * - 添加持久化验证
 */
export class StateMachine {
  private currentState: PowerState = 'IDLE';
  private history: StateTransition[] = [];
  private listeners: Set<(transition: StateTransition) => void> = new Set();
  private rulesEngine: TransitionRulesEngine;
  private initialized = false;
  
  // B-01/09 FIX: 可选的proposalId支持
  private proposalId?: string;

  constructor(proposalId?: string) {
    this.rulesEngine = new TransitionRulesEngine();
    this.proposalId = proposalId;
  }

  /**
   * B-01/09 FIX: 获取状态存储键
   */
  private getStateKey(): string {
    return this.proposalId 
      ? `state:current:${this.proposalId}` 
      : DEFAULT_STATE_KEY;
  }

  /**
   * B-01/09 FIX: 获取历史记录存储键
   */
  private getHistoryKey(): string {
    return this.proposalId 
      ? `state:history:${this.proposalId}` 
      : DEFAULT_HISTORY_KEY;
  }

  /**
   * 初始化状态机
   * 从TSA加载历史状态
   * 
   * B-01/09 FIX: 使用proposalId隔离的键
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // B-02/04 FIX: 先初始化TSA
      if (!tsa.isInitialized()) {
        await tsa.init();
      }

      // B-01/09 FIX: 从TSA加载当前状态（使用隔离键）
      const stateKey = this.getStateKey();
      const savedState = await tsa.get<PowerState>(stateKey);
      if (savedState) {
        this.currentState = savedState;
        console.log(`[StateMachine] 从Redis恢复状态: ${this.currentState} (key: ${stateKey})`);
      }

      // B-01/09 FIX: 从TSA加载历史记录
      const historyKey = this.getHistoryKey();
      const savedHistory = await tsa.get<StateTransition[]>(historyKey);
      if (savedHistory) {
        this.history = savedHistory;
      }

      this.initialized = true;
      console.log(`[StateMachine] 初始化完成，当前状态: ${this.currentState}`);
    } catch (error) {
      console.error('[StateMachine] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 状态流转
   * @param to 目标状态
   * @param agent 触发角色
   * @param context 上下文信息
   * @returns 流转结果
   */
  async transition(
    to: PowerState, 
    agent: AgentRole = 'system',
    context?: Record<string, unknown>
  ): Promise<TransitionResponse> {
    this.ensureInitialized();

    const from = this.currentState;

    // 0. 如果已经在目标状态，直接返回成功（幂等性）
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

    // 3. 执行流转
    const transition: StateTransition = {
      id: this.generateId(),
      from,
      to,
      timestamp: Date.now(),
      agent,
      reason: context?.reason as string,
      context,
    };

    // 4. 更新状态
    this.currentState = to;
    this.history.push(transition);

    // 5. 持久化到TSA
    // B-01/09 FIX: 确保await并验证持久化
    try {
      await this.persistState();
      
      // FIX: 验证持久化成功
      const verifyState = await tsa.get<PowerState>(this.getStateKey());
      if (verifyState !== to) {
        console.error(`[StateMachine] 持久化验证失败: expected ${to}, got ${verifyState}`);
        // 回滚状态
        this.currentState = from;
        this.history.pop();
        return {
          success: false,
          from,
          to,
          error: 'State persistence verification failed',
        };
      }
    } catch (error) {
      console.error('[StateMachine] 持久化失败:', error);
      // 回滚状态
      this.currentState = from;
      this.history.pop();
      return {
        success: false,
        from,
        to,
        error: `Persistence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 6. 通知订阅者
    this.notifyListeners(transition);

    console.log(`[StateMachine] 状态流转: ${from} → ${to} (by ${agent})`);

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
    return allStates.filter(state => 
      this.canTransition(state, agent)
    );
  }

  /**
   * 订阅状态变更
   * @param listener 回调函数
   * @returns 取消订阅函数
   */
  subscribe(listener: (transition: StateTransition) => void): () => void {
    this.listeners.add(listener);
    
    // 返回取消订阅函数
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
    console.log('[StateMachine] 状态已重置');
  }

  /**
   * 持久化状态到TSA
   * 
   * B-01/09 FIX:
   * - 使用proposalId隔离的键
   * - 状态使用STAGING tier（非TRANSIENT）
   */
  private async persistState(): Promise<void> {
    try {
      const stateKey = this.getStateKey();
      const historyKey = this.getHistoryKey();
      
      // FIX: 使用STAGING tier持久化状态（TRANSIENT生命周期太短）
      await tsa.set(stateKey, this.currentState, { tier: STATE_TIER });
      await tsa.set(historyKey, this.history, { tier: HISTORY_TIER });
      
      console.log(`[StateMachine] 状态已持久化: ${this.currentState} (key: ${stateKey})`);
    } catch (error) {
      console.error('[StateMachine] 状态持久化失败:', error);
      throw error;
    }
  }

  /**
   * B-01/09 FIX: 获取proposalId（如设置）
   */
  getProposalId(): string | undefined {
    return this.proposalId;
  }

  /**
   * B-01/09 FIX: 手动触发状态持久化（供外部调用）
   */
  async forcePersist(): Promise<void> {
    this.ensureInitialized();
    await this.persistState();
  }

  /**
   * B-01/09 FIX: 验证持久化一致性
   */
  async verifyPersistence(): Promise<{ consistent: boolean; memoryState: PowerState; redisState: PowerState | null }> {
    const memoryState = this.currentState;
    const redisState = await tsa.get<PowerState>(this.getStateKey());
    
    return {
      consistent: memoryState === redisState,
      memoryState,
      redisState,
    };
  }

  /**
   * 通知所有订阅者
   */
  private notifyListeners(transition: StateTransition): void {
    this.listeners.forEach(listener => {
      try {
        listener(transition);
      } catch (error) {
        console.error('[StateMachine] 订阅者通知失败:', error);
      }
    });
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('StateMachine not initialized. Call init() first.');
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// 导出单例
export const stateMachine = new StateMachine();
