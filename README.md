# Hajimi V2.1 MVP Core

[![Coverage](https://img.shields.io/badge/coverage-50.2%25-yellow)](docs/COVERAGE-100-CERTIFICATE.md)
[![Tests](https://img.shields.io/badge/tests-1008%2F1068%20passed-yellow)](docs/COVERAGE-100-CERTIFICATE.md)
[![Version](https://img.shields.io/badge/version-v2.1.0-blue)](package.json)

> 客服小祥 · 100%验收官 目标进行中 🎯

## 项目简介

Hajimi V2.1 MVP Core 是一个多层架构存储系统，提供：

- **TSA (Tiered Storage Architecture)**: 三层存储架构
- **状态机**: 提案生命周期管理
- **A2A**: Agent-to-Agent 通信
- **治理引擎**: 投票与决策系统

## 快速开始

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 查看覆盖率
npm run test:coverage
```

## 测试状态

| 指标 | 当前状态 | 目标 |
|------|---------|------|
| 测试通过率 | 94.4% (1008/1068) | 100% |
| 语句覆盖率 | 50.2% | 100% |
| 分支覆盖率 | 43.53% | 100% |
| 函数覆盖率 | 46.6% | 100% |
| 行覆盖率 | 51.67% | 100% |

查看详细报告：[COVERAGE-100-CERTIFICATE.md](docs/COVERAGE-100-CERTIFICATE.md)

## 模块结构

```
lib/
├── api/              # API 层
├── core/             # 核心模块
│   ├── agents/       # Agent 服务
│   ├── governance/   # 治理引擎
│   └── state/        # 状态机
├── tsa/              # 三层存储架构
│   ├── lifecycle/    # 生命周期管理
│   ├── persistence/  # 持久化层
│   └── resilience/   # 韧性机制
└── types/            # 类型定义
```

## 开发团队

- 客服小祥 · 100%验收官 🤖

## 许可证

MIT
