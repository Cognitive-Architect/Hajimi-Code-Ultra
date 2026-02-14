# IndexedDBStore v2 使用指南

## 咕咕嘎嘎·IndexedDB矿工 - B-04/09 修复版

本文档介绍 IndexedDBStore v2 的使用方法和修复内容。

---

## 修复概述

### 解决的问题

1. **异步竞态条件** - 通过操作队列确保单线程访问
2. **浏览器刷新后数据丢失** - 通过 localStorage 双保险备份
3. **存储配额超限** - LRU 淘汰 + 优雅降级到 localStorage
4. **版本迁移** - 支持 IndexedDB schema 升级

---

## 快速开始

### 安装

IndexedDBStore v2 已集成在项目中，直接导入使用：

```typescript
import { IndexedDBStoreV2, DataPriority } from '@/lib/tsa/persistence';
```

### 基础用法

```typescript
// 创建实例
const store = new IndexedDBStoreV2({
  dbName: 'my-app-db',
  storeName: 'main-storage',
});

// 初始化
await store.initialize();

// 写入数据
await store.set('user-preferences', { theme: 'dark', lang: 'zh' });

// 读取数据
const prefs = await store.get<{ theme: string; lang: string }>('user-preferences');

// 关闭
await store.close();
```

---

## 配置选项

### 完整配置

```typescript
const store = new IndexedDBStoreV2({
  // IndexedDB 配置
  dbName: 'hajimi-tsa-v2',        // 数据库名称
  storeName: 'storage',            // 存储名称
  dbVersion: 2,                    // 数据库版本（用于迁移）
  
  // 清理任务配置
  enableCleanup: true,             // 启用定期清理
  cleanupIntervalMs: 60000,        // 清理间隔（默认1分钟）
  
  // localStorage 双保险配置
  localStorageBackup: {
    enabled: true,                 // 启用备份
    prefix: 'hajimi_idb_backup:',  // 备份键前缀
    maxItemSize: 1024 * 1024,      // 最大单项大小（1MB）
    criticalKeysPattern: /^session|^user|^auth|^config/i,  // 关键键匹配模式
  },
  
  // 配额管理配置
  quotaConfig: {
    maxTotalSize: 50 * 1024 * 1024,  // 最大总大小（50MB）
    warningThreshold: 0.8,            // 警告阈值（80%）
  },
  
  // LRU 配置
  enableLRU: true,                 // 启用 LRU 清理
  lruMaxItems: 10000,              // 最大项目数
  
  // 日志配置
  logger: customLogger,            // 自定义日志记录器（可选）
});
```

---

## 核心功能

### 1. 操作队列（解决竞态条件）

所有操作都通过 `OperationQueue` 排队执行，保证：

- **单线程访问** - 同一时间只有一个操作在执行
- **顺序保证** - 操作按调用顺序执行
- **并发安全** - 支持 `Promise.all` 并发调用，无竞态条件

```typescript
// 并发写入10个状态 - 安全无竞态
await Promise.all([
  store.set('key-1', { value: 1 }),
  store.set('key-2', { value: 2 }),
  // ... 更多并发写入
]);
```

### 2. localStorage 双保险

关键数据自动备份到 localStorage，浏览器刷新后可恢复：

```typescript
// 自动备份到 localStorage（匹配 criticalKeysPattern）
await store.set('session-token', token, {
  priority: DataPriority.CRITICAL,
});

// 强制备份（无论是否匹配模式）
await store.set('important-data', data, {
  backupToLocalStorage: true,
});
```

**恢复机制**：
- 初始化时自动从 localStorage 恢复
- 定期同步检查（每30秒）
- 读取时如 IndexedDB 缺失，自动从 localStorage 恢复

### 3. 存储配额管理

```typescript
// 配置配额限制
const store = new IndexedDBStoreV2({
  quotaConfig: {
    maxTotalSize: 100 * 1024 * 1024,  // 100MB
    warningThreshold: 0.9,              // 90% 时警告
  },
});
```

**配额超限处理流程**：
1. 触发 `QuotaExceededError`
2. 尝试 LRU 清理旧数据
3. 清理后重试写入
4. 如仍超限，降级到 localStorage 备份

### 4. LRU 淘汰策略

按优先级和访问时间排序淘汰：

```typescript
// 设置数据优先级
await store.set('temp-cache', data, { priority: DataPriority.LOW });      // 优先淘汰
await store.set('user-config', data, { priority: DataPriority.CRITICAL }); // 最后淘汰
```

淘汰顺序：
1. 优先级低的先淘汰（LOW → MEDIUM → HIGH → CRITICAL）
2. 同优先级下，访问时间早的先淘汰

### 5. 版本迁移

数据库版本升级时自动处理：

```typescript
// 从 v1 升级到 v2
const store = new IndexedDBStoreV2({
  dbName: 'my-db',
  dbVersion: 2,  // 升级到新版本
});

await store.initialize();
// 自动触发 onupgradeneeded，保留现有数据
```

---

## API 参考

### 基础操作

```typescript
// 获取
const value = await store.get<T>('key');

// 设置
await store.set('key', value, {
  ttl: 3600000,                    // 1小时后过期
  priority: DataPriority.HIGH,
  backupToLocalStorage: true,      // 备份到 localStorage
});

// 删除
await store.delete('key');

// 检查存在
const exists = await store.exists('key');
```

### 批量操作

```typescript
// 批量获取
const values = await store.mget(['key1', 'key2', 'key3']);

// 批量设置
await store.mset([
  { key: 'a', value: 1 },
  { key: 'b', value: 2 },
]);

// 批量删除
await store.mdelete(['key1', 'key2']);
```

### 查询和清理

```typescript
// 获取所有键（支持通配符）
const keys = await store.keys('user-*');

// 清理过期数据
const cleanedCount = await store.cleanup();

// 清空所有数据
await store.clear();
```

### 状态检查

```typescript
// 健康检查
const healthy = await store.healthCheck();

// 连接状态
const connected = store.isConnected;

// 可用性检查
const available = store.isAvailable;
```

---

## 与 TieredFallback 集成

```typescript
import { TieredFallback, IndexedDBStoreV2, MemoryStore } from '@/lib/tsa/persistence';

// 创建存储层
const indexedDBStore = new IndexedDBStoreV2({
  localStorageBackup: { enabled: true },
});

const memoryStore = new MemoryStore();

// 创建三层韧性管理器
const fallback = new TieredFallback(
  undefined,           // Redis（可选）
  indexedDBStore,      // IndexedDB v2
  {
    enableAutoFallback: true,
    enableAutoRecover: true,
  }
);

await fallback.initialize();
```

---

## 最佳实践

### 1. 关键数据使用高优先级

```typescript
// 用户会话 - 高优先级，不轻易淘汰
await store.set('session', sessionData, {
  priority: DataPriority.CRITICAL,
});

// 临时缓存 - 低优先级，优先淘汰
await store.set('cache', cacheData, {
  priority: DataPriority.LOW,
  ttl: 60000,  // 1分钟过期
});
```

### 2. 合理配置 localStorage 备份

```typescript
const store = new IndexedDBStoreV2({
  localStorageBackup: {
    enabled: true,
    // 只备份真正重要的键
    criticalKeysPattern: /^session|^user|^auth/i,
    // 限制单个项目大小
    maxItemSize: 512 * 1024,  // 512KB
  },
});
```

### 3. 监控存储配额

```typescript
// 配额警告时记录日志
const store = new IndexedDBStoreV2({
  quotaConfig: {
    maxTotalSize: 50 * 1024 * 1024,
    warningThreshold: 0.8,  // 80% 时触发警告
  },
  logger: {
    warn: (msg, ...args) => {
      if (msg.includes('Storage approaching quota')) {
        // 发送监控告警
        analytics.track('storage_quota_warning');
      }
    },
    // ... 其他日志方法
  },
});
```

---

## 故障排除

### 问题：数据写入后读取不到

**可能原因**：
- IndexedDB 初始化失败
- 数据已过期（TTL）

**解决方案**：
```typescript
// 检查连接状态
if (!store.isConnected) {
  await store.initialize();
}

// 写入时禁用 TTL
await store.set('key', value, { ttl: undefined });
```

### 问题：QuotaExceededError

**可能原因**：
- 存储配额已满
- localStorage 配额已满

**解决方案**：
```typescript
const store = new IndexedDBStoreV2({
  enableLRU: true,              // 启用 LRU 清理
  quotaConfig: {
    maxTotalSize: 30 * 1024 * 1024,  // 降低配额限制
  },
});
```

### 问题：版本升级后数据丢失

**可能原因**：
- Schema 变更导致对象存储重建

**解决方案**：
- v2 已实现数据迁移逻辑，确保升级时保留数据
- 如仍有问题，数据可从 localStorage 备份恢复

---

## 自测报告

运行自测脚本验证修复：

```bash
npx ts-node tests/indexeddb-store-v2-selftest.ts
```

**自测点**：
- ✅ IDB-001: 并发写入10个状态无竞态
- ✅ IDB-002: 浏览器刷新后数据恢复
- ✅ IDB-003: 存储配额超限优雅降级
- ✅ SCHEMA-001: IndexedDB schema 版本迁移

---

## 迁移指南

### 从 IndexedDBStore (v1) 迁移到 IndexedDBStoreV2

```typescript
// v1 旧代码
import { IndexedDBStore } from '@/lib/tsa/persistence';
const store = new IndexedDBStore({ dbName: 'my-db' });

// v2 新代码
import { IndexedDBStoreV2 } from '@/lib/tsa/persistence';
const store = new IndexedDBStoreV2({ 
  dbName: 'my-db-v2',  // 建议新数据库名
  localStorageBackup: { enabled: true },
});
```

**注意**：v2 使用新的数据库名称（默认 `hajimi-tsa-v2`），与 v1 不冲突。

---

## 贡献

如发现 bug 或需要新功能，请提交 Issue 或 PR。

---

**版本**: v2.0.0  
**作者**: 咕咕嘎嘎·IndexedDB矿工  
**最后更新**: 2026-02-14
