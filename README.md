# Hajimi Code Ultra v1.3.0 🐍♾️

> **Blue Sechi 风格 Agent 协作系统** —— 九权人格化虚拟化平台

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/Cognitive-Architect/Hajimi-Code-Ultra/releases)
[![Tests](https://img.shields.io/badge/tests-172%2F172%20passed-brightgreen.svg)](./tests)
[![Audit](https://img.shields.io/badge/audit-A%2B-brightgreen.svg)](./audit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

---

## ✨ 项目简介

**Hajimi Code Ultra** 是一个基于 **七权人格化架构** 的 Agent 协作系统，灵感来自《BanG Dream! It's MyGO!!!!!》角色群像。系统通过虚拟化技术实现多个 AI Agent 的协同工作，每个 Agent 拥有独特的角色定位、视觉主题和职能边界。

### 核心特性

- 🎭 **七权人格化** —— Alice + 六人组（黄瓜睦/唐音/咕咕嘎嘎/压力怪/Soyorin/奶龙娘）
- 🔄 **TSA 状态机** —— 七状态 + 12 条流转规则的生命周期管理
- 🔌 **Quintant 标准化接口** —— spawn/lifecycle/terminate/vacuum/status 五方法
- 🎨 **Blue Sechi 风格 UI** —— 动态悬浮球 + 角色主题切换
- ⚖️ **治理引擎** —— 七权投票权重 + 链式提案存储
- 🛡️ **RBAC 权限层** —— 角色权限矩阵 + Token Bucket 限流
- 🎒 **Fabric 装备库** —— 5 个标准 Pattern + 热插拔机制

---

## 🎭 七权人格化角色

| 角色 | 英文名 | 职能 | 色板 | 装备 Pattern |
|------|--------|------|------|--------------|
| 💙 **天童爱丽丝** | Alice | 通用/默认 | #77BBFF | - |
| 🥒 **黄瓜睦** | Mortis | Architect | #669966 | PerformanceTuner |
| 🎀 **唐音** | Anon | Engineer | #FF9999 | Mock 适配器 |
| 🐧 **咕咕嘎嘎** | Tomori | QA | #77BBDD | DocsWriter |
| 🔷 **压力怪** | Taki | Audit | #7777AA | SecurityGuard |
| 💛 **Soyorin** | Soyo | PM | #FFDD88 | DebtCollector |
| 🐉 **奶龙娘** | Kotone | Doctor | #FFDD00 | CodeDoctor |

### 错误码彩蛋

```
404: "なんで春日影やったの！？"
500: "睦...壊れちゃった..."
429: "もう無理、もう無理..."
403: "哈？你以为你能访问这个？"
```

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/Cognitive-Architect/Hajimi-Code-Ultra.git
cd Hajimi-Code-Ultra

# 安装依赖
npm install

# 运行测试
npm test
```

### 基础使用

#### 1. Alice 鼠标追踪器

```typescript
import { AliceMouseTracker } from '@/lib/alice';

const tracker = new AliceMouseTracker();

// 记录鼠标轨迹
tracker.record({ x: 100, y: 100, timestamp: Date.now() });
tracker.record({ x: 105, y: 102, timestamp: Date.now() + 16 });
// ... 记录更多点

// 识别模式
const pattern = tracker.recognize();
console.log(pattern); // 'rage_shake' | 'precision_snipe' | 'casual_explore' | ...
```

#### 2. Quintant 服务

```typescript
import { createQuintantService, MockAdapter } from '@/lib/quintant';

const service = createQuintantService({
  defaultAdapter: 'mock',
  defaultIsolation: 'SOFT',
  adapters: {
    mock: { type: 'mock', timeout: 30000, retries: 3 }
  }
});

service.registerAdapter('mock', new MockAdapter());

// 创建 Agent
const { data: agent } = await service.spawn({
  config: {
    id: 'agent-1',
    name: 'Test Agent',
    role: 'Engineer',
    isolation: 'HARD' // 或 'SOFT'
  }
});

// 终止 Agent
await service.terminate({ agentId: 'agent-1' });
```

#### 3. TSA 状态机 (React)

```typescript
import { useTSA, useAgentLifecycle } from '@/lib/tsa';

function AgentComponent() {
  const { state, transition, history } = useTSA('my-agent');
  const { activate, suspend, terminate } = useAgentLifecycle('my-agent');

  return (
    <div>
      <p>当前状态: {state}</p>
      <button onClick={activate}>激活</button>
      <button onClick={suspend}>暂停</button>
      <button onClick={terminate}>终止</button>
    </div>
  );
}
```

#### 4. 治理引擎

```typescript
import { ProposalManager, VotingManager } from '@/lib/governance';

const proposalManager = new ProposalManager();
const votingManager = new VotingManager(proposalManager);

// 创建提案
const proposal = proposalManager.createProposal({
  type: 'CODE_CHANGE',
  title: '添加新功能',
  description: '详细描述...',
  data: { files: ['lib/new-feature.ts'] },
  proposer: { id: 'user1', role: 'PM', name: 'Soyorin' }
});

// 启动投票
proposalManager.startVoting(proposal.id);

// 投票
votingManager.vote(proposal.id, 'user2', 'ARCHITECT', 'FOR');

// 结束投票
const result = votingManager.finalizeVoting(proposal.id);
console.log(result.status); // 'PASSED' | 'REJECTED' | 'BLOCKED'
```

#### 5. Fabric 装备库

```typescript
import { FabricLoader, CodeDoctorPattern } from '@/lib/fabric';

const loader = new FabricLoader();

// 加载装备
loader.load(CodeDoctorPattern);

// 使用装备
const result = await loader.use('CodeDoctor', {
  code: 'function test() { console.log("debug"); }',
  language: 'typescript'
});

console.log(result.issues); // 代码问题列表
console.log(result.easterEgg); // "🐉 奶龙龙帮你检查完啦！"
```

#### 6. 主题系统

```typescript
import { ThemeProvider, useTheme } from '@/app/styles/ThemeProvider';

// 包裹应用
function App() {
  return (
    <ThemeProvider defaultTheme="alice">
      <YourApp />
    </ThemeProvider>
  );
}

// 使用主题
function YourApp() {
  const { theme, setTheme, cycleTheme, currentMeta } = useTheme();

  return (
    <div data-theme={theme}>
      <p>当前角色: {currentMeta.name}</p>
      <button onClick={() => setTheme('mortis')}>切换到黄瓜睦</button>
      <button onClick={cycleTheme}>下一个主题</button>
    </div>
  );
}
```

---

## 🏗️ 技术架构

```
Hajimi-Code-Ultra/
├── lib/
│   ├── alice/          # Alice 鼠标追踪引擎 (工单1/9)
│   ├── quintant/       # Quintant 服务标准化接口 (工单3/9)
│   ├── tsa/            # TSA 中间件与状态机引擎 (工单4/9)
│   ├── governance/     # 治理引擎 (工单5/9)
│   ├── api/            # API 权限层 (工单6/9)
│   ├── fabric/         # Fabric 装备库 (工单7/9)
│   └── core/           # 核心服务 (既有模块)
├── app/
│   └── styles/         # 七人主题系统 (工单2/9)
├── tests/
│   ├── alice/          # Alice 测试
│   ├── theme/          # 主题测试
│   ├── quintant/       # Quintant 测试
│   └── unit/           # 单元测试 (工单8/9)
├── delivery/v1.3.0/    # 六件套交付文档 (工单9/9)
└── audit/              # 九维审计报告
```

---

## 📋 项目结构

### 工单实现状态

| 工单 | 模块 | 状态 | 测试 |
|------|------|------|------|
| 1/9 | Alice 鼠标追踪引擎 | ✅ | 16/16 |
| 2/9 | Seven-Persona 主题系统 | ✅ | 46/46 |
| 3/9 | Quintant 服务标准化接口 | ✅ | 34/34 |
| 4/9 | TSA 中间件与状态机引擎 | ✅ | 7/7 |
| 5/9 | 治理引擎 | ✅ | 6/6 |
| 6/9 | API 权限层 | ✅ | 6/6 |
| 7/9 | Fabric 装备库 | ✅ | 6/6 |
| 8/9 | 测试体系 | ✅ | 5/5 |
| 9/9 | 六件套交付 | ✅ | 6/6 |
| **总计** | **9/9** | **✅** | **172/172** |

---

## 🧪 测试

```bash
# 运行全部测试
npm test

# 运行特定模块测试
npm test -- tests/alice
npm test -- tests/theme
npm test -- tests/quintant
npm test -- tests/unit

# 覆盖率报告
npx vitest --coverage --run
```

### 42 项自测全绿

```
✅ ALICE-001~005: 鼠标追踪功能
✅ PERSONA-001~005: 主题系统功能
✅ QUIN-001~005: Quintant 接口功能
✅ STM-001~006: TSA 状态机功能
✅ GOV-001~005: 治理引擎功能
✅ API-001~005: API 权限层功能
✅ FAB-001~005: Fabric 装备库功能
✅ TEST-001~005: 测试体系
✅ DEL-001~005: 交付文档
```

---

## 📚 文档

- [实现报告](./delivery/v1.3.0/implementation-report.md)
- [自审报告](./delivery/v1.3.0/code-review-report.md)
- [测试报告](./delivery/v1.3.0/test-report.md)
- [债务清单](./delivery/v1.3.0/debt-report.md)
- [交付清单](./delivery/v1.3.0/delivery-checklist.md)
- [迁移指南](./delivery/v1.3.0/migration-guide.md)
- [功能审计](./audit/HAJIMI-V1.3.0-CODE-AUDIT-REPORT-v1.0.md)
- [债务审计](./audit/HAJIMI-V1.3.0-DEBT-AUDIT-REPORT-v1.0.md)

---

## 🎯 设计原则

### 七权分立

每个角色拥有明确的职能边界，避免功能混杂：

- **PM (Soyorin)**: 项目管理、债务追踪
- **Architect (黄瓜睦)**: 架构决策、性能调优
- **QA (咕咕嘎嘎)**: 质量保证、文档生成
- **Engineer (唐音)**: 代码实现、测试驱动
- **Audit (压力怪)**: 安全审计、合规检查
- **Doctor (奶龙娘)**: 代码诊断、问题修复
- **Orchestrator (客服小祥)**: 协调管理、冲突仲裁

### 技术债务诚实

- **P0**: 阻塞核心功能的债务，必须在版本中清偿
- **P1**: 增强功能债务，计划在下一版本清偿
- **P2**: 延后债务，依赖外部条件或低优先级

当前债务密度: **0.19 项/100 行** (健康 🟢)

---

## 🤝 贡献指南

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

请确保：
- 所有测试通过 (`npm test`)
- TypeScript 无错误 (`npx tsc --noEmit`)
- 代码风格一致 (`npm run lint`)

---

## 📄 许可证

[Apache 2.0](./LICENSE) © 2026 Cognitive Architect

---

## 🙏 致谢

- **《BanG Dream! It's MyGO!!!!!》** —— 角色灵感来源
- **Blue Sechi** —— 美术风格参考
- **Hajimi-Unified** —— 单窗批处理模式

---

<p align="center">
  <strong>🐍♾️ 衔尾蛇协议激活 —— 准备执行 v1.3.0 版本发布</strong>
</p>
