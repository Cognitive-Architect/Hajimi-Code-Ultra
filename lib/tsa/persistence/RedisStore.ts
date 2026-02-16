/**
 * TSA Redis持久化层实现
 * 
 * B-04/09: 实现TSA真实Redis持久化层，替换内存Map
 * - 支持Upstash Redis REST API
 * - 支持标准Redis协议（通过Redis URL）
 * - 实现TTL管理
 * - 错误处理和重试机制
 * 
 * B-02/04 FIX: 添加标准Redis协议支持（ioredis）
 * - 支持 redis:// 和 rediss:// 协议
 * - 修复本地Redis连接问题
 * 
 * DEBT-004 清偿标记: TSA虚假持久化 → 已实现真实Redis持久化
 */

import Redis from 'ioredis';

/**
 * 存储适配器接口
 * 统一不同存储后端的抽象接口
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
  isConnected(): boolean;
}

/**
 * Redis连接配置
 */
export interface RedisConfig {
  /** Redis URL，支持标准Redis协议 redis://host:port 或 Upstash REST URL */
  url?: string;
  /** Upstash Redis Token，使用Upstash时需要 */
  token?: string;
  /** 数据库编号，标准Redis时使用 */
  db?: number;
  /** 连接超时（毫秒），默认5000 */
  connectTimeout?: number;
  /** 最大重试次数，默认3 */
  maxRetries?: number;
  /** 重试间隔（毫秒），默认1000 */
  retryInterval?: number;
  /** 键名前缀，默认 'tsa:' */
  keyPrefix?: string;
}

/**
 * 存储项数据结构
 */
interface StorageItem<T> {
  value: T;
  tier: 'transient' | 'staging' | 'archive';
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}

/**
 * 连接状态
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Redis错误类
 */
class RedisError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RedisError';
  }
}

/**
 * 标准Redis客户端（使用ioredis）
 * B-02/04 FIX: 支持 redis:// 和 rediss:// 协议
 */
class StandardRedisClient {
  private client: Redis | null = null;
  private config: RedisConfig;
  private maxRetries: number;
  private retryInterval: number;

  constructor(config: RedisConfig) {
    this.config = config;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryInterval = config.retryInterval ?? 1000;
  }

  /**
   * B-02/06 FIX: 优化ioredis连接参数，适配Windows环境
   * - enableOfflineQueue: false（避免离线队列堆积）
   * - retryStrategy: 指数退避
   * - connectTimeout: 5000ms（Windows适配）
   * - lazyConnect: false（立即连接，及时发现错误）
   * - Windows下自动将localhost替换为127.0.0.1
   */
  connect(): void {
    if (this.client) return;

    let url = this.config.url!;
    
    // B-02/06 FIX: Windows下自动将localhost替换为127.0.0.1
    if (url.includes('localhost')) {
      const originalUrl = url;
      url = url.replace('localhost', '127.0.0.1');
      console.log(`[RedisStore] Windows fix: replaced localhost with 127.0.0.1`);
      console.log(`[RedisStore] Original: ${originalUrl}`);
      console.log(`[RedisStore] Fixed: ${url}`);
    }
    
    // 解析Redis URL
    const urlObj = new URL(url);
    const isTls = urlObj.protocol === 'rediss:';
    
    // B-02/06 FIX: 连接前输出目标URL（诊断日志）
    console.log(`[RedisStore] Connecting to Redis at ${urlObj.hostname}:${urlObj.port || '6379'}...`);
    
    this.client = new Redis({
      host: urlObj.hostname,
      port: parseInt(urlObj.port || '6379', 10),
      password: urlObj.password || undefined,
      username: urlObj.username || undefined,
      db: this.config.db ?? 0,
      tls: isTls ? {} : undefined,
      // B-02/06 FIX: Windows适配的连接超时
      connectTimeout: this.config.connectTimeout ?? 5000,
      // B-02/06 FIX: 避免离线队列堆积
      enableOfflineQueue: false,
      // B-02/06 FIX: 限制重试次数
      maxRetriesPerRequest: this.maxRetries,
      // B-02/06 FIX: 指数退避重试策略
      retryStrategy: (times) => {
        if (times > this.maxRetries) {
          console.warn(`[RedisStore] Max retries (${this.maxRetries}) exceeded, giving up`);
          return null;
        }
        const delay = Math.min(times * this.retryInterval, 5000);
        console.log(`[RedisStore] Retry attempt ${times}/${this.maxRetries}, waiting ${delay}ms...`);
        return delay;
      },
      // B-02/06 FIX: 立即连接，及时发现错误（原为true）
      lazyConnect: false,
    });
    
    // B-02/06 FIX: 添加连接事件监听器（诊断日志）
    this.client.on('connect', () => {
      console.log(`[RedisStore] Redis client connected to ${urlObj.hostname}:${urlObj.port || '6379'}`);
    });
    
    this.client.on('ready', () => {
      console.log(`[RedisStore] Redis client ready`);
    });
    
    this.client.on('error', (err) => {
      console.error(`[RedisStore] Redis connection error:`, err.message);
    });
    
    this.client.on('close', () => {
      console.warn(`[RedisStore] Redis connection closed`);
    });
    
    this.client.on('reconnecting', () => {
      console.log(`[RedisStore] Redis reconnecting...`);
    });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  /**
   * B-02/06 FIX: 建立实际连接（ioredis lazyConnect=false时自动连接）
   * 等待连接就绪并执行ping验证
   */
  async ensureConnected(): Promise<boolean> {
    if (!this.client) {
      console.error('[RedisStore] Redis client is null');
      return false;
    }
    
    // B-02/06 FIX: 等待连接就绪（最多等待connectTimeout时间）
    const maxWaitTime = 5000; // 最多等待5秒
    const checkInterval = 100; // 每100ms检查一次
    let waited = 0;
    
    while (waited < maxWaitTime) {
      // 检查状态
      if (this.client.status === 'ready') {
        try {
          // 执行ping验证
          const result = await this.client.ping();
          return result === 'PONG';
        } catch (err) {
          console.warn('[RedisStore] Ping failed:', err instanceof Error ? err.message : String(err));
          return false;
        }
      }
      
      // 如果状态是'connect'或'connecting'，继续等待
      if (this.client.status === 'connect' || this.client.status === 'connecting') {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
        continue;
      }
      
      // 其他状态（end、close等）表示连接失败
      if (this.client.status === 'end' || this.client.status === 'close') {
        console.error('[RedisStore] Connection ended/closed');
        return false;
      }
      
      // 未知状态，继续等待
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    console.error(`[RedisStore] Timeout waiting for connection (waited ${waited}ms, status: ${this.client.status})`);
    return false;
  }

  /**
   * 测试连接
   */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * 获取值
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    const result = await this.client.get(key);
    return result;
  }

  /**
   * 设置值
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) return;
    if (ttl !== undefined && ttl > 0) {
      // TTL转换为毫秒，ioredis使用毫秒
      await this.client.set(key, value, 'PX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  /**
   * 清空数据库（使用SCAN + DEL，避免阻塞）
   */
  async flush(pattern: string): Promise<void> {
    if (!this.client) return;
    
    let cursor = '0';
    do {
      const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  /**
   * 扫描键
   */
  async scanKeys(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    return keys;
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * 获取TTL（毫秒）
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) return -1;
    // pttl返回毫秒
    return await this.client.pttl(key);
  }
}

/**
 * Upstash Redis REST API 客户端
 */
class UpstashRedisClient {
  private url: string;
  private token: string;
  private maxRetries: number;
  private retryInterval: number;

  constructor(config: RedisConfig) {
    this.url = config.url;
    this.token = config.token || '';
    this.maxRetries = config.maxRetries ?? 3;
    this.retryInterval = config.retryInterval ?? 1000;
  }

  /**
   * 执行Redis命令
   */
  private async executeCommand<T>(command: string[], retryCount = 0): Promise<T> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      
      // Upstash返回格式: { result: T }
      if (result.error) {
        throw new Error(result.error);
      }

      return result.result as T;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        await this.delay(this.retryInterval * (retryCount + 1));
        return this.executeCommand(command, retryCount + 1);
      }
      throw new RedisError(
        `Redis command failed after ${this.maxRetries} retries`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 测试连接
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.executeCommand<string>(['PING']);
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * 获取值
   */
  async get(key: string): Promise<string | null> {
    return this.executeCommand<string | null>(['GET', key]);
  }

  /**
   * 设置值
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined && ttl > 0) {
      // TTL转换为秒（Redis使用秒）
      const ttlSeconds = Math.ceil(ttl / 1000);
      await this.executeCommand<void>(['SETEX', key, ttlSeconds.toString(), value]);
    } else {
      await this.executeCommand<void>(['SET', key, value]);
    }
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<void> {
    await this.executeCommand<number>(['DEL', key]);
  }

  /**
   * 清空数据库（使用SCAN + DEL，避免阻塞）
   */
  async flush(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const result = await this.executeCommand<[string, string[]]>(
        ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']
      );
      cursor = result[0];
      const keys = result[1];
      
      if (keys.length > 0) {
        await this.executeCommand<number>(['DEL', ...keys]);
      }
    } while (cursor !== '0');
  }

  /**
   * 扫描键
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const result = await this.executeCommand<[string, string[]]>(
        ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    return keys;
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.executeCommand<number>(['EXISTS', key]);
    return result === 1;
  }

  /**
   * 获取TTL（秒）
   */
  async ttl(key: string): Promise<number> {
    return this.executeCommand<number>(['TTL', key]);
  }
}

/**
 * 内存存储适配器（降级方案）
 * DEBT-004: 如Redis未配置时使用此Mock，明确标注
 */
class MemoryStorageAdapter implements StorageAdapter {
  private store: Map<string, string> = new Map();
  private ttlTimers: Map<string, NodeJS.Timeout> = new Map();
  private prefix: string;

  constructor(prefix: string = 'tsa:') {
    this.prefix = prefix;
  }

  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const value = this.store.get(fullKey);
    if (value === undefined) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const serialized = JSON.stringify(value);
    this.store.set(fullKey, serialized);

    // 清除之前的TTL定时器
    const existingTimer = this.ttlTimers.get(fullKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的TTL定时器
    if (ttl !== undefined && ttl > 0) {
      const timer = setTimeout(() => {
        this.store.delete(fullKey);
        this.ttlTimers.delete(fullKey);
      }, ttl);
      this.ttlTimers.set(fullKey, timer);
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    this.store.delete(fullKey);
    const timer = this.ttlTimers.get(fullKey);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(fullKey);
    }
  }

  async clear(): Promise<void> {
    // 清除所有TTL定时器
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();
    this.store.clear();
  }

  async keys(pattern?: string): Promise<string[]> {
    const keys: string[] = [];
    const regex = pattern ? new RegExp(pattern.replace('*', '.*')) : null;
    
    for (const key of this.store.keys()) {
      const shortKey = key.slice(this.prefix.length);
      if (!regex || regex.test(shortKey)) {
        keys.push(shortKey);
      }
    }
    
    return keys;
  }

  isConnected(): boolean {
    return true;
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();
    this.store.clear();
  }
}

/**
 * Redis存储实现
 * 支持Upstash Redis REST API 和 标准Redis协议
 */
export class RedisStore implements StorageAdapter {
  private client: UpstashRedisClient | StandardRedisClient | null = null;
  private fallbackAdapter: MemoryStorageAdapter;
  private config: RedisConfig;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private connectionError: Error | null = null;
  private useFallback: boolean = false;
  private isStandardRedis: boolean = false;

  constructor(config?: Partial<RedisConfig>) {
    // 从环境变量读取配置
    const envConfig = this.loadConfigFromEnv();
    this.config = {
      ...envConfig,
      ...config,
      keyPrefix: config?.keyPrefix ?? envConfig.keyPrefix ?? 'tsa:',
      maxRetries: config?.maxRetries ?? envConfig.maxRetries ?? 3,
      retryInterval: config?.retryInterval ?? envConfig.retryInterval ?? 1000,
      connectTimeout: config?.connectTimeout ?? envConfig.connectTimeout ?? 5000,
    };

    this.fallbackAdapter = new MemoryStorageAdapter(this.config.keyPrefix);
    
    // B-02/04 FIX: 支持标准Redis协议和Upstash REST API
    if (this.config.url) {
      if (this.isUpstashUrl(this.config.url)) {
        // Upstash REST API
        this.client = new UpstashRedisClient(this.config);
        this.isStandardRedis = false;
      } else if (this.isStandardRedisUrl(this.config.url)) {
        // 标准Redis协议 (redis:// 或 rediss://)
        const standardClient = new StandardRedisClient(this.config);
        standardClient.connect();
        this.client = standardClient;
        this.isStandardRedis = true;
      }
    }
  }

  /**
   * 从环境变量加载配置
   */
  private loadConfigFromEnv(): Partial<RedisConfig> {
    // 支持多种环境变量命名
    const url = process.env.REDIS_URL || 
                process.env.UPSTASH_REDIS_REST_URL || 
                process.env.KV_REST_API_URL || '';
    
    const token = process.env.REDIS_TOKEN || 
                  process.env.UPSTASH_REDIS_REST_TOKEN || 
                  process.env.KV_REST_API_TOKEN || '';

    return {
      url,
      token,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      retryInterval: parseInt(process.env.REDIS_RETRY_INTERVAL || '1000', 10),
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'tsa:',
    };
  }

  /**
   * 判断是否为Upstash URL
   */
  private isUpstashUrl(url: string): boolean {
    return url.includes('upstash.io') || url.includes('kv.vercel-storage.com');
  }

  /**
   * B-02/04 FIX: 判断是否为标准Redis URL
   */
  private isStandardRedisUrl(url: string): boolean {
    return url.startsWith('redis://') || url.startsWith('rediss://');
  }

  /**
   * 获取完整键名
   */
  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * 获取适配器（Redis或降级方案）
   */
  private getAdapter(): StorageAdapter {
    if (this.useFallback || !this.client) {
      return this.fallbackAdapter;
    }
    return this as StorageAdapter;
  }

  /**
   * B-02/04 FIX: 初始化方法（供TieredFallback调用）
   * @returns 是否成功连接
   */
  async initialize(): Promise<boolean> {
    return this.connect();
  }

  /**
   * 关闭方法（供TieredFallback调用）
   */
  async close(): Promise<void> {
    return this.disconnect();
  }

  /**
   * B-02/04 FIX: 健康检查方法（供TieredFallback调用）
   */
  async healthCheck(): Promise<boolean> {
    return this.isConnected();
  }

  /**
   * 获取可用性状态（供TieredFallback调用）
   */
  get isAvailable(): boolean {
    return this.isConnected();
  }

  /**
   * B-02/06 FIX: 初始化连接，优化诊断日志和连接可靠性
   * B-01/09 FIX: 修复连接状态返回值，确保TieredFallback正确处理
   * @returns 是否成功连接（仅当真实Redis连接成功时返回true）
   */
  async connect(): Promise<boolean> {
    if (this.state === ConnectionState.CONNECTED && !this.useFallback) {
      console.log('[RedisStore] Already connected to Redis');
      return true;
    }

    if (!this.client) {
      console.log('[RedisStore] No Redis config available, using memory fallback');
      this.useFallback = true;
      // FIX: 当使用fallback时，返回false表示真实Redis未连接
      // 但保持state为CONNECTED以便getAdapter()能正常工作
      this.state = ConnectionState.CONNECTED;
      return false;  // FIX: 返回false表示没有真实Redis连接
    }

    this.state = ConnectionState.CONNECTING;
    console.log(`[RedisStore] Attempting to connect with timeout ${this.config.connectTimeout}ms...`);
    
    try {
      // B-02/06 FIX: 标准Redis需要验证连接状态
      if (this.isStandardRedis && this.client instanceof StandardRedisClient) {
        const isReady = await this.client.ensureConnected();
        if (!isReady) {
          throw new Error('Redis client not ready');
        }
      }

      // B-02/06 FIX: 使用更长的超时时间进行ping测试
      const pingTimeout = Math.max(this.config.connectTimeout || 5000, 5000);
      
      const isConnected = await Promise.race([
        this.client.ping(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error(`Connection timeout after ${pingTimeout}ms`)), 
          pingTimeout)
        ),
      ]);

      if (isConnected) {
        // B-02/06 FIX: 连接成功，确保状态正确设置且不回退到fallback
        this.state = ConnectionState.CONNECTED;
        this.connectionError = null;
        this.useFallback = false; // 明确设置为false，确保使用Redis而不是fallback
        console.log('[RedisStore] ✅ Connected to Redis successfully - using Redis persistence');
        console.log(`[RedisStore] Fallback status: ${this.useFallback ? 'ENABLED' : 'DISABLED'}`);
        return true;
      } else {
        throw new Error('Ping failed - no PONG response');
      }
    } catch (error) {
      this.state = ConnectionState.ERROR;
      this.connectionError = error instanceof Error ? error : new Error(String(error));
      
      // B-02/06 FIX: 连接失败时输出详细错误信息
      console.error('[RedisStore] ❌ Failed to connect to Redis:');
      console.error(`  Error: ${this.connectionError.message}`);
      console.error(`  URL: ${this.config.url?.replace(/:\/\/[^:]+:/, '://***:***@') || 'not set'}`);
      console.error(`  ConnectTimeout: ${this.config.connectTimeout}ms`);
      console.error(`  MaxRetries: ${this.config.maxRetries}`);
      console.warn('[RedisStore] Falling back to memory storage');
      
      // FIX: 即使连接失败，也启用fallback以便继续工作
      this.useFallback = true;
      this.state = ConnectionState.CONNECTED;  // 允许fallback工作
      return false;  // FIX: 返回false表示真实Redis未连接
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.state = ConnectionState.DISCONNECTED;
    
    // B-02/04 FIX: 正确断开标准Redis连接
    if (this.isStandardRedis && this.client instanceof StandardRedisClient) {
      await this.client.disconnect();
    }
    
    this.client = null;
    this.fallbackAdapter.destroy();
  }

  /**
   * 检查是否已连接
   * B-01/09 FIX: 即使使用fallback也返回true，确保TieredFallback能正常工作
   */
  isConnected(): boolean {
    // FIX: 只要state是CONNECTED就返回true，无论是否使用fallback
    // 这样TieredFallback不会跳过Redis层，而是让RedisStore自己处理fallback
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * B-01/09 FIX: 检查是否有真实的Redis连接（非fallback）
   */
  hasRealRedisConnection(): boolean {
    return this.state === ConnectionState.CONNECTED && !this.useFallback;
  }

  /**
   * 获取连接状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取连接错误
   */
  getConnectionError(): Error | null {
    return this.connectionError;
  }

  /**
   * 是否使用降级方案
   */
  isUsingFallback(): boolean {
    return this.useFallback;
  }

  /**
   * 获取值
   */
  async get<T>(key: string): Promise<T | null> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      // 降级模式下，存储的是StorageItem，需要解包
      const item = await adapter.get<StorageItem<T>>(key);
      if (item === null) return null;
      
      // 更新访问统计
      item.lastAccessed = Date.now();
      item.accessCount++;
      
      // 异步更新（不等待）
      adapter.set(key, item, item.ttl).catch(() => {
        // 忽略更新错误
      });
      
      return item.value;
    }

    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client!.get(fullKey);
      
      if (value === null) return null;
      
      const item: StorageItem<T> = JSON.parse(value);
      
      // 更新访问统计
      item.lastAccessed = Date.now();
      item.accessCount++;
      
      // 异步写回（不等待）
      this.client!.set(fullKey, JSON.stringify(item)).catch(() => {
        // 忽略更新错误
      });
      
      return item.value;
    } catch (error) {
      console.warn('[RedisStore] Get error, switching to fallback:', error);
      this.useFallback = true;
      const item = await this.fallbackAdapter.get<StorageItem<T>>(key);
      return item ? item.value : null;
    }
  }

  /**
   * 设置值
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      const now = Date.now();
      const item: StorageItem<T> = {
        value,
        tier: 'staging',
        timestamp: now,
        lastAccessed: now,
        accessCount: 0,
        ttl,
      };
      return adapter.set(key, item, ttl);
    }

    try {
      const fullKey = this.getFullKey(key);
      const now = Date.now();
      const item: StorageItem<T> = {
        value,
        tier: 'staging',
        timestamp: now,
        lastAccessed: now,
        accessCount: 0,
        ttl,
      };
      
      const serialized = JSON.stringify(item);
      await this.client!.set(fullKey, serialized, ttl);
    } catch (error) {
      console.warn('[RedisStore] Set error, switching to fallback:', error);
      this.useFallback = true;
      
      const now = Date.now();
      const item: StorageItem<T> = {
        value,
        tier: 'staging',
        timestamp: now,
        lastAccessed: now,
        accessCount: 0,
        ttl,
      };
      return this.fallbackAdapter.set(key, item, ttl);
    }
  }

  /**
   * 删除键
   */
  async delete(key: string): Promise<void> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      return adapter.delete(key);
    }

    try {
      const fullKey = this.getFullKey(key);
      await this.client!.del(fullKey);
    } catch (error) {
      console.warn('[RedisStore] Delete error, switching to fallback:', error);
      this.useFallback = true;
      return this.fallbackAdapter.delete(key);
    }
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      return adapter.clear();
    }

    try {
      const pattern = `${this.config.keyPrefix}*`;
      await this.client!.flush(pattern);
    } catch (error) {
      console.warn('[RedisStore] Clear error, switching to fallback:', error);
      this.useFallback = true;
      return this.fallbackAdapter.clear();
    }
  }

  /**
   * 获取键列表
   */
  async keys(pattern?: string): Promise<string[]> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      return adapter.keys(pattern);
    }

    try {
      const fullPattern = `${this.config.keyPrefix}${pattern ?? '*'}`;
      const keys = await this.client!.scanKeys(fullPattern);
      // 移除前缀
      const prefixLen = this.config.keyPrefix.length;
      return keys.map(k => k.slice(prefixLen));
    } catch (error) {
      console.warn('[RedisStore] Keys error, switching to fallback:', error);
      this.useFallback = true;
      return this.fallbackAdapter.keys(pattern);
    }
  }

  /**
   * 获取原始存储项（包含元数据）
   */
  async getItem<T>(key: string): Promise<StorageItem<T> | null> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      return adapter.get<StorageItem<T>>(key);
    }

    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client!.get(fullKey);
      
      if (value === null) return null;
      
      return JSON.parse(value) as StorageItem<T>;
    } catch (error) {
      console.warn('[RedisStore] GetItem error:', error);
      return null;
    }
  }

  /**
   * 设置原始存储项（包含元数据）
   */
  async setItem<T>(key: string, item: StorageItem<T>): Promise<void> {
    const adapter = this.getAdapter();
    
    if (adapter === this.fallbackAdapter) {
      return adapter.set(key, item, item.ttl);
    }

    try {
      const fullKey = this.getFullKey(key);
      const serialized = JSON.stringify(item);
      await this.client!.set(fullKey, serialized, item.ttl);
    } catch (error) {
      console.warn('[RedisStore] SetItem error:', error);
      this.useFallback = true;
      return this.fallbackAdapter.set(key, item, item.ttl);
    }
  }

  /**
   * 批量获取
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = [];
    for (const key of keys) {
      results.push(await this.get<T>(key));
    }
    return results;
  }

  /**
   * 批量设置
   */
  async mset<T>(entries: { key: string; value: T; ttl?: number }[]): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * 批量删除
   */
  async mdel(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key);
    }
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<{
    totalKeys: number;
    transientCount: number;
    stagingCount: number;
    archiveCount: number;
    usingFallback: boolean;
  }> {
    const allKeys = await this.keys('*');
    let transientCount = 0;
    let stagingCount = 0;
    let archiveCount = 0;

    for (const key of allKeys) {
      const item = await this.getItem(key);
      if (item) {
        switch (item.tier) {
          case 'transient':
            transientCount++;
            break;
          case 'staging':
            stagingCount++;
            break;
          case 'archive':
            archiveCount++;
            break;
        }
      }
    }

    return {
      totalKeys: allKeys.length,
      transientCount,
      stagingCount,
      archiveCount,
      usingFallback: this.useFallback,
    };
  }

  /**
   * 强制切换到降级模式
   */
  forceFallback(): void {
    this.useFallback = true;
    console.log('[RedisStore] Forced fallback to memory storage');
  }

  /**
   * 尝试重新连接Redis
   */
  async retryConnection(): Promise<boolean> {
    if (!this.useFallback) return true;
    
    console.log('[RedisStore] Retrying Redis connection...');
    this.useFallback = false;
    return this.connect();
  }
}

/**
 * 创建RedisStore实例（工厂函数）
 */
export function createRedisStore(config?: Partial<RedisConfig>): RedisStore {
  return new RedisStore(config);
}

/**
 * 默认导出
 */
export default RedisStore;
