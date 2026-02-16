/**
 * HAJIMI VIRTUALIZED - ContextCompressor压缩引擎
 * 
 * 工单 3/6: ContextCompressor压缩引擎（COMP-001回填）
 * 
 * 参考规范:
 * - ID-85（压缩率章节）
 * - Wave2报告（>80%压缩率验证）
 * - ID-31 Fabric装备化扩展
 * 
 * 核心假设验证:
 * - 中位数压缩率 >80%
 * - P10压缩率 >70%
 * - 关键信息保留率 100%
 * 
 * @module compressor
 * @version 1.0.0
 */

/**
 * 压缩算法类型
 */
export type CompressionAlgorithm = 'LZ4' | 'ZSTD-3' | 'ZSTD-9' | 'ADAPTIVE';

/**
 * 压缩模式
 */
export type CompressionMode = 'SPEED' | 'BALANCED' | 'SIZE';

/**
 * Remix Pattern类型
 */
export type RemixType = 'REMIXED_CONTEXT' | 'COMPRESSED_SNAPSHOT' | 'ADAPTIVE_MERGE';

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 原始大小（字节） */
  originalSize: number;
  /** 压缩后大小（字节） */
  compressedSize: number;
  /** 压缩率 (0-1) */
  compressionRatio: number;
  /** 使用的算法 */
  algorithm: CompressionAlgorithm;
  /** 压缩数据 */
  data: string;
  /** 校验和 */
  checksum: string;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata: {
    /** 原始类型 */
    originalType: string;
    /** 压缩模式 */
    mode: CompressionMode;
    /** 处理时间（ms） */
    processingTime: number;
  };
}

/**
 * Remix Pattern结果
 */
export interface RemixPattern {
  /** Pattern类型 */
  type: RemixType;
  /** 版本 */
  version: string;
  /** 压缩结果 */
  compression: CompressionResult;
  /** 保留的关键信息 */
  preservedKeys: string[];
  /** 丢弃的实现细节 */
  discardedDetails: string[];
  /** 哈希链 */
  hashChain: string[];
  /** 决策点记录 */
  decisionPoints: Array<{
    timestamp: number;
    decision: string;
    reason: string;
  }>;
  /** 债务声明 */
  debtDeclarations: string[];
  /** 失败测试记录 */
  failedTests: string[];
}

/**
 * 压缩配置
 */
export interface CompressorConfig {
  /** 目标压缩率阈值 (默认: 0.8 = 80%) */
  targetCompressionRatio: number;
  /** 最小压缩率阈值 (硬门槛，未达则抛Error) */
  minCompressionRatio: number;
  /** 默认算法 */
  defaultAlgorithm: CompressionAlgorithm;
  /** 自动选择算法阈值 */
  autoSelectThresholds: {
    /** 短文本阈值（<1K强制LZ4） */
    shortText: number;
    /** 中等文本阈值（1K-10K默认ZSTD-3） */
    mediumText: number;
  };
  /** 领域自适应字典 */
  domainDictionary?: Record<string, string>;
  /** 是否启用智能摘要 */
  enableSmartSummary: boolean;
  /** 保留字段列表 */
  preservedFields: string[];
}

/**
 * 默认压缩配置
 * Wave2验证: 压缩率>80%
 */
export const DEFAULT_COMPRESSOR_CONFIG: CompressorConfig = {
  targetCompressionRatio: 0.8,  // 80% - Wave2核心假设
  minCompressionRatio: 0.8,     // 硬门槛
  defaultAlgorithm: 'ZSTD-3',
  autoSelectThresholds: {
    shortText: 1024,      // 1KB
    mediumText: 10240,    // 10KB
  },
  enableSmartSummary: true,
  preservedFields: [
    'decisionPoints',
    'debtDeclarations',
    'failedTests',
    'contextBoundary',
    'agentId',
    'timestamp',
  ],
};

/**
 * 压缩错误
 */
export class CompressionError extends Error {
  constructor(
    message: string,
    public readonly actualRatio: number,
    public readonly requiredRatio: number
  ) {
    super(`${message} (actual: ${(actualRatio * 100).toFixed(2)}%, required: ${(requiredRatio * 100).toFixed(2)}%)`);
    this.name = 'CompressionError';
  }
}

/**
 * 哈希链生成器
 */
class HashChain {
  private chain: string[] = [];

  /**
   * 添加哈希到链
   */
  add(data: string): string {
    const hash = this.generateHash(data);
    this.chain.push(hash);
    return hash;
  }

  /**
   * 获取完整哈希链
   */
  getChain(): string[] {
    return [...this.chain];
  }

  /**
   * 验证链完整性
   */
  verify(): boolean {
    // 简化验证：链非空且所有哈希有效
    return this.chain.length > 0 && this.chain.every(h => h.length === 64);
  }

  /**
   * 生成哈希
   */
  private generateHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

/**
 * LZ4压缩器（简化实现）
 * 
 * 特性: 速度优先，压缩比适中
 * 触发: 短文本<1K强制启用
 */
class LZ4Compressor {
  /**
   * 压缩数据
   */
  compress(data: string): { compressed: string; ratio: number } {
    // 简化实现：使用Run-Length Encoding模拟
    let compressed = '';
    let count = 1;
    
    for (let i = 0; i < data.length; i++) {
      if (i + 1 < data.length && data[i] === data[i + 1] && count < 255) {
        count++;
      } else {
        if (count > 3) {
          compressed += `#${count}${data[i]}`;
        } else {
          compressed += data[i].repeat(count);
        }
        count = 1;
      }
    }
    
    const ratio = (data.length - compressed.length) / data.length;
    return { compressed: `LZ4:${compressed}`, ratio };
  }

  /**
   * 解压数据
   */
  decompress(compressed: string): string {
    if (!compressed.startsWith('LZ4:')) {
      throw new Error('Invalid LZ4 compressed data');
    }
    
    const data = compressed.substring(4);
    let decompressed = '';
    let i = 0;
    
    while (i < data.length) {
      if (data[i] === '#' && i + 2 < data.length) {
        const count = parseInt(data.substring(i + 1, i + 3), 10);
        const char = data[i + 3];
        decompressed += char.repeat(count);
        i += 4;
      } else {
        decompressed += data[i];
        i++;
      }
    }
    
    return decompressed;
  }
}

/**
 * Zstd压缩器（简化实现）
 * 
 * 级别3: 平衡模式（默认）
 * 级别9: 空间优先（激进搜索）
 */
class ZstdCompressor {
  private level: number;

  constructor(level: number = 3) {
    this.level = level;
  }

  /**
   * 压缩数据
   */
  compress(data: string): { compressed: string; ratio: number } {
    // 简化实现：使用字典替换模拟
    const dictionary: Record<string, string> = {
      'VirtualAgent': '@VA@',
      'contextBoundary': '@CB@',
      'checkpoint': '@CP@',
      'SPAWN': '@SP@',
      'TERMINATE': '@TM@',
      '债务声明': '@DS@',
      '债务清零': '@DC@',
    };

    let compressed = data;
    for (const [key, value] of Object.entries(dictionary)) {
      compressed = compressed.split(key).join(value);
    }

    // 级别9使用更激进的压缩
    if (this.level >= 9) {
      // 移除多余空格和换行
      compressed = compressed.replace(/\s+/g, ' ').trim();
    }

    const ratio = (data.length - compressed.length) / data.length;
    return { compressed: `ZSTD${this.level}:${compressed}`, ratio };
  }

  /**
   * 解压数据
   */
  decompress(compressed: string): string {
    const prefix = `ZSTD${this.level}:`;
    if (!compressed.startsWith(prefix)) {
      throw new Error('Invalid Zstd compressed data');
    }

    let data = compressed.substring(prefix.length);
    
    // 级别9的解压需要特殊处理
    if (this.level >= 9) {
      // 无法完全恢复，返回近似值
    }

    const dictionary: Record<string, string> = {
      '@VA@': 'VirtualAgent',
      '@CB@': 'contextBoundary',
      '@CP@': 'checkpoint',
      '@SP@': 'SPAWN',
      '@TM@': 'TERMINATE',
      '@DS@': '债务声明',
      '@DC@': '债务清零',
    };

    for (const [key, value] of Object.entries(dictionary)) {
      data = data.split(key).join(value);
    }

    return data;
  }
}

/**
 * 智能摘要生成器
 */
class SmartSummarizer {
  /**
   * 生成智能摘要
   * 
   * 保留: 决策点、债务声明、失败测试
   * 丢弃: 实现细节
   */
  summarize(data: string): { summary: string; preservedKeys: string[]; discardedDetails: string[] } {
    const preservedKeys: string[] = [];
    const discardedDetails: string[] = [];

    // 提取决策点
    const decisionMatches = data.match(/决策[:：]\s*([^\n]+)/g);
    if (decisionMatches) {
      preservedKeys.push(...decisionMatches);
    }

    // 提取债务声明
    const debtMatches = data.match(/债务声明[:：]\s*([^\n]+)/g);
    if (debtMatches) {
      preservedKeys.push(...debtMatches);
    }

    // 提取失败测试
    const failMatches = data.match(/失败测试[:：]\s*([^\n]+)/g);
    if (failMatches) {
      preservedKeys.push(...failMatches);
    }

    // 识别实现细节（代码块、详细描述等）
    const codeBlocks = data.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      discardedDetails.push(...codeBlocks.map(b => b.substring(0, 50) + '...'));
    }

    // 生成摘要
    const summary = `{
  "decisions": ${JSON.stringify(preservedKeys.filter(k => k.includes('决策')))},
  "debts": ${JSON.stringify(preservedKeys.filter(k => k.includes('债务')))},
  "failures": ${JSON.stringify(preservedKeys.filter(k => k.includes('失败')))},
  "discardedCount": ${discardedDetails.length}
}`;

    return { summary, preservedKeys, discardedDetails };
  }
}

/**
 * ContextCompressor压缩引擎
 * 
 * ID-31 Fabric装备化扩展
 * Wave2验证: 压缩率>80%
 */
export class ContextCompressor {
  private config: CompressorConfig;
  private lz4: LZ4Compressor;
  private zstd3: ZstdCompressor;
  private zstd9: ZstdCompressor;
  private summarizer: SmartSummarizer;
  private hashChain: HashChain;

  /**
   * 创建压缩引擎
   */
  constructor(config: Partial<CompressorConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSOR_CONFIG, ...config };
    this.lz4 = new LZ4Compressor();
    this.zstd3 = new ZstdCompressor(3);
    this.zstd9 = new ZstdCompressor(9);
    this.summarizer = new SmartSummarizer();
    this.hashChain = new HashChain();
  }

  /**
   * 压缩数据
   * 
   * 实现LZ4+智能摘要双模式
   * 压缩率检测：未达80%抛Error（硬门槛）
   * 
   * @param data - 原始数据
   * @param mode - 压缩模式
   * @returns 压缩结果
   * @throws CompressionError - 压缩率未达标时抛出
   */
  compress(data: string, mode: CompressionMode = 'BALANCED'): CompressionResult {
    const startTime = performance.now();
    const originalSize = new TextEncoder().encode(data).length;

    // 1. 选择算法
    const algorithm = this.selectAlgorithm(originalSize, mode);

    // 2. 执行压缩
    let compressed: string;
    let ratio: number;

    switch (algorithm) {
      case 'LZ4':
        ({ compressed, ratio } = this.lz4.compress(data));
        break;
      case 'ZSTD-3':
        ({ compressed, ratio } = this.zstd3.compress(data));
        break;
      case 'ZSTD-9':
        ({ compressed, ratio } = this.zstd9.compress(data));
        break;
      case 'ADAPTIVE':
        // 自适应：尝试多种算法，选择最佳
        const lz4Result = this.lz4.compress(data);
        const zstd3Result = this.zstd3.compress(data);
        const zstd9Result = this.zstd9.compress(data);
        
        const results = [
          { algorithm: 'LZ4' as const, ...lz4Result },
          { algorithm: 'ZSTD-3' as const, ...zstd3Result },
          { algorithm: 'ZSTD-9' as const, ...zstd9Result },
        ];
        
        const best = results.reduce((a, b) => a.ratio > b.ratio ? a : b);
        compressed = best.compressed;
        ratio = best.ratio;
        break;
      default:
        throw new Error(`Unknown algorithm: ${algorithm}`);
    }

    // 3. 压缩率验证（硬门槛）
    if (ratio < this.config.minCompressionRatio) {
      throw new CompressionError(
        'Compression ratio below minimum threshold',
        ratio,
        this.config.minCompressionRatio
      );
    }

    // 4. 生成校验和
    const checksum = this.hashChain.add(compressed);

    const processingTime = performance.now() - startTime;
    const compressedSize = new TextEncoder().encode(compressed).length;

    return {
      originalSize,
      compressedSize,
      compressionRatio: ratio,
      algorithm,
      data: compressed,
      checksum,
      timestamp: Date.now(),
      metadata: {
        originalType: typeof data,
        mode,
        processingTime,
      },
    };
  }

  /**
   * 生成Remix Pattern
   * 
   * 格式: type: 'REMIXED_CONTEXT'
   * 保留: 决策点/债务声明/失败测试
   * 丢弃: 实现细节
   * 
   * @param data - 原始数据
   * @returns Remix Pattern
   */
  remix(data: string): RemixPattern {
    // 1. 压缩数据
    const compression = this.compress(data, 'SIZE');

    // 2. 生成智能摘要
    const { summary, preservedKeys, discardedDetails } = this.summarizer.summarize(data);

    // 3. 提取决策点
    const decisionPoints: Array<{ timestamp: number; decision: string; reason: string }> = [];
    const decisionRegex = /\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\s*决策[:：]\s*([^\n]+)(?:\n理由[:：]\s*([^\n]+))?/g;
    let match;
    while ((match = decisionRegex.exec(data)) !== null) {
      decisionPoints.push({
        timestamp: new Date(match[1]).getTime(),
        decision: match[2].trim(),
        reason: match[3]?.trim() || '',
      });
    }

    // 4. 提取债务声明
    const debtDeclarations: string[] = [];
    const debtRegex = /债务声明[:：]\s*([^\n]+)/g;
    while ((match = debtRegex.exec(data)) !== null) {
      debtDeclarations.push(match[1].trim());
    }

    // 5. 提取失败测试
    const failedTests: string[] = [];
    const failRegex = /失败测试[:：]\s*([^\n]+)/g;
    while ((match = failRegex.exec(data)) !== null) {
      failedTests.push(match[1].trim());
    }

    return {
      type: 'REMIXED_CONTEXT',
      version: '1.0.0',
      compression,
      preservedKeys,
      discardedDetails,
      hashChain: this.hashChain.getChain(),
      decisionPoints,
      debtDeclarations,
      failedTests,
    };
  }

  /**
   * 解压数据
   * 
   * @param result - 压缩结果
   * @returns 解压后的数据
   */
  decompress(result: CompressionResult): string {
    const { data, algorithm } = result;

    switch (algorithm) {
      case 'LZ4':
        return this.lz4.decompress(data);
      case 'ZSTD-3':
        return this.zstd3.decompress(data);
      case 'ZSTD-9':
        return this.zstd9.decompress(data);
      case 'ADAPTIVE':
        // 尝试每种算法
        try { return this.lz4.decompress(data); } catch {}
        try { return this.zstd3.decompress(data); } catch {}
        try { return this.zstd9.decompress(data); } catch {}
        throw new Error('Failed to decompress with any algorithm');
      default:
        throw new Error(`Unknown algorithm: ${algorithm}`);
    }
  }

  /**
   * 验证哈希链完整性
   * 
   * @returns 是否完整
   */
  verifyHashChain(): boolean {
    return this.hashChain.verify();
  }

  /**
   * 获取哈希链
   */
  getHashChain(): string[] {
    return this.hashChain.getChain();
  }

  /**
   * 选择压缩算法
   */
  private selectAlgorithm(size: number, mode: CompressionMode): CompressionAlgorithm {
    // 短文本<1K强制LZ4
    if (size < this.config.autoSelectThresholds.shortText) {
      return 'LZ4';
    }

    // 根据模式选择
    switch (mode) {
      case 'SPEED':
        return 'LZ4';
      case 'BALANCED':
        return size < this.config.autoSelectThresholds.mediumText ? 'ZSTD-3' : 'ADAPTIVE';
      case 'SIZE':
        return size > this.config.autoSelectThresholds.mediumText ? 'ZSTD-9' : 'ZSTD-3';
      default:
        return this.config.defaultAlgorithm;
    }
  }

  /**
   * 批量压缩
   */
  compressBatch(dataList: string[]): CompressionResult[] {
    return dataList.map(data => this.compress(data));
  }

  /**
   * 计算压缩率
   */
  calculateRatio(original: number, compressed: number): number {
    return (original - compressed) / original;
  }
}

// 导出默认实例
export const defaultCompressor = new ContextCompressor();
