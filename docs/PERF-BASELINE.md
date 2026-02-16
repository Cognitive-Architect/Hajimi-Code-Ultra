# 性能基准报告 (PERF-BASELINE)

> **Soyorin·性能基准建筑师** | B-05/06 任务产出  
> 创建时间: 2026-02-14  
> 版本: v1.0

---

## 📊 执行摘要

本性能基准测试确保 Hajimi Code Ultra 在覆盖率提升过程中不牺牲性能。所有核心模块（TSA状态机、Redis存储、治理投票、React Hooks）均通过严格的性能测试。

### 关键指标概览

| 指标 | 阈值 | 状态 |
|------|------|------|
| TSA状态切换 | <50ms | ✅ PASS |
| Redis操作（含重连） | <100ms | ✅ PASS |
| 治理投票流程 | <200ms | ✅ PASS |
| Hooks渲染（60fps） | <16ms | ✅ PASS |
| 内存泄漏 | <10%增长 | ✅ PASS |
| 并发提案（100并发） | 100%成功 | ✅ PASS |

---

## 🎯 性能基准详解

### PERF-001: 核心性能基准

#### 1. TSA状态切换性能

**测试目标**: 确保状态机转换在可接受时间内完成

**测试方法**:
```typescript
// 单次状态切换测试
const start = performance.now();
await stateMachine.transition('DESIGN', 'system');
const duration = performance.now() - start;
expect(duration).toBeLessThan(50);

// 批量并发测试
const promises = Array(size).fill(0).map((_, i) => {
  const machine = new StateMachine(`perf-test-${i}`);
  return machine.init().then(() => machine.transition('DESIGN', 'system'));
});
```

**基准值**:
- 单次切换: < 50ms
- 批量平均: < 50ms/op
- 允许波动: 2x阈值（个别情况）

**实现优化点**:
- 使用 `STAGING` tier 持久化状态（非 `TRANSIENT`）
- 持久化验证异步进行，不阻塞流程
- 支持 proposalId 隔离，避免锁竞争

---

#### 2. Redis操作性能

**测试目标**: 确保存储层操作快速响应

**测试方法**:
```typescript
// SET/GET/DELETE 测试
await tsa.set(key, value, { tier: 'STAGING' });
await tsa.get(key);
await tsa.delete(key);

// 连续读写稳定性测试
for (let i = 0; i < 100; i++) {
  await tsa.set(key, { counter: i });
  await tsa.get(key);
}
```

**基准值**:
- 写入操作: < 100ms
- 读取操作: < 100ms
- 删除操作: < 100ms
- 性能退化: < 50%（连续100次操作）

**实现优化点**:
- UpstashRedisClient 内置重试机制（指数退避）
- 三层降级韧性：Redis → IndexedDB → Memory
- 自动故障检测与恢复

---

#### 3. 治理投票流程性能

**测试目标**: 确保治理操作不成为系统瓶颈

**测试方法**:
```typescript
// 完整投票流程
const proposal = await proposalService.createProposal({...});
await proposalService.castVote(proposal.id, 'pm', 'approve');
await proposalService.castVote(proposal.id, 'arch', 'approve');
await proposalService.castVote(proposal.id, 'qa', 'approve');
```

**基准值**:
- 提案创建 + 投票流程: < 200ms
- 批量查询: < 20ms/查询

**实现优化点**:
- 提案数据使用 `STAGING` tier 存储
- 内存缓存 + 持久化双写
- 批量操作支持 Promise.all 并发

---

#### 4. Hooks渲染性能

**测试目标**: 确保 React Hooks 渲染保持 60fps

**测试方法**:
```typescript
// 初始渲染测试
const start = performance.now();
const { unmount } = renderHook(() => useTSA(`perf-hook-${i}`, 'default'));
const duration = performance.now() - start;

// 状态更新测试
await act(async () => {
  await result.current.set(`value-${i}`);
});
```

**基准值**:
- 初始渲染: < 16ms (60fps)
- 状态更新: < 32ms (允许2倍放宽)

**实现优化点**:
- `useCallback` 缓存回调函数
- `useRef` 跟踪挂载状态，避免内存泄漏
- `AbortController` 清理未完成请求
- 支持 `autoLoad: false` 延迟加载

---

### PERF-002: 内存泄漏检测

**测试目标**: 确保长时间运行无内存泄漏

**测试方法**:
```typescript
const before = process.memoryUsage().heapUsed;

// 执行大量操作
for (let i = 0; i < 1000; i++) {
  await stateMachine.transition('DESIGN', 'system');
  await stateMachine.reset();
}

if (global.gc) global.gc();
await new Promise(resolve => setTimeout(resolve, 100));

const after = process.memoryUsage().heapUsed;
const growth = (after - before) / before;
expect(growth).toBeLessThan(0.1); // <10%
```

**基准值**:
- 内存增长: < 10%
- 测试规模: 1000次操作

**内存管理优化点**:
- StateMachine: 订阅者自动清理
- TSA: `stores` Map 自动清理过期项
- Hooks: `useEffect` 清理函数释放资源
- ProposalService: `destroy()` 方法清理定时器

---

### PERF-003: 并发压力测试

**测试目标**: 确保高并发场景下系统稳定

**测试方法**:
```typescript
// 100并发提案创建
const promises = Array(100).fill(0).map((_, i) =>
  proposalService.createProposal({
    title: `并发提案 ${i}`,
    description: `测试并发性能`,
    proposer: 'pm',
    targetState: 'DESIGN',
  })
);

const results = await Promise.all(promises);
expect(results.every(r => r && 'id' in r)).toBe(true);
```

**基准值**:
- 并发提案: 100个无失败
- 并发投票: 5角色同时投票
- 混合操作: 70个并发操作

**并发优化点**:
- 无锁设计：proposalId 隔离避免竞争
- 幂等操作：重复状态切换直接返回成功
- 异步持久化：不阻塞主流程

---

## 🔧 性能测试配置

### 阈值配置

```typescript
const PERFORMANCE_THRESHOLDS = {
  STATE_TRANSITION: 50,      // ms
  REDIS_OPERATION: 100,      // ms
  GOVERNANCE_VOTE: 200,      // ms
  HOOK_RENDER: 16,           // ms (60fps)
  MEMORY_GROWTH: 0.1,        // 10%
  CONCURRENT_PROPOSALS: 100, // 数量
};
```

### 运行测试

```bash
# 运行所有性能测试
npm test -- tests/performance/benchmark.test.ts

# 运行特定性能测试
npm test -- --testNamePattern="TSA状态切换性能"
npm test -- --testNamePattern="内存泄漏检测"
npm test -- --testNamePattern="并发压力测试"

# 带GC标志运行内存测试
node --expose-gc node_modules/.bin/jest tests/performance/benchmark.test.ts
```

---

## 📈 性能监控

### TSA监控指标

通过 `tsa.getMetrics()` 获取实时性能数据：

```typescript
const metrics = tsa.getMetrics();
// {
//   tierStats: { transient: {...}, staging: {...}, archive: {...} },
//   totalReads: number,
//   totalWrites: number,
//   averageReadLatency: number,
//   averageWriteLatency: number,
//   hitRate: number,
// }
```

### 持续集成

建议在 CI/CD 流程中集成性能测试：

```yaml
# .github/workflows/performance.yml
- name: Performance Benchmark
  run: |
    npm test -- tests/performance/benchmark.test.ts --reporters=default --reporters=jest-junit
  env:
    REDIS_URL: ${{ secrets.REDIS_URL }}
```

---

## 🚨 性能退化处理

### 检测

1. 定期运行性能测试
2. 监控生产环境指标
3. 对比历史基准数据

### 响应

1. **立即**: 标记相关代码，阻止合并
2. **短期**: 分析性能瓶颈，优化热点代码
3. **长期**: 调整架构设计，考虑缓存策略

---

## 📝 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-02-14 | 初始版本，建立完整性能基准 |

---

## ✅ 自测点验证

- [x] **PERF-001**: 所有性能基准测试通过
- [x] **PERF-002**: 内存泄漏检测（堆内存增长<10%）
- [x] **PERF-003**: 并发压力测试（100并发提案无失败）

---

> **注意**: 本性能基准基于测试环境数据，生产环境性能可能因硬件、网络等因素有所不同。建议定期更新基准数据。
