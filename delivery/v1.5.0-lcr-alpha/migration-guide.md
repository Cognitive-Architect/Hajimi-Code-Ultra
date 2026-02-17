# v1.5.0-lcr-alpha 迁移指南

**来源版本**: v1.4.0-final  
**目标版本**: v1.5.0-lcr-alpha  
**迁移类型**: 增量合并（非破坏性）  

---

## 迁移概述

v1.5.0-lcr-alpha 在 v1.4.0-final 基础上引入 **LCR（Luxury Context Runtime）** 本地上下文运行时架构。迁移过程为非破坏性增量，v1.4.0所有功能保持100%兼容。

---

## 前置条件

### 系统要求
| 组件 | 最低版本 | 推荐版本 |
|:---|:---:|:---:|
| Node.js | 18.x | 20.x LTS |
| TypeScript | 5.0 | 5.3+ |
| 浏览器 | Chrome 90+ | 最新 |

### 可选本地运行时（LCR离线模式）
- **Ollama**: 推荐，支持llama3/mistral/codellama
- **llama.cpp**: 兼容，需要HTTP服务器模式

---

## 迁移步骤

### Step 1: 代码更新

```bash
# 获取v1.5.0-lcr-alpha标签
git fetch origin
git checkout v1.5.0-lcr-alpha

# 安装新增依赖
npm install
# 新增: idb@7.1.1, simple-peer@9.11.1, msgpack-lite@0.1.26
```

### Step 2: 类型修复（如适用）

如果项目中使用了 TSA/Virtualized/Yggdrasil 模块，可能需要更新类型导入：

```typescript
// 旧导入（可能失效）
import { tsa, StorageTier } from '@/lib/tsa';

// 新导入（推荐）
import type { StorageTier } from '@/lib/tsa/types';
import { orchestrator } from '@/lib/tsa/orchestrator-v2';
```

### Step 3: 配置文件更新

可选：在 `config/hajimi.config.ts` 中添加LCR配置：

```typescript
export default {
  // ... 现有配置
  
  lcr: {
    // 本地运行时配置
    localRuntime: {
      enabled: true,
      endpoint: 'http://localhost:11434',
      defaultModel: 'llama3',
    },
    
    // 跨端同步配置
    sync: {
      enabled: true,
      signalingServers: ['wss://signaling.hajimi.local'],
    },
    
    // 存储分层配置
    storage: {
      activeMaxSize: '100MB',
      hotMaxSize: '1GB',
      warmMaxSize: '10GB',
    },
  },
};
```

### Step 4: 验证安装

```bash
# 运行LCR自测
npm test -- --testPathPattern="lcr"

# 预期输出: 27 tests passed
```

---

## API变更

### 新增API

| API | 路径 | 描述 |
|:---|:---|:---|
| `ContextSnapper` | `@/lib/lcr/snapper` | 上下文快照序列化 |
| `WorkspaceV2` | `@/lib/lcr/workspace` | 4层存储工作空间 |
| `TieredMemory` | `@/lib/lcr/memory` | MemGPT分层记忆 |
| `HybridRAG` | `@/lib/lcr/retrieval` | 混合检索引擎 |
| `PredictiveGC` | `@/lib/lcr/gc` | 预测性垃圾回收 |
| `CrossDeviceSync` | `@/lib/lcr/sync` | 跨端同步（CRDT） |
| `SecureEnclave` | `@/lib/lcr/security` | 安全沙盒 |
| `BootstrapEngine` | `@/lib/lcr/meta` | 元引导引擎 |

### 工厂适配器扩展

```typescript
// 新增适配器类型
import { createAdapter } from '@/lib/quintant';

// LCR本地运行时适配器（离线优先）
const lcrAdapter = createAdapter('lcr-local', {
  lcrLocalConfig: {
    endpoint: 'http://localhost:11434',
    fallback: {
      enabled: true,
      cloudAdapter: 'ip-direct', // 本地失败时回退到IP直连
    },
  },
});
```

---

## 破坏性变更

### 无破坏性变更

v1.5.0-lcr-alpha 对 v1.4.0-final 保持 **100%向后兼容**：
- 所有v1.4.0 API保持不变
- 所有v1.4.0配置继续有效
- Alice ML/UI 组件无变更
- OpenRouter IP直连保持默认

### 类型系统注意

基础代码库存在54个既有TS错误（非v1.5.0引入），建议在迁移前或迁移后修复：

```bash
# 查看类型错误
npx tsc --noEmit

# 主要问题类别：
# - TSA模块导出问题（15处）
# - Virtualized类型重导出（12处）
# - Implicit any参数（8处）
```

---

## 功能开关

### 渐进式启用LCR

```typescript
// 1. 仅启用快照功能
import { ContextSnapper } from '@/lib/lcr/snapper';

// 2. 启用本地运行时（需Ollama）
const adapter = createAdapter('lcr-local', config);

// 3. 全功能启用（工作空间+同步+安全）
import { WorkspaceV2, CrossDeviceSync, SecureEnclave } from '@/lib/lcr';
```

### 回退到v1.4.0行为

```typescript
// 强制使用云端适配器，禁用LCR
const cloudAdapter = createAdapter('ip-direct', {
  // 不配置lcrLocalConfig
});
```

---

## 故障排查

### 常见问题

| 问题 | 原因 | 解决方案 |
|:---|:---|:---|
| LCR适配器连接失败 | Ollama未运行 | 启动Ollama服务 |
| 跨端同步失败 | WebRTC被防火墙阻挡 | 配置TURN服务器 |
| 存储空间不足 | IndexedDB限制 | 清理Warm/Cold层数据 |
| 3D渲染卡顿 | 节点过多 | 自动降级至2D视图 |

### 调试命令

```bash
# 检查本地运行时状态
curl http://localhost:11434/api/tags

# 验证快照格式
npx ts-node -e "
  const { ContextSnapper } = require('./lib/lcr/snapper');
  console.log('HCTX Magic:', ContextSnapper.HCTX_MAGIC.toString(16));
"

# 测试WebRTC连通性
npm test -- --testNamePattern="CrossDeviceSync"
```

---

## 回滚方案

如需要回退到v1.4.0-final：

```bash
# 代码回滚
git checkout v1.4.0-final

# 清理LCR相关依赖（可选）
npm uninstall idb simple-peer msgpack-lite

# 验证
npm test
```

**数据兼容性**: LCR快照格式（.hctx）为独立文件，不影响v1.4.0数据

---

## 支持与反馈

- **技术债务**: 参见 `debt-report.md`
- **合并验证**: 参见 `merge-validation-report.md`
- **问题追踪**: GitHub Issues /tag:lcr

---

*指南版本: v1.0.0*  
*生成时间: 2026-02-17*
