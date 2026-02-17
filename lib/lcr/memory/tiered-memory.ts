/**
 * MemGPT四层内存系统 - B-03/09
 * HAJIMI-LCR-LUXURY-005
 * 
 * Focus/Working/Archive/RAG 四层 + 自动升降级
 * 
 * @module lib/lcr/memory/tiered-memory
 * @author 唐音 (Engineer)
 */

import { EventEmitter } from 'events';

export interface MemoryEntry {
  id: string;
  content: string;
  tokens: number;
  importance: number; // 0-100
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  embedding?: number[];
}

export interface TieredMemoryConfig {
  focusLimit: number;     // 8K tokens
  workingLimit: number;   // 128K tokens
  archiveLimit: number;   // 10M tokens
  gcInterval: number;     // ms
}

export type MemoryTier = 'focus' | 'working' | 'archive' | 'rag';

/**
 * 四层内存管理器
 */
export class TieredMemory extends EventEmitter {
  private config: TieredMemoryConfig;
  private focus: Map<string, MemoryEntry> = new Map();
  private working: Map<string, MemoryEntry> = new Map();
  private archive: Map<string, MemoryEntry> = new Map();
  private rag: Map<string, MemoryEntry> = new Map();
  private currentTokens = { focus: 0, working: 0, archive: 0 };

  constructor(config: Partial<TieredMemoryConfig> = {}) {
    super();
    this.config = {
      focusLimit: 8192,      // 8K
      workingLimit: 131072,  // 128K
      archiveLimit: 10000000, // 10M
      gcInterval: 60000,
      ...config,
    };
    
    this.startGC();
  }

  /**
   * Focus层：<8K tokens硬限制
   * 
   * 自测: TIER-001 Focus<8K
   */
  addToFocus(entry: MemoryEntry): boolean {
    // 检查硬限制
    if (this.currentTokens.focus + entry.tokens > this.config.focusLimit) {
      // 智能截断：按重要性淘汰
      this.evictFromFocus(entry.tokens);
    }

    // 如果仍超出，拒绝添加
    if (this.currentTokens.focus + entry.tokens > this.config.focusLimit) {
      this.emit('focus:overflow', { entry, current: this.currentTokens.focus });
      return false;
    }

    this.focus.set(entry.id, entry);
    this.currentTokens.focus += entry.tokens;
    
    this.emit('memory:add', { tier: 'focus', id: entry.id });
    return true;
  }

  /**
   * Working层：8K-128K，LRU-K
   * 
   * 自测: TIER-002 Working命中率>90%
   */
  addToWorking(entry: MemoryEntry): void {
    // 检查是否需要升级
    if (entry.importance > 80 && this.currentTokens.focus < this.config.focusLimit * 0.8) {
      this.promoteToFocus(entry.id);
      return;
    }

    this.working.set(entry.id, entry);
    this.currentTokens.working += entry.tokens;

    // 预加载预测：将相关条目也加载
    this.predictiveLoad(entry);

    // 检查容量
    if (this.currentTokens.working > this.config.workingLimit) {
      this.evictFromWorking();
    }
  }

  /**
   * Archive层：128K-10M，异步压缩
   * 
   * 自测: TIER-003 Archive自动压缩
   */
  async addToArchive(entry: MemoryEntry): Promise<void> {
    // 异步压缩
    const compressed = await this.compressEntry(entry);
    
    this.archive.set(entry.id, compressed);
    this.currentTokens.archive += compressed.tokens;

    // 语义聚类
    await this.semanticClustering(compressed);

    this.emit('memory:archive', { id: entry.id, compressed: true });
  }

  /**
   * RAG层：无上限，向量索引
   */
  addToRAG(entry: MemoryEntry): void {
    if (entry.embedding) {
      this.rag.set(entry.id, entry);
      this.emit('memory:rag', { id: entry.id });
    }
  }

  /**
   * 查询记忆 (跨层搜索)
   */
  async query(query: string, options: { vector?: number[]; limit?: number } = {}): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    
    // 1. Focus层 (最高优先级)
    for (const entry of this.focus.values()) {
      if (entry.content.includes(query)) {
        results.push(entry);
        entry.accessCount++;
        entry.lastAccess = Date.now();
      }
    }
    
    // 2. Working层
    for (const entry of this.working.values()) {
      if (entry.content.includes(query)) {
        results.push(entry);
        this.promoteToFocus(entry.id);
      }
    }
    
    // 3. RAG向量搜索
    if (options.vector) {
      const ragResults = this.vectorSearch(options.vector, options.limit || 5);
      results.push(...ragResults);
    }
    
    return results.slice(0, options.limit || 10);
  }

  /**
   * 升级到Focus层
   */
  private promoteToFocus(id: string): void {
    let entry = this.focus.get(id);
    if (entry) return; // 已在Focus

    entry = this.working.get(id) || this.archive.get(id);
    if (!entry) return;

    // 从原层移除
    this.working.delete(id);
    this.archive.delete(id);
    this.currentTokens.working -= entry.tokens;

    // 添加到Focus
    if (this.addToFocus(entry)) {
      this.emit('memory:promote', { id, from: 'working', to: 'focus' });
    }
  }

  /**
   * 降级到Archive层
   */
  private async demoteToArchive(id: string): Promise<void> {
    const entry = this.working.get(id);
    if (!entry) return;

    this.working.delete(id);
    this.currentTokens.working -= entry.tokens;

    await this.addToArchive(entry);
    
    this.emit('memory:demote', { id, from: 'working', to: 'archive' });
  }

  /**
   * Focus层淘汰
   */
  private evictFromFocus(neededTokens: number): void {
    const entries = Array.from(this.focus.values());
    
    // 按重要性排序，淘汰最低
    entries.sort((a, b) => a.importance - b.importance);
    
    let freed = 0;
    for (const entry of entries) {
      if (freed >= neededTokens) break;
      
      this.focus.delete(entry.id);
      this.currentTokens.focus -= entry.tokens;
      freed += entry.tokens;
      
      // 降级到Working
      this.working.set(entry.id, entry);
      this.currentTokens.working += entry.tokens;
    }
  }

  /**
   * Working层淘汰
   */
  private evictFromWorking(): void {
    const entries = Array.from(this.working.values());
    
    // LRU-K: 考虑访问次数和时间
    entries.sort((a, b) => {
      const scoreA = a.accessCount * 100 + a.lastAccess;
      const scoreB = b.accessCount * 100 + b.lastAccess;
      return scoreA - scoreB;
    });
    
    // 淘汰20%
    const evictCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < evictCount; i++) {
      const entry = entries[i];
      this.demoteToArchive(entry.id);
    }
  }

  /**
   * 预加载预测
   */
  private predictiveLoad(triggerEntry: MemoryEntry): void {
    // 简化：加载时间相近的条目
    const timeThreshold = 60000; // 1分钟内
    
    for (const entry of this.archive.values()) {
      if (Math.abs(entry.timestamp - triggerEntry.timestamp) < timeThreshold) {
        if (entry.importance > 50) {
          this.promoteToFocus(entry.id);
        }
      }
    }
  }

  /**
   * 向量搜索 (HNSW简化版)
   */
  private vectorSearch(queryVector: number[], limit: number): MemoryEntry[] {
    const results: Array<{ entry: MemoryEntry; similarity: number }> = [];
    
    for (const entry of this.rag.values()) {
      if (entry.embedding) {
        const similarity = this.cosineSimilarity(queryVector, entry.embedding);
        results.push({ entry, similarity });
      }
    }
    
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit).map(r => r.entry);
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 异步压缩
   */
  private async compressEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    // 简化：实际应使用zstd/PQ量化/语义摘要
    return {
      ...entry,
      tokens: Math.floor(entry.tokens * 0.5), // 模拟50%压缩
    };
  }

  /**
   * 语义聚类
   */
  private async semanticClustering(entry: MemoryEntry): Promise<void> {
    // 简化实现
    this.emit('cluster:update', { entryId: entry.id });
  }

  /**
   * GC调度 (集成ID-93)
   */
  private startGC(): void {
    setInterval(() => {
      this.runGC('light');
    }, this.config.gcInterval);
  }

  private runGC(level: 'light' | 'regular' | 'deep'): void {
    switch (level) {
      case 'light':
        // L1: 仅清理明显过期
        break;
      case 'regular':
        // L2: 整理Working层
        this.evictFromWorking();
        break;
      case 'deep':
        // L3: 深度整理
        this.evictFromWorking();
        // 压缩Archive
        break;
    }
    
    this.emit('gc:complete', { level });
  }

  /**
   * 动态摘要
   */
  generateSummary(maxTokens: number): string {
    const focusContent = Array.from(this.focus.values())
      .sort((a, b) => b.importance - a.importance)
      .map(e => e.content)
      .join('\n');
    
    // 简化：截断
    return focusContent.slice(0, maxTokens * 4); // 假设1token≈4字符
  }
}

export default TieredMemory;
