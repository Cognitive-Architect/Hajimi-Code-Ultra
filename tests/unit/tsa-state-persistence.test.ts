/**
 * TSA状态持久化修复测试 - B-01/09
 * 
 * 自测点：
 * - TSA-001: 状态流转DESIGN→CODE时Redis持久化验证
 * - TSA-002: 断电恢复测试（kill Redis后状态不丢失）
 * - TSA-003: 跨层级状态一致性（Memory↔Redis）
 */

import { StateMachine } from '@/lib/core/state/machine';
import { TSAStateMachineV2, TSAOrchestratorV2 } from '@/lib/tsa/orchestrator-v2';
import { tsa } from '@/lib/tsa';
import { PowerState, AgentRole } from '@/lib/types/state';

describe('TSA-001: 状态流转DESIGN→CODE时Redis持久化验证', () => {
  let machine: StateMachine;
  const proposalId = 'test-proposal-001';

  beforeEach(async () => {
    await tsa.clear();
    machine = new StateMachine(proposalId);
    await machine.init();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should persist DESIGN state to Redis with proposalId key', async () => {
    // 执行流转
    const result = await machine.transition('DESIGN', 'pm', { reason: '开始设计' });
    
    expect(result.success).toBe(true);
    expect(machine.getCurrentState()).toBe('DESIGN');

    // 验证Redis中有正确的状态
    const redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
    expect(redisState).toBe('DESIGN');
  });

  it('should persist CODE state after DESIGN→CODE transition', async () => {
    // 先流转到DESIGN
    await machine.transition('DESIGN', 'pm');
    
    // 再流转到CODE
    const result = await machine.transition('CODE', 'engineer');
    
    expect(result.success).toBe(true);
    expect(machine.getCurrentState()).toBe('CODE');

    // 验证Redis状态已更新
    const redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
    expect(redisState).toBe('CODE');
  });

  it('TEST-012-1: DESIGN状态正确保存', async () => {
    // 执行IDLE→DESIGN流转
    const result = await machine.transition('DESIGN', 'pm');
    
    // 验证流转成功
    expect(result.success).toBe(true);
    expect(result.from).toBe('IDLE');
    expect(result.to).toBe('DESIGN');
    
    // 验证内存状态
    expect(machine.getCurrentState()).toBe('DESIGN');
    
    // 验证Redis持久化
    const redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
    expect(redisState).toBe('DESIGN');
    
    // 验证持久化一致性
    const verifyResult = await machine.verifyPersistence();
    expect(verifyResult.consistent).toBe(true);
    expect(verifyResult.memoryState).toBe('DESIGN');
    expect(verifyResult.redisState).toBe('DESIGN');
  });
});

describe('TSA-002: 断电恢复测试', () => {
  const proposalId = 'test-proposal-002';

  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should restore state after reinitializing StateMachine', async () => {
    // 创建第一个状态机实例并流转到DESIGN
    const machine1 = new StateMachine(proposalId);
    await machine1.init();
    await machine1.transition('DESIGN', 'pm');
    
    expect(machine1.getCurrentState()).toBe('DESIGN');

    // 模拟"断电" - 创建新的状态机实例（同一个proposalId）
    const machine2 = new StateMachine(proposalId);
    await machine2.init();
    
    // 验证状态已恢复
    expect(machine2.getCurrentState()).toBe('DESIGN');
  });

  it('should maintain state after TSA reinitialization', async () => {
    // 创建状态机并流转
    const machine1 = new StateMachine(proposalId);
    await machine1.init();
    await machine1.transition('DESIGN', 'pm');
    await machine1.transition('CODE', 'engineer');
    
    // 模拟TSA重启
    await tsa.destroy();
    await tsa.init();
    
    // 创建新状态机实例
    const machine2 = new StateMachine(proposalId);
    await machine2.init();
    
    // 验证状态仍在
    expect(machine2.getCurrentState()).toBe('CODE');
    
    // 验证历史记录也在
    const history = machine2.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].to).toBe('DESIGN');
    expect(history[1].to).toBe('CODE');
  });
});

describe('TSA-003: 跨层级状态一致性', () => {
  const proposalId = 'test-proposal-003';

  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should maintain consistency between memory and Redis', async () => {
    const machine = new StateMachine(proposalId);
    await machine.init();
    
    // 流转到DESIGN
    await machine.transition('DESIGN', 'pm');
    
    // 验证一致性
    let verify = await machine.verifyPersistence();
    expect(verify.consistent).toBe(true);
    expect(verify.memoryState).toBe(verify.redisState);
    
    // 流转到CODE
    await machine.transition('CODE', 'engineer');
    
    // 再次验证一致性
    verify = await machine.verifyPersistence();
    expect(verify.consistent).toBe(true);
    expect(verify.memoryState).toBe('CODE');
    expect(verify.redisState).toBe('CODE');
  });

  it('should handle complete workflow with consistency', async () => {
    const machine = new StateMachine(proposalId);
    await machine.init();
    
    const workflow: Array<{ to: PowerState; agent: AgentRole }> = [
      { to: 'DESIGN', agent: 'pm' },
      { to: 'CODE', agent: 'engineer' },
      { to: 'AUDIT', agent: 'engineer' },
      { to: 'BUILD', agent: 'qa' },
      { to: 'DEPLOY', agent: 'system' },
      { to: 'DONE', agent: 'mike' },
    ];
    
    for (const step of workflow) {
      const result = await machine.transition(step.to, step.agent);
      expect(result.success).toBe(true);
      
      // 每一步都验证一致性
      const verify = await machine.verifyPersistence();
      expect(verify.consistent).toBe(true);
      expect(verify.memoryState).toBe(step.to);
      expect(verify.redisState).toBe(step.to);
    }
  });
});

describe('TSA-V2: TSAStateMachineV2 多提案隔离测试', () => {
  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should isolate states between different proposals', async () => {
    const machine1 = new TSAStateMachineV2('proposal-1');
    const machine2 = new TSAStateMachineV2('proposal-2');
    
    await machine1.init();
    await machine2.init();
    
    // proposal-1流转到DESIGN
    await machine1.transition('DESIGN', 'pm');
    
    // proposal-2流转到CODE
    await machine2.transition('DESIGN', 'pm');
    await machine2.transition('CODE', 'engineer');
    
    // 验证隔离
    expect(machine1.getCurrentState()).toBe('DESIGN');
    expect(machine2.getCurrentState()).toBe('CODE');
    
    // 验证Redis隔离
    const state1 = await tsa.get<PowerState>('state:current:proposal-1');
    const state2 = await tsa.get<PowerState>('state:current:proposal-2');
    
    expect(state1).toBe('DESIGN');
    expect(state2).toBe('CODE');
  });

  it('should handle concurrent proposal state transitions', async () => {
    const orchestrator = new TSAOrchestratorV2();
    
    // 获取多个提案的状态机
    const machine1 = await orchestrator.getMachine('concurrent-1');
    const machine2 = await orchestrator.getMachine('concurrent-2');
    const machine3 = await orchestrator.getMachine('concurrent-3');
    
    // 并发执行流转
    await Promise.all([
      machine1.transition('DESIGN', 'pm'),
      machine2.transition('DESIGN', 'arch'),
      machine3.transition('DESIGN', 'pm'),
    ]);
    
    // 验证各自状态正确
    expect(machine1.getCurrentState()).toBe('DESIGN');
    expect(machine2.getCurrentState()).toBe('DESIGN');
    expect(machine3.getCurrentState()).toBe('DESIGN');
    
    // 验证Redis数据隔离
    const verifyResults = await orchestrator.verifyAll();
    for (const [id, result] of verifyResults) {
      expect(result.consistent).toBe(true);
      expect(result.redisState).toBe('DESIGN');
    }
  });
});

describe('TSA-V2: 状态变更监听器测试', () => {
  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should notify listeners on state change', async () => {
    const machine = new TSAStateMachineV2('listener-test');
    await machine.init();
    
    const listener = jest.fn();
    machine.subscribe(listener);
    
    await machine.transition('DESIGN', 'pm', { reason: '开始设计' });
    
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'listener-test',
        from: 'IDLE',
        to: 'DESIGN',
        agent: 'pm',
      })
    );
  });

  it('should support async listeners', async () => {
    const machine = new TSAStateMachineV2('async-listener-test');
    await machine.init();
    
    let capturedEvent: unknown = null;
    const asyncListener = jest.fn(async (event) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      capturedEvent = event;
    });
    
    machine.subscribe(asyncListener);
    await machine.transition('DESIGN', 'pm');
    
    expect(asyncListener).toHaveBeenCalled();
    // 等待异步监听器完成
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(capturedEvent).not.toBeNull();
  });
});

describe('TSA-V2: Orchestrator全局监听器测试', () => {
  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('should notify global listeners for all proposals', async () => {
    const orchestrator = new TSAOrchestratorV2();
    const globalListener = jest.fn();
    
    orchestrator.subscribeGlobal(globalListener);
    
    const machine1 = await orchestrator.getMachine('global-1');
    const machine2 = await orchestrator.getMachine('global-2');
    
    await machine1.transition('DESIGN', 'pm');
    await machine2.transition('DESIGN', 'arch');
    
    expect(globalListener).toHaveBeenCalledTimes(2);
    expect(globalListener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ proposalId: 'global-1', to: 'DESIGN' })
    );
    expect(globalListener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ proposalId: 'global-2', to: 'DESIGN' })
    );
  });
});
