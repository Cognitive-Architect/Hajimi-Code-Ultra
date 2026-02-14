import { 
  PowerState, 
  AgentRole, 
  TransitionRule, 
  ValidationResult 
} from '@/lib/types/state';

/**
 * 流转规则引擎
 * 管理七权状态机的所有流转规则
 */
export class TransitionRulesEngine {
  private rules: Map<string, TransitionRule> = new Map();

  constructor() {
    // 加载默认规则
    this.loadDefaultRules();
  }

  /**
   * 验证流转是否允许
   * @param from 源状态
   * @param to 目标状态
   * @param agent 触发角色
   * @returns 验证结果
   */
  validateTransition(
    from: PowerState, 
    to: PowerState, 
    agent: AgentRole
  ): ValidationResult {
    // 1. 检查是否为相同状态
    if (from === to) {
      return { valid: false, reason: 'Cannot transition to the same state' };
    }

    // 2. 查找规则
    const key = this.getRuleKey(from, to);
    const rule = this.rules.get(key);

    if (!rule) {
      return { valid: false, reason: `No rule defined for transition: ${from} → ${to}` };
    }

    // 3. 检查是否允许
    if (!rule.allowed) {
      return { valid: false, reason: `Transition ${from} → ${to} is not allowed` };
    }

    // 4. 检查角色权限
    if (rule.requiredRoles && rule.requiredRoles.length > 0) {
      if (!rule.requiredRoles.includes(agent)) {
        return { 
          valid: false, 
          reason: `Agent role '${agent}' is not authorized for this transition. Required: ${rule.requiredRoles.join(', ')}` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * 获取所需审批角色
   * @param from 源状态
   * @param to 目标状态
   * @returns 所需角色列表
   */
  getRequiredApprovals(from: PowerState, to: PowerState): AgentRole[] {
    const key = this.getRuleKey(from, to);
    const rule = this.rules.get(key);
    return rule?.requiredRoles || [];
  }

  /**
   * 获取所有规则
   */
  getAllRules(): TransitionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: TransitionRule): void {
    const key = this.getRuleKey(rule.from, rule.to);
    this.rules.set(key, rule);
  }

  /**
   * 生成规则键
   */
  private getRuleKey(from: PowerState, to: PowerState): string {
    return `${from}→${to}`;
  }

  /**
   * 加载默认规则
   * 七权状态机标准流转规则
   */
  private loadDefaultRules(): void {
    const defaultTransitions: TransitionRule[] = [
      // IDLE 流转
      { from: 'IDLE', to: 'DESIGN', allowed: true, requiredRoles: ['pm', 'arch'], description: 'PM或架构师启动设计' },
      
      // DESIGN 流转
      { from: 'DESIGN', to: 'CODE', allowed: true, requiredRoles: ['arch', 'engineer'], description: '设计完成，进入编码' },
      { from: 'DESIGN', to: 'IDLE', allowed: true, requiredRoles: ['pm'], description: 'PM取消设计' },
      
      // CODE 流转
      { from: 'CODE', to: 'AUDIT', allowed: true, requiredRoles: ['engineer'], description: '编码完成，提交审计' },
      { from: 'CODE', to: 'DESIGN', allowed: true, requiredRoles: ['arch'], description: '架构师要求重新设计' },
      
      // AUDIT 流转
      { from: 'AUDIT', to: 'BUILD', allowed: true, requiredRoles: ['qa'], description: '审计通过，进入构建' },
      { from: 'AUDIT', to: 'CODE', allowed: true, requiredRoles: ['qa'], description: 'QA要求修复问题' },
      
      // BUILD 流转
      { from: 'BUILD', to: 'DEPLOY', allowed: true, requiredRoles: ['system', 'mike'], description: '构建成功，进入部署' },
      { from: 'BUILD', to: 'CODE', allowed: true, requiredRoles: ['system'], description: '构建失败，返回编码' },
      
      // DEPLOY 流转
      { from: 'DEPLOY', to: 'DONE', allowed: true, requiredRoles: ['mike', 'system'], description: '部署成功，任务完成' },
      { from: 'DEPLOY', to: 'BUILD', allowed: true, requiredRoles: ['mike'], description: '部署失败，重新构建' },
      
      // DONE 流转（终态，不可流转）
      // 无出边
    ];

    defaultTransitions.forEach(rule => {
      const key = this.getRuleKey(rule.from, rule.to);
      this.rules.set(key, rule);
    });

    console.log(`[TransitionRulesEngine] 加载了 ${defaultTransitions.length} 条默认规则`);
  }
}

// 导出单例
export const rulesEngine = new TransitionRulesEngine();
