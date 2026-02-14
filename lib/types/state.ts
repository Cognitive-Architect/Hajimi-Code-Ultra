/**
 * 七权状态定义
 * IDLE → DESIGN → CODE → AUDIT → BUILD → DEPLOY → DONE
 */
export type PowerState = 
  | 'IDLE'      // 空闲状态，等待任务
  | 'DESIGN'    // 设计阶段，架构师主导
  | 'CODE'      // 编码阶段，工程师主导
  | 'AUDIT'     // 审计阶段，QA主导
  | 'BUILD'     // 构建阶段，自动化执行
  | 'DEPLOY'    // 部署阶段，运维主导
  | 'DONE';     // 完成状态

/**
 * 七权角色定义
 */
export type AgentRole = 
  | 'pm'        // 产品经理
  | 'arch'      // 架构师
  | 'qa'        // 质量保证
  | 'engineer'  // 工程师
  | 'mike'      // 运维
  | 'system';   // 系统角色

/**
 * 状态流转记录
 */
export interface StateTransition {
  id: string;
  from: PowerState;
  to: PowerState;
  timestamp: number;
  agent: AgentRole;
  reason?: string;
  context?: Record<string, unknown>;
}

/**
 * 状态响应
 */
export interface StateResponse {
  state: PowerState;
  history: StateTransition[];
  timestamp: number;
}

/**
 * 流转响应
 */
export interface TransitionResponse {
  success: boolean;
  from: PowerState;
  to: PowerState;
  transition?: StateTransition;
  error?: string;
}

/**
 * 流转规则
 */
export interface TransitionRule {
  from: PowerState;
  to: PowerState;
  allowed: boolean;
  requiredRoles?: AgentRole[];
  description?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
