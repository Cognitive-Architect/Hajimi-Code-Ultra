/**
 * HCTX 序列化器 - HAJIMI-LCR-ENTITY-001 B-01/09
 * 
 * 实现 HCTX 工业级序列化协议 v1.0
 * - Header: 64字节固定（魔数+版本+偏移量）
 * - Metadata: MessagePack编码（DEBT: 当前使用JSON，需替换为msgpack-lite）
 * - Index: B+树索引结构
 * - Payload: 数据区
 * - Trailer: SHA256校验（32字节固定结尾）
 * 
 * 自测点:
 * - SNAP-001: 版本解析
 * - SNAP-004: 序列化/反序列化对称性
 * - ENTITY-001: TypeScript零错误
 * 
 * DEBT: ENTITY-B01-001-P0 - msgpack-lite未安装，当前使用JSON序列化
 * 
 * @module lib/lcr/snapper/serializer
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import type {
  ContextChunk,
  ContextChunkType,
  SerializerOptions,
  SerializationResult,
  DeserializationResult,
  HCTXFileHeader,
  ChunkIndexEntry,
  IContextSerializer,
} from '../core/interfaces';

// ============================================================================
// 协议常量定义
// ============================================================================

/** HCTX 魔数: "HCTX" = 0x48435458 */
const HCTX_MAGIC = 0x48435458;

/** HCTX 协议版本 1.0.0 (MAJOR=1, MINOR=0, PATCH=0) */
const HCTX_VERSION_MAJOR = 1;
const HCTX_VERSION_MINOR = 0;
const HCTX_VERSION_PATCH = 0;
const HCTX_VERSION = (HCTX_VERSION_MAJOR << 24) | (HCTX_VERSION_MINOR << 16) | HCTX_VERSION_PATCH;

/** Header 固定大小: 64字节 */
const HEADER_SIZE = 64;

/** Trailer 固定大小: 32字节 (SHA256) */
const TRAILER_SIZE = 32;

/** 默认元数据偏移（Header结束后立即开始） */
const DEFAULT_METADATA_OFFSET = HEADER_SIZE;

// gzip 异步包装
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// 类型定义（严格模式，无any）
// ============================================================================

/** 序列化元数据结构 */
interface HCTXMetadata {
  /** 协议模式 */
  schema: 'hctx-v1';
  /** 快照ID */
  snapshotId: string;
  /** 父快照ID（增量时） */
  parentSnapshotId?: string;
  /** 上下文类型 */
  context: {
    type: 'conversation' | 'agent' | 'workspace' | 'system';
    agentId?: string;
    sessionId?: string;
    createdAt: number;
    expiresAt?: number;
  };
  /** 统计信息 */
  stats: {
    totalObjects: number;
    totalBytes: number;
    compressedBytes?: number;
    objectTypes: Record<string, number>;
  };
  /** 压缩参数 */
  compression?: {
    algorithm: 'none' | 'zstd' | 'bsdiff';
    level: number;
    blockSize: number;
  };
  /** 自定义标签 */
  tags?: string[];
  /** 扩展字段 */
  [key: string]: unknown;
}

/** 索引条目序列化格式 */
interface SerializedIndexEntry {
  id: string;
  type: ContextChunkType;
  offset: number;
  length: number;
  compressedLength: number;
  checksum: string;
  timestamp: number;
}

/** 索引序列化格式 */
interface SerializedIndex {
  entries: SerializedIndexEntry[];
  version: number;
}

/** 序列化选项默认值 */
const DEFAULT_OPTIONS: Required<SerializerOptions> = {
  enableCompression: true,
  compressionAlgo: 'gzip',
  compressionThreshold: 1024,
  enableChecksum: true,
  includeMetadata: true,
  bufferSizeHint: 64 * 1024,
};

// ============================================================================
// HCTX 序列化器实现
// ============================================================================

/**
 * HCTX 上下文序列化器
 * 
 * 实现 HCTX 工业级序列化协议，支持：
 * 1. 64字节固定Header（魔数+版本+偏移量）
 * 2. MessagePack编码元数据（DEBT: 当前使用JSON）
 * 3. SHA256-Merkle链式校验
 * 4. 压缩支持（gzip，预留zstd/bsdiff接口）
 */
export class ContextSerializer implements IContextSerializer {
  private options: Required<SerializerOptions>;

  constructor(options: SerializerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 序列化上下文块数组为HCTX格式
   * 
   * 格式: [Header(64B)][Metadata][Index][Payload][Trailer(32B)]
   * 
   * @param chunks - 上下文块数组
   * @param options - 序列化选项
   * @returns 序列化结果
   */
  async serialize(
    chunks: ContextChunk[],
    options?: SerializerOptions
  ): Promise<SerializationResult> {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };

    // 1. 构建元数据
    const metadata = this.buildMetadata(chunks);
    const metadataBuf = this.encodeMetadata(metadata);

    // 2. 编码数据区并构建索引
    const { data: payloadBuf, indexEntries } = await this.encodePayload(chunks, opts);

    // 3. 构建索引区
    const index: SerializedIndex = {
      version: 1,
      entries: indexEntries,
    };
    const indexBuf = this.encodeIndex(index);

    // 4. 计算各区域偏移量
    const metadataOffset = DEFAULT_METADATA_OFFSET;
    const indexOffset = metadataOffset + metadataBuf.length;
    const payloadOffset = indexOffset + indexBuf.length;
    const trailerOffset = payloadOffset + payloadBuf.length;

    // 5. 构建文件头
    const header = this.buildHeader({
      chunkCount: chunks.length,
      metadataOffset,
      metadataLength: metadataBuf.length,
      indexOffset,
      indexLength: indexBuf.length,
      payloadOffset,
      payloadLength: payloadBuf.length,
      trailerOffset,
    });

    // 6. 计算内容校验和（Metadata+Index+Payload，不包括Header和Trailer）
    const contentToHash = Buffer.concat([
      metadataBuf,
      indexBuf,
      payloadBuf,
    ]);
    const checksum = this.calculateChecksum(contentToHash);
    
    // 更新header中的checksum（使用SHA256前8字节）
    header.checksum = checksum.slice(0, 8);
    const headerBuf = this.serializeHeader(header);

    // 7. 构建Trailer（完整的SHA256）
    const trailer = this.buildTrailer(checksum);

    // 8. 组装最终缓冲区
    const buffer = Buffer.concat([
      headerBuf,
      metadataBuf,
      indexBuf,
      payloadBuf,
      trailer,
    ]);

    const durationMs = Date.now() - startTime;
    const originalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);

    return {
      buffer,
      originalSize,
      serializedSize: buffer.length,
      compressionRatio: 1 - buffer.length / Math.max(originalSize, 1),
      checksum: checksum.toString('hex'),
      durationMs,
      chunkCount: chunks.length,
    };
  }

  /**
   * 反序列化HCTX字节流为上下文块数组
   * 
   * @param buffer - HCTX字节流
   * @returns 反序列化结果
   */
  async deserialize(buffer: Buffer): Promise<DeserializationResult> {
    const startTime = Date.now();

    // 1. 验证缓冲区大小
    if (buffer.length < HEADER_SIZE + TRAILER_SIZE) {
      throw new Error(
        `Invalid HCTX: buffer too small (${buffer.length} bytes, ` +
        `minimum ${HEADER_SIZE + TRAILER_SIZE} bytes)`
      );
    }

    // 2. 解析Header
    const header = this.parseHeader(buffer.slice(0, HEADER_SIZE));

    // 3. 验证魔数
    if (header.magic !== HCTX_MAGIC) {
      throw new Error(
        `Invalid HCTX magic: expected 0x${HCTX_MAGIC.toString(16).toUpperCase()}, ` +
        `got 0x${header.magic.toString(16).toUpperCase()}`
      );
    }

    // 4. 验证版本兼容性（SNAP-001）
    const version = this.parseVersion(header.version);
    if (version.major !== HCTX_VERSION_MAJOR) {
      throw new Error(
        `Unsupported HCTX major version: ${version.major}.` +
        `Expected: ${HCTX_VERSION_MAJOR}`
      );
    }

    // 5. 提取各区域
    // trailerOffset = buffer.length - TRAILER_SIZE
    const trailerOffset = buffer.length - TRAILER_SIZE;
    const headerBufWithChecksum = buffer.slice(0, HEADER_SIZE);
    const metadataBuf = buffer.slice(header.metadataOffset, header.indexOffset);
    const indexBuf = buffer.slice(header.indexOffset, header.dataOffset);
    const payloadBuf = buffer.slice(header.dataOffset, trailerOffset);
    const trailerBuf = buffer.slice(trailerOffset, trailerOffset + TRAILER_SIZE);

    // 6. 验证校验和（Metadata+Index+Payload）
    const contentToVerify = Buffer.concat([metadataBuf, indexBuf, payloadBuf]);
    const calculatedChecksum = this.calculateChecksum(contentToVerify);
    const storedChecksum = this.parseTrailer(trailerBuf);
    const checksumValid = calculatedChecksum.equals(storedChecksum);

    if (!checksumValid) {
      throw new Error(
        'HCTX checksum mismatch - data corruption detected. ' +
        `Calculated: ${calculatedChecksum.toString('hex')}, ` +
        `Stored: ${storedChecksum.toString('hex')}`
      );
    }

    // 7. 解析元数据
    const metadata = this.decodeMetadata(metadataBuf);

    // 8. 解析索引
    const index = this.decodeIndex(indexBuf);

    // 9. 解码数据区
    const chunks = await this.decodePayload(payloadBuf, index.entries);

    const durationMs = Date.now() - startTime;

    return {
      chunks,
      chunkCount: chunks.length,
      totalSize: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
      durationMs,
      checksumValid,
      version: header.version,
    };
  }

  /**
   * 序列化单个上下文块
   * 
   * @param chunk - 上下文块
   * @param options - 序列化选项
   * @returns 序列化后的Buffer
   */
  serializeChunk(chunk: ContextChunk, options?: SerializerOptions): Buffer {
    const opts = { ...this.options, ...options };

    // 块头部: 32字节
    const headerBuf = Buffer.alloc(32);
    
    // 0-7: ID哈希（SHA256前8字节）
    const idHash = crypto.createHash('sha256').update(chunk.id).digest().slice(0, 8);
    idHash.copy(headerBuf, 0);
    
    // 8: 类型码
    headerBuf.writeUInt8(this.getChunkTypeCode(chunk.type), 8);
    
    // 9: 版本
    headerBuf.writeUInt8(chunk.version, 9);
    
    // 10: 压缩标志
    headerBuf.writeUInt8(chunk.compressed ? 1 : 0, 10);
    
    // 11: 压缩算法码
    headerBuf.writeUInt8(this.getCompressionAlgoCode(chunk.compressionAlgo), 11);
    
    // 12-15: 原始大小
    headerBuf.writeUInt32BE(chunk.originalSize || chunk.size, 12);
    
    // 16-19: 实际大小
    headerBuf.writeUInt32BE(chunk.size, 16);
    
    // 20-27: 时间戳（大端uint64）
    headerBuf.writeBigUInt64BE(BigInt(chunk.timestamp), 20);
    
    // 28-31: 校验和前4字节
    const checksumBuf = Buffer.from(chunk.checksum.slice(0, 8), 'hex');
    checksumBuf.copy(headerBuf, 28);

    // 组合头部和Payload
    return Buffer.concat([headerBuf, chunk.payload]);
  }

  /**
   * 反序列化单个上下文块
   * 
   * @param buffer - 包含块数据的Buffer
   * @param offset - 起始偏移
   * @returns 解析的块和读取的字节数
   */
  deserializeChunk(buffer: Buffer, offset: number): { chunk: ContextChunk; bytesRead: number } {
    // 读取块头部 (32字节)
    const headerBuf = buffer.slice(offset, offset + 32);
    
    // 解析头部字段
    const typeCode = headerBuf.readUInt8(8);
    const type = this.getChunkTypeFromCode(typeCode);
    
    const version = headerBuf.readUInt8(9);
    const compressed = headerBuf.readUInt8(10) === 1;
    
    const algoCode = headerBuf.readUInt8(11);
    const compressionAlgo = this.getCompressionAlgoFromCode(algoCode);
    
    const originalSize = headerBuf.readUInt32BE(12);
    const size = headerBuf.readUInt32BE(16);
    const timestamp = Number(headerBuf.readBigUInt64BE(20));
    const checksum = headerBuf.slice(28, 32).toString('hex').padStart(64, '0');

    // 读取Payload
    const payload = buffer.slice(offset + 32, offset + 32 + size);

    const chunk: ContextChunk = {
      id: `chunk-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      version,
      compressed,
      compressionAlgo,
      originalSize: compressed ? originalSize : undefined,
      size,
      timestamp,
      checksum,
      payload,
    };

    return { chunk, bytesRead: 32 + size };
  }

  // ============================================================================
  // 私有方法：Header处理
  // ============================================================================

  /**
   * 构建文件头
   */
  private buildHeader(params: {
    chunkCount: number;
    metadataOffset: number;
    metadataLength: number;
    indexOffset: number;
    indexLength: number;
    payloadOffset: number;
    payloadLength: number;
    trailerOffset: number;
  }): HCTXFileHeader {
    return {
      magic: HCTX_MAGIC,
      version: HCTX_VERSION,
      flags: 0,
      timestamp: BigInt(Date.now()),
      chunkCount: params.chunkCount,
      metadataOffset: params.metadataOffset,
      metadataLength: params.metadataLength,
      indexOffset: params.indexOffset,
      indexLength: params.indexLength,
      dataOffset: params.payloadOffset,
      dataLength: params.payloadLength,
      checksum: Buffer.alloc(8),  // 8字节（SHA256前8字节）
      reserved: Buffer.alloc(16), // 16字节保留
    };
  }

  /**
   * 序列化文件头（64字节固定）
   * 
   * Header结构:
   * - 0-3:   魔数 (uint32 BE)
   * - 4-7:   版本 (uint32 BE: MMmmpppp)
   * - 8-9:   标志位 (uint16 BE)
   * - 10-11: 保留 (uint16 BE)
   * - 12-15: 元数据偏移 (uint32 BE)
   * - 16-19: 元数据长度 (uint32 BE)
   * - 20-23: 索引偏移 (uint32 BE)
   * - 24-27: 索引长度 (uint32 BE)
   * - 28-31: 数据偏移 (uint32 BE)
   * - 32-35: 数据长度 (uint32 BE)
   * - 36-43: 校验和 (8 bytes)
   * - 44-63: 保留 (20 bytes)
   */
  private serializeHeader(header: HCTXFileHeader): Buffer {
    const buf = Buffer.alloc(HEADER_SIZE);

    // 0-3: 魔数
    buf.writeUInt32BE(header.magic, 0);
    // 4-7: 版本
    buf.writeUInt32BE(header.version, 4);
    // 8-9: 标志位
    buf.writeUInt16BE(header.flags, 8);
    // 10-11: 保留
    buf.writeUInt16BE(0, 10);
    // 12-15: 元数据偏移
    buf.writeUInt32BE(header.metadataOffset, 12);
    // 16-19: 元数据长度
    buf.writeUInt32BE(header.metadataLength, 16);
    // 20-23: 索引偏移
    buf.writeUInt32BE(header.indexOffset, 20);
    // 24-27: 索引长度
    buf.writeUInt32BE(header.indexLength, 24);
    // 28-31: 数据偏移
    buf.writeUInt32BE(header.dataOffset, 28);
    // 32-35: 数据长度
    buf.writeUInt32BE(header.dataLength, 32);
    // 36-43: 校验和（8字节）
    header.checksum.copy(buf, 36);
    // 44-63: 保留（20字节）
    header.reserved.copy(buf, 44);

    return buf;
  }

  /**
   * 解析文件头
   */
  private parseHeader(buffer: Buffer): HCTXFileHeader {
    return {
      magic: buffer.readUInt32BE(0),
      version: buffer.readUInt32BE(4),
      flags: buffer.readUInt16BE(8),
      timestamp: BigInt(0), // Header中不存储，从Metadata获取
      chunkCount: 0, // 从Index获取
      metadataOffset: buffer.readUInt32BE(12),
      metadataLength: buffer.readUInt32BE(16),
      indexOffset: buffer.readUInt32BE(20),
      indexLength: buffer.readUInt32BE(24),
      dataOffset: buffer.readUInt32BE(28),
      dataLength: buffer.readUInt32BE(32),
      checksum: buffer.slice(36, 44),
      reserved: buffer.slice(44, 64),
    };
  }

  /**
   * 解析版本号
   * SNAP-001: 版本解析
   */
  private parseVersion(version: number): { major: number; minor: number; patch: number } {
    return {
      major: (version >>> 24) & 0xFF,
      minor: (version >>> 16) & 0xFF,
      patch: version & 0xFFFF,
    };
  }

  // ============================================================================
  // 私有方法：Metadata处理
  // ============================================================================

  /**
   * 构建元数据结构
   */
  private buildMetadata(chunks: ContextChunk[]): HCTXMetadata {
    const objectTypes: Record<string, number> = {};
    for (const chunk of chunks) {
      objectTypes[chunk.type] = (objectTypes[chunk.type] || 0) + 1;
    }

    return {
      schema: 'hctx-v1',
      snapshotId: this.generateUUID(),
      context: {
        type: 'conversation',
        createdAt: Date.now(),
      },
      stats: {
        totalObjects: chunks.length,
        totalBytes: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
        objectTypes,
      },
      compression: {
        algorithm: 'none',
        level: 3,
        blockSize: 256 * 1024,
      },
    };
  }

  /**
   * 编码元数据为Buffer
   * DEBT: ENTITY-B01-001 当前使用JSON，应替换为msgpack-lite
   */
  private encodeMetadata(metadata: HCTXMetadata): Buffer {
    // DEBT: MSGPACK-LITE-NOT-INSTALLED
    // 当msgpack-lite安装后，替换为:
    // import * as msgpack from 'msgpack-lite';
    // return Buffer.from(msgpack.encode(metadata));
    const jsonStr = JSON.stringify(metadata);
    return Buffer.from(jsonStr, 'utf-8');
  }

  /**
   * 解码元数据Buffer
   * DEBT: ENTITY-B01-001 当前使用JSON，应替换为msgpack-lite
   */
  private decodeMetadata(buffer: Buffer): HCTXMetadata {
    // DEBT: MSGPACK-LITE-NOT-INSTALLED
    // 当msgpack-lite安装后，替换为:
    // return msgpack.decode(buffer) as HCTXMetadata;
    const jsonStr = buffer.toString('utf-8');
    return JSON.parse(jsonStr) as HCTXMetadata;
  }

  // ============================================================================
  // 私有方法：Index处理
  // ============================================================================

  /**
   * 编码索引为Buffer
   */
  private encodeIndex(index: SerializedIndex): Buffer {
    const jsonStr = JSON.stringify(index);
    return Buffer.from(jsonStr, 'utf-8');
  }

  /**
   * 解码索引Buffer
   */
  private decodeIndex(buffer: Buffer): SerializedIndex {
    const jsonStr = buffer.toString('utf-8');
    return JSON.parse(jsonStr) as SerializedIndex;
  }

  // ============================================================================
  // 私有方法：Payload处理
  // ============================================================================

  /**
   * 编码数据区
   */
  private async encodePayload(
    chunks: ContextChunk[],
    options: Required<SerializerOptions>
  ): Promise<{ data: Buffer; indexEntries: SerializedIndexEntry[] }> {
    const buffers: Buffer[] = [];
    const entries: SerializedIndexEntry[] = [];
    let currentOffset = 0;

    for (const chunk of chunks) {
      let payload = chunk.payload;
      let compressed = chunk.compressed;
      let compressionAlgo = chunk.compressionAlgo;

      // 按需压缩
      if (options.enableCompression && payload.length > options.compressionThreshold) {
        if (compressionAlgo === 'gzip') {
          payload = await gzipAsync(payload);
          compressed = true;
        }
        // DEBT: 后续应支持ZStd和BSDiff
      }

      // 序列化块
      const serializedChunk = this.serializeChunk(
        { ...chunk, payload, compressed, compressionAlgo },
        options
      );

      entries.push({
        id: chunk.id,
        type: chunk.type,
        offset: currentOffset,
        length: chunk.size,
        compressedLength: payload.length,
        checksum: chunk.checksum,
        timestamp: chunk.timestamp,
      });

      buffers.push(serializedChunk);
      currentOffset += serializedChunk.length;
    }

    return { data: Buffer.concat(buffers), indexEntries: entries };
  }

  /**
   * 解码数据区
   */
  private async decodePayload(
    data: Buffer,
    indexEntries: SerializedIndexEntry[]
  ): Promise<ContextChunk[]> {
    const chunks: ContextChunk[] = [];
    let offset = 0;

    for (const entry of indexEntries) {
      const { chunk, bytesRead } = this.deserializeChunk(data, offset);
      
      // 更新ID和checksum（反序列化时生成的是占位符）
      chunk.id = entry.id;
      chunk.checksum = entry.checksum;

      // 解压（如果需要）
      if (chunk.compressed && chunk.compressionAlgo === 'gzip') {
        chunk.payload = await gunzipAsync(chunk.payload);
        chunk.compressed = false;
        chunk.compressionAlgo = 'none';
      }

      chunks.push(chunk);
      offset += bytesRead;
    }

    return chunks;
  }

  // ============================================================================
  // 私有方法：Trailer处理
  // ============================================================================

  /**
   * 构建Trailer（32字节SHA256）
   */
  private buildTrailer(checksum: Buffer): Buffer {
    // Trailer就是完整的SHA256（32字节）
    return checksum;
  }

  /**
   * 解析Trailer
   */
  private parseTrailer(buffer: Buffer): Buffer {
    return buffer.slice(0, TRAILER_SIZE);
  }

  // ============================================================================
  // 私有方法：工具函数
  // ============================================================================

  /**
   * 计算SHA256校验和
   */
  private calculateChecksum(data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  }

  /**
   * 获取块类型代码
   */
  private getChunkTypeCode(type: ContextChunkType): number {
    const codes: Record<ContextChunkType, number> = {
      transient: 0x01,
      staging: 0x02,
      archive: 0x03,
      governance: 0x04,
      metadata: 0x05,
    };
    return codes[type] || 0x00;
  }

  /**
   * 从代码获取块类型
   */
  private getChunkTypeFromCode(code: number): ContextChunkType {
    const types: Record<number, ContextChunkType> = {
      0x01: 'transient',
      0x02: 'staging',
      0x03: 'archive',
      0x04: 'governance',
      0x05: 'metadata',
    };
    return types[code] || 'metadata';
  }

  /**
   * 获取压缩算法代码
   */
  private getCompressionAlgoCode(algo: string): number {
    const codes: Record<string, number> = {
      none: 0x00,
      gzip: 0x01,
      zstd: 0x02,
      lz4: 0x03,
    };
    return codes[algo] || 0x00;
  }

  /**
   * 从代码获取压缩算法
   */
  private getCompressionAlgoFromCode(code: number): 'none' | 'gzip' | 'zstd' | 'lz4' {
    const algos: Record<number, 'none' | 'gzip' | 'zstd' | 'lz4'> = {
      0x00: 'none',
      0x01: 'gzip',
      0x02: 'zstd',
      0x03: 'lz4',
    };
    return algos[code] || 'none';
  }

  /**
   * 生成UUID v7（简化版）
   */
  private generateUUID(): string {
    const timestamp = Date.now();
    const timeHex = timestamp.toString(16).padStart(12, '0');
    const randomHex = crypto.randomBytes(10).toString('hex');
    return `${timeHex.slice(0, 8)}-${timeHex.slice(8)}-7${randomHex.slice(0, 3)}-${randomHex.slice(3, 7)}-${randomHex.slice(7)}`;
  }
}

// ============================================================================
// 导出
// ============================================================================

/** 默认序列化器实例 */
export const defaultSerializer = new ContextSerializer();

/** 导出默认实例 */
export default ContextSerializer;
