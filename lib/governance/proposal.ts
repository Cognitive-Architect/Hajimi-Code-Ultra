/**
 * 提案系统
 * 
 * @module lib/governance/proposal
 * @version 1.3.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Proposal,
  ProposalType,
  ProposalStorage,
  ChainStorage,
  ChainBlock,
} from './types';

// ========== 提案存储实现 ==========

export class InMemoryProposalStorage implements ProposalStorage {
  proposals: Map<string, Proposal> = new Map();
  history: Proposal[] = [];

  save(proposal: Proposal): void {
    this.proposals.set(proposal.id, proposal);
    this.history.push(proposal);
  }

  get(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  getAll(): Proposal[] {
    return Array.from(this.proposals.values());
  }

  getHistory(): Proposal[] {
    return [...this.history];
  }
}

// ========== 链式存储实现（防篡改） ==========

export class ChainStorageImpl implements ChainStorage {
  blocks: ChainBlock[] = [];

  private calculateHash(block: Omit<ChainBlock, 'hash'>): string {
    const data = JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      proposal: block.proposal,
      previousHash: block.previousHash,
    });
    
    // 简单的哈希计算（生产环境使用SHA-256）
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `0x${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }

  addBlock(proposal: Proposal): ChainBlock {
    const previousBlock = this.blocks[this.blocks.length - 1];
    const previousHash = previousBlock ? previousBlock.hash : '0x0';
    
    const blockData: Omit<ChainBlock, 'hash'> = {
      index: this.blocks.length,
      timestamp: Date.now(),
      proposal,
      previousHash,
    };

    const block: ChainBlock = {
      ...blockData,
      hash: this.calculateHash(blockData),
    };

    this.blocks.push(block);
    return block;
  }

  verifyChain(): boolean {
    for (let i = 1; i < this.blocks.length; i++) {
      const current = this.blocks[i];
      const previous = this.blocks[i - 1];

      // 验证当前块哈希
      const expectedHash = this.calculateHash({
        index: current.index,
        timestamp: current.timestamp,
        proposal: current.proposal,
        previousHash: current.previousHash,
      });
      
      if (current.hash !== expectedHash) {
        return false;
      }

      // 验证链式连接
      if (current.previousHash !== previous.hash) {
        return false;
      }
    }
    return true;
  }

  getHistory(): ChainBlock[] {
    return [...this.blocks];
  }
}

// ========== 提案管理器 ==========

export interface CreateProposalOptions {
  type: ProposalType;
  title: string;
  description: string;
  data: Record<string, unknown>;
  proposer: {
    id: string;
    role: string;
    name: string;
  };
  expiresIn?: number; // 毫秒
}

export class ProposalManager {
  private storage: ProposalStorage;
  private chainStorage: ChainStorage;

  constructor(
    storage?: ProposalStorage,
    chainStorage?: ChainStorage
  ) {
    this.storage = storage || new InMemoryProposalStorage();
    this.chainStorage = chainStorage || new ChainStorageImpl();
  }

  /**
   * 创建提案
   */
  createProposal(options: CreateProposalOptions): Proposal {
    const now = Date.now();
    const proposal: Proposal = {
      id: uuidv4(),
      type: options.type,
      title: options.title,
      description: options.description,
      data: options.data,
      proposer: options.proposer,
      timestamp: now,
      status: 'PENDING',
      votes: {},
      voteHistory: [],
      expiresAt: now + (options.expiresIn || 7 * 24 * 60 * 60 * 1000), // 默认7天
      requiredApprovals: 0.60,
    };

    this.storage.save(proposal);
    return proposal;
  }

  /**
   * 启动投票
   */
  startVoting(proposalId: string): Proposal | null {
    const proposal = this.storage.get(proposalId);
    if (!proposal || proposal.status !== 'PENDING') {
      return null;
    }

    const updated: Proposal = {
      ...proposal,
      status: 'VOTING',
    };

    this.storage.save(updated);
    return updated;
  }

  /**
   * 获取提案
   */
  getProposal(id: string): Proposal | undefined {
    return this.storage.get(id);
  }

  /**
   * 获取所有提案
   */
  getAllProposals(): Proposal[] {
    return this.storage.getAll();
  }

  /**
   * 归档提案到链
   */
  archiveToChain(proposal: Proposal): ChainBlock {
    return this.chainStorage.addBlock(proposal);
  }

  /**
   * 验证链完整性
   */
  verifyChain(): boolean {
    return this.chainStorage.verifyChain();
  }

  /**
   * 获取链历史
   */
  getChainHistory(): ChainBlock[] {
    return this.chainStorage.getHistory();
  }
}

export default ProposalManager;
