# TSA-FIX-001: TSA状态机跨步骤状态丢失修复

## 问题描述

**症状**：33个集成测试失败，状态流转后读取返回`IDLE`而非`DESIGN`

**根本原因**：

1. **状态键命名问题**：`lib/core/state/machine.ts`中使用固定的全局状态键`state:current`
   - 多个提案共享同一个状态键
   - 后一个提案的状态会覆盖前一个提案的状态
   - 导致状态读取时返回错误的状态值

2. **存储层配置不当**：当前状态使用`TRANSIENT` tier存储
   - TRANSIENT表示瞬态数据，生命周期短
   - 不适用于需要持久化的状态数据

3. **缺少proposalId隔离**：StateMachine类没有proposalId概念
   - 无法区分不同提案的状态
   - 所有提案共享同一个状态机实例

## 根因分析

### 代码路径分析

```
lib/core/state/machine.ts:
  const STATE_KEY = 'state:current';  // 全局固定键
  
  async transition(to, agent, context) {
    // ... 状态流转逻辑 ...
    this.currentState = to;            // 更新内存状态
    await this.persistState();         // 持久化到TSA
  }
  
  private async persistState() {
    await tsa.set(STATE_KEY, this.currentState, { tier: 'TRANSIENT' });  // 使用TRANSIENT tier
  }
```

**问题1**: `STATE_KEY`是全局常量，所有提案共用
**问题2**: `TRANSIENT` tier数据生命周期短，不适合持久化状态
**问题3**: StateMachine是单例模式，无法支持多提案隔离

### 影响范围

- 所有涉及状态流转的集成测试
- 多提案并发场景
- 断电恢复场景（Redis重启后状态丢失）

## 修复方案

### 方案1: 修改StateMachine支持proposalId（推荐）

```typescript
// 修改状态键命名
private getStateKey(proposalId: string): string {
  return `state:current:${proposalId}`;
}

// 修改tier为STAGING或ARCHIVE
await tsa.set(stateKey, this.currentState, { tier: 'STAGING' });
```

### 方案2: 创建StatefulProposalOrchestrator

创建一个新的Orchestrator，整合状态机和proposal生命周期：
- 每个proposal有独立的状态机实例
- 状态自动持久化到Redis
- 支持状态变更监听

## 修复实施

### 文件修改

1. **lib/core/state/machine.ts**:
   - 添加`proposalId`参数支持
   - 修改状态键命名规则
   - 调整存储tier为STAGING

2. **lib/tsa/orchestrator-v2.ts** (新增):
   - 整合修复后的状态流转逻辑
   - 添加状态持久化验证
   - 支持多提案并发

## 自测验证

### TSA-001: 状态流转DESIGN→CODE时Redis持久化验证
```typescript
// 验证状态正确写入Redis
const state = await tsa.get(`state:current:${proposalId}`);
expect(state).toBe('DESIGN');
```

### TSA-002: 断电恢复测试
```typescript
// 模拟断电后重启
await tsa.destroy();
await tsa.init();
const restoredState = await tsa.get(`state:current:${proposalId}`);
expect(restoredState).toBe('DESIGN');  // 状态不丢失
```

### TSA-003: 跨层级状态一致性
```typescript
// 验证Memory、Redis、File三层状态一致
const memoryState = machine.getCurrentState();
const redisState = await tsa.get(`state:current:${proposalId}`);
expect(memoryState).toBe(redisState);
```

## 通过标准

- [x] TEST-012-1测试通过（DESIGN状态正确保存）
- [x] Redis中能看到状态数据（key: `state:current:${proposalId}`）
- [x] 33个集成测试全部通过
- [x] 断电恢复测试通过

## 后续优化

1. 考虑使用Redis事务保证状态原子性
2. 添加状态版本号支持乐观锁
3. 实现状态变更审计日志
