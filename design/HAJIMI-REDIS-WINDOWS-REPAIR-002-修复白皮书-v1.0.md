# HAJIMI-REDIS-WINDOWS-REPAIR-002-修复白皮书-v1.0

> **饱和攻击任务**: HAJIMI-REDIS-WINDOWS-REPAIR-002 集群  
> **目标**: Windows Docker Redis连接修复 + 29失败修复  
> **日期**: 2026-02-14  
> **版本**: v3.0.0-beta.3

---

## 执行摘要

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 修复工单 | 6个并行 | 6个完成 | ✅ |
| 测试通过 | 233/262 → 250+/262 | **237/262** (90.5%) | ⚠️ |
| 核心修复 | Redis连接+权限+幂等 | 全部完成 | ✅ |
| 防火墙方案 | 不关闭防火墙 | 5条规则自动配置 | ✅ |
| 文档产出 | 白皮书+自测表 | 已完成 | ✅ |

---

## 第1章：Windows网络诊断报告（B-01）

### 1.1 连通性矩阵

| 连接地址 | TCP连通性 | 延迟 | 推荐度 |
|----------|-----------|------|--------|
| **127.0.0.1:6379** | ✅ 成功 | **2ms** | 🥇 **首选** |
| **localhost:6379** | ✅ 成功 | 28ms | 🥈 备选 |
| 172.17.0.2:6379 | ❌ 超时 | 5005ms | ❌ 避免 |
| host.docker.internal:6379 | ❌ 超时 | 5012ms | ❌ 避免 |

### 1.2 根因分析

**WSL2网络隔离** - 容器运行在WSL2 VM内部，Windows宿主机只能通过 `localhost/127.0.0.1` 访问端口映射的容器服务。

### 1.3 推荐配置

```powershell
$env:REDIS_URL="redis://127.0.0.1:6379"
```

---

## 第2章：Redis连接修复方案（B-02）

### 2.1 ioredis参数优化

```typescript
{
  enableOfflineQueue: false,      // 避免离线队列堆积
  lazyConnect: false,             // 立即连接，及时发现错误
  connectTimeout: 5000,           // Windows适配超时
  retryStrategy: (times) => {     // 指数退避+日志
    console.log(`[Redis] Reconnecting... attempt ${times}`);
    return Math.min(times * 50, 2000);
  }
}
```

### 2.2 localhost解析修复

```typescript
// 自动将localhost替换为127.0.0.1
if (url.includes('localhost')) {
  url = url.replace('localhost', '127.0.0.1');
}
```

### 2.3 连接诊断日志

- 连接前输出目标URL
- 连接事件 (connect/ready/error/close/reconnecting)
- 连接成功明确标识：✅ Connected to Redis successfully

---

## 第3章：测试用例修复清单（B-03）

### 3.1 system角色权限修复

| 状态流转 | 原权限 | 修复后 |
|----------|--------|--------|
| DESIGN → CODE | pm/arch | pm/arch/**system** |
| CODE → AUDIT | pm/arch/qa | pm/arch/qa/**system** |
| AUDIT → BUILD | pm/arch/qa/audit | pm/arch/qa/audit/**system** |

### 3.2 幂等性检查

```typescript
// 如果已经在目标状态，直接返回成功
if (from === to) {
  return { success: true, from, to, transition: {...} };
}
```

### 3.3 测试数据隔离

- 添加 `clearAllProposalsForTest()` 方法
- `beforeEach` 中调用清理，确保测试隔离

---

## 第4章：降级链验证报告（B-04）

### 4.1 验证结果

| 阶段 | 状态 | 耗时 |
|------|------|------|
| 正常模式 | ✅ | 391ms |
| Redis故障模式 | ✅ | 2032ms |
| 故障恢复 | ✅ | 3922ms |

### 4.2 切换时间

- Redis故障→Memory切换：约 100-500ms
- 降级事件通过 `console.warn` 输出
- Redis恢复后自动切回

---

## 第5章：Windows防火墙解决方案（B-05）

### 5.1 自动配置脚本

**scripts/windows-docker-fix.ps1** 支持三种模式：

```powershell
# 默认模式：自动配置所有规则
.\windows-docker-fix.ps1

# 验证模式：检查当前配置
.\windows-docker-fix.ps1 -Verify

# 清理模式：移除所有规则
.\windows-docker-fix.ps1 -RemoveRules
```

### 5.2 创建的规则

| 规则名称 | 用途 |
|---------|------|
| `Hajimi-Docker-Redis-Local` | 127.0.0.1访问Redis 6379 |
| `Hajimi-Docker-Docker-Desktop` | Docker Desktop程序例外 |
| `Hajimi-Docker-WSL` | WSL2动态端口 |
| `Hajimi-Docker-HyperV` | Hyper-V NAT网络 |
| `Hajimi-Docker-Redis-Container` | 容器网络访问 |

### 5.3 Netsh命令

```powershell
netsh advfirewall firewall add rule name="Hajimi-Docker-Redis-Local" dir=in action=allow protocol=tcp localport=6379 remoteip=127.0.0.1
```

---

## 第6章：全量回归验证结果（B-06）

### 6.1 测试统计

| 指标 | 数值 |
|------|------|
| 测试总数 | 262 |
| 通过 | **237** (90.5%) |
| 失败 | **25** (债务) |
| 执行时间 | ~23-37秒 |

### 6.2 剩余债务清单

| 优先级 | 数量 | 类型 | 说明 |
|--------|------|------|------|
| **P1** | 16 | 核心功能 | TSA存储层时序问题 |
| **P2** | 9 | 测试代码 | auth/RedisStore测试问题 |

### 6.3 覆盖率

| 指标 | 数值 |
|------|------|
| Statements | 45.39% |
| Branches | 41.83% |
| Functions | 41.24% |
| Lines | 46.4% |

---

## 附录：文件变更清单

```
lib/tsa/persistence/RedisStore.ts      | 优化ioredis连接参数
lib/core/state/rules.ts                | 添加system角色权限
lib/core/state/machine.ts              | 添加幂等性检查
lib/core/governance/vote-service.ts    | 修复返回值+测试清理
scripts/windows-docker-fix.ps1         | 防火墙自动配置脚本
design/*                               | 6份诊断/验证报告
```

---

## 升级指南

### 从 v3.0.0-beta.2 → v3.0.0-beta.3

```powershell
# 1. 更新代码
git pull origin v3.0-rebuild

# 2. 配置防火墙（不关闭！）
.\scripts\windows-docker-fix.ps1

# 3. 设置环境变量
$env:REDIS_URL="redis://127.0.0.1:6379"

# 4. 运行测试
npx jest --testPathPattern="governance-flow"
```

---

**文档版本**: v1.0  
**生成时间**: 2026-02-14  
**维护者**: Cognitive Architect
