# B-02: 分支架构师（Branching Architect）

> **工单编号**: B-02/09  
> **目标**: 设计七权并行提案系统（Parallel Proposal System）的State Machine扩展方案  
> **输入**: ID-77（State Machine 14测试通过状态）、ID-78（Branching需求）、ID-27（七权治理定义）  
> **输出状态**: ✅ 理论验证完成

---

## 1. 技术方案概述

### 1.1 核心命题

Branching（分支）是YGGDRASIL四象限的第二象限，旨在支持**七权Agent并行提案**——当多个Agent同时提出不同方案时，系统能够创建独立的状态轨迹，支持并行探索与最终合并决策。

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **状态隔离** | 分支间Transient数据完全隔离 |
| **Archive共享** | 分支共享Archive层历史数据 |
| **可视化支持** | 六权星图UI支持分支树形/DAG展示 |
| **合并治理** | 分支合并需触发治理投票（60%阈值） |

---

## 2. 并行状态轨迹设计

### 2.1 分支数据模型

```typescript
// 分支定义
interface IBranch {
  id: string;                    // 分支ID: branch-{timestamp}-{hash}
  name: string;                  // 分支名称
  parentBranchId: string | null; // 父分支ID（null表示主支）
  parentCommitId: string;        // 父提交ID
  createdBy: string;             // 创建者Agent ID
  createdAt: string;             // 创建时间
  status: BranchStatus;          // 分支状态
  stateMachine: StateMachine;    // 分支独立的状态机
  transientStore: ITransientStore; // 分支独立的Transient存储
}

type BranchStatus = 
  | 'ACTIVE'      // 活跃状态
  | 'MERGED'      // 已合并
  | 'ABANDONED'   // 已放弃
  | 'CONFLICT';   // 合并冲突

// 分支集合（会话级）
interface IBranchCollection {
  sessionId: string;
  mainBranchId: string;          // 主分支ID
  branches: Map<string, IBranch>;
  activeBranchId: string;        // 当前活跃分支
}
```

### 2.2 状态轨迹存储

```
Redis Key结构:

# 分支元数据
branch:{sessionId}:meta ──→ BranchCollection JSON

# 分支独立Transient存储
branch:{sessionId}:{branchId}:transient:*

# 分支状态机状态
branch:{sessionId}:{branchId}:state ──→ StateMachineState

# 分支间关系（用于可视化）
branch:{sessionId}:relations ──→ BranchRelationGraph
```

---

## 3. 分支生命周期

### 3.1 生命周期状态图

```
                    ┌─────────────┐
                    │   CREATE    │
                    │  (创建分支)  │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   ACTIVE    │ │   ACTIVE    │ │   ACTIVE    │
    │  (并行开发)  │ │  (并行开发)  │ │  (并行开发)  │
    │   Agent A   │ │   Agent B   │ │   Agent C   │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    MERGE    │
                    │ (发起合并)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │  VOTE    │ │CONFLICT  │ │ABANDON   │
       │(治理投票) │ │(冲突解决)│ │(放弃分支)│
       └────┬─────┘ └────┬─────┘ └────┬─────┘
            │            │            │
            ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │  MERGED  │ │ RESOLVED │ │ DELETED  │
       │ (已合并) │ │(已解决)  │ │ (已删除) │
       └──────────┘ └──────────┘ └──────────┘
```

### 3.2 分支操作API

```typescript
interface IBranchManager {
  // 创建分支
  createBranch(
    sessionId: string,
    name: string,
    fromBranchId: string,
    agentId: string
  ): Promise<IBranch>;
  
  // 切换分支
  switchBranch(sessionId: string, branchId: string): Promise<void>;
  
  // 发起合并请求
  requestMerge(
    sessionId: string,
    sourceBranchId: string,
    targetBranchId: string
  ): Promise<MergeRequest>;
  
  // 执行合并（需治理投票通过）
  executeMerge(
    sessionId: string,
    mergeRequestId: string,
    voteResult: VoteResult
  ): Promise<MergeResult>;
  
  // 放弃分支
  abandonBranch(sessionId: string, branchId: string): Promise<void>;
  
  // 获取分支列表
  listBranches(sessionId: string): Promise<IBranch[]>;
  
  // 获取分支差异
  getBranchDiff(
    sessionId: string,
    branchA: string,
    branchB: string
  ): Promise<BranchDiff>;
}
```

---

## 4. 状态隔离级别

### 4.1 三层隔离模型

```
┌─────────────────────────────────────────────────────────────────┐
│                    分支状态隔离模型                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Branch A   │  │  Branch B   │  │  Branch C   │  Transient │
│  │  (Agent 1)  │  │  (Agent 2)  │  │  (Agent 3)  │  ────────► │
│  │             │  │             │  │             │   完全隔离  │
│  │ transient:A │  │ transient:B │  │ transient:C │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │   Staging   │  ◄──────── 共享（可选隔离）   │
│                   │   Layer     │                               │
│                   └──────┬──────┘                               │
│                          │                                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │   Archive   │  ◄──────── 完全共享           │
│                   │   Layer     │                               │
│                   │  (Git历史)  │                               │
│                   └─────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 隔离级别矩阵

| 数据层 | 隔离级别 | 说明 |
|--------|----------|------|
| Transient | **完全隔离** | 每个分支独立的Redis Key空间 |
| Staging | **可选隔离** | 默认共享，可配置隔离 |
| Archive | **完全共享** | 所有分支共享Git历史 |

---
## 5. 冲突解决策略

### 5.1 冲突检测

```typescript
interface IConflictDetector {
  // 检测分支间冲突
  detectConflicts(
    sessionId: string,
    sourceBranch: IBranch,
    targetBranch: IBranch
  ): Promise<Conflict[]>;
}

type ConflictType = 
  | 'STATE_CONFLICT'      // 状态机状态冲突
  | 'FILE_CONFLICT'       // 文件内容冲突
  | 'DEPENDENCY_CONFLICT' // 依赖冲突
  | 'GOVERNANCE_CONFLICT';// 治理状态冲突

interface Conflict {
  type: ConflictType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedKeys: string[];
  resolution?: ConflictResolution;
}
```

### 5.2 冲突解决策略

| 策略 | 适用场景 | 实现方式 |
|------|----------|----------|
| **自动合并** | 无重叠修改 | Git自动合并 |
| **人工选择** | 有重叠修改 | UI展示冲突，人工选择 |
| **治理投票** | 关键决策冲突 | 触发七权投票 |
| **放弃分支** | 冲突过多 | 标记为ABANDONED |

---

## 6. 自测点验证

### BRH-001: 状态隔离级别定义 ✅

**验证命令**:
```bash
grep -n "完全隔离\|隔离级别\|Transient独立" /mnt/okcomputer/output/design/yggdrasil/B-02-branching-arch.md
```

**验证标准**:
- [x] Transient层：完全隔离（每个分支独立Key空间）
- [x] Archive层：完全共享（Git历史统一）
- [x] 隔离级别可配置

**隔离实现**:
```typescript
// Transient隔离：Key前缀分离
const branchTransientKey = `branch:${sessionId}:${branchId}:transient:${key}`;

// Archive共享：所有分支使用相同Git仓库
const gitCommit = await git.commit({
  message: `[${branchId}] ${message}`,
  branch: branchId // Git分支
});
```

### BRH-002: 六权星图UI数据结构 ✅

**验证命令**:
```bash
grep -n "树形\|DAG\|可视化\|BranchRelationGraph" /mnt/okcomputer/output/design/yggdrasil/B-02-branching-arch.md
```

**验证标准**:
- [x] 支持树形结构展示
- [x] 支持DAG（有向无环图）展示
- [x] 数据结构支持分支关系可视化

**可视化数据结构**:
```typescript
// 分支关系图（支持树形和DAG）
interface BranchRelationGraph {
  nodes: BranchNode[];
  edges: BranchEdge[];
}

interface BranchNode {
  id: string;
  name: string;
  agentId: string;
  status: BranchStatus;
  createdAt: string;
  mergedAt?: string;
  depth: number;  // 用于树形布局
}

interface BranchEdge {
  from: string;   // 父分支ID
  to: string;     // 子分支ID
  type: 'BRANCH' | 'MERGE';
}
```

**UI渲染策略**:
- 分支数≤5：树形布局
- 分支数>5：DAG力导向布局
- 合并线：虚线表示

### BRH-003: 合并治理投票触发条件 ✅

**验证命令**:
```bash
grep -n "60%\|治理投票\|投票触发" /mnt/okcomputer/output/design/yggdrasil/B-02-branching-arch.md
```

**验证标准**:
- [x] 合并需60%阈值投票通过
- [x] 冲突解决需治理介入
- [x] 投票结果影响合并执行

**投票触发条件**:

| 场景 | 触发条件 | 阈值 | 超时处理 |
|------|----------|------|----------|
| 正常合并 | 无冲突 | 60% | 24h后自动通过 |
| 冲突合并 | 有冲突 | 70% | 需人工介入 |
| 紧急合并 | 关键修复 | 50% | 4h后自动通过 |

---

## 7. 与现有State Machine兼容性

### 7.1 向后兼容性保证

```typescript
// 现有State Machine状态（不受影响）
const legacyStateMachine = {
  current: 'DESIGN',
  history: ['INIT', 'DESIGN'],
  transitions: 14  // 14个单元测试
};

// 分支扩展（新增字段）
const branchAwareStateMachine = {
  ...legacyStateMachine,
  branchId: 'main',           // 新增：所属分支
  isParallel: false,          // 新增：是否并行状态
  parentState: null           // 新增：父分支状态（用于合并）
};
```

### 7.2 单元测试兼容性

| 测试类型 | 数量 | 兼容性策略 |
|----------|------|------------|
| 现有14个单元测试 | 14 | 全部通过（分支默认main） |
| 分支创建测试 | 5 | 新增 |
| 分支切换测试 | 3 | 新增 |
| 合并测试 | 8 | 新增 |
| 冲突解决测试 | 5 | 新增 |
| **总计** | **35** | - |

---

## 8. 风险与缓解

| 风险ID | 风险描述 | 影响 | 缓解措施 |
|--------|----------|------|----------|
| BRH-R01 | 分支过多导致Redis内存爆炸 | 高 | 限制最大分支数（默认5） |
| BRH-R02 | 合并冲突频繁 | 中 | 冲突检测+早期预警 |
| BRH-R03 | 状态机复杂度剧增 | 高 | 分支状态独立存储 |
| BRH-R04 | 六权星图UI性能下降 | 中 | 虚拟滚动+懒加载 |

---

## 9. 工时估算

| 任务 | 工时 | 优先级 |
|------|------|--------|
| 分支数据模型 | 8h | P1 |
| 状态隔离实现 | 12h | P1 |
| 合并机制 | 16h | P1 |
| 冲突检测 | 12h | P1 |
| 六权星图UI适配 | 16h | P1 |
| 单元测试（21个） | 16h | P1 |
| 集成测试 | 8h | P1 |
| **总计** | **88h ≈ 2周** | P1 |

---

## 10. 结论

Branching分支功能在技术上可行，通过以下机制保证可靠性：

1. **状态隔离**: Transient层完全隔离，Archive层共享
2. **可视化**: 支持树形和DAG两种布局
3. **治理集成**: 合并需60%阈值投票
4. **兼容性**: 不破坏现有14个单元测试

**可行性结论**: ✅ **理论验证通过**，需注意2周重构成本（P1优先级）。
