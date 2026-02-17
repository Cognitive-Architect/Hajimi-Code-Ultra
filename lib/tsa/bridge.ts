/**
 * TSA-LCR 适配层（Bridge Pattern）
 * 阻断循环依赖，统一事实源
 * 
 * @module lib/tsa/bridge
 * @version 1.0.0
 */

import type { AgentState, StateTransition } from './types';

// ========== 向 LCR 暴露的受限接口（仅读） ==========

/**
 * TSA 只读桥接接口
 * 供 LCR 层查询 TSA 状态，禁止直接修改
 */
export interface TSAReadOnlyBridge {
  /** 获取当前 Agent 状态 */
  getCurrentState(): AgentState;
  /** 验证状态流转是否合法 */
  validateTransition(t: StateTransition): boolean;
}

// ========== 内部状态管理 ==========

interface BridgeState {
  currentState: AgentState;
  validTransitions: Map<string, boolean>;
}

// ========== 工厂函数 ==========

/**
 * 创建 TSA Bridge 实例
 * @param config - 桥接层配置
 * @returns TSAReadOnlyBridge 实例
 */
export function createTSABridge(config: { 
  initialState: AgentState;
  allowedTransitions?: StateTransition[];
}): TSAReadOnlyBridge {
  const state: BridgeState = {
    currentState: config.initialState,
    validTransitions: new Map(),
  };

  // 预计算合法流转
  if (config.allowedTransitions) {
    for (const t of config.allowedTransitions) {
      const key = `${t.from}:${t.trigger}:${t.to}`;
      state.validTransitions.set(key, true);
    }
  }

  return {
    getCurrentState: () => state.currentState,
    validateTransition: (t: StateTransition): boolean => {
      const key = `${t.from}:${t.trigger}:${t.to}`;
      return state.validTransitions.has(key) || !config.allowedTransitions;
    },
  };
}

// ========== 版本信息 ==========

/** Bridge 版本号 */
export const TSA_BRIDGE_VERSION = '1.0.0';

// ========== 类型导出（供 LCR 使用） ==========

export type { AgentState, StateTransition } from './types';

// ========== 默认导出 ==========

export default createTSABridge;
