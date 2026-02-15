# R-07/09 技术考古报告：历史版本资产打捞可行性研究

## 📋 研究概览

| 项目 | 内容 |
|------|------|
| **研究工单** | R-07/09 |
| **研究范围** | `F:\Hajimi Code 历史版本（很多技术栈）` |
| **目标项目** | Hajimi Code Ultra v1.0.0 |
| **报告日期** | 2026-02-14 |
| **考古学家** | Technical Archaeologist |

---

## 1. 历史版本目录结构映射表

### 1.1 项目分布概览

```
F:\Hajimi Code 历史版本（很多技术栈）\
├── A2A Demo/                    # Node.js CLI 项目
├── A2A_Demo_Next.js/            # Next.js 14 完整实现 ⭐
├── A2A_Demo_Skills/             # SecondMe Skills SDK 集成 ⭐
├── Fix - v1/                    # 空目录
├── Hajimi Code/                 # Node.js CLI 原型
├── Hajimi Code 备份/            # Next.js 14 MVP ⭐
├── Ouroboros-Nirvana/           # 空项目
└── 可空投/                      # 部署资源
```

### 1.2 详细映射表

| 原始路径 | 建议迁移路径 | 技术栈 | 复用评级 | 迁移难度 | 备注 |
|---------|------------|-------|---------|---------|-----|
| `A2A_Demo_Next.js/hajimi-nextjs/components/workflow/` | `app/components/workflow/` | React 18 + TS + Tailwind | **S** | 低 | 可直接复制，七权状态图组件 |
| `A2A_Demo_Next.js/hajimi-nextjs/components/agents/` | `app/components/agents/` | React 18 + TS + Tailwind | **S** | 低 | AgentCard/AgentGrid 组件 |
| `A2A_Demo_Next.js/hajimi-nextjs/components/ui/` | `app/components/ui/` | React 18 + shadcn/ui | **A** | 低 | 需合并现有 ui 组件 |
| `A2A_Demo_Next.js/hajimi-nextjs/components/dashboard/` | `app/components/dashboard/` | React 18 + TS | **A** | 低 | EvidenceLog, TokenBalance |
| `A2A_Demo_Next.js/hajimi-nextjs/app/` | `app/` | Next.js 14 App Router | **A** | 中 | 需适配现有路由结构 |
| `A2A_Demo_Next.js/hajimi-nextjs/lib/` | `lib/` | TypeScript | **B** | 中 | 需检查与现有 lib 冲突 |
| `A2A_Demo_Next.js/hajimi-nextjs/tailwind.config.ts` | `tailwind.config.ts` | Tailwind CSS | **A** | 低 | 主题色需合并 |
| `A2A_Demo_Skills/hajimi-code-ouroboros/skills-v2.1/components/ui/` | `app/components/ui/` | React 18 + TS | **S** | 低 | 当前 v1.0.0 组件来源 |
| `A2A_Demo_Skills/hajimi-code-ouroboros/src/components/agents/` | `app/components/agents/` | React 18 + TS | **A** | 低 | TokenDisplay 等组件 |
| `Hajimi Code 备份/Hajimi Code Ultra/app/` | `app/` | Next.js 14 | **B** | 中 | 与当前项目结构相似 |
| `Hajimi Code/test_run/lib/codemirror/` | `lib/editor/` | CodeMirror 5 | **C** | 高 | 老旧版本，建议用 Monaco |
| `A2A Demo/test_run/` | `archive/cli-v1/` | Node.js CLI | **D** | 极高 | 纯后端 CLI，不可复用 UI |

### 1.3 复用评级说明

| 评级 | 定义 | 工作量估算 |
|-----|------|-----------|
| **S** | 直接复制使用，无需修改 | 0-30 分钟 |
| **A** | 少量修改（路径/导入调整） | 30 分钟-2 小时 |
| **B** | 需要适配层封装 | 2-4 小时 |
| **C** | 需重写但可借鉴设计 | 4-8 小时 |
| **D** | 不可复用 | - |

---

## 2. 组件清单

### 2.1 可直接复用组件 (S级)

| 组件名称 | 原始路径 | 技术栈 | 目标路径 | 转换难度 | 依赖分析 |
|---------|---------|-------|---------|---------|---------|
| `StateGraph` | `.../components/workflow/StateGraph.tsx` | React 18 + Framer Motion | `components/workflow/StateGraph.tsx` | 无 | framer-motion |
| `StateMachineVisualizer` | `.../components/workflow/StateMachineVisualizer.tsx` | React 18 + TS | `components/workflow/StateMachineVisualizer.tsx` | 无 | 无 |
| `StateTransition` | `.../components/workflow/StateTransition.tsx` | React 18 + TS | `components/workflow/StateTransition.tsx` | 无 | 无 |
| `Timeline` | `.../components/workflow/Timeline.tsx` | React 18 + TS | `components/workflow/Timeline.tsx` | 无 | 无 |
| `AgentCard` | `.../components/agents/AgentCard.tsx` | React 18 + shadcn/ui | `components/agents/AgentCard.tsx` | 无 | lucide-react, @/components/ui/card |
| `AgentGrid` | `.../components/agents/AgentGrid.tsx` | React 18 + TS | `components/agents/AgentGrid.tsx` | 无 | AgentCard |
| `A2AMessageFeed` | `.../components/ui/A2AMessageFeed.tsx` | React 18 + TS | `components/ui/A2AMessageFeed.tsx` | 无 | 已存在 |
| `AgentChatDialog` | `.../components/ui/AgentChatDialog.tsx` | React 18 + TS | `components/ui/AgentChatDialog.tsx` | 无 | 已存在 |
| `StateIndicator` | `.../components/ui/StateIndicator.tsx` | React 18 + TS | `components/ui/StateIndicator.tsx` | 无 | 已存在 |

### 2.2 需适配组件 (A级)

| 组件名称 | 原始路径 | 技术栈 | 目标路径 | 转换难度 | 依赖分析 |
|---------|---------|-------|---------|---------|---------|
| `EvidenceLog` | `.../components/dashboard/EvidenceLog.tsx` | React 18 + TS | `components/dashboard/EvidenceLog.tsx` | 低 | 需适配数据接口 |
| `TokenBalance` | `.../components/dashboard/TokenBalance.tsx` | React 18 + TS | `components/dashboard/TokenBalance.tsx` | 低 | 需适配 token 系统 |
| `WorkflowDemo` | `.../components/workflow/WorkflowDemo.tsx` | React 18 + TS | `app/workflows/page.tsx` | 中 | 需拆分为页面 |
| `SessionProvider` | `.../components/providers/SessionProvider.tsx` | React 18 + next-auth | `components/providers/` | 低 | next-auth 版本需对齐 |

### 2.3 UI 基础组件 (shadcn/ui)

| 组件 | 原始路径 | 状态 |
|-----|---------|-----|
| `avatar.tsx` | `.../components/ui/avatar.tsx` | 可复用 |
| `badge.tsx` | `.../components/ui/badge.tsx` | 可复用 |
| `card.tsx` | `.../components/ui/card.tsx` | 可复用 |
| `progress.tsx` | `.../components/ui/progress.tsx` | 可复用 |

---

## 3. 样式资产提取方案

### 3.1 历史版本主题色映射

#### A2A_Demo_Next.js 主题色
```typescript
// tailwind.config.ts 提取
const workflowColors = {
  idle: '#64748b',      // slate-500
  design: '#3b82f6',    // blue-500
  review: '#a855f7',    // purple-500
  code: '#f59e0b',      // amber-500
  audit: '#f97316',     // orange-500
  package: '#06b6d4',   // cyan-500
  done: '#22c55e',      // green-500
};

const agentColors = {
  pm: '#3b82f6',        // PM - 蓝色
  architect: '#a855f7', // 架构师 - 紫色
  engineer: '#f59e0b',  // 工程师 - 琥珀色
  qa: '#f97316',        // QA - 橙色
  mike: '#06b6d4',      // Mike - 青色
};
```

#### A2A_Demo_Skills 赛博朋克主题
```typescript
// tailwind.config.ts 提取
const cyberpunkColors = {
  cyan: '#00f0ff',
  purple: '#bd00ff',
  pink: '#ff0080',
  blue: '#0080ff',
  green: '#00ff80',
  yellow: '#f0ff00',
  dark: '#020617',
  darker: '#01040f',
};

const agentRoleColors = {
  pm: '#00f0ff',        // Cyan
  arch: '#bd00ff',      // Purple
  qa: '#ff0080',        // Pink
  engineer: '#0080ff',  // Blue
  mike: '#00ff80',      // Green
};
```

### 3.2 七权主题色整合方案

建议采用以下统一配色方案：

```typescript
// 推荐整合方案
const unifiedTheme = {
  // 七权状态色
  workflow: {
    idle: '#6b7280',      // gray-500
    design: '#884499',    // 七权紫
    review: '#a855f7',    // purple-500
    code: '#3b82f6',      // blue-500
    audit: '#f59e0b',     // amber-500
    package: '#06b6d4',   // cyan-500
    done: '#22c55e',      // green-500
  },
  // Agent 角色色
  agent: {
    pm: '#884499',        // 七权紫 - 立法者
    architect: '#a855f7', // 紫色 - 设计师
    engineer: '#3b82f6',  // 蓝色 - 执行者
    qa: '#f59e0b',        // 琥珀色 - 审查者
    mike: '#06b6d4',      // 青色 - 打包者
  },
  // 赛博朋克特效色（可选）
  cyber: {
    glow: '0 0 20px rgba(136, 68, 153, 0.5)',
    neon: '#00f0ff',
  }
};
```

### 3.3 CSS Variables 映射

```css
:root {
  /* 七权品牌色 */
  --hajimi-primary: #884499;
  --hajimi-primary-light: #aa66bb;
  --hajimi-primary-dark: #663377;
  
  /* 状态色 */
  --state-idle: #6b7280;
  --state-design: #884499;
  --state-review: #a855f7;
  --state-code: #3b82f6;
  --state-audit: #f59e0b;
  --state-package: #06b6d4;
  --state-done: #22c55e;
  
  /* Agent 色 */
  --agent-pm: #884499;
  --agent-architect: #a855f7;
  --agent-engineer: #3b82f6;
  --agent-qa: #f59e0b;
  --agent-mike: #06b6d4;
}
```

### 3.4 Tailwind 配置迁移

```typescript
// tailwind.config.ts 扩展
{
  theme: {
    extend: {
      colors: {
        hajimi: {
          DEFAULT: '#884499',
          light: '#aa66bb',
          dark: '#663377',
        },
        workflow: {
          idle: '#6b7280',
          design: '#884499',
          review: '#a855f7',
          code: '#3b82f6',
          audit: '#f59e0b',
          package: '#06b6d4',
          done: '#22c55e',
        },
        agent: {
          pm: '#884499',
          architect: '#a855f7',
          engineer: '#3b82f6',
          qa: '#f59e0b',
          mike: '#06b6d4',
        }
      },
      boxShadow: {
        'glow': '0 0 20px rgba(136, 68, 153, 0.5)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.5)',
      }
    }
  }
}
```

---

## 4. Monaco 封装组件清单

### 4.1 历史版本编辑器扫描结果

| 路径 | 类型 | 版本 | 可复用性 |
|-----|------|-----|---------|
| `Hajimi Code/test_run/lib/codemirror/` | CodeMirror | v5.x | **C** - 版本老旧 |
| `Hajimi Code/test_run/js/editor.js` | CodeMirror 封装 | 自定义 | **C** - 需重写 |

### 4.2 建议方案

**不推荐直接复用**历史版本的 CodeMirror 封装，原因：
1. CodeMirror 5.x 版本过旧，与 React 18 整合困难
2. Monaco Editor 是 VS Code 同款，更适合技术类产品

**建议采用新方案：**
```typescript
// 推荐: 使用 @monaco-editor/react
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "monaco-editor": "^0.45.0"
  }
}
```

### 4.3 Monaco 封装组件设计

```typescript
// components/editor/CodeEditor.tsx
interface CodeEditorProps {
  value: string;
  language?: 'typescript' | 'javascript' | 'json' | 'yaml';
  theme?: 'vs-dark' | 'hajimi-dark';
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}
```

---

## 5. 迁移工作量估算

### 5.1 按组件估算

| 组件/模块 | 数量 | 单件工时 | 总工时 | 风险等级 |
|----------|-----|---------|-------|---------|
| Workflow 组件群 | 4 个 | 0.5h | 2h | 🟢 低 |
| Agent 组件群 | 3 个 | 0.5h | 1.5h | 🟢 低 |
| Dashboard 组件 | 2 个 | 1h | 2h | 🟡 中 |
| UI 基础组件 | 4 个 | 0.5h | 2h | 🟢 低 |
| 样式/主题整合 | 1 套 | 4h | 4h | 🟡 中 |
| Monaco 编辑器 | 1 个 | 4h | 4h | 🟡 中 |
| 测试适配 | - | - | 4h | 🟡 中 |
| **总计** | | | **19.5h** | |

### 5.2 按阶段估算

| 阶段 | 工作内容 | 工时 | 交付物 |
|-----|---------|-----|-------|
| **Phase 1** | Workflow 组件迁移 | 4h | StateGraph, Timeline |
| **Phase 2** | Agent 组件迁移 | 4h | AgentCard, AgentGrid |
| **Phase 3** | Dashboard 组件迁移 | 4h | EvidenceLog, TokenBalance |
| **Phase 4** | 样式主题整合 | 4h | 统一主题系统 |
| **Phase 5** | Monaco 编辑器集成 | 4h | CodeEditor 组件 |
| **Phase 6** | 测试与优化 | 4h | 测试覆盖 |

### 5.3 风险点识别

| 风险 | 影响 | 缓解措施 |
|-----|-----|---------|
| 🟡 Framer Motion 版本冲突 | 动画失效 | 统一使用 v11.x |
| 🟡 next-auth 版本差异 | 认证失效 | 检查现有版本，必要时升级 |
| 🟡 Tailwind 配置冲突 | 样式异常 | 使用 preset 方式合并 |
| 🟡 类型定义不兼容 | 构建错误 | 统一使用 zod 做运行时校验 |
| 🔴 路径别名差异 | 导入失败 | 统一使用 `@/` 别名 |

### 5.4 依赖兼容性矩阵

| 依赖 | 历史版本 | 当前 v1.0.0 | 兼容性 |
|-----|---------|------------|-------|
| next | 14.0.0 | 14.1.0 | ✅ 兼容 |
| react | 18.2.0 | 18.2.0 | ✅ 完全兼容 |
| typescript | 5.2.0/5.3.0 | 5.3.0 | ✅ 兼容 |
| tailwindcss | 3.3.5/3.4.0 | 3.x | ✅ 兼容 |
| framer-motion | 12.34.0 | 未安装 | ⚠️ 需安装 |
| lucide-react | 0.563.0 | 已安装 | ✅ 兼容 |
| zustand | 5.0.11 | 未安装 | ⚠️ 可选 |

---

## 6. 打捞建议清单

### 6.1 高优先级 (立即打捞)

- [x] `StateGraph.tsx` - 七权状态可视化核心组件
- [x] `AgentCard.tsx` - Agent 卡片组件
- [x] `AgentGrid.tsx` - Agent 网格布局
- [x] `tailwind.config.ts` - 主题配置

### 6.2 中优先级 (按需打捞)

- [ ] `StateMachineVisualizer.tsx` - 状态机可视化
- [ ] `Timeline.tsx` - 时间线组件
- [ ] `EvidenceLog.tsx` - 审计日志
- [ ] `TokenBalance.tsx` - Token 余额显示

### 6.3 低优先级 (参考借鉴)

- [ ] CodeMirror 编辑器逻辑 - 参考其 API 设计
- [ ] Dashboard 布局结构 - 参考其布局思路

---

## 7. 迁移执行计划

```bash
# Step 1: 创建分支
git checkout -b feature/R07-legacy-assets-migration

# Step 2: 复制高优先级组件
cp ".../components/workflow/StateGraph.tsx" app/components/workflow/
cp ".../components/agents/AgentCard.tsx" app/components/agents/
cp ".../components/agents/AgentGrid.tsx" app/components/agents/

# Step 3: 安装缺失依赖
npm install framer-motion @monaco-editor/react monaco-editor

# Step 4: 合并 Tailwind 配置
# 手动合并 tailwind.config.ts

# Step 5: 验证构建
npm run build
npm run test
```

---

## 8. 附录：关键代码片段

### 8.1 StateGraph 核心用法

```tsx
import { StateGraph, StateNode } from '@/components/workflow/StateGraph';

<StateGraph
  currentState="CODE"
  transitionHistory={['IDLE', 'DESIGN', 'REVIEW', 'CODE']}
  onNodeClick={(node, detail) => console.log(node, detail)}
  width={1050}
  height={300}
/>
```

### 8.2 AgentCard 核心用法

```tsx
import { AgentCard } from '@/components/agents/AgentCard';

<AgentCard
  id="PM"
  name="PM Agent"
  role="立法者"
  status="running"
  color="blue"
  icon="FileText"
  progress={65}
  task="分析需求文档..."
/>
```

---

## 📊 总结

| 指标 | 数值 |
|-----|-----|
| **扫描项目数** | 8 个 |
| **可复用组件** | 12 个 |
| **S级组件** | 9 个 |
| **预估总工时** | 19.5 小时 |
| **风险等级** | 🟡 中等 |

**结论**：历史版本资产丰富，特别是 `A2A_Demo_Next.js` 项目包含大量可直接复用的 React 组件。建议优先打捞 Workflow 和 Agent 相关组件，预计 1-2 个工作日即可完成核心组件迁移。

---

*报告生成时间: 2026-02-14*  
*技术考古学家: Kimi Code CLI*  
*研究工单: R-07/09*
