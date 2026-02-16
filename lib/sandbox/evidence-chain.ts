/**
 * 奶龙娘·清道夫 - 证据链模块
 * Phase B-06: 数字取证与审计链
 * 
 * 功能：
 * - SHA256哈希链接
 * - 区块完整性验证
 * - 不可篡改审计日志
 */

import { createHash, randomUUID } from 'crypto';

// ==================== 类型定义 ====================

export interface EvidenceBlock {
  /** 区块索引 */
  index: number;
  /** 区块唯一ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 执行ID */
  executionId: string;
  /** 审计数据 */
  data: AuditData;
  /** 上一区块哈希 */
  previousHash: string;
  /** 当前区块哈希 */
  hash: string;
  /** 数据签名（可选） */
  signature?: string;
}

export interface AuditData {
  /** 事件类型 */
  eventType: AuditEventType;
  /** 事件描述 */
  description: string;
  /** 详细数据 */
  payload: Record<string, unknown>;
  /** 严重程度 */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** 来源模块 */
  source: string;
  /** 用户/系统ID */
  actor: string;
}

export type AuditEventType =
  | 'SANDBOX_CREATED'
  | 'SANDBOX_STARTED'
  | 'SANDBOX_EXECUTED'
  | 'SANDBOX_STOPPED'
  | 'SANDBOX_DESTROYED'
  | 'RESOURCE_USAGE'
  | 'SYSTEM_CALL'
  | 'SECURITY_ALERT'
  | 'POLICY_VIOLATION'
  | 'FORENSICS_GENERATED'
  | 'CHAIN_VERIFIED'
  | 'CUSTOM';

export interface ChainConfig {
  /** 链ID */
  chainId: string;
  /** 创世区块数据 */
  genesisData?: AuditData;
  /** 启用签名 */
  enableSigning: boolean;
  /** 签名密钥（可选） */
  signingKey?: string;
}

export interface ChainStats {
  chainId: string;
  blockCount: number;
  firstBlockTime: number;
  lastBlockTime: number;
  verified: boolean;
  integrityScore: number; // 0-100
}

export interface VerificationDetail {
  blockIndex: number;
  blockId: string;
  hashValid: boolean;
  linkValid: boolean;
  expectedHash: string;
  actualHash: string;
  errors: string[];
}

export interface ChainVerificationResult {
  valid: boolean;
  totalBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
  details: VerificationDetail[];
  firstInvalidIndex: number | null;
  message: string;
}

// ==================== 默认配置 ====================

const DEFAULT_GENESIS_DATA: AuditData = {
  eventType: 'SANDBOX_CREATED',
  description: 'Evidence chain genesis block',
  payload: { initialized: true },
  severity: 'info',
  source: 'EvidenceChain',
  actor: 'system',
};

// ==================== EvidenceChain类 ====================

export class EvidenceChain {
  private chainId: string;
  private blocks: EvidenceBlock[] = [];
  private enableSigning: boolean;
  private signingKey?: string;

  constructor(config: Partial<ChainConfig> = {}) {
    this.chainId = config.chainId || randomUUID();
    this.enableSigning = config.enableSigning ?? false;
    this.signingKey = config.signingKey;

    // 创建创世区块
    this.createGenesisBlock(config.genesisData || DEFAULT_GENESIS_DATA);
  }

  /**
   * 添加新区块
   * @param data 审计数据
   * @returns 创建的区块
   */
  addBlock(data: AuditData): EvidenceBlock {
    const previousBlock = this.blocks[this.blocks.length - 1];
    const index = this.blocks.length;

    const block: EvidenceBlock = {
      index,
      id: randomUUID(),
      timestamp: Date.now(),
      executionId: this.chainId,
      data,
      previousHash: previousBlock.hash,
      hash: '', // 临时，后面计算
    };

    // 计算哈希
    block.hash = this.calculateHash(block);

    // 签名（如果启用）
    if (this.enableSigning && this.signingKey) {
      block.signature = this.signBlock(block);
    }

    this.blocks.push(block);

    console.log(`[EvidenceChain] 区块 #${index} 已添加: ${block.hash.substring(0, 16)}...`);
    return block;
  }

  /**
   * 验证整个链的完整性
   * @returns 验证结果
   */
  verifyChain(): ChainVerificationResult {
    const details: VerificationDetail[] = [];
    let validBlocks = 0;
    let firstInvalidIndex: number | null = null;

    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const detail = this.verifyBlock(block, i);
      details.push(detail);

      if (detail.hashValid && detail.linkValid) {
        validBlocks++;
      } else if (firstInvalidIndex === null) {
        firstInvalidIndex = i;
      }
    }

    const invalidBlocks = this.blocks.length - validBlocks;
    const valid = invalidBlocks === 0;

    return {
      valid,
      totalBlocks: this.blocks.length,
      validBlocks,
      invalidBlocks,
      details,
      firstInvalidIndex,
      message: valid
        ? `链完整性验证通过，共 ${this.blocks.length} 个区块`
        : `链完整性验证失败，${invalidBlocks} 个区块无效，首个无效索引: ${firstInvalidIndex}`,
    };
  }

  /**
   * 验证特定区块
   * @param blockIndex 区块索引
   * @returns 验证详情
   */
  verifyBlockAt(blockIndex: number): VerificationDetail | null {
    const block = this.blocks[blockIndex];
    if (!block) return null;
    return this.verifyBlock(block, blockIndex);
  }

  /**
   * 获取完整链
   * @returns 所有区块
   */
  getChain(): EvidenceBlock[] {
    return [...this.blocks];
  }

  /**
   * 获取特定区块
   * @param index 区块索引
   */
  getBlock(index: number): EvidenceBlock | undefined {
    return this.blocks[index];
  }

  /**
   * 获取最后区块
   */
  getLatestBlock(): EvidenceBlock {
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * 获取链统计信息
   */
  getStats(): ChainStats {
    const verification = this.verifyChain();
    return {
      chainId: this.chainId,
      blockCount: this.blocks.length,
      firstBlockTime: this.blocks[0]?.timestamp || 0,
      lastBlockTime: this.blocks[this.blocks.length - 1]?.timestamp || 0,
      verified: verification.valid,
      integrityScore: Math.round((verification.validBlocks / verification.totalBlocks) * 100),
    };
  }

  /**
   * 根据执行ID获取相关区块
   * @param executionId 执行ID
   */
  getBlocksByExecutionId(executionId: string): EvidenceBlock[] {
    return this.blocks.filter((block) => block.executionId === executionId);
  }

  /**
   * 根据事件类型获取区块
   * @param eventType 事件类型
   */
  getBlocksByEventType(eventType: AuditEventType): EvidenceBlock[] {
    return this.blocks.filter((block) => block.data.eventType === eventType);
  }

  /**
   * 导出链为JSON
   */
  exportChain(): string {
    return JSON.stringify(
      {
        chainId: this.chainId,
        blocks: this.blocks,
        exportedAt: Date.now(),
      },
      null,
      2
    );
  }

  /**
   * 从JSON导入链
   * @param json JSON字符串
   */
  static importChain(json: string): EvidenceChain {
    const parsed = JSON.parse(json);
    const chain = new EvidenceChain({ chainId: parsed.chainId });
    chain.blocks = parsed.blocks;
    return chain;
  }

  /**
   * 获取链ID
   */
  getChainId(): string {
    return this.chainId;
  }

  /**
   * 获取区块数量
   */
  getBlockCount(): number {
    return this.blocks.length;
  }

  // ==================== 私有方法 ====================

  private createGenesisBlock(data: AuditData): void {
    const genesisBlock: EvidenceBlock = {
      index: 0,
      id: randomUUID(),
      timestamp: Date.now(),
      executionId: this.chainId,
      data,
      previousHash: '0'.repeat(64), // 64个0作为创世区块的前哈希
      hash: '',
    };

    genesisBlock.hash = this.calculateHash(genesisBlock);
    this.blocks.push(genesisBlock);
  }

  private calculateHash(block: Omit<EvidenceBlock, 'hash'>): string {
    const data = JSON.stringify({
      index: block.index,
      id: block.id,
      timestamp: block.timestamp,
      executionId: block.executionId,
      data: block.data,
      previousHash: block.previousHash,
    });

    return createHash('sha256').update(data).digest('hex');
  }

  private signBlock(block: EvidenceBlock): string {
    if (!this.signingKey) return '';
    const data = `${block.hash}:${block.timestamp}`;
    return createHash('sha256').update(data + this.signingKey).digest('hex');
  }

  private verifyBlock(block: EvidenceBlock, index: number): VerificationDetail {
    const errors: string[] = [];

    // 验证索引
    if (block.index !== index) {
      errors.push(`索引不匹配: 期望 ${index}, 实际 ${block.index}`);
    }

    // 重新计算哈希并验证
    const expectedHash = this.calculateHash({
      index: block.index,
      id: block.id,
      timestamp: block.timestamp,
      executionId: block.executionId,
      data: block.data,
      previousHash: block.previousHash,
    });
    const hashValid = block.hash === expectedHash;
    if (!hashValid) {
      errors.push('区块哈希不匹配');
    }

    // 验证链链接（创世区块除外）
    let linkValid = true;
    if (index > 0) {
      const previousBlock = this.blocks[index - 1];
      if (block.previousHash !== previousBlock.hash) {
        linkValid = false;
        errors.push(
          `链链接断裂: 期望前一哈希 ${previousBlock.hash.substring(0, 16)}..., 实际 ${block.previousHash.substring(0, 16)}...`
        );
      }
    }

    // 验证签名（如果启用）
    if (this.enableSigning && block.signature && this.signingKey) {
      const expectedSignature = this.signBlock(block);
      if (block.signature !== expectedSignature) {
        errors.push('区块签名无效');
      }
    }

    return {
      blockIndex: index,
      blockId: block.id,
      hashValid,
      linkValid,
      expectedHash,
      actualHash: block.hash,
      errors,
    };
  }
}

// ==================== 便捷函数 ====================

export function createEvidenceChain(config?: Partial<ChainConfig>): EvidenceChain {
  return new EvidenceChain(config);
}

export function calculateHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function verifyHash(data: unknown, expectedHash: string): boolean {
  return calculateHash(data) === expectedHash;
}

// ==================== 导出默认 ====================

export default EvidenceChain;
