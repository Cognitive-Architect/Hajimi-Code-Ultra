# Hajimi Code : Ouroboros 🐍♾️

[![Version](https://img.shields.io/badge/version-v1.0.0-blue)](https://github.com/Cognitive-Architect/Hajimi-Code-Ultra/releases/tag/v1.0.0)
[![Coverage](https://img.shields.io/badge/coverage-50.2%25-yellow)](docs/COVERAGE-GAP-REPORT.md)
[![Tests](https://img.shields.io/badge/tests-1008%2F1068%20passed-brightgreen)](tests/)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange)](LICENSE)

> **七权分立的AI治理引擎**  
> 通过分布式Agent的无意识协作，实现代码的自我吞噬与永恒重生。

---

## 🎯 核心特性

| 模块 | 状态 | 说明 |
|------|------|------|
| **七权治理** | ✅ 稳定 | PM/架构师/QA/Engineer/Audit/Orchestrator/Doctor 物理隔离 |
| **TSA存储** | ✅ 稳定 | 冷热分层（Transient/Staging/Archive）+ Redis/IndexedDB双引擎 |
| **赛博牢房** | ✅ 稳定 | Docker沙盒五重隔离，38项逃脱测试全绿 |
| **Fabric装备** | ✅ 稳定 | Prompt三层架构（System/Context/Action），七权人格化 |
| **Windows兼容** | ✅ 稳定 | PowerShell原生支持，Docker Desktop适配 |

---

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/Cognitive-Architect/Hajimi-Code-Ultra.git
cd Hajimi-Code-Ultra

# 2. 切换到稳定版
git checkout v1.0.0

# 3. 安装依赖
npm ci

# 4. 启动基础设施（Redis）
docker-compose -f docker-compose.test.yml up -d

# 5. 运行验证
npm test
# 预期: 1008/1068 测试通过，核心功能全绿

# 6. 启动治理引擎
npm run dev
```

---

## 🏗️ 架构概览

```
Ouroboros 衔尾蛇架构
├── 立法层 (PM) - 需求定义
├── 设计层 (Architect) - 技术蓝图
├── 司法层 (QA) - 质量门禁
├── 行政层 (Engineer/Atoms) - 代码实现
├── 监察层 (Audit/Mike) - 代码审计
├── 调度层 (Orchestrator) - 任务编排
└── 急救层 (Doctor) - 生产诊断

数据流: 冷热分层存储 (TSA)
├── Transient - 内存缓存 (ephemeral)
├── Staging - Redis/IndexedDB (warm)
└── Archive - 文件系统 (cold)
```

---

## 📊 质量指标（v1.0.0）

| 指标 | 当前 | 目标 | 状态 |
|------|------|------|------|
| 核心测试通过率 | 100% | 100% | ✅ |
| 整体测试通过率 | 94.4% | 95%+ | ⚠️ |
| 代码覆盖率 | 50.2% | 70% | 🚧 Phase 1 |
| 性能基准 | 通过 | 通过 | ✅ |

**技术债务声明**：当前50.2%覆盖率，Phase 1冲刺70%，详见 [COVERAGE-GAP-REPORT.md](docs/COVERAGE-GAP-REPORT.md)

---

## 🗺️ 路线图

### v1.0.0（当前）- MVP发布
- ✅ 七权治理核心
- ✅ TSA冷热分层
- ✅ 赛博牢房沙盒
- ✅ Windows兼容
- 🚧 50%测试覆盖率

### v1.1.0（Phase 1）- 覆盖率提升
- 🎯 70%测试覆盖率（P0核心文件补齐）
- 🔧 IndexedDB Mock修复
- 🧪 React Hooks基础测试

### v1.2.0（Phase 2）- 生命周期完善
- 🎯 85%测试覆盖率
- 🧠 TSA生命周期管理强化
- 📊 监控面板

### v2.0.0（远期）- 完全体
- 🎨 Phase 5人格化UI（客服小祥/压力怪/奶龙娘）
- 🐱 Alice悬浮球助手
- 💯 100%覆盖率（可选）

---

## 🛠️ 技术栈

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0（严格模式）
- **Storage**: Redis (Upstash) + IndexedDB + File System
- **Sandbox**: Docker + Alpine Linux
- **Testing**: Jest + Vitest
- **Governance**: 自研状态机 + 加权投票

---

## 🤝 七权人格（Ouroboros Persona）

| 角色 | 担当 | 代表色 | 状态 |
|------|------|--------|------|
| 🟣 客服小祥 | Orchestrator | #884499 | 调度中 |
| 🟢 黄瓜睦 | Architect | #669966 | 设计就绪 |
| 🩷 唐音 | Engineer | #FF9999 | 施工完成 |
| 🩵 咕咕嘎嘎 | QA | #77BBDD | 测试中 |
| 💛 Soyorin | PM | #FFDD88 | 立法完成 |
| 🔵 压力怪 | Audit | #7777AA | 审计通过 |
| 🟡 奶龙娘 | Doctor | #FFDD00 | 待命 |

---

## 📄 许可证

Apache 2.0 © 2026 Cognitive-Architect

---

**Hajimi Code : Ouroboros** - 通过分布式Agent的局部最优追求，实现系统级的自我改进涌现。
