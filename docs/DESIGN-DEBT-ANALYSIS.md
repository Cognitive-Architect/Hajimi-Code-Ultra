# Hajimi Code Ultra - 设计债务分析与技术路线图

> 🐍 Ouroboros Project - 债务清零计划 v1.0
> 
> 生成时间: 2026-02-14

---

## 📊 技术债务全景图

### 债务矩阵 (债务象限)

```
                    高影响
                       │
         ┌─────────────┼─────────────┐
         │   P0-核心   │   P1-高优    │
         │  阻塞编译   │  影响交付    │
  紧急   │             │              │   重要
         │ • TSA编译错误│ • 覆盖率缺口 │
         │ • 类型冲突  │ • UI组件缺失 │
         │ • 重复导出  │ • API未对接  │
         ├─────────────┼─────────────┤
         │   P3-延后   │   P2-中优    │
         │  可延后    │  体验优化    │
         │             │              │
         │ • 文档完善  │ • 动画优化   │
         │ • 日志清理  │ • 主题扩展   │
         │ • 性能调优  │ • 响应式适配 │
         └─────────────┼─────────────┘
                       │
                    低影响
```

---

## 🔴 P0-核心债务 (阻塞级)

### DEBT-001: TSA模块编译错误

| 属性 | 详情 |
|------|------|
| **严重程度** | 🔴 致命 - 阻断 `next build` |
| **影响范围** | `lib/tsa/**/*.ts` |
| **错误类型** | 重复导出、类型冲突 |

**具体问题**:
```typescript
// lib/tsa/persistence/IndexedDBStore.ts:424
export { DataPriority };  // ❌ 重复导出

// lib/tsa/resilience/repair.ts:465  
export { BackupManager };  // ❌ 重复导出

// lib/tsa/resilience/index.ts
export type { RepairConfig };  // ❌ 类型导出语法错误 (isolatedModules)
```

**修复方案**:
1. 统一从单一入口导出
2. 修复 `export type` 语法
3. 移除重复声明

**工时估算**: 2-4小时
**负责人**: Engineer/压力怪

---

### DEBT-002: 路径别名冲突

| 属性 | 详情 |
|------|------|
| **严重程度** | 🟠 高 - 影响代码组织 |
| **影响范围** | `tsconfig.json` paths |

**问题**:
- 原代码使用 `@/lib/a2a/types` 等别名
- 新UI组件使用 `@/lib/ui/types`
- 路径解析不一致

**修复方案**:
统一路径别名配置:
```json
{
  "paths": {
    "@/*": ["./*"],
    "@ui/*": ["./lib/ui/*"],
    "@core/*": ["./lib/core/*"],
    "@tsa/*": ["./lib/tsa/*"]
  }
}
```

**工时估算**: 1-2小时

---

## 🟠 P1-高优债务 (影响交付)

### DEBT-003: 测试覆盖率缺口 (51.67% → 目标70%)

| 属性 | 详情 |
|------|------|
| **当前覆盖率** | 51.67% |
| **目标覆盖率** | 70% (Phase 1) |
| **差距** | 18.33% |

**详细缺口分析**:

| 模块 | 行覆盖 | 分支覆盖 | 函数覆盖 | 缺口文件数 |
|------|--------|----------|----------|------------|
| Core (API/State) | 87% | 70% | 90% | 3 |
| TSA Index | 66.5% | 57.69% | 27.27% | 2 |
| TSA Lifecycle | 87% | 69% | 91% | 4 |
| TSA Resilience | 75% | 52% | 70% | 3 |
| **TSA Persistence** | **~35%** | **~26%** | **~45%** | **5** ⚠️ |
| React Hooks | **0%** | **0%** | **0%** | **5** 🚨 |

**关键未覆盖文件**:

```
P0 最高优先级 (6文件):
- lib/api/auth.ts (92.7% → 需补10行)
- lib/api/error-handler.ts (100%行覆盖, 71%分支)
- lib/core/state/machine.ts (84.53%)
- lib/core/state/rules.ts (82.14%)
- lib/tsa/index.ts (66.5%) 🚨
- lib/tsa/orchestrator-v2.ts (68.46%)

P1 高优先级 (7文件):
- lib/tsa/lifecycle/*.ts (74-94%)
- lib/tsa/resilience/*.ts (61-84%)

P2 中优先级 (5文件):
- lib/tsa/persistence/*.ts (2.88-73%) 🚨 IndexedDBStore仅2.88%

P3 低优先级 (21文件):
- app/hooks/*.ts (0%) 🚨 完全未测试
- patterns/*.ts (0-95%)
```

**修复方案**:
1. **IndexedDB Mock 修复** - 最紧急
2. **React Hooks 测试** - 使用 `@testing-library/react`
3. **补齐边界条件测试**

**工时估算**: 16-24小时
**负责人**: QA/咕咕嘎嘎

---

### DEBT-004: UI组件缺失 (3/6未实现)

| 组件 | 状态 | 优先级 | 依赖 |
|------|------|--------|------|
| AgentChatDialog | ✅ 已实现 | - | 独立 |
| A2AMessageFeed | ✅ 已实现 | - | 独立 |
| StateIndicator | ✅ 已实现 | - | 独立 |
| **ProposalPanel** | ⚠️ 未实现 | P1 | 需治理API |
| **DemoController** | ⚠️ 未实现 | P2 | 需player |
| **DemoPanel** | ⚠️ 未实现 | P2 | 需scenario |

**ProposalPanel 需求**:
- 提案列表展示
- 投票按钮 (支持/反对/弃权)
- 投票进度条
- 创建提案表单 (PM角色)

**Demo组件需求**:
- 场景播放器控制
- 播放/暂停/速度控制
- 步骤跳转
- 消息流展示

**工时估算**: 8-12小时
**负责人**: Engineer/奶龙娘

---

### DEBT-005: API对接未完成 (Mock数据)

| 模块 | 当前状态 | 目标 | 依赖 |
|------|----------|------|------|
| A2A消息服务 | Mock | 对接 `app/api/v1/a2a/*` | TSA修复 |
| 治理提案 | Mock | 对接 `app/api/v1/governance/*` | 后端稳定 |
| 状态流转 | Mock | 对接 `app/api/v1/state/*` | State Machine |
| Agent聊天 | Mock | 对接 OpenRouter/本地模型 | 模型配置 |

**数据流设计**:
```
Frontend (Next.js)
    │
    ├─→ /api/v1/a2a/* (A2A消息)
    ├─→ /api/v1/governance/* (治理)
    ├─→ /api/v1/state/* (状态机)
    └─→ /api/v1/tsa/* (存储)
            │
            └─→ TSA Core
                ├─→ Redis (热)
                ├─→ IndexedDB (温)
                └─→ File System (冷)
```

**工时估算**: 6-10小时
**负责人**: Arch/压力怪

---

## 🟡 P2-中优债务 (体验优化)

### DEBT-006: UI/UX 完善

| 项目 | 状态 | 说明 |
|------|------|------|
| 移动端适配 | ⚠️ 基础 | 需完善响应式 |
| 暗黑模式 | ✅ 已实现 | 已使用 slate-900 |
| 动画流畅度 | ⚠️ 部分 | 需优化60fps |
| 无障碍支持 | ❌ 未开始 | a11y |
| 国际化 | ❌ 未开始 | i18n |

**响应式断点建议**:
```css
/* Mobile First */
sm: 640px   /* 手机横屏 */
md: 768px   /* 平板 */
lg: 1024px  /* 笔记本 */
xl: 1280px  /* 桌面 */
```

**工时估算**: 4-6小时

---

### DEBT-007: 主题系统扩展

**Phase 5 人格化 UI 完整规范**:

| 角色 | 主题色 | 头像 | 状态 |
|------|--------|------|------|
| 🟣 客服小祥 (PM) | #884499 | 👑 | ✅ 已实现 |
| 🔵 压力怪 (Arch) | #7777AA | 🏗️ | ✅ 已实现 |
| 🟢 咕咕嘎嘎 (QA) | #66BB66 | 🔍 | ✅ 已实现 |
| 🟡 奶龙娘 (Engineer) | #FFDD88 | 💻 | ✅ 已实现 |
| 🔴 Mike | #EE6677 | 📦 | ✅ 已实现 |
| 🩷 Soyorin | #FF99CC | 📝 | ✅ 已实现 |

**待实现**:
- 头像悬浮球 (48px 呼吸动画)
- 角色切换过渡动画
- 主题切换器 (深色/浅色)

**工时估算**: 3-4小时

---

## 🟢 P3-低优债务 (可延后)

### DEBT-008: 文档完善

| 文档 | 状态 | 优先级 |
|------|------|--------|
| API文档 (Swagger) | ❌ 缺失 | P3 |
| 架构决策记录 (ADR) | ⚠️ 零散 | P3 |
| 部署指南 | ⚠️ 基础 | P3 |
| 贡献指南 | ❌ 缺失 | P3 |

### DEBT-009: 性能优化

| 项目 | 当前 | 目标 |
|------|------|------|
| 首屏加载 | - | 需基准测试 |
| 组件懒加载 | ❌ | 实现 React.lazy |
| 虚拟列表 | ❌ | 消息列表优化 |
| Bundle大小 | - | 需分析 |

### DEBT-010: 监控与日志

- 前端错误监控 (Sentry)
- 性能监控 (Web Vitals)
- 用户行为分析

---

## 🛣️ 技术路线图

### Phase 0: 紧急修复 (1-2天)

**目标**: 解除阻塞，让 `next build` 通过

- [ ] DEBT-001: 修复TSA编译错误
- [ ] DEBT-002: 统一路径别名

**验收标准**:
```bash
npm run build  # 零错误
npm run type-check  # 零类型错误
```

---

### Phase 1: 基础补全 (1周)

**目标**: MVP可用，覆盖率 51% → 70%

- [ ] DEBT-003: IndexedDB Mock 修复
- [ ] DEBT-003: React Hooks 基础测试
- [ ] DEBT-004: ProposalPanel 实现
- [ ] DEBT-005: API对接 (基础)

**验收标准**:
- 测试通过率 95%+
- 覆盖率 70%+
- UI可交互

---

### Phase 2: 体验优化 (1周)

**目标**: 完善用户体验

- [ ] DEBT-006: 移动端适配
- [ ] DEBT-007: 主题系统扩展
- [ ] DEBT-004: DemoPanel 实现
- [ ] DEBT-005: API对接 (完整)

---

### Phase 3: 生产就绪 (2周)

**目标**: 100%测试通过率，覆盖率 85%+

- [ ] DEBT-003: 剩余测试补齐
- [ ] DEBT-008: 文档完善
- [ ] DEBT-009: 性能优化
- [ ] DEBT-010: 监控接入

---

## 📁 相关文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 覆盖率缺口报告 | `docs/COVERAGE-GAP-REPORT.md` | 详细测试缺口 |
| 考古抢救白皮书 | `HAJIMI-ARCHAEOLOGICAL-RESCUE-005-白皮书-v1.0.md` | UI组件打捞记录 |
| 架构文档 | `lib/sandbox/architecture.md` | 赛博牢房架构 |
| 修复白皮书 | `design/HAJIMI-RC-001-HARDEN-验收白皮书-v1.0.md` | 修复历史 |

---

## 🎯 本周冲刺建议

### Day 1-2: 紧急修复
- 修复TSA编译错误 (2-4h)
- 统一路径别名 (1-2h)

### Day 3-5: 基础补全
- IndexedDB Mock修复 (4-6h)
- React Hooks测试 (4-6h)
- ProposalPanel实现 (4-6h)

### Day 6-7: 集成测试
- API对接 (4-6h)
- 端到端测试 (2-4h)

**预期产出**:
- ✅ `next build` 通过
- ✅ 测试覆盖率 70%+
- ✅ UI可交互 (六权星图 + 聊天 + 提案)

---

*文档由 压力怪(Arch) 生成*
*审核: 客服小祥(Orchestrator)*
🐍♾️
