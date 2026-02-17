/**
 * 分片路由器接口
 * HAJIMI-PERF-OPT-001 / B-03/03 (OPT-SHARD-001)
 * 
 * 职责:
 * - 一致性哈希路由
 * - 查询广播分发
 * - 结果合并
 * - 分片健康检查
 * 
 * @module lib/lcr/shard/router
 * @version 1.0.0
 * @since 2026-02-17
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/** 分片ID */
export type ShardId = string;

/** 向量ID */
export type VectorId = string;

/** 分片健康状态 */
export type ShardHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'offline';

/** 路由策略 */
export type RoutingStrategy = 'consistent-hash' | 'round-robin' | 'least-loaded';

// ============================================================================
// 一致性哈希环
// ============================================================================

/**
 * 一致性哈希环配置
 */
export interface IConsistentHashConfig {
  /** 每个物理分片的虚拟节点数 (默认150) */
  virtualNodesPerShard: number;
  
  /** 哈希环大小 (默认2^32) */
  ringSize: number;
  
  /** 哈希算法 ('fnv1a' | 'murmur3') */
  hashAlgorithm: string;
}

/**
 * 虚拟节点
 */
export interface IVirtualNode {
  /** 虚拟节点哈希值 */
  hash: number;
  
  /** 所属物理分片ID */
  shardId: ShardId;
  
  /** 虚拟节点序号 */
  virtualIndex: number;
}

/**
 * 一致性哈希环接口
 */
export interface IConsistentHashRing {
  /** 配置 */
  readonly config: IConsistentHashConfig;
  
  /** 当前注册的分片列表 */
  readonly registeredShards: ShardId[];
  
  /**
   * 添加分片到哈希环
   * @param shardId 分片ID
   */
  addShard(shardId: ShardId): void;
  
  /**
   * 从哈希环移除分片
   * @param shardId 分片ID
   * @returns 受影响的数据范围（用于重平衡）
   */
  removeShard(shardId: ShardId): IDataRange[];
  
  /**
   * 根据向量ID获取目标分片
   * @param vectorId 向量ID
   * @returns 分片ID
   */
  getShardForVector(vectorId: VectorId): ShardId;
  
  /**
   * 获取向量ID应该归属的分片列表（用于重平衡）
   * @param vectorId 向量ID
   */
  getShardHistory(vectorId: VectorId): ShardId[];
  
  /**
   * 计算数据迁移计划
   * @param oldShards 旧分片配置
   * @param newShards 新分片配置
   */
  computeMigrationPlan(
    oldShards: ShardId[],
    newShards: ShardId[]
  ): IMigrationPlan;
}

/**
 * 数据范围
 */
export interface IDataRange {
  /** 起始哈希值 */
  startHash: number;
  
  /** 结束哈希值 */
  endHash: number;
  
  /** 源分片 */
  fromShard: ShardId;
  
  /** 目标分片 */
  toShard: ShardId;
}

/**
 * 迁移计划
 */
export interface IMigrationPlan {
  /** 迁移任务列表 */
  migrations: IMigrationTask[];
  
  /** 预计迁移数据量 */
  estimatedDataSize: number;
  
  /** 预计迁移时间 (秒) */
  estimatedDuration: number;
}

/**
 * 迁移任务
 */
export interface IMigrationTask {
  /** 任务ID */
  taskId: string;
  
  /** 源分片 */
  fromShard: ShardId;
  
  /** 目标分片 */
  toShard: ShardId;
  
  /** 数据范围 */
  dataRange: IDataRange;
  
  /** 优先级 */
  priority: number;
}

// ============================================================================
// 分片路由
// ============================================================================

/**
 * 分片路由配置
 */
export interface IShardRouterConfig {
  /** 路由端口 */
  port: number;
  
  /** 主机地址 */
  host: string;
  
  /** 一致性哈希配置 */
  hashConfig: IConsistentHashConfig;
  
  /** 分片客户端配置列表 */
  shardConfigs: IShardClientConfig[];
  
  /** 查询超时 (毫秒, 默认2000) */
  queryTimeoutMs: number;
  
  /** 最少需要的分片响应数 */
  minShardsRequired: number;
  
  /** 是否允许部分结果 */
  allowPartialResults: boolean;
  
  /** 健康检查间隔 (毫秒) */
  healthCheckIntervalMs: number;
  
  /** 缓存配置 */
  cacheConfig?: IQueryCacheConfig;
}

/**
 * 分片客户端配置
 */
export interface IShardClientConfig {
  /** 分片ID */
  shardId: ShardId;
  
  /** 分片地址 */
  host: string;
  
  /** 分片端口 */
  port: number;
  
  /** 权重 (用于负载均衡) */
  weight?: number;
  
  /** 最大连接数 */
  maxConnections?: number;
}

/**
 * 查询缓存配置
 */
export interface IQueryCacheConfig {
  /** 是否启用缓存 */
  enabled: boolean;
  
  /** 最大缓存条目数 */
  maxSize: number;
  
  /** 缓存TTL (毫秒) */
  ttlMs: number;
  
  /** 相似度阈值 (用于近似匹配) */
  similarityThreshold: number;
}

/**
 * 分片健康信息
 */
export interface IShardHealth {
  /** 分片ID */
  shardId: ShardId;
  
  /** 健康状态 */
  status: ShardHealthStatus;
  
  /** 最后检查时间 */
  lastCheck: number;
  
  /** 当前向量数 */
  vectorCount: number;
  
  /** 容量使用率 (0-1) */
  capacityUsage: number;
  
  /** 内存使用 (MB) */
  memoryUsageMB: number;
  
  /** 最后查询延迟 (ms) */
  lastQueryLatencyMs: number;
  
  /** 连续失败次数 */
  consecutiveFailures: number;
  
  /** 错误信息 */
  error?: string;
}

/**
 * 分片路由器接口
 */
export interface IShardRouter {
  /** 配置 */
  readonly config: IShardRouterConfig;
  
  /** 一致性哈希环 */
  readonly hashRing: IConsistentHashRing;
  
  /** 当前健康分片列表 */
  readonly healthyShards: ShardId[];
  
  /**
   * 初始化路由器
   */
  initialize(): Promise<void>;
  
  /**
   * 执行分布式查询
   * @param request 查询请求
   * @returns 合并后的查询结果
   */
  query(request: IShardedQueryRequest): Promise<IShardedQueryResult>;
  
  /**
   * 向指定分片路由向量写入
   * @param vectorId 向量ID
   * @param vector 向量数据
   */
  routeVectorWrite(vectorId: VectorId, vector: number[]): Promise<IShardWriteResult>;
  
  /**
   * 获取向量所在分片
   * @param vectorId 向量ID
   */
  getShardForVector(vectorId: VectorId): ShardId;
  
  /**
   * 获取所有健康分片
   */
  getHealthyShards(): IShardClient[];
  
  /**
   * 获取分片健康状态
   * @param shardId 分片ID
   */
  getShardHealth(shardId: ShardId): IShardHealth | undefined;
  
  /**
   * 添加新分片（扩容）
   * @param config 分片配置
   * @returns 迁移计划
   */
  addShard(config: IShardClientConfig): Promise<IMigrationPlan>;
  
  /**
   * 移除分片（缩容）
   * @param shardId 分片ID
   * @param migrateData 是否迁移数据
   */
  removeShard(shardId: ShardId, migrateData?: boolean): Promise<void>;
  
  /**
   * 关闭路由器
   */
  shutdown(): Promise<void>;
}

// ============================================================================
// 查询请求/响应
// ============================================================================

/**
 * 分片查询请求
 */
export interface IShardedQueryRequest {
  /** 查询向量 */
  vector: number[];
  
  /** 返回Top-K结果 (默认10) */
  topK?: number;
  
  /** 相似度阈值 (0-1, 默认0.5) */
  threshold?: number;
  
  /** 查询过滤器 */
  filter?: IVectorFilter;
  
  /** 超时时间 (毫秒) */
  timeoutMs?: number;
  
  /** 是否使用缓存 */
  useCache?: boolean;
}

/**
 * 向量过滤器
 */
export interface IVectorFilter {
  /** 元数据过滤条件 */
  metadata?: Record<string, unknown>;
  
  /** 向量ID列表 (白名单) */
  vectorIds?: VectorId[];
  
  /** 排除的向量ID */
  excludeIds?: VectorId[];
}

/**
 * 分片查询结果
 */
export interface IShardedQueryResult {
  /** 查询结果列表 */
  results: IScoredVector[];
  
  /** 总结果数 */
  total: number;
  
  /** 查询耗时 (毫秒) */
  latencyMs: number;
  
  /** 是否为部分结果 */
  partialResults: boolean;
  
  /** 分片统计 */
  shardStats: IShardQueryStats;
  
  /** 是否使用缓存 */
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
  
  /** 向量数据 (可选，根据配置返回) */
  vector?: number[];
  
  /** 关联内容 */
  content?: string;
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
  
  /** 来源分片 */
  sourceShard: ShardId;
}

/**
 * 分片查询统计
 */
export interface IShardQueryStats {
  /** 总分片数 */
  totalShards: number;
  
  /** 成功响应分片数 */
  successfulShards: number;
  
  /** 失败分片数 */
  failedShards: number;
  
  /** 失败分片ID列表 */
  failedShardIds: ShardId[];
  
  /** 各分片延迟 */
  shardLatencies: Record<ShardId, number>;
}

/**
 * 分片写入结果
 */
export interface IShardWriteResult {
  /** 是否成功 */
  success: boolean;
  
  /** 目标分片ID */
  shardId: ShardId;
  
  /** 写入的向量ID */
  vectorId: VectorId;
  
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 分片客户端（前置声明，完整实现在 shard-client.ts）
// ============================================================================

import type { IShardClient } from './shard-client';

// ============================================================================
// 结果合并器
// ============================================================================

/**
 * 结果合并器接口
 */
export interface IResultMerger {
  /**
   * 合并多个分片的查询结果
   * @param partialResults 各分片的局部结果
   * @param topK 最终需要的Top-K数量
   * @returns 全局Top-K结果
   * 
   * 复杂度: O(N log K)
   */
  mergeResults(
    partialResults: IShardPartialResult[],
    topK: number
  ): IScoredVector[];
  
  /**
   * 去重（相同ID取最高分）
   * @param results 结果列表
   */
  deduplicate(results: IScoredVector[]): IScoredVector[];
}

/**
 * 分片局部结果
 */
export interface IShardPartialResult {
  /** 分片ID */
  shardId: ShardId;
  
  /** 结果列表 */
  results: IScoredVector[];
  
  /** 查询延迟 (毫秒) */
  latencyMs: number;
  
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 常量定义
// ============================================================================

export const ShardRouterConstants = {
  /** 默认端口 */
  DEFAULT_PORT: 7940,
  
  /** 默认分片端口起始 */
  DEFAULT_SHARD_BASE_PORT: 7941,
  
  /** 默认虚拟节点数 */
  DEFAULT_VIRTUAL_NODES: 150,
  
  /** 默认查询超时 (毫秒) */
  DEFAULT_QUERY_TIMEOUT_MS: 2000,
  
  /** 默认最少分片数 */
  DEFAULT_MIN_SHARDS: 1,
  
  /** 健康检查间隔 (毫秒) */
  HEALTH_CHECK_INTERVAL_MS: 10000,
  
  /** 最大分片数 */
  MAX_SHARDS: 10,
  
  /** 每分片最大向量数 */
  MAX_VECTORS_PER_SHARD: 50000,
} as const;

// ============================================================================
// 错误类型
// ============================================================================

export class ShardRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly shardId?: ShardId,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ShardRouterError';
  }
}

export class InsufficientShardsError extends ShardRouterError {
  constructor(
    available: number,
    required: number
  ) {
    super(
      `Insufficient shards available: ${available}/${required}`,
      'INSUFFICIENT_SHARDS'
    );
  }
}

export class ShardNotFoundError extends ShardRouterError {
  constructor(shardId: ShardId) {
    super(`Shard not found: ${shardId}`, 'SHARD_NOT_FOUND', shardId);
  }
}

export class QueryTimeoutError extends ShardRouterError {
  constructor(shardId: ShardId, timeoutMs: number) {
    super(
      `Query timeout on shard ${shardId} after ${timeoutMs}ms`,
      'QUERY_TIMEOUT',
      shardId
    );
  }
}

// ============================================================================
// 导出
// ============================================================================

export * from './shard-client';
