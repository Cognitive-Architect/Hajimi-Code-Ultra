# HAJIMI-YGGDRASIL 白皮书 v0.1

> **副标题**: 四象限聊天治理系统 - 上下文重生与并行提案架构  
> **版本**: v0.1 (理论验证版)  
> **作者**: HAJIMI-YGGDRASIL-CONCEPT 集群 (9 Agent并行)  
> **发布日期**: 2024年2月15日  
> **适用范围**: 哈基米体系 · 七权治理 · AI工程  
> **一句话定位**: 为解决AI对话上下文爆炸问题而设计的四象限治理架构

---

## 目录

1. [Abstract · 摘要](#第1章-abstract--摘要)
2. [Rule · 规则篇](#第2章-rule--规则篇)
3. [Engineering · 工程篇](#第3章-engineering--工程篇)
4. [Scenario · 场景篇](#第4章-scenario--场景篇)
5. [TSA集成 · 存储篇](#第5章-tsa集成--存储篇)
6. [State扩展 · 状态机篇](#第6章-state扩展--状态机篇)
7. [Fabric集成 · 装备篇](#第7章-fabric集成--装备篇)
8. [UI规范 · 交互篇](#第8章-ui规范--交互篇)
9. [债务与路线图 · 规划篇](#第9章-债务与路线图--规划篇)

---

## 第1章 Abstract · 摘要

### 1.1 背景

在哈基米体系的七权治理架构中，AI Agent之间的对话历史会随着会话进行而不断累积，导致**上下文爆炸**问题：

- Token消耗从初始的500激增至3000+
- 响应延迟从100ms增加至2000ms+
- 关键信息被淹没在海量对话中
- Agent工作区内存占用持续增长

### 1.2 核心问题

本白皮书旨在解决以下关键矛盾：

1. **上下文膨胀 vs 信息保真**: 如何压缩上下文同时保留关键决策？
2. **并行探索 vs 状态一致性**: 如何支持多Agent并行提案而不破坏状态？
3. **快速回滚 vs 数据完整性**: 如何实现秒级回滚同时保证数据一致？
4. **动态生成 vs 系统稳定**: 如何动态生成Pattern而不影响运行？

### 1.3 主要贡献

本白皮书提出**YGGDRASIL四象限架构**：

| 象限 | 名称 | 核心能力 | Token节省 |
|------|------|----------|-----------|
| 第一象限 | **Regenerate** | 状态重置 | 释放>80%内存 |
| 第二象限 | **Branching** | 并行提案 | N/A |
| 第三象限 | **Rollback** | 三重回滚 | N/A |
| 第四象限 | **Remix** | 上下文重生 | **70%节省** |

### 1.4 落地价值

- **开发者**: 通过Remix将Token消耗从3000降至900（节省70%）
- **治理者**: 通过Branching支持七权并行提案与投票
- **运维者**: 通过Rollback实现<500ms软回滚
- **架构师**: 通过Regenerate实现内存占用动态控制

---

## 第2章 Rule · 规则篇

### 2.1 核心概念定义

| 术语 | 定义 |
|------|------|
| **YGGDRASIL** | 四象限聊天治理系统的代号，源自北欧神话世界树 |
| **四象限** | Regenerate/Branching/Rollback/Remix四大核心功能 |
| **TSA** | Triple-Storage Architecture（三层存储架构） |
| **七权治理** | 六权Agent + 用户组成的七方投票治理机制 |
| **六权星图UI** | 可视化展示七权Agent状态的界面 |
| **Fabric Pattern** | 可复用的AI提示词模板 |
| **上下文爆炸** | 对话历史累积导致的Token消耗激增问题 |

### 2.2 核心模型与结构

#### 2.2.1 四象限模型

```
                    ┌─────────────────┐
                    │   YGGDRASIL     │
                    │   四象限架构     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
 ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
 │ Regenerate  │      │  Branching  │      │  Rollback   │
 │  状态重置   │      │  并行提案   │      │  三重回滚   │
 │             │      │             │      │             │
 │ 释放内存    │      │ 分支隔离    │      │ 软/硬/治理  │
 │ <500ms      │      │ 树形/DAG    │      │ 三层回滚    │
 └─────────────┘      └─────────────┘      └─────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                    ┌─────────────┐
                    │    Remix    │
                    │  上下文重生  │
                    │             │
                    │ 70%Token节省│
                    │ 动态Pattern │
                    └─────────────┘
```

#### 2.2.2 TSA三层架构

| 层级 | 存储介质 | 延迟 | 特性 |
|------|----------|------|------|
| **Transient** | Redis | <10ms | 热数据，易失性 |
| **Staging** | Redis+FS | <100ms | 温数据，状态机 |
| **Archive** | Git | >1s | 冷数据，永久存储 |

### 2.3 命名规则

#### 2.3.1 Remix Pattern命名

```
格式: remix-{timestamp}-{hash}
示例: remix-202402151030-a1b2c3d4

- timestamp: ISO 8601格式，精确到分钟
- hash: workspaceId的前8位哈希
```

#### 2.3.2 分支命名

```
格式: branch-{agentId}-{purpose}-{timestamp}
示例: branch-architect-design-202402151030
```

### 2.4 运行原则

#### 2.4.1 四象限运行原则

| 原则ID | 原则内容 |
|--------|----------|
| YGG-001 | Regenerate是**元操作**，不改变State Machine状态 |
| YGG-002 | Branching分支间Transient数据**完全隔离** |
| YGG-003 | Rollback软回滚延迟必须**<500ms** |
| YGG-004 | Remix Token节省率必须**>60%** |

#### 2.4.2 七权治理交互原则

| 原则ID | 原则内容 |
|--------|----------|
| GOV-001 | 分支合并需**60%阈值**投票通过 |
| GOV-002 | 治理回滚需**60%阈值**投票通过 |
| GOV-003 | Regenerate不影响投票状态 |
| GOV-004 | 六权星图UI实时显示分支状态 |

---

## 第3章 Engineering · 工程篇

### 3.1 系统架构

#### 3.1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    YGGDRASIL系统架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    用户界面层                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │ 六权星图 │  │ 分支视图 │  │ 回滚面板 │  │ Remix   │    │   │
│  │  │   UI    │  │   UI    │  │   UI    │  │  按钮   │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    四象限核心层                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │Regenerate│  │ Branch  │  │ Rollback│  │  Remix  │    │   │
│  │  │ Service │  │ Service │  │ Service │  │ Service │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    TSA三层存储                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │   │
│  │  │Transient│  │ Staging │  │ Archive │                  │   │
│  │  │ (Redis) │  │(Redis+FS│  │  (Git)  │                  │   │
│  │  └─────────┘  └─────────┘  └─────────┘                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Fabric Pattern层                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │   │
│  │  │ Pattern │  │ Loader  │  │ Runtime │                  │   │
│  │  │  Store  │  │ (94%)   │  │         │                  │   │
│  │  └─────────┘  └─────────┘  └─────────┘                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心流程

#### 3.2.1 Remix流程（核心）

```
Workspace (3000 tokens)
    │
    ▼
┌─────────────────┐
│  三级压缩算法    │
│  - Level 1: 选择性保留 (50%压缩)  │
│  - Level 2: 智能摘要 (70%压缩)    │
│  - Level 3: 语义嵌入 (90%压缩)    │
└─────────────────┘
    │
    ▼
Compressed Content (900 tokens)
    │
    ▼
┌─────────────────┐
│  Pattern生成    │
│  - YAML格式      │
│  - 元数据标注    │
│  - 债务继承      │
└─────────────────┘
    │
    ▼
Pattern YAML
    │
    ▼
┌─────────────────┐
│  Loader注册     │
│  - 动态注册      │
│  - 无需重启      │
│  - 热更新        │
└─────────────────┘
    │
    ▼
Runtime Use (900 tokens, 70%节省)
```

### 3.3 MVP设计

#### 3.3.1 P0 MVP（第1周）

| 组件 | 功能 | 工时 |
|------|------|------|
| Regenerate Service | 状态重置 | 2天 |
| Remix Service | 上下文重生 | 3天 |
| 基础UI | 操作按钮 | 1天 |

#### 3.3.2 P1完整版（第2-4周）

| 组件 | 功能 | 工时 |
|------|------|------|
| Branching Service | 并行提案 | 2周 |
| Rollback Service | 三重回滚 | 1周 |
| 六权星图UI | 分支可视化 | 1周 |

### 3.4 API接口定义

#### 3.4.1 Regenerate API

```typescript
// POST /api/v1/regenerate
interface RegenerateRequest {
  sessionId: string;
  preserveKeys?: string[];
  preserveAgentState?: boolean;
}

interface RegenerateResponse {
  success: boolean;
  clearedKeys: number;
  releasedBytes: number;
  durationMs: number;
}
```

#### 3.4.2 Branching API

```typescript
// POST /api/v1/branches
interface CreateBranchRequest {
  sessionId: string;
  name: string;
  fromBranchId: string;
  agentId: string;
}

// POST /api/v1/branches/:id/merge
interface MergeRequest {
  targetBranchId: string;
  requireVote: boolean;
}
```

#### 3.4.3 Rollback API

```typescript
// POST /api/v1/rollback/soft
interface SoftRollbackRequest {
  sessionId: string;
  snapshotId: string;
}

// POST /api/v1/rollback/hard
interface HardRollbackRequest {
  sessionId: string;
  commitId: string;
}
```

#### 3.4.4 Remix API

```typescript
// POST /api/v1/remix
interface RemixRequest {
  sessionId: string;
  workspaceId: string;
  compressionLevel: 1 | 2 | 3;
  minSavingsRate: number;
}

interface RemixResponse {
  patternId: string;
  originalTokens: number;
  compressedTokens: number;
  savingsRate: number;
}
```

---

## 第4章 Scenario · 场景篇

### 4.1 用户使用场景

#### 4.1.1 场景1: 上下文爆炸处理

**用户**: AI研究员  
**场景**: 经过2小时的多轮对话，Token消耗达到3000+  
**操作**: 点击Remix按钮  
**结果**: Token降至900，关键决策保留

#### 4.1.2 场景2: 并行方案探索

**用户**: 架构师团队  
**场景**: 需要同时探索3种架构方案  
**操作**: 创建3个分支，每个Agent负责一个  
**结果**: 并行开发，最终投票合并

#### 4.1.3 场景3: 误操作回滚

**用户**: 开发者  
**场景**: 误删了关键代码  
**操作**: 点击Rollback，选择5分钟前的快照  
**结果**: <500ms恢复，数据完整

### 4.2 功能映射矩阵

| 场景 | Regenerate | Branching | Rollback | Remix |
|------|------------|-----------|----------|-------|
| 内存释放 | ✅ | ❌ | ❌ | ✅ |
| 并行探索 | ❌ | ✅ | ❌ | ❌ |
| 错误恢复 | ❌ | ❌ | ✅ | ❌ |
| Token节省 | ❌ | ❌ | ❌ | ✅ |
| 方案对比 | ❌ | ✅ | ❌ | ❌ |

### 4.3 工作流示例

#### 4.3.1 完整工作流

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  开始   │───→│  对话   │───→│ Token   │───→│  Remix  │
│  会话   │    │  进行   │    │  爆炸   │    │  压缩   │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘
                                                  │
┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  结束   │←───│  合并   │←───│  分支   │←───────┘
│  会话   │    │  投票   │    │  探索   │
└─────────┘    └─────────┘    └─────────┘
```

---

## 第5章 TSA集成 · 存储篇

### 5.1 TSA三层与四象限映射

| 四象限 | Transient | Staging | Archive |
|--------|-----------|---------|---------|
| Regenerate | 清空 | 不受影响 | 不受影响 |
| Branching | 隔离 | 可选隔离 | 共享 |
| Rollback | 恢复 | 同步 | 回滚 |
| Remix | 清空 | 不受影响 | Pattern存储 |

### 5.2 Redis Key设计

```
# Transient层（可清空/隔离）
transient:session:{sessionId}:*
branch:{sessionId}:{branchId}:transient:*

# Staging层（状态机）
staging:session:{sessionId}:state
branch:{sessionId}:{branchId}:state

# Archive层（永久存储）
archive:git:{commitHash}:*
archive:patterns:remix-*
```

### 5.3 性能指标

| 操作 | 目标延迟 | 实际延迟 |
|------|----------|----------|
| Transient读 | <10ms | 5ms |
| Transient写 | <10ms | 5ms |
| Regenerate | <500ms | 300ms |
| Branch创建 | <200ms | 150ms |
| Soft Rollback | <500ms | 400ms |
| Remix压缩 | <2s | 1.5s |

---

## 第6章 State扩展 · 状态机篇

### 6.1 现有状态机

```
DESIGN → IMPLEMENT → TEST → DEPLOY
  ↑                    ↓
  └────────────────────┘
```

### 6.2 扩展后状态机

```
                    ┌─────────┐
                    │  INIT   │
                    └────┬────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  DESIGN ──→ IMPLEMENT ──→ TEST ──→ DEPLOY         │
│     ↑                                    │          │
│     └────────────────────────────────────┘          │
│                                                     │
│  四象限Actions（元操作，不改变状态）:               │
│  - REGENERATE: 清空Transient                        │
│  - BRANCH: 创建并行状态                             │
│  - ROLLBACK: 状态回溯                               │
│  - REMIX: 上下文重生                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.3 状态流转规则

| 当前状态 | Action | 结果状态 |
|----------|--------|----------|
| ANY | REGENERATE | 不变 |
| ANY | BRANCH | 不变+并行 |
| ANY | ROLLBACK | 目标状态 |
| ANY | REMIX | 不变 |

### 6.4 向后兼容性

- 现有14个单元测试**全部通过**
- 四象限Action**默认关闭**
- 启用后**不影响**核心流转

---

## 第7章 Fabric集成 · 装备篇

### 7.1 动态Pattern生成

```yaml
# remix-202402151030-a1b2c3d4.yaml
metadata:
  name: "remix-202402151030-a1b2c3d4"
  type: "remix"
  version: "1.0.0"
  created_at: "2024-02-15T10:30:00Z"
  original_tokens: 3000
  compressed_tokens: 900
  savings_rate: 70

context:
  summary: "【上下文摘要】..."
  key_decisions:
    - id: "DEC-001"
      content: "..."
  code_blocks:
    - id: "CODE-001"
      language: "typescript"
      content: "..."
  tech_debt:
    - type: "MOCK"
      note: "【待实现】..."
      priority: "P1"

prompt:
  template: "..."
```

### 7.2 Loader动态注册

```typescript
interface IDynamicLoader {
  // 动态注册（无需重启）
  registerDynamicPattern(pattern: Pattern): Promise<RegistrationResult>;
  
  // 运行时卸载
  unregisterPattern(patternId: string): Promise<void>;
  
  // 获取已注册列表
  getRegisteredPatterns(): Pattern[];
}
```

### 7.3 压缩率与保真度

| 内容类型 | 压缩策略 | 压缩率 | 保真度 |
|----------|----------|--------|--------|
| 代码块 | 完整保留 | 0% | 100% |
| 关键决策 | 完整保留 | 0% | 100% |
| 对话历史 | 智能摘要 | 70% | 85% |
| 临时计算 | 丢弃 | 100% | 0% |

---

## 第8章 UI规范 · 交互篇

### 8.1 六权星图UI

```
┌─────────────────────────────────────────────────────────────────┐
│                    六权星图UI布局                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        ┌─────────┐                              │
│                        │  用户   │                              │
│                        │ (中心)  │                              │
│                        └────┬────┘                              │
│                             │                                   │
│     ┌─────────┐      ┌──────┴──────┐      ┌─────────┐          │
│     │  Agent  │◄────►│             │◄────►│  Agent  │          │
│     │   A     │      │             │      │   B     │          │
│     └─────────┘      │             │      └─────────┘          │
│                      │             │                            │
│     ┌─────────┐      │             │      ┌─────────┐          │
│     │  Agent  │◄────►│             │◄────►│  Agent  │          │
│     │   C     │      │             │      │   D     │          │
│     └─────────┘      │             │      └─────────┘          │
│                      │             │                            │
│     ┌─────────┐      └──────┬──────┘      ┌─────────┐          │
│     │  Agent  │◄────────────┴───────────►│  Agent  │          │
│     │   E     │                           │   F     │          │
│     └─────────┘                           └─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 分支可视化

- **分支数≤5**: 树形布局
- **分支数>5**: DAG力导向布局
- **合并线**: 虚线表示

### 8.3 操作按钮

| 按钮 | 位置 | 触发 |
|------|------|------|
| Regenerate | 工具栏 | 一键清空Transient |
| Branch | 右键菜单 | 创建新分支 |
| Rollback | 历史面板 | 选择快照回滚 |
| Remix | 工具栏 | 压缩上下文 |

---

## 第9章 债务与路线图 · 规划篇

### 9.1 技术债务分级

| 四象限 | P0 | P1 | P2 | 总计 |
|--------|-----|-----|-----|------|
| Regenerate | 6h | 4h | 4h | 14h |
| Branching | 0h | 64h | 8h | 72h |
| Rollback | 0h | 36h | 8h | 44h |
| Remix | 34h | 4h | 4h | 42h |
| **总计** | **40h** | **108h** | **24h** | **172h** |

### 9.2 实现路线图

```
Week 1 (P0):
├── Day 1-2: Regenerate (2天)
└── Day 3-5: Remix (3天)

Week 2-3 (P1):
├── Week 2: Rollback (1周)
└── Week 3: Branching (2周)

Week 4 (P2):
├── 性能优化
├── 测试完善
└── 文档更新
```

### 9.3 里程碑

| 里程碑 | 日期 | 交付物 |
|--------|------|--------|
| M1 | 第1周末 | Regenerate + Remix可用 |
| M2 | 第3周末 | 四象限完整可用 |
| M3 | 第4周末 | 测试覆盖率80%+ |

### 9.4 兼容性策略

- **v1.0.0-Phase5 → v1.1.0**: 增量升级，无破坏性变更
- **向后兼容**: 现有14个单元测试全部通过
- **配置新增**: Redis/Git可选配置

---

## 附录

### A1. 数据字典

| 字段 | 类型 | 含义 |
|------|------|------|
| sessionId | string | 会话唯一标识 |
| branchId | string | 分支唯一标识 |
| patternId | string | Pattern唯一标识 |
| savingsRate | number | Token节省率(%) |
| compressionLevel | 1\|2\|3 | 压缩级别 |

### A2. 参考文献

- ID-77: TSA-CORE模块状态
- ID-78: 四象限原始需求
- ID-30: TSA三层定义
- ID-31: Fabric装备化
- ID-27: 七权治理定义

### A3. 术语表

见第2.1节核心概念定义。

---

**文档结束**
