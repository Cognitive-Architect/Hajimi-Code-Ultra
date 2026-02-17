# HAJIMI-OR-IPDIRECT 实现报告

> **版本**: v1.4.0-alpha  
> **工单**: B-09/09 六件套  
> **日期**: 2026-02-17

---

## 1. 项目概述

### 1.1 目标

解决 Windows 环境下 OpenRouter API 的 DNS 解析失败问题（`ENOTFOUND api.openrouter.ai`），通过 Cloudflare IP 直连实现可靠连接。

### 1.2 核心特性

- ✅ IP 直连绕过 DNS（104.21.63.51）
- ✅ 自动模型 ID 映射（漂移处理）
- ✅ 熔断器容错（Circuit Breaker）
- ✅ IP 健康检查与故障转移
- ✅ 统一遥测与 Alice 状态同步
- ✅ 安全白名单与审计日志
- ✅ 紧急回滚机制（Kill Switch）

---

## 2. 文件清单

### 2.1 新增文件（8个）

| 路径 | 说明 | 行数 |
|------|------|------|
| `lib/quintant/types.ts` | 核心类型定义 | 280 |
| `lib/quintant/adapters/openrouter-ip-direct.ts` | Adapter 实现 | 580 |
| `lib/config/or-loader.ts` | 配置加载器 | 370 |
| `lib/resilience/or-circuit-breaker.ts` | 熔断器 | 340 |
| `lib/resilience/ip-health-check.ts` | IP 健康检查 | 390 |
| `lib/observability/or-telemetry.ts` | 遥测系统 | 450 |
| `lib/security/ip-whitelist.ts` | IP 白名单 | 250 |
| `lib/emergency/or-fallback.ts` | 应急回滚 | 510 |

### 2.2 配置文件（1个）

| 路径 | 说明 |
|------|------|
| `config/or-bypass.json` | 运行时配置 |

### 2.3 脚本文件（2个）

| 路径 | 说明 |
|------|------|
| `scripts/verify-or-connection.sh` | 连接验证脚本 |
| `scripts/or-debug-doctor.sh` | 诊断医生脚本 |

### 2.4 文档文件（2个）

| 路径 | 说明 |
|------|------|
| `design/or-ipdirect/architecture.md` | 架构设计文档 |
| `docs/security/or-tls-bypass-risks.md` | 安全风险评估 |

### 2.5 待修改文件（2个）

| 路径 | 说明 |
|------|------|
| `lib/quintant/factory.ts` | 注册新 Adapter |
| `package.json` | 添加脚本命令 |

---

## 3. 技术债务声明

| ID | 债务项 | 风险 | 计划 |
|----|--------|------|------|
| DEBT-OR-001 | 模型漂移接受 | 低 | 持续更新映射表 |
| DEBT-OR-002 | TLS 绕过安全风险 | 中 | IP 白名单缓解 |
| DEBT-OR-003 | IP 池硬编码需定期更新 | 低 | 季度审查 |

---

## 4. 验收状态

- [ ] TypeScript 零错误
- [ ] 单元测试 >80% 覆盖
- [ ] 假阳性验证脚本通过
- [ ] Git Tag v1.4.0-alpha 推送

