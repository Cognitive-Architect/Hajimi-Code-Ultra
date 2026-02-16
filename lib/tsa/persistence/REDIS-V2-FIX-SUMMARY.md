# B-03/09 RedisStore V2 修复总结

## 任务目标
修复`lib/tsa/persistence/redis-store.ts`的saveState/getState逻辑缺陷

## 修复内容

### 1. 原子性修复（REDIS-001）
**问题**: 状态保存后读取不一致，存在竞态条件

**解决方案**:
- 引入`StateWrapper<T>`接口，封装状态数据和元数据
- 添加版本号（version）实现乐观锁
- 实现`saveState()`和`getState()`专用方法
- 元数据包含：version, createdAt, updatedAt, accessCount, size, compressed

**自测结果**:
```
✅ 100次读写循环数据一致性 - 通过
   - 完成100次循环，错误数: 0
✅ 版本号递增 - 通过
✅ 乐观锁 - 通过
```

### 2. 重连机制（REDIS-002）
**问题**: Redis连接断开无自动重连

**解决方案**:
- 增强ioredis配置：`autoReconnect`, `reconnectInterval`, `maxReconnectAttempts`
- 添加连接状态机：DISCONNECTED → CONNECTING → CONNECTED → RECONNECTING → ERROR → CLOSED
- 连接断开时自动标记降级状态（useFallback）
- 重连成功后自动恢复Redis操作
- 添加连接状态监听器（onConnectionChange）

**自测结果**:
```
✅ 检测连接断开并切换到降级模式 - 通过
✅ 手动重连 - 通过
✅ 报告正确的连接状态 - 通过
✅ 故障注入测试（Redis不可用自动降级） - 通过
```

### 3. 序列化优化（REDIS-003）
**问题**: 大对象序列化性能差

**解决方案**:
- 使用gzip压缩大对象（可配置压缩阈值，默认1024字节）
- 自动检测数据大小，超过阈值自动压缩
- 元数据标记compressed标志，读取时自动解压
- JSON.stringify/parse优化

**自测结果**:
```
✅ 1MB对象序列化/反序列化性能 - 通过
   - 保存1MB对象耗时: ~43ms
   - 读取1MB对象耗时: ~27ms
   - 总耗时: ~70ms（远低于100ms要求）
✅ 自动压缩大对象 - 通过
✅ 小对象不自动压缩 - 通过
```

### 4. 性能优化
**改进**:
- Pipeline批量操作：`mget()`, `mset()`, `mdel()`
- 连接池支持（通过ioredis内置连接池）
- 异步访问统计更新（不阻塞读取）

## 文件变更

### 新增文件
1. `lib/tsa/persistence/redis-store-v2.ts` - 修复后的实现
2. `lib/tsa/tests/redis-store-v2.test.ts` - 自测脚本

### 主要接口
```typescript
// 状态包装器
interface StateWrapper<T> {
  data: T;
  version: number;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  id: string;
  size?: number;
  compressed?: boolean;
}

// 保存选项
interface SaveStateOptions {
  expectedVersion?: number;  // 乐观锁
  ttl?: number;
  compress?: boolean;
}

// V2新增方法
class RedisStore {
  saveState<T>(id: string, state: T, options?: SaveStateOptions): Promise<StateWrapper<T>>;
  getState<T>(id: string): Promise<StateWrapper<T> | null>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(entries: { key: string; value: T; ttl?: number }[]): Promise<void>;
  mdel(keys: string[]): Promise<void>;
  getConnectionState(): ConnectionState;
  retryConnection(): Promise<boolean>;
}
```

## 环境变量配置
```bash
# Redis连接
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=hajimi:state:

# 重连配置
REDIS_AUTO_RECONNECT=true
REDIS_RECONNECT_INTERVAL=2000
REDIS_MAX_RECONNECT_ATTEMPTS=10

# 压缩配置
REDIS_COMPRESS_THRESHOLD=1024
```

## 运行测试
```bash
# 运行所有自测
npm test -- lib/tsa/tests/redis-store-v2.test.ts

# 运行特定测试
npm test -- lib/tsa/tests/redis-store-v2.test.ts --testNamePattern="REDIS-001"
npm test -- lib/tsa/tests/redis-store-v2.test.ts --testNamePattern="REDIS-002"
npm test -- lib/tsa/tests/redis-store-v2.test.ts --testNamePattern="REDIS-003"
```

## 通过标准验证
- [x] **REDIS-001**: 100次读写循环数据一致（错误数: 0）
- [x] **REDIS-002**: 断开重连后自动恢复（故障注入测试通过）
- [x] **REDIS-003**: 大对象序列化/反序列化 < 100ms（实际~70ms）

## 状态
**修复完成，所有自测通过 ✅**

## 后续建议
1. 考虑将`redis-store-v2.ts`替换原`RedisStore.ts`文件
2. 在应用层逐步迁移到新的`saveState/getState`接口
3. 监控生产环境的重连频率和降级模式使用情况
