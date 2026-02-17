# HAJIMI v1.5.0 README 白皮书 - Engineering MVP 与快速开始

> **文档编号**: HAJIMI-v1.5.0-README-白皮书  
> **版本**: v1.0  
> **日期**: 2026-02-17  
> **工单**: B-05/09 Engineering MVP与快速开始

---

## 目录

- [3.3 组件清单](#33-组件清单)
  - [3.3.1 已交付组件表](#331-已交付组件表)
  - [3.3.2 待施工组件表](#332-待施工组件表)
- [3.4 快速开始](#34-快速开始)
  - [3.4.1 环境准备](#341-环境准备)
  - [3.4.2 快速开始命令](#342-快速开始命令)
  - [3.4.3 验证安装](#343-验证安装)
  - [3.4.4 监控指标](#344-监控指标)

---

## 3.3 组件清单

### 3.3.1 已交付组件表

以下组件已在 v1.5.0-lcr-alpha-typefix 版本中完成交付并通过验证：

| 组件 | 版本 | 验证命令 | 状态 |
|:---|:---|:---|:---:|
| TYPE-FIX-001 | v1.0 | `npx tsc --noEmit` | ✅ |
| ALICE-ML | v1.4 | `npm test alice` | ✅ |
| ALICE-UI | v1.4 | `npm run build` | ✅ |
| LCR-Luxury | v1.5 | `npm test lcr` | ✅ |

#### 组件说明

| 组件 | 功能描述 | 关键特性 |
|:---|:---|:---|
| **TYPE-FIX-001** | TypeScript 类型系统修复包 | 全项目零类型错误，严格模式通过 |
| **ALICE-ML** | 本地机器学习推理引擎 | MobileBERT/DistilBERT 轻量嵌入，NPU 加速 |
| **ALICE-UI** | 人格化交互界面系统 | 七角色主题系统，CSS 变量动态切换 |
| **LCR-Luxury** | 本地上下文运行时豪华版 | 四级 Workspace 架构，增量快照，CRDT 同步 |

---

### 3.3.2 待施工组件表

以下组件处于设计冻结状态（代码 0%），将在后续版本中逐步交付：

| 组件 | 状态 | 债务 | 计划版本 |
|:---|:---|:---|:---:|
| B-01 Context Snapper | 设计冻结代码 0% | DEBT-LCR-001 | v1.5.1 |
| B-02 Workspace v2.0 | 设计冻结代码 0% | DEBT-LCR-002 | v1.5.1 |
| B-03 Tiered Memory | 设计冻结代码 0% | DEBT-LCR-003 | v1.5.2 |
| B-04 Hybrid RAG | 设计冻结代码 0% | DEBT-LCR-004 | v1.5.2 |
| B-05 Predictive GC | 设计冻结代码 0% | DEBT-LCR-005 | v1.5.3 |
| B-06 Cross-Device Sync | 设计冻结代码 0% | DEBT-LCR-006 | v1.5.3 |
| B-07 Secure Enclave | 设计冻结代码 0% | DEBT-LCR-007 | v1.5.4 |
| B-08 Alice Vision 3D | 设计冻结代码 0% | DEBT-LCR-008 | v1.5.4 |
| B-09 Meta-Bootstrap | 设计冻结代码 0% | DEBT-LCR-009 | v1.5.5 |

#### 优先级分层

| 优先级 | 工单 | 功能领域 | 可用性要求 |
|:---|:---|:---|:---|
| **P0（核心）** | B-01 / B-02 / B-03 | 本地存储 + 分层 | **必须可用，阻塞发布** |
| **P1（增强）** | B-04 / B-05 / B-06 | RAG + GC + 同步 | 功能完备，性能可妥协 |
| **P2（豪华）** | B-07 / B-08 / B-09 | 安全 + 3D + 自举 | 模拟实现可接受 |

---

## 3.4 快速开始

### 3.4.1 环境准备

| 依赖项 | 版本要求 | 验证命令 |
|:---|:---|:---|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.35.0 | `git --version` |
| TypeScript | >= 5.0.0 | `npx tsc --version` |
| Redis | >= 6.0（可选） | `redis-cli ping` |

---

### 3.4.2 快速开始命令

四步完成项目克隆与初始化：

```bash
# Step 1: 克隆仓库
git clone https://github.com/Cognitive-Architect/Hajimi-Code-Ultra.git

# Step 2: 进入项目目录
cd Hajimi-Code-Ultra

# Step 3: 切换至 v1.5.0-lcr-alpha-typefix 分支
git checkout v1.5.0-lcr-alpha-typefix

# Step 4: 安装依赖并验证类型
npm install && npx tsc --noEmit
```

#### 命令详解

| 步骤 | 命令 | 作用 | 预期耗时 |
|:---:|:---|:---|:---:|
| 1 | `git clone` | 下载项目源码 | ~30s |
| 2 | `cd` | 切换工作目录 | <1s |
| 3 | `git checkout` | 切换到指定版本 | ~5s |
| 4 | `npm install && npx tsc --noEmit` | 安装依赖 + 类型检查 | ~60s |

---

### 3.4.3 验证安装

执行以下命令验证各组件状态：

```bash
# 验证 TypeScript 类型完整性（README-013）
npx tsc --noEmit

# 验证 ALICE-ML 组件
npm test alice

# 验证 ALICE-UI 组件
npm run build

# 验证 LCR-Luxury 组件
npm test lcr

# 启动开发服务器
npm run dev
```

#### 成功标志

| 验证项 | 成功标志 |
|:---|:---|
| TypeScript 类型检查 | `0 errors, 0 warnings` |
| ALICE-ML 测试 | `Test Suites: X passed` |
| ALICE-UI 构建 | `Build completed successfully` |
| LCR-Luxury 测试 | `All LCR tests passed` |
| 开发服务器 | `Ready on http://localhost:3000` |

---

### 3.4.4 监控指标

系统运行时关键性能指标（SLO）：

| 指标类别 | 指标名称 | 目标值 | 测量方法 |
|:---|:---|:---:|:---|
| **响应延迟** | 状态切换延迟 | **< 50ms** | Lighthouse TTI / 自定义埋点 |
| **缓存性能** | Redis 操作延迟 | **< 100ms** | Redis SLOWLOG / 应用埋点 |
| **治理效率** | 治理投票延迟 | **< 200ms** | 合约事件日志 / 区块时间戳 |
| **类型检查** | TypeScript 编译 | **< 10s** | `time npx tsc --noEmit` |
| **构建时间** | 生产构建耗时 | **< 60s** | `time npm run build` |

#### 监控 Dashboard

```bash
# 启动性能监控面板（开发模式）
npm run monitor:dev

# 查看实时指标
open http://localhost:3000/metrics
```

---

## 附录：自测点验证

### [README-013] 已交付组件验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| TYPE-FIX-001 存在 | 已交付组件表包含 TYPE-FIX-001 | 文档审查 | ✅ |
| 验证命令正确 | 验证命令为 `npx tsc --noEmit` | 文档审查 | ✅ |

### [README-014] 待施工组件验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| B-01~B-09 存在 | 待施工组件表包含全部 9 项 | 文档审查 | ✅ |
| 状态声明 | 状态为"设计冻结代码 0%" | 文档审查 | ✅ |

### [README-015] 快速开始验证

| 检查项 | 要求 | 验证方法 | 状态 |
|:---|:---|:---|:---:|
| git checkout 命令 | 包含 `git checkout v1.5.0-lcr-alpha` | 文档审查 | ✅ |
| 四步完整性 | 克隆→进入→切换→安装验证 | 文档审查 | ✅ |

---

## 文档信息

| 属性 | 值 |
|:---|:---|
| **文档编号** | HAJIMI-v1.5.0-README-B-05 |
| **版本** | v1.0 |
| **日期** | 2026-02-17 |
| **作者** | Engineering MVP 工作组 |
| **状态** | 已交付 |

---

*本文档作为 HAJIMI v1.5.0 README 白皮书化的第 3.3-3.4 节，遵循白皮书格式规范编写。*
