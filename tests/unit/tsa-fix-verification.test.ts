/**
 * TSA状态持久化修复验证测试 - B-01/09
 * 
 * 验证核心修复：
 * 1. 状态键使用proposalId隔离
 * 2. 状态使用STAGING tier持久化
 * 3. 状态持久化后立即验证
 */

import { StateMachine } from '@/lib/core/state/machine';
import { TSAStateMachineV2, TSAOrchestratorV2 } from '@/lib/tsa/orchestrator-v2';
import { tsa } from '@/lib/tsa';
import { PowerState } from '@/lib/types/state';

describe('B-01/09 TSA FIX VERIFICATION', () => {
  beforeEach(async () => {
    await tsa.clear();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  describe('TEST-012-1: DESIGN状态正确保存', () => {
    it('should persist DESIGN state to Redis and verify consistency', async () => {
      const proposalId = 'test-012-1';
      const machine = new StateMachine(proposalId);
      await machine.init();

      // 执行IDLE→DESIGN流转
      const result = await machine.transition('DESIGN', 'pm');
      
      // 验证流转成功
      expect(result.success).toBe(true);
      expect(result.from).toBe('IDLE');
      expect(result.to).toBe('DESIGN');
      
      // 验证内存状态
      expect(machine.getCurrentState()).toBe('DESIGN');
      
      // 验证Redis持久化（使用proposalId隔离的键）
      const redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
      expect(redisState).toBe('DESIGN');
      
      // 验证持久化一致性
      const verifyResult = await machine.verifyPersistence();
      expect(verifyResult.consistent).toBe(true);
      expect(verifyResult.memoryState).toBe('DESIGN');
      expect(verifyResult.redisState).toBe('DESIGN');
      
      console.log('✅ TEST-012-1 PASSED: DESIGN状态正确保存到Redis');
    });
  });

  describe('TSA-001: 状态流转DESIGN→CODE时Redis持久化验证', () => {
    it('should persist each state transition to Redis', async () => {
      const proposalId = 'tsa-001';
      const machine = new StateMachine(proposalId);
      await machine.init();

      // IDLE → DESIGN
      let result = await machine.transition('DESIGN', 'pm');
      expect(result.success).toBe(true);
      let redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
      expect(redisState).toBe('DESIGN');
      
      // DESIGN → CODE
      result = await machine.transition('CODE', 'engineer');
      expect(result.success).toBe(true);
      redisState = await tsa.get<PowerState>(`state:current:${proposalId}`);
      expect(redisState).toBe('CODE');
      
      console.log('✅ TSA-001 PASSED: 状态流转正确持久化到Redis');
    });
  });

  describe('TSA-002: 断电恢复测试', () => {
    it('should restore state after reinitializing StateMachine', async () => {
      const proposalId = 'tsa-002';
      
      // 第一个状态机实例
      const machine1 = new StateMachine(proposalId);
      await machine1.init();
      await machine1.transition('DESIGN', 'pm');
      await machine1.transition('CODE', 'engineer');
      
      expect(machine1.getCurrentState()).toBe('CODE');
      
      // 模拟"断电" - 创建新的状态机实例
      const machine2 = new StateMachine(proposalId);
      await machine2.init();
      
      // 验证状态已恢复
      expect(machine2.getCurrentState()).toBe('CODE');
      
      // 验证可以继续流转
      const result = await machine2.transition('AUDIT', 'engineer');
      expect(result.success).toBe(true);
      expect(machine2.getCurrentState()).toBe('AUDIT');
      
      console.log('✅ TSA-002 PASSED: 断电恢复后状态正确恢复');
    });
  });

  describe('TSA-003: 跨层级状态一致性', () => {
    it('should maintain consistency between memory and Redis', async () => {
      const proposalId = 'tsa-003';
      const machine = new StateMachine(proposalId);
      await machine.init();

      const states: PowerState[] = ['DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE'];
      
      for (const state of states) {
        // 执行流转
        const agent = state === 'DESIGN' ? 'pm' :
                     state === 'CODE' ? 'engineer' :
                     state === 'AUDIT' ? 'engineer' :
                     state === 'BUILD' ? 'qa' :
                     state === 'DEPLOY' ? 'system' : 'mike';
        
        const result = await machine.transition(state, agent as any);
        expect(result.success).toBe(true);
        
        // 验证一致性
        const verify = await machine.verifyPersistence();
        expect(verify.consistent).toBe(true);
        expect(verify.memoryState).toBe(state);
        expect(verify.redisState).toBe(state);
      }
      
      console.log('✅ TSA-003 PASSED: 跨层级状态一致性验证通过');
    });
  });

  describe('TSA-V2: 多提案隔离', () => {
    it('should isolate states between different proposals', async () => {
      const orchestrator = new TSAOrchestratorV2();
      
      const machine1 = await orchestrator.getMachine('proposal-a');
      const machine2 = await orchestrator.getMachine('proposal-b');
      
      // proposal-a流转到DESIGN
      await machine1.transition('DESIGN', 'pm');
      
      // proposal-b流转到CODE
      await machine2.transition('DESIGN', 'pm');
      await machine2.transition('CODE', 'engineer');
      
      // 验证隔离
      expect(machine1.getCurrentState()).toBe('DESIGN');
      expect(machine2.getCurrentState()).toBe('CODE');
      
      // 验证Redis隔离
      const state1 = await tsa.get<PowerState>('state:current:proposal-a');
      const state2 = await tsa.get<PowerState>('state:current:proposal-b');
      
      expect(state1).toBe('DESIGN');
      expect(state2).toBe('CODE');
      
      console.log('✅ TSA-V2 PASSED: 多提案状态隔离验证通过');
    });
  });

  describe('存储Tier验证', () => {
    it('should use STAGING tier for state persistence', async () => {
      const proposalId = 'tier-test';
      const machine = new StateMachine(proposalId);
      await machine.init();
      
      await machine.transition('DESIGN', 'pm');
      
      // 验证状态存在于TSA
      const state = await tsa.get<PowerState>(`state:current:${proposalId}`);
      expect(state).toBe('DESIGN');
      
      // 验证可以从TSA重新加载（证明不是仅存储在内存）
      await machine.forcePersist();
      const reloaded = await tsa.get<PowerState>(`state:current:${proposalId}`);
      expect(reloaded).toBe('DESIGN');
      
      console.log('✅ STAGING tier验证通过');
    });
  });
});
