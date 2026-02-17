/**
 * Hajimi Claw - SimHash Deduplication
 * SimHash去重算法与布隆过滤器
 * @version 1.0.0
 * @implements CLAW-002 (去重准确率>98%)
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SimHashConfig {
  hashBits?: number;        // 哈希位数（默认64）
  threshold?: number;       // 汉明距离阈值（默认3）
  nGramSize?: number;       // n-gram大小（默认3）
  useBloomFilter?: boolean; // 是否使用布隆过滤器
  bloomFilterSize?: number; // 布隆过滤器大小
  bloomFilterHashes?: number; // 布隆过滤器哈希函数数量
}

export interface DuplicateResult {
  isDuplicate: boolean;
  similarity: number;       // 相似度 0-1
  hash: string;
  matchedWith?: string;     // 匹配的文章ID
  hammingDistance?: number;
}

export interface ContentFingerprint {
  id: string;
  hash: bigint;
  text: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BloomFilterStats {
  size: number;
  hashCount: number;
  elementCount: number;
  bitCount: number;
  falsePositiveRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<SimHashConfig> = {
  hashBits: 64,
  threshold: 3,
  nGramSize: 3,
  useBloomFilter: true,
  bloomFilterSize: 1000000,  // 100万位
  bloomFilterHashes: 7
};

// ============================================================================
// Bloom Filter Implementation
// ============================================================================

class BloomFilter {
  private bits: Uint8Array;
  private size: number;
  private hashCount: number;
  private elementCount = 0;

  constructor(size: number, hashCount: number) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  add(item: string): void {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const bit = hash % this.size;
      this.bits[Math.floor(bit / 8)] |= 1 << (bit % 8);
    }
    this.elementCount++;
  }

  mightContain(item: string): boolean {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const bit = hash % this.size;
      if ((this.bits[Math.floor(bit / 8)] & (1 << (bit % 8))) === 0) {
        return false;
      }
    }
    return true;
  }

  private getHashes(item: string): number[] {
    const hashes: number[] = [];
    const hash1 = parseInt(createHash('md5').update(item + '1').digest('hex').slice(0, 8), 16);
    const hash2 = parseInt(createHash('md5').update(item + '2').digest('hex').slice(0, 8), 16);

    for (let i = 0; i < this.hashCount; i++) {
      hashes.push((hash1 + i * hash2) % this.size);
    }

    return hashes;
  }

  getStats(): BloomFilterStats {
    let bitCount = 0;
    for (const byte of this.bits) {
      for (let i = 0; i < 8; i++) {
        if (byte & (1 << i)) bitCount++;
      }
    }

    // 计算假阳性率
    const k = this.hashCount;
    const m = this.size;
    const n = this.elementCount;
    const falsePositiveRate = Math.pow(1 - Math.exp(-k * n / m), k);

    return {
      size: this.size,
      hashCount: this.hashCount,
      elementCount: this.elementCount,
      bitCount,
      falsePositiveRate
    };
  }

  clear(): void {
    this.bits.fill(0);
    this.elementCount = 0;
  }
}

// ============================================================================
// SimHash Implementation
// ============================================================================

export class SimHashDedup extends EventEmitter {
  private config: Required<SimHashConfig>;
  private fingerprints: Map<string, ContentFingerprint> = new Map();
  private bloomFilter?: BloomFilter;
  private hashBuckets: Map<number, Set<string>> = new Map(); // LSH桶

  constructor(config: SimHashConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.useBloomFilter) {
      this.bloomFilter = new BloomFilter(
        this.config.bloomFilterSize,
        this.config.bloomFilterHashes
      );
    }

    // 初始化LSH桶
    for (let i = 0; i < 16; i++) {
      this.hashBuckets.set(i, new Set());
    }
  }

  // ========================================================================
  // Core SimHash Algorithm
  // ========================================================================

  /**
   * 计算文本的SimHash值
   */
  computeHash(text: string): bigint {
    const tokens = this.tokenize(text);
    const vector = new Array(this.config.hashBits).fill(0);

    for (const token of tokens) {
      const tokenHash = this.md5ToBits(token);
      const weight = this.calculateWeight(token, text);

      for (let i = 0; i < this.config.hashBits; i++) {
        const bit = (tokenHash >> BigInt(i)) & BigInt(1);
        vector[i] += bit === BigInt(1) ? weight : -weight;
      }
    }

    // 转换为hash
    let hash = BigInt(0);
    for (let i = 0; i < this.config.hashBits; i++) {
      if (vector[i] > 0) {
        hash |= BigInt(1) << BigInt(i);
      }
    }

    return hash;
  }

  /**
   * 计算汉明距离
   */
  hammingDistance(hash1: bigint, hash2: bigint): number {
    let xor = hash1 ^ hash2;
    let distance = 0;

    while (xor !== BigInt(0)) {
      distance++;
      xor &= xor - BigInt(1);
    }

    return distance;
  }

  /**
   * 计算相似度 (0-1)
   */
  calculateSimilarity(hash1: bigint, hash2: bigint): number {
    const distance = this.hammingDistance(hash1, hash2);
    return 1 - distance / this.config.hashBits;
  }

  // ========================================================================
  // Deduplication
  // ========================================================================

  /**
   * 检查文本是否重复
   */
  checkDuplicate(text: string, id?: string): DuplicateResult {
    const hash = this.computeHash(text);
    const hashStr = hash.toString(16).padStart(16, '0');

    // 布隆过滤器快速检查
    if (this.bloomFilter) {
      if (!this.bloomFilter.mightContain(hashStr)) {
        // 肯定不存在
        return {
          isDuplicate: false,
          similarity: 0,
          hash: hashStr
        };
      }
    }

    // SimHash精确比较
    let minDistance = this.config.hashBits;
    let matchedId: string | undefined;

    // 使用LSH加速查找
    const candidateIds = this.getLSHCandidates(hash);

    for (const candidateId of candidateIds) {
      if (id && candidateId === id) continue;

      const candidate = this.fingerprints.get(candidateId);
      if (!candidate) continue;

      const distance = this.hammingDistance(hash, candidate.hash);
      
      if (distance < minDistance) {
        minDistance = distance;
        matchedId = candidateId;
      }
    }

    const similarity = this.calculateSimilarity(hash, 
      matchedId ? this.fingerprints.get(matchedId)!.hash : BigInt(0));

    return {
      isDuplicate: minDistance <= this.config.threshold,
      similarity,
      hash: hashStr,
      matchedWith: matchedId,
      hammingDistance: minDistance
    };
  }

  /**
   * 添加指纹到索引
   */
  addFingerprint(id: string, text: string, metadata?: Record<string, any>): ContentFingerprint {
    const hash = this.computeHash(text);
    const hashStr = hash.toString(16).padStart(16, '0');

    const fingerprint: ContentFingerprint = {
      id,
      hash,
      text: text.slice(0, 200), // 只存储前200字符
      timestamp: new Date(),
      metadata
    };

    this.fingerprints.set(id, fingerprint);

    // 添加到布隆过滤器
    if (this.bloomFilter) {
      this.bloomFilter.add(hashStr);
    }

    // 添加到LSH桶
    this.addToLSHBuckets(id, hash);

    this.emit('fingerprint:added', { id, hash: hashStr });

    return fingerprint;
  }

  /**
   * 批量去重
   */
  batchDeduplicate(items: Array<{ id: string; text: string; metadata?: any }>): {
    unique: Array<{ id: string; text: string; hash: string; metadata?: any }>;
    duplicates: Array<{ id: string; text: string; matchedWith: string; similarity: number }>;
    stats: { total: number; unique: number; duplicates: number };
  } {
    const unique: Array<{ id: string; text: string; hash: string; metadata?: any }> = [];
    const duplicates: Array<{ id: string; text: string; matchedWith: string; similarity: number }> = [];

    this.emit('dedup:batch:started', { count: items.length });

    for (const item of items) {
      const result = this.checkDuplicate(item.text, item.id);

      if (result.isDuplicate) {
        duplicates.push({
          id: item.id,
          text: item.text.slice(0, 200),
          matchedWith: result.matchedWith!,
          similarity: result.similarity
        });
      } else {
        this.addFingerprint(item.id, item.text, item.metadata);
        unique.push({
          id: item.id,
          text: item.text,
          hash: result.hash,
          metadata: item.metadata
        });
      }
    }

    const stats = {
      total: items.length,
      unique: unique.length,
      duplicates: duplicates.length
    };

    this.emit('dedup:batch:completed', stats);

    return { unique, duplicates, stats };
  }

  // ========================================================================
  // LSH (Locality Sensitive Hashing)
  // ========================================================================

  /**
   * 获取LSH候选
   */
  private getLSHCandidates(hash: bigint): Set<string> {
    const candidates = new Set<string>();

    // 将64位hash分成16段，每段4位
    for (let i = 0; i < 16; i++) {
      const bucket = Number((hash >> BigInt(i * 4)) & BigInt(0xF));
      const bucketId = (i << 4) | bucket;
      const bucketSet = this.hashBuckets.get(bucketId);
      
      if (bucketSet) {
        for (const id of bucketSet) {
          candidates.add(id);
        }
      }
    }

    return candidates;
  }

  /**
   * 添加到LSH桶
   */
  private addToLSHBuckets(id: string, hash: bigint): void {
    for (let i = 0; i < 16; i++) {
      const bucket = Number((hash >> BigInt(i * 4)) & BigInt(0xF));
      const bucketId = (i << 4) | bucket;
      this.hashBuckets.get(bucketId)?.add(id);
    }
  }

  // ========================================================================
  // Text Processing
  // ========================================================================

  /**
   * 分词/n-gram
   */
  private tokenize(text: string): string[] {
    // 清洗文本
    const cleaned = text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens: string[] = [];
    const words = cleaned.split(' ');

    // 生成n-gram
    for (let i = 0; i <= words.length - this.config.nGramSize; i++) {
      const ngram = words.slice(i, i + this.config.nGramSize).join(' ');
      tokens.push(ngram);
    }

    return tokens;
  }

  /**
   * 计算token权重 (TF-IDF简化版)
   */
  private calculateWeight(token: string, text: string): number {
    // 词频
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const tf = (text.match(regex)?.length || 1);

    // 长度权重（较长的词通常更有意义）
    const lengthWeight = Math.log(token.length + 1);

    // 位置权重（标题/开头权重更高）
    const position = text.toLowerCase().indexOf(token);
    const positionWeight = position >= 0 && position < 100 ? 2 : 1;

    return tf * lengthWeight * positionWeight;
  }

  /**
   * MD5转位数组
   */
  private md5ToBits(str: string): bigint {
    const hash = createHash('md5').update(str).digest('hex');
    return BigInt('0x' + hash.slice(0, 16));
  }

  // ========================================================================
  // Statistics & Metrics
  // ========================================================================

  getStats(): {
    fingerprintCount: number;
    bloomFilterStats?: BloomFilterStats;
    lshBucketDistribution: Record<number, number>;
  } {
    const distribution: Record<number, number> = {};
    
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        const bucketId = (i << 4) | j;
        const count = this.hashBuckets.get(bucketId)?.size || 0;
        distribution[bucketId] = count;
      }
    }

    return {
      fingerprintCount: this.fingerprints.size,
      bloomFilterStats: this.bloomFilter?.getStats(),
      lshBucketDistribution: distribution
    };
  }

  /**
   * 计算去重准确率（基于已标注数据）
   */
  calculateAccuracy(testCases: Array<{
    text1: string;
    text2: string;
    expectedDuplicate: boolean;
  }>): number {
    let correct = 0;

    for (const tc of testCases) {
      const hash1 = this.computeHash(tc.text1);
      const hash2 = this.computeHash(tc.text2);
      const distance = this.hammingDistance(hash1, hash2);
      const isDuplicate = distance <= this.config.threshold;

      if (isDuplicate === tc.expectedDuplicate) {
        correct++;
      }
    }

    return testCases.length > 0 ? correct / testCases.length : 0;
  }

  // ========================================================================
  // Persistence
  // ========================================================================

  exportFingerprints(): Array<{
    id: string;
    hash: string;
    timestamp: string;
    metadata?: any;
  }> {
    return Array.from(this.fingerprints.values()).map(fp => ({
      id: fp.id,
      hash: fp.hash.toString(16).padStart(16, '0'),
      timestamp: fp.timestamp.toISOString(),
      metadata: fp.metadata
    }));
  }

  importFingerprints(data: Array<{ id: string; hash: string; timestamp: string; metadata?: any }>): void {
    for (const item of data) {
      const fingerprint: ContentFingerprint = {
        id: item.id,
        hash: BigInt('0x' + item.hash),
        text: '',
        timestamp: new Date(item.timestamp),
        metadata: item.metadata
      };

      this.fingerprints.set(item.id, fingerprint);
      this.addToLSHBuckets(item.id, fingerprint.hash);

      if (this.bloomFilter) {
        this.bloomFilter.add(item.hash);
      }
    }
  }

  clear(): void {
    this.fingerprints.clear();
    this.hashBuckets.forEach(bucket => bucket.clear());
    this.bloomFilter?.clear();
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createSimHashDedup(config?: SimHashConfig): SimHashDedup {
  return new SimHashDedup(config);
}

export default SimHashDedup;
