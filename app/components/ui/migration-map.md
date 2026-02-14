# UI组件迁移方案

> 迁移来源: src/components/ui/*.tsx
> 迁移方式: 完全保留
> 代码行数: ~2,500行

## 组件清单

### 1. AgentChatDialog - Agent聊天对话框

**源文件**: `src/components/ui/AgentChatDialog.tsx`
**目标文件**: `app/components/ui/AgentChatDialog.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 六Agent实时聊天界面
- 消息输入/输出
- 人格切换
- 历史消息展示

**依赖关系**:
```typescript
import { A2AMessage, AgentRole } from '@/lib/protocols/a2a/types';
import { useTSA } from '@/lib/tsa/useTSA';
```

**Props接口**:
```typescript
interface AgentChatDialogProps {
  sessionId: string;
  currentAgent: AgentRole;
  onMessageSent?: (message: A2AMessage) => void;
  onAgentSwitch?: (agent: AgentRole) => void;
}
```

---

### 2. A2AMessageFeed - A2A消息流

**源文件**: `src/components/ui/A2AMessageFeed.tsx`
**目标文件**: `app/components/ui/A2AMessageFeed.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 实时消息流展示
- 消息类型渲染
- 时间线排序
- 无限滚动加载

**依赖关系**:
```typescript
import { A2AMessage, MessagePaginatedResult } from '@/lib/protocols/a2a/types';
import { useMessageStream } from '@/hooks/useMessageStream';
```

**Props接口**:
```typescript
interface A2AMessageFeedProps {
  sessionId: string;
  messages: A2AMessage[];
  hasMore: boolean;
  onLoadMore: () => void;
  onMessageClick?: (message: A2AMessage) => void;
}
```

---

### 3. ProposalPanel - 提案面板

**源文件**: `src/components/ui/ProposalPanel.tsx`
**目标文件**: `app/components/ui/ProposalPanel.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 提案列表展示
- 投票操作
- 提案状态显示
- 实时投票更新

**依赖关系**:
```typescript
import { ProposalPayload, VotePayload } from '@/lib/protocols/a2a/types';
import { useGovernance } from '@/hooks/useGovernance';
```

**Props接口**:
```typescript
interface ProposalPanelProps {
  proposals: Proposal[];
  currentAgentId: string;
  onVote: (proposalId: string, vote: 'approve' | 'reject') => void;
  onCreateProposal: (proposal: CreateProposalInput) => void;
}
```

---

### 4. StateIndicator - 状态指示器

**源文件**: `src/components/ui/StateIndicator.tsx`
**目标文件**: `app/components/ui/StateIndicator.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 当前状态可视化
- 状态流转动画
- 历史状态轨迹
- 状态超时警告

**依赖关系**:
```typescript
import { StateConfig } from '@/config/state/flow.yaml';
import { useStateMachine } from '@/hooks/useStateMachine';
```

**Props接口**:
```typescript
interface StateIndicatorProps {
  currentState: string;
  previousStates: string[];
  pendingTransition?: PendingTransition;
  timeoutWarning?: boolean;
}
```

---

### 5. DemoController - 演示控制器

**源文件**: `src/components/ui/DemoController.tsx`
**目标文件**: `app/components/ui/DemoController.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 演示场景选择
- 播放/暂停/停止控制
- 速度调节
- 步骤导航

**依赖关系**:
```typescript
import { Scenario } from '@/patterns/scenarios/base-scenario';
import { useDemoPlayer } from '@/hooks/useDemoPlayer';
```

**Props接口**:
```typescript
interface DemoControllerProps {
  scenarios: Scenario[];
  currentScenario?: Scenario;
  isPlaying: boolean;
  playbackSpeed: number;
  currentStep: number;
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onStepChange: (step: number) => void;
  onScenarioSelect: (scenario: Scenario) => void;
}
```

---

### 6. DemoPanel - 演示面板

**源文件**: `src/components/ui/DemoPanel.tsx`
**目标文件**: `app/components/ui/DemoPanel.tsx`
**迁移方式**: 直接迁移

**组件职责**:
- 演示可视化面板
- Agent动作展示
- 状态变化动画
- 消息流回放

**依赖关系**:
```typescript
import { DemoController } from './DemoController';
import { A2AMessageFeed } from './A2AMessageFeed';
import { StateIndicator } from './StateIndicator';
```

**Props接口**:
```typescript
interface DemoPanelProps {
  title: string;
  description: string;
  controller: DemoControllerProps;
  messages: A2AMessage[];
  stateIndicator: StateIndicatorProps;
}
```

---

## 组件导出

**源文件**: `src/components/ui/index.ts`
**目标文件**: `app/components/ui/index.ts`
**迁移方式**: 直接迁移

```typescript
// 六Agent UI组件统一导出
export { AgentChatDialog } from './AgentChatDialog';
export { A2AMessageFeed } from './A2AMessageFeed';
export { ProposalPanel } from './ProposalPanel';
export { StateIndicator } from './StateIndicator';
export { DemoController } from './DemoController';
export { DemoPanel } from './DemoPanel';

// 类型导出
export type { AgentChatDialogProps } from './AgentChatDialog';
export type { A2AMessageFeedProps } from './A2AMessageFeed';
export type { ProposalPanelProps } from './ProposalPanel';
export type { StateIndicatorProps } from './StateIndicator';
export type { DemoControllerProps } from './DemoController';
export type { DemoPanelProps } from './DemoPanel';
```

---

## 迁移检查清单

### 每个组件的迁移步骤

1. **复制文件**
   - [ ] 复制 .tsx 文件
   - [ ] 复制 .module.css / .scss 文件 (如有)
   - [ ] 复制测试文件 (如有)

2. **更新导入路径**
   - [ ] 更新相对导入为绝对导入
   - [ ] 更新类型导入路径
   - [ ] 更新 hooks 导入路径

3. **验证依赖**
   - [ ] 检查所有依赖是否可用
   - [ ] 更新废弃的 API 调用
   - [ ] 验证类型兼容性

4. **功能测试**
   - [ ] 组件渲染测试
   - [ ] 交互功能测试
   - [ ] 边界条件测试

---

## 路径映射表

| 旧路径 | 新路径 | 状态 |
|--------|--------|------|
| `src/components/ui/AgentChatDialog.tsx` | `app/components/ui/AgentChatDialog.tsx` | 待迁移 |
| `src/components/ui/A2AMessageFeed.tsx` | `app/components/ui/A2AMessageFeed.tsx` | 待迁移 |
| `src/components/ui/ProposalPanel.tsx` | `app/components/ui/ProposalPanel.tsx` | 待迁移 |
| `src/components/ui/StateIndicator.tsx` | `app/components/ui/StateIndicator.tsx` | 待迁移 |
| `src/components/ui/DemoController.tsx` | `app/components/ui/DemoController.tsx` | 待迁移 |
| `src/components/ui/DemoPanel.tsx` | `app/components/ui/DemoPanel.tsx` | 待迁移 |
| `src/components/ui/index.ts` | `app/components/ui/index.ts` | 待迁移 |

---

## 复用率统计

| 组件 | 代码行数 | 复用方式 |
|------|----------|----------|
| AgentChatDialog | ~800 | 完全保留 |
| A2AMessageFeed | ~500 | 完全保留 |
| ProposalPanel | ~400 | 完全保留 |
| StateIndicator | ~350 | 完全保留 |
| DemoController | ~300 | 完全保留 |
| DemoPanel | ~250 | 完全保留 |
| index.ts | ~50 | 完全保留 |
| **总计** | **~2,650** | **完全保留** |
