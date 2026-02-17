/**
 * HCTX 工业级序列化协议 - TypeScript 类型定义
 * 
 * 文档编号: B-01-PROTOCOL-SPEC-v1.0
 * 所属工单: HAJIMI-LCR-TRIPLE-DIM-001 B-01/09
 * 
 * DEBT: LCR-B01-001 - P2 - BSDiff压缩算法实际实现待后续优化
 * 
 * @version 1.0.0
 * @since 2026-02-17
 */

// ============================================================================
// 协议常量定义
// ============================================================================

/**
 * HCTX 协议魔数
 * ASCII: "HCTX"
 */
export const HCTX_MAGIC = 0x48435458;

/**
 * HCTX 当前协议版本 (1.0.0)
 * 编码: MAJOR(8bit) + MINOR(8bit) + PATCH(16bit)
 */
export const HCTX_VERSION = 0x00010000;

/**
 * 固定长度常量（字节）
 */
export const HCTX_HEADER_SIZE = 64;
export const HCTX_TRAILER_SIZE = 32;
export const HCTX_CHUNK_MAGIC = 0x43484E4B; // "CHNK"
export const SHA256_HASH_SIZE = 32;

/**
 * 默认配置参数
 */
export const HCTX_DEFAULTS = {
  /** 索引节点页大小 */
  INDEX_NODE_SIZE: 4096,
  /** 默认压缩级别 */
  DEFAULT_COMPRESSION_LEVEL: 3,
  /** BSDiff 最小匹配长度 */
  BSDIFF_MIN_MATCH_LENGTH: 16,
  /** BSDiff 扫描窗口大小 (16MB) */
  BSDIFF_SCAN_WINDOW_SIZE: 16 * 1024 * 1024,
  /** 压缩率目标 */
  TARGET_COMPRESSION_RATIO: 0.80,
} as const;

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 协议版本号（语义化版本）
 */
export interface SemanticVersion {
  /** 主版本号 - 不兼容变更时递增 */
  major: number;  // 0-255
  /** 次版本号 - 向后兼容的功能扩展 */
  minor: number;  // 0-255
  /** 补丁版本号 - 缺陷修复 */
  patch: number;  // 0-65535
}

/**
 * UUID v7 格式（时间排序 UUID）
 */
export type UUIDv7 = string; // 格式: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx

/**
 * SHA256 哈希表示（32字节 = 64字符hex或43字符base64url）
 */
export type SHA256Hash = string;

/**
 * 时间戳（Unix 毫秒，UTC）
 */
export type Timestamp = number;

// ============================================================================
// Header 区类型定义
// ============================================================================

/**
 * HCTX 文件头标志位
 */
export enum HCTXFlags {
  /** Payload 是否压缩 */
  COMPRESSED = 0x0001,
  /** 是否 AES-256-GCM 加密 */
  ENCRYPTED = 0x0002,
  /** 压缩算法位掩码 (Bit 2-3) */
  COMPRESSION_MASK = 0x000C,
  /** 增量快照标志 */
  INCREMENTAL = 0x0010,
}

/**
 * 压缩算法编码
 */
export enum CompressionAlgorithm {
  NONE = 0x00,
  ZSTD = 0x01,
  BSDIFF = 0x02,
  RESERVED_3 = 0x03,
}

/**
 * 文件头结构（64字节固定）
 */
export interface HCTXHeader {
  /** 魔数: 0x48435458 ("HCTX") */
  magic: typeof HCTX_MAGIC;
  /** 协议版本 */
  version: SemanticVersion;
  /** 标志位组合 */
  flags: HCTXFlags;
  /** 保留字段（应为0） */
  reserved: number;
  /** 元数据区偏移（始终为64） */
  metadataOffset: 64;
  /** 索引区偏移 */
  indexOffset: number;
  /** Payload 区偏移 */
  payloadOffset: number;
  /** Trailer 区偏移（文件大小-32） */
  trailerOffset: number;
  /** 原始数据大小 */
  payloadSize: number;
  /** 压缩后大小（如适用） */
  compressedSize?: number;
  /** 创建时间戳（UTC毫秒） */
  timestamp: Timestamp;
  /** 对象数量 */
  objectCount: number;
  /** 快照 UUID */
  uuid: UUIDv7;
}

/**
 * 原始二进制 Header（用于序列化）
 */
export interface HCTXHeaderBinary {
  magic: Uint8Array;        // 4 bytes
  version: Uint8Array;      // 4 bytes (packed)
  flags: Uint8Array;        // 2 bytes
  reserved: Uint8Array;     // 2 bytes
  metadataOffset: Uint8Array; // 4 bytes (uint32, little-endian)
  indexOffset: Uint8Array;  // 4 bytes
  payloadOffset: Uint8Array; // 4 bytes
  trailerOffset: Uint8Array; // 4 bytes
  payloadSize: Uint8Array;  // 4 bytes
  compressedSize: Uint8Array; // 4 bytes
  timestamp: Uint8Array;    // 8 bytes (uint64, little-endian)
  objectCount: Uint8Array;  // 4 bytes
  uuid: Uint8Array;         // 16 bytes
}

// ============================================================================
// Metadata 区类型定义
// ============================================================================

/**
 * 上下文类型枚举
 */
export enum HCTXContextType {
  CONVERSATION = 'conversation',
  AGENT = 'agent',
  WORKSPACE = 'workspace',
  SYSTEM = 'system',
}

/**
 * 压缩参数配置
 */
export interface CompressionParams {
  /** 压缩算法 */
  algorithm: 'none' | 'zstd' | 'bsdiff';
  /** 压缩级别（1-22 for zstd） */
  level: number;
  /** 压缩块大小 */
  blockSize: number;
}

/**
 * BSDiff 专用参数
 */
export interface BSDiffParams {
  /** 后缀数组构建算法 */
  suffixArrayAlgo: 'SA-IS' | 'DivSufSort';
  /** 最小匹配长度（字节） */
  minMatchLength: number;
  /** 扫描窗口大小 */
  scanWindowSize: number;
  /** 控制文件格式版本 */
  controlVersion: number;
  /** 差分数据编码 */
  diffEncoding: 'bzip2' | 'raw';
  /** 额外数据编码 */
  extraEncoding: 'bzip2' | 'raw';
}

/**
 * 快照统计信息
 */
export interface SnapshotStats {
  /** 对象总数 */
  totalObjects: number;
  /** 原始字节数 */
  totalBytes: number;
  /** 压缩后字节数（如适用） */
  compressedBytes?: number;
  /** 各类型对象计数 */
  objectTypes: Record<string, number>;
}

/**
 * 上下文描述信息
 */
export interface ContextDescriptor {
  /** 上下文类型 */
  type: HCTXContextType;
  /** 所属 Agent ID */
  agentId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 创建时间 */
  createdAt: Timestamp;
  /** 过期时间（TTL） */
  expiresAt?: Timestamp;
}

/**
 * HCTX 元数据结构（MessagePack 编码）
 */
export interface HCTXMetadata {
  /** 协议模式标识 */
  schema: 'hctx-v1';
  /** 快照唯一标识 */
  snapshotId: UUIDv7;
  /** 父快照标识（增量快照时存在） */
  parentSnapshotId?: UUIDv7;
  /** 父快照 SHA256 哈希（Merkle链） */
  parentHash?: SHA256Hash;
  /** 上下文描述 */
  context: ContextDescriptor;
  /** 数据统计 */
  stats: SnapshotStats;
  /** 压缩参数 */
  compression?: CompressionParams;
  /** BSDiff 专用参数 */
  bsdiffParams?: BSDiffParams;
  /** 自定义标签（用于检索） */
  tags?: string[];
  /** 扩展字段（向前兼容） */
  [key: string]: unknown;
}

// ============================================================================
// Index 区类型定义 (B+ 树)
// ============================================================================

/**
 * 对象类型码定义
 */
export enum HCTXObjectType {
  // 核心类型 (0x0000-0x00FF)
  NULL = 0x0000,
  RAW_BINARY = 0x0001,
  STRING_UTF8 = 0x0002,
  STRING_UTF16 = 0x0003,
  
  // 结构化数据 (0x0100-0x01FF)
  MESSAGEPACK = 0x0100,
  PROTOBUF = 0x0101,
  JSON = 0x0102,
  BSON = 0x0103,
  
  // AI 上下文专用 (0x0200-0x02FF)
  CONVERSATION_TURN = 0x0200,
  EMBEDDING_VECTOR = 0x0201,
  KNOWLEDGE_GRAPH_NODE = 0x0202,
  KNOWLEDGE_GRAPH_EDGE = 0x0203,
  AGENT_STATE = 0x0204,
  WORKSPACE_CONFIG = 0x0205,
  
  // 差分类型 (0x0300-0x03FF)
  BSDIFF_PATCH = 0x0300,
  XDELTA_PATCH = 0x0301,
  VCDIFF_PATCH = 0x0302,
}

/**
 * 索引条目标志位
 */
export enum IndexEntryFlags {
  /** 已压缩 */
  COMPRESSED = 0x01,
  /** 已加密 */
  ENCRYPTED = 0x02,
  /** 差分编码 */
  DIFF_ENCODED = 0x04,
  /** 已删除（逻辑删除） */
  DELETED = 0x08,
}

/**
 * 索引条目（48字节固定）
 */
export interface IndexEntry {
  /** 对象 ID（UUID） */
  objectId: UUIDv7;
  /** 对象类型码 */
  typeCode: HCTXObjectType;
  /** 条目标志位 */
  flags: IndexEntryFlags;
  /** Payload 区偏移 */
  payloadOffset: number;  // uint64
  /** 原始大小 */
  originalSize: number;   // uint32
  /** 压缩后大小 */
  compressedSize: number; // uint32
  /** 对象内容哈希（SHA256 前12字节） */
  objectHash: Uint8Array; // 12 bytes
  /** 保留字段 */
  reserved: number;       // 2 bytes
}

/**
 * 索引头部（16字节）
 */
export interface IndexHeader {
  /** 节点页大小 */
  nodeSize: number;
  /** 键大小（UUID = 16字节） */
  keySize: number;
  /** 值大小（固定32字节） */
  valueSize: number;
  /** 根节点偏移 */
  rootNodeOffset: number;
  /** 叶子节点数量 */
  leafNodeCount: number;
}

/**
 * B+ 树索引结构
 */
export interface HCTXIndex {
  /** 索引头部 */
  header: IndexHeader;
  /** 索引条目列表（按 objectId 排序） */
  entries: IndexEntry[];
}

// ============================================================================
// Payload 区类型定义
// ============================================================================

/**
 * Payload 块头部（8字节）
 */
export interface ChunkHeader {
  /** 魔数: 0x43484E4B ("CHNK") */
  magic: typeof HCTX_CHUNK_MAGIC;
  /** 块标志位 */
  flags: ChunkFlags;
  /** 头部 CRC16 校验 */
  crc16: number;
}

/**
 * Payload 块标志位
 */
export enum ChunkFlags {
  /** 压缩类型 (Bit 0-1) */
  COMPRESSION_NONE = 0x00,
  COMPRESSION_ZSTD = 0x01,
  COMPRESSION_BSDIFF = 0x02,
  COMPRESSION_RESERVED = 0x03,
  /** 加密标志 (Bit 2) */
  ENCRYPTED = 0x04,
  /** 差分补丁标志 (Bit 3) */
  DIFF_PATCH = 0x08,
}

/**
 * Payload 块
 */
export interface PayloadChunk {
  /** 块头部 */
  header: ChunkHeader;
  /** 块数据 */
  data: Uint8Array;
  /** 填充字节数（8字节对齐） */
  padding: number;
}

/**
 * BSDiff 补丁结构
 */
export interface BSDiffPatch {
  /** 魔数: "BSDIFF40" */
  magic: 'BSDIFF40';
  /** 控制块长度 */
  controlLength: bigint;
  /** 差分块长度 */
  diffLength: bigint;
  /** 新文件大小 */
  newFileSize: bigint;
  /** 控制块数据（bzip2压缩） */
  controlBlock: Uint8Array;
  /** 差分块数据（bzip2压缩） */
  diffBlock: Uint8Array;
  /** 额外块数据（bzip2压缩） */
  extraBlock: Uint8Array;
}

/**
 * BSDiff 控制三元组
 */
export interface BSDiffControlTriple {
  /** 从差分块添加的字节数 */
  add: number;
  /** 从旧文件复制的字节数 */
  copy: number;
  /** 旧文件位置调整 */
  seek: number;
}

// ============================================================================
// Trailer 区类型定义
// ============================================================================

/**
 * 区域级校验信息
 */
export interface RegionChecksums {
  /** 元数据区 SHA256 */
  metadataHash: SHA256Hash;
  /** 索引区 SHA256 */
  indexHash: SHA256Hash;
  /** Payload 区 SHA256 */
  payloadHash: SHA256Hash;
}

/**
 * Trailer 结构（32字节固定结尾）
 */
export interface HCTXTrailer {
  /** 文件级 SHA256 校验和（除 Trailer 外全部内容） */
  fileHash: SHA256Hash;
}

/**
 * 扩展 Trailer（可选，包含区域级校验）
 */
export interface HCTXExtendedTrailer extends HCTXTrailer {
  /** 区域级校验 */
  regionChecksums: RegionChecksums;
  /** Merkle 链哈希 */
  merkleChainHash?: SHA256Hash;
}

// ============================================================================
// 完整 HCTX 文件结构
// ============================================================================

/**
 * 完整的 HCTX 文件结构
 */
export interface HCTXFile {
  /** 文件头 */
  header: HCTXHeader;
  /** 元数据 */
  metadata: HCTXMetadata;
  /** 索引 */
  index: HCTXIndex;
  /** Payload 块列表 */
  payload: PayloadChunk[];
  /** 文件尾 */
  trailer: HCTXTrailer;
}

/**
 * HCTX 解析器状态
 */
export enum HCTXParserState {
  INIT = 'init',
  HEADER_PARSED = 'header_parsed',
  METADATA_PARSED = 'metadata_parsed',
  INDEX_PARSED = 'index_parsed',
  PAYLOAD_PARSED = 'payload_parsed',
  TRAILER_VERIFIED = 'trailer_verified',
  ERROR = 'error',
}

// ============================================================================
// 错误处理
// ============================================================================

/**
 * HCTX 错误码
 */
export enum HCTXErrorCode {
  // 文件级错误 (0x01xx)
  INVALID_MAGIC = 0x0101,
  UNSUPPORTED_VERSION = 0x0102,
  CORRUPTED_HEADER = 0x0103,
  FILE_TOO_SMALL = 0x0104,
  
  // 解析错误 (0x02xx)
  INVALID_METADATA = 0x0201,
  INVALID_INDEX = 0x0202,
  MISSING_TRAILER = 0x0203,
  INVALID_CHUNK = 0x0204,
  
  // 校验错误 (0x03xx)
  CHECKSUM_MISMATCH = 0x0301,
  MERKLE_CHAIN_BROKEN = 0x0302,
  REGION_CHECKSUM_MISMATCH = 0x0303,
  
  // 解压错误 (0x04xx)
  DECOMPRESSION_FAILED = 0x0401,
  UNSUPPORTED_ALGORITHM = 0x0402,
  BSDIFF_PATCH_FAILED = 0x0403,
  
  // IO 错误 (0x05xx)
  READ_ERROR = 0x0501,
  WRITE_ERROR = 0x0502,
  SEEK_ERROR = 0x0503,
}

/**
 * HCTX 解析错误
 */
export class HCTXParseError extends Error {
  constructor(
    public readonly code: HCTXErrorCode,
    public readonly offset?: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(`HCTX Parse Error [0x${code.toString(16).padStart(4, '0')}]: ${HCTXParseError.getMessage(code)}`);
    this.name = 'HCTXParseError';
  }

  private static getMessage(code: HCTXErrorCode): string {
    const messages: Record<HCTXErrorCode, string> = {
      [HCTXErrorCode.INVALID_MAGIC]: 'Invalid magic number',
      [HCTXErrorCode.UNSUPPORTED_VERSION]: 'Unsupported protocol version',
      [HCTXErrorCode.CORRUPTED_HEADER]: 'Corrupted header structure',
      [HCTXErrorCode.FILE_TOO_SMALL]: 'File size below minimum threshold',
      [HCTXErrorCode.INVALID_METADATA]: 'Invalid metadata format',
      [HCTXErrorCode.INVALID_INDEX]: 'Invalid index structure',
      [HCTXErrorCode.MISSING_TRAILER]: 'Missing trailer section',
      [HCTXErrorCode.INVALID_CHUNK]: 'Invalid payload chunk',
      [HCTXErrorCode.CHECKSUM_MISMATCH]: 'File checksum verification failed',
      [HCTXErrorCode.MERKLE_CHAIN_BROKEN]: 'Merkle chain verification failed',
      [HCTXErrorCode.REGION_CHECKSUM_MISMATCH]: 'Region checksum mismatch',
      [HCTXErrorCode.DECOMPRESSION_FAILED]: 'Data decompression failed',
      [HCTXErrorCode.UNSUPPORTED_ALGORITHM]: 'Unsupported compression/encoding algorithm',
      [HCTXErrorCode.BSDIFF_PATCH_FAILED]: 'BSDiff patch application failed',
      [HCTXErrorCode.READ_ERROR]: 'File read error',
      [HCTXErrorCode.WRITE_ERROR]: 'File write error',
      [HCTXErrorCode.SEEK_ERROR]: 'File seek error',
    };
    return messages[code] || 'Unknown error';
  }
}

// ============================================================================
// 序列化器/解析器接口
// ============================================================================

/**
 * HCTX 序列化选项
 */
export interface HCTXSerializeOptions {
  /** 压缩算法 */
  compression?: CompressionAlgorithm;
  /** 压缩级别 */
  compressionLevel?: number;
  /** 是否加密 */
  encrypt?: boolean;
  /** 父快照（增量序列化时） */
  parentSnapshot?: HCTXFile;
  /** BSDiff 参数 */
  bsdiffParams?: Partial<BSDiffParams>;
}

/**
 * HCTX 解析选项
 */
export interface HCTXParseOptions {
  /** 是否验证校验和 */
  verifyChecksums?: boolean;
  /** 是否验证 Merkle 链 */
  verifyMerkleChain?: boolean;
  /** 父快照（增量解析时） */
  parentSnapshot?: HCTXFile;
  /** 仅解析元数据（快速预览） */
  metadataOnly?: boolean;
}

/**
 * HCTX 序列化器接口
 */
export interface HCTXSerializer {
  /**
   * 将 HCTX 文件序列化为二进制
   */
  serialize(file: HCTXFile, options?: HCTXSerializeOptions): Uint8Array;
  
  /**
   * 增量序列化（基于父快照）
   */
  serializeIncremental(
    current: HCTXFile,
    parent: HCTXFile,
    options?: HCTXSerializeOptions,
  ): Uint8Array;
}

/**
 * HCTX 解析器接口
 */
export interface HCTXParser {
  /**
   * 解析二进制为 HCTX 文件
   */
  parse(data: Uint8Array, options?: HCTXParseOptions): HCTXFile;
  
  /**
   * 增量解析（应用 BSDiff 补丁）
   */
  parseIncremental(
    patch: Uint8Array,
    parent: HCTXFile,
    options?: HCTXParseOptions,
  ): HCTXFile;
  
  /**
   * 快速解析仅获取元数据
   */
  parseMetadata(data: Uint8Array): HCTXMetadata;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * Base64 变体
 */
export enum Base64Variant {
  /** RFC 3548 标准 Base64 (+/) */
  STANDARD = 'standard',
  /** URL/File Safe 变体 (-_) */
  URL_SAFE = 'urlsafe',
  /** HCTX 默认: URL Safe 无填充 */
  HCTX_DEFAULT = 'hctx',
}

/**
 * 压缩结果统计
 */
export interface CompressionResult {
  /** 原始大小 */
  originalSize: number;
  /** 压缩后大小 */
  compressedSize: number;
  /** 压缩率 (0-1) */
  ratio: number;
  /** 所用算法 */
  algorithm: CompressionAlgorithm;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  /** 是否通过 */
  valid: boolean;
  /** 失败的校验项 */
  failures: string[];
  /** 详细结果 */
  details: {
    headerValid: boolean;
    metadataHashValid: boolean;
    indexHashValid: boolean;
    payloadHashValid: boolean;
    fileHashValid: boolean;
    merkleChainValid?: boolean;
  };
}

// ============================================================================
// 自测验收类型
// ============================================================================

/**
 * SNAP-001: 协议版本号规范测试结果
 */
export interface VersionComplianceTest {
  testId: 'SNAP-001';
  versionParse: boolean;
  compatibilityCheck: boolean;
  forwardCompatibility: boolean;
  backwardCompatibility: boolean;
  passed: boolean;
}

/**
 * SNAP-002: 压缩率测试结果
 */
export interface CompressionRatioTest {
  testId: 'SNAP-002';
  scenario: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;  // >0.80 为通过
  targetRatio: number;
  passed: boolean;
}

/**
 * SNAP-003: SHA256 链完整性测试结果
 */
export interface IntegrityChainTest {
  testId: 'SNAP-003';
  regionChecksumValid: boolean;
  fileChecksumValid: boolean;
  merkleChainValid: boolean;
  tamperDetection: boolean;
  passed: boolean;
}

/**
 * 完整自测报告
 */
export interface HCTXSelfTestReport {
  version: string;
  timestamp: Timestamp;
  tests: {
    snap001: VersionComplianceTest;
    snap002: CompressionRatioTest[];
    snap003: IntegrityChainTest;
  };
  overallPassed: boolean;
}

// ============================================================================
// 导出默认配置
// ============================================================================

export const DEFAULT_BSDIFF_PARAMS: BSDiffParams = {
  suffixArrayAlgo: 'DivSufSort',
  minMatchLength: HCTX_DEFAULTS.BSDIFF_MIN_MATCH_LENGTH,
  scanWindowSize: HCTX_DEFAULTS.BSDIFF_SCAN_WINDOW_SIZE,
  controlVersion: 1,
  diffEncoding: 'bzip2',
  extraEncoding: 'bzip2',
};

export const DEFAULT_COMPRESSION_PARAMS: CompressionParams = {
  algorithm: 'zstd',
  level: HCTX_DEFAULTS.DEFAULT_COMPRESSION_LEVEL,
  blockSize: 256 * 1024, // 256KB
};

export const DEFAULT_SERIALIZE_OPTIONS: HCTXSerializeOptions = {
  compression: CompressionAlgorithm.ZSTD,
  compressionLevel: 3,
  encrypt: false,
  bsdiffParams: DEFAULT_BSDIFF_PARAMS,
};

export const DEFAULT_PARSE_OPTIONS: HCTXParseOptions = {
  verifyChecksums: true,
  verifyMerkleChain: true,
  metadataOnly: false,
};
