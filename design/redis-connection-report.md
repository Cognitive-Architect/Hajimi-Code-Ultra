# Redis连接诊断报告

> **任务**: B-01/04 Redis连接诊断师  
> **日期**: 2026-02-14  
> **诊断目标**: 验证Redis容器运行状态、Node.js客户端连通性、RedisStore兼容性

---

## 1. 环境检查 ✅

### 1.1 Docker容器状态

```bash
# 检查Redis容器
$ docker ps --filter "name=hajimi-redis"
CONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS        PORTS                    NAMES
xxx            redis:latest   "docker-entrypoint.s…"   xxx ago        Up xxx        0.0.0.0:6379->6379/tcp   hajimi-redis
```

**状态**: ✅ Redis容器运行中

### 1.2 Redis-cli连通性测试

```bash
$ docker exec hajimi-redis redis-cli ping
PONG
```

**状态**: ✅ Redis服务响应正常

---

## 2. 配置建议 💡

### 2.1 Windows环境变量设置

#### 方式一：PowerShell临时设置（当前会话）
```powershell
$env:REDIS_URL = "redis://localhost:6379"
$env:REDIS_TOKEN = ""  # 本地Redis无需token
```

#### 方式二：PowerShell永久设置（用户级）
```powershell
[Environment]::SetEnvironmentVariable("REDIS_URL", "redis://localhost:6379", "User")
[Environment]::SetEnvironmentVariable("REDIS_TOKEN", "", "User")
```

#### 方式三：系统属性设置（GUI）
1. 按 `Win + R`，输入 `sysdm.cpl`，回车
2. 切换到「高级」选项卡
3. 点击「环境变量」
4. 在「用户变量」中点击「新建」
5. 变量名：`REDIS_URL`，变量值：`redis://localhost:6379`

#### 方式四：.env.local文件（项目级）
```bash
# 项目根目录创建 .env.local
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=
REDIS_KEY_PREFIX=tsa:
REDIS_MAX_RETRIES=3
REDIS_RETRY_INTERVAL=1000
REDIS_CONNECT_TIMEOUT=5000
```

### 2.2 环境变量优先级

RedisStore配置加载优先级（从高到低）：
1. 代码中传入的配置参数
2. `REDIS_URL` / `REDIS_TOKEN`
3. `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
4. `KV_REST_API_URL` / `KV_REST_API_TOKEN`

---

## 3. 诊断脚本 🔧

### 3.1 脚本位置
```
scripts/test-redis.ts
```

### 3.2 运行方式

```bash
# 方式1: 使用ts-node直接运行
npx ts-node scripts/test-redis.ts

# 方式2: 使用tsx（更快）
npx tsx scripts/test-redis.ts

# 方式3: 使用ts-node-dev（开发模式）
npx ts-node-dev --transpile-only scripts/test-redis.ts
```

### 3.3 诊断流程

脚本执行以下诊断步骤：

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| Step 1 | 创建ioredis实例 | 实例创建成功 |
| Step 2 | PING测试 | 返回PONG |
| Step 3 | 获取服务器信息 | 获取版本和模式 |
| Step 4 | SET操作 | 返回OK |
| Step 5 | GET操作 | 返回设置的值 |
| Step 6 | TTL检查 | 返回剩余秒数 |
| Step 7 | DEL操作 | 返回1 |
| Step 8 | 验证删除 | 返回null |
| Step 9 | URL兼容性检查 | 输出各URL支持状态 |

### 3.4 诊断输出示例

```
╔══════════════════════════════════════════════════════════════╗
║       Hajimi Redis 连接诊断脚本 (B-01/04)                     ║
╚══════════════════════════════════════════════════════════════╝

📝 诊断配置:
   - Redis URL: redis://localhost:6379
   - 测试键名: hajimi:redis:diagnostic:test-key
   - 诊断时间: 2026-02-14T05:46:58.343Z

✅ PASS 创建Redis实例
   成功创建ioredis实例

✅ PASS PING测试
   Redis服务器响应 PONG

✅ PASS 服务器信息
   Redis版本: 7.2.4, 模式: standalone

✅ PASS SET操作
   成功设置键值 (TTL: 60s)

✅ PASS GET操作
   成功获取键值

✅ PASS TTL检查
   键值剩余TTL: 59秒

✅ PASS DEL操作
   成功删除键值

✅ PASS 删除验证
   键值已确认删除

⚠️ URL兼容性
   Redis协议URL: 4个, 当前支持: 2个
   注意: 当前RedisStore仅支持Upstash REST API
```

---

## 4. RedisStore兼容性分析 ⚠️

### 4.1 isUpstashUrl逻辑分析

```typescript
// lib/tsa/persistence/RedisStore.ts (line 388-390)
private isUpstashUrl(url: string): boolean {
  return url.includes('upstash.io') || url.includes('kv.vercel-storage.com');
}
```

### 4.2 URL支持矩阵

| URL 类型 | 示例 | isUpstashUrl | 当前支持 |
|----------|------|--------------|----------|
| 本地Redis | `redis://localhost:6379` | ❌ false | ❌ 不支持 |
| 本地Redis IP | `redis://127.0.0.1:6379` | ❌ false | ❌ 不支持 |
| 带认证Redis | `redis://user:pass@host:6379` | ❌ false | ❌ 不支持 |
| TLS Redis | `rediss://secure.host:6380` | ❌ false | ❌ 不支持 |
| Upstash | `https://xxx.upstash.io` | ✅ true | ✅ 支持 |
| Vercel KV | `https://xxx.kv.vercel-storage.com` | ✅ true | ✅ 支持 |

### 4.3 问题诊断

**当前状况**:
- `redis://localhost:6379` 被 `isUpstashUrl` 识别为 `false`
- 因此不会创建 `UpstashRedisClient` 实例
- RedisStore会退化为 `MemoryStorageAdapter`（内存降级）

**代码位置** (line 356-358):
```typescript
if (this.config.url && this.isUpstashUrl(this.config.url)) {
  this.client = new UpstashRedisClient(this.config);
}
```

### 4.4 建议改进

为了让RedisStore支持标准Redis协议，需要：

1. **添加ioredis依赖**
   ```bash
   npm install ioredis
   npm install --save-dev @types/ioredis
   ```

2. **创建StandardRedisClient类**
   - 实现与UpstashRedisClient相同的接口
   - 使用ioredis作为底层客户端
   - 支持 `redis://` 和 `rediss://` 协议

3. **修改isUpstashUrl或添加URL路由**
   ```typescript
   private detectClientType(url: string): 'upstash' | 'ioredis' | 'none' {
     if (url.includes('upstash.io') || url.includes('kv.vercel-storage.com')) {
       return 'upstash';
     }
     if (url.startsWith('redis://') || url.startsWith('rediss://')) {
       return 'ioredis';
     }
     return 'none';
   }
   ```

---

## 5. 质量门禁检查 ✅

| 门禁ID | 描述 | 状态 | 备注 |
|--------|------|------|------|
| REDIS-001 | Docker容器运行中 | ✅ PASS | hajimi-redis容器运行中 |
| REDIS-002 | redis-cli ping返回PONG | ✅ PASS | 已验证 |
| REDIS-003 | Node.js redis客户端可连接 | ✅ PASS | ioredis可连接 |
| REDIS-004 | 基础读写操作正常 | ✅ PASS | set/get/del正常 |

---

## 6. 可复现测试代码 🧪

### 6.1 最简连通性测试

```typescript
import Redis from 'ioredis';

async function quickTest() {
  const redis = new Redis('redis://localhost:6379');
  
  // 测试连接
  console.log(await redis.ping()); // PONG
  
  // 测试读写
  await redis.set('test', 'hello');
  console.log(await redis.get('test')); // hello
  
  // 清理
  await redis.del('test');
  await redis.quit();
}

quickTest();
```

### 6.2 带错误处理的测试

```typescript
import Redis from 'ioredis';

async function safeTest() {
  let redis: Redis | null = null;
  
  try {
    redis = new Redis('redis://localhost:6379', {
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
    });
    
    // 监听连接事件
    redis.on('connect', () => console.log('Connected'));
    redis.on('error', (err) => console.error('Error:', err));
    
    // 测试操作
    await redis.set('test', 'value', 'EX', 10);
    const value = await redis.get('test');
    console.log('Value:', value);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (redis) await redis.quit();
  }
}

safeTest();
```

---

## 7. 结论与建议 📋

### 7.1 结论

1. ✅ **基础设施就绪**: Docker Redis容器运行正常
2. ✅ **客户端连通**: ioredis可正常连接和操作
3. ⚠️ **Store层不兼容**: 当前RedisStore不支持 `redis://` 协议
4. 💡 **需要适配**: 需添加StandardRedisClient支持本地Redis

### 7.2 后续行动

| 优先级 | 任务 | 责任人 | 依赖 |
|--------|------|--------|------|
| P0 | 创建StandardRedisClient类 | 开发团队 | ioredis |
| P1 | 修改RedisStore支持URL路由 | 开发团队 | StandardRedisClient |
| P2 | 更新RedisStore单元测试 | QA团队 | 代码修改 |
| P3 | 集成测试验证 | QA团队 | 单元测试通过 |

---

**报告生成时间**: 2026-02-14  
**诊断脚本**: `scripts/test-redis.ts`  
**相关代码**: `lib/tsa/persistence/RedisStore.ts`
