# HAJIMI-V1.3.0 迁移指南

> **版本**: v1.3.0  
> **日期**: 2026-02-16  

---

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 全部测试
npm test

# 特定模块
npm test -- tests/alice
npm test -- tests/theme
npm test -- tests/quintant
npm test -- tests/unit
```

### 启动开发服务器

```bash
npm run dev
```

---

## 📦 模块导入

### Alice鼠标追踪

```typescript
import { AliceMouseTracker } from '@/lib/alice';

const tracker = new AliceMouseTracker();
tracker.record({ x: 100, y: 100, timestamp: Date.now() });
const pattern = tracker.recognize();
```

### Quintant服务

```typescript
import { createQuintantService, MockAdapter } from '@/lib/quintant';

const service = createQuintantService({
  defaultAdapter: 'mock',
  defaultIsolation: 'SOFT',
  adapters: { mock: { type: 'mock', timeout: 30000, retries: 3 } }
});

service.registerAdapter('mock', new MockAdapter());
```

### TSA状态机

```typescript
import { useTSA, useAgentLifecycle } from '@/lib/tsa';

// React Hook
const { state, transition } = useTSA('agent-1');

// 或使用管理器
import { TSAManager } from '@/lib/tsa';
const manager = new TSAManager(config);
```

### 治理引擎

```typescript
import { ProposalManager, VotingManager } from '@/lib/governance';

const proposalManager = new ProposalManager();
const votingManager = new VotingManager(proposalManager);
```

### Fabric装备

```typescript
import { FabricLoader, CodeDoctorPattern } from '@/lib/fabric';

const loader = new FabricLoader();
loader.load(CodeDoctorPattern);
await loader.use('CodeDoctor', { code, language: 'ts' });
```

### 主题系统

```typescript
import { ThemeProvider, useTheme } from '@/app/styles/ThemeProvider';

// 包裹应用
<ThemeProvider defaultTheme="alice">
  <App />
</ThemeProvider>

// 使用Hook
const { theme, setTheme, cycleTheme } = useTheme();
```

---

## ⚙️ 配置

### 环境变量

```bash
# Redis (用于某些测试)
REDIS_URL=redis://localhost:6379

# 开发模式
NODE_ENV=development
```

---

## 🐛 故障排除

### 测试失败

```bash
# 清除缓存
npm run clean

# 重新安装
rm -rf node_modules && npm install
```

### 类型错误

```bash
# 检查类型
npx tsc --noEmit
```

---

## 📚 参考文档

- [白皮书](../design/HAJIMI-V1.3.0-白皮书-v1.0.md)
- [自测表](../design/HAJIMI-V1.3.0-自测表-v1.0.md)
- [债务修正](../design/v1.3.0/debt-realistic.md)

---

**版本**: v1.3.0  
**日期**: 2026-02-16
