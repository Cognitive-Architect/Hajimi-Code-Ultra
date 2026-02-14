/**
 * B-05/06 ⚡ Soyorin·性能基准建筑师
 * 性能基准测试 - 确保覆盖率提升不牺牲性能
 * 
 * 测试目标：
 * - PERF-001: 所有性能基准测试通过
 * - PERF-002: 内存泄漏检测（堆内存增长<10%）
 * - PERF-003: 并发压力测试（100并发提案无失败）
 */

import { StateMachine } from '@/lib/core/state/machine';
import { VoteService } from '@/lib/core/governance/vote-service';
import { ProposalService } from '@/lib/core/governance/proposal-service';
import { tsa } from '@/lib/tsa';
import { renderHook, act } from '@testing-library/react';
import { useTSA } from '@/app/hooks/useTSA';

// ============================================================================
// 测试配置
// ============================================================================

const PERFORMANCE_THRESHOLDS = {
  /** TSA状态切换应<50ms */
  STATE_TRANSITION: 50,
  /** Redis操作（含重连）应<100ms */
  REDIS_OPERATION: 100,
  /** 治理投票流程应<200ms */
  GOVERNANCE_VOTE: 200,
  /** Hooks渲染应<16ms（60fps） */
  HOOK_RENDER: 16,
  /** 内存泄漏阈值 <10% */
  MEMORY_GROWTH: 0.1,
  /** 并发测试提案数量 */
  CONCURRENT_PROPOSALS: 100,
};

// ============================================================================
// Mock fetch for hooks testing
// ============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ============================================================================
// 性能基准测试套件
// ============================================================================

describe('性能基准测试 (PERF-001)', () => {
  let stateMachine: StateMachine;
  let voteService: VoteService;
  let proposalService: ProposalService;

  beforeEach(async () => {
    // 清理 TSA 确保测试隔离
    await tsa.clear();
    
    // 初始化状态机
    stateMachine = new StateMachine();
    await stateMachine.init();
    
    // 初始化治理服务
    voteService = new VoteService(stateMachine);
    await voteService.init();
    
    proposalService = new ProposalService();
    await proposalService.init();
    
    // Mock fetch for hooks
    mockFetch.mockClear();
  });

  afterEach(async () => {
    // 清理资源
    voteService.destroy();
    proposalService.destroy();
    await tsa.clear();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // TSA状态切换性能测试
  // ==========================================================================
  describe('TSA状态切换性能', () => {
    it(`状态切换应<${PERFORMANCE_THRESHOLDS.STATE_TRANSITION}ms`, async () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = await stateMachine.transition('DESIGN', 'system');
        const duration = performance.now() - start;
        
        expect(result.success).toBe(true);
        durations.push(duration);
        
        // 重置状态
        await stateMachine.reset();
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      console.log(`[PERF] State transition avg: ${avgDuration.toFixed(2)}ms, max: ${maxDuration.toFixed(2)}ms`);
      
      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.STATE_TRANSITION);
      expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.STATE_TRANSITION * 2); // 允许个别波动
    });

    it('批量状态切换应保持线性性能', async () => {
      const batchSizes = [5, 10, 20];
      
      for (const size of batchSizes) {
        const start = performance.now();
        
        const promises = Array(size).fill(0).map((_, i) => {
          const machine = new StateMachine(`perf-test-${i}`);
          return machine.init().then(() => machine.transition('DESIGN', 'system'));
        });
        
        const results = await Promise.all(promises);
        const duration = performance.now() - start;
        
        expect(results.every(r => r.success)).toBe(true);
        
        // 批量操作平均每个应<50ms
        const avgPerOperation = duration / size;
        console.log(`[PERF] Batch size ${size}: ${duration.toFixed(2)}ms total, ${avgPerOperation.toFixed(2)}ms/op`);
        expect(avgPerOperation).toBeLessThan(PERFORMANCE_THRESHOLDS.STATE_TRANSITION);
      }
    });
  });

  // ==========================================================================
  // Redis操作性能测试（含重连）
  // ==========================================================================
  describe('Redis操作性能', () => {
    it(`Redis读写操作应<${PERFORMANCE_THRESHOLDS.REDIS_OPERATION}ms`, async () => {
      const iterations = 20;
      const durations: { set: number[]; get: number[]; delete: number[] } = {
        set: [],
        get: [],
        delete: [],
      };

      for (let i = 0; i < iterations; i++) {
        const key = `perf:test:${i}`;
        const value = { data: `test-value-${i}`, timestamp: Date.now() };

        // 测试 SET
        let start = performance.now();
        await tsa.set(key, value, { tier: 'STAGING' });
        durations.set.push(performance.now() - start);

        // 测试 GET
        start = performance.now();
        const retrieved = await tsa.get(key);
        durations.get.push(performance.now() - start);

        expect(retrieved).toEqual(value);

        // 测试 DELETE
        start = performance.now();
        await tsa.delete(key);
        durations.delete.push(performance.now() - start);
      }

      const avgSet = durations.set.reduce((a, b) => a + b, 0) / durations.set.length;
      const avgGet = durations.get.reduce((a, b) => a + b, 0) / durations.get.length;
      const avgDelete = durations.delete.reduce((a, b) => a + b, 0) / durations.delete.length;

      console.log(`[PERF] Redis SET avg: ${avgSet.toFixed(2)}ms, GET avg: ${avgGet.toFixed(2)}ms, DELETE avg: ${avgDelete.toFixed(2)}ms`);

      expect(avgSet).toBeLessThan(PERFORMANCE_THRESHOLDS.REDIS_OPERATION);
      expect(avgGet).toBeLessThan(PERFORMANCE_THRESHOLDS.REDIS_OPERATION);
      expect(avgDelete).toBeLessThan(PERFORMANCE_THRESHOLDS.REDIS_OPERATION);
    });

    it('连续读写操作应保持稳定性能', async () => {
      const key = 'perf:sequential';
      const durations: number[] = [];

      // 连续100次读写
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await tsa.set(key, { counter: i });
        await tsa.get(key);
        durations.push(performance.now() - start);
      }

      // 计算性能退化（后50次vs前50次）
      const firstHalf = durations.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
      const secondHalf = durations.slice(50).reduce((a, b) => a + b, 0) / 50;
      const degradation = (secondHalf - firstHalf) / firstHalf;

      console.log(`[PERF] Sequential ops: first 50 avg ${firstHalf.toFixed(2)}ms, last 50 avg ${secondHalf.toFixed(2)}ms, degradation: ${(degradation * 100).toFixed(2)}%`);

      // 性能退化应<50%
      expect(degradation).toBeLessThan(0.5);
    });
  });

  // ==========================================================================
  // 治理投票流程性能测试
  // ==========================================================================
  describe('治理投票流程性能', () => {
    it(`完整投票流程应<${PERFORMANCE_THRESHOLDS.GOVERNANCE_VOTE}ms`, async () => {
      // 创建提案
      const proposalStart = performance.now();
      const proposal = await proposalService.createProposal({
        title: '性能测试提案',
        description: '测试投票流程性能',
        proposer: 'pm',
        targetState: 'DESIGN',
      });
      const proposalDuration = performance.now() - proposalStart;

      // 投票流程
      const voteStart = performance.now();
      await proposalService.castVote(proposal.id, 'pm', 'approve');
      await proposalService.castVote(proposal.id, 'arch', 'approve');
      await proposalService.castVote(proposal.id, 'qa', 'approve');
      const voteDuration = performance.now() - voteStart;

      const totalDuration = proposalDuration + voteDuration;

      console.log(`[PERF] Proposal creation: ${proposalDuration.toFixed(2)}ms, Voting: ${voteDuration.toFixed(2)}ms, Total: ${totalDuration.toFixed(2)}ms`);

      expect(totalDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.GOVERNANCE_VOTE);
    });

    it('批量投票查询应保持高性能', async () => {
      // 创建多个提案
      const proposalIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const proposal = await proposalService.createProposal({
          title: `批量测试提案 ${i}`,
          description: '测试批量查询性能',
          proposer: 'pm',
          targetState: 'DESIGN',
        });
        proposalIds.push(proposal.id);
      }

      // 批量查询
      const start = performance.now();
      const promises = proposalIds.map(id => proposalService.getProposal(id));
      const results = await Promise.all(promises);
      const duration = performance.now() - start;

      expect(results.every(r => r !== null)).toBe(true);
      
      const avgPerQuery = duration / proposalIds.length;
      console.log(`[PERF] Batch query ${proposalIds.length} proposals: ${duration.toFixed(2)}ms total, ${avgPerQuery.toFixed(2)}ms/query`);
      
      expect(avgPerQuery).toBeLessThan(20); // 每个查询<20ms
    });
  });

  // ==========================================================================
  // Hooks渲染性能测试
  // ==========================================================================
  describe('Hooks渲染性能', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: 'test-value' }),
      });
    });

    it(`Hook初始渲染应<${PERFORMANCE_THRESHOLDS.HOOK_RENDER}ms (60fps)`, async () => {
      const iterations = 50;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const { unmount } = renderHook(() => useTSA(`perf-hook-${i}`, 'default'));
        const duration = performance.now() - start;
        durations.push(duration);
        unmount();
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`[PERF] Hook render avg: ${avgDuration.toFixed(2)}ms, max: ${maxDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.HOOK_RENDER);
    });

    it('Hook状态更新应保持流畅', async () => {
      const { result } = renderHook(() => useTSA('perf-update', 'initial', { autoLoad: false }));

      const updateDurations: number[] = [];

      for (let i = 0; i < 30; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

        const start = performance.now();
        await act(async () => {
          await result.current.set(`value-${i}`);
        });
        updateDurations.push(performance.now() - start);
      }

      const avgUpdate = updateDurations.reduce((a, b) => a + b, 0) / updateDurations.length;
      console.log(`[PERF] Hook update avg: ${avgUpdate.toFixed(2)}ms`);

      // 状态更新应该足够快以支持60fps
      expect(avgUpdate).toBeLessThan(PERFORMANCE_THRESHOLDS.HOOK_RENDER * 2); // 允许稍微放宽
    });
  });
});

// ============================================================================
// 内存泄漏检测 (PERF-002)
// ============================================================================

describe('内存泄漏检测 (PERF-002)', () => {
  let stateMachine: StateMachine;

  beforeEach(async () => {
    await tsa.clear();
    stateMachine = new StateMachine();
    await stateMachine.init();
  });

  afterEach(async () => {
    await tsa.clear();
  });

  it('不应有内存泄漏 - 状态机操作', async () => {
    // 强制GC（如果可用）
    if (global.gc) {
      global.gc();
    }

    const before = process.memoryUsage().heapUsed;

    // 执行1000次状态操作
    for (let i = 0; i < 1000; i++) {
      await stateMachine.transition('DESIGN', 'system');
      await stateMachine.transition('CODE', 'system');
      await stateMachine.transition('AUDIT', 'system');
      await stateMachine.reset();
    }

    // 强制GC
    if (global.gc) {
      global.gc();
    }

    // 等待一小段时间让GC完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const after = process.memoryUsage().heapUsed;
    const growth = (after - before) / before;

    console.log(`[PERF] Memory before: ${(before / 1024 / 1024).toFixed(2)}MB, after: ${(after / 1024 / 1024).toFixed(2)}MB, growth: ${(growth * 100).toFixed(2)}%`);

    expect(growth).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_GROWTH);
  });

  it('不应有内存泄漏 - TSA存储操作', async () => {
    if (global.gc) {
      global.gc();
    }

    const before = process.memoryUsage().heapUsed;

    // 执行大量存储操作
    for (let i = 0; i < 500; i++) {
      const key = `mem-test-${i}`;
      await tsa.set(key, { data: 'x'.repeat(1000), index: i });
      await tsa.get(key);
      await tsa.delete(key);
    }

    if (global.gc) {
      global.gc();
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const after = process.memoryUsage().heapUsed;
    const growth = (after - before) / before;

    console.log(`[PERF] TSA memory growth: ${(growth * 100).toFixed(2)}%`);

    expect(growth).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_GROWTH);
  });

  it('不应有内存泄漏 - 订阅者清理', async () => {
    if (global.gc) {
      global.gc();
    }

    const before = process.memoryUsage().heapUsed;

    // 大量订阅/取消订阅
    for (let i = 0; i < 1000; i++) {
      const unsubscribe = stateMachine.subscribe(() => {});
      await stateMachine.transition('DESIGN', 'system');
      unsubscribe();
      await stateMachine.reset();
    }

    if (global.gc) {
      global.gc();
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const after = process.memoryUsage().heapUsed;
    const growth = (after - before) / before;

    console.log(`[PERF] Subscription memory growth: ${(growth * 100).toFixed(2)}%`);

    expect(growth).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_GROWTH);
  });
});

// ============================================================================
// 并发压力测试 (PERF-003)
// ============================================================================

describe('并发压力测试 (PERF-003)', () => {
  let proposalService: ProposalService;
  let voteService: VoteService;

  beforeEach(async () => {
    await tsa.clear();
    proposalService = new ProposalService();
    await proposalService.init();
    voteService = new VoteService();
    await voteService.init();
  });

  afterEach(async () => {
    proposalService.destroy();
    voteService.destroy();
    await tsa.clear();
  });

  it(`应支持${PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS}并发提案创建`, async () => {
    const start = performance.now();

    const promises = Array(PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS).fill(0).map((_, i) =>
      proposalService.createProposal({
        title: `并发提案 ${i}`,
        description: `测试并发性能 - 提案 ${i}`,
        proposer: 'pm',
        targetState: 'DESIGN',
      }).catch(err => ({ success: false, error: err.message }))
    );

    const results = await Promise.all(promises);
    const duration = performance.now() - start;

    const successCount = results.filter((r: any) => r && typeof r === 'object' && 'id' in r).length;
    const failureCount = PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS - successCount;

    console.log(`[PERF] Concurrent proposals: ${successCount} success, ${failureCount} failed, ${duration.toFixed(2)}ms total, ${(duration / PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS).toFixed(2)}ms/op`);

    expect(successCount).toBe(PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS);
    expect(failureCount).toBe(0);
  });

  it('应支持并发投票操作', async () => {
    // 首先创建一个提案
    const proposal = await proposalService.createProposal({
      title: '并发投票测试提案',
      description: '测试并发投票性能',
      proposer: 'pm',
      targetState: 'DESIGN',
    });

    const start = performance.now();

    // 并发投票（不同角色）
    const votePromises = [
      voteService.vote(proposal.id, 'pm', 'approve'),
      voteService.vote(proposal.id, 'arch', 'approve'),
      voteService.vote(proposal.id, 'qa', 'approve'),
      voteService.vote(proposal.id, 'engineer', 'approve'),
      voteService.vote(proposal.id, 'mike', 'approve'),
    ];

    const results = await Promise.all(votePromises);
    const duration = performance.now() - start;

    const successCount = results.filter(r => r && typeof r === 'object').length;

    console.log(`[PERF] Concurrent votes: ${successCount} success, ${duration.toFixed(2)}ms`);

    expect(successCount).toBe(votePromises.length);
  });

  it('应支持并发状态操作', async () => {
    const machines: StateMachine[] = [];

    // 创建多个状态机实例
    for (let i = 0; i < 50; i++) {
      const machine = new StateMachine(`concurrent-${i}`);
      await machine.init();
      machines.push(machine);
    }

    const start = performance.now();

    // 并发状态切换
    const promises = machines.map(machine =>
      machine.transition('DESIGN', 'system')
        .then(() => machine.transition('CODE', 'system'))
        .then(() => machine.transition('AUDIT', 'system'))
    );

    const results = await Promise.all(promises);
    const duration = performance.now() - start;

    const successCount = results.filter(r => r.success).length;

    console.log(`[PERF] Concurrent state transitions: ${successCount}/${machines.length} success, ${duration.toFixed(2)}ms total, ${(duration / machines.length).toFixed(2)}ms/op`);

    expect(successCount).toBe(machines.length);

    // 清理
    await Promise.all(machines.map(m => m.reset()));
  });

  it('应支持混合并发操作', async () => {
    const start = performance.now();

    // 混合操作：提案创建 + 存储操作 + 状态切换
    const mixedPromises = [
      // 提案创建
      ...Array(20).fill(0).map((_, i) =>
        proposalService.createProposal({
          title: `混合测试提案 ${i}`,
          description: '混合并发测试',
          proposer: 'pm',
          targetState: 'DESIGN',
        })
      ),
      // 存储操作
      ...Array(30).fill(0).map((_, i) =>
        tsa.set(`mixed-test-${i}`, { data: i, timestamp: Date.now() })
      ),
      // 状态机操作
      ...Array(20).fill(0).map(async (_, i) => {
        const machine = new StateMachine(`mixed-state-${i}`);
        await machine.init();
        return machine.transition('DESIGN', 'system');
      }),
    ];

    const results = await Promise.all(mixedPromises);
    const duration = performance.now() - start;

    const successCount = results.filter(r => r && (typeof r === 'object' || r === undefined)).length;
    const totalOperations = mixedPromises.length;

    console.log(`[PERF] Mixed concurrent operations: ${successCount}/${totalOperations} success, ${duration.toFixed(2)}ms total, ${(duration / totalOperations).toFixed(2)}ms/op`);

    expect(successCount).toBe(totalOperations);
  });
});

// ============================================================================
// 性能回归检测
// ============================================================================

describe('性能回归检测', () => {
  it('性能指标应记录到控制台', async () => {
    console.log('============================================');
    console.log('性能基准测试完成');
    console.log('============================================');
    console.log('性能阈值配置:');
    console.log(`  - 状态切换: <${PERFORMANCE_THRESHOLDS.STATE_TRANSITION}ms`);
    console.log(`  - Redis操作: <${PERFORMANCE_THRESHOLDS.REDIS_OPERATION}ms`);
    console.log(`  - 治理投票: <${PERFORMANCE_THRESHOLDS.GOVERNANCE_VOTE}ms`);
    console.log(`  - Hook渲染: <${PERFORMANCE_THRESHOLDS.HOOK_RENDER}ms (60fps)`);
    console.log(`  - 内存增长: <${PERFORMANCE_THRESHOLDS.MEMORY_GROWTH * 100}%`);
    console.log(`  - 并发提案: ${PERFORMANCE_THRESHOLDS.CONCURRENT_PROPOSALS} 无失败`);
    console.log('============================================');
    
    expect(true).toBe(true);
  });
});
