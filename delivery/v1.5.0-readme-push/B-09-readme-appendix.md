# HAJIMI v1.5.0 README 白皮书 - 附录 A2-A3

> **文档编号**: HAJIMI-v1.5.0-README-白皮书  
> **版本**: v1.0  
> **日期**: 2026-02-17  
> **工单**: B-09/09 Appendix扩展规则与索引

---

## 目录

- [5. 附录](#5-附录)
  - [A2. 扩展规则](#a2-扩展规则)
    - [A2.1 债务分级标准](#a21-债务分级标准)
    - [A2.2 添加新 Adapter 规范](#a22-添加新-adapter-规范)
  - [A3. 记忆索引](#a3-记忆索引)
    - [A3.1 内部记忆索引（ID 引用）](#a31-内部记忆索引id-引用)
    - [A3.2 外部技术参考](#a32-外部技术参考)

---

## 5. 附录

### A2. 扩展规则

#### A2.1 债务分级标准

本项目的债务分级采用三级分类体系，用于指导开发优先级和资源分配：

| 级别 | 定义 | 时限 | 示例 |
|:---:|:---|:---|:---|
| **P0** | 阻塞级 | 当前版本 | 编译错误、运行时崩溃、安全漏洞 |
| **P1** | 高优 | 下一版本 | 覆盖率缺口、性能瓶颈、API 兼容性破坏 |
| **P2** | 中优 | 待定 | 体验优化、代码重构、文档完善 |

##### 分级细则

**P0 - 阻塞级（Critical）**

| 特征 | 处理要求 |
|:---|:---|
| 阻碍主流程执行 | 必须立即修复，阻塞发布 |
| 导致数据丢失或损坏 | 24 小时内必须响应 |
| 存在安全漏洞 | 热修复（hotfix）通道 |

**P1 - 高优（High Priority）**

| 特征 | 处理要求 |
|:---|:---|
| 影响核心功能可用性 | 下一迭代周期必须解决 |
| 技术债务累积风险 | 版本发布前必须清理 |
| 外部依赖即将过期 | 制定迁移计划 |

**P2 - 中优（Medium Priority）**

| 特征 | 处理要求 |
|:---|:---|
| 非阻塞性体验问题 | 排入后续迭代 |
| 代码质量改进 | 与技术需求并行处理 |
| 文档和注释完善 | 持续改进 |

---

#### A2.2 添加新 Adapter 规范

本项目采用 Quintant（五边形）Adapter 模式，所有 Adapter 必须遵循以下 5 步流程进行添加：

##### 流程概览

```
┌─────────────────────────────────────────────────────────────┐
│                    添加新 Adapter 流程                        │
├─────┬───────────────────────────────────────────────────────┤
│ 1   │ 实现 QuintantAdapter 接口                              │
├─────┼───────────────────────────────────────────────────────┤
│ 2   │ 在 factory.ts 注册 case 分支                           │
├─────┼───────────────────────────────────────────────────────┤
│ 3   │ 添加单元测试                                            │
├─────┼───────────────────────────────────────────────────────┤
│ 4   │ 更新类型定义                                            │
├─────┼───────────────────────────────────────────────────────┤
│ 5   │ 债务声明（如有）                                        │
└─────┴───────────────────────────────────────────────────────┘
```

##### 步骤详解

**Step 1: 实现 QuintantAdapter 接口**

```typescript
// lib/adapters/new-adapter.ts
import { QuintantAdapter, AdapterContext, AdapterResult } from './types';

export class NewAdapter implements QuintantAdapter {
  readonly name = 'new-adapter';
  readonly version = '1.0.0';
  
  async execute(context: AdapterContext): Promise<AdapterResult> {
    // 实现适配器逻辑
    return {
      success: true,
      data: /* 处理结果 */
    };
  }
  
  async validate(config: unknown): Promise<boolean> {
    // 配置验证逻辑
    return true;
  }
}
```

**Step 2: 在 factory.ts 注册 case 分支**

```typescript
// lib/adapters/factory.ts
import { NewAdapter } from './new-adapter';

export function createAdapter(type: string): QuintantAdapter {
  switch (type) {
    // ... 现有分支
    case 'new-adapter':
      return new NewAdapter();
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}
```

**Step 3: 添加单元测试**

```typescript
// tests/unit/adapters/new-adapter.test.ts
import { NewAdapter } from '@/lib/adapters/new-adapter';

describe('NewAdapter', () => {
  let adapter: NewAdapter;
  
  beforeEach(() => {
    adapter = new NewAdapter();
  });
  
  it('should implement QuintantAdapter interface', () => {
    expect(adapter.name).toBe('new-adapter');
    expect(adapter.execute).toBeDefined();
    expect(adapter.validate).toBeDefined();
  });
  
  // 添加具体业务测试用例
});
```

**Step 4: 更新类型定义**

```typescript
// lib/adapters/types.ts
export type AdapterType = 
  | 'existing-adapter-1'
  | 'existing-adapter-2'
  | 'new-adapter';  // <-- 添加新类型

// 如有必要，扩展配置类型
export interface AdapterConfigMap {
  'new-adapter': NewAdapterConfig;
}
```

**Step 5: 债务声明（如有）**

在实现过程中如发现技术债务，必须在以下位置进行声明：

```typescript
// TODO(DEBT-XXX): [P1/P2] 债务描述
// - 影响范围: 
// - 预计解决版本: 
// - 临时规避方案:
```

如需创建正式债务条目，更新 `docs/technical-debt.md`：

```markdown
## DEBT-XXX: 新 Adapter 相关债务

| 属性 | 值 |
|:---|:---|
| **ID** | DEBT-XXX |
| **级别** | P1/P2 |
| **关联组件** | new-adapter |
| **创建时间** | YYYY-MM-DD |
| **预计解决** | vX.Y.Z |
| **描述** | ... |
```

---

### A3. 记忆索引

#### A3.1 内部记忆索引（ID 引用）

以下为项目关键记忆节点的 ID 索引，用于快速定位和引用：

| ID | 主题 | 引用次数 | 关键摘要 |
|:---:|:---|:---:|:---|
| **ID-56** | 43 次容错饱和攻击模板 | 43 | 容错机制极限测试标准模板，定义饱和攻击下的系统行为预期 |
| **ID-59** | 饱和攻击战术手册 | 12 | 系统性容错测试方法论，包含 5 阶段攻击模式 |
| **ID-80** | LCR Luxury 架构 | 28 | 本地上下文运行时豪华版架构设计，四级 Workspace 体系 |
| **ID-83** | TypeScript 严格模式 | 35 | 类型系统严格化实践指南，零错误编译标准 |
| **ID-97** | 第一性原理（无失败原则） | 47 | 核心设计哲学：任何失败都是设计缺陷，非用户错误 |
| **ID-100** | v1.5.0 工程态势图 | 31 | 版本全局工程状态可视化，组件依赖与交付路线图 |

##### ID 引用规范

```markdown
<!-- 标准引用格式 -->
参见 [ID-97: 第一性原理](#id-97) 关于失败处理的设计原则。

<!-- 文档内交叉引用 -->
> 💡 **记忆唤醒**: ID-56 定义的饱和攻击模板为本测试提供基准。
```

##### 高频引用 TOP3

| 排名 | ID | 主题 | 引用场景 |
|:---:|:---:|:---|:---|
| 1 | ID-97 | 第一性原理 | 错误处理设计、容错策略制定 |
| 2 | ID-56 | 容错饱和攻击模板 | 压力测试、韧性验证 |
| 3 | ID-83 | TypeScript 严格模式 | 类型设计、代码审查 |

---

#### A3.2 外部技术参考

本项目的架构和技术决策参考了以下外部技术文献和开源项目：

| 参考项 | 类型 | 应用领域 | 相关组件 |
|:---|:---:|:---|:---|
| **MemGPT 论文** | 学术论文 | 分层记忆管理 | LCR-Luxury, Tiered Memory |
| **CRDT 算法** | 学术论文 | 跨端同步 | Cross-Device Sync |
| **Yjs 库** | 开源项目 | CRDT 实现 | Workspace v2.0 |

##### 参考文献详情

**MemGPT 论文**

```
标题: MemGPT: Towards LLMs as Operating Systems
作者: Charles Packer et al.
发表: 2023
arXiv: 2310.08560
核心概念: 分层记忆架构（主存/外存/上下文窗口管理）
```

**CRDT 算法**

```
全称: Conflict-free Replicated Data Types
提出者: Marc Shapiro et al.
发表: 2011 (INRIA Research Report)
核心概念: 无冲突复制数据类型，实现最终一致性
关键特性: 交换律、结合律、幂等性
```

**Yjs 库**

```
项目: https://github.com/yjs/yjs
许可证: MIT
核心功能: CRDT 的 JavaScript/TypeScript 实现
应用场景: 协同编辑、状态同步
```

##### 技术影响矩阵

| 外部技术 | 本项目应用 | 适配程度 |
|:---|:---|:---:|
| MemGPT 分层记忆 | 四级 Workspace 架构 | 部分实现 |
| CRDT 理论 | 跨设备状态同步 | 设计采纳 |
| Yjs 实现 | 协同编辑基础设施 | 计划集成 |

---

## 附录：自测点验证

### [README-025] 债务分级表验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| 时限完整性 | 包含"当前版本/下一版本/待定" | 文档审查 | ✅ |
| P0 定义 | 阻塞级 + 当前版本 | 文档审查 | ✅ |
| P1 定义 | 高优 + 下一版本 | 文档审查 | ✅ |
| P2 定义 | 中优 + 待定 | 文档审查 | ✅ |

**验证详情**
```
位置: A2.1 债务分级标准表
时限列值: 当前版本 / 下一版本 / 待定
状态: ✅ 通过
```

### [README-026] 添加新 Adapter 流程验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| 步骤数量 | 5 步完整流程 | 文档审查 | ✅ |
| Step 1 | 实现 QuintantAdapter 接口 | 文档审查 | ✅ |
| Step 2 | factory.ts 注册 case 分支 | 文档审查 | ✅ |
| Step 3 | 添加单元测试 | 文档审查 | ✅ |
| Step 4 | 更新类型定义 | 文档审查 | ✅ |
| Step 5 | 债务声明 | 文档审查 | ✅ |
| 代码示例 | 各步骤含代码示例 | 文档审查 | ✅ |

**验证详情**
```
位置: A2.2 添加新 Adapter 规范
步骤数: 5
代码示例: TypeScript 完整示例
状态: ✅ 通过
```

### [README-027] 参考文献验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| ID-97 存在 | 内部记忆索引含 ID-97 | 文档审查 | ✅ |
| ID-97 主题 | 第一性原理（无失败原则） | 文档审查 | ✅ |
| MemGPT 论文 | 外部参考含 MemGPT 论文 | 文档审查 | ✅ |
| MemGPT 类型 | 标记为学术论文 | 文档审查 | ✅ |

**验证详情**
```
ID-97 位置: A3.1 内部记忆索引
ID-97 主题: 第一性原理（无失败原则）
ID-97 引用次数: 47

MemGPT 位置: A3.2 外部技术参考
MemGPT 类型: 学术论文
MemGPT 应用领域: 分层记忆管理

状态: ✅ 通过
```

---

## 文档信息

| 属性 | 值 |
|:---|:---|
| **文档编号** | HAJIMI-v1.5.0-README-B-09 |
| **版本** | v1.0 |
| **日期** | 2026-02-17 |
| **作者** | Appendix 工作组 |
| **状态** | 已交付 |

---

*本文档作为 HAJIMI v1.5.0 README 白皮书化的第 5 章附录（A2-A3），遵循白皮书格式规范编写。*
