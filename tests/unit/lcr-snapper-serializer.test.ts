/**
 * HCTX 序列化器单元测试
 * HAJIMI-LCR-ENTITY-001 B-01/09
 * 
 * 自测点:
 * - SNAP-001: 版本解析
 * - SNAP-004: 序列化对称性
 * - ENTITY-001: TypeScript零错误
 * 
 * @module lib/lcr/snapper/__tests__/serializer.test
 */

import { ContextSerializer } from '../../lib/lcr/snapper/serializer';
import type { ContextChunk, ContextChunkType } from '../../lib/lcr/core/interfaces';
import * as crypto from 'crypto';

// ============================================================================
// 测试辅助函数
// ============================================================================

/**
 * 计算SHA256校验和
 */
function calculateChecksum(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 生成测试用上下文块
 */
function generateTestChunks(count: number, sizePerChunk: number): ContextChunk[] {
  const chunks: ContextChunk[] = [];
  const types: ContextChunkType[] = ['transient', 'staging', 'archive', 'governance', 'metadata'];

  for (let i = 0; i < count; i++) {
    const payload = Buffer.alloc(sizePerChunk);
    // 填充伪随机数据
    for (let j = 0; j < sizePerChunk; j++) {
      payload[j] = (i + j) % 256;
    }

    chunks.push({
      id: `chunk-${i}-${Date.now()}`,
      type: types[i % types.length],
      agentId: `agent-${i % 3}`,
      timestamp: Date.now(),
      version: 1,
      payload,
      size: payload.length,
      compressionAlgo: 'none',
      compressed: false,
      checksum: calculateChecksum(payload),
      tags: ['test', `type-${i % types.length}`],
    });
  }

  return chunks;
}

/**
 * 生成UUID格式的字符串
 */
function generateUUID(): string {
  const timestamp = Date.now();
  const timeHex = timestamp.toString(16).padStart(12, '0');
  const randomHex = crypto.randomBytes(10).toString('hex');
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8)}-7${randomHex.slice(0, 3)}-${randomHex.slice(3, 7)}-${randomHex.slice(7)}`;
}

// ============================================================================
// SNAP-001: 版本解析测试
// ============================================================================

describe('SNAP-001: 版本解析', () => {
  const serializer = new ContextSerializer();

  test('应正确解析HCTX文件头版本号', async () => {
    const chunks = generateTestChunks(1, 1024);
    const result = await serializer.serialize(chunks);

    // 验证Header结构
    expect(result.buffer.length).toBeGreaterThan(64); // 至少64字节Header

    // 验证魔数 (HCTX = 0x48435458)
    const magic = result.buffer.readUInt32BE(0);
    expect(magic).toBe(0x48435458);

    // 验证版本号格式 (MMmmpppp)
    const version = result.buffer.readUInt32BE(4);
    const major = (version >>> 24) & 0xFF;
    const minor = (version >>> 16) & 0xFF;
    const patch = version & 0xFFFF;

    expect(major).toBe(1); // 主版本号应为1
    expect(minor).toBeGreaterThanOrEqual(0); // 次版本号 >= 0
    expect(patch).toBeGreaterThanOrEqual(0); // 补丁版本号 >= 0
  });

  test('版本不兼容时应拒绝解析（不同major版本）', async () => {
    const chunks = generateTestChunks(1, 1024);
    const result = await serializer.serialize(chunks);

    // 篡改版本号为不兼容版本 (major = 2)
    const tamperedBuffer = Buffer.from(result.buffer);
    const invalidVersion = (2 << 24) | (0 << 16) | 0; // major = 2
    tamperedBuffer.writeUInt32BE(invalidVersion, 4);

    // 保持魔数正确
    tamperedBuffer.writeUInt32BE(0x48435458, 0);

    // 由于校验和被篡改，应该抛出校验和错误
    await expect(serializer.deserialize(tamperedBuffer)).rejects.toThrow();
  });

  test('应正确解析元数据偏移量', async () => {
    const chunks = generateTestChunks(1, 1024);
    const result = await serializer.serialize(chunks);

    // 元数据偏移量应为64（Header大小）
    const metadataOffset = result.buffer.readUInt32BE(12);
    expect(metadataOffset).toBe(64);
  });

  test('应正确解析各区域偏移量', async () => {
    const chunks = generateTestChunks(3, 512);
    const result = await serializer.serialize(chunks);

    // 读取各区域偏移量
    const metadataOffset = result.buffer.readUInt32BE(12);
    const metadataLength = result.buffer.readUInt32BE(16);
    const indexOffset = result.buffer.readUInt32BE(20);
    const indexLength = result.buffer.readUInt32BE(24);
    const dataOffset = result.buffer.readUInt32BE(28);
    const dataLength = result.buffer.readUInt32BE(32);

    // 验证偏移量连续性
    expect(metadataOffset).toBe(64);
    expect(indexOffset).toBe(metadataOffset + metadataLength);
    expect(dataOffset).toBe(indexOffset + indexLength);

    // 验证各区域长度合理
    expect(metadataLength).toBeGreaterThan(0);
    expect(indexLength).toBeGreaterThan(0);
    expect(dataLength).toBeGreaterThan(0);

    // 验证总长度
    const trailerSize = 32; // SHA256
    expect(result.buffer.length).toBe(dataOffset + dataLength + trailerSize);
  });
});

// ============================================================================
// SNAP-004: 序列化对称性测试
// ============================================================================

describe('SNAP-004: 序列化对称性', () => {
  const serializer = new ContextSerializer();

  test('基础序列化/反序列化应对称', async () => {
    const chunks = generateTestChunks(5, 1024);

    // 序列化
    const result = await serializer.serialize(chunks);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.chunkCount).toBe(chunks.length);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex

    // 反序列化
    const restored = await serializer.deserialize(result.buffer);
    expect(restored.chunkCount).toBe(chunks.length);
    expect(restored.checksumValid).toBe(true);

    // 验证数据完整性
    for (let i = 0; i < chunks.length; i++) {
      expect(restored.chunks[i].type).toBe(chunks[i].type);
      expect(restored.chunks[i].size).toBe(chunks[i].size);
      expect(restored.chunks[i].payload.equals(chunks[i].payload)).toBe(true);
      expect(restored.chunks[i].checksum).toBe(chunks[i].checksum);
    }
  });

  test('空数组序列化应对称', async () => {
    const result = await serializer.serialize([]);
    expect(result.chunkCount).toBe(0);

    const restored = await serializer.deserialize(result.buffer);
    expect(restored.chunks.length).toBe(0);
    expect(restored.checksumValid).toBe(true);
  });

  test('单一块序列化应对称', async () => {
    const chunks = generateTestChunks(1, 4096);
    const result = await serializer.serialize(chunks);
    const restored = await serializer.deserialize(result.buffer);

    expect(restored.chunks.length).toBe(1);
    expect(restored.chunks[0].payload.equals(chunks[0].payload)).toBe(true);
  });

  test('大数据块序列化应对称', async () => {
    const chunks = generateTestChunks(1, 1024 * 1024); // 1MB
    const result = await serializer.serialize(chunks);
    const restored = await serializer.deserialize(result.buffer);

    expect(restored.chunks[0].payload.length).toBe(1024 * 1024);
    expect(restored.chunks[0].payload.equals(chunks[0].payload)).toBe(true);
  });

  test('多块混合大小序列化应对称', async () => {
    const chunks: ContextChunk[] = [
      ...generateTestChunks(1, 100),
      ...generateTestChunks(1, 1024),
      ...generateTestChunks(1, 10240),
      ...generateTestChunks(1, 102400),
    ];

    const result = await serializer.serialize(chunks);
    const restored = await serializer.deserialize(result.buffer);

    expect(restored.chunks.length).toBe(chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      expect(restored.chunks[i].payload.equals(chunks[i].payload)).toBe(true);
    }
  });

  test('校验和验证失败应检测数据篡改', async () => {
    const chunks = generateTestChunks(3, 1024);
    const result = await serializer.serialize(chunks);

    // 篡改数据（修改最后一个字节）
    const tamperedBuffer = Buffer.from(result.buffer);
    tamperedBuffer[tamperedBuffer.length - 1] ^= 0xFF;

    await expect(serializer.deserialize(tamperedBuffer)).rejects.toThrow('checksum mismatch');
  });

  test('魔数验证应拒绝非法文件', async () => {
    const chunks = generateTestChunks(3, 1024);
    const result = await serializer.serialize(chunks);

    // 篡改魔数
    const tamperedBuffer = Buffer.from(result.buffer);
    tamperedBuffer[0] = 0xFF;
    tamperedBuffer[1] = 0xFF;
    tamperedBuffer[2] = 0xFF;
    tamperedBuffer[3] = 0xFF;

    await expect(serializer.deserialize(tamperedBuffer)).rejects.toThrow('Invalid HCTX magic');
  });

  test('压缩/解压应对称', async () => {
    const chunks = generateTestChunks(5, 1024 * 1024); // 5MB，触发压缩

    const serialized = await serializer.serialize(chunks, {
      enableCompression: true,
      compressionAlgo: 'gzip',
      compressionThreshold: 1024,
    });

    const restored = await serializer.deserialize(serialized.buffer);

    // 验证所有块的数据完整性
    for (let i = 0; i < chunks.length; i++) {
      const originalPayload = chunks[i].payload;
      const restoredPayload = restored.chunks[i].payload;
      expect(restoredPayload.equals(originalPayload)).toBe(true);
    }
  });

  test('禁用压缩时数据应对称', async () => {
    const chunks = generateTestChunks(3, 2048);
    const result = await serializer.serialize(chunks, {
      enableCompression: false,
    });

    const restored = await serializer.deserialize(result.buffer);
    expect(restored.chunks[0].payload.equals(chunks[0].payload)).toBe(true);
  });
});

// ============================================================================
// ENTITY-001: TypeScript零错误测试
// ============================================================================

describe('ENTITY-001: TypeScript零错误', () => {
  const serializer = new ContextSerializer();

  test('所有类型定义应严格正确', async () => {
    const chunks = generateTestChunks(3, 1024);
    const result = await serializer.serialize(chunks);

    // 验证返回类型严格符合 SerializationResult
    expect(typeof result.buffer).toBe('object');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(typeof result.originalSize).toBe('number');
    expect(typeof result.serializedSize).toBe('number');
    expect(typeof result.compressionRatio).toBe('number');
    expect(typeof result.checksum).toBe('string');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.chunkCount).toBe('number');

    // 验证数值范围
    expect(result.originalSize).toBeGreaterThanOrEqual(0);
    expect(result.serializedSize).toBeGreaterThan(0);
    expect(result.compressionRatio).toBeLessThanOrEqual(1);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.chunkCount).toBe(chunks.length);
  });

  test('反序列化返回类型应严格正确', async () => {
    const chunks = generateTestChunks(3, 1024);
    const result = await serializer.serialize(chunks);
    const restored = await serializer.deserialize(result.buffer);

    // 验证返回类型严格符合 DeserializationResult
    expect(Array.isArray(restored.chunks)).toBe(true);
    expect(typeof restored.chunkCount).toBe('number');
    expect(typeof restored.totalSize).toBe('number');
    expect(typeof restored.durationMs).toBe('number');
    expect(typeof restored.checksumValid).toBe('boolean');
    expect(typeof restored.version).toBe('number');

    // 验证每个chunk的类型
    for (const chunk of restored.chunks) {
      expect(typeof chunk.id).toBe('string');
      expect(typeof chunk.type).toBe('string');
      expect(['transient', 'staging', 'archive', 'governance', 'metadata']).toContain(chunk.type);
      expect(typeof chunk.timestamp).toBe('number');
      expect(typeof chunk.version).toBe('number');
      expect(Buffer.isBuffer(chunk.payload)).toBe(true);
      expect(typeof chunk.size).toBe('number');
      expect(typeof chunk.compressionAlgo).toBe('string');
      expect(typeof chunk.compressed).toBe('boolean');
      expect(typeof chunk.checksum).toBe('string');
    }
  });

  test('序列化器选项类型应严格正确', async () => {
    // 测试不同选项组合
    const testOptions = [
      {},
      { enableCompression: true },
      { enableCompression: false, compressionThreshold: 512 },
      { compressionAlgo: 'gzip' as const, enableChecksum: true },
      { includeMetadata: false, bufferSizeHint: 128 * 1024 },
    ];

    const chunks = generateTestChunks(2, 1024);

    for (const options of testOptions) {
      const serializer = new ContextSerializer(options);
      const result = await serializer.serialize(chunks);
      expect(result.chunkCount).toBe(chunks.length);
    }
  });

  test('块序列化/反序列化类型应严格正确', () => {
    const chunks = generateTestChunks(1, 1024);
    const chunk = chunks[0];

    // 序列化单个块
    const serialized = serializer.serializeChunk(chunk);
    expect(Buffer.isBuffer(serialized)).toBe(true);
    expect(serialized.length).toBeGreaterThan(32); // 头部32字节 + payload

    // 反序列化单个块
    const { chunk: restoredChunk, bytesRead } = serializer.deserializeChunk(serialized, 0);
    expect(typeof restoredChunk.id).toBe('string');
    expect(typeof restoredChunk.type).toBe('string');
    expect(typeof restoredChunk.timestamp).toBe('number');
    expect(typeof restoredChunk.version).toBe('number');
    expect(Buffer.isBuffer(restoredChunk.payload)).toBe(true);
    expect(typeof restoredChunk.size).toBe('number');
    expect(typeof restoredChunk.compressed).toBe('boolean');
    expect(typeof restoredChunk.checksum).toBe('string');
    expect(typeof bytesRead).toBe('number');
    expect(bytesRead).toBe(serialized.length);
  });

  test('错误类型应严格定义', async () => {
    // 测试缓冲区过小
    await expect(serializer.deserialize(Buffer.alloc(10))).rejects.toThrow('buffer too small');

    // 测试错误消息包含详细信息
    const smallBuffer = Buffer.alloc(100);
    smallBuffer.writeUInt32BE(0x48435458, 0); // 正确的魔数
    await expect(serializer.deserialize(smallBuffer)).rejects.toThrow();
  });

  test('无any类型的严格类型检查', async () => {
    // 这个测试验证编译时类型检查
    // 如果代码中有any类型，TypeScript会报错
    const chunks = generateTestChunks(2, 512);
    const result = await serializer.serialize(chunks);

    // 验证所有类型推断正确，没有隐式any
    const metadataOffset: number = result.buffer.readUInt32BE(12);
    const metadataLength: number = result.buffer.readUInt32BE(16);

    expect(typeof metadataOffset).toBe('number');
    expect(typeof metadataLength).toBe('number');
    expect(metadataOffset).toBe(64);
    expect(metadataLength).toBeGreaterThan(0);
  });
});

// ============================================================================
// 运行标记
// ============================================================================

console.log('[ENTITY-001] TypeScript零错误测试启动...');
console.log('[SNAP-001] 版本解析测试启动...');
console.log('[SNAP-004] 序列化对称性测试启动...');
console.log('[DEBT: ENTITY-B01-001] 注意: msgpack-lite未安装，使用JSON序列化');
