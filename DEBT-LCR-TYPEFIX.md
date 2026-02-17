# TYPE-FIX-001 技术债务清册

**工程**: HAJIMI-TYPE-FIX-001 TypeScript严格模式修复  
**日期**: 2026-02-17  
**债务总数**: 3项  

---

## 已清偿债务（P0 → 完成）

| 债务ID | 描述 | 清偿方式 |
|:---|:---|:---|
| DEBT-TSA-001 | TSA类型导出缺失 | B-01: 添加StorageTier等类型定义 |
| DEBT-VIRT-001 | Virtualized类型重导出 | B-03/B-04: 使用export type语法 |
| DEBT-TS-001 | 54个TS编译错误 | B-01~B-09: 系统性修复 |
| DEBT-ANY-001 | 隐式any参数 | B-05: 添加显式类型注解 |
| DEBT-NULL-001 | 空值检查缺失 | B-07: 添加严格空值检查 |

---

## 在途债务（P1/P2）

### DEBT-TYPE-001: ws.d.ts 简化类型声明

| 属性 | 内容 |
|:---|:---|
| **级别** | P2 |
| **位置** | `types/ws.d.ts` |
| **问题** | WebSocket类型声明为简化版，未覆盖完整API |
| **影响** | 开发时缺少完整类型提示，但不会导致运行时错误 |
| **缓解措施** | 当前类型覆盖项目使用场景 |
| **清除计划** | v1.5.1 安装 `@types/ws` 官方类型包 |
| **验收标准** | `npm install --save-dev @types/ws` 后类型检查仍通过 |

---

### DEBT-TYPE-002: AgentRole 类型值未统一

| 属性 | 内容 |
|:---|:---|
| **级别** | P2 |
| **位置** | `lib/yggdrasil/types.ts`, `lib/yggdrasil/branching-service.ts` |
| **问题** | AgentRole类型存在字符串值不一致：'arch' vs 'architect', 'auditor' vs 'audit' |
| **影响** | 类型严格检查时需要映射转换 |
| **缓解措施** | B-09已修复调用点，使用正确的枚举值 |
| **清除计划** | v1.5.1 统一为完整的AgentRole枚举 |
| **验收标准** | 全项目使用统一枚举，无字符串硬编码 |

**当前映射**:
```typescript
// 当前（分散字符串）
'arch', 'pm', 'qa', 'engineer', 'mike', 'system'

// 目标（统一枚举）
enum AgentRole {
  ARCHITECT = 'arch',
  PM = 'pm',
  QA = 'qa',
  ENGINEER = 'engineer',
  AUDITOR = 'mike',      // 或改为 'auditor'
  SYSTEM = 'system',
}
```

---

### DEBT-TYPE-003: tsa 存储为内存实现

| 属性 | 内容 |
|:---|:---|
| **级别** | P1 |
| **位置** | `lib/tsa/types.ts` - tsa命名空间 |
| **问题** | tsa.set/get/remove使用Map内存存储，页面刷新数据丢失 |
| **影响** | 生产环境数据持久性不足 |
| **缓解措施** | 当前适用于开发/测试环境；生产可配置Redis适配器 |
| **清除计划** | v1.6.0 实现持久化存储后端（IndexedDB/Redis） |
| **验收标准** | tsa存储可配置，支持localStorage/IndexedDB/Redis |

**当前实现**:
```typescript
const storage = new Map<string, unknown>(); // 内存存储
```

**目标实现**:
```typescript
type StorageBackend = 'memory' | 'localStorage' | 'indexedDB' | 'redis';

interface TSAConfig {
  backend: StorageBackend;
  redisUrl?: string;
}
```

---

## 债务路线图

| 版本 | 目标债务 | 预计时间 |
|:---|:---|:---:|
| v1.5.1 | DEBT-TYPE-001, DEBT-TYPE-002 | 2026-02-24 |
| v1.6.0 | DEBT-TYPE-003 | 2026-03-10 |

---

## 诚实声明

本债务清册遵循 Hajimi Code Ultra 技术债务管理规范：

1. **全部已知限制已明示** —— 无隐藏债务
2. **每项债务有明确清除计划** —— P1/P2分级管理
3. **债务与代码同步更新** —— 定期回顾（每版本发布前）
4. **不影响当前发布可用性** —— P2债务为优化项，非阻塞

---

**债务管理人**: 压力怪 (Audit)  
**下次回顾**: v1.5.1 发布前  
*文档版本: v1.0.0*
