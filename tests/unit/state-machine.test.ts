import { StateMachine } from '@/lib/core/state/machine';
import { TransitionRulesEngine } from '@/lib/core/state/rules';
import { PowerState, AgentRole } from '@/lib/types/state';
import { tsa } from '@/lib/tsa';

describe('StateMachine', () => {
  let machine: StateMachine;

  beforeEach(async () => {
    // 清理 TSA 确保测试隔离
    await tsa.clear();
    machine = new StateMachine();
    await machine.init();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  describe('STM-001: 获取当前状态', () => {
    it('should return current state and history', () => {
      const response = machine.getStateResponse();
      
      expect(response).toHaveProperty('state');
      expect(response).toHaveProperty('history');
      expect(response).toHaveProperty('timestamp');
      expect(response.state).toBe('IDLE');
      expect(Array.isArray(response.history)).toBe(true);
    });
  });

  describe('STM-002: 合法流转IDLE→DESIGN', () => {
    it('should allow IDLE to DESIGN transition by pm', async () => {
      const result = await machine.transition('DESIGN', 'pm');
      
      expect(result.success).toBe(true);
      expect(result.from).toBe('IDLE');
      expect(result.to).toBe('DESIGN');
      expect(result.transition).toBeDefined();
    });

    it('should allow IDLE to DESIGN transition by arch', async () => {
      const result = await machine.transition('DESIGN', 'arch');
      
      expect(result.success).toBe(true);
      expect(result.to).toBe('DESIGN');
    });
  });

  describe('STM-003: 合法流转DESIGN→CODE', () => {
    it('should allow DESIGN to CODE transition by engineer', async () => {
      await machine.transition('DESIGN', 'pm');
      const result = await machine.transition('CODE', 'engineer');
      
      expect(result.success).toBe(true);
      expect(result.from).toBe('DESIGN');
      expect(result.to).toBe('CODE');
    });

    it('should allow DESIGN to CODE transition by arch', async () => {
      await machine.transition('DESIGN', 'pm');
      const result = await machine.transition('CODE', 'arch');
      
      expect(result.success).toBe(true);
    });
  });

  describe('STM-004: 非法流转被拒绝', () => {
    it('should reject IDLE to DEPLOY transition', async () => {
      const result = await machine.transition('DEPLOY', 'pm');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rule defined');
    });

    it('should reject DONE to any state transition', async () => {
      // 手动执行完整流转到 DONE
      await machine.transition('DESIGN', 'pm');
      await machine.transition('CODE', 'engineer');
      await machine.transition('AUDIT', 'engineer');
      await machine.transition('BUILD', 'qa');
      await machine.transition('DEPLOY', 'system');
      await machine.transition('DONE', 'mike');
      
      const result = await machine.transition('IDLE', 'pm');
      expect(result.success).toBe(false);
    });
  });

  describe('STM-005: 状态历史记录完整', () => {
    it('should maintain complete history', async () => {
      await machine.transition('DESIGN', 'pm', { reason: '开始设计' });
      await machine.transition('CODE', 'engineer', { reason: '设计完成' });
      
      const response = machine.getStateResponse();
      
      expect(response.history.length).toBe(2);
      expect(response.history[0]).toHaveProperty('id');
      expect(response.history[0]).toHaveProperty('from');
      expect(response.history[0]).toHaveProperty('to');
      expect(response.history[0]).toHaveProperty('timestamp');
      expect(response.history[0]).toHaveProperty('agent');
    });
  });

  describe('STM-006: 订阅通知机制', () => {
    it('should notify subscribers on state change', async () => {
      const mockListener = jest.fn();
      const unsubscribe = machine.subscribe(mockListener);
      
      await machine.transition('DESIGN', 'pm');
      
      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'IDLE',
          to: 'DESIGN',
          agent: 'pm',
        })
      );
      
      unsubscribe();
    });

    it('should allow unsubscribe', async () => {
      const mockListener = jest.fn();
      const unsubscribe = machine.subscribe(mockListener);
      
      unsubscribe();
      await machine.transition('DESIGN', 'pm');
      
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('STM-007: 权限验证', () => {
    it('should reject CODE to AUDIT by pm', async () => {
      await machine.transition('DESIGN', 'pm');
      await machine.transition('CODE', 'engineer');
      
      const result = await machine.transition('AUDIT', 'pm');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
      expect(result.error).toContain('Required: engineer');
    });
  });

  describe('STM-008: 完整流转链路', () => {
    it('should complete full workflow IDLE→DESIGN→CODE→AUDIT→BUILD→DEPLOY→DONE', async () => {
      // 按照正确的角色执行每个流转
      // 根据规则引擎定义: AUDIT→BUILD 需要 qa, BUILD→DEPLOY 需要 system/mike
      const steps: Array<{ to: PowerState; agent: AgentRole; reason: string }> = [
        { to: 'DESIGN', agent: 'pm', reason: '开始设计' },
        { to: 'CODE', agent: 'engineer', reason: '设计完成' },
        { to: 'AUDIT', agent: 'engineer', reason: '编码完成' },
        { to: 'BUILD', agent: 'qa', reason: '审计通过' },
        { to: 'DEPLOY', agent: 'system', reason: '构建成功' },
        { to: 'DONE', agent: 'mike', reason: '部署成功' },
      ];

      for (const step of steps) {
        const result = await machine.transition(step.to, step.agent, { reason: step.reason });
        if (!result.success) {
          console.log(`Failed at ${step.to} by ${step.agent}:`, result.error);
        }
        expect(result.success).toBe(true);
        expect(result.to).toBe(step.to);
      }

      expect(machine.getCurrentState()).toBe('DONE');
      expect(machine.getHistory().length).toBe(6);
    });
  });
});

describe('TransitionRulesEngine', () => {
  let engine: TransitionRulesEngine;

  beforeEach(() => {
    engine = new TransitionRulesEngine();
  });

  it('should validate transitions correctly', () => {
    expect(engine.validateTransition('IDLE', 'DESIGN', 'pm').valid).toBe(true);
    expect(engine.validateTransition('IDLE', 'DESIGN', 'engineer').valid).toBe(false);
    expect(engine.validateTransition('IDLE', 'CODE', 'pm').valid).toBe(false);
  });

  it('should return required approvals', () => {
    const approvals = engine.getRequiredApprovals('IDLE', 'DESIGN');
    expect(approvals).toContain('pm');
    expect(approvals).toContain('arch');
  });
});
