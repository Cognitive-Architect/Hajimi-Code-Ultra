/**
 * LCR (Local Context Runtime) 核心接口定义
 * HAJIMI-LCR-TRIPLE-DIM-001 工单 B-05/09
 * 
 * Focus/Working层运行时接口规范
 * 
 * @module lib/lcr/core/interfaces
 * @author 唐音 (Engineer)
 * @version 1.0.0
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 内存层级类型
 */
export type MemoryTier = 'focus' | 'working' | 'archive' | 'rag';

/**
 * 内存条目状态
 */
export type EntryStatus = 'active' | 'evicting' | 'archived' | 'stale';

/**
 * Token计数算法类型
 */
export type TokenAlgorithm = 'tiktoken' | 'approximate' | 'hybrid';

// ============================================================================
// 内存条目接口
// ============================================================================

/**
 * 内存条目 (Memory Entry)
 * 
 * 自测: MEM-001 内存条目完整性
 */
export interface IMemoryEntry {
  /** 唯一标识符 */
  id: string;
  
  /** 内容 */
  content: string;
  
  /** Token数量 (由计数器计算) */
  tokens: number;
  
  /** 重要性评分 0-100 */
  importance: number;
  
  /** 创建时间戳 */
  timestamp: number;
  
  /** 最后访问时间戳 */
  lastAccess: number;
  
  /** 访问次数 */
  accessCount: number;
  
  /** 状态 */
  status: EntryStatus;
  
  /** 语义嵌入向量 (可选) */
  embedding?: number[];
  
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 内存条目创建选项
 */
export interface IMemoryEntryOptions {
  id?: string;
  content: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

// ============================================================================
// Token计数器接口
// ============================================================================

/**
 * Token计数器配置
 * 
 * 自测: MEM-004 Token计数误差<1%
 */
export interface ITokenCounterConfig {
  /** 算法类型 */
  algorithm: TokenAlgorithm;
  
  /** 近似算法的字符/Token比例 (默认4:1) */
  charToTokenRatio?: number;
  
  /** 模型名称 (用于tiktoken) */
  modelName?: string;
  
  /** 缓存大小 */
  cacheSize?: number;
  
  /** 是否启用缓存 */
  enableCache?: boolean;
}

/**
 * Token计数结果
 */
export interface ITokenCountResult {
  /** Token数量 */
  tokens: number;
  
  /** 使用的算法 */
  algorithm: TokenAlgorithm;
  
  /** 置信度 (0-1) */
  confidence: number;
  
  /** 处理时间 (ms) */
  processingTime: number;
}

/**
 * Token计数器接口
 */
export interface ITokenCounter {
  /** 配置 */
  readonly config: ITokenCounterConfig;
  
  /**
   * 计算文本的Token数量
   * @param text 输入文本
   * @returns Token计数结果
   */
  count(text: string): Promise<ITokenCountResult> | ITokenCountResult;
  
  /**
   * 批量计算Token数量
   * @param texts 文本数组
   * @returns Token计数结果数组
   */
  countBatch(texts: string[]): Promise<ITokenCountResult[]> | ITokenCountResult[];
  
  /**
   * 预估剩余容量
   * @param currentTokens 当前Token数
   * @param maxTokens 最大Token数
   * @param newText 新文本
   * @returns 是否可放入
   */
  canFit(currentTokens: number, maxTokens: number, newText: string): boolean;
}

// ============================================================================
// LRU淘汰策略接口
// ============================================================================

/**
 * LRU节点
 * 
 * 自测: MEM-005 LRU淘汰延迟<50ms
 */
export interface ILRUNode<T> {
  /** 键 */
  key: string;
  
  /** 值 */
  value: T;
  
  /** 前一个节点 */
  prev: ILRUNode<T> | null;
  
  /** 后一个节点 */
  next: ILRUNode<T> | null;
  
  /** 访问时间戳 */
  accessTime: number;
  
  /** 访问频率 (用于LRU-K) */
  frequency: number;
}

/**
 * LRU缓存配置
 */
export interface ILRUCacheConfig {
  /** 最大容量 (条目数) */
  maxSize: number;
  
  /** 最大Token数量 */
  maxTokens: number;
  
  /** TTL (ms, 0表示不过期) */
  ttl?: number;
  
  /** 是否启用LRU-K */
  useLRUK?: boolean;
  
  /** K值 (访问次数阈值) */
  kValue?: number;
}

/**
 * 淘汰结果
 */
export interface IEvictionResult<T> {
  /** 被淘汰的条目 */
  evicted: Array<{ key: string; value: T; tokens: number }>;
  
  /** 淘汰原因 */
  reason: 'capacity' | 'token_limit' | 'ttl' | 'promotion';
  
  /** 淘汰耗时 */
  duration: number;
}

/**
 * LRU缓存接口
 */
export interface ILRUCache<T> {
  /** 配置 */
  readonly config: ILRUCacheConfig;
  
  /** 当前大小 */
  readonly size: number;
  
  /** 当前Token数 */
  readonly tokenCount: number;
  
  /**
   * 获取条目
   * @param key 键
   * @returns 条目或undefined
   */
  get(key: string): T | undefined;
  
  /**
   * 设置条目
   * @param key 键
   * @param value 值
   * @param tokens Token数量
   * @returns 淘汰结果 (如有)
   */
  set(key: string, value: T, tokens: number): IEvictionResult<T> | null;
  
  /**
   * 删除条目
   * @param key 键
   * @returns 是否成功
   */
  delete(key: string): boolean;
  
  /**
   * 淘汰指定数量的Token
   * @param tokensNeeded 需要淘汰的Token数
   * @returns 淘汰结果
   */
  evictTokens(tokensNeeded: number): IEvictionResult<T>;
  
  /**
   * 提升到头部 (最近使用)
   * @param key 键
   */
  promote(key: string): void;
  
  /**
   * 清空缓存
   */
  clear(): void;
  
  /**
   * 获取所有键
   */
  keys(): string[];
  
  /**
   * 获取所有值
   */
  values(): T[];
}

// ============================================================================
// Focus层接口
// ============================================================================

/**
 * Focus层配置
 * 
 * 限制: <8K Token硬限制 (MEM-002)
 */
export interface IFocusLayerConfig {
  /** 最大Token数 (默认8192) */
  maxTokens: number;
  
  /** 警戒阈值 (默认0.9) */
  warningThreshold: number;
  
  /** Token计数器配置 */
  tokenCounter: ITokenCounterConfig;
  
  /** 是否启用严格模式 */
  strictMode: boolean;
}

/**
 * Focus层操作结果
 */
export interface IFocusResult {
  /** 是否成功 */
  success: boolean;
  
  /** 当前Token使用量 */
  tokenUsage: number;
  
  /** 剩余Token数 */
  tokensRemaining: number;
  
  /** 消息 */
  message?: string;
  
  /** 触发晋升的条目 */
  promotedEntry?: IMemoryEntry;
}

/**
 * Focus层接口
 */
export interface IFocusLayer {
  /** 配置 */
  readonly config: IFocusLayerConfig;
  
  /** 当前Token使用量 */
  readonly tokenUsage: number;
  
  /** 是否已满 */
  readonly isFull: boolean;
  
  /** 是否达到警戒阈值 */
  readonly isWarning: boolean;
  
  /**
   * 添加条目
   * @param entry 内存条目
   * @returns 操作结果
   */
  add(entry: IMemoryEntry): Promise<IFocusResult> | IFocusResult;
  
  /**
   * 获取条目
   * @param id 条目ID
   * @returns 条目或null
   */
  get(id: string): IMemoryEntry | null;
  
  /**
   * 删除条目
   * @param id 条目ID
   * @returns 是否成功
   */
  remove(id: string): boolean;
  
  /**
   * 淘汰条目以腾出空间
   * @param tokensNeeded 需要的Token数
   * @returns 被淘汰的条目
   */
  evict(tokensNeeded: number): IMemoryEntry[];
  
  /**
   * 清空Focus层
   */
  clear(): void;
  
  /**
   * 获取所有条目
   */
  getAll(): IMemoryEntry[];
  
  /**
   * 检查是否有足够空间
   * @param tokens 需要的Token数
   */
  hasSpace(tokens: number): boolean;
}

// ============================================================================
// Working层接口
// ============================================================================

/**
 * Working层配置
 * 
 * 限制: 128K Token, LRU淘汰 (MEM-003)
 */
export interface IWorkingLayerConfig {
  /** 最大Token数 (默认131072) */
  maxTokens: number;
  
  /** 条目数上限 */
  maxEntries: number;
  
  /** LRU配置 */
  lruConfig: ILRUCacheConfig;
  
  /** 晋升阈值 (重要性>=此值晋升到Focus) */
  promotionThreshold: number;
  
  /** 晋升冷却时间 (ms) */
  promotionCooldown: number;
  
  /** 预加载条目数 */
  preloadCount: number;
}

/**
 * Working层操作结果
 */
export interface IWorkingResult {
  /** 是否成功 */
  success: boolean;
  
  /** 当前Token使用量 */
  tokenUsage: number;
  
  /** 被淘汰的条目 */
  evicted?: IMemoryEntry[];
  
  /** 晋升到Focus的条目 */
  promoted?: IMemoryEntry;
  
  /** 消息 */
  message?: string;
}

/**
 * Working层接口
 */
export interface IWorkingLayer {
  /** 配置 */
  readonly config: IWorkingLayerConfig;
  
  /** 当前Token使用量 */
  readonly tokenUsage: number;
  
  /** 当前条目数 */
  readonly entryCount: number;
  
  /** LRU缓存统计 */
  readonly lruStats: ILRUStats;
  
  /**
   * 添加条目
   * @param entry 内存条目
   * @returns 操作结果
   */
  add(entry: IMemoryEntry): Promise<IWorkingResult> | IWorkingResult;
  
  /**
   * 获取条目 (触发LRU更新)
   * @param id 条目ID
   * @returns 条目或null
   */
  get(id: string): IMemoryEntry | null;
  
  /**
   * 删除条目
   * @param id 条目ID
   * @returns 是否成功
   */
  remove(id: string): boolean;
  
  /**
   * 从Working层淘汰条目
   * @param count 淘汰数量
   * @returns 被淘汰的条目
   */
  evict(count: number): IMemoryEntry[];
  
  /**
   * 清空Working层
   */
  clear(): void;
  
  /**
   * 获取所有条目 (按LRU顺序)
   */
  getAll(): IMemoryEntry[];
  
  /**
   * 检查是否包含条目
   * @param id 条目ID
   */
  has(id: string): boolean;
}

/**
 * LRU统计信息
 */
export interface ILRUStats {
  /** 命中次数 */
  hits: number;
  
  /** 未命中次数 */
  misses: number;
  
  /** 淘汰次数 */
  evictions: number;
  
  /** 命中率 */
  hitRate: number;
  
  /** 平均淘汰延迟 (ms) */
  avgEvictionLatency: number;
}

// ============================================================================
// 层间通信接口
// ============================================================================

/**
 * 层间晋升触发器配置
 * 
 * 自测: MEM-006 层间晋升触发器
 */
export interface IPromotionTriggerConfig {
  /** Focus层满时的处理策略 */
  focusFullStrategy: 'evict' | 'block' | 'force';
  
  /** 自动晋升 */
  autoPromotion: boolean;
  
  /** 降级策略 */
  demotionStrategy: 'lru' | 'importance' | 'hybrid';
  
  /** 层间通信超时 (ms) */
  communicationTimeout: number;
}

/**
 * 晋升请求
 */
export interface IPromotionRequest {
  /** 请求ID */
  requestId: string;
  
  /** 条目ID */
  entryId: string;
  
  /** 目标层 */
  targetTier: MemoryTier;
  
  /** 优先级 */
  priority: number;
  
  /** 超时时间 */
  timeout: number;
}

/**
 * 晋升响应
 */
export interface IPromotionResponse {
  /** 请求ID */
  requestId: string;
  
  /** 是否成功 */
  success: boolean;
  
  /** 实际所在的层 */
  actualTier: MemoryTier;
  
  /** 被淘汰的条目 (如有) */
  evictedEntry?: IMemoryEntry;
  
  /** 消息 */
  message?: string;
}

/**
 * 层间协调器接口
 */
export interface ILayerCoordinator {
  /** 配置 */
  readonly config: IPromotionTriggerConfig;
  
  /**
   * 请求晋升
   * @param request 晋升请求
   * @returns 晋升响应
   */
  requestPromotion(request: IPromotionRequest): Promise<IPromotionResponse>;
  
  /**
   * 注册层
   * @param tier 层级
   * @param layer 层实例
   */
  registerLayer(tier: MemoryTier, layer: IFocusLayer | IWorkingLayer): void;
  
  /**
   * 处理Focus层满事件
   * @param entry 待晋升条目
   * @returns 处理结果
   */
  handleFocusFull(entry: IMemoryEntry): Promise<IPromotionResponse>;
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * 内存层事件
 */
export interface IMemoryLayerEvents {
  /** 条目添加 */
  'entry:add': { tier: MemoryTier; entry: IMemoryEntry };
  
  /** 条目访问 */
  'entry:access': { tier: MemoryTier; entryId: string };
  
  /** 条目淘汰 */
  'entry:evict': { tier: MemoryTier; entry: IMemoryEntry; reason: string };
  
  /** 层间晋升 */
  'entry:promote': { entry: IMemoryEntry; from: MemoryTier; to: MemoryTier };
  
  /** 层间降级 */
  'entry:demote': { entry: IMemoryEntry; from: MemoryTier; to: MemoryTier };
  
  /** Token告警 */
  'token:warning': { tier: MemoryTier; usage: number; limit: number };
  
  /** Token超限 */
  'token:overflow': { tier: MemoryTier; requested: number; available: number };
  
  /** LRU淘汰 */
  'lru:evict': { evicted: IMemoryEntry[]; duration: number };
}

// ============================================================================
// 工厂函数类型
// ============================================================================

/**
 * 创建内存条目的工厂函数
 */
export type MemoryEntryFactory = (options: IMemoryEntryOptions) => IMemoryEntry;

/**
 * 创建Token计数器的工厂函数
 */
export type TokenCounterFactory = (config: ITokenCounterConfig) => ITokenCounter;

/**
 * 创建LRU缓存的工厂函数
 */
export type LRUCacheFactory = <T>(config: ILRUCacheConfig) => ILRUCache<T>;

// ============================================================================
// Context Snapper 序列化接口 (HAJIMI-LCR-TRIPLE-DIM-001)
// ============================================================================

/**
 * 上下文块类型
 */
export type ContextChunkType = 
  | 'transient'    // Transient层数据
  | 'staging'      // Staging层数据
  | 'archive'      // Archive层数据
  | 'governance'   // 七权治理数据
  | 'metadata';    // 元数据

/**
 * 上下文块 - 序列化的基本单元
 */
export interface ContextChunk {
  /** 唯一标识符 */
  id: string;
  /** 块类型 */
  type: ContextChunkType;
  /** 关联Agent ID */
  agentId?: string;
  /** 创建时间戳 */
  timestamp: number;
  /** 数据版本 */
  version: number;
  /** 实际数据 */
  payload: Buffer | Uint8Array;
  /** 数据大小（字节） */
  size: number;
  /** 压缩算法 */
  compressionAlgo: 'none' | 'zstd' | 'lz4' | 'gzip';
  /** 是否已压缩 */
  compressed: boolean;
  /** 原始大小（压缩前） */
  originalSize?: number;
  /** 父块哈希（增量更新用） */
  parentHash?: string;
  /** 校验和（SHA256） */
  checksum: string;
  /** 块标签（用于分类） */
  tags?: string[];
  /** 过期时间（毫秒时间戳，可选） */
  expiresAt?: number;
}

/**
 * 序列化器选项
 */
export interface SerializerOptions {
  /** 是否启用压缩 */
  enableCompression?: boolean;
  /** 压缩算法 */
  compressionAlgo?: 'zstd' | 'lz4' | 'gzip';
  /** 压缩阈值（字节，小于此值不压缩） */
  compressionThreshold?: number;
  /** 是否计算校验和 */
  enableChecksum?: boolean;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 目标缓冲区大小（预分配优化） */
  bufferSizeHint?: number;
}

/**
 * 序列化结果
 */
export interface SerializationResult {
  /** 序列化后的字节流 */
  buffer: Buffer;
  /** 原始大小 */
  originalSize: number;
  /** 序列化后大小 */
  serializedSize: number;
  /** 压缩率（0-1） */
  compressionRatio: number;
  /** 校验和 */
  checksum: string;
  /** 序列化耗时（ms） */
  durationMs: number;
  /** 块数量 */
  chunkCount: number;
}

/**
 * 反序列化结果
 */
export interface DeserializationResult {
  /** 恢复的上下文块 */
  chunks: ContextChunk[];
  /** 恢复的块数量 */
  chunkCount: number;
  /** 总大小（字节） */
  totalSize: number;
  /** 反序列化耗时（ms） */
  durationMs: number;
  /** 校验和验证结果 */
  checksumValid: boolean;
  /** 版本信息 */
  version: number;
}

/**
 * BSDiff差异块
 */
export interface BSDiffBlock {
  /** 差异类型 */
  type: 'add' | 'delete' | 'replace';
  /** 偏移位置 */
  offset: number;
  /** 长度 */
  length: number;
  /** 差异数据（add/replace时有效） */
  data?: Buffer;
  /** 旧数据哈希（用于验证） */
  oldHash?: string;
  /** 新数据哈希 */
  newHash?: string;
}

/**
 * 增量快照信息
 */
export interface IncrementalSnapshot {
  /** 基础快照哈希 */
  baseHash: string;
  /** 差异块列表 */
  diffs: BSDiffBlock[];
  /** 新增块 */
  added: ContextChunk[];
  /** 删除的块ID */
  deleted: string[];
  /** 修改的块 */
  modified: Array<{ id: string; oldHash: string; newChunk: ContextChunk }>;
  /** 时间戳 */
  timestamp: number;
  /** 压缩率 */
  compressionRatio: number;
}

/**
 * HCTX文件头（64字节）
 */
export interface HCTXFileHeader {
  /** 魔数: 0x48435458 ("HCTX") */
  magic: number;
  /** 版本号 */
  version: number;
  /** 标志位 */
  flags: number;
  /** 创建时间戳 */
  timestamp: bigint;
  /** 块数量 */
  chunkCount: number;
  /** 元数据偏移 */
  metadataOffset: number;
  /** 元数据长度 */
  metadataLength: number;
  /** 索引偏移 */
  indexOffset: number;
  /** 索引长度 */
  indexLength: number;
  /** 数据偏移 */
  dataOffset: number;
  /** 数据长度 */
  dataLength: number;
  /** 校验和（SHA256前8字节） */
  checksum: Buffer;
  /** 预留字段 */
  reserved: Buffer;
}

/**
 * 块索引项
 */
export interface ChunkIndexEntry {
  /** 块ID */
  id: string;
  /** 块类型 */
  type: ContextChunkType;
  /** 数据偏移 */
  offset: number;
  /** 数据长度 */
  length: number;
  /** 压缩后长度 */
  compressedLength: number;
  /** 校验和 */
  checksum: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 序列化器接口
 */
export interface IContextSerializer {
  /**
   * 序列化上下文块
   */
  serialize(chunks: ContextChunk[], options?: SerializerOptions): Promise<SerializationResult>;
  
  /**
   * 反序列化字节流
   */
  deserialize(buffer: Buffer): Promise<DeserializationResult>;
  
  /**
   * 序列化单个块
   */
  serializeChunk(chunk: ContextChunk, options?: SerializerOptions): Buffer;
  
  /**
   * 反序列化单个块
   */
  deserializeChunk(buffer: Buffer, offset: number): { chunk: ContextChunk; bytesRead: number };
}

/**
 * 压缩器接口
 */
export interface ICompressor {
  /**
   * 压缩数据
   */
  compress(data: Buffer): Promise<Buffer>;
  
  /**
   * 解压数据
   */
  decompress(data: Buffer): Promise<Buffer>;
  
  /**
   * 获取压缩算法名称
   */
  getAlgorithm(): string;
}

/**
 * BSDiff接口
 */
export interface IBSDiff {
  /**
   * 计算差异
   */
  diff(oldData: Buffer, newData: Buffer): Promise<BSDiffBlock[]>;
  
  /**
   * 应用差异
   */
  patch(oldData: Buffer, diffs: BSDiffBlock[]): Promise<Buffer>;
  
  /**
   * 计算差异大小
   */
  diffSize(oldData: Buffer, newData: Buffer): Promise<number>;
}
