/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - bsdiff增量更新模块
 * ============================================================
 * 文件: desktop/updater/bsdiff.ts
 * 职责: 差分包生成、补丁应用、校验验证
 * 算法: 基于bsdiff二进制差分算法
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import { createHash, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import * as path from 'path';

// ============================================================
// 类型定义
// ============================================================

/** 差分包元数据 */
interface PatchMetadata {
  /** 源版本 */
  sourceVersion: string;
  /** 目标版本 */
  targetVersion: string;
  /** 源文件大小 */
  oldSize: number;
  /** 目标文件大小 */
  newSize: number;
  /** 差分包大小 */
  patchSize: number;
  /** 源文件SHA256 */
  oldHash: string;
  /** 目标文件SHA256 */
  newHash: string;
  /** 差分包SHA256 */
  patchHash: string;
  /** 创建时间 */
  createdAt: string;
  /** 压缩算法 */
  compression: 'bzip2' | 'gzip' | 'none';
}

/** 差分块信息 */
interface DiffBlock {
  /** 旧文件偏移 */
  oldOffset: number;
  /** 新文件偏移 */
  newOffset: number;
  /** 匹配长度 */
  length: number;
}

/** 补丁数据 */
interface PatchData {
  metadata: PatchMetadata;
  /** 差分数据 */
  diffData: Buffer;
  /** 额外数据（新增内容） */
  extraData: Buffer;
  /** 控制块 */
  controlBlocks: ControlBlock[];
}

/** 控制块 */
interface ControlBlock {
  /** 差分长度 */
  diffLen: number;
  /** 额外长度 */
  extraLen: number;
  /** 旧文件偏移增量 */
  oldOffsetInc: number;
}

/** 生成选项 */
interface GenerateOptions {
  /** 压缩级别 1-9 */
  compressionLevel?: number;
  /** 块大小 */
  blockSize?: number;
  /** 输出目录 */
  outputDir?: string;
}

/** 应用选项 */
interface ApplyOptions {
  /** 验证哈希 */
  verifyHash?: boolean;
  /** 备份原文件 */
  backupOld?: boolean;
}

// ============================================================
// 常量定义
// ============================================================

const MAGIC_NUMBER = Buffer.from('HAJIMI DIFF\x00', 'utf8');
const DEFAULT_BLOCK_SIZE = 16 * 1024; // 16KB
const SUFFIX_ARRAY_DIV = 4; // SA后缀数组除数

// ============================================================
// 辅助函数
// ============================================================

/** 计算SHA256 */
async function computeHash(data: Buffer): Promise<string> {
  return createHash('sha256').update(data).digest('hex');
}

/** 计算文件SHA256 */
async function computeFileHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** 读取文件到Buffer */
async function readFileToBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

/** 后缀数组排序（简化版，实际使用divsufsort算法） */
function buildSuffixArray(data: Buffer): Int32Array {
  const n = data.length;
  const sa = new Int32Array(n);
  const keys = new Int32Array(n);
  
  // 初始排序（按首字节）
  for (let i = 0; i < n; i++) {
    sa[i] = i;
    keys[i] = data[i];
  }
  
  // 倍增算法
  for (let k = 1; k < n; k *= 2) {
    sa.sort((a, b) => {
      if (keys[a] !== keys[b]) return keys[a] - keys[b];
      const a2 = a + k < n ? keys[a + k] : -1;
      const b2 = b + k < n ? keys[b + k] : -1;
      return a2 - b2;
    });
    
    const newKeys = new Int32Array(n);
    newKeys[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      const prevDiff = keys[sa[i - 1]] !== keys[sa[i]];
      const nextDiff = (sa[i - 1] + k < n ? keys[sa[i - 1] + k] : -1) !== 
                      (sa[i] + k < n ? keys[sa[i] + k] : -1);
      newKeys[sa[i]] = newKeys[sa[i - 1]] + (prevDiff || nextDiff ? 1 : 0);
    }
    keys.set(newKeys);
    if (keys[sa[n - 1]] === n - 1) break;
  }
  
  return sa;
}

/** 二分查找最长匹配 */
function findLongestMatch(
  data: Buffer,
  sa: Int32Array,
  target: Buffer,
  targetOffset: number
): { offset: number; length: number } {
  let bestOffset = 0;
  let bestLength = 0;
  
  const search = () => {
    let left = 0;
    let right = sa.length;
    
    while (left < right) {
      const mid = (left + right) >> 1;
      const pos = sa[mid];
      let cmp = 0;
      
      for (let i = 0; i < target.length - targetOffset && pos + i < data.length; i++) {
        cmp = data[pos + i] - target[targetOffset + i];
        if (cmp !== 0) break;
      }
      
      if (cmp < 0) left = mid + 1;
      else right = mid;
    }
    
    // 检查最佳匹配
    for (let i = Math.max(0, left - 10); i < Math.min(sa.length, left + 10); i++) {
      const pos = sa[i];
      let len = 0;
      while (len < target.length - targetOffset && 
             pos + len < data.length && 
             data[pos + len] === target[targetOffset + len]) {
        len++;
      }
      if (len > bestLength) {
        bestLength = len;
        bestOffset = pos;
      }
    }
  };
  
  search();
  return { offset: bestOffset, length: bestLength };
}

// ============================================================
// 差分包生成
// ============================================================

/**
 * 生成差分包
 * 基于bsdiff算法核心思想：
 * 1. 构建旧文件的后缀数组
 * 2. 在旧文件中搜索新文件的每个位置的最长匹配
 * 3. 生成差分数据和额外数据
 */
export async function generatePatch(
  oldFilePath: string,
  newFilePath: string,
  options: GenerateOptions = {}
): Promise<{ patchPath: string; metadata: PatchMetadata }> {
  const {
    compressionLevel = 6,
    blockSize = DEFAULT_BLOCK_SIZE,
    outputDir = path.dirname(newFilePath),
  } = options;

  console.log(`[bsdiff] 生成差分包: ${oldFilePath} -> ${newFilePath}`);

  // 读取文件
  const [oldData, newData] = await Promise.all([
    readFileToBuffer(oldFilePath),
    readFileToBuffer(newFilePath),
  ]);

  // 计算哈希
  const [oldHash, newHash] = await Promise.all([
    computeHash(oldData),
    computeHash(newData),
  ]);

  // 构建后缀数组（用于快速查找匹配）
  console.log('[bsdiff] 构建后缀数组...');
  const sa = buildSuffixArray(oldData);

  // 生成差分
  console.log('[bsdiff] 计算差分...');
  const { diffData, extraData, controlBlocks } = computeDiff(oldData, newData, sa, blockSize);

  // 压缩数据（简化版，实际使用bzip2）
  const compressedDiff = compressBuffer(diffData, compressionLevel);
  const compressedExtra = compressBuffer(extraData, compressionLevel);

  // 构建补丁文件
  const metadata: PatchMetadata = {
    sourceVersion: extractVersion(oldFilePath),
    targetVersion: extractVersion(newFilePath),
    oldSize: oldData.length,
    newSize: newData.length,
    patchSize: 0, // 稍后更新
    oldHash,
    newHash,
    patchHash: '', // 稍后更新
    createdAt: new Date().toISOString(),
    compression: 'gzip',
  };

  const patchBuffer = buildPatchBuffer(metadata, controlBlocks, compressedDiff, compressedExtra);
  metadata.patchSize = patchBuffer.length;
  metadata.patchHash = await computeHash(patchBuffer);

  // 重新构建包含正确元数据的补丁
  const finalPatchBuffer = buildPatchBuffer(metadata, controlBlocks, compressedDiff, compressedExtra);

  // 保存补丁文件
  const patchFileName = `hajimi-${metadata.sourceVersion}-to-${metadata.targetVersion}.patch`;
  const patchPath = path.join(outputDir, patchFileName);
  await fs.writeFile(patchPath, finalPatchBuffer);

  console.log(`[bsdiff] 差分包生成完成: ${patchPath}`);
  console.log(`  旧文件: ${formatBytes(oldData.length)} -> 新文件: ${formatBytes(newData.length)}`);
  console.log(`  补丁大小: ${formatBytes(finalPatchBuffer.length)}`);
  console.log(`  压缩率: ${((1 - finalPatchBuffer.length / newData.length) * 100).toFixed(1)}%`);

  return { patchPath, metadata };
}

/** 计算差分核心算法 */
function computeDiff(
  oldData: Buffer,
  newData: Buffer,
  sa: Int32Array,
  blockSize: number
): { diffData: Buffer; extraData: Buffer; controlBlocks: ControlBlock[] } {
  const controlBlocks: ControlBlock[] = [];
  const diffChunks: Buffer[] = [];
  const extraChunks: Buffer[] = [];

  let newPos = 0;
  let oldPos = 0;

  while (newPos < newData.length) {
    // 在旧文件中查找最长匹配
    const { offset: matchOffset, length: matchLen } = findLongestMatch(
      oldData,
      sa,
      newData,
      newPos
    );

    if (matchLen >= 8) {
      // 找到有效匹配
      const diffLen = matchLen;
      
      // 计算差分数据（XOR差异）
      const diffChunk = Buffer.alloc(diffLen);
      for (let i = 0; i < diffLen; i++) {
        diffChunk[i] = newData[newPos + i] ^ oldData[matchOffset + i];
      }
      diffChunks.push(diffChunk);

      // 控制块
      controlBlocks.push({
        diffLen,
        extraLen: 0,
        oldOffsetInc: matchOffset - oldPos,
      });

      newPos += diffLen;
      oldPos = matchOffset + diffLen;
    } else {
      // 无匹配，添加额外数据
      let extraLen = Math.min(blockSize, newData.length - newPos);
      
      // 向前查找下一个匹配
      let lookAhead = 1;
      while (lookAhead < 16 && newPos + lookAhead < newData.length) {
        const next = findLongestMatch(oldData, sa, newData, newPos + lookAhead);
        if (next.length >= 8) break;
        lookAhead++;
      }
      extraLen = Math.min(extraLen, lookAhead);

      const extraChunk = Buffer.from(newData.slice(newPos, newPos + extraLen));
      extraChunks.push(extraChunk);

      controlBlocks.push({
        diffLen: 0,
        extraLen,
        oldOffsetInc: 0,
      });

      newPos += extraLen;
    }
  }

  return {
    diffData: Buffer.concat(diffChunks),
    extraData: Buffer.concat(extraChunks),
    controlBlocks,
  };
}

/** 压缩Buffer */
function compressBuffer(data: Buffer, level: number): Buffer {
  // 简化实现，实际使用zlib.brotliCompress或bzip2
  // 这里返回原始数据的简单RLE压缩
  if (data.length === 0) return data;

  const compressed: number[] = [];
  let count = 1;
  let current = data[0];

  for (let i = 1; i < data.length; i++) {
    if (data[i] === current && count < 255) {
      count++;
    } else {
      compressed.push(count, current);
      current = data[i];
      count = 1;
    }
  }
  compressed.push(count, current);

  // 如果压缩后更大，返回原始数据
  const compressedBuffer = Buffer.from(compressed);
  return compressedBuffer.length < data.length ? compressedBuffer : data;
}

/** 构建补丁文件Buffer */
function buildPatchBuffer(
  metadata: PatchMetadata,
  controlBlocks: ControlBlock[],
  diffData: Buffer,
  extraData: Buffer
): Buffer {
  const metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
  const controlBuffer = Buffer.from(JSON.stringify(controlBlocks), 'utf8');

  // 文件结构: MAGIC + 元数据长度(4) + 控制块长度(4) + 差分长度(4) + 额外长度(4) + 元数据 + 控制块 + 差分 + 额外
  const header = Buffer.alloc(MAGIC_NUMBER.length + 16);
  let offset = 0;
  
  MAGIC_NUMBER.copy(header, offset);
  offset += MAGIC_NUMBER.length;
  
  header.writeUInt32LE(metadataBuffer.length, offset);
  offset += 4;
  header.writeUInt32LE(controlBuffer.length, offset);
  offset += 4;
  header.writeUInt32LE(diffData.length, offset);
  offset += 4;
  header.writeUInt32LE(extraData.length, offset);

  return Buffer.concat([header, metadataBuffer, controlBuffer, diffData, extraData]);
}

/** 提取版本号 */
function extractVersion(filePath: string): string {
  const match = filePath.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '0.0.0';
}

/** 格式化字节 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// ============================================================
// 补丁应用
// ============================================================

/**
 * 应用差分包
 */
export async function applyPatch(
  oldFilePath: string,
  patchPath: string,
  outputPath: string,
  options: ApplyOptions = {}
): Promise<{ success: boolean; newHash: string }> {
  const { verifyHash = true, backupOld = true } = options;

  console.log(`[bsdiff] 应用补丁: ${patchPath} -> ${outputPath}`);

  // 读取旧文件和补丁
  const [oldData, patchBuffer] = await Promise.all([
    readFileToBuffer(oldFilePath),
    readFileToBuffer(patchPath),
  ]);

  // 解析补丁
  const { metadata, controlBlocks, diffData, extraData } = parsePatchBuffer(patchBuffer);

  // 验证旧文件哈希
  if (verifyHash) {
    const oldHash = await computeHash(oldData);
    if (oldHash !== metadata.oldHash) {
      throw new Error(`旧文件哈希不匹配: 期望 ${metadata.oldHash}, 实际 ${oldHash}`);
    }
  }

  // 备份旧文件
  if (backupOld) {
    const backupPath = `${oldFilePath}.backup`;
    await fs.copyFile(oldFilePath, backupPath);
  }

  // 重构新文件
  console.log('[bsdiff] 重构新文件...');
  const newData = reconstructFile(oldData, controlBlocks, diffData, extraData, metadata.newSize);

  // 验证新文件哈希
  const newHash = await computeHash(newData);
  if (verifyHash && newHash !== metadata.newHash) {
    throw new Error(`新文件哈希不匹配: 期望 ${metadata.newHash}, 实际 ${newHash}`);
  }

  // 保存新文件
  await fs.writeFile(outputPath, newData);

  console.log(`[bsdiff] 补丁应用完成: ${outputPath}`);

  return { success: true, newHash };
}

/** 解析补丁文件 */
function parsePatchBuffer(buffer: Buffer): PatchData {
  let offset = 0;

  // 验证魔数
  const magic = buffer.slice(0, MAGIC_NUMBER.length);
  if (!magic.equals(MAGIC_NUMBER)) {
    throw new Error('无效的补丁文件格式');
  }
  offset += MAGIC_NUMBER.length;

  // 读取长度
  const metadataLen = buffer.readUInt32LE(offset);
  offset += 4;
  const controlLen = buffer.readUInt32LE(offset);
  offset += 4;
  const diffLen = buffer.readUInt32LE(offset);
  offset += 4;
  const extraLen = buffer.readUInt32LE(offset);
  offset += 4;

  // 读取数据
  const metadata: PatchMetadata = JSON.parse(buffer.slice(offset, offset + metadataLen).toString('utf8'));
  offset += metadataLen;

  const controlBlocks: ControlBlock[] = JSON.parse(buffer.slice(offset, offset + controlLen).toString('utf8'));
  offset += controlLen;

  const diffData = decompressBuffer(buffer.slice(offset, offset + diffLen));
  offset += diffLen;

  const extraData = decompressBuffer(buffer.slice(offset, offset + extraLen));

  return { metadata, controlBlocks, diffData, extraData };
}

/** 解压缩 */
function decompressBuffer(data: Buffer): Buffer {
  // 简化实现，检测是否是RLE压缩
  if (data.length % 2 !== 0) return data; // 原始数据

  // 尝试RLE解压
  const decompressed: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const count = data[i];
    const value = data[i + 1];
    for (let j = 0; j < count; j++) {
      decompressed.push(value);
    }
  }

  return Buffer.from(decompressed);
}

/** 重构文件 */
function reconstructFile(
  oldData: Buffer,
  controlBlocks: ControlBlock[],
  diffData: Buffer,
  extraData: Buffer,
  newSize: number
): Buffer {
  const newData = Buffer.alloc(newSize);
  let diffOffset = 0;
  let extraOffset = 0;
  let oldPos = 0;
  let newPos = 0;

  for (const block of controlBlocks) {
    // 调整旧文件位置
    oldPos += block.oldOffsetInc;

    // 应用差分数据
    if (block.diffLen > 0) {
      for (let i = 0; i < block.diffLen && newPos < newSize; i++) {
        newData[newPos] = oldData[oldPos] ^ diffData[diffOffset + i];
        newPos++;
        oldPos++;
      }
      diffOffset += block.diffLen;
    }

    // 添加额外数据
    if (block.extraLen > 0) {
      for (let i = 0; i < block.extraLen && newPos < newSize; i++) {
        newData[newPos] = extraData[extraOffset + i];
        newPos++;
      }
      extraOffset += block.extraLen;
    }
  }

  return newData;
}

// ============================================================
// 导出
// ============================================================

export type { PatchMetadata, ControlBlock, GenerateOptions, ApplyOptions };
export { computeHash, computeFileHash };
