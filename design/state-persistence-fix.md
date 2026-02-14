# B-02/04 TSA状态机持久化修复设计文档

## 问题根因分析

### 症状
- 集成测试失败：期望状态DESIGN，实际返回IDLE
- 状态未持久化到Redis，测试间状态丢失
- 每个测试后状态被重置为IDLE

### 根本原因
1. **RedisStore仅支持Upstash REST API**：`isUpstashUrl()`方法只识别`upstash.io`和`vercel-storage.com`，不识别标准Redis协议（`redis://`）
2. **TSA未自动创建RedisStore**：TSA的`initializeFallbackManager()`只在显式传入配置时才使用Redis，不会自动检测环境变量
3. **StateMachine未初始化TSA**：`StateMachine.init()`直接调用`tsa.get()`，未先调用`tsa.init()`初始化存储层
4. **Jest环境变量未设置**：测试运行时需要`REDIS_URL`环境变量

## 修复方案

### 1. 添加标准Redis协议支持（lib/tsa/persistence/RedisStore.ts）

#### 新增StandardRedisClient类
使用ioredis库支持标准Redis协议（redis://和rediss://）：

```typescript
class StandardRedisClient {
  private client: Redis | null = null;
  
  connect(): void {
    // 解析Redis URL，创建ioredis连接
    // 支持redis://和rediss://协议
    // 使用lazyConnect模式，手动控制连接
  }
  
  async ensureConnected(): Promise<boolean> {
    // ioredis lazyConnect模式下手动建立连接
  }
  
  // 实现标准Redis操作：ping, get, set, del, scan, flush等
}
```

#### 修改RedisStore构造函数
```typescript
constructor(config?: Partial<RedisConfig>) {
  // ...
  if (this.config.url) {
    if (this.isUpstashUrl(this.config.url)) {
      // Upstash REST API
      this.client = new UpstashRedisClient(this.config);
    } else if (this.isStandardRedisUrl(this.config.url)) {
      // 标准Redis协议
      const standardClient = new StandardRedisClient(this.config);
      standardClient.connect();
      this.client = standardClient;
      this.isStandardRedis = true;
    }
  }
}
```

#### 添加标准Redis URL识别
```typescript
private isStandardRedisUrl(url: string): boolean {
  return url.startsWith('redis://') || url.startsWith('rediss://');
}
```

#### 添加TieredFallback兼容方法
```typescript
async initialize(): Promise<boolean> {
  return this.connect();
}

async close(): Promise<void> {
  return this.disconnect();
}

async healthCheck(): Promise<boolean> {
  return this.isConnected();
}

get isAvailable(): boolean {
  return this.isConnected();
}
```

### 2. TSA自动检测Redis配置（lib/tsa/index.ts）

#### 添加RedisStore导入
```typescript
import { RedisStore } from './persistence/RedisStore';
```

#### 修改initializeFallbackManager
```typescript
private initializeFallbackManager(): void {
  // ...
  if (this.config.storage?.redis) {
    redisStore = this.config.storage.redis;
  } else if (isNode()) {
    // 自动检测Redis环境变量
    const redisUrl = process.env.REDIS_URL || 
                     process.env.UPSTASH_REDIS_REST_URL || 
                     process.env.KV_REST_API_URL;
    if (redisUrl) {
      console.log(`[TSA] Detected Redis URL: ${redisUrl.substring(0, 20)}...`);
      redisStore = new RedisStore();
      console.log('[TSA] RedisStore instance created');
    }
  }
  // ...
}
```

### 3. StateMachine初始化TSA（lib/core/state/machine.ts）

#### 修改init方法
```typescript
async init(): Promise<void> {
  if (this.initialized) return;

  try {
    // B-02/04 FIX: 先初始化TSA
    if (!tsa.isInitialized()) {
      await tsa.init();
    }

    // 从TSA加载状态...
  }
}
```

### 4. Jest环境变量配置（jest.config.js + package.json）

#### jest.config.js
```javascript
// B-02/04 FIX: 设置Redis环境变量
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
```

#### package.json
```json
{
  "scripts": {
    "test": "cross-env REDIS_URL=redis://localhost:6379 jest"
  }
}
```

### 5. 修复浏览器兼容性问题（lib/tsa/persistence/TieredFallback.ts）

```typescript
// 修改前：使用window.setInterval
this.recoverTimer = window.setInterval(() => {...});

// 修改后：使用全局setInterval
this.recoverTimer = setInterval(() => {...});
```

### 6. 修复状态流转权限（lib/core/state/rules.ts）

允许system角色执行自动状态流转：
```typescript
{ 
  from: 'IDLE', 
  to: 'DESIGN', 
  allowed: true, 
  requiredRoles: ['pm', 'arch', 'system'],  // 添加'system'
  description: 'PM、架构师或系统自动启动设计' 
}
```

## 验证结果

### 测试通过
```bash
npm test -- tests/integration/governance-flow.test.ts --testNamePattern="TEST-012-1"

PASS tests/integration/governance-flow.test.ts
  B-07 治理链路集成测试
    TEST-012: 自动流转触发
      √ TEST-012-1: 模拟多角色投票达到60%阈值触发自动流转 (649 ms)
```

### 关键日志
```
[TSA] Detected Redis URL: redis://localhost:63...
[TSA] RedisStore instance created
[RedisStore] Connected to Redis successfully
[TieredFallback] RedisStore initialized successfully
[TSA] TieredFallback initialized, current tier: RedisStore
[StateMachine] 状态流转: IDLE → DESIGN (by system)
```

## 修改文件清单

1. **lib/tsa/persistence/RedisStore.ts** - 添加标准Redis协议支持
2. **lib/tsa/index.ts** - TSA自动检测Redis配置
3. **lib/core/state/machine.ts** - StateMachine初始化TSA
4. **lib/tsa/persistence/TieredFallback.ts** - 修复浏览器兼容性问题
5. **lib/core/state/rules.ts** - 允许system角色自动流转
6. **jest.config.js** - 设置默认Redis环境变量
7. **package.json** - 添加cross-env和测试脚本

## 依赖变更

```bash
npm install ioredis --save
npm install cross-env --save-dev
```

## 技术债务清偿

- **DEBT-004 TSA虚假持久化** → 已实现真实Redis持久化
- 支持Upstash Redis REST API和标准Redis协议
- 三层降级韧性：Redis → IndexedDB → Memory
- 自动故障检测与恢复
