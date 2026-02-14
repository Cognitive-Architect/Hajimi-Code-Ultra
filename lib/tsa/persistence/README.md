# TSA Redis 持久化层

## 概述

B-04/09 工单实现：TSA真实Redis持久化层，替换内存Map实现。

DEBT-004 清偿标记: TSA虚假持久化 → 已实现真实Redis持久化

## 功能特性

### 核心接口 (StorageAdapter)
- `get<T>(key: string): Promise<T | null>` - 获取值
- `set<T>(key: string, value: T, ttl?: number): Promise<void>` - 设置值（支持TTL）
- `delete(key: string): Promise<void>` - 删除键
- `clear(): Promise<void>` - 清空存储
- `keys(pattern?: string): Promise<string[]>` - 获取键列表
- `isConnected(): boolean` - 检查连接状态

### RedisStore 实现
- **Upstash Redis REST API** 支持
- **TTL管理** - 毫秒级过期时间控制
- **错误处理和重试** - 自动重试机制（默认3次）
- **连接池** - 单连接模式（REST API）
- **自动降级** - Redis连接失败时自动切换到内存存储

## 环境变量配置

```bash
# Upstash Redis 配置（推荐）
UPSTASH_REDIS_REST_URL=https://your-domain.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# 备选环境变量名
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=your_token_here

# Vercel KV 兼容
KV_REST_API_URL=https://your-domain.kv.vercel-storage.com
KV_REST_API_TOKEN=your_token_here

# 连接配置
REDIS_CONNECT_TIMEOUT=5000
REDIS_MAX_RETRIES=3
REDIS_RETRY_INTERVAL=1000
REDIS_KEY_PREFIX=tsa:
```

## 使用方法

### 基本使用

```typescript
import { RedisStore } from './persistence/RedisStore';

// 从环境变量自动读取配置
const store = new RedisStore();

// 初始化连接
await store.connect();

// 数据操作
await store.set('key', { data: 'value' }, 60000); // 60秒TTL
const value = await store.get('key');
await store.delete('key');

// 断开连接
await store.disconnect();
```

### 自定义配置

```typescript
const store = new RedisStore({
  url: 'https://custom.upstash.io',
  token: 'custom-token',
  keyPrefix: 'myapp:',
  maxRetries: 5,
  retryInterval: 2000,
});
```

### TSA集成

```typescript
import { tsa } from './index';

// 初始化（自动连接Redis）
await tsa.init();

// 检查存储后端
console.log(tsa.getStorageBackend()); // 'redis' 或 'memory'
console.log(tsa.isRedisConnected());  // true/false

// 使用TSA API（自动使用Redis存储）
await tsa.set('key', value, { tier: 'STAGING', ttl: 3600000 });
const value = await tsa.get('key');
```

## 自测点

### [TSA-001] Redis连接建立
- ✅ 自动从环境变量读取配置
- ✅ 成功连接Upstash Redis
- ✅ 连接失败时自动降级到内存存储
- ✅ 支持手动强制降级模式

### [TSA-002] 数据重启保留
- ✅ 数据持久化到Redis
- ✅ 支持字符串、数字、对象、数组
- ✅ 批量操作（mget/mset/mdel）

### [TSA-003] TTL过期清理
- ✅ 支持设置TTL（毫秒）
- ✅ Redis自动过期清理
- ✅ 内存模式TTL定时清理

## 降级策略

当Redis不可用时，系统自动降级到内存存储：

```typescript
// Redis连接失败
const store = new RedisStore({ url: 'invalid-url' });
await store.connect(); // 返回 false，自动启用降级

// 手动强制降级
store.forceFallback();

// 检查降级状态
store.isUsingFallback(); // true

// 重试连接
await store.retryConnection();
```

**DEBT-004 标注**: 降级到内存存储时，控制台会输出明确标注 `(DEBT-004)`，提醒这是Mock实现。

## 文件结构

```
lib/tsa/persistence/
├── RedisStore.ts      # Redis存储实现
├── index.ts           # 模块导出
├── .env.example       # 环境变量示例
└── README.md          # 本文档

lib/tsa/tests/
├── RedisStore.test.ts # Jest单元测试
└── self-test.ts       # 自测脚本
```

## 测试

### 运行自测
```bash
# 编译并运行
npx tsc lib/tsa/persistence/RedisStore.ts lib/tsa/tests/self-test.ts \
  --outDir dist --module commonjs --esModuleInterop --target ES2020
node dist/tests/self-test.js
```

### 运行Jest测试
```bash
npm test -- lib/tsa/tests/RedisStore.test.ts
```

## 技术实现说明

### 存储数据格式
```typescript
interface StorageItem<T> {
  value: T;
  tier: 'transient' | 'staging' | 'archive';
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}
```

数据以JSON序列化后存储，包含元数据用于TSA分层管理。

### Upstash REST API
使用标准HTTP POST请求：
- 认证: `Authorization: Bearer <token>`
- 命令格式: `['COMMAND', 'arg1', 'arg2', ...]`
- 响应格式: `{ result: T }`

### 错误处理
- 网络错误自动重试（指数退避）
- 连接超时自动降级
- 操作失败自动切换到fallback

## 注意事项

1. **键名前缀**: 默认使用 `tsa:` 前缀，避免与其他数据冲突
2. **TTL单位**: 使用毫秒（ms），Redis内部转换为秒
3. **连接管理**: 推荐显式调用 `connect()` 和 `disconnect()`
4. **降级模式**: 内存模式数据在进程重启后会丢失
