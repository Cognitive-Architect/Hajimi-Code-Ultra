import { 
  PowerState, 
  AgentRole, 
  StateTransition, 
  StateResponse, 
  TransitionResponse 
} from '@/lib/types/state';
import { TransitionRulesEngine } from './rules';
import { tsa } from '@/lib/tsa';

// TSA存储键
const STATE_KEY = 'state:current';
const HISTORY_KEY = 'state:history';

/**
 * 状态机核心类
 * 管理七权状态的生命周期流转
 */
export class StateMachine {
  private currentState: PowerState = 'IDLE';
  private history: StateTransition[] = [];
  private listeners: Set<(transition: StateTransition) => void> = new Set();
  private rulesEngine: TransitionRulesEngine;
  private initialized = false;

  constructor() {
    this.rulesEngine = new TransitionRulesEngine();
  }

  /**
   * 初始化状态机
   * 从TSA加载历史状态
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // B-02/04 FIX: 先初始化TSA
      if (!tsa.isInitialized()) {
        await tsa.init();
      }

      // 从TSA加载当前状态
      const savedState = await tsa.get<PowerState>(STATE_KEY);
      if (savedState) {
        this.currentState = savedState;
      }

      // 从TSA加载历史记录
      const savedHistory = await tsa.get<StateTransition[]>(HISTORY_KEY);
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
    await this.persistState();

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
   */
  private async persistState(): Promise<void> {
    try {
      await tsa.set(STATE_KEY, this.currentState, { tier: 'TRANSIENT' });
      await tsa.set(HISTORY_KEY, this.history, { tier: 'STAGING' });
    } catch (error) {
      console.error('[StateMachine] 状态持久化失败:', error);
      throw error;
    }
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
