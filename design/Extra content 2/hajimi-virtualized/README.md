# HAJIMI VIRTUALIZED - 虚拟化集群引擎

**版本**: v1.0.0  
**日期**: 2026-02-16  
**状态**: ✅ 已通过Mike审计

---

## 📋 项目概述

HAJIMI VIRTUALIZED是一个基于ID-85九维理论构建的虚拟化集群引擎，实现了1点额度模式下3点Agent集群的等效能力。

### 核心特性

- ✅ **VirtualAgentPool核心引擎** - SHA256硬隔离上下文
- ✅ **三级Checkpoint服务** - L0/L1/L2/L3级状态持久化
- ✅ **ContextCompressor压缩引擎** - >80%压缩率
- ✅ **BNF协议运行时解析器** - <10ms解析性能
- ✅ **ResilienceMonitor韧性监控** - 7天滑动窗口统计
- ✅ **YGGDRASIL四象限集成** - API层完整暴露

---

## 🏗️ 项目结构

```
hajimi-virtualized/
├── lib/
│   ├── virtualized/
│   │   ├── types.ts              # 核心类型定义
│   │   ├── agent-pool.ts         # VirtualAgentPool引擎
│   │   ├── checkpoint.ts         # 三级Checkpoint服务
│   │   ├── monitor.ts            # ResilienceMonitor监控
│   │   └── protocol/
│   │       └── bnf-parser.ts     # BNF协议解析器
│   └── fabric/
│       └── compressor.ts         # ContextCompressor引擎
├── app/
│   └── api/
│       └── virtualized/
│           ├── spawn/route.ts    # POST /api/virtualized/spawn
│           ├── remix/route.ts    # POST /api/virtualized/remix
│           ├── rollback/route.ts # POST /api/virtualized/rollback
│           └── ui/
│               └── floating-ball.ts  # 客服小祥悬浮球
├── tests/
│   ├── agent-pool.test.ts       # 工单1自测
│   ├── checkpoint.test.ts       # 工单2自测
│   ├── compressor.test.ts       # 工单3自测
│   ├── protocol.spec.ts         # 工单4自测
│   ├── monitor.test.ts          # 工单5自测
│   └── api.test.ts              # 工单6自测
├── MIKE_AUDIT_REPORT.md         # Mike双报告审计
├── SHA256_CHECKSUMS.txt         # 校验和
└── README.md                    # 本文件
```

---

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
npm test
```

### 构建项目

```bash
npm run build
```

---

## 📡 API端点

### POST /api/virtualized/spawn

创建新的VirtualAgent实例。

**快捷键**: Ctrl+R

**请求体**:
```json
{
  "id": "agent-001",
  "retryLimit": 3,
  "bnfCommand": "[SPAWN:agent-001:RETRY:3]"
}
```

**响应**:
```json
{
  "success": true,
  "agentId": "agent-001",
  "contextBoundary": "sha256:...",
  "state": "RUNNING",
  "timestamp": 1708000000000
}
```

### POST /api/virtualized/remix

压缩并生成Remix Pattern。

**快捷键**: Ctrl+M

**请求体**:
```json
{
  "data": "原始上下文数据",
  "mode": "BALANCED"
}
```

**响应**:
```json
{
  "success": true,
  "pattern": {
    "type": "REMIXED_CONTEXT",
    "compression": {
      "compressionRatio": 0.85
    }
  }
}
```

### POST /api/virtualized/rollback

执行YGGDRASIL回滚。

**快捷键**: Ctrl+Z

**请求体**:
```json
{
  "checkpointId": "chk-...",
  "level": "L1",
  "agentId": "agent-001"
}
```

---

## 🎮 快捷键绑定

| 快捷键 | 端点 | 功能 |
|:---|:---|:---|
| Ctrl+R | /api/virtualized/spawn | 创建VirtualAgent |
| Ctrl+M | /api/virtualized/remix | 压缩生成Remix Pattern |
| Ctrl+Z | /api/virtualized/rollback | 执行YGGDRASIL回滚 |

---

## 📊 自测结果

| 工单 | 名称 | 自测项 | 结果 |
|:---|:---|:---:|:---:|
| 1/6 | VirtualAgentPool核心引擎 | 4/4 | ✅ |
| 2/6 | 三级Checkpoint服务 | 4/4 | ✅ |
| 3/6 | ContextCompressor压缩引擎 | 4/4 | ✅ |
| 4/6 | BNF协议运行时解析器 | 4/4 | ✅ |
| 5/6 | ResilienceMonitor韧性监控 | 4/4 | ✅ |
| 6/6 | API层与YGGDRASIL集成 | 5/5 | ✅ |
| **总计** | | **25/25** | **✅** |

---

## 🔒 债务声明

| 债务ID | 描述 | 状态 |
|:---|:---|:---:|
| DEBT-VIRT-001 | L3级Git归档需用户配置git user.name/email | ✅ 已文档化 |
| DEBT-VIRT-002 | Prometheus指标端点可选 | ✅ 已实现接口 |
| DEBT-VIRT-003 | Wave3的7天数据为模拟/缩短周期测试 | ✅ 已声明 |

---

## 📈 性能指标

| 指标 | 目标 | 实际 |
|:---|:---:|:---:|
| BNF解析耗时 | <10ms | ✅ |
| L1 Checkpoint时延 | <200ms | ✅ |
| 压缩率 | >80% | ✅ |
| 污染率 | <5% | ✅ |

---

## 📝 参考规范

- **ID-85**: 九维理论报告
- **ID-78**: YGGDRASIL聊天治理四象限
- **ID-77**: Phase 5人格化UI
- **ID-31**: Fabric装备化扩展

---

## 📄 许可证

MIT License

---

**HAJIMI VIRTUALIZED** - 唐音开工 ☝️😋🐍♾️💥
