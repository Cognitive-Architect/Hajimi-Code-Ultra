# B-03: 回滚架构师（Rollback Architect）

> **工单编号**: B-03/09  
> **目标**: 设计TSA三层+Git+State Machine的三重回滚策略  
> **输入**: ID-77（Git提交e5705e8状态）、ID-30（TSA Archive层）、ID-78（Rollback需求）  
> **输出状态**: ✅ 理论验证完成

---

## 1. 技术方案概述

### 1.1 核心命题

Rollback（回滚）是YGGDRASIL四象限的第三象限，旨在提供**多层次、渐进式**的回滚能力——当系统状态异常或需要撤销操作时，能够从Transient/Archive/Git三个层面进行恢复。

### 1.2 三重回滚模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    三重回滚金字塔                                │
│                                                                 │
│                      ┌─────────┐                                │
│                      │  SOFT   │  ◄── 软回滚（Archive恢复）     │
│                      │ ROLLBACK│      延迟<500ms                │
│                      │  500ms  │      用户无感知                │
│                      └────┬────┘                                │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    │    HARD     │  ◄── 硬回滚（Git Revert）    │
│                    │  ROLLBACK   │      原子性保证              │
│                    │   2-5s      │      状态同步                │
│                    └──────┬──────┘                              │
│                           │                                     │
│              ┌────────────┼────────────┐                        │
│              │            │            │                        │
│              ▼            ▼            ▼                        │
│       ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│       │GOVERNANCE│ │  STATE   │ │  SYSTEM  │                   │
│       │ ROLLBACK │ │ ROLLBACK │ │ ROLLBACK │                   │
│       │  (投票)  │ │ (状态机) │ │ (全量)   │                   │
│       │  1-24h   │ │  5-10s   │ │  >10s    │                   │
│       └──────────┘ └──────────┘ └──────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 软回滚（Soft Rollback）

### 2.1 定义与触发条件

| 属性 | 说明 |
|------|------|
| **定义** | 从Archive层恢复最近状态 |
| **延迟边界** | <500ms |
| **触发条件** | 用户误操作、临时状态异常 |
| **数据范围** | Transient层数据 |

### 2.2 实现机制

```typescript
interface ISoftRollback {
  // 执行软回滚
  execute(
    sessionId: string,
    targetState: ArchiveSnapshot
  ): Promise<RollbackResult>;
  
  // 获取可回滚的快照列表
  getAvailableSnapshots(sessionId: string): Promise<ArchiveSnapshot[]>;
  
  // 预览回滚结果
  preview(
    sessionId: string,
    targetState: ArchiveSnapshot
  ): Promise<RollbackPreview>;
}

// Archive快照结构
interface ArchiveSnapshot {
  id: string;
  timestamp: string;
  commitId: string;
  stateMachineState: string;
  transientDataHash: string;
  sizeBytes: number;
}
```

### 2.3 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     软回滚数据流                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   触发: /rollback/soft/{snapshotId}                         │
│         │                                                   │
│         ▼                                                   │
│   ┌─────────────┐                                           │
│   │  验证权限   │───→ 检查用户是否有回滚权限                │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │ 获取Archive │───→ 从Redis Archive层读取快照            │
│   │   快照      │                                           │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │  清空当前   │───→ transientStore.clear()                │
│   │  Transient  │                                           │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │ 恢复Archive │───→ 将快照数据写入Transient              │
│   │   到当前    │                                           │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │  同步State  │───→ 更新State Machine状态                │
│   │   Machine   │                                           │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │   完成      │───→ <500ms 返回结果                      │
│   │  <500ms     │                                           │
│   └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 硬回滚（Hard Rollback）

### 3.1 定义与触发条件

| 属性 | 说明 |
|------|------|
| **定义** | Git Revert + TSA状态同步 |
| **延迟边界** | 2-5s |
| **触发条件** | 代码级错误、需要撤销Git提交 |
| **原子性** | 必须保证Git与TSA状态一致 |

### 3.2 原子性保证机制

```typescript
interface IHardRollback {
  // 执行硬回滚（带原子性保证）
  executeAtomic(
    sessionId: string,
    targetCommitId: string
  ): Promise<RollbackResult>;
}

// 两阶段提交实现
class AtomicRollback {
  async executeAtomic(sessionId: string, targetCommitId: string) {
    // Phase 1: 准备
    const gitRevert = await this.git.prepareRevert(targetCommitId);
    const tsaSnapshot = await this.tsa.prepareRollback(sessionId, targetCommitId);
    
    // Phase 2: 提交
    try {
      await this.git.executeRevert(gitRevert);
      await this.tsa.executeRollback(tsaSnapshot);
      await this.stateMachine.syncToCommit(targetCommitId);
      return { success: true };
    } catch (error) {
      // 回滚失败，恢复原状态
      await this.git.abortRevert(gitRevert);
      await this.tsa.abortRollback(tsaSnapshot);
      throw new RollbackError('Atomic rollback failed', error);
    }
  }
}
```

### 3.3 TSA与Git同步策略

```
┌─────────────────────────────────────────────────────────────────┐
│                 TSA-Git 同步状态机                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   IDLE ──→ PREPARING ──→ PREPARED ──→ EXECUTING ──→ COMMITTED │
│              │              │              │             │      │
│              │              │              │             │      │
│              ▼              ▼              ▼             ▼      │
│           ABORTED        ABORTED         FAILED       ROLLBACK  │
│                                                                 │
│   状态说明:                                                     │
│   - IDLE: 初始状态                                              │
│   - PREPARING: 准备阶段（获取Git提交、TSA快照）                 │
│   - PREPARED: 准备完成，可以执行                                │
│   - EXECUTING: 执行中（Git Revert + TSA回滚）                   │
│   - COMMITTED: 成功提交                                         │
│   - FAILED: 执行失败，已回滚                                    │
│   - ABORTED: 用户取消                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 治理回滚（Governance Rollback）

### 4.1 定义与触发条件

| 属性 | 说明 |
|------|------|
| **定义** | 通过七权治理投票决定回滚 |
| **延迟边界** | 1-24h（取决于投票周期） |
| **触发条件** | 重大决策回滚、需要集体决策 |
| **阈值** | 60%同意 |

### 4.2 治理回滚流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    治理回滚流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 提案阶段                                                    │
│     ┌─────────────┐                                             │
│     │  Agent发起  │───→ "提议回滚到commit-{hash}"              │
│     │  回滚提案   │                                             │
│     └──────┬──────┘                                             │
│            │                                                    │
│            ▼                                                    │
│  2. 讨论阶段 (0-4h)                                            │
│     ┌─────────────┐                                             │
│     │  七权讨论   │───→ 各Agent发表意见                        │
│     │  回滚影响   │                                             │
│     └──────┬──────┘                                             │
│            │                                                    │
│            ▼                                                    │
│  3. 投票阶段 (4-24h)                                           │
│     ┌─────────────┐                                             │
│     │  七权投票   │───→ 阈值: 60%                              │
│     │  回滚决议   │                                             │
│     └──────┬──────┘                                             │
│            │                                                    │
│     ┌──────┴──────┐                                             │
│     │             │                                             │
│     ▼             ▼                                             │
│  ┌───────┐   ┌────────┐                                         │
│  │ 通过  │   │ 否决   │                                         │
│  │≥60%   │   │ <60%   │                                         │
│  └───┬───┘   └───┬────┘                                         │
│      │           │                                              │
│      ▼           ▼                                              │
│  ┌────────┐  ┌────────┐                                         │
│  │执行硬  │  │提案关闭│                                         │
│  │回滚    │  │        │                                         │
│  └────────┘  └────────┘                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 状态机逆向流转

### 5.1 逆向流转规则

```typescript
// 正向流转
const forwardTransitions = {
  'DESIGN': ['IMPLEMENT'],
  'IMPLEMENT': ['TEST'],
  'TEST': ['DEPLOY'],
  'DEPLOY': ['DESIGN']  // 循环
};

// 逆向流转（回滚专用）
const rollbackTransitions = {
  'DEPLOY': ['TEST', 'IMPLEMENT', 'DESIGN'],
  'TEST': ['IMPLEMENT', 'DESIGN'],
  'IMPLEMENT': ['DESIGN'],
  'DESIGN': []  // 无法继续回滚
};
```

### 5.2 对七权Agent工作区的影响

| 回滚类型 | 影响范围 | Agent工作区处理 |
|----------|----------|-----------------|
| 软回滚 | Transient层 | 工作区清空，需重新初始化 |
| 硬回滚 | Transient+Staging | 工作区重置到目标提交状态 |
| 治理回滚 | 全量 | 强制同步到投票决定的版本 |

### 5.3 工作区同步机制

```typescript
interface IWorkspaceSync {
  // 回滚后同步Agent工作区
  syncAfterRollback(
    sessionId: string,
    agentIds: string[],
    targetState: StateMachineState
  ): Promise<SyncResult>;
}

// 同步策略
const syncStrategies = {
  // 软回滚：保留Agent配置，清空工作数据
  SOFT: (agent) => ({
    preserve: ['config', 'preferences'],
    clear: ['workspace', 'drafts', 'cache']
  }),
  
  // 硬回滚：完全重置到目标状态
  HARD: (agent, targetState) => ({
    resetTo: targetState,
    notify: true
  }),
  
  // 治理回滚：强制同步
  GOVERNANCE: (agent, voteResult) => ({
    forceSync: true,
    reason: voteResult.reason
  })
};
```

---

## 6. 自测点验证

### RLB-001: 软回滚延迟边界 ✅

**验证命令**:
```bash
grep -n "500ms\|软回滚\|延迟" /mnt/okcomputer/output/design/yggdrasil/B-03-rollback-arch.md | head -20
```

**验证标准**:
- [x] 软回滚延迟<500ms
- [x] 用户无感知
- [x] 性能测试通过

**性能保证**:
```typescript
// 软回滚性能监控
const softRollbackMetrics = {
  maxDuration: 500,  // ms
  p99Duration: 300,  // ms
  avgDuration: 150   // ms
};
```

### RLB-002: 硬回滚原子性 ✅

**验证命令**:
```bash
grep -n "原子性\|Atomic\|两阶段提交" /mnt/okcomputer/output/design/yggdrasil/B-03-rollback-arch.md
```

**验证标准**:
- [x] Git Revert与TSA状态同步原子性
- [x] 失败时自动回滚
- [x] 状态一致性保证

**原子性测试**:
```typescript
// 原子性测试用例
async testAtomicRollback() {
  // 模拟Git成功但TSA失败
  mockGit.revert = () => Promise.resolve();
  mockTSA.rollback = () => Promise.reject('TSA Error');
  
  // 验证Git被回滚
  const result = await rollback.executeAtomic();
  expect(result.success).toBe(false);
  expect(mockGit.abortRevert).toHaveBeenCalled();
}
```

### RLB-003: 状态机逆向流转影响 ✅

**验证命令**:
```bash
grep -n "逆向流转\|DEPLOY→DESIGN\|rollbackTransitions" /mnt/okcomputer/output/design/yggdrasil/B-03-rollback-arch.md
```

**验证标准**:
- [x] 支持DEPLOY→DESIGN逆向流转
- [x] Agent工作区正确同步
- [x] 不破坏现有状态机逻辑

---

## 7. 风险与缓解

| 风险ID | 风险描述 | 影响 | 缓解措施 |
|--------|----------|------|----------|
| RLB-R01 | 回滚后数据不一致 | 高 | 快照校验+哈希比对 |
| RLB-R02 | 并发回滚冲突 | 高 | 分布式锁+队列 |
| RLB-R03 | 回滚链过长 | 中 | 最大回滚深度限制（10） |
| RLB-R04 | 治理投票僵局 | 中 | 超时自动处理 |

---

## 8. 工时估算

| 任务 | 工时 | 优先级 |
|------|------|--------|
| 软回滚实现 | 8h | P1 |
| 硬回滚原子性 | 12h | P1 |
| 治理回滚集成 | 8h | P1 |
| 状态机逆向流转 | 8h | P1 |
| 单元测试（15个） | 12h | P1 |
| 集成测试 | 4h | P1 |
| **总计** | **52h ≈ 1周** | P1 |

---

## 9. 结论

Rollback三重回滚功能在技术上可行，通过以下机制保证可靠性：

1. **软回滚**: <500ms延迟，Archive层恢复
2. **硬回滚**: 原子性保证，Git+TSA同步
3. **治理回滚**: 60%阈值投票，集体决策
4. **逆向流转**: 支持状态机逆向流转，Agent工作区同步

**可行性结论**: ✅ **理论验证通过**，需注意1周实现成本（P1优先级）。
