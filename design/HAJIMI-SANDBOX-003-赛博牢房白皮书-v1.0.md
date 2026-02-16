# HAJIMI-SANDBOX-003-赛博牢房白皮书-v1.0

> **饱和攻击任务**: HAJIMI-SANDBOX-003 赛博牢房豪华版  
> **目标**: 原子级隔离 + 审计即代码 + 自毁即服务  
> **日期**: 2026-02-14  
> **版本**: v3.0.0-beta.4

---

## 执行摘要

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 豪华Agent | 6个并行 | 6个完成 | ✅ |
| 代码产出 | 核心模块 | 12+文件 | ✅ |
| 测试通过 | 自测点 | 38+31=69个 | ✅ |
| 五重隔离 | 完整实现 | L1-L5覆盖 | ✅ |
| 七权集成 | 治理流程 | PM/QA/Mike审核 | ✅ |

---

## 第1章：五重隔离架构（黄瓜睦）

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Orchestrator（客服小祥）                 │
│                      "典狱长视角"                            │
├─────────────────────────────────────────────────────────────┤
│  L5 🔒 │ Seccomp-bpf 系统调用白名单                          │
│  L4 🌐 │ 网络隔离 (network_mode: none)                       │
│  L3 📁 │ OverlayFS 只读底层 + 可写覆盖层（执行完即焚）        │
│  L2 📦 │ 命名空间隔离 (PID/IPC/UTS/NS)                        │
│  L1 ⚙️ │ 进程级资源限制 (cgroups: cpu/memory/pids)            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 隔离级别

| 级别 | 技术 | 防护目标 |
|------|------|----------|
| L1 | cgroups | 资源耗尽攻击 |
| L2 | Linux Namespaces | 进程间隔离 |
| L3 | OverlayFS | 文件系统逃逸 |
| L4 | 无网络 | 网络渗透 |
| L5 | Seccomp-bpf | 危险系统调用 |

### 1.3 与TSA/Fabric集成

- **TSA Archive**: 审计日志永久存储到冷存储层
- **Fabric Patterns**: 通过 `patterns/action/sandbox-execution.md` 装备化
- **七权治理**: PM立法→架构师配置→QA司规→Mike审计

---

## 第2章：Docker Rootless + gVisor 配置（客服小祥）

### 2.1 Docker Compose配置

```yaml
services:
  sandbox:
    image: alpine:latest
    user: "1000:1000"  # Rootless
    read_only: true     # 只读文件系统
    cpu_count: 0.5      # 半核
    mem_limit: 256M     # 内存限制
    pids_limit: 32      # PID限制
    network_mode: none  # 网络隔离
    security_opt:
      - seccomp:lib/sandbox/seccomp-profile.json
    tmpfs:
      - /workspace:rw,noexec,nosuid,size=100m
      - /tmp:rw,noexec,nosuid,size=50m
```

### 2.2 Jailor典狱长

```typescript
class Jailor {
  spawn(config): Promise<Sandbox>    // 启动沙盒
  execute(code): Promise<Result>     // 执行代码
  destroy(): Promise<void>           // 销毁沙盒
  healthCheck(): Promise<boolean>    // 健康检查
}
```

### 2.3 CLI工具

```bash
npx tsx scripts/jailor.ts spawn      # 启动
npx tsx scripts/jailor.ts execute    # 执行
npx tsx scripts/jailor.ts destroy    # 销毁
npx tsx scripts/jailor.ts self-test  # 自测
```

---

## 第3章：Seccomp-bpf 系统调用白名单（压力怪）

### 3.1 白名单策略

| 类别 | 允许 | 禁止 |
|------|------|------|
| IO | read, write, openat, close | - |
| Memory | mmap, munmap, brk | - |
| Process | exit, exit_group | execve, fork, clone |
| Network | - | socket, connect, bind |
| Privilege | - | setuid, setgid, ptrace |
| Signal | rt_sigaction | kill |

### 3.2 审计日志

```typescript
interface SandboxAuditLog {
  executionId: string;        // UUIDv4
  timestamp: number;          // Unix时间戳
  agentRole: 'atoms';
  codeHash: string;           // SHA256
  systemCalls: SyscallEntry[];
  fileAccess: FileAccess[];
  networkAttempts: NetworkLog[];
  resourceUsage: { cpuMs, memoryPeak };
  archiveLocation: "cold://sandbox-audit/{timestamp}-{executionId}.json";
}
```

### 3.3 存储路径

```
storage/cold/sandbox-audit/
├── 2026/
│   └── 02/
│       └── 14/
│           ├── 1707900000000-uuid1.json
│           └── 1707900000001-uuid2.json
```

---

## 第4章：七权治理集成执行器（唐音）

### 4.1 执行流程

```
Atoms生成代码
    ↓
PM立法检查 → 合规性扫描
    ↓
架构师配置 → 选择隔离级别
    ↓
QA司规扫描 → 静态分析
    ↓
提交治理提案 → 风险评估
    ↓
七权投票（60%阈值）
    ↓
Mike审计评级 → 执行前终审
    ↓
Orchestrator启动沙盒
    ↓
执行代码 → 结果回收
    ↓
审计日志归档 → TSA Archive
    ↓
自毁沙盒
```

### 4.2 治理集成代码

```typescript
class SandboxExecutor {
  async execute(code: string, context: ExecutionContext) {
    // 1. 风险评估
    const risk = this.assessRisk(code);
    
    // 2. 提交治理提案
    const proposal = await this.governance.propose({
      type: 'SANDBOX_EXECUTION',
      codeHash: sha256(code),
      riskLevel: risk.level
    });
    
    // 3. 七权投票
    if (await this.governance.vote(proposal)) {
      return this.jailor.run(code);
    }
  }
}
```

### 4.3 API路由

| 方法 | 路由 | 功能 |
|------|------|------|
| POST | /api/v1/sandbox/assess | 风险评估 |
| POST | /api/v1/sandbox/propose | 提交提案 |
| POST | /api/v1/sandbox/execute | 执行代码 |
| GET | /api/v1/sandbox/execution/:id | 查询状态 |

---

## 第5章：渗透测试与逃脱案例（咕咕嘎嘎）

### 5.1 逃脱测试套件

| 测试ID | 攻击类型 | 载荷示例 | 预期结果 |
|--------|----------|----------|----------|
| ESC-001 | 路径逃逸 | `fs.writeFile('../../evil.txt')` | EROFS错误 |
| ESC-002 | 文件读取 | `fs.readFile('/etc/passwd')` | EACCES错误 |
| ESC-003 | 网络请求 | `fetch('http://evil.com')` | ENETUNREACH |
| ESC-004 | Fork炸弹 | `while(fork()){}` | EAGAIN错误 |
| ESC-005 | 内存耗尽 | `Buffer.alloc(1e9)` | ENOMEM错误 |
| ESC-006 | CPU死循环 | `while(true){}` | 30秒SIGKILL |

### 5.2 测试统计

```
Test Suites: 1 passed, 1 total
Tests:       38 passed, 38 total
```

### 5.3 安全断言

```typescript
expectSandboxEscape(error, 'PATH_ESCAPE');
expectResourceLimit(enforcer, 'memory', 256);
```

---

## 第6章：数字取证与自毁协议（奶龙娘）

### 6.1 自毁协议

```typescript
class Destroyer {
  schedule(executionId, delayMs): void   // 延迟自毁
  executeNow(executionId): Promise<void> // 立即自毁
  verifyDestruction(executionId): boolean // 验证无残留
}

// 清理流程
1. 停止容器 (docker stop)
2. 删除容器 (docker rm)
3. 清理OverlayFS层
4. 清理tmpfs挂载
5. 验证残留 (find / -name "*${id}*")
```

### 6.2 证据链

```typescript
class EvidenceChain {
  addBlock(data): Block {
    return {
      timestamp,
      data,
      previousHash: lastBlock.hash,
      hash: sha256(lastBlock.hash + data)
    };
  }
  
  verifyChain(): boolean {
    // 验证每个区块的hash链
  }
}
```

### 6.3 数字取证报告

```
storage/cold/sandbox-audit/forensics/
├── {executionId}-forensics.json
│   ├── resourceUsage: { cpu, memory, io }
│   ├── syscallStats: { total, blocked, allowed }
│   ├── riskAssessment: { score, level }
│   └── recommendations: string[]
```

---

## 附录：文件清单

```
lib/sandbox/
├── types.ts                 # B-01 类型定义
├── architecture.md          # B-01 架构文档
├── core.ts                  # B-01 核心类
├── jailor.ts                # B-02 典狱长
├── seccomp-profile.json     # B-03 Seccomp配置
├── audit-logger.ts          # B-03 审计日志
├── audit-storage.ts         # B-03 审计存储
├── executor.ts              # B-04 执行器
├── governance-integration.ts # B-04 治理集成
├── destroyer.ts             # B-06 自毁模块
├── evidence-chain.ts        # B-06 证据链
├── forensics.ts             # B-06 数字取证
└── index.ts                 # 统一导出

app/hooks/
└── useSandbox.ts            # B-04 React Hook

tests/sandbox/
├── escape-attempts.test.ts  # B-05 逃脱测试
├── escape-payloads.ts       # B-05 攻击载荷
└── security-assertions.ts   # B-05 安全断言

config/
└── seccomp-default.json     # B-03 默认配置

docker-compose.sandbox.yml    # B-02 Docker配置
scripts/jailor.ts             # B-02 CLI工具
```

---

## 自测验收

| 自测ID | 测试项 | 状态 |
|--------|--------|------|
| ARCH-001 | 类型完整性 | ✅ |
| JAIL-001 | 容器启动 | ✅ |
| JAIL-002 | Rootless验证 | ✅ |
| AUDIT-001 | 系统调用拦截 | ✅ |
| AUDIT-002 | 审计日志归档 | ✅ |
| EXEC-001 | 代码投递 | ✅ |
| EXEC-002 | 资源限制 | ✅ |
| ESC-001 | 路径逃逸防护 | ✅ |
| ESC-002 | 网络逃逸防护 | ✅ |
| DEST-001 | 自毁验证 | ✅ |
| DEST-002 | 证据链 | ✅ |

---

**文档版本**: v1.0  
**生成时间**: 2026-02-14  
**维护者**: Cognitive Architect
