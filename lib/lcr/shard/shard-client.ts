/**
 * 分片客户端接口
 * HAJIMI-PERF-OPT-001 / B-03/03 (OPT-SHARD-001)
 * 
 * 职责:
 * - 与单个分片实例通信
 * - 向量增删改查操作
 * - 分片健康检查
 * - 连接池管理
 * 
 * @module lib/lcr/shard/shard-client
 * @version 1.0.0
 * @since 2026-02-17
 */

// ============================================================================
// 基础类型
// ============================================================================

/** 分片ID */
export type ShardId = string;

/** 向量ID */
export type VectorId = string;

/** 分片状态 */
export type ShardState = 'initializing' | 'ready' | 'busy' | 'error' | 'closed';

// ============================================================================
// 分片客户端配置
// ============================================================================

/**
 * 分片客户端配置
 */
export interface IShardClientConfig {
  /** 分片ID */
  shardId: ShardId;
  
  /** 主机地址 */
  host: string;
  
  /** 端口 */
  port: number;
  
  /** 连接超时 (毫秒, 默认5000) */
  connectTimeoutMs?: number;
  
  /** 请求超时 (毫秒, 默认2000) */
  requestTimeoutMs?: number;
  
  /** 最大重试次数 */
  maxRetries?: number;
  
  /** 重试间隔 (毫秒) */
  retryDelayMs?: number;
  
  /** 连接池大小 */
  connectionPoolSize?: number;
  
  /** 是否启用 keep-alive */
  keepAlive?: boolean;
  
  /** 健康检查间隔 (毫秒) */
  healthCheckIntervalMs?: number;
}

/**
 * HNSW索引参数
 */
export interface IHNSWParams {
  /** 每个节点最大连接数 */
  M: number;
  
  /** 构建时搜索范围 */
  efConstruction: number;
  
  /** 查询时搜索范围 */
  efSearch: number;
}

// ============================================================================
// 分片客户端接口
// ============================================================================

/**
 * 分片客户端接口
 * 
 * 每个分片客户端对应一个Lazy-RAG实例
 */
export interface IShardClient {
  /** 配置 */
  readonly config: IShardClientConfig;
  
  /** 分片ID */
  readonly shardId: ShardId;
  
  /** 当前状态 */
  readonly state: ShardState;
  
  /** 是否已连接 */
  readonly isConnected: boolean;
  
  /**
   * 连接分片
   */
  connect(): Promise<void>;
  
  /**
   * 断开连接
   */
  disconnect(): Promise<void>;
  
  /**
   * 向量相似度搜索
   * @param request 搜索请求
   */
  search(request: ISearchRequest): Promise<ISearchResult>;
  
  /**
   * 批量插入向量
   * @param vectors 向量数据列表
   */
  insertVectors(vectors: IVectorData[]): Promise<IInsertResult>;
  
  /**
   * 删除向量
   * @param vectorIds 向量ID列表
   */
  deleteVectors(vectorIds: VectorId[]): Promise<IDeleteResult>;
  
  /**
   * 获取向量数据
   * @param vectorId 向量ID
   */
  getVector(vectorId: VectorId): Promise<IVectorData | null>;
  
  /**
   * 批量获取向量
   * @param vectorIds 向量ID列表
   */
  getVectors(vectorIds: VectorId[]): Promise<IVectorData[]>;
  
  /**
   * 检查向量是否存在
   * @param vectorId 向量ID
   */
  hasVector(vectorId: VectorId): Promise<boolean>;
  
  /**
   * 获取分片统计信息
   */
  getStats(): Promise<IShardStats>;
  
  /**
   * 健康检查
   */
  health(): Promise<IHealthResponse>;
  
  /**
   * 初始化索引
   * @param params HNSW参数
   * @param dimension 向量维度
   */
  initializeIndex(params: IHNSWParams, dimension: number): Promise<void>;
  
  /**
   * 保存索引到磁盘
   */
  saveIndex(): Promise<void>;
  
  /**
   * 从磁盘加载索引
   */
  loadIndex(): Promise<void>;
}

// ============================================================================
// 搜索相关类型
// ============================================================================

/**
 * 搜索请求
 */
export interface ISearchRequest {
  /** 查询向量 */
  vector: number[];
  
  /** 返回Top-K结果 (默认10) */
  topK?: number;
  
  /** 相似度阈值 (0-1, 默认0.5) */
  threshold?: number;
  
  /** 过滤器 */
  filter?: IVectorFilter;
  
  /** 是否包含向量数据 */
  includeVector?: boolean;
  
  /** 是否包含元数据 */
  includeMetadata?: boolean;
}

/**
 * 向量过滤器
 */
export interface IVectorFilter {
  /** 元数据过滤条件 */
  metadata?: Record<string, unknown>;
  
  /** 向量ID白名单 */
  vectorIds?: VectorId[];
  
  /** 排除的向量ID */
  excludeIds?: VectorId[];
}

/**
 * 搜索结果
 */
export interface ISearchResult {
  /** 结果列表 */
  results: IScoredVector[];
  
  /** 搜索耗时 (毫秒) */
  latencyMs: number;
  
  /** 搜索的分片ID */
  shardId: ShardId;
  
  /** 是否从缓存读取 */
  fromCache?: boolean;
}

/**
 * 带分数的向量
 */
export interface IScoredVector {
  /** 向量ID */
  id: VectorId;
  
  /** 相似度分数 (0-1) */
  score: number;
  
  /** 向量数据 */
  vector?: number[];
  
  /** 关联内容 */
  content?: string;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 向量数据操作
// ============================================================================

/**
 * 向量数据
 */
export interface IVectorData {
  /** 向量ID */
  id: VectorId;
  
  /** 向量数据 */
  vector: number[];
  
  /** 关联内容 (可选) */
  content?: string;
  
  /** 元数据 (可选) */
  metadata?: Record<string, unknown>;
  
  /** 创建时间戳 */
  timestamp?: number;
}

/**
 * 插入结果
 */
export interface IInsertResult {
  /** 成功插入数量 */
  inserted: number;
  
  /** 失败的向量ID列表 */
  failed: VectorId[];
  
  /** 插入耗时 (毫秒) */
  latencyMs: number;
  
  /** 错误信息 */
  errors?: Array<{ id: VectorId; error: string }>;
}

/**
 * 删除结果
 */
export interface IDeleteResult {
  /** 成功删除数量 */
  deleted: number;
  
  /** 不存在的向量ID */
  notFound: VectorId[];
  
  /** 删除耗时 (毫秒) */
  latencyMs: number;
}

// ============================================================================
// 分片统计与健康
// ============================================================================

/**
 * 分片统计信息
 */
export interface IShardStats {
  /** 分片ID */
  shardId: ShardId;
  
  /** 当前向量数量 */
  vectorCount: number;
  
  /** 最大容量 */
  maxCapacity: number;
  
  /** 容量使用率 (0-1) */
  capacityUsage: number;
  
  /** 向量维度 */
  vectorDimension: number;
  
  /** 索引类型 */
  indexType: string;
  
  /** 内存使用 (MB) */
  memoryUsageMB: number;
  
  /** 磁盘使用 (MB) */
  diskUsageMB: number;
  
  /** 总查询次数 */
  totalQueries: number;
  
  /** 平均查询延迟 (毫秒) */
  avgQueryLatencyMs: number;
  
  /** 最后查询时间 */
  lastQueryAt?: number;
  
  /** HNSW参数 */
  hnswParams: IHNSWParams;
  
  /** 运行时间 (秒) */
  uptime: number;
}

/**
 * 健康检查响应
 */
export interface IHealthResponse {
  /** 健康状态 */
  status: 'healthy' | 'degraded' | 'unhealthy';
  
  /** 分片ID */
  shardId: ShardId;
  
  /** 检查时间戳 */
  timestamp: number;
  
  /** 运行时间 (秒) */
  uptime: number;
  
  /** 当前向量数 */
  vectorCount: number;
  
  /** 内存使用 (MB) */
  memoryUsageMB: number;
  
  /** 最后错误信息 */
  lastError?: string;
  
  /** 详细信息 */
  details?: {
    cpuUsage?: number;
    loadAverage?: number;
    diskSpace?: number;
  };
}

// ============================================================================
// 扫描器（用于数据迁移）
// ============================================================================

/**
 * 扫描器配置
 */
export interface IScannerConfig {
  /** 起始向量ID */
  startId?: VectorId;
  
  /** 结束向量ID */
  endId?: VectorId;
  
  /** 哈希范围（用于一致性哈希重平衡） */
  hashRange?: { start: number; end: number };
  
  /** 从指定ID恢复扫描 */
  resumeFrom?: VectorId;
  
  /** 批次大小 */
  batchSize?: number;
}

/**
 * 向量扫描器接口
 */
export interface IVectorScanner {
  /**
   * 创建扫描器
   * @param config 扫描配置
   */
  createScanner(config: IScannerConfig): AsyncIterableIterator<IVectorData>;
  
  /**
   * 按哈希范围扫描向量
   * @param startHash 起始哈希
   * @param endHash 结束哈希
   */
  scanByHashRange(
    startHash: number,
    endHash: number
  ): AsyncIterableIterator<IVectorData>;
  
  /**
   * 获取指定ID范围的向量数量
   * @param idRange ID范围
   */
  countVectors(idRange?: { start: VectorId; end: VectorId }): Promise<number>;
  
  /**
   * 随机抽样向量
   * @param count 抽样数量
   * @param idRange ID范围
   */
  sampleVectors(
    count: number,
    idRange?: { start: VectorId; end: VectorId }
  ): Promise<IVectorData[]>;
}

// ============================================================================
// 分片服务器接口
// ============================================================================

/**
 * 分片服务器配置
 */
export interface IShardServerConfig {
  /** 分片ID */
  shardId: ShardId;
  
  /** 监听端口 */
  port: number;
  
  /** 监听主机 */
  host: string;
  
  /** 数据目录 */
  dataDir: string;
  
  /** HNSW参数 */
  hnswParams: IHNSWParams;
  
  /** 向量维度 */
  vectorDimension: number;
  
  /** 最大向量数 */
  maxVectors: number;
  
  /** 是否自动保存 */
  autoSave?: boolean;
  
  /** 自动保存间隔 (秒) */
  autoSaveIntervalSec?: number;
}

/**
 * 分片服务器接口
 * 
 * 单个分片的服务端实现
 */
export interface IShardServer {
  /** 配置 */
  readonly config: IShardServerConfig;
  
  /** 当前状态 */
  readonly state: ShardState;
  
  /**
   * 启动服务器
   */
  start(): Promise<void>;
  
  /**
   * 优雅关闭服务器
   * @param graceful 是否优雅关闭
   */
  stop(graceful?: boolean): Promise<void>;
  
  /**
   * 强制保存索引
   */
  forceSave(): Promise<void>;
  
  /**
   * 获取服务器统计
   */
  getStats(): IShardStats;
}

// ============================================================================
// 错误类型
// ============================================================================

export class ShardClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly shardId?: ShardId
  ) {
    super(message);
    this.name = 'ShardClientError';
  }
}

export class ShardConnectionError extends ShardClientError {
  constructor(shardId: ShardId, host: string, port: number, cause?: Error) {
    super(
      `Failed to connect to shard ${shardId} at ${host}:${port}`,
      'CONNECTION_FAILED',
      shardId
    );
    if (cause) {
      this.cause = cause;
    }
  }
  
  cause?: Error;
}

export class ShardTimeoutError extends ShardClientError {
  constructor(shardId: ShardId, operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out on shard ${shardId} after ${timeoutMs}ms`,
      'TIMEOUT',
      shardId
    );
  }
}

export class ShardCapacityError extends ShardClientError {
  constructor(shardId: ShardId, current: number, max: number) {
    super(
      `Shard ${shardId} capacity exceeded: ${current}/${max}`,
      'CAPACITY_EXCEEDED',
      shardId
    );
  }
}

// ============================================================================
// 常量定义
// ============================================================================

export const ShardClientConstants = {
  /** 默认连接超时 (毫秒) */
  DEFAULT_CONNECT_TIMEOUT_MS: 5000,
  
  /** 默认请求超时 (毫秒) */
  DEFAULT_REQUEST_TIMEOUT_MS: 2000,
  
  /** 默认最大重试次数 */
  DEFAULT_MAX_RETRIES: 2,
  
  /** 默认重试间隔 (毫秒) */
  DEFAULT_RETRY_DELAY_MS: 100,
  
  /** 默认连接池大小 */
  DEFAULT_CONNECTION_POOL_SIZE: 5,
  
  /** 默认健康检查间隔 (毫秒) */
  DEFAULT_HEALTH_CHECK_INTERVAL_MS: 10000,
  
  /** 最大向量维度 */
  MAX_VECTOR_DIMENSION: 2048,
  
  /** 默认HNSW参数 */
  DEFAULT_HNSW_PARAMS: {
    M: 16,
    efConstruction: 200,
    efSearch: 64,
  } as IHNSWParams,
} as const;

// ============================================================================
// 工厂函数类型
// ============================================================================

/**
 * 分片客户端工厂函数
 */
export type ShardClientFactory = (config: IShardClientConfig) => IShardClient;

/**
 * 分片服务器工厂函数
 */
export type ShardServerFactory = (config: IShardServerConfig) => IShardServer;
